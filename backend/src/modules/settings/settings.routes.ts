import { Router } from "express";

import { authenticate } from "../../middleware/auth.middleware.js";
import { requirePermission } from "../../middleware/permission.middleware.js";

import {
  getSettingsController,
  updateSettingsController,
} from "./settings.controller.js";

const router = Router();

router.use(authenticate);

router.get(
  "/",
  requirePermission("settings.manage"),
  getSettingsController,
);

router.patch(
  "/",
  requirePermission("settings.manage"),
  updateSettingsController,
);

export default router;