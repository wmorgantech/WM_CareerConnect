import type { Request, Response } from "express";
import { loginSchema } from "./auth.schema.js";
import {
  login,
  refreshAccessToken,
  logout,
  getCurrentUser,
  getAccessTokenSessionId,
  findActiveSessionUserId,
  WrongPortalError,
} from "./auth.service.js";
import { portalOptionsFor } from "../../lib/portal-roles.js";
import {
  getAuditActor,
  writeAuditBestEffort,
} from "../../lib/audit.js";
import { prisma } from "../../lib/prisma.js";
import {
  buildClearRefreshCookieOptions,
  buildRefreshCookieOptions,
  refreshCookieName,
} from "../../lib/refresh-cookie.js";
import { authenticate } from "../../middleware/auth.middleware.js";

const refreshCookieOptions = buildRefreshCookieOptions();

export async function loginController(
  req: Request,
  res: Response,
) {
  const parsed = loginSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Invalid login details",
        details: parsed.error.flatten(),
      },
    });
  }

  try {
    const result = await login(parsed.data, portalOptionsFor(req));

    await writeAuditBestEffort(
      prisma,
      { ...getAuditActor(req), userId: result.user.id },
      {
        action: "LOGIN_SUCCEEDED",
        entity: "User",
        entityId: result.user.id,
      },
    );

    res.cookie(
      refreshCookieName(req),
      result.refreshToken,
      refreshCookieOptions,
    );

    return res.status(200).json({
      success: true,
      message: "Login successful",
      data: {
        user: result.user,
        accessToken: result.accessToken,
      },
    });
  } catch (error) {
    if (error instanceof WrongPortalError) {
      return res.status(403).json({
        success: false,
        error: {
          code: "WRONG_PORTAL",
          message:
            "This account cannot sign in here. Use the sign-in page for your role.",
        },
      });
    }

    if (
      error instanceof Error &&
      error.message === "Invalid email or password"
    ) {

      await writeAuditBestEffort(prisma, getAuditActor(req), {
        action: "LOGIN_FAILED",
        entity: "Auth",
        details: { reason: "INVALID_CREDENTIALS" },
      });

      return res.status(401).json({
        success: false,
        error: {
          code: "INVALID_CREDENTIALS",
          message: "Invalid email or password",
        },
      });
    }

    throw error;
  }
}

export async function refreshController(
  req: Request,
  res: Response,
) {
  const refreshToken =
    req.cookies?.[refreshCookieName(req)];

  if (!refreshToken) {
    return res.status(401).json({
      success: false,
      error: {
        code: "REFRESH_TOKEN_MISSING",
        message: "Refresh token is missing",
      },
    });
  }

  try {
    const result =
      await refreshAccessToken(refreshToken, portalOptionsFor(req));

    res.cookie(
      refreshCookieName(req),
      result.refreshToken,
      refreshCookieOptions,
    );

    return res.status(200).json({
      success: true,
      message: "Token refreshed successfully",
      data: {
        user: result.user,
        accessToken: result.accessToken,
      },
    });
  } catch (error) {
    if (
      error instanceof Error &&
      (
        error.message ===
          "Invalid or expired refresh token" ||
        error.message === "Invalid refresh token" ||
        error.message ===
          "User not found or inactive"
      )
    ) {
      return res.status(401).json({
        success: false,
        error: {
          code: "INVALID_REFRESH_TOKEN",
          message: "Invalid or expired refresh token",
        },
      });
    }

    throw error;
  }
}

export async function logoutController(
  req: Request,
  res: Response,
) {
  const refreshToken =
    req.cookies?.[refreshCookieName(req)];
  const authorization = req.headers.authorization;
  const accessToken = authorization?.startsWith(
    "Bearer ",
  )
    ? authorization.slice(7).trim()
    : "";
  const sessionId = accessToken
    ? getAccessTokenSessionId(accessToken)
    : null;

  if (refreshToken || sessionId) {
    const sessionUserId = await findActiveSessionUserId(
      refreshToken,
      sessionId ?? undefined,
    );

    await logout(refreshToken, sessionId ?? undefined);

if (sessionUserId) {
      await writeAuditBestEffort(
        prisma,
        { ...getAuditActor(req), userId: sessionUserId },
        {
          action: "LOGOUT",
          entity: "User",
          entityId: sessionUserId,
        },
      );
    }
  }

  res.clearCookie(
    refreshCookieName(req),
    buildClearRefreshCookieOptions(),
  );

  return res.status(200).json({
    success: true,
    message: "Logout successful",
  });
}

export async function meController(
  req: Request,
  res: Response,
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

  try {
    const user = await getCurrentUser(req.user.id);

    return res.status(200).json({
      success: true,
      message: "User retrieved successfully",
      data: {
        user,
      },
    });
  } catch (error) {
    if (
      error instanceof Error &&
      error.message ===
        "User not found or inactive"
    ) {
      return res.status(401).json({
        success: false,
        error: {
          code: "UNAUTHORIZED",
          message: "User not found or inactive",
        },
      });
    }

    throw error;
  }
}