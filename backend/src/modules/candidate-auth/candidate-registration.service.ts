import bcrypt from "bcrypt";
import { z } from "zod";

import {
  MOBILE_PATTERN,
  QUALIFICATIONS,
  accessCodeMatches,
  formatApplicationNumber,
  isValidAccessCodeFormat,
  normalizeAccessCode,
  normalizeMobile,
  passingYearRange,
} from "../../domain/candidate-registration.js";
import { checkChosenPassword } from "../../domain/credential.js";
import { writeAudit, type AuditActor } from "../../lib/audit.js";
import { HttpError, isUniqueViolation } from "../../lib/http-error.js";
import { asAuditDb, rdb } from "../../lib/recruitment-db.js";
import { allowedLevels } from "../drive-config/drive-config.service.js";

type Row = Record<string, any>;

// Student self-registration. The student reaches a drive with the access code the
// campus coordinator hands out, chooses a password, and gets a login ID (the
// application number). Nothing here issues a session: the student has to sign in,
// and sign-in stays closed until a coordinator verifies their identity (see
// isPendingVerification). Self-registration can only ever create a candidate
// application; it cannot create or change a staff account or any role.

const accessCode = z
  .string()
  .trim()
  .min(1, "Enter the access code")
  .max(20)
  .refine(isValidAccessCodeFormat, { message: "That access code is not valid" });

export const accessCodeQuerySchema = z.object({ code: accessCode });

export const selfRegistrationSchema = z
  .object({
    accessCode,
    name: z.string().trim().min(2, "Enter your full name").max(150),
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
    password: z.string().max(200),
    consent: z.literal(true, { error: "You must accept the data-use consent to continue" }),
  })
  .strict(); // an unknown field (for example "roles") is rejected, never ignored

export type SelfRegistrationInput = z.infer<typeof selfRegistrationSchema>;

const NO_DRIVE = () => new HttpError(404, "DRIVE_NOT_FOUND", "No drive matches that access code");

async function openDriveByCode(code: string): Promise<Row> {
  const submitted = normalizeAccessCode(code);
  const drive: Row | null = await rdb().drive.findFirst({ where: { accessCode: submitted, deletedAt: null } });

  if (!drive?.accessCode || !accessCodeMatches(submitted, drive.accessCode)) throw NO_DRIVE();

  if (drive.status !== "PUBLISHED" || !drive.isActive || !drive.registrationOpen) {
    throw new HttpError(409, "REGISTRATION_CLOSED", "Registration is not open for this drive");
  }

  return drive;
}

// What the registration form may show before the student submits: the drive and
// its college, never its internal ids, counts or schedule.
export async function lookupDriveForRegistration(code: string) {
  const drive = await openDriveByCode(code);
  const college: Row | null = await rdb().college.findFirst({ where: { id: drive.collegeId } });

  return {
    title: drive.title as string,
    college: (college?.name ?? null) as string | null,
    levels: allowedLevels(drive.levelAllowed ?? "BOTH"),
  };
}

const DUPLICATE = () =>
  new HttpError(409, "DUPLICATE_APPLICATION", "These details are already registered for this drive. Sign in with your login ID, or ask your coordinator for help.");

export async function registerSelf(input: SelfRegistrationInput, actor: AuditActor = {}) {
  const drive = await openDriveByCode(input.accessCode);

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

  const weak = checkChosenPassword(input.password, { email: input.email });

  if (weak) {
    throw new HttpError(400, "VALIDATION_ERROR", weak, { fieldErrors: { password: [weak] } });
  }

  const db = rdb();
  const taken = async () =>
    (await db.application.findFirst({ where: { driveId: drive.id, email: input.email } })) ??
    (await db.application.findFirst({ where: { driveId: drive.id, mobile: input.mobile } }));

  if (await taken()) throw DUPLICATE();

  const passwordHash = await bcrypt.hash(input.password, 12);
  const year = new Date().getFullYear();

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      return await db.$transaction(async (tx) => {
        const counter: Row = await tx.applicationCounter.upsert({
          where: { year },
          create: { year, lastValue: 1 },
          update: { lastValue: { increment: 1 } },
        });
        // Always a new candidate record: attaching to an existing one by email
        // would hand a stranger that person's interviews.
        const candidate: Row = await tx.candidate.create({
          data: {
            name: input.name,
            email: input.email,
            collegeId: drive.collegeId,
            mobile: input.mobile,
            consentAt: new Date(),
            ...(input.city ? { city: input.city } : {}),
            ...(input.qualification ? { qualification: input.qualification } : {}),
            ...(input.department ? { department: input.department } : {}),
            ...(input.passingYear !== undefined ? { passingYear: input.passingYear } : {}),
          },
        });
        const created: Row = await tx.application.create({
          data: {
            applicationNo: formatApplicationNumber(year, counter.lastValue),
            candidateId: candidate.id,
            driveId: drive.id,
            level: input.level,
            email: input.email,
            mobile: input.mobile,
          },
        });

        await tx.candidateCredential.create({
          data: { applicationId: created.id, passwordHash, mustChangePassword: false },
        });
        await tx.applicationStatusHistory.create({
          data: { applicationId: created.id, fromStatus: null, toStatus: "REGISTERED", note: "Self-registered" },
        });
        await writeAudit(asAuditDb(tx), actor, {
          action: "APPLICATION_SELF_REGISTERED",
          entity: "Application",
          entityId: created.id,
          details: { driveId: drive.id, level: input.level },
        });

        return {
          loginId: created.applicationNo as string,
          drive: drive.title as string,
          status: "PENDING_VERIFICATION" as const,
        };
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        if (await taken()) throw DUPLICATE();

        continue; // the application number was taken by a parallel registration
      }

      throw error;
    }
  }

  throw new HttpError(409, "TRY_AGAIN", "Could not complete registration. Please try again.");
}

// A self-registered application (the student gave consent and no staff member
// registered it) cannot sign in until a coordinator has verified the student.
// Staff-registered applications are unaffected: they only get a credential after
// verification, so they are already past this step.
export function isPendingVerification(application: Row, candidate: Row | null): boolean {
  return (
    !application.registeredByUserId &&
    !application.emailVerifiedAt &&
    !application.verifiedManuallyByUserId &&
    Boolean(candidate?.consentAt)
  );
}
