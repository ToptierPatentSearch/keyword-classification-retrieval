import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type { AnalysisResult } from "./types";

const PDF_FONT_FILE = "ipaexg.ttf";
const PDF_FONT_FAMILY = "IPAexGothic";
const PDF_FONT_URL = new URL("./fonts/ipaexg.ttf", import.meta.url).href;

let pdfFontBase64Promise: Promise<string> | null = null;

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = "";

  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }

  return btoa(binary);
}

async function loadPdfFontBase64(): Promise<string> {
  if (!pdfFontBase64Promise) {
    pdfFontBase64Promise = fetch(PDF_FONT_URL)
      .then((response) => {
        if (!response.ok) {
          throw new Error(
            `Could not load the PDF font (${response.status} ${response.statusText}).`,
          );
        }

        return response.arrayBuffer();
      })
      .then(arrayBufferToBase64)
      .catch((error: unknown) => {
        pdfFontBase64Promise = null;
        throw error;
      });
  }

  return pdfFontBase64Promise;
}

function registerPdfFont(doc: jsPDF, fontBase64: string): void {
  doc.addFileToVFS(PDF_FONT_FILE, fontBase64);
  doc.addFont(PDF_FONT_FILE, PDF_FONT_FAMILY, "normal");
  doc.setFont(PDF_FONT_FAMILY, "normal");
}

const joinValues = (values: string[] | undefined) =>
  Array.isArray(values) && values.length > 0 ? values.join(", ") : "—";

type AutoTableDocument = jsPDF & {
  lastAutoTable?: { finalY: number };
};

export async function downloadAnalysisPdf(
  result: AnalysisResult,
): Promise<void> {
  const fontBase64 = await loadPdfFontBase64();
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "pt",
    format: "a4",
    putOnlyUsedFonts: true,
  });
  registerPdfFont(doc, fontBase64);

  const pageHeight = doc.internal.pageSize.getHeight();
  const contentWidth = doc.internal.pageSize.getWidth() - 80;
  const timestamp = new Date().toLocaleString();

  doc.setFont(PDF_FONT_FAMILY, "normal");
  doc.setFontSize(18);
  doc.text("Patent Keyword Analysis Report", 40, 40);

  doc.setFont(PDF_FONT_FAMILY, "normal");
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

  const concept = result.technical_concept;

  autoTable(doc, {
    startY: currentY,
    margin: { left: 40, right: 40 },
    head: [["AI-derived common technical concept", "Shared by all keywords"]],
    body: [
      ["Object/system", concept.object_or_system || "—"],
      ["Purpose or problem", concept.purpose_or_problem || "—"],
      ["Application/use", concept.application_or_use || "—"],
      ["Components", joinValues(concept.components)],
      ["Component relationships", joinValues(concept.component_relationships)],
      ["Material/composition", joinValues(concept.material_or_composition)],
      [
        "Manufacturing or processing steps",
        joinValues(concept.manufacturing_or_processing_steps),
      ],
      ["Operation", concept.operation || "—"],
      ["Control means", joinValues(concept.control_means)],
      ["Controlled variable", joinValues(concept.controlled_variables)],
      ["Operating conditions", joinValues(concept.operating_conditions)],
      ["Technical effect", concept.technical_effect || "—"],
      ["Context terms", joinValues(concept.context_terms)],
      ["Search phrases", joinValues(concept.search_phrases)],
    ],
    styles: {
      font: PDF_FONT_FAMILY,
      fontStyle: "normal",
      fontSize: 9,
      cellPadding: 5,
      overflow: "linebreak",
      valign: "top",
    },
    headStyles: {
      fillColor: [30, 64, 175],
      font: PDF_FONT_FAMILY,
      fontStyle: "normal",
      fontSize: 10,
    },
    columnStyles: {
      0: { cellWidth: 160, fontStyle: "normal", textColor: [51, 65, 85] },
      1: { cellWidth: contentWidth - 160 },
    },
    rowPageBreak: "avoid",
  });

  currentY =
    ((doc as AutoTableDocument).lastAutoTable?.finalY ?? currentY) + 22;

  for (const keyword of result.keywords) {
    if (currentY > pageHeight - 150) {
      doc.addPage("a4", "portrait");
      currentY = 40;
    }

    autoTable(doc, {
      startY: currentY,
      margin: { left: 40, right: 40 },
      head: [[`Keyword ${keyword.rank}`, keyword.term]],
      body: [
        ["Normalized term", keyword.normalized_term],
        ["Synonyms", joinValues(keyword.synonyms)],
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
        font: PDF_FONT_FAMILY,
        fontStyle: "normal",
        fontSize: 9,
        cellPadding: 5,
        overflow: "linebreak",
        valign: "top",
      },
      headStyles: {
        fillColor: [31, 84, 135],
        font: PDF_FONT_FAMILY,
        fontStyle: "normal",
        fontSize: 10,
      },
      columnStyles: {
        0: { cellWidth: 120, fontStyle: "normal", textColor: [51, 65, 85] },
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
