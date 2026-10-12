import { prisma } from "../../lib/prisma.js";

// Read-only role choices for the Users form. Permissions are
// intentionally not included.
export async function listRoles() {
  return prisma.role.findMany({
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
