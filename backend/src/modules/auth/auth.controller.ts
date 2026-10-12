import type { Request, Response } from "express";
import { loginSchema } from "./auth.schema.js";
import {
  login,
  refreshAccessToken,
  logout,
  getCurrentUser,
  getAccessTokenSessionId,
  findActiveSessionUserId,
} from "./auth.service.js";
import {
  getAuditActor,
  writeAuditBestEffort,
} from "../../lib/audit.js";
import { prisma } from "../../lib/prisma.js";
import { authenticate } from "../../middleware/auth.middleware.js";

const REFRESH_TOKEN_COOKIE_NAME = "wm_refresh_token";
const REFRESH_TOKEN_EXPIRES_IN_DAYS = 7;

const refreshCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  maxAge:
    REFRESH_TOKEN_EXPIRES_IN_DAYS *
    24 *
    60 *
    60 *
    1000,
  path: "/api/v1/auth",
};

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
    const result = await login(parsed.data);

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
      REFRESH_TOKEN_COOKIE_NAME,
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
    if (
      error instanceof Error &&
      error.message === "Invalid email or password"
    ) {
      // Neither the submitted email nor the password is recorded.
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
    req.cookies?.[REFRESH_TOKEN_COOKIE_NAME];

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
      await refreshAccessToken(refreshToken);

    res.cookie(
      REFRESH_TOKEN_COOKIE_NAME,
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
    req.cookies?.[REFRESH_TOKEN_COOKIE_NAME];
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

    // Recorded only when a live session was actually ended.
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
    REFRESH_TOKEN_COOKIE_NAME,
    {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/api/v1/auth",
    },
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