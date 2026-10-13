import { useEffect, useRef, useState } from "react";
import { useDialogFocus } from "../../hooks/useDialogFocus.js";
import { getErrorMessage } from "../../utils/errors.js";

export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  tone = "danger",
  onConfirm,
  onCancel,
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const busyRef = useRef(false);
  const ref = useDialogFocus(open, onCancel, busy);

  useEffect(() => {
    if (!open) {
      setError("");
    }
  }, [open]);

  if (!open) {
    return null;
  }

  async function handleConfirm() {
    if (busyRef.current) {
      return;
    }

    busyRef.current = true;
    setBusy(true);
    setError("");

    try {
      await onConfirm();
    } catch (failure) {
      setError(getErrorMessage(failure));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  return (
    <>
      <div className="overlay overlay--top" aria-hidden="true" />

      <div ref={ref} className="dialog" role="alertdialog" aria-modal="true" aria-labelledby="dialog-title" aria-describedby="dialog-text" tabIndex={-1}>
        <h2 className="dialog__title" id="dialog-title">
          {title}
        </h2>
        <div className="dialog__text" id="dialog-text">
          {message}
        </div>

        {error ? (
          <p className="notice notice--error" role="alert">
            {error}
          </p>
        ) : null}

        <div className="dialog__actions">
          <button type="button" className="btn btn--outline" onClick={onCancel} disabled={busy} data-autofocus>
            {cancelLabel}
          </button>
          <button type="button" className={tone === "danger" ? "btn btn--danger" : "btn btn--primary"} onClick={handleConfirm} disabled={busy}>
            {busy ? "Working…" : confirmLabel}
          </button>
        </div>
      </div>
    </>
  );
}
