import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { useDebouncedValue } from "./useDebouncedValue.js";
import { usePagination } from "./usePagination.js";

const EMPTY_PAGINATION = {
  page: 1,
  limit: 20,
  total: 0,
  totalPages: 1,
};

function isEmpty(value) {
  return value === undefined || value === null || value === "";
}

// Drives a searchable, filterable, paginated list.
//
// `fetcher(params)` must resolve with { items, pagination } (the shape
// returned by the list() method of every service in src/services) and is
// called with { ...filters, search, page, limit } minus empty values.
//
// - The search term is debounced; every other filter applies immediately.
// - Changing any filter or the search returns to page 1 (one request).
// - Only the most recent request may update the state, so a slow earlier
//   response can never overwrite a newer one.
// - Failures are exposed as `error`; nothing is retried automatically.
//   Call `reload()` (for example from a Retry button).
export function useResourceList(
  fetcher,
  {
    initialFilters = {},
    initialLimit = 20,
    searchKey = "search",
    debounceMs = 350,
    enabled = true,
  } = {},
) {
  const [filters, setFilters] = useState(initialFilters);
  const [reloadToken, setReloadToken] = useState(0);
  const [state, setState] = useState({
    items: [],
    pagination: EMPTY_PAGINATION,
    loading: enabled,
    error: null,
  });

  const initialFiltersRef = useRef(initialFilters);
  const fetcherRef = useRef(fetcher);
  const requestIdRef = useRef(0);

  useEffect(() => {
    fetcherRef.current = fetcher;
  });

  const debouncedSearch = useDebouncedValue(
    filters[searchKey],
    debounceMs,
  );

  const queryFilters = useMemo(
    () => ({ ...filters, [searchKey]: debouncedSearch }),
    [filters, searchKey, debouncedSearch],
  );

  const filtersKey = JSON.stringify(queryFilters);

  const { page, limit, setPage, setLimit } = usePagination({
    initialLimit,
    resetKey: filtersKey,
  });

  const requestKey = JSON.stringify({ filtersKey, page, limit });

  useEffect(() => {
    if (!enabled) {
      return undefined;
    }

    const requestId = ++requestIdRef.current;
    const params = Object.fromEntries(
      Object.entries({ ...queryFilters, page, limit }).filter(
        ([, value]) => !isEmpty(value),
      ),
    );

    setState((current) => ({
      ...current,
      loading: true,
      error: null,
    }));

    Promise.resolve()
      .then(() => fetcherRef.current(params))
      .then((result) => {
        if (requestId !== requestIdRef.current) {
          return;
        }

        const items = result?.items ?? [];
        const pagination = result?.pagination ?? EMPTY_PAGINATION;

        setState({ items, pagination, loading: false, error: null });

        // The last item of the last page was removed: step back.
        if (items.length === 0 && page > 1 && pagination.totalPages < page) {
          setPage(pagination.totalPages);
        }
      })
      .catch((error) => {
        if (requestId !== requestIdRef.current) {
          return;
        }

        setState((current) => ({
          ...current,
          items: [],
          loading: false,
          error,
        }));
      });

    return undefined;
    // requestKey captures filters, page and limit; reloadToken forces a
    // refresh without changing them.
  }, [requestKey, reloadToken, enabled]);

  useEffect(
    () => () => {
      // Ignore any response that arrives after unmount.
      requestIdRef.current += 1;
    },
    [],
  );

  const setFilter = useCallback((key, value) => {
    setFilters((current) => ({ ...current, [key]: value }));
  }, []);

  const setSearch = useCallback(
    (value) => setFilter(searchKey, value),
    [searchKey, setFilter],
  );

  const resetFilters = useCallback(() => {
    setFilters(initialFiltersRef.current);
  }, []);

  const reload = useCallback(
    () => setReloadToken((current) => current + 1),
    [],
  );

  const hasActiveFilters = Object.keys(filters).some(
    (key) =>
      !isEmpty(filters[key]) &&
      filters[key] !== initialFiltersRef.current[key],
  );

  return {
    items: state.items,
    pagination: state.pagination,
    loading: state.loading,
    error: state.error,
    filters,
    search: filters[searchKey] ?? "",
    setSearch,
    setFilter,
    setFilters,
    resetFilters,
    hasActiveFilters,
    page,
    setPage,
    limit,
    setLimit,
    reload,
  };
}
