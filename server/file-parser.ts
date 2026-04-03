import os from "os";
import * as xlsx from "xlsx";
import { parseOffice } from "officeparser";
// pdf-parse ships a CJS-only build; require() forces the correct resolution
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParse: (buf: Buffer) => Promise<{ text: string }> = require("pdf-parse");

/**
 * Extract text content from uploaded file buffers.
 * Supports: PowerPoint, Word, PDF, Excel, and plain text.
 */
export async function extractFileContent(
  buffer: Buffer,
  fileName: string,
  mimeType: string,
): Promise<string> {
  // PDFs — use pdf-parse (works fully in memory, no temp files needed)
  if (mimeType === "application/pdf" || fileName.endsWith(".pdf")) {
    try {
      const data = await pdfParse(buffer);
      return data.text;
    } catch (e) {
      console.error("pdf-parse error:", e);
      return buffer.toString("utf-8");
    }
  }

  // Office documents (PowerPoint, Word) — use officeparser with /tmp for temp files
  if (
    mimeType.includes("presentation") || mimeType.includes("powerpoint") ||
    fileName.endsWith(".pptx") || fileName.endsWith(".ppt") ||
    mimeType.includes("msword") || mimeType.includes("wordprocessingml") ||
    fileName.endsWith(".doc") || fileName.endsWith(".docx")
  ) {
    try {
      const result = await parseOffice(buffer, { tempFilesLocation: os.tmpdir() });
      if (result && typeof result === "object" && "toText" in result && typeof (result as any).toText === "function") {
        return (result as any).toText();
      }
      return typeof result === "string" ? result : String(result);
    } catch (e) {
      console.error("officeparser error:", e);
      return buffer.toString("utf-8");
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
