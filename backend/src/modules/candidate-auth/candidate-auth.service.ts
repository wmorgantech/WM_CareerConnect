import crypto from "node:crypto";

import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { z } from "zod";

import {
  LOCK_AFTER_FAILURES,
  LOCK_MINUTES,
  checkNewPassword,
  isLocked,
  normalizeLoginId,
} from "../../domain/credential.js";
import { writeAuditBestEffort, type AuditActor } from "../../lib/audit.js";
import { HttpError } from "../../lib/http-error.js";
import { asAuditDb, rdb } from "../../lib/recruitment-db.js";
import { isPendingVerification } from "./candidate-registration.service.js";

type Row = Record<string, any>;

const ACCESS_TTL = "15m";
export const CANDIDATE_SESSION_HOURS = 12;
export const CANDIDATE_AUDIENCE = "candidate";

export const candidateLoginSchema = z.object({
  loginId: z.string().trim().min(1, "Enter your login ID").max(50),
  password: z.string().min(1, "Enter your password").max(200),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: z.string().min(1).max(200),
});

function secret(): string {
  const value = process.env.JWT_ACCESS_SECRET;

  if (!value) throw new Error("JWT_ACCESS_SECRET is not configured");

  return value;
}

const sha256 = (value: string) => crypto.createHash("sha256").update(value).digest("hex");

export function signCandidateAccessToken(input: { applicationId: string; candidateId: string; sessionId: string }) {
  return jwt.sign(
    { sub: input.applicationId, cid: input.candidateId, sid: input.sessionId, type: "candidate" },
    secret(),
    { expiresIn: ACCESS_TTL, audience: CANDIDATE_AUDIENCE },
  );
}

export function verifyCandidateAccessToken(token: string) {
  const payload = jwt.verify(token, secret(), { audience: CANDIDATE_AUDIENCE }) as jwt.JwtPayload;

  if (payload.type !== "candidate" || typeof payload.sub !== "string" || typeof payload.sid !== "string" || typeof payload.cid !== "string") {
    throw new Error("Not a candidate token");
  }

  return { applicationId: payload.sub, candidateId: payload.cid, sessionId: payload.sid };
}

const invalid = () => new HttpError(401, "INVALID_CREDENTIALS", "Invalid login ID or password");

const DUMMY_HASH = bcrypt.hashSync("not-a-real-password", 12);

export function studentVisibleStatus(status: string): { code: string; label: string } {
  switch (status) {
    case "REGISTERED":
      return { code: "REGISTERED", label: "Registered" };
    case "TEST_IN_PROGRESS":
      return { code: "TEST_IN_PROGRESS", label: "Assessment in progress" };
    case "TEST_SUBMITTED":
      return { code: "TEST_SUBMITTED", label: "Assessment submitted" };
    case "INTERVIEW_SCHEDULED":
      return { code: "INTERVIEW_SCHEDULED", label: "Interview scheduled" };
    default:
      return { code: "UNDER_REVIEW", label: "Under review" };
  }
}

async function profile(application: Row, credential: Row) {
  const db = rdb();
  const [candidate, drive]: [Row | null, Row | null] = await Promise.all([
    db.candidate.findUnique({ where: { id: application.candidateId } }),
    db.drive.findUnique({ where: { id: application.driveId } }),
  ]);

  const college: Row | null = drive
    ? await db.college.findFirst({ where: { id: candidate?.collegeId ?? drive.collegeId } })
    : null;

  return {
    applicationNo: application.applicationNo,
    name: candidate?.name ?? "",
    email: application.email,
    mobile: application.mobile,
    level: application.level,
    college: college?.name ?? null,
    department: candidate?.department ?? null,
    drive: drive ? { id: drive.id, title: drive.title } : null,
    status: studentVisibleStatus(application.status),
    mustChangePassword: credential.mustChangePassword as boolean,
  };
}

async function openSession(application: Row) {
  const refreshToken = crypto.randomBytes(48).toString("hex");
  const session: Row = await rdb().candidateSession.create({
    data: {
      candidateId: application.candidateId,
      applicationId: application.id,
      tokenHash: sha256(refreshToken),
      expiresAt: new Date(Date.now() + CANDIDATE_SESSION_HOURS * 3_600_000),
    },
  });

  return {
    refreshToken,
    accessToken: signCandidateAccessToken({
      applicationId: application.id,
      candidateId: application.candidateId,
      sessionId: session.id,
    }),
  };
}

export async function candidateLogin(input: z.infer<typeof candidateLoginSchema>, actor: AuditActor = {}) {
  const db = rdb();
  const loginId = normalizeLoginId(input.loginId);
  const application: Row | null = await db.application.findFirst({ where: { applicationNo: loginId } });
  const credential: Row | null = application
    ? await db.candidateCredential.findUnique({ where: { applicationId: application.id } })
    : null;

  if (!application || !credential) {
    await bcrypt.compare(input.password, DUMMY_HASH);
    throw invalid();
  }

  const now = new Date();

  if (isLocked(credential.lockedUntil ?? null, now)) {
    throw new HttpError(
      429,
      "CREDENTIAL_LOCKED",
      "Too many wrong passwords. This account is locked for a few minutes; ask your coordinator if you need help.",
    );
  }

  const drive: Row | null = await db.drive.findUnique({ where: { id: application.driveId } });

  if (!drive || drive.deletedAt || !drive.isActive) {
    await bcrypt.compare(input.password, DUMMY_HASH);
    throw invalid();
  }

  if (!(await bcrypt.compare(input.password, credential.passwordHash))) {
    const updated: Row = await db.candidateCredential.update({
      where: { applicationId: application.id },
      data: { failedAttempts: { increment: 1 } },
    });

    if (updated.failedAttempts >= LOCK_AFTER_FAILURES) {
      await db.candidateCredential.update({
        where: { applicationId: application.id },
        data: { failedAttempts: 0, lockedUntil: new Date(now.getTime() + LOCK_MINUTES * 60_000) },
      });
    }

await writeAuditBestEffort(asAuditDb(db), actor, {
      action: "CANDIDATE_LOGIN_FAILED",
      entity: "Application",
      entityId: application.id,
    });
    throw invalid();
  }

  // Checked only after the password is right, so it cannot be used to probe login IDs.
  const registrant: Row | null = await db.candidate.findUnique({ where: { id: application.candidateId } });

  if (isPendingVerification(application, registrant)) {
    throw new HttpError(
      403,
      "REGISTRATION_PENDING_VERIFICATION",
      "Your registration is waiting for your campus coordinator to verify your identity. Please try again after they confirm it.",
    );
  }

  await db.candidateCredential.update({
    where: { applicationId: application.id },
    data: { failedAttempts: 0, lockedUntil: null, lastLoginAt: now },
  });

  const tokens = await openSession(application);

  return { ...tokens, user: await profile(application, credential) };
}

export async function candidateRefresh(refreshToken: string) {
  const db = rdb();
  const tokenHash = sha256(refreshToken);
  const session: Row | null = await db.candidateSession.findUnique({ where: { tokenHash } });

  if (!session || session.revokedAt || session.expiresAt.getTime() <= Date.now() || !session.applicationId) {
    throw new HttpError(401, "INVALID_REFRESH_TOKEN", "Please sign in again");
  }

  const application: Row | null = await db.application.findUnique({ where: { id: session.applicationId } });
  const credential: Row | null = application
    ? await db.candidateCredential.findUnique({ where: { applicationId: application.id } })
    : null;

  if (!application || !credential) {
    throw new HttpError(401, "INVALID_REFRESH_TOKEN", "Please sign in again");
  }

const next = crypto.randomBytes(48).toString("hex");
  const rotated = await db.candidateSession.updateMany({
    where: { id: session.id, tokenHash, revokedAt: null },
    data: { tokenHash: sha256(next) },
  });

  if (rotated.count !== 1) throw new HttpError(401, "INVALID_REFRESH_TOKEN", "Please sign in again");

  return {
    refreshToken: next,
    accessToken: signCandidateAccessToken({
      applicationId: application.id,
      candidateId: application.candidateId,
      sessionId: session.id,
    }),
    user: await profile(application, credential),
  };
}

export async function candidateLogout(input: { refreshToken?: string; sessionId?: string }) {
  const db = rdb();
  const where: Row | null = input.sessionId
    ? { id: input.sessionId, revokedAt: null }
    : input.refreshToken
      ? { tokenHash: sha256(input.refreshToken), revokedAt: null }
      : null;

  if (where) await db.candidateSession.updateMany({ where, data: { revokedAt: new Date() } });
}

export async function candidateChangePassword(
  ctx: { applicationId: string; sessionId: string },
  input: z.infer<typeof changePasswordSchema>,
  actor: AuditActor = {},
) {
  const db = rdb();
  const credential: Row | null = await db.candidateCredential.findUnique({ where: { applicationId: ctx.applicationId } });
  const application: Row | null = await db.application.findUnique({ where: { id: ctx.applicationId } });

  if (!credential || !application) throw invalid();

  if (!(await bcrypt.compare(input.currentPassword, credential.passwordHash))) {
    throw new HttpError(400, "VALIDATION_ERROR", "Your current password is not correct", {
      fieldErrors: { currentPassword: ["Your current password is not correct"] },
    });
  }

  const problem = checkNewPassword(input.newPassword, {
    loginId: application.applicationNo,
    currentPassword: input.currentPassword,
  });

  if (problem) {
    throw new HttpError(400, "VALIDATION_ERROR", problem, { fieldErrors: { newPassword: [problem] } });
  }

  const passwordHash = await bcrypt.hash(input.newPassword, 12);

  await db.$transaction(async (tx) => {
    await tx.candidateCredential.update({
      where: { applicationId: ctx.applicationId },
      data: { passwordHash, mustChangePassword: false, passwordChangedAt: new Date(), failedAttempts: 0, lockedUntil: null },
    });

    await tx.candidateSession.updateMany({
      where: { applicationId: ctx.applicationId, revokedAt: null, id: { not: ctx.sessionId } },
      data: { revokedAt: new Date() },
    });
  });

  await writeAuditBestEffort(asAuditDb(rdb()), actor, {
    action: "CANDIDATE_PASSWORD_CHANGED",
    entity: "Application",
    entityId: ctx.applicationId,
  });
}

export async function candidateMe(applicationId: string) {
  const db = rdb();
  const application: Row | null = await db.application.findUnique({ where: { id: applicationId } });
  const credential: Row | null = application
    ? await db.candidateCredential.findUnique({ where: { applicationId } })
    : null;

  if (!application || !credential) throw invalid();

  return profile(application, credential);
}
