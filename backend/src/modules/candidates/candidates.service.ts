import { Prisma } from "../../generated/prisma/client";
import {
  changedFields,
  writeAudit,
  type AuditActor,
} from "../../lib/audit.js";
import { prisma } from "../../lib/prisma.js";

import type {
  CreateCandidateInput,
  UpdateCandidateInput,
  CandidateListQuery,
} from "./candidates.schema.js";

function formatCandidate(candidate: {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  collegeId: string | null;
  resumeUrl: string | null;
  isActive: boolean;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  college: {
    id: string;
    name: string;
    city: string;
  } | null;
}) {
  return {
    id: candidate.id,
    name: candidate.name,
    email: candidate.email,
    phone: candidate.phone,
    collegeId: candidate.collegeId,
    resumeUrl: candidate.resumeUrl,
    isActive: candidate.isActive,
    deletedAt: candidate.deletedAt,
    createdAt: candidate.createdAt,
    updatedAt: candidate.updatedAt,
    college: candidate.college,
  };
}

export async function listCandidates(
  query: CandidateListQuery,
) {
  const {
    search,
    collegeId,
    isActive,
    page,
    limit,
  } = query;

  const where: Prisma.CandidateWhereInput = {
    deletedAt: null,
  };

  if (search) {
    where.OR = [
      {
        name: {
          contains: search,
          mode: "insensitive",
        },
      },
      {
        email: {
          contains: search,
          mode: "insensitive",
        },
      },
      {
        phone: {
          contains: search,
          mode: "insensitive",
        },
      },
    ];
  }

  if (collegeId) {
    where.collegeId = collegeId;
  }

  if (isActive !== undefined) {
    where.isActive = isActive;
  }

  const skip = (page - 1) * limit;

  const [candidates, total] = await prisma.$transaction([
    prisma.candidate.findMany({
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

    prisma.candidate.count({
      where,
    }),
  ]);

  return {
    data: candidates.map(formatCandidate),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

export async function getCandidateById(
  id: string,
) {
  const candidate = await prisma.candidate.findFirst({
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

  if (!candidate) {
    return null;
  }

  return formatCandidate(candidate);
}

export async function createCandidate(
  input: CreateCandidateInput,
  actor: AuditActor = {},
) {
  if (input.collegeId) {
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

  const candidate = await prisma.$transaction(async (tx) => {
  const created = await tx.candidate.create({
    data: {
      name: input.name,
      email: input.email,
      isActive: input.isActive,

      ...(input.phone !== undefined && {
        phone: input.phone,
      }),

      ...(input.collegeId !== undefined && {
        collegeId: input.collegeId,
      }),

      ...(input.resumeUrl !== undefined && {
        resumeUrl: input.resumeUrl,
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
    action: "CANDIDATE_CREATED",
    entity: "Candidate",
    entityId: created.id,
    details: {
      collegeId: created.collegeId,
      isActive: created.isActive,
    },
  });

  return created;
  });

  return formatCandidate(candidate);
}

export async function updateCandidate(
  id: string,
  input: UpdateCandidateInput,
  actor: AuditActor = {},
) {
  const existingCandidate =
    await prisma.candidate.findFirst({
      where: {
        id,
        deletedAt: null,
      },
    });

  if (!existingCandidate) {
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

  const candidate = await prisma.$transaction(async (tx) => {
  const updated = await tx.candidate.update({
    where: {
      id,
    },
    data: {
      ...(input.name !== undefined && {
        name: input.name,
      }),

      ...(input.email !== undefined && {
        email: input.email,
      }),

      ...(input.phone !== undefined && {
        phone: input.phone,
      }),

      ...(input.collegeId !== undefined && {
        collegeId: input.collegeId,
      }),

      ...(input.resumeUrl !== undefined && {
        resumeUrl: input.resumeUrl,
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
    input.isActive !== existingCandidate.isActive;

  await writeAudit(tx, actor, {
    action: activeChanged
      ? input.isActive
        ? "CANDIDATE_REACTIVATED"
        : "CANDIDATE_DEACTIVATED"
      : "CANDIDATE_UPDATED",
    entity: "Candidate",
    entityId: id,
    details: {
      changedFields: changedFields(input),
    },
  });

  return updated;
  });

  return formatCandidate(candidate);
}

export async function deleteCandidate(
  id: string,
  actor: AuditActor = {},
) {
  const existingCandidate =
    await prisma.candidate.findFirst({
      where: {
        id,
        deletedAt: null,
      },
    });

  if (!existingCandidate) {
    return null;
  }

  const candidate = await prisma.$transaction(async (tx) => {
    const deleted = await tx.candidate.update({
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
      action: "CANDIDATE_DELETED",
      entity: "Candidate",
      entityId: id,
      details: {
        collegeId: deleted.collegeId,
      },
    });

    return deleted;
  });

  return formatCandidate(candidate);
}