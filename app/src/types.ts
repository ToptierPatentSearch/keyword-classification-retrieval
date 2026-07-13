export type PatentLanguage = 'en' | 'ja';
export type ClassificationConfidence = 'high' | 'medium' | 'low';
export type ClassificationScheme = 'ipc' | 'cpc' | 'fi' | 'f_term';
export type ClassificationCatalogStatus = 'verified' | 'partial' | 'unavailable';

export interface ClassificationEvidence {
  scheme: ClassificationScheme;
  code: string;
  title: string;
  source_name: string;
  source_url: string;
  source_version: string;
  retrieval_score: number;
}

export interface ClassificationSource {
  scheme: ClassificationScheme;
  source_name: string;
  source_url: string;
  source_version: string;
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
  classification_catalog_status?: ClassificationCatalogStatus;
  classification_sources?: ClassificationSource[];
  warning?: string;
}
