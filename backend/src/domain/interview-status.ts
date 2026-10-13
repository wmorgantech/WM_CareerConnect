

export type InterviewStatusValue =
  | "SCHEDULED"
  | "COMPLETED"
  | "CANCELLED";

export type InterviewTransitionContext = {
  feedbackSubmitted: boolean;
};

export type TransitionVerdict =
  | { allowed: true }
  | { allowed: false; reason: string };

export function checkInterviewTransition(
  from: InterviewStatusValue,
  to: InterviewStatusValue,
  context: InterviewTransitionContext,
): TransitionVerdict {
  if (from === to) {
    return { allowed: true };
  }

  if (from === "CANCELLED") {
    return {
      allowed: false,
      reason:
        "A cancelled interview cannot be reopened. Schedule a new interview instead.",
    };
  }

  if (context.feedbackSubmitted) {
    return {
      allowed: false,
      reason:
        "Feedback has already been submitted for this interview, so its status can no longer be changed.",
    };
  }

  return { allowed: true };
}

export function canChangeInterviewStatus(
  from: InterviewStatusValue,
  to: InterviewStatusValue,
  context: InterviewTransitionContext,
): boolean {
  return checkInterviewTransition(from, to, context).allowed;
}
