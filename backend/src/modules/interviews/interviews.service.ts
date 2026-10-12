import { Prisma } from "../../generated/prisma/client";
import {
  changedFields,
  writeAudit,
  type AuditActor,
} from "../../lib/audit.js";
import { prisma } from "../../lib/prisma.js";

import type {
  CreateInterviewInput,
  UpdateInterviewInput,
  InterviewListQuery,
  InterviewerLookupQuery,
  SubmitInterviewFeedbackInput,
} from "./interviews.schema.js";

type InterviewUser = {
  id: string;
  permissions: string[];
};

type FeedbackUnlockContext = {
  ipAddress?: string;
  userAgent?: string;
};

function formatInterview(interview: {
  id: string;
  candidateId: string;
  interviewerId: string;
  scheduledAt: Date;
  durationMinutes: number;
  meetingLink: string | null;
  notes: string | null;
  status: string;
  feedback: string | null;
  score: number | null;
  feedbackSubmittedAt: Date | null;
  feedbackLockedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  candidate: {
    id: string;
    name: string;
    email: string;
  };
}) {
  return {
    id: interview.id,
    candidateId: interview.candidateId,
    interviewerId: interview.interviewerId,
    scheduledAt: interview.scheduledAt,
    durationMinutes: interview.durationMinutes,
    meetingLink: interview.meetingLink,
    notes: interview.notes,
    status: interview.status,
    feedback: interview.feedback,
    score: interview.score,
    feedbackSubmittedAt: interview.feedbackSubmittedAt,
    feedbackLockedAt: interview.feedbackLockedAt,
    feedbackLocked: interview.feedbackLockedAt !== null,
    createdAt: interview.createdAt,
    updatedAt: interview.updatedAt,
    candidate: interview.candidate,
  };
}

const interviewInclude = {
  candidate: {
    select: {
      id: true,
      name: true,
      email: true,
    },
  },
} satisfies Prisma.InterviewInclude;

export async function listInterviews(
  query: InterviewListQuery,
  user: InterviewUser,
) {
  const {
    candidateId,
    interviewerId,
    status,
    page,
    limit,
  } = query;

  const where: Prisma.InterviewWhereInput = {};

  const canViewAll =
    user.permissions.includes("interviews.schedule");

  if (!canViewAll) {
    where.interviewerId = user.id;
  } else if (interviewerId) {
    where.interviewerId = interviewerId;
  }

  if (candidateId) {
    where.candidateId = candidateId;
  }

  if (status) {
    where.status = status;
  }

  const skip = (page - 1) * limit;

  const [interviews, total] = await prisma.$transaction([
    prisma.interview.findMany({
      where,
      include: interviewInclude,
      orderBy: {
        scheduledAt: "asc",
      },
      skip,
      take: limit,
    }),

    prisma.interview.count({
      where,
    }),
  ]);

  return {
    data: interviews.map(formatInterview),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

export async function getInterviewById(
  id: string,
  user: InterviewUser,
) {
  const canViewAll =
    user.permissions.includes("interviews.schedule");

  const interview = await prisma.interview.findFirst({
    where: {
      id,
      ...(canViewAll
        ? {}
        : {
            interviewerId: user.id,
          }),
    },
    include: interviewInclude,
  });

  if (!interview) {
    return null;
  }

  return formatInterview(interview);
}

export async function createInterview(
  input: CreateInterviewInput,
  actor: AuditActor = {},
) {
  const candidate = await prisma.candidate.findFirst({
    where: {
      id: input.candidateId,
      deletedAt: null,
      isActive: true,
    },
  });

  if (!candidate) {
    return {
      type: "CANDIDATE_NOT_FOUND" as const,
    };
  }

  const interviewer = await prisma.user.findFirst({
    where: {
      id: input.interviewerId,
      status: "ACTIVE",
      userRoles: {
        some: {
          role: {
            name: "INTERVIEWER",
          },
        },
      },
    },
  });

  if (!interviewer) {
    return {
      type: "INTERVIEWER_NOT_FOUND" as const,
    };
  }

  const interview = await prisma.$transaction(async (tx) => {
    const created = await tx.interview.create({
      data: {
        candidateId: input.candidateId,
        interviewerId: input.interviewerId,
        scheduledAt: input.scheduledAt,
        durationMinutes: input.durationMinutes,
        meetingLink: input.meetingLink ?? null,
        notes: input.notes ?? null,
        status: "SCHEDULED",
      },
      include: interviewInclude,
    });

    await writeAudit(tx, actor, {
      action: "INTERVIEW_CREATED",
      entity: "Interview",
      entityId: created.id,
      details: {
        candidateId: created.candidateId,
        interviewerId: created.interviewerId,
        scheduledAt: created.scheduledAt,
      },
    });

    return created;
  });

  return {
    type: "SUCCESS" as const,
    data: formatInterview(interview),
  };
}

export async function updateInterview(
  id: string,
  input: UpdateInterviewInput,
  actor: AuditActor = {},
) {
  const existingInterview =
    await prisma.interview.findUnique({
      where: {
        id,
      },
    });

  if (!existingInterview) {
    return {
      type: "INTERVIEW_NOT_FOUND" as const,
    };
  }

  if (input.interviewerId !== undefined) {
    const interviewer = await prisma.user.findFirst({
      where: {
        id: input.interviewerId,
        status: "ACTIVE",
        userRoles: {
          some: {
            role: {
              name: "INTERVIEWER",
            },
          },
        },
      },
    });

    if (!interviewer) {
      return {
        type: "INTERVIEWER_NOT_FOUND" as const,
      };
    }
  }

  const interview = await prisma.$transaction(async (tx) => {
  const updated = await tx.interview.update({
    where: {
      id,
    },
    data: {
      ...(input.interviewerId !== undefined && {
        interviewerId: input.interviewerId,
      }),

      ...(input.scheduledAt !== undefined && {
        scheduledAt: input.scheduledAt,
      }),

      ...(input.durationMinutes !== undefined && {
        durationMinutes: input.durationMinutes,
      }),

      ...(input.meetingLink !== undefined && {
        meetingLink: input.meetingLink,
      }),

      ...(input.notes !== undefined && {
        notes: input.notes,
      }),

      ...(input.status !== undefined && {
        status: input.status,
      }),
    },
    include: interviewInclude,
  });

  const cancelled =
    input.status === "CANCELLED" &&
    existingInterview.status !== "CANCELLED";

  await writeAudit(tx, actor, {
    action: cancelled
      ? "INTERVIEW_CANCELLED"
      : "INTERVIEW_UPDATED",
    entity: "Interview",
    entityId: id,
    details: {
      changedFields: changedFields(input),
      ...(input.status !== undefined && {
        previousStatus: existingInterview.status,
        newStatus: updated.status,
      }),
    },
  });

  return updated;
  });

  return {
    type: "SUCCESS" as const,
    data: formatInterview(interview),
  };
}

export async function deleteInterview(
  id: string,
  actor: AuditActor = {},
) {
  const existingInterview =
    await prisma.interview.findUnique({
      where: {
        id,
      },
    });

  if (!existingInterview) {
    return null;
  }

  const interview = await prisma.$transaction(async (tx) => {
    const cancelled = await tx.interview.update({
      where: {
        id,
      },
      data: {
        status: "CANCELLED",
      },
      include: interviewInclude,
    });

    // The DELETE endpoint cancels the interview; it does not remove the row.
    await writeAudit(tx, actor, {
      action: "INTERVIEW_CANCELLED",
      entity: "Interview",
      entityId: id,
      details: {
        method: "DELETE",
        previousStatus: existingInterview.status,
      },
    });

    return cancelled;
  });

  return formatInterview(interview);
}

export async function submitInterviewFeedback(
  id: string,
  input: SubmitInterviewFeedbackInput,
  user: InterviewUser,
  actor: AuditActor = {},
) {
  const interview = await prisma.interview.findFirst({
    where: {
      id,
      interviewerId: user.id,
    },
    include: interviewInclude,
  });

  if (!interview) {
    return {
      type: "INTERVIEW_NOT_FOUND" as const,
    };
  }

  if (interview.status !== "COMPLETED") {
    return {
      type: "INTERVIEW_NOT_COMPLETED" as const,
    };
  }

  if (interview.feedbackLockedAt !== null) {
    return {
      type: "FEEDBACK_LOCKED" as const,
    };
  }

  const now = new Date();

  // Atomic conditional update prevents concurrent requests
  // from overwriting feedback after another request locks it.
  const result = await prisma.$transaction(async (tx) => {
    const updated = await tx.interview.updateMany({
      where: {
        id,
        interviewerId: user.id,
        status: "COMPLETED",
        feedbackLockedAt: null,
      },
      data: {
        feedback: input.feedback,
        score: input.score,
        feedbackSubmittedAt: now,
        feedbackLockedAt: now,
      },
    });

    // Only a submission that really changed the row is recorded. The
    // feedback text itself is not copied into the audit trail.
    if (updated.count === 1) {
      await writeAudit(tx, actor, {
        action: "INTERVIEW_FEEDBACK_SUBMITTED",
        entity: "Interview",
        entityId: id,
        details: {
          score: input.score,
        },
      });
    }

    return updated;
  });

  if (result.count !== 1) {
    const currentInterview =
      await prisma.interview.findFirst({
        where: {
          id,
          interviewerId: user.id,
        },
        select: {
          status: true,
          feedbackLockedAt: true,
        },
      });

    if (!currentInterview) {
      return {
        type: "INTERVIEW_NOT_FOUND" as const,
      };
    }

    if (currentInterview.status !== "COMPLETED") {
      return {
        type: "INTERVIEW_NOT_COMPLETED" as const,
      };
    }

    return {
      type: "FEEDBACK_LOCKED" as const,
    };
  }

  const updatedInterview =
    await prisma.interview.findUniqueOrThrow({
      where: {
        id,
      },
      include: interviewInclude,
    });

  return {
    type: "SUCCESS" as const,
    data: formatInterview(updatedInterview),
  };
}

export async function unlockInterviewFeedback(
  id: string,
  user: InterviewUser,
  context: FeedbackUnlockContext = {},
) {
  return prisma.$transaction(async (tx) => {
    // Verify the user's current database role, not just
    // the role or permissions claimed by the frontend.
    const admin = await tx.user.findFirst({
      where: {
        id: user.id,
        status: "ACTIVE",
        userRoles: {
          some: {
            role: {
              name: "SUPER_ADMIN",
            },
          },
        },
      },
      select: {
        id: true,
      },
    });

    if (!admin) {
      return {
        type: "FORBIDDEN" as const,
      };
    }

    const interview = await tx.interview.findUnique({
      where: {
        id,
      },
      select: {
        id: true,
        feedbackLockedAt: true,
      },
    });

    if (!interview) {
      return {
        type: "INTERVIEW_NOT_FOUND" as const,
      };
    }

    if (interview.feedbackLockedAt === null) {
      return {
        type: "FEEDBACK_NOT_LOCKED" as const,
      };
    }

    // Conditional update avoids claiming an unlock when
    // another request has already changed the lock state.
    const result = await tx.interview.updateMany({
      where: {
        id,
        feedbackLockedAt: {
          not: null,
        },
      },
      data: {
        feedbackLockedAt: null,
      },
    });

    if (result.count !== 1) {
      return {
        type: "FEEDBACK_NOT_LOCKED" as const,
      };
    }

    // The audit record and unlock commit together.
    await tx.auditLog.create({
      data: {
        userId: user.id,
        action: "INTERVIEW_FEEDBACK_UNLOCKED",
        entity: "Interview",
        entityId: id,
        details: JSON.stringify({
          message:
            "Super Admin unlocked interview feedback for correction.",
        }),
        ipAddress: context.ipAddress ?? null,
        userAgent: context.userAgent ?? null,
      },
    });

    const updatedInterview =
      await tx.interview.findUniqueOrThrow({
        where: {
          id,
        },
        include: interviewInclude,
      });

    return {
      type: "SUCCESS" as const,
      data: formatInterview(updatedInterview),
    };
  });
}

// Active staff who hold the INTERVIEWER role: the same eligibility rule
// createInterview and updateInterview apply. Only the fields needed to
// pick an interviewer are returned.
export async function listInterviewers(
  query: InterviewerLookupQuery,
) {
  const { search, limit } = query;

  return prisma.user.findMany({
    where: {
      status: "ACTIVE",
      userRoles: {
        some: {
          role: {
            name: "INTERVIEWER",
          },
        },
      },
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
    },
    select: {
      id: true,
      name: true,
      email: true,
    },
    orderBy: {
      name: "asc",
    },
    take: limit,
  });
}
