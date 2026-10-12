import { useCallback, useEffect, useMemo, useState } from "react";

import { listInterviewers } from "../../services/interviews.service.js";

const INTERVIEWER_LIMIT = 100;

// Active staff with the INTERVIEWER role (first 100 by name). Needs
// `interviews.schedule`. Interview records only carry the interviewer's id,
// so `byId` is also used to show names.
export function useInterviewers({ enabled = true } = {}) {
  const [state, setState] = useState({
    items: [],
    loading: enabled,
    error: null,
  });

  const load = useCallback(async () => {
    setState((current) => ({ ...current, loading: true, error: null }));

    try {
      const items = await listInterviewers({ limit: INTERVIEWER_LIMIT });

      setState({ items, loading: false, error: null });
    } catch (error) {
      setState({ items: [], loading: false, error });
    }
  }, []);

  useEffect(() => {
    if (enabled) {
      load();
    }
  }, [enabled, load]);

  const byId = useMemo(
    () => new Map(state.items.map((item) => [item.id, item])),
    [state.items],
  );

  return { ...state, byId, reload: load };
}
