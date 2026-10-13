import bcrypt from "bcrypt";

import { prisma } from "../../lib/prisma.js";
import { rdb } from "../../lib/recruitment-db.js";
import {
  createAuditLog,
} from "../audit-logs/audit-logs.service.js";

import { COLLEGE_SCOPED_ROLES } from "../../domain/college-scope.js";
import { nonAssignableRoles } from "../../domain/staff-roles.js";
import {
  assertAccountChangeAllowed,
  UserSafetyError,
} from "./user-safety.js";

import type {
  CreateUserInput,
  UpdateUserInput,
  UserListQuery,
} from "./users.schema.js";

const userSelect = {
  id: true,
  email: true,
  name: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  userRoles: {
    include: {
      role: {
        select: {
          id: true,
          name: true,
          description: true,
        },
      },
    },
  },
} as const;

function formatUser(user: any) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    status: user.status,
    roles: user.userRoles.map((userRole: any) => ({
      id: userRole.role.id,
      name: userRole.role.name,
      description: userRole.role.description,
    })),
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

async function validateRoles(roleIds: string[]) {
  const roles = await prisma.role.findMany({
    where: {
      id: {
        in: roleIds,
      },
    },
    select: {
      id: true,
      name: true,
    },
  });

  if (roles.length !== roleIds.length) {
    throw new Error(
      "One or more selected roles do not exist",
    );
  }

  const blocked = nonAssignableRoles(roles);

  if (blocked.length > 0) {
    throw new UserSafetyError(
      "ROLE_NOT_ASSIGNABLE",
      `The ${blocked
        .map((role) => role.name)
        .join(", ")} role cannot be assigned to a staff user`,
      400,
    );
  }

  return roles;
}

export function isForeignKeyViolation(
  error: unknown,
): boolean {
  if (typeof error !== "object" || error === null) {
    return false;
  }

  const candidate = error as {
    code?: unknown;
    cause?: { originalCode?: unknown; code?: unknown };
    meta?: { driverAdapterError?: { cause?: { originalCode?: unknown } } };
  };

  const codes = [
    candidate.code,
    candidate.cause?.originalCode,
    candidate.cause?.code,
    candidate.meta?.driverAdapterError?.cause?.originalCode,
  ];

  return codes.some(
    (code) =>
      code === "P2003" ||
      code === "P2014" ||
      code === "23503" ||
      code === "23001",
  );
}

export async function listUsers(
  query: UserListQuery,
) {
  const { search, status, page, limit } = query;

  const where = {
    ...(status
      ? {
          status,
        }
      : {}),

    ...(search
      ? {
          OR: [
            {
              name: {
                contains: search,
                mode: "insensitive" as const,
              },
            },
            {
              email: {
                contains: search,
                mode: "insensitive" as const,
              },
            },
          ],
        }
      : {}),
  };

  const [users, total] = await prisma.$transaction([
    prisma.user.findMany({
      where,
      select: userSelect,
      orderBy: {
        createdAt: "desc",
      },
      skip: (page - 1) * limit,
      take: limit,
    }),

    prisma.user.count({
      where,
    }),
  ]);

  return {
    users: users.map(formatUser),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

export async function getUserById(
  userId: string,
) {
  const user = await prisma.user.findUnique({
    where: {
      id: userId,
    },
    select: userSelect,
  });

  if (!user) {
    throw new Error("User not found");
  }

  return formatUser(user);
}

export async function createUser(
  input: CreateUserInput,
  actorId?: string,
) {
  const existingUser =
    await prisma.user.findUnique({
      where: {
        email: input.email.toLowerCase(),
      },
      select: {
        id: true,
      },
    });

  if (existingUser) {
    throw new Error(
      "A user with this email already exists",
    );
  }

  const roles = await validateRoles(input.roleIds);
  const collegeIds = input.collegeIds ?? [];

  if (collegeIds.length > 0) {
    if (!roles.some((role) => COLLEGE_SCOPED_ROLES.includes(role.name as never))) {
      throw new UserSafetyError(
        "NOT_COLLEGE_SCOPED",
        "Only HOD and STAFF accounts have a college scope",
        400,
      );
    }

    const found: { id: string }[] = await rdb().college.findMany({
      where: { id: { in: collegeIds }, deletedAt: null, isActive: true },
    });

    if (found.length !== collegeIds.length) {
      throw new UserSafetyError(
        "COLLEGE_NOT_FOUND",
        "One or more colleges do not exist or are inactive",
        400,
      );
    }
  }

  const passwordHash = await bcrypt.hash(
    input.password,
    12,
  );

  const data = {
    email: input.email.toLowerCase(),
    name: input.name,
    passwordHash,
    status: "ACTIVE" as const,

    userRoles: {
      create: input.roleIds.map((roleId) => ({
        roleId,
      })),
    },
  };

  // Without colleges this is the same single create as before. With colleges, the account, its roles and
  // its college assignments are written together or not at all.
  const user =
    collegeIds.length === 0
      ? await prisma.user.create({ data, select: userSelect })
      : await rdb().$transaction(async (tx) => {
          const created = await tx.user.create({ data, select: userSelect });

          await tx.userCollege.createMany({
            data: collegeIds.map((collegeId) => ({ userId: created.id, collegeId })),
          });

          return created;
        });

  await createAuditLog({
    ...(actorId !== undefined && {
      userId: actorId,
    }),
    action: "USER_CREATED",
    entity: "User",
    entityId: user.id,
    details: JSON.stringify({
      email: user.email,
      name: user.name,
      roleIds: input.roleIds,
      colleges: collegeIds.length,
    }),
  });

  return formatUser(user);
}

export async function updateUser(
  userId: string,
  input: UpdateUserInput,
  actorId?: string,
) {
  const existingUser =
    await prisma.user.findUnique({
      where: {
        id: userId,
      },
      select: {
        id: true,
        email: true,
      },
    });

  if (!existingUser) {
    throw new Error("User not found");
  }

  if (input.email) {
    const email = input.email.toLowerCase();

    const emailOwner =
      await prisma.user.findFirst({
        where: {
          email,
          NOT: {
            id: userId,
          },
        },
        select: {
          id: true,
        },
      });

    if (emailOwner) {
      throw new Error(
        "A user with this email already exists",
      );
    }
  }

  if (input.roleIds) {
    await validateRoles(input.roleIds);
  }

  const passwordHash = input.password
    ? await bcrypt.hash(input.password, 12)
    : undefined;

  let sessionsRevoked = 0;

  const user = await prisma.$transaction(
    async (transaction) => {
      if (input.status === "INACTIVE") {
        await assertAccountChangeAllowed(
          transaction,
          {
            actorId,
            targetId: userId,
            change: { kind: "DEACTIVATE" },
          },
        );
      }

      if (input.roleIds) {
        await assertAccountChangeAllowed(
          transaction,
          {
            actorId,
            targetId: userId,
            change: {
              kind: "SET_ROLES",
              roleIds: input.roleIds,
            },
          },
        );
      }

      if (input.roleIds) {
        await transaction.userRole.deleteMany({
          where: {
            userId,
          },
        });
      }

      const updated = await transaction.user.update({
        where: {
          id: userId,
        },

        data: {
          ...(input.email
            ? {
                email: input.email.toLowerCase(),
              }
            : {}),

          ...(input.name
            ? {
                name: input.name,
              }
            : {}),

          ...(passwordHash
            ? {
                passwordHash,
              }
            : {}),

          ...(input.status
            ? {
                status: input.status,
              }
            : {}),

          ...(input.roleIds
            ? {
                userRoles: {
                  create: input.roleIds.map(
                    (roleId) => ({
                      roleId,
                    }),
                  ),
                },
              }
            : {}),
        },

        select: userSelect,
      });

if (passwordHash || input.status === "INACTIVE") {
        sessionsRevoked = await revokeAllSessions(
          transaction,
          userId,
        );
      }

      return updated;
    },
  );

  await createAuditLog({
    ...(actorId !== undefined && {
      userId: actorId,
    }),
    action: "USER_UPDATED",
    entity: "User",
    entityId: userId,
    details: JSON.stringify({
      ...((passwordHash !== undefined ||
        input.status === "INACTIVE") && {
        sessionsRevoked,
      }),
      emailChanged:
        input.email !== undefined,
      nameChanged:
        input.name !== undefined,
      passwordChanged:
        input.password !== undefined,
      statusChanged:
        input.status !== undefined,
      rolesChanged:
        input.roleIds !== undefined,
    }),
  });

  return formatUser(user);
}

async function revokeAllSessions(
  transaction: {
    refreshToken: {
      updateMany(args: {
        where: { userId: string; revokedAt: null };
        data: { revokedAt: Date };
      }): Promise<{ count: number }>;
    };
  },
  userId: string,
) {
  const revoked = await transaction.refreshToken.updateMany({
    where: {
      userId,
      revokedAt: null,
    },
    data: {
      revokedAt: new Date(),
    },
  });

  return revoked.count;
}

export async function updateUserStatus(
  userId: string,
  status: "ACTIVE" | "INACTIVE",
  actorId?: string,
) {
  const user = await prisma.user.findUnique({
    where: {
      id: userId,
    },
    select: {
      id: true,
      status: true,
    },
  });

  if (!user) {
    throw new Error("User not found");
  }

  const updatedUser = await prisma.$transaction(
    async (transaction) => {
      if (status === "INACTIVE") {
        await assertAccountChangeAllowed(
          transaction,
          {
            actorId,
            targetId: userId,
            change: { kind: "DEACTIVATE" },
          },
        );
      }

      const updated = await transaction.user.update({
        where: {
          id: userId,
        },

        data: {
          status,
        },

        select: userSelect,
      });

if (status === "INACTIVE") {
        await revokeAllSessions(transaction, userId);
      }

      return updated;
    },
  );

  await createAuditLog({
    ...(actorId !== undefined && {
      userId: actorId,
    }),
    action:
      status === "ACTIVE"
        ? "USER_REACTIVATED"
        : "USER_DEACTIVATED",
    entity: "User",
    entityId: userId,
    details: JSON.stringify({
      previousStatus: user.status,
      newStatus: status,
    }),
  });

  return formatUser(updatedUser);
}

export async function deleteUser(
  userId: string,
  actorId?: string,
) {
  const user = await prisma.user.findUnique({
    where: {
      id: userId,
    },
    select: {
      id: true,
      email: true,
      name: true,
    },
  });

  if (!user) {
    throw new Error("User not found");
  }

  await prisma.$transaction(
    async (transaction) => {
      await assertAccountChangeAllowed(
        transaction,
        {
          actorId,
          targetId: userId,
          change: { kind: "DELETE" },
        },
      );

const assignedInterviews =
        await transaction.interview.count({
          where: {
            interviewerId: userId,
          },
        });

      if (assignedInterviews > 0) {
        throw new UserSafetyError(
          "USER_ASSIGNED_TO_INTERVIEWS",
          `This user is the interviewer on ${assignedInterviews} interview${assignedInterviews === 1 ? "" : "s"} and cannot be deleted. Deactivate the account instead.`,
          409,
        );
      }

      try {
        await transaction.user.delete({
          where: {
            id: userId,
          },
        });
      } catch (error) {

if (isForeignKeyViolation(error)) {
          throw new UserSafetyError(
            "USER_IN_USE",
            "This user is referenced by other records and cannot be deleted. Deactivate the account instead.",
            409,
          );
        }

        throw error;
      }
    },
  );

  await createAuditLog({
    ...(actorId !== undefined && {
      userId: actorId,
    }),
    action: "USER_DELETED",
    entity: "User",
    entityId: userId,
    details: JSON.stringify({
      email: user.email,
      name: user.name,
    }),
  });
}