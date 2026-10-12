import assert from "node:assert/strict";
import { test } from "node:test";
import type { Request } from "express";
import {
  changedFields,
  getAuditActor,
  sanitizeAuditDetails,
  writeAudit,
  writeAuditBestEffort,
} from "../src/lib/audit.js";
import {
  DEFAULT_SETTINGS,
  getSettings,
} from "../src/modules/settings/settings.service.js";
import { prisma } from "../src/lib/prisma.js";

type Row = Record<string, unknown>;

function fakeDb(fail = false) {
  const rows: Row[] = [];
  const db = {
    auditLog: {
      create: async ({ data }: { data: Row }) => {
        if (fail) throw new Error("db down");
        rows.push(data);
        return data;
      },
    },
  };
  return { db: db as never, rows };
}

function fakeReq(over: Partial<{ ip: string; ua: string; user: { id: string } }>) {
  return {
    ip: over.ip,
    user: over.user,
    get: (name: string) => (name === "user-agent" ? over.ua : undefined),
    headers: { authorization: "Bearer should-never-be-read", cookie: "wm_refresh_token=nope" },
  } as unknown as Request;
}

test("actor: user id, IP and user agent are captured; nothing else is read", () => {
  const actor = getAuditActor(
    fakeReq({ ip: "203.0.113.9", ua: "Mozilla/5.0 Test", user: { id: "u-1" } }),
  );
  assert.deepEqual(actor, { userId: "u-1", ipAddress: "203.0.113.9", userAgent: "Mozilla/5.0 Test" });
  assert.equal(JSON.stringify(actor).includes("should-never-be-read"), false);
  assert.equal(JSON.stringify(actor).includes("wm_refresh_token"), false);
});

test("actor: missing values are omitted and long user agents are truncated", () => {
  assert.deepEqual(getAuditActor(fakeReq({})), {});
  const long = getAuditActor(fakeReq({ ua: "x".repeat(2000) }));
  assert.equal(long.userAgent?.length, 500);
});

test("details: sensitive keys are dropped at every depth, long text is cut", () => {
  const safe = sanitizeAuditDetails({
    changedFields: ["name"],
    password: "p",
    newPassword: "p",
    accessToken: "t",
    refreshToken: "t",
    passwordHash: "h",
    secret: "s",
    cookie: "c",
    authorization: "Bearer x",
    nested: { token: "t", ok: 1 },
    note: "n".repeat(500),
    missing: undefined,
  });
  assert.deepEqual(Object.keys(safe).sort(), ["changedFields", "nested", "note"]);
  assert.deepEqual(safe.nested, { ok: 1 });
  assert.equal((safe.note as string).length, 201);
});

test("changedFields lists only fields that are set, never sensitive ones", () => {
  assert.deepEqual(
    changedFields({ name: "a", phone: undefined, password: "x", resumeUrl: "https://e.com" }),
    ["name", "resumeUrl"],
  );
});

test("writeAudit stores actor, IP, user agent and sanitised JSON details", async () => {
  const { db, rows } = fakeDb();
  await writeAudit(
    db,
    { userId: "u-1", ipAddress: "203.0.113.9", userAgent: "UA" },
    {
      action: "DRIVE_UPDATED",
      entity: "Drive",
      entityId: "d-1",
      details: { changedFields: ["title"], token: "leak" },
    },
  );
  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0], {
    userId: "u-1",
    action: "DRIVE_UPDATED",
    entity: "Drive",
    entityId: "d-1",
    details: '{"changedFields":["title"]}',
    ipAddress: "203.0.113.9",
    userAgent: "UA",
  });
});

test("writeAudit without actor or details writes nulls (anonymous failed login)", async () => {
  const { db, rows } = fakeDb();
  await writeAudit(db, {}, { action: "LOGIN_FAILED", entity: "Auth", details: { reason: "INVALID_CREDENTIALS" } });
  assert.equal(rows[0]?.userId, null);
  assert.equal(rows[0]?.ipAddress, null);
  assert.equal(rows[0]?.details, '{"reason":"INVALID_CREDENTIALS"}');
});

test("writeAudit propagates failure, so a transaction around it rolls back", async () => {
  const { db } = fakeDb(true);
  await assert.rejects(
    writeAudit(db, {}, { action: "X", entity: "Y" }),
    /db down/,
  );
});

test("best-effort audit swallows a failure instead of blocking login/logout", async () => {
  process.env.NODE_ENV = "production"; // plain JSON logger, no pretty-print worker
  process.env.LOG_LEVEL = "silent";
  const { db } = fakeDb(true);
  await assert.doesNotReject(
    writeAuditBestEffort(db, {}, { action: "LOGIN_SUCCEEDED", entity: "User" }),
  );
});

test("GET /settings with no record returns the documented default and does not write", async () => {
  const calls: string[] = [];
  const original = prisma.setting;
  Object.defineProperty(prisma, "setting", {
    configurable: true,
    value: {
      findFirst: async () => {
        calls.push("findFirst");
        return null;
      },
      create: async () => {
        calls.push("create");
        throw new Error("GET must not create");
      },
      upsert: async () => {
        calls.push("upsert");
        throw new Error("GET must not upsert");
      },
      update: async () => {
        calls.push("update");
        throw new Error("GET must not update");
      },
    },
  });

  try {
    const result = await getSettings();
    assert.deepEqual(result, DEFAULT_SETTINGS);
    assert.equal(result.timezone, "Asia/Kolkata");
    assert.equal(result.id, null);
    assert.deepEqual(calls, ["findFirst"]);
  } finally {
    Object.defineProperty(prisma, "setting", { configurable: true, value: original });
  }
});

test("CORS exposes Content-Disposition so the browser can read CSV file names", async () => {
  const { createCorsOptions } = await import("../src/lib/cors.js");
  const { default: express } = await import("express");
  const { default: cors } = await import("cors");

  const app = express();
  app.use(cors(createCorsOptions({ NODE_ENV: "development" } as NodeJS.ProcessEnv)));
  app.get("/file", (_req, res) => {
    res.setHeader("Content-Disposition", 'attachment; filename="x.csv"');
    res.send("ok");
  });

  const server = await new Promise<import("node:http").Server>((resolve) => {
    const s = app.listen(0, "127.0.0.1", () => resolve(s));
  });

  try {
    const { port } = server.address() as import("node:net").AddressInfo;
    const response = await fetch(`http://127.0.0.1:${port}/file`, {
      headers: { Origin: "http://localhost:5175" },
    });
    assert.match(
      response.headers.get("access-control-expose-headers") ?? "",
      /Content-Disposition/i,
    );
  } finally {
    server.closeAllConnections();
    server.close();
  }
});
