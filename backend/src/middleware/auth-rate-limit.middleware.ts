import rateLimit from "express-rate-limit";

type LoginRateLimiterOptions = {
  windowMs?: number;
  limit?: number;
};

export function createLoginRateLimiter(
  options: LoginRateLimiterOptions = {},
) {
  return rateLimit({
    windowMs: options.windowMs ?? 15 * 60 * 1000,
    limit: options.limit ?? 5,
    skipSuccessfulRequests: true,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: {
      success: false,
      error: {
        code: "LOGIN_RATE_LIMITED",
        message:
          "Too many failed login attempts. Please try again in 15 minutes.",
      },
    },
    handler: (_req, res, _next, rateLimitOptions) => {
      res
        .status(rateLimitOptions.statusCode)
        .json(rateLimitOptions.message);
    },
  });
}

function configuredLimit(env: NodeJS.ProcessEnv = process.env): number {
  const parsed = Number(env.LOGIN_RATE_LIMIT);

  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 1000 ? parsed : 5;
}

export const loginRateLimiter = createLoginRateLimiter({
  limit: configuredLimit(),
});
