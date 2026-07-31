import type {
  AnalysisResult,
  ClassificationCodeEvidence,
  KeywordClassification,
} from "./types";
import {
  buildGooglePatentsCpcQuery,
  normalizeGooglePatentsClassificationQuery,
} from "./googlePatentsQuery";

const MAX_KEYWORD_GROUPS = 5;
const MAX_TERMS_PER_GROUP = 3;

export const SEARCH_QUERY_REVIEW_NOTICE =
  "Formatted for Google Patents Advanced Search. Treat this as a starting point: refine the query, verify the current CPC scope, and validate the retrieved results before relying on them.";

export type GeneratedSearchQueryStarter = {
  keywordQuery: string;
  classificationQuery: string;
  reviewStatus: "accepted" | "corrected" | "demo" | "unreviewed";
  reviewSummary: string;
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
  const cpcCodes = new Set<string>();

  for (const keyword of Array.isArray(result.keywords)
    ? result.keywords
    : []) {
    for (const area of keyword.classification_route?.ipc_cpc_area ?? []) {
      const code = cleanQueryValue(area.code);

      if (!code || area.status !== "database_verified") {
        continue;
      }

      if (area.system === "CPC") {
        cpcCodes.add(code);
      }
    }

    addVerifiedEvidence(cpcCodes, keyword.cpc_evidence);
  }

  return buildGooglePatentsCpcQuery(Array.from(cpcCodes));
}

export function buildSearchQueryStarter(
  result: AnalysisResult,
): GeneratedSearchQueryStarter {
  if (
    result.search_query_starter &&
    (result.search_query_starter.reviewStatus === "accepted" ||
      result.search_query_starter.reviewStatus === "corrected")
  ) {
    return {
      keywordQuery: result.search_query_starter.keywordQuery,
      classificationQuery:
        normalizeGooglePatentsClassificationQuery(
          result.search_query_starter.classificationQuery,
        ),
      reviewStatus: result.search_query_starter.reviewStatus,
      reviewSummary: result.search_query_starter.reviewSummary,
    };
  }

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
    reviewStatus: "unreviewed",
    reviewSummary:
      "AI review was not included in this analysis result. Verify and refine the query before use.",
  };
}
