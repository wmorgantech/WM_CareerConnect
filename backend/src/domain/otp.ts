import crypto from "node:crypto";

export const OTP_LENGTH = 6;
export const OTP_TTL_SECONDS = 5 * 60;
export const OTP_MAX_ATTEMPTS = 5;

export function generateOtp(): string {
  return crypto.randomInt(0, 10 ** OTP_LENGTH).toString().padStart(OTP_LENGTH, "0");
}

export function otpExpiry(now: Date): Date {
  return new Date(now.getTime() + OTP_TTL_SECONDS * 1000);
}

export function hashOtp(code: string, pepper: string, subject: string): string {

return crypto
    .createHmac("sha256", pepper)
    .update(`${subject.toLowerCase()}:${code}`)
    .digest("hex");
}

function safeEqualHex(a: string, b: string): boolean {
  const left = Buffer.from(a, "hex");
  const right = Buffer.from(b, "hex");

  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

export type OtpRecord = {
  codeHash: string;
  expiresAt: Date;
  attempts: number;
  usedAt: Date | null;
};

export type OtpVerdict =
  | "VALID"
  | "INVALID"
  | "EXPIRED"
  | "ALREADY_USED"
  | "TOO_MANY_ATTEMPTS";

export function evaluateOtp(input: {
  record: OtpRecord;
  code: string;
  pepper: string;
  subject: string;
  now: Date;
  maxAttempts?: number;
}): OtpVerdict {
  const { record, now } = input;
  const maxAttempts = input.maxAttempts ?? OTP_MAX_ATTEMPTS;

  if (record.usedAt !== null) {
    return "ALREADY_USED";
  }

  if (now.getTime() > record.expiresAt.getTime()) {
    return "EXPIRED";
  }

  if (record.attempts >= maxAttempts) {
    return "TOO_MANY_ATTEMPTS";
  }

  const candidate = hashOtp(input.code, input.pepper, input.subject);

  return safeEqualHex(candidate, record.codeHash) ? "VALID" : "INVALID";
}
