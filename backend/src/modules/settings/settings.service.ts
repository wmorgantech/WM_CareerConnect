import {
  changedFields,
  writeAudit,
  type AuditActor,
} from "../../lib/audit.js";
import { prisma } from "../../lib/prisma.js";

import type {
  UpdateSettingsInput,
} from "./settings.schema.js";

const DEFAULT_TIMEZONE = "Asia/Kolkata";

export const DEFAULT_SETTINGS = {
  id: null,
  companyName: null,
  companyEmail: null,
  companyPhone: null,
  companyAddress: null,
  logoUrl: null,
  timezone: DEFAULT_TIMEZONE,
  createdAt: null,
  updatedAt: null,
} as const;

export async function getSettings() {
  const settings = await prisma.setting.findFirst({
    orderBy: {
      createdAt: "asc",
    },
  });

  return settings ?? { ...DEFAULT_SETTINGS };
}

export async function updateSettings(
  input: UpdateSettingsInput,
  actor: AuditActor = {},
) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.setting.findFirst({
      orderBy: {
        createdAt: "asc",
      },
    });

    const saved = existing
      ? await tx.setting.update({
          where: {
            id: existing.id,
          },
          data: {
            ...(input.companyName !== undefined && {
              companyName: input.companyName,
            }),
            ...(input.companyEmail !== undefined && {
              companyEmail: input.companyEmail,
            }),
            ...(input.companyPhone !== undefined && {
              companyPhone: input.companyPhone,
            }),
            ...(input.companyAddress !== undefined && {
              companyAddress: input.companyAddress,
            }),
            ...(input.logoUrl !== undefined && {
              logoUrl: input.logoUrl,
            }),
            ...(input.timezone !== undefined && {
              timezone: input.timezone,
            }),
          },
        })
      : await tx.setting.create({
          data: {
            companyName: input.companyName ?? null,
            companyEmail: input.companyEmail ?? null,
            companyPhone: input.companyPhone ?? null,
            companyAddress: input.companyAddress ?? null,
            logoUrl: input.logoUrl ?? null,
            timezone: input.timezone ?? DEFAULT_TIMEZONE,
          },
        });

    await writeAudit(tx, actor, {
      action: existing ? "SETTINGS_UPDATED" : "SETTINGS_CREATED",
      entity: "Setting",
      entityId: saved.id,
      details: {
        changedFields: changedFields(input),
        ...(input.timezone !== undefined && {
          previousTimezone: existing?.timezone ?? DEFAULT_TIMEZONE,
          newTimezone: saved.timezone,
        }),
      },
    });

    return saved;
  });
}
