import ErrorState from "../feedback/ErrorState.jsx";
import { getErrorMessage } from "../../utils/errors.js";

export default function DataTable({ columns, rows, rowKey = (row) => row.id, rowClassName, phase, error, onRetry, emptyTitle = "Nothing to show", emptyText, caption }) {
  if (phase === "error") {
    return <ErrorState title="Couldn't load this list" message={getErrorMessage(error)} onRetry={onRetry} />;
  }

  const initialLoad = phase === "loading" && rows.length === 0;

  if (initialLoad) {
    return (
      <div className="tablewrap tablewrap--loading" role="status" aria-live="polite">
        <span className="spinner" aria-hidden="true" />
        <span>Loading…</span>
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="tablewrap tablewrap--empty">
        <p className="state__title">{emptyTitle}</p>
        {emptyText ? <p className="state__text">{emptyText}</p> : null}
      </div>
    );
  }

  return (
    <div className={phase === "loading" ? "tablewrap tablewrap--busy" : "tablewrap"} aria-busy={phase === "loading"}>
      <table className="table">
        {caption ? <caption className="sr-only">{caption}</caption> : null}
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.key} scope="col" className={column.align === "right" ? "is-right" : undefined}>
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={rowKey(row)} className={rowClassName ? rowClassName(row) : undefined}>
              {columns.map((column) => (
                <td key={column.key} data-label={column.header} className={column.align === "right" ? "is-right" : undefined}>
                  {column.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
