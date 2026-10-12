import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { createAuthenticate } from "../src/middleware/auth.middleware.js";
import type {
  AuthStore,
  AuthUserRecord,
  StoredRefreshToken,
} from "../src/modules/auth/auth.service.js";
import {
  createAuthService,
  getAccessTokenSessionId,
} from "../src/modules/auth/auth.service.js";

function createMemoryAuthStore(user: AuthUserRecord) {
  const usersById = new Map([[user.id, user]]);
  const refreshTokens = new Map<
    string,
    StoredRefreshToken
  >();

  const store: AuthStore = {
    async findUserByEmail(email) {
      return [...usersById.values()].find(
        (candidate) => candidate.email === email,
      ) ?? null;
    },

    async findUserById(userId) {
      return usersById.get(userId) ?? null;
    },

    async createRefreshToken(input) {
      const token: StoredRefreshToken = {
        id: randomUUID(),
        ...input,
        revokedAt: null,
      };
      refreshTokens.set(token.tokenHash, token);
      return { id: token.id };
    },

    async findRefreshToken(tokenHash) {
      return refreshTokens.get(tokenHash) ?? null;
    },

    async findAccessSession(sessionId) {
      const token = [...refreshTokens.values()].find(
        (candidate) => candidate.id === sessionId,
      );
      const tokenUser = token
        ? usersById.get(token.userId)
        : null;

      return token && tokenUser
        ? { ...token, user: tokenUser }
        : null;
    },

    async rotateRefreshToken(input) {
      const current = refreshTokens.get(
        input.currentTokenHash,
      );

      if (
        !current ||
        current.id !== input.current.id ||
        current.revokedAt ||
        current.expiresAt <= input.now
      ) {
        return false;
      }

      refreshTokens.delete(input.currentTokenHash);
      current.tokenHash = input.next.tokenHash;
      current.expiresAt = input.next.expiresAt;
      refreshTokens.set(current.tokenHash, current);
      return true;
    },

    async revokeRefreshToken(tokenHash, revokedAt) {
      const token = refreshTokens.get(tokenHash);

      if (token && token.revokedAt === null) {
        token.revokedAt = revokedAt;
      }
    },

    async revokeSession(sessionId, revokedAt) {
      const token = [...refreshTokens.values()].find(
        (candidate) => candidate.id === sessionId,
      );

      if (token && token.revokedAt === null) {
        token.revokedAt = revokedAt;
      }
    },
  };

  return { store, usersById, refreshTokens };
}

function createTestUser(): AuthUserRecord {
  return {
    id: randomUUID(),
    email: "candidate@example.test",
    name: "Test User",
    passwordHash: "",
    status: "ACTIVE",
    userRoles: [
      {
        role: {
          name: "INTERVIEWER",
          permissions: [
            {
              permission: {
                name: "interviews.feedback",
              },
            },
          ],
        },
      },
    ],
  };
}

async function makeAuthFixture() {
  const user = createTestUser();
  user.passwordHash = await bcrypt.hash(
    "correct-password",
    4,
  );

  const memory = createMemoryAuthStore(user);
  const service = createAuthService(memory.store);

  return { user, ...memory, service };
}

async function authenticateToken(
  service: ReturnType<typeof createAuthService>,
  token: string | undefined,
) {
  const middleware = createAuthenticate(
    service.resolveAccessSession,
  );
  const req = {
    headers: token
      ? { authorization: `Bearer ${token}` }
      : {},
  };
  let responseStatus = 200;
  let responseBody: unknown;
  let nextCalled = false;
  let nextError: unknown;
  const res = {
    status(status: number) {
      responseStatus = status;
      return this;
    },
    json(body: unknown) {
      responseBody = body;
      return this;
    },
  };

  await middleware(
    req as never,
    res as never,
    ((error?: unknown) => {
      nextCalled = true;
      nextError = error;
    }) as never,
  );

  return {
    status: responseStatus,
    body: responseBody,
    user: (req as { user?: { id: string; permissions: string[] } })
      .user,
    nextCalled,
    nextError,
  };
}

test("login issues an access token that authorizes an active session", async () => {
  const { user, service } = await makeAuthFixture();
  const result = await service.login({
    email: user.email,
    password: "correct-password",
  });

  assert.equal(result.user.id, user.id);
  assert.ok(result.accessToken);
  assert.ok(result.refreshToken);

  const authenticated = await authenticateToken(
    service,
    result.accessToken,
  );

  assert.equal(authenticated.status, 200);
  assert.equal(authenticated.nextCalled, true);
  assert.equal(authenticated.user?.id, user.id);
  assert.deepEqual(authenticated.user?.permissions, [
    "interviews.feedback",
  ]);
});

test("access and refresh token lifetimes remain 15 minutes and 7 days", async () => {
  const { user, service, refreshTokens } =
    await makeAuthFixture();
  const result = await service.login({
    email: user.email,
    password: "correct-password",
  });
  const accessPayload = jwt.decode(
    result.accessToken,
  ) as jwt.JwtPayload;
  const refreshPayload = jwt.decode(
    result.refreshToken,
  ) as jwt.JwtPayload;
  const storedSession = [...refreshTokens.values()][0];

  assert.equal(
    (accessPayload.exp ?? 0) - (accessPayload.iat ?? 0),
    15 * 60,
  );
  assert.equal(
    (refreshPayload.exp ?? 0) - (refreshPayload.iat ?? 0),
    7 * 24 * 60 * 60,
  );
  assert.ok(storedSession);
  assert.ok(
    Math.abs(
      storedSession.expiresAt.getTime() -
        Date.now() -
        7 * 24 * 60 * 60 * 1000,
    ) < 1000,
  );
});

test("login rejects invalid credentials without exposing internals", async () => {
  const { user, service } = await makeAuthFixture();

  await assert.rejects(
    service.login({
      email: user.email,
      password: "incorrect-password",
    }),
    { message: "Invalid email or password" },
  );

  const missingToken = await authenticateToken(
    service,
    undefined,
  );
  assert.equal(missingToken.status, 401);
  assert.deepEqual(missingToken.body, {
    success: false,
    error: {
      code: "UNAUTHORIZED",
      message: "Authentication required",
    },
  });
});

test("logout invalidates the access token for its refresh-token session", async () => {
  const { service, user } = await makeAuthFixture();
  const login = await service.login({
    email: user.email,
    password: "correct-password",
  });

  await service.logout(login.refreshToken);

  const authenticated = await authenticateToken(
    service,
    login.accessToken,
  );

  assert.equal(authenticated.status, 401);
  assert.deepEqual(authenticated.body, {
    success: false,
    error: {
      code: "UNAUTHORIZED",
      message: "Invalid or expired access token",
    },
  });
});

test("logout can revoke the session using its signed access token when the cookie is stale", async () => {
  const { service, user } = await makeAuthFixture();
  const login = await service.login({
    email: user.email,
    password: "correct-password",
  });
  const refreshed = await service.refreshAccessToken(
    login.refreshToken,
  );
  const sessionId = getAccessTokenSessionId(
    refreshed.accessToken,
  );

  assert.ok(sessionId);
  await service.logout(login.refreshToken, sessionId);

  const authenticated = await authenticateToken(
    service,
    refreshed.accessToken,
  );

  assert.equal(authenticated.status, 401);
  await assert.rejects(
    service.refreshAccessToken(refreshed.refreshToken),
    { message: "Invalid or expired refresh token" },
  );
});

test("deactivated users are denied despite an unexpired access token", async () => {
  const { service, user } = await makeAuthFixture();
  const login = await service.login({
    email: user.email,
    password: "correct-password",
  });

  user.status = "INACTIVE";

  const authenticated = await authenticateToken(
    service,
    login.accessToken,
  );

  assert.equal(authenticated.status, 401);
});

test("role and permission changes apply to the next request using an existing access token", async () => {
  const { service, user } = await makeAuthFixture();
  const login = await service.login({
    email: user.email,
    password: "correct-password",
  });

  user.userRoles = [
    {
      role: {
        name: "CANDIDATE",
        permissions: [
          {
            permission: {
              name: "candidates.view",
            },
          },
        ],
      },
    },
  ];

  const authenticated = await authenticateToken(
    service,
    login.accessToken,
  );

  assert.equal(authenticated.status, 200);
  assert.deepEqual(authenticated.user?.permissions, [
    "candidates.view",
  ]);
});

test("refresh rotates the stored hash and rejects replay of the old token", async () => {
  const { service, user } = await makeAuthFixture();
  const login = await service.login({
    email: user.email,
    password: "correct-password",
  });
  const refreshed = await service.refreshAccessToken(
    login.refreshToken,
  );

  assert.notEqual(
    refreshed.refreshToken,
    login.refreshToken,
  );

  await assert.rejects(
    service.refreshAccessToken(login.refreshToken),
    { message: "Invalid or expired refresh token" },
  );

  const oldAccess = await authenticateToken(
    service,
    login.accessToken,
  );
  const newAccess = await authenticateToken(
    service,
    refreshed.accessToken,
  );

  assert.equal(oldAccess.status, 200);
  assert.equal(newAccess.status, 200);
});

test("refresh returns current permissions and inactive users cannot refresh", async () => {
  const { service, user } = await makeAuthFixture();
  const login = await service.login({
    email: user.email,
    password: "correct-password",
  });

  user.userRoles = [];
  const refreshed = await service.refreshAccessToken(
    login.refreshToken,
  );
  assert.deepEqual(refreshed.user.permissions, []);

  user.status = "INACTIVE";
  await assert.rejects(
    service.refreshAccessToken(refreshed.refreshToken),
    { message: "User not found or inactive" },
  );
});
