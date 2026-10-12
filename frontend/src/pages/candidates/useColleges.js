import { useCallback, useEffect, useState } from "react";

import collegesService from "../../services/colleges.service.js";

const COLLEGE_LIMIT = 100;

// Loads colleges (first 100 by name, active and inactive) for the candidate
// form and filter. Needs `colleges.manage`.
export function useColleges() {
  const [state, setState] = useState({
    items: [],
    loading: true,
    error: null,
  });

  const load = useCallback(async () => {
    setState((current) => ({ ...current, loading: true, error: null }));

    try {
      const { items } = await collegesService.list({
        limit: COLLEGE_LIMIT,
      });

      setState({ items, loading: false, error: null });
    } catch (error) {
      setState({ items: [], loading: false, error });
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return { ...state, reload: load };
}
