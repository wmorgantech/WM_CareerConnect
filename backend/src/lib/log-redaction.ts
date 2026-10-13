

export const LOG_REDACT = {
  paths: [
    "req.headers.authorization",
    "req.headers.cookie",
    'res.headers["set-cookie"]',
    "*.password",
    "*.newPassword",
    "*.currentPassword",
    "*.passwordHash",
    "*.temporaryPassword",
    "*.accessToken",
    "*.refreshToken",
  ],
  censor: "[redacted]",
};
