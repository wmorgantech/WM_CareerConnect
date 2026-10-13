export default function ActionIcon({
  icon: Icon,
  label,
  onClick,
  disabled = false,
  danger = false,
  title,
}) {
  const className = danger
    ? "iconbtn rowaction-icon rowaction-icon--danger"
    : "iconbtn rowaction-icon";

  return (
    <button
      type="button"
      className={className}
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={title ?? label}
    >
      <Icon size={17} strokeWidth={1.9} aria-hidden="true" />
    </button>
  );
}
