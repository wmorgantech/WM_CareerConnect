import "dotenv/config";
import bcrypt from "bcrypt";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import {
  resolveDemoUsers,
  shouldSeedDemoUsers,
  type DemoUserTemplate,
} from "./seed-config.js";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is not configured");
}

const adapter = new PrismaPg({
  connectionString,
});

const prisma = new PrismaClient({
  adapter,
});

const roles = [
  {
    name: "SUPER_ADMIN",
    description: "Full system access",
  },
  {
    name: "HR_ADMIN",
    description: "HR and recruitment management access",
  },
  {
    name: "CAMPUS_COORDINATOR",
    description: "Assigned campus drive access",
  },
  {
    name: "INTERVIEWER",
    description: "Assigned interview access",
  },
  {
    name: "CANDIDATE",
    description: "Candidate self-service access",
  },
  {
    name: "HOD",
    description: "College-scoped results access (head of department)",
  },
  {
    name: "STAFF",
    description: "College-scoped results access (staff)",
  },
];

const permissionDefinitions = [
  {
    name: "users.manage",
    description: "Manage staff users",
  },
  {
    name: "roles.manage",
    description: "Manage roles and permissions",
  },
  {
    name: "settings.manage",
    description: "Manage system settings",
  },
  {
    name: "colleges.manage",
    description: "Create and manage colleges",
  },
  {
    name: "drives.manage",
    description: "Create and manage recruitment drives",
  },
  {
    name: "questions.manage",
    description: "Manage question bank",
  },
  {
    name: "tests.manage",
    description: "Manage test templates",
  },
  {
    name: "candidates.manage",
    description: "Create and manage candidates",
  },
  {
    name: "candidates.viewAll",
    description: "View candidates according to role scope",
  },
  {
    name: "candidates.register",
    description: "Register candidates",
  },
  {
    name: "testStatus.monitor",
    description: "Monitor candidate test status",
  },
  {
    name: "results.view",
    description: "View test results according to role scope",
  },
  {
    name: "candidates.shortlist",
    description: "Shortlist candidates",
  },
  {
    name: "candidates.reject",
    description: "Reject candidates",
  },
  {
    name: "interviews.schedule",
    description: "Schedule candidate interviews",
  },
  {
    name: "interviews.feedback",
    description:
      "View or submit interview feedback according to role scope",
  },
  {
    name: "reports.view",
    description: "View recruitment reports",
  },
  {
    name: "reports.export",
    description: "Export recruitment reports",
  },
  {
    name: "audit.view",
    description: "View audit logs",
  },
];

const rolePermissions: Record<string, string[]> = {
  SUPER_ADMIN: permissionDefinitions.map(
    (permission) => permission.name,
  ),

  HR_ADMIN: [
    "colleges.manage",
    "drives.manage",
    "candidates.manage",
    "candidates.viewAll",
    "candidates.register",
    "testStatus.monitor",
    "results.view",
    "candidates.shortlist",
    "candidates.reject",
    "interviews.schedule",
    "interviews.feedback",
    "reports.view",
    "reports.export",
  ],

  CAMPUS_COORDINATOR: [
    "candidates.viewAll",
    "candidates.register",
    "testStatus.monitor",
  ],

  INTERVIEWER: [
    "candidates.viewAll",
    "results.view",
    "interviews.feedback",
  ],

  CANDIDATE: [
    "candidates.register",
    "results.view",
  ],

HOD: ["results.view"],

  STAFF: ["results.view"],
};

const demoUserTemplates: DemoUserTemplate[] = [
  {
    email: "superadmin@wmorgantech.com",
    name: "Super Admin",
    role: "SUPER_ADMIN",
  },
  {
    email: "hr@wmorgantech.com",
    name: "HR Admin",
    role: "HR_ADMIN",
  },
  {
    email: "coordinator@wmorgantech.com",
    name: "Campus Coordinator",
    role: "CAMPUS_COORDINATOR",
  },
  {
    email: "interviewer@wmorgantech.com",
    name: "Interviewer",
    role: "INTERVIEWER",
  },
];

async function main() {
  console.log("🌱 Starting database seed...");

const permissions = await Promise.all(
    permissionDefinitions.map((permission) =>
      prisma.permission.upsert({
        where: {
          name: permission.name,
        },
        update: {
          description: permission.description,
        },
        create: {
          name: permission.name,
          description: permission.description,
        },
      }),
    ),
  );

  console.log(
    `✅ Permissions created: ${permissions.length}`,
  );

const createdRoles = await Promise.all(
    roles.map((role) =>
      prisma.role.upsert({
        where: {
          name: role.name,
        },
        update: {
          description: role.description,
        },
        create: {
          name: role.name,
          description: role.description,
        },
      }),
    ),
  );

  console.log(
    `✅ Roles created: ${createdRoles.length}`,
  );

for (const role of createdRoles) {
    const permissionNames =
      rolePermissions[role.name] ?? [];

    const rolePermissionData = permissionNames.map(
      (permissionName) => {
        const permission = permissions.find(
          (item) => item.name === permissionName,
        );

        if (!permission) {
          throw new Error(
            `Permission "${permissionName}" not found for role "${role.name}"`,
          );
        }

        return {
          roleId: role.id,
          permissionId: permission.id,
        };
      },
    );

    await prisma.rolePermission.deleteMany({
      where: {
        roleId: role.id,
      },
    });

    if (rolePermissionData.length > 0) {
      await prisma.rolePermission.createMany({
        data: rolePermissionData,
        skipDuplicates: true,
      });
    }

    console.log(
      `✅ ${role.name}: ${permissionNames.length} permissions assigned`,
    );
  }

if (shouldSeedDemoUsers(process.env)) {
    const demoUsers = resolveDemoUsers(
      demoUserTemplates,
      process.env,
    );

    for (const demoUser of demoUsers) {
      const role = createdRoles.find(
        (item) => item.name === demoUser.role,
      );

      if (!role) {
        throw new Error(
          `Role "${demoUser.role}" not found for user "${demoUser.email}"`,
        );
      }

      const existingUser = await prisma.user.findUnique({
        where: {
          email: demoUser.email,
        },
        select: {
          id: true,
        },
      });

      if (existingUser) {
        console.log(
          `⏭️  Demo user already exists, left unchanged: ${demoUser.email}`,
        );
        continue;
      }

      const passwordHash = await bcrypt.hash(
        demoUser.password,
        12,
      );

      await prisma.user.create({
        data: {
          email: demoUser.email,
          name: demoUser.name,
          passwordHash,
          status: "ACTIVE",
          userRoles: {
            create: [{ roleId: role.id }],
          },
        },
      });

      console.log(
        `✅ Demo user created: ${demoUser.email} → ${demoUser.role}`,
      );
    }
  } else {
    console.log(
      process.env.NODE_ENV === "production"
        ? "⏭️  Demo users are disabled in production"
        : "⏭️  Demo users skipped (SEED_DEMO_USERS)",
    );
  }

const college = await prisma.college.upsert({
    where: {
      id: "00000000-0000-0000-0000-000000000001",
    },
    update: {
      name: "Demo Engineering College",
      city: "Coimbatore",
      contactPerson: "Demo Coordinator",
      phone: "9876543210",
      email: "coordinator@demo-college.edu",
      isActive: true,
      deletedAt: null,
    },
    create: {
      id: "00000000-0000-0000-0000-000000000001",
      name: "Demo Engineering College",
      city: "Coimbatore",
      contactPerson: "Demo Coordinator",
      phone: "9876543210",
      email: "coordinator@demo-college.edu",
      isActive: true,
    },
  });

  console.log(
    `✅ College seeded: ${college.name}`,
  );

const existingSettings = await prisma.setting.findFirst();

  if (!existingSettings) {
    await prisma.setting.create({
      data: {
        timezone: "Asia/Kolkata",
      },
    });

    console.log("✅ Default settings record created");
  } else {
    console.log("⏭️  Settings record already exists");
  }

  console.log(
    "🎉 Database seed completed successfully!",
  );
}

main()
  .catch((error) => {
    console.error("❌ Seed failed:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });