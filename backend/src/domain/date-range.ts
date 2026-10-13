

export const END_BEFORE_START_MESSAGE =
  "End date can't be before the start date";

export function isEndBeforeStart(
  start: Date | null | undefined,
  end: Date | null | undefined,
): boolean {
  return (
    start instanceof Date &&
    end instanceof Date &&
    end.getTime() < start.getTime()
  );
}

export class DateRangeError extends Error {
  readonly field: string;

  constructor(field: string, message: string) {
    super(message);
    this.name = "DateRangeError";
    this.field = field;
  }
}
