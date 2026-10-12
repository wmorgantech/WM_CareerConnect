import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useBlocker } from "react-router-dom";
import { Building2, Globe, RotateCcw, Save } from "lucide-react";

import Button from "../../components/common/Button.jsx";
import ConfirmDialog from "../../components/common/ConfirmDialog.jsx";
import Input from "../../components/common/Input.jsx";
import Loader from "../../components/common/Loader.jsx";
import Textarea from "../../components/common/Textarea.jsx";
import { ErrorPanel } from "../../components/dashboard/DashboardParts.jsx";
import PageHeader from "../../components/layout/PageHeader.jsx";
import { useToast } from "../../hooks/useToast.js";
import {
  getSettings,
  updateSettings,
} from "../../services/settings.service.js";
import { getErrorInfo } from "../../utils/errors.js";
import { formatDateTime } from "../../utils/formatters.js";
import { validateValues } from "../../utils/formValidation.js";

// Backend (settings.schema.ts / settings.service.ts): one global record,
// read and updated with `settings.manage` (SUPER_ADMIN only).
//   companyName     1-200       companyEmail  valid email, <=255
//   companyPhone    7-30        companyAddress <=500
//   logoUrl         URL, <=1000 timezone      1-100 (default Asia/Kolkata)
// Every field is optional on update. A value cannot be removed once set
// (empty strings are rejected), except the address, which accepts "".
// There is no versioning: the last save wins.
const KEYS = [
  "companyName",
  "companyEmail",
  "companyPhone",
  "companyAddress",
  "logoUrl",
  "timezone",
];

// Fields the API will not accept as empty once they have a value.
const CANNOT_REMOVE = new Set([
  "companyName",
  "companyEmail",
  "companyPhone",
  "logoUrl",
  "timezone",
]);

const isHttpUrl = (value) => {
  try {
    const url = new URL(value);

    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
};

function buildFields(saved) {
  return [
    { name: "companyName", label: "Company name", maxLength: 200 },
    { name: "companyEmail", label: "Company email", type: "email", maxLength: 255 },
    {
      name: "companyPhone",
      label: "Company phone",
      type: "tel",
      minLength: 7,
      maxLength: 30,
    },
    { name: "companyAddress", label: "Company address", maxLength: 500 },
    {
      name: "logoUrl",
      label: "Logo link",
      type: "url",
      maxLength: 1000,
      // Only checked when changed, so an existing unusual value can stay.
      validate: (value) =>
        value === (saved?.logoUrl ?? "") || isHttpUrl(value)
          ? ""
          : "Enter a link starting with http:// or https://",
    },
    { name: "timezone", label: "Time zone", minLength: 1, maxLength: 100 },
  ];
}

const toFormValues = (settings) =>
  Object.fromEntries(KEYS.map((key) => [key, settings?.[key] ?? ""]));

const TIME_ZONES =
  typeof Intl.supportedValuesOf === "function"
    ? Intl.supportedValuesOf("timeZone")
    : ["Asia/Kolkata", "UTC"];

function Section({ icon: Icon, title, description, children }) {
  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5">
      <h2 className="flex items-center gap-2 text-base font-semibold text-gray-900">
        <Icon aria-hidden="true" className="text-[#1B3A1E]" size={18} />
        {title}
      </h2>
      {description && (
        <p className="mt-1 text-sm text-gray-500">{description}</p>
      )}
      <div className="mt-4 grid gap-4 sm:grid-cols-2">{children}</div>
    </section>
  );
}

export default function Settings() {
  const toast = useToast();

  const [state, setState] = useState({
    saved: null,
    loading: true,
    error: null,
  });
  const [values, setValues] = useState(() => toFormValues(null));
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const leavingRef = useRef(false);
  const formRef = useRef(null);

  const load = useCallback(async () => {
    setState((current) => ({ ...current, loading: true, error: null }));

    try {
      const saved = await getSettings();

      setState({ saved, loading: false, error: null });
      setValues(toFormValues(saved));
    } catch (error) {
      setState({ saved: null, loading: false, error });
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const { saved } = state;
  const fields = useMemo(() => buildFields(saved), [saved]);

  const dirty = Boolean(
    saved &&
      KEYS.some(
        (key) => values[key].trim() !== String(saved[key] ?? "").trim(),
      ),
  );

  // ---- unsaved changes are never discarded silently
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      dirty && currentLocation.pathname !== nextLocation.pathname,
  );

  useEffect(() => {
    if (!dirty) {
      return undefined;
    }

    function warn(event) {
      event.preventDefault();
      event.returnValue = "";
    }

    window.addEventListener("beforeunload", warn);

    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  function setValue(key, value) {
    setValues((current) => ({ ...current, [key]: value }));
    setErrors((current) => {
      if (!current[key]) {
        return current;
      }

      const next = { ...current };
      delete next[key];

      return next;
    });
  }

  function discard() {
    setValues(toFormValues(saved));
    setErrors({});
    setFormError("");
  }

  function validate() {
    const found = validateValues(fields, values);

    KEYS.forEach((key) => {
      if (
        CANNOT_REMOVE.has(key) &&
        saved[key] &&
        !values[key].trim() &&
        !found[key]
      ) {
        found[key] =
          "A saved value can be changed but not removed. Enter a new value, or discard your changes.";
      }
    });

    return found;
  }

  async function handleSubmit(event) {
    event.preventDefault();

    if (savingRef.current || !dirty) {
      return;
    }

    const found = validate();

    if (Object.keys(found).length > 0) {
      setErrors(found);
      setFormError("");
      setTimeout(
        () =>
          formRef.current?.querySelector('[aria-invalid="true"]')?.focus(),
        0,
      );

      return;
    }

    // Only changed fields are sent. The address may be sent empty; no other
    // field can be, and validate() has already stopped that case.
    const changes = {};

    KEYS.forEach((key) => {
      const next = values[key].trim();

      if (next !== String(saved[key] ?? "").trim()) {
        changes[key] = next;
      }
    });

    savingRef.current = true;
    setSaving(true);
    setErrors({});
    setFormError("");

    try {
      const updated = await updateSettings(changes);

      // The server's response is the confirmed state.
      setState({ saved: updated, loading: false, error: null });
      setValues(toFormValues(updated));
      toast.success("Settings saved");
    } catch (error) {
      const info = getErrorInfo(error);
      const fieldErrors = {};
      const unmatched = [];

      Object.entries(info.fieldErrors).forEach(([name, message]) => {
        if (KEYS.includes(name)) {
          fieldErrors[name] = message;
        } else {
          unmatched.push(`${name}: ${message}`);
        }
      });

      const hasFieldErrors = Object.keys(fieldErrors).length > 0;

      setErrors(fieldErrors);
      setFormError(
        [
          ...(hasFieldErrors ? [] : [info.message]),
          ...info.formErrors,
          ...unmatched,
        ].join(" "),
      );
      toast.error(
        info.isPermissionDenied
          ? "You do not have permission to change settings."
          : hasFieldErrors
            ? "Some settings were not accepted."
            : info.message,
      );
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  if (state.loading && !saved) {
    return (
      <div>
        <PageHeader title="Settings" />
        <Loader label="Loading settings..." />
      </div>
    );
  }

  if (state.error) {
    return (
      <div>
        <PageHeader title="Settings" />
        <ErrorPanel error={state.error} onRetry={load} />
      </div>
    );
  }

  const fieldProps = (key) => ({
    id: `setting-${key}`,
    error: errors[key],
    disabled: saving,
    value: values[key],
    onChange: (event) => setValue(key, event.target.value),
  });

  return (
    <div>
      <PageHeader
        description="Company details shared across the whole organisation."
        title="Settings"
      />

      <p className="mb-4 text-xs text-gray-500">
        {saved.updatedAt
          ? `Last saved ${formatDateTime(saved.updatedAt)} IST`
          : "Not saved yet — showing defaults"}
      </p>

      <form
        className="space-y-4"
        noValidate
        onSubmit={handleSubmit}
        ref={formRef}
      >
        {formError && (
          <p
            className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-[#D32F2F]"
            role="alert"
          >
            {formError}
          </p>
        )}

        <Section
          description="Shown to staff. Saved values can be changed but not removed (the address can be cleared)."
          icon={Building2}
          title="Company profile"
        >
          <div className="sm:col-span-2">
            <Input
              {...fieldProps("companyName")}
              autoComplete="organization"
              label="Company name"
              maxLength={200}
            />
          </div>
          <Input
            {...fieldProps("companyEmail")}
            autoComplete="email"
            label="Company email"
            maxLength={255}
            type="email"
          />
          <Input
            {...fieldProps("companyPhone")}
            autoComplete="tel"
            label="Company phone"
            maxLength={30}
            type="tel"
          />
          <div className="sm:col-span-2">
            <Textarea
              {...fieldProps("companyAddress")}
              label="Company address"
              maxLength={500}
              rows={3}
            />
          </div>
          <div className="sm:col-span-2">
            <Input
              {...fieldProps("logoUrl")}
              hint="A link to the company logo image (http or https)."
              label="Logo link"
              maxLength={1000}
              placeholder="https://"
              type="url"
            />
          </div>
        </Section>

        <Section icon={Globe} title="Regional">
          <div className="sm:col-span-2">
            <Input
              {...fieldProps("timezone")}
              hint="An IANA name such as Asia/Kolkata. Stored for reference: dates in this application are currently shown in IST."
              label="Time zone"
              list="setting-timezone-options"
              maxLength={100}
            />
            <datalist id="setting-timezone-options">
              {TIME_ZONES.map((zone) => (
                <option key={zone} value={zone} />
              ))}
            </datalist>
          </div>
        </Section>

        <div className="flex flex-wrap items-center gap-3">
          <Button disabled={!dirty} loading={saving} type="submit">
            {!saving && <Save aria-hidden="true" size={18} />}
            {saving ? "Saving…" : "Save changes"}
          </Button>

          <Button
            disabled={!dirty || saving}
            onClick={discard}
            variant="secondary"
          >
            <RotateCcw aria-hidden="true" size={18} />
            Discard changes
          </Button>

          <p className="text-sm text-gray-500" role="status">
            {dirty ? "You have unsaved changes." : "All changes saved."}
          </p>
        </div>
      </form>

      <ConfirmDialog
        cancelLabel="Stay on this page"
        confirmLabel="Leave without saving"
        message="You have unsaved changes to the settings. If you leave now they will be lost."
        onCancel={() => {
          if (!leavingRef.current && blocker.state === "blocked") {
            blocker.reset();
          }
        }}
        onConfirm={() => {
          leavingRef.current = true;
          blocker.proceed();
        }}
        open={blocker.state === "blocked"}
        title="Discard unsaved changes?"
      />
    </div>
  );
}
