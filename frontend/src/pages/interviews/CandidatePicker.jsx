import { useEffect, useRef, useState } from "react";

import Button from "../../components/common/Button.jsx";
import { useDebouncedValue } from "../../hooks/useDebouncedValue.js";
import candidatesService from "../../services/candidates.service.js";
import { getErrorMessage } from "../../utils/errors.js";

const RESULT_LIMIT = 20;

// Search-and-pick control for one active candidate (GET /candidates with
// isActive=true; needs `candidates.manage`). Works as a FormModal "custom"
// field: `value` is the candidate id.
export default function CandidatePicker({
  id,
  label,
  value,
  onChange,
  error,
  hint,
  disabled,
  required,
}) {
  const [query, setQuery] = useState("");
  const debounced = useDebouncedValue(query, 300);
  const [selected, setSelected] = useState(null);
  const [state, setState] = useState({
    items: [],
    loading: true,
    error: null,
  });
  const requestRef = useRef(0);

  useEffect(() => {
    if (selected) {
      return undefined;
    }

    const requestId = ++requestRef.current;

    setState((current) => ({ ...current, loading: true, error: null }));

    candidatesService
      .list({ search: debounced.trim(), isActive: "true", limit: RESULT_LIMIT })
      .then(({ items }) => {
        if (requestId === requestRef.current) {
          setState({ items, loading: false, error: null });
        }
      })
      .catch((err) => {
        if (requestId === requestRef.current) {
          setState({ items: [], loading: false, error: err });
        }
      });

    return () => {
      requestRef.current += 1;
    };
  }, [debounced, selected]);

  const messageId = `${id}-message`;
  const hasMessage = Boolean(error || hint);

  function choose(candidateId) {
    const candidate = state.items.find((item) => item.id === candidateId);

    if (candidate) {
      setSelected(candidate);
      onChange(candidate.id);
    }
  }

  function clear() {
    setSelected(null);
    setQuery("");
    onChange("");
  }

  return (
    <div>
      <label
        className="mb-2 block text-sm font-medium text-gray-700"
        htmlFor={`${id}-search`}
      >
        {label}
        {required && (
          <span aria-hidden="true" className="ml-0.5 text-[#D32F2F]">
            *
          </span>
        )}
      </label>

      {selected && value ? (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-gray-300 bg-gray-50 px-3 py-2 text-sm">
          <div className="min-w-0">
            <p className="font-medium text-gray-900">{selected.name}</p>
            <p className="break-all text-xs text-gray-500">{selected.email}</p>
          </div>
          <Button
            disabled={disabled}
            onClick={clear}
            size="sm"
            variant="secondary"
          >
            Change
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          <input
            aria-describedby={hasMessage ? messageId : undefined}
            aria-invalid={error ? true : undefined}
            autoComplete="off"
            className={`h-11 w-full rounded-lg border bg-white px-3 text-sm outline-none focus:ring-2 disabled:bg-gray-50 ${
              error
                ? "border-[#D32F2F] focus:border-[#D32F2F] focus:ring-[#D32F2F]/15"
                : "border-gray-300 focus:border-[#1B3A1E] focus:ring-[#1B3A1E]/10"
            }`}
            disabled={disabled}
            id={`${id}-search`}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search active candidates by name, email or phone"
            type="search"
            value={query}
          />

          {state.error ? (
            <p className="text-xs text-[#D32F2F]" role="alert">
              {state.error.status === 403
                ? "You do not have permission to list candidates."
                : getErrorMessage(state.error)}
            </p>
          ) : (
            <select
              aria-label="Matching candidates"
              className="w-full rounded-lg border border-gray-300 bg-white px-2 py-1 text-sm outline-none focus:border-[#1B3A1E]"
              disabled={disabled || state.items.length === 0}
              onChange={(event) => choose(event.target.value)}
              size={Math.min(5, Math.max(2, state.items.length))}
              value=""
            >
              {state.items.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name} — {item.email}
                </option>
              ))}
            </select>
          )}

          <p className="text-xs text-gray-500" role="status">
            {state.loading
              ? "Searching…"
              : state.error
                ? ""
                : state.items.length === 0
                  ? "No active candidates found."
                  : `Showing up to ${RESULT_LIMIT} matches. Refine the search to find others.`}
          </p>
        </div>
      )}

      {hasMessage && (
        <p
          className={`mt-1 text-xs ${error ? "text-[#D32F2F]" : "text-gray-500"}`}
          id={messageId}
        >
          {error || hint}
        </p>
      )}
    </div>
  );
}
