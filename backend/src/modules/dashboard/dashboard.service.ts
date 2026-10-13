import { istDayStart } from "../../lib/ist.js";
import { isMissingSchemaError } from "../../lib/http-error.js";
import { prisma } from "../../lib/prisma.js";
import { rdb, recruitmentClientReady } from "../../lib/recruitment-db.js";

async function getAssessmentStats(now: Date) {
  if (!recruitmentClientReady()) return null;

  try {
    const db = rdb();
    const count = (status: string) => db.application.count({ where: { status } });
    const [
      registered,
      registeredToday,
      testsInProgress,
      submitted,
      shortlisted,
      selected,
      flagged,
    ] = await Promise.all([
      db.application.count({}),
      db.application.count({ where: { createdAt: { gte: istDayStart(now) } } }),
      count("TEST_IN_PROGRESS"),
      db.testAttempt.count({ where: { status: { in: ["SUBMITTED", "AUTO_SUBMITTED"] } } }),
      count("SHORTLISTED"),
      count("SELECTED"),
      db.testAttempt.count({ where: { flaggedForReview: true } }),
    ]);

    return { registered, registeredToday, testsInProgress, submitted, shortlisted, selected, flaggedForReview: flagged };
  } catch (error) {
    if (isMissingSchemaError(error)) return null;

    throw error;
  }
}

export async function getDashboardStats() {
  const [
    totalUsers,
    totalColleges,
    totalDrives,
    totalCandidates,
    assessment,
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
    getAssessmentStats(new Date()),
  ]);

  return {
    totalUsers,
    totalColleges,
    totalDrives,
    totalCandidates,
    ...(assessment ? { assessment } : {}),
  };
}
