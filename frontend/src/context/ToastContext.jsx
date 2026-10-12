import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

export const ToastContext = createContext(null);

const DISMISS_AFTER_MS = 4500;
const MAX_TOASTS = 4;

const TONE_CLASSES = {
  success: "border-green-200 bg-green-50 text-green-900",
  error: "border-red-200 bg-red-50 text-[#B71C1C]",
  info: "border-gray-200 bg-white text-gray-800",
};

// Short, non-blocking messages ("College saved"). Wrap the app once in
// <ToastProvider> and call useToast() from any component.
export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const nextId = useRef(0);
  const timers = useRef(new Map());

  const dismiss = useCallback((id) => {
    clearTimeout(timers.current.get(id));
    timers.current.delete(id);
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const show = useCallback(
    (message, tone = "info") => {
      const id = ++nextId.current;

      setToasts((current) =>
        [...current, { id, message, tone }].slice(-MAX_TOASTS),
      );

      timers.current.set(
        id,
        setTimeout(() => dismiss(id), DISMISS_AFTER_MS),
      );

      return id;
    },
    [dismiss],
  );

  useEffect(() => {
    const pending = timers.current;

    return () => pending.forEach((timer) => clearTimeout(timer));
  }, []);

  const value = useMemo(
    () => ({
      show,
      success: (message) => show(message, "success"),
      error: (message) => show(message, "error"),
      info: (message) => show(message, "info"),
      dismiss,
    }),
    [show, dismiss],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}

      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex flex-col items-center gap-2 p-4 sm:items-end"
        role="region"
        aria-label="Notifications"
      >
        {toasts.map((toast) => (
          <div
            className={`pointer-events-auto flex w-full max-w-sm items-start justify-between gap-3 rounded-lg border px-4 py-3 text-sm shadow-lg ${
              TONE_CLASSES[toast.tone] ?? TONE_CLASSES.info
            }`}
            key={toast.id}
            role={toast.tone === "error" ? "alert" : "status"}
          >
            <p className="min-w-0 break-words">{toast.message}</p>
            <button
              aria-label="Dismiss notification"
              className="shrink-0 text-lg leading-none opacity-60 hover:opacity-100"
              onClick={() => dismiss(toast.id)}
              type="button"
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
