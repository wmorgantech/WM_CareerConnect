import { Router } from "express";

import { getAuditActor } from "../../lib/audit.js";
import { HttpError } from "../../lib/http-error.js";
import { authenticate } from "../../middleware/auth.middleware.js";
import {
  requireAnyPermission,
  requirePermission,
} from "../../middleware/permission.middleware.js";
import {
  bulkChange,
  bulkSchema,
  changeStatus,
  permissionFor,
  statusChangeSchema,
} from "./application-status.service.js";
import {
  applicationIdSchema,
  applicationListQuerySchema,
  issueCredential,
  listApplications,
  listInterviewSchedule,
  myDrives,
  registerStudent,
  registerStudentSchema,
  verifyStudent,
  type Actor,
} from "./applications.service.js";

const router = Router();

router.use(authenticate);

function applicationDriveId(value: string): string {
  return applicationListQuerySchema.shape.driveId.parse(value) as string;
}

function actorOf(req: { user?: { id: string; roles?: string[] } }): Actor {
  if (!req.user) throw new HttpError(401, "UNAUTHORIZED", "Authentication required");

  return { id: req.user.id, roles: req.user.roles ?? [] };
}

router.get("/my-drives", requireAnyPermission("candidates.register", "testStatus.monitor"), async (req, res) => {
  return res.status(200).json({ success: true, data: await myDrives(actorOf(req)) });
});

router.get("/interviews", requireAnyPermission("candidates.register", "testStatus.monitor"), async (req, res) => {
  const driveId = typeof req.query.driveId === "string" ? applicationDriveId(req.query.driveId) : undefined;

  return res.status(200).json({ success: true, data: await listInterviewSchedule(actorOf(req), driveId) });
});

router.post("/bulk-status", async (req, res) => {
  const input = bulkSchema.parse(req.body);
  const needed = permissionFor(input.action === "SHORTLIST" ? "SHORTLISTED" : "REJECTED");

  if (!req.user?.permissions.includes(needed)) {
    throw new HttpError(403, "FORBIDDEN", "You do not have permission to perform this action");
  }

  return res.status(200).json({ success: true, data: await bulkChange(actorOf(req), input, getAuditActor(req)) });
});

router.get("/", requireAnyPermission("candidates.register", "testStatus.monitor"), async (req, res) => {
  const result = await listApplications(actorOf(req), applicationListQuerySchema.parse(req.query));

  return res.status(200).json({ success: true, ...result });
});

router.post("/", requirePermission("candidates.register"), async (req, res) => {
  const input = registerStudentSchema.parse(req.body);

  return res
    .status(201)
    .json({ success: true, data: await registerStudent(actorOf(req), input, getAuditActor(req)) });
});

router.patch("/:id/status", async (req, res) => {
  const { id } = applicationIdSchema.parse(req.params);
  const input = statusChangeSchema.parse(req.body);

  if (!req.user?.permissions.includes(permissionFor(input.status))) {
    throw new HttpError(403, "FORBIDDEN", "You do not have permission to perform this action");
  }

  return res.status(200).json({ success: true, data: await changeStatus(actorOf(req), id, input, getAuditActor(req)) });
});

router.post("/:id/verify", requirePermission("candidates.register"), async (req, res) => {
  const { id } = applicationIdSchema.parse(req.params);

  return res
    .status(200)
    .json({ success: true, data: await verifyStudent(actorOf(req), id, getAuditActor(req)) });
});

router.post("/:id/credential", requirePermission("candidates.register"), async (req, res) => {
  const { id } = applicationIdSchema.parse(req.params);
  const issued = await issueCredential(actorOf(req), id, getAuditActor(req));

res.setHeader("Cache-Control", "no-store");

  return res.status(200).json({
    success: true,
    message: "Credential issued. Give the temporary password to the student; it is not shown again.",
    data: issued,
  });
});

export default router;
