

const IST_OFFSET_MS = 330 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export function istDayStart(instant: Date): Date {
  const shifted = instant.getTime() + IST_OFFSET_MS;
  const midnightShifted = shifted - (((shifted % DAY_MS) + DAY_MS) % DAY_MS);

  return new Date(midnightShifted - IST_OFFSET_MS);
}

export function istDayEnd(instant: Date): Date {
  return new Date(istDayStart(instant).getTime() + DAY_MS - 1);
}

export function istDateRangeFilter(
  fromDate?: Date,
  toDate?: Date,
): { gte?: Date; lte?: Date } | undefined {
  if (!fromDate && !toDate) {
    return undefined;
  }

  return {
    ...(fromDate && { gte: istDayStart(fromDate) }),
    ...(toDate && { lte: istDayEnd(toDate) }),
  };
}
