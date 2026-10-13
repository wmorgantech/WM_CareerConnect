import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import bcrypt from "bcrypt";
import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import {
  checkInterviewTransition,
  type InterviewStatusValue,
} from "../src/domain/interview-status.js";
import {
  DateRangeError,
  END_BEFORE_START_MESSAGE,
} from "../src/domain/date-range.js";
import {
  isStaffRole,
  nonAssignableRoles,
  STAFF_ROLE_NAMES,
} from "../src/domain/staff-roles.js";
import { createCorsOptions } from "../src/lib/cors.js";
import {
  istDateRangeFilter,
  istDayEnd,
  istDayStart,
} from "../src/lib/ist.js";
import {
  buildClearRefreshCookieOptions,
  buildRefreshCookieOptions,
  CLIENT_REFRESH_COOKIES,
  LEGACY_REFRESH_COOKIE,
  refreshCookieName,
  refreshCookieNameForClient,
} from "../src/lib/refresh-cookie.js";
import {
  createAuthService,
  type AuthStore,
  type AuthUserRecord,
  type StoredRefreshToken,
} from "../src/modules/auth/auth.service.js";
import { getAuditLogs } from "../src/modules/audit-logs/audit-logs.service.js";
import {
  createDriveSchema,
  updateDriveSchema,
} from "../src/modules/drives/drives.schema.js";
import {
  createDriveController,
  updateDriveController,
} from "../src/modules/drives/drives.controller.js";
import {
  createDrive,
  updateDrive,
} from "../src/modules/drives/drives.service.js";
import {
  deleteInterviewController,
  updateInterviewController,
} from "../src/modules/interviews/interviews.controller.js";
import {
  deleteInterview,
  updateInterview,
} from "../src/modules/interviews/interviews.service.js";
import {
  getCandidateReport,
  getInterviewReport,
  getResultReport,
} from "../src/modules/reports/reports.service.js";
import { listRoles } from "../src/modules/roles/roles.service.js";
import {
  createUserController,
  deleteUserController,
} from "../src/modules/users/users.controller.js";
import {
  createUser,
  deleteUser,
  isForeignKeyViolation,
  updateUser,
} from "../src/modules/users/users.service.js";
import { UserSafetyError } from "../src/modules/users/user-safety.js";
import {
  send,
  withFakePrisma,
  withServer,
} from "./helpers/fakes.js";

const here = path.dirname(fileURLToPath(import.meta.url));

test("F-02: each client gets its own refresh cookie name; unknown or missing falls back to the original name", () => {
  assert.equal(refreshCookieNameForClient("admin"), "wm_admin_refresh");
  assert.equal(refreshCookieNameForClient("staff"), "wm_staff_refresh");
  assert.equal(refreshCookieNameForClient(" Admin "), "wm_admin_refresh");
  assert.equal(refreshCookieNameForClient(["staff", "admin"]), "wm_staff_refresh");

  for (const other of [undefined, "", "candidate", "ADMIN2", "__proto__", "constructor", "toString"]) {
    assert.equal(refreshCookieNameForClient(other), LEGACY_REFRESH_COOKIE, String(other));
  }

  const names = [...Object.values(CLIENT_REFRESH_COOKIES), LEGACY_REFRESH_COOKIE];

  assert.equal(new Set(names).size, names.length, "cookie names must all differ");
});

test("F-02: cookie flags are unchanged and secure (HttpOnly, SameSite=Lax, Secure in production, auth path, 7 days) and clearing matches setting", () => {
  const prod = buildRefreshCookieOptions({ NODE_ENV: "production" } as NodeJS.ProcessEnv);
  const dev = buildRefreshCookieOptions({ NODE_ENV: "development" } as NodeJS.ProcessEnv);

  assert.deepEqual(prod, { httpOnly: true, secure: true, sameSite: "lax", maxAge: 7 * 24 * 60 * 60 * 1000, path: "/api/v1/auth" });
  assert.equal(dev.secure, false);
  assert.equal(dev.httpOnly, true);

  const clear = buildClearRefreshCookieOptions({ NODE_ENV: "production" } as NodeJS.ProcessEnv);

  for (const key of ["httpOnly", "secure", "sameSite", "path"] as const) {
    assert.equal(clear[key], prod[key], `clearing must use the same ${key} as setting`);
  }
});

function makeJar() {
  const jar = new Map<string, string>();

  return {
    jar,
    absorb(response: Response) {
      for (const line of response.headers.getSetCookie()) {
        const [pair = "", ...attrs] = line.split(";").map((part) => part.trim());
        const eq = pair.indexOf("=");
        const name = pair.slice(0, eq);
        const value = pair.slice(eq + 1);
        const expired = attrs.some((a) => /^expires=/i.test(a) && new Date(a.slice(8)).getTime() <= Date.now()) || attrs.some((a) => /^max-age=0$/i.test(a));

        if (value === "" || expired) jar.delete(name);
        else jar.set(name, value);
      }
    },
    header() {
      return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
    },
  };
}

test("F-02: two apps on the same host keep independent sessions through login, refresh and logout", async () => {
  const app = express();

  app.use(cookieParser());
  app.post("/login", (req, res) => {
    res.cookie(refreshCookieName(req), `session-of-${req.header("x-test-user")}`, buildRefreshCookieOptions());
    res.json({ ok: true });
  });
  app.post("/refresh", (req, res) => {
    const token = req.cookies?.[refreshCookieName(req)];
    token ? res.json({ token }) : res.status(401).json({ ok: false });
  });
  app.post("/logout", (req, res) => {
    res.clearCookie(refreshCookieName(req), buildClearRefreshCookieOptions());
    res.json({ ok: true });
  });

  const server = await new Promise<import("node:http").Server>((resolve) => {
    const s = app.listen(0, "127.0.0.1", () => resolve(s));
  });

  try {
    const base = `http://127.0.0.1:${(server.address() as import("node:net").AddressInfo).port}`;
    const browser = makeJar();
    const call = async (p: string, client: string | null, user = "") => {
      const res = await fetch(base + p, {
        method: "POST",
        headers: { ...(client ? { "X-WM-Client": client } : {}), "x-test-user": user, Cookie: browser.header() },
      });

      browser.absorb(res);

      return { status: res.status, body: (await res.json()) as { token?: string } };
    };

    await call("/login", "admin", "alice");
    await call("/login", "staff", "bob");
    await call("/login", null, "legacy");

    assert.deepEqual([...browser.jar.keys()].sort(), ["wm_admin_refresh", "wm_refresh_token", "wm_staff_refresh"]);

assert.equal((await call("/refresh", "admin")).body.token, "session-of-alice");
    assert.equal((await call("/refresh", "staff")).body.token, "session-of-bob");
    assert.equal((await call("/refresh", null)).body.token, "session-of-legacy");

await call("/logout", "admin");
    assert.equal((await call("/refresh", "admin")).status, 401);
    assert.equal((await call("/refresh", "staff")).body.token, "session-of-bob");
    assert.equal((await call("/refresh", null)).body.token, "session-of-legacy");

await call("/login", "staff", "bob-rotated");
    assert.equal((await call("/refresh", "staff")).body.token, "session-of-bob-rotated");
    assert.equal((await call("/refresh", null)).body.token, "session-of-legacy");
  } finally {
    server.closeAllConnections();
    server.close();
  }
});

test("F-02: CORS preflight accepts the X-WM-Client header with credentials", async () => {
  const app = express();

  app.use(cors(createCorsOptions({ NODE_ENV: "development", WEB_ORIGIN: "http://localhost:5180" } as NodeJS.ProcessEnv)));
  app.post("/x", (_req, res) => res.json({ ok: true }));

  const server = await new Promise<import("node:http").Server>((resolve) => {
    const s = app.listen(0, "127.0.0.1", () => resolve(s));
  });

  try {
    const port = (server.address() as import("node:net").AddressInfo).port;
    const response = await fetch(`http://127.0.0.1:${port}/x`, {
      method: "OPTIONS",
      headers: { Origin: "http://localhost:5180", "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "content-type,authorization,x-wm-client" },
    });

    assert.equal(response.status, 204);
    assert.match(response.headers.get("access-control-allow-headers") ?? "", /x-wm-client/i);
    assert.equal(response.headers.get("access-control-allow-credentials"), "true");
  } finally {
    server.closeAllConnections();
    server.close();
  }
});

test("F-02 (source guard): the auth controller no longer hard-codes the cookie name, and the admin app sends its client header (the student portal sends none)", () => {
  const controller = fs.readFileSync(path.join(here, "../src/modules/auth/auth.controller.ts"), "utf8");

  assert.equal(controller.includes("wm_refresh_token"), false);
  assert.equal((controller.match(/refreshCookieName\(req\)/g) ?? []).length, 5, "login set, refresh read, refresh set, logout read, logout clear");

  const admin = fs.readFileSync(path.join(here, "../../admin/src/api/client.js"), "utf8");
  const student = fs.readFileSync(path.join(here, "../../frontend/src/student/api.js"), "utf8");

assert.match(admin, /"X-WM-Client":\s*clientName\(\)/);
  assert.match(admin, /return "admin";/);
  assert.match(admin, /return "hod";/);
  assert.match(admin, /return "staff-portal";/);
  // The student portal signs in through /candidate/auth with its own cookie; it never uses a staff client name.
  assert.equal(/X-WM-Client/i.test(student), false);
  assert.match(student, /\/candidate\/auth\//);
});

function makeSessions() {
  const rows = new Map<string, StoredRefreshToken>();
  const users = new Map<string, AuthUserRecord>();

  const store: AuthStore = {
    async findUserByEmail(email) { return [...users.values()].find((u) => u.email === email) ?? null; },
    async findUserById(id) { return users.get(id) ?? null; },
    async createRefreshToken(input) { const row = { id: randomUUID(), ...input, revokedAt: null }; rows.set(row.tokenHash, row); return { id: row.id }; },
    async findRefreshToken(hash) { return rows.get(hash) ?? null; },
    async findAccessSession(id) { const row = [...rows.values()].find((r) => r.id === id); const user = row ? users.get(row.userId) : null; return row && user ? { ...row, user } : null; },
    async rotateRefreshToken(input) { const cur = rows.get(input.currentTokenHash); if (!cur || cur.revokedAt || cur.expiresAt <= input.now) return false; rows.delete(input.currentTokenHash); cur.tokenHash = input.next.tokenHash; cur.expiresAt = input.next.expiresAt; rows.set(cur.tokenHash, cur); return true; },
    async revokeRefreshToken(hash, at) { const r = rows.get(hash); if (r && !r.revokedAt) r.revokedAt = at; },
    async revokeSession(id, at) { const r = [...rows.values()].find((x) => x.id === id); if (r && !r.revokedAt) r.revokedAt = at; },
  };

  return { rows, users, store };
}

function userRecord(email: string, hash: string): AuthUserRecord {
  return { id: randomUUID(), email, name: email, passwordHash: hash, status: "ACTIVE", userRoles: [{ role: { name: "HR_ADMIN", permissions: [{ permission: { name: "reports.view" } }] } }] };
}

const userRow = (id: string) => ({ id, email: "u@x.test", name: "U", status: "ACTIVE", createdAt: new Date(), updatedAt: new Date(), userRoles: [] });

function updateUserFakes(sessions: ReturnType<typeof makeSessions>, opts: { revokeThrows?: boolean } = {}) {
  const log = { audit: [] as any[], committed: [] as string[], revokeCalls: [] as any[] };

  const fakes = {
    user: { findUnique: async ({ where }: any) => ({ id: where.id, email: "u@x.test" }), findFirst: async () => null },
    role: { findMany: async () => [] },
    auditLog: { create: async ({ data }: any) => { log.audit.push(data); return data; } },
    $transaction: async (cb: (tx: any) => Promise<unknown>) => {
      const pending: string[] = [];
      const undo: Array<() => void> = [];
      const tx = {
        $queryRaw: async () => [],
        userRole: { deleteMany: async () => ({ count: 0 }) },
        user: { update: async ({ where }: any) => { pending.push("user.update"); return userRow(where.id); } },
        refreshToken: {
          updateMany: async (args: any) => {
            log.revokeCalls.push(args);
            if (opts.revokeThrows) throw new Error("database error during revoke");
            let count = 0;
            for (const row of sessions.rows.values()) {
              if (row.userId === args.where.userId && row.revokedAt === null) {
                const before = row.revokedAt;
                row.revokedAt = args.data.revokedAt;
                undo.push(() => { row.revokedAt = before; });
                count += 1;
              }
            }
            pending.push("refreshToken.updateMany");
            return { count };
          },
        },
      };

      try {
        const result = await cb(tx);
        log.committed.push(...pending);
        return result;
      } catch (error) {
        undo.reverse().forEach((fn) => fn());
        throw error;
      }
    },
  };

  return { fakes, log };
}

test("F-01: resetting a password revokes the user's refresh sessions and their access tokens; other users are unaffected", async () => {
  const sessions = makeSessions();
  const service = createAuthService(sessions.store);
  const target = userRecord("target@x.test", await bcrypt.hash("old-password-1", 4));
  const bystander = userRecord("other@x.test", await bcrypt.hash("other-password-1", 4));

  sessions.users.set(target.id, target);
  sessions.users.set(bystander.id, bystander);

  const phone = await service.login({ email: target.email, password: "old-password-1" });
  const laptop = await service.login({ email: target.email, password: "old-password-1" });
  const other = await service.login({ email: bystander.email, password: "other-password-1" });
  const sid = (jwtSid(phone.accessToken));

  assert.ok(await service.resolveAccessSession(sid, target.id), "session is valid before the reset");

  const { fakes, log } = updateUserFakes(sessions);

  await withFakePrisma(fakes, async () => {
    await updateUser(target.id, { password: "New-Password-123" }, "admin-1");
  });

await assert.rejects(service.refreshAccessToken(phone.refreshToken), /Invalid or expired refresh token/);
  await assert.rejects(service.refreshAccessToken(laptop.refreshToken), /Invalid or expired refresh token/);

  assert.equal(await service.resolveAccessSession(sid, target.id), null);
  assert.equal(await service.resolveAccessSession(jwtSid(laptop.accessToken), target.id), null);

  assert.ok(await service.refreshAccessToken(other.refreshToken));

  assert.deepEqual(log.revokeCalls[0].where, { userId: target.id, revokedAt: null });
  assert.ok(log.revokeCalls[0].data.revokedAt instanceof Date);
  assert.equal(log.audit[0].action, "USER_UPDATED");
  assert.equal(JSON.parse(log.audit[0].details).sessionsRevoked, 2);
});

function jwtSid(token: string): string {
  return JSON.parse(Buffer.from(token.split(".")[1] as string, "base64url").toString()).sid;
}

test("F-01: after a reset the user can sign in again with the new password and gets a fresh working session", async () => {
  const sessions = makeSessions();
  const service = createAuthService(sessions.store);
  const target = userRecord("target@x.test", await bcrypt.hash("old-password-1", 4));

  sessions.users.set(target.id, target);
  await service.login({ email: target.email, password: "old-password-1" });

  const { fakes } = updateUserFakes(sessions);

  await withFakePrisma(fakes, async () => {
    await updateUser(target.id, { password: "New-Password-123" }, "admin-1");
  });

  target.passwordHash = await bcrypt.hash("New-Password-123", 4);
  const fresh = await service.login({ email: target.email, password: "New-Password-123" });

  assert.ok(await service.refreshAccessToken(fresh.refreshToken));
});

test("F-01: updates that do not change the password leave sessions alone", async () => {
  const sessions = makeSessions();
  const service = createAuthService(sessions.store);
  const target = userRecord("target@x.test", await bcrypt.hash("old-password-1", 4));

  sessions.users.set(target.id, target);
  const login = await service.login({ email: target.email, password: "old-password-1" });
  const { fakes, log } = updateUserFakes(sessions);

  await withFakePrisma(fakes, async () => {
    await updateUser(target.id, { name: "Renamed" }, "admin-1");
  });

  assert.equal(log.revokeCalls.length, 0);
  assert.ok(await service.refreshAccessToken(login.refreshToken));
  assert.equal(JSON.parse(log.audit[0].details).sessionsRevoked, undefined);
});

test("F-01: the password change and the revocation succeed or fail together", async () => {
  const sessions = makeSessions();
  const service = createAuthService(sessions.store);
  const target = userRecord("target@x.test", await bcrypt.hash("old-password-1", 4));

  sessions.users.set(target.id, target);
  const login = await service.login({ email: target.email, password: "old-password-1" });
  const { fakes, log } = updateUserFakes(sessions, { revokeThrows: true });

  await withFakePrisma(fakes, async () => {
    await assert.rejects(updateUser(target.id, { password: "New-Password-123" }, "admin-1"), /database error during revoke/);
  });

  assert.deepEqual(log.committed, [], "nothing from the failed transaction was committed (password update included)");
  assert.equal(log.audit.length, 0, "no success audit entry for a failed reset");
  assert.ok(await service.refreshAccessToken(login.refreshToken), "the old session is untouched when the whole change rolled back");
});

const STATUSES: InterviewStatusValue[] = ["SCHEDULED", "COMPLETED", "CANCELLED"];

test("F-03: transition matrix without feedback", () => {
  const allowed = (from: InterviewStatusValue, to: InterviewStatusValue) => checkInterviewTransition(from, to, { feedbackSubmitted: false }).allowed;

  assert.ok(allowed("SCHEDULED", "COMPLETED"));
  assert.ok(allowed("SCHEDULED", "CANCELLED"));
  assert.ok(allowed("COMPLETED", "SCHEDULED"), "undo a mistaken 'completed' (no feedback yet)");
  assert.ok(allowed("COMPLETED", "CANCELLED"));
  for (const s of STATUSES) assert.ok(allowed(s, s), `${s} -> ${s} is not a change`);
  assert.equal(allowed("CANCELLED", "SCHEDULED"), false);
  assert.equal(allowed("CANCELLED", "COMPLETED"), false);
});

test("F-03: once feedback is submitted the status is final, locked or unlocked for correction", () => {
  for (const to of STATUSES) {
    const verdict = checkInterviewTransition("COMPLETED", to, { feedbackSubmitted: true });

    assert.equal(verdict.allowed, to === "COMPLETED");
  }

  const v = checkInterviewTransition("COMPLETED", "SCHEDULED", { feedbackSubmitted: true });

  assert.equal(v.allowed, false);
  assert.match(!v.allowed ? v.reason : "", /Feedback has already been submitted/);
});

test("F-03: a cancelled interview is final even with no feedback, with a clear reason", () => {
  const v = checkInterviewTransition("CANCELLED", "SCHEDULED", { feedbackSubmitted: false });

  assert.equal(v.allowed, false);
  assert.match(!v.allowed ? v.reason : "", /cannot be reopened/);
});

const IID = "11111111-1111-4111-8111-111111111111";

function interviewRow(over: Record<string, unknown> = {}) {
  return {
    id: IID, candidateId: "c1", interviewerId: "i1", scheduledAt: new Date("2026-11-01T05:00:00Z"), durationMinutes: 60,
    meetingLink: null, notes: null, status: "SCHEDULED", feedback: null, score: null, feedbackSubmittedAt: null, feedbackLockedAt: null,
    createdAt: new Date("2026-10-01"), updatedAt: new Date("2026-10-01"), candidate: { id: "c1", name: "Asha", email: "a@x.test" }, ...over,
  };
}

function interviewFakes(row: ReturnType<typeof interviewRow>, opts: { updateManyCount?: number } = {}) {
  const calls = { update: [] as any[], updateMany: [] as any[], audit: [] as any[] };
  let lastData: Record<string, unknown> = {};
  const tx = {
    interview: {
      update: async (args: any) => { calls.update.push(args); return { ...row, ...args.data }; },
      updateMany: async (args: any) => { calls.updateMany.push(args); lastData = args.data; return { count: opts.updateManyCount ?? 1 }; },
      findUniqueOrThrow: async () => ({ ...row, ...lastData }),
    },
    auditLog: { create: async ({ data }: any) => { calls.audit.push(data); return data; } },
  };

  return {
    calls,
    fakes: {
      interview: { findUnique: async () => row },
      user: { findFirst: async () => ({ id: "i2" }) },
      $transaction: async (cb: (t: any) => Promise<unknown>) => cb(tx),
    },
  };
}

test("F-03: updateInterview rejects reopening a cancelled interview and writes nothing", async () => {
  const { fakes, calls } = interviewFakes(interviewRow({ status: "CANCELLED" }));

  await withFakePrisma(fakes, async () => {
    const result = await updateInterview(IID, { status: "SCHEDULED" });

assert.equal(result.type, "INTERVIEW_CANCELLED");
  });

  assert.equal(calls.update.length + calls.updateMany.length + calls.audit.length, 0);
});

for (const [label, extra] of [
  ["locked", { feedback: "Good", score: 80, feedbackSubmittedAt: new Date("2026-10-20"), feedbackLockedAt: new Date("2026-10-20") }],
  ["unlocked for correction", { feedback: "Good", score: 80, feedbackSubmittedAt: new Date("2026-10-20"), feedbackLockedAt: null }],
] as const) {
  test(`F-03: updateInterview rejects reverting a completed interview whose feedback is ${label}`, async () => {
    const { fakes, calls } = interviewFakes(interviewRow({ status: "COMPLETED", ...extra }));

    await withFakePrisma(fakes, async () => {
      for (const to of ["SCHEDULED", "CANCELLED"] as const) {
        const result = await updateInterview(IID, { status: to });

        assert.equal(result.type, "INVALID_STATUS_TRANSITION", to);
      }
    });

    assert.equal(calls.update.length + calls.updateMany.length + calls.audit.length, 0);
  });
}

test("F-03: valid transitions still work: complete, undo a mistaken completion, edit other fields of a finished interview", async () => {

  let ctx = interviewFakes(interviewRow());

  await withFakePrisma(ctx.fakes, async () => {
    const result = await updateInterview(IID, { status: "COMPLETED" }, { userId: "u1" });

    assert.equal(result.type, "SUCCESS");
    assert.equal((result as any).data.status, "COMPLETED");
  });
  assert.equal(ctx.calls.updateMany.length, 1);

  assert.deepEqual(ctx.calls.updateMany[0].where, { id: IID, status: "SCHEDULED", feedbackSubmittedAt: null, interviewerId: "i1" });
  assert.equal(ctx.calls.audit[0].action, "INTERVIEW_UPDATED");

ctx = interviewFakes(interviewRow({ status: "COMPLETED" }));
  await withFakePrisma(ctx.fakes, async () => {
    assert.equal((await updateInterview(IID, { status: "SCHEDULED" })).type, "SUCCESS");
  });

ctx = interviewFakes(interviewRow({ status: "COMPLETED", feedback: "x", score: 70, feedbackSubmittedAt: new Date(), feedbackLockedAt: new Date() }));
  await withFakePrisma(ctx.fakes, async () => {
    assert.equal((await updateInterview(IID, { notes: "Rescheduled by phone", status: "COMPLETED" })).type, "SUCCESS");
  });
  assert.equal(ctx.calls.updateMany.length, 1);
  assert.equal(ctx.calls.update.length, 0);
});

test("F-03: cancelling through update records INTERVIEW_CANCELLED once", async () => {
  const ctx = interviewFakes(interviewRow());

  await withFakePrisma(ctx.fakes, async () => {
    assert.equal((await updateInterview(IID, { status: "CANCELLED" })).type, "SUCCESS");
  });
  assert.deepEqual(ctx.calls.audit.map((a) => a.action), ["INTERVIEW_CANCELLED"]);
});

test("F-03: a concurrent change makes the guarded update match nothing: conflict, no audit entry", async () => {
  const ctx = interviewFakes(interviewRow(), { updateManyCount: 0 });

  await withFakePrisma(ctx.fakes, async () => {
    assert.equal((await updateInterview(IID, { status: "COMPLETED" })).type, "INTERVIEW_CONFLICT");
    assert.equal((await deleteInterview(IID)).type, "INTERVIEW_CONFLICT");
  });
  assert.equal(ctx.calls.audit.length, 0);
});

test("F-03: deleteInterview (cancel) enforces the same rules and is idempotent for a cancelled interview", async () => {

  await withFakePrisma({ interview: { findUnique: async () => null } }, async () => {
    assert.equal((await deleteInterview(IID)).type, "INTERVIEW_NOT_FOUND");
  });

let ctx = interviewFakes(interviewRow());

  await withFakePrisma(ctx.fakes, async () => {
    const result = await deleteInterview(IID, { userId: "u1" });

    assert.equal(result.type, "SUCCESS");
    assert.equal((result as any).data.status, "CANCELLED");
  });
  assert.deepEqual(ctx.calls.audit.map((a) => [a.action, a.details && JSON.parse(a.details).method]), [["INTERVIEW_CANCELLED", "DELETE"]]);

ctx = interviewFakes(interviewRow({ status: "CANCELLED" }));
  await withFakePrisma(ctx.fakes, async () => {
    assert.equal((await deleteInterview(IID)).type, "SUCCESS");
  });
  assert.equal(ctx.calls.updateMany.length + ctx.calls.audit.length, 0);

ctx = interviewFakes(interviewRow({ status: "COMPLETED", feedback: "x", score: 60, feedbackSubmittedAt: new Date(), feedbackLockedAt: new Date() }));
  await withFakePrisma(ctx.fakes, async () => {
    assert.equal((await deleteInterview(IID)).type, "INVALID_STATUS_TRANSITION");
  });
  assert.equal(ctx.calls.updateMany.length + ctx.calls.audit.length, 0);
});

test("F-03 (HTTP): the controllers answer 409 INVALID_STATUS_TRANSITION with the reason, and valid requests still return 200", async () => {
  const user = { id: "admin-1", permissions: ["interviews.schedule"] };
  const register = (app: express.Express) => {
    app.patch("/interviews/:id", updateInterviewController);
    app.delete("/interviews/:id", deleteInterviewController);
  };

  let ctx = interviewFakes(interviewRow({ status: "CANCELLED" }));

  await withFakePrisma(ctx.fakes, () => withServer(user, register, async (base) => {
    const patch = await send(base, "PATCH", `/interviews/${IID}`, { status: "SCHEDULED" });

    assert.equal(patch.status, 409);
    assert.equal(patch.json.error.code, "INTERVIEW_CANCELLED");

    const del = await send(base, "DELETE", `/interviews/${IID}`);

    assert.equal(del.status, 200, "cancelling an already cancelled interview stays a success");
  }));

  ctx = interviewFakes(interviewRow({ status: "COMPLETED", feedback: "x", score: 60, feedbackSubmittedAt: new Date(), feedbackLockedAt: new Date() }));
  await withFakePrisma(ctx.fakes, () => withServer(user, register, async (base) => {
    assert.equal((await send(base, "PATCH", `/interviews/${IID}`, { status: "SCHEDULED" })).json.error.code, "INVALID_STATUS_TRANSITION");
    assert.equal((await send(base, "DELETE", `/interviews/${IID}`)).status, 409);
  }));

  ctx = interviewFakes(interviewRow());
  await withFakePrisma(ctx.fakes, () => withServer(user, register, async (base) => {
    assert.equal((await send(base, "PATCH", `/interviews/${IID}`, { status: "COMPLETED" })).status, 200);
  }));

  ctx = interviewFakes(interviewRow(), { updateManyCount: 0 });
  await withFakePrisma(ctx.fakes, () => withServer(user, register, async (base) => {
    const conflict = await send(base, "PATCH", `/interviews/${IID}`, { status: "COMPLETED" });

    assert.equal(conflict.status, 409);
    assert.equal(conflict.json.error.code, "INTERVIEW_CHANGED");
  }));
});

const baseDrive = { title: "Campus Drive", collegeId: "college-1" };

test("F-05: the create schema rejects an end date before the start date, on the endDate field", () => {
  const bad = createDriveSchema.safeParse({ ...baseDrive, startDate: "2026-11-12", endDate: "2026-11-10" });

  assert.equal(bad.success, false);
  assert.deepEqual(bad.error?.flatten().fieldErrors.endDate, [END_BEFORE_START_MESSAGE]);
});

test("F-05: boundaries: equal dates are valid, one millisecond earlier is not, a missing side is valid", () => {
  assert.equal(createDriveSchema.safeParse({ ...baseDrive, startDate: "2026-11-10T00:00:00.000Z", endDate: "2026-11-10T00:00:00.000Z" }).success, true);
  assert.equal(createDriveSchema.safeParse({ ...baseDrive, startDate: "2026-11-10T00:00:00.000Z", endDate: "2026-11-09T23:59:59.999Z" }).success, false);
  assert.equal(createDriveSchema.safeParse({ ...baseDrive, startDate: "2026-11-10" }).success, true);
  assert.equal(createDriveSchema.safeParse({ ...baseDrive, endDate: "2026-11-10" }).success, true);
  assert.equal(createDriveSchema.safeParse(baseDrive).success, true);
});

test("F-05: unparseable dates are rejected on create and update", () => {
  for (const value of ["not-a-date", "2026-13-45", "", "tomorrow"]) {
    assert.equal(createDriveSchema.safeParse({ ...baseDrive, startDate: value }).success, false, `create start ${value}`);
    assert.equal(updateDriveSchema.safeParse({ endDate: value }).success, false, `update end ${value}`);
  }
});

test("F-05: the update schema applies the same rule when both dates are sent", () => {
  assert.equal(updateDriveSchema.safeParse({ startDate: "2026-11-12", endDate: "2026-11-10" }).success, false);
  assert.equal(updateDriveSchema.safeParse({ startDate: "2026-11-10", endDate: "2026-11-12" }).success, true);
  assert.equal(updateDriveSchema.safeParse({ startDate: "2026-11-12", endDate: "2026-11-12" }).success, true);
  assert.equal(updateDriveSchema.safeParse({}).success, true);
  assert.equal(updateDriveSchema.safeParse({ title: "Only a title" }).success, true);
});

const DID = "22222222-2222-4222-8222-222222222222";

function driveRow(over: Record<string, unknown> = {}) {
  return { id: DID, title: "Drive", description: null, collegeId: "college-1", status: "DRAFT", startDate: new Date("2026-11-10T00:00:00Z"), endDate: new Date("2026-11-12T00:00:00Z"), isActive: true, deletedAt: null, createdAt: new Date(), updatedAt: new Date(), college: { id: "college-1", name: "C", city: "X" }, ...over };
}

function driveFakes(existing = driveRow()) {
  const writes: any[] = [];
  const tx = {
    drive: {
      update: async ({ data }: any) => { writes.push(data); return { ...existing, ...data }; },
      create: async ({ data }: any) => { writes.push(data); return { ...existing, ...data }; },
    },
    auditLog: { create: async ({ data }: any) => data },
  };

  return {
    writes,
    fakes: {
      drive: { findFirst: async () => existing },
      college: { findFirst: async () => ({ id: "college-1" }) },
      $transaction: async (cb: (t: any) => Promise<unknown>) => cb(tx),
    },
  };
}

test("F-05: updateDrive checks the dates the drive would have, including the stored one", async () => {

  let ctx = driveFakes();

  await withFakePrisma(ctx.fakes, async () => {
    await assert.rejects(updateDrive(DID, { endDate: new Date("2026-11-09T23:59:59.999Z") }), (e: unknown) => e instanceof DateRangeError && e.field === "endDate");

    await assert.rejects(updateDrive(DID, { startDate: new Date("2026-11-13T00:00:00Z") }), (e: unknown) => e instanceof DateRangeError && e.field === "startDate" && /Start date/.test(e.message));
  });
  assert.equal(ctx.writes.length, 0, "nothing is written for an invalid range");

ctx = driveFakes();
  await withFakePrisma(ctx.fakes, async () => {
    assert.ok(await updateDrive(DID, { endDate: new Date("2026-11-10T00:00:00Z") }), "end equal to the stored start is valid");
    assert.ok(await updateDrive(DID, { startDate: new Date("2026-11-20T00:00:00Z"), endDate: new Date("2026-11-25T00:00:00Z") }), "moving both is valid");
    assert.ok(await updateDrive(DID, { title: "Renamed" }));
  });
  assert.equal(ctx.writes.length, 3);
});

test("F-05: updating a drive that has no stored start date accepts any end date; legacy inconsistent dates do not block unrelated edits", async () => {
  let ctx = driveFakes(driveRow({ startDate: null }));

  await withFakePrisma(ctx.fakes, async () => {
    assert.ok(await updateDrive(DID, { endDate: new Date("2020-01-01") }));
  });

  ctx = driveFakes(driveRow({ startDate: new Date("2026-11-12"), endDate: new Date("2026-11-10") }));
  await withFakePrisma(ctx.fakes, async () => {
    assert.ok(await updateDrive(DID, { title: "Fix the typo" }), "a title-only edit is not blocked by old bad data");
  });
});

test("F-05: createDrive also enforces the order in the service (not only in the schema)", async () => {
  const ctx = driveFakes();

  await withFakePrisma(ctx.fakes, async () => {
    await assert.rejects(createDrive({ ...baseDrive, status: "DRAFT", isActive: true, startDate: new Date("2026-11-12"), endDate: new Date("2026-11-10") } as any), DateRangeError);
    assert.ok(await createDrive({ ...baseDrive, status: "DRAFT", isActive: true, startDate: new Date("2026-11-10"), endDate: new Date("2026-11-10") } as any));
  });
  assert.equal(ctx.writes.length, 1);
});

test("F-05 (HTTP): the API answers 400 VALIDATION_ERROR with the message on the right field, for both create and update", async () => {
  const user = { id: "admin-1", permissions: ["drives.manage"] };
  const register = (app: express.Express) => {
    app.post("/drives", createDriveController);
    app.patch("/drives/:id", updateDriveController);
  };
  const ctx = driveFakes();

  await withFakePrisma(ctx.fakes, () => withServer(user, register, async (base) => {
    const create = await send(base, "POST", "/drives", { ...baseDrive, startDate: "2026-11-12", endDate: "2026-11-10" });

    assert.equal(create.status, 400);
    assert.deepEqual(create.json.error.details.fieldErrors.endDate, [END_BEFORE_START_MESSAGE]);

    const both = await send(base, "PATCH", `/drives/${DID}`, { startDate: "2026-11-12", endDate: "2026-11-10" });

    assert.equal(both.status, 400);
    assert.deepEqual(both.json.error.details.fieldErrors.endDate, [END_BEFORE_START_MESSAGE]);

const one = await send(base, "PATCH", `/drives/${DID}`, { endDate: "2026-11-01" });

    assert.equal(one.status, 400);
    assert.equal(one.json.error.code, "VALIDATION_ERROR");
    assert.deepEqual(one.json.error.details.fieldErrors.endDate, [END_BEFORE_START_MESSAGE]);

    assert.equal((await send(base, "PATCH", `/drives/${DID}`, { endDate: "2026-11-15" })).status, 200);
    assert.equal((await send(base, "POST", "/drives", { ...baseDrive, startDate: "2026-11-10", endDate: "2026-11-10" })).status, 201);
  }));
  assert.equal(ctx.writes.length, 2, "only the two valid requests wrote anything");
});

test("F-06: an IST day runs from 18:30 UTC the previous day to 18:29:59.999 UTC", () => {
  const day = new Date("2026-10-12T00:00:00Z");

  assert.equal(istDayStart(day).toISOString(), "2026-10-11T18:30:00.000Z");
  assert.equal(istDayEnd(day).toISOString(), "2026-10-12T18:29:59.999Z");
});

test("F-06: boundary instants fall on the right Indian day", () => {

  assert.equal(istDayStart(new Date("2026-10-11T18:29:59.999Z")).toISOString(), "2026-10-10T18:30:00.000Z");
  assert.equal(istDayStart(new Date("2026-10-11T18:30:00.000Z")).toISOString(), "2026-10-11T18:30:00.000Z");
  assert.equal(istDayEnd(new Date("2026-10-12T18:29:59.999Z")).toISOString(), "2026-10-12T18:29:59.999Z");
  assert.equal(istDayEnd(new Date("2026-10-12T18:30:00.000Z")).toISOString(), "2026-10-13T18:29:59.999Z");
});

test("F-06: adjacent days tile the timeline with no gap and no overlap (including month, year and leap-day edges)", () => {
  for (const d of ["2026-10-31", "2026-12-31", "2028-02-28", "2028-02-29", "2027-03-01"]) {
    const day = new Date(`${d}T00:00:00Z`);
    const next = new Date(day.getTime() + 24 * 60 * 60 * 1000);

    assert.equal(istDayEnd(day).getTime() + 1, istDayStart(next).getTime(), d);
    assert.equal(istDayEnd(day).getTime() - istDayStart(day).getTime(), 24 * 60 * 60 * 1000 - 1, d);
  }

  assert.equal(istDayEnd(new Date("2026-12-31T00:00:00Z")).toISOString(), "2026-12-31T18:29:59.999Z");
  assert.equal(istDayStart(new Date("2027-01-01T00:00:00Z")).toISOString(), "2026-12-31T18:30:00.000Z");
});

test("F-06: the result does not depend on the machine's timezone", (t) => {
  const original = process.env.TZ;
  const probe = () => new Date(2026, 9, 12, 12).getTimezoneOffset();
  const results = new Set<string>();
  const offsets = new Set<number>();

  try {
    for (const tz of ["UTC", "Asia/Kolkata", "America/Los_Angeles", "Pacific/Auckland", "Asia/Kathmandu"]) {
      process.env.TZ = tz;
      offsets.add(probe());
      results.add(JSON.stringify(istDateRangeFilter(new Date("2026-10-12T00:00:00Z"), new Date("2026-10-12T00:00:00Z"))));
    }
  } finally {
    if (original === undefined) delete process.env.TZ;
    else process.env.TZ = original;
  }

  if (offsets.size < 2) {
    t.skip("this runtime does not switch timezone at run time, so independence cannot be demonstrated here");

    return;
  }

  assert.equal(results.size, 1, "the same filter under every timezone");
  assert.deepEqual([...results][0], JSON.stringify({ gte: "2026-10-11T18:30:00.000Z", lte: "2026-10-12T18:29:59.999Z" }));
});

test("F-06: filter shapes: none, from only, to only, both", () => {
  assert.equal(istDateRangeFilter(), undefined);
  assert.deepEqual(istDateRangeFilter(new Date("2026-10-12T00:00:00Z")), { gte: new Date("2026-10-11T18:30:00.000Z") });
  assert.deepEqual(istDateRangeFilter(undefined, new Date("2026-10-12T00:00:00Z")), { lte: new Date("2026-10-12T18:29:59.999Z") });
  assert.deepEqual(istDateRangeFilter(new Date("2026-10-10T00:00:00Z"), new Date("2026-10-12T00:00:00Z")), { gte: new Date("2026-10-09T18:30:00.000Z"), lte: new Date("2026-10-12T18:29:59.999Z") });
});

test("F-06: the audit-log and all three report queries use IST boundaries even when the server runs in another timezone", async () => {
  const original = process.env.TZ;
  const captured: Record<string, any> = {};

  const rows = (name: string) => async (args: any) => { (captured[name] ??= []).push(args.where); return []; };
  const count = async () => 0;
  const fakes = {
    auditLog: { findMany: rows("audit"), count },
    candidate: { findMany: rows("candidates"), count },
    interview: { findMany: rows("interviews"), count },
    drive: { findFirst: async () => null },
    $transaction: async (arg: unknown) => (Array.isArray(arg) ? Promise.all(arg) : (arg as Function)({})),
  };
  const from = new Date("2026-10-12T00:00:00Z");
  const to = new Date("2026-10-12T00:00:00Z");
  const expected = { gte: new Date("2026-10-11T18:30:00.000Z"), lte: new Date("2026-10-12T18:29:59.999Z") };

  process.env.TZ = "America/Los_Angeles";

  try {
    await withFakePrisma(fakes, async () => {
      await getAuditLogs({ fromDate: from, toDate: to, page: 1, limit: 20 } as any);
      await getCandidateReport({ type: "CANDIDATES", fromDate: from, toDate: to, page: 1, limit: 20 } as any);
      await getInterviewReport({ type: "INTERVIEWS", fromDate: from, toDate: to, page: 1, limit: 20 } as any);
      await getResultReport({ type: "RESULTS", fromDate: from, toDate: to, page: 1, limit: 20 } as any);
    });
  } finally {
    if (original === undefined) delete process.env.TZ;
    else process.env.TZ = original;
  }

  assert.deepEqual(captured.audit[0].createdAt, expected);
  assert.deepEqual(captured.candidates[0].createdAt, expected);

  assert.deepEqual(captured.interviews[0].scheduledAt, expected);

  assert.deepEqual(captured.interviews[1].feedbackSubmittedAt, { not: null, ...expected });
});

const UID = "33333333-3333-4333-8333-333333333333";

function deleteFakes(opts: { interviews?: number; deleteError?: unknown } = {}) {
  const log = { deleted: [] as string[], audit: [] as any[] };
  let query = 0;
  const tx = {

    $queryRaw: async () => { query += 1; return query === 1 ? [{ id: "sa-role" }] : [{ id: "someone-else" }]; },
    interview: { count: async () => opts.interviews ?? 0 },
    user: { delete: async ({ where }: any) => { if (opts.deleteError) throw opts.deleteError; log.deleted.push(where.id); } },
  };

  return {
    log,
    fakes: {
      user: { findUnique: async () => ({ id: UID, email: "i@x.test", name: "I" }) },
      auditLog: { create: async ({ data }: any) => { log.audit.push(data); return data; } },
      $transaction: async (cb: (t: any) => Promise<unknown>) => cb(tx),
    },
  };
}

test("F-08: deleting a user who is the interviewer on interviews is refused (409) and nothing is deleted or audited", async () => {
  const { fakes, log } = deleteFakes({ interviews: 3 });

  await withFakePrisma(fakes, async () => {
    await assert.rejects(deleteUser(UID, "admin-1"), (e: unknown) =>
      e instanceof UserSafetyError && e.code === "USER_ASSIGNED_TO_INTERVIEWS" && e.statusCode === 409 && /3 interviews/.test(e.message) && /Deactivate/.test(e.message));
  });
  assert.deepEqual(log.deleted, []);
  assert.deepEqual(log.audit, []);
});

test("F-08: singular wording, and a user with no interviews is still deleted and audited", async () => {
  let ctx = deleteFakes({ interviews: 1 });

  await withFakePrisma(ctx.fakes, async () => {
    await assert.rejects(deleteUser(UID, "admin-1"), /1 interview and cannot be deleted/);
  });

  ctx = deleteFakes({ interviews: 0 });
  await withFakePrisma(ctx.fakes, async () => {
    await deleteUser(UID, "admin-1");
  });
  assert.deepEqual(ctx.log.deleted, [UID]);
  assert.equal(ctx.log.audit[0].action, "USER_DELETED");
});

test("F-08: a database foreign-key refusal becomes the same clear 409; unrelated errors are not hidden", async () => {
  const fk = deleteFakes({ deleteError: Object.assign(new Error("FK"), { code: "P2003" }) });

  await withFakePrisma(fk.fakes, async () => {
    await assert.rejects(deleteUser(UID, "admin-1"), (e: unknown) => e instanceof UserSafetyError && e.code === "USER_IN_USE" && e.statusCode === 409);
  });
  assert.deepEqual(fk.log.audit, []);

  const other = deleteFakes({ deleteError: new Error("connection reset") });

  await withFakePrisma(other.fakes, async () => {
    await assert.rejects(deleteUser(UID, "admin-1"), /connection reset/);
  });

  assert.equal(isForeignKeyViolation({ code: "P2003" }), true);
  assert.equal(isForeignKeyViolation({ code: "P2014" }), true);
  assert.equal(isForeignKeyViolation({ cause: { originalCode: "23001" } }), true);
  assert.equal(isForeignKeyViolation({ meta: { driverAdapterError: { cause: { originalCode: "23503" } } } }), true);
  assert.equal(isForeignKeyViolation(new Error("boom")), false);
  assert.equal(isForeignKeyViolation(null), false);
  assert.equal(isForeignKeyViolation({ code: "P2002" }), false);
});

test("F-08 (HTTP): DELETE /users/:id answers 409 with a clear code and message", async () => {
  const { fakes } = deleteFakes({ interviews: 2 });

  await withFakePrisma(fakes, () => withServer({ id: "admin-1", permissions: ["users.manage"] }, (app) => app.delete("/users/:id", deleteUserController), async (base) => {
    const response = await send(base, "DELETE", `/users/${UID}`);

    assert.equal(response.status, 409);
    assert.equal(response.json.error.code, "USER_ASSIGNED_TO_INTERVIEWS");
    assert.match(response.json.error.message, /Deactivate the account instead/);
  }));
});

test("F-11: the assignable roles are exactly the four staff roles from the SRS", () => {
  assert.deepEqual([...STAFF_ROLE_NAMES], ["SUPER_ADMIN", "HR_ADMIN", "CAMPUS_COORDINATOR", "INTERVIEWER", "HOD", "STAFF"]);
  for (const name of STAFF_ROLE_NAMES) assert.equal(isStaffRole(name), true);
  for (const name of ["CANDIDATE", "candidate", "ADMIN", "", "HR_ADMIN "]) assert.equal(isStaffRole(name), false, name);
  assert.deepEqual(nonAssignableRoles([{ name: "HR_ADMIN" }, { name: "CANDIDATE" }]), [{ name: "CANDIDATE" }]);
});

const ROLE_IDS = { HR: "44444444-4444-4444-8444-444444444441", INTERVIEWER: "44444444-4444-4444-8444-444444444442", CANDIDATE: "44444444-4444-4444-8444-444444444443" };
const ROLES = [
  { id: ROLE_IDS.HR, name: "HR_ADMIN" },
  { id: ROLE_IDS.INTERVIEWER, name: "INTERVIEWER" },
  { id: ROLE_IDS.CANDIDATE, name: "CANDIDATE" },
];

function roleFakes() {
  const log = { created: [] as any[], txWrites: 0 };

  return {
    log,
    fakes: {
      role: { findMany: async ({ where }: any) => ROLES.filter((r) => where.id.in.includes(r.id)) },
      user: {
        findUnique: async ({ where }: any) => (where.email ? null : { id: UID, email: "u@x.test" }),
        findFirst: async () => null,
        create: async ({ data }: any) => { log.created.push(data); return { ...userRow(UID), userRoles: [] }; },
      },
      auditLog: { create: async ({ data }: any) => data },
      $transaction: async (cb: (t: any) => Promise<unknown>) => cb({ $queryRaw: async () => [], userRole: { deleteMany: async () => { log.txWrites += 1; } }, user: { update: async () => userRow(UID) }, refreshToken: { updateMany: async () => ({ count: 0 }) } }),
    },
  };
}

const newUser = (roleIds: string[]) => ({ email: "new@x.test", name: "New User", password: "Password-12345", roleIds });

test("F-11: creating a staff user with the CANDIDATE role is rejected (400 ROLE_NOT_ASSIGNABLE); staff roles are accepted", async () => {
  const { fakes, log } = roleFakes();

  await withFakePrisma(fakes, async () => {
    await assert.rejects(createUser(newUser([ROLE_IDS.CANDIDATE])), (e: unknown) => e instanceof UserSafetyError && e.code === "ROLE_NOT_ASSIGNABLE" && e.statusCode === 400 && /CANDIDATE/.test(e.message));
    await assert.rejects(createUser(newUser([ROLE_IDS.HR, ROLE_IDS.CANDIDATE])), (e: unknown) => e instanceof UserSafetyError && e.code === "ROLE_NOT_ASSIGNABLE");
    assert.equal(log.created.length, 0, "no account was created");

    assert.ok(await createUser(newUser([ROLE_IDS.HR])));
    assert.ok(await createUser(newUser([ROLE_IDS.HR, ROLE_IDS.INTERVIEWER])));
    assert.equal(log.created.length, 2);
  });
});

test("F-11: updating roles to include CANDIDATE is rejected before anything changes; unknown ids keep the existing error", async () => {
  const { fakes, log } = roleFakes();

  await withFakePrisma(fakes, async () => {
    await assert.rejects(updateUser(UID, { roleIds: [ROLE_IDS.CANDIDATE] }, "admin-1"), (e: unknown) => e instanceof UserSafetyError && e.code === "ROLE_NOT_ASSIGNABLE");
    await assert.rejects(updateUser(UID, { roleIds: [ROLE_IDS.INTERVIEWER, ROLE_IDS.CANDIDATE] }, "admin-1"), UserSafetyError);
    assert.equal(log.txWrites, 0, "the role rows were not touched");

    await assert.rejects(updateUser(UID, { roleIds: ["55555555-5555-4555-8555-555555555555"] }, "admin-1"), /do not exist/);
    assert.ok(await updateUser(UID, { roleIds: [ROLE_IDS.INTERVIEWER] }, "admin-1"));
    assert.equal(log.txWrites, 1);
  });
});

test("F-11: GET /roles lists only roles a staff user can hold", async () => {
  let seen: any;

  await withFakePrisma({ role: { findMany: async (args: any) => { seen = args; return []; } } }, async () => {
    await listRoles();
  });

  assert.deepEqual(seen.where, { name: { in: ["SUPER_ADMIN", "HR_ADMIN", "CAMPUS_COORDINATOR", "INTERVIEWER", "HOD", "STAFF"] } });
  assert.equal(JSON.stringify(seen).includes("CANDIDATE"), false);
});

test("F-11 (HTTP): POST /users with the CANDIDATE role answers 400 ROLE_NOT_ASSIGNABLE and creates nothing", async () => {
  const { fakes, log } = roleFakes();

  await withFakePrisma(fakes, () => withServer({ id: "admin-1", permissions: ["users.manage"] }, (app) => app.post("/users", createUserController), async (base) => {
    const bad = await send(base, "POST", "/users", newUser([ROLE_IDS.CANDIDATE]));

    assert.equal(bad.status, 400);
    assert.equal(bad.json.error.code, "ROLE_NOT_ASSIGNABLE");
    assert.equal(log.created.length, 0);

    assert.equal((await send(base, "POST", "/users", newUser([ROLE_IDS.HR]))).status, 201);
    assert.equal(log.created.length, 1);
  }));
});
