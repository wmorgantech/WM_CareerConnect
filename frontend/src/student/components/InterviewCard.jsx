import { ExternalLink, Video } from "lucide-react";

import { formatMinutes, safeHttpUrl } from "../format.js";
import { Pill } from "../ui.jsx";
import { countdownText, describeWhen, endsAt, providerOf } from "../when.js";

const STATUS = {
  SCHEDULED: { label: "Scheduled", tone: "info" },
  COMPLETED: { label: "Completed", tone: "ok" },
  CANCELLED: { label: "Cancelled", tone: "muted" },
};

// One interview, with exactly what the backend provides: time, duration, interviewer name, status and
// meeting link. Nothing about type, rounds, feedback or results is shown because the API does not supply it.
export default function InterviewCard({ interview, compact = false }) {
  const when = describeWhen(interview.scheduledAt);
  const status = STATUS[interview.status] ?? { label: interview.status, tone: "neutral" };
  const link = interview.meetingLink ? safeHttpUrl(interview.meetingLink) : null;
  const provider = link ? providerOf(link) : null;
  const finished = endsAt(interview.scheduledAt, interview.durationMinutes)?.getTime() <= Date.now();
  const live = interview.status === "SCHEDULED" && !finished;
  const countdown = live ? countdownText(interview.scheduledAt, interview.durationMinutes) : "";

  return (
    <article className={interview.status === "CANCELLED" ? "iv iv--cancelled" : "iv"} aria-label={`Interview on ${when?.day ?? "an unknown date"}`}>
      <header className="iv__head">
        <div>
          <h3 className="iv__when">{when ? `${when.day}` : "Date to be confirmed"}</h3>
          {when ? (
            <p className="iv__time">
              <strong>{when.time} {when.zone}</strong>
              {when.local ? <span className="muted"> · your time: {when.local}</span> : null}
            </p>
          ) : null}
        </div>
        <div className="iv__badges">
          {countdown ? <span className="iv__count">{countdown}</span> : null}
          <Pill tone={status.tone}>{interview.status === "SCHEDULED" && finished ? "Time passed" : status.label}</Pill>
        </div>
      </header>

      <dl className="iv__facts">
        <div><dt>Duration</dt><dd>{formatMinutes(interview.durationMinutes)}</dd></div>
        {interview.interviewer ? <div><dt>Interviewer</dt><dd>{interview.interviewer}</dd></div> : null}
        {provider && live ? <div><dt>Meeting on</dt><dd>{provider}</dd></div> : null}
      </dl>

      {live && link ? (
        <div className="iv__join">
          <a className="btn btn--primary" href={link} target="_blank" rel="noopener noreferrer">
            <Video size={16} aria-hidden="true" /> Join interview <ExternalLink size={13} aria-hidden="true" />
            <span className="sr-only"> (opens in a new tab)</span>
          </a>
        </div>
      ) : null}
      {live && !link ? (
        <p className="iv__note">{interview.meetingLink ? `Meeting details: ${interview.meetingLink}` : "The meeting link is not available yet. It will appear here as soon as the recruitment team adds it."}</p>
      ) : null}
      {interview.status === "CANCELLED" ? <p className="iv__note">This interview was cancelled. Please contact your campus coordinator if you have questions.</p> : null}
      {interview.status === "COMPLETED" ? <p className="iv__note">This interview is complete. Outcomes are communicated to you by the recruitment team.</p> : null}
      {interview.status === "SCHEDULED" && finished && !compact ? <p className="iv__note">The scheduled time has passed. Please contact your campus coordinator if this interview did not take place.</p> : null}
    </article>
  );
}
