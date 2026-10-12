import { Router } from "express";

import {
  listDrivesController,
  getDriveController,
  createDriveController,
  updateDriveController,
  deleteDriveController,
} from "./drives.controller.js";

import { authenticate } from "../../middleware/auth.middleware.js";
import { requirePermission } from "../../middleware/permission.middleware.js";

const router = Router();

router.use(authenticate);
router.use(requirePermission("drives.manage"));

router.get("/", listDrivesController);

router.get("/:id", getDriveController);

router.post("/", createDriveController);

router.patch("/:id", updateDriveController);

router.delete("/:id", deleteDriveController);

export default router;