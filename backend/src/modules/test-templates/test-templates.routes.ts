import { Router } from "express";

import { getAuditActor } from "../../lib/audit.js";
import { authenticate } from "../../middleware/auth.middleware.js";
import { requirePermission } from "../../middleware/permission.middleware.js";
import {
  createTemplate,
  createTemplateSchema,
  deleteTemplate,
  getTemplate,
  listTemplates,
  setTemplateStatus,
  templateCapacity,
  templateIdSchema,
  templateStatusSchema,
  updateTemplate,
  updateTemplateSchema,
} from "./test-templates.service.js";

const router = Router();

router.use(authenticate);
router.use(requirePermission("tests.manage"));

router.get("/", async (_req, res) => {
  return res.status(200).json({ success: true, data: await listTemplates() });
});

router.get("/:id", async (req, res) => {
  const { id } = templateIdSchema.parse(req.params);

  return res.status(200).json({ success: true, data: await getTemplate(id) });
});

router.get("/:id/capacity", async (req, res) => {
  const { id } = templateIdSchema.parse(req.params);

  return res.status(200).json({ success: true, data: await templateCapacity(id) });
});

router.post("/", async (req, res) => {
  const input = createTemplateSchema.parse(req.body);

  return res
    .status(201)
    .json({ success: true, data: await createTemplate(input, getAuditActor(req)) });
});

router.patch("/:id", async (req, res) => {
  const { id } = templateIdSchema.parse(req.params);
  const input = updateTemplateSchema.parse(req.body);

  return res
    .status(200)
    .json({ success: true, data: await updateTemplate(id, input, getAuditActor(req)) });
});

router.patch("/:id/status", async (req, res) => {
  const { id } = templateIdSchema.parse(req.params);
  const { isActive } = templateStatusSchema.parse(req.body);

  return res
    .status(200)
    .json({ success: true, data: await setTemplateStatus(id, isActive, getAuditActor(req)) });
});

router.delete("/:id", async (req, res) => {
  const { id } = templateIdSchema.parse(req.params);

  await deleteTemplate(id, getAuditActor(req));

  return res.status(200).json({ success: true, message: "Template deleted" });
});

export default router;
