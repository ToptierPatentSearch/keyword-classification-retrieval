export type PatentLanguage = 'en' | 'ja';
export type ClassificationConfidence = 'high' | 'medium' | 'low';
export type ClassificationSystem = 'IPC' | 'CPC' | 'FI' | 'F-term';
export type DatabaseClassificationSystem = Exclude<
  ClassificationSystem,
  'F-term'
>;
export type ClassificationVerificationStatus =
  | 'database_verified'
  | 'ai_suggested';

export interface ClassificationCodeEvidence {
  code: string;
  status: ClassificationVerificationStatus;
  title_en?: string | null;
  title_ja?: string | null;
  edition?: string | null;
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
}

export interface KeywordClassification {
  term: string;
  normalized_term: string;
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
  classification_confidence: ClassificationConfidence;
  reason: string;
}

export interface AnalysisResult {
  language: PatentLanguage;
  keywords: KeywordClassification[];
  warning?: string;
  remainingCredits?: number;
}
