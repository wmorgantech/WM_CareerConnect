import { useEffect, useState } from "react";
import { collegesApi } from "../api/modules.api.js";
import { isAbortError } from "../utils/errors.js";

export function useColleges() {
  const [state, setState] = useState({ phase: "loading", items: [], error: null });
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();

    setState((current) => ({ ...current, phase: "loading", error: null }));

    collegesApi
      .list({ isActive: "true", limit: 100 }, controller.signal)
      .then(({ items }) => setState({ phase: "ready", items, error: null }))
      .catch((error) => {
        if (!isAbortError(error)) setState({ phase: "error", items: [], error });
      });

    return () => controller.abort();
  }, [reloadKey]);

  return { ...state, retry: () => setReloadKey((key) => key + 1) };
}
