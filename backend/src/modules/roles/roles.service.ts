import { STAFF_ROLE_NAMES } from "../../domain/staff-roles.js";
import { prisma } from "../../lib/prisma.js";

export async function listRoles() {
  return prisma.role.findMany({
    where: {
      name: {
        in: [...STAFF_ROLE_NAMES],
      },
    },
    select: {
      id: true,
      name: true,
      description: true,
    },
    orderBy: {
      name: "asc",
    },
  });
}
