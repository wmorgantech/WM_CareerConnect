import { Router } from "express";

import {
  listUsersController,
  getUserController,
  createUserController,
  updateUserController,
  updateUserStatusController,
  deleteUserController,
} from "./users.controller.js";

import { authenticate } from "../../middleware/auth.middleware.js";
import { requirePermission } from "../../middleware/permission.middleware.js";

const router = Router();

router.use(authenticate);
router.use(requirePermission("users.manage"));

router.get("/", listUsersController);

router.get("/:id", getUserController);

router.post("/", createUserController);

router.patch("/:id", updateUserController);

router.patch(
  "/:id/status",
  updateUserStatusController,
);

router.delete("/:id", deleteUserController);

export default router;