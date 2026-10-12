import { Router } from "express";

import { listRolesController } from "./roles.controller.js";

import { authenticate } from "../../middleware/auth.middleware.js";
import { requirePermission } from "../../middleware/permission.middleware.js";

const router = Router();

router.use(authenticate);

// Same permission as the Users module, which is the only consumer.
router.get(
  "/",
  requirePermission("users.manage"),
  listRolesController,
);

export default router;
