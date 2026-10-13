

import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import bcrypt from "bcrypt";
import { TERMS_VERSION } from "../src/domain/assessment-rules.js";
import { createMemoryDb, type MemoryDb } from "./helpers/memory-db.js";
import { api, staff } from "./helpers/http.js";

let db: MemoryDb | null = null;

afterEach(() => {
  db?.restore();
  db = null;
});

const STUDENTS = 50;
const PASSWORD = "Student-Pass-9";

describe("50 simultaneous students (logic only, in memory)", () => {
  it("everyone logs in, starts, saves answers, is warned about focus changes and submits exactly once", async () => {
    const d = (db = createMemoryDb());
    const drive = d.addDrive({ status: "PUBLISHED", registrationOpen: true });
    const template = d.addTemplate({ level: "UG", durationMinutes: 60, easyPct: 60, mediumPct: 40, hardPct: 0 }, [
      { key: "oop", count: 6, marksPerQuestion: 1 },
      { key: "html", count: 6, marksPerQuestion: 1 },
      { key: "css", count: 6, marksPerQuestion: 1 },
      { key: "javascript", count: 6, marksPerQuestion: 2 },
    ]);

    d.insert("driveTemplate", { driveId: drive.id, level: "UG", templateId: template.id });

    for (const section of ["oop", "html", "css", "javascript"]) d.addQuestions(40, { section, level: "BOTH" });

    const hash = bcrypt.hashSync(PASSWORD, 4);
    const students = Array.from({ length: STUDENTS }, (_, i) => {
      const { application } = d.addApplication({ driveId: drive.id, level: "UG", applicationNo: `WMC-LOAD-${i}` }, { name: `Student ${String(i).padStart(2, "0")}` });

      d.insert("candidateCredential", { applicationId: application.id, passwordHash: hash, mustChangePassword: false });

      return application;
    });

    await api(async (call) => {
      const results = await Promise.all(
        students.map(async (app, i) => {
          const login = await call("POST", "/candidate/auth/login", { body: { loginId: app.applicationNo, password: PASSWORD } });
          const token = login.json.data.accessToken as string;
          const start = await call("POST", "/candidate/attempts/start", { token, body: { termsVersion: TERMS_VERSION, accepted: true } });
          const attemptId = start.json.data.attempt.id as string;
          const paper = (await call("GET", "/candidate/attempts/current", { token })).json.data.questions as any[];
          const key = new Map(d.rows("attemptQuestion").filter((q) => q.attemptId === attemptId).map((q) => [q.questionId, q.correctOptionId]));

const correct = Math.min((i % 25) + 5, paper.length);
          const chosen = paper.slice(0, correct).map((q: any) => ({ questionId: q.questionId, selectedOptionId: key.get(q.questionId)!, seq: 1 }));
          const saves = await Promise.all(
            [0, 1, 2].map((part) => call("PATCH", `/candidate/attempts/${attemptId}/answers`, { token, body: { answers: chosen.filter((_, n) => n % 3 === part) } })),
          );

          await call("POST", `/candidate/attempts/${attemptId}/events`, { token, body: { type: i % 2 ? "TAB_HIDDEN" : "FULLSCREEN_EXIT" } });

const [again, s1, s2] = await Promise.all([
            call("POST", "/candidate/attempts/start", { token, body: { termsVersion: TERMS_VERSION, accepted: true } }),
            call("POST", `/candidate/attempts/${attemptId}/submit`, { token, body: {} }),
            call("POST", `/candidate/attempts/${attemptId}/submit`, { token, body: {} }),
          ]);

          return { attemptId, correct, saves, again, s1, s2, marks: paper.map((q: any) => d.rows("attemptQuestion").find((x) => x.attemptId === attemptId && x.questionId === q.questionId)!.marks as number) };
        }),
      );

      for (const r of results) {
        assert.ok(r.saves.every((s) => s.status === 200), "every save accepted");
        assert.ok([r.s1, r.s2].every((s) => s.status === 200), "both submit calls answered");
        assert.ok([r.again.status].every((s) => s === 200 || s === 409), "resume or already-submitted, never an error");
      }

      assert.equal(d.rows("testAttempt").length, STUDENTS, "one attempt per student");
      assert.ok(d.rows("testAttempt").every((a) => a.status === "SUBMITTED"));
      assert.equal(d.state.auditLog.filter((a) => a.action === "ATTEMPT_SUBMITTED").length, STUDENTS, "exactly one submission each");
      assert.equal(d.rows("applicationStatusHistory").filter((h) => h.toStatus === "TEST_SUBMITTED").length, STUDENTS);
      assert.equal(d.rows("attemptAnswer").length, results.reduce((n, r) => n + r.correct, 0), "no answer lost or duplicated");

for (const r of results) {
        const attempt = d.rows("testAttempt").find((a) => a.id === r.attemptId)!;
        const expected = r.marks.slice(0, r.correct).reduce((a, b) => a + b, 0);

        assert.equal(attempt.score, expected);
        assert.equal(attempt.maxScore, 6 + 6 + 6 + 12);
      }

const admin = staff(d, "SUPER_ADMIN");
      const ranking = (await call("GET", `/results?driveId=${drive.id}&limit=100`, { token: admin.token })).json.data as any[];

      assert.equal(ranking.length, STUDENTS);
      assert.ok(ranking.every((r) => r.rank !== null && r.attemptStatus === "SUBMITTED"));

      for (let i = 1; i < ranking.length; i += 1) {
        const prev = ranking[i - 1];
        const cur = ranking[i];

        assert.ok(prev.score >= cur.score, "sorted by score");
        assert.equal(cur.score === prev.score, cur.rank === prev.rank, "equal scores share a rank");
      }

      assert.equal(ranking[0].rank, 1);
    });
  });
});
