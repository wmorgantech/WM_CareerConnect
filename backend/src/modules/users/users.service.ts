import bcrypt from "bcrypt";

import { prisma } from "../../lib/prisma.js";
import {
  createAuditLog,
} from "../audit-logs/audit-logs.service.js";

import { assertAccountChangeAllowed } from "./user-safety.js";

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

  return roles;
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

  await validateRoles(input.roleIds);

  const passwordHash = await bcrypt.hash(
    input.password,
    12,
  );

  const user = await prisma.user.create({
    data: {
      email: input.email.toLowerCase(),
      name: input.name,
      passwordHash,
      status: "ACTIVE",

      userRoles: {
        create: input.roleIds.map((roleId) => ({
          roleId,
        })),
      },
    },

    select: userSelect,
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

      return transaction.user.update({
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

      return transaction.user.update({
        where: {
          id: userId,
        },

        data: {
          status,
        },

        select: userSelect,
      });
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

      await transaction.user.delete({
        where: {
          id: userId,
        },
      });
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