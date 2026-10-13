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

export function httpUrl(message: string) {
  return z
    .string()
    .trim()
    .url(message)
    .refine(isHttpUrl, message);
}
