import { useCallback, useState } from "react";
import { ArrowRight, Clock, FileText, HelpCircle, ListChecks, Maximize, MousePointerClick, Send, ShieldCheck, Timer, Wifi, Code2 } from "lucide-react";
import { Link, Navigate, useNavigate } from "react-router-dom";

import { studentApi } from "../api.js";
import Shell from "../components/Shell.jsx";
import { useStudent } from "../auth.jsx";
import { enterFullscreen, fullscreenSupported } from "../fullscreen.js";
import { initials } from "../format.js";
import { useAsync } from "../useAsync.js";
import { BackLink, ErrorState, Notice, Spinner } from "../ui.jsx";

// The wording of every rule comes from the server; only the icon is chosen here.
const RULE_ICON = {
  "About this assessment": FileText,
  Answering: MousePointerClick,
  "Allowed and not allowed": ShieldCheck,
  "Full screen and focus": Maximize,
  Submitting: Send,
};

const CHECKS = [
  { id: "read", icon: FileText, title: "Instructions reviewed", text: "I have read the assessment guidelines." },
  { id: "net", icon: Wifi, title: "Stable internet connection", text: "My connection is ready." },
  { id: "quiet", icon: Timer, title: "Quiet environment", text: "I am somewhere free of distractions." },
];

export default function Instructions() {
  const navigate = useNavigate();
  const { user } = useStudent();
  const load = useCallback((signal) => studentApi.assessment(signal), []);
  const { phase, data: info, error, reload } = useAsync(load);
  const [accepted, setAccepted] = useState(false);
  const [checks, setChecks] = useState({});
  const [busy, setBusy] = useState(false);
  const [startError, setStartError] = useState("");

  if (info?.attempt.state === "IN_PROGRESS") return <Navigate to="/assessment" replace />;
  if (info?.attempt.state === "SUBMITTED") return <Navigate to="/submitted" replace />;

  async function start() {
    if (!accepted || busy) return;

    setBusy(true);
    setStartError("");

    await enterFullscreen();

    try {
      await studentApi.start(info.termsVersion);
      navigate("/assessment", { replace: true });
    } catch (e) {
      setStartError(e.message);
      setBusy(false);
    }
  }

  const ready = info?.template && info.canStart;
  const total = info?.template?.questionCount ?? 0;

  return (
    <Shell exam>
      <div className="stack">
        <div className="row">
          <BackLink fallback="/" label="Back to the dashboard" iconOnly />
          <div>
            <h1>Before you begin</h1>
            {info?.drive?.title ? <p className="muted"><strong>{info.drive.title}</strong></p> : null}
            <p className="muted">Please read the information below carefully before you start the assessment.</p>
          </div>
        </div>

        {phase === "loading" ? <Spinner label="Loading the rules…" /> : null}
        {phase === "error" ? <ErrorState title="Couldn't load the rules" message={error.message} onRetry={reload} /> : null}

        {info && !ready ? (
          <section className="card stack">
            <Notice tone="warn">{info.blocked?.message ?? "The assessment is not ready yet."}</Notice>
            <Link className="btn btn--outline" to="/">Back to home</Link>
          </section>
        ) : null}

        {ready ? (
          <>
            <div className="briefgrid">
              <section className="card stack" aria-labelledby="brief-title">
                <div className="briefhead">
                  <span className="iconbox"><ListChecks size={26} aria-hidden="true" /></span>
                  <div>
                    <h2 id="brief-title">Assessment briefing</h2>
                    <p className="muted">Get familiar with the test details and topics.</p>
                  </div>
                </div>

                <dl className="stats" aria-label="Assessment summary">
                  <div><span className="iconbox"><HelpCircle size={20} aria-hidden="true" /></span><div><dt>Total questions</dt><dd>{total}</dd></div></div>
                  <div><span className="iconbox"><Clock size={20} aria-hidden="true" /></span><div><dt>Time allowed</dt><dd>{info.template.durationMinutes} minutes</dd></div></div>
                  <div><span className="iconbox"><Code2 size={20} aria-hidden="true" /></span><div><dt>Topics</dt><dd>{info.template.sections.map((s) => s.title).join(" / ")}</dd></div></div>
                </dl>

                <div>
                  <h2>Topic distribution</h2>
                  <ul className="topics">
                    {info.template.sections.map((s) => (
                      <li key={s.key}>
                        <strong>{s.title}</strong>
                        <span>{s.questionCount} questions ({Math.round((s.questionCount / total) * 100)}%)</span>
                        <div className="bar" aria-hidden="true"><i style={{ width: `${(s.questionCount / total) * 100}%` }} /></div>
                      </li>
                    ))}
                  </ul>
                </div>

                <div>
                  <h2>Assessment guidelines</h2>
                  <ul className="guides">
                    {info.rules.map((group) => {
                      const Icon = RULE_ICON[group.title] ?? FileText;

                      return (
                        <li key={group.title}>
                          <span className="iconbox"><Icon size={20} aria-hidden="true" /></span>
                          <span>
                            <strong>{group.title}</strong>
                            {group.items.map((item) => (
                              <span key={item} style={{ display: "block", marginTop: 4 }}>{item}</span>
                            ))}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                  {!fullscreenSupported() ? <Notice tone="warn">Your browser cannot open full screen. You can still take the assessment; please stay on this page.</Notice> : null}
                </div>
              </section>

              <aside className="stack" aria-label="Your session">
                <section className="card stack">
                  <h2>Your session</h2>
                  <div className="session">
                    <span className="avatar avatar--lg" aria-hidden="true">{initials(user?.name)}</span>
                    <div>
                      <strong>{user?.name}</strong>
                      <p className="muted">Application ID {user?.applicationNo}</p>
                      {info.drive?.title ? <p className="muted">{info.drive.title}</p> : null}
                    </div>
                  </div>

                  <div>
                    <h2>Readiness checklist</h2>
                    <p className="muted" style={{ marginBottom: 8 }}>Tick these off for yourself before you start.</p>
                    <ul className="ready">
                      {CHECKS.map(({ id, icon: Icon, title, text }) => (
                        <li key={id}>
                          <label>
                            <input type="checkbox" checked={Boolean(checks[id])} onChange={(e) => setChecks((c) => ({ ...c, [id]: e.target.checked }))} disabled={busy} />
                            <Icon size={18} aria-hidden="true" />
                            <span><strong>{title}</strong>{text}</span>
                          </label>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="timernote">
                    <Timer size={28} aria-hidden="true" />
                    <div>
                      <strong>Your timer starts only when you begin</strong>
                      <span className="muted">Once you press Start, your {info.template.durationMinutes} minutes begin and cannot be paused.</span>
                    </div>
                  </div>
                </section>
              </aside>
            </div>

            <section className="card stack" aria-label="Accept and start">
              <div className="startbar">
                <label className="check">
                  <input type="checkbox" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} disabled={busy} />
                  <span>
                    <strong>I have read and understood the assessment rules.</strong>
                    <span className="muted" style={{ display: "block" }}>I understand that the timer starts when I press Start and cannot be paused.</span>
                  </span>
                </label>
                <div className="row">
                  <button type="button" className="btn btn--primary" onClick={start} disabled={!accepted || busy}>
                    {busy ? "Starting…" : <>Start assessment <ArrowRight size={16} aria-hidden="true" /></>}
                  </button>
                  <Link className="btn btn--outline" to="/">Return to dashboard</Link>
                </div>
              </div>
              {startError ? <Notice tone="error">{startError}</Notice> : null}
              {!accepted ? <p className="muted">Tick the box to enable Start.</p> : null}
            </section>
          </>
        ) : null}
      </div>
    </Shell>
  );
}
