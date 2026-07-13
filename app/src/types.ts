export type PatentLanguage = 'en' | 'ja';
export type ClassificationConfidence = 'high' | 'medium' | 'low';
export type ClassificationSystem = 'ipc' | 'cpc' | 'fi' | 'f_term';

export interface ClassificationEvidence {
  system: ClassificationSystem;
  code: string;
  title: string;
  edition: string;
  source_name: string;
  source_url: string;
  match_score: number;
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
  classification_confidence: ClassificationConfidence;
  reason: string;
  classification_evidence?: ClassificationEvidence[];
}

export interface AnalysisResult {
  language: PatentLanguage;
  keywords: KeywordClassification[];
  warning?: string;
}
