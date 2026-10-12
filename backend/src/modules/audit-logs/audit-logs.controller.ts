import type { Request, Response } from "express";

import { auditLogQuerySchema } from "./audit-logs.schema.js";
import { getAuditLogs } from "./audit-logs.service.js";

export async function getAuditLogsController(
  req: Request,
  res: Response,
) {
  const query = auditLogQuerySchema.parse(req.query);

  const result = await getAuditLogs(query);

  return res.status(200).json({
    success: true,
    data: result.logs,
    pagination: result.pagination,
  });
}