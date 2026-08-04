export type SynonymLanguage = "en" | "ja";

const JAPANESE_SCRIPT_PATTERN =
  /[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]/u;
const LATIN_LETTER_PATTERN = /[A-Za-z]/u;
const TECHNICAL_ACRONYM_PATTERN =
  /^(?=.{2,16}$)(?=(?:.*[A-Z0-9]){2})[A-Za-z0-9]+(?:[+./-][A-Za-z0-9]+)*$/u;

export function synonymMatchesLanguage(
  value: string,
  language: SynonymLanguage,
): boolean {
  const normalized = value.normalize("NFKC").trim();
  if (!normalized) return false;

  const containsJapaneseScript = JAPANESE_SCRIPT_PATTERN.test(normalized);

  if (language === "ja") {
    return containsJapaneseScript || TECHNICAL_ACRONYM_PATTERN.test(normalized);
  }

  return !containsJapaneseScript && LATIN_LETTER_PATTERN.test(normalized);
}

export function filterSynonymsByLanguage(
  values: unknown,
  language: SynonymLanguage,
  limit = 8,
): string[] {
  if (!Array.isArray(values)) return [];

  const filtered: string[] = [];
  const seen = new Set<string>();

  for (const value of values) {
    if (typeof value !== "string") continue;

    const normalized = value.normalize("NFKC").replace(/\s+/gu, " ").trim();
    const comparisonKey = normalized.toLowerCase();

    if (
      !synonymMatchesLanguage(normalized, language) ||
      seen.has(comparisonKey)
    ) {
      continue;
    }

    seen.add(comparisonKey);
    filtered.push(normalized);

    if (filtered.length >= limit) break;
  }

  return filtered;
}
