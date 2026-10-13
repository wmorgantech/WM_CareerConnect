import { Router } from "express";

import {
  listInterviewsController,
  listInterviewersController,
  getInterviewController,
  createInterviewController,
  updateInterviewController,
  deleteInterviewController,
  submitInterviewFeedbackController,
  unlockInterviewFeedbackController,
} from "./interviews.controller.js";

import { authenticate } from "../../middleware/auth.middleware.js";
import { requirePermission } from "../../middleware/permission.middleware.js";

const router = Router();

router.use(authenticate);

function requireInterviewViewPermission(
  req: Parameters<typeof authenticate>[0],
  res: Parameters<typeof authenticate>[1],
  next: Parameters<typeof authenticate>[2],
) {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      error: {
        code: "UNAUTHORIZED",
        message: "Authentication required",
      },
    });
  }

  const canView =
    req.user.permissions.includes("interviews.schedule") ||
    req.user.permissions.includes("interviews.feedback");

  if (!canView) {
    return res.status(403).json({
      success: false,
      error: {
        code: "FORBIDDEN",
        message: "You do not have permission to view interviews",
      },
    });
  }

  return next();
}

router.get(
  "/",
  requireInterviewViewPermission,
  listInterviewsController,
);

router.get(
  "/interviewers",
  requirePermission("interviews.schedule"),
  listInterviewersController,
);

router.get(
  "/:id",
  requireInterviewViewPermission,
  getInterviewController,
);

router.post(
  "/",
  requirePermission("interviews.schedule"),
  createInterviewController,
);

router.patch(
  "/:id",
  requirePermission("interviews.schedule"),
  updateInterviewController,
);

router.delete(
  "/:id",
  requirePermission("interviews.schedule"),
  deleteInterviewController,
);

router.post(
  "/:id/feedback",
  requirePermission("interviews.feedback"),
  submitInterviewFeedbackController,
);

router.post(
  "/:id/feedback/unlock",
  requirePermission("interviews.feedback"),
  unlockInterviewFeedbackController,
);

export default router;