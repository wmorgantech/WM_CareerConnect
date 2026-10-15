import type { Request, RequestHandler } from "express";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";

import { normalizeLoginId } from "../domain/credential.js";

function rejection(code: string, message: string) {
  return { success: false, error: { code, message } };
}

type Options = { windowMs?: number; accountLimit?: number; ipLimit?: number };

export function createCandidateLoginLimiters(options: Options = {}): RequestHandler[] {
  const windowMs = options.windowMs ?? 15 * 60 * 1000;

  const accountKey = (req: Request) => {
    const loginId = typeof req.body?.loginId === "string" ? normalizeLoginId(req.body.loginId) : "";

    return loginId ? `acct:${loginId}` : `anon:${ipKeyGenerator(req.ip ?? "")}`;
  };

  const perAccount = rateLimit({
    windowMs,
    limit: options.accountLimit ?? 10,
    skipSuccessfulRequests: true,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    keyGenerator: accountKey,
    validate: { keyGeneratorIpFallback: false },
    message: rejection("LOGIN_RATE_LIMITED", "Too many failed attempts for this account. Please wait a few minutes or ask your coordinator."),
  });

  const perIp = rateLimit({
    windowMs,
    limit: options.ipLimit ?? 200,
    skipSuccessfulRequests: true,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    keyGenerator: (req) => `ip:${ipKeyGenerator(req.ip ?? "")}`,
    message: rejection("LOGIN_RATE_LIMITED", "Too many failed sign-in attempts from this network. Please wait a few minutes."),
  });

  return [perAccount, perIp];
}

export const candidateLoginLimiters = createCandidateLoginLimiters();

// Every request counts (not only failures), per client network. Self-registration
// deliberately does not use this: a whole campus registers from one shared network,
// so a per-network cap blocked genuine students after the first few.
export function createPerIpLimiter(limit: number, windowMs: number, code: string, message: string): RequestHandler {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    keyGenerator: (req) => `ip:${ipKeyGenerator(req.ip ?? "")}`,
    message: rejection(code, message),
  });
}
