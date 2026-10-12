import type { Request } from "express";

import type { Prisma } from "../generated/prisma/client";

export type AuditActor = {
  userId?: string;
  ipAddress?: string;
  userAgent?: string;
};

export type AuditEvent = {
  action: string;
  entity: string;
  entityId?: string | null;
  details?: Record<string, unknown>;
};

type AuditDb = Pick<Prisma.TransactionClient, "auditLog">;

const MAX_USER_AGENT_LENGTH = 500;
const MAX_IP_LENGTH = 100;
const MAX_DETAILS_LENGTH = 2000;
const MAX_VALUE_LENGTH = 200;

// Keys that must never be written to an audit entry, whatever the caller
// passes. The audit UI masks the same names as a second line of defence.
const SENSITIVE_KEY =
  /password|passwd|token|secret|hash|credential|cookie|authorization|api[-_]?key/i;

// Actor, IP address and user agent for the current request. Only those three
// values are read from it, never headers as a whole.
export function getAuditActor(req: Request): AuditActor {
  const userAgent = req.get("user-agent");

  return {
    ...(req.user?.id !== undefined && { userId: req.user.id }),
    ...(req.ip !== undefined && {
      ipAddress: req.ip.slice(0, MAX_IP_LENGTH),
    }),
    ...(userAgent !== undefined && {
      userAgent: userAgent.slice(0, MAX_USER_AGENT_LENGTH),
    }),
  };
}

function sanitizeValue(value: unknown): unknown {
  if (typeof value === "string") {
    return value.length > MAX_VALUE_LENGTH
      ? `${value.slice(0, MAX_VALUE_LENGTH)}…`
      : value;
  }

  if (Array.isArray(value)) {
    return value.slice(0, 50).map(sanitizeValue);
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (value && typeof value === "object") {
    return sanitizeAuditDetails(
      value as Record<string, unknown>,
    );
  }

  return value;
}

export function sanitizeAuditDetails(
  details: Record<string, unknown>,
): Record<string, unknown> {
  const safe: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(details)) {
    if (value === undefined || SENSITIVE_KEY.test(key)) {
      continue;
    }

    safe[key] = sanitizeValue(value);
  }

  return safe;
}

// Names of the fields a request actually sets. Values are deliberately not
// recorded: they can be personal data and are not needed to see what changed.
export function changedFields(
  input: Record<string, unknown>,
): string[] {
  return Object.keys(input).filter(
    (key) =>
      input[key] !== undefined && !SENSITIVE_KEY.test(key),
  );
}

function toData(actor: AuditActor, event: AuditEvent) {
  const details = event.details
    ? JSON.stringify(sanitizeAuditDetails(event.details))
    : null;

  return {
    userId: actor.userId ?? null,
    action: event.action,
    entity: event.entity,
    entityId: event.entityId ?? null,
    details:
      details !== null && details.length > MAX_DETAILS_LENGTH
        ? JSON.stringify({ truncated: true })
        : details,
    ipAddress: actor.ipAddress ?? null,
    userAgent: actor.userAgent ?? null,
  };
}

// Use inside the same transaction as the change it describes: the entry and
// the change commit or roll back together, so a failed operation never leaves
// a success entry behind (and a success never lacks its entry).
export async function writeAudit(
  db: AuditDb,
  actor: AuditActor,
  event: AuditEvent,
): Promise<void> {
  await db.auditLog.create({ data: toData(actor, event) });
}

// For events with no data change to make atomic with (login, logout). A
// failure to write the entry is logged and must not block the user.
export async function writeAuditBestEffort(
  db: AuditDb,
  actor: AuditActor,
  event: AuditEvent,
): Promise<void> {
  try {
    await writeAudit(db, actor, event);
  } catch (error) {
    const { logger } = await import("./logger.js");

    logger.error(
      { err: error, action: event.action },
      "Failed to write audit log entry",
    );
  }
}
