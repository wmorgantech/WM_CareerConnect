import { useState } from "react";
import { Lock, LockOpen, Pencil } from "lucide-react";

import { interviewsApi } from "../../api/modules.api.js";
import ConfirmDialog from "../../components/ui/ConfirmDialog.jsx";
import { TextAreaField, TextField } from "../../components/ui/Field.jsx";
import SidePanel from "../../components/ui/SidePanel.jsx";
import StatusBadge from "../../components/ui/StatusBadge.jsx";
import { useToast } from "../../components/ui/Toast.jsx";
import { useAuth } from "../../hooks/useAuth.js";
import { useForm } from "../../hooks/useForm.js";
import { usePermissions } from "../../hooks/usePermissions.js";
import { formatDateTime, isHttpUrl } from "../../utils/format.js";
import { INTERVIEW_STATUS_LABEL, INTERVIEW_STATUS_TONE } from "./interviewMeta.js";

export function feedbackState(interview) {
  if (interview.feedbackLockedAt) return "LOCKED";
  if (interview.feedbackSubmittedAt) return "UNLOCKED";

  return "NONE";
}

function FeedbackForm({ interview, onSaved }) {
  const form = useForm({
    initialValues: { feedback: interview.feedback ?? "", score: interview.score != null ? String(interview.score) : "" },
    validate(values) {
      const errors = {};
      const score = Number(values.score);

      if (!values.feedback.trim()) errors.feedback = "Enter your feedback.";
      else if (values.feedback.trim().length > 5000) errors.feedback = "Feedback must not exceed 5000 characters.";

      if (values.score === "" || !Number.isInteger(score) || score < 0 || score > 100) errors.score = "Enter a whole number from 0 to 100.";

      return errors;
    },
    async onSubmit(values) {
      const updated = await interviewsApi.submitFeedback(interview.id, { feedback: values.feedback.trim(), score: Number(values.score) });

      onSaved(updated);
    },
  });

  return (
    <form className="stack" onSubmit={form.handleSubmit} noValidate>
      {form.formError ? (
        <p className="notice notice--error" role="alert">
          {form.formError}
        </p>
      ) : null}

      <TextAreaField label="Feedback" name="feedback" value={form.values.feedback} onChange={form.setValue} error={form.errors.feedback} required rows={5} maxLength={5000} />
      <TextField label="Score (0–100)" name="score" value={form.values.score} onChange={form.setValue} error={form.errors.score} required type="number" min={0} max={100} step={1} />
      <p className="field__hint">Submitting locks the feedback. Only a Super Admin can unlock it for correction.</p>

      <button type="submit" className="btn btn--primary" disabled={form.submitting}>
        {form.submitting ? "Submitting…" : "Submit feedback"}
      </button>
    </form>
  );
}

export default function InterviewDetail({ interview: initial, interviewerName, onClose, onEdit, onChanged }) {
  const toast = useToast();
  const { user } = useAuth();
  const { hasPermission } = usePermissions();
  const [interview, setInterview] = useState(initial);
  const [confirmUnlock, setConfirmUnlock] = useState(false);

  const state = feedbackState(interview);
  const isSuperAdmin = user?.roles?.includes("SUPER_ADMIN");
  const canSchedule = hasPermission("interviews.schedule");
  const canSubmit =
    hasPermission("interviews.feedback") &&
    interview.interviewerId === user?.id &&
    interview.status === "COMPLETED" &&
    state !== "LOCKED";

  function updated(next, message) {
    setInterview(next);
    onChanged();
    toast.success(message);
  }

  async function unlock() {
    const next = await interviewsApi.unlockFeedback(interview.id);

    setConfirmUnlock(false);
    updated(next, "Feedback unlocked");
  }

  return (
    <SidePanel
      open
      title={interview.candidate.name}
      subtitle={interview.candidate.email}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn--outline" onClick={onClose}>
            Close
          </button>
          {canSchedule ? (
            <button type="button" className="btn btn--primary" onClick={() => onEdit(interview)}>
              <Pencil size={16} aria-hidden="true" />
              Edit
            </button>
          ) : null}
        </>
      }
    >
      <dl className="detail">
        <div>
          <dt>Status</dt>
          <dd>
            <StatusBadge tone={INTERVIEW_STATUS_TONE[interview.status]}>{INTERVIEW_STATUS_LABEL[interview.status]}</StatusBadge>
          </dd>
        </div>
        <div>
          <dt>When (IST)</dt>
          <dd>{formatDateTime(interview.scheduledAt)}</dd>
        </div>
        <div>
          <dt>Duration</dt>
          <dd>{interview.durationMinutes} minutes</dd>
        </div>
        <div>
          <dt>Interviewer</dt>
          <dd>{interviewerName}</dd>
        </div>
        <div>
          <dt>Meeting</dt>
          <dd>
            {interview.meetingLink && isHttpUrl(interview.meetingLink) ? (
              <a href={interview.meetingLink} target="_blank" rel="noopener noreferrer">
                Join meeting
              </a>
            ) : (
              "—"
            )}
          </dd>
        </div>
        <div>
          <dt>Notes</dt>
          <dd className="pre">{interview.notes || "—"}</dd>
        </div>
      </dl>

      <section className="detail__section">
        <h3>Feedback</h3>

        {state === "NONE" ? <p className="muted">No feedback has been submitted.</p> : null}

        {state !== "NONE" ? (
          <>
            <p className="feedbackstate">
              {state === "LOCKED" ? <Lock size={15} aria-hidden="true" /> : <LockOpen size={15} aria-hidden="true" />}
              {state === "LOCKED" ? "Submitted and locked" : "Unlocked for correction"}
              <span className="sub"> · {formatDateTime(interview.feedbackSubmittedAt)}</span>
            </p>
            <p>
              <strong>Score:</strong> {interview.score}/100
            </p>
            <p className="pre">{interview.feedback}</p>
          </>
        ) : null}

        {state === "LOCKED" && isSuperAdmin ? (
          <button type="button" className="btn btn--outline" onClick={() => setConfirmUnlock(true)}>
            <LockOpen size={15} aria-hidden="true" />
            Unlock for correction
          </button>
        ) : null}

        {canSubmit ? (
          <div className="detail__form">
            <h4>{state === "UNLOCKED" ? "Correct and resubmit feedback" : "Submit feedback"}</h4>
            <FeedbackForm interview={interview} onSaved={(next) => updated(next, "Feedback submitted")} />
          </div>
        ) : null}

        {!canSubmit && state === "NONE" && hasPermission("interviews.feedback") && interview.interviewerId === user?.id && interview.status !== "COMPLETED" ? (
          <p className="muted">Feedback can be submitted once the interview is marked Completed.</p>
        ) : null}
      </section>

      <ConfirmDialog
        open={confirmUnlock}
        title="Unlock feedback?"
        message="The assigned interviewer will be able to correct and resubmit this feedback. The unlock is recorded in the audit log."
        confirmLabel="Unlock"
        tone="primary"
        onCancel={() => setConfirmUnlock(false)}
        onConfirm={unlock}
      />
    </SidePanel>
  );
}
