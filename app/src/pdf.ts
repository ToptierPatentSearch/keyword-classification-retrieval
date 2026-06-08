import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

export type PatentKeyword = {
  term: string;
  normalized_term: string;
  count: number;
  rank: number;
  ipc: string[];
  cpc: string[];
  fi: string[];
  f_term: string[];
  classification_confidence: 'high' | 'medium' | 'low';
  reason: string;
};

export type AnalysisResult = {
  language: 'en' | 'ja';
  keywords: PatentKeyword[];
  warning?: string;
};

const joinCodes = (codes: string[]) => (codes.length ? codes.join(', ') : '—');

export function downloadPatentReport(result: AnalysisResult) {
  const doc = new jsPDF({ orientation: 'landscape' });
  const timestamp = new Date().toLocaleString();

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text('Patent Keyword Analysis Report', 14, 16);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(`Timestamp: ${timestamp}`, 14, 24);
  doc.text(`Detected language: ${result.language}`, 14, 30);

  if (result.warning) {
    doc.setTextColor(180, 90, 0);
    doc.text(`Warning: ${result.warning}`, 14, 36, { maxWidth: 260 });
    doc.setTextColor(0, 0, 0);
  }

  autoTable(doc, {
    startY: result.warning ? 46 : 40,
    head: [[
      'Term',
      'Normalized Term',
      'Count',
      'Rank',
      'IPC',
      'CPC',
      'FI',
      'F-term',
      'Confidence',
    ]],
    body: result.keywords.map((keyword) => [
      keyword.term,
      keyword.normalized_term,
      keyword.count,
      keyword.rank,
      joinCodes(keyword.ipc),
      joinCodes(keyword.cpc),
      joinCodes(keyword.fi),
      joinCodes(keyword.f_term),
      keyword.classification_confidence,
    ]),
    styles: { fontSize: 8, cellPadding: 2, overflow: 'linebreak' },
    headStyles: { fillColor: [31, 78, 121] },
    columnStyles: {
      0: { cellWidth: 34 },
      1: { cellWidth: 38 },
      4: { cellWidth: 30 },
      5: { cellWidth: 34 },
      6: { cellWidth: 30 },
      7: { cellWidth: 30 },
    },
  });

  doc.save(`patent-keyword-analysis-${new Date().toISOString().slice(0, 10)}.pdf`);
}
