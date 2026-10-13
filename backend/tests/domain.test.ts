import assert from "node:assert/strict";
import { test } from "node:test";
import {
  allowedNextStatuses,
  APPLICATION_STATUSES,
  assertTransition,
  canTransition,
  InvalidStatusTransitionError,
} from "../src/domain/application-status.js";
import {
  computeDeadline,
  isAnswerAccepted,
  remainingSeconds,
  shouldAutoSubmit,
} from "../src/domain/attempt-timer.js";
import {
  accessCodeMatches,
  buildRegistrationSchema,
  formatApplicationNumber,
  generateAccessCode,
  isValidAccessCodeFormat,
  normalizeMobile,
  suggestLevel,
} from "../src/domain/candidate-registration.js";
import {
  evaluateOtp,
  generateOtp,
  hashOtp,
  otpExpiry,
  OTP_TTL_SECONDS,
} from "../src/domain/otp.js";
import { rankAttempts, scoreAttempt } from "../src/domain/scoring.js";
import {
  generatePaper,
  InsufficientQuestionsError,
  seededRng,
  type Difficulty,
  type PoolQuestion,
} from "../src/domain/test-paper.js";

test("status lifecycle follows SRS section 7 and nothing else", () => {
  assert.ok(canTransition("REGISTERED", "TEST_IN_PROGRESS"));
  assert.ok(canTransition("TEST_IN_PROGRESS", "TEST_SUBMITTED"));
  assert.ok(canTransition("TEST_SUBMITTED", "SHORTLISTED"));
  assert.ok(canTransition("TEST_SUBMITTED", "REJECTED"));
  assert.ok(canTransition("SHORTLISTED", "INTERVIEW_SCHEDULED"));
  assert.ok(canTransition("INTERVIEW_SCHEDULED", "INTERVIEW_COMPLETED"));
  assert.ok(canTransition("INTERVIEW_COMPLETED", "SELECTED"));
  assert.ok(canTransition("INTERVIEW_COMPLETED", "ON_HOLD"));
  assert.ok(canTransition("INTERVIEW_COMPLETED", "REJECTED"));
});

test("status lifecycle rejects skipping steps, repeats and moves out of terminal states", () => {
  assert.equal(canTransition("REGISTERED", "SHORTLISTED"), false);
  assert.equal(canTransition("REGISTERED", "SELECTED"), false);
  assert.equal(canTransition("TEST_SUBMITTED", "INTERVIEW_SCHEDULED"), false);
  assert.equal(canTransition("SHORTLISTED", "SHORTLISTED"), false);
  assert.equal(canTransition("SELECTED", "REJECTED"), false);
  assert.equal(canTransition("REJECTED", "SHORTLISTED"), false);
  assert.deepEqual(allowedNextStatuses("SELECTED"), []);
  assert.throws(
    () => assertTransition("REGISTERED", "SELECTED"),
    InvalidStatusTransitionError,
  );
});

test("manual override only moves between decision statuses, never around the test or interview", () => {
  assert.ok(canTransition("REJECTED", "SHORTLISTED", { override: true }));
  assert.ok(canTransition("SHORTLISTED", "ON_HOLD", { override: true }));
  assert.equal(canTransition("REGISTERED", "SHORTLISTED", { override: true }), false);
  assert.equal(canTransition("TEST_IN_PROGRESS", "SELECTED", { override: true }), false);
  assert.equal(canTransition("REJECTED", "INTERVIEW_COMPLETED", { override: true }), false);
  assert.equal(canTransition("REJECTED", "TEST_IN_PROGRESS", { override: true }), false);
});

test("every status is reachable from REGISTERED", () => {
  const seen = new Set<string>(["REGISTERED"]);
  const queue = ["REGISTERED" as (typeof APPLICATION_STATUSES)[number]];

  while (queue.length > 0) {
    const current = queue.shift()!;

    for (const next of allowedNextStatuses(current)) {
      if (!seen.has(next)) {
        seen.add(next);
        queue.push(next);
      }
    }
  }

  assert.equal(seen.size, APPLICATION_STATUSES.length);
});

const DIFFS: Difficulty[] = ["EASY", "MEDIUM", "HARD"];

function makePool(sections: Record<string, number>, perSection: number): PoolQuestion[] {
  const pool: PoolQuestion[] = [];

  for (const section of Object.keys(sections)) {
    for (let i = 0; i < perSection; i += 1) {
      pool.push({
        id: `${section}-${i}`,
        section,
        difficulty: DIFFS[i % 3] as Difficulty,
        optionIds: [`${section}-${i}-a`, `${section}-${i}-b`, `${section}-${i}-c`, `${section}-${i}-d`],
      });
    }
  }

  return pool;
}

const UG: Record<string, number> = { APT: 10, PROG: 15, OOP: 10, SQL: 10, DS: 10, WEB: 5 };
const PG: Record<string, number> = { APT: 10, PROG: 15, DSA: 15, SQL: 10, OOPSE: 10, API: 10, SYS: 5 };
const specs = (t: Record<string, number>) => Object.entries(t).map(([section, marks]) => ({ section, marks }));

test("legacy one-mark helper: SRS UG section arithmetic gives 60 questions (superseded by the 45-question UG paper)", () => {
  const paper = generatePaper({ pool: makePool(UG, 30), sections: specs(UG), rng: seededRng(1) });

  assert.equal(paper.length, 60);

  for (const [section, marks] of Object.entries(UG)) {
    assert.equal(paper.filter((p) => p.section === section).length, marks, section);
  }
});

test("legacy one-mark helper: SRS PG section arithmetic gives 75 questions", () => {
  const paper = generatePaper({ pool: makePool(PG, 30), sections: specs(PG), rng: seededRng(2) });

  assert.equal(paper.length, 75);

  for (const [section, marks] of Object.entries(PG)) {
    assert.equal(paper.filter((p) => p.section === section).length, marks, section);
  }
});

test("paper has no duplicate questions, positions are 1..n and option order is a permutation", () => {
  const pool = makePool(UG, 30);
  const paper = generatePaper({ pool, sections: specs(UG), rng: seededRng(3) });

  assert.equal(new Set(paper.map((p) => p.questionId)).size, paper.length);
  assert.deepEqual(paper.map((p) => p.position), Array.from({ length: 60 }, (_, i) => i + 1));

  for (const item of paper) {
    const original = pool.find((q) => q.id === item.questionId)!;

    assert.deepEqual([...item.optionOrder].sort(), [...original.optionIds].sort());
  }
});

test("difficulty mix is honoured when the pool allows (40/40/20 of 10 = 4/4/2)", () => {
  const pool = makePool({ A: 10 }, 30);
  const paper = generatePaper({ pool, sections: [{ section: "A", marks: 10 }], rng: seededRng(4) });
  const count = (d: Difficulty) =>
    paper.filter((p) => pool.find((q) => q.id === p.questionId)!.difficulty === d).length;

  assert.deepEqual([count("EASY"), count("MEDIUM"), count("HARD")], [4, 4, 2]);
});

test("a short difficulty band is filled from the others instead of failing", () => {
  const pool: PoolQuestion[] = Array.from({ length: 6 }, (_, i) => ({
    id: `q${i}`, section: "A", difficulty: "EASY" as Difficulty, optionIds: ["a", "b"],
  }));

  assert.equal(generatePaper({ pool, sections: [{ section: "A", marks: 5 }], rng: seededRng(5) }).length, 5);
});

test("too few questions in a section raises a clear error", () => {
  const pool = makePool({ A: 10 }, 4);

  assert.throws(
    () => generatePaper({ pool, sections: [{ section: "A", marks: 10 }], rng: seededRng(6) }),
    (error: unknown) =>
      error instanceof InsufficientQuestionsError && error.section === "A" && error.available === 4,
  );
});

test("the same seed gives the same paper, a different seed a different one, and the output carries no answer key", () => {
  const pool = makePool(UG, 30);
  const a = generatePaper({ pool, sections: specs(UG), rng: seededRng(7) });
  const b = generatePaper({ pool, sections: specs(UG), rng: seededRng(7) });
  const c = generatePaper({ pool, sections: specs(UG), rng: seededRng(8) });

  assert.deepEqual(a, b);
  assert.notDeepEqual(a, c);
  assert.deepEqual(Object.keys(a[0]!).sort(), ["optionOrder", "position", "questionId", "section"]);
});

const paper = [
  { questionId: "q1", section: "A" },
  { questionId: "q2", section: "A" },
  { questionId: "q3", section: "B" },
  { questionId: "q4", section: "B" },
];
const key = new Map([["q1", "a"], ["q2", "b"], ["q3", "c"], ["q4", "d"]]);

test("scoring: 1 mark each, per-section breakdown, unanswered counts as zero", () => {
  const result = scoreAttempt({
    paper,
    answerKey: key,
    answers: new Map([["q1", "a"], ["q2", "x"], ["q3", "c"]]),
  });

  assert.equal(result.total, 2);
  assert.equal(result.max, 4);
  assert.equal(result.percentage, 50);
  assert.deepEqual(result.sections.find((s) => s.section === "A"), { section: "A", score: 1, max: 2, answered: 2, correct: 1 });
  assert.deepEqual(result.sections.find((s) => s.section === "B"), { section: "B", score: 1, max: 2, answered: 1, correct: 1 });
});

test("scoring: negative marking is off by default and floors the total at zero when on", () => {
  const wrong = new Map([["q1", "x"], ["q2", "x"], ["q3", "x"], ["q4", "x"]]);

  assert.equal(scoreAttempt({ paper, answerKey: key, answers: wrong }).total, 0);
  assert.equal(scoreAttempt({ paper, answerKey: key, answers: wrong, negativePerWrong: 0.25 }).total, 0);
  assert.equal(
    scoreAttempt({
      paper, answerKey: key, negativePerWrong: 0.25,
      answers: new Map([["q1", "a"], ["q2", "a"], ["q3", "c"], ["q4", "d"]]),
    }).total,
    2.75,
  );
});

test("scoring: a missing answer key is an error, not a silent zero", () => {
  assert.throws(() => scoreAttempt({ paper, answerKey: new Map(), answers: new Map() }), /Missing answer key/);
});

test("ranking: score only, equal scores share a rank (competition ranking 1, 2, 2, 4); time is ignored", () => {
  const ranks = rankAttempts([
    { id: "a", score: 50, timeTakenSeconds: 3000 },
    { id: "b", score: 55, timeTakenSeconds: 3500 },
    { id: "c", score: 50, timeTakenSeconds: 2500 },
    { id: "d", score: 40, timeTakenSeconds: 100 },
  ]);

  assert.deepEqual([ranks.get("b"), ranks.get("a"), ranks.get("c"), ranks.get("d")], [1, 2, 2, 4]);
  assert.equal(rankAttempts([]).size, 0);

  assert.deepEqual([...rankAttempts([{ id: "x", score: 9 }, { id: "y", score: 9 }]).values()], [1, 1]);
});

test("timer: deadline, grace window, remaining time and auto-submit", () => {
  const start = new Date("2026-10-12T05:00:00Z");
  const deadline = computeDeadline(start, 60);

  assert.equal(deadline.toISOString(), "2026-10-12T06:00:00.000Z");
  assert.ok(isAnswerAccepted(new Date("2026-10-12T06:00:29.999Z"), deadline));
  assert.equal(isAnswerAccepted(new Date("2026-10-12T06:00:30Z"), deadline), false, "the cutoff itself is expired");
  assert.equal(isAnswerAccepted(new Date("2026-10-12T06:00:30.001Z"), deadline), false);
  assert.equal(remainingSeconds(new Date("2026-10-12T05:59:30Z"), deadline), 30);
  assert.equal(remainingSeconds(new Date("2026-10-12T07:00:00Z"), deadline), 0);
  assert.equal(shouldAutoSubmit(new Date("2026-10-12T05:59:59Z"), deadline), false);
  assert.equal(shouldAutoSubmit(new Date("2026-10-12T06:00:00Z"), deadline), true);
  assert.throws(() => computeDeadline(start, 0));
});

test("timer: resuming reports the same remaining time regardless of when/where the client reconnects", () => {
  const deadline = computeDeadline(new Date("2026-10-12T05:00:00Z"), 75);

  assert.equal(remainingSeconds(new Date("2026-10-12T05:30:00Z"), deadline), 45 * 60);
});

const PEPPER = "unit-test-pepper";
const EMAIL = "Asha@Example.com";

test("otp: 6 digits, 5-minute expiry", () => {
  for (let i = 0; i < 50; i += 1) {
    assert.match(generateOtp(), /^\d{6}$/);
  }

  const now = new Date("2026-10-12T05:00:00Z");

  assert.equal(otpExpiry(now).getTime() - now.getTime(), OTP_TTL_SECONDS * 1000);
  assert.equal(OTP_TTL_SECONDS, 300);
});

test("otp: verdicts for valid, wrong, expired, used and over-attempted codes", () => {
  const now = new Date("2026-10-12T05:00:00Z");
  const base = { codeHash: hashOtp("123456", PEPPER, EMAIL), expiresAt: otpExpiry(now), attempts: 0, usedAt: null };
  const run = (record: typeof base | { codeHash: string; expiresAt: Date; attempts: number; usedAt: Date | null }, code: string, at = now) =>
    evaluateOtp({ record, code, pepper: PEPPER, subject: EMAIL, now: at });

  assert.equal(run(base, "123456"), "VALID");
  assert.equal(run(base, "654321"), "INVALID");
  assert.equal(run(base, "123456", new Date(now.getTime() + 301_000)), "EXPIRED");
  assert.equal(run({ ...base, usedAt: now }, "123456"), "ALREADY_USED");
  assert.equal(run({ ...base, attempts: 5 }, "123456"), "TOO_MANY_ATTEMPTS");
});

test("otp: the stored value is a hash bound to the recipient and pepper, never the code", () => {
  const hash = hashOtp("123456", PEPPER, EMAIL);

  assert.equal(hash.includes("123456"), false);
  assert.equal(hash, hashOtp("123456", PEPPER, "asha@example.com"));
  assert.notEqual(hash, hashOtp("123456", PEPPER, "other@example.com"));
  assert.notEqual(hash, hashOtp("123456", "different-pepper", EMAIL));
});

test("level suggestion follows the SRS mapping", () => {
  assert.equal(suggestLevel("BCA"), "UG");
  assert.equal(suggestLevel("B.Sc IT"), "UG");
  assert.equal(suggestLevel("MCA"), "PG");
  assert.equal(suggestLevel("M.Sc CS"), "PG");
  assert.equal(suggestLevel("B.E/B.Tech"), null);
  assert.equal(suggestLevel("Other"), null);
});

test("mobile numbers: 10-digit Indian format, common prefixes tolerated", () => {
  const schema = buildRegistrationSchema(new Date("2026-10-12"));
  const base = valid();
  const mobile = (m: string) => schema.safeParse({ ...base, mobile: m });

  assert.equal(mobile("9876543210").success, true);
  assert.equal(mobile("+91 98765 43210").success, true);
  assert.equal(mobile("098765-43210").success, true);
  assert.equal(normalizeMobile("+919876543210"), "9876543210");
  assert.equal(mobile("5876543210").success, false);
  assert.equal(mobile("98765").success, false);
  assert.equal(mobile("abcdefghij").success, false);
});

function valid() {
  return {
    fullName: "Asha Rao", mobile: "9876543210", email: " Asha@Example.com ",
    collegeName: "Demo Engineering College", city: "Coimbatore",
    qualification: "BCA", department: "Computer Science", passingYear: 2026,
    skills: ["Java", "SQL"], experience: "FRESHER", level: "UG", consent: true,
  };
}

test("registration: valid input is accepted and normalised (email lower-cased/trimmed)", () => {
  const result = buildRegistrationSchema(new Date("2026-10-12")).safeParse(valid());

  assert.equal(result.success, true);
  assert.equal(result.success && result.data.email, "asha@example.com");
});

test("registration: consent, experience years, college, passing year and email are enforced", () => {
  const schema = buildRegistrationSchema(new Date("2026-10-12"));
  const fails = (patch: object) => schema.safeParse({ ...valid(), ...patch }).success === false;

  assert.ok(fails({ consent: false }));
  assert.ok(fails({ experience: "EXPERIENCED" }));
  assert.equal(schema.safeParse({ ...valid(), experience: "EXPERIENCED", yearsOfExperience: 2 }).success, true);
  assert.ok(fails({ collegeName: undefined }));
  assert.ok(fails({ passingYear: 1990 }));
  assert.ok(fails({ passingYear: 2040 }));
  assert.ok(fails({ email: "not-an-email" }));
  assert.ok(fails({ qualification: "PhD" }));
  assert.ok(fails({ level: "XX" }));
  assert.ok(fails({ fullName: "A" }));
});

test("access code: 6 characters, no look-alikes, normalised and compared safely", () => {
  for (let i = 0; i < 200; i += 1) {
    const code = generateAccessCode();

    assert.match(code, /^[A-HJ-KM-NP-Z2-9]{6}$/);
    assert.ok(isValidAccessCodeFormat(code));
  }

  assert.ok(accessCodeMatches(" ab c2 34 ", "ABC234"));
  assert.equal(accessCodeMatches("ABC235", "ABC234"), false);
  assert.equal(accessCodeMatches("ABC23", "ABC234"), false);
  assert.equal(isValidAccessCodeFormat("ABC0O1"), false);
});

test("application number format matches the SRS example", () => {
  assert.equal(formatApplicationNumber(2026, 123), "WMC-2026-00123");
  assert.equal(formatApplicationNumber(2026, 1), "WMC-2026-00001");
  assert.throws(() => formatApplicationNumber(2026, 0));
});
