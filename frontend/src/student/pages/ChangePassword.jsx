import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";

import { studentApi } from "../api.js";
import { useStudent } from "../auth.jsx";
import Shell from "../components/Shell.jsx";
import { Field, Notice } from "../ui.jsx";

export default function ChangePassword() {
  const { markPasswordChanged, user } = useStudent();
  const navigate = useNavigate();
  const forced = Boolean(user?.mustChangePassword);
  const [values, setValues] = useState({ current: "", next: "", again: "" });
  const [show, setShow] = useState(false);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);

  const set = (key) => (event) => setValues((v) => ({ ...v, [key]: event.target.value }));

  async function submit(event) {
    event.preventDefault();

    if (busy) return;

    const found = {};

    if (!values.current) found.current = "Enter your current password.";
    if (values.next.length < 8 || !/[A-Za-z]/.test(values.next) || !/\d/.test(values.next)) found.next = "Use at least 8 characters, with letters and numbers.";
    if (values.again !== values.next) found.again = "The two new passwords do not match.";

    setErrors(found);
    setFormError("");

    if (Object.keys(found).length > 0) return;

    setBusy(true);

    try {
      await studentApi.changePassword(values.current, values.next);
      markPasswordChanged();
      navigate("/", { replace: true });
    } catch (e) {
      const fields = e.details?.fieldErrors ?? {};

      if (fields.currentPassword || fields.newPassword) {
        setErrors({ current: fields.currentPassword?.[0], next: fields.newPassword?.[0] });
      } else {
        setFormError(e.message);
      }
    } finally {
      setBusy(false);
    }
  }

  const type = show ? "text" : "password";

  return (
    <Shell narrow bare={forced}>
      <form className="card card--form stack" onSubmit={submit} noValidate aria-labelledby="pw-title">
        <div>
          <h1 id="pw-title">{forced ? "Choose a new password" : "Change your password"}</h1>
          <p className="muted">{forced ? "For your security, replace the temporary password before you continue." : "You will stay signed in on this device."}</p>
        </div>

        {formError ? <Notice tone="error">{formError}</Notice> : null}

        <Field id="current" label={forced ? "Temporary password" : "Current password"} error={errors.current}>
          <input id="current" type={type} value={values.current} onChange={set("current")} autoComplete="current-password" disabled={busy} aria-invalid={Boolean(errors.current)} />
        </Field>
        <Field id="next" label="New password" error={errors.next} hint="At least 8 characters, with letters and numbers. Do not use your login ID.">
          <input id="next" type={type} value={values.next} onChange={set("next")} autoComplete="new-password" disabled={busy} aria-invalid={Boolean(errors.next)} />
        </Field>
        <Field id="again" label="New password again" error={errors.again}>
          <input id="again" type={type} value={values.again} onChange={set("again")} autoComplete="new-password" disabled={busy} aria-invalid={Boolean(errors.again)} />
        </Field>

        <label className="check">
          <input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} />
          <span>{show ? <EyeOff size={15} aria-hidden="true" /> : <Eye size={15} aria-hidden="true" />} Show passwords</span>
        </label>

        <button type="submit" className="btn btn--primary btn--block" disabled={busy}>{busy ? "Saving…" : forced ? "Save and continue" : "Change password"}</button>
        {!forced ? <Link className="btn btn--ghost btn--block" to="/profile">Cancel</Link> : null}
      </form>
    </Shell>
  );
}
