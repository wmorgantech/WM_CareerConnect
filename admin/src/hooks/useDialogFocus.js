import { useEffect, useRef } from "react";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function useDialogFocus(open, onClose, busy = false) {
  const ref = useRef(null);
  const closeRef = useRef(onClose);

  closeRef.current = onClose;

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    const opener = document.activeElement;
    const node = ref.current;

    (node?.querySelector("[data-autofocus]") ?? node?.querySelector(FOCUSABLE) ?? node)?.focus();

    function onKeyDown(event) {
      if (event.key === "Escape" && !busy) {
        event.stopPropagation();
        closeRef.current();

        return;
      }

      if (event.key !== "Tab" || !node) {
        return;
      }

      const items = [...node.querySelectorAll(FOCUSABLE)];

      if (items.length === 0) {
        event.preventDefault();

        return;
      }

      const first = items[0];
      const last = items[items.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.removeEventListener("keydown", onKeyDown);

      if (opener instanceof HTMLElement) {
        opener.focus();
      }
    };
  }, [open, busy]);

  return ref;
}
