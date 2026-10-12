import { Router } from "express";

import {
  listCandidatesController,
  getCandidateController,
  createCandidateController,
  updateCandidateController,
  deleteCandidateController,
} from "./candidates.controller.js";

import { authenticate } from "../../middleware/auth.middleware.js";
import { requirePermission } from "../../middleware/permission.middleware.js";

const router = Router();

router.use(authenticate);
router.use(requirePermission("candidates.manage"));

router.get("/", listCandidatesController);
router.get("/:id", getCandidateController);
router.post("/", createCandidateController);
router.patch("/:id", updateCandidateController);
router.delete("/:id", deleteCandidateController);

export default router;