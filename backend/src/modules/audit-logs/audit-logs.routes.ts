import { Router } from "express";

import { authenticate } from "../../middleware/auth.middleware.js";
import { requirePermission } from "../../middleware/permission.middleware.js";

import {
  getAuditLogsController,
} from "./audit-logs.controller.js";

const router = Router();

router.use(authenticate);

router.get(
  "/",
  requirePermission("audit.view"),
  getAuditLogsController,
);

export default router;