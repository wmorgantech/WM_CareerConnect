import { checkOptions } from "../../domain/question-validation.js";
import {
  changedFields,
  writeAudit,
  type AuditActor,
} from "../../lib/audit.js";
import { HttpError, validationError } from "../../lib/http-error.js";
import { asAuditDb, rdb } from "../../lib/recruitment-db.js";

import type {
  CreateQuestionInput,
  QuestionListQuery,
  UpdateQuestionInput,
} from "./questions.schema.js";

type Row = Record<string, any>;

function format(question: Row, options: Row[], used: boolean) {
  const ordered = [...options].sort((a, b) => a.position - b.position);

  return {
    id: question.id,
    level: question.level,
    section: question.section,
    topic: question.topic,
    difficulty: question.difficulty,
    type: question.type,
    text: question.text,
    codeSnippet: question.codeSnippet,
    explanation: question.explanation,
    isActive: question.isActive,
    usedInAttempts: used,
    createdAt: question.createdAt,
    updatedAt: question.updatedAt,
    correctIndex: ordered.findIndex((o) => o.isCorrect),
    options: ordered.map((o) => ({
      id: o.id,
      text: o.text,
      position: o.position,
      isCorrect: o.isCorrect,
    })),
  };
}

async function usedIds(questionIds: string[]): Promise<Set<string>> {
  if (questionIds.length === 0) return new Set();

  const rows: Row[] = await rdb().attemptQuestion.findMany({
    where: { questionId: { in: questionIds } },
  });

  return new Set(rows.map((r) => r.questionId));
}

export async function listQuestions(query: QuestionListQuery) {
  const where: Row = { deletedAt: null };

  if (query.level) where.level = query.level;
  if (query.section) where.section = query.section;
  if (query.difficulty) where.difficulty = query.difficulty;
  if (query.isActive !== undefined) where.isActive = query.isActive;
  if (query.search) where.text = { contains: query.search, mode: "insensitive" };

  const db = rdb();
  const [questions, total]: [Row[], number] = await Promise.all([
    db.question.findMany({
      where,
      orderBy: [{ createdAt: "desc" }],
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    }),
    db.question.count({ where }),
  ]);
  const ids = questions.map((q) => q.id);
  const options: Row[] = ids.length
    ? await db.questionOption.findMany({ where: { questionId: { in: ids } } })
    : [];
  const used = await usedIds(ids);

  return {
    data: questions.map((q) =>
      format(q, options.filter((o) => o.questionId === q.id), used.has(q.id)),
    ),
    pagination: {
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.ceil(total / query.limit),
    },
  };
}

async function load(id: string) {
  const db = rdb();
  const question: Row | null = await db.question.findFirst({
    where: { id, deletedAt: null },
  });

  if (!question) {
    throw new HttpError(404, "QUESTION_NOT_FOUND", "Question not found");
  }

  const options: Row[] = await db.questionOption.findMany({
    where: { questionId: id },
  });
  const used = (await usedIds([id])).has(id);

  return { question, options, used };
}

export async function getQuestion(id: string) {
  const { question, options, used } = await load(id);

  return format(question, options, used);
}

export async function createQuestion(
  input: CreateQuestionInput,
  actor: AuditActor = {},
) {
  const issues = checkOptions(input.options, input.correctIndex);

  if (issues.length > 0) throw validationError(issues);

  const id = await rdb().$transaction(async (tx) => {
    const question: Row = await tx.question.create({
      data: {
        level: input.level,
        section: input.section,
        difficulty: input.difficulty,
        type: "MCQ_SINGLE",
        text: input.text,
        isActive: input.isActive,
        ...(input.topic ? { topic: input.topic } : {}),
        ...(input.codeSnippet ? { codeSnippet: input.codeSnippet } : {}),
        ...(input.explanation ? { explanation: input.explanation } : {}),
      },
    });

    for (let i = 0; i < input.options.length; i += 1) {
      await tx.questionOption.create({
        data: {
          questionId: question.id,
          text: (input.options[i] as string).trim(),
          isCorrect: i === input.correctIndex,
          position: i + 1,
        },
      });
    }

    await writeAudit(asAuditDb(tx), actor, {
      action: "QUESTION_CREATED",
      entity: "Question",
      entityId: question.id,
      details: {
        level: input.level,
        section: input.section,
        difficulty: input.difficulty,
      },
    });

    return question.id as string;
  });

  return getQuestion(id);
}

export async function updateQuestion(
  id: string,
  input: UpdateQuestionInput,
  actor: AuditActor = {},
) {
  const { question, options, used } = await load(id);
  const ordered = [...options].sort((a, b) => a.position - b.position);
  const currentTexts = ordered.map((o) => o.text as string);
  const currentCorrect = ordered.findIndex((o) => o.isCorrect);

  const nextTexts = input.options ?? currentTexts;
  const nextCorrect = input.correctIndex ?? currentCorrect;
  const optionsChanged =
    input.options !== undefined || input.correctIndex !== undefined
      ? JSON.stringify(nextTexts.map((t) => t.trim())) !==
          JSON.stringify(currentTexts) || nextCorrect !== currentCorrect
      : false;
  const textChanged = input.text !== undefined && input.text !== question.text;
  const snippetChanged =
    input.codeSnippet !== undefined &&
    (input.codeSnippet ?? null) !== (question.codeSnippet ?? null);

if (used && (optionsChanged || textChanged || snippetChanged)) {
    throw new HttpError(
      409,
      "QUESTION_IN_USE",
      "This question has already been used in an assessment, so its text, options and correct answer can no longer be changed. Deactivate it and create a new question instead.",
    );
  }

  if (input.options !== undefined || input.correctIndex !== undefined) {
    const issues = checkOptions(nextTexts, nextCorrect);

    if (issues.length > 0) throw validationError(issues);
  }

  const data: Row = {};

  for (const key of [
    "level",
    "section",
    "difficulty",
    "text",
    "isActive",
  ] as const) {
    if (input[key] !== undefined) data[key] = input[key];
  }

  for (const key of ["topic", "codeSnippet", "explanation"] as const) {
    if (input[key] !== undefined) data[key] = input[key] ? input[key] : null;
  }

  await rdb().$transaction(async (tx) => {

    const result = await tx.question.updateMany({
      where: { id, updatedAt: question.updatedAt },
      data: Object.keys(data).length ? data : { updatedAt: new Date() },
    });

    if (result.count !== 1) {
      throw new HttpError(
        409,
        "QUESTION_CHANGED",
        "The question was changed by someone else. Reload it and try again.",
      );
    }

    if (optionsChanged) {
      if (ordered.length === 4) {

await tx.questionOption.updateMany({
          where: { questionId: id },
          data: { isCorrect: false },
        });

        for (let i = 0; i < 4; i += 1) {
          await tx.questionOption.update({
            where: { id: (ordered[i] as Row).id },
            data: {
              text: (nextTexts[i] as string).trim(),
              isCorrect: i === nextCorrect,
            },
          });
        }
      } else {
        await tx.questionOption.deleteMany({ where: { questionId: id } });

        for (let i = 0; i < 4; i += 1) {
          await tx.questionOption.create({
            data: {
              questionId: id,
              text: (nextTexts[i] as string).trim(),
              isCorrect: i === nextCorrect,
              position: i + 1,
            },
          });
        }
      }
    }

    await writeAudit(asAuditDb(tx), actor, {
      action: "QUESTION_UPDATED",
      entity: "Question",
      entityId: id,
      details: { changedFields: changedFields(input as Row) },
    });
  });

  return getQuestion(id);
}

export async function setQuestionStatus(
  id: string,
  isActive: boolean,
  actor: AuditActor = {},
) {
  const { question } = await load(id);

  await rdb().$transaction(async (tx) => {
    await tx.question.update({ where: { id }, data: { isActive } });
    await writeAudit(asAuditDb(tx), actor, {
      action: isActive ? "QUESTION_ACTIVATED" : "QUESTION_DEACTIVATED",
      entity: "Question",
      entityId: id,
      details: { previous: question.isActive },
    });
  });

  return getQuestion(id);
}

export async function deleteQuestion(id: string, actor: AuditActor = {}) {
  const { used } = await load(id);

  if (used) {
    throw new HttpError(
      409,
      "QUESTION_IN_USE",
      "This question has been used in an assessment and cannot be deleted. Deactivate it instead.",
    );
  }

  await rdb().$transaction(async (tx) => {
    await tx.question.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false },
    });
    await writeAudit(asAuditDb(tx), actor, {
      action: "QUESTION_DELETED",
      entity: "Question",
      entityId: id,
    });
  });
}

export async function questionSummary() {
  const rows: Row[] = await rdb().question.findMany({
    where: { deletedAt: null, isActive: true },
  });
  const table: Record<string, Record<string, Record<string, number>>> = {};

  for (const q of rows) {
    const byLevel = (table[q.level] ??= {});
    const bySection = (byLevel[q.section] ??= { EASY: 0, MEDIUM: 0, HARD: 0, total: 0 });

    bySection[q.difficulty] = (bySection[q.difficulty] ?? 0) + 1;
    bySection.total = (bySection.total ?? 0) + 1;
  }

  return table;
}
