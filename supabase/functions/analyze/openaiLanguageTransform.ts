import {
  filterSynonymsByLanguage,
  type SynonymLanguage,
} from "./synonymLanguage.ts";

const ANALYSIS_PROMPT_MARKER =
  "You are a multilingual patent analyst for English and Japanese technical documents.";
const CROSS_LANGUAGE_PROMPT_FRAGMENT = "English/Japanese equivalents, or ";
const LANGUAGE_RULE =
  "- The synonyms array must use only the detected dominant input language: Japanese synonyms for language=ja and English synonyms for language=en. Do not include translations or cross-language equivalents. For Japanese output, established Latin-script technical acronyms such as AI, EV, IoT, 5G, and LiDAR are allowed.";

interface InputTextContent {
  type?: unknown;
  text?: unknown;
  [key: string]: unknown;
}

interface InputMessage {
  content?: unknown;
  [key: string]: unknown;
}

export interface RequestRewriteResult {
  payload: unknown;
  analysisRequest: boolean;
  changed: boolean;
}

export function rewriteAnalysisRequestPayload(
  payload: unknown,
): RequestRewriteResult {
  if (!payload || typeof payload !== "object") {
    return { payload, analysisRequest: false, changed: false };
  }

  const record = payload as Record<string, unknown>;
  if (!Array.isArray(record.input)) {
    return { payload, analysisRequest: false, changed: false };
  }

  let analysisRequest = false;
  let changed = false;

  const rewrittenInput = record.input.map((rawMessage) => {
    if (!rawMessage || typeof rawMessage !== "object") return rawMessage;

    const message = rawMessage as InputMessage;
    if (!Array.isArray(message.content)) return rawMessage;

    const rewrittenContent = message.content.map((rawContent) => {
      if (!rawContent || typeof rawContent !== "object") return rawContent;

      const content = rawContent as InputTextContent;
      if (content.type !== "input_text" || typeof content.text !== "string") {
        return rawContent;
      }

      if (!content.text.includes(ANALYSIS_PROMPT_MARKER)) return rawContent;

      analysisRequest = true;
      let text = content.text.replace(CROSS_LANGUAGE_PROMPT_FRAGMENT, "");

      if (!text.includes(LANGUAGE_RULE)) {
        text = `${text}\n${LANGUAGE_RULE}`;
      }

      if (text === content.text) return rawContent;
      changed = true;
      return { ...content, text };
    });

    return { ...message, content: rewrittenContent };
  });

  return {
    payload: changed ? { ...record, input: rewrittenInput } : payload,
    analysisRequest,
    changed,
  };
}

function normalizeAnalysisObject(value: unknown): unknown {
  if (!value || typeof value !== "object") return value;

  const result = value as Record<string, unknown>;
  const language: SynonymLanguage | null =
    result.language === "ja" ? "ja" : result.language === "en" ? "en" : null;

  if (!language || !Array.isArray(result.keywords)) return value;

  const keywords = result.keywords.map((rawKeyword) => {
    if (!rawKeyword || typeof rawKeyword !== "object") return rawKeyword;

    const keyword = rawKeyword as Record<string, unknown>;
    return {
      ...keyword,
      synonyms: filterSynonymsByLanguage(keyword.synonyms, language, 8),
    };
  });

  return { ...result, keywords };
}

export function transformAnalysisOutputText(text: string): string {
  try {
    const parsed = JSON.parse(text) as unknown;
    return JSON.stringify(normalizeAnalysisObject(parsed));
  } catch {
    return text;
  }
}

export function rewriteAnalysisResponsePayload(payload: unknown): unknown {
  if (!payload || typeof payload !== "object") return payload;

  const record = payload as Record<string, unknown>;
  let changed = false;

  const output = Array.isArray(record.output)
    ? record.output.map((rawItem) => {
        if (!rawItem || typeof rawItem !== "object") return rawItem;

        const item = rawItem as Record<string, unknown>;
        if (!Array.isArray(item.content)) return rawItem;

        const content = item.content.map((rawContent) => {
          if (!rawContent || typeof rawContent !== "object") return rawContent;

          const contentItem = rawContent as Record<string, unknown>;
          if (
            contentItem.type !== "output_text" ||
            typeof contentItem.text !== "string"
          ) {
            return rawContent;
          }

          const text = transformAnalysisOutputText(contentItem.text);
          if (text === contentItem.text) return rawContent;

          changed = true;
          return { ...contentItem, text };
        });

        return { ...item, content };
      })
    : record.output;

  let outputText = record.output_text;
  if (typeof outputText === "string") {
    const transformedOutputText = transformAnalysisOutputText(outputText);
    if (transformedOutputText !== outputText) {
      outputText = transformedOutputText;
      changed = true;
    }
  }

  return changed ? { ...record, output, output_text: outputText } : payload;
}
