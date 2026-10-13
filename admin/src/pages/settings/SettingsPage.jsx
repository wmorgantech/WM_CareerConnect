import { useCallback, useEffect, useState } from "react";

import { settingsApi } from "../../api/modules.api.js";
import ErrorState from "../../components/feedback/ErrorState.jsx";
import LoadingState from "../../components/feedback/LoadingState.jsx";
import { TextAreaField, TextField } from "../../components/ui/Field.jsx";
import PageHeader from "../../components/ui/PageHeader.jsx";
import { useToast } from "../../components/ui/Toast.jsx";
import { useForm } from "../../hooks/useForm.js";
import { getErrorMessage, isAbortError } from "../../utils/errors.js";
import { CANNOT_CLEAR, EMAIL_PATTERN, changedPayload, clearedKeys } from "../../utils/forms.js";
import { formatDateTime, isHttpUrl } from "../../utils/format.js";

const KEYS = ["companyName", "companyEmail", "companyPhone", "companyAddress", "logoUrl", "timezone"];

function validTimeZone(value) {
  try {
    new Intl.DateTimeFormat("en", { timeZone: value });

    return true;
  } catch {
    return false;
  }
}

function SettingsForm({ saved, onSaved }) {
  const toast = useToast();

  const form = useForm({
    initialValues: Object.fromEntries(KEYS.map((key) => [key, saved[key] ?? ""])),
    validate(values) {
      const errors = {};
      const trim = (key) => values[key].trim();

      if (trim("companyName").length > 200) errors.companyName = "Company name must not exceed 200 characters.";
      if (trim("companyEmail") && !EMAIL_PATTERN.test(trim("companyEmail"))) errors.companyEmail = "Enter a valid email address.";
      if (trim("companyPhone") && (trim("companyPhone").length < 7 || trim("companyPhone").length > 30)) errors.companyPhone = "Phone must be 7 to 30 characters.";
      if (trim("companyAddress").length > 500) errors.companyAddress = "Address must not exceed 500 characters.";

      if (trim("logoUrl") && !isHttpUrl(trim("logoUrl"))) errors.logoUrl = "Enter a link starting with http:// or https://.";
      else if (trim("logoUrl").length > 1000) errors.logoUrl = "Link must not exceed 1000 characters.";

      if (!trim("timezone")) errors.timezone = "Timezone is required.";
      else if (!validTimeZone(trim("timezone"))) errors.timezone = "Enter a valid timezone, for example Asia/Kolkata.";

      clearedKeys(saved, values, KEYS).forEach((key) => {
        errors[key] = errors[key] ?? CANNOT_CLEAR;
      });

      return errors;
    },
    async onSubmit(values) {
      const body = changedPayload(saved, values, KEYS);

      if (Object.keys(body).length === 0) {
        return;
      }

      onSaved(await settingsApi.update(body));
      toast.success("Settings saved");
    },
  });

  const { values, setValue, errors } = form;

useEffect(() => {
    if (!form.dirty) {
      return undefined;
    }

    const warn = (event) => {
      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", warn);

    return () => window.removeEventListener("beforeunload", warn);
  }, [form.dirty]);

  return (
    <form className="panel formpanel" onSubmit={form.handleSubmit} noValidate>
      {form.formError ? (
        <p className="notice notice--error" role="alert">
          {form.formError}
        </p>
      ) : null}

      <div className="row2">
        <TextField label="Company name" name="companyName" value={values.companyName} onChange={setValue} error={errors.companyName} maxLength={200} />
        <TextField label="Company email" name="companyEmail" value={values.companyEmail} onChange={setValue} error={errors.companyEmail} type="email" />
      </div>
      <div className="row2">
        <TextField label="Company phone" name="companyPhone" value={values.companyPhone} onChange={setValue} error={errors.companyPhone} type="tel" maxLength={30} />
        <TextField label="Logo link" name="logoUrl" value={values.logoUrl} onChange={setValue} error={errors.logoUrl} type="url" placeholder="https://" maxLength={1000} />
      </div>
      <TextAreaField label="Company address" name="companyAddress" value={values.companyAddress} onChange={setValue} error={errors.companyAddress} rows={3} maxLength={500} />
      <TextField
        label="Timezone"
        name="timezone"
        value={values.timezone}
        onChange={setValue}
        error={errors.timezone}
        required
        hint="Stored setting. The Admin console always shows times in IST."
        maxLength={100}
      />

      <div className="formpanel__foot">
        <span className="muted">{form.dirty ? "You have unsaved changes." : "All changes saved."}</span>
        <button type="submit" className="btn btn--primary" disabled={form.submitting || !form.dirty}>
          {form.submitting ? "Saving…" : "Save settings"}
        </button>
      </div>
    </form>
  );
}

export default function SettingsPage() {
  const [state, setState] = useState({ phase: "loading", saved: null, error: null });
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();

    setState((current) => ({ ...current, phase: "loading", error: null }));

    settingsApi
      .get(controller.signal)
      .then((saved) => setState({ phase: "ready", saved, error: null }))
      .catch((error) => {
        if (!isAbortError(error)) setState({ phase: "error", saved: null, error });
      });

    return () => controller.abort();
  }, [reloadKey]);

  const handleSaved = useCallback((saved) => setState({ phase: "ready", saved, error: null }), []);

  return (
    <div>
      <PageHeader title="Settings" description="Company details shared across the platform." />

      {state.phase === "loading" ? <LoadingState label="Loading settings…" /> : null}
      {state.phase === "error" ? <ErrorState title="Couldn't load settings" message={getErrorMessage(state.error)} onRetry={() => setReloadKey((k) => k + 1)} /> : null}

      {state.phase === "ready" ? (
        <>
          <p className="panel__note">{state.saved.updatedAt ? `Last saved ${formatDateTime(state.saved.updatedAt)} IST` : "Nothing has been saved yet — showing defaults."}</p>
          {}
          <SettingsForm key={state.saved.updatedAt ?? "defaults"} saved={state.saved} onSaved={handleSaved} />
        </>
      ) : null}
    </div>
  );
}
