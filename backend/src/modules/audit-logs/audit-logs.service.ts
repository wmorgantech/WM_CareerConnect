import { istDateRangeFilter } from "../../lib/ist.js";
import { prisma } from "../../lib/prisma.js";

import type {
  AuditLogQuery,
  CreateAuditLogInput,
} from "./audit-logs.schema.js";

function getDateFilter(
  fromDate?: Date,
  toDate?: Date,
) {
  return istDateRangeFilter(fromDate, toDate);
}

export async function createAuditLog(
  input: CreateAuditLogInput,
) {
  return prisma.auditLog.create({
    data: {
      userId: input.userId ?? null,
      action: input.action,
      entity: input.entity ?? null,
      entityId: input.entityId ?? null,
      details: input.details ?? null,
      ipAddress: input.ipAddress ?? null,
      userAgent: input.userAgent ?? null,
    },
  });
}

export async function getAuditLogs(
  query: AuditLogQuery,
) {
  const {
    userId,
    action,
    entity,
    entityId,
    fromDate,
    toDate,
    page,
    limit,
  } = query;

  const where = {
    ...(userId !== undefined && {
      userId,
    }),

    ...(action !== undefined && {
      action,
    }),

    ...(entity !== undefined && {
      entity,
    }),

    ...(entityId !== undefined && {
      entityId,
    }),

    ...((fromDate !== undefined ||
      toDate !== undefined) && {
      createdAt: getDateFilter(
        fromDate,
        toDate,
      )!,
    }),
  };

  const skip = (page - 1) * limit;

  const [logs, total] = await prisma.$transaction([
    prisma.auditLog.findMany({
      where,
      orderBy: {
        createdAt: "desc",
      },
      skip,
      take: limit,
    }),

    prisma.auditLog.count({
      where,
    }),
  ]);

  return {
    logs,
    pagination: {
      page,
      limit,
      total,
      totalPages:
        total === 0
          ? 0
          : Math.ceil(total / limit),
    },
  };
}