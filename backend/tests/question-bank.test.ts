
import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { validateTemplateConfig, PROPOSED_UG_MARKS, PROPOSED_PG_COUNTS } from "../src/domain/assessment-config.js";
import { checkOptions } from "../src/domain/question-validation.js";
import { computeCapacity } from "../src/domain/template-capacity.js";
import { createMemoryDb, type MemoryDb } from "./helpers/memory-db.js";
import { api, fourOptions, questionBody, staff } from "./helpers/http.js";

let db: MemoryDb | null = null;

afterEach(() => {
  db?.restore();
  db = null;
});

const fresh = () => (db = createMemoryDb());

describe("question validation (pure)", () => {
  it("needs exactly four distinct non-empty options and exactly one correct", () => {
    assert.deepEqual(checkOptions(["a", "b", "c", "d"], 2), []);
    assert.equal(checkOptions(["a", "b", "c"], 0)[0]?.field, "options");
    assert.equal(checkOptions(["a", "b", "c", "d", "e"], 0)[0]?.field, "options");
    assert.ok(checkOptions(["a", "b", "c", " "], 0).some((i) => i.field === "options.3"));
    assert.ok(checkOptions(["a", "A ", "c", "d"], 0).some((i) => i.message === "Options must all be different"));
    assert.ok(checkOptions(["a", "b", "c", "d"], 4).some((i) => i.field === "correctIndex"));
    assert.ok(checkOptions(["a", "b", "c", "d"], -1).some((i) => i.field === "correctIndex"));
  });
});

describe("template configuration rules (pure)", () => {
  const sections = (spec: Record<string, [number, number]>) => Object.entries(spec).map(([key, [questionCount, marksPerQuestion]]) => ({ key, title: key, questionCount, marksPerQuestion }));
  const base = { durationMinutes: 60, difficulty: { easyPct: 60, mediumPct: 40, hardPct: 0 }, negativeMarking: 0 };

  it("UG must be 45 questions, 60 marks and exactly 60 minutes", () => {
    const m1 = sections({ oop: [10, 1], html: [10, 1], css: [10, 1], javascript: [15, 2] });

    assert.deepEqual(validateTemplateConfig({ ...base, level: "UG", sections: m1 }), []);
    assert.ok(validateTemplateConfig({ ...base, level: "UG", sections: sections({ oop: [10, 1], html: [10, 1], css: [10, 1], javascript: [15, 1] }) }).some((i) => /45 questions|60 marks/.test(i.message)));
    assert.ok(validateTemplateConfig({ ...base, level: "UG", durationMinutes: 70, sections: m1 }).some((i) => i.field === "durationMinutes"));
    for (const minutes of [0, 45, 59, 61, 75]) {
      assert.ok(validateTemplateConfig({ ...base, level: "UG", durationMinutes: minutes, sections: m1 }).some((i) => i.field === "durationMinutes" && /fixed at 60/.test(i.message)), `UG ${minutes} minutes is refused`);
    }
    assert.ok(validateTemplateConfig({ ...base, level: "UG", sections: sections({ oop: [10, 1], html: [10, 1], css: [10, 1], javascript: [14, 2] }) }).length > 0);
  });

  it("PG must be 75 questions in exactly 75 minutes; its total marks are not fixed", () => {
    const pg = { ...base, durationMinutes: 75 };
    const counts = Object.fromEntries(Object.entries(PROPOSED_PG_COUNTS).map(([k, n]) => [k, [n, 1] as [number, number]]));

    assert.deepEqual(validateTemplateConfig({ ...pg, level: "PG", sections: sections(counts) }), []);
    assert.deepEqual(validateTemplateConfig({ ...pg, level: "PG", sections: sections({ ...counts, javascript: [30, 2] }) }), [], "other PG weights are allowed");
    assert.ok(validateTemplateConfig({ ...pg, level: "PG", sections: sections({ ...counts, javascript: [29, 1] }) }).some((i) => /75 questions/.test(i.message)));
    for (const minutes of [60, 70, 74, 76, 90]) {
      assert.ok(validateTemplateConfig({ ...pg, level: "PG", durationMinutes: minutes, sections: sections(counts) }).some((i) => i.field === "durationMinutes" && /fixed at 75/.test(i.message)), `PG ${minutes} minutes is refused`);
    }
  });

  it("rejects unknown topics, repeated topics, bad percentages and negative marking", () => {
    const m1 = sections({ oop: [10, 1], html: [10, 1], css: [10, 1], javascript: [15, 2] });

    assert.ok(validateTemplateConfig({ ...base, level: "UG", sections: [...m1.slice(0, 3), { ...m1[3]!, key: "sql" }] }).some((i) => i.field === "sections.3.key"));
    assert.ok(validateTemplateConfig({ ...base, level: "UG", sections: [m1[0]!, m1[0]!, m1[2]!, m1[3]!] }).some((i) => /only once/.test(i.message)));
    assert.ok(validateTemplateConfig({ ...base, level: "UG", difficulty: { easyPct: 50, mediumPct: 40, hardPct: 0 }, sections: m1 }).some((i) => i.field === "difficulty"));
    assert.ok(validateTemplateConfig({ ...base, level: "UG", negativeMarking: -1, sections: m1 }).some((i) => i.field === "negativeMarking"));
  });

  it("the proposed UG weights are only a proposal that totals 45 questions and 60 marks", () => {
    const q = Object.values(PROPOSED_UG_MARKS).reduce((n, s) => n + s.count, 0);
    const m = Object.values(PROPOSED_UG_MARKS).reduce((n, s) => n + s.count * s.marksPerQuestion, 0);

    assert.deepEqual([q, m], [45, 60]);
  });

  it("capacity: a section shortage is an error, a thin difficulty band only a warning", () => {
    const pool = [
      ...Array.from({ length: 4 }, () => ({ section: "oop", difficulty: "EASY" as const })),
      ...Array.from({ length: 1 }, () => ({ section: "oop", difficulty: "MEDIUM" as const })),
      ...Array.from({ length: 2 }, () => ({ section: "html", difficulty: "EASY" as const })),
    ];
    const report = computeCapacity([{ key: "oop", questionCount: 4 }, { key: "html", questionCount: 3 }], pool, { easyPct: 50, mediumPct: 50, hardPct: 0 });

    assert.equal(report.ok, false);
    assert.equal(report.sections[0]?.shortage, 0);
    assert.equal(report.sections[1]?.shortage, 1);
    assert.ok(report.warnings.some((w) => w.startsWith("oop:")), "oop has only 1 medium for 2 wanted");
  });
});

describe("Question Bank API", () => {
  it("is Super Admin only: every other role gets 403 and nothing changes", async () => {
    const d = fresh();

    await api(async (call) => {
      for (const role of ["HR_ADMIN", "CAMPUS_COORDINATOR", "INTERVIEWER", "HOD", "STAFF"] as const) {
        const { token } = staff(d, role);

        assert.equal((await call("GET", "/questions", { token })).status, 403, role);
        assert.equal((await call("POST", "/questions", { token, body: questionBody() })).status, 403, role);
        assert.equal((await call("GET", "/test-templates", { token })).status, 403, role);
      }
      assert.equal((await call("GET", "/questions")).status, 401);
    });
    assert.equal(d.rows("question").length, 0);
    assert.equal(d.state.auditLog.length, 0);
  });

  it("creates a question with four options and one correct answer, audited, newest first", async () => {
    const d = fresh();
    const { token } = staff(d, "SUPER_ADMIN");

    await api(async (call) => {
      const created = await call("POST", "/questions", { token, body: questionBody({ codeSnippet: "console.log(1)" }) });

      assert.equal(created.status, 201);
      assert.equal(created.json.data.options.length, 4);
      assert.equal(created.json.data.correctIndex, 1);
      assert.equal(created.json.data.options.filter((o: any) => o.isCorrect).length, 1);
      assert.deepEqual(created.json.data.options.map((o: any) => o.position), [1, 2, 3, 4]);

      const list = await call("GET", "/questions?section=oop&level=BOTH&page=1&limit=10", { token });

      assert.equal(list.status, 200);
      assert.equal(list.json.pagination.total, 1);
    });
    assert.deepEqual(d.state.auditLog.map((a) => a.action), ["QUESTION_CREATED"]);
    assert.equal(JSON.stringify(d.state.auditLog).includes("Which keyword"), false, "question text is not audited");
  });

  it("rejects bad questions with field errors and stores nothing", async () => {
    const d = fresh();
    const { token } = staff(d, "SUPER_ADMIN");
    const cases: [string, Record<string, unknown>][] = [
      ["three options", { options: ["a", "b", "c"], correctIndex: 0 }],
      ["five options", { options: ["a", "b", "c", "d", "e"], correctIndex: 0 }],
      ["duplicate options", { options: ["a", "A", "c", "d"], correctIndex: 0 }],
      ["empty option", { options: ["a", "b", "c", "  "], correctIndex: 0 }],
      ["correct index out of range", { correctIndex: 4 }],
      ["unknown section", { section: "sql" }],
      ["unknown level", { level: "MBA" }],
      ["empty text", { text: "   " }],
    ];

    await api(async (call) => {
      for (const [label, over] of cases) {
        const res = await call("POST", "/questions", { token, body: questionBody(over) });

        assert.equal(res.status, 400, label);
        assert.equal(res.json.error.code, "VALIDATION_ERROR", label);
      }
    });
    assert.equal(d.rows("question").length, 0);
    assert.equal(d.rows("questionOption").length, 0);
  });

  it("edits an unused question in place: option ids stay, exactly one stays correct", async () => {
    const d = fresh();
    const { token } = staff(d, "SUPER_ADMIN");
    const { question, options } = d.addQuestion();

    await api(async (call) => {
      const res = await call("PATCH", `/questions/${question.id}`, { token, body: { options: ["w", "x", "y", "z"], correctIndex: 3, difficulty: "MEDIUM" } });

      assert.equal(res.status, 200);
      assert.equal(res.json.data.correctIndex, 3);
      assert.deepEqual(res.json.data.options.map((o: any) => o.id), options.map((o) => o.id));
      assert.equal(res.json.data.options.filter((o: any) => o.isCorrect).length, 1);
    });
  });

  it("a question already on a paper is frozen: text and options 409, metadata still editable", async () => {
    const d = fresh();
    const { token } = staff(d, "SUPER_ADMIN");
    const { question } = d.addQuestion();

    d.insert("attemptQuestion", { attemptId: "a1", questionId: question.id, section: "oop", position: 1, optionOrder: [] });

    await api(async (call) => {
      assert.equal((await call("PATCH", `/questions/${question.id}`, { token, body: { text: "Changed wording?" } })).json.error.code, "QUESTION_IN_USE");
      assert.equal((await call("PATCH", `/questions/${question.id}`, { token, body: { correctIndex: 2 } })).status, 409);
      assert.equal((await call("PATCH", `/questions/${question.id}`, { token, body: { explanation: "More detail", topic: "Classes" } })).status, 200);
      assert.equal((await call("PATCH", `/questions/${question.id}/status`, { token, body: { isActive: false } })).status, 200);
      assert.equal((await call("DELETE", `/questions/${question.id}`, { token })).json.error.code, "QUESTION_IN_USE");
    });
    assert.equal(d.rows("question")[0]!.text.startsWith("Question"), true, "text unchanged");
    assert.equal(d.rows("question")[0]!.deletedAt, null);
  });

  it("an unused question can be soft-deleted and disappears from lists", async () => {
    const d = fresh();
    const { token } = staff(d, "SUPER_ADMIN");
    const { question } = d.addQuestion();

    await api(async (call) => {
      assert.equal((await call("DELETE", `/questions/${question.id}`, { token })).status, 200);
      assert.equal((await call("GET", `/questions/${question.id}`, { token })).status, 404);
      assert.equal((await call("GET", "/questions", { token })).json.pagination.total, 0);
    });
    assert.ok(d.rows("question")[0]!.deletedAt, "row kept, soft deleted");
  });

  it("a stale edit loses: 409 QUESTION_CHANGED and the other change is kept", async () => {
    const d = fresh();
    const { token } = staff(d, "SUPER_ADMIN");
    const { question } = d.addQuestion();
    const original = d.client.question.updateMany;

    d.client.question.updateMany = async (args: any) => {
      d.rows("question")[0]!.updatedAt = new Date(Date.now() + 5000);

      return original(args);
    };

    await api(async (call) => {
      const res = await call("PATCH", `/questions/${question.id}`, { token, body: { difficulty: "MEDIUM" } });

      assert.equal(res.status, 409);
      assert.equal(res.json.error.code, "QUESTION_CHANGED");
    });
    assert.equal(d.rows("question")[0]!.difficulty, "EASY");
  });

  it("summary counts usable questions per level, section and difficulty", async () => {
    const d = fresh();
    const { token } = staff(d, "SUPER_ADMIN");

    d.addQuestions(3, { level: "UG", section: "css" });
    d.addQuestion({ level: "UG", section: "css", difficulty: "MEDIUM", isActive: false });

    await api(async (call) => {
      const res = await call("GET", "/questions/summary", { token });

      assert.equal(res.json.data.UG.css.total, 3, "inactive questions are not counted");
    });
  });
});

describe("Test Templates API", () => {
  const ugBody = (over: Record<string, unknown> = {}) => ({
    name: "UG Web Fundamentals",
    level: "UG",
    durationMinutes: 60,
    easyPct: 60,
    mediumPct: 40,
    hardPct: 0,
    sections: [
      { key: "oop", questionCount: 10, marksPerQuestion: 1 },
      { key: "html", questionCount: 10, marksPerQuestion: 1 },
      { key: "css", questionCount: 10, marksPerQuestion: 1 },
      { key: "javascript", questionCount: 15, marksPerQuestion: 2 },
    ],
    ...over,
  });

  it("creates a valid UG template with derived totals and rejects invalid ones", async () => {
    const d = fresh();
    const { token } = staff(d, "SUPER_ADMIN");

    await api(async (call) => {
      const ok = await call("POST", "/test-templates", { token, body: ugBody() });

      assert.equal(ok.status, 201);
      assert.equal(ok.json.data.questionCount, 45);
      assert.equal(ok.json.data.totalMarks, 60);
      assert.equal(ok.json.data.sections.length, 4);

      const long = await call("POST", "/test-templates", { token, body: ugBody({ name: "Too long", durationMinutes: 90 }) });
      const marks = await call("POST", "/test-templates", { token, body: ugBody({ name: "Wrong marks", sections: [{ key: "oop", questionCount: 45, marksPerQuestion: 1 }] }) });

      assert.equal(long.status, 400);
      assert.ok(long.json.error.details.fieldErrors.durationMinutes);
      assert.equal(marks.status, 400);
      assert.ok(marks.json.error.details.fieldErrors.sections.some((m: string) => /60 marks/.test(m)));
      assert.equal((await call("POST", "/test-templates", { token, body: ugBody() })).json.error.code, "TEMPLATE_NAME_TAKEN");
    });
    assert.equal(d.rows("testTemplate").length, 1);
    assert.equal(d.rows("testTemplateSection").length, 4);
  });

  it("fixes the duration by level: omitted means 60 (UG) or 75 (PG), any other value is refused on create and update", async () => {
    const d = fresh();
    const { token } = staff(d, "SUPER_ADMIN");
    const { durationMinutes: _omit, ...ugNoDuration } = ugBody({ name: "UG default" });
    const pgBody = (over: Record<string, unknown> = {}) => ({
      name: "PG Web",
      level: "PG",
      easyPct: 60,
      mediumPct: 40,
      hardPct: 0,
      sections: [
        { key: "oop", questionCount: 15, marksPerQuestion: 1 },
        { key: "html", questionCount: 15, marksPerQuestion: 1 },
        { key: "css", questionCount: 15, marksPerQuestion: 1 },
        { key: "javascript", questionCount: 30, marksPerQuestion: 1 },
      ],
      ...over,
    });

    await api(async (call) => {
      const ug = await call("POST", "/test-templates", { token, body: ugNoDuration });
      const pg = await call("POST", "/test-templates", { token, body: pgBody() });

      assert.equal(ug.status, 201);
      assert.equal(ug.json.data.durationMinutes, 60);
      assert.equal(pg.status, 201, JSON.stringify(pg.json));
      assert.equal(pg.json.data.durationMinutes, 75);
      assert.equal(pg.json.data.questionCount, 75);
      assert.equal(pg.json.data.totalMarks, 75, "PG marks are whatever the sections add up to; nothing is imposed");

      for (const [label, body] of [
        ["UG 70", ugBody({ name: "UG 70", durationMinutes: 70 })],
        ["UG 75", ugBody({ name: "UG 75", durationMinutes: 75 })],
        ["PG 60", pgBody({ name: "PG 60", durationMinutes: 60 })],
        ["PG 70", pgBody({ name: "PG 70", durationMinutes: 70 })],
      ] as const) {
        const res = await call("POST", "/test-templates", { token, body });

        assert.equal(res.status, 400, label);
        assert.ok(res.json.error.details.fieldErrors.durationMinutes, label);
      }

      assert.equal((await call("PATCH", `/test-templates/${ug.json.data.id}`, { token, body: { durationMinutes: 70 } })).status, 400);
      assert.equal((await call("PATCH", `/test-templates/${pg.json.data.id}`, { token, body: { durationMinutes: 60 } })).status, 400);
      assert.equal((await call("PATCH", `/test-templates/${pg.json.data.id}`, { token, body: { name: "PG renamed" } })).json.data.durationMinutes, 75);

      const toPg = await call("PATCH", `/test-templates/${ug.json.data.id}`, { token, body: { level: "PG", sections: pgBody().sections } });

      assert.equal(toPg.status, 200, JSON.stringify(toPg.json));
      assert.equal(toPg.json.data.durationMinutes, 75, "an unused template that changes level takes the new level's duration");
    });
    assert.equal(d.rows("testTemplate").length, 2);
  });

  it("repairs a template saved with another duration the next time it is saved", async () => {
    const d = fresh();
    const { token } = staff(d, "SUPER_ADMIN");
    const legacy = d.addTemplate({ level: "UG", name: "Legacy UG", durationMinutes: 70 }, [{ key: "oop", count: 10, marksPerQuestion: 1 }, { key: "html", count: 10, marksPerQuestion: 1 }, { key: "css", count: 10, marksPerQuestion: 1 }, { key: "javascript", count: 15, marksPerQuestion: 2 }]);

    await api(async (call) => {
      const res = await call("PATCH", `/test-templates/${legacy.id}`, { token, body: { name: "Legacy UG fixed" } });

      assert.equal(res.status, 200, JSON.stringify(res.json));
      assert.equal(res.json.data.durationMinutes, 60);
    });
  });

  it("capacity reports exactly which sections the bank cannot fill", async () => {
    const d = fresh();
    const { token } = staff(d, "SUPER_ADMIN");
    const t = d.addTemplate({ level: "UG" }, [{ key: "oop", count: 3, marksPerQuestion: 1 }, { key: "html", count: 2, marksPerQuestion: 1 }]);

    d.addQuestions(3, { section: "oop", level: "UG" });
    d.addQuestions(1, { section: "html", level: "BOTH" });
    d.addQuestion({ section: "html", level: "PG" });
    d.addQuestion({ section: "html", level: "UG", isActive: false });

    await api(async (call) => {
      const res = await call("GET", `/test-templates/${t.id}/capacity`, { token });

      assert.equal(res.status, 200);
      assert.equal(res.json.data.ok, false);
      assert.deepEqual(res.json.data.sections.map((s: any) => [s.key, s.available, s.shortage]), [["oop", 3, 0], ["html", 1, 1]]);
    });
  });

  it("lifecycle: no edit during a live attempt, level locked once used, delete only when never used", async () => {
    const d = fresh();
    const { token } = staff(d, "SUPER_ADMIN");
    const t = d.addTemplate({ level: "PG" }, [{ key: "oop", count: 75, marksPerQuestion: 1 }]);

    await api(async (call) => {
      assert.equal((await call("PATCH", `/test-templates/${t.id}`, { token, body: { name: "PG renamed" } })).status, 200);

      d.insert("testAttempt", { applicationId: "app-1", templateId: t.id, startedAt: new Date(), deadline: new Date(Date.now() + 1000) });
      assert.equal((await call("PATCH", `/test-templates/${t.id}`, { token, body: { name: "During test" } })).json.error.code, "TEMPLATE_IN_USE");

      d.rows("testAttempt")[0]!.status = "SUBMITTED";
      assert.equal((await call("PATCH", `/test-templates/${t.id}`, { token, body: { level: "UG" } })).json.error.code, "TEMPLATE_LEVEL_LOCKED");
      assert.equal((await call("DELETE", `/test-templates/${t.id}`, { token })).json.error.code, "TEMPLATE_IN_USE");

      const loose = d.addTemplate({ level: "UG", name: "Unused" });

      assert.equal((await call("DELETE", `/test-templates/${loose.id}`, { token })).status, 200);
    });
  });

  it("a template used by a published drive cannot be deactivated", async () => {
    const d = fresh();
    const { token } = staff(d, "SUPER_ADMIN");
    const t = d.addTemplate({ level: "UG" });
    const drive = d.addDrive({ status: "PUBLISHED" });

    d.insert("driveTemplate", { driveId: drive.id, level: "UG", templateId: t.id });

    await api(async (call) => {
      assert.equal((await call("PATCH", `/test-templates/${t.id}/status`, { token, body: { isActive: false } })).json.error.code, "TEMPLATE_ASSIGNED_TO_LIVE_DRIVE");
    });
    assert.equal(d.rows("testTemplate")[0]!.isActive, true);
  });
});
