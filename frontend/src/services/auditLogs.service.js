import { apiRequest } from "./api.js";
import { normalizeList, toQuery } from "./normalize.js";

// GET /audit-logs (audit.view)
// params: { userId, action, entity, entityId, fromDate, toDate, page, limit }
// Resolves with { items, pagination }.
export async function getAuditLogs(params = {}) {
  return normalizeList(
    await apiRequest(`/audit-logs${toQuery(params)}`),
  );
}
