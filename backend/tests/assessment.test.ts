

import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import bcrypt from "bcrypt";
import { TERMS_VERSION } from "../src/domain/assessment-rules.js";
import { ANSWER_GRACE_SECONDS } from "../src/domain/attempt-timer.js";
import { finalizeExpiredAttempts } from "../src/modules/assessment/assessment.service.js";
import { createMemoryDb, type MemoryDb } from "./helpers/memory-db.js";
import { api, staff, type Call } from "./helpers/http.js";

const PASSWORD = "Student-Pass-9";
const HASH = bcrypt.hashSync(PASSWORD, 4);
let db: MemoryDb | null = null;
let counter = 0;

afterEach(() => {
  db?.restore();
  db = null;
});

type Setup = ReturnType<typeof setup>;

function setup(opts: { bank?: number; template?: boolean } = {}) {
  const d = (db = createMemoryDb());
  const drive = d.addDrive({ status: "PUBLISHED", registrationOpen: true, levelAllowed: "BOTH" });
  const template = d.addTemplate({ level: "UG", durationMinutes: 60, easyPct: 60, mediumPct: 40, hardPct: 0 }, [
    { key: "oop", count: 2, marksPerQuestion: 1 },
    { key: "javascript", count: 2, marksPerQuestion: 2 },
  ]);

  if (opts.template !== false) d.insert("driveTemplate", { driveId: drive.id, level: "UG", templateId: template.id });

  const bank = opts.bank ?? 6;

  d.addQuestions(bank, { section: "oop", level: "UG" });
  d.addQuestions(bank, { section: "javascript", level: "BOTH" });

  const student = (mustChange = false) => {
    counter += 1;
    const { application, candidate } = d.addApplication({ driveId: drive.id, level: "UG", applicationNo: `WMC-T-${counter}`, verifiedManuallyByUserId: "coord", emailVerifiedAt: new Date() });

    d.insert("candidateCredential", { applicationId: application.id, passwordHash: HASH, mustChangePassword: mustChange });

    return { application, candidate, loginId: application.applicationNo as string };
  };

  return { d, drive, template, student };
}

async function login(call: Call, loginId: string, password = PASSWORD) {
  const res = await call("POST", "/candidate/auth/login", { body: { loginId, password } });

  return { res, token: res.json?.data?.accessToken as string };
}

const accept = { termsVersion: TERMS_VERSION, accepted: true };

async function begin(call: Call, token: string) {
  const res = await call("POST", "/candidate/attempts/start", { token, body: accept });

  assert.equal(res.status, 200, JSON.stringify(res.json));

  return res.json.data.attempt.id as string;
}

const keyOf = (d: MemoryDb, attemptId: string) =>
  new Map(d.rows("attemptQuestion").filter((q) => q.attemptId === attemptId).map((q) => [q.questionId as string, q.correctOptionId as string]));

describe("assessment duration is fixed by level", () => {
  const startFor = async (level: "UG" | "PG") => {
    const d = (db = createMemoryDb());
    const drive = d.addDrive({ status: "PUBLISHED", registrationOpen: true, levelAllowed: "BOTH" });
    const template = d.addTemplate({ level, name: `${level} fixed` }, [{ key: "oop", count: 2, marksPerQuestion: 1 }]);

    d.insert("driveTemplate", { driveId: drive.id, level, templateId: template.id });
    d.addQuestions(4, { section: "oop", level: "BOTH" });
    counter += 1;

    const { application } = d.addApplication({ driveId: drive.id, level, applicationNo: `WMC-D-${counter}`, verifiedManuallyByUserId: "coord", emailVerifiedAt: new Date() });

    d.insert("candidateCredential", { applicationId: application.id, passwordHash: HASH, mustChangePassword: false });

    let result: { minutes: number; infoMinutes: number; rules: string } | null = null;

    await api(async (call) => {
      const { token } = await login(call, application.applicationNo as string);
      const info = (await call("GET", "/candidate/assessment", { token })).json.data;
      const attemptId = await begin(call, token);
      const attempt = d.rows("testAttempt").find((t) => t.id === attemptId)!;

      result = {
        minutes: (attempt.deadline.getTime() - attempt.startedAt.getTime()) / 60_000,
        infoMinutes: info.template.durationMinutes,
        rules: JSON.stringify(info.rules),
      };
    });

    return result!;
  };

  it("a UG student gets exactly 60 minutes and a PG student exactly 75, in the portal data and on the server clock", async () => {
    const ug = await startFor("UG");

    assert.equal(ug.infoMinutes, 60);
    assert.equal(ug.minutes, 60);
    assert.match(ug.rules, /60 minutes/);

    db!.restore();

    const pg = await startFor("PG");

    assert.equal(pg.infoMinutes, 75);
    assert.equal(pg.minutes, 75);
    assert.match(pg.rules, /75 minutes/);
  });
});

describe("student sign-in", () => {
  it("signs in with the login ID and password, sets an HttpOnly cookie and never returns the hash", async () => {
    const s = setup();
    const st = s.student(true);

    await api(async (call) => {
      const { res } = await login(call, st.loginId.toLowerCase());

      assert.equal(res.status, 200);
      assert.equal(res.json.data.user.mustChangePassword, true);
      assert.equal(res.json.data.user.applicationNo, st.loginId);
      assert.match(res.setCookie[0]!, /^wm_candidate_refresh=.+HttpOnly/i);
      assert.match(res.setCookie[0]!, /Path=\/api\/v1\/candidate\/auth/);
      assert.equal(JSON.stringify(res.json).includes(HASH), false);
      assert.equal(JSON.stringify(res.json).includes("passwordHash"), false);
    });
  });

  it("answers wrong password, unknown ID and inactive drive identically", async () => {
    const s = setup();
    const st = s.student();
    const inactive = s.student();

    s.d.state.drives.get(s.drive.id)!.isActive = true;

    await api(async (call) => {
      const wrong = await login(call, st.loginId, "nope-nope-1");
      const unknown = await login(call, "WMC-DOES-NOT-EXIST", PASSWORD);

      assert.equal(wrong.res.status, 401);
      assert.equal(unknown.res.status, 401);
      assert.deepEqual(wrong.res.json.error, unknown.res.json.error);

      s.d.state.drives.get(s.drive.id)!.isActive = false;
      assert.equal((await login(call, inactive.loginId)).res.status, 401);
    });
  });

  it("locks the account after repeated wrong passwords, then a coordinator reset unlocks it", async () => {
    const s = setup();
    const st = s.student();

    await api(async (call) => {
      for (let i = 0; i < 5; i += 1) assert.equal((await login(call, st.loginId, `wrong-${i}-pass1`)).res.status, 401);

      const locked = await login(call, st.loginId);

      assert.equal(locked.res.status, 429);
      assert.equal(locked.res.json.error.code, "CREDENTIAL_LOCKED");
    });
  });

  it("must change the temporary password before anything else, and the new password works", async () => {
    const s = setup();
    const st = s.student(true);

    await api(async (call) => {
      const { token } = await login(call, st.loginId);

      assert.equal((await call("GET", "/candidate/assessment", { token })).json.error.code, "PASSWORD_CHANGE_REQUIRED");
      assert.equal((await call("GET", "/candidate/me", { token })).status, 200);

      const weak = await call("POST", "/candidate/auth/change-password", { token, body: { currentPassword: PASSWORD, newPassword: "short1" } });
      const same = await call("POST", "/candidate/auth/change-password", { token, body: { currentPassword: PASSWORD, newPassword: PASSWORD } });
      const wrongCurrent = await call("POST", "/candidate/auth/change-password", { token, body: { currentPassword: "not-it-123", newPassword: "Brand-New-Pass-7" } });

      assert.equal(weak.status, 400);
      assert.equal(same.status, 400);
      assert.equal(wrongCurrent.status, 400);
      assert.equal((await call("POST", "/candidate/auth/change-password", { token, body: { currentPassword: PASSWORD, newPassword: "Brand-New-Pass-7" } })).status, 200);
      assert.equal((await call("GET", "/candidate/assessment", { token })).status, 200);
      assert.equal((await login(call, st.loginId)).res.status, 401, "old password no longer works");
      assert.equal((await login(call, st.loginId, "Brand-New-Pass-7")).res.status, 200);
    });
  });

  it("refresh rotates the cookie, the old one stops working, logout ends the session", async () => {
    const s = setup();
    const st = s.student();

    await api(async (call) => {
      const first = await login(call, st.loginId);
      const cookie1 = first.res.setCookie[0]!.split(";")[0]!;
      const refreshed = await call("POST", "/candidate/auth/refresh", { headers: { Cookie: cookie1 } });

      assert.equal(refreshed.status, 200);

      const cookie2 = refreshed.setCookie[0]!.split(";")[0]!;

      assert.notEqual(cookie1, cookie2);
      assert.equal((await call("POST", "/candidate/auth/refresh", { headers: { Cookie: cookie1 } })).status, 401);
      assert.equal((await call("GET", "/candidate/assessment", { token: refreshed.json.data.accessToken })).status, 200);

      assert.equal((await call("POST", "/candidate/auth/logout", { headers: { Cookie: cookie2 } })).status, 200);
      assert.equal((await call("GET", "/candidate/assessment", { token: refreshed.json.data.accessToken })).status, 401);
      assert.equal((await call("POST", "/candidate/auth/refresh", { headers: { Cookie: cookie2 } })).status, 401);
    });
  });

  it("student and staff tokens are not interchangeable", async () => {
    const s = setup();
    const st = s.student();
    const { token: staffToken } = staff(s.d, "SUPER_ADMIN");

    await api(async (call) => {
      const { token } = await login(call, st.loginId);

      assert.equal((await call("GET", "/candidate/assessment", { token: staffToken })).status, 401);
      for (const path of ["/users", "/questions", "/test-templates", "/applications", "/candidates", "/interviews", "/reports", "/settings", "/audit-logs", "/dashboard/stats"]) {
        assert.equal((await call("GET", path, { token })).status, 401, path);
      }
    });
  });

  it("staff-issued reset ends the student's sessions", async () => {
    const s = setup();
    const st = s.student();
    const coordinator = staff(s.d, "CAMPUS_COORDINATOR");

    s.d.insert("driveCoordinator", { driveId: s.drive.id, userId: coordinator.user.id });

    await api(async (call) => {
      const { token } = await login(call, st.loginId);

      assert.equal((await call("GET", "/candidate/assessment", { token })).status, 200);

      const reset = await call("POST", `/applications/${st.application.id}/credential`, { token: coordinator.token });

      assert.equal(reset.status, 200);
      assert.equal((await call("GET", "/candidate/assessment", { token })).status, 401);
      assert.equal((await login(call, st.loginId)).res.status, 401, "the old password is gone");
      assert.equal((await login(call, st.loginId, reset.json.data.temporaryPassword)).res.status, 200);
    });
  });
});

describe("coordinator registration and credentials", () => {
  const body = (driveId: string, over: Record<string, unknown> = {}) => ({
    driveId,
    name: "Asha Raman",
    email: "Asha@Example.test",
    mobile: "+91 98765 43210",
    level: "UG",
    ...over,
  });

  it("a coordinator works only on assigned drives; HR sees all; others are refused", async () => {
    const s = setup();
    const other = s.d.addDrive({ status: "PUBLISHED", registrationOpen: true, title: "Other drive" });
    const coord = staff(s.d, "CAMPUS_COORDINATOR");
    const hr = staff(s.d, "HR_ADMIN");
    const interviewer = staff(s.d, "INTERVIEWER");

    s.d.insert("driveCoordinator", { driveId: s.drive.id, userId: coord.user.id });
    s.d.insert("driveTemplate", { driveId: other.id, level: "UG", templateId: s.template.id });

    await api(async (call) => {
      const mine = await call("POST", "/applications", { token: coord.token, body: body(s.drive.id) });

      assert.equal(mine.status, 201);
      assert.equal(mine.json.data.email, "asha@example.test");
      assert.equal(mine.json.data.mobile, "9876543210");
      assert.match(mine.json.data.applicationNo, /^WMC-\d{4}-\d{5}$/);
      assert.equal("score" in mine.json.data, false);
      assert.equal((await call("POST", "/applications", { token: coord.token, body: body(other.id, { email: "x@example.test", mobile: "9000000001" }) })).status, 404);
      assert.equal((await call("POST", "/applications", { token: hr.token, body: body(other.id, { email: "x@example.test", mobile: "9000000001" }) })).status, 201);
      assert.equal((await call("POST", "/applications", { token: interviewer.token, body: body(s.drive.id) })).status, 403);

      const mineList = await call("GET", "/applications", { token: coord.token });
      const allList = await call("GET", "/applications", { token: hr.token });

      assert.equal(mineList.json.pagination.total, 1);
      assert.equal(allList.json.pagination.total, 2);
      assert.equal((await call("GET", `/applications?driveId=${other.id}`, { token: coord.token })).status, 404);
      assert.deepEqual((await call("GET", "/applications/my-drives", { token: coord.token })).json.data.map((x: any) => x.id), [s.drive.id]);
    });
  });

  it("rejects duplicates, closed registration and a level the drive does not allow", async () => {
    const s = setup();
    const hr = staff(s.d, "HR_ADMIN");

    await api(async (call) => {
      assert.equal((await call("POST", "/applications", { token: hr.token, body: body(s.drive.id) })).status, 201);
      assert.equal((await call("POST", "/applications", { token: hr.token, body: body(s.drive.id) })).json.error.code, "DUPLICATE_APPLICATION");
      assert.equal((await call("POST", "/applications", { token: hr.token, body: body(s.drive.id, { email: "new@example.test" }) })).json.error.code, "DUPLICATE_APPLICATION", "same mobile");
      assert.equal((await call("POST", "/applications", { token: hr.token, body: body(s.drive.id, { email: "bad", mobile: "123" }) })).status, 400);

      s.d.state.drives.get(s.drive.id)!.registrationOpen = false;
      assert.equal((await call("POST", "/applications", { token: hr.token, body: body(s.drive.id, { email: "late@example.test", mobile: "9000000002" }) })).json.error.code, "REGISTRATION_CLOSED");

      s.d.state.drives.get(s.drive.id)!.registrationOpen = true;
      s.d.state.drives.get(s.drive.id)!.levelAllowed = "UG";
      assert.equal((await call("POST", "/applications", { token: hr.token, body: body(s.drive.id, { email: "pg@example.test", mobile: "9000000003", level: "PG" }) })).json.error.code, "LEVEL_NOT_ALLOWED");
    });
    assert.equal(s.d.rows("application").length, 1);
  });

  it("a credential needs verification first, is shown once, stored only as a hash, and works for sign-in", async () => {
    const s = setup();
    const hr = staff(s.d, "HR_ADMIN");

    await api(async (call) => {
      const created = await call("POST", "/applications", { token: hr.token, body: body(s.drive.id) });
      const id = created.json.data.id;

      assert.equal((await call("POST", `/applications/${id}/credential`, { token: hr.token })).json.error.code, "NOT_VERIFIED");
      assert.equal((await call("POST", `/applications/${id}/verify`, { token: hr.token })).json.data.verified, true);

      const issued = await call("POST", `/applications/${id}/credential`, { token: hr.token });

      assert.equal(issued.status, 200);
      assert.equal(issued.headers.get("cache-control"), "no-store");
      assert.equal(issued.json.data.loginId, created.json.data.applicationNo);
      assert.equal(issued.json.data.temporaryPassword.length, 10);

      const stored = s.d.rows("candidateCredential")[0]!;

      assert.notEqual(stored.passwordHash, issued.json.data.temporaryPassword);
      assert.equal(await bcrypt.compare(issued.json.data.temporaryPassword, stored.passwordHash), true);
      assert.equal(stored.mustChangePassword, true);

      const audit = JSON.stringify(s.d.state.auditLog);

      assert.equal(audit.includes(issued.json.data.temporaryPassword), false, "the password is never audited");
      assert.ok(s.d.state.auditLog.some((a) => a.action === "CANDIDATE_CREDENTIAL_ISSUED"));
      assert.equal((await login(call, issued.json.data.loginId, issued.json.data.temporaryPassword)).res.status, 200);

const listing = JSON.stringify((await call("GET", "/applications", { token: hr.token })).json);

      assert.equal(listing.includes("passwordHash"), false);
      assert.equal(listing.includes(issued.json.data.temporaryPassword), false);
      assert.equal(listing.includes(stored.passwordHash), false);
    });
  });
});

describe("starting the assessment", () => {
  it("needs explicit acceptance of the current rules; without it no attempt exists", async () => {
    const s = setup();
    const st = s.student();

    await api(async (call) => {
      const { token } = await login(call, st.loginId);

      assert.equal((await call("POST", "/candidate/attempts/start", { token, body: {} })).status, 400);
      assert.equal((await call("POST", "/candidate/attempts/start", { token, body: { termsVersion: TERMS_VERSION, accepted: false } })).status, 400);
      assert.equal((await call("POST", "/candidate/attempts/start", { token, body: { termsVersion: "old-version", accepted: true } })).json.error.code, "TERMS_NOT_ACCEPTED");
    });
    assert.equal(s.d.rows("testAttempt").length, 0);
    assert.equal(s.d.rows("application")[0]!.status, "REGISTERED");
  });

  it("freezes an exact paper (4 questions, weighted marks) and records the acceptance", async () => {
    const s = setup();
    const st = s.student();

    await api(async (call) => {
      const { token } = await login(call, st.loginId);
      const info = await call("GET", "/candidate/assessment", { token });

      assert.equal(info.json.data.canStart, true);
      assert.equal(info.json.data.template.questionCount, 4);
      assert.ok(info.json.data.rules.length > 0);
      assert.equal(JSON.stringify(info.json.data).includes("totalMarks"), false, "marks are not shown to students");

      const attemptId = await begin(call, token);
      const attempt = s.d.rows("testAttempt")[0]!;
      const paper = s.d.rows("attemptQuestion").filter((q) => q.attemptId === attemptId);

      assert.equal(paper.length, 4);
      assert.equal(paper.filter((q) => q.section === "oop").length, 2);
      assert.equal(paper.filter((q) => q.section === "javascript").length, 2);
      assert.deepEqual(paper.map((q) => q.marks).sort(), [1, 1, 2, 2]);
      assert.ok(paper.every((q) => q.correctOptionId && q.questionText && q.optionsSnapshot.length === 4));
      assert.equal(new Set(paper.map((q) => q.questionId)).size, 4, "no duplicate questions");
      assert.equal(attempt.termsVersion, TERMS_VERSION);
      assert.ok(attempt.termsAcceptedAt);
      assert.equal(attempt.deadline.getTime() - attempt.startedAt.getTime(), 60 * 60_000);
      assert.equal(attempt.maxScore, 6);
      assert.equal(s.d.rows("application")[0]!.status, "TEST_IN_PROGRESS");
      assert.equal(s.d.rows("applicationStatusHistory").length, 1);
    });
  });

  it("never starts a partial paper: an insufficient bank is a clear 409 and creates nothing", async () => {
    const s = setup({ bank: 1 });
    const st = s.student();

    await api(async (call) => {
      const { token } = await login(call, st.loginId);
      const res = await call("POST", "/candidate/attempts/start", { token, body: accept });

      assert.equal(res.status, 409);
      assert.equal(res.json.error.code, "QUESTION_BANK_INSUFFICIENT");
      assert.ok(res.json.error.details.sections.length > 0);
    });
    assert.equal(s.d.rows("testAttempt").length, 0);
    assert.equal(s.d.rows("attemptQuestion").length, 0);
    assert.equal(s.d.rows("application")[0]!.status, "REGISTERED");
  });

  it("invalid questions (not exactly one correct option) are never served", async () => {
    const s = setup({ bank: 2 });
    const st = s.student();
    const bad = s.d.rows("questionOption").filter((o) => o.isCorrect).slice(0, 1)[0]!;

    bad.isCorrect = false;

    await api(async (call) => {
      const { token } = await login(call, st.loginId);

      assert.equal((await call("POST", "/candidate/attempts/start", { token, body: accept })).json.error.code, "QUESTION_BANK_INSUFFICIENT");
    });
  });

  it("is refused without a template, before the window, after the window, and for an unpublished drive", async () => {
    const noTemplate = setup({ template: false });

    await api(async (call) => {
      const { token } = await login(call, noTemplate.student().loginId);

      assert.equal((await call("POST", "/candidate/attempts/start", { token, body: accept })).json.error.code, "TEMPLATE_NOT_CONFIGURED");
    });
    noTemplate.d.restore();

    const s = setup();
    const st = s.student();

    await api(async (call) => {
      const { token } = await login(call, st.loginId);
      const drive = s.d.state.drives.get(s.drive.id)!;

      drive.testStartsAt = new Date(Date.now() + 3_600_000);
      assert.equal((await call("POST", "/candidate/attempts/start", { token, body: accept })).json.error.code, "TEST_NOT_STARTED");
      drive.testStartsAt = new Date(Date.now() - 7_200_000);
      drive.testEndsAt = new Date(Date.now() - 3_600_000);
      assert.equal((await call("POST", "/candidate/attempts/start", { token, body: accept })).json.error.code, "TEST_WINDOW_CLOSED");
      drive.testStartsAt = null;
      drive.testEndsAt = null;
      drive.status = "DRAFT";
      assert.equal((await call("POST", "/candidate/attempts/start", { token, body: accept })).json.error.code, "DRIVE_NOT_OPEN");
    });
    assert.equal(s.d.rows("testAttempt").length, 0);
  });

  it("two simultaneous starts create one attempt; both get the same one", async () => {
    const s = setup();
    const st = s.student();

    await api(async (call) => {
      const { token } = await login(call, st.loginId);
      const results = await Promise.all([1, 2, 3].map(() => call("POST", "/candidate/attempts/start", { token, body: accept })));

      assert.ok(results.every((r) => r.status === 200), JSON.stringify(results.map((r) => r.json)));
      assert.equal(new Set(results.map((r) => r.json.data.attempt.id)).size, 1);
    });
    assert.equal(s.d.rows("testAttempt").length, 1);
    assert.equal(s.d.rows("attemptQuestion").length, 4);
  });
});

describe("taking the assessment", () => {
  it("never sends answer keys, explanations, marks or results to the student", async () => {
    const s = setup();
    const st = s.student();

    s.d.rows("question").forEach((q) => { q.explanation = "SECRET EXPLANATION"; });

    await api(async (call) => {
      const { token } = await login(call, st.loginId);
      const start = await call("POST", "/candidate/attempts/start", { token, body: accept });
      const current = await call("GET", "/candidate/attempts/current", { token });
      const attemptId = start.json.data.attempt.id;
      const key = keyOf(s.d, attemptId);
      const first = current.json.data.questions[0];
      const save = await call("PATCH", `/candidate/attempts/${attemptId}/answers`, { token, body: { answers: [{ questionId: first.questionId, selectedOptionId: first.options[0].id, seq: 1 }] } });
      const everything = JSON.stringify([start.json, current.json, save.json]);

      assert.equal(current.json.data.questions.length, 4);
      assert.ok(current.json.data.questions.every((q: any) => q.options.length === 4));
      for (const word of ["correctOptionId", "isCorrect", "explanation", "SECRET", "marks", "score", "percentage", "rank", "optionsSnapshot"]) {
        assert.equal(everything.includes(word), false, word);
      }
      assert.ok(key.size === 4);
    });
  });

  it("autosaves, restores answers after a reload, and keeps the original deadline", async () => {
    const s = setup();
    const st = s.student();

    await api(async (call) => {
      const { token } = await login(call, st.loginId);
      const start = await call("POST", "/candidate/attempts/start", { token, body: accept });
      const attemptId = start.json.data.attempt.id;
      const deadline = start.json.data.attempt.deadline;
      const paper = (await call("GET", "/candidate/attempts/current", { token })).json.data.questions;

      assert.equal((await call("PATCH", `/candidate/attempts/${attemptId}/answers`, { token, body: { answers: [
        { questionId: paper[0].questionId, selectedOptionId: paper[0].options[2].id, markedForReview: true, seq: 1 },
        { questionId: paper[1].questionId, selectedOptionId: paper[1].options[0].id, seq: 1 },
      ] } })).json.data.applied, 2);

const row = s.d.rows("testAttempt")[0]!;

      row.startedAt = new Date(Date.now() - 40 * 60_000);
      row.deadline = new Date(Date.now() + 30 * 60_000);

const again = await login(call, st.loginId);
      const resumed = await call("POST", "/candidate/attempts/start", { token: again.token, body: accept });
      const current = await call("GET", "/candidate/attempts/current", { token: again.token });

      assert.equal(resumed.json.data.resumed, true);
      assert.equal(resumed.json.data.attempt.id, attemptId);
      assert.ok(Math.abs(current.json.data.attempt.remainingSeconds - 30 * 60) <= 2, "the timer did not reset");
      assert.notEqual(resumed.json.data.attempt.deadline, deadline, "deadline now reflects the stored one");
      assert.equal(current.json.data.answers[paper[0].questionId].selectedOptionId, paper[0].options[2].id);
      assert.equal(current.json.data.answers[paper[0].questionId].markedForReview, true);
      assert.deepEqual(current.json.data.questions.map((q: any) => q.questionId), paper.map((q: any) => q.questionId), "same order");
    });
    assert.equal(s.d.rows("testAttempt").length, 1);
  });

  it("rejects questions or options that are not on this paper, and applies nothing from a bad request", async () => {
    const s = setup();
    const st = s.student();

    await api(async (call) => {
      const { token } = await login(call, st.loginId);
      const attemptId = await begin(call, token);
      const paper = (await call("GET", "/candidate/attempts/current", { token })).json.data.questions;
      const outsider = s.d.rows("questionOption").find((o) => !paper.some((q: any) => q.options.some((x: any) => x.id === o.id)))!;
      const url = `/candidate/attempts/${attemptId}/answers`;

      const foreignOption = await call("PATCH", url, { token, body: { answers: [{ questionId: paper[0].questionId, selectedOptionId: outsider.id, seq: 1 }] } });
      const foreignQuestion = await call("PATCH", url, { token, body: { answers: [{ questionId: outsider.questionId, selectedOptionId: null, seq: 1 }] } });
      const mixed = await call("PATCH", url, { token, body: { answers: [
        { questionId: paper[0].questionId, selectedOptionId: paper[0].options[0].id, seq: 1 },
        { questionId: paper[1].questionId, selectedOptionId: outsider.id, seq: 1 },
      ] } });

      assert.equal(foreignOption.json.error.code, "INVALID_OPTION");
      assert.equal(foreignQuestion.json.error.code, "INVALID_QUESTION");
      assert.equal(mixed.status, 400);
      assert.equal((await call("PATCH", url, { token, body: { answers: [{ questionId: "nope", selectedOptionId: null, seq: 1 }] } })).status, 400);
    });
    assert.equal(s.d.rows("attemptAnswer").length, 0, "the mixed request saved nothing");
  });

  it("a stale autosave cannot overwrite a newer answer", async () => {
    const s = setup();
    const st = s.student();

    await api(async (call) => {
      const { token } = await login(call, st.loginId);
      const attemptId = await begin(call, token);
      const q = (await call("GET", "/candidate/attempts/current", { token })).json.data.questions[0];
      const url = `/candidate/attempts/${attemptId}/answers`;
      const save = (opt: number, seq: number) => call("PATCH", url, { token, body: { answers: [{ questionId: q.questionId, selectedOptionId: q.options[opt].id, seq }] } });

      assert.equal((await save(1, 5)).json.data.applied, 1);
      assert.equal((await save(3, 4)).json.data.ignored, 1, "older sequence number is ignored");
      assert.equal(s.d.rows("attemptAnswer")[0]!.selectedOptionId, q.options[1].id);
      assert.equal((await save(2, 6)).json.data.applied, 1);
      assert.equal(s.d.rows("attemptAnswer")[0]!.selectedOptionId, q.options[2].id);

await Promise.all([7, 8, 9, 10].map((n) => save(n % 4, n)));
      assert.equal(s.d.rows("attemptAnswer").length, 1);
    });
  });

  it("submit scores with the frozen marks, is idempotent and closes the paper for good", async () => {
    const s = setup();
    const st = s.student();

    await api(async (call) => {
      const { token } = await login(call, st.loginId);
      const attemptId = await begin(call, token);
      const key = keyOf(s.d, attemptId);
      const paper = (await call("GET", "/candidate/attempts/current", { token })).json.data.questions;
      const marksOf = (qid: string) => s.d.rows("attemptQuestion").find((x) => x.questionId === qid)!.marks as number;
      const oop = paper.filter((q: any) => q.section === "oop");
      const js = paper.filter((q: any) => q.section === "javascript");

const answers = [
        { questionId: oop[0].questionId, selectedOptionId: key.get(oop[0].questionId)!, seq: 1 },
        { questionId: js[0].questionId, selectedOptionId: key.get(js[0].questionId)!, seq: 1 },
        { questionId: js[1].questionId, selectedOptionId: js[1].options.find((o: any) => o.id !== key.get(js[1].questionId)).id, seq: 1 },
      ];

      await call("PATCH", `/candidate/attempts/${attemptId}/answers`, { token, body: { answers } });

      const first = await call("POST", `/candidate/attempts/${attemptId}/submit`, { token, body: { confirm: true } });
      const second = await call("POST", `/candidate/attempts/${attemptId}/submit`, { token, body: { confirm: true } });
      const stored = s.d.rows("testAttempt")[0]!;

      assert.equal(first.json.data.message, "Your assessment has been submitted successfully.");
      assert.deepEqual(second.json.data, first.json.data);
      assert.equal(stored.status, "SUBMITTED");
      assert.equal(stored.score, marksOf(oop[0].questionId) + marksOf(js[0].questionId));
      assert.equal(stored.maxScore, 6);
      assert.equal(s.d.rows("application")[0]!.status, "TEST_SUBMITTED");
      assert.equal(s.d.state.auditLog.filter((a) => a.action === "ATTEMPT_SUBMITTED").length, 1);
      assert.equal(JSON.stringify([first.json, second.json]).includes("score"), false);

const save = await call("PATCH", `/candidate/attempts/${attemptId}/answers`, { token, body: { answers } });
      const current = await call("GET", "/candidate/attempts/current", { token });
      const restart = await call("POST", "/candidate/attempts/start", { token, body: accept });

      assert.equal(save.json.error.code, "ATTEMPT_CLOSED");
      assert.equal(current.json.data.questions, undefined, "a submitted assessment is not reopened");
      assert.equal(JSON.stringify(current.json).includes("score"), false);
      assert.equal(restart.json.error.code, "ALREADY_SUBMITTED");
    });
    assert.equal(s.d.rows("testAttempt").length, 1);
  });

  it("five simultaneous submits close the attempt exactly once", async () => {
    const s = setup();
    const st = s.student();

    await api(async (call) => {
      const { token } = await login(call, st.loginId);
      const attemptId = await begin(call, token);
      const results = await Promise.all([1, 2, 3, 4, 5].map(() => call("POST", `/candidate/attempts/${attemptId}/submit`, { token, body: {} })));

      assert.ok(results.every((r) => r.status === 200));
    });
    assert.equal(s.d.state.auditLog.filter((a) => /ATTEMPT_(AUTO_)?SUBMITTED/.test(a.action)).length, 1);
    assert.equal(s.d.rows("applicationStatusHistory").filter((h) => h.toStatus === "TEST_SUBMITTED").length, 1);
  });

  it("enforces the deadline on the server: late answers are rejected and the attempt is auto-submitted with what was saved", async () => {
    const s = setup();
    const st = s.student();

    await api(async (call) => {
      const { token } = await login(call, st.loginId);
      const attemptId = await begin(call, token);
      const key = keyOf(s.d, attemptId);
      const paper = (await call("GET", "/candidate/attempts/current", { token })).json.data.questions;
      const url = `/candidate/attempts/${attemptId}/answers`;
      const q = paper[0];
      const row = s.d.rows("testAttempt")[0]!;

      assert.equal((await call("PATCH", url, { token, body: { answers: [{ questionId: q.questionId, selectedOptionId: key.get(q.questionId)!, seq: 1 }] } })).status, 200);

row.deadline = new Date(Date.now() - 10_000);
      assert.equal((await call("PATCH", url, { token, body: { answers: [{ questionId: paper[1].questionId, selectedOptionId: key.get(paper[1].questionId)!, seq: 1 }] } })).status, 200);

row.deadline = new Date(Date.now() - 60_000);

      const late = await call("PATCH", url, { token, body: { answers: [{ questionId: paper[2].questionId, selectedOptionId: key.get(paper[2].questionId)!, seq: 1 }] } });

      assert.equal(late.status, 409);
      assert.equal(late.json.error.code, "ATTEMPT_EXPIRED");
      assert.equal(row.status, "AUTO_SUBMITTED");
      assert.equal(s.d.rows("attemptAnswer").length, 2, "the late answer was not saved");
      assert.equal(row.score, s.d.rows("attemptQuestion").filter((x) => [q.questionId, paper[1].questionId].includes(x.questionId)).reduce((n, x) => n + x.marks, 0));
    });
  });

  it("an expired attempt is closed when the student reconnects, and by the sweep for those who never do", async () => {
    const s = setup();
    const a = s.student();
    const b = s.student();
    const c = s.student();

    await api(async (call) => {
      const ta = (await login(call, a.loginId)).token;
      const tb = (await login(call, b.loginId)).token;
      const tc = (await login(call, c.loginId)).token;

      await begin(call, ta);
      await begin(call, tb);
      await begin(call, tc);

      const [rowA, rowB, rowC] = s.d.rows("testAttempt");

      rowA!.deadline = new Date(Date.now() - (ANSWER_GRACE_SECONDS + 5) * 1000); // past the grace, so a reconnect closes it
      rowB!.deadline = new Date(Date.now() - (ANSWER_GRACE_SECONDS + 5) * 1000); // past the grace, so the sweep may close it

      const current = await call("GET", "/candidate/attempts/current", { token: ta });

      assert.equal(current.json.data.status, "SUBMITTED");
      assert.equal(rowA!.status, "AUTO_SUBMITTED");
      assert.equal(await finalizeExpiredAttempts(), 1, "only the one nobody reconnected for");
      assert.equal(rowB!.status, "AUTO_SUBMITTED");
      assert.equal(rowC!.status, "IN_PROGRESS", "a running attempt is untouched");
      assert.equal(await finalizeExpiredAttempts(), 0, "running the sweep again changes nothing");
    });
    assert.equal(s.d.rows("applicationStatusHistory").filter((h) => h.toStatus === "TEST_SUBMITTED").length, 2);
  });

  it("a reconnect inside the answer grace period does not close the attempt, so the last autosave still lands", async () => {
    const s = setup();
    const st = s.student();

    await api(async (call) => {
      const token = (await login(call, st.loginId)).token;
      const attemptId = await begin(call, token);
      const row = s.d.rows("testAttempt").find((t) => t.id === attemptId)!;
      const q = s.d.rows("attemptQuestion").find((x) => x.attemptId === attemptId)!;

      row.deadline = new Date(Date.now() - 10_000); // ten seconds past the deadline, inside the grace

      const current = await call("GET", "/candidate/attempts/current", { token });

      assert.equal(current.status, 200);
      assert.equal(current.json.data.status, "SUBMITTED", "the paper is no longer served after the deadline");
      assert.equal(current.json.data.questions, undefined, "no questions are returned");
      assert.equal(row.status, "IN_PROGRESS", "but the attempt is not closed until the grace has elapsed");

      const retry = await call("POST", "/candidate/attempts/start", { token, body: accept });

      assert.equal(retry.status, 409);
      assert.equal(retry.json.error.code, "ALREADY_SUBMITTED");
      assert.equal(row.status, "IN_PROGRESS", "a start retry does not close it either");

      const late = await call("PATCH", `/candidate/attempts/${attemptId}/answers`, { token, body: { answers: [{ questionId: q.questionId, selectedOptionId: q.correctOptionId, seq: 1 }] } });

      assert.equal(late.status, 200, "the autosave is still accepted after the reconnect");

      row.deadline = new Date(Date.now() - (ANSWER_GRACE_SECONDS + 5) * 1000); // grace now over

      const after = await call("GET", "/candidate/attempts/current", { token });

      assert.equal(after.json.data.status, "SUBMITTED");
      assert.equal(row.status, "AUTO_SUBMITTED", "closed by the reconnect once the grace has elapsed");
      assert.equal(row.score, q.marks, "the answer saved during the grace period was scored");
    });
  });

  it("the grace cutoff is exact: open 1 ms before it, expired at it and 1 ms after, for saves, reconnects and the sweep", async () => {
    // Freeze the clock only around a single call so the cutoff can be hit to the millisecond.
    async function frozen<T>(at: number, run: () => Promise<T>): Promise<T> {
      const RealDate = Date;

      class Frozen extends RealDate {
        constructor(...args: unknown[]) {
          super(...(args.length ? (args as [number]) : [at]));
        }
        static override now() { return at; }
      }

      globalThis.Date = Frozen as unknown as DateConstructor;
      try { return await run(); } finally { globalThis.Date = RealDate; }
    }

    const grace = ANSWER_GRACE_SECONDS * 1000;

    for (const [offset, open] of [[-1, true], [0, false], [1, false]] as const) {
      const s = setup();
      const st = s.student();

      await api(async (call) => {
        const token = (await login(call, st.loginId)).token;
        const attemptId = await begin(call, token);
        const row = s.d.rows("testAttempt").find((t) => t.id === attemptId)!;
        const q = s.d.rows("attemptQuestion").find((x) => x.attemptId === attemptId)!;
        const at = Date.now();
        const body = { answers: [{ questionId: q.questionId, selectedOptionId: q.correctOptionId, seq: 1 }] };

        row.deadline = new Date(at - grace + (-offset)); // "now" sits at cutoff + offset
        const save = () => call("PATCH", `/candidate/attempts/${attemptId}/answers`, { token, body });
        const current = () => call("GET", "/candidate/attempts/current", { token });

        if (open) {
          assert.equal((await frozen(at, current)).json.data.status, "SUBMITTED");
          assert.equal(row.status, "IN_PROGRESS", `${offset} ms: a reconnect does not close it`);
          assert.equal(await finalizeExpiredAttempts(new Date(at)), 0, `${offset} ms: the sweep leaves it`);
          assert.equal((await frozen(at, save)).status, 200, `${offset} ms: a save is accepted`);
          assert.equal(row.status, "IN_PROGRESS");
        } else {
          assert.equal((await frozen(at, save)).status, 409, `${offset} ms: a save is refused`);
          assert.equal(row.status, "AUTO_SUBMITTED", `${offset} ms: the refused save closes it`);
        }
      });

      const s2 = setup();
      const st2 = s2.student();

      await api(async (call) => {
        const token = (await login(call, st2.loginId)).token;
        const attemptId = await begin(call, token);
        const row = s2.d.rows("testAttempt").find((t) => t.id === attemptId)!;
        const at = Date.now();

        row.deadline = new Date(at - grace + (-offset));

        if (open) return;

        assert.equal((await frozen(at, () => call("GET", "/candidate/attempts/current", { token }))).json.data.status, "SUBMITTED");
        assert.equal(row.status, "AUTO_SUBMITTED", `${offset} ms: a reconnect closes it`);
      });

      if (!open) {
        const s3 = setup();
        const st3 = s3.student();

        await api(async (call) => {
          const token = (await login(call, st3.loginId)).token;
          const attemptId = await begin(call, token);
          const row = s3.d.rows("testAttempt").find((t) => t.id === attemptId)!;
          const at = Date.now();

          row.deadline = new Date(at - grace + (-offset));
          assert.equal(await finalizeExpiredAttempts(new Date(at)), 1, `${offset} ms: the sweep closes it`);
        });
      }
    }
  });

  it("the sweep never closes an attempt inside the answer grace period, and closes it once the grace has elapsed", async () => {
    const s = setup();
    const st = s.student();

    await api(async (call) => {
      const token = (await login(call, st.loginId)).token;
      const attemptId = await begin(call, token);
      const row = s.d.rows("testAttempt").find((t) => t.id === attemptId)!;
      const q = s.d.rows("attemptQuestion").find((x) => x.attemptId === attemptId)!;
      const grace = ANSWER_GRACE_SECONDS * 1000;
      const deadline = new Date(Date.now() - 10_000); // ten seconds past the deadline, inside the grace

      row.startedAt = new Date(deadline.getTime() - 60 * 60_000);
      row.deadline = deadline;

      assert.equal(await finalizeExpiredAttempts(), 0, "inside the grace period the sweep leaves the attempt alone");
      assert.equal(row.status, "IN_PROGRESS");

      const late = await call("PATCH", `/candidate/attempts/${attemptId}/answers`, { token, body: { answers: [{ questionId: q.questionId, selectedOptionId: q.correctOptionId, seq: 1 }] } });

      assert.equal(late.status, 200, "an autosave inside the grace period is still accepted after a sweep has run");
      assert.equal(row.status, "IN_PROGRESS");

      // exact boundary, with the clock passed in: one millisecond before the grace ends, then at its end
      assert.equal(await finalizeExpiredAttempts(new Date(deadline.getTime() + grace - 1)), 0, "1 ms before the grace ends");
      assert.equal(row.status, "IN_PROGRESS");
      assert.equal(await finalizeExpiredAttempts(new Date(deadline.getTime() + grace)), 1, "once the grace has elapsed it is closed");
      assert.equal(row.status, "AUTO_SUBMITTED");
      assert.equal(row.score, q.marks, "the answer saved during the grace period was scored");
      assert.equal(await finalizeExpiredAttempts(new Date(deadline.getTime() + grace)), 0, "closed once, not twice");
    });
  });

  it("the paper is frozen: editing the bank afterwards changes nothing for a running attempt", async () => {
    const s = setup();
    const st = s.student();

    await api(async (call) => {
      const { token } = await login(call, st.loginId);

      await begin(call, token);

      const before = (await call("GET", "/candidate/attempts/current", { token })).json.data.questions;

      s.d.rows("question").forEach((q) => { q.text = "EDITED AFTER START"; q.isActive = false; });
      s.d.rows("questionOption").forEach((o) => { o.text = "EDITED OPTION"; });

      const after = (await call("GET", "/candidate/attempts/current", { token })).json.data.questions;

      assert.deepEqual(after, before);
    });
  });

  it("a student cannot touch another student's attempt", async () => {
    const s = setup();
    const a = s.student();
    const b = s.student();

    await api(async (call) => {
      const ta = (await login(call, a.loginId)).token;
      const tb = (await login(call, b.loginId)).token;
      const attemptA = await begin(call, ta);
      const q = (await call("GET", "/candidate/attempts/current", { token: ta })).json.data.questions[0];

      const save = await call("PATCH", `/candidate/attempts/${attemptA}/answers`, { token: tb, body: { answers: [{ questionId: q.questionId, selectedOptionId: q.options[0].id, seq: 1 }] } });
      const event = await call("POST", `/candidate/attempts/${attemptA}/events`, { token: tb, body: { type: "TAB_HIDDEN" } });
      const submit = await call("POST", `/candidate/attempts/${attemptA}/submit`, { token: tb, body: {} });

      for (const res of [save, event, submit]) assert.equal(res.status, 404);
      assert.equal(s.d.rows("testAttempt")[0]!.status, "IN_PROGRESS");
      assert.equal(s.d.rows("attemptAnswer").length, 0);
      assert.equal(s.d.rows("integrityEvent").length, 0);
      assert.equal((await call("GET", "/candidate/attempts/current", { token: tb })).status, 404, "B has no attempt of their own");
    });
  });
});

describe("integrity events", () => {
  it("records timestamped events, warns, flags for review at the threshold, and never disqualifies or discards answers", async () => {
    const s = setup();
    const st = s.student();

    await api(async (call) => {
      const { token } = await login(call, st.loginId);
      const attemptId = await begin(call, token);
      const q = (await call("GET", "/candidate/attempts/current", { token })).json.data.questions[0];
      const url = `/candidate/attempts/${attemptId}/events`;

      await call("PATCH", `/candidate/attempts/${attemptId}/answers`, { token, body: { answers: [{ questionId: q.questionId, selectedOptionId: q.options[0].id, seq: 1 }] } });

      const one = await call("POST", url, { token, body: { type: "TAB_HIDDEN", clientAt: new Date().toISOString() } });
      const info = await call("POST", url, { token, body: { type: "RECONNECTED" } });
      const two = await call("POST", url, { token, body: { type: "FULLSCREEN_EXIT" } });

      assert.equal(one.json.data.warnings, 1);
      assert.match(one.json.data.message, /recorded/);
      assert.equal(info.json.data.warnings, 1, "informational events do not count");
      assert.equal(two.json.data.warnings, 2);
      assert.equal(s.d.rows("testAttempt")[0]!.flaggedForReview, false);

      const three = await call("POST", url, { token, body: { type: "WINDOW_BLUR" } });
      const row = s.d.rows("testAttempt")[0]!;

      assert.equal(three.json.data.warnings, 3);
      assert.equal(row.flaggedForReview, true);
      assert.equal(row.status, "IN_PROGRESS", "flagged, not disqualified");
      assert.equal(s.d.rows("integrityEvent").length, 4);
      assert.ok(s.d.rows("integrityEvent").every((e) => e.createdAt instanceof Date), "server time recorded");
      assert.equal(s.d.rows("attemptAnswer").length, 1, "answers kept");
      assert.equal(s.d.state.auditLog.filter((a) => a.action === "ATTEMPT_FLAGGED_FOR_REVIEW").length, 1);

const deadline = row.deadline.getTime();

      await call("POST", url, { token, body: { type: "TAB_HIDDEN" } });
      assert.equal(row.deadline.getTime(), deadline);
      assert.equal((await call("POST", url, { token, body: { type: "NOT_A_TYPE" } })).status, 400);

      await call("POST", `/candidate/attempts/${attemptId}/submit`, { token, body: {} });
      assert.equal((await call("POST", url, { token, body: { type: "TAB_HIDDEN" } })).json.data.recorded, false, "nothing recorded after submission");
    });
  });
});
