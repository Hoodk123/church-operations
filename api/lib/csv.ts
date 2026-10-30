// Minimal RFC 4180 CSV reader for the people import (docs/09 Phase 3:
// "Excel import ... with the same validation"). No dependency: quotes,
// embedded delimiters and CRLF are handled; the delimiter is detected from
// the header line (comma, semicolon or tab) so Excel's regional exports work.
export interface ParsedCsv {
  headers: string[];
  rows: Array<Record<string, string>>;
}

const MAX_COLUMNS = 16;
const MAX_ROWS = 1000;

function detectDelimiter(line: string): string {
  for (const candidate of [",", ";", "\t"]) {
    if (line.includes(candidate)) return candidate;
  }
  return ",";
}

export function parseCsv(raw: string): ParsedCsv | null {
  // Strip a UTF-8 BOM and normalise newlines.
  const text = raw.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const firstLineEnd = text.indexOf("\n");
  const headerLine = firstLineEnd === -1 ? text : text.slice(0, firstLineEnd);
  const delimiter = detectDelimiter(headerLine);

  const records: string[][] = [];
  let field = "";
  let record: string[] = [];
  let inQuotes = false;
  let anyRecord = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      anyRecord = true;
    } else if (ch === delimiter) {
      if (record.length >= MAX_COLUMNS) return null;
      record.push(field);
      field = "";
      anyRecord = true;
    } else if (ch === "\n") {
      record.push(field);
      field = "";
      records.push(record);
      record = [];
      anyRecord = false;
    } else {
      field += ch;
      anyRecord = true;
    }
  }
  // Final unterminated record (no trailing newline).
  if (field !== "" || record.length > 0 || anyRecord) {
    if (record.length >= MAX_COLUMNS) return null;
    record.push(field);
    records.push(record);
  }
  if (records.length === 0) return null;
  if (records.length - 1 > MAX_ROWS) return null;

  const headerRow = records[0];
  if (!headerRow) return null;
  const headers = headerRow.map((h) => h.trim());
  const rows: Array<Record<string, string>> = [];
  for (const cells of records.slice(1)) {
    if (cells.every((c) => c.trim() === "")) continue; // blank line
    const row: Record<string, string> = {};
    headers.forEach((header, index) => {
      row[header] = (cells[index] ?? "").trim();
    });
    rows.push(row);
  }
  return { headers, rows };
}
