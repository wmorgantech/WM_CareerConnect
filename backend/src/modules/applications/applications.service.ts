import bcrypt from "bcrypt";
import { z } from "zod";

import {
  MOBILE_PATTERN,
  QUALIFICATIONS,
  formatApplicationNumber,
  normalizeMobile,
  passingYearRange,
} from "../../domain/candidate-registration.js";
import { generateTemporaryPassword } from "../../domain/credential.js";
import { remainingSeconds } from "../../domain/attempt-timer.js";
import { writeAudit, type AuditActor } from "../../lib/audit.js";
import { HttpError, isUniqueViolation } from "../../lib/http-error.js";
import { asAuditDb, rdb } from "../../lib/recruitment-db.js";
import { allowedLevels } from "../drive-config/drive-config.service.js";

type Row = Record<string, any>;

export type Actor = { id: string; roles?: string[] };

const GLOBAL_ROLES = ["SUPER_ADMIN", "HR_ADMIN"];

export async function driveScope(user: Actor): Promise<"ALL" | string[]> {
  if ((user.roles ?? []).some((r) => GLOBAL_ROLES.includes(r))) return "ALL";

  const links: Row[] = await rdb().driveCoordinator.findMany({ where: { userId: user.id } });

  return links.map((l) => l.driveId as string);
}

function inScope(scope: "ALL" | string[], driveId: string): boolean {
  return scope === "ALL" || scope.includes(driveId);
}

export const registerStudentSchema = z.object({
  driveId: z.string().uuid("Invalid drive ID"),
  name: z.string().trim().min(2, "Enter the full name").max(150),
  email: z.string().trim().toLowerCase().email("Enter a valid email address").max(255),
  mobile: z
    .string()
    .trim()
    .transform(normalizeMobile)
    .refine((v) => MOBILE_PATTERN.test(v), { message: "Enter a valid 10-digit mobile number" }),
  level: z.enum(["UG", "PG"]),
  qualification: z.enum(QUALIFICATIONS).optional(),
  department: z.string().trim().max(150).optional(),
  city: z.string().trim().max(100).optional(),
  passingYear: z.number().int().optional(),
});

export const applicationIdSchema = z.object({ id: z.string().uuid("Invalid application ID") });

export const applicationListQuerySchema = z.object({
  driveId: z.string().uuid().optional(),

  candidateId: z.string().uuid().optional(),
  search: z.string().trim().optional(),
  status: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(25),
});

export type RegisterStudentInput = z.infer<typeof registerStudentSchema>;

async function loadDriveInScope(user: Actor, driveId: string): Promise<Row> {
  const scope = await driveScope(user);
  const drive: Row | null = await rdb().drive.findFirst({ where: { id: driveId, deletedAt: null } });

if (!drive || !inScope(scope, driveId)) {
    throw new HttpError(404, "DRIVE_NOT_FOUND", "Drive not found");
  }

  return drive;
}

async function loadApplicationInScope(user: Actor, id: string) {
  const db = rdb();
  const application: Row | null = await db.application.findUnique({ where: { id } });
  const scope = await driveScope(user);

  if (!application || !inScope(scope, application.driveId)) {
    throw new HttpError(404, "APPLICATION_NOT_FOUND", "Application not found");
  }

  const candidate: Row | null = await db.candidate.findUnique({ where: { id: application.candidateId } });

  return { application, candidate: candidate as Row };
}

export async function myDrives(user: Actor) {
  const scope = await driveScope(user);
  const db = rdb();
  const drives: Row[] = await db.drive.findMany({
    where: scope === "ALL" ? { deletedAt: null } : { id: { in: scope }, deletedAt: null },
  });
  const colleges: Row[] = drives.length
    ? await db.college.findMany({ where: { id: { in: drives.map((d) => d.collegeId) } } })
    : [];
  const apps: Row[] = drives.length
    ? await db.application.findMany({ where: { driveId: { in: drives.map((d) => d.id) } } })
    : [];

  return drives.map((d) => ({
    id: d.id,
    title: d.title,
    status: d.status,
    levelAllowed: d.levelAllowed ?? "BOTH",
    registrationOpen: d.registrationOpen ?? false,
    accessCode: d.accessCode ?? null,
    testStartsAt: d.testStartsAt ?? null,
    testEndsAt: d.testEndsAt ?? null,
    college: colleges.find((c) => c.id === d.collegeId)?.name ?? null,
    students: apps.filter((a) => a.driveId === d.id).length,
  }));
}

async function describe(applications: Row[]) {
  if (applications.length === 0) return [];

  const db = rdb();
  const ids = applications.map((a) => a.id);
  const [candidates, credentials, attempts]: [Row[], Row[], Row[]] = await Promise.all([
    db.candidate.findMany({ where: { id: { in: applications.map((a) => a.candidateId) } } }),
    db.candidateCredential.findMany({ where: { applicationId: { in: ids } } }),
    db.testAttempt.findMany({ where: { applicationId: { in: ids } } }),
  ]);
  const now = new Date();

return applications.map((a) => {
    const credential = credentials.find((c) => c.applicationId === a.id);
    const attempt = attempts.find((t) => t.applicationId === a.id);
    const candidate = candidates.find((c) => c.id === a.candidateId);

    return {
      id: a.id,
      applicationNo: a.applicationNo,
      driveId: a.driveId,
      candidateId: a.candidateId,
      name: candidate?.name ?? null,
      email: a.email,
      mobile: a.mobile,
      level: a.level,
      status: a.status,
      verified: Boolean(a.emailVerifiedAt || a.verifiedManuallyByUserId),
      selfRegistered: !a.registeredByUserId,
      credentialIssued: Boolean(credential),
      mustChangePassword: credential ? credential.mustChangePassword : null,
      attemptStatus: attempt ? (attempt.status === "IN_PROGRESS" ? "IN_PROGRESS" : "SUBMITTED") : "NOT_STARTED",
      remainingSeconds:
        attempt && attempt.status === "IN_PROGRESS" ? remainingSeconds(now, attempt.deadline) : null,
      createdAt: a.createdAt,
    };
  });
}

export async function listApplications(user: Actor, query: z.infer<typeof applicationListQuerySchema>) {
  const scope = await driveScope(user);
  const where: Row = {};

  if (query.driveId) {
    if (!inScope(scope, query.driveId)) {
      throw new HttpError(404, "DRIVE_NOT_FOUND", "Drive not found");
    }

    where.driveId = query.driveId;
  } else if (scope !== "ALL") {
    where.driveId = { in: scope };
  }

  if (query.status) where.status = query.status;
  if (query.candidateId) where.candidateId = query.candidateId;

  const db = rdb();
  let rows: Row[] = await db.application.findMany({ where, orderBy: [{ createdAt: "desc" }] });

  if (query.search) {
    const needle = query.search.toLowerCase();
    const candidates: Row[] = rows.length
      ? await db.candidate.findMany({ where: { id: { in: rows.map((r) => r.candidateId) } } })
      : [];

    rows = rows.filter((r) => {
      const c = candidates.find((x) => x.id === r.candidateId);

      return (
        r.applicationNo.toLowerCase().includes(needle) ||
        r.email.includes(needle) ||
        r.mobile.includes(needle) ||
        (c?.name ?? "").toLowerCase().includes(needle)
      );
    });
  }

  const total = rows.length;
  const page = rows.slice((query.page - 1) * query.limit, query.page * query.limit);

  return {
    data: await describe(page),
    pagination: { page: query.page, limit: query.limit, total, totalPages: Math.ceil(total / query.limit) },
  };
}

export async function registerStudent(user: Actor, input: RegisterStudentInput, actor: AuditActor = {}) {
  const drive = await loadDriveInScope(user, input.driveId);

  if (drive.status !== "PUBLISHED" || !drive.registrationOpen || !drive.isActive) {
    throw new HttpError(409, "REGISTRATION_CLOSED", "Registration is not open for this drive");
  }

  if (!allowedLevels(drive.levelAllowed ?? "BOTH").includes(input.level)) {
    throw new HttpError(400, "LEVEL_NOT_ALLOWED", `This drive does not allow ${input.level} students`);
  }

  if (input.passingYear !== undefined) {
    const { min, max } = passingYearRange();

    if (input.passingYear < min || input.passingYear > max) {
      throw new HttpError(400, "VALIDATION_ERROR", "Invalid passing year", {
        fieldErrors: { passingYear: [`Passing year must be between ${min} and ${max}`] },
      });
    }
  }

  const db = rdb();
  const duplicate: Row | null =
    (await db.application.findFirst({ where: { driveId: input.driveId, email: input.email } })) ??
    (await db.application.findFirst({ where: { driveId: input.driveId, mobile: input.mobile } }));

  if (duplicate) {
    throw new HttpError(409, "DUPLICATE_APPLICATION", "A student with this email or mobile number is already registered for this drive");
  }

  const year = new Date().getFullYear();

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const id = await db.$transaction(async (tx) => {
        const counter: Row = await tx.applicationCounter.upsert({
          where: { year },
          create: { year, lastValue: 1 },
          update: { lastValue: { increment: 1 } },
        });
        const existing: Row | null = await tx.candidate.findFirst({ where: { email: input.email, deletedAt: null } });
        const candidate: Row =
          existing ??
          (await tx.candidate.create({
            data: {
              name: input.name,
              email: input.email,
              collegeId: drive.collegeId,
              mobile: input.mobile,
              ...(input.city ? { city: input.city } : {}),
              ...(input.qualification ? { qualification: input.qualification } : {}),
              ...(input.department ? { department: input.department } : {}),
              ...(input.passingYear !== undefined ? { passingYear: input.passingYear } : {}),
            },
          }));
        const created: Row = await tx.application.create({
          data: {
            applicationNo: formatApplicationNumber(year, counter.lastValue),
            candidateId: candidate.id,
            driveId: input.driveId,
            level: input.level,
            email: input.email,
            mobile: input.mobile,
            registeredByUserId: user.id,
          },
        });

        await tx.applicationStatusHistory.create({
          data: { applicationId: created.id, fromStatus: null, toStatus: "REGISTERED", changedByUserId: user.id, note: "Registered by staff" },
        });
        await writeAudit(asAuditDb(tx), actor, {
          action: "APPLICATION_REGISTERED",
          entity: "Application",
          entityId: created.id,
          details: { driveId: input.driveId, level: input.level },
        });

        return created.id as string;
      });
      const { application } = await loadApplicationInScope(user, id);

      return (await describe([application]))[0];
    } catch (error) {
      if (isUniqueViolation(error)) {

const again: Row | null =
          (await db.application.findFirst({ where: { driveId: input.driveId, email: input.email } })) ??
          (await db.application.findFirst({ where: { driveId: input.driveId, mobile: input.mobile } }));

        if (again) {
          throw new HttpError(409, "DUPLICATE_APPLICATION", "A student with this email or mobile number is already registered for this drive");
        }

        continue;
      }

      throw error;
    }
  }

  throw new HttpError(409, "TRY_AGAIN", "Could not allocate an application number. Please try again.");
}

export async function verifyStudent(user: Actor, id: string, actor: AuditActor = {}) {
  const { application } = await loadApplicationInScope(user, id);

  if (!application.verifiedManuallyByUserId) {
    await rdb().$transaction(async (tx) => {
      await tx.application.update({
        where: { id },
        data: { verifiedManuallyByUserId: user.id, emailVerifiedAt: new Date() },
      });
      await writeAudit(asAuditDb(tx), actor, {
        action: "APPLICATION_VERIFIED",
        entity: "Application",
        entityId: id,
      });
    });
  }

  const fresh = (await loadApplicationInScope(user, id)).application;

  return (await describe([fresh]))[0];
}

export type IssuedCredential = {
  loginId: string;
  temporaryPassword: string;
  mustChangePassword: true;
};

export async function issueCredential(user: Actor, id: string, actor: AuditActor = {}): Promise<IssuedCredential> {
  const { application } = await loadApplicationInScope(user, id);

  if (!application.verifiedManuallyByUserId && !application.emailVerifiedAt) {
    throw new HttpError(409, "NOT_VERIFIED", "Verify the student's identity before issuing a credential");
  }

  const db = rdb();
  const attempt: Row | null = await db.testAttempt.findFirst({ where: { applicationId: id } });

  if (attempt && attempt.status !== "IN_PROGRESS") {
    throw new HttpError(409, "ATTEMPT_FINISHED", "This student has already submitted the assessment");
  }

  const temporaryPassword = generateTemporaryPassword();
  const passwordHash = await bcrypt.hash(temporaryPassword, 12);
  const existing: Row | null = await db.candidateCredential.findUnique({ where: { applicationId: id } });

  await db.$transaction(async (tx) => {
    await tx.candidateCredential.upsert({
      where: { applicationId: id },
      create: { applicationId: id, passwordHash, mustChangePassword: true, issuedByUserId: user.id },
      update: {
        passwordHash,
        mustChangePassword: true,
        issuedByUserId: user.id,
        issuedAt: new Date(),
        passwordChangedAt: null,
        failedAttempts: 0,
        lockedUntil: null,
      },
    });

    await tx.candidateSession.updateMany({
      where: { applicationId: id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    await writeAudit(asAuditDb(tx), actor, {
      action: existing ? "CANDIDATE_CREDENTIAL_RESET" : "CANDIDATE_CREDENTIAL_ISSUED",
      entity: "Application",
      entityId: id,
    });
  });

  return { loginId: application.applicationNo, temporaryPassword, mustChangePassword: true };
}

export async function listInterviewSchedule(user: Actor, driveId?: string) {
  const scope = await driveScope(user);

  if (driveId && !inScope(scope, driveId)) throw new HttpError(404, "DRIVE_NOT_FOUND", "Drive not found");

  const db = rdb();
  const apps: Row[] = await db.application.findMany({
    where: driveId ? { driveId } : scope === "ALL" ? {} : { driveId: { in: scope } },
  });

  if (apps.length === 0) return [];

  const [interviews, candidates, interviewers]: [Row[], Row[], Row[]] = await Promise.all([
    db.interview.findMany({ where: { candidateId: { in: [...new Set(apps.map((a) => a.candidateId as string))] } } }),
    db.candidate.findMany({ where: { id: { in: apps.map((a) => a.candidateId) } } }),
    db.user.findMany({}),
  ]);

  return interviews
    .filter((i) => i.status !== "CANCELLED")
    .map((i) => {
      const app = apps.find((a) => a.candidateId === i.candidateId) as Row;

      return {
        interviewId: i.id as string,
        applicationId: app.id as string,
        applicationNo: app.applicationNo as string,
        name: (candidates.find((c) => c.id === i.candidateId)?.name ?? "") as string,
        scheduledAt: i.scheduledAt as Date,
        durationMinutes: i.durationMinutes as number,
        status: i.status as string,
        interviewer: (interviewers.find((u) => u.id === i.interviewerId)?.name ?? null) as string | null,
      };
    })
    .sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime());
}
