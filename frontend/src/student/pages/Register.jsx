import { useRef, useState } from "react";
import { CheckCircle2, Eye, EyeOff } from "lucide-react";
import { Link, Navigate } from "react-router-dom";

import { studentApi } from "../api.js";
import { useStudent } from "../auth.jsx";
import AuthLayout from "../components/AuthLayout.jsx";
import { BackLink, Field, Notice, Steps } from "../ui.jsx";

const QUALIFICATIONS = ["BCA", "B.Sc CS", "B.Sc IT", "B.E/B.Tech", "MCA", "M.Sc CS", "M.Sc IT", "Other"];
const EMPTY = { name: "", email: "", mobile: "", level: "", qualification: "", department: "", city: "", passingYear: "", password: "", again: "", consent: false };
const STEPS = ["Access code", "Your details", "Done"];

// First problem found for each field, in the same words the server uses.
function validate(v, year) {
  const e = {};
  const mobile = v.mobile.replace(/[\s-]/g, "").replace(/^(\+91|91|0)(?=\d{10}$)/, "");
  const local = v.email.split("@")[0].toLowerCase();

  if (v.name.trim().length < 2) e.name = "Enter your full name.";
  if (!/^\S+@\S+\.\S+$/.test(v.email.trim())) e.email = "Enter a valid email address.";
  if (!/^[6-9]\d{9}$/.test(mobile)) e.mobile = "Enter a valid 10-digit mobile number.";
  if (!v.level) e.level = "Choose your level.";
  if (v.passingYear && (!/^\d{4}$/.test(v.passingYear) || Number(v.passingYear) < year - 15 || Number(v.passingYear) > year + 5)) e.passingYear = `Enter a year between ${year - 15} and ${year + 5}.`;
  if (v.password.length < 8 || !/[A-Za-z]/.test(v.password) || !/\d/.test(v.password)) e.password = "Use at least 8 characters, with letters and numbers.";
  else if (local.length >= 4 && v.password.toLowerCase().includes(local)) e.password = "Do not use your email address in your password.";
  if (v.again !== v.password) e.again = "The two passwords do not match.";
  if (!v.consent) e.consent = "Please accept to continue.";

  return e;
}

export default function Register() {
  const { status } = useStudent();
  const [code, setCode] = useState("");
  const [drive, setDrive] = useState(null); // { title, college, levels }
  const [codeError, setCodeError] = useState("");
  const [values, setValues] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);
  const [show, setShow] = useState(false);
  const [done, setDone] = useState(null); // { loginId, drive }
  const submitting = useRef(false);
  const year = new Date().getFullYear();

  if (status === "signedIn") return <Navigate to="/" replace />;

  const set = (key) => (event) => setValues((v) => ({ ...v, [key]: event.target.value }));
  const step = done ? 2 : drive ? 1 : 0;

  async function findDrive(event) {
    event.preventDefault();

    if (busy) return;

    setCodeError("");
    setBusy(true);

    try {
      const found = await studentApi.registrationDrive(code.trim());

      setDrive(found);
      setValues((v) => ({ ...v, level: found.levels.length === 1 ? found.levels[0] : "" }));
    } catch (e) {
      setCodeError(e.details?.fieldErrors?.code?.[0] ?? e.message);
    } finally {
      setBusy(false);
    }
  }

  async function submit(event) {
    event.preventDefault();

    if (submitting.current) return;

    const found = validate(values, year);

    setErrors(found);
    setFormError("");

    if (Object.keys(found).length > 0) return;

    submitting.current = true;
    setBusy(true);

    try {
      const optional = (key) => (values[key].trim() ? { [key]: values[key].trim() } : {});
      const result = await studentApi.register({
        accessCode: code.trim(),
        name: values.name.trim(),
        email: values.email.trim(),
        mobile: values.mobile.trim(),
        level: values.level,
        password: values.password,
        consent: true,
        ...optional("qualification"),
        ...optional("department"),
        ...optional("city"),
        ...(values.passingYear ? { passingYear: Number(values.passingYear) } : {}),
      });

      setValues(EMPTY); // the password never lingers in state after success
      setDone(result);
    } catch (e) {
      const fields = e.details?.fieldErrors ?? {};
      const shown = Object.entries(fields).filter(([k]) => k in EMPTY);

      if (shown.length > 0) {
        setErrors(Object.fromEntries(shown.map(([k, msgs]) => [k, msgs[0]])));
      } else {
        setFormError(Object.values(fields)[0]?.[0] ?? e.message);
      }
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }

  if (done) {
    return (
      <AuthLayout wide>
        <BackLink fallback="/login" label="Back to sign in" iconOnly mobileOnly />
        <section className="card card--form stack" aria-labelledby="done-title">
          <Steps steps={STEPS} current={step} />
          <div className="center stack">
            <CheckCircle2 size={42} className="okicon" aria-hidden="true" />
            <h1 id="done-title">You are registered</h1>
            <p className="muted">Your login ID for <strong>{done.drive}</strong></p>
          </div>
          <strong className="loginid">{done.loginId}</strong>
          <Notice tone="info">Save this ID. You will sign in with it and the password you just chose.</Notice>
          <div>
            <h2>What happens next</h2>
            <ol className="nextlist">
              <li>Your campus coordinator checks your identity.</li>
              <li>Once they confirm it, sign in with your login ID and password.</li>
              <li>Until then, signing in will tell you that your registration is waiting for verification.</li>
            </ol>
          </div>
          <Link className="btn btn--primary btn--block" to="/login">Go to sign in</Link>
        </section>
      </AuthLayout>
    );
  }

  if (!drive) {
    return (
      <AuthLayout>
        <BackLink fallback="/login" label="Back to sign in" iconOnly mobileOnly />
        <form className="card card--form stack" onSubmit={findDrive} noValidate aria-labelledby="reg-title">
          <Steps steps={STEPS} current={step} />
          <div>
            <h1 id="reg-title">Register for a drive</h1>
            <p className="muted">Enter the access code your campus coordinator gave you. It is six letters and numbers.</p>
          </div>

          {codeError ? <Notice tone="error">{codeError}</Notice> : null}

          <Field id="code" label="Access code" hint="For example K7M2QX. Capital letters are applied for you.">
            <input
              id="code"
              className="input--code"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase().replace(/\s+/g, ""))}
              maxLength={12}
              autoCapitalize="characters"
              autoComplete="off"
              spellCheck={false}
              autoFocus
              disabled={busy}
              aria-invalid={Boolean(codeError)}
              aria-describedby={codeError ? undefined : "code-hint"}
            />
          </Field>

          <button type="submit" className="btn btn--primary btn--block" disabled={busy || !code.trim()}>{busy ? "Checking…" : "Continue"}</button>
        </form>
        <p className="auth__help">Already registered? <Link className="link" to="/login">Sign in</Link></p>
      </AuthLayout>
    );
  }

  const text = (key, label, props = {}, hint) => (
    <Field id={key} label={label} error={errors[key]} hint={hint}>
      <input id={key} value={values[key]} onChange={set(key)} disabled={busy} aria-invalid={Boolean(errors[key])} aria-describedby={errors[key] ? `${key}-error` : hint ? `${key}-hint` : undefined} {...props} />
    </Field>
  );

  return (
    <AuthLayout wide>
      <BackLink fallback="/login" label="Back to sign in" iconOnly mobileOnly />
      <form className="card card--form stack" onSubmit={submit} noValidate aria-labelledby="reg-title">
        <Steps steps={STEPS} current={step} />
        <div>
          <h1 id="reg-title">Create your registration</h1>
          <p className="muted">
            {drive.title}
            {drive.college ? ` · ${drive.college}` : ""}
          </p>
        </div>

        {formError ? <Notice tone="error">{formError}</Notice> : null}

        <section className="formsection" aria-labelledby="sec-personal">
          <h2 id="sec-personal">Personal details</h2>
          <div className="formgrid">
            {text("name", "Full name", { autoComplete: "name" })}
            {text("email", "Email address", { type: "email", autoComplete: "email", inputMode: "email" })}
            {text("mobile", "Mobile number", { type: "tel", autoComplete: "tel", inputMode: "tel" }, "10 digits")}
          </div>
        </section>

        <section className="formsection" aria-labelledby="sec-academic">
          <h2 id="sec-academic">Academic details</h2>
          <div className="formgrid">
            <Field id="level" label="Level" error={errors.level}>
              <select id="level" value={values.level} onChange={set("level")} disabled={busy} aria-invalid={Boolean(errors.level)}>
                {drive.levels.length > 1 ? <option value="">Choose…</option> : null}
                {drive.levels.map((l) => (
                  <option key={l} value={l}>{l === "UG" ? "UG (undergraduate)" : "PG (postgraduate)"}</option>
                ))}
              </select>
            </Field>
            <Field id="qualification" label="Qualification (optional)">
              <select id="qualification" value={values.qualification} onChange={set("qualification")} disabled={busy}>
                <option value="">Choose…</option>
                {QUALIFICATIONS.map((q) => (<option key={q} value={q}>{q}</option>))}
              </select>
            </Field>
            {text("department", "Department (optional)")}
            {text("city", "City (optional)")}
            {text("passingYear", "Year of passing (optional)", { inputMode: "numeric", maxLength: 4 })}
          </div>
        </section>

        <section className="formsection" aria-labelledby="sec-security">
          <h2 id="sec-security">Create your password</h2>
          <div className="formgrid">
            <Field id="password" label="Password" error={errors.password} hint="At least 8 characters, with letters and numbers.">
              <div className="inputwrap">
                <input id="password" type={show ? "text" : "password"} value={values.password} onChange={set("password")} autoComplete="new-password" disabled={busy} aria-invalid={Boolean(errors.password)} aria-describedby={errors.password ? "password-error" : "password-hint"} />
                <button type="button" className="inputwrap__btn" onClick={() => setShow((v) => !v)} aria-label={show ? "Hide passwords" : "Show passwords"} aria-pressed={show}>
                  {show ? <EyeOff size={17} aria-hidden="true" /> : <Eye size={17} aria-hidden="true" />}
                </button>
              </div>
            </Field>
            <Field id="again" label="Password again" error={errors.again}>
              <input id="again" type={show ? "text" : "password"} value={values.again} onChange={set("again")} autoComplete="new-password" disabled={busy} aria-invalid={Boolean(errors.again)} aria-describedby={errors.again ? "again-error" : undefined} />
            </Field>
          </div>
        </section>

        <div className="field">
          <label className="check">
            <input type="checkbox" checked={values.consent} onChange={(e) => setValues((v) => ({ ...v, consent: e.target.checked }))} disabled={busy} aria-invalid={Boolean(errors.consent)} />
            <span>I agree that WM CareerConnect may use these details for this recruitment drive.</span>
          </label>
          {errors.consent ? <p className="field__error">{errors.consent}</p> : null}
        </div>

        <button type="submit" className="btn btn--primary btn--block" disabled={busy}>{busy ? "Registering…" : "Register"}</button>
        <button type="button" className="btn btn--ghost btn--block" onClick={() => setDrive(null)} disabled={busy}>Use a different access code</button>
      </form>
    </AuthLayout>
  );
}
