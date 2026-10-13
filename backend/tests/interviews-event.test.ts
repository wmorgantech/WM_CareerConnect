

import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { INTERVIEW_DURATION_MINUTES } from "../src/domain/assessment-config.js";
import { createMemoryDb, type MemoryDb } from "./helpers/memory-db.js";
import { api, staff } from "./helpers/http.js";

let db: MemoryDb | null = null;

afterEach(() => {
  db?.restore();
  db = null;
});

const inDays = (days: number, hour = 10, minute = 0) => {
  const d = new Date(Date.now() + days * 86_400_000);

  d.setUTCHours(hour, minute, 0, 0);

  return d.toISOString();
};

function world() {
  const d = (db = createMemoryDb());
  const hr = staff(d, "HR_ADMIN");
  const interviewerA = staff(d, "INTERVIEWER");
  const interviewerB = staff(d, "INTERVIEWER");
  const students = [1, 2, 3].map(() => d.addApplication().candidate);

  return { d, hr, interviewerA, interviewerB, students };
}

describe("interview scheduling", () => {
  it("every interview defaults to 30 minutes", async () => {
    assert.equal(INTERVIEW_DURATION_MINUTES, 30);

    const w = world();

    await api(async (call) => {
      const res = await call("POST", "/interviews", { token: w.hr.token, body: { candidateId: w.students[0]!.id, interviewerId: w.interviewerA.user.id, scheduledAt: inDays(2) } });

      assert.equal(res.status, 201, JSON.stringify(res.json));
      assert.equal(res.json.data.durationMinutes, 30);
    });
  });

  it("refuses to double-book an interviewer or a student, but allows back-to-back interviews", async () => {
    const w = world();
    const [s1, s2, s3] = w.students as [any, any, any];
    const a = w.interviewerA.user.id;
    const b = w.interviewerB.user.id;
    const book = (call: any, candidateId: string, interviewerId: string, scheduledAt: string, extra: object = {}) =>
      call("POST", "/interviews", { token: w.hr.token, body: { candidateId, interviewerId, scheduledAt, ...extra } });

    await api(async (call) => {
      const first = await book(call, s1.id, a, inDays(2, 10, 0));

      assert.equal(first.status, 201);

      const overlapping = await book(call, s2.id, a, inDays(2, 10, 15));

      assert.equal(overlapping.status, 409);
      assert.equal(overlapping.json.error.code, "INTERVIEW_TIME_CONFLICT");
      assert.match(overlapping.json.error.message, /interviewer/i);

      const sameStudent = await book(call, s1.id, b, inDays(2, 10, 10));

      assert.equal(sameStudent.status, 409);
      assert.match(sameStudent.json.error.message, /candidate/i);

      assert.equal((await book(call, s2.id, a, inDays(2, 10, 30))).status, 201, "starts exactly when the previous one ends");
      assert.equal((await book(call, s3.id, a, inDays(2, 9, 30))).status, 201, "ends exactly when the next one starts");
      assert.equal((await book(call, s3.id, b, inDays(2, 10, 0))).status, 201, "a different interviewer at the same time is fine");
    });
    assert.equal(w.d.state.interviews.size, 4);
  });

  it("a cancelled interview frees the slot; moving an interview into a taken slot is refused; moving within itself is fine", async () => {
    const w = world();
    const [s1, s2] = w.students as [any, any];
    const a = w.interviewerA.user.id;
    const keep = w.d.addInterview({ candidateId: s1.id, interviewerId: a, scheduledAt: new Date(inDays(3, 10, 0)), durationMinutes: 30 });
    const moving = w.d.addInterview({ candidateId: s2.id, interviewerId: a, scheduledAt: new Date(inDays(3, 12, 0)), durationMinutes: 30 });

    await api(async (call) => {
      const clash = await call("PATCH", `/interviews/${moving.id}`, { token: w.hr.token, body: { scheduledAt: inDays(3, 10, 20) } });

      assert.equal(clash.status, 409);
      assert.equal(clash.json.error.code, "INTERVIEW_TIME_CONFLICT");
      assert.equal(w.d.state.interviews.get(moving.id)!.scheduledAt.toISOString(), inDays(3, 12, 0));

      assert.equal((await call("PATCH", `/interviews/${moving.id}`, { token: w.hr.token, body: { scheduledAt: inDays(3, 12, 10) } })).status, 200, "overlapping only itself");
      assert.equal((await call("PATCH", `/interviews/${keep.id}`, { token: w.hr.token, body: { status: "CANCELLED" } })).status, 200);
      assert.equal((await call("PATCH", `/interviews/${moving.id}`, { token: w.hr.token, body: { scheduledAt: inDays(3, 10, 20) } })).status, 200, "the cancelled slot is free");
    });
  });
});

describe("interviewer access", () => {
  it("an interviewer sees and opens only their own interviews and cannot schedule", async () => {
    const w = world();
    const [s1, s2] = w.students as [any, any];
    const mine = w.d.addInterview({ candidateId: s1.id, interviewerId: w.interviewerA.user.id });
    const theirs = w.d.addInterview({ candidateId: s2.id, interviewerId: w.interviewerB.user.id });

    await api(async (call) => {
      const list = await call("GET", "/interviews", { token: w.interviewerA.token });

      assert.deepEqual(list.json.data.map((i: any) => i.id), [mine.id]);
      assert.equal((await call("GET", `/interviews/${mine.id}`, { token: w.interviewerA.token })).status, 200);
      assert.equal((await call("GET", `/interviews/${theirs.id}`, { token: w.interviewerA.token })).status, 404);
      assert.equal((await call("POST", "/interviews", { token: w.interviewerA.token, body: { candidateId: s1.id, interviewerId: w.interviewerA.user.id, scheduledAt: inDays(5) } })).status, 403);
      assert.equal((await call("PATCH", `/interviews/${mine.id}`, { token: w.interviewerA.token, body: { notes: "x" } })).status, 403);
      assert.equal((await call("DELETE", `/interviews/${mine.id}`, { token: w.interviewerA.token })).status, 403);
      assert.equal((await call("GET", "/users", { token: w.interviewerA.token })).status, 403);
      assert.equal((await call("GET", "/candidates", { token: w.interviewerA.token })).status, 403);
      assert.equal((await call("GET", "/results", { token: w.interviewerA.token })).status, 403);
      assert.equal((await call("GET", "/settings", { token: w.interviewerA.token })).status, 403);
    });
  });

  it("feedback is for the assigned interviewer after the interview is completed, and is kept apart from assessment marks", async () => {
    const w = world();
    const [s1] = w.students as [any];
    const own = w.d.addInterview({ candidateId: s1.id, interviewerId: w.interviewerA.user.id, status: "COMPLETED" });
    const scheduled = w.d.addInterview({ candidateId: s1.id, interviewerId: w.interviewerA.user.id });

    await api(async (call) => {
      const body = { feedback: "Clear on fundamentals; communicates well.", score: 82 };

      assert.equal((await call("POST", `/interviews/${own.id}/feedback`, { token: w.interviewerB.token, body })).status >= 400, true, "not the assigned interviewer");
      assert.equal((await call("POST", `/interviews/${scheduled.id}/feedback`, { token: w.interviewerA.token, body })).status >= 400, true, "interview not completed yet");

      const ok = await call("POST", `/interviews/${own.id}/feedback`, { token: w.interviewerA.token, body });

      assert.equal(ok.status, 200, JSON.stringify(ok.json));
      assert.equal(w.d.state.interviews.get(own.id)!.score, 82);
      assert.equal(w.d.rows("testAttempt").length, 0, "assessment data is a separate record");
    });
  });
});
