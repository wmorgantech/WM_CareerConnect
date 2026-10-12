import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  Ban,
  CheckCircle2,
  ExternalLink,
  LockOpen,
  MessageSquareText,
  Pencil,
} from "lucide-react";

import Button from "../../components/common/Button.jsx";
import ConfirmDialog from "../../components/common/ConfirmDialog.jsx";
import EmptyState from "../../components/common/EmptyState.jsx";
import FormModal from "../../components/common/FormModal.jsx";
import Loader from "../../components/common/Loader.jsx";
import { ErrorPanel } from "../../components/dashboard/DashboardParts.jsx";
import PageHeader from "../../components/layout/PageHeader.jsx";
import { useAuth } from "../../hooks/useAuth.js";
import { usePermissions } from "../../hooks/usePermissions.js";
import { useToast } from "../../hooks/useToast.js";
import interviewsService, {
  submitFeedback,
  unlockFeedback,
} from "../../services/interviews.service.js";
import {
  buildInterviewerOptions,
  FEEDBACK_FIELDS,
  formatIst,
  getFeedbackState,
  getInterviewerName,
  getScheduleFields,
  isHttpUrl,
  scheduleInitialValues,
  toFieldError,
  toUpdatePayload,
} from "./interviewHelpers.js";
import { FeedbackBadge, InterviewStatusBadge } from "./interviewParts.jsx";
import { useInterviewers } from "./useInterviewers.js";

function Field({ label, children }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">
        {label}
      </dt>
      <dd className="mt-1 break-words text-sm text-gray-900">{children}</dd>
    </div>
  );
}

const NONE = <span className="text-gray-400">—</span>;

// One interview: GET /interviews/:id, scoped by the API (schedulers see
// any interview, everyone else only their own).
//
// mode "admin"       /admin/interviews/:interviewId   (interviews.schedule)
//                    edit, mark completed, cancel, Super Admin unlock
// mode "interviewer" /interviewer/interviews/:interviewId
//                    view, and submit feedback for their own interview
export default function InterviewDetails({ mode = "admin" }) {
  const { interviewId } = useParams();
  const toast = useToast();
  const { user } = useAuth();
  const { hasPermission } = usePermissions();

  const isAdminView = mode === "admin";
  const listPath = isAdminView ? "/admin/interviews" : "/interviewer/interviews";

  const canSchedule = isAdminView && hasPermission("interviews.schedule");
  const isSuperAdmin = Boolean(user?.roles?.includes("SUPER_ADMIN"));

  const interviewers = useInterviewers({ enabled: canSchedule });

  const [state, setState] = useState({
    interview: null,
    loading: true,
    error: null,
  });
  const [editOpen, setEditOpen] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [unlockOpen, setUnlockOpen] = useState(false);
  const [completeOpen, setCompleteOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);

  const load = useCallback(async () => {
    setState((current) => ({ ...current, loading: true, error: null }));

    try {
      const interview = await interviewsService.get(interviewId);

      setState({ interview, loading: false, error: null });
    } catch (error) {
      setState({ interview: null, loading: false, error });
    }
  }, [interviewId]);

  useEffect(() => {
    load();
  }, [load]);

  const { interview, loading, error } = state;

  const backLink = (
    <Link
      className="mb-4 inline-flex min-h-9 items-center gap-2 text-sm font-medium text-[#1B3A1E] hover:underline"
      to={listPath}
    >
      ← {isAdminView ? "Back to interviews" : "Back to my interviews"}
    </Link>
  );

  if (loading && !interview) {
    return (
      <div>
        {backLink}
        <Loader label="Loading interview..." />
      </div>
    );
  }

  // 404: unknown id, or an interview that is not yours (the API hides it).
  // 400: malformed id.
  if (error && (error.status === 404 || error.status === 400)) {
    return (
      <div>
        {backLink}
        <EmptyState
          description="This interview does not exist or is not available to you."
          title="Interview not found"
        />
      </div>
    );
  }

  if (error) {
    return (
      <div>
        {backLink}
        <ErrorPanel error={error} onRetry={load} />
      </div>
    );
  }

  const feedbackState = getFeedbackState(interview);
  const isAssignedInterviewer =
    hasPermission("interviews.feedback") &&
    interview.interviewerId === user?.id;
  const canSubmitFeedback =
    isAssignedInterviewer && feedbackState !== null && feedbackState !== "locked";
  const interviewerName = getInterviewerName(
    interview,
    interviewers.byId,
    user,
  );

  async function handleSave(values) {
    const changes = toUpdatePayload(values, interview);

    if (Object.keys(changes).length === 0) {
      toast.info("No changes to save");
      return;
    }

    try {
      await interviewsService.update(interview.id, changes);
    } catch (saveError) {
      throw toFieldError(saveError);
    }

    toast.success("Interview updated");
    load();
  }

  async function handleComplete() {
    await interviewsService.update(interview.id, { status: "COMPLETED" });
    toast.success("Interview marked as completed");
    load();
  }

  async function handleCancel() {
    await interviewsService.remove(interview.id);
    toast.success("Interview cancelled");
    load();
  }

  async function handleFeedback(values) {
    try {
      await submitFeedback(interview.id, {
        feedback: values.feedback,
        score: values.score,
      });
    } catch (feedbackError) {
      // The lock state changed elsewhere: show what is current.
      if (feedbackError?.code === "FEEDBACK_LOCKED") {
        load();
      }

      throw feedbackError;
    }

    toast.success("Feedback submitted and locked");
    load();
  }

  async function handleUnlock() {
    await unlockFeedback(interview.id);
    toast.success("Feedback unlocked for correction");
    load();
  }

  const actions = canSchedule ? (
    <>
      <Button
        disabled={interviewers.loading || Boolean(interviewers.error)}
        onClick={() => setEditOpen(true)}
        variant="secondary"
      >
        <Pencil aria-hidden="true" size={16} />
        Edit
      </Button>

      {interview.status === "SCHEDULED" && (
        <Button onClick={() => setCompleteOpen(true)} variant="secondary">
          <CheckCircle2 aria-hidden="true" size={16} />
          Mark completed
        </Button>
      )}

      {interview.status !== "CANCELLED" && (
        <Button onClick={() => setCancelOpen(true)} variant="danger">
          <Ban aria-hidden="true" size={16} />
          Cancel interview
        </Button>
      )}
    </>
  ) : undefined;

  return (
    <div>
      {backLink}

      <PageHeader
        actions={actions}
        description={`${formatIst(interview.scheduledAt)} · ${interview.durationMinutes} min`}
        title={`Interview with ${interview.candidate?.name ?? "candidate"}`}
      />

      {canSchedule && interviewers.error && (
        <ErrorPanel error={interviewers.error} onRetry={interviewers.reload} />
      )}

      <section
        aria-label="Interview details"
        className="rounded-xl border border-gray-200 bg-white p-5"
      >
        <dl className="grid gap-5 sm:grid-cols-2">
          <Field label="Status">
            <div className="flex flex-wrap gap-1">
              <InterviewStatusBadge status={interview.status} />
              <FeedbackBadge interview={interview} />
            </div>
          </Field>

          <Field label="Candidate">
            {interview.candidate ? (
              <>
                {hasPermission("candidates.manage") ? (
                  <Link
                    className="text-[#1B3A1E] hover:underline"
                    to={`/admin/candidates/${interview.candidate.id}`}
                  >
                    {interview.candidate.name}
                  </Link>
                ) : (
                  interview.candidate.name
                )}
                <span className="block break-all text-xs text-gray-500">
                  {interview.candidate.email}
                </span>
              </>
            ) : (
              NONE
            )}
          </Field>

          <Field label="Interviewer">{interviewerName}</Field>

          <Field label="When (IST)">{formatIst(interview.scheduledAt)}</Field>

          <Field label="Duration">{interview.durationMinutes} minutes</Field>

          <Field label="Meeting link">
            {interview.meetingLink ? (
              isHttpUrl(interview.meetingLink) ? (
                <a
                  className="inline-flex items-center gap-1 text-[#1B3A1E] hover:underline"
                  href={interview.meetingLink}
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  Join meeting
                  <ExternalLink aria-hidden="true" size={14} />
                </a>
              ) : (
                <span className="text-gray-500">
                  Not shown (only http and https links are opened)
                </span>
              )
            ) : (
              NONE
            )}
          </Field>

          <div className="sm:col-span-2">
            <Field label="Notes">
              {interview.notes ? (
                <span className="whitespace-pre-wrap">{interview.notes}</span>
              ) : (
                NONE
              )}
            </Field>
          </div>
        </dl>
      </section>

      <section
        aria-label="Feedback"
        className="mt-4 rounded-xl border border-gray-200 bg-white p-5"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 text-base font-semibold text-gray-900">
            <MessageSquareText
              aria-hidden="true"
              className="text-[#1B3A1E]"
              size={18}
            />
            Interview feedback
          </h2>

          <div className="flex flex-wrap gap-2">
            {canSubmitFeedback && (
              <Button onClick={() => setFeedbackOpen(true)}>
                {feedbackState === "unlocked"
                  ? "Correct feedback"
                  : "Submit feedback"}
              </Button>
            )}

            {feedbackState === "locked" && isSuperAdmin && (
              <Button onClick={() => setUnlockOpen(true)} variant="secondary">
                <LockOpen aria-hidden="true" size={16} />
                Unlock feedback
              </Button>
            )}
          </div>
        </div>

        <div className="mt-4 text-sm">
          {feedbackState === null && (
            <p className="text-gray-600">
              {interview.status === "CANCELLED"
                ? "This interview was cancelled, so no feedback is expected."
                : "Feedback can be submitted after the interview is marked completed."}
            </p>
          )}

          {feedbackState === "pending" && (
            <p className="text-gray-600">
              No feedback has been submitted yet.
              {!isAssignedInterviewer &&
                " Only the assigned interviewer can submit it."}
            </p>
          )}

          {interview.feedbackSubmittedAt && (
            <div>
              <dl className="grid gap-4 sm:grid-cols-2">
                <Field label="Score">
                  <span className="text-lg font-semibold text-[#1B3A1E]">
                    {interview.score}
                  </span>
                  <span className="text-gray-500"> / 100</span>
                </Field>

                <Field label="Submitted (IST)">
                  {formatIst(interview.feedbackSubmittedAt)}
                </Field>

                <div className="sm:col-span-2">
                  <Field label="Feedback">
                    <span className="whitespace-pre-wrap">
                      {interview.feedback}
                    </span>
                  </Field>
                </div>
              </dl>

              {feedbackState === "locked" && !isSuperAdmin && (
                <p className="mt-4 text-gray-600">
                  This feedback is locked. Ask a Super Admin to unlock it if it
                  needs correcting.
                </p>
              )}

              {feedbackState === "unlocked" && (
                <p className="mt-4 text-gray-600">
                  A Super Admin unlocked this feedback. The assigned
                  interviewer can correct and resubmit it.
                </p>
              )}
            </div>
          )}
        </div>
      </section>

      {canSchedule && (
        <FormModal
          fields={getScheduleFields({
            isEdit: true,
            interviewerOptions: buildInterviewerOptions(
              interviewers.items,
              interview,
            ),
            currentMeetingLink: interview.meetingLink ?? undefined,
          })}
          initialValues={scheduleInitialValues(interview)}
          key={`edit-${interview.updatedAt}`}
          omitEmpty={false}
          onClose={() => setEditOpen(false)}
          onSubmit={handleSave}
          open={editOpen}
          size="lg"
          submitLabel="Save changes"
          title={`Edit interview – ${interview.candidate?.name ?? "candidate"}`}
        />
      )}

      <FormModal
        fields={FEEDBACK_FIELDS}
        initialValues={{
          score: interview.score,
          feedback: interview.feedback,
        }}
        key={`feedback-${interview.updatedAt}`}
        onClose={() => setFeedbackOpen(false)}
        onSubmit={handleFeedback}
        open={feedbackOpen}
        submitLabel="Submit feedback"
        title={`Feedback – ${interview.candidate?.name ?? "candidate"}`}
      />

      <ConfirmDialog
        confirmLabel="Unlock feedback"
        message="Unlocking lets the assigned interviewer correct and resubmit this feedback. The unlock is recorded in the audit log."
        onCancel={() => setUnlockOpen(false)}
        onConfirm={handleUnlock}
        open={unlockOpen}
        title="Unlock feedback"
        tone="primary"
      />

      <ConfirmDialog
        confirmLabel="Mark completed"
        message="Mark this interview as completed? The assigned interviewer can then submit feedback."
        onCancel={() => setCompleteOpen(false)}
        onConfirm={handleComplete}
        open={completeOpen}
        title="Mark interview completed"
        tone="primary"
      />

      <ConfirmDialog
        confirmLabel="Cancel interview"
        message="Cancel this interview? It stays in the list marked Cancelled."
        onCancel={() => setCancelOpen(false)}
        onConfirm={handleCancel}
        open={cancelOpen}
        title="Cancel interview"
      />
    </div>
  );
}
