// Interview times arrive from the API as ISO instants in UTC (for example 2026-10-20T05:00:00.000Z).
// They are always shown in Indian Standard Time, the zone the recruitment team schedules in, and
// the student's own local time is added only when it differs, so no one has to convert by hand.

const IST = "Asia/Kolkata";

const toDate = (value) => {
  const date = value instanceof Date ? value : new Date(value);

  return Number.isNaN(date.getTime()) ? null : date;
};

const offsetOf = (date, zone) => {
  const part = new Intl.DateTimeFormat("en-US", { timeZone: zone, timeZoneName: "shortOffset" }).formatToParts(date).find((p) => p.type === "timeZoneName");

  return part?.value ?? "";
};

export function describeWhen(value, localZone = Intl.DateTimeFormat().resolvedOptions().timeZone) {
  const date = toDate(value);

  if (!date) return null;

  const day = new Intl.DateTimeFormat("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: IST }).format(date);
  const time = new Intl.DateTimeFormat("en-IN", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: IST }).format(date).toUpperCase();
  const differs = offsetOf(date, localZone) !== offsetOf(date, IST);
  const local = differs
    ? `${new Intl.DateTimeFormat("en-IN", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true, timeZone: localZone }).format(date).toUpperCase()} (${offsetOf(date, localZone).replace("GMT", "UTC")})`
    : null;

  return { date, day, time, zone: "IST", local };
}

export function endsAt(value, minutes) {
  const date = toDate(value);

  return date && Number.isFinite(minutes) ? new Date(date.getTime() + minutes * 60_000) : null;
}

// "In 2 days", "In 3 hours", "In 25 minutes", "Starting now" or "In progress".
export function countdownText(value, minutes, now = Date.now()) {
  const date = toDate(value);

  if (!date) return "";

  const start = date.getTime();
  const end = start + (Number.isFinite(minutes) ? minutes : 0) * 60_000;

  if (now >= end) return "";
  if (now >= start) return "In progress";

  const diff = start - now;
  const mins = Math.round(diff / 60_000);

  if (mins < 2) return "Starting now";
  if (mins < 60) return `In ${mins} minutes`;

  const hours = Math.round(diff / 3_600_000);

  if (hours < 24) return `In ${hours} ${hours === 1 ? "hour" : "hours"}`;

  const days = Math.round(diff / 86_400_000);

  return `In ${days} ${days === 1 ? "day" : "days"}`;
}

const PROVIDERS = [
  [/(^|\.)meet\.google\.com$/i, "Google Meet"],
  [/(^|\.)zoom\.us$/i, "Zoom"],
  [/(^|\.)teams\.(microsoft|live)\.com$/i, "Microsoft Teams"],
  [/(^|\.)webex\.com$/i, "Webex"],
];

// The meeting provider is read from the link itself; an unknown host is shown as the host name.
export function providerOf(url) {
  try {
    const host = new URL(url).hostname;
    const known = PROVIDERS.find(([pattern]) => pattern.test(host));

    return known ? known[1] : host;
  } catch {
    return null;
  }
}
