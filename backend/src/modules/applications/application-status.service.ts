import { z } from "zod";

import {
  APPLICATION_STATUSES,
  canTransition,
  type ApplicationStatus,
} from "../../domain/application-status.js";
import { writeAudit, type AuditActor } from "../../lib/audit.js";
import { HttpError } from "../../lib/http-error.js";
import { asAuditDb, rdb } from "../../lib/recruitment-db.js";
import { driveScope, type Actor } from "./applications.service.js";

type Row = Record<string, any>;

export const MANUAL_STATUSES = ["SHORTLISTED", "REJECTED", "ON_HOLD", "SELECTED"] as const;
export type ManualStatus = (typeof MANUAL_STATUSES)[number];

export function permissionFor(status: ManualStatus): "candidates.shortlist" | "candidates.reject" {
  return status === "REJECTED" ? "candidates.reject" : "candidates.shortlist";
}

export const statusChangeSchema = z.object({
  status: z.enum(MANUAL_STATUSES),
  note: z.string().trim().max(500).optional(),

  override: z.boolean().default(false),
});

export const bulkSchema = z.object({
  driveId: z.string().uuid(),
  level: z.enum(["UG", "PG"]).optional(),
  action: z.enum(["SHORTLIST", "REJECT"]),

  percentage: z.number().min(0).max(100),
  preview: z.boolean().default(true),
});

export type StatusChangeInput = z.infer<typeof statusChangeSchema>;
export type BulkInput = z.infer<typeof bulkSchema>;

async function requireGlobal(user: Actor) {
  if ((await driveScope(user)) !== "ALL") {
    throw new HttpError(403, "FORBIDDEN", "You do not have permission to perform this action");
  }
}

export async function changeStatus(user: Actor, id: string, input: StatusChangeInput, actor: AuditActor = {}) {
  await requireGlobal(user);

  const db = rdb();
  const application: Row | null = await db.application.findUnique({ where: { id } });

  if (!application) throw new HttpError(404, "APPLICATION_NOT_FOUND", "Application not found");

  const from = application.status as ApplicationStatus;

  if (!canTransition(from, input.status, { override: input.override })) {
    throw new HttpError(409, "INVALID_STATUS_TRANSITION", `An application cannot move from ${from} to ${input.status}`, { from, to: input.status });
  }

  await db.$transaction(async (tx) => {

    const moved = await tx.application.updateMany({ where: { id, status: from }, data: { status: input.status } });

    if (moved.count !== 1) {
      throw new HttpError(409, "APPLICATION_CHANGED", "The application was changed by someone else. Reload it and try again.");
    }

    await tx.applicationStatusHistory.create({
      data: { applicationId: id, fromStatus: from, toStatus: input.status, changedByUserId: user.id, ...(input.note ? { note: input.note } : {}) },
    });
    await writeAudit(asAuditDb(tx), actor, {
      action: "APPLICATION_STATUS_CHANGED",
      entity: "Application",
      entityId: id,
      details: { from, to: input.status, override: input.override },
    });
  });

  return { id, from, status: input.status };
}

async function candidatesFor(input: BulkInput) {
  const db = rdb();
  const apps: Row[] = await db.application.findMany({
    where: { driveId: input.driveId, status: "TEST_SUBMITTED", ...(input.level ? { level: input.level } : {}) },
  });

  if (apps.length === 0) return [];

  const [attempts, candidates]: [Row[], Row[]] = await Promise.all([
    db.testAttempt.findMany({ where: { applicationId: { in: apps.map((a) => a.id) } } }),
    db.candidate.findMany({ where: { id: { in: apps.map((a) => a.candidateId) } } }),
  ]);

  return apps
    .map((a) => {
      const attempt = attempts.find((t) => t.applicationId === a.id);

      return {
        id: a.id as string,
        applicationNo: a.applicationNo as string,
        name: (candidates.find((c) => c.id === a.candidateId)?.name ?? "") as string,
        level: a.level as string,
        percentage: attempt && ["SUBMITTED", "AUTO_SUBMITTED"].includes(attempt.status) ? (attempt.percentage as number | null) : null,
      };
    })
    .filter((x) => x.percentage !== null && (input.action === "SHORTLIST" ? x.percentage >= input.percentage : x.percentage < input.percentage))
    .sort((a, b) => (b.percentage ?? 0) - (a.percentage ?? 0));
}

export async function bulkChange(user: Actor, input: BulkInput, actor: AuditActor = {}) {
  await requireGlobal(user);

  const drive: Row | null = await rdb().drive.findFirst({ where: { id: input.driveId, deletedAt: null } });

  if (!drive) throw new HttpError(404, "DRIVE_NOT_FOUND", "Drive not found");

  const selected = await candidatesFor(input);

  if (selected.length > 500) throw new HttpError(400, "TOO_MANY", "More than 500 students match; narrow the selection");

  const target: ManualStatus = input.action === "SHORTLIST" ? "SHORTLISTED" : "REJECTED";

  if (input.preview) {
    return { preview: true as const, target, count: selected.length, students: selected, applied: 0, skipped: 0 };
  }

  let applied = 0;

  await rdb().$transaction(async (tx) => {
    for (const s of selected) {
      const moved = await tx.application.updateMany({ where: { id: s.id, status: "TEST_SUBMITTED" }, data: { status: target } });

      if (moved.count === 1) {
        applied += 1;
        await tx.applicationStatusHistory.create({
          data: { applicationId: s.id, fromStatus: "TEST_SUBMITTED", toStatus: target, changedByUserId: user.id, note: `Bulk ${input.action.toLowerCase()} at ${input.percentage}%` },
        });
      }
    }

    await writeAudit(asAuditDb(tx), actor, {
      action: "APPLICATIONS_BULK_STATUS",
      entity: "Drive",
      entityId: input.driveId,
      details: { action: input.action, percentage: input.percentage, applied, selected: selected.length },
    });
  });

  return { preview: false as const, target, count: selected.length, students: selected, applied, skipped: selected.length - applied };
}

export { APPLICATION_STATUSES };
