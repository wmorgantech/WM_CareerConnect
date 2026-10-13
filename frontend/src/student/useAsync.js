import { useCallback, useEffect, useState } from "react";

export function useAsync(load) {
  const [state, setState] = useState({ phase: "loading", data: null, error: null });
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const controller = new AbortController();

    setState((s) => ({ ...s, phase: "loading", error: null }));
    load(controller.signal)
      .then((data) => setState({ phase: "ready", data, error: null }))
      .catch((error) => {
        if (error?.name !== "AbortError") setState({ phase: "error", data: null, error });
      });

    return () => controller.abort();
  }, [load, tick]);

  const reload = useCallback(() => setTick((t) => t + 1), []);

  return { ...state, reload };
}
