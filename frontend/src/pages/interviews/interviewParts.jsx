import StatusBadge from "../../components/common/StatusBadge.jsx";
import { getFeedbackState } from "./interviewHelpers.js";

export function InterviewStatusBadge({ status }) {
  return <StatusBadge status={status} />;
}

// Feedback progress for a COMPLETED interview; renders nothing otherwise.
export function FeedbackBadge({ interview }) {
  const state = getFeedbackState(interview);

  if (state === "pending") {
    return <StatusBadge tone="warning">Feedback pending</StatusBadge>;
  }

  if (state === "locked") {
    return <StatusBadge tone="success">Feedback locked</StatusBadge>;
  }

  if (state === "unlocked") {
    return <StatusBadge tone="info">Unlocked for correction</StatusBadge>;
  }

  return null;
}
