// Simple horizontal bar chart (no chart library). Each row is a label, a bar
// scaled to the largest value, and the number. The bars are decorative: the
// numbers are always printed, so nothing depends on colour or bar length.
//
//   <BarChart title="Interviews by status"
//             items={[{ label: "Scheduled", value: 4, color: "#2E7D32" }]} />
export default function BarChart({
  title,
  items,
  note,
  emptyText = "No data for the selected filters.",
}) {
  const max = Math.max(0, ...items.map((item) => item.value));
  const hasData = items.some((item) => item.value > 0);

  return (
    <figure className="rounded-xl border border-gray-200 bg-white p-5">
      <figcaption className="text-sm font-semibold text-gray-900">
        {title}
      </figcaption>

      {hasData ? (
        <ul className="mt-4 space-y-3">
          {items.map((item) => (
            <li
              className="grid grid-cols-[6.5rem_1fr_2.5rem] items-center gap-3 text-sm"
              key={item.label}
            >
              <span className="truncate text-gray-600">{item.label}</span>

              <span
                aria-hidden="true"
                className="h-3 overflow-hidden rounded-full bg-gray-100"
              >
                <span
                  className="block h-full rounded-full"
                  style={{
                    width: `${max > 0 ? (item.value / max) * 100 : 0}%`,
                    backgroundColor: item.color ?? "#1B3A1E",
                  }}
                />
              </span>

              <span className="text-right font-medium tabular-nums text-gray-900">
                {item.value}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-4 text-sm text-gray-500">{emptyText}</p>
      )}

      {note && <p className="mt-3 text-xs text-gray-500">{note}</p>}
    </figure>
  );
}
