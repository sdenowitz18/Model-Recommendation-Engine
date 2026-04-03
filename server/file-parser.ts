import os from "os";
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
  // Office documents (PowerPoint, Word) and PDFs via officeparser.
  // tempFilesLocation must point to /tmp — Vercel's serverless filesystem is
  // read-only everywhere except /tmp.
  if (
    mimeType.includes("presentation") || mimeType.includes("powerpoint") ||
    fileName.endsWith(".pptx") || fileName.endsWith(".ppt") ||
    mimeType.includes("msword") || mimeType.includes("wordprocessingml") ||
    fileName.endsWith(".doc") || fileName.endsWith(".docx") ||
    mimeType === "application/pdf" || fileName.endsWith(".pdf")
  ) {
    try {
      const result = await parseOffice(buffer, { tempFilesLocation: os.tmpdir() });
      if (result && typeof result === "object" && "toText" in result && typeof (result as any).toText === "function") {
        return (result as any).toText();
      }
      return typeof result === "string" ? result : String(result);
    } catch (e) {
      console.error("officeparser error:", e);
      // Fallback: return raw buffer as text (better than nothing for plain-text PDFs)
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
