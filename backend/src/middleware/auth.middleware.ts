import type {
  NextFunction,
  Request,
  Response,
} from "express";
import jwt from "jsonwebtoken";
import {
  resolveAccessSession,
  type AuthenticatedSessionUser,
} from "../modules/auth/auth.service.js";

interface AuthenticatedUser {
  id: string;
  permissions: string[];
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

type AccessSessionResolver = (
  sessionId: string,
  userId: string,
) => Promise<AuthenticatedSessionUser | null>;

function getJwtSecret(): string {
  const secret = process.env.JWT_ACCESS_SECRET;

  if (!secret) {
    throw new Error(
      "JWT_ACCESS_SECRET is not configured",
    );
  }

  return secret;
}

function unauthorized(res: Response) {
  return res.status(401).json({
    success: false,
    error: {
      code: "UNAUTHORIZED",
      message: "Invalid or expired access token",
    },
  });
}

export function createAuthenticate(
  resolveSession: AccessSessionResolver =
    resolveAccessSession,
) {
  return async function authenticate(
    req: Request,
    res: Response,
    next: NextFunction,
  ) {
    const authorization = req.headers.authorization;

    if (!authorization?.startsWith("Bearer ")) {
      return res.status(401).json({
        success: false,
        error: {
          code: "UNAUTHORIZED",
          message: "Authentication required",
        },
      });
    }

    const token = authorization.slice(7).trim();

    if (!token) {
      return res.status(401).json({
        success: false,
        error: {
          code: "UNAUTHORIZED",
          message: "Authentication required",
        },
      });
    }

    let payload: jwt.JwtPayload;
    let secret: string;

    try {
      secret = getJwtSecret();
    } catch {
      return next(
        new Error("JWT_ACCESS_SECRET is not configured"),
      );
    }

    try {
      payload = jwt.verify(token, secret) as jwt.JwtPayload;
    } catch {
      return unauthorized(res);
    }

    if (
      typeof payload.sub !== "string" ||
      typeof payload.sid !== "string" ||
      payload.type !== "access"
    ) {
      return unauthorized(res);
    }

    let user: AuthenticatedSessionUser | null;

    try {
      user = await resolveSession(
        payload.sid,
        payload.sub,
      );
    } catch (error) {
      return next(error);
    }

    if (!user) {
      return unauthorized(res);
    }

    req.user = user;
    return next();
  };
}

export const authenticate = createAuthenticate();
