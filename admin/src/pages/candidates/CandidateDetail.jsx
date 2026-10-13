import { useEffect, useState } from "react";
import { Pencil } from "lucide-react";

import { interviewsApi } from "../../api/modules.api.js";
import ErrorState from "../../components/feedback/ErrorState.jsx";
import LoadingState from "../../components/feedback/LoadingState.jsx";
import SidePanel from "../../components/ui/SidePanel.jsx";
import StatusBadge, { ActiveBadge } from "../../components/ui/StatusBadge.jsx";
import { usePermissions } from "../../hooks/usePermissions.js";
import { getErrorMessage, isAbortError } from "../../utils/errors.js";
import { formatDateTime, isHttpUrl } from "../../utils/format.js";
import { INTERVIEW_STATUS_LABEL, INTERVIEW_STATUS_TONE } from "../interviews/interviewMeta.js";

export default function CandidateDetail({ candidate, onClose, onEdit }) {
  const { hasAnyPermission } = usePermissions();
  const canSeeInterviews = hasAnyPermission(["interviews.schedule", "interviews.feedback"]);
  const [interviews, setInterviews] = useState({ phase: canSeeInterviews ? "loading" : "hidden", items: [], error: null });
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!canSeeInterviews) {
      return undefined;
    }

    const controller = new AbortController();

    setInterviews((current) => ({ ...current, phase: "loading", error: null }));

    interviewsApi
      .list({ candidateId: candidate.id, limit: 50 }, controller.signal)
      .then(({ items }) => setInterviews({ phase: "ready", items, error: null }))
      .catch((error) => {
        if (!isAbortError(error)) setInterviews({ phase: "error", items: [], error });
      });

    return () => controller.abort();
  }, [candidate.id, canSeeInterviews, reloadKey]);

  return (
    <SidePanel
      open
      title={candidate.name}
      subtitle={candidate.email}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn--outline" onClick={onClose}>
            Close
          </button>
          <button type="button" className="btn btn--primary" onClick={onEdit}>
            <Pencil size={16} aria-hidden="true" />
            Edit
          </button>
        </>
      }
    >
      <dl className="detail">
        <div>
          <dt>Status</dt>
          <dd>
            <ActiveBadge active={candidate.isActive} />
          </dd>
        </div>
        <div>
          <dt>Phone</dt>
          <dd>{candidate.phone || "—"}</dd>
        </div>
        <div>
          <dt>College</dt>
          <dd>{candidate.college ? `${candidate.college.name}, ${candidate.college.city}` : "—"}</dd>
        </div>
        <div>
          <dt>Resume</dt>
          <dd>
            {candidate.resumeUrl && isHttpUrl(candidate.resumeUrl) ? (
              <a href={candidate.resumeUrl} target="_blank" rel="noopener noreferrer">
                Open resume
              </a>
            ) : (
              "—"
            )}
          </dd>
        </div>
        <div>
          <dt>Added (IST)</dt>
          <dd>{formatDateTime(candidate.createdAt)}</dd>
        </div>
      </dl>

      {canSeeInterviews ? (
        <section className="detail__section">
          <h3>Interviews</h3>

          {interviews.phase === "loading" ? <LoadingState label="Loading interviews…" /> : null}
          {interviews.phase === "error" ? (
            <ErrorState title="Couldn't load interviews" message={getErrorMessage(interviews.error)} onRetry={() => setReloadKey((k) => k + 1)} />
          ) : null}
          {interviews.phase === "ready" && interviews.items.length === 0 ? <p className="muted">No interviews scheduled.</p> : null}

          {interviews.phase === "ready" && interviews.items.length > 0 ? (
            <ul className="plainlist">
              {interviews.items.map((interview) => (
                <li key={interview.id}>
                  <span>{formatDateTime(interview.scheduledAt)}</span>
                  <StatusBadge tone={INTERVIEW_STATUS_TONE[interview.status]}>{INTERVIEW_STATUS_LABEL[interview.status]}</StatusBadge>
                  {interview.score != null ? <span className="sub">Score {interview.score}/100</span> : null}
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      ) : null}
    </SidePanel>
  );
}
