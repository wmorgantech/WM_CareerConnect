import { useCallback, useEffect, useState } from "react";

import { isAbortError } from "../utils/errors.js";
import { useDebouncedValue } from "./useDebouncedValue.js";

export function useListQuery(fetcher, initialFilters, { limit = 20 } = {}) {
  const [filters, setFilters] = useState(initialFilters);
  const [page, setPage] = useState(1);
  const [reloadKey, setReloadKey] = useState(0);
  const [state, setState] = useState({
    phase: "loading",
    items: [],
    pagination: null,
    summary: null,
    error: null,
  });

  const debouncedFilters = useDebouncedValue(filters);

  useEffect(() => {
    const controller = new AbortController();

    setState((current) => ({ ...current, phase: "loading", error: null }));

    fetcher({ ...debouncedFilters, page, limit }, controller.signal)
      .then(({ items, pagination, summary = null }) => {
        if (items.length === 0 && page > 1 && pagination.totalPages < page) {
          setPage(pagination.totalPages);

          return;
        }

        setState({ phase: "ready", items, pagination, summary, error: null });
      })
      .catch((error) => {
        if (!isAbortError(error)) {
          setState((current) => ({ ...current, phase: "error", error }));
        }
      });

    return () => controller.abort();
  }, [fetcher, debouncedFilters, page, limit, reloadKey]);

  const setFilter = useCallback((name, value) => {
    setFilters((current) => ({ ...current, [name]: value }));
    setPage(1);
  }, []);

  const resetFilters = useCallback(() => {
    setFilters(initialFilters);
    setPage(1);
  }, [initialFilters]);

  const reload = useCallback(() => setReloadKey((key) => key + 1), []);

  return { ...state, filters, setFilter, resetFilters, page, setPage, reload };
}
