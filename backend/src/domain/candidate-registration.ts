import crypto from "node:crypto";
import { z } from "zod";

export const QUALIFICATIONS = [
  "BCA",
  "B.Sc CS",
  "B.Sc IT",
  "B.E/B.Tech",
  "MCA",
  "M.Sc CS",
  "M.Sc IT",
  "Other",
] as const;

export type Qualification = (typeof QUALIFICATIONS)[number];

export type TestLevel = "UG" | "PG";

export function suggestLevel(qualification: Qualification): TestLevel | null {
  switch (qualification) {
    case "BCA":
    case "B.Sc CS":
    case "B.Sc IT":
      return "UG";
    case "MCA":
    case "M.Sc CS":
    case "M.Sc IT":
      return "PG";
    default:
      return null;
  }
}

export const MOBILE_PATTERN = /^[6-9]\d{9}$/;

export function normalizeMobile(value: string): string {
  const digits = value.replace(/[\s-]/g, "");

return digits.replace(/^(\+91|91|0)(?=\d{10}$)/, "");
}

export function passingYearRange(now: Date = new Date()): {
  min: number;
  max: number;
} {

  const year = now.getFullYear();

  return { min: year - 15, max: year + 5 };
}

export function buildRegistrationSchema(now: Date = new Date()) {
  const { min, max } = passingYearRange(now);

  return z
    .object({
      fullName: z.string().trim().min(2, "Enter your full name").max(150),
      mobile: z
        .string()
        .trim()
        .transform(normalizeMobile)
        .refine((value) => MOBILE_PATTERN.test(value), {
          message: "Enter a valid 10-digit mobile number",
        }),
      email: z
        .string()
        .trim()
        .toLowerCase()
        .email("Enter a valid email address")
        .max(255),
      collegeId: z.string().uuid("Invalid college").optional(),
      collegeName: z.string().trim().min(2).max(200).optional(),
      city: z.string().trim().min(2, "Enter your city").max(100),
      qualification: z.enum(QUALIFICATIONS),
      department: z.string().trim().min(2, "Enter your department").max(150),
      passingYear: z
        .number()
        .int()
        .min(min, `Passing year must be ${min} or later`)
        .max(max, `Passing year must be ${max} or earlier`),
      skills: z
        .array(z.string().trim().min(1).max(50))
        .max(30, "Too many skills")
        .default([]),
      experience: z.enum(["FRESHER", "EXPERIENCED"]),
      yearsOfExperience: z.number().min(0).max(50).optional(),
      level: z.enum(["UG", "PG"]),
      consent: z.literal(true, {
        error: "You must accept the data-use consent to continue",
      }),
    })
    .superRefine((value, ctx) => {
      if (value.experience === "EXPERIENCED" && value.yearsOfExperience === undefined) {
        ctx.addIssue({
          code: "custom",
          path: ["yearsOfExperience"],
          message: "Enter your years of experience",
        });
      }

      if (value.collegeId === undefined && value.collegeName === undefined) {
        ctx.addIssue({
          code: "custom",
          path: ["collegeName"],
          message: "Select or enter your college",
        });
      }
    });
}

export type RegistrationInput = z.infer<
  ReturnType<typeof buildRegistrationSchema>
>;

const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const ACCESS_CODE_LENGTH = 6;

export function generateAccessCode(): string {
  let code = "";

  for (let i = 0; i < ACCESS_CODE_LENGTH; i += 1) {
    code += CODE_ALPHABET[crypto.randomInt(0, CODE_ALPHABET.length)];
  }

  return code;
}

export function normalizeAccessCode(value: string): string {
  return value.replace(/\s+/g, "").toUpperCase();
}

export function isValidAccessCodeFormat(value: string): boolean {
  const code = normalizeAccessCode(value);

  return (
    code.length === ACCESS_CODE_LENGTH &&
    [...code].every((char) => CODE_ALPHABET.includes(char))
  );
}

export function accessCodeMatches(submitted: string, stored: string): boolean {
  const a = Buffer.from(normalizeAccessCode(submitted));
  const b = Buffer.from(normalizeAccessCode(stored));

  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function formatApplicationNumber(year: number, sequence: number): string {
  if (!Number.isInteger(sequence) || sequence < 1) {
    throw new Error("Application sequence must be a positive integer");
  }

  return `WMC-${year}-${String(sequence).padStart(5, "0")}`;
}
