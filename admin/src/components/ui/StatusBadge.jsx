const TONES = {
  success: "badge badge--success",
  info: "badge badge--info",
  warn: "badge badge--warn",
  danger: "badge badge--danger",
  neutral: "badge",
};

export default function StatusBadge({ tone = "neutral", children }) {
  return <span className={TONES[tone] ?? TONES.neutral}>{children}</span>;
}

export function ActiveBadge({ active }) {
  return <StatusBadge tone={active ? "success" : "neutral"}>{active ? "Active" : "Inactive"}</StatusBadge>;
}
