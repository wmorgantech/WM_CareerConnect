import { Router } from "express";

import authRoutes from "../modules/auth/auth.routes.js";
import usersRoutes from "../modules/users/users.routes.js";
import rolesRoutes from "../modules/roles/roles.routes.js";
import collegesRoutes from "../modules/colleges/colleges.routes.js";
import drivesRoutes from "../modules/drives/drives.routes.js";
import candidatesRoutes from "../modules/candidates/candidates.routes.js";
import interviewsRoutes from "../modules/interviews/interviews.routes.js";
import reportsRoutes from "../modules/reports/reports.routes.js";
import settingsRoutes from "../modules/settings/settings.routes.js";
import auditLogsRoutes from "../modules/audit-logs/audit-logs.routes.js";
import dashboardRoutes from "../modules/dashboard/dashboard.routes.js";

const router = Router();

router.get("/health", (_req, res) => {
  return res.status(200).json({
    success: true,
    message: "WM CareerConnect API v1 is running",
  });
});

router.use("/auth", authRoutes);
router.use("/users", usersRoutes);
router.use("/roles", rolesRoutes);
router.use("/colleges", collegesRoutes);
router.use("/drives", drivesRoutes);
router.use("/candidates", candidatesRoutes);
router.use("/interviews", interviewsRoutes);
router.use("/reports", reportsRoutes);
router.use("/settings", settingsRoutes);
router.use("/audit-logs", auditLogsRoutes);
router.use("/dashboard", dashboardRoutes);

export default router;