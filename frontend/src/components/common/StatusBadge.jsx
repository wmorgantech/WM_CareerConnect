const TONES = {
  success: "bg-green-100 text-green-800",
  danger: "bg-red-100 text-[#B71C1C]",
  warning: "bg-amber-100 text-amber-800",
  info: "bg-blue-100 text-blue-800",
  neutral: "bg-gray-100 text-gray-700",
};

// Status values used by the backend (users, drives, interviews).
const STATUS_TONES = {
  ACTIVE: "success",
  INACTIVE: "neutral",
  PUBLISHED: "success",
  DRAFT: "warning",
  CLOSED: "neutral",
  CANCELLED: "danger",
  SCHEDULED: "info",
  COMPLETED: "success",
};

function toLabel(value) {
  return String(value)
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/^\w/, (letter) => letter.toUpperCase());
}

// <StatusBadge status="SCHEDULED" />   or   <StatusBadge tone="danger">Locked</StatusBadge>
export default function StatusBadge({ status, tone, children }) {
  const resolvedTone = tone ?? STATUS_TONES[status] ?? "neutral";

  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ${
        TONES[resolvedTone] ?? TONES.neutral
      }`}
    >
      {children ?? (status ? toLabel(status) : "—")}
    </span>
  );
}
