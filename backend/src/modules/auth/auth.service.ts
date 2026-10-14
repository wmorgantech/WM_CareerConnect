import crypto from "crypto";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { prisma } from "../../lib/prisma.js";
import type { LoginInput } from "./auth.schema.js";

const ACCESS_TOKEN_EXPIRES_IN = "15m";
const REFRESH_TOKEN_EXPIRES_IN_DAYS = 7;

export type AuthUserRecord = {
  id: string;
  email: string;
  name: string;
  passwordHash: string;
  status: "ACTIVE" | "INACTIVE";
  userRoles: Array<{
    role: {
      name: string;
      permissions: Array<{
        permission: {
          name: string;
        };
      }>;
    };
  }>;
};

export type StoredRefreshToken = {
  id: string;
  tokenHash: string;
  userId: string;
  expiresAt: Date;
  revokedAt: Date | null;
};

export type AccessSession = StoredRefreshToken & {
  user: AuthUserRecord;
};

export type AuthStore = {
  findUserByEmail(email: string): Promise<AuthUserRecord | null>;
  findUserById(userId: string): Promise<AuthUserRecord | null>;
  createRefreshToken(input: {
    tokenHash: string;
    userId: string;
    expiresAt: Date;
  }): Promise<{ id: string }>;
  findRefreshToken(
    tokenHash: string,
  ): Promise<StoredRefreshToken | null>;
  findAccessSession(
    sessionId: string,
  ): Promise<AccessSession | null>;
  rotateRefreshToken(input: {
    current: StoredRefreshToken;
    currentTokenHash: string;
    next: {
      tokenHash: string;
      userId: string;
      expiresAt: Date;
    };
    now: Date;
  }): Promise<boolean>;
  revokeRefreshToken(
    tokenHash: string,
    revokedAt: Date,
  ): Promise<void>;
  revokeSession(
    sessionId: string,
    revokedAt: Date,
  ): Promise<void>;
};

export type AuthenticatedSessionUser = {
  id: string;
  permissions: string[];
  roles: string[];
};

export class WrongPortalError extends Error {
  constructor() {
    super("This account must sign in from its own portal");
    this.name = "WrongPortalError";
  }
}

export type PortalOptions = {

  roleCheck?: (roles: readonly string[]) => boolean;
};

const authUserInclude = {
  userRoles: {
    include: {
      role: {
        include: {
          permissions: {
            include: {
              permission: true,
            },
          },
        },
      },
    },
  },
} as const;

function getJwtSecret(): string {
  const secret = process.env.JWT_ACCESS_SECRET;

  if (!secret) {
    throw new Error("JWT_ACCESS_SECRET is not configured");
  }

  return secret;
}

function getRefreshJwtSecret(): string {
  const secret = process.env.JWT_REFRESH_SECRET;

  if (!secret) {
    throw new Error("JWT_REFRESH_SECRET is not configured");
  }

  return secret;
}

function generateAccessToken(
  userId: string,
  sessionId: string,
): string {
  return jwt.sign(
    {
      sub: userId,
      sid: sessionId,
      type: "access",
    },
    getJwtSecret(),
    {
      expiresIn: ACCESS_TOKEN_EXPIRES_IN,
    },
  );
}

function generateRefreshToken(userId: string): string {
  return jwt.sign(
    {
      sub: userId,
      type: "refresh",
      jti: crypto.randomUUID(),
    },
    getRefreshJwtSecret(),
    {
      expiresIn: `${REFRESH_TOKEN_EXPIRES_IN_DAYS}d`,
    },
  );
}

function hashRefreshToken(token: string): string {
  return crypto
    .createHash("sha256")
    .update(token)
    .digest("hex");
}

function formatAuthData(user: AuthUserRecord) {
  const roles = user.userRoles.map(
    (userRole) => userRole.role.name,
  );

  const permissions = [
    ...new Set(
      user.userRoles.flatMap((userRole) =>
        userRole.role.permissions.map(
          (rolePermission) =>
            rolePermission.permission.name,
        ),
      ),
    ),
  ];

  return {
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      roles,
      permissions,
    },
    permissions,
  };
}

function getActiveAuthData(user: AuthUserRecord | null) {
  if (!user || user.status !== "ACTIVE") {
    throw new Error("User not found or inactive");
  }

  return formatAuthData(user);
}

export function createAuthService(store: AuthStore) {
  async function login(input: LoginInput, options: PortalOptions = {}) {
    const user = await store.findUserByEmail(
      input.email.toLowerCase(),
    );

    if (!user || user.status !== "ACTIVE") {
      throw new Error("Invalid email or password");
    }

    const passwordValid = await bcrypt.compare(
      input.password,
      user.passwordHash,
    );

    if (!passwordValid) {
      throw new Error("Invalid email or password");
    }

    const authData = formatAuthData(user);

    if (options.roleCheck && !options.roleCheck(authData.user.roles)) {
      throw new WrongPortalError();
    }

    const refreshToken = generateRefreshToken(user.id);
    const refreshTokenHash =
      hashRefreshToken(refreshToken);
    const refreshTokenExpiresAt = new Date(
      Date.now() +
        REFRESH_TOKEN_EXPIRES_IN_DAYS *
          24 *
          60 *
          60 *
          1000,
    );

    const session = await store.createRefreshToken({
      tokenHash: refreshTokenHash,
      userId: user.id,
      expiresAt: refreshTokenExpiresAt,
    });
    const accessToken = generateAccessToken(
      user.id,
      session.id,
    );

    return {
      user: authData.user,
      accessToken,
      refreshToken,
    };
  }

  async function refreshAccessToken(
    refreshToken: string,
    options: PortalOptions = {},
  ) {
    let payload: jwt.JwtPayload;

    try {
      payload = jwt.verify(
        refreshToken,
        getRefreshJwtSecret(),
      ) as jwt.JwtPayload;
    } catch {
      throw new Error("Invalid or expired refresh token");
    }

    if (
      payload.type !== "refresh" ||
      typeof payload.sub !== "string" ||
      typeof payload.jti !== "string"
    ) {
      throw new Error("Invalid refresh token");
    }

    const tokenHash = hashRefreshToken(refreshToken);
    const storedToken =
      await store.findRefreshToken(tokenHash);

    if (
      !storedToken ||
      storedToken.revokedAt ||
      storedToken.expiresAt <= new Date() ||
      storedToken.userId !== payload.sub
    ) {
      throw new Error("Invalid or expired refresh token");
    }

    const authData = getActiveAuthData(
      await store.findUserById(storedToken.userId),
    );

    if (options.roleCheck && !options.roleCheck(authData.user.roles)) {
      throw new Error("Invalid or expired refresh token");
    }

    const newRefreshToken = generateRefreshToken(
      storedToken.userId,
    );
    const newRefreshTokenHash =
      hashRefreshToken(newRefreshToken);
    const newAccessToken = generateAccessToken(
      authData.user.id,
      storedToken.id,
    );
    const newRefreshTokenExpiresAt = new Date(
      Date.now() +
        REFRESH_TOKEN_EXPIRES_IN_DAYS *
          24 *
          60 *
          60 *
          1000,
    );
    const rotated = await store.rotateRefreshToken({
      current: storedToken,
      currentTokenHash: tokenHash,
      next: {
        tokenHash: newRefreshTokenHash,
        userId: storedToken.userId,
        expiresAt: newRefreshTokenExpiresAt,
      },
      now: new Date(),
    });

    if (!rotated) {
      throw new Error("Invalid or expired refresh token");
    }

    return {
      user: authData.user,
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
    };
  }

  async function logout(
    refreshToken?: string,
    sessionId?: string,
  ) {
    const revokedAt = new Date();
    const revocations: Promise<void>[] = [];

    if (sessionId) {
      revocations.push(
        store.revokeSession(sessionId, revokedAt),
      );
    }

    if (refreshToken) {
      revocations.push(
        store.revokeRefreshToken(
          hashRefreshToken(refreshToken),
          revokedAt,
        ),
      );
    }

    await Promise.all(revocations);
  }

  async function getCurrentUser(userId: string) {
    return getActiveAuthData(
      await store.findUserById(userId),
    ).user;
  }

  async function resolveAccessSession(
    sessionId: string,
    userId: string,
  ): Promise<AuthenticatedSessionUser | null> {
    const session =
      await store.findAccessSession(sessionId);

    if (
      !session ||
      session.userId !== userId ||
      session.revokedAt !== null ||
      session.expiresAt <= new Date() ||
      session.user.id !== userId ||
      session.user.status !== "ACTIVE"
    ) {
      return null;
    }

    const authData = formatAuthData(session.user);

    return {
      id: userId,
      permissions: authData.permissions,
      roles: authData.user.roles,
    };
  }

  return {
    login,
    refreshAccessToken,
    logout,
    getCurrentUser,
    resolveAccessSession,
  };
}

export function getAccessTokenSessionId(
  accessToken: string,
): string | null {
  try {
    const payload = jwt.verify(
      accessToken,
      getJwtSecret(),
      { ignoreExpiration: true },
    ) as jwt.JwtPayload;

    return payload.type === "access" &&
      typeof payload.sub === "string" &&
      typeof payload.sid === "string"
      ? payload.sid
      : null;
  } catch {
    return null;
  }
}

export async function findActiveSessionUserId(
  refreshToken?: string,
  sessionId?: string,
): Promise<string | null> {
  const session = sessionId
    ? await prisma.refreshToken.findUnique({
        where: { id: sessionId },
        select: { userId: true, revokedAt: true },
      })
    : refreshToken
      ? await prisma.refreshToken.findUnique({
          where: {
            tokenHash: hashRefreshToken(refreshToken),
          },
          select: { userId: true, revokedAt: true },
        })
      : null;

  return session && session.revokedAt === null
    ? session.userId
    : null;
}

const prismaAuthStore: AuthStore = {
  async findUserByEmail(email) {
    const matches = await prisma.user.findMany({
      where: {
        email: {
          equals: email,
          mode: "insensitive",
        },
      },
      take: 2,
      include: authUserInclude,
    });

    if (matches.length > 1) {
      throw new Error(
        "Multiple staff accounts match this email ignoring case",
      );
    }

    return matches[0] ?? null;
  },

  findUserById(userId) {
    return prisma.user.findUnique({
      where: { id: userId },
      include: authUserInclude,
    });
  },

  async createRefreshToken(input) {
    const session = await prisma.refreshToken.create({
      data: input,
      select: {
        id: true,
      },
    });
    return session;
  },

  findRefreshToken(tokenHash) {
    return prisma.refreshToken.findUnique({
      where: { tokenHash },
      select: {
        id: true,
        tokenHash: true,
        userId: true,
        expiresAt: true,
        revokedAt: true,
      },
    });
  },

  findAccessSession(sessionId) {
    return prisma.refreshToken.findUnique({
      where: { id: sessionId },
      include: {
        user: {
          include: authUserInclude,
        },
      },
    });
  },

  async rotateRefreshToken(input) {
    return prisma.$transaction(async (tx) => {
      const rotateResult =
        await tx.refreshToken.updateMany({
          where: {
            id: input.current.id,
            tokenHash: input.currentTokenHash,
            revokedAt: null,
            expiresAt: {
              gt: input.now,
            },
          },
          data: {
            tokenHash: input.next.tokenHash,
            expiresAt: input.next.expiresAt,
          },
        });

      if (rotateResult.count !== 1) {
        return false;
      }

      return true;
    });
  },

  async revokeRefreshToken(tokenHash, revokedAt) {
    await prisma.refreshToken.updateMany({
      where: {
        tokenHash,
        revokedAt: null,
      },
      data: {
        revokedAt,
      },
    });
  },

  async revokeSession(sessionId, revokedAt) {
    await prisma.refreshToken.updateMany({
      where: {
        id: sessionId,
        revokedAt: null,
      },
      data: {
        revokedAt,
      },
    });
  },
};

const authService = createAuthService(prismaAuthStore);

export const login = authService.login;
export const refreshAccessToken =
  authService.refreshAccessToken;
export const logout = authService.logout;
export const getCurrentUser =
  authService.getCurrentUser;
export const resolveAccessSession =
  authService.resolveAccessSession;
