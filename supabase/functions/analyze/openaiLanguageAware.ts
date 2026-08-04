import OpenAI from "npm:openai@5";
import {
  rewriteAnalysisRequestPayload,
  rewriteAnalysisResponsePayload,
} from "./openaiLanguageTransform.ts";

export * from "npm:openai@5";

type FetchFunction = typeof globalThis.fetch;
type OpenAIOptions = ConstructorParameters<typeof OpenAI>[0];

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

    const rawBody = await requestBodyText(input, init);
    if (rawBody) {
      try {
        const parsedBody = JSON.parse(rawBody) as unknown;
        const rewritten = rewriteAnalysisRequestPayload(parsedBody);
        analysisRequest = rewritten.analysisRequest;

        if (rewritten.changed) {
          [nextInput, nextInit] = withJsonBody(
            input,
            init,
            JSON.stringify(rewritten.payload),
          );
        }
      } catch {
        // Preserve the SDK request unchanged when the body is not JSON.
      }
    }

    const response = await upstreamFetch(nextInput, nextInit);
    if (!analysisRequest || !response.ok) return response;

    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.toLowerCase().includes("application/json")) return response;

    try {
      const payload = await response.clone().json();
      const rewrittenPayload = rewriteAnalysisResponsePayload(payload);
      return rewrittenPayload === payload
        ? response
        : jsonResponse(rewrittenPayload, response);
    } catch {
      return response;
    }
  };
}

export default class LanguageAwareOpenAI extends OpenAI {
  constructor(options: OpenAIOptions) {
    const upstreamFetch = options?.fetch ?? globalThis.fetch;
    super({
      ...options,
      fetch: createLanguageAwareFetch(upstreamFetch),
    });
  }
}
