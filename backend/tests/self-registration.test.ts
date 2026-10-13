import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import bcrypt from "bcrypt";
import express from "express";
import { createPerIpLimiter } from "../src/middleware/candidate-rate-limit.middleware.js";
import { createMemoryDb, type MemoryDb } from "./helpers/memory-db.js";
import { api, staff, type Call } from "./helpers/http.js";

const CODE = "ABCD23";
const PASSWORD = "Chosen-Pass-7";
let db: MemoryDb | null = null;
let n = 0;

afterEach(() => {
  db?.restore();
  db = null;
});

function world(over: Record<string, unknown> = {}) {
  const d = (db = createMemoryDb());
  const college = d.addCollege({ name: "Sri Test College" });
  const drive = d.addDrive({ collegeId: college.id, title: "Campus Drive", status: "PUBLISHED", registrationOpen: true, accessCode: CODE, levelAllowed: "BOTH", ...over });

  return { d, college, drive };
}

function body(over: Record<string, unknown> = {}) {
  n += 1;

  return {
    accessCode: CODE,
    name: `Asha Student ${n}`,
    email: `asha${n}@example.test`,
    mobile: `9${String(200000000 + n)}`,
    level: "UG",
    password: PASSWORD,
    consent: true,
    ...over,
  };
}

const register = (call: Call, over: Record<string, unknown> = {}) => call("POST", "/candidate/registration", { body: body(over) });
const loginAs = (call: Call, loginId: string, password = PASSWORD) => call("POST", "/candidate/auth/login", { body: { loginId, password } });

describe("self-registration: drive lookup", () => {
  it("shows only the drive title, college and levels for a valid code", async () => {
    world();

    await api(async (call) => {
      const res = await call("GET", `/candidate/registration/drive?code=${CODE.toLowerCase()}`);

      assert.equal(res.status, 200);
      assert.deepEqual(res.json.data, { title: "Campus Drive", college: "Sri Test College", levels: ["UG", "PG"] });
      assert.equal(JSON.stringify(res.json).includes(CODE), false, "the code is never echoed back");
    });
  });

  it("unknown code 404, malformed code 400, closed registration 409", async () => {
    world();

    await api(async (call) => {
      assert.equal((await call("GET", "/candidate/registration/drive?code=ZZZZZ9")).status, 404);
      assert.equal((await call("GET", "/candidate/registration/drive?code=bad")).status, 400);
      assert.equal((await call("GET", "/candidate/registration/drive")).status, 400);
    });

    db!.restore();
    world({ registrationOpen: false });

    await api(async (call) => {
      const res = await call("GET", `/candidate/registration/drive?code=${CODE}`);

      assert.equal(res.status, 409);
      assert.equal(res.json.error.code, "REGISTRATION_CLOSED");
    });

    db!.restore();
    world({ status: "DRAFT" });

    await api(async (call) => assert.equal((await call("GET", `/candidate/registration/drive?code=${CODE}`)).status, 409));
  });
});

describe("self-registration: creating an application", () => {
  it("registers without a session, hashes the password, records consent and the source", async () => {
    const { d, drive } = world();

    await api(async (call) => {
      const res = await register(call, { qualification: "BCA", department: "CS", city: "Coimbatore", passingYear: new Date().getFullYear() });

      assert.equal(res.status, 201, JSON.stringify(res.json));
      assert.match(res.json.data.loginId, /^WMC-\d{4}-\d{5}$/);
      assert.equal(res.json.data.status, "PENDING_VERIFICATION");
      assert.equal(res.json.data.drive, "Campus Drive");
      assert.equal(res.setCookie.length, 0, "no session cookie");
      assert.equal(JSON.stringify(res.json).match(/accessToken|passwordHash|\$2[aby]\$/), null, "no token or hash in the response");

      const app = d.rows("application")[0]!;
      const cred = d.rows("candidateCredential")[0]!;
      const cand = d.rows("candidate")[0]!;

      assert.equal(app.driveId, drive.id);
      assert.equal(app.status, "REGISTERED");
      assert.equal(app.registeredByUserId ?? null, null);
      assert.equal(app.emailVerifiedAt ?? null, null);
      assert.equal(app.verifiedManuallyByUserId ?? null, null);
      assert.equal(cred.applicationId, app.id);
      assert.notEqual(cred.passwordHash, PASSWORD);
      assert.equal(await bcrypt.compare(PASSWORD, cred.passwordHash), true);
      assert.equal(cred.mustChangePassword, false);
      assert.equal(cred.issuedByUserId ?? null, null);
      assert.ok(cand.consentAt instanceof Date);
      assert.equal(cand.collegeId, drive.collegeId);
      assert.equal(d.rows("applicationStatusHistory")[0]!.note, "Self-registered");
      assert.ok(d.state.auditLog.some((a: any) => a.action === "APPLICATION_SELF_REGISTERED"));
      assert.equal(JSON.stringify(d.state.auditLog).includes(PASSWORD), false, "the password is never audited");
    });
  });

  it("rejects a second registration with the same email or mobile for the drive, without leaking more", async () => {
    const { d } = world();

    await api(async (call) => {
      const first = body();

      assert.equal((await call("POST", "/candidate/registration", { body: first })).status, 201);

      const sameEmail = await register(call, { email: first.email.toUpperCase() });
      const sameMobile = await register(call, { mobile: `+91 ${first.mobile}` });

      for (const res of [sameEmail, sameMobile]) {
        assert.equal(res.status, 409);
        assert.equal(res.json.error.code, "DUPLICATE_APPLICATION");
        assert.equal(JSON.stringify(res.json).includes(first.email), false);
      }

      assert.equal(d.rows("application").length, 1);
      assert.equal(d.rows("candidateCredential").length, 1);
    });
  });

  it("allows the same person to register for a different drive", async () => {
    const { d, college } = world();
    const other = d.addDrive({ collegeId: college.id, status: "PUBLISHED", registrationOpen: true, accessCode: "EFGH45" });

    await api(async (call) => {
      const first = body();

      assert.equal((await call("POST", "/candidate/registration", { body: first })).status, 201);
      assert.equal((await call("POST", "/candidate/registration", { body: { ...first, accessCode: "EFGH45" } })).status, 201);
      assert.equal(d.rows("application").filter((a) => a.driveId === other.id).length, 1);
    });
  });

  it("validates every input and writes nothing when one is wrong", async () => {
    const { d } = world({ levelAllowed: "UG" });
    const year = new Date().getFullYear();
    const cases: [string, Record<string, unknown>][] = [
      ["bad email", { email: "not-an-email" }],
      ["bad mobile", { mobile: "12345" }],
      ["short name", { name: "A" }],
      ["short password", { password: "Ab1" }],
      ["password without a digit", { password: "OnlyLetters" }],
      ["password without a letter", { password: "12345678" }],
      ["password containing the email", { email: "samplestudent@example.test", password: "samplestudent9" }],
      ["no consent", { consent: false }],
      ["consent missing", { consent: undefined }],
      ["level not allowed by the drive", { level: "PG" }],
      ["unknown level", { level: "XX" }],
      ["passing year too far away", { passingYear: year + 20 }],
      ["bad qualification", { qualification: "Wizard" }],
      ["malformed access code", { accessCode: "x" }],
      ["unknown access code", { accessCode: "ZZZZZ9" }],
    ];

    await api(async (call) => {
      for (const [label, over] of cases) {
        const res = await register(call, over);

        assert.ok([400, 404].includes(res.status), `${label}: ${res.status} ${JSON.stringify(res.json)}`);
        assert.equal(res.json.success, false, label);
      }

      assert.equal(d.rows("application").length, 0);
      assert.equal(d.rows("candidate").length, 0);
      assert.equal(d.rows("candidateCredential").length, 0);
    });
  });

  it("refuses registration when the drive is closed or not published", async () => {
    for (const over of [{ registrationOpen: false }, { status: "DRAFT" }, { isActive: false }]) {
      const { d } = world(over);

      await api(async (call) => {
        const res = await register(call);

        assert.equal(res.status, 409, JSON.stringify(over));
        assert.equal(d.rows("application").length, 0);
      });

      db!.restore();
    }
  });

  it("cannot be used to create staff accounts or assign roles", async () => {
    const { d } = world();
    const usersBefore = d.state.users.size;
    const rolesBefore = d.state.userRoles.length;

    await api(async (call) => {
      for (const extra of [{ roles: ["SUPER_ADMIN"] }, { role: "HR_ADMIN" }, { isAdmin: true }, { permissions: ["users.manage"] }, { registeredByUserId: "x" }, { status: "SHORTLISTED" }]) {
        const res = await register(call, extra);

        assert.equal(res.status, 400, JSON.stringify(extra));
      }

      assert.equal((await call("POST", "/users", { body: { name: "X", email: "x@example.test", password: "Passw0rd!x", roles: ["SUPER_ADMIN"] } })).status, 401, "staff endpoints stay closed to the public");
      assert.equal(d.state.users.size, usersBefore);
      assert.equal(d.state.userRoles.length, rolesBefore);
      assert.equal(d.rows("application").length, 0);
    });
  });

  it("never attaches the new application to an existing candidate with the same email", async () => {
    const { d, drive } = world();
    const { candidate: existing } = d.addApplication({ driveId: d.addDrive({ status: "PUBLISHED" }).id }, { email: "known@example.test", name: "Known Person" });
    const coordinator = staff(d, "HR_ADMIN");

    d.insert("applicationCounter", { year: new Date().getFullYear(), lastValue: 1 }); // the fixture application already took number 1
    d.addInterview({ candidateId: existing.id, candidate: { id: existing.id, name: "Known Person", email: "known@example.test" } });

    await api(async (call) => {
      const res = await register(call, { email: "known@example.test" });

      assert.equal(res.status, 201, JSON.stringify(res.json));

      const app = d.rows("application").find((a) => a.driveId === drive.id)!;

      assert.notEqual(app.candidateId, existing.id);

      assert.equal((await call("POST", `/applications/${app.id}/verify`, { token: coordinator.token })).status, 200);

      const login = await loginAs(call, res.json.data.loginId);

      assert.equal(login.status, 200);
      assert.deepEqual((await call("GET", "/candidate/interviews", { token: login.json.data.accessToken })).json.data, []);
    });
  });
});

describe("self-registration: sign-in", () => {
  it("is closed until a coordinator verifies, then works with the chosen password", async () => {
    const { d } = world();
    const hr = staff(d, "HR_ADMIN");

    await api(async (call) => {
      const reg = await register(call);
      const loginId = reg.json.data.loginId as string;

      const wrong = await loginAs(call, loginId, "Wrong-pass-1");

      assert.equal(wrong.status, 401);
      assert.equal(wrong.json.error.code, "INVALID_CREDENTIALS", "a wrong password never reveals the pending state");

      const pending = await loginAs(call, loginId);

      assert.equal(pending.status, 403);
      assert.equal(pending.json.error.code, "REGISTRATION_PENDING_VERIFICATION");
      assert.equal(pending.setCookie.length, 0);
      assert.equal(d.rows("candidateSession").length, 0, "no session was opened");

      const id = d.rows("application")[0]!.id as string;

      assert.equal((await call("POST", `/applications/${id}/verify`, { token: hr.token })).json.data.verified, true);

      const ok = await loginAs(call, loginId.toLowerCase());

      assert.equal(ok.status, 200);
      assert.equal(ok.json.data.user.mustChangePassword, false, "the student already chose their own password");
      assert.equal(ok.json.data.user.applicationNo, loginId);
      assert.match(ok.setCookie[0]!, /^wm_candidate_refresh=.+HttpOnly/i);
      assert.equal(JSON.stringify(ok.json).includes("passwordHash"), false);

      const me = await call("GET", "/candidate/me", { token: ok.json.data.accessToken });

      assert.equal(me.status, 200);
      assert.equal(me.json.data.name.startsWith("Asha Student"), true);
    });
  });

  it("a coordinator-issued credential still replaces the chosen password (staff flow is unchanged)", async () => {
    const { d } = world();
    const hr = staff(d, "HR_ADMIN");

    await api(async (call) => {
      const reg = await register(call);
      const id = d.rows("application")[0]!.id as string;

      await call("POST", `/applications/${id}/verify`, { token: hr.token });

      const issued = await call("POST", `/applications/${id}/credential`, { token: hr.token });

      assert.equal(issued.status, 200);
      assert.equal(issued.json.data.mustChangePassword, true);
      assert.equal((await loginAs(call, reg.json.data.loginId)).status, 401, "the old password no longer works");
      assert.equal((await loginAs(call, reg.json.data.loginId, issued.json.data.temporaryPassword)).status, 200);
    });
  });

  it("the coordinator-managed flow (register, verify, issue, sign in) does not need self-registration", async () => {
    const { d, drive } = world();
    const hr = staff(d, "HR_ADMIN");

    await api(async (call) => {
      const reg = await call("POST", "/applications", { token: hr.token, body: { driveId: drive.id, name: "Staff Registered", email: "sr@example.test", mobile: "9123456780", level: "UG" } });

      assert.equal(reg.status, 201, JSON.stringify(reg.json));
      assert.equal(reg.json.data.selfRegistered, false);

      const id = reg.json.data.id as string;

      assert.equal((await call("POST", `/applications/${id}/credential`, { token: hr.token })).json.error.code, "NOT_VERIFIED");
      await call("POST", `/applications/${id}/verify`, { token: hr.token });

      const issued = await call("POST", `/applications/${id}/credential`, { token: hr.token });
      const login = await loginAs(call, issued.json.data.loginId, issued.json.data.temporaryPassword);

      assert.equal(login.status, 200);
      assert.equal(login.json.data.user.mustChangePassword, true);
    });
  });

  it("the Admin student list marks a self-registered application and shows it unverified", async () => {
    const { d } = world();
    const hr = staff(d, "HR_ADMIN");

    await api(async (call) => {
      await register(call);

      const list = await call("GET", "/applications", { token: hr.token });
      const row = list.json.data[0];

      assert.equal(row.selfRegistered, true);
      assert.equal(row.verified, false);
      assert.equal(row.credentialIssued, true);
    });
  });
});

describe("student access control", () => {
  it("rejects missing, staff and malformed tokens on every student route", async () => {
    const { d } = world();
    const hr = staff(d, "HR_ADMIN");

    await api(async (call) => {
      const routes: [string, string][] = [
        ["GET", "/candidate/me"],
        ["GET", "/candidate/interviews"],
        ["GET", "/candidate/assessment"],
        ["GET", "/candidate/attempts/current"],
        ["POST", "/candidate/auth/change-password"],
      ];

      for (const [method, path] of routes) {
        assert.equal((await call(method, path)).status, 401, `${method} ${path} without a token`);
        assert.equal((await call(method, path, { token: hr.token })).status, 401, `${method} ${path} with a staff token`);
        assert.equal((await call(method, path, { token: "not.a.jwt" })).status, 401, `${method} ${path} with garbage`);
      }
    });
  });

  it("a student token cannot reach staff routes", async () => {
    const { d } = world();
    const hr = staff(d, "HR_ADMIN");

    await api(async (call) => {
      const reg = await register(call);

      await call("POST", `/applications/${d.rows("application")[0]!.id}/verify`, { token: hr.token });

      const token = (await loginAs(call, reg.json.data.loginId)).json.data.accessToken as string;

      for (const path of ["/applications", "/results", "/candidates", "/users", "/questions", "/dashboard/stats", "/interviews"]) {
        assert.ok([401, 403].includes((await call("GET", path, { token })).status), `student token on ${path}`);
      }

      assert.ok([401, 403].includes((await call("POST", "/applications/bulk-status", { token, body: {} })).status));
    });
  });

  it("a student sees only their own profile, interviews and attempt", async () => {
    const { d, drive } = world();
    const hr = staff(d, "HR_ADMIN");

    await api(async (call) => {
      const ids: { loginId: string; token: string; applicationId: string; candidateId: string }[] = [];

      for (const nameOver of ["Alice Student", "Bob Student"]) {
        const reg = await register(call, { name: nameOver });
        const app = d.rows("application").find((a) => a.applicationNo === reg.json.data.loginId)!;

        await call("POST", `/applications/${app.id}/verify`, { token: hr.token });

        const token = (await loginAs(call, reg.json.data.loginId)).json.data.accessToken as string;

        ids.push({ loginId: reg.json.data.loginId, token, applicationId: app.id, candidateId: app.candidateId });
      }

      const [alice, bob] = ids as [typeof ids[0], typeof ids[0]];

      d.addInterview({ candidateId: bob.candidateId, interviewerId: hr.user.id, candidate: { id: bob.candidateId, name: "Bob Student", email: "b@example.test" } });

      const attempt = d.insert("testAttempt", { applicationId: bob.applicationId, templateId: "tpl", startedAt: new Date(), deadline: new Date(Date.now() + 3_600_000), status: "IN_PROGRESS" });

      assert.equal((await call("GET", "/candidate/me", { token: alice.token })).json.data.name, "Alice Student");
      assert.equal((await call("GET", "/candidate/me", { token: bob.token })).json.data.name, "Bob Student");
      assert.deepEqual((await call("GET", "/candidate/interviews", { token: alice.token })).json.data, []);
      assert.equal((await call("GET", "/candidate/interviews", { token: bob.token })).json.data.length, 1);

      for (const [method, path, payload] of [
        ["POST", `/candidate/attempts/${attempt.id}/submit`, { confirm: true }],
        ["PATCH", `/candidate/attempts/${attempt.id}/answers`, { answers: [] }],
        ["POST", `/candidate/attempts/${attempt.id}/events`, { type: "TAB_HIDDEN" }],
      ] as const) {
        const res = await call(method, path, { token: alice.token, body: payload });

        assert.ok(res.status >= 400 && res.status < 500, `${method} ${path}: ${res.status}`);
      }

      assert.equal(d.rows("testAttempt").find((t) => t.id === attempt.id)!.status, "IN_PROGRESS", "Bob's attempt was not touched");
      assert.equal(JSON.stringify((await call("GET", "/candidate/me", { token: alice.token })).json).includes(bob.loginId), false);
      void drive;
    });
  });
});

describe("registration rate limit", () => {
  it("counts every request, per client network", async () => {
    const app = express();

    app.use(createPerIpLimiter(2, 60_000, "RATE_LIMITED", "Too many."));
    app.post("/r", (_req, res) => void res.status(201).json({ ok: true }));

    const server = await new Promise<import("node:http").Server>((resolve) => {
      const s = app.listen(0, "127.0.0.1", () => resolve(s));
    });
    const port = (server.address() as import("node:net").AddressInfo).port;

    try {
      const codes: number[] = [];

      for (let i = 0; i < 3; i += 1) codes.push((await fetch(`http://127.0.0.1:${port}/r`, { method: "POST" })).status);

      assert.deepEqual(codes, [201, 201, 429]);
    } finally {
      server.closeAllConnections();
      server.close();
    }
  });
});
