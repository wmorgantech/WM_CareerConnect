

import assert from "node:assert/strict";
import { Writable } from "node:stream";
import { afterEach, describe, it } from "node:test";
import bcrypt from "bcrypt";
import pino from "pino";
import { canSeeCollege, resolveResultScope } from "../src/domain/college-scope.js";
import { rankAttempts } from "../src/domain/scoring.js";
import { LOG_REDACT } from "../src/lib/log-redaction.js";
import { rolesAllowedForClient } from "../src/lib/portal-roles.js";
import { createMemoryDb, type MemoryDb } from "./helpers/memory-db.js";
import { api, staff } from "./helpers/http.js";

let db: MemoryDb | null = null;

afterEach(() => {
  db?.restore();
  db = null;
});

let seq = 0;

function world() {
  const d = (db = createMemoryDb());
  const collegeX = d.addCollege({ name: "College X" });
  const collegeY = d.addCollege({ name: "College Y" });
  const driveX = d.addDrive({ collegeId: collegeX.id, status: "PUBLISHED", title: "Drive X" });
  const driveY = d.addDrive({ collegeId: collegeY.id, status: "PUBLISHED", title: "Drive Y" });

  const student = (drive: { id: string; collegeId: string }, name: string, over: Record<string, unknown> = {}) => {
    seq += 1;

    return d.addApplication({ driveId: drive.id, level: "UG", applicationNo: `WMC-R-${seq}` }, { name, collegeId: drive.collegeId, ...over });
  };

  const finish = (app: { id: string }, score: number | null, status = "SUBMITTED", extra: Record<string, unknown> = {}) =>
    d.insert("testAttempt", {
      applicationId: app.id,
      templateId: "tpl",
      startedAt: new Date(Date.now() - 3_600_000),
      deadline: new Date(Date.now() - 60_000),
      status,
      submittedAt: new Date(),
      score,
      maxScore: score === null ? null : 60,
      percentage: score === null ? null : (score / 60) * 100,
      ...extra,
    });

  return { d, collegeX, collegeY, driveX, driveY, student, finish };
}

describe("ranking (pure)", () => {
  it("competition ranking by score only: 1, 2, 2, 4", () => {
    const ranks = rankAttempts([{ id: "a", score: 40 }, { id: "b", score: 55 }, { id: "c", score: 55 }, { id: "d", score: 30 }]);

    assert.deepEqual(["b", "c", "a", "d"].map((k) => ranks.get(k)), [1, 1, 3, 4]);
  });
});

describe("college scope (pure)", () => {
  it("Super Admin and HR admin see all; HOD and STAFF only assigned colleges; everyone else nothing", () => {
    assert.deepEqual(resolveResultScope(["SUPER_ADMIN"], []), { kind: "ALL" });
    assert.deepEqual(resolveResultScope(["HR_ADMIN"], []), { kind: "ALL" });
    assert.deepEqual(resolveResultScope(["HOD"], ["c1", "c1", "c2"]), { kind: "COLLEGES", collegeIds: ["c1", "c2"] });
    assert.deepEqual(resolveResultScope(["STAFF"], ["c1"]), { kind: "COLLEGES", collegeIds: ["c1"] });
    assert.deepEqual(resolveResultScope(["HOD"], []), { kind: "NONE" }, "no college assigned: fail closed");

    for (const roles of [["INTERVIEWER"], ["CAMPUS_COORDINATOR"], ["CANDIDATE"], [], ["INTERVIEWER", "CAMPUS_COORDINATOR"]]) {
      assert.deepEqual(resolveResultScope(roles, ["c1"]), { kind: "NONE" }, roles.join());
    }

    const scope = resolveResultScope(["HOD"], ["c1"]);

    assert.equal(canSeeCollege(scope, "c1"), true);
    assert.equal(canSeeCollege(scope, "c2"), false);
    assert.equal(canSeeCollege(scope, null), false, "a record with no college is hidden from scoped users");
  });
});

describe("sign-in portals (pure)", () => {
  it("each portal accepts only its own roles; HOD and STAFF cannot use the generic entry", () => {
    assert.equal(rolesAllowedForClient("admin", ["HR_ADMIN"]), true);
    assert.equal(rolesAllowedForClient("admin", ["HOD"]), false);
    assert.equal(rolesAllowedForClient("hod", ["HOD"]), true);
    assert.equal(rolesAllowedForClient("hod", ["STAFF"]), false);
    assert.equal(rolesAllowedForClient("hod", ["SUPER_ADMIN"]), false);
    assert.equal(rolesAllowedForClient("staff-portal", ["STAFF"]), true);
    assert.equal(rolesAllowedForClient("staff-portal", ["HOD"]), false);
    assert.equal(rolesAllowedForClient("", ["INTERVIEWER"]), true);
    assert.equal(rolesAllowedForClient("", ["HOD"]), false);
    assert.equal(rolesAllowedForClient("mobile", ["STAFF"]), false);
  });
});

describe("results over HTTP", () => {
  it("HOD and STAFF see only their assigned college, in lists, details, ranking and exports", async () => {
    const w = world();
    const x1 = w.student(w.driveX, "Xavier");
    const x2 = w.student(w.driveX, "Xena");
    const y1 = w.student(w.driveY, "Yara");

    w.finish(x1.application, 50);
    w.finish(x2.application, 40);
    w.finish(y1.application, 58);

    const hod = staff(w.d, "HOD");
    const sta = staff(w.d, "STAFF");

    for (const u of [hod, sta]) w.d.insert("userCollege", { userId: u.user.id, collegeId: w.collegeX.id });

    await api(async (call) => {
      for (const { token } of [hod, sta]) {
        const list = await call("GET", "/results", { token });

        assert.equal(list.status, 200);
        assert.deepEqual(list.json.data.map((r: any) => r.name), ["Xavier", "Xena"]);
        assert.equal(JSON.stringify(list.json).includes("Yara"), false);

assert.deepEqual(list.json.data.map((r: any) => r.rank), [1, 2]);

        assert.equal((await call("GET", `/results/${y1.application.id}`, { token })).status, 404, "URL id of another college");
        assert.equal((await call("GET", `/results/${x1.application.id}`, { token })).status, 200);
        assert.equal((await call("GET", `/results?collegeId=${w.collegeY.id}`, { token })).json.data.length, 0);
        assert.equal((await call("GET", `/results?driveId=${w.driveY.id}`, { token })).json.data.length, 0);

        const csv = await call("GET", "/results/export", { token });

        assert.equal(csv.status, 200);
        assert.equal(csv.headers.get("content-type")?.startsWith("text/csv"), true);
        assert.match(csv.text, /Xavier/);
        assert.equal(csv.text.includes("Yara"), false);
      }

      assert.equal(JSON.stringify((await call("GET", "/results/ranking", { token: hod.token })).json).includes("Yara"), false);
    });
    assert.ok(w.d.state.auditLog.some((a) => a.action === "RESULTS_EXPORTED"));
  });

  it("a HOD with no assigned college, an interviewer, a coordinator and a candidate get nothing", async () => {
    const w = world();
    const s = w.student(w.driveX, "Xavier");

    w.finish(s.application, 50);

    const noCollege = staff(w.d, "HOD");
    const interviewer = staff(w.d, "INTERVIEWER");
    const coordinator = staff(w.d, "CAMPUS_COORDINATOR");

    await api(async (call) => {
      assert.equal((await call("GET", "/results", { token: noCollege.token })).status, 403);
      assert.equal((await call("GET", "/results", { token: interviewer.token })).status, 403, "holds results.view but has no scope");
      assert.equal((await call("GET", `/results/${s.application.id}`, { token: interviewer.token })).status, 403);
      assert.equal((await call("GET", "/results/export", { token: interviewer.token })).status, 403);
      assert.equal((await call("GET", "/results", { token: coordinator.token })).status, 403, "no results.view");
      assert.equal((await call("GET", "/results")).status, 401);
    });
    assert.equal(w.d.state.auditLog.length, 0, "no export was recorded for refused requests");
  });

  it("Super Admin and HR admin see every college; Top 10 green, others yellow, unfinished not ranked", async () => {
    const w = world();
    const scores = [60, 58, 58, 55, 54, 53, 52, 51, 50, 49, 49, 49, 40, 30];

    scores.forEach((score, i) => w.finish(w.student(w.driveX, `S${String(i).padStart(2, "0")}`).application, score));
    w.finish(w.student(w.driveX, "Running").application, null, "IN_PROGRESS");
    w.student(w.driveX, "Absent");
    w.finish(w.student(w.driveY, "Other").application, 59);

    const admin = staff(w.d, "SUPER_ADMIN");
    const hr = staff(w.d, "HR_ADMIN");

    await api(async (call) => {
      for (const { token } of [admin, hr]) {
        const list = await call("GET", `/results?driveId=${w.driveX.id}&limit=100`, { token });
        const byName = Object.fromEntries(list.json.data.map((r: any) => [r.name, r]));

        assert.equal(list.json.data.length, 16);
        assert.equal(byName.S00.rank, 1);
        assert.equal(byName.S01.rank, 2);
        assert.equal(byName.S02.rank, 2);
        assert.equal(byName.S03.rank, 4);

        assert.deepEqual(["S09", "S10", "S11"].map((n) => [byName[n].rank, byName[n].highlight]), [[10, "GREEN"], [10, "GREEN"], [10, "GREEN"]]);
        assert.equal(byName.S12.rank, 13);
        assert.equal(byName.S12.highlight, "YELLOW");
        assert.equal(byName.Running.rank, null);
        assert.equal(byName.Running.highlight, null);
        assert.equal(byName.Absent.attemptStatus, "NOT_STARTED");
        assert.equal(byName.Running.score, null, "no score shown for an unfinished attempt");
        assert.equal(list.json.summary.ranked, 14);
        assert.equal(JSON.stringify(list.json).includes("Other"), false, "the other drive is a different ranking");

        const all = await call("GET", "/results?limit=100", { token });

        assert.equal(all.json.data.find((r: any) => r.name === "Other").rank, 1, "ranked within its own drive");
      }

      const ranking = await call("GET", `/results/ranking?driveId=${w.driveX.id}`, { token: admin.token });

      assert.equal(ranking.json.totalRanked, 14);
      assert.ok(ranking.json.data.every((r: any) => r.rank !== null));
    });
  });

  it("fewer than ten ranked students are all green", async () => {
    const w = world();

    [30, 20, 20].forEach((score, i) => w.finish(w.student(w.driveX, `T${i}`).application, score));

    const admin = staff(w.d, "SUPER_ADMIN");

    await api(async (call) => {
      const list = await call("GET", "/results", { token: admin.token });

      assert.deepEqual(list.json.data.map((r: any) => [r.rank, r.highlight]), [[1, "GREEN"], [2, "GREEN"], [2, "GREEN"]]);
    });
  });

  it("detail shows section totals but never answer keys; integrity data only for Super Admin and HR admin", async () => {
    const w = world();
    const s = w.student(w.driveX, "Xavier");
    const attempt = w.finish(s.application, 3, "SUBMITTED", { flaggedForReview: true, integrityEventCount: 3 });
    const { question, options } = w.d.addQuestion({ section: "oop" });

    w.d.insert("attemptQuestion", { attemptId: attempt.id, questionId: question.id, section: "oop", position: 1, optionOrder: options.map((o) => o.id), marks: 3, correctOptionId: options[0]!.id, questionText: "q", optionsSnapshot: [] });
    w.d.insert("attemptAnswer", { attemptId: attempt.id, questionId: question.id, selectedOptionId: options[0]!.id });
    w.d.insert("integrityEvent", { attemptId: attempt.id, type: "TAB_HIDDEN" });

    const hr = staff(w.d, "HR_ADMIN");
    const hod = staff(w.d, "HOD");

    w.d.insert("userCollege", { userId: hod.user.id, collegeId: w.collegeX.id });

    await api(async (call) => {
      const asHr = await call("GET", `/results/${s.application.id}`, { token: hr.token });
      const asHod = await call("GET", `/results/${s.application.id}`, { token: hod.token });

      assert.deepEqual(asHr.json.data.sections, [{ key: "oop", title: "OOPs", score: 3, max: 3, answered: 1, correct: 1 }]);
      assert.equal(asHr.json.data.flaggedForReview, true);
      assert.equal(asHr.json.data.integrityEvents.length, 1);
      assert.equal(asHod.json.data.flaggedForReview, null);
      assert.equal(asHod.json.data.integrityEvents, null);
      assert.equal(JSON.stringify([asHr.json, asHod.json]).includes("correctOptionId"), false);
      assert.equal(JSON.stringify([asHr.json, asHod.json]).includes(options[0]!.id), false);
    });
  });

  it("the CSV export neutralises spreadsheet formulas in names", async () => {
    const w = world();

    w.finish(w.student(w.driveX, "=HYPERLINK(\"http://evil\")").application, 10);

    const admin = staff(w.d, "SUPER_ADMIN");

    await api(async (call) => {
      const text = (await call("GET", "/results/export", { token: admin.token })).text;

      assert.match(text, /"'=HYPERLINK/);
    });
  });
});

describe("role-specific sign-in over HTTP", () => {
  const PASSWORD = "Correct-Horse-1";
  const hash = bcrypt.hashSync(PASSWORD, 4);

  it("HOD and STAFF sign in only through their own portal; others cannot use those portals", async () => {
    const d = (db = createMemoryDb());
    const hod = d.addUser("HOD", { passwordHash: hash });
    const sta = d.addUser("STAFF", { passwordHash: hash });
    const hr = d.addUser("HR_ADMIN", { passwordHash: hash });
    const attempt = (call: any, user: any, client?: string) =>
      call("POST", "/auth/login", { body: { email: user.email, password: PASSWORD }, headers: client ? { "X-WM-Client": client } : {} });

    await api(async (call) => {
      const good = await attempt(call, hod, "hod");

      assert.equal(good.status, 200);
      assert.ok(good.setCookie[0]!.startsWith("wm_hod_refresh="));
      assert.deepEqual(good.json.data.user.roles, ["HOD"]);
      assert.deepEqual(good.json.data.user.permissions, ["results.view"]);

      const goodStaff = await attempt(call, sta, "staff-portal");

      assert.equal(goodStaff.status, 200);
      assert.ok(goodStaff.setCookie[0]!.startsWith("wm_staffportal_refresh="));
      assert.equal((await attempt(call, hr, "admin")).status, 200);

      const sessionsBefore = d.state.sessions.size;

assert.equal((await attempt(call, hod, "admin")).json.error.code, "WRONG_PORTAL");
      assert.equal((await attempt(call, hr, "hod")).json.error.code, "WRONG_PORTAL");
      assert.equal((await attempt(call, hod)).json.error.code, "WRONG_PORTAL");
      assert.equal((await attempt(call, sta, "hod")).json.error.code, "WRONG_PORTAL");
      assert.equal(d.state.sessions.size, sessionsBefore, "a refused sign-in creates no session");

const cookie = good.setCookie[0]!.split(";")[0]!;

      assert.equal((await call("POST", "/auth/refresh", { headers: { "X-WM-Client": "hod", Cookie: cookie } })).status, 200);
    });
  });

  it("a HOD or STAFF session refreshes only through its own portal; any other client finds no session", async () => {
    const d = (db = createMemoryDb());
    const hod = d.addUser("HOD", { passwordHash: hash });
    const sta = d.addUser("STAFF", { passwordHash: hash });

    await api(async (call) => {
      const signIn = (user: any, client: string) =>
        call("POST", "/auth/login", { body: { email: user.email, password: PASSWORD }, headers: { "X-WM-Client": client } });
      const hodCookie = (await signIn(hod, "hod")).setCookie[0]!.split(";")[0]!;
      const staffCookie = (await signIn(sta, "staff-portal")).setCookie[0]!.split(";")[0]!;

      for (const client of ["admin", "staff-portal"]) {
        const res = await call("POST", "/auth/refresh", { headers: { "X-WM-Client": client, Cookie: hodCookie } });

        assert.equal(res.status, 401, `HOD cookie through ${client}`);
        assert.equal(res.json.error.code, "REFRESH_TOKEN_MISSING");
      }

      for (const client of ["admin", "hod"]) {
        const res = await call("POST", "/auth/refresh", { headers: { "X-WM-Client": client, Cookie: staffCookie } });

        assert.equal(res.status, 401, `STAFF cookie through ${client}`);
        assert.equal(res.json.error.code, "REFRESH_TOKEN_MISSING");
      }

      assert.equal((await call("POST", "/auth/refresh", { headers: { "X-WM-Client": "staff-portal", Cookie: staffCookie } })).status, 200);
    });
  });
});

describe("college assignment", () => {
  it("only the Super Admin assigns colleges, and only to HOD or STAFF accounts", async () => {
    const w = world();
    const admin = staff(w.d, "SUPER_ADMIN");
    const hr = staff(w.d, "HR_ADMIN");
    const hod = staff(w.d, "HOD");
    const coordinator = staff(w.d, "CAMPUS_COORDINATOR");

    await api(async (call) => {
      const url = (id: string) => `/users/${id}/colleges`;

      assert.equal((await call("PUT", url(hod.user.id), { token: hr.token, body: { collegeIds: [w.collegeX.id] } })).status, 403);
      assert.equal((await call("PUT", url(coordinator.user.id), { token: admin.token, body: { collegeIds: [w.collegeX.id] } })).json.error.code, "NOT_COLLEGE_SCOPED");
      assert.equal((await call("PUT", url(hod.user.id), { token: admin.token, body: { collegeIds: ["2f2c0c8c-0000-4000-8000-000000000000"] } })).json.error.code, "COLLEGE_NOT_FOUND");

      const set = await call("PUT", url(hod.user.id), { token: admin.token, body: { collegeIds: [w.collegeX.id, w.collegeX.id] } });

      assert.deepEqual(set.json.data, [{ collegeId: w.collegeX.id, name: "College X" }]);
      assert.equal((await call("PUT", url(hod.user.id), { token: admin.token, body: { collegeIds: [w.collegeY.id] } })).json.data[0].name, "College Y", "replaces the set");
      assert.equal((await call("GET", url(hod.user.id), { token: admin.token })).json.data.length, 1);
      assert.equal((await call("PUT", url(hod.user.id), { token: admin.token, body: { collegeIds: [] } })).json.data.length, 0);
    });
    assert.ok(w.d.state.auditLog.some((a) => a.action === "USER_COLLEGES_UPDATED"));
  });
});

describe("college assignment when creating an account", () => {
  const PASSWORD = "Correct-Horse-1";

  it("a HOD account is created with its colleges in one step, repeats ignored, and the audit entry holds only the count", async () => {
    const w = world();
    const admin = staff(w.d, "SUPER_ADMIN");

    await api(async (call) => {
      const res = await call("POST", "/users", {
        token: admin.token,
        body: { email: "hod1@example.test", name: "Head Of Dept", password: PASSWORD, roleIds: [w.d.roleId("HOD")], collegeIds: [w.collegeX.id, w.collegeX.id, w.collegeY.id] },
      });

      assert.equal(res.status, 201);

      const userId = res.json.data.user.id;
      const links = w.d.rows("userCollege").filter((l) => l.userId === userId);

      assert.deepEqual(links.map((l) => l.collegeId).sort(), [w.collegeX.id, w.collegeY.id].sort());

      const audit = w.d.state.auditLog.find((a) => a.action === "USER_CREATED");

      assert.ok(audit, "USER_CREATED was audited");
      assert.equal(JSON.parse(audit!.details).colleges, 2);
      assert.equal(JSON.stringify(audit).includes(PASSWORD), false);
    });
  });

  it("collegeIds is optional, and refused for roles that have no college scope", async () => {
    const w = world();
    const admin = staff(w.d, "SUPER_ADMIN");

    await api(async (call) => {
      const plain = await call("POST", "/users", { token: admin.token, body: { email: "staff1@example.test", name: "Staff One", password: PASSWORD, roleIds: [w.d.roleId("STAFF")] } });

      assert.equal(plain.status, 201, "no colleges is still allowed");
      assert.equal(w.d.rows("userCollege").length, 0);

      const wrong = await call("POST", "/users", { token: admin.token, body: { email: "hr1@example.test", name: "Hr One", password: PASSWORD, roleIds: [w.d.roleId("HR_ADMIN")], collegeIds: [w.collegeX.id] } });

      assert.equal(wrong.status, 400);
      assert.equal(wrong.json.error.code, "NOT_COLLEGE_SCOPED");
      assert.equal([...w.d.state.users.values()].some((u) => u.email === "hr1@example.test"), false, "nothing created");

      const bad = await call("POST", "/users", { token: admin.token, body: { email: "hod2@example.test", name: "Hod Two", password: PASSWORD, roleIds: [w.d.roleId("HOD")], collegeIds: ["not-a-uuid"] } });

      assert.equal(bad.status, 400);
    });
  });

  it("an unknown, inactive or deleted college is refused and no account is created", async () => {
    const w = world();
    const admin = staff(w.d, "SUPER_ADMIN");
    const inactive = w.d.addCollege({ name: "Closed", isActive: false });
    const deleted = w.d.addCollege({ name: "Gone", deletedAt: new Date() });

    await api(async (call) => {
      for (const collegeId of [inactive.id, deleted.id, "2f2c0c8c-0000-4000-8000-000000000000"]) {
        const res = await call("POST", "/users", { token: admin.token, body: { email: "hod3@example.test", name: "Hod Three", password: PASSWORD, roleIds: [w.d.roleId("HOD")], collegeIds: [w.collegeX.id, collegeId] } });

        assert.equal(res.status, 400);
        assert.equal(res.json.error.code, "COLLEGE_NOT_FOUND");
      }
    });
    assert.equal([...w.d.state.users.values()].some((u) => u.email === "hod3@example.test"), false);
    assert.equal(w.d.rows("userCollege").length, 0);
  });
});

describe("a college that was deactivated after it was assigned", () => {
  it("can be kept or removed by an admin, while newly added colleges must still be active", async () => {
    const w = world();
    const admin = staff(w.d, "SUPER_ADMIN");
    const hod = staff(w.d, "HOD");
    const closed = w.d.addCollege({ name: "Closed Later" });
    const other = w.d.addCollege({ name: "Other Closed", isActive: false });

    await api(async (call) => {
      const url = `/users/${hod.user.id}/colleges`;

      assert.equal((await call("PUT", url, { token: admin.token, body: { collegeIds: [w.collegeX.id, closed.id] } })).status, 200);

      closed.isActive = false;

      const listed = await call("GET", url, { token: admin.token });

      assert.deepEqual(listed.json.data.map((l: any) => l.collegeId).sort(), [w.collegeX.id, closed.id].sort(), "still listed with its name");

      const kept = await call("PUT", url, { token: admin.token, body: { collegeIds: [closed.id, w.collegeY.id] } });

      assert.equal(kept.status, 200, "the inactive college is kept and an active one added");
      assert.deepEqual(kept.json.data.map((l: any) => l.collegeId).sort(), [closed.id, w.collegeY.id].sort());

      const added = await call("PUT", url, { token: admin.token, body: { collegeIds: [closed.id, other.id] } });

      assert.equal(added.status, 400, "a new inactive college is still refused");
      assert.equal(added.json.error.code, "COLLEGE_NOT_FOUND");
      assert.equal(w.d.rows("userCollege").filter((l) => l.userId === hod.user.id).length, 2, "refusal changed nothing");

      const removed = await call("PUT", url, { token: admin.token, body: { collegeIds: [w.collegeY.id] } });

      assert.equal(removed.status, 200);
      assert.deepEqual(removed.json.data.map((l: any) => l.collegeId), [w.collegeY.id], "the inactive college is gone");

      // once removed, an inactive college counts as new and cannot be added back
      assert.equal((await call("PUT", url, { token: admin.token, body: { collegeIds: [w.collegeY.id, closed.id] } })).status, 400);
    });
  });
});

describe("placement views for the college portals", () => {
  function placementWorld() {
    const w = world();
    let n = 0;
    const add = (drive: { id: string; collegeId: string }, name: string, status: string, score: number | null, attempt: "SUBMITTED" | "IN_PROGRESS" | null = score === null ? null : "SUBMITTED") => {
      n += 1;

      const made = w.d.addApplication({ driveId: drive.id, level: "UG", applicationNo: `WMC-P-${n}`, status }, { name, collegeId: drive.collegeId });

      if (attempt) w.finish(made.application, attempt === "SUBMITTED" ? score : null, attempt, attempt === "IN_PROGRESS" ? { submittedAt: null } : {});

      return made.application;
    };

    add(w.driveX, "Anu Registered", "REGISTERED", null);
    add(w.driveX, "Bala Taking Test", "TEST_IN_PROGRESS", null, "IN_PROGRESS");
    add(w.driveX, "Ira Awaiting", "TEST_SUBMITTED", 35);
    add(w.driveX, "Chitra Shortlisted", "SHORTLISTED", 50);
    add(w.driveX, "Dev Rejected", "REJECTED", 10);

    const eve = add(w.driveX, "Eve Scheduled", "INTERVIEW_SCHEDULED", 52);

    add(w.driveX, "Farah Selected", "SELECTED", 58);

    const gita = add(w.driveX, "Gita Turned Down", "REJECTED", 45);

    add(w.driveX, "Hari On Hold", "ON_HOLD", 47);
    add(w.driveY, "Yara Elsewhere", "SELECTED", 59);

    w.d.addInterview({ candidateId: "c", applicationId: eve.id, roundName: "Technical", status: "SCHEDULED", scheduledAt: new Date(Date.now() + 86_400_000) });
    w.d.addInterview({ candidateId: "c", applicationId: gita.id, roundName: "HR", status: "COMPLETED", scheduledAt: new Date(Date.now() - 86_400_000) });
    w.d.insert("applicationStatusHistory", { applicationId: gita.id, fromStatus: "TEST_SUBMITTED", toStatus: "SHORTLISTED" });

    const hod = staff(w.d, "HOD");
    const sta = staff(w.d, "STAFF");

    for (const u of [hod, sta]) w.d.insert("userCollege", { userId: u.user.id, collegeId: w.collegeX.id });

    return { ...w, hod, sta };
  }

  it("the overview counts only the assigned college, using the stored status and history", async () => {
    const w = placementWorld();

    await api(async (call) => {
      for (const { token } of [w.hod, w.sta]) {
        const res = await call("GET", "/results/placement/overview", { token });

        assert.equal(res.status, 200);
        assert.deepEqual(res.json.data, {
          registered: 9,
          assessmentAttended: 8,
          assessmentCompleted: 7,
          qualified: 5,
          notQualified: 1,
          assessmentPending: 3,
          interviewShortlisted: 4,
          finalSelected: 1,
          finalNotSelected: 1,
          finalPending: 3,
        });
        assert.equal(res.json.data.qualified, res.json.data.finalSelected + res.json.data.finalNotSelected + res.json.data.finalPending);
      }

      const admin = staff(w.d, "HR_ADMIN");

      assert.equal((await call("GET", "/results/placement/overview", { token: admin.token })).json.data.registered, 10, "HR admin sees every college");
    });
  });

  it("assessment results show marks and Qualified / Not Qualified / Pending", async () => {
    const w = placementWorld();

    await api(async (call) => {
      const res = await call("GET", "/results/placement/assessment?limit=100", { token: w.hod.token });
      const by = Object.fromEntries(res.json.data.map((r: any) => [r.name, r]));

      assert.equal(res.json.pagination.total, 9);
      assert.equal(by["Chitra Shortlisted"].decision, "QUALIFIED");
      assert.equal(by["Chitra Shortlisted"].score, 50);
      assert.equal(by["Chitra Shortlisted"].applicationNo.startsWith("WMC-P-"), true);
      assert.equal(by["Dev Rejected"].decision, "NOT_QUALIFIED");
      assert.equal(by["Gita Turned Down"].decision, "QUALIFIED", "rejected only after being shortlisted and interviewed");
      assert.equal(by["Ira Awaiting"].decision, "PENDING");
      assert.equal(by["Anu Registered"].decision, "PENDING");
      assert.equal(by["Anu Registered"].score, null, "no marks are invented for a student who never started");
      assert.equal(by["Anu Registered"].attemptStatus, "NOT_STARTED");
      assert.equal(by["Bala Taking Test"].score, null, "no marks while the test is running");

      const only = await call("GET", "/results/placement/assessment?decision=NOT_QUALIFIED", { token: w.hod.token });

      assert.deepEqual(only.json.data.map((r: any) => r.name), ["Dev Rejected"]);
    });
  });

  it("the interview shortlist holds students shortlisted for interview and not rejected, with round and status where recorded", async () => {
    const w = placementWorld();

    await api(async (call) => {
      const res = await call("GET", "/results/placement/interviews?limit=100", { token: w.sta.token });
      const by = Object.fromEntries(res.json.data.map((r: any) => [r.name, r]));

      assert.deepEqual(Object.keys(by).sort(), ["Chitra Shortlisted", "Eve Scheduled", "Farah Selected", "Hari On Hold"].sort(), "everyone shortlisted for interview and not rejected; rejected students are not listed");
      assert.equal(by["Farah Selected"].applicationStatus, "SELECTED");
      assert.equal(by["Eve Scheduled"].round, "Technical");
      assert.equal(by["Eve Scheduled"].interviewStatus, "SCHEDULED");
      assert.equal(by["Chitra Shortlisted"].round, null, "no round is shown when none is recorded");
      assert.equal(by["Chitra Shortlisted"].interviewStatus, null);
      assert.equal(by["Chitra Shortlisted"].interviews, 0);
    });
  });

  it("final results show Selected, Not Selected and Pending for qualified students only", async () => {
    const w = placementWorld();

    await api(async (call) => {
      const res = await call("GET", "/results/placement/final?limit=100", { token: w.hod.token });
      const by = Object.fromEntries(res.json.data.map((r: any) => [r.name, r.decision]));

      assert.deepEqual(by, {
        "Chitra Shortlisted": "PENDING",
        "Eve Scheduled": "PENDING",
        "Farah Selected": "SELECTED",
        "Gita Turned Down": "NOT_SELECTED",
        "Hari On Hold": "PENDING",
      });
      assert.deepEqual((await call("GET", "/results/placement/final?decision=SELECTED", { token: w.hod.token })).json.data.map((r: any) => r.name), ["Farah Selected"]);
    });
  });

  it("no endpoint reveals another college, even by filter, and the views are read-only", async () => {
    const w = placementWorld();

    await api(async (call) => {
      const writes = w.d.counters.writes;

      for (const path of ["overview", "assessment", "interviews", "final"]) {
        for (const { token } of [w.hod, w.sta]) {
          const plain = await call("GET", `/results/placement/${path}?limit=100`, { token });
          const other = await call("GET", `/results/placement/${path}?collegeId=${w.collegeY.id}`, { token });
          const driveY = await call("GET", `/results/placement/${path}?driveId=${w.driveY.id}`, { token });

          assert.equal(JSON.stringify(plain.json).includes("Yara"), false, path);
          assert.equal(JSON.stringify(other.json).includes("Yara"), false, path);
          assert.equal(other.json.data.registered ?? other.json.data.length, 0, `${path} filtered to another college`);
          assert.equal(driveY.json.data.registered ?? driveY.json.data.length, 0, `${path} filtered to another college's drive`);
        }

        assert.equal((await call("POST", `/results/placement/${path}`, { token: w.hod.token, body: {} })).status, 404, "no write route");
        assert.equal((await call("PATCH", `/results/placement/${path}`, { token: w.hod.token, body: {} })).status, 404);
      }

      assert.equal(w.d.counters.writes, writes, "nothing was written");
    });
  });

  it("an account with no college, an interviewer, a coordinator, a candidate and an anonymous caller get nothing", async () => {
    const w = placementWorld();
    const lone = staff(w.d, "HOD");
    const others = (["INTERVIEWER", "CAMPUS_COORDINATOR", "CANDIDATE"] as const).map((role) => staff(w.d, role));

    await api(async (call) => {
      for (const path of ["overview", "assessment", "interviews", "final"]) {
        assert.equal((await call("GET", `/results/placement/${path}`, { token: lone.token })).status, 403, `${path} HOD with no college`);

        for (const { token } of others) assert.equal((await call("GET", `/results/placement/${path}`, { token })).status, 403, path);

        assert.equal((await call("GET", `/results/placement/${path}`)).status, 401, path);
      }
    });
  });
});

describe("logging", () => {
  it("redacts authorization, cookie and set-cookie headers and secrets", () => {
    const lines: string[] = [];
    const stream = new Writable({ write(chunk, _enc, done) { lines.push(String(chunk)); done(); } });
    const log = pino({ redact: LOG_REDACT }, stream);

    log.info({
      req: { headers: { authorization: "Bearer SECRET-TOKEN", cookie: "wm_candidate_refresh=SECRET-COOKIE", accept: "json" } },
      res: { headers: { "set-cookie": ["wm_refresh_token=SECRET-SET"] } },
      body: { password: "SECRET-PASSWORD", temporaryPassword: "SECRET-TEMP" },
    }, "request");

    const out = lines.join("");

    for (const secret of ["SECRET-TOKEN", "SECRET-COOKIE", "SECRET-SET", "SECRET-PASSWORD", "SECRET-TEMP"]) {
      assert.equal(out.includes(secret), false, secret);
    }

    assert.match(out, /"accept":"json"/);
  });
});
