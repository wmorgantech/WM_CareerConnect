import { useState } from "react";
import { CalendarClock, ClipboardList, Home, LogOut, ShieldCheck, UserRound } from "lucide-react";
import { NavLink, useLocation } from "react-router-dom";

import { useStudent } from "../auth.jsx";
import { initials } from "../format.js";
import { BackLink } from "../ui.jsx";

const LINKS = [
  { to: "/", label: "Home", icon: Home, end: true },
  { to: "/instructions", label: "Assessment", icon: ClipboardList },
  { to: "/interviews", label: "Interviews", icon: CalendarClock },
  { to: "/profile", label: "My profile", icon: UserRound },
];

export const TAGLINE = "Connect. Apply. Interview. Get Hired.";

export function Brand() {
  return (
    <span className="brand">
      <span className="brand-logo-frame" aria-hidden="true">
        <img className="brand-logo" src="/assets/logo/wm-morgan-logo.png" alt="" />
      </span>
      <span className="brand__text">
        <span className="brand__name">CareerConnect</span>
        <span className="brand__tag">Student portal</span>
      </span>
    </span>
  );
}

// Shared frame for every signed-in student page.
//   exam: the focused header used on the assessment briefing (no main navigation)
//   bare: no navigation or user menu (forced password change)
export default function Shell({ children, narrow = false, bare = false, exam = false }) {
  const { user, logout } = useStudent();
  const { pathname } = useLocation();
  const [leaving, setLeaving] = useState(false);

  async function signOut() {
    if (leaving) return;

    setLeaving(true);
    await logout();
  }

  return (
    <div className="shell">
      <a className="skip" href="#main">Skip to content</a>

      <header className="topbar">
        <div className="topbar__inner">
          <Brand />

          {exam ? <span className="topbar__title">CareerConnect · Online assessment</span> : null}

          {!bare && user && !exam ? (
            <nav className="topnav" aria-label="Main">
              {LINKS.map(({ to, label, icon: Icon, end }) => (
                <NavLink key={to} to={to} end={end} className={({ isActive }) => (isActive ? "topnav__link is-active" : "topnav__link")}>
                  <Icon size={16} aria-hidden="true" />
                  <span>{label}</span>
                </NavLink>
              ))}
            </nav>
          ) : null}

          {!bare && user ? (
            <div className="topbar__user">
              {exam ? <span className="secure-badge"><ShieldCheck size={15} aria-hidden="true" /> Secure session</span> : null}
              <span className="topbar__who">
                <span className="topbar__name">{user.name}</span>
                <span className="topbar__id">{user.applicationNo}</span>
              </span>
              <span className="avatar" aria-hidden="true">{initials(user.name)}</span>
              <button type="button" className="btn btn--outline btn--sm" onClick={signOut} disabled={leaving}>
                <LogOut size={15} aria-hidden="true" />
                <span>{leaving ? "Signing out…" : "Sign out"}</span>
              </button>
            </div>
          ) : null}
        </div>
      </header>

      <main className={narrow ? "page page--narrow" : "page"} id="main" tabIndex={-1}>
        {!bare && !exam && pathname !== "/" && pathname !== "/submitted" ? (
          <BackLink fallback="/" label="Back" iconOnly mobileOnly />
        ) : null}
        {children}
      </main>

      <footer className="footer"><strong>WM CareerConnect</strong> · {TAGLINE}</footer>
    </div>
  );
}
