

export const ANSWER_GRACE_SECONDS = 30;

export function computeDeadline(
  startedAt: Date,
  durationMinutes: number,
): Date {
  if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) {
    throw new Error("Test duration must be positive");
  }

  return new Date(startedAt.getTime() + durationMinutes * 60_000);
}

export function isAnswerAccepted(
  now: Date,
  deadline: Date,
  graceSeconds: number = ANSWER_GRACE_SECONDS,
): boolean {
  // The cutoff itself is already expired: answers are accepted strictly before deadline + grace.
  return now.getTime() < deadline.getTime() + graceSeconds * 1000;
}

export function remainingSeconds(now: Date, deadline: Date): number {
  return Math.max(0, Math.ceil((deadline.getTime() - now.getTime()) / 1000));
}

export function shouldAutoSubmit(now: Date, deadline: Date): boolean {
  return now.getTime() >= deadline.getTime();
}
