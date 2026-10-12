import { useEffect, useId, useRef } from "react";

const SIZES = {
  sm: "max-w-sm",
  md: "max-w-lg",
  lg: "max-w-2xl",
};

// Accessible dialog: Escape and backdrop click close it (unless
// `closeDisabled`, for example while a request is in flight), focus moves
// into the dialog and returns to the opener, and page scrolling is locked
// while open. The panel scrolls internally on small screens.
export default function Modal({
  title,
  onClose,
  children,
  footer,
  size = "md",
  closeDisabled = false,
}) {
  const titleId = useId();
  const panelRef = useRef(null);
  const onCloseRef = useRef(onClose);
  const closeDisabledRef = useRef(closeDisabled);

  useEffect(() => {
    onCloseRef.current = onClose;
    closeDisabledRef.current = closeDisabled;
  });

  useEffect(() => {
    const opener = document.activeElement;
    const previousOverflow = document.body.style.overflow;

    document.body.style.overflow = "hidden";

    const panel = panelRef.current;
    const firstField = panel?.querySelector(
      "input:not([disabled]), select:not([disabled]), textarea:not([disabled])",
    );

    (firstField || panel)?.focus();

    function handleKeyDown(event) {
      if (event.key === "Escape" && !closeDisabledRef.current) {
        onCloseRef.current?.();
      }
    }

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;

      if (opener instanceof HTMLElement) {
        opener.focus();
      }
    };
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !closeDisabled) {
          onClose?.();
        }
      }}
    >
      <section
        ref={panelRef}
        aria-labelledby={titleId}
        aria-modal="true"
        className={`flex max-h-[92vh] w-full flex-col rounded-t-xl bg-white shadow-xl outline-none sm:rounded-xl ${SIZES[size] ?? SIZES.md}`}
        role="dialog"
        tabIndex={-1}
      >
        <div className="flex items-center justify-between gap-4 border-b border-gray-100 px-5 py-4">
          <h2 className="text-lg font-semibold text-gray-900" id={titleId}>
            {title}
          </h2>
          <button
            aria-label="Close"
            className="flex h-9 w-9 items-center justify-center rounded-lg text-xl text-gray-500 hover:bg-gray-100 disabled:opacity-50"
            disabled={closeDisabled}
            onClick={onClose}
            type="button"
          >
            ×
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {children}
        </div>

        {footer && (
          <div className="flex flex-col-reverse gap-2 border-t border-gray-100 px-5 py-4 sm:flex-row sm:justify-end">
            {footer}
          </div>
        )}
      </section>
    </div>
  );
}
