import { z } from "zod";

export function isHttpUrl(value: string): boolean {
  if (!/^https?:\/\/[^\s/?#]/i.test(value)) {
    return false;
  }

  try {
    const { protocol, hostname } = new URL(value);

    return (
      (protocol === "http:" ||
        protocol === "https:") &&
      hostname.length > 0
    );
  } catch {
    return false;
  }
}

// Absolute http(s) URL only. javascript:, data:, file:, ftp:, relative and
// malformed values are rejected. Chain .max() / .optional() as usual.
export function httpUrl(message: string) {
  return z
    .string()
    .trim()
    .url(message)
    .refine(isHttpUrl, message);
}
