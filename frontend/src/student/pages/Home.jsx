import { useCallback } from "react";
import { ArrowRight, Check, ExternalLink, FileText, Video } from "lucide-react";
import { Link } from "react-router-dom";

import { studentApi } from "../api.js";
import Shell from "../components/Shell.jsx";
import { lifecycle, upcomingOf } from "../components/Timeline.jsx";
import { formatDateTime, formatMinutes, safeHttpUrl } from "../format.js";
import { useAsync } from "../useAsync.js";
import { ErrorState, Notice, Pill, Spinner } from "../ui.jsx";
import { countdownText, describeWhen, providerOf } from "../when.js";

const STATUS_TONE = { REGISTERED: "neutral", TEST_IN_PROGRESS: "info", TEST_SUBMITTED: "ok", INTERVIEW_SCHEDULED: "info", UNDER_REVIEW: "muted" };

function greeting(now = new Date()) {
  const hour = now.getHours();

  return hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
}

// One sentence about where the student is, from their actual state.
function lead(info, upcoming, me) {
  const attempt = info.attempt.state;

  if (upcoming.length > 0) return "Your interview is scheduled. Everything you need is below.";
  if (attempt === "IN_PROGRESS") return "Your online assessment is in progress. Your saved answers are kept.";
  if (attempt === "SUBMITTED" || ["TEST_SUBMITTED", "UNDER_REVIEW"].includes(me.status.code)) return "Your assessment is submitted and your application is with the recruitment team.";
  if (info.canStart) return "Your next milestone is the online assessment.";

  return "Your registration is confirmed. The online assessment will open soon.";
}

// The single step to take now. Rendered as the one dark-green panel on the page.
function NextAction({ info, upcoming }) {
  const attempt = info.attempt.state;
  const facts = info.template ? `${info.template.questionCount} questions · ${info.template.durationMinutes} minutes` : null;

  if (attempt === "IN_PROGRESS") {
    return (
      <section className="hm-action" aria-labelledby="hm-action-title">
        <p className="hm-label">Next step</p>
        <h2 id="hm-action-title">Resume your online assessment</h2>
        <p>Your timer is running. Continue from where you left off.</p>
        <Link className="hm-btn" to="/assessment">Resume assessment <ArrowRight size={16} aria-hidden="true" /></Link>
      </section>
    );
  }

  if (attempt === "NOT_STARTED" && info.canStart && info.template) {
    return (
      <section className="hm-action" aria-labelledby="hm-action-title">
        <p className="hm-label">Next step</p>
        <h2 id="hm-action-title">Take your online assessment</h2>
        <p>
          {facts}. Read the official instructions first. The timer starts only when you press Start and cannot be paused.
          {info.window.endsAt ? ` Open until ${formatDateTime(info.window.endsAt)} IST.` : ""}
        </p>
        <Link className="hm-btn" to="/instructions">View instructions and start <ArrowRight size={16} aria-hidden="true" /></Link>
      </section>
    );
  }

  if (attempt === "NOT_STARTED") {
    return (
      <section className="hm-action hm-action--quiet" aria-labelledby="hm-action-title">
        <p className="hm-label">Next step</p>
        <h2 id="hm-action-title">Your assessment is not open yet</h2>
        <p>{info.blocked?.message ?? "The assessment is not available yet."}</p>
        <p className="hm-muted">{info.window.startsAt ? `It opens on ${formatDateTime(info.window.startsAt)} IST.` : "Your campus coordinator will tell you when it opens. Nothing else is needed for now."}</p>
      </section>
    );
  }

  if (upcoming.length > 0) {
    return (
      <section className="hm-action hm-action--quiet" aria-labelledby="hm-action-title">
        <p className="hm-label">Next step</p>
        <h2 id="hm-action-title">Prepare for your interview</h2>
        <p>Check the time and joining details below, and read the preparation notes.</p>
        <Link className="hm-btn hm-btn--ghost" to="/interviews">Interview details <ArrowRight size={16} aria-hidden="true" /></Link>
      </section>
    );
  }

  return (
    <section className="hm-action hm-action--quiet" aria-labelledby="hm-action-title">
      <p className="hm-label">Next step</p>
      <h2 id="hm-action-title">No action needed right now</h2>
      <p>The recruitment team will contact you if there is anything for you to do. If you are called for an interview, it will appear on this page.</p>
    </section>
  );
}

function FeaturedInterview({ interview }) {
  const when = describeWhen(interview.scheduledAt);
  const link = interview.meetingLink ? safeHttpUrl(interview.meetingLink) : null;
  const provider = link ? providerOf(link) : null;
  const countdown = countdownText(interview.scheduledAt, interview.durationMinutes);
  const [dayNumber, ...rest] = when.day.replace(",", "").split(" ").slice(1);
  const weekday = when.day.split(",")[0];

  return (
    <section className="hm-iv" aria-labelledby="hm-iv-title">
      <div className="hm-iv__date" aria-hidden="true">
        <span>{weekday.slice(0, 3)}</span>
        <strong>{dayNumber}</strong>
        <span>{rest[0]?.slice(0, 3)}</span>
      </div>
      <div className="hm-iv__body">
        <p className="hm-label">Upcoming interview{countdown ? ` · ${countdown}` : ""}</p>
        <h2 id="hm-iv-title">{when.day}</h2>
        <p className="hm-iv__time">
          <strong>{when.time} IST</strong>
          {when.local ? <span className="hm-muted"> · your time {when.local}</span> : null}
          <span className="hm-muted"> · {formatMinutes(interview.durationMinutes)}{interview.interviewer ? ` · with ${interview.interviewer}` : ""}</span>
        </p>
        <div className="hm-iv__actions">
          {link ? (
            <a className="hm-btn" href={link} target="_blank" rel="noopener noreferrer">
              <Video size={16} aria-hidden="true" /> Join interview{provider ? ` on ${provider}` : ""} <ExternalLink size={13} aria-hidden="true" />
              <span className="sr-only"> (opens in a new tab)</span>
            </a>
          ) : (
            <span className="hm-muted">{interview.meetingLink ? `Meeting details: ${interview.meetingLink}` : "The meeting link will appear here as soon as the recruitment team adds it."}</span>
          )}
          <Link className="hm-link" to="/interviews">All interview details</Link>
        </div>
      </div>
    </section>
  );
}

function Journey({ stages }) {
  return (
    <ol className="hm-steps" aria-label="Recruitment journey">
      {stages.map((stage, i) => (
        <li key={stage.key} className={`hm-step is-${stage.state}`} aria-current={stage.state === "current" ? "step" : undefined}>
          <span className="hm-step__node" aria-hidden="true">{stage.state === "done" ? <Check size={13} strokeWidth={3} /> : i + 1}</span>
          <span className="hm-step__text">
            <strong>{stage.label}</strong>
            <span>{stage.state === "done" ? "Completed" : stage.state === "current" ? "Current step" : "Pending"}</span>
          </span>
        </li>
      ))}
    </ol>
  );
}

export default function Home() {
  const load = useCallback(
    (signal) => Promise.all([studentApi.me(signal), studentApi.assessment(signal), studentApi.interviews(signal).catch(() => null)]),
    [],
  );
  const { phase, data, error, reload } = useAsync(load);
  const [me, info, interviews] = data ?? [];
  const upcoming = upcomingOf(interviews);
  const stages = data ? lifecycle(me, info, interviews) : [];
  const current = stages.find((s) => s.state === "current");

  return (
    <Shell>
      {phase === "loading" ? <Spinner label="Loading your application…" /> : null}
      {phase === "error" ? <ErrorState title="Couldn't load your application" message={error.message} onRetry={reload} /> : null}

      {data ? (
        <div className="hm">
          <header className="hm-welcome">
            <div>
              <p className="hm-eyebrow">WM CareerConnect · Campus recruitment</p>
              <h1>{greeting()}, {me.name.split(" ")[0]}</h1>
              <p className="hm-lead">{lead(info, upcoming, me)}</p>
              <p className="hm-context">
                <strong>{me.drive?.title ?? "Placement drive"}</strong>
                {me.college ? <span>{me.college}</span> : null}
              </p>
            </div>
            <dl className="hm-ref">
              <div><dt>Application</dt><dd>{me.applicationNo}</dd></div>
              <div><dt>Level</dt><dd>{me.level}</dd></div>
              <div><dt>Status</dt><dd><Pill tone={STATUS_TONE[me.status.code] ?? "neutral"}>{me.status.label}</Pill></dd></div>
            </dl>
          </header>

          <section className="hm-band" aria-labelledby="hm-journey-title">
            <div className="hm-band__head">
              <h2 id="hm-journey-title" className="hm-label">Recruitment journey</h2>
              {current ? <p className="hm-muted">{current.label}: {current.note}</p> : <p className="hm-muted">Final outcome: communicated to you by the recruitment team.</p>}
            </div>
            <Journey stages={stages} />
          </section>

          <div className="hm-grid">
            <div className="hm-main">
              <NextAction info={info} upcoming={upcoming} />

              {interviews === null ? (
                <Notice tone="warn">Your interview schedule is unavailable right now. Please refresh in a moment.</Notice>
              ) : upcoming.length > 0 ? (
                <FeaturedInterview interview={upcoming[0]} />
              ) : (
                <section className="hm-empty" aria-labelledby="hm-empty-title">
                  <h2 id="hm-empty-title" className="hm-label">Interviews</h2>
                  <p>No interview is scheduled. If you are called for an interview, the date, time and joining link will appear here.</p>
                </section>
              )}
            </div>

            <aside className="hm-aside" aria-label="Assessment and official information">
              <section aria-labelledby="hm-assess-title">
                <h2 id="hm-assess-title" className="hm-label">Online assessment</h2>
                {info.template ? (
                  <dl className="hm-facts">
                    <div><dt>Questions</dt><dd>{info.template.questionCount}</dd></div>
                    <div><dt>Time allowed</dt><dd>{info.template.durationMinutes} minutes</dd></div>
                    <div><dt>Topics</dt><dd>{info.template.sections.map((s) => s.title).join(", ")}</dd></div>
                    {info.window.startsAt ? <div><dt>Opens</dt><dd>{formatDateTime(info.window.startsAt)} IST</dd></div> : null}
                    {info.window.endsAt ? <div><dt>Closes</dt><dd>{formatDateTime(info.window.endsAt)} IST</dd></div> : null}
                    <div><dt>Progress</dt><dd>{info.attempt.state === "SUBMITTED" ? "Submitted" : info.attempt.state === "IN_PROGRESS" ? "In progress" : "Not started"}</dd></div>
                  </dl>
                ) : (
                  <p className="hm-muted">No assessment has been set up for your level yet.</p>
                )}
              </section>

              <nav aria-labelledby="hm-info-title">
                <h2 id="hm-info-title" className="hm-label">Official information</h2>
                <ul className="hm-links">
                  <li><Link to="/instructions"><FileText size={16} aria-hidden="true" /> Assessment instructions</Link></li>
                  <li><Link to="/interviews"><FileText size={16} aria-hidden="true" /> Interview schedule</Link></li>
                  <li><Link to="/profile"><FileText size={16} aria-hidden="true" /> My profile and application</Link></li>
                </ul>
              </nav>
            </aside>
          </div>
        </div>
      ) : null}
    </Shell>
  );
}
