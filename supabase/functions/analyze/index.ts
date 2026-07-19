import OpenAI from "npm:openai@^5.0.0";
import {
  createClient,
  type SupabaseClient,
} from "npm:@supabase/supabase-js@^2.44.4";

type Confidence = "high" | "medium" | "low";
type PatentLanguage = "en" | "ja";
type ClassificationSystem = "IPC" | "CPC" | "FI" | "F-term";
type CatalogClassificationSystem = Exclude<ClassificationSystem, "F-term">;
type ClassificationVerificationStatus = "database_verified";

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
  source_area_codes?: string[];
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
  technical_object: string;
  function: string;
  structure_or_mechanism: string;
  material_or_signal: string;
  purpose_or_effect: string;
  context_terms: string[];
  search_phrases: string[];
}

interface ClassificationLookupContext {
  searchTerms: string[];
  rankingTerms: string[];
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
  technical_concept: TechnicalInterpretation;
  ipc_cpc_area: ClassificationRouteCode[];
  fi_subdivisions: FiSubdivisionRoute[];
}

interface KeywordClassification {
  term: string;
  normalized_term: string;
  technical_interpretation: TechnicalInterpretation;
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
}

interface AnalysisResult {
  language: PatentLanguage;
  keywords: KeywordClassification[];
  warning?: string;
  requestId?: string;
  remainingCredits?: number;
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
const CANDIDATE_SEARCH_CONCURRENCY = 3;
const FI_SELECTION_THRESHOLD = 0.58;
const AREA_SELECTION_THRESHOLD = 0.52;
const F_TERM_THEME_SELECTION_THRESHOLD = 0.48;
const F_TERM_SELECTION_THRESHOLD = 0.64;
const MAX_SELECTED_AREAS_PER_SYSTEM = 2;
const MAX_SELECTED_FI = 2;
const MAX_SELECTED_F_TERM_THEMES = 2;
const MAX_SELECTED_F_TERMS = 3;
const MODEL = Deno.env.get("OPENAI_MODEL") ?? "gpt-4.1-mini";
const REQUIRED_DATABASE_FUNCTIONS = [
  "consume_analysis_credit_once_v2",
  "search_classification_titles",
  "search_f_term_themes",
  "search_f_term_titles",
] as const;

let requiredDatabaseFunctionsCheck: Promise<void> | null = null;

const NO_CREDITS_MESSAGE =
  "分析クレジットがありません。Test pack または Business pack を購入してください。";

const responseSchema = {
  type: "object",
  additionalProperties: false,
  required: ["language", "keywords"],
  properties: {
    language: { type: "string", enum: ["en", "ja"] },
    keywords: {
      type: "array",
      maxItems: 40,
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "term",
          "normalized_term",
          "technical_interpretation",
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
          technical_interpretation: {
            type: "object",
            additionalProperties: false,
            required: [
              "technical_object",
              "function",
              "structure_or_mechanism",
              "material_or_signal",
              "purpose_or_effect",
              "context_terms",
              "search_phrases",
            ],
            properties: {
              technical_object: { type: "string" },
              function: { type: "string" },
              structure_or_mechanism: { type: "string" },
              material_or_signal: { type: "string" },
              purpose_or_effect: { type: "string" },
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
          reason: { type: "string" },
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

function normalizeTechnicalInterpretation(
  value: unknown,
  fallbackTerm: string,
): TechnicalInterpretation {
  const source =
    value && typeof value === "object"
      ? (value as Partial<TechnicalInterpretation>)
      : {};

  return {
    technical_object: String(source.technical_object ?? fallbackTerm).trim(),
    function: String(source.function ?? "").trim(),
    structure_or_mechanism: String(source.structure_or_mechanism ?? "").trim(),
    material_or_signal: String(source.material_or_signal ?? "").trim(),
    purpose_or_effect: String(source.purpose_or_effect ?? "").trim(),
    context_terms: cleanTextList(source.context_terms, 8),
    search_phrases: cleanTextList(source.search_phrases, 6),
  };
}

function normalizeResult(
  result: AnalysisResult,
  warning?: string,
): AnalysisResult {
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

      const normalizedTerm = String(keyword.normalized_term ?? "").trim();
      const term = String(keyword.term ?? "").trim();

      return {
        term,
        normalized_term: normalizedTerm,
        technical_interpretation: normalizeTechnicalInterpretation(
          keyword.technical_interpretation,
          normalizedTerm || term,
        ),
        count: Math.max(1, Math.trunc(Number(keyword.count) || 1)),
        rank: Math.max(1, Math.trunc(Number(keyword.rank) || 1)),
        // Classification codes are never accepted from model output.
        ipc: [],
        cpc: [],
        fi: [],
        f_term: [],
        classification_confidence: confidence,
        reason: String(keyword.reason ?? "").trim(),
      };
    })
    .filter((keyword) => keyword.term || keyword.normalized_term)
    .sort((a, b) => b.count - a.count || a.rank - b.rank)
    .map((keyword, index) => ({ ...keyword, rank: index + 1 }));

  return {
    language: result.language === "ja" ? "ja" : "en",
    keywords: normalizedKeywords,
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

function validateAnalysisReadyForCharge(result: AnalysisResult): void {
  const validLanguage = result.language === "en" || result.language === "ja";
  const validKeywordCount =
    Array.isArray(result.keywords) &&
    result.keywords.length > 0 &&
    result.keywords.length <= 40;

  const validKeywords =
    validKeywordCount &&
    result.keywords.every(
      (keyword) =>
        Boolean(keyword.term.trim()) &&
        Boolean(keyword.normalized_term.trim()) &&
        Boolean(keyword.technical_interpretation) &&
        Boolean(keyword.technical_interpretation.technical_object.trim()) &&
        Array.isArray(keyword.technical_interpretation.context_terms) &&
        Array.isArray(keyword.technical_interpretation.search_phrases) &&
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
        Boolean(keyword.reason.trim()),
    );

  if (!validLanguage || !validKeywords) {
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
  const normalizedCodes = Array.from(
    new Set(codes.map(normalizeClassificationCode).filter(Boolean)),
  );
  const rowsByCode = new Map<string, ClassificationCandidate>();

  for (let start = 0; start < normalizedCodes.length; start += 100) {
    const codeBatch = normalizedCodes.slice(start, start + 100);

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
        row.normalized_code || normalizeClassificationCode(row.code);

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

function calculateCandidateMatchScore(
  candidate: ClassificationCandidate,
  searchTerms: string[],
  rankingTerms: string[],
): number {
  const title = candidateTitle(candidate);
  const primarySearchTerm = searchTerms[0] ?? "";
  const query = primarySearchTerm.trim().toLowerCase();
  const normalizedSearchTerms = searchTerms
    .map((term) => term.normalize("NFKC").trim().toLowerCase())
    .filter(Boolean);
  const queryWords = Array.from(
    new Set(normalizedSearchTerms.flatMap(technicalTokens)),
  );
  const contextWords = Array.from(
    new Set(rankingTerms.flatMap(technicalTokens)),
  );
  let score = Math.min(0.42, Number(candidate.similarity_score) || 0);

  if (query && title.includes(query)) {
    score += 0.18;
  }

  const exactPhraseHits = normalizedSearchTerms.filter(
    (term) => term !== query && title.includes(term),
  ).length;
  score += Math.min(0.1, exactPhraseHits * 0.05);

  const queryWordHits = queryWords.filter((word) =>
    title.includes(word),
  ).length;
  const queryCoverage =
    queryWords.length > 0 ? queryWordHits / queryWords.length : 0;
  score += Math.min(0.16, queryCoverage * 0.16);

  const contextHits = contextWords.filter((word) =>
    title.includes(word),
  ).length;
  const contextCoverage =
    contextWords.length > 0 ? contextHits / contextWords.length : 0;
  score += Math.min(0.14, contextHits * 0.018 + contextCoverage * 0.08);

  return Math.max(0, Math.min(1, score));
}

async function searchClassificationCandidates(
  adminClient: SupabaseClient,
  searchTerms: string[],
  system: CatalogClassificationSystem,
  contextTerms: string[],
): Promise<ClassificationCandidate[]> {
  const uniqueSearchTerms = Array.from(
    new Set(searchTerms.map((term) => term.trim()).filter(Boolean)),
  ).slice(0, 5);
  const candidatesByCode = new Map<string, ClassificationCandidate>();

  for (const searchText of uniqueSearchTerms) {
    const { data, error } = await adminClient.rpc(
      "search_classification_titles",
      {
        search_text: searchText,
        requested_systems: [system],
        result_limit: CLASSIFICATION_SEARCH_LIMIT,
      },
    );

    if (error) {
      throw new Error(`${system} candidate search failed: ${error.message}`);
    }

    for (const rawCandidate of data ?? []) {
      const candidate = rawCandidate as ClassificationCandidate;
      if (candidate.system !== system || !candidate.code) {
        continue;
      }

      const normalizedCode = normalizeClassificationCode(candidate.code);
      const previous = candidatesByCode.get(normalizedCode);

      if (
        !previous ||
        Number(candidate.similarity_score) > Number(previous.similarity_score)
      ) {
        candidatesByCode.set(normalizedCode, candidate);
      }
    }
  }

  const primarySearchTerm = uniqueSearchTerms[0] ?? "";

  return Array.from(candidatesByCode.values())
    .map((candidate) => {
      const matchedTerms = uniqueSearchTerms.filter((term) => {
        const title = candidateTitle(candidate);
        const tokens = technicalTokens(term);
        return (
          title.includes(term.toLowerCase()) ||
          (tokens.length > 0 && tokens.some((token) => title.includes(token)))
        );
      });
      const baseScore = calculateCandidateMatchScore(
        candidate,
        uniqueSearchTerms,
        contextTerms,
      );

      return {
        ...candidate,
        matched_terms: matchedTerms,
        match_score: Math.min(
          1,
          baseScore + Math.min(0.12, matchedTerms.length * 0.04),
        ),
      };
    })
    .filter(
      (candidate) =>
        (candidate.match_score ?? 0) >= 0.38 ||
        candidateTitle(candidate).includes(primarySearchTerm.toLowerCase()),
    )
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
  neighboringTerms: string[],
): ClassificationLookupContext {
  const interpretation = keyword.technical_interpretation;
  const composedPhrases = [
    `${interpretation.technical_object} ${interpretation.function}`,
    `${interpretation.technical_object} ${interpretation.structure_or_mechanism}`,
    `${interpretation.technical_object} ${interpretation.material_or_signal}`,
    `${interpretation.technical_object} ${interpretation.purpose_or_effect}`,
  ];

  const searchTerms = Array.from(
    new Set(
      [
        keyword.normalized_term,
        keyword.term,
        ...interpretation.search_phrases,
        ...composedPhrases,
        ...interpretation.context_terms,
      ]
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  ).slice(0, 8);

  const rankingTerms = Array.from(
    new Set(
      [
        ...searchTerms,
        keyword.normalized_term,
        keyword.term,
        interpretation.technical_object,
        interpretation.function,
        interpretation.structure_or_mechanism,
        interpretation.material_or_signal,
        interpretation.purpose_or_effect,
        ...interpretation.context_terms,
        ...interpretation.search_phrases,
        ...neighboringTerms,
      ]
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  );

  return { searchTerms, rankingTerms };
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
  keyword: KeywordClassification,
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
    technical_concept: keyword.technical_interpretation,
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
        technical_concept: keyword.technical_interpretation,
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

        const { searchTerms, rankingTerms } = buildClassificationLookupContext(
          keyword,
          contextTerms,
        );

        const [ipcCandidates, cpcCandidates] = await Promise.all([
          searchClassificationCandidates(
            adminClient,
            searchTerms,
            "IPC",
            rankingTerms,
          ),
          searchClassificationCandidates(
            adminClient,
            searchTerms,
            "CPC",
            rankingTerms,
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
        keyword,
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

    keyword.reason =
      catalogBackedCount > 0
        ? "Classification candidates were retrieved from Supabase and ranked against the complete technical interpretation. No model-generated classification code was accepted."
        : "No Supabase classification record passed the technical-context threshold. Classification codes were left empty rather than generated by AI.";
  }

  warning = appendWarning(
    warning,
    "The displayed route is enforced as technical concept → catalog-backed IPC/CPC area → linked FI subdivision → FI-scoped F-term theme/aspect. It is search guidance, not an official classification determination; confirm the current hierarchy and scope in J-PlatPat before relying on it.",
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
- Normalize synonyms into a concise canonical normalized_term.
- For Japanese input, preserve Japanese wording in term and use an English technical phrase in normalized_term whenever possible.
- For every keyword, create a technical_interpretation that separates: the technical object; its function; structure or operating mechanism; material, energy, or signal handled; purpose or technical effect; neighboring context terms; and 2-6 concise search phrases.
- Interpret each keyword in the context of the claimed combination, not as an isolated dictionary term. Preserve limiting relationships such as "mounted on", "responsive to", "between", "wirelessly coupled", and relevant numerical or material constraints in the search phrases.
- Count occurrences across direct terms and clear synonyms; rank by descending frequency.
- Do not generate, infer, copy, or suggest IPC, CPC, FI, or F-term codes.
- Always return empty ipc, cpc, fi, and f_term arrays. The server derives every classification code exclusively from Supabase catalog records after your response.
- Include a concise, specific reason grounded in the input text.
- Use low confidence when classification support is weak.
- Do not include a classification-like alphanumeric symbol in any code array, technical interpretation, search phrase, or reason.
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

Selected keywords that must receive particular consideration:
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

  return normalizeResult(JSON.parse(outputText) as AnalysisResult, warning);
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
    auditStage = "credit_check";

    const adminClient = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    const { data: creditRow, error: creditError } = await adminClient
      .from("user_credit_balances")
      .select("remaining_credits")
      .eq("user_id", user.id)
      .maybeSingle();

    if (creditError) {
      console.error("Credit availability check failed:", creditError);

      throw new HttpError(
        503,
        "Credit database is temporarily unavailable. No credit was consumed.",
      );
    }

    const currentCredits = Number(creditRow?.remaining_credits ?? 0);

    if (!Number.isFinite(currentCredits) || currentCredits <= 0) {
      logAnalysisAudit("rejected", {
        stage: auditStage,
        user_id: auditUserId,
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

    auditStage = "request_validation";
    const body = (await request.json()) as AnalyzeRequest;
    const text = validateText(body);
    const requestId = validateRequestId(body.request_id);
    const selectedKeywords = validateSelectedKeywords(body.selected_keywords);
    const inputHash = await sha256Hex(
      JSON.stringify({
        text,
        selected_keywords: selectedKeywords,
      }),
    );

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

    auditStage = "database_capability_check";
    await confirmRequiredDatabaseFunctions(supabaseUrl, supabaseServiceRoleKey);
    logAnalysisAudit("ready", {
      stage: "database_capabilities_confirmed",
      user_id: auditUserId,
      request_id: auditRequestId,
      duration_ms: Date.now() - analysisStartedAt,
    });

    auditStage = "openai_analysis";
    const aiResult = await analyzePatentText(text, apiKey, selectedKeywords);
    let result: AnalysisResult;

    try {
      auditStage = "classification_lookup";
      result = await lookupAndRankClassifications(adminClient, aiResult);
      auditStage = "classification_integrity_check";
      await assertCatalogBackedClassificationCodes(adminClient, result);
    } catch (classificationError) {
      console.error("Classification lookup failed:", classificationError);

      throw new HttpError(
        503,
        "Classification database verification is temporarily unavailable. No credit was consumed.",
      );
    }

    auditStage = "pre_charge_validation";
    validateAnalysisReadyForCharge(result);

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

    const consumption = parseCreditConsumptionResult(consumptionData);

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

    return jsonResponse({
      ...preparedResponse,
      remainingCredits: Number.isFinite(remainingCredits)
        ? remainingCredits
        : 0,
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

    return jsonResponse({ error: message }, { status });
  }
});
