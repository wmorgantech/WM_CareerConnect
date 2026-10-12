import { Router } from "express";
import { getDashboardStatsController } from "./dashboard.controller.js";
import { authenticate } from "../../middleware/auth.middleware.js";
import { requirePermission } from "../../middleware/permission.middleware.js";

const router = Router();

router.get(
  "/stats",
  authenticate,
  requirePermission("reports.view"),
  getDashboardStatsController,
);

export default router;