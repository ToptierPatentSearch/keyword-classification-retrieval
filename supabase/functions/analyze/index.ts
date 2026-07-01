import OpenAI from 'npm:openai@^5.0.0';
import { createClient } from 'npm:@supabase/supabase-js@^2.44.4';

type Confidence = 'high' | 'medium' | 'low';
type PatentLanguage = 'en' | 'ja';

interface AnalyzeRequest {
  text?: unknown;
  input?: unknown;
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
  remainingCredits?: number;
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

  if (!text) {
    throw new Error('Text must not be empty.');
  }

  if (text.length > MAX_INPUT_CHARS) {
    throw new Error(
      `Text is too long. Limit input to ${MAX_INPUT_CHARS.toLocaleString()} characters or chunk it before calling analyze.`
    );
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
  const warning =
    text.length > LONG_INPUT_WARNING_CHARS
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
- For every keyword object, include a concise but specific reason explaining why the keyword and classifications were selected from the input evidence.
- First attempt classification mapping using your knowledge. If uncertain, set classification_confidence to low.
- Do not invent overly specific FI or F-term codes. Leave arrays empty when a code family cannot be responsibly inferred.
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
    const result = await analyzePatentText(text, apiKey);

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

    const status = message.includes('too long') ? 413 : 400;

    return jsonResponse({ error: message }, { status });
  }
});
