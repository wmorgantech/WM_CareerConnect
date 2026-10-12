import { Router } from "express";

import {
  listCollegesController,
  getCollegeController,
  createCollegeController,
  updateCollegeController,
  deleteCollegeController,
} from "./colleges.controller.js";

import { authenticate } from "../../middleware/auth.middleware.js";
import { requirePermission } from "../../middleware/permission.middleware.js";

const router = Router();

router.use(authenticate);
router.use(requirePermission("colleges.manage"));

router.get("/", listCollegesController);
router.get("/:id", getCollegeController);
router.post("/", createCollegeController);
router.patch("/:id", updateCollegeController);
router.delete("/:id", deleteCollegeController);

export default router;