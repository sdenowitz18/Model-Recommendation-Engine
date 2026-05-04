import * as xlsx from "xlsx";
import { parseOffice } from "officeparser";

/**
 * Extract text content from uploaded file buffers.
 * Supports: PowerPoint, Word, PDF, Excel, and plain text.
 */
export async function extractFileContent(
  buffer: Buffer,
  fileName: string,
  mimeType: string,
): Promise<string> {
  const isPdf = mimeType === "application/pdf" || fileName.endsWith(".pdf");

  // PDFs — use pdf-parse (v2 API). officeparser is unreliable for PDFs and its
  // failure fallback was reading binary as UTF-8, producing garbled text.
  if (isPdf) {
    try {
      const { PDFParse } = await import("pdf-parse");
      const parser = new PDFParse({ data: buffer });
      try {
        const result = await parser.getText();
        const text = (result.text ?? "").trim();
        return text || "[PDF uploaded — no text content could be extracted.]";
      } finally {
        await parser.destroy().catch(() => {});
      }
    } catch (e) {
      console.error("pdf-parse error:", e);
      return "[PDF uploaded — text could not be extracted automatically.]";
    }
  }

  // Office documents (PowerPoint, Word) via officeparser.
  // tempFilesLocation must point to /tmp — Vercel's serverless filesystem is
  // read-only everywhere except /tmp.
  if (
    mimeType.includes("presentation") || mimeType.includes("powerpoint") ||
    fileName.endsWith(".pptx") || fileName.endsWith(".ppt") ||
    mimeType.includes("msword") || mimeType.includes("wordprocessingml") ||
    fileName.endsWith(".doc") || fileName.endsWith(".docx")
  ) {
    try {
      const result = await parseOffice(buffer, { outputErrorToConsole: false });
      if (result && typeof result === "object" && "toText" in result && typeof (result as any).toText === "function") {
        return (result as any).toText();
      }
      return typeof result === "string" ? result : String(result);
    } catch (e) {
      console.error("officeparser error:", e);
      return "[Document uploaded — text could not be extracted automatically.]";
    }
  }

  // Spreadsheets (Excel)
  if (
    mimeType.includes("spreadsheet") || mimeType.includes("excel") ||
    fileName.endsWith(".xlsx") || fileName.endsWith(".xls")
  ) {
    const workbook = xlsx.read(buffer, { type: "buffer" });
    const sheets = workbook.SheetNames.map((name) => {
      const sheet = workbook.Sheets[name];
      return `Sheet: ${name}\n${xlsx.utils.sheet_to_csv(sheet)}`;
    });
    return sheets.join("\n\n");
  }

  // Plain text fallback
  return buffer.toString("utf-8");
}
