import OpenAI from 'npm:openai@^5.0.0';
import { createClient } from 'npm:@supabase/supabase-js@^2.44.4';

type Confidence = 'high' | 'medium' | 'low';
type PatentLanguage = 'en' | 'ja';
type ClassificationSystem = 'ipc' | 'cpc' | 'fi' | 'f_term';

interface AnalyzeRequest {
  text?: unknown;
  input?: unknown;
}

interface KeywordDraft {
  term: string;
  normalized_term: string;
  count: number;
  rank: number;
  search_terms: string[];
  reason: string;
}

interface KeywordSelection {
  rank: number;
  ipc: string[];
  cpc: string[];
  fi: string[];
  f_term: string[];
  classification_confidence: Confidence;
  reason: string;
}

interface OfficialClassificationCandidate {
  system: ClassificationSystem;
  code: string;
  title: string;
  description: string | null;
  edition: string;
  source_name: string;
  source_url: string;
  score: number;
}

interface ClassificationEvidence {
  system: ClassificationSystem;
  code: string;
  title: string;
  edition: string;
  source_name: string;
  source_url: string;
  match_score: number;
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
  classification_confidence: Confidence;
  reason: string;
  classification_evidence: ClassificationEvidence[];
}

interface AnalysisResult {
  language: PatentLanguage;
  keywords: KeywordClassification[];
  warning?: string;
  remainingCredits?: number;
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
};

const MIN_INPUT_CHARS = 20;
const MAX_INPUT_CHARS = 10000;
const MAX_INPUT_LINES = 300;
const MIN_MEANINGFUL_CHAR_RATIO = 0.35;
const MAX_DUPLICATE_WORD_RATIO = 0.75;
const LONG_INPUT_WARNING_CHARS = 8000;
const MAX_KEYWORDS = 30;
const MAX_QUERY_TERMS_PER_KEYWORD = 5;
const MAX_CANDIDATES_PER_QUERY = 12;
const MAX_CANDIDATES_PER_SYSTEM = 8;
const MODEL = Deno.env.get('OPENAI_MODEL') ?? 'gpt-4.1-mini';

const NO_CREDITS_MESSAGE =
  '分析クレジットがありません。Test pack または Business pack を購入してください。';

const keywordDraftSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['language', 'keywords'],
  properties: {
    language: { type: 'string', enum: ['en', 'ja'] },
    keywords: {
      type: 'array',
      maxItems: MAX_KEYWORDS,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['term', 'normalized_term', 'count', 'rank', 'search_terms', 'reason'],
        properties: {
          term: { type: 'string' },
          normalized_term: { type: 'string' },
          count: { type: 'integer', minimum: 1 },
          rank: { type: 'integer', minimum: 1 },
          search_terms: {
            type: 'array',
            minItems: 1,
            maxItems: MAX_QUERY_TERMS_PER_KEYWORD,
            items: { type: 'string' },
          },
          reason: { type: 'string' },
        },
      },
    },
  },
} as const;

const selectionSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['keywords'],
  properties: {
    keywords: {
      type: 'array',
      maxItems: MAX_KEYWORDS,
      items: {
        type: 'object',
        additionalProperties: false,
        required: [
          'rank',
          'ipc',
          'cpc',
          'fi',
          'f_term',
          'classification_confidence',
          'reason',
        ],
        properties: {
          rank: { type: 'integer', minimum: 1 },
          ipc: { type: 'array', items: { type: 'string' } },
          cpc: { type: 'array', items: { type: 'string' } },
          fi: { type: 'array', items: { type: 'string' } },
          f_term: { type: 'array', items: { type: 'string' } },
          classification_confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
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

function validateText(body: AnalyzeRequest): string {
  const rawText = typeof body.text === 'string' ? body.text : body.input;

  if (typeof rawText !== 'string') {
    throw new Error('Request body must include a string field named "text" or "input".');
  }

  const text = rawText.trim();

  if (text.length < MIN_INPUT_CHARS) {
    throw new Error(
      `Text is too short. Please enter at least ${MIN_INPUT_CHARS} characters of meaningful technical text.`
    );
  }

  if (text.length > MAX_INPUT_CHARS) {
    throw new Error(
      `Text is too long. Limit input to ${MAX_INPUT_CHARS.toLocaleString()} characters.`
    );
  }

  const lines = text.split(/\r?\n/);

  if (lines.length > MAX_INPUT_LINES) {
    throw new Error(
      `Text has too many lines. Limit input to ${MAX_INPUT_LINES.toLocaleString()} lines.`
    );
  }

  if (/([\s\S])\1{20,}/u.test(text)) {
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

function uniqueNonEmpty(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function normalizeCode(code: string): string {
  return code.toUpperCase().replace(/\s+/g, '');
}

function candidateKey(system: ClassificationSystem, code: string): string {
  return `${system}:${normalizeCode(code)}`;
}

async function extractKeywordDrafts(
  text: string,
  client: OpenAI,
): Promise<{ language: PatentLanguage; keywords: KeywordDraft[] }> {
  const response = await client.responses.create({
    model: MODEL,
    input: [
      {
        role: 'system',
        content: [
          {
            type: 'input_text',
            text: `You are a multilingual patent search analyst for English and Japanese technical documents.
Return only structured JSON matching the schema.
Tasks:
- Detect whether the dominant input language is English (en) or Japanese (ja).
- Extract meaningful technical patent keywords and noun phrases; exclude stopwords, legal boilerplate, and generic verbs.
- Normalize synonyms into a canonical normalized_term.
- Count direct occurrences and clear synonyms, then rank by descending frequency.
- For each keyword, create one to five concise search_terms suitable for searching official IPC, CPC, FI, and F-term scheme titles and descriptions. Include English and Japanese equivalents when useful.
- Do not generate classification codes. Classification codes will be selected only from official catalog records in a separate verification stage.
- Give a concise reason grounded in the supplied patent text.`,
          },
        ],
      },
      {
        role: 'user',
        content: [
          {
            type: 'input_text',
            text: `Extract patent-search concepts from this text. UTF-8 Japanese content may be present.\n\n${text}`,
          },
        ],
      },
    ],
    text: {
      format: {
        type: 'json_schema',
        name: 'patent_keyword_drafts',
        schema: keywordDraftSchema,
        strict: true,
      },
    },
  });

  if (!response.output_text) {
    throw new Error('OpenAI returned an empty keyword-extraction response.');
  }

  const parsed = JSON.parse(response.output_text) as {
    language: PatentLanguage;
    keywords: KeywordDraft[];
  };

  const keywords = parsed.keywords
    .map((keyword) => ({
      ...keyword,
      term: keyword.term.trim(),
      normalized_term: keyword.normalized_term.trim(),
      count: Math.max(1, Math.trunc(keyword.count)),
      rank: Math.max(1, Math.trunc(keyword.rank)),
      search_terms: uniqueNonEmpty([
        keyword.normalized_term,
        keyword.term,
        ...keyword.search_terms,
      ]).slice(0, MAX_QUERY_TERMS_PER_KEYWORD),
      reason: keyword.reason.trim(),
    }))
    .filter((keyword) => keyword.term && keyword.normalized_term)
    .sort((a, b) => b.count - a.count || a.rank - b.rank)
    .slice(0, MAX_KEYWORDS)
    .map((keyword, index) => ({ ...keyword, rank: index + 1 }));

  return { language: parsed.language, keywords };
}

async function searchOfficialCandidates(
  adminClient: ReturnType<typeof createClient>,
  keyword: KeywordDraft,
): Promise<OfficialClassificationCandidate[]> {
  const merged = new Map<string, OfficialClassificationCandidate>();

  for (const query of keyword.search_terms) {
    const { data, error } = await adminClient.rpc('search_classification_records', {
      p_query: query,
      p_system: null,
      p_limit: MAX_CANDIDATES_PER_QUERY,
    });

    if (error) {
      throw new Error(
        `Official classification catalog search failed: ${error.message}. Apply the classification catalog migration and import current official records before analyzing.`
      );
    }

    for (const raw of (data ?? []) as Record<string, unknown>[]) {
      const system = raw.system as ClassificationSystem;
      const code = typeof raw.code === 'string' ? raw.code.trim() : '';
      const title = typeof raw.title === 'string' ? raw.title.trim() : '';

      if (!['ipc', 'cpc', 'fi', 'f_term'].includes(system) || !code || !title) {
        continue;
      }

      const candidate: OfficialClassificationCandidate = {
        system,
        code,
        title,
        description: typeof raw.description === 'string' ? raw.description : null,
        edition: typeof raw.edition === 'string' ? raw.edition : 'unknown',
        source_name: typeof raw.source_name === 'string' ? raw.source_name : 'Official classification source',
        source_url: typeof raw.source_url === 'string' ? raw.source_url : '',
        score: Number.isFinite(Number(raw.score)) ? Number(raw.score) : 0,
      };
      const key = candidateKey(system, code);
      const current = merged.get(key);

      if (!current || candidate.score > current.score) {
        merged.set(key, candidate);
      }
    }
  }

  const bySystem = new Map<ClassificationSystem, OfficialClassificationCandidate[]>();

  for (const candidate of merged.values()) {
    const values = bySystem.get(candidate.system) ?? [];
    values.push(candidate);
    bySystem.set(candidate.system, values);
  }

  return (['ipc', 'cpc', 'fi', 'f_term'] as ClassificationSystem[]).flatMap((system) =>
    (bySystem.get(system) ?? [])
      .sort((a, b) => b.score - a.score || a.code.localeCompare(b.code))
      .slice(0, MAX_CANDIDATES_PER_SYSTEM)
  );
}

async function selectClassifications(
  keywordDrafts: KeywordDraft[],
  candidatesByRank: Map<number, OfficialClassificationCandidate[]>,
  client: OpenAI,
): Promise<KeywordSelection[]> {
  const payload = keywordDrafts.map((keyword) => ({
    rank: keyword.rank,
    term: keyword.term,
    normalized_term: keyword.normalized_term,
    keyword_reason: keyword.reason,
    official_candidates: (candidatesByRank.get(keyword.rank) ?? []).map((candidate) => ({
      system: candidate.system,
      code: candidate.code,
      title: candidate.title,
      description: candidate.description,
      edition: candidate.edition,
      source_name: candidate.source_name,
      score: candidate.score,
    })),
  }));

  const response = await client.responses.create({
    model: MODEL,
    input: [
      {
        role: 'system',
        content: [
          {
            type: 'input_text',
            text: `You are verifying patent classifications against an official classification catalog.
Return only structured JSON matching the schema.
Rules:
- Select a code only when it appears verbatim in official_candidates for the same keyword and system.
- Never invent, broaden, truncate, combine, or alter a code.
- Prefer the most specific candidate whose official title or description directly matches the technical concept.
- Select no more than three codes per system and keyword.
- Leave an array empty when the official candidate evidence is weak or only tangential.
- FI and F-term are Japanese search classifications; select them only when the official record directly supports the concept.
- Confidence means confidence in the selected official-record match, not confidence in model memory.
- Explain the selection or omission concisely.`,
          },
        ],
      },
      {
        role: 'user',
        content: [
          {
            type: 'input_text',
            text: `Select verified classifications for these keyword candidates:\n${JSON.stringify(payload)}`,
          },
        ],
      },
    ],
    text: {
      format: {
        type: 'json_schema',
        name: 'verified_patent_classifications',
        schema: selectionSchema,
        strict: true,
      },
    },
  });

  if (!response.output_text) {
    throw new Error('OpenAI returned an empty classification-selection response.');
  }

  const parsed = JSON.parse(response.output_text) as { keywords: KeywordSelection[] };
  return parsed.keywords;
}

function validatedCodes(
  requestedCodes: string[],
  system: ClassificationSystem,
  candidates: OfficialClassificationCandidate[],
): string[] {
  const officialCodes = new Map(
    candidates
      .filter((candidate) => candidate.system === system)
      .map((candidate) => [normalizeCode(candidate.code), candidate.code])
  );

  return uniqueNonEmpty(requestedCodes)
    .map((code) => officialCodes.get(normalizeCode(code)))
    .filter((code): code is string => Boolean(code))
    .slice(0, 3);
}

function calculateConfidence(
  requestedConfidence: Confidence,
  selectedCodes: string[],
  candidates: OfficialClassificationCandidate[],
): Confidence {
  if (selectedCodes.length === 0) {
    return 'low';
  }

  const selectedKeys = new Set(selectedCodes.map(normalizeCode));
  const scores = candidates
    .filter((candidate) => selectedKeys.has(normalizeCode(candidate.code)))
    .map((candidate) => candidate.score);
  const minimumScore = scores.length > 0 ? Math.min(...scores) : 0;

  if (minimumScore < 0.2) {
    return 'low';
  }

  if (minimumScore < 0.42 && requestedConfidence === 'high') {
    return 'medium';
  }

  return requestedConfidence;
}

function buildEvidence(
  systemsAndCodes: Array<[ClassificationSystem, string[]]>,
  candidates: OfficialClassificationCandidate[],
): ClassificationEvidence[] {
  const selectedKeys = new Set(
    systemsAndCodes.flatMap(([system, codes]) =>
      codes.map((code) => candidateKey(system, code))
    )
  );

  return candidates
    .filter((candidate) => selectedKeys.has(candidateKey(candidate.system, candidate.code)))
    .map((candidate) => ({
      system: candidate.system,
      code: candidate.code,
      title: candidate.title,
      edition: candidate.edition,
      source_name: candidate.source_name,
      source_url: candidate.source_url,
      match_score: Math.round(candidate.score * 1000) / 1000,
    }))
    .sort((a, b) => a.system.localeCompare(b.system) || a.code.localeCompare(b.code));
}

async function analyzePatentText(
  text: string,
  apiKey: string,
  adminClient: ReturnType<typeof createClient>,
): Promise<AnalysisResult> {
  const client = new OpenAI({ apiKey });
  const draft = await extractKeywordDrafts(text, client);
  const candidatesByRank = new Map<number, OfficialClassificationCandidate[]>();

  for (const keyword of draft.keywords) {
    candidatesByRank.set(
      keyword.rank,
      await searchOfficialCandidates(adminClient, keyword)
    );
  }

  const totalCandidateCount = [...candidatesByRank.values()].reduce(
    (sum, values) => sum + values.length,
    0
  );

  if (totalCandidateCount === 0) {
    throw new Error(
      'The official classification catalog contains no searchable records. Import current WIPO IPC, CPC, and JPO FI/F-term records before analyzing.'
    );
  }

  const selections = await selectClassifications(draft.keywords, candidatesByRank, client);
  const selectionsByRank = new Map(selections.map((selection) => [selection.rank, selection]));

  const keywords = draft.keywords.map((keyword) => {
    const candidates = candidatesByRank.get(keyword.rank) ?? [];
    const selection = selectionsByRank.get(keyword.rank) ?? {
      rank: keyword.rank,
      ipc: [],
      cpc: [],
      fi: [],
      f_term: [],
      classification_confidence: 'low' as Confidence,
      reason: 'No classification was selected from the official candidates.',
    };
    const ipc = validatedCodes(selection.ipc, 'ipc', candidates);
    const cpc = validatedCodes(selection.cpc, 'cpc', candidates);
    const fi = validatedCodes(selection.fi, 'fi', candidates);
    const fTerm = validatedCodes(selection.f_term, 'f_term', candidates);
    const allSelectedCodes = [...ipc, ...cpc, ...fi, ...fTerm];

    return {
      term: keyword.term,
      normalized_term: keyword.normalized_term,
      count: keyword.count,
      rank: keyword.rank,
      ipc,
      cpc,
      fi,
      f_term: fTerm,
      classification_confidence: calculateConfidence(
        selection.classification_confidence,
        allSelectedCodes,
        candidates
      ),
      reason: `${keyword.reason} ${selection.reason}`.trim(),
      classification_evidence: buildEvidence(
        [
          ['ipc', ipc],
          ['cpc', cpc],
          ['fi', fi],
          ['f_term', fTerm],
        ],
        candidates
      ),
    };
  });

  const warnings: string[] = [];

  if (text.length > LONG_INPUT_WARNING_CHARS) {
    warnings.push(
      'Long input detected. For production-scale documents, chunking can improve keyword recall and cost control.'
    );
  }

  if (keywords.some((keyword) => keyword.classification_evidence.length === 0)) {
    warnings.push(
      'Some keywords had no sufficiently supported code in the imported official classification catalog.'
    );
  }

  return {
    language: draft.language,
    keywords,
    ...(warnings.length > 0 ? { warning: warnings.join(' ') } : {}),
  };
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', {
      status: 200,
      headers: corsHeaders,
    });
  }

  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed. Use POST.' }, { status: 405 });
  }

  try {
    const apiKey = getRequiredEnv('OPENAI_API_KEY');
    const supabaseUrl = getRequiredEnv('SUPABASE_URL');
    const supabaseAnonKey = getRequiredEnv('SUPABASE_ANON_KEY');
    const supabaseServiceRoleKey = getRequiredEnv('SUPABASE_SERVICE_ROLE_KEY');
    const authHeader = request.headers.get('Authorization');

    if (!authHeader) {
      return jsonResponse({ error: 'Authentication required.' }, { status: 401 });
    }

    const authClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: {
          Authorization: authHeader,
        },
      },
    });

    const {
      data: { user },
      error: userError,
    } = await authClient.auth.getUser();

    if (userError || !user) {
      return jsonResponse({ error: 'Authentication required.' }, { status: 401 });
    }

    const adminClient = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

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
        { status: 402 }
      );
    }

    const body = (await request.json()) as AnalyzeRequest;
    const text = validateText(body);
    const result = await analyzePatentText(text, apiKey, adminClient);

    const { data: consumed, error: consumeError } = await adminClient.rpc(
      'consume_analysis_credit',
      {
        p_user_id: user.id,
        p_source: 'analysis',
      }
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
        { status: 402 }
      );
    }

    const { data: updatedCreditRow, error: updatedCreditError } = await adminClient
      .from('user_credit_balances')
      .select('remaining_credits')
      .eq('user_id', user.id)
      .maybeSingle();

    if (updatedCreditError) {
      return jsonResponse({ error: updatedCreditError.message }, { status: 500 });
    }

    const remainingCredits = Number(updatedCreditRow?.remaining_credits ?? 0);

    return jsonResponse({
      ...result,
      remainingCredits: Number.isFinite(remainingCredits) ? remainingCredits : 0,
    });
  } catch (error) {
    console.error('Analyze Edge Function failed:', error);

    const message =
      error instanceof Error
        ? error.message
        : 'Failed to analyze patent text.';
    const status = message.includes('too long')
      ? 413
      : message.includes('official classification catalog') ||
          message.includes('classification catalog migration')
        ? 503
        : 400;

    return jsonResponse({ error: message }, { status });
  }
});
