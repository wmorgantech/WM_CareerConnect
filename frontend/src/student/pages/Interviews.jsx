import { useCallback } from "react";
import { CalendarClock, Camera, Mic, Wifi, Volume2 } from "lucide-react";

import { studentApi } from "../api.js";
import InterviewCard from "../components/InterviewCard.jsx";
import { upcomingOf } from "../components/Timeline.jsx";
import Shell from "../components/Shell.jsx";
import { useAsync } from "../useAsync.js";
import { EmptyState, ErrorState, PageHeader, Spinner } from "../ui.jsx";

const REQUIREMENTS = [
  { icon: Wifi, text: "A stable internet connection" },
  { icon: Camera, text: "A working camera" },
  { icon: Mic, text: "A working microphone" },
  { icon: Volume2, text: "A quiet place without interruptions" },
];

export default function Interviews() {
  const load = useCallback((signal) => studentApi.interviews(signal), []);
  const { phase, data, error, reload } = useAsync(load);

  const upcoming = upcomingOf(data);
  const earlier = (data ?? []).filter((i) => !upcoming.includes(i)).sort((a, b) => new Date(b.scheduledAt) - new Date(a.scheduledAt));

  return (
    <Shell>
      <PageHeader title="Interviews" subtitle="Your interview schedule. Times are shown in Indian Standard Time (IST)." />

      {phase === "loading" ? <Spinner label="Loading your interviews…" /> : null}
      {phase === "error" ? <ErrorState title="Couldn't load your interviews" message={error.message} onRetry={reload} /> : null}

      {data && data.length === 0 ? (
        <section className="card">
          <EmptyState title="No interviews scheduled">
            If the recruitment team calls you for an interview, its date, time and meeting link will appear here. You do not need to do anything now.
          </EmptyState>
        </section>
      ) : null}

      {upcoming.length > 0 ? (
        <section className="stack" aria-labelledby="up">
          <h2 id="up" className="section">Upcoming</h2>
          {upcoming.map((i) => <InterviewCard key={i.id} interview={i} />)}

          <section className="card stack" aria-labelledby="prep">
            <h2 id="prep" className="card__title"><CalendarClock size={18} aria-hidden="true" /> Before your interview</h2>
            <p className="muted">Please join a few minutes early. For a smooth interview, make sure you have:</p>
            <ul className="needs">
              {REQUIREMENTS.map(({ icon: Icon, text }) => (
                <li key={text}><Icon size={16} aria-hidden="true" /> {text}</li>
              ))}
            </ul>
            <p className="muted">To change an interview time or ask a question about it, contact your campus coordinator.</p>
          </section>
        </section>
      ) : null}

      {earlier.length > 0 ? (
        <section className="stack" aria-labelledby="past">
          <h2 id="past" className="section">Earlier and cancelled</h2>
          {earlier.map((i) => <InterviewCard key={i.id} interview={i} compact />)}
        </section>
      ) : null}
    </Shell>
  );
}
