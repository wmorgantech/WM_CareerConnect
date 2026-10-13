

import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { readFileSync } from "node:fs";
import { afterEach, describe, it } from "node:test";
import bcrypt from "bcrypt";
import cookieParser from "cookie-parser";
import express from "express";
import { errorHandler, notFoundHandler } from "../src/middleware/error.middleware.js";
import router from "../src/routes/index.js";
import { createMemoryDb, SEEDED_ROLE_PERMISSIONS, ALL_PERMISSIONS, type MemoryDb } from "./helpers/memory-db.js";

const PASSWORD = "Correct-Horse-1";
const PASSWORD_HASH = bcrypt.hashSync(PASSWORD, 4);

let db: MemoryDb | null = null;

afterEach(() => {
  db?.restore();
  db = null;
});

async function api(
  run: (call: (method: string, path: string, opts?: { token?: string; body?: unknown; headers?: Record<string, string> }) => Promise<{ status: number; json: any; setCookie: string[] }>) => Promise<void>,
) {
  const app = express();

  app.use(express.json());
  app.use(cookieParser());
  app.use("/api/v1", router);
  app.use(notFoundHandler);
  app.use(errorHandler);

  const server = await new Promise<import("node:http").Server>((resolve) => {
    const s = app.listen(0, "127.0.0.1", () => resolve(s));
  });
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1`;
  const originalError = console.error;

  console.error = () => {};

  try {
    await run(async (method, path, opts = {}) => {
      const headers: Record<string, string> = { ...(opts.headers ?? {}) };

      if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
      if (opts.body !== undefined) headers["Content-Type"] = "application/json";

      const response = await fetch(`${base}${path}`, { method, headers, body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined });
      const text = await response.text();
      let json: any = null;

      try { json = JSON.parse(text); } catch {  }

      return { status: response.status, json, setCookie: response.headers.getSetCookie() };
    });
  } finally {
    console.error = originalError;
    server.closeAllConnections();
    server.close();
  }
}

function fresh() {
  db = createMemoryDb();

  return db;
}

const tokenFor = (d: MemoryDb, role: Parameters<MemoryDb["addUser"]>[0]) => {
  const user = d.addUser(role);

  return { user, token: d.accessTokenFor(user.id) };
};

describe("fixture fidelity", () => {
  it("the in-memory role table matches prisma/seed.ts", () => {
    const seed = readFileSync(new URL("../prisma/seed.ts", import.meta.url), "utf8");

    for (const [role, permissions] of Object.entries(SEEDED_ROLE_PERMISSIONS)) {
      const block = seed.split(new RegExp(`\\b${role}\\b\\s*:`))[1];

      assert.ok(block, `${role} not found in seed.ts`);
      for (const permission of permissions) assert.ok(block.slice(0, 2500).includes(`"${permission}"`), `${role} should have ${permission} in seed.ts`);
    }
    assert.equal(ALL_PERMISSIONS.length, 19);
  });
});

describe("authentication and role restrictions at the HTTP boundary", () => {
  it("rejects requests with no token, a malformed token, and a revoked session", async () => {
    const d = fresh();
    const admin = d.addUser("SUPER_ADMIN");
    const session = d.addSession(admin.id);
    const token = d.accessTokenFor(admin.id, session);

    await api(async (call) => {
      assert.equal((await call("GET", "/users")).status, 401);
      assert.equal((await call("GET", "/users", { token: "not-a-jwt" })).status, 401);
      assert.equal((await call("GET", "/users", { token })).status, 200);

      session.revokedAt = new Date();
      assert.equal((await call("GET", "/users", { token })).status, 401, "revoking the session kills its access token");
    });
  });

  it("rejects access tokens for deactivated users", async () => {
    const d = fresh();
    const { user, token } = tokenFor(d, "SUPER_ADMIN");

    user.status = "INACTIVE";
    await api(async (call) => assert.equal((await call("GET", "/users", { token })).status, 401));
  });

  const matrix: [string, string, string, number][] = [

    ["HR_ADMIN", "GET", "/users", 403],
    ["CAMPUS_COORDINATOR", "GET", "/users", 403],
    ["INTERVIEWER", "GET", "/users", 403],
    ["CANDIDATE", "GET", "/users", 403],
    ["HR_ADMIN", "POST", "/users", 403],
    ["INTERVIEWER", "GET", "/drives", 403],
    ["CAMPUS_COORDINATOR", "POST", "/drives", 403],
    ["INTERVIEWER", "PATCH", "/interviews/00000000-0000-4000-8000-000000000000", 403],
    ["CAMPUS_COORDINATOR", "GET", "/interviews", 403],
    ["CANDIDATE", "GET", "/interviews", 403],
    ["INTERVIEWER", "POST", "/interviews", 403],
    ["CANDIDATE", "GET", "/audit-logs", 403],
    ["HR_ADMIN", "GET", "/audit-logs", 403],
    ["HR_ADMIN", "GET", "/settings", 403],
  ];

  for (const [role, method, path, expected] of matrix) {
    it(`${role} ${method} ${path} -> ${expected}`, async () => {
      const d = fresh();
      const { token } = tokenFor(d, role as any);

      await api(async (call) => {
        const res = await call(method, path, { token, body: method === "GET" ? undefined : {} });

        assert.equal(res.status, expected);
        assert.equal(res.json?.error?.code, "FORBIDDEN");
      });
    });
  }

  // HOD and STAFF hold only results.view. Every route below is guarded by another permission (checked
  // against the route files), so each must answer 403 FORBIDDEN and change nothing.
  const ID = "00000000-0000-4000-8000-000000000000";
  const scopedDenied: [string, string, unknown][] = [
    ["GET", "/candidates", undefined],
    ["POST", "/candidates", {}],
    ["PATCH", `/candidates/${ID}`, {}],
    ["DELETE", `/candidates/${ID}`, undefined],
    ["GET", "/applications", undefined],
    ["POST", "/applications", {}],
    ["GET", "/applications/my-drives", undefined],
    ["GET", "/applications/interviews", undefined],
    ["POST", `/applications/${ID}/verify`, {}],
    ["POST", `/applications/${ID}/credential`, {}],
    ["PATCH", `/applications/${ID}/status`, { status: "SHORTLISTED" }],
    ["POST", "/applications/bulk-status", { driveId: ID, action: "SHORTLIST", percentage: 50 }],
    ["GET", "/dashboard/stats", undefined],
    ["GET", "/reports", undefined],
    ["GET", "/reports/export", undefined],
    ["GET", "/interviews", undefined],
    ["GET", "/interviews/interviewers", undefined],
    ["POST", "/interviews", {}],
    ["GET", "/drives", undefined],
    ["POST", "/drives", {}],
    ["GET", "/colleges", undefined],
    ["POST", "/colleges", {}],
    ["GET", "/users", undefined],
    ["POST", "/users", {}],
    ["PUT", `/users/${ID}/colleges`, { collegeIds: [] }],
  ];

  for (const role of ["HOD", "STAFF"] as const) {
    it(`${role} is refused on the candidates, applications, dashboard, reports, interviews, drives, colleges and users routes`, async () => {
      const d = fresh();
      const { token } = tokenFor(d, role);
      const writesBefore = d.counters.writes;

      await api(async (call) => {
        for (const [method, path, body] of scopedDenied) {
          const res = await call(method, path, { token, ...(body === undefined ? {} : { body }) });

          assert.equal(res.status, 403, `${role} ${method} ${path}`);
          assert.equal(res.json?.error?.code, "FORBIDDEN", `${role} ${method} ${path}`);
        }
      });
      assert.equal(d.counters.writes, writesBefore, "nothing was written");
      assert.equal(d.state.auditLog.length, 0, "no audit rows");
    });
  }

  it("the CANDIDATE role cannot be listed or assigned as a staff role", async () => {
    const d = fresh();
    const { token } = tokenFor(d, "SUPER_ADMIN");

    await api(async (call) => {
      const roles = await call("GET", "/roles", { token });

      assert.equal(roles.status, 200);
      assert.deepEqual(roles.json.data.map((r: any) => r.name).sort(), ["CAMPUS_COORDINATOR", "HOD", "HR_ADMIN", "INTERVIEWER", "STAFF", "SUPER_ADMIN"]);

      const created = await call("POST", "/users", { token, body: { email: "c@example.test", name: "Cand Idate", password: PASSWORD, roleIds: [d.roleId("CANDIDATE")] } });

      assert.equal(created.status, 400);
      assert.equal(created.json.error.code, "ROLE_NOT_ASSIGNABLE");
      assert.equal([...d.state.users.values()].some((u) => u.email === "c@example.test"), false);
    });
  });

  it("denied requests do not mutate state or write audit rows", async () => {
    const d = fresh();
    const victim = d.addUser("INTERVIEWER");
    const session = d.addSession(victim.id);
    const interview = d.addInterview();
    const drive = d.addDrive();
    const { token } = tokenFor(d, "INTERVIEWER");
    const before = JSON.stringify([...d.state.users.values(), ...d.state.sessions.values(), ...d.state.interviews.values(), ...d.state.drives.values(), d.state.auditLog]);
    const writesBefore = d.counters.writes;

    await api(async (call) => {
      assert.equal((await call("PATCH", `/users/${victim.id}`, { token, body: { password: "Another-Pass-9" } })).status, 403);
      assert.equal((await call("DELETE", `/users/${victim.id}`, { token })).status, 403);
      assert.equal((await call("PATCH", `/interviews/${interview.id}`, { token, body: { status: "COMPLETED" } })).status, 403);
      assert.equal((await call("DELETE", `/interviews/${interview.id}`, { token })).status, 403);
      assert.equal((await call("PATCH", `/drives/${drive.id}`, { token, body: { title: "hacked" } })).status, 403);
      assert.equal((await call("POST", `/interviews/${interview.id}/feedback/unlock`, { token })).status, 403);
    });

    const after = JSON.stringify([...d.state.users.values(), ...d.state.sessions.values(), ...d.state.interviews.values(), ...d.state.drives.values(), d.state.auditLog]);

    assert.equal(after, before);
    assert.equal(d.counters.writes, writesBefore, "no write method was called");
    assert.equal(d.activeSessions(victim.id).length, 1);
    assert.equal(session.revokedAt, null);
  });
});

describe("refresh cookie selection and clearing", () => {
  const cases: [string, Record<string, string>, string][] = [
    ["Admin", { "X-WM-Client": "admin" }, "wm_admin_refresh"],
    ["staff", { "X-WM-Client": "staff" }, "wm_staff_refresh"],
    ["upper-case header value", { "X-WM-Client": " ADMIN " }, "wm_admin_refresh"],
    ["legacy client (no header)", {}, "wm_refresh_token"],
    ["unknown client header", { "X-WM-Client": "mobile" }, "wm_refresh_token"],
    ["prototype-ish header value", { "X-WM-Client": "constructor" }, "wm_refresh_token"],
  ];

  function setCookieFor(res: { setCookie: string[] }, name: string) {
    return res.setCookie.find((c) => c.startsWith(`${name}=`));
  }

  for (const [label, headers, cookie] of cases) {
    it(`login sets, refresh reads and rotates, logout clears: ${label} -> ${cookie}`, async () => {
      const d = fresh();
      const user = d.addUser("HR_ADMIN", { passwordHash: PASSWORD_HASH });

      await api(async (call) => {
        const login = await call("POST", "/auth/login", { body: { email: user.email, password: PASSWORD }, headers });

        assert.equal(login.status, 200);
        assert.equal(login.setCookie.length, 1, "exactly one cookie is set");

        const set = setCookieFor(login, cookie);

        assert.ok(set, `expected ${cookie}, got ${login.setCookie}`);
        assert.match(set, /HttpOnly/i);
        assert.match(set, /SameSite=Lax/i);
        assert.match(set, /Path=\/api\/v1\/auth/);

        const value = set.split(";")[0]!.slice(cookie.length + 1);
        const send = { ...headers, Cookie: `${cookie}=${value}` };

const refreshed = await call("POST", "/auth/refresh", { headers: send });

        assert.equal(refreshed.status, 200);
        assert.ok(setCookieFor(refreshed, cookie), "rotated token is set under the same name");

const otherName = ["wm_admin_refresh", "wm_staff_refresh", "wm_refresh_token"].find((n) => n !== cookie)!;
        const wrong = await call("POST", "/auth/refresh", { headers: { ...headers, Cookie: `${otherName}=${value}` } });

        assert.equal(wrong.status, 401);
        assert.equal(wrong.json.error.code, "REFRESH_TOKEN_MISSING");

const rotated = setCookieFor(refreshed, cookie)!.split(";")[0]!.slice(cookie.length + 1);
        const out = await call("POST", "/auth/logout", { headers: { ...headers, Cookie: `${cookie}=${rotated}` } });

        assert.equal(out.status, 200);
        assert.equal(out.setCookie.length, 1);

        const cleared = out.setCookie[0]!;

        assert.ok(cleared.startsWith(`${cookie}=;`), cleared);
        assert.match(cleared, /Expires=Thu, 01 Jan 1970/);
        assert.match(cleared, /Path=\/api\/v1\/auth/);
        assert.match(cleared, /HttpOnly/i);
        assert.equal(d.activeSessions(user.id).length, 0, "logout revoked the session");
      });
    });
  }

  it("an Admin login and a staff login for the same user are independent sessions", async () => {
    const d = fresh();
    const user = d.addUser("SUPER_ADMIN", { passwordHash: PASSWORD_HASH });

    await api(async (call) => {
      const a = await call("POST", "/auth/login", { body: { email: user.email, password: PASSWORD }, headers: { "X-WM-Client": "admin" } });
      const s = await call("POST", "/auth/login", { body: { email: user.email, password: PASSWORD }, headers: { "X-WM-Client": "staff" } });
      const adminValue = a.setCookie[0]!.split(";")[0]!.slice("wm_admin_refresh=".length);

      assert.equal(d.activeSessions(user.id).length, 2);

      await call("POST", "/auth/logout", { headers: { "X-WM-Client": "admin", Cookie: `wm_admin_refresh=${adminValue}` } });
      assert.equal(d.activeSessions(user.id).length, 1, "logging out of Admin leaves the staff session alive");
      assert.equal((await call("GET", "/auth/me", { token: s.json.data.accessToken })).status, 200);
    });
  });

  it("a failed login sets no cookie", async () => {
    const d = fresh();
    const user = d.addUser("HR_ADMIN", { passwordHash: PASSWORD_HASH });

    await api(async (call) => {
      const res = await call("POST", "/auth/login", { body: { email: user.email, password: "wrong-password" }, headers: { "X-WM-Client": "admin" } });

      assert.equal(res.status, 401);
      assert.equal(res.setCookie.length, 0);
    });
  });
});

describe("interview status transitions through the API", () => {
  const url = (id: string) => `/interviews/${id}`;

  async function setup(over: Record<string, unknown> = {}) {
    const d = fresh();
    const { token } = tokenFor(d, "HR_ADMIN");
    const interview = d.addInterview(over);

    return { d, token, interview };
  }

  it("reopening a cancelled interview -> 409 INTERVIEW_CANCELLED, row unchanged, no audit", async () => {
    const { d, token, interview } = await setup({ status: "CANCELLED" });

    await api(async (call) => {
      for (const status of ["SCHEDULED", "COMPLETED"]) {
        const res = await call("PATCH", url(interview.id), { token, body: { status } });

        assert.equal(res.status, 409);
        assert.equal(res.json.error.code, "INTERVIEW_CANCELLED");
        assert.match(res.json.error.message, /cancelled/i);
      }
    });
    assert.equal(d.state.interviews.get(interview.id)!.status, "CANCELLED");
    assert.equal(d.state.auditLog.length, 0);
  });

  it("changing the status after feedback was submitted -> 409 INVALID_STATUS_TRANSITION", async () => {
    const { d, token, interview } = await setup({ status: "COMPLETED", feedback: "ok", score: 80, feedbackSubmittedAt: new Date(), feedbackLockedAt: new Date() });

    await api(async (call) => {
      for (const status of ["SCHEDULED", "CANCELLED"]) {
        const res = await call("PATCH", url(interview.id), { token, body: { status } });

        assert.equal(res.status, 409, status);
        assert.equal(res.json.error.code, "INVALID_STATUS_TRANSITION");
      }

      const cancel = await call("DELETE", url(interview.id), { token });

      assert.equal(cancel.status, 409);
      assert.equal(cancel.json.error.code, "INVALID_STATUS_TRANSITION");
    });
    assert.equal(d.state.interviews.get(interview.id)!.status, "COMPLETED");
    assert.equal(d.state.auditLog.length, 0);
  });

  it("an unknown status value -> 400 VALIDATION_ERROR (not a 409, not a 500)", async () => {
    const { d, token, interview } = await setup();

    await api(async (call) => {
      const res = await call("PATCH", url(interview.id), { token, body: { status: "ARCHIVED" } });

      assert.equal(res.status, 400);
      assert.equal(res.json.error.code, "VALIDATION_ERROR");
      assert.ok(res.json.error.details.fieldErrors.status);
    });
    assert.equal(d.state.interviews.get(interview.id)!.status, "SCHEDULED");
  });

  it("a valid transition succeeds and is audited; cancelling twice is idempotent", async () => {
    const { d, token, interview } = await setup();

    await api(async (call) => {
      const done = await call("PATCH", url(interview.id), { token, body: { status: "COMPLETED" } });

      assert.equal(done.status, 200);
      assert.equal(done.json.data.status, "COMPLETED");

      const second = await setup();
      const first = await call("DELETE", url(second.interview.id), { token: second.token });
      const again = await call("DELETE", url(second.interview.id), { token: second.token });

      assert.equal(first.status, 200);
      assert.equal(again.status, 200);
      assert.equal(second.d.state.auditLog.filter((a) => a.action === "INTERVIEW_CANCELLED").length, 1, "second cancel writes no audit row");
    });
  });

  it("a lost race (row changed between check and write) -> 409 INTERVIEW_CHANGED and nothing is written", async () => {
    const { d, token, interview } = await setup();
    const original = d.client.interview.updateMany;

d.client.interview.updateMany = async (args: any) => {
      Object.assign(d.state.interviews.get(interview.id)!, { status: "COMPLETED", feedbackSubmittedAt: new Date() });

      return original(args);
    };

    await api(async (call) => {
      const res = await call("PATCH", url(interview.id), { token, body: { status: "CANCELLED" } });

      assert.equal(res.status, 409);
      assert.equal(res.json.error.code, "INTERVIEW_CHANGED");
    });
    assert.equal(d.state.interviews.get(interview.id)!.status, "COMPLETED", "the concurrent change is preserved");
    assert.equal(d.state.auditLog.length, 0);
  });

  it("an unknown interview id -> 404 and a non-uuid id -> 400", async () => {
    const { token } = await setup();

    await api(async (call) => {
      assert.equal((await call("PATCH", url("00000000-0000-4000-8000-000000000000"), { token, body: { status: "COMPLETED" } })).status, 404);
      assert.equal((await call("PATCH", url("nope"), { token, body: { status: "COMPLETED" } })).status, 400);
    });
  });

  it("feedback unlock by a non-Super-Admin is refused and changes nothing", async () => {
    const { d, token, interview } = await setup({ status: "COMPLETED", feedbackSubmittedAt: new Date(), feedbackLockedAt: new Date() });

    await api(async (call) => {
      const res = await call("POST", `${url(interview.id)}/feedback/unlock`, { token });

      assert.equal(res.status, 403);
    });
    assert.ok(d.state.interviews.get(interview.id)!.feedbackLockedAt, "still locked");
  });
});

describe("drive date validation through the API", () => {
  const dates = { startDate: "2026-11-10T00:00:00.000Z", endDate: "2026-11-01T00:00:00.000Z" };

  it("create with end before start -> 400 VALIDATION_ERROR on endDate, nothing stored", async () => {
    const d = fresh();
    const { token } = tokenFor(d, "HR_ADMIN");
    const college = d.addCollege();

    await api(async (call) => {
      const res = await call("POST", "/drives", { token, body: { title: "Autumn drive", collegeId: college.id, ...dates } });

      assert.equal(res.status, 400);
      assert.equal(res.json.error.code, "VALIDATION_ERROR");
      assert.deepEqual(res.json.error.details.fieldErrors.endDate, ["End date can't be before the start date"]);
    });
    assert.equal(d.state.drives.size, 0);
    assert.equal(d.state.auditLog.length, 0);
  });

  it("create with equal or ordered dates succeeds", async () => {
    const d = fresh();
    const { token } = tokenFor(d, "HR_ADMIN");
    const college = d.addCollege();

    await api(async (call) => {
      const same = await call("POST", "/drives", { token, body: { title: "One-day drive", collegeId: college.id, startDate: dates.startDate, endDate: dates.startDate } });
      const ok = await call("POST", "/drives", { token, body: { title: "Two-day drive", collegeId: college.id, startDate: dates.endDate, endDate: dates.startDate } });

      assert.equal(same.status, 201);
      assert.equal(ok.status, 201);
    });
  });

  it("garbage dates -> 400", async () => {
    const d = fresh();
    const { token } = tokenFor(d, "HR_ADMIN");
    const college = d.addCollege();

    await api(async (call) => {
      const res = await call("POST", "/drives", { token, body: { title: "Bad", collegeId: college.id, startDate: "not-a-date" } });

      assert.equal(res.status, 400);
    });
    assert.equal(d.state.drives.size, 0);
  });

  it("update: moving only the start date past the stored end date -> 400 on startDate, row unchanged", async () => {
    const d = fresh();
    const { token } = tokenFor(d, "HR_ADMIN");
    const drive = d.addDrive({ startDate: new Date("2026-11-01T00:00:00Z"), endDate: new Date("2026-11-05T00:00:00Z") });

    await api(async (call) => {
      const res = await call("PATCH", `/drives/${drive.id}`, { token, body: { startDate: "2026-12-01T00:00:00.000Z" } });

      assert.equal(res.status, 400);
      assert.equal(res.json.error.code, "VALIDATION_ERROR");
      assert.ok(res.json.error.details.fieldErrors.startDate);
    });
    assert.equal(d.state.drives.get(drive.id)!.startDate.toISOString(), "2026-11-01T00:00:00.000Z");
    assert.equal(d.state.auditLog.length, 0);
  });

  it("update: moving only the end date before the stored start date -> 400 on endDate", async () => {
    const d = fresh();
    const { token } = tokenFor(d, "HR_ADMIN");
    const drive = d.addDrive({ startDate: new Date("2026-11-10T00:00:00Z"), endDate: new Date("2026-11-20T00:00:00Z") });

    await api(async (call) => {
      const res = await call("PATCH", `/drives/${drive.id}`, { token, body: { endDate: "2026-11-01T00:00:00.000Z" } });

      assert.equal(res.status, 400);
      assert.ok(res.json.error.details.fieldErrors.endDate);
    });
  });

  it("update: a title-only edit still works on a drive whose stored dates are already reversed", async () => {
    const d = fresh();
    const { token } = tokenFor(d, "HR_ADMIN");
    const drive = d.addDrive({ startDate: new Date("2026-11-10T00:00:00Z"), endDate: new Date("2026-11-01T00:00:00Z") });

    await api(async (call) => {
      const res = await call("PATCH", `/drives/${drive.id}`, { token, body: { title: "Renamed" } });

      assert.equal(res.status, 200);
    });
  });
});

describe("password reset is all-or-nothing", () => {
  it("success: new password stored and every session of that user (and only that user) revoked", async () => {
    const d = fresh();
    const { token } = tokenFor(d, "SUPER_ADMIN");
    const target = d.addUser("HR_ADMIN", { passwordHash: PASSWORD_HASH });
    const bystander = d.addUser("HR_ADMIN");

    d.addSession(target.id);
    d.addSession(target.id);
    d.addSession(bystander.id);

    await api(async (call) => {
      const res = await call("PATCH", `/users/${target.id}`, { token, body: { password: "Brand-New-Pass-7" } });

      assert.equal(res.status, 200);
    });

    const stored = d.state.users.get(target.id)!;

    assert.ok(await bcrypt.compare("Brand-New-Pass-7", stored.passwordHash));
    assert.equal(d.activeSessions(target.id).length, 0);
    assert.equal(d.activeSessions(bystander.id).length, 1);
  });

  it("failure while revoking sessions: password unchanged, NO session revoked, no audit row", async () => {
    const d = fresh();
    const { token } = tokenFor(d, "SUPER_ADMIN");
    const target = d.addUser("HR_ADMIN", { passwordHash: PASSWORD_HASH });

    d.addSession(target.id);
    d.addSession(target.id);
    d.addSession(target.id);

    const original = d.client.refreshToken.updateMany;

d.client.refreshToken.updateMany = async (args: any) => {
      const [first, second] = d.activeSessions(target.id);

      first!.revokedAt = new Date();
      second!.revokedAt = new Date();
      d.client.refreshToken.updateMany = original;
      throw new Error("simulated database failure");
    };

    await api(async (call) => {
      const res = await call("PATCH", `/users/${target.id}`, { token, body: { password: "Brand-New-Pass-7" } });

      assert.equal(res.status, 500);
    });

    const stored = d.state.users.get(target.id)!;

    assert.equal(stored.passwordHash, PASSWORD_HASH, "password hash did not change");
    assert.equal(d.activeSessions(target.id).length, 3, "all three sessions are still active");
    assert.equal(d.state.auditLog.length, 0);
  });

  it("failure while updating the user: sessions are not revoked", async () => {
    const d = fresh();
    const { token } = tokenFor(d, "SUPER_ADMIN");
    const target = d.addUser("HR_ADMIN", { passwordHash: PASSWORD_HASH });

    d.addSession(target.id);
    d.client.user.update = async () => { throw new Error("simulated database failure"); };

    await api(async (call) => {
      assert.equal((await call("PATCH", `/users/${target.id}`, { token, body: { password: "Brand-New-Pass-7" } })).status, 500);
    });
    assert.equal(d.activeSessions(target.id).length, 1);
    assert.equal(d.state.users.get(target.id)!.passwordHash, PASSWORD_HASH);
  });

  it("a rejected password (too short) changes nothing", async () => {
    const d = fresh();
    const { token } = tokenFor(d, "SUPER_ADMIN");
    const target = d.addUser("HR_ADMIN", { passwordHash: PASSWORD_HASH });

    d.addSession(target.id);

    await api(async (call) => {
      const res = await call("PATCH", `/users/${target.id}`, { token, body: { password: "short" } });

      assert.equal(res.status, 400);
    });
    assert.equal(d.activeSessions(target.id).length, 1);
    assert.equal(d.state.users.get(target.id)!.passwordHash, PASSWORD_HASH);
  });

  it("an edit that does not touch the password leaves sessions alone", async () => {
    const d = fresh();
    const { token } = tokenFor(d, "SUPER_ADMIN");
    const target = d.addUser("HR_ADMIN");

    d.addSession(target.id);

    await api(async (call) => {
      assert.equal((await call("PATCH", `/users/${target.id}`, { token, body: { name: "New Name" } })).status, 200);
    });
    assert.equal(d.activeSessions(target.id).length, 1);
  });
});

describe("interviewer deletion guard through the API", () => {
  it("deleting an interviewer who has interviews -> 409 USER_ASSIGNED_TO_INTERVIEWS and the user survives", async () => {
    const d = fresh();
    const { token } = tokenFor(d, "SUPER_ADMIN");
    const interviewer = d.addUser("INTERVIEWER");

    d.addInterview({ interviewerId: interviewer.id });

    await api(async (call) => {
      const res = await call("DELETE", `/users/${interviewer.id}`, { token });

      assert.equal(res.status, 409);
      assert.equal(res.json.error.code, "USER_ASSIGNED_TO_INTERVIEWS");
    });
    assert.ok(d.state.users.has(interviewer.id));
    assert.equal(d.state.auditLog.length, 0);
  });

  it("deleting an interviewer with no interviews works", async () => {
    const d = fresh();
    const { token } = tokenFor(d, "SUPER_ADMIN");
    const interviewer = d.addUser("INTERVIEWER");

    await api(async (call) => {
      assert.equal((await call("DELETE", `/users/${interviewer.id}`, { token })).status, 200);
    });
    assert.equal(d.state.users.has(interviewer.id), false);
  });
});

describe("Batch 3 fix 1: deactivation ends refresh sessions", () => {
  async function setup() {
    const d = fresh();
    const { token } = tokenFor(d, "SUPER_ADMIN");
    const target = d.addUser("HR_ADMIN", { passwordHash: PASSWORD_HASH });
    const other = d.addUser("HR_ADMIN");

    return { d, token, target, other };
  }

  for (const via of ["status endpoint", "general update"] as const) {
    it(`deactivating via the ${via} revokes only that user's sessions`, async () => {
      const { d, token, target, other } = await setup();
      const a = d.addSession(target.id);

      d.addSession(target.id);
      d.addSession(other.id);

      const targetToken = d.accessTokenFor(target.id, a);

      await api(async (call) => {
        const res = via === "status endpoint"
          ? await call("PATCH", `/users/${target.id}/status`, { token, body: { status: "INACTIVE" } })
          : await call("PATCH", `/users/${target.id}`, { token, body: { status: "INACTIVE" } });

        assert.equal(res.status, 200);
        assert.equal((await call("GET", "/auth/me", { token: targetToken })).status, 401);
      });
      assert.equal(d.activeSessions(target.id).length, 0);
      assert.equal(d.activeSessions(other.id).length, 1, "unrelated user keeps their session");
      assert.equal(d.state.users.get(target.id)!.status, "INACTIVE");
    });
  }

  it("repeated deactivation is harmless", async () => {
    const { d, token, target } = await setup();

    d.addSession(target.id);

    await api(async (call) => {
      assert.equal((await call("PATCH", `/users/${target.id}/status`, { token, body: { status: "INACTIVE" } })).status, 200);
      assert.equal((await call("PATCH", `/users/${target.id}/status`, { token, body: { status: "INACTIVE" } })).status, 200);
    });
    assert.equal(d.activeSessions(target.id).length, 0);
  });

  it("reactivation does not restore revoked sessions: the old cookie and token stay dead until a new login", async () => {
    const { d, token, target } = await setup();

    await api(async (call) => {
      const login = await call("POST", "/auth/login", { body: { email: target.email, password: PASSWORD }, headers: { "X-WM-Client": "admin" } });
      const cookie = login.setCookie[0]!.split(";")[0]!;

      await call("PATCH", `/users/${target.id}/status`, { token, body: { status: "INACTIVE" } });
      assert.equal((await call("PATCH", `/users/${target.id}/status`, { token, body: { status: "ACTIVE" } })).status, 200);

      assert.equal((await call("POST", "/auth/refresh", { headers: { "X-WM-Client": "admin", Cookie: cookie } })).status, 401);
      assert.equal((await call("GET", "/auth/me", { token: login.json.data.accessToken })).status, 401);
      assert.equal(d.activeSessions(target.id).length, 0);

      const again = await call("POST", "/auth/login", { body: { email: target.email, password: PASSWORD }, headers: { "X-WM-Client": "admin" } });

      assert.equal(again.status, 200, "a fresh login works");
    });
  });

  it("if the revocation fails, the status change is rolled back and sessions stay active", async () => {
    const { d, token, target } = await setup();

    d.addSession(target.id);
    d.client.refreshToken.updateMany = async () => { throw new Error("simulated database failure"); };

    await api(async (call) => {
      assert.equal((await call("PATCH", `/users/${target.id}/status`, { token, body: { status: "INACTIVE" } })).status, 500);
      assert.equal((await call("PATCH", `/users/${target.id}`, { token, body: { status: "INACTIVE" } })).status, 500);
    });
    assert.equal(d.state.users.get(target.id)!.status, "ACTIVE");
    assert.equal(d.activeSessions(target.id).length, 1);
    assert.equal(d.state.auditLog.length, 0);
  });

  it("reactivating, and ordinary edits, revoke nothing", async () => {
    const { d, token, target } = await setup();

    d.addSession(target.id);

    await api(async (call) => {
      assert.equal((await call("PATCH", `/users/${target.id}/status`, { token, body: { status: "ACTIVE" } })).status, 200);
      assert.equal((await call("PATCH", `/users/${target.id}`, { token, body: { name: "Renamed User" } })).status, 200);
    });
    assert.equal(d.activeSessions(target.id).length, 1);
  });
});

describe("Batch 3 fix 2: no reassignment after feedback", () => {
  const withFeedback = { status: "COMPLETED", feedback: "Strong", score: 90, feedbackSubmittedAt: new Date("2026-10-20T10:00:00Z"), feedbackLockedAt: new Date("2026-10-20T10:00:00Z") };

  function setup(over: Record<string, unknown> = {}) {
    const d = fresh();
    const { token } = tokenFor(d, "HR_ADMIN");
    const first = d.addUser("INTERVIEWER");
    const second = d.addUser("INTERVIEWER");
    const interview = d.addInterview({ interviewerId: first.id, ...over });

    return { d, token, first, second, interview };
  }

  it("reassigning after feedback -> 409 INTERVIEWER_LOCKED_AFTER_FEEDBACK; record, feedback and audit untouched", async () => {
    const { d, token, second, interview, first } = setup(withFeedback);
    const before = JSON.stringify(d.state.interviews.get(interview.id));
    const writes = d.counters.writes;

    await api(async (call) => {
      const res = await call("PATCH", `/interviews/${interview.id}`, { token, body: { interviewerId: second.id } });

      assert.equal(res.status, 409);
      assert.equal(res.json.error.code, "INTERVIEWER_LOCKED_AFTER_FEEDBACK");
    });
    assert.equal(JSON.stringify(d.state.interviews.get(interview.id)), before);
    assert.equal(d.state.interviews.get(interview.id)!.interviewerId, first.id);
    assert.equal(d.counters.writes, writes);
    assert.equal(d.state.auditLog.length, 0);
  });

  it("a combined request (reassign + notes) is rejected as a whole", async () => {
    const { d, token, second, interview } = setup(withFeedback);

    await api(async (call) => {
      const res = await call("PATCH", `/interviews/${interview.id}`, { token, body: { interviewerId: second.id, notes: "x" } });

      assert.equal(res.status, 409);
    });
    assert.equal(d.state.interviews.get(interview.id)!.notes, null);
  });

  it("other edits after feedback, and re-sending the same interviewer, still work", async () => {
    const { d, token, first, interview } = setup(withFeedback);

    await api(async (call) => {
      assert.equal((await call("PATCH", `/interviews/${interview.id}`, { token, body: { notes: "Follow-up note" } })).status, 200);
      assert.equal((await call("PATCH", `/interviews/${interview.id}`, { token, body: { interviewerId: first.id } })).status, 200);
    });
    assert.equal(d.state.interviews.get(interview.id)!.notes, "Follow-up note");
  });

  it("before feedback, reassignment still works", async () => {
    const { d, token, second, interview } = setup();

    await api(async (call) => {
      assert.equal((await call("PATCH", `/interviews/${interview.id}`, { token, body: { interviewerId: second.id } })).status, 200);
    });
    assert.equal(d.state.interviews.get(interview.id)!.interviewerId, second.id);
  });

  it("feedback submitted between the check and the write: 409 INTERVIEW_CHANGED, interviewer not overwritten", async () => {
    const { d, token, first, second, interview } = setup();
    const original = d.client.interview.updateMany;

    d.client.interview.updateMany = async (args: any) => {
      Object.assign(d.state.interviews.get(interview.id)!, withFeedback);

      return original(args);
    };

    await api(async (call) => {
      const res = await call("PATCH", `/interviews/${interview.id}`, { token, body: { interviewerId: second.id } });

      assert.equal(res.status, 409);
      assert.equal(res.json.error.code, "INTERVIEW_CHANGED");
    });
    assert.equal(d.state.interviews.get(interview.id)!.interviewerId, first.id);
    assert.equal(d.state.interviews.get(interview.id)!.feedback, "Strong");
    assert.equal(d.state.auditLog.length, 0);
  });

  it("reassigned concurrently by someone else: the second writer gets 409", async () => {
    const { d, token, second, interview } = setup();
    const third = d.addUser("INTERVIEWER");
    const original = d.client.interview.updateMany;

    d.client.interview.updateMany = async (args: any) => {
      d.state.interviews.get(interview.id)!.interviewerId = third.id;

      return original(args);
    };

    await api(async (call) => {
      assert.equal((await call("PATCH", `/interviews/${interview.id}`, { token, body: { interviewerId: second.id } })).status, 409);
    });
    assert.equal(d.state.interviews.get(interview.id)!.interviewerId, third.id);
  });
});

describe("Batch 3 fix 3: cancelled interviews are read-only", () => {
  function setup() {
    const d = fresh();
    const { token } = tokenFor(d, "HR_ADMIN");
    const other = d.addUser("INTERVIEWER");
    const interview = d.addInterview({ status: "CANCELLED" });

    return { d, token, other, interview };
  }

  const bodies = (otherId: string): [string, Record<string, unknown>][] => [
    ["scheduledAt", { scheduledAt: "2027-01-01T10:00:00.000Z" }],
    ["durationMinutes", { durationMinutes: 90 }],
    ["meetingLink", { meetingLink: "https://meet.example.test/x" }],
    ["notes", { notes: "changed" }],
    ["interviewerId", { interviewerId: otherId }],
    ["status SCHEDULED", { status: "SCHEDULED" }],
    ["status COMPLETED", { status: "COMPLETED" }],
    ["status CANCELLED (no-op)", { status: "CANCELLED" }],
    ["several fields", { notes: "n", scheduledAt: "2027-01-01T10:00:00.000Z", status: "SCHEDULED" }],
  ];

  it("every PATCH is 409 INTERVIEW_CANCELLED and changes nothing", async () => {
    const { d, token, other, interview } = setup();
    const before = JSON.stringify(d.state.interviews.get(interview.id));
    const writes = d.counters.writes;

    await api(async (call) => {
      for (const [label, body] of bodies(other.id)) {
        const res = await call("PATCH", `/interviews/${interview.id}`, { token, body });

        assert.equal(res.status, 409, label);
        assert.equal(res.json.error.code, "INTERVIEW_CANCELLED", label);
      }
    });
    assert.equal(JSON.stringify(d.state.interviews.get(interview.id)), before);
    assert.equal(d.state.auditLog.length, 0);
    assert.equal(d.counters.writes, writes);
  });

  it("DELETE on a cancelled interview stays an idempotent success with no write or audit", async () => {
    const { d, token, interview } = setup();
    const writes = d.counters.writes;

    await api(async (call) => {
      const res = await call("DELETE", `/interviews/${interview.id}`, { token });

      assert.equal(res.status, 200);
      assert.equal(res.json.data.status, "CANCELLED");
    });
    assert.equal(d.counters.writes, writes);
    assert.equal(d.state.auditLog.length, 0);
  });

  it("feedback cannot be submitted on a cancelled interview", async () => {
    const { d, interview } = setup();
    const { token } = tokenFor(d, "INTERVIEWER");
    const before = JSON.stringify(d.state.interviews.get(interview.id));

    await api(async (call) => {
      const res = await call("POST", `/interviews/${interview.id}/feedback`, { token, body: { feedback: "x", score: 50 } });

      assert.ok(res.status >= 400 && res.status < 500, `got ${res.status}`);
    });
    assert.equal(JSON.stringify(d.state.interviews.get(interview.id)), before);
  });

  it("an edit racing with a cancellation: 409 INTERVIEW_CHANGED, the cancelled row is not modified", async () => {
    const d = fresh();
    const { token } = tokenFor(d, "HR_ADMIN");
    const interview = d.addInterview();
    const original = d.client.interview.updateMany;

    d.client.interview.updateMany = async (args: any) => {
      d.state.interviews.get(interview.id)!.status = "CANCELLED";

      return original(args);
    };

    await api(async (call) => {
      const res = await call("PATCH", `/interviews/${interview.id}`, { token, body: { notes: "late edit" } });

      assert.equal(res.status, 409);
      assert.equal(res.json.error.code, "INTERVIEW_CHANGED");
    });
    assert.equal(d.state.interviews.get(interview.id)!.notes, null);
    assert.equal(d.state.auditLog.length, 0);
  });

  it("a scheduled interview can still be edited and cancelled normally", async () => {
    const d = fresh();
    const { token } = tokenFor(d, "HR_ADMIN");
    const interview = d.addInterview();

    await api(async (call) => {
      assert.equal((await call("PATCH", `/interviews/${interview.id}`, { token, body: { notes: "ok", durationMinutes: 45 } })).status, 200);
      assert.equal((await call("PATCH", `/interviews/${interview.id}`, { token, body: { status: "CANCELLED" } })).status, 200);
      assert.equal((await call("PATCH", `/interviews/${interview.id}`, { token, body: { notes: "too late" } })).status, 409);
    });
  });
});

describe("Batch 3 fix 4: feedback unlock authorization", () => {
  function setup() {
    const d = fresh();
    const locked = new Date("2026-10-20T10:00:00Z");
    const interview = d.addInterview({ status: "COMPLETED", feedback: "Good", score: 70, feedbackSubmittedAt: locked, feedbackLockedAt: locked });

    return { d, interview };
  }

  for (const role of ["CAMPUS_COORDINATOR", "CANDIDATE"] as const) {
    it(`${role} (no interviews.feedback permission) is stopped at the route with 403 FORBIDDEN`, async () => {
      const { d, interview } = setup();
      const { token } = tokenFor(d, role);
      const writes = d.counters.writes;

      await api(async (call) => {
        const res = await call("POST", `/interviews/${interview.id}/feedback/unlock`, { token });

        assert.equal(res.status, 403);
        assert.equal(res.json.error.code, "FORBIDDEN");
      });
      assert.ok(d.state.interviews.get(interview.id)!.feedbackLockedAt);
      assert.equal(d.counters.writes, writes);
    });
  }

  for (const role of ["HR_ADMIN", "INTERVIEWER"] as const) {
    it(`${role} passes the route guard but the service still refuses: 403, feedback stays locked`, async () => {
      const { d, interview } = setup();
      const { token } = tokenFor(d, role);
      const writes = d.counters.writes;

      await api(async (call) => {
        const res = await call("POST", `/interviews/${interview.id}/feedback/unlock`, { token });

        assert.equal(res.status, 403);
      });
      assert.ok(d.state.interviews.get(interview.id)!.feedbackLockedAt);
      assert.equal(d.counters.writes, writes);
      assert.equal(d.state.auditLog.length, 0);
    });
  }

  it("no token -> 401", async () => {
    const { interview } = setup();

    await api(async (call) => assert.equal((await call("POST", `/interviews/${interview.id}/feedback/unlock`)).status, 401));
  });

  it("a Super Admin can still unlock", async () => {
    const { d, interview } = setup();
    const { token } = tokenFor(d, "SUPER_ADMIN");

    await api(async (call) => {
      const res = await call("POST", `/interviews/${interview.id}/feedback/unlock`, { token });

      assert.equal(res.status, 200, JSON.stringify(res.json));
    });
    assert.equal(d.state.interviews.get(interview.id)!.feedbackLockedAt, null);
  });
});
