export type PatentLanguage = 'en' | 'ja';
export type ClassificationConfidence = 'high' | 'medium' | 'low';

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
}

export interface AnalysisResult {
  language: PatentLanguage;
  keywords: KeywordClassification[];
  warning?: string;
}
