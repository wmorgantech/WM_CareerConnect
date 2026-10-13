import { z } from "zod";

import { TOPIC_KEYS } from "../../domain/assessment-config.js";
import { CsvError, csvEscape, parseCsv } from "../../domain/csv-parse.js";
import {
  MAX_QUESTION_TEXT,
  MAX_SNIPPET,
  checkOptions,
} from "../../domain/question-validation.js";
import { writeAudit, type AuditActor } from "../../lib/audit.js";
import { HttpError, validationError } from "../../lib/http-error.js";
import { asAuditDb, rdb } from "../../lib/recruitment-db.js";

type Row = Record<string, any>;

export const IMPORT_COLUMNS = [
  "level",
  "section",
  "topic",
  "difficulty",
  "text",
  "codeSnippet",
  "optionA",
  "optionB",
  "optionC",
  "optionD",
  "correct",
  "explanation",
] as const;

export const MAX_IMPORT_ROWS = 500;
export const MAX_IMPORT_BYTES = 1_000_000;

export type ImportRowError = { row: number; field: string; message: string };

export const importSchema = z.object({
  rows: z.array(z.record(z.string(), z.unknown())).max(MAX_IMPORT_ROWS).optional(),
  dryRun: z.boolean().default(true),

activate: z.boolean().default(false),
});

export function importTemplateCsv(): string {
  const example = [
    "BOTH", "oop", "Classes", "EASY",
    "Which keyword is used to create an object in Java?",
    "", "new", "class", "this", "static", "A",
    "The new keyword allocates a new object.",
  ];

  return [IMPORT_COLUMNS.join(","), example.map(csvEscape).join(",")].join("\r\n") + "\r\n";
}

type Parsed = {
  level: "UG" | "PG" | "BOTH";
  section: string;
  topic: string | null;
  difficulty: "EASY" | "MEDIUM" | "HARD";
  text: string;
  codeSnippet: string | null;
  options: string[];
  correctIndex: number;
  explanation: string | null;
};

const normalise = (t: string) => t.trim().replace(/\s+/g, " ").toLowerCase();

function toRecords(input: { csv?: string | undefined; rows?: Record<string, unknown>[] | undefined }) {
  if (input.csv !== undefined) {
    if (Buffer.byteLength(input.csv) > MAX_IMPORT_BYTES) {
      throw new HttpError(413, "IMPORT_TOO_LARGE", "The file is too large (limit 1 MB)");
    }

    let table: string[][];

    try {
      table = parseCsv(input.csv, MAX_IMPORT_ROWS + 1);
    } catch (error) {
      if (error instanceof CsvError) throw new HttpError(400, "INVALID_CSV", error.message);

      throw error;
    }

    const header = (table[0] ?? []).map((h) => h.trim());
    const missing = IMPORT_COLUMNS.filter((c) => c !== "topic" && c !== "codeSnippet" && c !== "explanation" && !header.includes(c));

    if (missing.length > 0) {
      throw new HttpError(400, "INVALID_CSV", `Missing column(s): ${missing.join(", ")}. Download the template for the expected header.`);
    }

    if (table.length - 1 > MAX_IMPORT_ROWS) {
      throw new HttpError(400, "IMPORT_TOO_LARGE", `At most ${MAX_IMPORT_ROWS} questions per import`);
    }

    return table.slice(1).map((cells) => Object.fromEntries(header.map((h, i) => [h, (cells[i] ?? "").trim()])) as Record<string, unknown>);
  }

  return (input.rows ?? []) as Record<string, unknown>[];
}

function parseRow(raw: Record<string, unknown>, rowNumber: number, errors: ImportRowError[]): Parsed | null {
  const before = errors.length;
  const text = (key: string) => (typeof raw[key] === "string" ? (raw[key] as string).trim() : raw[key] == null ? "" : String(raw[key]).trim());
  const fail = (field: string, message: string) => errors.push({ row: rowNumber, field, message });

  const level = text("level").toUpperCase();
  const difficulty = text("difficulty").toUpperCase();
  const section = text("section").toLowerCase();
  const body = text("text");
  const snippet = text("codeSnippet");
  const letter = text("correct").toUpperCase();

  if (!["UG", "PG", "BOTH"].includes(level)) fail("level", "Level must be UG, PG or BOTH");
  if (!["EASY", "MEDIUM", "HARD"].includes(difficulty)) fail("difficulty", "Difficulty must be EASY, MEDIUM or HARD");
  if (!TOPIC_KEYS.includes(section)) fail("section", `Section must be one of: ${TOPIC_KEYS.join(", ")}`);
  if (!body) fail("text", "The question text is required");
  else if (body.length > MAX_QUESTION_TEXT) fail("text", `The question must not exceed ${MAX_QUESTION_TEXT} characters`);
  if (snippet.length > MAX_SNIPPET) fail("codeSnippet", `The code snippet must not exceed ${MAX_SNIPPET} characters`);

  const options = ["optionA", "optionB", "optionC", "optionD"].map(text);
  const correctIndex = "ABCD".indexOf(letter);

  if (letter.length !== 1 || correctIndex < 0) fail("correct", "Correct must be A, B, C or D");

  for (const issue of checkOptions(options, correctIndex)) {
    if (issue.field.startsWith("options.")) {
      fail(`option${"ABCD"[Number(issue.field.split(".")[1])]}`, issue.message);
    } else if (issue.field !== "correctIndex") {
      fail(issue.field, issue.message);
    }
  }

  if (errors.length > before) return null;

  return {
    level: level as Parsed["level"],
    section,
    topic: text("topic") || null,
    difficulty: difficulty as Parsed["difficulty"],
    text: body,
    codeSnippet: snippet || null,
    options,
    correctIndex,
    explanation: text("explanation") || null,
  };
}

export async function importQuestions(
  input: { csv?: string | undefined; rows?: Record<string, unknown>[] | undefined; dryRun: boolean; activate: boolean },
  actor: AuditActor = {},
) {
  const records = toRecords(input);

  if (records.length === 0) throw new HttpError(400, "IMPORT_EMPTY", "There are no questions to import");

  const errors: ImportRowError[] = [];
  const parsed: { row: number; question: Parsed }[] = [];

  records.forEach((raw, i) => {
    const question = parseRow(raw, i + 2, errors);

    if (question) parsed.push({ row: i + 2, question });
  });

const existing: Row[] = await rdb().question.findMany({ where: { deletedAt: null } });
  const known = new Set(existing.map((q) => `${q.level}|${q.section}|${normalise(q.text)}`));
  const seen = new Map<string, number>();

  for (const { row, question } of parsed) {
    const key = `${question.level}|${question.section}|${normalise(question.text)}`;

    if (known.has(key)) errors.push({ row, field: "text", message: "This question is already in the bank" });
    else if (seen.has(key)) errors.push({ row, field: "text", message: `Same as row ${seen.get(key)}` });

    seen.set(key, seen.get(key) ?? row);
  }

  errors.sort((a, b) => a.row - b.row);

  const summary = {
    total: records.length,
    valid: records.length - new Set(errors.map((e) => e.row)).size,
    errors,
  };

  if (input.dryRun) return { dryRun: true as const, imported: 0, ...summary };

if (errors.length > 0) {
    throw validationError(
      errors.slice(0, 50).map((e) => ({ field: `row ${e.row} ${e.field}`, message: e.message })),
      `${new Set(errors.map((e) => e.row)).size} row(s) have problems; nothing was imported`,
    );
  }

  await rdb().$transaction(async (tx) => {
    for (const { question } of parsed) {
      const created: Row = await tx.question.create({
        data: {
          level: question.level,
          section: question.section,
          difficulty: question.difficulty,
          type: "MCQ_SINGLE",
          text: question.text,
          isActive: input.activate,
          ...(question.topic ? { topic: question.topic } : {}),
          ...(question.codeSnippet ? { codeSnippet: question.codeSnippet } : {}),
          ...(question.explanation ? { explanation: question.explanation } : {}),
        },
      });

      for (let i = 0; i < 4; i += 1) {
        await tx.questionOption.create({
          data: { questionId: created.id, text: question.options[i] as string, isCorrect: i === question.correctIndex, position: i + 1 },
        });
      }
    }

    await writeAudit(asAuditDb(tx), actor, {
      action: "QUESTIONS_IMPORTED",
      entity: "Question",
      details: { count: parsed.length, activated: input.activate },
    });
  });

  return { dryRun: false as const, imported: parsed.length, ...summary };
}
