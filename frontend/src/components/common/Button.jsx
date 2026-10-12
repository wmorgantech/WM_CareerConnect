const VARIANTS = {
  primary:
    "bg-[#1B3A1E] text-white hover:bg-[#153019] focus-visible:ring-[#1B3A1E]/40",
  secondary:
    "border border-gray-300 bg-white text-gray-800 hover:bg-gray-50 focus-visible:ring-gray-400/40",
  danger:
    "bg-[#D32F2F] text-white hover:bg-[#B71C1C] focus-visible:ring-[#D32F2F]/40",
  ghost:
    "text-[#1B3A1E] hover:bg-green-50 focus-visible:ring-[#1B3A1E]/30",
};

const SIZES = {
  md: "min-h-11 px-4 py-2 text-sm",
  sm: "min-h-9 px-3 py-1.5 text-sm",
};

function Spinner() {
  return (
    <svg
      aria-hidden="true"
      className="h-4 w-4 animate-spin"
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        d="M4 12a8 8 0 018-8"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="4"
      />
    </svg>
  );
}

// variant: primary | secondary | danger | ghost    size: md | sm
// `loading` disables the button and shows a spinner. The type defaults to
// "button" so a button never submits a form by accident.
export default function Button({
  children,
  variant = "primary",
  size = "md",
  loading = false,
  disabled = false,
  type = "button",
  className = "",
  ...props
}) {
  const variantClass = VARIANTS[variant] ?? VARIANTS.primary;
  const sizeClass = SIZES[size] ?? SIZES.md;

  return (
    <button
      aria-busy={loading || undefined}
      className={`inline-flex items-center justify-center gap-2 rounded-lg font-semibold transition outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-60 ${sizeClass} ${variantClass} ${className}`}
      disabled={disabled || loading}
      type={type}
      {...props}
    >
      {loading && <Spinner />}
      {children}
    </button>
  );
}
