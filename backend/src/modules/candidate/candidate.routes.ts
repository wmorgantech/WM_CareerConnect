import { Router } from "express";
import type { Request, Response } from "express";

import { getAuditActor } from "../../lib/audit.js";
import { HttpError } from "../../lib/http-error.js";
import { authenticateCandidate } from "../../middleware/candidate-auth.middleware.js";
import { answerSaveLimiter, integrityEventLimiter } from "../../middleware/candidate-activity-limit.middleware.js";
import {
  candidateLoginLimiters,
  registrationLookupLimiter,
  registrationSubmitLimiter,
} from "../../middleware/candidate-rate-limit.middleware.js";
import {
  accessCodeQuerySchema,
  lookupDriveForRegistration,
  registerSelf,
  selfRegistrationSchema,
} from "../candidate-auth/candidate-registration.service.js";
import {
  CANDIDATE_SESSION_HOURS,
  candidateChangePassword,
  candidateLogin,
  candidateLoginSchema,
  candidateLogout,
  candidateMe,
  candidateRefresh,
  changePasswordSchema,
} from "../candidate-auth/candidate-auth.service.js";
import { candidateInterviews } from "./candidate-interviews.service.js";
import {
  answersSchema,
  assessmentInfo,
  attemptIdSchema,
  currentAttempt,
  eventSchema,
  recordEvent,
  saveAnswers,
  startAttempt,
  startSchema,
  submitAttempt,
} from "../assessment/assessment.service.js";

const router = Router();

const COOKIE = "wm_candidate_refresh";
const COOKIE_PATH = "/api/v1/candidate/auth";

function cookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: COOKIE_PATH,
  };
}

function ctxOf(req: Request) {
  if (!req.candidate) throw new HttpError(401, "UNAUTHORIZED", "Authentication required");

  return { applicationId: req.candidate.applicationId, candidateId: req.candidate.candidateId };
}

router.use((_req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  next();
});

// Public self-registration (no token). It only ever creates a student application.
router.get("/registration/drive", registrationLookupLimiter, async (req: Request, res: Response) => {
  const { code } = accessCodeQuerySchema.parse(req.query);

  return res.status(200).json({ success: true, data: await lookupDriveForRegistration(code) });
});

router.post("/registration", registrationSubmitLimiter, async (req: Request, res: Response) => {
  const input = selfRegistrationSchema.parse(req.body);

  return res.status(201).json({ success: true, data: await registerSelf(input, getAuditActor(req)) });
});

router.post("/auth/login", ...candidateLoginLimiters, async (req: Request, res: Response) => {
  const input = candidateLoginSchema.parse(req.body);
  const result = await candidateLogin(input, getAuditActor(req));

  res.cookie(COOKIE, result.refreshToken, { ...cookieOptions(), maxAge: CANDIDATE_SESSION_HOURS * 3_600_000 });

  return res.status(200).json({ success: true, data: { user: result.user, accessToken: result.accessToken } });
});

router.post("/auth/refresh", async (req: Request, res: Response) => {
  const token = req.cookies?.[COOKIE];

  if (!token) throw new HttpError(401, "REFRESH_TOKEN_MISSING", "Please sign in again");

  const result = await candidateRefresh(token);

  res.cookie(COOKIE, result.refreshToken, { ...cookieOptions(), maxAge: CANDIDATE_SESSION_HOURS * 3_600_000 });

  return res.status(200).json({ success: true, data: { user: result.user, accessToken: result.accessToken } });
});

router.post("/auth/logout", async (req: Request, res: Response) => {
  await candidateLogout({ refreshToken: req.cookies?.[COOKIE] });
  res.clearCookie(COOKIE, cookieOptions());

  return res.status(200).json({ success: true, message: "Signed out" });
});

router.post("/auth/change-password", authenticateCandidate({ allowPasswordChange: true }), async (req: Request, res: Response) => {
  const input = changePasswordSchema.parse(req.body);
  const principal = req.candidate!;

  await candidateChangePassword(principal, input, getAuditActor(req));

  return res.status(200).json({ success: true, message: "Password changed" });
});

router.get("/me", authenticateCandidate({ allowPasswordChange: true }), async (req: Request, res: Response) => {
  return res.status(200).json({ success: true, data: await candidateMe(ctxOf(req).applicationId) });
});

router.get("/interviews", authenticateCandidate(), async (req: Request, res: Response) => {
  return res.status(200).json({ success: true, data: await candidateInterviews(ctxOf(req)) });
});

router.get("/assessment", authenticateCandidate(), async (req: Request, res: Response) => {
  return res.status(200).json({ success: true, data: await assessmentInfo(ctxOf(req)) });
});

router.post("/attempts/start", authenticateCandidate(), async (req: Request, res: Response) => {
  const input = startSchema.parse(req.body);

  return res.status(200).json({ success: true, data: await startAttempt(ctxOf(req), input, getAuditActor(req)) });
});

router.get("/attempts/current", authenticateCandidate(), async (req: Request, res: Response) => {
  return res.status(200).json({ success: true, data: await currentAttempt(ctxOf(req)) });
});

router.patch("/attempts/:id/answers", authenticateCandidate(), answerSaveLimiter, async (req: Request, res: Response) => {
  const { id } = attemptIdSchema.parse(req.params);
  const input = answersSchema.parse(req.body);

  return res.status(200).json({ success: true, data: await saveAnswers(ctxOf(req), id, input) });
});

router.post("/attempts/:id/events", authenticateCandidate(), integrityEventLimiter, async (req: Request, res: Response) => {
  const { id } = attemptIdSchema.parse(req.params);
  const input = eventSchema.parse(req.body);

  return res.status(200).json({ success: true, data: await recordEvent(ctxOf(req), id, input, getAuditActor(req)) });
});

router.post("/attempts/:id/submit", authenticateCandidate(), async (req: Request, res: Response) => {
  const { id } = attemptIdSchema.parse(req.params);

  return res.status(200).json({ success: true, data: await submitAttempt(ctxOf(req), id, getAuditActor(req)) });
});

export default router;
