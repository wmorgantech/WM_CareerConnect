import { apiRequest } from "./api.js";
import { downloadFile } from "./download.service.js";
import { buildQuery, normalizeList, toQuery } from "./normalize.js";

// GET /reports (reports.view)
// params: { type: CANDIDATES|INTERVIEWS|RESULTS, driveId, collegeId,
//           status, fromDate, toDate, page, limit }
// Resolves with { items, pagination }.
export async function getReports(params = {}) {
  return normalizeList(await apiRequest(`/reports${toQuery(params)}`));
}

// GET /reports/export (reports.export): downloads the report as CSV.
// The server exports at most the first 100 matching rows.
export function exportReport(params = {}) {
  const type = String(params.type || "candidates").toLowerCase();

  return downloadFile(
    `/reports/export${buildQuery(params)}`,
    `${type}-report.csv`,
  );
}
