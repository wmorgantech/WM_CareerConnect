import { AlertTriangle, ArrowLeft, CheckCircle2, Info, Inbox } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";

export function Spinner({ label = "Loading…" }) {
  return (
    <div className="state" role="status" aria-live="polite">
      <span className="spinner" aria-hidden="true" />
      <p className="muted">{label}</p>
    </div>
  );
}

export function ErrorState({ title = "Something went wrong", message, onRetry }) {
  return (
    <div className="state state--error" role="alert">
      <AlertTriangle size={26} aria-hidden="true" />
      <h2>{title}</h2>
      {message ? <p className="muted">{message}</p> : null}
      {onRetry ? (
        <button type="button" className="btn btn--outline" onClick={onRetry}>
          Try again
        </button>
      ) : null}
    </div>
  );
}

export function EmptyState({ title, children }) {
  return (
    <div className="state">
      <Inbox size={26} aria-hidden="true" />
      <h2>{title}</h2>
      {children ? <p className="muted">{children}</p> : null}
    </div>
  );
}

const NOTICE_ICON = { info: Info, ok: CheckCircle2, warn: AlertTriangle, error: AlertTriangle };

export function Notice({ tone = "info", children, role }) {
  const Icon = NOTICE_ICON[tone];

  return (
    <p className={`notice notice--${tone}`} role={role ?? (tone === "error" ? "alert" : "status")}>
      <Icon size={17} aria-hidden="true" />
      <span>{children}</span>
    </p>
  );
}

// Back control. It goes to the previous screen only when that screen is inside this app (React Router
// numbers its history entries from 0 on first load); otherwise it follows `fallback`, an in-app route,
// so it can never leave the portal or land on a blank page. The link itself always points at the fallback.
export function BackLink({ fallback = "/", label = "Back", iconOnly = false, mobileOnly = false }) {
  const navigate = useNavigate();
  const classes = ["btn", "btn--ghost", "btn--sm", "backlink", mobileOnly ? "backlink--mobile" : "", iconOnly ? "" : "backlink--text"].filter(Boolean).join(" ");

  function onClick(event) {
    if ((window.history.state?.idx ?? 0) > 0) {
      event.preventDefault();
      navigate(-1);
    }
  }

  return (
    <Link className={classes} to={fallback} onClick={onClick} aria-label={iconOnly ? label : undefined}>
      <ArrowLeft size={18} aria-hidden="true" />
      {iconOnly ? null : <span>{label}</span>}
    </Link>
  );
}

export function PageHeader({ title, subtitle, children }) {
  return (
    <header className="pagehead">
      <div>
        <h1>{title}</h1>
        {subtitle ? <p className="muted">{subtitle}</p> : null}
      </div>
      {children ? <div className="pagehead__actions">{children}</div> : null}
    </header>
  );
}

const PILL_TONE = { neutral: "pill", info: "pill pill--info", ok: "pill pill--ok", warn: "pill pill--warn", muted: "pill pill--muted" };

export function Pill({ tone = "neutral", children }) {
  return <span className={PILL_TONE[tone] ?? PILL_TONE.neutral}>{children}</span>;
}

export function Field({ id, label, error, hint, children }) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {children}
      {hint && !error ? <p className="field__hint" id={`${id}-hint`}>{hint}</p> : null}
      {error ? <p className="field__error" id={`${id}-error`}>{error}</p> : null}
    </div>
  );
}

// Numbered step indicator for the registration flow.
export function Steps({ steps, current }) {
  return (
    <ol className="steps" aria-label="Registration progress">
      {steps.map((label, i) => (
        <li key={label} className={i < current ? "is-done" : i === current ? "is-current" : ""} aria-current={i === current ? "step" : undefined}>
          <span className="steps__dot" aria-hidden="true">{i < current ? <CheckCircle2 size={15} /> : i + 1}</span>
          {label}
        </li>
      ))}
    </ol>
  );
}

export function Facts({ items }) {
  return (
    <dl className="facts">
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
