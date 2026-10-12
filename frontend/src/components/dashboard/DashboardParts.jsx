import { RefreshCw, ShieldAlert } from "lucide-react";

export function getErrorInfo(error) {
  const status = error?.status;

  if (status === 403) {
    return {
      denied: true,
      message: "You do not have permission to view this information.",
    };
  }

  return {
    denied: false,
    message:
      error?.message || "Failed to load dashboard information.",
  };
}

// Error banner. A 403 is shown as "permission denied" without a Retry
// button, since retrying cannot succeed.
export function ErrorPanel({ error, onRetry }) {
  const { denied, message } = getErrorInfo(error);

  return (
    <div
      role="alert"
      className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700"
    >
      <p className="flex items-center gap-2">
        {denied && <ShieldAlert size={16} aria-hidden="true" />}
        {message}
      </p>

      {!denied && onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex items-center gap-2 font-medium"
        >
          <RefreshCw size={15} />
          Retry
        </button>
      )}
    </div>
  );
}

// `value` is a number or string when the data was retrieved, or null when it
// is unavailable. A real zero is shown as 0, never as a placeholder.
export function StatCard({
  label,
  icon: Icon,
  value,
  loading,
  footnote = "Live database count",
}) {
  const available = value !== null && value !== undefined;

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">{label}</p>
        <Icon size={20} className="text-[#1B3A1E]" />
      </div>

      <p className="mt-2 text-2xl font-semibold text-[#1b3a1e]">
        {loading ? "…" : available ? value : "—"}
      </p>

      <p className="mt-1 text-xs text-gray-400">
        {loading
          ? "Loading..."
          : available
            ? footnote
            : "Unavailable"}
      </p>
    </section>
  );
}
