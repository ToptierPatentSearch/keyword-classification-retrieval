export type PatentLanguage = "en" | "ja";
export type ClassificationConfidence = "high" | "medium" | "low";
export type ClassificationSystem = "IPC" | "CPC" | "FI" | "F-term";
export type DatabaseClassificationSystem = ClassificationSystem;
export type ClassificationVerificationStatus = "database_verified";

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

export interface ClassificationCandidateEvidence {
  system: DatabaseClassificationSystem;
  code: string;
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
}

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
  ipc_candidates?: ClassificationCandidateEvidence[];
  cpc_candidates?: ClassificationCandidateEvidence[];
  fi_candidates?: ClassificationCandidateEvidence[];
  f_term_candidates?: ClassificationCandidateEvidence[];
  classification_route?: ClassificationRoute;
  classification_confidence: ClassificationConfidence;
  reason: string;
}

export interface AnalysisResult {
  language: PatentLanguage;
  technical_concept: TechnicalInterpretation;
  keywords: KeywordClassification[];
  analysisSchemaVersion: string;
  warning?: string;
  remainingCredits?: number;
}
