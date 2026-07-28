from pathlib import Path
import re

path = Path("supabase/functions/analyze/index.ts")
text = path.read_text(encoding="utf-8")


def replace_once(old: str, new: str, label: str) -> None:
    global text
    if new in text:
        return
    if old not in text:
        raise SystemExit(f"{label} anchor not found")
    text = text.replace(old, new, 1)


replace_once(
    """interface ClassificationLookupContext {
  searchTerms: string[];
  rankingTerms: string[];
  contextAnchorTokens: string[];
}""",
    """interface ClassificationLookupContext {
  searchTerms: string[];
  rankingTerms: string[];
  contextAnchorTokens: string[];
  keywordLexicalTerms: string[];
}""",
    "ClassificationLookupContext",
)

old_context = """function classificationContextAnchorTokens(
  keyword: KeywordClassification,
  technicalConcept: TechnicalInterpretation,
  neighboringTerms: string[],
): string[] {
  const sourceKeywordTokens = new Set(technicalTokens(keyword.term));
  const contextValues = [
    keyword.normalized_term,
    technicalConcept.object_or_system,
    technicalConcept.application_or_use,
    ...technicalConcept.components,
    ...keyword.concept_basis,
    ...technicalConcept.context_terms,
    ...neighboringTerms,
  ];

  return Array.from(
    new Set(contextValues.flatMap((value) => technicalTokens(value))),
  ).filter(
    (token) =>
      !sourceKeywordTokens.has(token) &&
      !GENERIC_CLASSIFICATION_CONTEXT_TOKENS.has(token) &&
      !/^\\d+$/u.test(token),
  );
}"""
new_context = """function classificationTokenFamilyKey(token: string): string {
  const normalized = token.normalize(\"NFKC\").trim().toLowerCase();

  if (!/^[a-z][a-z0-9-]*$/u.test(normalized) || normalized.length <= 3) {
    return normalized;
  }

  if (normalized.endsWith(\"ies\") && normalized.length > 4) {
    return `${normalized.slice(0, -3)}y`;
  }

  if (
    (normalized.endsWith(\"sses\") ||
      normalized.endsWith(\"ches\") ||
      normalized.endsWith(\"shes\") ||
      normalized.endsWith(\"xes\") ||
      normalized.endsWith(\"zes\")) &&
    normalized.length > 4
  ) {
    return normalized.slice(0, -2);
  }

  if (normalized.endsWith(\"s\") && !normalized.endsWith(\"ss\")) {
    return normalized.slice(0, -1);
  }

  return normalized;
}

function keywordIdentityTokenKeys(keyword: KeywordClassification): Set<string> {
  const keys = new Set<string>();
  const addTokens = (tokens: string[]) => {
    for (const token of tokens) {
      const key = classificationTokenFamilyKey(token);
      if (key) keys.add(key);
    }
  };

  addTokens(technicalTokens(keyword.term));
  addTokens(technicalTokens(keyword.normalized_term));

  for (const synonym of keyword.synonyms) {
    const tokens = technicalTokens(synonym);
    if (tokens.length === 0) continue;

    const latinTokens = tokens.filter((token) =>
      /^[a-z][a-z0-9-]*$/u.test(token),
    );

    if (latinTokens.length > 0) {
      // The head noun is part of the keyword identity. Domain modifiers such as
      // \"elevator\" and \"lift\" remain eligible as independent context.
      addTokens([latinTokens[latinTokens.length - 1]]);
    } else if (tokens.length === 1) {
      addTokens(tokens);
    }
  }

  return keys;
}

function classificationContextAnchorTokens(
  keyword: KeywordClassification,
  technicalConcept: TechnicalInterpretation,
  neighboringTerms: string[],
): string[] {
  const keywordIdentityKeys = keywordIdentityTokenKeys(keyword);
  const contextValues = [
    keyword.normalized_term,
    technicalConcept.object_or_system,
    technicalConcept.application_or_use,
    ...technicalConcept.components,
    ...keyword.concept_basis,
    ...technicalConcept.context_terms,
    ...neighboringTerms,
  ];

  return Array.from(
    new Set(contextValues.flatMap((value) => technicalTokens(value))),
  ).filter((token) => {
    const tokenKey = classificationTokenFamilyKey(token);
    return (
      Boolean(tokenKey) &&
      !keywordIdentityKeys.has(tokenKey) &&
      !GENERIC_CLASSIFICATION_CONTEXT_TOKENS.has(token) &&
      !/^\\d+$/u.test(token)
    );
  });
}"""
replace_once(old_context, new_context, "classificationContextAnchorTokens")

candidate_gate = """function candidatePassesContextGate(
  candidate: ClassificationCandidate,
  contextAnchorTokens: string[],
  searchTerms: string[],
): boolean {
  if (contextAnchorTokens.length === 0) {
    return hasStrongMultiwordSearchSupport(candidate, searchTerms);
  }

  return candidateContextAnchorHits(candidate, contextAnchorTokens).length > 0;
}
"""
lexical_helper = """
function hasKeywordLexicalSupport(
  candidate: ClassificationCandidate,
  keywordLexicalTerms: string[],
): boolean {
  const title = candidateTitle(candidate);

  return keywordLexicalTerms.some((term) => {
    const normalizedTerm = term.normalize(\"NFKC\").trim().toLowerCase();
    if (normalizedTerm && title.includes(normalizedTerm)) return true;

    const tokens = technicalTokens(term).filter(
      (token) => !GENERIC_CLASSIFICATION_CONTEXT_TOKENS.has(token),
    );
    if (tokens.length === 0) return false;

    const tokenHits = tokens.filter((token) => title.includes(token)).length;
    const coverage = tokenHits / tokens.length;
    return tokens.length === 1 ? coverage === 1 : coverage >= 0.67;
  });
}
"""
if "function hasKeywordLexicalSupport(" not in text:
    if candidate_gate not in text:
        raise SystemExit("candidatePassesContextGate anchor not found")
    text = text.replace(candidate_gate, candidate_gate + lexical_helper, 1)

replace_once(
    """async function searchClassificationCandidates(
  adminClient: SupabaseClient,
  searchTerms: string[],
  system: CatalogClassificationSystem,
  contextTerms: string[],
  contextAnchorTokens: string[],
): Promise<ClassificationCandidate[]> {""",
    """async function searchClassificationCandidates(
  adminClient: SupabaseClient,
  searchTerms: string[],
  system: CatalogClassificationSystem,
  contextTerms: string[],
  contextAnchorTokens: string[],
  keywordLexicalTerms: string[],
): Promise<ClassificationCandidate[]> {""",
    "searchClassificationCandidates signature",
)

if "hasKeywordLexicalSupport(candidate, keywordLexicalTerms)" not in text:
    pattern = re.compile(
        r"(\.filter\(\n\s*\(candidate\) =>\n\s*\(candidate\.match_score \?\? 0\) >= 0\.38 &&\n)(\s*candidatePassesContextGate\()"
    )
    text, count = pattern.subn(
        r"\1        hasKeywordLexicalSupport(candidate, keywordLexicalTerms) &&\n\2",
        text,
        count=1,
    )
    if count != 1:
        raise SystemExit("candidate filter anchor not found")

old_build = """  const contextualizedKeywordTerms = [
    `${interpretation.object_or_system} ${keyword.normalized_term}`,
    `${interpretation.object_or_system} ${keyword.term}`,
    `${interpretation.application_or_use} ${keyword.normalized_term}`,
  ];

  const searchTerms = Array.from(
    new Set(
      [
        keyword.normalized_term,
        keyword.term,
        ...keyword.synonyms,
        ...contextualizedKeywordTerms,
      ]"""
new_build = """  const keywordLexicalTerms = Array.from(
    new Set(
      [keyword.normalized_term, keyword.term, ...keyword.synonyms]
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  ).slice(0, 8);
  const contextualizedKeywordTerms = [
    `${interpretation.object_or_system} ${keyword.normalized_term}`,
    `${interpretation.object_or_system} ${keyword.term}`,
    `${interpretation.application_or_use} ${keyword.normalized_term}`,
  ];

  const searchTerms = Array.from(
    new Set(
      [
        ...keywordLexicalTerms,
        ...contextualizedKeywordTerms,
      ]"""
replace_once(old_build, new_build, "keyword lexical term construction")

replace_once(
    "  return { searchTerms, rankingTerms, contextAnchorTokens };",
    """  return {
    searchTerms,
    rankingTerms,
    contextAnchorTokens,
    keywordLexicalTerms,
  };""",
    "ClassificationLookupContext return",
)

old_destructure = """        const {
          searchTerms,
          rankingTerms,
          contextAnchorTokens,
        } = buildClassificationLookupContext("""
new_destructure = """        const {
          searchTerms,
          rankingTerms,
          contextAnchorTokens,
          keywordLexicalTerms,
        } = buildClassificationLookupContext("""
replace_once(old_destructure, new_destructure, "lookup context destructuring")

for system in ("IPC", "CPC", "FI"):
    pattern = re.compile(
        rf'(\"{system}\",\n\s*rankingTerms,\n\s*contextAnchorTokens,)(\n\s*\))'
    )
    replacement = rf'\1\n            keywordLexicalTerms,\2'
    if re.search(rf'\"{system}\",\n\s*rankingTerms,\n\s*contextAnchorTokens,\n\s*keywordLexicalTerms,', text):
        continue
    text, count = pattern.subn(replacement, text, count=1)
    if count != 1:
        raise SystemExit(f"{system} call-site anchor not found")

old_reason = (
    "Classification candidates were retrieved from Supabase, required both lexical support "
    "and an independent document-level technical-context anchor, and were ranked against the "
    "complete technical interpretation. No model-generated classification code was accepted."
)
new_reason = (
    "Classification candidates were retrieved from Supabase, required lexical keyword support "
    "plus an independent document-level technical-context anchor, and excluded singular/plural "
    "or synonym head-noun variants from satisfying that independent context gate. No model-generated "
    "classification code was accepted."
)
text = text.replace(old_reason, new_reason)

path.write_text(text, encoding="utf-8")
