import { Prisma } from "../../generated/prisma/client";
import {
  changedFields,
  writeAudit,
  type AuditActor,
} from "../../lib/audit.js";
import { prisma } from "../../lib/prisma.js";

import type {
  CreateDriveInput,
  UpdateDriveInput,
  DriveListQuery,
} from "./drives.schema.js";

function formatDrive(drive: {
  id: string;
  title: string;
  description: string | null;
  collegeId: string;
  status: "DRAFT" | "PUBLISHED" | "CLOSED" | "CANCELLED";
  startDate: Date | null;
  endDate: Date | null;
  isActive: boolean;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  college: {
    id: string;
    name: string;
    city: string;
  };
}) {
  return {
    id: drive.id,
    title: drive.title,
    description: drive.description,
    collegeId: drive.collegeId,
    status: drive.status,
    startDate: drive.startDate,
    endDate: drive.endDate,
    isActive: drive.isActive,
    deletedAt: drive.deletedAt,
    createdAt: drive.createdAt,
    updatedAt: drive.updatedAt,
    college: drive.college,
  };
}

export async function listDrives(query: DriveListQuery) {
  const {
    search,
    collegeId,
    status,
    isActive,
    page,
    limit,
  } = query;

  const where: Prisma.DriveWhereInput = {
    deletedAt: null,
  };

  if (search) {
    where.OR = [
      {
        title: {
          contains: search,
          mode: "insensitive",
        },
      },
      {
        description: {
          contains: search,
          mode: "insensitive",
        },
      },
    ];
  }

  if (collegeId) {
    where.collegeId = collegeId;
  }

  if (status) {
    where.status = status;
  }

  if (isActive !== undefined) {
    where.isActive = isActive;
  }

  const skip = (page - 1) * limit;

  const [drives, total] = await prisma.$transaction([
    prisma.drive.findMany({
      where,
      include: {
        college: {
          select: {
            id: true,
            name: true,
            city: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
      skip,
      take: limit,
    }),

    prisma.drive.count({
      where,
    }),
  ]);

  return {
    data: drives.map(formatDrive),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

export async function getDriveById(id: string) {
  const drive = await prisma.drive.findFirst({
    where: {
      id,
      deletedAt: null,
    },
    include: {
      college: {
        select: {
          id: true,
          name: true,
          city: true,
        },
      },
    },
  });

  if (!drive) {
    return null;
  }

  return formatDrive(drive);
}

export async function createDrive(
  input: CreateDriveInput,
  actor: AuditActor = {},
) {
  const college = await prisma.college.findFirst({
    where: {
      id: input.collegeId,
      deletedAt: null,
      isActive: true,
    },
  });

  if (!college) {
    return null;
  }

  const drive = await prisma.$transaction(async (tx) => {
  const created = await tx.drive.create({
    data: {
      title: input.title,
      collegeId: input.collegeId,
      status: input.status,
      isActive: input.isActive,

      ...(input.description !== undefined && {
        description: input.description,
      }),

      ...(input.startDate !== undefined && {
        startDate: input.startDate,
      }),

      ...(input.endDate !== undefined && {
        endDate: input.endDate,
      }),
    },
    include: {
      college: {
        select: {
          id: true,
          name: true,
          city: true,
        },
      },
    },
  });

  await writeAudit(tx, actor, {
    action: "DRIVE_CREATED",
    entity: "Drive",
    entityId: created.id,
    details: {
      collegeId: created.collegeId,
      status: created.status,
      isActive: created.isActive,
    },
  });

  return created;
  });

  return formatDrive(drive);
}

export async function updateDrive(
  id: string,
  input: UpdateDriveInput,
  actor: AuditActor = {},
) {
  const existingDrive =
    await prisma.drive.findFirst({
      where: {
        id,
        deletedAt: null,
      },
    });

  if (!existingDrive) {
    return null;
  }

  if (input.collegeId !== undefined) {
    const college = await prisma.college.findFirst({
      where: {
        id: input.collegeId,
        deletedAt: null,
        isActive: true,
      },
    });

    if (!college) {
      return null;
    }
  }

  const drive = await prisma.$transaction(async (tx) => {
  const updated = await tx.drive.update({
    where: {
      id,
    },
    data: {
      ...(input.title !== undefined && {
        title: input.title,
      }),

      ...(input.description !== undefined && {
        description: input.description,
      }),

      ...(input.collegeId !== undefined && {
        collegeId: input.collegeId,
      }),

      ...(input.status !== undefined && {
        status: input.status,
      }),

      ...(input.startDate !== undefined && {
        startDate: input.startDate,
      }),

      ...(input.endDate !== undefined && {
        endDate: input.endDate,
      }),

      ...(input.isActive !== undefined && {
        isActive: input.isActive,
      }),
    },
    include: {
      college: {
        select: {
          id: true,
          name: true,
          city: true,
        },
      },
    },
  });

  const activeChanged =
    input.isActive !== undefined &&
    input.isActive !== existingDrive.isActive;

  await writeAudit(tx, actor, {
    action: activeChanged
      ? input.isActive
        ? "DRIVE_REACTIVATED"
        : "DRIVE_DEACTIVATED"
      : "DRIVE_UPDATED",
    entity: "Drive",
    entityId: id,
    details: {
      changedFields: changedFields(input),
      ...(input.status !== undefined && {
        previousStatus: existingDrive.status,
        newStatus: updated.status,
      }),
    },
  });

  return updated;
  });

  return formatDrive(drive);
}

export async function deleteDrive(
  id: string,
  actor: AuditActor = {},
) {
  const existingDrive =
    await prisma.drive.findFirst({
      where: {
        id,
        deletedAt: null,
      },
    });

  if (!existingDrive) {
    return null;
  }

  const drive = await prisma.$transaction(async (tx) => {
    const deleted = await tx.drive.update({
      where: {
        id,
      },
      data: {
        isActive: false,
        deletedAt: new Date(),
      },
      include: {
        college: {
          select: {
            id: true,
            name: true,
            city: true,
          },
        },
      },
    });

    await writeAudit(tx, actor, {
      action: "DRIVE_DELETED",
      entity: "Drive",
      entityId: id,
      details: {
        collegeId: deleted.collegeId,
        previousStatus: existingDrive.status,
      },
    });

    return deleted;
  });

  return formatDrive(drive);
}