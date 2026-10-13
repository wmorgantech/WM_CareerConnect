

export class CsvError extends Error {}

export function parseCsv(text: string, maxRows = 2000): string[][] {
  const input = text.replace(/^﻿/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let touched = false;

  const endField = () => {
    row.push(field);
    field = "";
  };
  const endRow = () => {
    endField();

    if (row.some((cell) => cell.trim() !== "")) rows.push(row);
    if (rows.length > maxRows) throw new CsvError(`The file has more than ${maxRows} rows`);

    row = [];
    touched = false;
  };

  for (let i = 0; i < input.length; i += 1) {
    const ch = input[i] as string;

    if (inQuotes) {
      if (ch === '"') {
        if (input[i + 1] === '"') {
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

    if (ch === '"' && field === "" && !touched) {
      inQuotes = true;
      touched = true;
    } else if (ch === ",") {
      endField();
      touched = false;
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && input[i + 1] === "\n") i += 1;
      endRow();
    } else {
      field += ch;
      touched = true;
    }
  }

  if (inQuotes) throw new CsvError("A quoted value is never closed");
  if (field !== "" || row.length > 0) endRow();

  return rows;
}

export function csvEscape(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}
