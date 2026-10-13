

export const APPLICATION_STATUSES = [
  "REGISTERED",
  "TEST_IN_PROGRESS",
  "TEST_SUBMITTED",
  "SHORTLISTED",
  "REJECTED",
  "INTERVIEW_SCHEDULED",
  "INTERVIEW_COMPLETED",
  "SELECTED",
  "ON_HOLD",
] as const;

export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

const NEXT: Record<ApplicationStatus, readonly ApplicationStatus[]> = {
  REGISTERED: ["TEST_IN_PROGRESS"],
  TEST_IN_PROGRESS: ["TEST_SUBMITTED"],
  TEST_SUBMITTED: ["SHORTLISTED", "REJECTED"],
  SHORTLISTED: ["INTERVIEW_SCHEDULED", "REJECTED"],
  INTERVIEW_SCHEDULED: ["INTERVIEW_COMPLETED", "SHORTLISTED"],
  INTERVIEW_COMPLETED: ["SELECTED", "ON_HOLD", "REJECTED"],
  ON_HOLD: ["SELECTED", "REJECTED"],
  SELECTED: [],
  REJECTED: [],
};

const DECISION_STATUSES: readonly ApplicationStatus[] = [
  "SHORTLISTED",
  "REJECTED",
  "ON_HOLD",
  "SELECTED",
];

export function allowedNextStatuses(
  from: ApplicationStatus,
): readonly ApplicationStatus[] {
  return NEXT[from];
}

export function canTransition(
  from: ApplicationStatus,
  to: ApplicationStatus,
  options: { override?: boolean } = {},
): boolean {
  if (from === to) {
    return false;
  }

  if (NEXT[from].includes(to)) {
    return true;
  }

  return (
    options.override === true &&
    DECISION_STATUSES.includes(from) &&
    DECISION_STATUSES.includes(to)
  );
}

export class InvalidStatusTransitionError extends Error {
  readonly from: ApplicationStatus;
  readonly to: ApplicationStatus;

  constructor(from: ApplicationStatus, to: ApplicationStatus) {
    super(`Cannot change an application from ${from} to ${to}`);
    this.name = "InvalidStatusTransitionError";
    this.from = from;
    this.to = to;
  }
}

export function assertTransition(
  from: ApplicationStatus,
  to: ApplicationStatus,
  options: { override?: boolean } = {},
): void {
  if (!canTransition(from, to, options)) {
    throw new InvalidStatusTransitionError(from, to);
  }
}
