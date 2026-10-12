import { useCallback, useState } from "react";

// Page and page-size state. The page returns to 1 whenever `resetKey`
// changes (for example a serialized set of filters), without an extra
// render or request in between.
export function usePagination({
  initialPage = 1,
  initialLimit = 20,
  resetKey = "",
} = {}) {
  const [state, setState] = useState({
    page: initialPage,
    limit: initialLimit,
    key: resetKey,
  });

  const page = state.key === resetKey ? state.page : 1;

  const setPage = useCallback(
    (next) => {
      const value = Math.max(1, Math.floor(Number(next)) || 1);

      setState((current) => ({
        ...current,
        page: value,
        key: resetKey,
      }));
    },
    [resetKey],
  );

  const setLimit = useCallback(
    (next) => {
      const value = Math.max(1, Math.floor(Number(next)) || 1);

      setState((current) => ({
        ...current,
        limit: value,
        page: 1,
        key: resetKey,
      }));
    },
    [resetKey],
  );

  return { page, limit: state.limit, setPage, setLimit };
}
