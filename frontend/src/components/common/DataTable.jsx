import { ErrorPanel } from "../dashboard/DashboardParts.jsx";
import EmptyState from "./EmptyState.jsx";

const HIDE_BELOW = {
  sm: "hidden sm:table-cell",
  md: "hidden md:table-cell",
  lg: "hidden lg:table-cell",
};

function SkeletonRows({ columns, count }) {
  return Array.from({ length: count }, (_, rowIndex) => (
    <tr key={rowIndex} aria-hidden="true">
      {columns.map((column) => (
        <td
          className={`px-4 py-3 ${HIDE_BELOW[column.hideBelow] ?? ""}`}
          key={column.key}
        >
          <div className="h-4 w-full max-w-[10rem] animate-pulse rounded bg-gray-100" />
        </td>
      ))}
    </tr>
  ));
}

// Table with built-in loading, error and empty states.
//
// columns: [{ key, label, render?(row), className?, hideBelow?: "sm"|"md"|"lg" }]
// rows:    array of records
//
// States (in priority order):
//   error   -> error panel with Retry (permission errors show no Retry)
//   loading with no rows -> skeleton rows
//   no rows -> EmptyState (emptyTitle / emptyDescription / emptyAction)
//   rows    -> table; while reloading the rows stay visible and dimmed
//
// The table scrolls horizontally inside its own container, so a wide table
// never makes the page overflow. The container is `relative` so the
// absolutely-positioned sr-only text (caption, header labels, "Loading")
// is clipped with it instead of widening the page.
export default function DataTable({
  columns,
  rows = [],
  loading = false,
  error = null,
  onRetry,
  getRowKey = (row) => row.id,
  caption,
  emptyTitle = "Nothing here yet",
  emptyDescription,
  emptyAction,
  skeletonRows = 5,
}) {
  if (error) {
    return <ErrorPanel error={error} onRetry={onRetry} />;
  }

  if (!loading && rows.length === 0) {
    return (
      <div>
        <EmptyState title={emptyTitle} description={emptyDescription} />
        {emptyAction && <div className="mt-4 text-center">{emptyAction}</div>}
      </div>
    );
  }

  const showSkeleton = loading && rows.length === 0;

  return (
    <div
      aria-busy={loading}
      className={`relative max-w-full overflow-x-auto rounded-xl border border-gray-200 bg-white transition-opacity ${
        loading && !showSkeleton ? "opacity-60" : ""
      }`}
    >
      <table className="w-full text-left text-sm">
        {caption && <caption className="sr-only">{caption}</caption>}
        <thead className="bg-gray-50 text-gray-600">
          <tr>
            {columns.map((column) => (
              <th
                className={`whitespace-nowrap px-4 py-3 font-medium ${
                  HIDE_BELOW[column.hideBelow] ?? ""
                } ${column.headerClassName ?? ""}`}
                key={column.key}
                scope="col"
              >
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {showSkeleton ? (
            <SkeletonRows columns={columns} count={skeletonRows} />
          ) : (
            rows.map((row, index) => (
              <tr key={getRowKey(row, index)}>
                {columns.map((column) => (
                  <td
                    className={`px-4 py-3 ${
                      HIDE_BELOW[column.hideBelow] ?? ""
                    } ${column.className ?? ""}`}
                    key={column.key}
                  >
                    {column.render ? column.render(row) : row[column.key]}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>

      {loading && (
        <p className="sr-only" role="status">
          Loading
        </p>
      )}
    </div>
  );
}
