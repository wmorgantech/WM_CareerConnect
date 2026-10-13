import type { Request, RequestHandler } from "express";
import rateLimit from "express-rate-limit";

function limiter(limit: number, message: string): RequestHandler {
  return rateLimit({
    windowMs: 60_000,
    limit,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    keyGenerator: (req: Request) => `app:${req.candidate?.applicationId ?? "none"}`,
    validate: { keyGeneratorIpFallback: false },
    message: { success: false, error: { code: "RATE_LIMITED", message } },
  });
}

export const answerSaveLimiter = limiter(240, "Too many saves too quickly. Please wait a moment.");
export const integrityEventLimiter = limiter(60, "Too many events too quickly.");
