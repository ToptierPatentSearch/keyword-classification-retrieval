import OpenAI from "npm:openai@^5.0.0";
import {
  createClient,
  type SupabaseClient,
} from "npm:@supabase/supabase-js@^2.44.4";
import {
  buildGooglePatentsCpcQuery,
  filterClassificationCodesByDomain,
  type SearchQueryDomainCandidate,
} from "./searchQueryDomain.ts";
import { applyReviewedClassificationDomainGate } from "./reviewedClassificationDomain.ts";

type Confidence = "high" | "medium" | "low";
type PatentLanguage = "en" | "ja";
type ClassificationSystem = "IPC" | "CPC" | "FI" | "F-term";
type CatalogClassificationSystem = Exclude<ClassificationSystem, "F-term">;
type ClassificationVerificationStatus = "database_verified";
const TECHNICAL_CONCEPT_FACETS = [
  "object_or_system",
  "purpose_or_problem",
  "application_or_use",
  "components",
  "component_relationships",
  "material_or_composition",
  "manufacturing_or_processing_steps",
  "operation",
  "control_means",
  "controlled_variables",
  "operating_conditions",
  "technical_effect",
] as const;
type TechnicalConceptFacet = (typeof TECHNICAL_CONCEPT_FACETS)[number];

interface AnalyzeRequest {
  text?: unknown;
  input?: unknown;
  request_id?: unknown;
  selected_keywords?: unknown;
}

interface ClassificationCodeEvidence {
  code: string;
  status: ClassificationVerificationStatus;
  title_en?: string | null;
  title_ja?: string | null;
  edition?: string | null;
  match_score?: number;
  matched_terms?: string[];
  theme_code?: string | null;
  viewpoint_code?: string | null;
}

interface ClassificationCandidate {
  system: ClassificationSystem;
  code: string;
  normalized_code?: string | null;
  title_en: string | null;
  title_ja: string | null;
  parent_code: string | null;
  hierarchy_level: number | null;
  edition: string;
  similarity_score: number;
  match_score?: number;
  theme_code?: string | null;
  viewpoint_code?: string | null;
  theme_title_en?: string | null;
  theme_title_ja?: string | null;
  fi_scope?: string[];
  matched_terms?: string[];
  retrieval_term?: string;
  retrieval_term_index?: number;
  source_area_codes?: string[];
  ancestor_titles?: string[];
}

interface FTermThemeCandidate {
  theme_code: string;
  title_en: string | null;
  title_ja: string | null;
  edition: string;
  similarity_score: number;
  match_score?: number;
  fi_scope: string[];
  matched_terms?: string[];
}

interface TechnicalInterpretation {
  object_or_system: string;
  purpose_or_problem: string;
  application_or_use: string;
  components: string[];
  component_relationships: string[];
  material_or_composition: string[];
  manufacturing_or_processing_steps: string[];
  operation: string;
  control_means: string[];
  controlled_variables: string[];
  operating_conditions: string[];
  technical_effect: string;
  context_terms: string[];
  search_phrases: string[];
}

interface ClassificationLookupContext {
  searchTerms: string[];
  rankingTerms: string[];
  contextAnchorTokens: string[];
  domainAnchorTokens: string[];
  keywordLexicalTerms: string[];
  genericKeyword: boolean;
}

interface ClassificationRouteCode extends ClassificationCodeEvidence {
  system: ClassificationSystem;
}

interface FTermThemeRoute {
  theme_code: string;
  title_en?: string | null;
  title_ja?: string | null;
  edition?: string | null;
  fi_codes: string[];
  aspects: ClassificationRouteCode[];
}

interface FiSubdivisionRoute {
  fi: ClassificationRouteCode;
  parent_area_codes: string[];
  f_term_themes: FTermThemeRoute[];
}

interface ClassificationRoute {
  ipc_cpc_area: ClassificationRouteCode[];
  fi_subdivisions: FiSubdivisionRoute[];
}

interface KeywordClassification {
  term: string;
  normalized_term: string;
  synonyms: string[];
  concept_facets: TechnicalConceptFacet[];
  concept_basis: string[];
  source_evidence: string[];
  count: number;
  rank: number;
  ipc: string[];
  cpc: string[];
  fi: string[];
  f_term: string[];
  ipc_evidence?: ClassificationCodeEvidence[];
  cpc_evidence?: ClassificationCodeEvidence[];
  fi_evidence?: ClassificationCodeEvidence[];
  f_term_evidence?: ClassificationCodeEvidence[];
  ipc_candidates?: ClassificationCandidate[];
  cpc_candidates?: ClassificationCandidate[];
  fi_candidates?: ClassificationCandidate[];
  f_term_candidates?: ClassificationCandidate[];
  classification_route?: ClassificationRoute;
  classification_confidence: Confidence;
  reason: string;
  classification_reason: string;
}

type SearchQueryReviewStatus = "accepted" | "corrected";

interface SearchQueryStarter {
  keywordQuery: string;
  classificationQuery: string;
  reviewStatus: SearchQueryReviewStatus;
  reviewSummary: string;
}

// A query starter is charge-eligible only when this Edge Function created the
// same object after validating the AI's structured term/code ID selection.
// WeakSet membership is internal and is never serialized into the response.
const validatedSearchQueryStarters = new WeakSet<SearchQueryStarter>();

interface AnalysisResult {
  language: PatentLanguage;
  technical_concept: TechnicalInterpretation;
  keywords: KeywordClassification[];
  search_query_starter?: SearchQueryStarter;
  analysisSchemaVersion?: string;
  warning?: string;
  requestId?: string;
  remainingCredits?: number;
  replayed?: boolean;
}

interface CreditConsumptionResult {
  consumed: boolean;
  remaining_credits: number;
  replayed: boolean;
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
};

type AnalysisProgressStage =
  | "input_review"
  | "concept_extraction"
  | "keyword_expansion"
  | "classification"
  | "query_generation"
  | "final_formatting";
type AnalysisProgressStatus = "running" | "completed" | "failed";

const ANALYSIS_PROGRESS_STAGE_INDEX: Record<AnalysisProgressStage, number> = {
  input_review: 0,
  concept_extraction: 1,
  keyword_expansion: 2,
  classification: 3,
  query_generation: 4,
  final_formatting: 5,
};
let analysisProgressUnavailable = false;

async function writeAnalysisProgress(
  adminClient: SupabaseClient,
  userId: string,
  requestId: string,
  stage: AnalysisProgressStage,
  status: AnalysisProgressStatus = "running",
  errorMessage: string | null = null,
): Promise<void> {
  if (analysisProgressUnavailable) {
    return;
  }

  const now = new Date();
  const { error } = await adminClient.from("analysis_progress").upsert(
    {
      user_id: userId,
      request_id: requestId,
      stage,
      stage_index: ANALYSIS_PROGRESS_STAGE_INDEX[stage],
      status,
      error_message: errorMessage,
      updated_at: now.toISOString(),
      expires_at: new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(),
    },
    { onConflict: "user_id,request_id,stage" },
  );

  if (error) {
    analysisProgressUnavailable = true;
    console.warn(
      "Analysis progress could not be recorded; analysis will continue normally:",
      error.message,
    );
  }
}

const MIN_INPUT_CHARS = 20;

const MAX_INPUT_CHARS = 10000;
const MAX_INPUT_LINES = 300;
const MAX_REPEATED_CHAR_RUN = 20;
const MIN_MEANINGFUL_CHAR_RATIO = 0.35;
const MAX_DUPLICATE_WORD_RATIO = 0.75;
const LONG_INPUT_WARNING_CHARS = 8000;
const CLASSIFICATION_SEARCH_LIMIT = 30;
const CANDIDATES_PER_SYSTEM = 3;
const CANDIDATE_KEYWORD_LIMIT = 12;
const CANDIDATE_SEARCH_CONCURRENCY = 1;
const FI_SELECTION_THRESHOLD = 0.58;
const AREA_SELECTION_THRESHOLD = 0.52;
const F_TERM_THEME_SELECTION_THRESHOLD = 0.48;
const F_TERM_SELECTION_THRESHOLD = 0.64;
const MAX_SELECTED_AREAS_PER_SYSTEM = 2;
const MAX_SELECTED_FI = 2;
const MAX_SELECTED_F_TERM_THEMES = 2;
const MAX_SELECTED_F_TERMS = 3;
const MAX_QUERY_KEYWORD_GROUPS = 5;
const MAX_QUERY_TERMS_PER_GROUP = 3;
// search_query_starter is an additive field under v3 so the currently
// deployed v3 frontend can safely ignore it while the backend is rolled out.
const ANALYSIS_SCHEMA_VERSION = "concept-rationale-v3";
const MODEL = Deno.env.get("OPENAI_MODEL") ?? "gpt-5.6-luna";
const REQUIRED_DATABASE_FUNCTIONS = [
  "consume_analysis_credit_once_v2",
  "search_classification_titles",
  "search_f_term_themes",
  "search_f_term_titles",
] as const;

let requiredDatabaseFunctionsCheck: Promise<void> | null = null;

const NO_CREDITS_MESSAGE =
  "分析クレジットがありません。Test pack または Business pack を購入してください。";
const DUPLICATE_INPUT_MESSAGE =
  "This patent text has already been analyzed. Clear the text, enter different patent text, and retry. No additional credit was consumed.";

const technicalConceptSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "object_or_system",
    "purpose_or_problem",
    "application_or_use",
    "components",
    "component_relationships",
    "material_or_composition",
    "manufacturing_or_processing_steps",
    "operation",
    "control_means",
    "controlled_variables",
    "operating_conditions",
    "technical_effect",
    "context_terms",
    "search_phrases",
  ],
  properties: {
    object_or_system: { type: "string", minLength: 1 },
    purpose_or_problem: { type: "string", minLength: 1 },
    application_or_use: { type: "string", minLength: 1 },
    components: {
      type: "array",
      minItems: 1,
      maxItems: 12,
      items: { type: "string" },
    },
    component_relationships: {
      type: "array",
      minItems: 1,
      maxItems: 12,
      items: { type: "string" },
    },
    material_or_composition: {
      type: "array",
      maxItems: 10,
      items: { type: "string" },
    },
    manufacturing_or_processing_steps: {
      type: "array",
      maxItems: 12,
      items: { type: "string" },
    },
    operation: { type: "string", minLength: 1 },
    control_means: {
      type: "array",
      maxItems: 10,
      items: { type: "string" },
    },
    controlled_variables: {
      type: "array",
      maxItems: 10,
      items: { type: "string" },
    },
    operating_conditions: {
      type: "array",
      maxItems: 10,
      items: { type: "string" },
    },
    technical_effect: { type: "string", minLength: 1 },
    context_terms: {
      type: "array",
      maxItems: 8,
      items: { type: "string" },
    },
    search_phrases: {
      type: "array",
      maxItems: 6,
      items: { type: "string" },
    },
  },
} as const;

const responseSchema = {
  type: "object",
  additionalProperties: false,
  required: ["language", "technical_concept", "keywords"],
  properties: {
    language: { type: "string", enum: ["en", "ja"] },
    technical_concept: technicalConceptSchema,
    keywords: {
      type: "array",
      maxItems: 40,
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "term",
          "normalized_term",
          "synonyms",
          "concept_facets",
          "source_evidence",
          "count",
          "rank",
          "ipc",
          "cpc",
          "fi",
          "f_term",
          "classification_confidence",
          "reason",
        ],
        properties: {
          term: { type: "string" },
          normalized_term: { type: "string" },
          synonyms: {
            type: "array",
            minItems: 1,
            maxItems: 8,
            items: { type: "string" },
          },
          concept_facets: {
            type: "array",
            minItems: 1,
            maxItems: 3,
            items: {
              type: "string",
              enum: TECHNICAL_CONCEPT_FACETS,
            },
          },
          source_evidence: {
            type: "array",
            minItems: 1,
            maxItems: 2,
            items: { type: "string", minLength: 3, maxLength: 240 },
          },
          count: { type: "integer", minimum: 1 },
          rank: { type: "integer", minimum: 1 },
          ipc: { type: "array", maxItems: 0, items: { type: "string" } },
          cpc: { type: "array", maxItems: 0, items: { type: "string" } },
          fi: { type: "array", maxItems: 0, items: { type: "string" } },
          f_term: { type: "array", maxItems: 0, items: { type: "string" } },
          classification_confidence: {
            type: "string",
            enum: ["high", "medium", "low"],
          },
          reason: { type: "string", minLength: 40, maxLength: 600 },
        },
      },
    },
  },
} as const;

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json; charset=utf-8",
      ...(init.headers ?? {}),
    },
  });
}

type AnalysisAuditOutcome =
  | "started"
  | "ready"
  | "replay"
  | "succeeded"
  | "failed"
  | "rejected";

interface AnalysisAuditDetails {
  stage: string;
  user_id?: string;
  request_id?: string;
  input_hash?: string;
  input_characters?: number;
  selected_keyword_count?: number;
  result_keyword_count?: number;
  remaining_credits?: number;
  replayed?: boolean;
  status_code?: number;
  error_name?: string;
  error_message?: string;
  duration_ms?: number;
}

function logAnalysisAudit(
  outcome: AnalysisAuditOutcome,
  details: AnalysisAuditDetails,
): void {
  const entry = JSON.stringify({
    event: "analysis_audit",
    outcome,
    occurred_at: new Date().toISOString(),
    ...details,
  });

  if (outcome === "failed") {
    console.error(entry);
    return;
  }

  if (outcome === "rejected") {
    console.warn(entry);
    return;
  }

  console.info(entry);
}

function getRequiredEnv(name: string): string {
  const value = Deno.env.get(name);

  if (!value) {
    throw new Error(`${name} is not configured in Supabase secrets.`);
  }

  return value;
}
class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function inspectRequiredDatabaseFunctions(
  supabaseUrl: string,
  serviceRoleKey: string,
): Promise<void> {
  const response = await fetch(`${supabaseUrl.replace(/\/$/, "")}/rest/v1/`, {
    method: "GET",
    headers: {
      Accept: "application/openapi+json",
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
    },
  });

  if (!response.ok) {
    throw new HttpError(
      503,
      `Unable to confirm the required database functions (HTTP ${response.status}). No credit was consumed.`,
    );
  }

  let openApiDocument: { paths?: Record<string, unknown> };

  try {
    openApiDocument = (await response.json()) as {
      paths?: Record<string, unknown>;
    };
  } catch {
    throw new HttpError(
      503,
      "Unable to read the database function catalog. No credit was consumed.",
    );
  }

  const availablePaths = openApiDocument.paths ?? {};
  const missingFunctions = REQUIRED_DATABASE_FUNCTIONS.filter(
    (functionName) => {
      const rpcPath = availablePaths[`/rpc/${functionName}`];

      return !(
        typeof rpcPath === "object" &&
        rpcPath !== null &&
        "post" in rpcPath
      );
    },
  );

  if (missingFunctions.length > 0) {
    throw new HttpError(
      503,
      `Required database functions are missing: ${missingFunctions.join(", ")}. Deploy the matching SQL migration. No credit was consumed.`,
    );
  }
}

async function confirmRequiredDatabaseFunctions(
  supabaseUrl: string,
  serviceRoleKey: string,
): Promise<void> {
  if (!requiredDatabaseFunctionsCheck) {
    requiredDatabaseFunctionsCheck = inspectRequiredDatabaseFunctions(
      supabaseUrl,
      serviceRoleKey,
    );
  }

  try {
    await requiredDatabaseFunctionsCheck;
  } catch (error) {
    // Permit a later request to recheck after a migration or temporary outage.
    requiredDatabaseFunctionsCheck = null;
    throw error;
  }
}

function validateRequestId(value: unknown): string {
  if (
    typeof value !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  ) {
    throw new HttpError(400, "A valid request_id is required.");
  }

  return value;
}

function validateSelectedKeywords(value: unknown): string[] {
  if (!Array.isArray(value)) {
    throw new HttpError(400, "selected_keywords must be an array.");
  }

  const keywords = value.map((item) => {
    if (typeof item !== "string" || !item.trim()) {
      throw new HttpError(
        400,
        "Every selected keyword must be a nonempty string.",
      );
    }

    return item.trim();
  });

  return Array.from(new Set(keywords)).slice(0, 100);
}

function parseCreditConsumptionResult(value: unknown): CreditConsumptionResult {
  const row = Array.isArray(value) ? value[0] : value;

  if (!row || typeof row !== "object") {
    throw new HttpError(
      503,
      "Credit finalization is temporarily unavailable. Retry the same request; idempotency prevents a duplicate charge.",
    );
  }

  const record = row as Record<string, unknown>;
  const remainingCredits = Number(record.remaining_credits);

  if (
    typeof record.consumed !== "boolean" ||
    typeof record.replayed !== "boolean" ||
    !Number.isInteger(remainingCredits) ||
    remainingCredits < 0
  ) {
    throw new HttpError(
      503,
      "Credit finalization returned an invalid response. Retry the same request; idempotency prevents a duplicate charge.",
    );
  }

  return {
    consumed: record.consumed,
    remaining_credits: remainingCredits,
    replayed: record.replayed,
  };
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );

  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function normalizeTextForCreditDeduplication(text: string): string {
  return text.normalize("NFKC").replace(/\s+/gu, " ").trim();
}

function validateText(body: AnalyzeRequest): string {
  const rawText = typeof body.text === "string" ? body.text : body.input;

  if (typeof rawText !== "string") {
    throw new Error(
      'Request body must include a string field named "text" or "input".',
    );
  }

  const text = rawText.trim();

  if (text.length < MIN_INPUT_CHARS) {
    throw new Error(
      `Text is too short. Please enter at least ${MIN_INPUT_CHARS} characters of meaningful technical text.`,
    );
  }

  if (text.length > MAX_INPUT_CHARS) {
    throw new Error(
      `Text is too long. Limit input to ${MAX_INPUT_CHARS.toLocaleString()} characters.`,
    );
  }

  const lines = text.split(/\r?\n/);

  if (lines.length > MAX_INPUT_LINES) {
    throw new Error(
      `Text has too many lines. Limit input to ${MAX_INPUT_LINES.toLocaleString()} lines.`,
    );
  }

  const repeatedCharacterPattern = new RegExp(
    `([\\s\\S])\\1{${MAX_REPEATED_CHAR_RUN},}`,
    "u",
  );

  if (repeatedCharacterPattern.test(text)) {
    throw new Error("Text appears to contain excessive repeated characters.");
  }

  const meaningfulChars =
    text.match(/[A-Za-z0-9\u3040-\u30ff\u3400-\u9fff]/gu)?.length ?? 0;
  const meaningfulRatio = meaningfulChars / text.length;

  if (meaningfulRatio < MIN_MEANINGFUL_CHAR_RATIO) {
    throw new Error("Text appears to contain too little meaningful content.");
  }

  const words = text
    .toLowerCase()
    .split(/\s+/)
    .filter((word) => word.length >= 2);

  if (words.length >= 20) {
    const counts = new Map<string, number>();

    for (const word of words) {
      counts.set(word, (counts.get(word) ?? 0) + 1);
    }

    const maxRepeatedWordCount = Math.max(...counts.values());
    const duplicateRatio = maxRepeatedWordCount / words.length;

    if (duplicateRatio > MAX_DUPLICATE_WORD_RATIO) {
      throw new Error("Text appears to contain excessive repeated words.");
    }
  }

  return text;
}

function normalizeClassificationCode(code: string): string {
  return code.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function normalizeCatalogLookupCode(code: string): string {
  // classification_titles.normalized_code removes spacing but preserves the
  // subgroup slash (for example, "A61L 103/85" -> "A61L103/85").
  return code.toUpperCase().replace(/[^A-Z0-9/]/g, "");
}

function uniqueCodes(codes: unknown): string[] {
  if (!Array.isArray(codes)) {
    return [];
  }

  const seen = new Set<string>();
  const unique: string[] = [];

  for (const value of codes) {
    if (typeof value !== "string") {
      continue;
    }

    const code = value.trim();
    const normalizedCode = normalizeClassificationCode(code);

    if (!code || !normalizedCode || seen.has(normalizedCode)) {
      continue;
    }

    seen.add(normalizedCode);
    unique.push(code);
  }

  return unique;
}

function cleanSearchQueryValue(value: unknown): string {
  return typeof value === "string"
    ? value.replace(/["“”]/g, " ").replace(/\s+/g, " ").trim()
    : "";
}

function uniqueSearchQueryValues(values: unknown[]): string[] {
  const seen = new Set<string>();
  const unique: string[] = [];

  for (const value of values) {
    const cleanedValue = cleanSearchQueryValue(value);
    const comparisonValue = cleanedValue.normalize("NFKC").toLowerCase();

    if (!cleanedValue || seen.has(comparisonValue)) {
      continue;
    }

    seen.add(comparisonValue);
    unique.push(cleanedValue);
  }

  return unique;
}

function buildCandidateSearchQueryTermGroups(
  result: AnalysisResult,
): string[][] {
  return result.keywords
    .slice()
    .sort((a, b) => a.rank - b.rank)
    .slice(0, MAX_QUERY_KEYWORD_GROUPS)
    .map((keyword) =>
      uniqueSearchQueryValues([
        keyword.normalized_term,
        keyword.term,
        ...keyword.synonyms,
      ]).slice(0, MAX_QUERY_TERMS_PER_GROUP),
    )
    .filter((terms) => terms.length > 0);
}

function buildCandidateSearchQueryStarter(
  result: AnalysisResult,
): Pick<SearchQueryStarter, "keywordQuery" | "classificationQuery"> {
  const keywordQuery = buildCandidateSearchQueryTermGroups(result)
    .map((terms) => `(${terms.map((term) => `"${term}"`).join(" OR ")})`)
    .join(" AND ");

  const ipcCodes = new Set<string>();
  const cpcCodes = new Set<string>();

  for (const keyword of result.keywords) {
    for (const area of keyword.classification_route?.ipc_cpc_area ?? []) {
      const code = cleanSearchQueryValue(area.code);

      if (!code || area.status !== "database_verified") {
        continue;
      }

      if (area.system === "IPC") {
        ipcCodes.add(code);
      } else if (area.system === "CPC") {
        cpcCodes.add(code);
      }
    }

    for (const evidence of keyword.ipc_evidence ?? []) {
      if (evidence.status === "database_verified") {
        const code = cleanSearchQueryValue(evidence.code);
        if (code) ipcCodes.add(code);
      }
    }

    for (const evidence of keyword.cpc_evidence ?? []) {
      if (evidence.status === "database_verified") {
        const code = cleanSearchQueryValue(evidence.code);
        if (code) cpcCodes.add(code);
      }
    }
  }

  const classificationParts: string[] = [];

  if (ipcCodes.size > 0) {
    classificationParts.push(
      `IPC=(${Array.from(ipcCodes)
        .sort((a, b) => a.localeCompare(b))
        .join(" OR ")})`,
    );
  }

  if (cpcCodes.size > 0) {
    classificationParts.push(
      `CPC=(${Array.from(cpcCodes)
        .sort((a, b) => a.localeCompare(b))
        .join(" OR ")})`,
    );
  }

  return {
    keywordQuery,
    classificationQuery: classificationParts.join(" OR "),
  };
}

function allowedSearchQueryTerms(result: AnalysisResult): string[] {
  const keywordTerms = result.keywords
    .slice()
    .sort((a, b) => a.rank - b.rank)
    .slice(0, CANDIDATE_KEYWORD_LIMIT)
    .flatMap((keyword) => [
      keyword.normalized_term,
      keyword.term,
      ...keyword.synonyms,
    ]);

  return uniqueSearchQueryValues([
    ...keywordTerms,
    ...result.technical_concept.search_phrases,
  ]);
}

function allowedSearchQueryCodes(
  result: AnalysisResult,
): Record<"IPC" | "CPC", string[]> {
  const candidate = buildCandidateSearchQueryStarter(result);
  const codes: Record<"IPC" | "CPC", string[]> = { IPC: [], CPC: [] };

  for (const section of candidate.classificationQuery.split(
    /\s+OR\s+(?=(?:IPC|CPC)\s*=)/i,
  )) {
    const match = section.match(/^(IPC|CPC)\s*=\s*\(([^()]*)\)$/i);
    if (!match) continue;

    const system = match[1].toUpperCase() as "IPC" | "CPC";
    codes[system] = match[2]
      .split(/\s+OR\s+/i)
      .map(cleanSearchQueryValue)
      .filter(Boolean);
  }

  const domainCandidates: SearchQueryDomainCandidate[] = (
    ["IPC", "CPC"] as const
  ).flatMap((system) =>
    codes[system].map((code) => ({
      system,
      code,
      ...titleForSearchQueryCode(result, system, code),
    })),
  );

  return filterClassificationCodesByDomain(domainCandidates, {
    object_or_system: result.technical_concept.object_or_system,
    application_or_use: result.technical_concept.application_or_use,
    context_terms: result.technical_concept.context_terms,
    search_phrases: result.technical_concept.search_phrases,
  }).codes;
}

interface SearchQueryTermOption {
  id: string;
  term: string;
}

interface SearchQueryCodeOption {
  id: string;
  code: string;
  title_en: string | null;
  title_ja: string | null;
}

interface SearchQueryReviewSelection {
  keyword_groups: Array<{ term_ids: string[] }>;
  ipc_code_ids: string[];
  cpc_code_ids: string[];
}

function searchQueryOptionId(prefix: "T" | "I" | "C", index: number): string {
  return `${prefix}${String(index + 1).padStart(3, "0")}`;
}

function titleForSearchQueryCode(
  result: AnalysisResult,
  system: "IPC" | "CPC",
  code: string,
): {
  title_en: string | null;
  title_ja: string | null;
  ancestor_titles?: string[];
} {
  const normalizedCode = normalizeClassificationCode(code);

  const matchedCandidate = result.keywords
    .flatMap((keyword) =>
      system === "IPC"
        ? keyword.ipc_candidates ?? []
        : keyword.cpc_candidates ?? []
    )
    .find(
      (candidate) =>
        normalizeClassificationCode(candidate.code) === normalizedCode,
    );

  for (const keyword of result.keywords) {
    for (const area of keyword.classification_route?.ipc_cpc_area ?? []) {
      if (
        area.system === system &&
        normalizeClassificationCode(area.code) === normalizedCode
      ) {
        return {
          title_en: area.title_en ?? null,
          title_ja: area.title_ja ?? null,
          ancestor_titles: matchedCandidate?.ancestor_titles ?? [],
        };
      }
    }

    const evidence =
      system === "IPC" ? keyword.ipc_evidence : keyword.cpc_evidence;

    const matchedEvidence = evidence?.find(
      (item) => normalizeClassificationCode(item.code) === normalizedCode,
    );

    if (matchedEvidence) {
      return {
        title_en: matchedEvidence.title_en ?? null,
        title_ja: matchedEvidence.title_ja ?? null,
        ancestor_titles: matchedCandidate?.ancestor_titles ?? [],
      };
    }
  }

  return {
    title_en: matchedCandidate?.title_en ?? null,
    title_ja: matchedCandidate?.title_ja ?? null,
    ancestor_titles: matchedCandidate?.ancestor_titles ?? [],
  };
}

function searchQueryIdArraySchema(ids: string[]) {
  return {
    type: "array",
    maxItems: ids.length,
    items:
      ids.length > 0
        ? { type: "string", enum: ids }
        : { type: "string" },
  };
}

function buildSearchQueryReviewSchema(
  termIds: string[],
  ipcCodeIds: string[],
  cpcCodeIds: string[],
) {
  return {
    type: "object",
    additionalProperties: false,
    required: ["keyword_groups", "ipc_code_ids", "cpc_code_ids"],
    properties: {
      keyword_groups: {
        type: "array",
        minItems: 1,
        maxItems: MAX_QUERY_KEYWORD_GROUPS,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["term_ids"],
          properties: {
            term_ids: {
              type: "array",
              minItems: 1,
              maxItems: MAX_QUERY_TERMS_PER_GROUP,
              items: { type: "string", enum: termIds },
            },
          },
        },
      },
      ipc_code_ids: searchQueryIdArraySchema(ipcCodeIds),
      cpc_code_ids: searchQueryIdArraySchema(cpcCodeIds),
    },
  };
}

function selectedCodeValues(
  value: unknown,
  options: SearchQueryCodeOption[],
): string[] {
  const optionsById = new Map(options.map((option) => [option.id, option]));
  const selectedCodes = new Set<string>();

  for (const id of Array.isArray(value) ? value : []) {
    if (typeof id !== "string") continue;

    const option = optionsById.get(id);
    if (option) selectedCodes.add(option.code);
  }

  return Array.from(selectedCodes).sort((a, b) => a.localeCompare(b));
}

function assertValidSearchQueryReviewSelection(
  selection: SearchQueryReviewSelection,
  termOptions: SearchQueryTermOption[],
  ipcOptions: SearchQueryCodeOption[],
  cpcOptions: SearchQueryCodeOption[],
): void {
  const allowedTermIds = new Set(termOptions.map((option) => option.id));
  const allowedIpcIds = new Set(ipcOptions.map((option) => option.id));
  const allowedCpcIds = new Set(cpcOptions.map((option) => option.id));

  if (
    !Array.isArray(selection.keyword_groups) ||
    selection.keyword_groups.length === 0 ||
    selection.keyword_groups.length > MAX_QUERY_KEYWORD_GROUPS
  ) {
    throw new Error(
      "AI search-query review returned an invalid keyword-group count.",
    );
  }

  for (const group of selection.keyword_groups) {
    if (
      !Array.isArray(group?.term_ids) ||
      group.term_ids.length === 0 ||
      group.term_ids.length > MAX_QUERY_TERMS_PER_GROUP
    ) {
      throw new Error(
        "AI search-query review returned an invalid term-ID group.",
      );
    }

    for (const id of group.term_ids) {
      if (typeof id !== "string" || !allowedTermIds.has(id)) {
        throw new Error(
          "AI search-query review returned an unsupported term ID.",
        );
      }
    }
  }

  const validateCodeIds = (
    value: unknown,
    allowedIds: Set<string>,
    system: "IPC" | "CPC",
  ) => {
    if (!Array.isArray(value) || value.length > allowedIds.size) {
      throw new Error(
        `AI search-query review returned an invalid ${system} ID count.`,
      );
    }

    for (const id of value) {
      if (typeof id !== "string" || !allowedIds.has(id)) {
        throw new Error(
          `AI search-query review returned an unsupported ${system} ID.`,
        );
      }
    }
  };

  validateCodeIds(selection.ipc_code_ids, allowedIpcIds, "IPC");
  validateCodeIds(selection.cpc_code_ids, allowedCpcIds, "CPC");
}

function buildReviewedSearchQueriesFromIds(
  selection: SearchQueryReviewSelection,
  termOptions: SearchQueryTermOption[],
  ipcOptions: SearchQueryCodeOption[],
  cpcOptions: SearchQueryCodeOption[],
): Pick<SearchQueryStarter, "keywordQuery" | "classificationQuery"> {
  const termsById = new Map(
    termOptions.map((option) => [option.id, option.term]),
  );
  const seenTermIds = new Set<string>();
  const keywordGroups: string[][] = [];

  for (const group of Array.isArray(selection.keyword_groups)
    ? selection.keyword_groups
    : []) {
    const selectedTerms: string[] = [];

    for (const id of Array.isArray(group?.term_ids) ? group.term_ids : []) {
      if (
        typeof id !== "string" ||
        seenTermIds.has(id) ||
        !termsById.has(id)
      ) {
        continue;
      }

      seenTermIds.add(id);
      selectedTerms.push(termsById.get(id)!);

      if (selectedTerms.length >= MAX_QUERY_TERMS_PER_GROUP) {
        break;
      }
    }

    if (selectedTerms.length > 0) {
      keywordGroups.push(selectedTerms);
    }

    if (keywordGroups.length >= MAX_QUERY_KEYWORD_GROUPS) {
      break;
    }
  }

  if (keywordGroups.length === 0) {
    throw new Error(
      "AI search-query review returned no approved keyword groups.",
    );
  }

  const keywordQuery = keywordGroups
    .map((terms) => `(${terms.map((term) => `"${term}"`).join(" OR ")})`)
    .join(" AND ");
  const cpcCodes = selectedCodeValues(selection.cpc_code_ids, cpcOptions);

  return {
    keywordQuery,
    classificationQuery: buildGooglePatentsCpcQuery({
      IPC: [],
      CPC: cpcCodes,
    }),
  };
}

async function reviewSearchQueriesWithAi(
  result: AnalysisResult,
  apiKey: string,
): Promise<SearchQueryStarter> {
  const candidate = buildCandidateSearchQueryStarter(result);
  const allowedTerms = allowedSearchQueryTerms(result);
  const allowedCodes = allowedSearchQueryCodes(result);
  const termOptions: SearchQueryTermOption[] = allowedTerms.map(
    (term, index) => ({
      id: searchQueryOptionId("T", index),
      term,
    }),
  );
  const ipcOptions: SearchQueryCodeOption[] = [];
  const cpcOptions: SearchQueryCodeOption[] = allowedCodes.CPC.map(
    (code, index) => ({
      id: searchQueryOptionId("C", index),
      code,
      ...titleForSearchQueryCode(result, "CPC", code),
    }),
  );

  if (termOptions.length === 0) {
    throw new Error("No approved terms were available for AI query review.");
  }

  const termIdByValue = new Map(
    termOptions.map((option) => [
      option.term.normalize("NFKC").toLowerCase(),
      option.id,
    ]),
  );
  const cpcIdByCode = new Map(
    cpcOptions.map((option) => [
      normalizeClassificationCode(option.code),
      option.id,
    ]),
  );
  const candidateKeywordGroups = buildCandidateSearchQueryTermGroups(result)
    .map((terms) => ({
      term_ids: terms
        .map((term) =>
          termIdByValue.get(term.normalize("NFKC").toLowerCase()),
        )
        .filter((id): id is string => Boolean(id)),
    }))
    .filter((group) => group.term_ids.length > 0);
  const candidateIpcCodeIds: string[] = [];
  const candidateCpcCodeIds = allowedCodes.CPC
    .map((code) => cpcIdByCode.get(normalizeClassificationCode(code)))
    .filter((id): id is string => Boolean(id));
  const reviewSchema = buildSearchQueryReviewSchema(
    termOptions.map((option) => option.id),
    ipcOptions.map((option) => option.id),
    cpcOptions.map((option) => option.id),
  );
  const client = new OpenAI({ apiKey });
  const response = await client.responses.create({
    model: MODEL,
    input: [
      {
        role: "system",
        content: [
          {
            type: "input_text",
            text: `You review a patent-search query starter before it is shown to a user.
Select only the supplied option IDs. The server constructs all final query syntax and maps IDs to exact approved terms and database-verified codes.

Keyword selection rules:
- Return 1-${MAX_QUERY_KEYWORD_GROUPS} keyword_groups.
- Each group must contain 1-${MAX_QUERY_TERMS_PER_GROUP} term_ids that are retrieval alternatives for one concept.
- Preserve the essential inventive combination across groups.
- Remove redundant, overly generic, or technically unrelated terms.
- Never repeat a term ID in multiple groups.

Classification selection rules:
- Select only CPC IDs whose supplied titles materially match the technical concept.
- Every supplied classification ID has already passed the server's dominant-domain gate.
- Remove remote or merely lexical classifications.
- The server formats selected CPC IDs for Google Patents Advanced Search.
- An empty CPC selection is permitted when no sufficiently relevant CPC candidate exists.

Return only structured JSON matching the schema.`,
          },
        ],
      },
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: JSON.stringify({
              technical_concept: result.technical_concept,
              ranked_keywords: result.keywords
                .slice()
                .sort((a, b) => a.rank - b.rank)
                .slice(0, CANDIDATE_KEYWORD_LIMIT)
                .map((keyword) => ({
                  rank: keyword.rank,
                  term: keyword.term,
                  normalized_term: keyword.normalized_term,
                  synonyms: keyword.synonyms,
                  reason: keyword.reason,
                })),
              term_options: termOptions,
              ipc_options: ipcOptions,
              cpc_options: cpcOptions,
              candidate_selection: {
                keyword_groups: candidateKeywordGroups,
                ipc_code_ids: candidateIpcCodeIds,
                cpc_code_ids: candidateCpcCodeIds,
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
        schema: reviewSchema,
        strict: true,
      },
    },
  });

  if (!response.output_text) {
    throw new Error("OpenAI returned an empty search-query review.");
  }

  const selection = JSON.parse(
    response.output_text,
  ) as SearchQueryReviewSelection;
  assertValidSearchQueryReviewSelection(
    selection,
    termOptions,
    ipcOptions,
    cpcOptions,
  );
  const reviewedByAi = buildReviewedSearchQueriesFromIds(
    selection,
    termOptions,
    ipcOptions,
    cpcOptions,
  );

  const reviewed = {
    ...reviewedByAi,
    classificationQuery: buildGooglePatentsCpcQuery(allowedCodes),
  };
  const filteredCandidate = {
    keywordQuery: candidate.keywordQuery,
    classificationQuery: buildGooglePatentsCpcQuery(allowedCodes),
  };

  const reviewStatus: SearchQueryReviewStatus =
    reviewed.keywordQuery === filteredCandidate.keywordQuery &&
      reviewed.classificationQuery === filteredCandidate.classificationQuery
      ? "accepted"
      : "corrected";

  const starter: SearchQueryStarter = {
    ...reviewed,
    reviewStatus,
    reviewSummary:
      reviewStatus === "corrected"
        ? "AI reviewed and corrected the query structure or term selection before display."
        : "AI reviewed the generated queries and found no correction necessary.",
  };

  validatedSearchQueryStarters.add(starter);
  return starter;
}

function cleanTextList(value: unknown, limit: number): string[] {
  if (!Array.isArray(value)) return [];

  return Array.from(
    new Set(
      value
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  ).slice(0, limit);
}

function cleanTextOrList(value: unknown, limit: number): string[] {
  if (typeof value === "string") {
    const normalized = value.trim();
    return normalized ? [normalized] : [];
  }

  return cleanTextList(value, limit);
}

function normalizeTechnicalInterpretation(
  value: unknown,
  fallbackTerm: string,
): TechnicalInterpretation {
  const source =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};

  return {
    object_or_system: String(
      source.object_or_system ?? source.technical_object ?? fallbackTerm,
    ).trim(),
    purpose_or_problem: String(
      source.purpose_or_problem ?? source.purpose_or_effect ?? "",
    ).trim(),
    application_or_use: String(source.application_or_use ?? "").trim(),
    components: cleanTextOrList(source.components, 12),
    component_relationships: cleanTextOrList(
      source.component_relationships ?? source.structure_or_mechanism,
      12,
    ),
    material_or_composition: cleanTextOrList(
      source.material_or_composition ?? source.material_or_signal,
      10,
    ),
    manufacturing_or_processing_steps: cleanTextOrList(
      source.manufacturing_or_processing_steps,
      12,
    ),
    operation: String(source.operation ?? source.function ?? "").trim(),
    control_means: cleanTextOrList(source.control_means, 10),
    controlled_variables: cleanTextOrList(source.controlled_variables, 10),
    operating_conditions: cleanTextOrList(source.operating_conditions, 10),
    technical_effect: String(
      source.technical_effect ?? source.purpose_or_effect ?? "",
    ).trim(),
    context_terms: cleanTextList(source.context_terms, 8),
    search_phrases: cleanTextList(source.search_phrases, 6),
  };
}

function normalizeComparableText(value: string): string {
  return value.normalize("NFKC").toLowerCase().replace(/\s+/gu, " ").trim();
}


const LEADING_GENERIC_KEYWORD_MODIFIER =
  /^(?:(?:a|an|the|each|every|either|neither|any|some|several|many|few|multiple|various|respective|corresponding)\s+)+/iu;
const LEADING_QUANTITY_OF_PHRASE =
  /^(?:(?:a\s+)?plurality|pluralities|number|set|group|pair|series|sequence|collection)\s+of\s+/iu;
const LEADING_ENGLISH_COUNT = new RegExp(
  "^(?:(?:at\\s+least|at\\s+most|more\\s+than|less\\s+than|no\\s+more\\s+than|no\\s+less\\s+than|approximately|about|around|up\\s+to)\\s+)?(?:\\d+(?:\\.\\d+)?(?:st|nd|rd|th)?|zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|million|billion|first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth)(?:\\s+(?:or\\s+more|or\\s+fewer))?\\s+",
  "iu",
);

function normalizeKeywordHeadTerm(value: string): string {
  const original = value.normalize("NFKC").replace(/\s+/gu, " ").trim();
  let normalized = original;

  for (let pass = 0; pass < 4 && normalized; pass += 1) {
    const previous = normalized;
    normalized = normalized
      .replace(LEADING_GENERIC_KEYWORD_MODIFIER, "")
      .replace(LEADING_QUANTITY_OF_PHRASE, "")
      .replace(LEADING_ENGLISH_COUNT, "")
      .trim();

    if (normalized === previous) break;
  }

  return normalized || original;
}

function compactComparableText(value: string): string {
  return normalizeComparableText(value).replace(
    /[^a-z0-9\u3040-\u30ff\u3400-\u9fff]+/gu,
    "",
  );
}

function normalizeConceptFacets(value: unknown): TechnicalConceptFacet[] {
  if (!Array.isArray(value)) return [];

  const allowed = new Set<string>(TECHNICAL_CONCEPT_FACETS);
  return Array.from(
    new Set(
      value
        .filter((facet): facet is string => typeof facet === "string")
        .map((facet) => facet.trim())
        .filter((facet) => allowed.has(facet)),
    ),
  ).slice(0, 4) as TechnicalConceptFacet[];
}

function conceptFacetValues(
  concept: TechnicalInterpretation,
  facet: TechnicalConceptFacet,
): string[] {
  const value = concept[facet];
  return (Array.isArray(value) ? value : [value])
    .map((item) => String(item ?? "").trim())
    .filter(Boolean);
}

function conceptBasisForFacets(
  concept: TechnicalInterpretation,
  facets: TechnicalConceptFacet[],
): string[] {
  return Array.from(
    new Set(facets.flatMap((facet) => conceptFacetValues(concept, facet))),
  ).slice(0, 12);
}

function isGroundedExcerpt(excerpt: string, sourceText: string): boolean {
  const normalizedExcerpt = normalizeComparableText(excerpt);
  const normalizedSource = normalizeComparableText(sourceText);
  return (
    normalizedExcerpt.length >= 3 &&
    normalizedSource.includes(normalizedExcerpt)
  );
}

function evidenceContainsKeyword(
  evidence: string,
  term: string,
  normalizedTerm: string,
  synonyms: string[],
): boolean {
  const compactEvidence = compactComparableText(evidence);
  return [term, normalizedTerm, ...synonyms].some((variant) => {
    const compactVariant = compactComparableText(variant);
    return (
      compactVariant.length >= 2 && compactEvidence.includes(compactVariant)
    );
  });
}

function comparisonTokens(value: string): Set<string> {
  const normalized = normalizeComparableText(value);
  const tokens =
    normalized.match(/[a-z0-9]{3,}|[\u3040-\u30ff\u3400-\u9fff]{2,}/gu) ?? [];
  const expanded = new Set<string>();

  for (const token of tokens) {
    expanded.add(token);
    if (/^[\u3040-\u30ff\u3400-\u9fff]+$/u.test(token) && token.length > 2) {
      for (let index = 0; index < token.length - 1; index += 1) {
        expanded.add(token.slice(index, index + 2));
      }
    }
  }

  return expanded;
}

function hasMeaningfulTextOverlap(left: string, right: string): boolean {
  const compactLeft = compactComparableText(left);
  const compactRight = compactComparableText(right);

  if (
    compactLeft.length >= 3 &&
    compactRight.length >= 3 &&
    (compactLeft.includes(compactRight) || compactRight.includes(compactLeft))
  ) {
    return true;
  }

  const leftTokens = comparisonTokens(left);
  const rightTokens = comparisonTokens(right);
  return Array.from(leftTokens).some((token) => rightTokens.has(token));
}

function overlapScore(left: string, right: string): number {
  const leftTokens = comparisonTokens(left);
  const rightTokens = comparisonTokens(right);
  let score = 0;

  for (const token of leftTokens) {
    if (rightTokens.has(token)) score += 1;
  }

  return score;
}

function selectRelevantConceptBasis(
  candidates: string[],
  term: string,
  normalizedTerm: string,
  synonyms: string[],
  sourceEvidence: string[],
): string[] {
  return candidates
    .map((basis, index) => {
      const containsKeyword = evidenceContainsKeyword(
        basis,
        term,
        normalizedTerm,
        synonyms,
      );
      const evidenceScore = Math.max(
        0,
        ...sourceEvidence.map((evidence) => overlapScore(basis, evidence)),
      );

      return {
        basis,
        index,
        score: (containsKeyword ? 10 : 0) + Math.min(6, evidenceScore),
      };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, 3)
    .map((item) => item.basis);
}

function isMeaningfulSelectionReason(
  reason: string,
  term: string,
  normalizedTerm: string,
  synonyms: string[],
  conceptBasis: string[],
): boolean {
  const normalizedReason = normalizeComparableText(reason);
  if (normalizedReason.length < 40 || normalizedReason.length > 600) {
    return false;
  }

  if (
    /selected because|input (explicitly )?states|concept('?s)? facet|source evidence/iu.test(
      normalizedReason,
    )
  ) {
    return false;
  }

  return (
    evidenceContainsKeyword(reason, term, normalizedTerm, synonyms) &&
    conceptBasis.some((basis) => hasMeaningfulTextOverlap(reason, basis))
  );
}

function rationaleFocus(facets: TechnicalConceptFacet[]): string {
  if (facets.includes("component_relationships")) {
    return "relationship between components";
  }
  if (facets.includes("operation")) return "technical operation";
  if (facets.includes("control_means")) return "control mechanism";
  if (facets.includes("controlled_variables")) return "controlled variable";
  if (facets.includes("technical_effect")) return "technical effect";
  if (facets.includes("manufacturing_or_processing_steps")) {
    return "processing step";
  }
  if (facets.includes("material_or_composition")) {
    return "material or composition role";
  }
  if (facets.includes("operating_conditions")) return "operating condition";
  if (facets.includes("purpose_or_problem")) return "technical purpose";
  if (facets.includes("application_or_use")) return "technical application";
  if (facets.includes("components")) return "component role";
  return "object or system role";
}

function buildGroundedSelectionReason(
  term: string,
  conceptFacets: TechnicalConceptFacet[],
  conceptBasis: string[],
  sourceEvidence: string[],
): string {
  const evidence = sourceEvidence
    .map((excerpt, index) => ({
      excerpt,
      index,
      score: Math.max(
        0,
        ...conceptBasis.map((basis) => overlapScore(basis, excerpt)),
      ),
    }))
    .sort((a, b) => b.score - a.score || a.index - b.index)[0]?.excerpt;

  if (!term || !evidence) return "";

  const focus = rationaleFocus(conceptFacets);
  const reason = `“${term}” is grounded in this disclosed ${focus}: “${evidence}”. This specific role makes the term useful for retrieving patents with the same disclosed ${focus}.`;

  if (reason.length <= 600) return reason;

  return `The exact excerpt “${evidence}” grounds this keyword in a concrete ${focus}. That disclosed role makes the keyword useful for focused patent retrieval.`;
}

function normalizeResult(
  result: AnalysisResult,
  sourceText: string,
  warning?: string,
): AnalysisResult {
  const fallbackConceptTerm = Array.isArray(result.keywords)
    ? String(
      result.keywords[0]?.normalized_term ?? result.keywords[0]?.term ?? "",
    ).trim()
    : "";
  const technicalConcept = normalizeTechnicalInterpretation(
    result.technical_concept,
    fallbackConceptTerm,
  );
  const normalizedKeywords = (
    Array.isArray(result.keywords) ? result.keywords : []
  )
    .map((keyword) => {
      const confidence: Confidence =
        keyword.classification_confidence === "high" ||
          keyword.classification_confidence === "medium" ||
          keyword.classification_confidence === "low"
          ? keyword.classification_confidence
          : "low";

      const rawNormalizedTerm = String(keyword.normalized_term ?? "").trim();
      const rawTerm = String(keyword.term ?? "").trim();
      const term = normalizeKeywordHeadTerm(rawTerm);
      const normalizedTerm = normalizeKeywordHeadTerm(
        rawNormalizedTerm || term,
      );
      const excludedSynonyms = new Set(
        [term, normalizedTerm]
          .map((value) => value.normalize("NFKC").toLowerCase())
          .filter(Boolean),
      );
      const synonyms = cleanTextList(keyword.synonyms, 8).filter(
        (synonym) =>
          !excludedSynonyms.has(synonym.normalize("NFKC").toLowerCase()),
      );
      const conceptFacets = normalizeConceptFacets(keyword.concept_facets);
      const completeConceptBasis = conceptBasisForFacets(
        technicalConcept,
        conceptFacets,
      );
      const sourceEvidence = cleanTextList(keyword.source_evidence, 2).filter(
        (evidence) =>
          isGroundedExcerpt(evidence, sourceText) &&
          evidenceContainsKeyword(evidence, term, normalizedTerm, synonyms) &&
          completeConceptBasis.some((basis) =>
            hasMeaningfulTextOverlap(basis, evidence),
          ),
      );
      const conceptBasis = selectRelevantConceptBasis(
        completeConceptBasis,
        term,
        normalizedTerm,
        synonyms,
        sourceEvidence,
      );
      const keywordRepresentedInConcept = conceptBasis.some((basis) =>
        evidenceContainsKeyword(basis, term, normalizedTerm, synonyms),
      );
      const conceptLinked =
        conceptBasis.length > 0 &&
        sourceEvidence.length > 0 &&
        keywordRepresentedInConcept &&
        conceptBasis.some((basis) =>
          sourceEvidence.some((evidence) =>
            hasMeaningfulTextOverlap(basis, evidence),
          ),
        );
      const reason = conceptLinked
        ? buildGroundedSelectionReason(
          term || normalizedTerm,
          conceptFacets,
          conceptBasis,
          sourceEvidence,
        )
        : "";

      return {
        term,
        normalized_term: normalizedTerm,
        synonyms,
        concept_facets: conceptFacets,
        concept_basis: conceptBasis,
        source_evidence: sourceEvidence,
        count: Math.max(1, Math.trunc(Number(keyword.count) || 1)),
        rank: Math.max(1, Math.trunc(Number(keyword.rank) || 1)),
        // Classification codes are never accepted from model output.
        ipc: [],
        cpc: [],
        fi: [],
        f_term: [],
        classification_confidence: confidence,
        // The displayed rationale is server-built from an exact grounded excerpt;
        // free-form model prose is never returned or used for credit validation.
        reason,
        classification_reason: "Pending catalog retrieval.",
      };
    })
    .filter(
      (keyword) =>
        (keyword.term || keyword.normalized_term) &&
        keyword.concept_facets.length > 0 &&
        keyword.concept_basis.length > 0 &&
        keyword.source_evidence.length > 0 &&
        Boolean(keyword.reason),
    )
    .sort((a, b) => b.count - a.count || a.rank - b.rank)
    .map((keyword, index) => ({ ...keyword, rank: index + 1 }));

  return {
    language: result.language === "ja" ? "ja" : "en",
    technical_concept: technicalConcept,
    keywords: normalizedKeywords,
    analysisSchemaVersion: ANALYSIS_SCHEMA_VERSION,
    ...(warning ? { warning } : {}),
  };
}

function verifiedEvidenceMatchesCodes(
  codes: string[],
  evidence: ClassificationCodeEvidence[] | undefined,
): boolean {
  if (!Array.isArray(evidence)) return false;

  const normalizedCodes = uniqueCodes(codes)
    .map(normalizeClassificationCode)
    .sort();
  const normalizedEvidenceCodes = uniqueCodes(evidence.map((item) => item.code))
    .map(normalizeClassificationCode)
    .sort();

  return (
    evidence.every((item) => item.status === "database_verified") &&
    normalizedCodes.length === normalizedEvidenceCodes.length &&
    normalizedCodes.every(
      (code, index) => code === normalizedEvidenceCodes[index],
    )
  );
}

function isValidTechnicalConcept(
  concept: TechnicalInterpretation | undefined,
): boolean {
  return Boolean(
    concept &&
    concept.object_or_system.trim() &&
    concept.purpose_or_problem.trim() &&
    concept.application_or_use.trim() &&
    concept.operation.trim() &&
    concept.technical_effect.trim() &&
    Array.isArray(concept.components) &&
    concept.components.length > 0 &&
    Array.isArray(concept.component_relationships) &&
    concept.component_relationships.length > 0 &&
    Array.isArray(concept.material_or_composition) &&
    Array.isArray(concept.manufacturing_or_processing_steps) &&
    Array.isArray(concept.control_means) &&
    Array.isArray(concept.controlled_variables) &&
    Array.isArray(concept.operating_conditions) &&
    Array.isArray(concept.context_terms) &&
    Array.isArray(concept.search_phrases),
  );
}

function sameNormalizedTextSet(left: string[], right: string[]): boolean {
  const normalize = (values: string[]) =>
    Array.from(new Set(values.map(normalizeComparableText))).sort();
  const normalizedLeft = normalize(left);
  const normalizedRight = normalize(right);
  return (
    normalizedLeft.length === normalizedRight.length &&
    normalizedLeft.every((value, index) => value === normalizedRight[index])
  );
}

function validateAnalysisReadyForCharge(
  result: AnalysisResult,
  sourceText: string,
): void {
  const validLanguage = result.language === "en" || result.language === "ja";
  const validSchemaVersion =
    result.analysisSchemaVersion === ANALYSIS_SCHEMA_VERSION;
  const validTechnicalConcept = isValidTechnicalConcept(
    result.technical_concept,
  );
  const validKeywordCount =
    Array.isArray(result.keywords) &&
    result.keywords.length > 0 &&
    result.keywords.length <= 40;
  const validSearchQueryStarter = Boolean(
    result.search_query_starter &&
    validatedSearchQueryStarters.has(result.search_query_starter) &&
    (result.search_query_starter.reviewStatus === "accepted" ||
      result.search_query_starter.reviewStatus === "corrected") &&
    result.search_query_starter.reviewSummary.trim(),
  );

  const validKeywords =
    validKeywordCount &&
    result.keywords.every(
      (keyword) =>
        Boolean(keyword.term.trim()) &&
        Boolean(keyword.normalized_term.trim()) &&
        Array.isArray(keyword.synonyms) &&
        keyword.synonyms.length > 0 &&
        keyword.synonyms.length <= 8 &&
        keyword.synonyms.every((synonym) => Boolean(synonym.trim())) &&
        Array.isArray(keyword.concept_facets) &&
        keyword.concept_facets.length > 0 &&
        keyword.concept_facets.length <= 3 &&
        keyword.concept_facets.every((facet) =>
          TECHNICAL_CONCEPT_FACETS.includes(facet),
        ) &&
        Array.isArray(keyword.concept_basis) &&
        keyword.concept_basis.length > 0 &&
        sameNormalizedTextSet(
          keyword.concept_basis,
          selectRelevantConceptBasis(
            conceptBasisForFacets(
              result.technical_concept,
              keyword.concept_facets,
            ),
            keyword.term,
            keyword.normalized_term,
            keyword.synonyms,
            keyword.source_evidence,
          ),
        ) &&
        keyword.concept_basis.some((basis) =>
          evidenceContainsKeyword(
            basis,
            keyword.term,
            keyword.normalized_term,
            keyword.synonyms,
          ),
        ) &&
        Array.isArray(keyword.source_evidence) &&
        keyword.source_evidence.length > 0 &&
        keyword.source_evidence.length <= 2 &&
        keyword.source_evidence.every(
          (evidence) =>
            isGroundedExcerpt(evidence, sourceText) &&
            evidenceContainsKeyword(
              evidence,
              keyword.term,
              keyword.normalized_term,
              keyword.synonyms,
            ) &&
            keyword.concept_basis.some((basis) =>
              hasMeaningfulTextOverlap(basis, evidence),
            ),
        ) &&
        Number.isInteger(keyword.count) &&
        keyword.count > 0 &&
        Number.isInteger(keyword.rank) &&
        keyword.rank > 0 &&
        Array.isArray(keyword.ipc) &&
        Array.isArray(keyword.cpc) &&
        Array.isArray(keyword.fi) &&
        Array.isArray(keyword.f_term) &&
        Array.isArray(keyword.ipc_evidence) &&
        Array.isArray(keyword.cpc_evidence) &&
        Array.isArray(keyword.fi_evidence) &&
        Array.isArray(keyword.f_term_evidence) &&
        verifiedEvidenceMatchesCodes(keyword.ipc, keyword.ipc_evidence) &&
        verifiedEvidenceMatchesCodes(keyword.cpc, keyword.cpc_evidence) &&
        verifiedEvidenceMatchesCodes(keyword.fi, keyword.fi_evidence) &&
        keyword.f_term_evidence.every(
          (evidence) => evidence.status === "database_verified",
        ) &&
        Array.isArray(keyword.ipc_candidates) &&
        Array.isArray(keyword.cpc_candidates) &&
        Array.isArray(keyword.fi_candidates) &&
        Array.isArray(keyword.f_term_candidates) &&
        keyword.ipc_candidates.every(
          (candidate) => candidate.system === "IPC",
        ) &&
        keyword.cpc_candidates.every(
          (candidate) => candidate.system === "CPC",
        ) &&
        keyword.fi_candidates.every((candidate) => candidate.system === "FI") &&
        Boolean(keyword.classification_route) &&
        Array.isArray(keyword.classification_route?.ipc_cpc_area) &&
        keyword.classification_route!.ipc_cpc_area.every(
          (area) =>
            (area.system === "IPC" || area.system === "CPC") &&
            area.status === "database_verified",
        ) &&
        Array.isArray(keyword.classification_route?.fi_subdivisions) &&
        keyword.classification_route!.fi_subdivisions.every(
          (subdivision) =>
            subdivision.fi.system === "FI" &&
            subdivision.fi.status === "database_verified" &&
            subdivision.parent_area_codes.length > 0 &&
            subdivision.f_term_themes.every(
              (theme) =>
                Boolean(theme.theme_code) &&
                theme.fi_codes.length > 0 &&
                theme.aspects.every(
                  (aspect) =>
                    aspect.system === "F-term" &&
                    aspect.status === "database_verified",
                ),
            ),
        ) &&
        (keyword.classification_confidence === "high" ||
          keyword.classification_confidence === "medium" ||
          keyword.classification_confidence === "low") &&
        isMeaningfulSelectionReason(
          keyword.reason,
          keyword.term,
          keyword.normalized_term,
          keyword.synonyms,
          keyword.concept_basis,
        ) &&
        Boolean(keyword.classification_reason.trim()),
    );

  if (
    !validLanguage ||
    !validSchemaVersion ||
    !validTechnicalConcept ||
    !validKeywords ||
    !validSearchQueryStarter
  ) {
    throw new HttpError(
      502,
      "Analysis did not produce a complete valid result. No credit was consumed.",
    );
  }

  try {
    JSON.stringify(result);
  } catch (serializationError) {
    console.error(
      "Analysis response serialization check failed:",
      serializationError,
    );

    throw new HttpError(
      502,
      "Analysis result could not be prepared for delivery. No credit was consumed.",
    );
  }
}

function appendWarning(
  currentWarning: string | undefined,
  additionalWarning: string,
): string {
  return currentWarning
    ? `${currentWarning} ${additionalWarning}`
    : additionalWarning;
}

async function loadCatalogRowsForCodes(
  adminClient: SupabaseClient,
  system: CatalogClassificationSystem,
  codes: string[],
): Promise<Map<string, ClassificationCandidate>> {
  // Recheck every exposed code against the catalog's normalized key. Catalog
  // imports and RPC results can format the same stored code with different
  // spaces or punctuation, so an exact comparison on `code` can falsely reject
  // a database-backed result. This still fails closed: no model-provided code
  // is accepted unless a row with the same normalized code and system exists.
  const normalizedCatalogCodes = Array.from(
    new Set(uniqueCodes(codes).map(normalizeCatalogLookupCode).filter(Boolean)),
  );
  const rowsByCode = new Map<string, ClassificationCandidate>();

  for (let start = 0; start < normalizedCatalogCodes.length; start += 100) {
    const codeBatch = normalizedCatalogCodes.slice(start, start + 100);

    const { data, error } = await adminClient
      .from("classification_titles")
      .select(
        "system, code, normalized_code, title_en, title_ja, parent_code, hierarchy_level, edition",
      )
      .eq("system", system)
      .in("normalized_code", codeBatch)
      .order("edition", { ascending: false });

    if (error) {
      throw new Error(`${system} code lookup failed: ${error.message}`);
    }

    for (const rawRow of data ?? []) {
      const row = rawRow as Omit<ClassificationCandidate, "similarity_score">;
      const normalizedCode =
        normalizeClassificationCode(row.normalized_code ?? "") ||
        normalizeClassificationCode(row.code);

      if (!rowsByCode.has(normalizedCode)) {
        rowsByCode.set(normalizedCode, {
          ...row,
          system,
          similarity_score: 0,
        });
      }
    }
  }

  return rowsByCode;
}
async function enrichClassificationCandidatesWithAncestors(
  adminClient: SupabaseClient,
  system: CatalogClassificationSystem,
  candidates: ClassificationCandidate[],
): Promise<ClassificationCandidate[]> {
  if (candidates.length === 0) {
    return candidates;
  }

  const parentCodes = Array.from(
    new Set(
      candidates
        .map((candidate) => candidate.parent_code?.trim() ?? "")
        .filter(Boolean),
    ),
  );

  const parentRows = await loadCatalogRowsForCodes(
    adminClient,
    system,
    parentCodes,
  );

  const grandparentCodes = Array.from(
    new Set(
      Array.from(parentRows.values())
        .map((parent) => parent.parent_code?.trim() ?? "")
        .filter(Boolean),
    ),
  );

  const grandparentRows = await loadCatalogRowsForCodes(
    adminClient,
    system,
    grandparentCodes,
  );
  const greatGrandparentCodes = Array.from(
    new Set(
      Array.from(grandparentRows.values())
        .map((grandparent) => grandparent.parent_code?.trim() ?? "")
        .filter(Boolean),
    ),
  );

  const greatGrandparentRows = await loadCatalogRowsForCodes(
    adminClient,
    system,
    greatGrandparentCodes,
  );
  return candidates.map((candidate) => {
    const parent = candidate.parent_code
      ? parentRows.get(normalizeClassificationCode(candidate.parent_code))
      : undefined;

    const grandparent = parent?.parent_code
      ? grandparentRows.get(normalizeClassificationCode(parent.parent_code))
      : undefined;
    const greatGrandparent = grandparent?.parent_code
      ? greatGrandparentRows.get(
        normalizeClassificationCode(grandparent.parent_code),
      )
      : undefined;
    const ancestorTitles = Array.from(
      new Set(
        [
          parent?.title_en ?? "",
          parent?.title_ja ?? "",
          grandparent?.title_en ?? "",
          grandparent?.title_ja ?? "",
          greatGrandparent?.title_en ?? "",
          greatGrandparent?.title_ja ?? "",
        ]
          .map((title) => title.trim())
          .filter(Boolean),
      ),
    );

    return {
      ...candidate,
      ancestor_titles: ancestorTitles,
    };
  });
}
function addCatalogCodes(
  target: Record<CatalogClassificationSystem, string[]>,
  system: CatalogClassificationSystem,
  codes: unknown,
): void {
  target[system].push(...uniqueCodes(codes));
}

function collectExposedCatalogCodes(
  result: AnalysisResult,
): Record<CatalogClassificationSystem, string[]> {
  const codes: Record<CatalogClassificationSystem, string[]> = {
    IPC: [],
    CPC: [],
    FI: [],
  };

  for (const keyword of result.keywords) {
    addCatalogCodes(codes, "IPC", keyword.ipc);
    addCatalogCodes(codes, "CPC", keyword.cpc);
    addCatalogCodes(codes, "FI", keyword.fi);
    addCatalogCodes(
      codes,
      "IPC",
      keyword.ipc_evidence?.map((item) => item.code),
    );
    addCatalogCodes(
      codes,
      "CPC",
      keyword.cpc_evidence?.map((item) => item.code),
    );
    addCatalogCodes(
      codes,
      "FI",
      keyword.fi_evidence?.map((item) => item.code),
    );
    addCatalogCodes(
      codes,
      "IPC",
      keyword.ipc_candidates?.map((item) => item.code),
    );
    addCatalogCodes(
      codes,
      "CPC",
      keyword.cpc_candidates?.map((item) => item.code),
    );
    addCatalogCodes(
      codes,
      "FI",
      keyword.fi_candidates?.map((item) => item.code),
    );

    for (const area of keyword.classification_route?.ipc_cpc_area ?? []) {
      if (area.system === "IPC" || area.system === "CPC") {
        addCatalogCodes(codes, area.system, [area.code]);
      }
    }

    for (const subdivision of keyword.classification_route?.fi_subdivisions ??
      []) {
      addCatalogCodes(codes, "FI", [subdivision.fi.code]);

      for (const theme of subdivision.f_term_themes) {
        addCatalogCodes(codes, "FI", theme.fi_codes);
      }
    }
  }

  return {
    IPC: uniqueCodes(codes.IPC),
    CPC: uniqueCodes(codes.CPC),
    FI: uniqueCodes(codes.FI),
  };
}

async function assertCatalogBackedClassificationCodes(
  adminClient: SupabaseClient,
  result: AnalysisResult,
): Promise<void> {
  const exposedCodes = collectExposedCatalogCodes(result);
  const systems: CatalogClassificationSystem[] = ["IPC", "CPC", "FI"];
  const catalogRows = await Promise.all(
    systems.map((system) =>
      loadCatalogRowsForCodes(adminClient, system, exposedCodes[system]),
    ),
  );

  for (let index = 0; index < systems.length; index += 1) {
    const system = systems[index];
    const rows = catalogRows[index];
    const missingCodes = exposedCodes[system].filter(
      (code) => !rows.has(normalizeClassificationCode(code)),
    );

    if (missingCodes.length > 0) {
      throw new Error(
        `${system} catalog integrity check rejected codes absent from classification_titles: ${missingCodes.join(", ")}`,
      );
    }
  }
}

function candidateTitle(candidate: ClassificationCandidate): string {
  return `${candidate.title_en ?? ""} ${candidate.title_ja ?? ""} ${candidate.theme_title_en ?? ""} ${candidate.theme_title_ja ?? ""}`
    .trim()
    .toLowerCase();
}

function technicalTokens(text: string): string[] {
  const normalized = text.normalize("NFKC").toLowerCase();
  const latinTokens = normalized.match(/[a-z0-9][a-z0-9-]{2,}/g) ?? [];
  const japaneseRuns =
    normalized.match(/[\u3040-\u30ff\u3400-\u9fff]{2,}/g) ?? [];
  const japaneseBigrams = japaneseRuns.flatMap((run) =>
    Array.from({ length: Math.max(0, run.length - 1) }, (_, index) =>
      run.slice(index, index + 2),
    ),
  );

  return Array.from(new Set([...latinTokens, ...japaneseBigrams]));
}

const GENERIC_CLASSIFICATION_CONTEXT_TOKENS = new Set([
  "and",
  "or",
  "the",
  "for",
  "that",
  "this",
  "are",
  "system",
  "systems",
  "device",
  "devices",
  "method",
  "methods",
  "apparatus",
  "apparatuses",
  "unit",
  "units",
  "component",
  "components",
  "element",
  "elements",
  "means",
  "use",
  "uses",
  "using",
  "include",
  "includes",
  "including",
  "comprising",
  "comprises",
  "configured",
  "technical",
  "operation",
  "operations",
  "processing",
  "effect",
  "effects",
  "based",
  "with",
  "from",
  "into",
  "through",
  "between",
  "within",
  "where",
  "when",
  "while",
  "each",
  "respective",
  "corresponding",
  "detect",
  "detects",
  "detected",
  "move",
  "moves",
  "moving",
  "travel",
  "travels",
  "monitor",
  "monitors",
  "monitoring",
  "condition",
  "conditions",
  "status",
]);

function classificationTokenFamilyKey(token: string): string {
  const normalized = token.normalize("NFKC").trim().toLowerCase();

  if (!/^[a-z][a-z0-9-]*$/u.test(normalized) || normalized.length <= 3) {
    return normalized;
  }

  if (normalized.endsWith("ies") && normalized.length > 4) {
    return `${normalized.slice(0, -3)}y`;
  }

  if (
    (normalized.endsWith("sses") ||
      normalized.endsWith("ches") ||
      normalized.endsWith("shes") ||
      normalized.endsWith("xes") ||
      normalized.endsWith("zes")) &&
    normalized.length > 4
  ) {
    return normalized.slice(0, -2);
  }

  if (normalized.endsWith("s") && !normalized.endsWith("ss")) {
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
  const normalizedTokens = technicalTokens(keyword.normalized_term);

  if (normalizedTokens.length > 0) {
    const latinTokens = normalizedTokens.filter((token) =>
      /^[a-z][a-z0-9-]*$/u.test(token)
    );

    if (latinTokens.length > 0) {
      addTokens([latinTokens[latinTokens.length - 1]]);
    } else if (normalizedTokens.length === 1) {
      addTokens(normalizedTokens);
    }
  }
  for (const synonym of keyword.synonyms) {
    const tokens = technicalTokens(synonym);
    if (tokens.length === 0) continue;

    const latinTokens = tokens.filter((token) =>
      /^[a-z][a-z0-9-]*$/u.test(token),
    );

    if (latinTokens.length > 0) {
      // The head noun is part of the keyword identity. Domain modifiers such as
      // "elevator" and "lift" remain eligible as independent context.
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
      !/^\d+$/u.test(token)
    );
  });
}

function candidateTokenFamilyKeys(
  candidate: ClassificationCandidate,
): Set<string> {
  return new Set(
    technicalTokens(candidateTitle(candidate))
      .map(classificationTokenFamilyKey)
      .filter(Boolean),
  );
}
function candidateHierarchyTokenFamilyKeys(
  candidate: ClassificationCandidate,
): Set<string> {
  return new Set([
    ...candidateTokenFamilyKeys(candidate),
    ...(candidate.ancestor_titles ?? []).flatMap((title) =>
      technicalTokens(title)
        .map(classificationTokenFamilyKey)
        .filter(Boolean),
    ),
  ]);
}
function technicalTokenFamilyKeys(value: string): string[] {
  return Array.from(
    new Set(
      technicalTokens(value)
        .filter(
          (token) => !GENERIC_CLASSIFICATION_CONTEXT_TOKENS.has(token),
        )
        .map(classificationTokenFamilyKey)
        .filter(Boolean),
    ),
  );
}

function candidateSupportsTerm(
  candidate: ClassificationCandidate,
  term: string,
): boolean {
  const termKeys = technicalTokenFamilyKeys(term);
  if (termKeys.length === 0) return false;

  const candidateKeys = candidateTokenFamilyKeys(candidate);
  const hits = termKeys.filter((key) => candidateKeys.has(key)).length;
  const coverage = hits / termKeys.length;

  return termKeys.length === 1 ? hits === 1 : coverage >= 0.67;
}

function candidateAnchorHits(
  candidate: ClassificationCandidate,
  anchorTokens: string[],
): string[] {
  const candidateKeys = candidateTokenFamilyKeys(candidate);

  return anchorTokens.filter((token) => {
    const key = classificationTokenFamilyKey(token);
    return Boolean(key) && candidateKeys.has(key);
  });
}

function candidateContextAnchorHits(
  candidate: ClassificationCandidate,
  contextAnchorTokens: string[],
): string[] {
  return candidateAnchorHits(candidate, contextAnchorTokens);
}

function candidateDomainAnchorHits(
  candidate: ClassificationCandidate,
  domainAnchorTokens: string[],
): string[] {
  return candidateAnchorHits(candidate, domainAnchorTokens);
}

function hasStrongMultiwordSearchSupport(
  candidate: ClassificationCandidate,
  searchTerms: string[],
): boolean {
  return searchTerms.some((term) => {
    const keys = technicalTokenFamilyKeys(term);
    return keys.length >= 2 && candidateSupportsTerm(candidate, term);
  });
}
function candidateHasHighTechnicalTitleCoverage(
  candidate: ClassificationCandidate,
  searchTerms: string[],
  rankingTerms: string[],
): boolean {
  const candidateKeys = technicalTokenFamilyKeys(candidateTitle(candidate));

  if (candidateKeys.length < 2) {
    return false;
  }

  const supportedKeys = new Set(
    [...searchTerms, ...rankingTerms].flatMap(technicalTokenFamilyKeys),
  );

  const supportedCount = candidateKeys.filter((key) =>
    supportedKeys.has(key),
  ).length;

  return supportedCount / candidateKeys.length >= 0.8;
}
function candidatePassesContextGate(
  candidate: ClassificationCandidate,
  contextAnchorTokens: string[],
  searchTerms: string[],
  rankingTerms: string[],
): boolean {
  if (contextAnchorTokens.length === 0) {
    return hasStrongMultiwordSearchSupport(candidate, searchTerms);
  }

  if (candidateContextAnchorHits(candidate, contextAnchorTokens).length > 0) {
    return true;
  }

  const hierarchyKeys = candidateHierarchyTokenFamilyKeys(candidate);
  const hierarchyContextHitCount = contextAnchorTokens.filter((token) => {
    const key = classificationTokenFamilyKey(token);
    return Boolean(key) && hierarchyKeys.has(key);
  }).length;

  return (
    hasStrongMultiwordSearchSupport(candidate, searchTerms) &&
    (
      candidateHasHighTechnicalTitleCoverage(
        candidate,
        searchTerms,
        rankingTerms,
      ) ||
      hierarchyContextHitCount > 0
    )
  );
}

const GENERIC_CLASSIFICATION_KEYWORD_HEADS = new Set([
  'object', 'sensor', 'detector', 'controller', 'processor', 'module', 'unit',
  'device', 'system', 'signal', 'data', 'camera', 'motor', 'actuator',
  'interface', 'circuit', 'network', 'component', 'element', 'mechanism',
  'apparatus', 'memory', 'terminal', 'server', 'client', 'control', 'position',
]);

function keywordHeadFamilyKey(keyword: KeywordClassification): string {
  const preferredTokens = technicalTokens(
    keyword.normalized_term || keyword.term,
  ).filter((token) => /^[a-z][a-z0-9-]*$/u.test(token));
  const fallbackTokens = technicalTokens(keyword.term).filter((token) =>
    /^[a-z][a-z0-9-]*$/u.test(token),
  );
  const tokens = preferredTokens.length > 0 ? preferredTokens : fallbackTokens;
  const head = tokens[tokens.length - 1] ?? '';
  return classificationTokenFamilyKey(head);
}

function isGenericClassificationKeyword(
  keyword: KeywordClassification,
): boolean {
  const preferredTokens = technicalTokens(
    keyword.normalized_term || keyword.term,
  ).filter((token) => /^[a-z][a-z0-9-]*$/u.test(token));

  const fallbackTokens = technicalTokens(keyword.term).filter((token) =>
    /^[a-z][a-z0-9-]*$/u.test(token),
  );

  const tokens =
    preferredTokens.length > 0 ? preferredTokens : fallbackTokens;

  const familyKeys = tokens
    .map(classificationTokenFamilyKey)
    .filter(Boolean);

  if (familyKeys.length === 0) return false;

  const head = familyKeys[familyKeys.length - 1];

  if (!GENERIC_CLASSIFICATION_KEYWORD_HEADS.has(head)) {
    return false;
  }

  if (familyKeys.length === 1) {
    return true;
  }

  return familyKeys.every((key) =>
    GENERIC_CLASSIFICATION_KEYWORD_HEADS.has(key),
  );
}

function classificationDomainAnchorTokens(
  keyword: KeywordClassification,
  technicalConcept: TechnicalInterpretation,
): string[] {
  const keywordIdentityKeys = keywordIdentityTokenKeys(keyword);
  const primaryValues = [
    technicalConcept.application_or_use,
    technicalConcept.object_or_system,
  ];
  const fallbackValues = technicalConcept.context_terms;

  const collect = (values: string[]) =>
    Array.from(new Set(values.flatMap((value) => technicalTokens(value))))
      .filter((token) => {
        const key = classificationTokenFamilyKey(token);
        return (
          Boolean(key) &&
          !keywordIdentityKeys.has(key) &&
          !GENERIC_CLASSIFICATION_CONTEXT_TOKENS.has(token) &&
          !/^\d+$/u.test(token)
        );
      })
      .slice(0, 12);

  const primary = collect(primaryValues);
  return primary.length > 0 ? primary : collect(fallbackValues);
}
function candidateAncestorDomainAnchorHits(
  candidate: ClassificationCandidate,
  domainAnchorTokens: string[],
): string[] {
  const ancestorKeys = new Set(
    (candidate.ancestor_titles ?? [])
      .flatMap(technicalTokenFamilyKeys),
  );

  return domainAnchorTokens.filter((token) => {
    const key = classificationTokenFamilyKey(token);
    return Boolean(key) && ancestorKeys.has(key);
  });
}
const WEAK_CLASSIFICATION_DOMAIN_ANCHORS = new Set(
  [
    "analysis",
    "recognition",
  ].map(classificationTokenFamilyKey),
);

function candidateStrongAncestorDomainAnchorHits(
  candidate: ClassificationCandidate,
  domainAnchorTokens: string[],
): string[] {
  return candidateAncestorDomainAnchorHits(
    candidate,
    domainAnchorTokens,
  ).filter((token) => {
    const key = classificationTokenFamilyKey(token);

    return (
      Boolean(key) &&
      !WEAK_CLASSIFICATION_DOMAIN_ANCHORS.has(key)
    );
  });
}
function candidatePassesDomainGate(
  candidate: ClassificationCandidate,
  domainAnchorTokens: string[],
  genericKeyword: boolean,
  searchTerms: string[],
): boolean {
  if (domainAnchorTokens.length === 0) {
    return !genericKeyword;
  }

  const domainKeys = Array.from(
    new Set(
      domainAnchorTokens
        .map(classificationTokenFamilyKey)
        .filter(Boolean),
    ),
  );

  const leafKeys = candidateTokenFamilyKeys(candidate);
  const leafHitCount = domainKeys.filter((key) =>
    leafKeys.has(key)
  ).length;
  const ancestorDomainHitCount =
    candidateAncestorDomainAnchorHits(
      candidate,
      domainAnchorTokens,
    ).length;
  const strongAncestorDomainHitCount =
    candidateStrongAncestorDomainAnchorHits(
      candidate,
      domainAnchorTokens,
    ).length;

  if (
    (candidate.system === "IPC" || candidate.system === "CPC") &&
    (candidate.retrieval_term_index ?? 0) > 0 &&
    leafHitCount === 0 &&
    ancestorDomainHitCount > 0 &&
    strongAncestorDomainHitCount === 0
  ) {
    return false;
  }
  if (
    (candidate.system === "IPC" || candidate.system === "CPC") &&
    leafHitCount >= 2 &&
    ancestorDomainHitCount === 0
  ) {
    return false;
  }

  // Generic keywords still require direct leaf-title domain support.
  if (genericKeyword) {
    const requiredLeafHits = Math.min(2, domainKeys.length);
    return requiredLeafHits > 0 && leafHitCount >= requiredLeafHits;
  }

  const hierarchyKeys = candidateHierarchyTokenFamilyKeys(candidate);
  const supportedDomainHitCount = domainKeys.filter((key) =>
    hierarchyKeys.has(key)
  ).length;

  const requiredHits = Math.min(2, domainKeys.length);

  if (requiredHits > 0 && supportedDomainHitCount >= requiredHits) {
    return true;
  }

  // A specific keyword with strong direct multiword support may use one
  // hierarchy domain anchor. It still cannot bypass domain validation entirely.
  const strongSupportedDomainHitCount = domainKeys.filter(
    (key) =>
      hierarchyKeys.has(key) &&
      !GENERIC_CLASSIFICATION_KEYWORD_HEADS.has(key),
  ).length;

  return (
    strongSupportedDomainHitCount >= 1 &&
    hasStrongMultiwordSearchSupport(candidate, searchTerms)
  );
}

function classificationSubclassPrefix(code: string): string {
  const match = code.normalize('NFKC').toUpperCase().match(/^\s*([A-H]\d{2}[A-Z])/u);
  return match?.[1] ?? '';
}

function deriveDomainNeighborhoodPrefixes(
  candidates: ClassificationCandidate[],
  domainAnchorTokens: string[],
  keywordLexicalTerms: string[],
): Set<string> {
  if (domainAnchorTokens.length === 0) return new Set<string>();
  const votes = new Map<string, number>();

  for (const candidate of candidates) {
    if (!hasKeywordLexicalSupport(candidate, keywordLexicalTerms)) continue;
    const domainHits = candidateDomainAnchorHits(candidate, domainAnchorTokens).length;
    if (domainHits === 0) continue;
    const prefix = classificationSubclassPrefix(candidate.code);
    if (!prefix) continue;
    const weight = Math.min(3, domainHits) + Math.min(
      1,
      Math.max(0, Number(candidate.similarity_score) || 0),
    );
    votes.set(prefix, (votes.get(prefix) ?? 0) + weight);
  }

  const ranked = Array.from(votes.entries()).sort((a, b) => b[1] - a[1]);
  if (ranked.length === 0) return new Set<string>();
  const topWeight = ranked[0][1];
  return new Set(
    ranked
      .filter(([, weight], index) => index < 2 && weight >= topWeight * 0.55)
      .map(([prefix]) => prefix),
  );
}

function hasKeywordLexicalSupport(
  candidate: ClassificationCandidate,
  keywordLexicalTerms: string[],
): boolean {
  return keywordLexicalTerms.some((term) => candidateSupportsTerm(candidate, term));
}
function candidateHasUnsupportedLeafSpecialization(
  candidate: ClassificationCandidate,
  keywordLexicalTerms: string[],
  rankingTerms: string[],
): boolean {
  const leafKeys = technicalTokenFamilyKeys(candidateTitle(candidate));

  const keywordKeys = new Set(
    keywordLexicalTerms.flatMap(technicalTokenFamilyKeys),
  );

  const supportedKeys = new Set(
    [...keywordLexicalTerms, ...rankingTerms].flatMap(
      technicalTokenFamilyKeys,
    ),
  );

  const specializationKeys = leafKeys.filter(
    (key) => !keywordKeys.has(key),
  );

  if (specializationKeys.length < 2) {
    return false;
  }

  const unsupportedKeys = specializationKeys.filter(
    (key) => !supportedKeys.has(key),
  );

  return (
    unsupportedKeys.length >= 2 &&
    unsupportedKeys.length / specializationKeys.length >= 0.5
  );
}
function calculateCandidateMatchScore(
  candidate: ClassificationCandidate,
  searchTerms: string[],
  rankingTerms: string[],
  contextAnchorTokens: string[] = [],
  domainAnchorTokens: string[] = [],
): number {
  const primarySearchTerm = searchTerms[0] ?? '';
  const normalizedSearchTerms = searchTerms
    .map((term) => term.normalize('NFKC').trim().toLowerCase())
    .filter(Boolean);
  const queryWords = Array.from(
    new Set(normalizedSearchTerms.flatMap(technicalTokenFamilyKeys)),
  );
  const queryWordSet = new Set(queryWords);
  const contextWords = Array.from(
    new Set(rankingTerms.flatMap(technicalTokenFamilyKeys)),
  ).filter((word) => !queryWordSet.has(word));
  const leafCandidateKeys = candidateTokenFamilyKeys(candidate);
  const hierarchyCandidateKeys =
    candidateHierarchyTokenFamilyKeys(candidate);
  const anchorHits = candidateContextAnchorHits(candidate, contextAnchorTokens);
  const domainHits = candidateDomainAnchorHits(candidate, domainAnchorTokens);
  let score = Math.min(0.32, Number(candidate.similarity_score) || 0);

  if (primarySearchTerm && candidateSupportsTerm(candidate, primarySearchTerm)) {
    score += 0.11;
  }
  const exactPhraseHits = normalizedSearchTerms.filter(
    (term) => term !== primarySearchTerm && candidateSupportsTerm(candidate, term),
  ).length;
  score += Math.min(0.08, exactPhraseHits * 0.04);
  if (
    candidateHasHighTechnicalTitleCoverage(
      candidate,
      searchTerms,
      rankingTerms,
    )
  ) {
    score += 0.07;
  }
  const queryWordHits = queryWords.filter((word) =>
    leafCandidateKeys.has(word)
  ).length;
  const queryCoverage = queryWords.length > 0 ? queryWordHits / queryWords.length : 0;
  score += Math.min(0.13, queryCoverage * 0.13);

  const contextHits = contextWords.filter((word) =>
    hierarchyCandidateKeys.has(word)
  ).length;
  const contextCoverage = contextWords.length > 0 ? contextHits / contextWords.length : 0;
  const hierarchyAnchorKeys = Array.from(
    new Set(
      [...contextAnchorTokens, ...domainAnchorTokens]
        .map(classificationTokenFamilyKey)
        .filter(Boolean),
    ),
  );

  const hierarchyOnlyAnchorHits = hierarchyAnchorKeys.filter(
    (key) =>
      hierarchyCandidateKeys.has(key) &&
      !leafCandidateKeys.has(key),
  ).length;
  score += Math.min(0.09, contextHits * 0.01 + contextCoverage * 0.045);
  score += Math.min(0.2, anchorHits.length * 0.1);
  score += Math.min(0.2, domainHits.length * 0.1);
  score += Math.min(0.12, hierarchyOnlyAnchorHits * 0.04);
  return Math.max(0, Math.min(1, score));
}

async function searchClassificationCandidates(
  adminClient: SupabaseClient,
  searchTerms: string[],
  system: CatalogClassificationSystem,
  contextTerms: string[],
  contextAnchorTokens: string[],
  domainAnchorTokens: string[],
  keywordLexicalTerms: string[],
  genericKeyword: boolean,
): Promise<ClassificationCandidate[]> {
  const uniqueSearchTerms = Array.from(
    new Set(
      searchTerms
        .map((term) => term.trim())
        .filter(Boolean),
    ),
  )
    .filter((term) => !/^[A-Za-z0-9]{1,2}$/.test(term))
    .slice(0, 8);
  const candidatesByCode = new Map<string, ClassificationCandidate>();

  for (const [searchTermIndex, searchText] of uniqueSearchTerms.entries()) {
    const { data, error } = await adminClient.rpc('search_classification_titles', {
      search_text: searchText,
      requested_systems: [system],
      result_limit: CLASSIFICATION_SEARCH_LIMIT,
    });
    if (error) throw new Error(`${system} candidate search failed: ${error.message}`);

    for (const rawCandidate of data ?? []) {
      const candidate = rawCandidate as ClassificationCandidate;
      if (candidate.system !== system || !candidate.code) continue;
      const normalizedCode = normalizeClassificationCode(candidate.code);
      const previous = candidatesByCode.get(normalizedCode);
      if (!previous || Number(candidate.similarity_score) > Number(previous.similarity_score)) {
        candidatesByCode.set(normalizedCode, {
          ...candidate,
          retrieval_term: searchText,
          retrieval_term_index: searchTermIndex,
        });
      }
    }
  }

  const lexicalCandidates = Array.from(candidatesByCode.values()).filter(
    (candidate) =>
      hasKeywordLexicalSupport(candidate, keywordLexicalTerms) ||
      candidateHasHighTechnicalTitleCoverage(
        candidate,
        uniqueSearchTerms,
        contextTerms,
      ),
  );
  const hierarchyCandidates =
    system === "IPC" || system === "CPC"
      ? await enrichClassificationCandidatesWithAncestors(
        adminClient,
        system,
        lexicalCandidates,
      )
      : lexicalCandidates;

  const scoredCandidates = hierarchyCandidates.map((candidate) => {
    const matchedTerms = uniqueSearchTerms.filter((term) =>
      candidateSupportsTerm(candidate, term),
    );
    const baseScore = calculateCandidateMatchScore(
      candidate,
      uniqueSearchTerms,
      contextTerms,
      contextAnchorTokens,
      domainAnchorTokens,
    );
    return {
      ...candidate,
      matched_terms: matchedTerms,
      match_score: Math.min(1, baseScore + Math.min(0.08, matchedTerms.length * 0.03)),
    };
  });

  const neighborhoodPrefixes = deriveDomainNeighborhoodPrefixes(
    scoredCandidates,
    domainAnchorTokens,
    keywordLexicalTerms,
  );

  return scoredCandidates
    .map((candidate) => {
      const prefix = classificationSubclassPrefix(candidate.code);
      const neighborhoodMatch = Boolean(prefix) && neighborhoodPrefixes.has(prefix);
      const adjustment = neighborhoodPrefixes.size === 0
        ? 0
        : neighborhoodMatch
          ? 0.08
          : genericKeyword
            ? -0.1
            : -0.04;
      return {
        ...candidate,
        match_score: Math.max(0, Math.min(1, (candidate.match_score ?? 0) + adjustment)),
      };
    })
    .filter((candidate) => {
      const prefix = classificationSubclassPrefix(candidate.code);
      const neighborhoodMatch = Boolean(prefix) && neighborhoodPrefixes.has(prefix);
      return (
        (candidate.match_score ?? 0) >= 0.38 &&
        (
          hasKeywordLexicalSupport(candidate, keywordLexicalTerms) ||
          candidateHasHighTechnicalTitleCoverage(
            candidate,
            uniqueSearchTerms,
            contextTerms,
          )
        ) &&
        candidatePassesContextGate(
          candidate,
          contextAnchorTokens,
          uniqueSearchTerms,
          contextTerms
        ) &&
        candidatePassesDomainGate(
          candidate,
          domainAnchorTokens,
          genericKeyword,
          uniqueSearchTerms,
        ) &&
        !candidateHasUnsupportedLeafSpecialization(
          candidate,
          keywordLexicalTerms,
          contextTerms,
        ) &&
        (
          neighborhoodPrefixes.size === 0 ||
          neighborhoodMatch ||
          (
            !genericKeyword &&
            hasKeywordLexicalSupport(candidate, keywordLexicalTerms)
          )
        )
      );
    })
    .sort(
      (a, b) =>
        (b.match_score ?? 0) - (a.match_score ?? 0) ||
        Number(b.similarity_score) - Number(a.similarity_score) ||
        (a.hierarchy_level ?? 999) - (b.hierarchy_level ?? 999) ||
        a.code.localeCompare(b.code),
    )
    .slice(0, CANDIDATES_PER_SYSTEM);
}

function buildClassificationLookupContext(
  keyword: KeywordClassification,
  technicalConcept: TechnicalInterpretation,
  neighboringTerms: string[],
): ClassificationLookupContext {
  const interpretation = technicalConcept;
  const keywordLexicalTerms = Array.from(
    new Set(
      [keyword.term, keyword.normalized_term, ...keyword.synonyms]
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  ).slice(0, 8);
  const contextualizedKeywordTerms = [
    `${interpretation.object_or_system} ${keyword.normalized_term}`,
    `${interpretation.object_or_system} ${keyword.term}`,
    `${interpretation.application_or_use} ${keyword.normalized_term}`,
  ];
  const conceptBasisSearchTerms = keyword.concept_basis
    .map((value) => value.trim())
    .filter(Boolean)
    .slice(0, 2);
  const searchTerms = Array.from(
    new Set([
      ...keywordLexicalTerms,
      ...conceptBasisSearchTerms,
      ...contextualizedKeywordTerms,
    ]
      .map((value) => value.trim())
      .filter(Boolean)),
  ).slice(0, 8);
  const rankingTerms = Array.from(
    new Set([
      interpretation.object_or_system,
      interpretation.purpose_or_problem,
      interpretation.application_or_use,
      ...interpretation.components,
      ...keyword.concept_basis,
      ...interpretation.component_relationships,
      ...interpretation.material_or_composition,
      ...interpretation.manufacturing_or_processing_steps,
      interpretation.operation,
      ...interpretation.control_means,
      ...interpretation.controlled_variables,
      ...interpretation.operating_conditions,
      interpretation.technical_effect,
      ...interpretation.context_terms,
      ...interpretation.search_phrases,
      ...neighboringTerms,
    ].map((value) => value.trim()).filter(Boolean)),
  );
  const contextAnchorTokens = classificationContextAnchorTokens(
    keyword,
    interpretation,
    neighboringTerms,
  );
  const domainAnchorTokens = classificationDomainAnchorTokens(keyword, interpretation);
  const genericKeyword = isGenericClassificationKeyword(keyword);

  return {
    searchTerms,
    rankingTerms,
    contextAnchorTokens,
    domainAnchorTokens,
    keywordLexicalTerms,
    genericKeyword,
  };
}

function selectCandidates(
  candidates: ClassificationCandidate[],
  threshold: number,
  limit: number,
): ClassificationCandidate[] {
  return candidates
    .filter((candidate) => (candidate.match_score ?? 0) >= threshold)
    .slice(0, limit);
}

function evidenceFromCandidates(
  candidates: ClassificationCandidate[],
): ClassificationCodeEvidence[] {
  return candidates.map((candidate) => ({
    code: candidate.code,
    status: "database_verified",
    title_en: candidate.title_en,
    title_ja: candidate.title_ja,
    edition: candidate.edition,
    match_score: candidate.match_score,
    matched_terms: candidate.matched_terms,
    theme_code: candidate.theme_code,
    viewpoint_code: candidate.viewpoint_code,
  }));
}

function classificationMainGroup(code: string): string {
  const match = code.toUpperCase().match(/^\s*([A-H]\d{2}[A-Z])\s*(\d+)/);

  return match ? `${match[1]}${match[2]}` : "";
}

function candidateAreaCodes(
  candidate: ClassificationCandidate,
  areas: ClassificationCandidate[],
): string[] {
  const candidateCodes = [candidate.code, candidate.parent_code ?? ""].filter(
    Boolean,
  );

  return areas
    .filter((area) => {
      const areaNormalized = normalizeClassificationCode(area.code);
      const areaMainGroup = classificationMainGroup(area.code);

      return candidateCodes.some((candidateCode) => {
        const candidateNormalized = normalizeClassificationCode(candidateCode);
        const candidateMainGroup = classificationMainGroup(candidateCode);

        return Boolean(
          areaNormalized &&
          candidateNormalized &&
          (candidateNormalized.startsWith(areaNormalized) ||
            areaNormalized.startsWith(candidateNormalized) ||
            (areaMainGroup &&
              candidateMainGroup &&
              areaMainGroup === candidateMainGroup)),
        );
      });
    })
    .map((area) => area.code);
}

function fiMatchesScope(fiCode: string, fiScope: string[]): boolean {
  const normalizedFi = normalizeClassificationCode(fiCode);

  return fiScope.some((scopeCode) => {
    const normalizedScope = normalizeClassificationCode(scopeCode);
    return Boolean(
      normalizedFi &&
      normalizedScope &&
      (normalizedFi.startsWith(normalizedScope) ||
        normalizedScope.startsWith(normalizedFi)),
    );
  });
}

function toRouteCode(
  system: ClassificationSystem,
  candidate: ClassificationCandidate,
): ClassificationRouteCode {
  return {
    system,
    code: candidate.code,
    status: "database_verified",
    title_en: candidate.title_en,
    title_ja: candidate.title_ja,
    edition: candidate.edition,
    match_score: candidate.match_score,
    matched_terms: candidate.matched_terms,
    theme_code: candidate.theme_code,
    viewpoint_code: candidate.viewpoint_code,
  };
}

function buildClassificationRoute(
  selectedAreas: ClassificationCandidate[],
  selectedFiCandidates: ClassificationCandidate[],
  selectedFTermCandidates: ClassificationCandidate[],
  selectedThemes: FTermThemeCandidate[],
): ClassificationRoute {
  const ipcCpcArea = selectedAreas.map((candidate) =>
    toRouteCode(candidate.system, candidate),
  );

  const fiSubdivisions = selectedFiCandidates.map((fiCandidate) => {
    const parentAreaCodes = candidateAreaCodes(fiCandidate, selectedAreas);
    const scopedAspects = selectedFTermCandidates.filter((aspect) =>
      fiMatchesScope(fiCandidate.code, aspect.fi_scope ?? []),
    );

    const fTermThemes = selectedThemes
      .filter((theme) => fiMatchesScope(fiCandidate.code, theme.fi_scope))
      .map((theme) => ({
        theme_code: theme.theme_code,
        title_en: theme.title_en,
        title_ja: theme.title_ja,
        edition: theme.edition,
        fi_codes: [fiCandidate.code],
        aspects: scopedAspects
          .filter((aspect) => aspect.theme_code === theme.theme_code)
          .map((aspect) => toRouteCode("F-term", aspect)),
      }))
      .filter((theme) => theme.aspects.length > 0);

    return {
      fi: toRouteCode("FI", fiCandidate),
      parent_area_codes: parentAreaCodes,
      f_term_themes: fTermThemes,
    };
  });

  return {
    ipc_cpc_area: ipcCpcArea,
    fi_subdivisions: fiSubdivisions,
  };
}

function isMissingFTermCatalogError(message: string): boolean {
  return (
    message.includes("schema cache") ||
    message.includes("Could not find the function") ||
    message.includes("does not exist")
  );
}

interface FTermSearchResult {
  candidates: ClassificationCandidate[];
  catalogAvailable: boolean;
}

interface FTermThemeSearchResult {
  candidates: FTermThemeCandidate[];
  catalogAvailable: boolean;
}

async function searchFTermThemeCandidates(
  adminClient: SupabaseClient,
  searchTerms: string[],
  verifiedFiCodes: string[],
  contextTerms: string[],
): Promise<FTermThemeSearchResult> {
  if (verifiedFiCodes.length === 0) {
    return { candidates: [], catalogAvailable: true };
  }

  const themesByCode = new Map<string, FTermThemeCandidate>();
  const uniqueSearchTerms = Array.from(
    new Set(searchTerms.map((term) => term.trim()).filter(Boolean)),
  ).slice(0, 5);

  for (const searchText of uniqueSearchTerms) {
    const { data, error } = await adminClient.rpc("search_f_term_themes", {
      search_text: searchText,
      requested_fi_codes: verifiedFiCodes,
      result_limit: CLASSIFICATION_SEARCH_LIMIT,
    });

    if (error) {
      if (isMissingFTermCatalogError(error.message)) {
        return { candidates: [], catalogAvailable: false };
      }

      throw new Error(`F-term theme search failed: ${error.message}`);
    }

    for (const rawTheme of data ?? []) {
      const row = rawTheme as FTermThemeCandidate;
      const theme: FTermThemeCandidate = {
        ...row,
        similarity_score: Number(row.similarity_score) || 0,
        fi_scope: Array.isArray(row.fi_scope) ? row.fi_scope : [],
      };
      const previous = themesByCode.get(theme.theme_code);

      if (!previous || theme.similarity_score > previous.similarity_score) {
        themesByCode.set(theme.theme_code, theme);
      }
    }
  }

  const queryTokens = Array.from(
    new Set(uniqueSearchTerms.flatMap(technicalTokens)),
  );
  const contextTokens = Array.from(
    new Set(contextTerms.flatMap(technicalTokens)),
  );

  const candidates = Array.from(themesByCode.values())
    .map((theme) => {
      const title =
        `${theme.title_en ?? ""} ${theme.title_ja ?? ""}`.toLowerCase();
      const matchedTerms = uniqueSearchTerms.filter((term) => {
        const tokens = technicalTokens(term);
        return (
          title.includes(term.toLowerCase()) ||
          tokens.some((token) => title.includes(token))
        );
      });
      const queryHits = queryTokens.filter((token) =>
        title.includes(token),
      ).length;
      const contextHits = contextTokens.filter((token) =>
        title.includes(token),
      ).length;
      const matchScore = Math.min(
        1,
        Math.min(0.48, theme.similarity_score) +
        Math.min(0.24, queryHits * 0.06) +
        Math.min(0.12, contextHits * 0.025) +
        Math.min(0.12, matchedTerms.length * 0.04) +
        0.12,
      );

      return { ...theme, matched_terms: matchedTerms, match_score: matchScore };
    })
    .filter((theme) => (theme.match_score ?? 0) >= 0.38)
    .sort(
      (a, b) =>
        (b.match_score ?? 0) - (a.match_score ?? 0) ||
        b.similarity_score - a.similarity_score ||
        a.theme_code.localeCompare(b.theme_code),
    )
    .slice(0, CANDIDATES_PER_SYSTEM);

  return { candidates, catalogAvailable: true };
}

async function searchFTermAspectCandidates(
  adminClient: SupabaseClient,
  searchTerms: string[],
  verifiedFiCodes: string[],
  selectedThemeCodes: string[],
  contextTerms: string[],
): Promise<FTermSearchResult> {
  if (verifiedFiCodes.length === 0 || selectedThemeCodes.length === 0) {
    return { candidates: [], catalogAvailable: true };
  }

  const candidatesByCode = new Map<string, ClassificationCandidate>();
  const uniqueSearchTerms = Array.from(
    new Set(searchTerms.map((term) => term.trim()).filter(Boolean)),
  ).slice(0, 5);

  for (const searchText of uniqueSearchTerms) {
    const { data, error } = await adminClient.rpc("search_f_term_titles", {
      search_text: searchText,
      requested_fi_codes: verifiedFiCodes,
      requested_theme_codes: selectedThemeCodes,
      result_limit: CLASSIFICATION_SEARCH_LIMIT,
    });

    if (error) {
      if (isMissingFTermCatalogError(error.message)) {
        return { candidates: [], catalogAvailable: false };
      }

      throw new Error(`F-term candidate search failed: ${error.message}`);
    }

    for (const rawCandidate of data ?? []) {
      const row = rawCandidate as ClassificationCandidate;
      const candidate: ClassificationCandidate = {
        ...row,
        system: "F-term",
        similarity_score: Number(row.similarity_score) || 0,
      };
      const normalizedCode = normalizeClassificationCode(candidate.code);
      const previous = candidatesByCode.get(normalizedCode);

      if (!previous || candidate.similarity_score > previous.similarity_score) {
        candidatesByCode.set(normalizedCode, candidate);
      }
    }
  }

  const normalizedFiCodes = verifiedFiCodes.map(normalizeClassificationCode);

  const candidates = Array.from(candidatesByCode.values())
    .map((candidate) => {
      const scopeMatches = (candidate.fi_scope ?? []).some((scopeCode) => {
        const normalizedScope = normalizeClassificationCode(scopeCode);
        return normalizedFiCodes.some(
          (fiCode) =>
            fiCode.startsWith(normalizedScope) ||
            normalizedScope.startsWith(fiCode),
        );
      });
      const matchedTerms = uniqueSearchTerms.filter((term) => {
        const title = candidateTitle(candidate);
        const tokens = technicalTokens(term);
        return (
          title.includes(term.toLowerCase()) ||
          (tokens.length > 0 && tokens.some((token) => title.includes(token)))
        );
      });
      const semanticScore = calculateCandidateMatchScore(
        candidate,
        uniqueSearchTerms,
        contextTerms,
      );

      return {
        ...candidate,
        matched_terms: matchedTerms,
        match_score: Math.min(
          1,
          semanticScore +
          (scopeMatches ? 0.2 : 0) +
          Math.min(0.12, matchedTerms.length * 0.04),
        ),
      };
    })
    .filter((candidate) => (candidate.match_score ?? 0) >= 0.42)
    .sort(
      (a, b) =>
        (b.match_score ?? 0) - (a.match_score ?? 0) ||
        b.similarity_score - a.similarity_score ||
        a.code.localeCompare(b.code),
    )
    .slice(0, CANDIDATES_PER_SYSTEM);

  return { candidates, catalogAvailable: true };
}

async function lookupAndRankClassifications(
  adminClient: SupabaseClient,
  result: AnalysisResult,
): Promise<AnalysisResult> {
  let warning = result.warning;

  const enrichedKeywords: KeywordClassification[] = result.keywords.map(
    (keyword) => ({
      ...keyword,
      // Every route step is replaced by a technically scored catalog result.
      // Model output is never accepted as a classification-code source.
      ipc: [],
      cpc: [],
      fi: [],
      f_term: [],
      ipc_evidence: [],
      cpc_evidence: [],
      fi_evidence: [],
      f_term_evidence: [],
      ipc_candidates: [],
      cpc_candidates: [],
      fi_candidates: [],
      f_term_candidates: [],
      classification_route: {
        ipc_cpc_area: [],
        fi_subdivisions: [],
      },
    }),
  );

  let fTermCatalogAvailable = true;

  const contextTerms = enrichedKeywords
    .slice(0, CANDIDATE_KEYWORD_LIMIT)
    .map((keyword) => keyword.normalized_term || keyword.term)
    .filter(Boolean);

  const candidateKeywordCount = Math.min(
    enrichedKeywords.length,
    CANDIDATE_KEYWORD_LIMIT,
  );

  for (
    let start = 0;
    start < candidateKeywordCount;
    start += CANDIDATE_SEARCH_CONCURRENCY
  ) {
    const keywordIndexes = Array.from(
      {
        length: Math.min(
          CANDIDATE_SEARCH_CONCURRENCY,
          candidateKeywordCount - start,
        ),
      },
      (_, offset) => start + offset,
    );

    const keywordResults = await Promise.all(
      keywordIndexes.map(async (keywordIndex) => {
        const keyword = enrichedKeywords[keywordIndex];

        const {
          searchTerms,
          rankingTerms,
          contextAnchorTokens,
          domainAnchorTokens,
          keywordLexicalTerms,
          genericKeyword,
        } = buildClassificationLookupContext(
          keyword,
          result.technical_concept,
          contextTerms,
        );

        const [ipcCandidates, cpcCandidates] = await Promise.all([
          searchClassificationCandidates(
            adminClient,
            searchTerms,
            "IPC",
            rankingTerms,
            contextAnchorTokens,
            domainAnchorTokens,
            keywordLexicalTerms,
            genericKeyword,
          ),
          searchClassificationCandidates(
            adminClient,
            searchTerms,
            "CPC",
            rankingTerms,
            contextAnchorTokens,
            domainAnchorTokens,
            keywordLexicalTerms,
            genericKeyword,
          ),
        ]);

        const selectedIpcCandidates = selectCandidates(
          ipcCandidates,
          AREA_SELECTION_THRESHOLD,
          MAX_SELECTED_AREAS_PER_SYSTEM,
        );
        const selectedCpcCandidates = selectCandidates(
          cpcCandidates,
          AREA_SELECTION_THRESHOLD,
          MAX_SELECTED_AREAS_PER_SYSTEM,
        );
        const selectedAreas = [
          ...selectedIpcCandidates,
          ...selectedCpcCandidates,
        ];

        const rawFiCandidates =
          selectedAreas.length > 0
            ? await searchClassificationCandidates(
              adminClient,
              searchTerms,
              "FI",
              rankingTerms,
              contextAnchorTokens,
              domainAnchorTokens,
              keywordLexicalTerms,
              genericKeyword,
            )
            : [];
        const fiCandidates = rawFiCandidates
          .map((candidate) => ({
            ...candidate,
            source_area_codes: candidateAreaCodes(candidate, selectedAreas),
          }))
          .filter((candidate) => candidate.source_area_codes.length > 0);

        const selectedFiCandidates = selectCandidates(
          fiCandidates,
          FI_SELECTION_THRESHOLD,
          MAX_SELECTED_FI,
        );
        const verifiedFiCodes = selectedFiCandidates.map(
          (candidate) => candidate.code,
        );
        const fTermThemeSearch = await searchFTermThemeCandidates(
          adminClient,
          searchTerms,
          verifiedFiCodes,
          rankingTerms,
        );
        const selectedFTermThemes = fTermThemeSearch.candidates
          .filter(
            (theme) =>
              (theme.match_score ?? 0) >= F_TERM_THEME_SELECTION_THRESHOLD,
          )
          .slice(0, MAX_SELECTED_F_TERM_THEMES);
        const fTermSearch = await searchFTermAspectCandidates(
          adminClient,
          searchTerms,
          verifiedFiCodes,
          selectedFTermThemes.map((theme) => theme.theme_code),
          rankingTerms,
        );
        const selectedFTermCandidates = selectCandidates(
          fTermSearch.candidates,
          F_TERM_SELECTION_THRESHOLD,
          MAX_SELECTED_F_TERMS,
        );

        return {
          keywordIndex,
          ipcCandidates,
          cpcCandidates,
          selectedIpcCandidates,
          selectedCpcCandidates,
          selectedAreas,
          fiCandidates,
          selectedFiCandidates,
          fTermThemeCandidates: fTermThemeSearch.candidates,
          selectedFTermThemes,
          fTermCandidates: fTermSearch.candidates,
          selectedFTermCandidates,
          fTermCatalogAvailable:
            fTermThemeSearch.catalogAvailable && fTermSearch.catalogAvailable,
        };
      }),
    );

    for (const keywordResult of keywordResults) {
      const keyword = enrichedKeywords[keywordResult.keywordIndex];

      keyword.ipc_candidates = keywordResult.ipcCandidates;

      keyword.cpc_candidates = keywordResult.cpcCandidates;

      keyword.ipc = keywordResult.selectedIpcCandidates.map(
        (candidate) => candidate.code,
      );
      keyword.ipc_evidence = evidenceFromCandidates(
        keywordResult.selectedIpcCandidates,
      );
      keyword.cpc = keywordResult.selectedCpcCandidates.map(
        (candidate) => candidate.code,
      );
      keyword.cpc_evidence = evidenceFromCandidates(
        keywordResult.selectedCpcCandidates,
      );

      keyword.fi_candidates = keywordResult.fiCandidates;
      keyword.fi = keywordResult.selectedFiCandidates.map(
        (candidate) => candidate.code,
      );
      keyword.fi_evidence = evidenceFromCandidates(
        keywordResult.selectedFiCandidates,
      );
      keyword.f_term_candidates = keywordResult.fTermCandidates;
      keyword.f_term = keywordResult.selectedFTermCandidates.map(
        (candidate) => candidate.code,
      );
      keyword.f_term_evidence = evidenceFromCandidates(
        keywordResult.selectedFTermCandidates,
      );
      keyword.classification_route = buildClassificationRoute(
        keywordResult.selectedAreas,
        keywordResult.selectedFiCandidates,
        keywordResult.selectedFTermCandidates,
        keywordResult.selectedFTermThemes,
      );

      if (!keywordResult.fTermCatalogAvailable) {
        fTermCatalogAvailable = false;
      }
    }
  }

  if (enrichedKeywords.length > CANDIDATE_KEYWORD_LIMIT) {
    warning = appendWarning(
      warning,
      `Database candidate retrieval was limited to the top ${CANDIDATE_KEYWORD_LIMIT} keywords to control response time.`,
    );
  }

  for (const keyword of enrichedKeywords) {
    const catalogBackedCount = [
      ...(keyword.ipc_evidence ?? []),
      ...(keyword.cpc_evidence ?? []),
      ...(keyword.fi_evidence ?? []),
      ...(keyword.f_term_evidence ?? []),
    ].filter((item) => item.status === "database_verified").length;

    keyword.classification_confidence =
      keyword.fi.length > 0 && keyword.f_term.length > 0
        ? "high"
        : catalogBackedCount > 0
          ? "medium"
          : "low";

    keyword.classification_reason =
      catalogBackedCount > 0
        ? "Classification candidates were retrieved from Supabase, required exact token-family keyword support plus independent technical context, and generic keywords additionally required document-domain agreement. Domain-supported IPC/CPC/FI subclass neighborhoods were favored over remote classes. No model-generated classification code was accepted."
        : "No Supabase classification record passed the technical-context threshold. Classification codes were left empty rather than generated by AI.";
  }

  warning = appendWarning(
    warning,
    "The displayed route is enforced as technical concept → catalog-backed IPC/CPC area → linked FI subdivision → FI-scoped F-term theme/aspect. It is search guidance, not an official classification determination; confirm the current hierarchy and scope in J-PlatPat before relying on it.",
  );
  warning = appendWarning(
    warning,
    "Each displayed keyword passed the concept-rationale gate: a named technical-concept facet, a server-derived concept basis, and an exact input-text excerpt are required before the result can consume a credit.",
  );

  if (!fTermCatalogAvailable) {
    warning = appendWarning(
      warning,
      "The authoritative F-term catalog has not been installed. F-term output was withheld rather than generated by AI.",
    );
  }

  return {
    ...result,
    keywords: enrichedKeywords,
    ...(warning ? { warning } : {}),
  };
}
async function analyzePatentText(
  text: string,
  apiKey: string,
  selectedKeywords: string[],
): Promise<AnalysisResult> {
  const client = new OpenAI({ apiKey });
  const warning =
    text.length > LONG_INPUT_WARNING_CHARS
      ? "Long input detected. The model analyzed the provided text in one pass; splitting a long document can improve recall and cost control."
      : undefined;

  const response = await client.responses.create({
    model: MODEL,
    input: [
      {
        role: "system",
        content: [
          {
            type: "input_text",
            text: `You are a multilingual patent analyst for English and Japanese technical documents.
Return only structured JSON matching the schema.
Tasks:
- Detect whether the dominant input language is English (en) or Japanese (ja).
- Extract meaningful technical patent keywords and noun phrases; exclude stopwords, legal boilerplate, and generic verbs.
- Keyword term and normalized_term must identify the core technical noun or technically essential noun phrase, not a quantity/determiner phrase. Remove leading articles, generic quantity modifiers, cardinal or ordinal numerals, and quantity expressions such as "plurality of", "one or more", "at least two", "multiple", "several", "first", and "second" when they only count or distinguish instances. Examples: "plurality of cars" -> "cars"; "two hoistways" -> "hoistways"; "first sensor" -> "sensor". Keep a modifier when removing it would change the technical identity, for example "optical sensor", "wireless charging", "3D printing", "5G antenna", or a hyphenated scientific term such as "two-photon microscopy".
- Normalize synonyms into a concise canonical normalized_term.
- For every retrieved keyword, derive and return 1-8 contextually valid synonyms, abbreviations, alternative technical names, English/Japanese equivalents, or established retrieval variants. The synonyms array must never be empty and must not repeat term or normalized_term.
- For Japanese input, preserve Japanese wording in term and use an English technical phrase in normalized_term whenever possible.
- Derive one common, document-level technical_concept from the complete input and place it at the top level of the JSON response, before keywords. Do not create a separate technical concept for each keyword.
- The common technical_concept must contain these separate facets in this exact order: object/system; purpose or problem; application/use; components; component relationships; material/composition; manufacturing or processing steps; operation; control means; controlled variables; operating conditions; and technical effect.
- Derive the common concept from the complete input, synthesizing information across all sentences and claimed relationships rather than copying only the first keyword.
- object_or_system, purpose_or_problem, application_or_use, components, component_relationships, operation, and technical_effect must be meaningfully populated. Use technically necessary inferences grounded in the input, but do not fabricate unsupported components, conditions, or advantages.
- Use concise strings for single-value facets and concise arrays for multi-value facets. Only non-core facets may be an empty string or empty array when the input does not support them.
- Also return neighboring context terms and 2-6 concise search phrases derived from the complete technical concept.
- Interpret each keyword in the context of the claimed combination, not as an isolated dictionary term. Preserve limiting relationships such as "mounted on", "responsive to", "between", "wirelessly coupled", and relevant numerical or material constraints in the search phrases.
- Select a keyword only when it materially expresses at least one populated facet of the common technical_concept. Frequency alone is never sufficient.
- For every keyword, return concept_facets containing only the 1-3 most relevant exact facet keys from this list: object_or_system, purpose_or_problem, application_or_use, components, component_relationships, material_or_composition, manufacturing_or_processing_steps, operation, control_means, controlled_variables, operating_conditions, technical_effect. Do not attach broad facets merely because the keyword appears somewhere in them.
- For every keyword, return 1-2 short source_evidence excerpts copied exactly from the input. Each excerpt must contain the keyword, its source-language form, or one returned synonym, and must directly demonstrate the keyword's technical role or limiting relationship. Do not paraphrase, translate, add ellipses, or alter whitespace inside an excerpt.
- Treat user-selected keywords as candidates for particular consideration, not mandatory output. Exclude a selected term if the input does not provide exact evidence linking it to the extracted common technical concept.
- Count occurrences across direct terms and clear synonyms; rank by descending frequency.
- Do not generate, infer, copy, or suggest IPC, CPC, FI, or F-term codes.
- Always return empty ipc, cpc, fi, and f_term arrays. The server derives every classification code exclusively from Supabase catalog records after your response.
- In reason, write 1-2 plain-language sentences explaining the keyword's specific structural or functional role in the complete technical concept and why that role makes the term useful for patent retrieval. Mention a concrete relationship, operation, constraint, problem, or effect from the input. Do not list facet names or repeat concept values. Do not use meta-language such as "selected because," "the input states," "concept facet," or "source evidence." Avoid tautologies such as saying a sample rack matters merely because it is a sample rack.
- Use low confidence when classification support is weak.
- Do not include a classification-like alphanumeric symbol in any synonym, code array, technical interpretation, search phrase, or reason.
- Do not claim that any code is database verified. The server performs database retrieval and an independent catalog-integrity check after your response.`,
          },
        ],
      },
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: `Analyze this patent text. UTF-8 Japanese content may be present.

User-selected keyword candidates for particular consideration (they still must pass the technical-concept and evidence requirements):
${selectedKeywords.join(", ")}

Patent text:
${text}`,
          },
        ],
      },
    ],
    text: {
      format: {
        type: "json_schema",
        name: "patent_keyword_classification_analysis",
        schema: responseSchema,
        strict: true,
      },
    },
  });

  const outputText = response.output_text;

  if (!outputText) {
    throw new Error("OpenAI returned an empty response.");
  }

  return normalizeResult(
    JSON.parse(outputText) as AnalysisResult,
    text,
    warning,
  );
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", {
      status: 200,
      headers: corsHeaders,
    });
  }

  if (request.method !== "POST") {
    return jsonResponse(
      { error: "Method not allowed. Use POST." },
      { status: 405 },
    );
  }

  const analysisStartedAt = Date.now();
  let auditStage = "configuration";
  let auditUserId: string | undefined;
  let auditRequestId: string | undefined;
  let auditInputHash: string | undefined;
  let auditInputCharacters: number | undefined;
  let auditSelectedKeywordCount: number | undefined;
  let auditAdminClient: SupabaseClient | undefined;
  let auditProgressStage: AnalysisProgressStage = "input_review";

  try {
    const apiKey = getRequiredEnv("OPENAI_API_KEY");
    const supabaseUrl = getRequiredEnv("SUPABASE_URL");
    const supabaseAnonKey = getRequiredEnv("SUPABASE_ANON_KEY");
    const supabaseServiceRoleKey = getRequiredEnv("SUPABASE_SERVICE_ROLE_KEY");

    const authHeader = request.headers.get("Authorization");

    if (!authHeader) {
      logAnalysisAudit("rejected", {
        stage: "authentication",
        status_code: 401,
        error_message: "Authorization header was not provided.",
        duration_ms: Date.now() - analysisStartedAt,
      });

      return jsonResponse(
        { error: "Authentication required." },
        { status: 401 },
      );
    }

    const authClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: {
          Authorization: authHeader,
        },
      },
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    const {
      data: { user },
      error: userError,
    } = await authClient.auth.getUser();

    if (userError || !user) {
      logAnalysisAudit("rejected", {
        stage: "authentication",
        status_code: 401,
        error_message:
          userError?.message ?? "Authenticated user was not found.",
        duration_ms: Date.now() - analysisStartedAt,
      });

      return jsonResponse(
        { error: "Authentication required." },
        { status: 401 },
      );
    }

    auditUserId = user.id;

    const adminClient = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
    auditAdminClient = adminClient;

    auditStage = "request_validation";
    const body = (await request.json()) as AnalyzeRequest;
    const text = validateText(body);
    const requestId = validateRequestId(body.request_id);
    const selectedKeywords = validateSelectedKeywords(body.selected_keywords);
    const normalizedTextHash = await sha256Hex(
      normalizeTextForCreditDeduplication(text),
    );
    const legacyInputHash = await sha256Hex(
      JSON.stringify({
        text,
        selected_keywords: selectedKeywords,
      }),
    );
    const compatibleInputHashes = Array.from(
      new Set([normalizedTextHash, legacyInputHash]),
    );
    const inputHash = normalizedTextHash;

    auditRequestId = requestId;
    auditInputHash = inputHash;
    auditInputCharacters = text.length;
    auditSelectedKeywordCount = selectedKeywords.length;

    logAnalysisAudit("started", {
      stage: "request_accepted",
      user_id: auditUserId,
      request_id: auditRequestId,
      input_hash: auditInputHash,
      input_characters: auditInputCharacters,
      selected_keyword_count: auditSelectedKeywordCount,
    });

    auditProgressStage = "input_review";
    await writeAnalysisProgress(
      adminClient,
      user.id,
      requestId,
      auditProgressStage,
    );

    auditStage = "idempotency_check";
    const {
      data: existingRequestTransaction,
      error: existingRequestTransactionError,
    } = await adminClient
      .from("credit_transactions")
      .select("input_hash")
      .eq("user_id", user.id)
      .eq("source", "analysis")
      .eq("request_id", requestId)
      .limit(1)
      .maybeSingle();

    if (existingRequestTransactionError) {
      console.error(
        "Request-ID idempotency check failed:",
        existingRequestTransactionError,
      );

      throw new HttpError(
        503,
        "Credit database is temporarily unavailable. Retry the same request; no additional credit was consumed.",
      );
    }

    if (
      existingRequestTransaction !== null &&
      !compatibleInputHashes.includes(existingRequestTransaction.input_hash)
    ) {
      throw new HttpError(
        409,
        "request_id was previously used with different input.",
      );
    }

    const {
      data: existingInputTransaction,
      error: existingInputTransactionError,
    } = await adminClient
      .from("credit_transactions")
      .select("request_id")
      .eq("user_id", user.id)
      .eq("source", "analysis")
      .in("input_hash", compatibleInputHashes)
      .limit(1)
      .maybeSingle();

    if (existingInputTransactionError) {
      console.error(
        "Input-hash idempotency check failed:",
        existingInputTransactionError,
      );

      throw new HttpError(
        503,
        "Credit database is temporarily unavailable. Retry the same input; no additional credit was consumed.",
      );
    }

    const isReplay =
      existingRequestTransaction !== null ||
      existingInputTransaction !== null;

    if (isReplay) {
      logAnalysisAudit("rejected", {
        stage: "duplicate_input",
        user_id: auditUserId,
        request_id: auditRequestId,
        input_hash: auditInputHash,
        input_characters: auditInputCharacters,
        selected_keyword_count: auditSelectedKeywordCount,
        replayed: true,
        status_code: 409,
        error_message: DUPLICATE_INPUT_MESSAGE,
        duration_ms: Date.now() - analysisStartedAt,
      });

      return jsonResponse(
        {
          error: DUPLICATE_INPUT_MESSAGE,
          replayed: true,
        },
        { status: 409 },
      );
    }

    auditStage = "credit_check";
    const { data: creditRow, error: creditError } = await adminClient
      .from("user_credit_balances")
      .select("remaining_credits, expires_at")
      .eq("user_id", user.id)
      .maybeSingle();

    if (creditError) {
      console.error("Credit availability check failed:", creditError);

      throw new HttpError(
        503,
        "Credit database is temporarily unavailable. No credit was consumed.",
      );
    }

    const creditsExpired =
      typeof creditRow?.expires_at === "string" &&
      new Date(creditRow.expires_at).getTime() <= Date.now();
    const currentCredits = creditsExpired
      ? 0
      : Number(creditRow?.remaining_credits ?? 0);

    if (
      !isReplay &&
      (!Number.isFinite(currentCredits) || currentCredits <= 0)
    ) {
      logAnalysisAudit("rejected", {
        stage: auditStage,
        user_id: auditUserId,
        request_id: auditRequestId,
        input_hash: auditInputHash,
        remaining_credits: 0,
        status_code: 402,
        error_message: "No analysis credits are available.",
        duration_ms: Date.now() - analysisStartedAt,
      });

      return jsonResponse(
        {
          error: NO_CREDITS_MESSAGE,
          remainingCredits: 0,
        },
        { status: 402 },
      );
    }

    logAnalysisAudit(isReplay ? "replay" : "ready", {
      stage: isReplay
        ? "previous_charge_confirmed"
        : "credit_availability_confirmed",
      user_id: auditUserId,
      request_id: auditRequestId,
      input_hash: auditInputHash,
      remaining_credits: Number.isFinite(currentCredits)
        ? currentCredits
        : 0,
      replayed: isReplay,
      duration_ms: Date.now() - analysisStartedAt,
    });

    auditStage = "database_capability_check";
    await confirmRequiredDatabaseFunctions(supabaseUrl, supabaseServiceRoleKey);
    logAnalysisAudit("ready", {
      stage: "database_capabilities_confirmed",
      user_id: auditUserId,
      request_id: auditRequestId,
      duration_ms: Date.now() - analysisStartedAt,
    });

    auditStage = "openai_analysis";
    auditProgressStage = "concept_extraction";
    await writeAnalysisProgress(
      adminClient,
      user.id,
      requestId,
      auditProgressStage,
    );
    const aiResult = await analyzePatentText(text, apiKey, selectedKeywords);
    auditProgressStage = "keyword_expansion";
    await writeAnalysisProgress(
      adminClient,
      user.id,
      requestId,
      auditProgressStage,
    );
    let result: AnalysisResult;

    try {
      auditStage = "classification_lookup";
      auditProgressStage = "classification";
      await writeAnalysisProgress(
        adminClient,
        user.id,
        requestId,
        auditProgressStage,
      );
      result = await lookupAndRankClassifications(adminClient, aiResult);
      auditStage = "classification_integrity_check";
      await assertCatalogBackedClassificationCodes(adminClient, result);

      auditStage = "search_query_review";
      auditProgressStage = "query_generation";
      await writeAnalysisProgress(
        adminClient,
        user.id,
        requestId,
        auditProgressStage,
      );
      const searchQueryStarter = await reviewSearchQueriesWithAi(result, apiKey);
      result = applyReviewedClassificationDomainGate(
        {
          ...result,
          search_query_starter: searchQueryStarter,
        },
        searchQueryStarter.classificationQuery,
      );
    } catch (classificationError) {
      console.error(
        "Classification or search-query review failed:",
        classificationError,
      );

      throw new HttpError(
        503,
        "Classification verification or AI search-query review is temporarily unavailable. No credit was consumed.",
      );
    }

    auditStage = "pre_charge_validation";
    auditProgressStage = "final_formatting";
    await writeAnalysisProgress(
      adminClient,
      user.id,
      requestId,
      auditProgressStage,
    );
    validateAnalysisReadyForCharge(result, text);

    const preparedResponse = {
      ...result,
      requestId,
    };

    JSON.stringify(preparedResponse);

    logAnalysisAudit("ready", {
      stage: "ready_for_charge",
      user_id: auditUserId,
      request_id: auditRequestId,
      input_hash: auditInputHash,
      input_characters: auditInputCharacters,
      selected_keyword_count: auditSelectedKeywordCount,
      result_keyword_count: result.keywords.length,
      duration_ms: Date.now() - analysisStartedAt,
    });

    auditStage = "credit_consumption";
    let consumption: CreditConsumptionResult;

    if (isReplay) {
      consumption = {
        consumed: true,
        remaining_credits: Number.isFinite(currentCredits)
          ? Math.max(currentCredits, 0)
          : 0,
        replayed: true,
      };
    } else {
      const { data: consumptionData, error: consumeError } =
        await adminClient.rpc("consume_analysis_credit_once_v2", {
          p_user_id: user.id,
          p_source: "analysis",
          p_request_id: requestId,
          p_input_hash: inputHash,
        });

      if (consumeError) {
        console.error("Atomic credit finalization failed:", consumeError);

        if (
          consumeError.message.includes(
            "request_id was previously used with different input",
          )
        ) {
          throw new HttpError(
            409,
            "request_id was previously used with different input.",
          );
        }

        throw new HttpError(
          503,
          "Credit finalization is temporarily unavailable. Retry the same request; idempotency prevents a duplicate charge.",
        );
      }

      consumption = parseCreditConsumptionResult(consumptionData);
    }

    if (consumption.replayed) {
      logAnalysisAudit("rejected", {
        stage: "duplicate_input_race",
        user_id: auditUserId,
        request_id: auditRequestId,
        input_hash: auditInputHash,
        input_characters: auditInputCharacters,
        selected_keyword_count: auditSelectedKeywordCount,
        remaining_credits: consumption.remaining_credits,
        replayed: true,
        status_code: 409,
        error_message: DUPLICATE_INPUT_MESSAGE,
        duration_ms: Date.now() - analysisStartedAt,
      });

      return jsonResponse(
        {
          error: DUPLICATE_INPUT_MESSAGE,
          remainingCredits: consumption.remaining_credits,
          replayed: true,
        },
        { status: 409 },
      );
    }

    if (!consumption.consumed) {
      logAnalysisAudit("rejected", {
        stage: auditStage,
        user_id: auditUserId,
        request_id: auditRequestId,
        input_hash: auditInputHash,
        input_characters: auditInputCharacters,
        selected_keyword_count: auditSelectedKeywordCount,
        remaining_credits: consumption.remaining_credits,
        status_code: 402,
        error_message: "Credit consumption was rejected.",
        duration_ms: Date.now() - analysisStartedAt,
      });

      return jsonResponse(
        {
          error: NO_CREDITS_MESSAGE,
          remainingCredits: consumption.remaining_credits,
        },
        { status: 402 },
      );
    }

    const remainingCredits = consumption.remaining_credits;

    logAnalysisAudit("succeeded", {
      stage: "completed",
      user_id: auditUserId,
      request_id: auditRequestId,
      input_hash: auditInputHash,
      input_characters: auditInputCharacters,
      selected_keyword_count: auditSelectedKeywordCount,
      result_keyword_count: result.keywords.length,
      remaining_credits: Number.isFinite(remainingCredits)
        ? remainingCredits
        : 0,
      replayed: consumption.replayed,
      status_code: 200,
      duration_ms: Date.now() - analysisStartedAt,
    });

    await writeAnalysisProgress(
      adminClient,
      user.id,
      requestId,
      "final_formatting",
      "completed",
    );

    return jsonResponse({
      ...preparedResponse,
      remainingCredits: Number.isFinite(remainingCredits)
        ? remainingCredits
        : 0,
      replayed: consumption.replayed,
    });
  } catch (error) {
    console.error("Analyze Edge Function failed:", error);

    const message =
      error instanceof Error ? error.message : "Failed to analyze patent text.";
    const status =
      error instanceof HttpError
        ? error.status
        : message.includes("too long")
          ? 413
          : 500;

    logAnalysisAudit("failed", {
      stage: auditStage,
      user_id: auditUserId,
      request_id: auditRequestId,
      input_hash: auditInputHash,
      input_characters: auditInputCharacters,
      selected_keyword_count: auditSelectedKeywordCount,
      status_code: status,
      error_name: error instanceof Error ? error.name : "UnknownError",
      error_message: message,
      duration_ms: Date.now() - analysisStartedAt,
    });

    if (auditAdminClient && auditUserId && auditRequestId) {
      await writeAnalysisProgress(
        auditAdminClient,
        auditUserId,
        auditRequestId,
        auditProgressStage,
        "failed",
        message,
      );
    }

    return jsonResponse({ error: message }, { status });
  }
});
