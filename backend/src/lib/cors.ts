import type { CorsOptions } from "cors";

const LOCAL_DEV_ORIGIN =
  /^http:\/\/(localhost|127\.0\.0\.1)(:\d{1,5})?$/;

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

return !options.isProduction && LOCAL_DEV_ORIGIN.test(origin);
}

export function createCorsOptions(
  env: NodeJS.ProcessEnv = process.env,
): CorsOptions {
  return {
    credentials: true,

    exposedHeaders: ["Content-Disposition"],
    origin(origin, callback) {

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
