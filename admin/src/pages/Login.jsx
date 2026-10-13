import { useRef, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { Eye, EyeOff, ShieldCheck, TriangleAlert } from "lucide-react";

import { PORTALS } from "../config/navigation.js";
import { useAuth } from "../hooks/useAuth.js";
import { getErrorMessage, getFieldErrors } from "../utils/errors.js";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function safeTarget(from, portal) {
  const path = from?.pathname;
  const fallback = PORTALS[portal].home ?? "/";
  const base = PORTALS[portal].base;

  if (typeof path !== "string" || !path.startsWith("/") || path.startsWith("//")) {
    return fallback;
  }

if (base && !(path === base || path.startsWith(`${base}/`))) {
    return fallback;
  }

  if (path === "/login" || path === PORTALS[portal].loginPath) {
    return fallback;
  }

  return `${path}${from.search ?? ""}${from.hash ?? ""}`;
}

const COPY = {
  admin: {
    product: "CareerConnect Admin",
    lead: "Administration console for campus recruitment: colleges, drives, students, assessments and interviews in one place.",
    sub: "Use your WM CareerConnect staff account.",
  },
  hod: {
    product: "CareerConnect HOD portal",
    lead: "Assessment results for the students of your college.",
    sub: "Sign in with your HOD account.",
  },
  staff: {
    product: "CareerConnect Staff portal",
    lead: "Assessment results for the students of your college.",
    sub: "Sign in with your Staff account.",
  },
};

export default function Login({ portal = "admin" }) {
  const copy = COPY[portal];
  const { isAuthenticated, status, login } = useAuth();
  const location = useLocation();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);

const submittingRef = useRef(false);

  if (isAuthenticated) {
    return <Navigate to={safeTarget(location.state?.from, portal)} replace />;
  }

  const expired = Boolean(location.state?.expired);

  function validate() {
    const errors = {};

    if (!email.trim()) {
      errors.email = "Enter your email address.";
    } else if (!EMAIL_PATTERN.test(email.trim())) {
      errors.email = "Enter a valid email address.";
    }

    if (!password) {
      errors.password = "Enter your password.";
    }

    return errors;
  }

  async function handleSubmit(event) {
    event.preventDefault();

    if (submittingRef.current) {
      return;
    }

    const errors = validate();

    setFieldErrors(errors);
    setFormError("");

    if (Object.keys(errors).length > 0) {
      return;
    }

    submittingRef.current = true;
    setSubmitting(true);

    try {
      await login(email.trim(), password);
    } catch (error) {
      const serverFieldErrors = getFieldErrors(error);

      if (Object.keys(serverFieldErrors).length > 0) {
        setFieldErrors(serverFieldErrors);
      } else {
        setFormError(getErrorMessage(error));
      }

setPassword("");
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  return (
    <div className="signin">
      <aside className="signin__brand">
        <img
          className="brand-logo brand-logo--large"
          src="/assets/logo/wm-morgan-logo.png"
          alt="W Morgan Technologies"
        />
        <h1 className="signin__product">{copy.product}</h1>
        <p className="signin__lead">{copy.lead}</p>
        <p className="signin__note">
          <ShieldCheck size={16} aria-hidden="true" />
          Authorised staff only. Access is controlled by your role.
        </p>
      </aside>

      <main className="signin__panel">
        <form className="signin__form" onSubmit={handleSubmit} noValidate>
          <h2 className="signin__title">Sign in</h2>
          <p className="signin__sub">{copy.sub}</p>

          {expired && !formError ? (
            <p className="notice notice--warn" role="status">
              Your session has ended. Sign in again to continue.
            </p>
          ) : null}

          {formError ? (
            <p className="notice notice--error" role="alert">
              <TriangleAlert size={16} aria-hidden="true" />
              <span>{formError}</span>
            </p>
          ) : null}

          <div className="field">
            <label htmlFor="email">Email address</label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="username"
              autoFocus
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              aria-invalid={Boolean(fieldErrors.email)}
              aria-describedby={fieldErrors.email ? "email-error" : undefined}
              disabled={submitting}
            />
            {fieldErrors.email ? (
              <p className="field__error" id="email-error">
                {fieldErrors.email}
              </p>
            ) : null}
          </div>

          <div className="field">
            <label htmlFor="password">Password</label>
            <div className="field__control">
              <input
                id="password"
                name="password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                aria-invalid={Boolean(fieldErrors.password)}
                aria-describedby={fieldErrors.password ? "password-error" : undefined}
                disabled={submitting}
              />
              <button
                type="button"
                className="field__toggle"
                onClick={() => setShowPassword((value) => !value)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                aria-pressed={showPassword}
              >
                {showPassword ? (
                  <EyeOff size={17} aria-hidden="true" />
                ) : (
                  <Eye size={17} aria-hidden="true" />
                )}
              </button>
            </div>
            {fieldErrors.password ? (
              <p className="field__error" id="password-error">
                {fieldErrors.password}
              </p>
            ) : null}
          </div>

          <button
            type="submit"
            className="btn btn--primary btn--block"
            disabled={submitting || status === "loading"}
          >
            {submitting ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </main>
    </div>
  );
}
