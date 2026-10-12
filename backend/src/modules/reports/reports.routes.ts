import { Router } from "express";

import { authenticate } from "../../middleware/auth.middleware.js";
import { requirePermission } from "../../middleware/permission.middleware.js";

import {
  getReportController,
  exportReportController,
} from "./reports.controller.js";

const router = Router();

router.use(authenticate);

router.get(
  "/",
  requirePermission("reports.view"),
  getReportController,
);

router.get(
  "/export",
  requirePermission("reports.export"),
  exportReportController,
);

export default router;