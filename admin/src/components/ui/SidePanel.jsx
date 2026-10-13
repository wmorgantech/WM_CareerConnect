import { useState } from "react";
import { X } from "lucide-react";
import { useDialogFocus } from "../../hooks/useDialogFocus.js";
import ConfirmDialog from "./ConfirmDialog.jsx";

export default function SidePanel({ open, title, subtitle, onClose, dirty = false, busy = false, children, footer }) {
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  function requestClose() {
    if (busy) {
      return;
    }

    if (dirty) {
      setConfirmDiscard(true);

      return;
    }

    onClose();
  }

  const ref = useDialogFocus(open && !confirmDiscard, requestClose, busy);

  if (!open) {
    return null;
  }

  return (
    <>
      <div className="overlay" onClick={requestClose} aria-hidden="true" />

      <aside ref={ref} className="sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-title" tabIndex={-1}>
        <header className="sheet__head">
          <div>
            <h2 className="sheet__title" id="sheet-title">
              {title}
            </h2>
            {subtitle ? <p className="sheet__sub">{subtitle}</p> : null}
          </div>
          <button type="button" className="iconbtn" onClick={requestClose} disabled={busy} aria-label="Close panel">
            <X size={18} aria-hidden="true" />
          </button>
        </header>

        <div className="sheet__body">{children}</div>

        {footer ? <footer className="sheet__foot">{typeof footer === "function" ? footer(requestClose) : footer}</footer> : null}
      </aside>

      <ConfirmDialog
        open={confirmDiscard}
        title="Discard changes?"
        message="You have unsaved changes. If you close now they will be lost."
        confirmLabel="Discard"
        cancelLabel="Keep editing"
        tone="danger"
        onCancel={() => setConfirmDiscard(false)}
        onConfirm={() => {
          setConfirmDiscard(false);
          onClose();
        }}
      />
    </>
  );
}
