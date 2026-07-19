import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type { AnalysisResult } from "./types";

const joinValues = (values: string[] | undefined) =>
  Array.isArray(values) && values.length > 0 ? values.join(", ") : "—";

type AutoTableDocument = jsPDF & {
  lastAutoTable?: { finalY: number };
};

export function downloadAnalysisPdf(result: AnalysisResult): void {
  const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
  const pageHeight = doc.internal.pageSize.getHeight();
  const contentWidth = doc.internal.pageSize.getWidth() - 80;
  const timestamp = new Date().toLocaleString();

  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text("Patent Keyword Analysis Report", 40, 40);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(`Timestamp: ${timestamp}`, 40, 62);
  doc.text(`Detected language: ${result.language}`, 40, 78);

  let currentY = 100;

  if (result.warning) {
    const warningLines = doc.splitTextToSize(
      `Warning: ${result.warning}`,
      contentWidth,
    );
    doc.setTextColor(180, 92, 0);
    doc.text(warningLines, 40, currentY);
    doc.setTextColor(0, 0, 0);
    currentY += warningLines.length * 12 + 14;
  }

  for (const keyword of result.keywords) {
    if (currentY > pageHeight - 150) {
      doc.addPage("a4", "portrait");
      currentY = 40;
    }

    const interpretation = keyword.technical_interpretation;

    autoTable(doc, {
      startY: currentY,
      margin: { left: 40, right: 40 },
      head: [[`Keyword ${keyword.rank}`, keyword.term]],
      body: [
        ["Normalized term", keyword.normalized_term],
        ["Synonyms", joinValues(keyword.synonyms)],
        ["Object/system", interpretation.object_or_system || "—"],
        ["Purpose or problem", interpretation.purpose_or_problem || "—"],
        ["Application/use", interpretation.application_or_use || "—"],
        ["Components", joinValues(interpretation.components)],
        [
          "Component relationships",
          joinValues(interpretation.component_relationships),
        ],
        [
          "Material/composition",
          joinValues(interpretation.material_or_composition),
        ],
        [
          "Manufacturing or processing steps",
          joinValues(interpretation.manufacturing_or_processing_steps),
        ],
        ["Operation", interpretation.operation || "—"],
        ["Control means", joinValues(interpretation.control_means)],
        [
          "Controlled variable",
          joinValues(interpretation.controlled_variables),
        ],
        [
          "Operating conditions",
          joinValues(interpretation.operating_conditions),
        ],
        ["Technical effect", interpretation.technical_effect || "—"],
        ["Context terms", joinValues(interpretation.context_terms)],
        ["Search phrases", joinValues(interpretation.search_phrases)],
        ["IPC", joinValues(keyword.ipc)],
        ["CPC", joinValues(keyword.cpc)],
        ["FI", joinValues(keyword.fi)],
        ["F-term", joinValues(keyword.f_term)],
        ["Occurrences", String(keyword.count)],
        ["Rank", String(keyword.rank)],
        ["Confidence", keyword.classification_confidence],
        ["Reason", keyword.reason],
      ],
      styles: {
        fontSize: 9,
        cellPadding: 5,
        overflow: "linebreak",
        valign: "top",
      },
      headStyles: { fillColor: [31, 84, 135], fontSize: 10 },
      columnStyles: {
        0: { cellWidth: 120, fontStyle: "bold", textColor: [51, 65, 85] },
        1: { cellWidth: contentWidth - 120 },
      },
      rowPageBreak: "avoid",
    });

    currentY =
      ((doc as AutoTableDocument).lastAutoTable?.finalY ?? currentY) + 18;
  }

  doc.save(
    `patent-keyword-analysis-${new Date().toISOString().slice(0, 10)}.pdf`,
  );
}
