import { useRef, useState } from "react";

import { getErrorMessage } from "../../utils/errors.js";
import Button from "./Button.jsx";
import Modal from "./Modal.jsx";

// Confirmation for destructive or irreversible actions.
//
//   <ConfirmDialog
//     open={Boolean(target)}
//     title="Delete college"
//     message={`Delete ${target?.name}?`}
//     confirmLabel="Delete"
//     onConfirm={() => collegesService.remove(target.id)}
//     onCancel={() => setTarget(null)}
//   />
//
// `onConfirm` may be async. The dialog stays open with a spinner while it
// runs, shows the error if it rejects, and calls `onCancel` to close after
// it resolves, so the caller handles success (toast, reload) inside
// `onConfirm`.
export default function ConfirmDialog({
  open,
  title = "Are you sure?",
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  tone = "danger",
  onConfirm,
  onCancel,
}) {
  if (!open) {
    return null;
  }

  return (
    <ConfirmDialogBody
      cancelLabel={cancelLabel}
      confirmLabel={confirmLabel}
      message={message}
      onCancel={onCancel}
      onConfirm={onConfirm}
      title={title}
      tone={tone}
    />
  );
}

function ConfirmDialogBody({
  title,
  message,
  confirmLabel,
  cancelLabel,
  tone,
  onConfirm,
  onCancel,
}) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  // Synchronous guard against a second confirm before the next render.
  const submittingRef = useRef(false);

  async function handleConfirm() {
    if (submittingRef.current) {
      return;
    }

    submittingRef.current = true;
    setSubmitting(true);
    setError("");

    try {
      await onConfirm?.();
      onCancel?.();
    } catch (err) {
      submittingRef.current = false;
      setError(getErrorMessage(err));
      setSubmitting(false);
    }
  }

  return (
    <Modal
      closeDisabled={submitting}
      footer={
        <>
          <Button
            disabled={submitting}
            onClick={onCancel}
            variant="secondary"
          >
            {cancelLabel}
          </Button>
          <Button
            loading={submitting}
            onClick={handleConfirm}
            variant={tone === "danger" ? "danger" : "primary"}
          >
            {confirmLabel}
          </Button>
        </>
      }
      onClose={onCancel}
      size="sm"
      title={title}
    >
      {message && <p className="text-sm text-gray-600">{message}</p>}

      {error && (
        <p
          className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-[#D32F2F]"
          role="alert"
        >
          {error}
        </p>
      )}
    </Modal>
  );
}
