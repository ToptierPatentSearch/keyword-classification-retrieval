import OpenAI from 'npm:openai@^5.0.0';
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@^2.44.4';

type Confidence = 'high' | 'medium' | 'low';
type PatentLanguage = 'en' | 'ja';
type ClassificationScheme = 'ipc' | 'cpc' | 'fi' | 'f_term';
type CatalogStatus = 'verified' | 'partial' | 'unavailable';

interface AnalyzeRequest {
  text?: unknown;
  input?: unknown;
}

interface ExtractedKeyword {
  term: string;
  normalized_term: string;
  count: number;
  rank: number;
  extraction_reason: string;
}

interface CatalogCandidate {
  query_index: number;
  id: number;
  scheme: ClassificationScheme;
  code: string;
  title_en: string;
  title_ja: string | null;
  source_name: string;
  source_url: string;
  source_version: string;
  score: number;
}

interface ClassificationEvidence {
  scheme: ClassificationScheme;
  code: string;
  title: string;
  source_name: string;
  source_url: string;
  source_version: string;
  retrieval_score: number;
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

interface ClassificationSource {
  scheme: ClassificationScheme;
  source_name: string;
  source_url: string;
  source_version: string;
}

interface AnalysisResult {
  language: PatentLanguage;
  keywords: KeywordClassification[];
  classification_catalog_status: CatalogStatus;
  classification_sources: ClassificationSource[];
  warning?: string;
  remainingCredits?: number;
}

interface ExtractionResult {
  language: PatentLanguage;
  keywords: ExtractedKeyword[];
}

interface ModelSelection {
  keyword_index: number;
  selected_candidate_ids: number[];
  classification_confidence: Confidence;
  reason: string;
}

interface SelectionResult {
  selections: ModelSelection[];
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
const MAX_REPEATED_CHAR_RUN = 20;
const MIN_MEANINGFUL_CHAR_RATIO = 0.35;
const MAX_DUPLICATE_WORD_RATIO = 0.75;
const LONG_INPUT_WARNING_CHARS = 8000;
const MAX_KEYWORDS = 30;
const MAX_CANDIDATES_PER_SCHEME = 8;
const MAX_SELECTED_CODES_PER_SCHEME = 4;
const MODEL = Deno.env.get('OPENAI_MODEL') ?? 'gpt-4.1-mini';

const NO_CREDITS_MESSAGE =
  '分析クレジットがありません。Test pack または Business pack を購入してください。';

const extractionSchema = {
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
        required: ['term', 'normalized_term', 'count', 'rank', 'extraction_reason'],
        properties: {
          term: { type: 'string' },
          normalized_term: { type: 'string' },
          count: { type: 'integer', minimum: 1 },
          rank: { type: 'integer', minimum: 1 },
          extraction_reason: { type: 'string' },
        },
      },
    },
  },
} as const;

const selectionSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['selections'],
  properties: {
    selections: {
      type: 'array',
      maxItems: MAX_KEYWORDS,
      items: {
        type: 'object',
        additionalProperties: false,
        required: [
          'keyword_index',
          'selected_candidate_ids',
          'classification_confidence',
          'reason',
        ],
        properties: {
          keyword_index: { type: 'integer', minimum: 0 },
          selected_candidate_ids: {
            type: 'array',
            items: { type: 'integer', minimum: 1 },
          },
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

  if (new RegExp(`([\\s\\S])\\1{${MAX_REPEATED_CHAR_RUN},}`, 'u').test(text)) {
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

function normalizeExtractedKeywords(result: ExtractionResult): ExtractionResult {
  const seen = new Set<string>();
  const keywords = result.keywords
    .map((keyword) => ({
      ...keyword,
      term: keyword.term.trim(),
      normalized_term: keyword.normalized_term.trim(),
      count: Math.max(1, Math.trunc(keyword.count)),
      rank: Math.max(1, Math.trunc(keyword.rank)),
      extraction_reason: keyword.extraction_reason.trim(),
    }))
    .filter((keyword) => keyword.term.length > 0 && keyword.normalized_term.length > 0)
    .filter((keyword) => {
      const key = keyword.normalized_term.toLocaleLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => b.count - a.count || a.rank - b.rank)
    .slice(0, MAX_KEYWORDS)
    .map((keyword, index) => ({ ...keyword, rank: index + 1 }));

  return { language: result.language, keywords };
}

async function extractPatentKeywords(text: string, client: OpenAI): Promise<ExtractionResult> {
  const response = await client.responses.create({
    model: MODEL,
    input: [
      {
        role: 'system',
        content: [
          {
            type: 'input_text',
            text: `You are a multilingual patent-search analyst for English and Japanese technical documents.
Return only structured JSON matching the schema.
Tasks:
- Detect whether the dominant input language is English (en) or Japanese (ja).
- Extract meaningful technical patent keywords and noun phrases; exclude stopwords, legal boilerplate, applicant names, and generic verbs.
- Normalize synonyms into a precise canonical normalized_term.
- Count occurrences across direct terms and clear synonyms; rank by descending frequency.
- Include a concise extraction_reason grounded in the submitted text.
- Do not generate IPC, CPC, FI, or F-term codes. Classification is performed separately against an official-data catalog.`,
          },
        ],
      },
      {
        role: 'user',
        content: [
          {
            type: 'input_text',
            text: `Extract patent-search keywords from this text. UTF-8 Japanese content may be present.\n\n${text}`,
          },
        ],
      },
    ],
    text: {
      format: {
        type: 'json_schema',
        name: 'patent_keyword_extraction',
        schema: extractionSchema,
        strict: true,
      },
    },
  });

  if (!response.output_text) {
    throw new Error('OpenAI returned an empty keyword extraction response.');
  }

  return normalizeExtractedKeywords(JSON.parse(response.output_text) as ExtractionResult);
}

function isClassificationScheme(value: unknown): value is ClassificationScheme {
  return value === 'ipc' || value === 'cpc' || value === 'fi' || value === 'f_term';
}

function normalizeCandidates(rows: unknown): CatalogCandidate[] {
  if (!Array.isArray(rows)) return [];

  return rows.flatMap((row): CatalogCandidate[] => {
    if (!row || typeof row !== 'object') return [];

    const value = row as Record<string, unknown>;
    const queryIndex = Number(value.query_index);
    const id = Number(value.id);
    const score = Number(value.score);

    if (
      !Number.isInteger(queryIndex) ||
      queryIndex < 0 ||
      !Number.isInteger(id) ||
      id <= 0 ||
      !isClassificationScheme(value.scheme) ||
      typeof value.code !== 'string' ||
      typeof value.title_en !== 'string' ||
      typeof value.source_name !== 'string' ||
      typeof value.source_url !== 'string' ||
      typeof value.source_version !== 'string'
    ) {
      return [];
    }

    return [{
      query_index: queryIndex,
      id,
      scheme: value.scheme,
      code: value.code.trim(),
      title_en: value.title_en.trim(),
      title_ja: typeof value.title_ja === 'string' ? value.title_ja.trim() : null,
      source_name: value.source_name.trim(),
      source_url: value.source_url.trim(),
      source_version: value.source_version.trim(),
      score: Number.isFinite(score) ? score : 0,
    }];
  });
}

async function retrieveOfficialCandidates(
  keywords: ExtractedKeyword[],
  adminClient: SupabaseClient
): Promise<CatalogCandidate[]> {
  if (keywords.length === 0) return [];

  const queries = keywords.map((keyword) => keyword.normalized_term || keyword.term);
  const { data, error } = await adminClient.rpc('search_patent_classifications_batch', {
    p_queries: queries,
    p_limit_per_scheme: MAX_CANDIDATES_PER_SCHEME,
  });

  if (error) {
    if (
      error.message.includes('search_patent_classifications_batch') ||
      error.message.includes('does not exist')
    ) {
      return [];
    }

    throw new Error(`Classification catalog search failed: ${error.message}`);
  }

  return normalizeCandidates(data);
}

function buildCandidatePayload(
  keywords: ExtractedKeyword[],
  candidates: CatalogCandidate[]
): Array<Record<string, unknown>> {
  return keywords.map((keyword, keywordIndex) => ({
    keyword_index: keywordIndex,
    term: keyword.term,
    normalized_term: keyword.normalized_term,
    extraction_reason: keyword.extraction_reason,
    candidates: candidates
      .filter((candidate) => candidate.query_index === keywordIndex)
      .map((candidate) => ({
        id: candidate.id,
        scheme: candidate.scheme,
        code: candidate.code,
        title_en: candidate.title_en.slice(0, 240),
        title_ja: candidate.title_ja?.slice(0, 240) ?? null,
        retrieval_score: candidate.score,
      })),
  }));
}

async function selectVerifiedCodes(
  text: string,
  language: PatentLanguage,
  keywords: ExtractedKeyword[],
  candidates: CatalogCandidate[],
  client: OpenAI
): Promise<SelectionResult> {
  if (candidates.length === 0) return { selections: [] };

  const candidatePayload = buildCandidatePayload(keywords, candidates);
  const response = await client.responses.create({
    model: MODEL,
    input: [
      {
        role: 'system',
        content: [
          {
            type: 'input_text',
            text: `You are selecting patent classification codes for search preparation.
You receive technical text, extracted keywords, and candidate records retrieved from a versioned official-data catalog.
Rules:
- Select only candidate IDs that appear under the same keyword_index.
- Never create, rewrite, broaden, truncate, or infer a code that is not represented by a candidate ID.
- Select a candidate only when its title is technically supported by both the keyword and the submitted text.
- Prefer the most specific well-supported codes, but avoid false precision.
- Select no more than ${MAX_SELECTED_CODES_PER_SCHEME} candidates per classification scheme for each keyword.
- FI and F-term are Japanese search classifications; select them only where the technical relationship is supported by their official titles.
- Return an empty selected_candidate_ids array when none of the retrieved candidates is sufficiently supported.
- Confidence concerns relevance to the text. Code validity is checked separately against the catalog.
- Explain the selection or rejection concisely.`,
          },
        ],
      },
      {
        role: 'user',
        content: [
          {
            type: 'input_text',
            text: `Dominant language: ${language}\n\nSubmitted patent text:\n${text}\n\nOfficial catalog candidates:\n${JSON.stringify(candidatePayload)}`,
          },
        ],
      },
    ],
    text: {
      format: {
        type: 'json_schema',
        name: 'official_classification_candidate_selection',
        schema: selectionSchema,
        strict: true,
      },
    },
  });

  if (!response.output_text) {
    throw new Error('OpenAI returned an empty classification selection response.');
  }

  return JSON.parse(response.output_text) as SelectionResult;
}

function deduplicateEvidence(evidence: ClassificationEvidence[]): ClassificationEvidence[] {
  const seen = new Set<string>();

  return evidence.filter((item) => {
    const key = `${item.scheme}:${item.code}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function evidenceToCodes(
  evidence: ClassificationEvidence[],
  scheme: ClassificationScheme
): string[] {
  return evidence
    .filter((item) => item.scheme === scheme)
    .slice(0, MAX_SELECTED_CODES_PER_SCHEME)
    .map((item) => item.code);
}

function capConfidence(
  requested: Confidence,
  selectedCandidates: CatalogCandidate[]
): Confidence {
  if (selectedCandidates.length === 0) return 'low';

  const minimumScore = Math.min(...selectedCandidates.map((candidate) => candidate.score));

  if (minimumScore < 35) return 'low';
  if (minimumScore < 60 && requested === 'high') return 'medium';
  return requested;
}

function buildAnalysisResult(
  extraction: ExtractionResult,
  candidates: CatalogCandidate[],
  selectionResult: SelectionResult,
  longInputWarning?: string
): AnalysisResult {
  const candidatesByKeyword = new Map<number, CatalogCandidate[]>();

  for (const candidate of candidates) {
    const rows = candidatesByKeyword.get(candidate.query_index) ?? [];
    rows.push(candidate);
    candidatesByKeyword.set(candidate.query_index, rows);
  }

  const selectionsByKeyword = new Map<number, ModelSelection>();

  for (const selection of selectionResult.selections ?? []) {
    if (
      Number.isInteger(selection.keyword_index) &&
      selection.keyword_index >= 0 &&
      selection.keyword_index < extraction.keywords.length &&
      !selectionsByKeyword.has(selection.keyword_index)
    ) {
      selectionsByKeyword.set(selection.keyword_index, selection);
    }
  }

  let selectedCodeCount = 0;
  let keywordsWithCandidates = 0;

  const keywords = extraction.keywords.map((keyword, keywordIndex): KeywordClassification => {
    const keywordCandidates = candidatesByKeyword.get(keywordIndex) ?? [];
    if (keywordCandidates.length > 0) keywordsWithCandidates += 1;

    const candidateById = new Map(keywordCandidates.map((candidate) => [candidate.id, candidate]));
    const selection = selectionsByKeyword.get(keywordIndex);
    const perSchemeCounts = new Map<ClassificationScheme, number>();
    const selectedCandidates: CatalogCandidate[] = [];

    for (const id of selection?.selected_candidate_ids ?? []) {
      const candidate = candidateById.get(id);
      if (!candidate) continue;

      const schemeCount = perSchemeCounts.get(candidate.scheme) ?? 0;
      if (schemeCount >= MAX_SELECTED_CODES_PER_SCHEME) continue;

      perSchemeCounts.set(candidate.scheme, schemeCount + 1);
      selectedCandidates.push(candidate);
    }

    const evidence = deduplicateEvidence(
      selectedCandidates.map((candidate) => ({
        scheme: candidate.scheme,
        code: candidate.code,
        title: extraction.language === 'ja' && candidate.title_ja
          ? candidate.title_ja
          : candidate.title_en,
        source_name: candidate.source_name,
        source_url: candidate.source_url,
        source_version: candidate.source_version,
        retrieval_score: candidate.score,
      }))
    );

    selectedCodeCount += evidence.length;

    const reason = selection?.reason?.trim() || (
      keywordCandidates.length === 0
        ? 'No matching active entry was found in the loaded official classification catalog.'
        : 'Official catalog candidates were retrieved, but none was sufficiently supported by the submitted text.'
    );

    return {
      term: keyword.term,
      normalized_term: keyword.normalized_term,
      count: keyword.count,
      rank: keyword.rank,
      ipc: evidenceToCodes(evidence, 'ipc'),
      cpc: evidenceToCodes(evidence, 'cpc'),
      fi: evidenceToCodes(evidence, 'fi'),
      f_term: evidenceToCodes(evidence, 'f_term'),
      classification_confidence: capConfidence(
        selection?.classification_confidence ?? 'low',
        selectedCandidates
      ),
      reason,
      classification_evidence: evidence,
    };
  });

  const sourceMap = new Map<string, ClassificationSource>();

  for (const keyword of keywords) {
    for (const evidence of keyword.classification_evidence) {
      const key = `${evidence.scheme}:${evidence.source_name}:${evidence.source_version}`;
      sourceMap.set(key, {
        scheme: evidence.scheme,
        source_name: evidence.source_name,
        source_url: evidence.source_url,
        source_version: evidence.source_version,
      });
    }
  }

  const catalogStatus: CatalogStatus = candidates.length === 0
    ? 'unavailable'
    : selectedCodeCount > 0 && keywordsWithCandidates === extraction.keywords.length
      ? 'verified'
      : 'partial';

  const warnings = [
    longInputWarning,
    catalogStatus === 'unavailable'
      ? 'The official classification catalog is unavailable or contains no matching records. No unverified codes were generated.'
      : 'Classification codes were selected only from active records in the loaded official-data catalog. Relevance still requires professional review.',
  ].filter((message): message is string => Boolean(message));

  return {
    language: extraction.language,
    keywords,
    classification_catalog_status: catalogStatus,
    classification_sources: [...sourceMap.values()].sort((a, b) =>
      a.scheme.localeCompare(b.scheme) || a.source_name.localeCompare(b.source_name)
    ),
    ...(warnings.length > 0 ? { warning: warnings.join(' ') } : {}),
  };
}

async function analyzePatentText(
  text: string,
  apiKey: string,
  adminClient: SupabaseClient
): Promise<AnalysisResult> {
  const client = new OpenAI({ apiKey });
  const longInputWarning = text.length > LONG_INPUT_WARNING_CHARS
    ? 'Long input detected. For production-scale documents, section-aware chunking can improve keyword recall.'
    : undefined;

  const extraction = await extractPatentKeywords(text, client);
  const candidates = await retrieveOfficialCandidates(extraction.keywords, adminClient);
  const selections = await selectVerifiedCodes(
    text,
    extraction.language,
    extraction.keywords,
    candidates,
    client
  );

  return buildAnalysisResult(extraction, candidates, selections, longInputWarning);
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', {
      status: 200,
      headers: corsHeaders,
    });
  }

  if (request.method !== 'POST') {
    return jsonResponse(
      { error: 'Method not allowed. Use POST.' },
      { status: 405 }
    );
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

    const message = error instanceof Error
      ? error.message
      : 'Failed to analyze patent text.';
    const status = message.includes('too long') ? 413 : 400;

    return jsonResponse({ error: message }, { status });
  }
});
