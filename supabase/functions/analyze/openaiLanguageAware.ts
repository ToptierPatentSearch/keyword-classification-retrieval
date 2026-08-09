import OpenAI from "npm:openai@5";
import {
  rewriteAnalysisRequestPayload,
  rewriteAnalysisResponsePayload,
} from "./openaiLanguageTransform.ts";

export * from "npm:openai@5";

type FetchFunction = typeof globalThis.fetch;
type OpenAIOptions = ConstructorParameters<typeof OpenAI>[0];
type JsonRecord = Record<string, unknown>;

interface AiUsageLogContext {
  callId: string;
  stage: string;
  responseFormat: string | null;
  model: string;
  startedAt: string;
}

interface QueryReviewSelection {
  keyword_groups: Array<{ term_ids: string[] }>;
  ipc_code_ids: string[];
  cpc_code_ids: string[];
}

const LOCAL_QUERY_REVIEW_FORMAT = "patent_search_query_id_review";
const MAX_QUERY_KEYWORD_GROUPS = 5;
const MAX_QUERY_TERMS_PER_GROUP = 3;

function isResponsesEndpoint(input: RequestInfo | URL): boolean {
  const url = input instanceof Request ? input.url : String(input);
  return /\/v1\/responses(?:\?|$)/u.test(url);
}

async function requestBodyText(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<string | null> {
  if (typeof init?.body === "string") return init.body;
  if (input instanceof Request) return await input.clone().text();
  return null;
}

function withJsonBody(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  body: string,
): [RequestInfo | URL, RequestInit | undefined] {
  if (input instanceof Request && init?.body === undefined) {
    return [new Request(input, { body }), init];
  }

  return [input, { ...(init ?? {}), body }];
}

function jsonResponse(payload: unknown, response: Response): Response {
  const headers = new Headers(response.headers);
  headers.delete("content-length");
  headers.delete("content-encoding");

  return new Response(JSON.stringify(payload), {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function asRecord(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as JsonRecord
    : null;
}

function textFormatName(payload: JsonRecord): string | null {
  const text = asRecord(payload.text);
  const format = asRecord(text?.format);
  return typeof format?.name === "string" ? format.name : null;
}

function requestModel(payload: JsonRecord): string {
  return typeof payload.model === "string" && payload.model.trim()
    ? payload.model.trim()
    : "unknown";
}

function inputTextValues(payload: JsonRecord): string[] {
  const values: string[] = [];

  for (const inputItem of Array.isArray(payload.input) ? payload.input : []) {
    const item = asRecord(inputItem);
    if (!item) continue;

    for (const contentItem of Array.isArray(item.content) ? item.content : []) {
      const content = asRecord(contentItem);
      if (
        content?.type === "input_text" &&
        typeof content.text === "string"
      ) {
        values.push(content.text);
      }
    }
  }

  return values;
}

function optionIds(value: unknown): string[] {
  const ids: string[] = [];

  for (const optionValue of Array.isArray(value) ? value : []) {
    const option = asRecord(optionValue);
    if (typeof option?.id === "string" && option.id.trim()) {
      ids.push(option.id.trim());
    }
  }

  return Array.from(new Set(ids));
}

function stringIds(value: unknown): string[] {
  return Array.from(
    new Set(
      (Array.isArray(value) ? value : [])
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  );
}

function queryReviewPayload(payload: JsonRecord): JsonRecord | null {
  for (const text of inputTextValues(payload)) {
    try {
      const parsed = asRecord(JSON.parse(text));
      if (parsed && asRecord(parsed.candidate_selection)) return parsed;
    } catch {
      // Most input_text entries are ordinary instructions rather than JSON.
    }
  }

  return null;
}

function buildLocalQueryReviewSelection(
  payload: JsonRecord,
): QueryReviewSelection {
  const reviewPayload = queryReviewPayload(payload);
  if (!reviewPayload) {
    throw new Error(
      "The deterministic search-query review payload could not be read.",
    );
  }

  const allowedTermIds = new Set(optionIds(reviewPayload.term_options));
  const allowedIpcIds = new Set(optionIds(reviewPayload.ipc_options));
  const allowedCpcIds = new Set(optionIds(reviewPayload.cpc_options));
  const candidate = asRecord(reviewPayload.candidate_selection);

  if (!candidate || allowedTermIds.size === 0) {
    throw new Error(
      "The deterministic search-query review has no approved term options.",
    );
  }

  const usedTermIds = new Set<string>();
  const keywordGroups: Array<{ term_ids: string[] }> = [];

  for (const groupValue of Array.isArray(candidate.keyword_groups)
    ? candidate.keyword_groups
    : []) {
    const group = asRecord(groupValue);
    const selected: string[] = [];

    for (const id of stringIds(group?.term_ids)) {
      if (!allowedTermIds.has(id) || usedTermIds.has(id)) continue;
      usedTermIds.add(id);
      selected.push(id);
      if (selected.length >= MAX_QUERY_TERMS_PER_GROUP) break;
    }

    if (selected.length > 0) keywordGroups.push({ term_ids: selected });
    if (keywordGroups.length >= MAX_QUERY_KEYWORD_GROUPS) break;
  }

  if (keywordGroups.length === 0) {
    keywordGroups.push({ term_ids: [Array.from(allowedTermIds)[0]] });
  }

  const selectAllowedCodes = (
    value: unknown,
    allowed: Set<string>,
  ): string[] => stringIds(value).filter((id) => allowed.has(id));

  return {
    keyword_groups: keywordGroups,
    ipc_code_ids: selectAllowedCodes(
      candidate.ipc_code_ids,
      allowedIpcIds,
    ),
    cpc_code_ids: selectAllowedCodes(
      candidate.cpc_code_ids,
      allowedCpcIds,
    ),
  };
}

function localResponsesApiPayload(
  requestPayload: JsonRecord,
  selection: QueryReviewSelection,
): JsonRecord {
  const responseId = `resp_local_${crypto.randomUUID().replaceAll("-", "")}`;
  const messageId = `msg_local_${crypto.randomUUID().replaceAll("-", "")}`;
  const outputText = JSON.stringify(selection);

  return {
    id: responseId,
    object: "response",
    created_at: Math.floor(Date.now() / 1000),
    status: "completed",
    error: null,
    incomplete_details: null,
    instructions: null,
    max_output_tokens: null,
    model: requestModel(requestPayload),
    output: [
      {
        id: messageId,
        type: "message",
        status: "completed",
        role: "assistant",
        content: [
          {
            type: "output_text",
            annotations: [],
            logprobs: [],
            text: outputText,
          },
        ],
      },
    ],
    parallel_tool_calls: true,
    previous_response_id: null,
    reasoning: { effort: null, summary: null },
    store: false,
    temperature: 0,
    text: { format: { type: "text" } },
    tool_choice: "auto",
    tools: [],
    top_p: 1,
    truncation: "disabled",
    usage: {
      input_tokens: 0,
      input_tokens_details: { cached_tokens: 0 },
      output_tokens: 0,
      output_tokens_details: { reasoning_tokens: 0 },
      total_tokens: 0,
    },
  };
}

function localQueryReviewResponse(payload: JsonRecord): Response {
  const selection = buildLocalQueryReviewSelection(payload);
  return new Response(
    JSON.stringify(localResponsesApiPayload(payload, selection)),
    {
      status: 200,
      headers: { "Content-Type": "application/json; charset=utf-8" },
    },
  );
}

function requiredUsageLogConfig(): { url: string; serviceRoleKey: string } {
  const url = Deno.env.get("SUPABASE_URL")?.replace(/\/$/u, "");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!url || !serviceRoleKey) {
    throw new Error(
      "AI usage logging requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.",
    );
  }

  return { url, serviceRoleKey };
}

function usageLogHeaders(serviceRoleKey: string): HeadersInit {
  return {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    "Content-Type": "application/json",
    Prefer: "return=minimal",
  };
}

async function responseErrorText(response: Response): Promise<string> {
  const text = await response.text();
  return text.length > 500 ? `${text.slice(0, 500)}…` : text;
}

async function startAiUsageLog(
  requestPayload: JsonRecord,
): Promise<AiUsageLogContext> {
  const { url, serviceRoleKey } = requiredUsageLogConfig();
  const context: AiUsageLogContext = {
    callId: crypto.randomUUID(),
    stage: textFormatName(requestPayload) ?? "responses_api",
    responseFormat: textFormatName(requestPayload),
    model: requestModel(requestPayload),
    startedAt: new Date().toISOString(),
  };

  const response = await globalThis.fetch(
    `${url}/rest/v1/ai_request_usage_logs`,
    {
      method: "POST",
      headers: usageLogHeaders(serviceRoleKey),
      body: JSON.stringify({
        call_id: context.callId,
        stage: context.stage,
        response_format: context.responseFormat,
        model: context.model,
        status: "started",
        started_at: context.startedAt,
        updated_at: context.startedAt,
      }),
    },
  );

  if (!response.ok) {
    throw new Error(
      `AI usage log could not be created before the model request (HTTP ${response.status}): ${await responseErrorText(response)}`,
    );
  }

  return context;
}

function nonnegativeInteger(value: unknown): number {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? Math.trunc(number) : 0;
}

function apiErrorMessage(payload: JsonRecord | null): string | null {
  const error = asRecord(payload?.error);
  return typeof error?.message === "string" ? error.message : null;
}

async function finishAiUsageLog(
  context: AiUsageLogContext,
  status: "succeeded" | "failed",
  response: Response | null,
  payload: JsonRecord | null,
  thrownError: unknown = null,
): Promise<void> {
  const { url, serviceRoleKey } = requiredUsageLogConfig();
  const usage = asRecord(payload?.usage);
  const inputDetails = asRecord(usage?.input_tokens_details);
  const outputDetails = asRecord(usage?.output_tokens_details);
  const completedAt = new Date().toISOString();
  const errorMessage = thrownError instanceof Error
    ? thrownError.message
    : apiErrorMessage(payload);

  const updateResponse = await globalThis.fetch(
    `${url}/rest/v1/ai_request_usage_logs?call_id=eq.${encodeURIComponent(context.callId)}`,
    {
      method: "PATCH",
      headers: usageLogHeaders(serviceRoleKey),
      body: JSON.stringify({
        status,
        http_status: response?.status ?? null,
        openai_response_id:
          typeof payload?.id === "string" ? payload.id : null,
        input_tokens: nonnegativeInteger(usage?.input_tokens),
        cached_input_tokens: nonnegativeInteger(inputDetails?.cached_tokens),
        output_tokens: nonnegativeInteger(usage?.output_tokens),
        reasoning_tokens: nonnegativeInteger(outputDetails?.reasoning_tokens),
        total_tokens: nonnegativeInteger(usage?.total_tokens),
        error_message: errorMessage,
        completed_at: completedAt,
        updated_at: completedAt,
      }),
    },
  );

  if (!updateResponse.ok) {
    throw new Error(
      `AI usage log could not be finalized (HTTP ${updateResponse.status}): ${await responseErrorText(updateResponse)}`,
    );
  }
}

async function jsonPayload(response: Response): Promise<JsonRecord | null> {
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) return null;

  try {
    return asRecord(await response.clone().json());
  } catch {
    return null;
  }
}

export function createLanguageAwareFetch(
  upstreamFetch: FetchFunction,
): FetchFunction {
  return async (input, init) => {
    if (!isResponsesEndpoint(input)) {
      return await upstreamFetch(input, init);
    }

    let nextInput: RequestInfo | URL = input;
    let nextInit = init;
    let analysisRequest = false;
    let parsedRequest: JsonRecord | null = null;

    const rawBody = await requestBodyText(input, init);
    if (rawBody) {
      try {
        parsedRequest = asRecord(JSON.parse(rawBody));

        if (
          parsedRequest &&
          textFormatName(parsedRequest) === LOCAL_QUERY_REVIEW_FORMAT
        ) {
          // The second query-review operation is deterministic and local. It
          // never reaches OpenAI, never retransmits the patent text, and uses
          // only server-approved term/code IDs already present in the request.
          return localQueryReviewResponse(parsedRequest);
        }

        if (parsedRequest) {
          const rewritten = rewriteAnalysisRequestPayload(parsedRequest);
          analysisRequest = rewritten.analysisRequest;

          if (rewritten.changed) {
            [nextInput, nextInit] = withJsonBody(
              input,
              init,
              JSON.stringify(rewritten.payload),
            );
          }
        }
      } catch (error) {
        if (parsedRequest) throw error;
        // Preserve the SDK request unchanged when the body is not JSON.
      }
    }

    if (!parsedRequest) {
      throw new Error(
        "The OpenAI Responses request could not be logged because its JSON body was unavailable.",
      );
    }

    // The durable row is inserted before the external request. If logging is
    // unavailable, the model is not called, so every actual call has one row.
    const usageContext = await startAiUsageLog(parsedRequest);
    let response: Response;

    try {
      response = await upstreamFetch(nextInput, nextInit);
    } catch (error) {
      try {
        await finishAiUsageLog(
          usageContext,
          "failed",
          null,
          null,
          error,
        );
      } catch (logError) {
        console.error("AI usage log finalization failed:", logError);
      }
      throw error;
    }

    const payload = await jsonPayload(response);

    try {
      await finishAiUsageLog(
        usageContext,
        response.ok ? "succeeded" : "failed",
        response,
        payload,
      );
    } catch (logError) {
      // The pre-request row still guarantees one durable record for the call.
      console.error("AI usage log finalization failed:", logError);
    }

    if (!analysisRequest || !response.ok || !payload) return response;

    const rewrittenPayload = rewriteAnalysisResponsePayload(payload);
    return rewrittenPayload === payload
      ? response
      : jsonResponse(rewrittenPayload, response);
  };
}

export default class LanguageAwareOpenAI extends OpenAI {
  constructor(options: OpenAIOptions) {
    const upstreamFetch = options?.fetch ?? globalThis.fetch;
    super({
      ...options,
      // The official SDK retries selected network, 408, 409, 429, and 5xx
      // failures twice by default. Token-control requirements call for zero
      // automatic model retries; the user can intentionally submit again.
      maxRetries: 0,
      fetch: createLanguageAwareFetch(upstreamFetch),
    });
  }
}
