export const INTERVIEW_STATUS_OPTIONS = [
  { value: "SCHEDULED", label: "Scheduled" },
  { value: "COMPLETED", label: "Completed" },
  { value: "CANCELLED", label: "Cancelled" },
];

export const INTERVIEW_STATUS_LABEL = Object.fromEntries(INTERVIEW_STATUS_OPTIONS.map((o) => [o.value, o.label]));

export const INTERVIEW_STATUS_TONE = { SCHEDULED: "info", COMPLETED: "success", CANCELLED: "neutral" };
