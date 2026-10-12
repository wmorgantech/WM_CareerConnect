import { Router } from "express";

import {
  loginController,
  refreshController,
  logoutController,
  meController,
} from "./auth.controller.js";

import { authenticate } from "../../middleware/auth.middleware.js";
import { loginRateLimiter } from "../../middleware/auth-rate-limit.middleware.js";

const router = Router();

router.post("/login", loginRateLimiter, loginController);

router.post("/refresh", refreshController);

router.post("/logout", logoutController);

router.get(
  "/me",
  authenticate,
  meController,
);

export default router;