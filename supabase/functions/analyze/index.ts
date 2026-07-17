import OpenAI from 'npm:openai@^5.0.0';
import {
  createClient,
  type SupabaseClient,
} from 'npm:@supabase/supabase-js@^2.44.4';

type Confidence = 'high' | 'medium' | 'low';
type PatentLanguage = 'en' | 'ja';
type ClassificationSystem = 'IPC' | 'CPC' | 'FI';
type ClassificationVerificationStatus =
  | 'database_verified'
  | 'ai_suggested';

interface AnalyzeRequest {
  text?: unknown;
  input?: unknown;
  request_id?: unknown;
}

interface ClassificationCodeEvidence {
  code: string;
  status: ClassificationVerificationStatus;
  title_en?: string | null;
  title_ja?: string | null;
  edition?: string | null;
}

interface ClassificationCandidate {
  system: ClassificationSystem;
  code: string;
  normalized_code?: string | null;
  title_en: string | null;
  title_ja: string | null;
  parent_code: string | null;
  hierarchy_level: number | null;
  edition: string;
  similarity_score: number;
  match_score?: number;
}

interface KeywordClassification {
  term: string;
  normalized_term: string;
  count: number;
  rank: number;
  ipc: string[];
  cpc: string[];
  fi: string[];
  f_term: string[];
  ipc_evidence?: ClassificationCodeEvidence[];
  cpc_evidence?: ClassificationCodeEvidence[];
  fi_evidence?: ClassificationCodeEvidence[];
  f_term_evidence?: ClassificationCodeEvidence[];
  ipc_candidates?: ClassificationCandidate[];
  cpc_candidates?: ClassificationCandidate[];
  fi_candidates?: ClassificationCandidate[];
  classification_confidence: Confidence;
  reason: string;
}

interface AnalysisResult {
  language: PatentLanguage;
  keywords: KeywordClassification[];
  warning?: string;
  requestId?: string;
  remainingCredits?: number;
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
};

const MIN_INPUT_CHARS = 20;
const MAX_INPUT_CHARS = 10000;
const MAX_INPUT_LINES = 300;
const MAX_REPEATED_CHAR_RUN = 20;
const MIN_MEANINGFUL_CHAR_RATIO = 0.35;
const MAX_DUPLICATE_WORD_RATIO = 0.75;
const LONG_INPUT_WARNING_CHARS = 8000;
const CLASSIFICATION_SEARCH_LIMIT = 30;
const CANDIDATES_PER_SYSTEM = 3;
const CANDIDATE_KEYWORD_LIMIT = 12;
const CANDIDATE_SEARCH_CONCURRENCY = 3;
const MODEL = Deno.env.get('OPENAI_MODEL') ?? 'gpt-4.1-mini';

const NO_CREDITS_MESSAGE =
  '分析クレジットがありません。Test pack または Business pack を購入してください。';

const responseSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['language', 'keywords'],
  properties: {
    language: { type: 'string', enum: ['en', 'ja'] },
    keywords: {
      type: 'array',
      maxItems: 40,
      items: {
        type: 'object',
        additionalProperties: false,
        required: [
          'term',
          'normalized_term',
          'count',
          'rank',
          'ipc',
          'cpc',
          'fi',
          'f_term',
          'classification_confidence',
          'reason',
        ],
        properties: {
          term: { type: 'string' },
          normalized_term: { type: 'string' },
          count: { type: 'integer', minimum: 1 },
          rank: { type: 'integer', minimum: 1 },
          ipc: { type: 'array', items: { type: 'string' } },
          cpc: { type: 'array', items: { type: 'string' } },
          fi: { type: 'array', items: { type: 'string' } },
          f_term: { type: 'array', items: { type: 'string' } },
          classification_confidence: {
            type: 'string',
            enum: ['high', 'medium', 'low'],
          },
          reason: { type: 'string' },
        },
      },
    },
  },
} as const;

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json; charset=utf-8',
      ...(init.headers ?? {}),
    },
  });
}

function getRequiredEnv(name: string): string {
  const value = Deno.env.get(name);

  if (!value) {
    throw new Error(`${name} is not configured in Supabase secrets.`);
  }

  return value;
}
class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

function validateRequestId(value: unknown): string {
  if (
    typeof value !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  ) {
    throw new HttpError(
      400,
      'A valid request_id is required.',
    );
  }

  return value;
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(value),
  );

  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}
function validateText(body: AnalyzeRequest): string {
  const rawText = typeof body.text === 'string' ? body.text : body.input;

  if (typeof rawText !== 'string') {
    throw new Error(
      'Request body must include a string field named "text" or "input".',
    );
  }

  const text = rawText.trim();

  if (text.length < MIN_INPUT_CHARS) {
    throw new Error(
      `Text is too short. Please enter at least ${MIN_INPUT_CHARS} characters of meaningful technical text.`,
    );
  }

  if (text.length > MAX_INPUT_CHARS) {
    throw new Error(
      `Text is too long. Limit input to ${MAX_INPUT_CHARS.toLocaleString()} characters.`,
    );
  }

  const lines = text.split(/\r?\n/);

  if (lines.length > MAX_INPUT_LINES) {
    throw new Error(
      `Text has too many lines. Limit input to ${MAX_INPUT_LINES.toLocaleString()} lines.`,
    );
  }

  const repeatedCharacterPattern = new RegExp(
    `([\\s\\S])\\1{${MAX_REPEATED_CHAR_RUN},}`,
    'u',
  );

  if (repeatedCharacterPattern.test(text)) {
    throw new Error('Text appears to contain excessive repeated characters.');
  }

  const meaningfulChars =
    text.match(/[A-Za-z0-9\u3040-\u30ff\u3400-\u9fff]/gu)?.length ?? 0;
  const meaningfulRatio = meaningfulChars / text.length;

  if (meaningfulRatio < MIN_MEANINGFUL_CHAR_RATIO) {
    throw new Error('Text appears to contain too little meaningful content.');
  }

  const words = text
    .toLowerCase()
    .split(/\s+/)
    .filter((word) => word.length >= 2);

  if (words.length >= 20) {
    const counts = new Map<string, number>();

    for (const word of words) {
      counts.set(word, (counts.get(word) ?? 0) + 1);
    }

    const maxRepeatedWordCount = Math.max(...counts.values());
    const duplicateRatio = maxRepeatedWordCount / words.length;

    if (duplicateRatio > MAX_DUPLICATE_WORD_RATIO) {
      throw new Error('Text appears to contain excessive repeated words.');
    }
  }

  return text;
}

function normalizeClassificationCode(code: string): string {
  return code.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function uniqueCodes(codes: unknown): string[] {
  if (!Array.isArray(codes)) {
    return [];
  }

  const seen = new Set<string>();
  const unique: string[] = [];

  for (const value of codes) {
    if (typeof value !== 'string') {
      continue;
    }

    const code = value.trim();
    const normalizedCode = normalizeClassificationCode(code);

    if (!code || !normalizedCode || seen.has(normalizedCode)) {
      continue;
    }

    seen.add(normalizedCode);
    unique.push(code);
  }

  return unique;
}

function normalizeResult(
  result: AnalysisResult,
  warning?: string,
): AnalysisResult {
  const normalizedKeywords = (Array.isArray(result.keywords)
    ? result.keywords
    : [])
    .map((keyword) => {
      const confidence: Confidence =
        keyword.classification_confidence === 'high' ||
          keyword.classification_confidence === 'medium' ||
          keyword.classification_confidence === 'low'
          ? keyword.classification_confidence
          : 'low';

      const ipc = uniqueCodes(keyword.ipc);
      const cpc = uniqueCodes(keyword.cpc);
      const fi = uniqueCodes(keyword.fi);
      const fTerm = uniqueCodes(keyword.f_term);

      return {
        term: String(keyword.term ?? '').trim(),
        normalized_term: String(keyword.normalized_term ?? '').trim(),
        count: Math.max(1, Math.trunc(Number(keyword.count) || 1)),
        rank: Math.max(1, Math.trunc(Number(keyword.rank) || 1)),
        ipc: confidence === 'low' ? ipc.slice(0, 2) : ipc,
        cpc: confidence === 'low' ? cpc.slice(0, 2) : cpc,
        fi: confidence === 'low' ? fi.slice(0, 1) : fi,
        f_term: confidence === 'low' ? fTerm.slice(0, 1) : fTerm,
        classification_confidence: confidence,
        reason: String(keyword.reason ?? '').trim(),
      };
    })
    .filter((keyword) => keyword.term || keyword.normalized_term)
    .sort((a, b) => b.count - a.count || a.rank - b.rank)
    .map((keyword, index) => ({ ...keyword, rank: index + 1 }));

  return {
    language: result.language === 'ja' ? 'ja' : 'en',
    keywords: normalizedKeywords,
    ...(warning ? { warning } : {}),
  };
}

function appendWarning(
  currentWarning: string | undefined,
  additionalWarning: string,
): string {
  return currentWarning
    ? `${currentWarning} ${additionalWarning}`
    : additionalWarning;
}

function buildAiSuggestedEvidence(
  codes: string[],
): ClassificationCodeEvidence[] {
  return uniqueCodes(codes).map((code) => ({
    code,
    status: 'ai_suggested',
  }));
}

async function loadCatalogRowsForCodes(
  adminClient: SupabaseClient,
  system: ClassificationSystem,
  codes: string[],
): Promise<Map<string, ClassificationCandidate>> {
  const normalizedCodes = Array.from(
    new Set(codes.map(normalizeClassificationCode).filter(Boolean)),
  );
  const rowsByCode = new Map<string, ClassificationCandidate>();

  for (let start = 0; start < normalizedCodes.length; start += 100) {
    const codeBatch = normalizedCodes.slice(start, start + 100);

    const { data, error } = await adminClient
      .from('classification_titles')
      .select(
        'system, code, normalized_code, title_en, title_ja, parent_code, hierarchy_level, edition',
      )
      .eq('system', system)
      .in('normalized_code', codeBatch)
      .order('edition', { ascending: false });

    if (error) {
      throw new Error(`${system} code lookup failed: ${error.message}`);
    }

    for (const rawRow of data ?? []) {
      const row = rawRow as Omit<ClassificationCandidate, 'similarity_score'>;
      const normalizedCode =
        row.normalized_code || normalizeClassificationCode(row.code);

      if (!rowsByCode.has(normalizedCode)) {
        rowsByCode.set(normalizedCode, {
          ...row,
          system,
          similarity_score: 0,
        });
      }
    }
  }

  return rowsByCode;
}

function buildCodeEvidence(
  codes: string[],
  catalogRows: Map<string, ClassificationCandidate>,
): ClassificationCodeEvidence[] {
  return uniqueCodes(codes).map((code) => {
    const row = catalogRows.get(normalizeClassificationCode(code));

    if (!row) {
      return {
        code,
        status: 'ai_suggested' as const,
      };
    }

    return {
      code,
      status: 'database_verified' as const,
      title_en: row.title_en,
      title_ja: row.title_ja,
      edition: row.edition,
    };
  });
}

function candidateTitle(candidate: ClassificationCandidate): string {
  return `${candidate.title_en ?? ''} ${candidate.title_ja ?? ''}`
    .trim()
    .toLowerCase();
}

function calculateCandidateMatchScore(
  candidate: ClassificationCandidate,
  primarySearchTerm: string,
  contextTerms: string[],
  suggestedCodes: string[],
): number {
  const title = candidateTitle(candidate);
  const query = primarySearchTerm.trim().toLowerCase();
  const queryWords = query
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length >= 3);
  const contextWords = Array.from(
    new Set(
      contextTerms.flatMap((term) =>
        term
          .toLowerCase()
          .split(/[^a-z0-9]+/)
          .filter((word) => word.length >= 4),
      ),
    ),
  );
  const suggestedPrefixes = suggestedCodes
    .map(normalizeClassificationCode)
    .filter(Boolean)
    .map((code) => code.slice(0, Math.min(4, code.length)));
  const normalizedCandidateCode = normalizeClassificationCode(candidate.code);

  let score = Number(candidate.similarity_score) || 0;

  if (query && title.includes(query)) {
    score += 0.25;
  }

  const queryWordHits = queryWords.filter((word) => title.includes(word)).length;
  score += Math.min(0.12, queryWordHits * 0.04);

  const contextHits = contextWords.filter((word) => title.includes(word)).length;
  score += Math.min(0.15, contextHits * 0.03);

  if (
    suggestedPrefixes.some(
      (prefix) => prefix.length >= 3 && normalizedCandidateCode.startsWith(prefix),
    )
  ) {
    score += 0.2;
  }

  return Math.max(0, Math.min(1, score));
}

async function searchClassificationCandidates(
  adminClient: SupabaseClient,
  searchTerms: string[],
  system: ClassificationSystem,
  contextTerms: string[],
  suggestedCodes: string[],
): Promise<ClassificationCandidate[]> {
  const uniqueSearchTerms = Array.from(
    new Set(searchTerms.map((term) => term.trim()).filter(Boolean)),
  ).slice(0, 2);
  const candidatesByCode = new Map<string, ClassificationCandidate>();

  for (const searchText of uniqueSearchTerms) {
    const { data, error } = await adminClient.rpc(
      'search_classification_titles',
      {
        search_text: searchText,
        requested_systems: [system],
        result_limit: CLASSIFICATION_SEARCH_LIMIT,
      },
    );

    if (error) {
      throw new Error(
        `${system} candidate search failed: ${error.message}`,
      );
    }

    for (const rawCandidate of data ?? []) {
      const candidate = rawCandidate as ClassificationCandidate;
      const normalizedCode = normalizeClassificationCode(candidate.code);
      const previous = candidatesByCode.get(normalizedCode);

      if (
        !previous ||
        Number(candidate.similarity_score) > Number(previous.similarity_score)
      ) {
        candidatesByCode.set(normalizedCode, candidate);
      }
    }
  }

  const primarySearchTerm = uniqueSearchTerms[0] ?? '';

  return Array.from(candidatesByCode.values())
    .map((candidate) => ({
      ...candidate,
      match_score: calculateCandidateMatchScore(
        candidate,
        primarySearchTerm,
        contextTerms,
        suggestedCodes,
      ),
    }))
    .filter(
      (candidate) =>
        (candidate.match_score ?? 0) >= 0.35 ||
        candidateTitle(candidate).includes(primarySearchTerm.toLowerCase()),
    )
    .sort(
      (a, b) =>
        (b.match_score ?? 0) - (a.match_score ?? 0) ||
        Number(b.similarity_score) - Number(a.similarity_score) ||
        (a.hierarchy_level ?? 999) - (b.hierarchy_level ?? 999) ||
        a.code.localeCompare(b.code),
    )
    .slice(0, CANDIDATES_PER_SYSTEM);
}

async function enrichAnalysisClassifications(
  adminClient: SupabaseClient,
  result: AnalysisResult,
): Promise<AnalysisResult> {
  let warning = result.warning;

  const allCodesBySystem: Record<
    ClassificationSystem,
    string[]
  > = {
    IPC: result.keywords.flatMap(
      (keyword) => keyword.ipc,
    ),
    CPC: result.keywords.flatMap(
      (keyword) => keyword.cpc,
    ),
    FI: result.keywords.flatMap(
      (keyword) => keyword.fi,
    ),
  };

  const catalogResults = await Promise.all(
    (
      ['IPC', 'CPC', 'FI'] as ClassificationSystem[]
    ).map(async (system) => ({
      system,
      rows: await loadCatalogRowsForCodes(
        adminClient,
        system,
        allCodesBySystem[system],
      ),
    })),
  );

  const catalogMaps = Object.fromEntries(
    catalogResults.map(({ system, rows }) => [
      system,
      rows,
    ]),
  ) as Record<
    ClassificationSystem,
    Map<string, ClassificationCandidate>
  >;

  const enrichedKeywords: KeywordClassification[] =
    result.keywords.map((keyword) => ({
      ...keyword,
      ipc_evidence: buildCodeEvidence(
        keyword.ipc,
        catalogMaps.IPC,
      ),
      cpc_evidence: buildCodeEvidence(
        keyword.cpc,
        catalogMaps.CPC,
      ),
      fi_evidence: buildCodeEvidence(
        keyword.fi,
        catalogMaps.FI,
      ),
      f_term_evidence: buildAiSuggestedEvidence(
        keyword.f_term,
      ),
      ipc_candidates: [],
      cpc_candidates: [],
      fi_candidates: [],
    }));

  const contextTerms = enrichedKeywords
    .slice(0, CANDIDATE_KEYWORD_LIMIT)
    .map(
      (keyword) =>
        keyword.normalized_term || keyword.term,
    )
    .filter(Boolean);

  const candidateKeywordCount = Math.min(
    enrichedKeywords.length,
    CANDIDATE_KEYWORD_LIMIT,
  );

  for (
    let start = 0;
    start < candidateKeywordCount;
    start += CANDIDATE_SEARCH_CONCURRENCY
  ) {
    const keywordIndexes = Array.from(
      {
        length: Math.min(
          CANDIDATE_SEARCH_CONCURRENCY,
          candidateKeywordCount - start,
        ),
      },
      (_, offset) => start + offset,
    );

    const keywordResults = await Promise.all(
      keywordIndexes.map(async (keywordIndex) => {
        const keyword =
          enrichedKeywords[keywordIndex];

        const searchTerms = [
          keyword.normalized_term,
          keyword.term,
        ];

        const [
          ipcCandidates,
          cpcCandidates,
          fiCandidates,
        ] = await Promise.all([
          searchClassificationCandidates(
            adminClient,
            searchTerms,
            'IPC',
            contextTerms,
            keyword.ipc,
          ),
          searchClassificationCandidates(
            adminClient,
            searchTerms,
            'CPC',
            contextTerms,
            keyword.cpc,
          ),
          searchClassificationCandidates(
            adminClient,
            searchTerms,
            'FI',
            contextTerms,
            keyword.fi,
          ),
        ]);

        return {
          keywordIndex,
          ipcCandidates,
          cpcCandidates,
          fiCandidates,
        };
      }),
    );

    for (const keywordResult of keywordResults) {
      const keyword =
        enrichedKeywords[keywordResult.keywordIndex];

      keyword.ipc_candidates =
        keywordResult.ipcCandidates;

      keyword.cpc_candidates =
        keywordResult.cpcCandidates;

      keyword.fi_candidates =
        keywordResult.fiCandidates;
    }
  }

  if (
    enrichedKeywords.length >
    CANDIDATE_KEYWORD_LIMIT
  ) {
    warning = appendWarning(
      warning,
      `Database candidate retrieval was limited to the top ${CANDIDATE_KEYWORD_LIMIT} keywords to control response time.`,
    );
  }

  return {
    ...result,
    keywords: enrichedKeywords,
    ...(warning ? { warning } : {}),
  };
}
async function analyzePatentText(
  text: string,
  apiKey: string,
): Promise<AnalysisResult> {
  const client = new OpenAI({ apiKey });
  const warning =
    text.length > LONG_INPUT_WARNING_CHARS
      ? 'Long input detected. The model analyzed the provided text in one pass; splitting a long document can improve recall and cost control.'
      : undefined;

  const response = await client.responses.create({
    model: MODEL,
    input: [
      {
        role: 'system',
        content: [
          {
            type: 'input_text',
            text: `You are a multilingual patent analyst for English and Japanese technical documents.
Return only structured JSON matching the schema.
Tasks:
- Detect whether the dominant input language is English (en) or Japanese (ja).
- Extract meaningful technical patent keywords and noun phrases; exclude stopwords, legal boilerplate, and generic verbs.
- Normalize synonyms into a concise canonical normalized_term.
- For Japanese input, preserve Japanese wording in term and use an English technical phrase in normalized_term whenever possible.
- Count occurrences across direct terms and clear synonyms; rank by descending frequency.
- Suggest likely IPC, CPC, FI, and F-term codes only when supportable.
- Include a concise, specific reason grounded in the input text.
- Use low confidence when classification support is weak.
- Do not claim that any code is database verified. The server performs database verification after your response.
- Do not invent overly specific FI or F-term codes. Leave arrays empty when a code cannot be responsibly inferred.`,
          },
        ],
      },
      {
        role: 'user',
        content: [
          {
            type: 'input_text',
            text: `Analyze this patent text. UTF-8 Japanese content may be present.\n\n${text}`,
          },
        ],
      },
    ],
    text: {
      format: {
        type: 'json_schema',
        name: 'patent_keyword_classification_analysis',
        schema: responseSchema,
        strict: true,
      },
    },
  });

  const outputText = response.output_text;

  if (!outputText) {
    throw new Error('OpenAI returned an empty response.');
  }

  return normalizeResult(
    JSON.parse(outputText) as AnalysisResult,
    warning,
  );
}

Deno.serve(async (request: Request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', {
      status: 200,
      headers: corsHeaders,
    });
  }

  if (request.method !== 'POST') {
    return jsonResponse(
      { error: 'Method not allowed. Use POST.' },
      { status: 405 },
    );
  }

  try {
    const apiKey = getRequiredEnv('OPENAI_API_KEY');
    const supabaseUrl = getRequiredEnv('SUPABASE_URL');
    const supabaseAnonKey = getRequiredEnv('SUPABASE_ANON_KEY');
    const supabaseServiceRoleKey = getRequiredEnv(
      'SUPABASE_SERVICE_ROLE_KEY',
    );

    const authHeader = request.headers.get('Authorization');

    if (!authHeader) {
      return jsonResponse(
        { error: 'Authentication required.' },
        { status: 401 },
      );
    }

    const authClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: {
          Authorization: authHeader,
        },
      },
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    const {
      data: { user },
      error: userError,
    } = await authClient.auth.getUser();

    if (userError || !user) {
      return jsonResponse(
        { error: 'Authentication required.' },
        { status: 401 },
      );
    }

    const adminClient = createClient(
      supabaseUrl,
      supabaseServiceRoleKey,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      },
    );

    const { data: creditRow, error: creditError } = await adminClient
      .from('user_credit_balances')
      .select('remaining_credits')
      .eq('user_id', user.id)
      .maybeSingle();

    if (creditError) {
      return jsonResponse({ error: creditError.message }, { status: 500 });
    }

    const currentCredits = Number(creditRow?.remaining_credits ?? 0);

    if (!Number.isFinite(currentCredits) || currentCredits <= 0) {
      return jsonResponse(
        {
          error: NO_CREDITS_MESSAGE,
          remainingCredits: 0,
        },
        { status: 402 },
      );
    }

    const body = (await request.json()) as AnalyzeRequest;
    const text = validateText(body);
    const requestId = validateRequestId(body.request_id);
    const inputHash = await sha256Hex(text);
    const aiResult = await analyzePatentText(text, apiKey);
    let result: AnalysisResult;

    try {
      result = await enrichAnalysisClassifications(
        adminClient,
        aiResult,
      );
    } catch (classificationError) {
      console.error(
        'Classification enrichment failed:',
        classificationError,
      );

      throw new HttpError(
        503,
        'Classification database verification is temporarily unavailable. No credit was consumed.',
      );
    }

    const { data: consumed, error: consumeError } =
      await adminClient.rpc(
        'consume_analysis_credit_once',
        {
          p_user_id: user.id,
          p_source: 'analysis',
          p_request_id: requestId,
          p_input_hash: inputHash,
        },
      );

    if (consumeError) {
      return jsonResponse({ error: consumeError.message }, { status: 500 });
    }

    if (!consumed) {
      return jsonResponse(
        {
          error: NO_CREDITS_MESSAGE,
          remainingCredits: 0,
        },
        { status: 402 },
      );
    }

    const {
      data: updatedCreditRow,
      error: updatedCreditError,
    } = await adminClient
      .from('user_credit_balances')
      .select('remaining_credits')
      .eq('user_id', user.id)
      .maybeSingle();

    if (updatedCreditError) {
      return jsonResponse(
        { error: updatedCreditError.message },
        { status: 500 },
      );
    }

    const remainingCredits = Number(
      updatedCreditRow?.remaining_credits ?? 0,
    );

    return jsonResponse({
      ...result,
      requestId,
      remainingCredits: Number.isFinite(remainingCredits)
        ? remainingCredits
        : 0,
    });
  } catch (error) {
    console.error('Analyze Edge Function failed:', error);

    const message =
      error instanceof Error
        ? error.message
        : 'Failed to analyze patent text.';
    const status =
      error instanceof HttpError
        ? error.status
        : message.includes('too long')
          ? 413
          : 500;

    return jsonResponse({ error: message }, { status });
  }
});
