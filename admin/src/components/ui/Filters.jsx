import { Search, X } from "lucide-react";

export function FilterBar({ children, onReset, canReset }) {
  return (
    <div className="filters" role="search">
      {children}
      {canReset ? (
        <button type="button" className="btn btn--ghost btn--sm" onClick={onReset}>
          <X size={14} aria-hidden="true" />
          Clear filters
        </button>
      ) : null}
    </div>
  );
}

export function SearchFilter({ label = "Search", value, onChange, placeholder }) {
  return (
    <label className="filter filter--search">
      <span className="sr-only">{label}</span>
      <Search size={15} aria-hidden="true" />
      <input type="search" value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder ?? label} maxLength={100} />
    </label>
  );
}

export function SelectFilter({ label, value, onChange, options, allLabel = "All" }) {
  return (
    <label className="filter">
      <span className="filter__label">{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">{allLabel}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function DateFilter({ label, value, onChange }) {
  return (
    <label className="filter">
      <span className="filter__label">{label}</span>
      <input type="date" value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

export function TextFilter({ label, value, onChange, placeholder, listId, maxLength = 100 }) {
  return (
    <label className="filter">
      <span className="filter__label">{label}</span>
      <input type="text" value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} list={listId} maxLength={maxLength} />
    </label>
  );
}
