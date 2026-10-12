// Backend (audit-logs.schema.ts / audit-logs.service.ts): GET /audit-logs,
// permission `audit.view`. Read-only, newest first (no sort parameter, no
// text search). Filters are exact matches:
//   userId (UUID), action, entity, entityId (each <= 100 characters),
//   fromDate / toDate (YYYY-MM-DD, on the entry's creation time; fromDate
//   must not be after toDate), page, limit (<= 100).
// Each entry: id, userId (may be null), action, entity, entityId, details
// (a string, usually JSON), ipAddress, userAgent, createdAt. The API returns
// no actor name, only the user id.

// Action and entity values the backend currently writes (taken from the
// services that call createAuditLog). Offered as suggestions only: the
// filter accepts any exact value.
export const KNOWN_ACTIONS = [
  "USER_CREATED",
  "USER_UPDATED",
  "USER_DEACTIVATED",
  "USER_REACTIVATED",
  "USER_DELETED",
  "COLLEGE_CREATED",
  "COLLEGE_UPDATED",
  "COLLEGE_DEACTIVATED",
  "COLLEGE_REACTIVATED",
  "COLLEGE_DELETED",
  "INTERVIEW_FEEDBACK_UNLOCKED",
  "LOGIN_SUCCEEDED",
  "LOGIN_FAILED",
  "LOGOUT",
  "DRIVE_CREATED",
  "DRIVE_UPDATED",
  "DRIVE_DEACTIVATED",
  "DRIVE_REACTIVATED",
  "DRIVE_DELETED",
  "CANDIDATE_CREATED",
  "CANDIDATE_UPDATED",
  "CANDIDATE_DEACTIVATED",
  "CANDIDATE_REACTIVATED",
  "CANDIDATE_DELETED",
  "INTERVIEW_CREATED",
  "INTERVIEW_UPDATED",
  "INTERVIEW_CANCELLED",
  "INTERVIEW_FEEDBACK_SUBMITTED",
  "SETTINGS_CREATED",
  "SETTINGS_UPDATED",
  "REPORT_EXPORTED",
];

export const KNOWN_ENTITIES = [
  "User",
  "College",
  "Drive",
  "Candidate",
  "Interview",
  "Setting",
  "Report",
  "Auth",
];

export const EMPTY_FILTERS = {
  userId: "",
  action: "",
  entity: "",
  entityId: "",
  fromDate: "",
  toDate: "",
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const isUuid = (value) => UUID_PATTERN.test(String(value ?? ""));

// "USER_FEEDBACK_UNLOCKED" -> "User feedback unlocked"
export function actionLabel(action) {
  if (!action) {
    return "Unknown action";
  }

  const text = String(action).toLowerCase().replace(/_/g, " ");

  return text.charAt(0).toUpperCase() + text.slice(1);
}

// Colour by what happened, from the action's last word. Unknown actions are
// shown neutrally.
export function actionTone(action) {
  const last = String(action ?? "").split("_").pop();

  if (last === "CREATED" || last === "REACTIVATED" || last === "SUCCEEDED") {
    return "success";
  }
  if (last === "DELETED") return "danger";
  if (last === "DEACTIVATED" || last === "FAILED" || last === "CANCELLED") {
    return "warning";
  }
  if (
    last === "UPDATED" ||
    last === "UNLOCKED" ||
    last === "SUBMITTED" ||
    last === "EXPORTED"
  ) {
    return "info";
  }

  return "neutral";
}

export function shortId(id) {
  const text = String(id ?? "");

  return text.length > 12 ? `${text.slice(0, 8)}…` : text;
}

const SENSITIVE_KEY = /password|token|secret|hash|credential/i;

function formatValue(key, value) {
  if (SENSITIVE_KEY.test(key) && typeof value === "string") {
    return "••••••";
  }

  if (value === null || value === undefined) {
    return "—";
  }

  if (typeof value === "object") {
    return JSON.stringify(value);
  }

  return String(value);
}

// `details` is stored as a string. When it is a JSON object it is shown as
// key / value rows; anything else is shown as plain text. Values whose key
// looks sensitive are masked as a precaution.
export function parseDetails(details) {
  if (details === null || details === undefined || details === "") {
    return null;
  }

  const text = String(details);

  try {
    const parsed = JSON.parse(text);

    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return {
        kind: "object",
        entries: Object.entries(parsed).map(([key, value]) => ({
          key,
          value: formatValue(key, value),
        })),
      };
    }
  } catch {
    // Not JSON: fall through to plain text.
  }

  return { kind: "text", text };
}
