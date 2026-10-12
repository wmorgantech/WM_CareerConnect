import rateLimit from "express-rate-limit";

type LoginRateLimiterOptions = {
  windowMs?: number;
  limit?: number;
};

// Limits failed login attempts per client IP. Successful logins (status
// below 400) are not counted, so normal sign-ins never consume the
// allowance.
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

export const loginRateLimiter = createLoginRateLimiter();
