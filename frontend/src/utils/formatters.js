export function formatDate(value) {
  if (!value) return "—";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(
    new Date(value),
  );
}

// Date and time in IST by default (the product displays Asia/Kolkata).
export function formatDateTime(value, timeZone = "Asia/Kolkata") {
  if (!value) return "—";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "—";

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone,
  }).format(date);
}

const ROLE_ACRONYMS = new Set(["HR"]);

// "HR_ADMIN" -> "HR Admin", "CAMPUS_COORDINATOR" -> "Campus Coordinator"
export function formatRoleName(name) {
  if (!name) return "—";

  return String(name)
    .split("_")
    .map((word) =>
      ROLE_ACRONYMS.has(word)
        ? word
        : word.charAt(0) + word.slice(1).toLowerCase(),
    )
    .join(" ");
}

// For date-only values stored as UTC midnight (for example a drive's start
// date): formats the calendar date as stored, independent of the viewer's
// time zone.
export function formatDateOnly(value) {
  if (!value) return "—";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "—";

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(date);
}
