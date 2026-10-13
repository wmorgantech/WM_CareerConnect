import { z } from "zod";

import {
  TOPICS,
  fixedDurationFor,
  templateTotals,
  validateTemplateConfig,
  type TemplateSectionInput,
} from "../../domain/assessment-config.js";
import { computeCapacity } from "../../domain/template-capacity.js";
import {
  changedFields,
  writeAudit,
  type AuditActor,
} from "../../lib/audit.js";
import {
  HttpError,
  isUniqueViolation,
  validationError,
} from "../../lib/http-error.js";
import { asAuditDb, rdb } from "../../lib/recruitment-db.js";
import { loadUsablePool } from "../assessment/question-pool.js";

type Row = Record<string, any>;

const sectionSchema = z.object({
  key: z.string().min(1),
  title: z.string().trim().max(100).optional(),
  questionCount: z.number().int().min(1).max(200),
  marksPerQuestion: z.number().positive().max(100),
});

const fields = {
  name: z.string().trim().min(2, "Name must be at least 2 characters").max(100),
  level: z.enum(["UG", "PG"]),
  durationMinutes: z.number().int().min(1).max(600),
  negativeMarking: z.number().min(0).max(100).default(0),
  easyPct: z.number().int().min(0).max(100),
  mediumPct: z.number().int().min(0).max(100),
  hardPct: z.number().int().min(0).max(100),
  isActive: z.boolean().default(true),
  sections: z.array(sectionSchema).min(1).max(20),
};

// The duration is fixed by level (UG 60 minutes, PG 75). A create request may leave it
// out; if it is sent it must equal the fixed value (checked in validateTemplateConfig).
export const createTemplateSchema = z.object({ ...fields, durationMinutes: fields.durationMinutes.optional() });
export const updateTemplateSchema = z
  .object({
    name: fields.name.optional(),
    level: fields.level.optional(),
    durationMinutes: fields.durationMinutes.optional(),
    negativeMarking: z.number().min(0).max(100).optional(),
    easyPct: fields.easyPct.optional(),
    mediumPct: fields.mediumPct.optional(),
    hardPct: fields.hardPct.optional(),
    isActive: z.boolean().optional(),
    sections: fields.sections.optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), {
    message: "Nothing to update",
  });
export const templateIdSchema = z.object({ id: z.string().uuid("Invalid template ID") });
export const templateStatusSchema = z.object({ isActive: z.boolean() });

export type CreateTemplateInput = z.infer<typeof createTemplateSchema>;
export type UpdateTemplateInput = z.infer<typeof updateTemplateSchema>;

const titleFor = (key: string) => TOPICS.find((t) => t.key === key)?.title ?? key;

function format(template: Row, sections: Row[]) {
  return {
    id: template.id,
    name: template.name,
    level: template.level,
    durationMinutes: template.durationMinutes,
    totalMarks: template.totalMarks,
    questionCount: template.questionCount,
    negativeMarking: template.negativeMarking,
    easyPct: template.easyPct,
    mediumPct: template.mediumPct,
    hardPct: template.hardPct,
    isActive: template.isActive,
    createdAt: template.createdAt,
    updatedAt: template.updatedAt,
    sections: [...sections]
      .sort((a, b) => a.position - b.position)
      .map((s) => ({
        key: s.key,
        title: s.title,
        questionCount: s.questionCount,
        marksPerQuestion: s.marksPerQuestion,
        marks: s.marks,
      })),
  };
}

export async function listTemplates() {
  const db = rdb();
  const templates: Row[] = await db.testTemplate.findMany({
    orderBy: [{ level: "asc" }, { name: "asc" }],
  });
  const sections: Row[] = templates.length
    ? await db.testTemplateSection.findMany({
        where: { templateId: { in: templates.map((t) => t.id) } },
      })
    : [];

  return templates.map((t) =>
    format(t, sections.filter((s) => s.templateId === t.id)),
  );
}

async function load(id: string) {
  const db = rdb();
  const template: Row | null = await db.testTemplate.findUnique({ where: { id } });

  if (!template) {
    throw new HttpError(404, "TEMPLATE_NOT_FOUND", "Test template not found");
  }

  const sections: Row[] = await db.testTemplateSection.findMany({
    where: { templateId: id },
  });

  return { template, sections };
}

export async function getTemplate(id: string) {
  const { template, sections } = await load(id);

  return format(template, sections);
}

function toSections(input: readonly z.infer<typeof sectionSchema>[]): TemplateSectionInput[] {
  return input.map((s) => ({
    key: s.key,
    title: s.title?.trim() || titleFor(s.key),
    questionCount: s.questionCount,
    marksPerQuestion: s.marksPerQuestion,
  }));
}

function assertValid(config: Parameters<typeof validateTemplateConfig>[0]) {
  const issues = validateTemplateConfig(config);

  if (issues.length > 0) throw validationError(issues, "Invalid test template");
}

async function writeSections(tx: ReturnType<typeof rdb>, templateId: string, sections: TemplateSectionInput[]) {
  await tx.testTemplateSection.deleteMany({ where: { templateId } });

  for (let i = 0; i < sections.length; i += 1) {
    const s = sections[i] as TemplateSectionInput;

    await tx.testTemplateSection.create({
      data: {
        templateId,
        key: s.key,
        title: s.title,
        questionCount: s.questionCount,
        marksPerQuestion: s.marksPerQuestion,
        marks: s.questionCount * s.marksPerQuestion,
        position: i + 1,
      },
    });
  }
}

export async function createTemplate(input: CreateTemplateInput, actor: AuditActor = {}) {
  const sections = toSections(input.sections);
  const durationMinutes = input.durationMinutes ?? fixedDurationFor(input.level);

  assertValid({
    level: input.level,
    durationMinutes,
    difficulty: { easyPct: input.easyPct, mediumPct: input.mediumPct, hardPct: input.hardPct },
    negativeMarking: input.negativeMarking,
    sections,
  });

  const totals = templateTotals(sections);

  try {
    const id = await rdb().$transaction(async (tx) => {
      const template: Row = await tx.testTemplate.create({
        data: {
          name: input.name,
          level: input.level,
          durationMinutes,
          totalMarks: totals.totalMarks,
          questionCount: totals.questionCount,
          negativeMarking: input.negativeMarking,
          easyPct: input.easyPct,
          mediumPct: input.mediumPct,
          hardPct: input.hardPct,
          isActive: input.isActive,
        },
      });

      await writeSections(tx, template.id, sections);
      await writeAudit(asAuditDb(tx), actor, {
        action: "TEST_TEMPLATE_CREATED",
        entity: "TestTemplate",
        entityId: template.id,
        details: { level: input.level, questionCount: totals.questionCount, totalMarks: totals.totalMarks },
      });

      return template.id as string;
    });

    return getTemplate(id);
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new HttpError(409, "TEMPLATE_NAME_TAKEN", "A template with this name already exists for this level");
    }

    throw error;
  }
}

async function inProgressAttempts(templateId: string) {
  return rdb().testAttempt.count({ where: { templateId, status: "IN_PROGRESS" } });
}

async function everUsed(templateId: string) {
  const db = rdb();
  const [drives, attempts] = await Promise.all([
    db.driveTemplate.count({ where: { templateId } }),
    db.testAttempt.count({ where: { templateId } }),
  ]);

  return { drives, attempts };
}

export async function updateTemplate(id: string, input: UpdateTemplateInput, actor: AuditActor = {}) {
  const { template, sections: current } = await load(id);

  if ((await inProgressAttempts(id)) > 0) {
    throw new HttpError(
      409,
      "TEMPLATE_IN_USE",
      "Students are taking an assessment with this template right now. Edit it after they finish.",
    );
  }

  const used = await everUsed(id);

  if (input.level !== undefined && input.level !== template.level && (used.drives > 0 || used.attempts > 0)) {
    throw new HttpError(409, "TEMPLATE_LEVEL_LOCKED", "The level cannot change once a template is assigned to a drive or has been used");
  }

  const sections = input.sections
    ? toSections(input.sections)
    : [...current]
        .sort((a, b) => a.position - b.position)
        .map((s) => ({ key: s.key, title: s.title, questionCount: s.questionCount, marksPerQuestion: s.marksPerQuestion }));
  const merged = {
    level: (input.level ?? template.level) as "UG" | "PG",
    // Always the fixed value for the (possibly new) level, so a level change cannot
    // keep the old level's duration and an older template is brought into line.
    durationMinutes: input.durationMinutes ?? fixedDurationFor((input.level ?? template.level) as "UG" | "PG"),
    difficulty: {
      easyPct: input.easyPct ?? template.easyPct,
      mediumPct: input.mediumPct ?? template.mediumPct,
      hardPct: input.hardPct ?? template.hardPct,
    },
    negativeMarking: input.negativeMarking ?? template.negativeMarking,
    sections,
  };

  assertValid(merged);

  const totals = templateTotals(sections);
  const data: Row = {
    level: merged.level,
    durationMinutes: merged.durationMinutes,
    easyPct: merged.difficulty.easyPct,
    mediumPct: merged.difficulty.mediumPct,
    hardPct: merged.difficulty.hardPct,
    negativeMarking: merged.negativeMarking,
    totalMarks: totals.totalMarks,
    questionCount: totals.questionCount,
  };

  if (input.name !== undefined) data.name = input.name;
  if (input.isActive !== undefined) data.isActive = input.isActive;

  try {
    await rdb().$transaction(async (tx) => {
      const result = await tx.testTemplate.updateMany({
        where: { id, updatedAt: template.updatedAt },
        data,
      });

      if (result.count !== 1) {
        throw new HttpError(409, "TEMPLATE_CHANGED", "The template was changed by someone else. Reload it and try again.");
      }

      if (input.sections) await writeSections(tx, id, sections);

      await writeAudit(asAuditDb(tx), actor, {
        action: "TEST_TEMPLATE_UPDATED",
        entity: "TestTemplate",
        entityId: id,
        details: { changedFields: changedFields(input as Row) },
      });
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new HttpError(409, "TEMPLATE_NAME_TAKEN", "A template with this name already exists for this level");
    }

    throw error;
  }

  return getTemplate(id);
}

export async function setTemplateStatus(id: string, isActive: boolean, actor: AuditActor = {}) {
  const { template } = await load(id);

  if (!isActive) {

    const assigned: Row[] = await rdb().driveTemplate.findMany({ where: { templateId: id } });

    if (assigned.length > 0) {
      const live: Row[] = await rdb().drive.findMany({
        where: { id: { in: assigned.map((a) => a.driveId) }, status: "PUBLISHED", deletedAt: null },
      });

      if (live.length > 0) {
        throw new HttpError(409, "TEMPLATE_ASSIGNED_TO_LIVE_DRIVE", "This template is used by a published drive. Remove it from the drive first.");
      }
    }
  }

  await rdb().$transaction(async (tx) => {
    await tx.testTemplate.update({ where: { id }, data: { isActive } });
    await writeAudit(asAuditDb(tx), actor, {
      action: isActive ? "TEST_TEMPLATE_ACTIVATED" : "TEST_TEMPLATE_DEACTIVATED",
      entity: "TestTemplate",
      entityId: id,
      details: { previous: template.isActive },
    });
  });

  return getTemplate(id);
}

export async function deleteTemplate(id: string, actor: AuditActor = {}) {
  await load(id);

  const used = await everUsed(id);

  if (used.drives > 0 || used.attempts > 0) {
    throw new HttpError(409, "TEMPLATE_IN_USE", "This template is assigned to a drive or has been used. Deactivate it instead.");
  }

  await rdb().$transaction(async (tx) => {
    await tx.testTemplate.delete({ where: { id } });
    await writeAudit(asAuditDb(tx), actor, {
      action: "TEST_TEMPLATE_DELETED",
      entity: "TestTemplate",
      entityId: id,
    });
  });
}

export async function templateCapacity(templateId: string) {
  const { template, sections } = await load(templateId);
  const keys = sections.map((s) => s.key as string);
  const pool = await loadUsablePool(template.level, keys);

  return {
    templateId,
    level: template.level,
    ...computeCapacity(
      sections.map((s) => ({ key: s.key, questionCount: s.questionCount })),
      pool.map((q) => ({ section: q.section, difficulty: q.difficulty })),
      { easyPct: template.easyPct, mediumPct: template.mediumPct, hardPct: template.hardPct },
    ),
  };
}
