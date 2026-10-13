import { ChevronLeft, ChevronRight } from "lucide-react";

export default function Pagination({ pagination, page, onPage, disabled = false }) {
  if (!pagination) {
    return null;
  }

  const { total, limit, totalPages } = pagination;

  if (total === 0) {
    return null;
  }

  const from = (page - 1) * limit + 1;
  const to = Math.min(page * limit, total);

  return (
    <nav className="pager" aria-label="Pagination">
      <span className="pager__info">
        {from}–{to} of {total}
      </span>
      <div className="pager__buttons">
        <button type="button" className="btn btn--outline btn--sm" onClick={() => onPage(page - 1)} disabled={disabled || page <= 1}>
          <ChevronLeft size={15} aria-hidden="true" />
          Previous
        </button>
        <span className="pager__page">
          Page {page} of {totalPages}
        </span>
        <button type="button" className="btn btn--outline btn--sm" onClick={() => onPage(page + 1)} disabled={disabled || page >= totalPages}>
          Next
          <ChevronRight size={15} aria-hidden="true" />
        </button>
      </div>
    </nav>
  );
}
