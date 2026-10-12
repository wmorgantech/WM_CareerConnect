const DEFAULT_LIMIT_OPTIONS = [10, 20, 50, 100];

// Previous/Next pagination. Only `page`, `totalPages` and `onPageChange`
// are required. Pass `total` to show a result count, and `limit` with
// `onLimitChange` to show a page-size selector. `disabled` locks the
// controls while a request is loading.
export default function Pagination({
  page,
  totalPages,
  onPageChange,
  total,
  limit,
  onLimitChange,
  limitOptions = DEFAULT_LIMIT_OPTIONS,
  disabled = false,
}) {
  const pages = Math.max(1, totalPages || 1);
  const buttonClass =
    "min-h-9 rounded-lg border border-gray-300 bg-white px-3 py-1 text-sm font-medium text-gray-800 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50";

  return (
    <nav
      aria-label="Pagination"
      className="flex flex-col gap-3 text-sm sm:flex-row sm:items-center sm:justify-between"
    >
      <p className="text-gray-500" aria-live="polite">
        Page {page} of {pages}
        {typeof total === "number" && (
          <span> · {total} {total === 1 ? "result" : "results"}</span>
        )}
      </p>

      <div className="flex flex-wrap items-center gap-2">
        {onLimitChange && limit && (
          <label className="flex items-center gap-2 text-gray-500">
            Per page
            <select
              className="h-9 rounded-lg border border-gray-300 bg-white px-2 text-sm text-gray-800"
              disabled={disabled}
              onChange={(event) => onLimitChange(Number(event.target.value))}
              value={limit}
            >
              {limitOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
        )}

        <button
          className={buttonClass}
          disabled={disabled || page <= 1}
          onClick={() => onPageChange(page - 1)}
          type="button"
        >
          Previous
        </button>
        <button
          className={buttonClass}
          disabled={disabled || page >= pages}
          onClick={() => onPageChange(page + 1)}
          type="button"
        >
          Next
        </button>
      </div>
    </nav>
  );
}
