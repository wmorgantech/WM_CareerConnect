import { useRef, useState } from "react";
import { Eye, EyeOff, ShieldCheck } from "lucide-react";
import { Link, Navigate, useLocation } from "react-router-dom";

import { useStudent } from "../auth.jsx";
import AuthLayout from "../components/AuthLayout.jsx";
import { Field, Notice } from "../ui.jsx";

function safeTarget(from) {
  return typeof from === "string" && from.startsWith("/") && !from.startsWith("//") && from !== "/login" ? from : "/";
}

export default function Login() {
  const { status, user, login, expired } = useStudent();
  const location = useLocation();
  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);

  if (status === "signedIn") {
    return <Navigate to={user?.mustChangePassword ? "/change-password" : safeTarget(location.state?.from)} replace />;
  }

  async function submit(event) {
    event.preventDefault();

    if (submitting.current) return;

    const found = {};

    if (!loginId.trim()) found.loginId = "Enter your login ID.";
    if (!password) found.password = "Enter your password.";

    setErrors(found);
    setFormError("");

    if (Object.keys(found).length > 0) return;

    submitting.current = true;
    setBusy(true);

    try {
      await login(loginId.trim(), password);
    } catch (e) {
      setFormError(e.message);
      setPassword("");
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }

  return (
    <AuthLayout>
      <form className="card card--form stack" onSubmit={submit} noValidate aria-labelledby="signin-title">
        <div>
          <h1 id="signin-title">Welcome back</h1>
          <p className="muted">Sign in to your student portal with your login ID and password. If your coordinator gave you a temporary password, use that.</p>
        </div>

        {expired && !formError ? <Notice tone="warn">Your session ended. Please sign in again.</Notice> : null}
        {formError ? <Notice tone="error">{formError}</Notice> : null}

        <Field id="loginId" label="Login ID" error={errors.loginId} hint="For example WMC-2026-00123">
          <input
            id="loginId"
            value={loginId}
            onChange={(e) => setLoginId(e.target.value)}
            autoComplete="username"
            autoCapitalize="characters"
            spellCheck={false}
            autoFocus
            disabled={busy}
            aria-invalid={Boolean(errors.loginId)}
            aria-describedby={errors.loginId ? "loginId-error" : "loginId-hint"}
          />
        </Field>

        <Field id="password" label="Password" error={errors.password}>
          <div className="inputwrap">
            <input
              id="password"
              type={show ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              disabled={busy}
              aria-invalid={Boolean(errors.password)}
              aria-describedby={errors.password ? "password-error" : undefined}
            />
            <button type="button" className="inputwrap__btn" onClick={() => setShow((v) => !v)} aria-label={show ? "Hide password" : "Show password"} aria-pressed={show}>
              {show ? <EyeOff size={17} aria-hidden="true" /> : <Eye size={17} aria-hidden="true" />}
            </button>
          </div>
        </Field>

        <button type="submit" className="btn btn--primary btn--block" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>

        <p className="secure"><ShieldCheck size={15} aria-hidden="true" /> Your sign-in is private to you. Forgot your password? Ask your campus coordinator for a new one.</p>
      </form>

      <p className="auth__help">
        New here? <Link className="link" to="/register">Register for a drive</Link> with the access code from your campus coordinator.
      </p>
    </AuthLayout>
  );
}
