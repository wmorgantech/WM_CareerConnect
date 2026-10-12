// Spreadsheet applications evaluate a cell as a formula when its text starts
// with = + - @ (also after leading whitespace or control characters, and for
// tab / carriage return). Such text values get a leading apostrophe, which
// spreadsheets treat as "this is text" and do not display as a formula.
const FORMULA_TRIGGER = /^[\s\u0000-\u001f]*[=+\-@]|^[\t\r]/;

export function neutralizeFormula(
  value: string,
): string {
  return FORMULA_TRIGGER.test(value)
    ? `'${value}`
    : value;
}

export function escapeCsvValue(
  value: unknown,
): string {
  if (value === null || value === undefined) {
    return "";
  }

  // Dates and numbers are produced by the system, never typed by a user, so
  // they cannot carry a formula (and negative numbers must stay numeric).
  const stringValue =
    value instanceof Date
      ? value.toISOString()
      : typeof value === "number" ||
          typeof value === "bigint"
        ? String(value)
        : neutralizeFormula(String(value));

  return `"${stringValue.replace(/"/g, '""')}"`;
}

export function createCsv(
  headers: string[],
  rows: unknown[][],
): string {
  const headerRow = headers
    .map(escapeCsvValue)
    .join(",");

  const dataRows = rows.map((row) =>
    row.map(escapeCsvValue).join(","),
  );

  return [headerRow, ...dataRows].join("\r\n");
}
