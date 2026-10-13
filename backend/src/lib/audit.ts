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

const SENSITIVE_KEY =
  /password|passwd|token|secret|hash|credential|cookie|authorization|api[-_]?key/i;

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

export async function writeAudit(
  db: AuditDb,
  actor: AuditActor,
  event: AuditEvent,
): Promise<void> {
  await db.auditLog.create({ data: toData(actor, event) });
}

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
