import type { Request, Response } from "express";

import { getAuditActor, writeAudit } from "../../lib/audit.js";
import { prisma } from "../../lib/prisma.js";
import { reportQuerySchema } from "./reports.schema.js";

import {
  getReport,
  exportReport,
} from "./reports.service.js";

export async function getReportController(
  req: Request,
  res: Response,
) {
  const query = reportQuerySchema.parse(req.query);

  const result = await getReport(
    query,
    req.user!,
  );

  if (result.type === "DRIVE_NOT_FOUND") {
    return res.status(404).json({
      success: false,
      error: {
        code: "DRIVE_NOT_FOUND",
        message: "Drive not found",
      },
    });
  }

  return res.status(200).json({
    success: true,
    data: result.data,
    pagination: result.pagination,
  });
}

export async function exportReportController(
  req: Request,
  res: Response,
) {
  const query = reportQuerySchema.parse(req.query);

  const result = await exportReport(
    query,
    req.user!,
  );

  if (result.type === "DRIVE_NOT_FOUND") {
    return res.status(404).json({
      success: false,
      error: {
        code: "DRIVE_NOT_FOUND",
        message: "Drive not found",
      },
    });
  }

  // Recorded before the file is sent: if the entry cannot be written the
  // export fails with an error instead of leaving the system unrecorded.
  await writeAudit(prisma, getAuditActor(req), {
    action: "REPORT_EXPORTED",
    entity: "Report",
    details: {
      type: query.type,
      format: "CSV",
      rowCount: result.rowCount,
      driveId: query.driveId,
      collegeId: query.collegeId,
      status: query.status,
      fromDate: query.fromDate,
      toDate: query.toDate,
    },
  });

  res.setHeader(
    "Content-Type",
    "text/csv; charset=utf-8",
  );

  res.setHeader(
    "Content-Disposition",
    `attachment; filename="${result.filename}"`,
  );

  return res.status(200).send(result.csv);
}