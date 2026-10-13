

import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import bcrypt from "bcrypt";
import { parseCsv, CsvError } from "../src/domain/csv-parse.js";
import { createMemoryDb, type MemoryDb } from "./helpers/memory-db.js";
import { api, staff, type Call } from "./helpers/http.js";

let db: MemoryDb | null = null;

afterEach(() => {
  db?.restore();
  db = null;
});

const fresh = () => (db = createMemoryDb());
const HEADER = "level,section,topic,difficulty,text,codeSnippet,optionA,optionB,optionC,optionD,correct,explanation";
const cell = (x: string) => (/[",\n]/.test(x) ? `"${x.replace(/"/g, '""')}"` : x);
const csvRow = (text: string, over: Partial<Record<string, string>> = {}) => {
  const v = { level: "BOTH", section: "html", topic: "Tags", difficulty: "EASY", text, codeSnippet: "", a: "div", b: "span", c: "p", d: "a", correct: "C", explanation: "", ...over } as Record<string, string>;

  return [v.level, v.section, v.topic, v.difficulty, v.text, v.codeSnippet, v.a, v.b, v.c, v.d, v.correct, v.explanation].map((x) => cell(x ?? "")).join(",");
};
const csv = (...rows: string[]) => [HEADER, ...rows].join("\r\n");
const csvHeaders = { "Content-Type": "text/csv" };

describe("CSV reader", () => {
  it("handles quotes, doubled quotes, commas and line breaks inside quotes, CRLF and a BOM", () => {
    assert.deepEqual(parseCsv('﻿a,b,c\r\n1,"x, y","say ""hi"""\r\n"line\nbreak",2,3\r\n\r\n'), [["a", "b", "c"], ["1", "x, y", 'say "hi"'], ["line\nbreak", "2", "3"]]);
    assert.deepEqual(parseCsv("a,b\n,\n1,2"), [["a", "b"], ["1", "2"]], "blank lines are skipped");
    assert.throws(() => parseCsv('a,"b'), CsvError);
    assert.throws(() => parseCsv("a\n1\n2\n3", 2), CsvError);
  });
});

describe("question import", () => {
  it("is Super Admin only and serves a template with the expected header", async () => {
    const d = fresh();
    const admin = staff(d, "SUPER_ADMIN");
    const hr = staff(d, "HR_ADMIN");

    await api(async (call) => {
      assert.equal((await call("GET", "/questions/import/template", { token: hr.token })).status, 403);
      assert.equal((await call("POST", "/questions/import", { token: hr.token, raw: csv(), headers: csvHeaders })).status, 403);

      const template = await call("GET", "/questions/import/template", { token: admin.token });

      assert.equal(template.status, 200);
      assert.match(template.headers.get("content-type") ?? "", /text\/csv/);
      assert.equal(template.text.split("\r\n")[0], HEADER);
    });
    assert.equal(d.rows("question").length, 0);
  });

  it("a dry run (the default) lists every row's problems and writes nothing", async () => {
    const d = fresh();
    const admin = staff(d, "SUPER_ADMIN");
    const file = csv(
      csvRow("What is HTML?"),
      csvRow("Bad level", { level: "MBA" }),
      csvRow("Same options", { a: "x", b: "X ", c: "y", d: "z" }),
      csvRow("Wrong letter", { correct: "E" }),
      csvRow("What is HTML?"),
      csvRow("Unknown topic", { section: "sql" }),
    );

    await api(async (call) => {
      const res = await call("POST", "/questions/import", { token: admin.token, raw: file, headers: csvHeaders });

      assert.equal(res.status, 200);
      assert.equal(res.json.data.dryRun, true);
      assert.equal(res.json.data.total, 6);
      assert.equal(res.json.data.valid, 1);

      const byRow = Object.fromEntries(res.json.data.errors.map((e: any) => [`${e.row}:${e.field}`, e.message]));

      assert.ok(byRow["3:level"]);
      assert.ok(byRow["4:optionB"], "duplicate option named");
      assert.ok(byRow["5:correct"]);
      assert.match(byRow["6:text"], /Same as row 2/);
      assert.ok(byRow["7:section"]);
    });
    assert.equal(d.rows("question").length, 0);
    assert.equal(d.state.auditLog.length, 0);
  });

  it("a file with any bad row imports nothing; a clean file imports everything, inactive, in one audited step", async () => {
    const d = fresh();
    const admin = staff(d, "SUPER_ADMIN");

    await api(async (call) => {
      const bad = await call("POST", "/questions/import?dryRun=false", { token: admin.token, raw: csv(csvRow("Fine one"), csvRow("Broken", { correct: "Z" })), headers: csvHeaders });

      assert.equal(bad.status, 400);
      assert.equal(bad.json.error.code, "VALIDATION_ERROR");
      assert.equal(d.rows("question").length, 0, "all or nothing");

      const ok = await call("POST", "/questions/import?dryRun=false", { token: admin.token, raw: csv(csvRow("What does <a> do?", { codeSnippet: '<a href="x">y</a>' }), csvRow("Which tag makes a list?", { section: "html", correct: "A", a: "ul" })), headers: csvHeaders });

      assert.equal(ok.status, 200);
      assert.equal(ok.json.data.imported, 2);
      assert.ok(d.rows("question").every((q) => q.isActive === false), "inactive until reviewed");
      assert.equal(d.rows("questionOption").length, 8);
      assert.equal(d.rows("questionOption").filter((o) => o.isCorrect).length, 2);
      assert.equal(d.rows("question")[0]!.codeSnippet, '<a href="x">y</a>');

      const again = await call("POST", "/questions/import", { token: admin.token, raw: csv(csvRow("What does <a> do?")), headers: csvHeaders });

      assert.match(again.json.data.errors[0].message, /already in the bank/);

      const active = await call("POST", "/questions/import?dryRun=false&activate=true", { token: admin.token, raw: csv(csvRow("Another one")), headers: csvHeaders });

      assert.equal(active.json.data.imported, 1);
      assert.equal(d.rows("question").filter((q) => q.isActive).length, 1);
    });
    assert.deepEqual(d.state.auditLog.map((a) => a.action), ["QUESTIONS_IMPORTED", "QUESTIONS_IMPORTED"]);
  });

  it("refuses a missing header column, an unclosed quote and a JSON batch via the same rules", async () => {
    const d = fresh();
    const admin = staff(d, "SUPER_ADMIN");

    await api(async (call) => {
      assert.equal((await call("POST", "/questions/import", { token: admin.token, raw: "level,section\r\nBOTH,html", headers: csvHeaders })).json.error.code, "INVALID_CSV");
      assert.equal((await call("POST", "/questions/import", { token: admin.token, raw: `${HEADER}\r\nBOTH,html,"x`, headers: csvHeaders })).json.error.code, "INVALID_CSV");

      const json = await call("POST", "/questions/import", {
        token: admin.token,
        body: { dryRun: false, rows: [{ level: "UG", section: "css", difficulty: "MEDIUM", text: "Which property sets the space inside a box?", optionA: "margin", optionB: "padding", optionC: "border", optionD: "gap", correct: "B" }] },
      });

      assert.equal(json.status, 200, JSON.stringify(json.json));
      assert.equal(json.json.data.imported, 1);
    });
  });
});

function hiring() {
  const d = fresh();
  const drive = d.addDrive({ status: "PUBLISHED", registrationOpen: true });
  const hr = staff(d, "HR_ADMIN");
  const interviewer = staff(d, "INTERVIEWER");
  const make = (status: string, name = "Student", over: Record<string, unknown> = {}) => d.addApplication({ driveId: drive.id, level: "UG", status, ...over }, { name });

  return { d, drive, hr, interviewer, make };
}

describe("application decisions", () => {
  it("HR shortlists and rejects with history and audit; the transition rules and permissions hold", async () => {
    const h = hiring();
    const { application } = h.make("TEST_SUBMITTED");
    const coordinator = staff(h.d, "CAMPUS_COORDINATOR");

    await api(async (call) => {
      const url = `/applications/${application.id}/status`;

      assert.equal((await call("PATCH", url, { token: coordinator.token, body: { status: "SHORTLISTED" } })).status, 403);
      assert.equal((await call("PATCH", url, { token: h.hr.token, body: { status: "TEST_IN_PROGRESS" } })).status, 400, "system statuses are not set by hand");
      assert.equal((await call("PATCH", url, { token: h.hr.token, body: { status: "SELECTED" } })).json.error.code, "INVALID_STATUS_TRANSITION", "cannot skip the interview");

      const ok = await call("PATCH", url, { token: h.hr.token, body: { status: "SHORTLISTED", note: "Strong score" } });

      assert.equal(ok.status, 200);
      assert.equal(h.d.rows("application")[0]!.status, "SHORTLISTED");
      assert.equal(h.d.rows("applicationStatusHistory")[0]!.note, "Strong score");
      assert.equal((await call("PATCH", url, { token: h.hr.token, body: { status: "SELECTED" } })).json.error.code, "INVALID_STATUS_TRANSITION", "needs the override flag");
      assert.equal((await call("PATCH", url, { token: h.hr.token, body: { status: "SELECTED", override: true } })).status, 200);
      assert.equal((await call("PATCH", `/applications/2f2c0c8c-0000-4000-8000-000000000000/status`, { token: h.hr.token, body: { status: "REJECTED" } })).status, 404);
    });
    assert.deepEqual(h.d.state.auditLog.map((a) => a.action), ["APPLICATION_STATUS_CHANGED", "APPLICATION_STATUS_CHANGED"]);
  });

  it("a concurrent change loses: 409 and the other decision stands", async () => {
    const h = hiring();
    const { application } = h.make("TEST_SUBMITTED");
    const original = h.d.client.application.updateMany;

    h.d.client.application.updateMany = async (args: any) => {
      h.d.rows("application")[0]!.status = "REJECTED";

      return original(args);
    };

    await api(async (call) => {
      const res = await call("PATCH", `/applications/${application.id}/status`, { token: h.hr.token, body: { status: "SHORTLISTED" } });

      assert.equal(res.status, 409);
      assert.equal(res.json.error.code, "APPLICATION_CHANGED");
    });

    assert.notEqual(h.d.rows("application")[0]!.status, "SHORTLISTED", "the decision was not applied");
    assert.equal(h.d.rows("applicationStatusHistory").length, 0);
  });

  it("bulk shortlist and reject by percentage: preview first, only finished unscored-for-decision students, one transaction", async () => {
    const h = hiring();
    const rows = [["A", 80], ["B", 60], ["C", 59.9], ["D", 20]] as const;

    for (const [name, pct] of rows) {
      const { application } = h.make("TEST_SUBMITTED", name);

      h.d.insert("testAttempt", { applicationId: application.id, templateId: "t", startedAt: new Date(), deadline: new Date(), status: "SUBMITTED", score: pct, maxScore: 100, percentage: pct });
    }

    h.make("REGISTERED", "NotFinished");

    await api(async (call) => {
      const body = (over: object) => ({ driveId: h.drive.id, action: "SHORTLIST", percentage: 60, ...over });
      const preview = await call("POST", "/applications/bulk-status", { token: h.hr.token, body: body({}) });

      assert.equal(preview.json.data.preview, true);
      assert.deepEqual(preview.json.data.students.map((s: any) => s.name), ["A", "B"], "60% is included, sorted best first");
      assert.equal(h.d.rows("application").filter((a) => a.status === "SHORTLISTED").length, 0, "a preview changes nothing");

      const applied = await call("POST", "/applications/bulk-status", { token: h.hr.token, body: body({ preview: false }) });

      assert.equal(applied.json.data.applied, 2);
      assert.deepEqual(h.d.rows("application").map((a) => a.status), ["SHORTLISTED", "SHORTLISTED", "TEST_SUBMITTED", "TEST_SUBMITTED", "REGISTERED"]);

      const rejected = await call("POST", "/applications/bulk-status", { token: h.hr.token, body: body({ action: "REJECT", percentage: 30, preview: false }) });

      assert.equal(rejected.json.data.applied, 1, "only D is below 30%");
      assert.equal(h.d.rows("application")[3]!.status, "REJECTED");
      assert.equal((await call("POST", "/applications/bulk-status", { token: staff(h.d, "CAMPUS_COORDINATOR").token, body: body({}) })).status, 403);
    });
    assert.equal(h.d.state.auditLog.filter((a) => a.action === "APPLICATIONS_BULK_STATUS").length, 2);
  });
});

describe("interviews and applications", () => {
  const inDays = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString();

  it("scheduling needs a shortlisted application of that student; the status follows the interview", async () => {
    const h = hiring();
    const { application, candidate } = h.make("SHORTLISTED", "Asha");
    const other = h.make("SHORTLISTED", "Other");

    await api(async (call) => {
      const create = (applicationId: string, candidateId: string) =>
        call("POST", "/interviews", { token: h.hr.token, body: { candidateId, interviewerId: h.interviewer.user.id, scheduledAt: inDays(2), applicationId } });

      assert.equal((await create(other.application.id, candidate.id)).json.error.code, "APPLICATION_MISMATCH");

      h.d.rows("application")[0]!.status = "TEST_SUBMITTED";
      assert.equal((await create(application.id, candidate.id)).json.error.code, "APPLICATION_NOT_SHORTLISTED");
      h.d.rows("application")[0]!.status = "SHORTLISTED";

      const made = await create(application.id, candidate.id);

      assert.equal(made.status, 201, JSON.stringify(made.json));
      assert.equal(h.d.rows("application")[0]!.status, "INTERVIEW_SCHEDULED");
      assert.equal(h.d.state.interviews.get(made.json.data.id)!.applicationId, application.id);

      const done = await call("PATCH", `/interviews/${made.json.data.id}`, { token: h.hr.token, body: { status: "COMPLETED" } });

      assert.equal(done.status, 200);
      assert.equal(h.d.rows("application")[0]!.status, "INTERVIEW_COMPLETED");
      assert.deepEqual(h.d.rows("applicationStatusHistory").map((x) => x.toStatus), ["INTERVIEW_SCHEDULED", "INTERVIEW_COMPLETED"]);
    });
  });

  it("cancelling returns the student to shortlisted so the interview can be rescheduled; unlinked interviews still work", async () => {
    const h = hiring();
    const { application, candidate } = h.make("SHORTLISTED", "Asha");
    const plain = h.make("REGISTERED", "Plain");

    await api(async (call) => {
      const made = await call("POST", "/interviews", { token: h.hr.token, body: { candidateId: candidate.id, interviewerId: h.interviewer.user.id, scheduledAt: inDays(3), applicationId: application.id } });

      assert.equal((await call("DELETE", `/interviews/${made.json.data.id}`, { token: h.hr.token })).status, 200);
      assert.equal(h.d.rows("application")[0]!.status, "SHORTLISTED");

      const unlinked = await call("POST", "/interviews", { token: h.hr.token, body: { candidateId: plain.candidate.id, interviewerId: h.interviewer.user.id, scheduledAt: inDays(4) } });

      assert.equal(unlinked.status, 201);
      assert.equal(h.d.rows("application")[1]!.status, "REGISTERED", "no link, no status change");
    });
  });
});

describe("what a student can see about themselves", () => {
  const PASSWORD = "Student-Pass-9";

  async function student() {
    const h = hiring();
    const { application, candidate } = h.make("SHORTLISTED", "Asha", { applicationNo: "WMC-V-1" });

    h.d.insert("candidateCredential", { applicationId: application.id, passwordHash: bcrypt.hashSync(PASSWORD, 4), mustChangePassword: false });
    h.d.rows("candidate")[0]!.department = "Computer Science";

    return { h, application, candidate };
  }

  const login = async (call: Call) => (await call("POST", "/candidate/auth/login", { body: { loginId: "WMC-V-1", password: PASSWORD } })).json.data.accessToken as string;

  it("a shortlist or rejection reads only 'under review'; the profile carries no scores", async () => {
    const { h } = await student();

    await api(async (call) => {
      const token = await login(call);
      const me = await call("GET", "/candidate/me", { token });

      assert.deepEqual(me.json.data.status, { code: "UNDER_REVIEW", label: "Under review" });
      assert.equal(me.json.data.department, "Computer Science");
      assert.ok(me.json.data.college);

      for (const status of ["REJECTED", "SELECTED", "ON_HOLD", "INTERVIEW_COMPLETED"]) {
        h.d.rows("application")[0]!.status = status;
        assert.equal((await call("GET", "/candidate/me", { token })).json.data.status.code, "UNDER_REVIEW", status);
      }

      h.d.rows("application")[0]!.status = "INTERVIEW_SCHEDULED";
      assert.equal((await call("GET", "/candidate/me", { token })).json.data.status.label, "Interview scheduled");
      assert.equal(/score|rank|percentage|feedback/i.test(JSON.stringify(me.json)), false);
    });
  });

  it("the student's interviews show time, link and interviewer, never notes, feedback or scores; other students' are not visible", async () => {
    const { h, candidate } = await student();
    const other = h.make("SHORTLISTED", "Other");
    const mine = h.d.addInterview({ candidateId: candidate.id, interviewerId: h.interviewer.user.id, meetingLink: "https://meet.example.test/x", notes: "INTERNAL NOTE", feedback: "SECRET FEEDBACK", score: 91, status: "COMPLETED" });

    h.d.addInterview({ candidateId: other.candidate.id, interviewerId: h.interviewer.user.id, notes: "someone else" });

    await api(async (call) => {
      const token = await login(call);
      const res = await call("GET", "/candidate/interviews", { token });

      assert.deepEqual(res.json.data.map((i: any) => i.id), [mine.id]);
      assert.equal(res.json.data[0].meetingLink, "https://meet.example.test/x");
      assert.equal(res.json.data[0].interviewer, h.d.state.users.get(h.interviewer.user.id)!.name);

      const text = JSON.stringify(res.json);

      for (const leak of ["INTERNAL NOTE", "SECRET FEEDBACK", "someone else", "score", "feedback", "notes"]) assert.equal(text.includes(leak), false, leak);

      // The score (91) is checked structurally: a text search for "91" also matches random ids and timestamps.
      assert.deepEqual(Object.keys(res.json.data[0]).sort(), ["durationMinutes", "id", "interviewer", "meetingLink", "scheduledAt", "status"]);
      assert.equal(Object.values(res.json.data[0]).includes(91), false, "the score is not exposed");

      assert.equal((await call("GET", "/candidate/interviews")).status, 401);
      assert.equal((await call("GET", "/candidate/interviews", { token: h.hr.token })).status, 401);
    });
  });
});

describe("coordinator interview schedule", () => {
  it("shows times and status for the assigned drive only, without notes or scores", async () => {
    const h = hiring();
    const otherDrive = h.d.addDrive({ status: "PUBLISHED" });
    const coordinator = staff(h.d, "CAMPUS_COORDINATOR");
    const mine = h.make("INTERVIEW_SCHEDULED", "Mine");
    const theirs = h.d.addApplication({ driveId: otherDrive.id, level: "UG" }, { name: "Theirs" });

    h.d.insert("driveCoordinator", { driveId: h.drive.id, userId: coordinator.user.id });
    h.d.addInterview({ candidateId: mine.candidate.id, interviewerId: h.interviewer.user.id, notes: "PRIVATE", score: 70 });
    h.d.addInterview({ candidateId: theirs.candidate.id, interviewerId: h.interviewer.user.id });
    h.d.addInterview({ candidateId: mine.candidate.id, interviewerId: h.interviewer.user.id, status: "CANCELLED" });

    await api(async (call) => {
      const res = await call("GET", "/applications/interviews", { token: coordinator.token });

      assert.equal(res.status, 200);
      assert.deepEqual(res.json.data.map((i: any) => i.name), ["Mine"], "assigned drive only; cancelled ones hidden");
      assert.equal(/PRIVATE|score|notes|feedback/.test(JSON.stringify(res.json)), false);
      assert.equal((await call("GET", `/applications/interviews?driveId=${otherDrive.id}`, { token: coordinator.token })).status, 404);
      assert.equal((await call("GET", "/applications/interviews", { token: h.interviewer.token })).status, 403);
    });
  });
});

describe("dashboard recruitment counts", () => {
  it("adds registrations, tests in progress, submitted, shortlisted, selected and flagged counts", async () => {
    const h = hiring();
    const admin = staff(h.d, "SUPER_ADMIN");

    h.make("REGISTERED");
    h.make("TEST_IN_PROGRESS");
    h.make("SHORTLISTED");
    h.make("SELECTED");

    const submitted = h.make("TEST_SUBMITTED");

    h.d.insert("testAttempt", { applicationId: submitted.application.id, templateId: "t", startedAt: new Date(), deadline: new Date(), status: "SUBMITTED", flaggedForReview: true });

    await api(async (call) => {
      const res = await call("GET", "/dashboard/stats", { token: admin.token });

      assert.equal(res.status, 200, JSON.stringify(res.json));
      assert.deepEqual(res.json.data.assessment, { registered: 5, registeredToday: 5, testsInProgress: 1, submitted: 1, shortlisted: 1, selected: 1, flaggedForReview: 1 });
      assert.equal(typeof res.json.data.totalUsers, "number", "the existing totals are unchanged");
    });
  });
});
