import type { Request } from "express";

export const CLIENT_HEADER = "x-wm-client";

export const LEGACY_REFRESH_COOKIE = "wm_refresh_token";

export const CLIENT_REFRESH_COOKIES: Readonly<Record<string, string>> = {
  admin: "wm_admin_refresh",
  staff: "wm_staff_refresh",

  hod: "wm_hod_refresh",
  "staff-portal": "wm_staffportal_refresh",
};

export function refreshCookieNameForClient(
  header: string | string[] | undefined,
): string {
  const value = Array.isArray(header) ? header[0] : header;
  const client = value?.trim().toLowerCase();

  if (client && Object.hasOwn(CLIENT_REFRESH_COOKIES, client)) {
    return CLIENT_REFRESH_COOKIES[client] as string;
  }

  return LEGACY_REFRESH_COOKIE;
}

export function refreshCookieName(req: Request): string {
  return refreshCookieNameForClient(req.headers[CLIENT_HEADER]);
}

export const REFRESH_COOKIE_PATH = "/api/v1/auth";
const REFRESH_COOKIE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export function buildRefreshCookieOptions(
  env: NodeJS.ProcessEnv = process.env,
) {
  return {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "lax" as const,
    maxAge: REFRESH_COOKIE_MAX_AGE_MS,
    path: REFRESH_COOKIE_PATH,
  };
}

export function buildClearRefreshCookieOptions(
  env: NodeJS.ProcessEnv = process.env,
) {
  return {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: REFRESH_COOKIE_PATH,
  };
}
