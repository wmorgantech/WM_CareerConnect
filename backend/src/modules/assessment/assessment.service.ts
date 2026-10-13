import { z } from "zod";

import { TOPICS } from "../../domain/assessment-config.js";
import { TERMS_VERSION, buildRules } from "../../domain/assessment-rules.js";
import {
  ANSWER_GRACE_SECONDS,
  computeDeadline,
  isAnswerAccepted,
  remainingSeconds,
} from "../../domain/attempt-timer.js";
import {
  INTEGRITY_EVENT_TYPES,
  countsTowardFlag,
  flagThreshold,
  shouldFlag,
} from "../../domain/integrity.js";
import { scoreAttempt } from "../../domain/scoring.js";
import { computeCapacity } from "../../domain/template-capacity.js";
import {
  InsufficientQuestionsError,
  generateWeightedPaper,
} from "../../domain/test-paper.js";
import { writeAudit, type AuditActor } from "../../lib/audit.js";
import { HttpError, isUniqueViolation } from "../../lib/http-error.js";
import { logger } from "../../lib/logger.js";
import { asAuditDb, rdb } from "../../lib/recruitment-db.js";
import { loadUsablePool } from "./question-pool.js";

type Row = Record<string, any>;

export type CandidateCtx = { applicationId: string; candidateId: string };

export const startSchema = z.object({
  termsVersion: z.string().min(1),
  accepted: z.literal(true, { error: "You must accept the rules to start" }),
});

export const answersSchema = z.object({
  answers: z
    .array(
      z.object({
        questionId: z.string().uuid(),
        selectedOptionId: z.string().uuid().nullable(),
        markedForReview: z.boolean().optional(),
        seq: z.number().int().min(0),
      }),
    )
    .min(1)
    .max(100),
});

export const eventSchema = z.object({
  type: z.enum(INTEGRITY_EVENT_TYPES),
  clientAt: z.coerce.date().optional(),
  details: z.string().trim().max(200).optional(),
});

export const attemptIdSchema = z.object({ id: z.string().uuid("Invalid attempt ID") });
export const submitSchema = z.object({ confirm: z.literal(true).optional() });

const MAX_EVENTS_PER_ATTEMPT = 500;
const titleFor = (key: string) => TOPICS.find((t) => t.key === key)?.title ?? key;

const neutralSubmitted = {
  status: "SUBMITTED" as const,
  message: "Your assessment has been submitted successfully.",
};

async function loadOwnedAttempt(ctx: CandidateCtx, attemptId: string): Promise<Row> {
  const attempt: Row | null = await rdb().testAttempt.findUnique({ where: { id: attemptId } });

if (!attempt || attempt.applicationId !== ctx.applicationId) {
    throw new HttpError(404, "ATTEMPT_NOT_FOUND", "Assessment not found");
  }

  return attempt;
}

export async function finalizeAttempt(
  attemptId: string,
  source: "SUBMITTED" | "AUTO_SUBMITTED",
  actor: AuditActor = {},
): Promise<Row> {
  const db = rdb();
  const attempt: Row | null = await db.testAttempt.findUnique({ where: { id: attemptId } });

  if (!attempt) throw new HttpError(404, "ATTEMPT_NOT_FOUND", "Assessment not found");
  if (attempt.status !== "IN_PROGRESS") return attempt;

  const [questions, answers, template]: [Row[], Row[], Row | null] = await Promise.all([
    db.attemptQuestion.findMany({ where: { attemptId }, orderBy: [{ position: "asc" }] }),
    db.attemptAnswer.findMany({ where: { attemptId } }),
    db.testTemplate.findUnique({ where: { id: attempt.templateId } }),
  ]);

const answerKey = new Map<string, string>();

  for (const q of questions) {
    if (!q.correctOptionId) {
      throw new Error(`Attempt ${attemptId} question ${q.questionId} has no frozen answer key`);
    }

    answerKey.set(q.questionId, q.correctOptionId);
  }

  const chosen = new Map<string, string>();

  for (const a of answers) if (a.selectedOptionId) chosen.set(a.questionId, a.selectedOptionId);

  const score = scoreAttempt({
    paper: questions.map((q) => ({ questionId: q.questionId, section: q.section, marks: q.marks })),
    answerKey,
    answers: chosen,
    negativePerWrong: template?.negativeMarking ?? 0,
  });
  const now = new Date();

  await db.$transaction(async (tx) => {
    const closed = await tx.testAttempt.updateMany({
      where: { id: attemptId, status: "IN_PROGRESS" },
      data: {
        status: source,
        submittedAt: now,
        score: score.total,
        maxScore: Math.round(score.max),
        percentage: score.percentage,
      },
    });

    if (closed.count !== 1) return;

    const moved = await tx.application.updateMany({
      where: { id: attempt.applicationId, status: "TEST_IN_PROGRESS" },
      data: { status: "TEST_SUBMITTED" },
    });

    if (moved.count === 1) {
      await tx.applicationStatusHistory.create({
        data: {
          applicationId: attempt.applicationId,
          fromStatus: "TEST_IN_PROGRESS",
          toStatus: "TEST_SUBMITTED",
          note: source === "AUTO_SUBMITTED" ? "Auto-submitted at the deadline" : "Submitted by the student",
        },
      });
    }

    await writeAudit(asAuditDb(tx), actor, {
      action: source === "AUTO_SUBMITTED" ? "ATTEMPT_AUTO_SUBMITTED" : "ATTEMPT_SUBMITTED",
      entity: "TestAttempt",
      entityId: attemptId,
      details: { answered: chosen.size, questions: questions.length },
    });
  });

  return (await db.testAttempt.findUnique({ where: { id: attemptId } })) as Row;
}

// The periodic sweep for students who never came back. Answers are still accepted until
// deadline + ANSWER_GRACE_SECONDS (see saveAnswers), so an attempt is only swept once that grace
// has fully elapsed; closing it earlier would refuse a last autosave the student is allowed to make.
export async function finalizeExpiredAttempts(now: Date = new Date(), batch = 200): Promise<number> {
  const cutoff = new Date(now.getTime() - ANSWER_GRACE_SECONDS * 1000);
  const due: Row[] = await rdb().testAttempt.findMany({
    where: { status: "IN_PROGRESS", deadline: { lte: cutoff } },
    orderBy: [{ deadline: "asc" }],
    take: batch,
  });
  let closed = 0;

  for (const attempt of due) {
    try {
      const result = await finalizeAttempt(attempt.id, "AUTO_SUBMITTED");

      if (result.status === "AUTO_SUBMITTED") closed += 1;
    } catch (error) {
      logger.error({ attemptId: attempt.id, err: error instanceof Error ? error.message : String(error) }, "could not auto-submit an expired attempt");
    }
  }

  return closed;
}

async function loadContext(ctx: CandidateCtx) {
  const db = rdb();
  const application: Row | null = await db.application.findUnique({ where: { id: ctx.applicationId } });

  if (!application) throw new HttpError(404, "APPLICATION_NOT_FOUND", "Application not found");

  const drive: Row = (await db.drive.findUnique({ where: { id: application.driveId } })) as Row;
  const slot: Row | null = await db.driveTemplate.findUnique({
    where: { driveId_level: { driveId: application.driveId, level: application.level } },
  });
  const template: Row | null = slot ? await db.testTemplate.findUnique({ where: { id: slot.templateId } }) : null;
  const sections: Row[] = template
    ? await db.testTemplateSection.findMany({ where: { templateId: template.id }, orderBy: [{ position: "asc" }] })
    : [];
  const attempt: Row | null = await db.testAttempt.findFirst({ where: { applicationId: ctx.applicationId } });

  return { application, drive, template, sections, attempt };
}

type Block = { code: string; message: string };

function startBlock(c: Awaited<ReturnType<typeof loadContext>>, now: Date): Block | null {
  const { application, drive, template, attempt } = c;

  if (attempt) {
    return attempt.status === "IN_PROGRESS"
      ? null
      : { code: "ALREADY_SUBMITTED", message: "You have already submitted this assessment." };
  }

  if (drive.status !== "PUBLISHED" || !drive.isActive) {
    return { code: "DRIVE_NOT_OPEN", message: "This assessment is not open yet." };
  }

  if (drive.testStartsAt && now < drive.testStartsAt) {
    return { code: "TEST_NOT_STARTED", message: "The assessment has not started yet." };
  }

  if (drive.testEndsAt && now > drive.testEndsAt) {
    return { code: "TEST_WINDOW_CLOSED", message: "The assessment window has closed." };
  }

  if (application.status !== "REGISTERED") {
    return { code: "NOT_ELIGIBLE", message: "The assessment is not available for your application." };
  }

  if (!template) {
    return { code: "TEMPLATE_NOT_CONFIGURED", message: "The assessment is not ready yet. Please ask your coordinator." };
  }

  if (!template.isActive) {
    return { code: "TEMPLATE_INACTIVE", message: "The assessment is not ready yet. Please ask your coordinator." };
  }

  return null;
}

export async function assessmentInfo(ctx: CandidateCtx) {
  const now = new Date();
  const c = await loadContext(ctx);
  const block = startBlock(c, now);
  const state = !c.attempt
    ? "NOT_STARTED"
    : c.attempt.status === "IN_PROGRESS" && now < c.attempt.deadline
      ? "IN_PROGRESS"
      : "SUBMITTED";

  return {
    drive: { title: c.drive.title },
    level: c.application.level,
    termsVersion: TERMS_VERSION,
    serverNow: now,
    window: { startsAt: c.drive.testStartsAt ?? null, endsAt: c.drive.testEndsAt ?? null },
    template: c.template
      ? {
          name: c.template.name,
          questionCount: c.template.questionCount,
          durationMinutes: c.template.durationMinutes,
          sections: c.sections.map((s) => ({ key: s.key, title: s.title || titleFor(s.key), questionCount: s.questionCount })),
        }
      : null,
    rules: c.template
      ? buildRules({ questionCount: c.template.questionCount, durationMinutes: c.template.durationMinutes })
      : [],
    attempt: {
      state,
      deadline: state === "IN_PROGRESS" ? c.attempt?.deadline : null,
      remainingSeconds: state === "IN_PROGRESS" ? remainingSeconds(now, c.attempt?.deadline) : null,
    },
    canStart: state === "IN_PROGRESS" || block === null,
    blocked: state === "IN_PROGRESS" ? null : block,
  };
}

function attemptSummary(attempt: Row, now: Date) {
  return {
    id: attempt.id,
    startedAt: attempt.startedAt,
    deadline: attempt.deadline,
    serverNow: now,
    remainingSeconds: remainingSeconds(now, attempt.deadline),
  };
}

export async function startAttempt(
  ctx: CandidateCtx,
  input: z.infer<typeof startSchema>,
  actor: AuditActor = {},
) {
  const now = new Date();
  const c = await loadContext(ctx);

  if (c.attempt) {
    if (c.attempt.status !== "IN_PROGRESS") {
      throw new HttpError(409, "ALREADY_SUBMITTED", "You have already submitted this assessment.");
    }

    if (now >= c.attempt.deadline) {
      // Time is up, so there is no way back in. The attempt itself is only closed once the answer
      // grace period has also passed, so a save still in flight (for example from another tab) lands.
      if (!isAnswerAccepted(now, c.attempt.deadline, ANSWER_GRACE_SECONDS)) await finalizeAttempt(c.attempt.id, "AUTO_SUBMITTED");

      throw new HttpError(409, "ALREADY_SUBMITTED", "Your time for this assessment has ended and it was submitted.");
    }

    return { resumed: true, attempt: attemptSummary(c.attempt, now) };
  }

  const block = startBlock(c, now);

  if (block) throw new HttpError(409, block.code, block.message);

if (input.termsVersion !== TERMS_VERSION) {
    throw new HttpError(400, "TERMS_NOT_ACCEPTED", "The rules have changed. Please read and accept them again.");
  }

  const template = c.template as Row;
  const mix = {
    EASY: template.easyPct as number,
    MEDIUM: template.mediumPct as number,
    HARD: template.hardPct as number,
  };
  const pool = await loadUsablePool(c.application.level, c.sections.map((s) => s.key));
  const capacity = computeCapacity(
    c.sections.map((s) => ({ key: s.key, questionCount: s.questionCount })),
    pool.map((q) => ({ section: q.section, difficulty: q.difficulty })),
    { easyPct: mix.EASY, mediumPct: mix.MEDIUM, hardPct: mix.HARD },
  );

  if (!capacity.ok) {
    throw new HttpError(
      409,
      "QUESTION_BANK_INSUFFICIENT",
      "The assessment cannot start because the question bank is not ready. Please tell your coordinator.",
      { sections: capacity.sections.filter((s) => s.shortage > 0).map((s) => ({ key: s.key, required: s.required, available: s.available })) },
    );
  }

  let paper: ReturnType<typeof generateWeightedPaper>;

  try {
    paper = generateWeightedPaper({
      pool: pool.map((q) => ({ id: q.id, section: q.section, difficulty: q.difficulty, optionIds: q.optionIds })),
      sections: c.sections.map((s) => ({ section: s.key, count: s.questionCount, marksPerQuestion: s.marksPerQuestion })),
      mix,
    });
  } catch (error) {
    if (error instanceof InsufficientQuestionsError) {
      throw new HttpError(409, "QUESTION_BANK_INSUFFICIENT", "The assessment cannot start because the question bank is not ready.");
    }

    throw error;
  }

  const byId = new Map(pool.map((q) => [q.id, q]));
  const deadline = computeDeadline(now, template.durationMinutes);

  try {
    const attemptId = await rdb().$transaction(async (tx) => {
      const attempt: Row = await tx.testAttempt.create({
        data: {
          applicationId: ctx.applicationId,
          templateId: template.id,
          startedAt: now,
          deadline,
          status: "IN_PROGRESS",
          maxScore: template.totalMarks,
          termsVersion: TERMS_VERSION,
          termsAcceptedAt: now,
        },
      });

await tx.attemptQuestion.createMany({
        data: paper.map((item) => {
          const q = byId.get(item.questionId) as (typeof pool)[number];

          return {
            attemptId: attempt.id,
            questionId: item.questionId,
            section: item.section,
            position: item.position,
            optionOrder: item.optionOrder,
            marks: item.marks,
            correctOptionId: q.correctOptionId,
            questionText: q.text,
            codeSnippet: q.codeSnippet,
            optionsSnapshot: q.options,
          };
        }),
      });

      const moved = await tx.application.updateMany({
        where: { id: ctx.applicationId, status: "REGISTERED" },
        data: { status: "TEST_IN_PROGRESS" },
      });

      if (moved.count === 1) {
        await tx.applicationStatusHistory.create({
          data: { applicationId: ctx.applicationId, fromStatus: "REGISTERED", toStatus: "TEST_IN_PROGRESS", note: "Assessment started" },
        });
      }

      await writeAudit(asAuditDb(tx), actor, {
        action: "ATTEMPT_STARTED",
        entity: "TestAttempt",
        entityId: attempt.id,
        details: { termsVersion: TERMS_VERSION, questions: paper.length },
      });

      return attempt.id as string;
    });
    const created = (await rdb().testAttempt.findUnique({ where: { id: attemptId } })) as Row;

    return { resumed: false, attempt: attemptSummary(created, now) };
  } catch (error) {

if (isUniqueViolation(error)) {
      const existing: Row | null = await rdb().testAttempt.findFirst({ where: { applicationId: ctx.applicationId } });

      if (existing && existing.status === "IN_PROGRESS") {
        return { resumed: true, attempt: attemptSummary(existing, new Date()) };
      }
    }

    throw error;
  }
}

export async function currentAttempt(ctx: CandidateCtx) {
  const db = rdb();
  let attempt: Row | null = await db.testAttempt.findFirst({ where: { applicationId: ctx.applicationId } });

  if (!attempt) throw new HttpError(404, "NO_ATTEMPT", "You have not started the assessment");

  const now = new Date();

  if (attempt.status === "IN_PROGRESS" && now >= attempt.deadline) {
    // After the deadline the paper is no longer served. The attempt is closed only when the answer
    // grace period (see saveAnswers) has elapsed, so a reconnect cannot refuse an autosave that is
    // still allowed; until then the student simply sees the neutral submitted message.
    if (isAnswerAccepted(now, attempt.deadline, ANSWER_GRACE_SECONDS)) return { ...neutralSubmitted, serverNow: now };

    attempt = await finalizeAttempt(attempt.id, "AUTO_SUBMITTED");
  }

if (attempt.status !== "IN_PROGRESS") return { ...neutralSubmitted, serverNow: now };

  const [questions, answers]: [Row[], Row[]] = await Promise.all([
    db.attemptQuestion.findMany({ where: { attemptId: attempt.id }, orderBy: [{ position: "asc" }] }),
    db.attemptAnswer.findMany({ where: { attemptId: attempt.id } }),
  ]);

  return {
    status: "IN_PROGRESS" as const,
    attempt: attemptSummary(attempt, now),
    warnings: attempt.integrityEventCount ?? 0,

    questions: questions.map((q) => {
      const snapshot = q.optionsSnapshot as { id: string; text: string }[];
      const byId = new Map(snapshot.map((o) => [o.id, o.text]));

      return {
        questionId: q.questionId,
        position: q.position,
        section: q.section,
        sectionTitle: titleFor(q.section),
        text: q.questionText,
        codeSnippet: q.codeSnippet ?? null,
        options: (q.optionOrder as string[]).map((id) => ({ id, text: byId.get(id) ?? "" })),
      };
    }),
    answers: Object.fromEntries(
      answers.map((a) => [
        a.questionId,
        { selectedOptionId: a.selectedOptionId ?? null, markedForReview: a.markedForReview, seq: a.seq },
      ]),
    ),
  };
}

export async function saveAnswers(
  ctx: CandidateCtx,
  attemptId: string,
  input: z.infer<typeof answersSchema>,
) {
  const db = rdb();
  const attempt = await loadOwnedAttempt(ctx, attemptId);
  const now = new Date();

  if (attempt.status !== "IN_PROGRESS") {
    throw new HttpError(409, "ATTEMPT_CLOSED", "This assessment has been submitted.");
  }

  if (!isAnswerAccepted(now, attempt.deadline, ANSWER_GRACE_SECONDS)) {
    await finalizeAttempt(attemptId, "AUTO_SUBMITTED");

    throw new HttpError(409, "ATTEMPT_EXPIRED", "Time is up. Your saved answers were submitted.");
  }

const paper: Row[] = await db.attemptQuestion.findMany({
    where: { attemptId, questionId: { in: input.answers.map((a) => a.questionId) } },
  });

  for (const item of input.answers) {
    const aq = paper.find((p) => p.questionId === item.questionId);

    if (!aq) throw new HttpError(400, "INVALID_QUESTION", "That question is not on your assessment");

    if (item.selectedOptionId !== null) {
      const ids = (aq.optionsSnapshot as { id: string }[]).map((o) => o.id);

      if (!ids.includes(item.selectedOptionId)) {
        throw new HttpError(400, "INVALID_OPTION", "That option does not belong to the question");
      }
    }
  }

  let applied = 0;
  let ignored = 0;

  await db.$transaction(async (tx) => {
    for (const item of input.answers) {
      const data: Row = {
        selectedOptionId: item.selectedOptionId,
        answeredAt: item.selectedOptionId ? now : null,
        seq: item.seq,
        ...(item.markedForReview !== undefined ? { markedForReview: item.markedForReview } : {}),
      };

const inserted = await tx.attemptAnswer.createMany({
        data: [{ attemptId, questionId: item.questionId, ...data }],
        skipDuplicates: true,
      });

      if (inserted.count === 1) {
        applied += 1;
        continue;
      }

const result = await tx.attemptAnswer.updateMany({
        where: { attemptId, questionId: item.questionId, seq: { lte: item.seq } },
        data,
      });

      if (result.count === 1) applied += 1;
      else ignored += 1;
    }
  });

  return { applied, ignored, serverNow: now, remainingSeconds: remainingSeconds(now, attempt.deadline) };
}

export async function recordEvent(
  ctx: CandidateCtx,
  attemptId: string,
  input: z.infer<typeof eventSchema>,
  actor: AuditActor = {},
) {
  const db = rdb();
  const attempt = await loadOwnedAttempt(ctx, attemptId);
  const threshold = flagThreshold();

  if (attempt.status !== "IN_PROGRESS") {
    return { recorded: false, warnings: attempt.integrityEventCount ?? 0, threshold };
  }

  if ((await db.integrityEvent.count({ where: { attemptId } })) >= MAX_EVENTS_PER_ATTEMPT) {
    return { recorded: false, warnings: attempt.integrityEventCount ?? 0, threshold };
  }

  const counted = countsTowardFlag(input.type);
  let warnings = attempt.integrityEventCount ?? 0;

  await db.$transaction(async (tx) => {
    await tx.integrityEvent.create({
      data: {
        attemptId,
        type: input.type,
        ...(input.clientAt ? { clientAt: input.clientAt } : {}),
        ...(input.details ? { details: input.details } : {}),
      },
    });

    if (!counted) return;

    const updated: Row = await tx.testAttempt.update({
      where: { id: attemptId },
      data: { integrityEventCount: { increment: 1 }, tabSwitchCount: { increment: 1 } },
    });

    warnings = updated.integrityEventCount;

if (shouldFlag(warnings, threshold) && !updated.flaggedForReview) {
      const flagged = await tx.testAttempt.updateMany({
        where: { id: attemptId, flaggedForReview: false },
        data: { flaggedForReview: true },
      });

      if (flagged.count === 1) {
        await writeAudit(asAuditDb(tx), actor, {
          action: "ATTEMPT_FLAGGED_FOR_REVIEW",
          entity: "TestAttempt",
          entityId: attemptId,
          details: { events: warnings },
        });
      }
    }
  });

  return {
    recorded: true,
    warnings,
    threshold,
    message: counted
      ? "Please stay in full screen and in this tab. This has been recorded for the assessment team."
      : null,
  };
}

export async function submitAttempt(ctx: CandidateCtx, attemptId: string, actor: AuditActor = {}) {
  const attempt = await loadOwnedAttempt(ctx, attemptId);

if (attempt.status !== "IN_PROGRESS") return neutralSubmitted;

  const source = new Date() >= attempt.deadline ? "AUTO_SUBMITTED" : "SUBMITTED";

  await finalizeAttempt(attemptId, source, actor);

  return neutralSubmitted;
}
