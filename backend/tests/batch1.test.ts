import assert from "node:assert/strict";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { test } from "node:test";
import express from "express";
import cors from "cors";
import {
  createCorsOptions,
  isOriginAllowed,
  parseAllowedOrigins,
} from "../src/lib/cors.js";
import { parseTrustProxy } from "../src/lib/trust-proxy.js";
import { createLoginRateLimiter } from "../src/middleware/auth-rate-limit.middleware.js";
import {
  resolveDemoUsers,
  shouldSeedDemoUsers,
  type DemoUserTemplate,
} from "../prisma/seed-config.js";

async function listen(app: express.Express) {
  const server = await new Promise<Server>((resolve) => {
    const started = app.listen(0, "127.0.0.1", () => resolve(started));
  });
  const { port } = server.address() as AddressInfo;

  return {
    port,
    close() {
      server.closeAllConnections();
      server.close();
    },
  };
}

test("WEB_ORIGIN accepts a comma-separated list and trims it", () => {
  assert.deepEqual(
    parseAllowedOrigins(
      " http://localhost:5173/ , https://app.example.com ,, ",
    ),
    ["http://localhost:5173", "https://app.example.com"],
  );
  assert.deepEqual(parseAllowedOrigins(undefined), []);
});

test("development allows listed origins and any local port", () => {
  const options = {
    allowedOrigins: ["http://localhost:5173"],
    isProduction: false,
  };

  assert.equal(isOriginAllowed("http://localhost:5173", options), true);
  assert.equal(isOriginAllowed("http://localhost:5177", options), true);
  assert.equal(isOriginAllowed("http://127.0.0.1:5180", options), true);
  assert.equal(isOriginAllowed("https://evil.example.com", options), false);
  assert.equal(
    isOriginAllowed("http://localhost.evil.com", options),
    false,
  );
});

test("production allows only the listed origins", () => {
  const options = {
    allowedOrigins: ["https://app.example.com"],
    isProduction: true,
  };

  assert.equal(isOriginAllowed("https://app.example.com", options), true);
  assert.equal(isOriginAllowed("http://localhost:5177", options), false);
  assert.equal(
    isOriginAllowed("https://app.example.com.evil.io", options),
    false,
  );
});

test("production with WEB_ORIGIN unset allows no cross-origin request", async () => {
  const app = express();
  app.use(
    cors(createCorsOptions({ NODE_ENV: "production" } as NodeJS.ProcessEnv)),
  );
  app.get("/ping", (_req, res) => res.json({ ok: true }));

  const server = await listen(app);
  const { port } = server;

  try {
    const response = await fetch(`http://127.0.0.1:${port}/ping`, {
      headers: { Origin: "http://localhost:5177" },
    });

    assert.equal(
      response.headers.get("access-control-allow-origin"),
      null,
    );
  } finally {
    server.close();
  }
});

test("a real preflight from port 5177 is allowed with credentials in development", async () => {
  const app = express();
  app.use(
    cors(
      createCorsOptions({
        WEB_ORIGIN: "http://localhost:5173",
      } as NodeJS.ProcessEnv),
    ),
  );
  app.post("/login", (_req, res) => res.json({ ok: true }));

  const server = await listen(app);
  const { port } = server;

  try {
    const response = await fetch(`http://127.0.0.1:${port}/login`, {
      method: "OPTIONS",
      headers: {
        Origin: "http://localhost:5177",
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "content-type,authorization",
      },
    });

    assert.equal(
      response.headers.get("access-control-allow-origin"),
      "http://localhost:5177",
    );
    assert.equal(
      response.headers.get("access-control-allow-credentials"),
      "true",
    );
  } finally {
    server.close();
  }
});

test("TRUST_PROXY: off by default, hop counts allowed, blanket true rejected", () => {
  assert.equal(parseTrustProxy(undefined), undefined);
  assert.equal(parseTrustProxy(""), undefined);
  assert.equal(parseTrustProxy("false"), undefined);
  assert.equal(parseTrustProxy("0"), undefined);
  assert.equal(parseTrustProxy("1"), 1);
  assert.equal(parseTrustProxy("loopback"), "loopback");
  assert.throws(() => parseTrustProxy("true"), /not allowed/);
  assert.throws(() => parseTrustProxy("50"), /between 1 and 10/);
});

async function startLoginApp(limit: number) {
  const app = express();

  app.post(
    "/login",
    createLoginRateLimiter({ limit }),
    (req, res) => {
      res.status(req.query.ok === "1" ? 200 : 401).json({ done: true });
    },
  );

  const server = await listen(app);
  const { port } = server;
  const post = (ok: boolean) =>
    fetch(`http://127.0.0.1:${port}/login?ok=${ok ? 1 : 0}`, {
      method: "POST",
    });

  return { server, post };
}

test("successful logins do not consume the failed-attempt allowance", async () => {
  const { server, post } = await startLoginApp(3);

  try {
    for (let attempt = 0; attempt < 8; attempt += 1) {
      assert.equal((await post(true)).status, 200);
    }

assert.equal((await post(false)).status, 401);
    assert.equal((await post(false)).status, 401);
  } finally {
    server.close();
  }
});

test("repeated failed logins are blocked with 429 and the documented error code", async () => {
  const { server, post } = await startLoginApp(3);

  try {
    assert.equal((await post(false)).status, 401);
    assert.equal((await post(false)).status, 401);
    assert.equal((await post(false)).status, 401);

    const blocked = await post(false);
    const body = (await blocked.json()) as {
      success: boolean;
      error: { code: string };
    };

    assert.equal(blocked.status, 429);
    assert.equal(body.success, false);
    assert.equal(body.error.code, "LOGIN_RATE_LIMITED");
  } finally {
    server.close();
  }
});

const templates: DemoUserTemplate[] = [
  {
    email: "admin@example.test",
    name: "Admin",
    role: "SUPER_ADMIN",
  },
  {
    email: "hr@example.test",
    name: "HR",
    role: "HR_ADMIN",
  },
];

test("seed: demo passwords must be explicitly configured", () => {
  assert.throws(
    () => resolveDemoUsers(templates, {} as NodeJS.ProcessEnv),
    /SEED_SUPER_ADMIN_PASSWORD must be set/,
  );

  const overridden = resolveDemoUsers(templates, {
    SEED_SUPER_ADMIN_EMAIL: "Boss@Example.Test",
    SEED_SUPER_ADMIN_PASSWORD: "from-the-environment",
    SEED_HR_ADMIN_PASSWORD: "another-configured-password",
  } as NodeJS.ProcessEnv);

  assert.equal(overridden[0]?.email, "boss@example.test");
  assert.equal(overridden[0]?.password, "from-the-environment");
  assert.equal(overridden[1]?.password, "another-configured-password");
});

test("seed: weak or invalid configured values are rejected", () => {
  assert.throws(
    () =>
      resolveDemoUsers(templates, {
        SEED_SUPER_ADMIN_PASSWORD: "short",
      } as NodeJS.ProcessEnv),
    /at least 8 characters/,
  );
  assert.throws(
    () =>
      resolveDemoUsers(templates, {
        SEED_SUPER_ADMIN_PASSWORD: "configured-password",
        SEED_HR_ADMIN_EMAIL: "not-an-email",
      } as NodeJS.ProcessEnv),
    /valid email/,
  );
});

test("seed: demo users are opt-in in production and opt-out in development", () => {
  assert.equal(shouldSeedDemoUsers({} as NodeJS.ProcessEnv), true);
  assert.equal(
    shouldSeedDemoUsers({ SEED_DEMO_USERS: "false" } as NodeJS.ProcessEnv),
    false,
  );
  assert.equal(
    shouldSeedDemoUsers({ NODE_ENV: "production" } as NodeJS.ProcessEnv),
    false,
  );
  assert.equal(
    shouldSeedDemoUsers({
      NODE_ENV: "production",
      SEED_DEMO_USERS: "true",
    } as NodeJS.ProcessEnv),
    false,
  );
});
