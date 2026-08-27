import type {
  AnalysisResult,
  ClassificationCodeEvidence,
  ClassificationSystem,
  KeywordClassification,
} from "./types";
import {
  buildGooglePatentsCpcQuery,
  normalizeGooglePatentsClassificationQuery,
} from "./googlePatentsQuery";

const MAX_KEYWORD_GROUPS = 5;
const MAX_TERMS_PER_GROUP = 3;
const BROAD_GROUPS = 2;
const BALANCED_GROUPS = 3;
const PRECISION_GROUPS = MAX_KEYWORD_GROUPS;

export const SEARCH_QUERY_REVIEW_NOTICE =
  "These database-specific queries are search starting points. Verify the current syntax and classification scope in the target system, review the retrieved results, and refine the strategy before relying on it.";

export type SearchDatabaseId =
  | "google_patents"
  | "patentscope"
  | "uspto"
  | "j_platpat";

export type SearchStrategyId = "query1" | "query2" | "query3";

export type GeneratedSearchStrategy = {
  id: SearchStrategyId;
  label: string;
  purpose: string;
  query: string;
  classificationFilters: string[];
  recommended: boolean;
  copyText: string;
};

export type GeneratedSearchDatabase = {
  id: SearchDatabaseId;
  label: string;
  syntaxLabel: string;
  note: string;
  strategies: GeneratedSearchStrategy[];
};

export type GeneratedSearchQueryStarter = {
  // Legacy fields are retained so existing demo data and downstream callers
  // remain compatible while the UI migrates to the multi-database structure.
  keywordQuery: string;
  classificationQuery: string;
  reviewStatus: "accepted" | "corrected" | "demo" | "unreviewed";
  reviewSummary: string;
  databases?: GeneratedSearchDatabase[];
};

type VerifiedClassificationCodes = Record<ClassificationSystem, string[]>;

function cleanQueryValue(value: string | null | undefined): string {
  return (value ?? "")
    .replace(/["“”]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanClassificationCode(value: string | null | undefined): string {
  return (value ?? "").normalize("NFKC").replace(/\s+/g, " ").trim();
}

function compactClassificationCode(value: string): string {
  return value
    .normalize("NFKC")
    .toUpperCase()
    .replace(/[^A-Z0-9/]/g, "");
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

function buildKeywordGroups(result: AnalysisResult): string[] {
  return (Array.isArray(result.keywords) ? result.keywords : [])
    .slice()
    .sort((a, b) => a.rank - b.rank)
    .slice(0, MAX_KEYWORD_GROUPS)
    .map(buildKeywordGroup)
    .filter(Boolean);
}

function joinKeywordGroups(groups: string[], count: number): string {
  return groups.slice(0, Math.max(1, count)).join(" AND ");
}

function addVerifiedEvidence(
  target: Set<string>,
  evidence: ClassificationCodeEvidence[] | undefined,
): void {
  for (const item of Array.isArray(evidence) ? evidence : []) {
    if (item.status !== "database_verified") {
      continue;
    }

    const code = cleanClassificationCode(item.code);

    if (code) {
      target.add(code);
    }
  }
}

function collectVerifiedClassificationCodes(
  result: AnalysisResult,
): VerifiedClassificationCodes {
  const collected: Record<ClassificationSystem, Set<string>> = {
    IPC: new Set<string>(),
    CPC: new Set<string>(),
    FI: new Set<string>(),
    "F-term": new Set<string>(),
  };

  for (const keyword of Array.isArray(result.keywords) ? result.keywords : []) {
    for (const area of keyword.classification_route?.ipc_cpc_area ?? []) {
      if (area.status !== "database_verified") {
        continue;
      }

      const code = cleanClassificationCode(area.code);
      if (code) {
        collected[area.system].add(code);
      }
    }

    for (const subdivision of keyword.classification_route?.fi_subdivisions ?? []) {
      if (subdivision.fi.status === "database_verified") {
        const fiCode = cleanClassificationCode(subdivision.fi.code);
        if (fiCode) {
          collected.FI.add(fiCode);
        }
      }

      for (const theme of subdivision.f_term_themes ?? []) {
        for (const aspect of theme.aspects ?? []) {
          if (aspect.status !== "database_verified") {
            continue;
          }

          const fTermCode = cleanClassificationCode(aspect.code);
          if (fTermCode) {
            collected["F-term"].add(fTermCode);
          }
        }
      }
    }

    addVerifiedEvidence(collected.IPC, keyword.ipc_evidence);
    addVerifiedEvidence(collected.CPC, keyword.cpc_evidence);
    addVerifiedEvidence(collected.FI, keyword.fi_evidence);
    addVerifiedEvidence(collected["F-term"], keyword.f_term_evidence);
  }

  return {
    IPC: Array.from(collected.IPC).sort((a, b) => a.localeCompare(b)),
    CPC: Array.from(collected.CPC).sort((a, b) => a.localeCompare(b)),
    FI: Array.from(collected.FI).sort((a, b) => a.localeCompare(b)),
    "F-term": Array.from(collected["F-term"]).sort((a, b) => a.localeCompare(b)),
  };
}

function combineWithAnd(...parts: string[]): string {
  return parts.filter(Boolean).join(" AND ");
}

function buildPatentscopeClassificationQuery(codes: VerifiedClassificationCodes): string {
  if (codes.CPC.length > 0) {
    return `CPC:(${codes.CPC.join(" OR ")})`;
  }

  if (codes.IPC.length > 0) {
    return `IC:(${codes.IPC.join(" OR ")})`;
  }

  return "";
}

function buildUsptoCpcQuery(cpcCodes: string[]): string {
  const compactCodes = Array.from(
    new Set(cpcCodes.map(compactClassificationCode).filter(Boolean)),
  ).sort((a, b) => a.localeCompare(b));

  if (compactCodes.length === 0) {
    return "";
  }

  if (compactCodes.length === 1) {
    return `${compactCodes[0]}.cpc.`;
  }

  return `(${compactCodes.map((code) => `${code}.cpc.`).join(" OR ")})`;
}

function makeStrategy(
  id: SearchStrategyId,
  label: string,
  purpose: string,
  query: string,
  classificationFilters: string[] = [],
  recommended = false,
): GeneratedSearchStrategy {
  const filterText = classificationFilters.length
    ? `\n${classificationFilters.join("\n")}`
    : "";

  return {
    id,
    label,
    purpose,
    query,
    classificationFilters,
    recommended,
    copyText: `${query}${filterText}`.trim(),
  };
}

function joinPrecisionKeywordGroups(groups: string[]): string {
  const selectedGroups = groups.slice(0, PRECISION_GROUPS);

  if (selectedGroups.length > BALANCED_GROUPS) {
    return selectedGroups.join(" AND ");
  }

  return selectedGroups
    .map((group) => {
      const trimmed = group.trim();
      const inner =
        trimmed.startsWith("(") && trimmed.endsWith(")")
          ? trimmed.slice(1, -1)
          : trimmed;

      const firstTerm = inner.split(/\s+OR\s+/i)[0]?.trim() ?? "";
      return firstTerm ? `(${firstTerm})` : "";
    })
    .filter(Boolean)
    .join(" AND ");
}

function getBroadGroupCount(groups: string[]): number {
  if (groups.length <= 1) return 1;
  return Math.min(BROAD_GROUPS, groups.length - 1);
}

function buildGooglePatentsDatabase(
  groups: string[],
  codes: VerifiedClassificationCodes,
  balancedKeywordQuery: string,
): GeneratedSearchDatabase {
  const broad = joinKeywordGroups(groups, getBroadGroupCount(groups));
  const balanced = groups.length > 0
    ? joinKeywordGroups(groups, BALANCED_GROUPS)
    : balancedKeywordQuery;
  const precision = joinPrecisionKeywordGroups(groups);
  const cpc = buildGooglePatentsCpcQuery(codes.CPC);

  return {
    id: "google_patents",
    label: "Google Patents",
    syntaxLabel: "Google Patents Advanced Search",
    note: "Uses Boolean keyword groups plus database-verified CPC codes when available.",
    strategies: [
      makeStrategy(
        "query1",
        "Query 1 - Broad discovery",
        "High-recall text search for terminology, neighboring concepts, and seed documents.",
        broad,
      ),
      makeStrategy(
        "query2",
        "Query 2 - Balanced",
        "Recommended starting point: combines the principal concepts with verified CPC scope when available.",
        combineWithAnd(balanced, cpc),
        [],
        true,
      ),
      makeStrategy(
        "query3",
        "Query 3 - Precision",
        "Uses additional concept groups when available; otherwise narrows synonym alternatives while retaining verified CPC scope.",
        combineWithAnd(precision, cpc),
      ),
    ],
  };
}

function buildPatentscopeDatabase(
  language: AnalysisResult["language"],
  groups: string[],
  codes: VerifiedClassificationCodes,
  balancedKeywordQuery: string,
): GeneratedSearchDatabase {
  const textField = language === "ja" ? "JA_ALLTXT" : "EN_ALLTXT";
  const wrapText = (query: string) => (query ? `${textField}:(${query})` : "");
  const classification = buildPatentscopeClassificationQuery(codes);

  return {
    id: "patentscope",
    label: "PATENTSCOPE",
    syntaxLabel: "PATENTSCOPE Advanced Search",
    note: `Targets ${textField} and adds CPC (or IPC fallback) classification syntax when verified codes are available.`,
    strategies: [
      makeStrategy(
        "query1",
        "Query 1 - Broad discovery",
        "High-recall full-text search using the strongest concept groups.",
        wrapText(joinKeywordGroups(groups, getBroadGroupCount(groups))),
      ),
      makeStrategy(
        "query2",
        "Query 2 - Balanced",
        "Recommended starting point: full-text concepts plus a verified classification condition when available.",
        combineWithAnd(
          wrapText(
            groups.length > 0
              ? joinKeywordGroups(groups, BALANCED_GROUPS)
              : balancedKeywordQuery,
          ),
          classification,
        ),
        [],
        true,
      ),
      makeStrategy(
        "query3",
        "Query 3 - Precision",
        "Uses additional concept groups when available; otherwise narrows synonym alternatives while keeping the verified classification condition.",
        combineWithAnd(
          wrapText(joinPrecisionKeywordGroups(groups)),
          classification,
        ),
      ),
    ],
  };
}

function buildUsptoDatabase(
  groups: string[],
  codes: VerifiedClassificationCodes,
  balancedKeywordQuery: string,
): GeneratedSearchDatabase {
  const cpc = buildUsptoCpcQuery(codes.CPC);

  return {
    id: "uspto",
    label: "USPTO Patent Public Search",
    syntaxLabel: "Patent Public Search Advanced Search",
    note: "Uses Boolean text terms and the .cpc. field code with spaces removed from CPC symbols.",
    strategies: [
      makeStrategy(
        "query1",
        "Query 1 - Broad discovery",
        "High-recall Boolean text search for U.S. patents and published applications.",
        joinKeywordGroups(groups, getBroadGroupCount(groups)),
      ),
      makeStrategy(
        "query2",
        "Query 2 - Balanced",
        "Recommended starting point: principal text concepts plus verified CPC scope when available.",
        combineWithAnd(
          groups.length > 0
            ? joinKeywordGroups(groups, BALANCED_GROUPS)
            : balancedKeywordQuery,
          cpc,
        ),
        [],
        true,
      ),
      makeStrategy(
        "query3",
        "Query 3 - Precision",
        "Uses additional concept groups when available; otherwise narrows synonym alternatives while retaining the CPC field restriction.",
        combineWithAnd(joinPrecisionKeywordGroups(groups), cpc),
      ),
    ],
  };
}

function unquoteBooleanTerm(value: string): string {
  const trimmed = value.trim();
  if (trimmed.startsWith('"') && trimmed.endsWith('"') && trimmed.length >= 2) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

function formatJPlatPatTextTerm(value: string): string {
  const cleaned = unquoteBooleanTerm(value)
    .normalize("NFKC")
    .replace(/[‘’']/g, "")
    .replace(/\s+/g, " ")
    .trim();

  if (!cleaned) {
    return "";
  }

  return /\s/.test(cleaned) ? `'${cleaned}'` : cleaned;
}

function convertKeywordGroupToJPlatPat(group: string): string {
  const trimmed = group.trim();
  const inner =
    trimmed.startsWith("(") && trimmed.endsWith(")")
      ? trimmed.slice(1, -1)
      : trimmed;
  const terms = inner
    .split(/\s+OR\s+/i)
    .map(formatJPlatPatTextTerm)
    .filter(Boolean);

  return terms.length > 0 ? `[(${terms.join("+")})/TX]` : "";
}

function buildJPlatPatTextExpression(query: string): string {
  return splitTopLevelAndGroups(query)
    .map(convertKeywordGroupToJPlatPat)
    .filter(Boolean)
    .join("*");
}

function normalizeJPlatPatClassificationCode(value: string): string {
  return cleanClassificationCode(value).replace(/\s+/g, "");
}

function buildJPlatPatClassificationCondition(
  tag: "FI" | "IP" | "FT",
  values: string[],
): string {
  const codes = Array.from(
    new Set(
      values
        .map(normalizeJPlatPatClassificationCode)
        .filter(Boolean),
    ),
  ).sort((a, b) => a.localeCompare(b));

  return codes.length > 0 ? `[(${codes.join("+")})/${tag}]` : "";
}

function combineJPlatPatWithAnd(...parts: string[]): string {
  return parts.filter(Boolean).join("*");
}

function buildJPlatPatPrimaryClassification(
  codes: VerifiedClassificationCodes,
): string {
  if (codes.FI.length > 0) {
    return buildJPlatPatClassificationCondition("FI", codes.FI);
  }

  return buildJPlatPatClassificationCondition("IP", codes.IPC);
}

function buildJPlatPatDatabase(
  groups: string[],
  codes: VerifiedClassificationCodes,
  balancedKeywordQuery: string,
): GeneratedSearchDatabase {
  const broadBoolean = joinKeywordGroups(groups, getBroadGroupCount(groups));
  const balancedBoolean = groups.length > 0
    ? joinKeywordGroups(groups, BALANCED_GROUPS)
    : balancedKeywordQuery;
  const precisionBoolean = joinPrecisionKeywordGroups(groups);

  const broad = buildJPlatPatTextExpression(broadBoolean);
  const balancedText = buildJPlatPatTextExpression(balancedBoolean);
  const precisionText = buildJPlatPatTextExpression(precisionBoolean);
  const primaryClassification = buildJPlatPatPrimaryClassification(codes);
  const fTermClassification = buildJPlatPatClassificationCondition(
    "FT",
    codes["F-term"],
  );

  return {
    id: "j_platpat",
    label: "J-PlatPat",
    syntaxLabel: "Patent/Utility Model Search - Logical Expression Input",
    note: "Paste each expression into J-PlatPat's Logical Expression Input. The generator uses * for AND, + for OR, /TX for Full text, verified /FI when available (otherwise /IP for IPC), and /FT for verified F-term refinement.",
    strategies: [
      makeStrategy(
        "query1",
        "Query 1 - Broad discovery",
        "High-recall J-PlatPat full-text logical expression without a classification restriction.",
        broad,
      ),
      makeStrategy(
        "query2",
        "Query 2 - Balanced",
        "Recommended starting point: principal full-text concepts combined with verified FI scope, or IPC when verified FI is unavailable.",
        combineJPlatPatWithAnd(balancedText, primaryClassification),
        [],
        true,
      ),
      makeStrategy(
        "query3",
        "Query 3 - Precision",
        "Uses additional full-text concept groups when available and adds verified F-term refinement when available.",
        combineJPlatPatWithAnd(
          precisionText,
          primaryClassification,
          fTermClassification,
        ),
      ),
    ],
  };
}

function extractReviewedCpcCodes(result: AnalysisResult): string[] {
  if (
    !result.search_query_starter ||
    (result.search_query_starter.reviewStatus !== "accepted" &&
      result.search_query_starter.reviewStatus !== "corrected")
  ) {
    return [];
  }

  const normalized = normalizeGooglePatentsClassificationQuery(
    result.search_query_starter.classificationQuery,
  );

  return Array.from(
    new Set(
      Array.from(normalized.matchAll(/CPC=([A-Z0-9/]+)/g), (match) => match[1]),
    ),
  ).sort((a, b) => a.localeCompare(b));
}

function buildLegacyClassificationQuery(result: AnalysisResult): string {
  if (result.search_query_starter?.classificationQuery) {
    return normalizeGooglePatentsClassificationQuery(
      result.search_query_starter.classificationQuery,
    );
  }

  const codes = collectVerifiedClassificationCodes(result);
  return buildGooglePatentsCpcQuery(codes.CPC);
}

export function buildSearchQueryStarter(
  result: AnalysisResult,
): GeneratedSearchQueryStarter {
  const groups = buildKeywordGroups(result);
  const evidenceCodes = collectVerifiedClassificationCodes(result);
  const reviewedCpcCodes = extractReviewedCpcCodes(result);
  const codes: VerifiedClassificationCodes = {
    ...evidenceCodes,
    CPC: reviewedCpcCodes.length > 0 ? reviewedCpcCodes : evidenceCodes.CPC,
  };
  const hasReviewedSource =
    result.search_query_starter?.reviewStatus === "accepted" ||
    result.search_query_starter?.reviewStatus === "corrected";
  const balancedKeywordQuery = hasReviewedSource
    ? result.search_query_starter?.keywordQuery.trim() || ""
    : "";
  const legacyKeywordQuery =
    result.search_query_starter?.keywordQuery ||
    joinKeywordGroups(groups, MAX_KEYWORD_GROUPS);
  const legacyClassificationQuery = buildLegacyClassificationQuery(result);
  const reviewStatus =
    result.search_query_starter?.reviewStatus === "accepted" ||
      result.search_query_starter?.reviewStatus === "corrected"
      ? result.search_query_starter.reviewStatus
      : "unreviewed";
  const reviewSummary =
    result.search_query_starter?.reviewSummary ||
    "AI review was not included in this analysis result. Verify and refine the generated strategies before use.";

  return {
    keywordQuery: legacyKeywordQuery,
    classificationQuery: legacyClassificationQuery,
    reviewStatus,
    reviewSummary,
    databases: [
      buildGooglePatentsDatabase(groups, codes, balancedKeywordQuery),
      buildPatentscopeDatabase(result.language, groups, codes, balancedKeywordQuery),
      buildUsptoDatabase(groups, codes, balancedKeywordQuery),
      buildJPlatPatDatabase(groups, codes, balancedKeywordQuery),
    ],
  };
}

function splitTopLevelAndGroups(query: string): string[] {
  const normalized = query.trim();
  if (!normalized) {
    return [];
  }

  const groups: string[] = [];
  let depth = 0;
  let inQuote = false;
  let start = 0;

  for (let index = 0; index < normalized.length; index += 1) {
    const character = normalized[index];

    if (character === '"') {
      inQuote = !inQuote;
      continue;
    }

    if (inQuote) {
      continue;
    }

    if (character === "(") {
      depth += 1;
      continue;
    }

    if (character === ")") {
      depth = Math.max(0, depth - 1);
      continue;
    }

    if (
      depth === 0 &&
      normalized.slice(index, index + 5).toUpperCase() === " AND "
    ) {
      const group = normalized.slice(start, index).trim();
      if (group) {
        groups.push(group);
      }
      index += 4;
      start = index + 1;
    }
  }

  const finalGroup = normalized.slice(start).trim();
  if (finalGroup) {
    groups.push(finalGroup);
  }

  return groups;
}

function extractCpcCodesFromLegacyQuery(query: string): string[] {
  const normalized = normalizeGooglePatentsClassificationQuery(query);
  return Array.from(
    new Set(
      Array.from(normalized.matchAll(/CPC=([A-Z0-9/]+)/g), (match) => match[1]),
    ),
  ).sort((a, b) => a.localeCompare(b));
}

/**
 * Resolves the database strategies for both current analysis results and the
 * older pre-reviewed landing-page demo objects. The fallback keeps demo data
 * backward-compatible without weakening the current generated result shape.
 */
export function getSearchQueryDatabases(
  starter: GeneratedSearchQueryStarter,
): GeneratedSearchDatabase[] {
  if (Array.isArray(starter.databases) && starter.databases.length > 0) {
    return starter.databases;
  }

  const groups = splitTopLevelAndGroups(starter.keywordQuery);
  const cpcCodes = extractCpcCodesFromLegacyQuery(starter.classificationQuery);
  const codes: VerifiedClassificationCodes = {
    IPC: [],
    CPC: cpcCodes,
    FI: [],
    "F-term": [],
  };
  const balancedKeywordQuery = joinKeywordGroups(groups, BALANCED_GROUPS);

  return [
    buildGooglePatentsDatabase(groups, codes, balancedKeywordQuery),
    buildPatentscopeDatabase("en", groups, codes, balancedKeywordQuery),
    buildUsptoDatabase(groups, codes, balancedKeywordQuery),
    buildJPlatPatDatabase(groups, codes, balancedKeywordQuery),
  ];
}
