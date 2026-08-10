import { createLanguageAwareFetch } from "./openaiLanguageAware.ts";

function assertEquals(actual: unknown, expected: unknown, message: string): void {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  if (actualJson !== expectedJson) {
    throw new Error(`${message}: ${actualJson} !== ${expectedJson}`);
  }
}

Deno.test("query review is completed locally without an external AI call", async () => {
  let upstreamCalls = 0;
  const upstreamFetch: typeof globalThis.fetch = async () => {
    upstreamCalls += 1;
    throw new Error("The deterministic query review must not reach OpenAI.");
  };
  const wrappedFetch = createLanguageAwareFetch(upstreamFetch);
  const response = await wrappedFetch(
    "https://api.openai.com/v1/responses",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-5.6-luna",
        input: [
          {
            role: "system",
            content: [{ type: "input_text", text: "Review supplied IDs." }],
          },
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text: JSON.stringify({
                  term_options: [
                    { id: "T001", term: "optical sensor" },
                    { id: "T002", term: "photodetector" },
                  ],
                  ipc_options: [],
                  cpc_options: [{ id: "C001", code: "G01J 1/00" }],
                  candidate_selection: {
                    keyword_groups: [
                      { term_ids: ["T001", "T002", "T999"] },
                    ],
                    ipc_code_ids: [],
                    cpc_code_ids: ["C001", "C999"],
                  },
                }),
              },
            ],
          },
        ],
        text: {
          format: {
            type: "json_schema",
            name: "patent_search_query_id_review",
            schema: {},
            strict: true,
          },
        },
      }),
    },
  );

  if (!response.ok) throw new Error(`Local response failed: ${response.status}`);
  const payload = await response.json() as Record<string, unknown>;
  const output = payload.output as Array<Record<string, unknown>>;
  const content = output[0].content as Array<Record<string, unknown>>;
  const selection = JSON.parse(content[0].text as string);

  assertEquals(upstreamCalls, 0, "External OpenAI call count");
  assertEquals(
    selection,
    {
      keyword_groups: [{ term_ids: ["T001", "T002"] }],
      ipc_code_ids: [],
      cpc_code_ids: ["C001"],
    },
    "Deterministic query selection",
  );
  assertEquals(
    (payload.usage as Record<string, unknown>).total_tokens,
    0,
    "Local query-review token usage",
  );
});
