import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { AnalysisResult } from './types';

const joinCodes = (codes: string[]) => (codes.length > 0 ? codes.join(', ') : '—');

export function downloadAnalysisPdf(result: AnalysisResult): void {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });

doc.addFileToVFS("NotoSansJP-Regular.ttf", NotoSansJP);
doc.addFont("NotoSansJP-Regular.ttf", "NotoSansJP", "normal");

const timestamp = new Date().toLocaleString();

doc.setFont("NotoSansJP");
doc.setFontSize(18);
doc.text('Patent Keyword Analysis Report', 40, 40);
  doc.setFontSize(18);
  doc.text('Patent Keyword Analysis Report', 40, 40);

  doc.setFont('NotoSansJP');
  doc.setFontSize(10);
  doc.text(`Timestamp: ${timestamp}`, 40, 62);
  doc.text(`Detected language: ${result.language}`, 40, 78);

  if (result.warning) {
    doc.setTextColor(180, 92, 0);
    doc.text(`Warning: ${result.warning}`, 40, 94, { maxWidth: 760 });
    doc.setTextColor(0, 0, 0);
  }

  autoTable(doc, {
    startY: result.warning ? 116 : 100,
    head: [['Term', 'Normalized Term', 'Count', 'Rank', 'IPC', 'CPC', 'FI', 'F-term', 'Confidence']],
    body: result.keywords.map((keyword) => [
      keyword.term,
      keyword.normalized_term,
      String(keyword.count),
      String(keyword.rank),
      joinCodes(keyword.ipc),
      joinCodes(keyword.cpc),
      joinCodes(keyword.fi),
      joinCodes(keyword.f_term),
      keyword.classification_confidence,
    ]),
    styles: { fontSize: 8, cellPadding: 4, overflow: 'linebreak' },
    headStyles: { fillColor: [31, 84, 135] },
    columnStyles: {
      0: { cellWidth: 95 },
      1: { cellWidth: 110 },
      4: { cellWidth: 90 },
      5: { cellWidth: 90 },
      6: { cellWidth: 80 },
      7: { cellWidth: 90 },
    },
  });

  doc.save(`patent-keyword-analysis-${new Date().toISOString().slice(0, 10)}.pdf`);
}
