

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
