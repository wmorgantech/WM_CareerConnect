import { Check } from "lucide-react";

// The recruitment lifecycle, mapped from what the backend actually reports. A student can only
// sign in after a coordinator has verified them, so registration and verification are complete
// whenever this is visible. The final outcome is never exposed to the portal, so it is always
// described as communicated by the recruitment team and never marked complete or in progress.

export function upcomingOf(interviews) {
  return (interviews ?? [])
    .filter((i) => i.status === "SCHEDULED" && new Date(i.scheduledAt).getTime() + i.durationMinutes * 60_000 > Date.now())
    .sort((a, b) => new Date(a.scheduledAt) - new Date(b.scheduledAt));
}

export function lifecycle(me, info, interviews) {
  const attempt = info?.attempt?.state ?? "NOT_STARTED";
  const code = me.status.code;
  const upcoming = upcomingOf(interviews);
  const interviewed = (interviews ?? []).some((i) => i.status === "COMPLETED");
  const submitted = attempt === "SUBMITTED" || ["TEST_SUBMITTED", "UNDER_REVIEW", "INTERVIEW_SCHEDULED"].includes(code);
  const inInterview = code === "INTERVIEW_SCHEDULED" || upcoming.length > 0 || interviewed;

  const assessment = submitted
    ? { state: "done", note: "Submitted. Your answers are with the recruitment team." }
    : attempt === "IN_PROGRESS"
      ? { state: "current", note: "In progress. The timer is running." }
      : info?.canStart
        ? { state: "current", note: "Ready for you to start." }
        : { state: "waiting", note: info?.blocked?.message ?? "Not available yet. Your coordinator will tell you when it opens." };

  const review = inInterview
    ? { state: "done", note: "Review complete." }
    : submitted
      ? { state: "current", note: "The recruitment team is reviewing your application." }
      : { state: "waiting", note: "Starts after you submit the assessment." };

  const interview = interviewed && upcoming.length === 0
    ? { state: "done", note: "Interview completed." }
    : upcoming.length > 0 || code === "INTERVIEW_SCHEDULED"
      ? { state: "current", note: upcoming.length > 0 ? "Scheduled. See your interview details." : "Scheduled by the recruitment team." }
      : { state: "waiting", note: "If you are called for an interview, the date and time appear here." };

  return [
    { key: "registration", label: "Registration", state: "done", note: "Your registration is recorded." },
    { key: "verification", label: "Coordinator verification", state: "done", note: "Your identity was confirmed by your campus coordinator." },
    { key: "assessment", label: "Online assessment", ...assessment },
    { key: "review", label: "Application review", ...review },
    { key: "interview", label: "Interview", ...interview },
    { key: "outcome", label: "Final outcome", state: "waiting", note: "Communicated to you by the recruitment team." },
  ];
}

const STATE_LABEL = { done: "Completed", current: "Current step", waiting: "Pending" };

export default function Timeline({ stages }) {
  return (
    <ol className="lifecycle" aria-label="Recruitment timeline">
      {stages.map((stage) => (
        <li key={stage.key} className={`lifecycle__item is-${stage.state}`} aria-current={stage.state === "current" ? "step" : undefined}>
          <span className="lifecycle__dot" aria-hidden="true">{stage.state === "done" ? <Check size={14} /> : null}</span>
          <div>
            <p className="lifecycle__label">{stage.label} <span className="sr-only">{STATE_LABEL[stage.state]}</span></p>
            <p className="lifecycle__note">{stage.note}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}
