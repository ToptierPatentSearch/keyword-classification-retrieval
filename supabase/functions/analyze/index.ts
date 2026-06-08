import OpenAI from "npm:openai@^6.10.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MAX_INPUT_CHARS = 30_000;
const LONG_INPUT_WARNING_CHARS = 12_000;

const jsonResponse = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json; charset=utf-8",
    },
  });

const analysisSchema = {
  type: "object",
  additionalProperties: false,
  required: ["language", "keywords"],
  properties: {
    language: { type: "string", enum: ["en", "ja"] },
    keywords: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "term",
          "normalized_term",
          "count",
          "rank",
          "ipc",
          "cpc",
          "fi",
          "f_term",
          "classification_confidence",
          "reason",
        ],
        properties: {
          term: { type: "string" },
          normalized_term: { type: "string" },
          count: { type: "integer" },
          rank: { type: "integer" },
          ipc: { type: "array", items: { type: "string" } },
          cpc: { type: "array", items: { type: "string" } },
          fi: { type: "array", items: { type: "string" } },
          f_term: { type: "array", items: { type: "string" } },
          classification_confidence: { type: "string", enum: ["high", "medium", "low"] },
          reason: { type: "string" },
        },
      },
    },
  },
} as const;

const systemInstructions = `You are a patent search analyst for English and Japanese patent documents.
Return only structured JSON matching the provided schema.
Tasks:
- Detect whether the input is primarily English (en) or Japanese (ja).
- Extract meaningful technical keywords and multi-word phrases; exclude generic patent stopwords, legal boilerplate, articles, particles, and non-technical terms.
- Normalize clear synonyms and spelling variants, including AI/artificial intelligence and semiconductor device/semiconductor apparatus.
- Count occurrences in the supplied text, rank keywords by descending frequency, and break ties by technical importance.
- Map each keyword to likely IPC, CPC, FI, and F-term codes.
Classification rules:
- Prefer broad, defensible IPC/CPC groups/classes over overly specific guesses.
- For FI and F-term, include codes only when you have a defensible likely mapping; otherwise return an empty array.
- If classification is uncertain, set classification_confidence to low and explain uncertainty briefly.
- Do not fabricate overly specific FI or F-term codes.
- Keep reasons concise and suitable for a patent analyst.`;

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed. Use POST." }, 405);
  }

  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) {
    return jsonResponse({ error: "OPENAI_API_KEY Supabase secret is not configured." }, 500);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: "Request body must be valid JSON." }, 400);
  }

  const text = typeof body === "object" && body !== null && "text" in body
    ? String((body as { text?: unknown }).text ?? "").trim()
    : "";

  if (!text) {
    return jsonResponse({ error: "Missing required field: text." }, 400);
  }

  if (text.length > MAX_INPUT_CHARS) {
    return jsonResponse({
      error: `Input is too long (${text.length} characters). Please submit ${MAX_INPUT_CHARS} characters or fewer, or split the patent text into smaller sections.`,
    }, 413);
  }

  const warning = text.length > LONG_INPUT_WARNING_CHARS
    ? `Long input detected (${text.length} characters). The model analyzes the full text, but keyword counts and classification confidence may be less precise; consider splitting very long patent documents in a future workflow.`
    : undefined;

  const client = new OpenAI({ apiKey });

  try {
    const response = await client.responses.create({
      model: Deno.env.get("OPENAI_MODEL") ?? "gpt-5.1",
      instructions: systemInstructions,
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: `Analyze this patent text and return the required JSON.\n\n${text}`,
            },
          ],
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "patent_keyword_classification_analysis",
          strict: true,
          schema: analysisSchema,
        },
      },
    });

    const outputText = response.output_text;
    if (!outputText) {
      return jsonResponse({ error: "OpenAI returned an empty analysis response." }, 502);
    }

    const parsed = JSON.parse(outputText) as Record<string, unknown>;
    if (warning) {
      parsed.warning = warning;
    }

    return jsonResponse(parsed);
  } catch (error) {
    console.error("Analyze function error", error);
    const message = error instanceof Error ? error.message : "Unknown OpenAI analysis error.";
    return jsonResponse({ error: `Analysis failed: ${message}` }, 500);
  }
});
