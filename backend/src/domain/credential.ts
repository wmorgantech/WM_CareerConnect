import { randomInt } from "node:crypto";

const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
export const TEMP_PASSWORD_LENGTH = 10;

export function generateTemporaryPassword(): string {
  let out = "";

  for (let i = 0; i < TEMP_PASSWORD_LENGTH; i += 1) {
    out += ALPHABET[randomInt(ALPHABET.length)];
  }

  return out;
}

export const LOCK_AFTER_FAILURES = 5;
export const LOCK_MINUTES = 10;

export function isLocked(lockedUntil: Date | null, now: Date): boolean {
  return lockedUntil !== null && lockedUntil.getTime() > now.getTime();
}

export function checkNewPassword(
  password: string,
  context: { loginId: string; currentPassword: string },
): string | null {
  if (password.length < 8) return "Password must be at least 8 characters";
  if (password.length > 100) return "Password must not exceed 100 characters";
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    return "Password must contain at least one letter and one number";
  }
  if (password === context.currentPassword) {
    return "Choose a password different from the temporary one";
  }
  if (password.toLowerCase().includes(context.loginId.toLowerCase())) {
    return "Password must not contain your login ID";
  }

  return null;
}

export function normalizeLoginId(value: string): string {
  return value.trim().toUpperCase();
}

// Rules for a password a student chooses at self-registration (no login ID or
// temporary password exists yet). The email is the only personal detail checked.
export function checkChosenPassword(password: string, context: { email: string }): string | null {
  if (password.length < 8) return "Password must be at least 8 characters";
  if (password.length > 100) return "Password must not exceed 100 characters";
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    return "Password must contain at least one letter and one number";
  }

  const local = context.email.split("@")[0]?.toLowerCase() ?? "";

  if (local.length >= 4 && password.toLowerCase().includes(local)) {
    return "Password must not contain your email address";
  }

  return null;
}
