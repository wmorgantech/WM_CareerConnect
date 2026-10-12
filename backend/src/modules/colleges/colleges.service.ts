import { Prisma } from "../../generated/prisma/client";
import { prisma } from "../../lib/prisma.js";

import {
  createAuditLog,
} from "../audit-logs/audit-logs.service.js";

import type {
  CreateCollegeInput,
  UpdateCollegeInput,
  CollegeListQuery,
} from "./colleges.schema.js";

function formatCollege(college: {
  id: string;
  name: string;
  city: string;
  contactPerson: string | null;
  phone: string | null;
  email: string | null;
  isActive: boolean;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: college.id,
    name: college.name,
    city: college.city,
    contactPerson: college.contactPerson,
    phone: college.phone,
    email: college.email,
    isActive: college.isActive,
    deletedAt: college.deletedAt,
    createdAt: college.createdAt,
    updatedAt: college.updatedAt,
  };
}

export async function listColleges(
  query: CollegeListQuery,
) {
  const {
    search,
    city,
    isActive,
    page,
    limit,
  } = query;

  const where: Prisma.CollegeWhereInput = {
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
        city: {
          contains: search,
          mode: "insensitive",
        },
      },
      {
        contactPerson: {
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
    ];
  }

  if (city) {
    where.city = {
      equals: city,
      mode: "insensitive",
    };
  }

  if (isActive !== undefined) {
    where.isActive = isActive;
  }

  const skip = (page - 1) * limit;

  const [colleges, total] =
    await prisma.$transaction([
      prisma.college.findMany({
        where,
        orderBy: {
          name: "asc",
        },
        skip,
        take: limit,
      }),

      prisma.college.count({
        where,
      }),
    ]);

  return {
    data: colleges.map(formatCollege),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

export async function getCollegeById(
  id: string,
) {
  const college = await prisma.college.findFirst({
    where: {
      id,
      deletedAt: null,
    },
  });

  if (!college) {
    return null;
  }

  return formatCollege(college);
}

export async function createCollege(
  input: CreateCollegeInput,
  actorId?: string,
) {
  const college = await prisma.college.create({
    data: {
      name: input.name,
      city: input.city,

      ...(input.contactPerson !== undefined && {
        contactPerson: input.contactPerson,
      }),

      ...(input.phone !== undefined && {
        phone: input.phone,
      }),

      ...(input.email !== undefined && {
        email: input.email,
      }),

      isActive: input.isActive,
    },
  });

  await createAuditLog({
    ...(actorId !== undefined && {
      userId: actorId,
    }),
    action: "COLLEGE_CREATED",
    entity: "College",
    entityId: college.id,
    details: JSON.stringify({
      name: college.name,
      city: college.city,
      isActive: college.isActive,
    }),
  });

  return formatCollege(college);
}

export async function updateCollege(
  id: string,
  input: UpdateCollegeInput,
  actorId?: string,
) {
  const existingCollege =
    await prisma.college.findFirst({
      where: {
        id,
        deletedAt: null,
      },
    });

  if (!existingCollege) {
    return null;
  }

  const college = await prisma.college.update({
    where: {
      id,
    },
    data: {
      ...(input.name !== undefined && {
        name: input.name,
      }),

      ...(input.city !== undefined && {
        city: input.city,
      }),

      ...(input.contactPerson !== undefined && {
        contactPerson: input.contactPerson,
      }),

      ...(input.phone !== undefined && {
        phone: input.phone,
      }),

      ...(input.email !== undefined && {
        email: input.email,
      }),

      ...(input.isActive !== undefined && {
        isActive: input.isActive,
      }),
    },
  });

  let action = "COLLEGE_UPDATED";

  if (
    input.isActive === true &&
    existingCollege.isActive === false
  ) {
    action = "COLLEGE_REACTIVATED";
  } else if (
    input.isActive === false &&
    existingCollege.isActive === true
  ) {
    action = "COLLEGE_DEACTIVATED";
  }

  await createAuditLog({
    ...(actorId !== undefined && {
      userId: actorId,
    }),
    action,
    entity: "College",
    entityId: college.id,
    details: JSON.stringify({
      name: college.name,
      city: college.city,
      previousIsActive:
        existingCollege.isActive,
      newIsActive: college.isActive,
      fieldsUpdated: {
        name: input.name !== undefined,
        city: input.city !== undefined,
        contactPerson:
          input.contactPerson !== undefined,
        phone: input.phone !== undefined,
        email: input.email !== undefined,
        isActive: input.isActive !== undefined,
      },
    }),
  });

  return formatCollege(college);
}

export async function deleteCollege(
  id: string,
  actorId?: string,
) {
  const existingCollege =
    await prisma.college.findFirst({
      where: {
        id,
        deletedAt: null,
      },
    });

  if (!existingCollege) {
    return null;
  }

  const college = await prisma.college.update({
    where: {
      id,
    },
    data: {
      isActive: false,
      deletedAt: new Date(),
    },
  });

  await createAuditLog({
    ...(actorId !== undefined && {
      userId: actorId,
    }),
    action: "COLLEGE_DELETED",
    entity: "College",
    entityId: college.id,
    details: JSON.stringify({
      name: existingCollege.name,
      city: existingCollege.city,
      previousIsActive:
        existingCollege.isActive,
    }),
  });

  return formatCollege(college);
}