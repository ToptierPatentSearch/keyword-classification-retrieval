import {
  rewriteAnalysisRequestPayload,
  rewriteAnalysisResponsePayload,
  transformAnalysisOutputText,
} from "./openaiLanguageTransform.ts";
import { filterSynonymsByLanguage } from "./synonymLanguage.ts";

function assertEquals(actual: unknown, expected: unknown, message: string): void {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  if (actualJson !== expectedJson) {
    throw new Error(`${message}: ${actualJson} !== ${expectedJson}`);
  }
}

Deno.test("Japanese synonyms exclude English translations", () => {
  assertEquals(
    filterSynonymsByLanguage(
      ["昇降機", "乗りかご", "elevator", "elevator car", "AI", "LiDAR"],
      "ja",
    ),
    ["昇降機", "乗りかご", "AI", "LiDAR"],
    "Japanese filtering",
  );
});

Deno.test("English synonyms exclude Japanese translations", () => {
  assertEquals(
    filterSynonymsByLanguage(
      ["elevator", "elevator car", "昇降機", "乗りかご", "EV"],
      "en",
    ),
    ["elevator", "elevator car", "EV"],
    "English filtering",
  );
});

Deno.test("analysis prompt removes cross-language equivalents", () => {
  const original = {
    input: [
      {
        role: "system",
        content: [
          {
            type: "input_text",
            text:
              "You are a multilingual patent analyst for English and Japanese technical documents.\n- Return English/Japanese equivalents, or established variants.",
          },
        ],
      },
    ],
  };
  const rewritten = rewriteAnalysisRequestPayload(original);
  const serialized = JSON.stringify(rewritten.payload);

  if (!rewritten.analysisRequest || !rewritten.changed) {
    throw new Error("Analysis prompt was not detected and rewritten.");
  }
  if (serialized.includes("English/Japanese equivalents")) {
    throw new Error("Cross-language prompt fragment remains.");
  }
  if (!serialized.includes("only the detected dominant input language")) {
    throw new Error("Same-language rule was not added.");
  }
});

Deno.test("structured output is filtered by detected language", () => {
  const output = transformAnalysisOutputText(
    JSON.stringify({
      language: "ja",
      keywords: [
        {
          term: "昇降機",
          normalized_term: "elevator",
          synonyms: ["エレベーター", "lift", "AI"],
        },
      ],
    }),
  );

  const parsed = JSON.parse(output);
  assertEquals(
    parsed.keywords[0].synonyms,
    ["エレベーター", "AI"],
    "Structured response filtering",
  );
});

Deno.test("OpenAI response envelope output text is rewritten", () => {
  const inner = JSON.stringify({
    language: "en",
    keywords: [{ synonyms: ["sensor", "センサ", "detector"] }],
  });
  const transformed = rewriteAnalysisResponsePayload({
    output: [
      {
        type: "message",
        content: [{ type: "output_text", text: inner }],
      },
    ],
  }) as Record<string, unknown>;
  const content = (
    (transformed.output as Array<Record<string, unknown>>)[0]
      .content as Array<Record<string, unknown>>
  )[0];
  const parsed = JSON.parse(content.text as string);
  assertEquals(
    parsed.keywords[0].synonyms,
    ["sensor", "detector"],
    "Envelope filtering",
  );
});
