import { Router } from "express";
import { z } from "zod";

import { getAuditActor, writeAudit } from "../../lib/audit.js";
import { HttpError } from "../../lib/http-error.js";
import { asAuditDb, rdb } from "../../lib/recruitment-db.js";
import { authenticate } from "../../middleware/auth.middleware.js";
import { requirePermission } from "../../middleware/permission.middleware.js";
import { assessmentList, finalList, interviewList, placementOverview, placementQuerySchema } from "./placement.service.js";
import {
  exportResults,
  listResults,
  rankingFor,
  resultDetail,
  resultsQuerySchema,
  type Viewer,
} from "./results.service.js";

const router = Router();

router.use(authenticate);
router.use(requirePermission("results.view"));

function viewerOf(req: { user?: { id: string; roles?: string[] } }): Viewer {
  if (!req.user) throw new HttpError(401, "UNAUTHORIZED", "Authentication required");

  return { id: req.user.id, roles: req.user.roles ?? [] };
}

router.get("/", async (req, res) => {
  const result = await listResults(viewerOf(req), resultsQuerySchema.parse(req.query));

  return res.status(200).json({ success: true, ...result });
});

router.get("/ranking", async (req, res) => {
  const query = z
    .object({
      driveId: z.string().uuid().optional(),
      level: z.enum(["UG", "PG"]).optional(),
      limit: z.coerce.number().int().min(1).max(500).optional(),
    })
    .parse(req.query);

  return res.status(200).json({ success: true, ...(await rankingFor(viewerOf(req), query)) });
});

router.get("/export", async (req, res) => {
  const viewer = viewerOf(req);
  const result = await exportResults(viewer, resultsQuerySchema.omit({ page: true, limit: true }).parse(req.query));

await rdb().$transaction(async (tx) => {
    await writeAudit(asAuditDb(tx), getAuditActor(req), {
      action: "RESULTS_EXPORTED",
      entity: "Result",
      details: { rows: result.rowCount },
    });
  });

  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${result.filename}"`);
  res.setHeader("Cache-Control", "no-store");

  return res.status(200).send(result.csv);
});

// Read-only placement views for the college portals. Each one is built on the college-scoped result rows.
router.get("/placement/overview", async (req, res) => {
  return res.status(200).json({ success: true, data: await placementOverview(viewerOf(req), placementQuerySchema.parse(req.query)) });
});

router.get("/placement/assessment", async (req, res) => {
  return res.status(200).json({ success: true, ...(await assessmentList(viewerOf(req), placementQuerySchema.parse(req.query))) });
});

router.get("/placement/interviews", async (req, res) => {
  return res.status(200).json({ success: true, ...(await interviewList(viewerOf(req), placementQuerySchema.parse(req.query))) });
});

router.get("/placement/final", async (req, res) => {
  return res.status(200).json({ success: true, ...(await finalList(viewerOf(req), placementQuerySchema.parse(req.query))) });
});

router.get("/:applicationId", async (req, res) => {
  const { applicationId } = z.object({ applicationId: z.string().uuid("Invalid application ID") }).parse(req.params);

  return res.status(200).json({ success: true, data: await resultDetail(viewerOf(req), applicationId) });
});

export default router;
