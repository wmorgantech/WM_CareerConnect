import { CalendarCheck, ClipboardCheck, ShieldCheck } from "lucide-react";

import { TAGLINE } from "./Shell.jsx";

const POINTS = [
  { icon: ClipboardCheck, title: "Timed online assessment", text: "A fair, server-timed test with autosave, so a dropped connection never costs you your answers." },
  { icon: CalendarCheck, title: "Interview schedule", text: "See your interview time and meeting link as soon as the recruitment team confirms them." },
  { icon: ShieldCheck, title: "Private to you", text: "You can only see your own application. Scores and answers are never shown to other candidates." },
];

// Split sign-in / registration layout: brand panel on the left, the form on the right.
export default function AuthLayout({ children, wide = false }) {
  return (
    <div className="auth">
      <aside className="auth__brand">
        <div className="stack">
          <span className="auth__logo"><img src="/assets/logo/wm-morgan-logo.png" alt="W Morgan Technologies" /></span>
          <div>
            <p className="auth__product">WM CareerConnect</p>
            <p className="auth__tag">{TAGLINE}</p>
          </div>
        </div>
        <ul className="auth__points">
          {POINTS.map(({ icon: Icon, title, text }) => (
            <li key={title}>
              <Icon size={20} aria-hidden="true" />
              <span><strong>{title}</strong>{text}</span>
            </li>
          ))}
        </ul>
        <p className="auth__tag">Campus recruitment · Student portal</p>
      </aside>

      <main className="auth__panel" id="main">
        <div className={wide ? "auth__box auth__box--wide" : "auth__box"}>{children}</div>
      </main>
    </div>
  );
}
