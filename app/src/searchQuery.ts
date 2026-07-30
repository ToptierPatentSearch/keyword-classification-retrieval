import type {
  AnalysisResult,
  ClassificationCodeEvidence,
  KeywordClassification,
} from "./types";

const MAX_KEYWORD_GROUPS = 5;
const MAX_TERMS_PER_GROUP = 3;

export const SEARCH_QUERY_REVIEW_NOTICE =
  "Starting point for professional review. Patent-database field syntax varies; refine the query, verify the current classification scope, and validate the results in the selected official patent database.";

export type GeneratedSearchQueryStarter = {
  keywordQuery: string;
  classificationQuery: string;
};

function cleanQueryValue(value: string | null | undefined): string {
  return (value ?? "")
    .replace(/["“”]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function uniqueValues(values: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const unique: string[] = [];

  for (const value of values) {
    const cleanedValue = cleanQueryValue(value);
    const comparisonValue = cleanedValue.toLocaleLowerCase();

    if (!cleanedValue || seen.has(comparisonValue)) {
      continue;
    }

    seen.add(comparisonValue);
    unique.push(cleanedValue);
  }

  return unique;
}

function buildKeywordGroup(keyword: KeywordClassification): string {
  const terms = uniqueValues([
    keyword.normalized_term,
    keyword.term,
    ...(Array.isArray(keyword.synonyms) ? keyword.synonyms : []),
  ]).slice(0, MAX_TERMS_PER_GROUP);

  if (terms.length === 0) {
    return "";
  }

  return `(${terms.map((term) => `"${term}"`).join(" OR ")})`;
}

function addVerifiedEvidence(
  target: Set<string>,
  evidence: ClassificationCodeEvidence[] | undefined,
): void {
  for (const item of Array.isArray(evidence) ? evidence : []) {
    if (item.status !== "database_verified") {
      continue;
    }

    const code = cleanQueryValue(item.code);

    if (code) {
      target.add(code);
    }
  }
}

function buildClassificationQuery(result: AnalysisResult): string {
  const ipcCodes = new Set<string>();
  const cpcCodes = new Set<string>();

  for (const keyword of Array.isArray(result.keywords)
    ? result.keywords
    : []) {
    for (const area of keyword.classification_route?.ipc_cpc_area ?? []) {
      const code = cleanQueryValue(area.code);

      if (!code || area.status !== "database_verified") {
        continue;
      }

      if (area.system === "IPC") {
        ipcCodes.add(code);
      } else if (area.system === "CPC") {
        cpcCodes.add(code);
      }
    }

    addVerifiedEvidence(ipcCodes, keyword.ipc_evidence);
    addVerifiedEvidence(cpcCodes, keyword.cpc_evidence);
  }

  const queryParts: string[] = [];

  if (ipcCodes.size > 0) {
    queryParts.push(
      `IPC=(${Array.from(ipcCodes)
        .sort((a, b) => a.localeCompare(b))
        .join(" OR ")})`,
    );
  }

  if (cpcCodes.size > 0) {
    queryParts.push(
      `CPC=(${Array.from(cpcCodes)
        .sort((a, b) => a.localeCompare(b))
        .join(" OR ")})`,
    );
  }

  return queryParts.join(" OR ");
}

export function buildSearchQueryStarter(
  result: AnalysisResult,
): GeneratedSearchQueryStarter {
  const keywordGroups = (Array.isArray(result.keywords)
    ? result.keywords
    : []
  )
    .slice()
    .sort((a, b) => a.rank - b.rank)
    .slice(0, MAX_KEYWORD_GROUPS)
    .map(buildKeywordGroup)
    .filter(Boolean);

  return {
    keywordQuery: keywordGroups.join(" AND "),
    classificationQuery: buildClassificationQuery(result),
  };
}
