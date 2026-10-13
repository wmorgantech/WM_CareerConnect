import "dotenv/config";
import { PrismaClient } from "./src/generated/prisma";
import { PrismaPg } from "@prisma/adapter-pg";

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not configured");
  }

  const adapter = new PrismaPg({ connectionString });
  const prisma = new PrismaClient({ adapter });

  try {
    const users = await prisma.user.findMany({
      select: {
        email: true,
        status: true,
        userRoles: {
          select: {
            role: { select: { name: true } }
          }
        }
      },
      orderBy: { email: "asc" }
    });

    console.table(users.map(user => ({
      email: user.email,
      status: user.status,
      roles: user.userRoles.map(item => item.role.name).join(", ")
    })));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch(error => {
  console.error("Read-only inspection failed:", error.message);
  process.exitCode = 1;
});
