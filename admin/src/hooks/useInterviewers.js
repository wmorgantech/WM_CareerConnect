import { useEffect, useState } from "react";
import { interviewsApi } from "../api/modules.api.js";
import { isAbortError } from "../utils/errors.js";

export function useInterviewers(enabled) {
  const [state, setState] = useState({ phase: enabled ? "loading" : "ready", items: [], error: null });
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!enabled) {
      return undefined;
    }

    const controller = new AbortController();

    setState((current) => ({ ...current, phase: "loading", error: null }));

    interviewsApi
      .interviewers({ limit: 100 }, controller.signal)
      .then((items) => setState({ phase: "ready", items, error: null }))
      .catch((error) => {
        if (!isAbortError(error)) setState({ phase: "error", items: [], error });
      });

    return () => controller.abort();
  }, [enabled, reloadKey]);

  return { ...state, retry: () => setReloadKey((key) => key + 1) };
}
