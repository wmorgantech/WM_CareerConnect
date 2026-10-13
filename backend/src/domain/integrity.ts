

export const INTEGRITY_EVENT_TYPES = [
  "TAB_HIDDEN",
  "WINDOW_BLUR",
  "FULLSCREEN_EXIT",
  "FULLSCREEN_DENIED",
  "RECONNECTED",
  "SHORTCUT_BLOCKED",
] as const;

export type IntegrityEventType = (typeof INTEGRITY_EVENT_TYPES)[number];

const COUNTED: readonly IntegrityEventType[] = [
  "TAB_HIDDEN",
  "WINDOW_BLUR",
  "FULLSCREEN_EXIT",
];

export const DEFAULT_FLAG_THRESHOLD = 3;

export function countsTowardFlag(type: IntegrityEventType): boolean {
  return COUNTED.includes(type);
}

export function flagThreshold(env: NodeJS.ProcessEnv = process.env): number {
  const parsed = Number(env.INTEGRITY_FLAG_THRESHOLD);

  return Number.isInteger(parsed) && parsed > 0 ? parsed : DEFAULT_FLAG_THRESHOLD;
}

export function shouldFlag(countedEvents: number, threshold: number): boolean {
  return countedEvents >= threshold;
}
