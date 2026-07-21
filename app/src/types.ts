export type PatentLanguage = "en" | "ja";
export type ClassificationConfidence = "high" | "medium" | "low";
export type ClassificationSystem = "IPC" | "CPC" | "FI" | "F-term";
export type ClassificationVerificationStatus = "database_verified";

export type TechnicalConceptFacet =
  | "object_or_system"
  | "purpose_or_problem"
  | "application_or_use"
  | "components"
  | "component_relationships"
  | "material_or_composition"
  | "manufacturing_or_processing_steps"
  | "operation"
  | "control_means"
  | "controlled_variables"
  | "operating_conditions"
  | "technical_effect";

export interface TechnicalInterpretation {
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

export interface ClassificationCodeEvidence {
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

export interface ClassificationCandidate {
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

export interface ClassificationRouteCode extends ClassificationCodeEvidence {
  system: ClassificationSystem;
}

export interface FTermThemeRoute {
  theme_code: string;
  title_en?: string | null;
  title_ja?: string | null;
  edition?: string | null;
  fi_codes: string[];
  aspects: ClassificationRouteCode[];
}

export interface FiSubdivisionRoute {
  fi: ClassificationRouteCode;
  parent_area_codes: string[];
  f_term_themes: FTermThemeRoute[];
}

export interface ClassificationRoute {
  ipc_cpc_area: ClassificationRouteCode[];
  fi_subdivisions: FiSubdivisionRoute[];
}

export interface KeywordClassification {
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
  classification_confidence: ClassificationConfidence;
  reason: string;
  classification_reason: string;
}

export interface AnalysisResult {
  language: PatentLanguage;
  technical_concept: TechnicalInterpretation;
  keywords: KeywordClassification[];
  analysisSchemaVersion?: string;
  warning?: string;
  requestId?: string;
  remainingCredits?: number;
}
