import type { Request, Response } from "express";

import { getAuditActor } from "../../lib/audit.js";

import {
  createInterviewSchema,
  updateInterviewSchema,
  interviewIdSchema,
  interviewListQuerySchema,
  interviewerLookupQuerySchema,
  submitInterviewFeedbackSchema,
} from "./interviews.schema.js";

import {
  listInterviews,
  listInterviewers,
  getInterviewById,
  createInterview,
  updateInterview,
  deleteInterview,
  submitInterviewFeedback,
  unlockInterviewFeedback,
} from "./interviews.service.js";

export async function listInterviewsController(
  req: Request,
  res: Response,
) {
  const query = interviewListQuerySchema.parse(
    req.query,
  );

  const result = await listInterviews(
    query,
    req.user!,
  );

  return res.status(200).json({
    success: true,
    ...result,
  });
}

export async function getInterviewController(
  req: Request,
  res: Response,
) {
  const { id } = interviewIdSchema.parse(req.params);

  const interview = await getInterviewById(
    id,
    req.user!,
  );

  if (!interview) {
    return res.status(404).json({
      success: false,
      error: {
        code: "INTERVIEW_NOT_FOUND",
        message: "Interview not found",
      },
    });
  }

  return res.status(200).json({
    success: true,
    data: interview,
  });
}

export async function createInterviewController(
  req: Request,
  res: Response,
) {
  const input = createInterviewSchema.parse(req.body);

  const result = await createInterview(
    input,
    getAuditActor(req),
  );

  if (result.type === "CANDIDATE_NOT_FOUND") {
    return res.status(404).json({
      success: false,
      error: {
        code: "CANDIDATE_NOT_FOUND",
        message:
          "Candidate not found, inactive, or deleted",
      },
    });
  }

  if (
    result.type === "APPLICATION_MISMATCH" ||
    result.type === "APPLICATION_NOT_SHORTLISTED"
  ) {
    return res.status(409).json({
      success: false,
      error: {
        code: result.type,
        message:
          result.type === "APPLICATION_MISMATCH"
            ? "That application does not belong to this candidate"
            : "Only shortlisted students can be scheduled for an interview",
      },
    });
  }

  if (result.type === "INTERVIEW_TIME_CONFLICT") {
    return res.status(409).json({
      success: false,
      error: {
        code: "INTERVIEW_TIME_CONFLICT",
        message:
          result.with === "INTERVIEWER"
            ? "The interviewer already has an interview at this time"
            : "The candidate already has an interview at this time",
      },
    });
  }

  if (result.type === "INTERVIEWER_NOT_FOUND") {
    return res.status(404).json({
      success: false,
      error: {
        code: "INTERVIEWER_NOT_FOUND",
        message: "Active interviewer was not found",
      },
    });
  }

  return res.status(201).json({
    success: true,
    data: result.data,
  });
}

export async function updateInterviewController(
  req: Request,
  res: Response,
) {
  const { id } = interviewIdSchema.parse(req.params);
  const input = updateInterviewSchema.parse(req.body);

  const result = await updateInterview(
    id,
    input,
    getAuditActor(req),
  );

  if (result.type === "INTERVIEW_NOT_FOUND") {
    return res.status(404).json({
      success: false,
      error: {
        code: "INTERVIEW_NOT_FOUND",
        message: "Interview not found",
      },
    });
  }

  if (result.type === "INTERVIEW_TIME_CONFLICT") {
    return res.status(409).json({
      success: false,
      error: {
        code: "INTERVIEW_TIME_CONFLICT",
        message:
          result.with === "INTERVIEWER"
            ? "The interviewer already has an interview at this time"
            : "The candidate already has an interview at this time",
      },
    });
  }

  if (result.type === "INTERVIEWER_NOT_FOUND") {
    return res.status(404).json({
      success: false,
      error: {
        code: "INTERVIEWER_NOT_FOUND",
        message: "Active interviewer was not found",
      },
    });
  }

  if (result.type === "INTERVIEW_CANCELLED") {
    return res.status(409).json({
      success: false,
      error: {
        code: "INTERVIEW_CANCELLED",
        message:
          "A cancelled interview is read-only. Schedule a new interview instead.",
      },
    });
  }

  if (result.type === "INTERVIEWER_LOCKED") {
    return res.status(409).json({
      success: false,
      error: {
        code: "INTERVIEWER_LOCKED_AFTER_FEEDBACK",
        message:
          "Feedback has already been submitted, so the interviewer can no longer be changed.",
      },
    });
  }

  if (result.type === "INVALID_STATUS_TRANSITION") {
    return res.status(409).json({
      success: false,
      error: {
        code: "INVALID_STATUS_TRANSITION",
        message: result.message,
      },
    });
  }

  if (result.type === "INTERVIEW_CONFLICT") {
    return res.status(409).json({
      success: false,
      error: {
        code: "INTERVIEW_CHANGED",
        message:
          "The interview was changed by someone else. Reload it and try again.",
      },
    });
  }

  return res.status(200).json({
    success: true,
    data: result.data,
  });
}

export async function deleteInterviewController(
  req: Request,
  res: Response,
) {
  const { id } = interviewIdSchema.parse(req.params);

  const result = await deleteInterview(
    id,
    getAuditActor(req),
  );

  if (result.type === "INTERVIEW_NOT_FOUND") {
    return res.status(404).json({
      success: false,
      error: {
        code: "INTERVIEW_NOT_FOUND",
        message: "Interview not found",
      },
    });
  }

  if (result.type === "INVALID_STATUS_TRANSITION") {
    return res.status(409).json({
      success: false,
      error: {
        code: "INVALID_STATUS_TRANSITION",
        message: result.message,
      },
    });
  }

  if (result.type === "INTERVIEW_CONFLICT") {
    return res.status(409).json({
      success: false,
      error: {
        code: "INTERVIEW_CHANGED",
        message:
          "The interview was changed by someone else. Reload it and try again.",
      },
    });
  }

  return res.status(200).json({
    success: true,
    data: result.data,
  });
}

export async function submitInterviewFeedbackController(
  req: Request,
  res: Response,
) {
  const { id } = interviewIdSchema.parse(req.params);

  const input =
    submitInterviewFeedbackSchema.parse(req.body);

  const result = await submitInterviewFeedback(
    id,
    input,
    req.user!,
    getAuditActor(req),
  );

  if (result.type === "INTERVIEW_NOT_FOUND") {
    return res.status(404).json({
      success: false,
      error: {
        code: "INTERVIEW_NOT_FOUND",
        message:
          "Interview not found or not assigned to you",
      },
    });
  }

  if (result.type === "INTERVIEW_NOT_COMPLETED") {
    return res.status(400).json({
      success: false,
      error: {
        code: "INTERVIEW_NOT_COMPLETED",
        message:
          "Feedback can only be submitted for a completed interview",
      },
    });
  }

  if (result.type === "FEEDBACK_LOCKED") {
    return res.status(409).json({
      success: false,
      error: {
        code: "FEEDBACK_LOCKED",
        message:
          "Feedback is locked. Contact a Super Admin to request an unlock.",
      },
    });
  }

  return res.status(200).json({
    success: true,
    message:
      "Interview feedback submitted successfully and locked",
    data: result.data,
  });
}

export async function unlockInterviewFeedbackController(
  req: Request,
  res: Response,
) {
  const { id } = interviewIdSchema.parse(req.params);

  const result = await unlockInterviewFeedback(
    id,
    req.user!,
    {
      ...(req.ip !== undefined
        ? { ipAddress: req.ip }
        : {}),
      ...(req.get("user-agent") !== undefined
        ? { userAgent: req.get("user-agent")! }
        : {}),
    },
  );

  if (result.type === "FORBIDDEN") {
    return res.status(403).json({
      success: false,
      error: {
        code: "SUPER_ADMIN_REQUIRED",
        message:
          "Only an active Super Admin can unlock interview feedback",
      },
    });
  }

  if (result.type === "INTERVIEW_NOT_FOUND") {
    return res.status(404).json({
      success: false,
      error: {
        code: "INTERVIEW_NOT_FOUND",
        message: "Interview not found",
      },
    });
  }

  if (result.type === "FEEDBACK_NOT_LOCKED") {
    return res.status(409).json({
      success: false,
      error: {
        code: "FEEDBACK_NOT_LOCKED",
        message:
          "Interview feedback is not currently locked",
      },
    });
  }

  return res.status(200).json({
    success: true,
    message:
      "Interview feedback unlocked successfully. The assigned interviewer can now correct and resubmit it.",
    data: result.data,
  });
}

export async function listInterviewersController(
  req: Request,
  res: Response,
) {
  const query = interviewerLookupQuerySchema.parse(
    req.query,
  );

  const interviewers = await listInterviewers(query);

  return res.status(200).json({
    success: true,
    data: interviewers,
  });
}
