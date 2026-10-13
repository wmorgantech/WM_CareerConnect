import { Router } from "express";

import { getAuditActor } from "../../lib/audit.js";
import { authenticate } from "../../middleware/auth.middleware.js";
import { requirePermission } from "../../middleware/permission.middleware.js";
import {
  assignCoordinator,
  assignCoordinatorSchema,
  driveParamsSchema,
  getDriveConfig,
  levelParamsSchema,
  listCoordinatorCandidates,
  listTemplateOptions,
  removeDriveTemplate,
  setDriveTemplate,
  setTemplateSchema,
  unassignCoordinator,
  updateConfigSchema,
  updateDriveConfig,
} from "./drive-config.service.js";

const router = Router();

const guard = [authenticate, requirePermission("drives.manage")];

router.get("/template-options", ...guard, async (_req, res) => {
  return res.status(200).json({ success: true, data: await listTemplateOptions() });
});

router.get("/coordinator-candidates", ...guard, async (_req, res) => {
  return res.status(200).json({ success: true, data: await listCoordinatorCandidates() });
});

router.get("/:id/config", ...guard, async (req, res) => {
  const { id } = driveParamsSchema.parse(req.params);

  return res.status(200).json({ success: true, data: await getDriveConfig(id) });
});

router.patch("/:id/config", ...guard, async (req, res) => {
  const { id } = driveParamsSchema.parse(req.params);
  const input = updateConfigSchema.parse(req.body);

  return res
    .status(200)
    .json({ success: true, data: await updateDriveConfig(id, input, getAuditActor(req)) });
});

router.put("/:id/templates/:level", ...guard, async (req, res) => {
  const { id, level } = levelParamsSchema.parse(req.params);
  const { templateId } = setTemplateSchema.parse(req.body);

  return res
    .status(200)
    .json({ success: true, data: await setDriveTemplate(id, level, templateId, getAuditActor(req)) });
});

router.delete("/:id/templates/:level", ...guard, async (req, res) => {
  const { id, level } = levelParamsSchema.parse(req.params);

  return res
    .status(200)
    .json({ success: true, data: await removeDriveTemplate(id, level, getAuditActor(req)) });
});

router.put("/:id/coordinators", ...guard, async (req, res) => {
  const { id } = driveParamsSchema.parse(req.params);
  const { userId } = assignCoordinatorSchema.parse(req.body);

  return res
    .status(200)
    .json({ success: true, data: await assignCoordinator(id, userId, getAuditActor(req)) });
});

router.delete("/:id/coordinators/:userId", ...guard, async (req, res) => {
  const { id } = driveParamsSchema.parse(req.params);
  const { userId } = assignCoordinatorSchema.parse({ userId: req.params.userId });

  return res
    .status(200)
    .json({ success: true, data: await unassignCoordinator(id, userId, getAuditActor(req)) });
});

export default router;
