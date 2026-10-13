import {
  InterviewStatus,
  Prisma,
} from "../../generated/prisma/client";
import { createCsv } from "../../lib/csv.js";
import { istDateRangeFilter } from "../../lib/ist.js";
import { prisma } from "../../lib/prisma.js";

import type { ReportQuery } from "./reports.schema.js";

type ReportUser = {
  id: string;
  permissions: string[];
};

function getDateFilter(
  fromDate?: Date,
  toDate?: Date,
): Prisma.DateTimeFilter | undefined {
  return istDateRangeFilter(fromDate, toDate);
}

export async function getCandidateReport(
  query: ReportQuery,
) {
  const {
    driveId,
    collegeId,
    fromDate,
    toDate,
    page,
    limit,
  } = query;

  const dateFilter = getDateFilter(
    fromDate,
    toDate,
  );

  const where: Prisma.CandidateWhereInput = {
    isActive: true,
    deletedAt: null,
  };

  if (collegeId) {
    where.collegeId = collegeId;
  }

  if (dateFilter) {
    where.createdAt = dateFilter;
  }

  if (driveId) {
    const drive = await prisma.drive.findFirst({
      where: {
        id: driveId,
        deletedAt: null,
      },
      select: {
        collegeId: true,
      },
    });

    if (!drive) {
      return {
        type: "DRIVE_NOT_FOUND" as const,
      };
    }

    where.collegeId = drive.collegeId;
  }

  const skip = (page - 1) * limit;

  const [candidates, total] =
    await prisma.$transaction([
      prisma.candidate.findMany({
        where,
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          collegeId: true,
          resumeUrl: true,
          createdAt: true,
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
    type: "SUCCESS" as const,
    data: candidates,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

export async function getInterviewReport(
  query: ReportQuery,
) {
  const {
    driveId,
    collegeId,
    status,
    fromDate,
    toDate,
    page,
    limit,
  } = query;

  const dateFilter = getDateFilter(
    fromDate,
    toDate,
  );

  const where: Prisma.InterviewWhereInput = {};

  if (status) {
    where.status =
      status === "SCHEDULED"
        ? InterviewStatus.SCHEDULED
        : status === "COMPLETED"
          ? InterviewStatus.COMPLETED
          : InterviewStatus.CANCELLED;
  }

  if (dateFilter) {
    where.scheduledAt = dateFilter;
  }

  if (collegeId) {
    where.candidate = {
      collegeId,
    };
  }

  if (driveId) {
    const drive = await prisma.drive.findFirst({
      where: {
        id: driveId,
        deletedAt: null,
      },
      select: {
        collegeId: true,
      },
    });

    if (!drive) {
      return {
        type: "DRIVE_NOT_FOUND" as const,
      };
    }

    where.candidate = {
      collegeId: drive.collegeId,
    };
  }

  const skip = (page - 1) * limit;

  const [interviews, total] =
    await prisma.$transaction([
      prisma.interview.findMany({
        where,
        include: {
          candidate: {
            select: {
              id: true,
              name: true,
              email: true,
              college: {
                select: {
                  id: true,
                  name: true,
                  city: true,
                },
              },
            },
          },
        },
        orderBy: {
          scheduledAt: "desc",
        },
        skip,
        take: limit,
      }),

      prisma.interview.count({
        where,
      }),
    ]);

  return {
    type: "SUCCESS" as const,
    data: interviews,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

export async function getResultReport(
  query: ReportQuery,
) {
  const {
    driveId,
    collegeId,
    fromDate,
    toDate,
    page,
    limit,
  } = query;

  const feedbackDateFilter = getDateFilter(
    fromDate,
    toDate,
  );

  const where: Prisma.InterviewWhereInput = {
    status: InterviewStatus.COMPLETED,
    feedbackSubmittedAt: {
      not: null,
    },
  };

  if (feedbackDateFilter) {
    where.feedbackSubmittedAt = {
      not: null,
      ...feedbackDateFilter,
    };
  }

  if (collegeId) {
    where.candidate = {
      collegeId,
    };
  }

  if (driveId) {
    const drive = await prisma.drive.findFirst({
      where: {
        id: driveId,
        deletedAt: null,
      },
      select: {
        collegeId: true,
      },
    });

    if (!drive) {
      return {
        type: "DRIVE_NOT_FOUND" as const,
      };
    }

    where.candidate = {
      collegeId: drive.collegeId,
    };
  }

  const skip = (page - 1) * limit;

  const [results, total] =
    await prisma.$transaction([
      prisma.interview.findMany({
        where,
        select: {
          id: true,
          candidateId: true,
          interviewerId: true,
          scheduledAt: true,
          status: true,
          feedback: true,
          score: true,
          feedbackSubmittedAt: true,
          candidate: {
            select: {
              id: true,
              name: true,
              email: true,
              college: {
                select: {
                  id: true,
                  name: true,
                  city: true,
                },
              },
            },
          },
        },
        orderBy: {
          feedbackSubmittedAt: "desc",
        },
        skip,
        take: limit,
      }),

      prisma.interview.count({
        where,
      }),
    ]);

  return {
    type: "SUCCESS" as const,
    data: results,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

export async function getReport(
  query: ReportQuery,
  _user: ReportUser,
) {
  switch (query.type) {
    case "CANDIDATES":
      return getCandidateReport(query);

    case "INTERVIEWS":
      return getInterviewReport(query);

    case "RESULTS":
      return getResultReport(query);
  }
}

export async function exportReport(
  query: ReportQuery,
  _user: ReportUser,
) {
  const exportQuery: ReportQuery = {
    ...query,
    page: 1,
    limit: 100,
  };

  switch (query.type) {
    case "CANDIDATES": {
      const result =
        await getCandidateReport(exportQuery);

      if (result.type === "DRIVE_NOT_FOUND") {
        return result;
      }

      const csv = createCsv(
        [
          "ID",
          "Name",
          "Email",
          "Phone",
          "College ID",
          "College Name",
          "City",
          "Resume URL",
          "Created At",
        ],
        result.data.map((candidate) => [
          candidate.id,
          candidate.name,
          candidate.email,
          candidate.phone,
          candidate.collegeId,
          candidate.college?.name,
          candidate.college?.city,
          candidate.resumeUrl,
          candidate.createdAt,
        ]),
      );

      return {
        type: "SUCCESS" as const,
        filename: "candidates-report.csv",
        rowCount: result.data.length,
        csv,
      };
    }

    case "INTERVIEWS": {
      const result =
        await getInterviewReport(exportQuery);

      if (result.type === "DRIVE_NOT_FOUND") {
        return result;
      }

      const csv = createCsv(
        [
          "ID",
          "Candidate ID",
          "Candidate Name",
          "Candidate Email",
          "College",
          "City",
          "Interviewer ID",
          "Scheduled At",
          "Duration Minutes",
          "Meeting Link",
          "Notes",
          "Status",
          "Feedback",
          "Score",
          "Feedback Submitted At",
        ],
        result.data.map((interview) => [
          interview.id,
          interview.candidateId,
          interview.candidate.name,
          interview.candidate.email,
          interview.candidate.college?.name,
          interview.candidate.college?.city,
          interview.interviewerId,
          interview.scheduledAt,
          interview.durationMinutes,
          interview.meetingLink,
          interview.notes,
          interview.status,
          interview.feedback,
          interview.score,
          interview.feedbackSubmittedAt,
        ]),
      );

      return {
        type: "SUCCESS" as const,
        filename: "interviews-report.csv",
        rowCount: result.data.length,
        csv,
      };
    }

    case "RESULTS": {
      const result =
        await getResultReport(exportQuery);

      if (result.type === "DRIVE_NOT_FOUND") {
        return result;
      }

      const csv = createCsv(
        [
          "Interview ID",
          "Candidate ID",
          "Candidate Name",
          "Candidate Email",
          "College",
          "City",
          "Interviewer ID",
          "Scheduled At",
          "Status",
          "Feedback",
          "Score",
          "Feedback Submitted At",
        ],
        result.data.map((item) => [
          item.id,
          item.candidateId,
          item.candidate.name,
          item.candidate.email,
          item.candidate.college?.name,
          item.candidate.college?.city,
          item.interviewerId,
          item.scheduledAt,
          item.status,
          item.feedback,
          item.score,
          item.feedbackSubmittedAt,
        ]),
      );

      return {
        type: "SUCCESS" as const,
        filename: "results-report.csv",
        rowCount: result.data.length,
        csv,
      };
    }
  }
}