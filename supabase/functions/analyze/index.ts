import OpenAI from 'npm:openai@^5.0.0';

type Confidence = 'high' | 'medium' | 'low';
type PatentLanguage = 'en' | 'ja';

interface AnalyzeRequest {
  text?: unknown;
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
}

interface AnalysisResult {
  language: PatentLanguage;
  keywords: KeywordClassification[];
  warning?: string;
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
};

const MAX_INPUT_CHARS = 50000;
const LONG_INPUT_WARNING_CHARS = 12000;
const MODEL = Deno.env.get('OPENAI_MODEL') ?? 'gpt-4.1-mini';

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

function validateText(body: AnalyzeRequest): string {
  if (typeof body.text !== 'string') {
    throw new Error('Request body must include a string field named "text".');
  }

  const text = body.text.trim();
  if (!text) {
    throw new Error('Text must not be empty.');
  }

  if (text.length > MAX_INPUT_CHARS) {
    throw new Error(`Text is too long. Limit input to ${MAX_INPUT_CHARS.toLocaleString()} characters or chunk it before calling analyze.`);
  }

  return text;
}

function normalizeResult(result: AnalysisResult, warning?: string): AnalysisResult {
  const normalizedKeywords = result.keywords
    .map((keyword) => ({
      ...keyword,
      count: Math.max(1, Math.trunc(keyword.count)),
      rank: Math.max(1, Math.trunc(keyword.rank)),
      ipc: keyword.classification_confidence === 'low' ? keyword.ipc.slice(0, 2) : keyword.ipc,
      cpc: keyword.classification_confidence === 'low' ? keyword.cpc.slice(0, 2) : keyword.cpc,
      fi: keyword.classification_confidence === 'low' ? keyword.fi.slice(0, 1) : keyword.fi,
      f_term: keyword.classification_confidence === 'low' ? keyword.f_term.slice(0, 1) : keyword.f_term,
    }))
    .sort((a, b) => b.count - a.count || a.rank - b.rank)
    .map((keyword, index) => ({ ...keyword, rank: index + 1 }));

  return {
    language: result.language,
    keywords: normalizedKeywords,
    ...(warning ? { warning } : {}),
  };
}

async function analyzePatentText(text: string, apiKey: string): Promise<AnalysisResult> {
  const client = new OpenAI({ apiKey });
  const warning = text.length > LONG_INPUT_WARNING_CHARS
    ? 'Long input detected. The model analyzed the provided text in one pass; for production-scale documents, chunking can improve recall and cost control.'
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
- Normalize synonyms into a canonical normalized_term, including examples such as AI/artificial intelligence and semiconductor device/semiconductor apparatus.
- Count occurrences across direct terms and clear synonyms; rank by descending frequency.
- Map each keyword to likely IPC, CPC, FI, and F-term codes when supportable.
- For every keyword result item, include a concise but specific reason explaining why the term and suggested classifications/codes were selected from the input.
- First attempt classification mapping using your knowledge. If uncertain, set classification_confidence to low and explain the uncertainty in reason.
- Do not invent overly specific FI or F-term codes. Leave arrays empty when a code family cannot be responsibly inferred.
- Return a stable JSON object with language and keywords; each keyword item must include term, normalized_term, count, rank, ipc, cpc, fi, f_term, classification_confidence, and reason.
- Prefer concise reasons and keep the output extensible for future USPTO CPC, WIPO IPC, and JPO FI/F-term data integration.`,
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

  return normalizeResult(JSON.parse(outputText) as AnalysisResult, warning);
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed. Use POST.' }, { status: 405 });
  }

  const apiKey = Deno.env.get('OPENAI_API_KEY');
  if (!apiKey) {
    return jsonResponse({ error: 'OPENAI_API_KEY is not configured in Supabase secrets.' }, { status: 500 });
  }

  try {
    const body = await request.json() as AnalyzeRequest;
    const text = validateText(body);
    const result = await analyzePatentText(text, apiKey);
    return jsonResponse(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to analyze patent text.';
    const status = message.includes('too long') ? 413 : 400;
    return jsonResponse({ error: message }, { status });
  }
});
