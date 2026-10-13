import { z } from "zod";

import { fixedDurationFor } from "../../domain/assessment-config.js";
import { generateAccessCode } from "../../domain/candidate-registration.js";
import { computeCapacity } from "../../domain/template-capacity.js";
import {
  changedFields,
  writeAudit,
  type AuditActor,
} from "../../lib/audit.js";
import {
  HttpError,
  isForeignKeyError,
  isMissingSchemaError,
  isUniqueViolation,
  validationError,
} from "../../lib/http-error.js";
import { asAuditDb, rdb, recruitmentClientReady } from "../../lib/recruitment-db.js";
import { loadUsablePool } from "../assessment/question-pool.js";

type Row = Record<string, any>;
type Level = "UG" | "PG";

export const driveParamsSchema = z.object({ id: z.string().uuid("Invalid drive ID") });
export const levelParamsSchema = z.object({
  id: z.string().uuid("Invalid drive ID"),
  level: z.enum(["UG", "PG"]),
});
export const setTemplateSchema = z.object({ templateId: z.string().uuid("Invalid template ID") });
export const assignCoordinatorSchema = z.object({ userId: z.string().uuid("Invalid user ID") });
export const updateConfigSchema = z
  .object({
    levelAllowed: z.enum(["UG", "PG", "BOTH"]).optional(),
    registrationOpen: z.boolean().optional(),
    testStartsAt: z.coerce.date().nullable().optional(),
    testEndsAt: z.coerce.date().nullable().optional(),
    regenerateAccessCode: z.boolean().optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), { message: "Nothing to update" });

export type UpdateConfigInput = z.infer<typeof updateConfigSchema>;

export function allowedLevels(levelAllowed: string): Level[] {
  return levelAllowed === "UG" ? ["UG"] : levelAllowed === "PG" ? ["PG"] : ["UG", "PG"];
}

async function loadDrive(id: string): Promise<Row> {
  const drive: Row | null = await rdb().drive.findFirst({ where: { id, deletedAt: null } });

  if (!drive) throw new HttpError(404, "DRIVE_NOT_FOUND", "Drive not found");

  return drive;
}

export type ReadinessIssue = { level: Level | null; code: string; message: string };

export async function driveReadiness(drive: Row): Promise<ReadinessIssue[]> {
  const issues: ReadinessIssue[] = [];
  const db = rdb();

  if (!drive.isActive || drive.deletedAt) {
    issues.push({ level: null, code: "DRIVE_INACTIVE", message: "The drive is inactive" });
  }

  const slots: Row[] = await db.driveTemplate.findMany({ where: { driveId: drive.id } });

  for (const level of allowedLevels(drive.levelAllowed ?? "BOTH")) {
    const slot = slots.find((s) => s.level === level);

    if (!slot) {
      issues.push({ level, code: "TEMPLATE_NOT_CONFIGURED", message: `No ${level} test template is assigned` });
      continue;
    }

    const template: Row | null = await db.testTemplate.findUnique({ where: { id: slot.templateId } });

    if (!template || !template.isActive) {
      issues.push({ level, code: "TEMPLATE_INACTIVE", message: `The ${level} test template is inactive` });
      continue;
    }

    // A template saved before the durations were fixed (or edited around the API) must not
    // run an assessment of the wrong length.
    if (template.durationMinutes !== fixedDurationFor(level)) {
      issues.push({
        level,
        code: "TEMPLATE_DURATION_INVALID",
        message: `The ${level} template runs ${template.durationMinutes} minutes; ${level} assessments are fixed at ${fixedDurationFor(level)}. Edit and save the template to correct it.`,
      });
    }

    const sections: Row[] = await db.testTemplateSection.findMany({ where: { templateId: template.id } });
    const pool = await loadUsablePool(level, sections.map((s) => s.key));
    const capacity = computeCapacity(
      sections.map((s) => ({ key: s.key, questionCount: s.questionCount })),
      pool.map((q) => ({ section: q.section, difficulty: q.difficulty })),
      { easyPct: template.easyPct, mediumPct: template.mediumPct, hardPct: template.hardPct },
    );

    for (const s of capacity.sections.filter((x) => x.shortage > 0)) {
      issues.push({
        level,
        code: "QUESTION_BANK_INSUFFICIENT",
        message: `${level} ${s.key}: needs ${s.required} questions, the bank has ${s.available}`,
      });
    }
  }

  return issues;
}

export async function assertDriveReadyToPublish(driveId: string): Promise<void> {

if (!recruitmentClientReady()) return;

  let drive: Row | null;
  let issues: ReadinessIssue[];

  try {
    drive = await rdb().drive.findFirst({ where: { id: driveId, deletedAt: null } });

    if (!drive) return;

    issues = await driveReadiness(drive);
  } catch (error) {
    if (isMissingSchemaError(error)) return;

    throw error;
  }

  if (issues.length > 0) {
    throw new HttpError(409, "DRIVE_NOT_READY", "The drive cannot be published yet. Open Assessment setup on the Drives page to see what is missing.", { issues });
  }
}

async function attemptsStarted(driveId: string, level?: Level): Promise<number> {
  const db = rdb();
  const apps: Row[] = await db.application.findMany({
    where: level ? { driveId, level } : { driveId },
  });

  if (apps.length === 0) return 0;

  return db.testAttempt.count({ where: { applicationId: { in: apps.map((a) => a.id) } } });
}

export async function getDriveConfig(id: string) {
  const drive = await loadDrive(id);
  const db = rdb();
  const slots: Row[] = await db.driveTemplate.findMany({ where: { driveId: id } });
  const templates: Row[] = slots.length
    ? await db.testTemplate.findMany({ where: { id: { in: slots.map((s) => s.templateId) } } })
    : [];
  const links: Row[] = await db.driveCoordinator.findMany({ where: { driveId: id } });
  const users: Row[] = links.length
    ? await db.user.findMany({ where: { id: { in: links.map((l) => l.userId) } } })
    : [];
  const issues = await driveReadiness(drive);

  return {
    driveId: id,
    status: drive.status,
    levelAllowed: drive.levelAllowed,
    registrationOpen: drive.registrationOpen,
    accessCode: drive.accessCode ?? null,
    testStartsAt: drive.testStartsAt ?? null,
    testEndsAt: drive.testEndsAt ?? null,
    templates: slots.map((s) => {
      const t = templates.find((x) => x.id === s.templateId);

      return {
        level: s.level,
        templateId: s.templateId,
        name: t?.name ?? null,
        isActive: t?.isActive ?? false,
        questionCount: t?.questionCount ?? null,
        durationMinutes: t?.durationMinutes ?? null,
      };
    }),
    coordinators: links.map((l) => {
      const u = users.find((x) => x.id === l.userId);

      return { userId: l.userId, name: u?.name ?? null, email: u?.email ?? null, assignedAt: l.assignedAt };
    }),
    readiness: { ready: issues.length === 0, issues },
  };
}

export async function setDriveTemplate(
  driveId: string,
  level: Level,
  templateId: string,
  actor: AuditActor = {},
) {
  const drive = await loadDrive(driveId);

  if (!allowedLevels(drive.levelAllowed ?? "BOTH").includes(level)) {
    throw new HttpError(400, "LEVEL_NOT_ALLOWED", `This drive does not allow ${level} students`);
  }

  const template: Row | null = await rdb().testTemplate.findUnique({ where: { id: templateId } });

  if (!template) throw new HttpError(404, "TEMPLATE_NOT_FOUND", "Test template not found");
  if (!template.isActive) throw new HttpError(409, "TEMPLATE_INACTIVE", "This template is inactive");
  if (template.level !== level) {
    throw new HttpError(400, "TEMPLATE_LEVEL_MISMATCH", `A ${template.level} template cannot be used for ${level} students`);
  }

  if ((await attemptsStarted(driveId, level)) > 0) {
    throw new HttpError(409, "TEMPLATE_LOCKED", "Students have already started this assessment, so its template can no longer change");
  }

  try {
    await rdb().$transaction(async (tx) => {
      await tx.driveTemplate.upsert({
        where: { driveId_level: { driveId, level } },
        create: { driveId, level, templateId },
        update: { templateId, assignedAt: new Date() },
      });
      await writeAudit(asAuditDb(tx), actor, {
        action: "DRIVE_TEMPLATE_ASSIGNED",
        entity: "Drive",
        entityId: driveId,
        details: { level, templateId },
      });
    });
  } catch (error) {

    if (isForeignKeyError(error)) {
      throw new HttpError(400, "TEMPLATE_LEVEL_MISMATCH", `That template cannot be used for ${level} students`);
    }

    throw error;
  }

  return getDriveConfig(driveId);
}

export async function removeDriveTemplate(driveId: string, level: Level, actor: AuditActor = {}) {
  await loadDrive(driveId);

  if ((await attemptsStarted(driveId, level)) > 0) {
    throw new HttpError(409, "TEMPLATE_LOCKED", "Students have already started this assessment, so its template can no longer change");
  }

  await rdb().$transaction(async (tx) => {
    await tx.driveTemplate.deleteMany({ where: { driveId, level } });
    await writeAudit(asAuditDb(tx), actor, {
      action: "DRIVE_TEMPLATE_REMOVED",
      entity: "Drive",
      entityId: driveId,
      details: { level },
    });
  });

  return getDriveConfig(driveId);
}

export async function updateDriveConfig(id: string, input: UpdateConfigInput, actor: AuditActor = {}) {
  const drive = await loadDrive(id);
  const db = rdb();
  const data: Row = {};
  const start = input.testStartsAt !== undefined ? input.testStartsAt : drive.testStartsAt;
  const end = input.testEndsAt !== undefined ? input.testEndsAt : drive.testEndsAt;

  if (start && end && end.getTime() <= start.getTime()) {
    throw validationError([{ field: "testEndsAt", message: "The test window must end after it starts" }]);
  }

  if (input.testStartsAt !== undefined) data.testStartsAt = input.testStartsAt;
  if (input.testEndsAt !== undefined) data.testEndsAt = input.testEndsAt;

  if (input.levelAllowed !== undefined && input.levelAllowed !== drive.levelAllowed) {
    const dropped = (["UG", "PG"] as Level[]).filter(
      (l) => allowedLevels(drive.levelAllowed ?? "BOTH").includes(l) && !allowedLevels(input.levelAllowed as string).includes(l),
    );

    for (const level of dropped) {
      const slot = await db.driveTemplate.count({ where: { driveId: id, level } });
      const apps = await db.application.count({ where: { driveId: id, level } });

      if (slot > 0 || apps > 0) {
        throw new HttpError(409, "LEVEL_IN_USE", `${level} has a template or students in this drive. Remove them before disallowing ${level}.`);
      }
    }

    data.levelAllowed = input.levelAllowed;
  }

  if (input.regenerateAccessCode) {
    data.accessCode = generateAccessCode();
  }

  if (input.registrationOpen !== undefined) {
    if (input.registrationOpen) {
      if (drive.status !== "PUBLISHED") {
        throw new HttpError(409, "DRIVE_NOT_READY", "Publish the drive before opening registration", {
          issues: [{ level: null, code: "DRIVE_NOT_PUBLISHED", message: "The drive is not published" }],
        });
      }

      const issues = await driveReadiness({ ...drive, ...data });

      if (issues.length > 0) {
        throw new HttpError(409, "DRIVE_NOT_READY", "The drive is not ready for registration", { issues });
      }
    }

    data.registrationOpen = input.registrationOpen;
  }

  try {
    await db.$transaction(async (tx) => {
      await tx.drive.update({ where: { id }, data });
      await writeAudit(asAuditDb(tx), actor, {
        action: "DRIVE_CONFIG_UPDATED",
        entity: "Drive",
        entityId: id,
        details: { changedFields: changedFields(input as Row) },
      });
    });
  } catch (error) {
    if (isUniqueViolation(error) && input.regenerateAccessCode) {
      throw new HttpError(409, "ACCESS_CODE_CONFLICT", "Please try again");
    }

    throw error;
  }

  return getDriveConfig(id);
}

export async function assignCoordinator(driveId: string, userId: string, actor: AuditActor = {}) {
  await loadDrive(driveId);

  const user: Row | null = await rdb().user.findFirst({
    where: {
      id: userId,
      status: "ACTIVE",
      userRoles: { some: { role: { name: "CAMPUS_COORDINATOR" } } },
    },
  });

  if (!user) {
    throw new HttpError(400, "NOT_A_COORDINATOR", "Choose an active user with the Campus Coordinator role");
  }

  await rdb().$transaction(async (tx) => {
    await tx.driveCoordinator.upsert({
      where: { driveId_userId: { driveId, userId } },
      create: { driveId, userId },
      update: {},
    });
    await writeAudit(asAuditDb(tx), actor, {
      action: "DRIVE_COORDINATOR_ASSIGNED",
      entity: "Drive",
      entityId: driveId,
      details: { userId },
    });
  });

  return getDriveConfig(driveId);
}

export async function unassignCoordinator(driveId: string, userId: string, actor: AuditActor = {}) {
  await loadDrive(driveId);

  await rdb().$transaction(async (tx) => {
    await tx.driveCoordinator.deleteMany({ where: { driveId, userId } });
    await writeAudit(asAuditDb(tx), actor, {
      action: "DRIVE_COORDINATOR_REMOVED",
      entity: "Drive",
      entityId: driveId,
      details: { userId },
    });
  });

  return getDriveConfig(driveId);
}

export async function listTemplateOptions() {
  const templates: Row[] = await rdb().testTemplate.findMany({
    where: { isActive: true },
    orderBy: [{ level: "asc" }, { name: "asc" }],
  });

  return templates.map((t) => ({
    id: t.id,
    name: t.name,
    level: t.level,
    questionCount: t.questionCount,
    durationMinutes: t.durationMinutes,
  }));
}

export async function listCoordinatorCandidates() {
  const users: Row[] = await rdb().user.findMany({
    where: { status: "ACTIVE", userRoles: { some: { role: { name: "CAMPUS_COORDINATOR" } } } },
  });

  return users.map((u) => ({ id: u.id, name: u.name, email: u.email }));
}
