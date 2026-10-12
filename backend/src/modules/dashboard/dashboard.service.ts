import { prisma } from "../../lib/prisma.js";

export async function getDashboardStats() {
  const [
    totalUsers,
    totalColleges,
    totalDrives,
    totalCandidates,
  ] = await Promise.all([
    prisma.user.count({
      where: {
        status: "ACTIVE",
      },
    }),
    prisma.college.count({
      where: {
        isActive: true,
        deletedAt: null,
      },
    }),
    prisma.drive.count({
      where: {
        isActive: true,
        deletedAt: null,
      },
    }),
    prisma.candidate.count({
      where: {
        isActive: true,
        deletedAt: null,
      },
    }),
  ]);

  return {
    totalUsers,
    totalColleges,
    totalDrives,
    totalCandidates,
  };
}
