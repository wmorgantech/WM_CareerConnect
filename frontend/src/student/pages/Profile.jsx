import { useCallback } from "react";
import { GraduationCap, KeyRound, Lock, UserRound } from "lucide-react";
import { Link } from "react-router-dom";

import { studentApi } from "../api.js";
import Shell from "../components/Shell.jsx";
import { initials } from "../format.js";
import { useAsync } from "../useAsync.js";
import { ErrorState, Notice, PageHeader, Pill, Spinner } from "../ui.jsx";

const STATUS_TONE = { REGISTERED: "neutral", TEST_IN_PROGRESS: "info", TEST_SUBMITTED: "ok", INTERVIEW_SCHEDULED: "info", UNDER_REVIEW: "muted" };

function Detail({ items }) {
  return (
    <dl className="detail">
      {items
        .filter((item) => item.value !== null && item.value !== undefined && item.value !== "")
        .map((item) => (
          <div key={item.label}>
            <dt>{item.label}</dt>
            <dd>{item.value}</dd>
          </div>
        ))}
    </dl>
  );
}

export default function Profile() {
  const load = useCallback((signal) => studentApi.me(signal), []);
  const { phase, data: me, error, reload } = useAsync(load);

  return (
    <Shell>
      <PageHeader title="My profile" subtitle="Your details as recorded for this recruitment drive." />

      {phase === "loading" ? <Spinner label="Loading your profile…" /> : null}
      {phase === "error" ? <ErrorState title="Couldn't load your profile" message={error.message} onRetry={reload} /> : null}

      {me ? (
        <div className="stack stack--wide">
          <section className="strip" aria-labelledby="who">
            <div className="identity">
              <span className="avatar avatar--lg" aria-hidden="true">{initials(me.name)}</span>
              <div>
                <h2 id="who" className="card__title">{me.name}</h2>
                <p className="muted">Application no. {me.applicationNo}</p>
              </div>
            </div>
            <div className="strip__status">
              <span className="muted">Application status</span>
              <Pill tone={STATUS_TONE[me.status.code] ?? "neutral"}>{me.status.label}</Pill>
            </div>
          </section>

          <section className="card stack" aria-labelledby="personal">
            <div className="row row--between">
              <h2 id="personal" className="card__title"><UserRound size={18} aria-hidden="true" /> Personal details</h2>
              <Pill tone="muted"><Lock size={12} aria-hidden="true" /> Read-only</Pill>
            </div>
            <Detail items={[{ label: "Full name", value: me.name }, { label: "Email", value: me.email }, { label: "Mobile", value: me.mobile }]} />
          </section>

          <section className="card stack" aria-labelledby="academic">
            <h2 id="academic" className="card__title"><GraduationCap size={18} aria-hidden="true" /> Academic and application details</h2>
            <Detail items={[{ label: "College", value: me.college }, { label: "Department", value: me.department }, { label: "Level", value: me.level }, { label: "Placement drive", value: me.drive?.title }]} />
            <Notice tone="info">These details cannot be edited here. If any detail is wrong, please tell your campus coordinator.</Notice>
          </section>

          <section className="card row row--between" aria-labelledby="security">
            <div>
              <h2 id="security" className="card__title"><KeyRound size={18} aria-hidden="true" /> Password</h2>
              <p className="muted">Change the password you use to sign in to this portal.</p>
            </div>
            <Link className="btn btn--outline" to="/change-password">Change password</Link>
          </section>
        </div>
      ) : null}
    </Shell>
  );
}
