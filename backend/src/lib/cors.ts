import type { CorsOptions } from "cors";

// Browsers on a developer machine may be served from any local port
// (Vite moves to the next free port when 5173 is busy).
const LOCAL_DEV_ORIGIN =
  /^http:\/\/(localhost|127\.0\.0\.1)(:\d{1,5})?$/;

// WEB_ORIGIN accepts one origin or a comma-separated list.
export function parseAllowedOrigins(
  value: string | undefined,
): string[] {
  if (!value) {
    return [];
  }

  return value
    .split(",")
    .map((origin) => origin.trim().replace(/\/+$/, ""))
    .filter((origin) => origin.length > 0);
}

export function isOriginAllowed(
  origin: string,
  options: {
    allowedOrigins: string[];
    isProduction: boolean;
  },
): boolean {
  if (options.allowedOrigins.includes(origin)) {
    return true;
  }

  // Any local port is accepted outside production only.
  return !options.isProduction && LOCAL_DEV_ORIGIN.test(origin);
}

// Environment is read per request so the options always reflect the
// loaded configuration. In production only the origins listed in
// WEB_ORIGIN are allowed; if it is unset, no cross-origin browser
// request is allowed.
export function createCorsOptions(
  env: NodeJS.ProcessEnv = process.env,
): CorsOptions {
  return {
    credentials: true,
    // Lets the browser read the server's file name on CSV downloads.
    exposedHeaders: ["Content-Disposition"],
    origin(origin, callback) {
      // Requests without an Origin header (same-origin, curl, server to
      // server) are not cross-origin browser requests.
      if (!origin) {
        callback(null, true);
        return;
      }

      callback(
        null,
        isOriginAllowed(origin, {
          allowedOrigins: parseAllowedOrigins(env.WEB_ORIGIN),
          isProduction: env.NODE_ENV === "production",
        }),
      );
    },
  };
}
