import { useEffect, useId, useRef, useState } from "react";

import { getErrorInfo } from "../../utils/errors.js";
import {
  buildPayload,
  getInitialValues,
  validateValues,
} from "../../utils/formValidation.js";
import Button from "./Button.jsx";
import Input from "./Input.jsx";
import Modal from "./Modal.jsx";
import Select from "./Select.jsx";
import Textarea from "./Textarea.jsx";

// Modal form driven by a field configuration (see utils/formValidation.js).
//
//   <FormModal
//     open={open}
//     title="Add college"
//     fields={collegeFields}
//     initialValues={editing}              // omit to create
//     onSubmit={(payload) => collegesService.create(payload)}
//     onClose={() => setOpen(false)}
//   />
//
// - Validation runs on submit; errors appear beside their fields and focus
//   moves to the first invalid one.
// - Backend validation errors (400 with details.fieldErrors) are mapped to
//   the same fields. Errors for fields that are not in the form, and
//   non-validation errors, appear in a banner above the form.
// - While `onSubmit` runs the button shows a spinner, the fields are
//   disabled and the dialog cannot be dismissed. When it resolves the dialog
//   closes via `onClose`; when it rejects the dialog stays open.
// - The form state starts fresh each time the dialog opens.
export default function FormModal({ open, ...props }) {
  if (!open) {
    return null;
  }

  return <FormModalBody {...props} />;
}

function FormModalBody({
  title,
  fields,
  initialValues,
  onSubmit,
  onClose,
  validate,
  omitEmpty = true,
  submitLabel = "Save",
  submittingLabel = "Saving…",
  cancelLabel = "Cancel",
  size = "md",
}) {
  const formId = useId();
  const formRef = useRef(null);
  // Synchronous guard against a second submit before the next render.
  const submittingRef = useRef(false);

  const [values, setValues] = useState(() =>
    getInitialValues(fields, initialValues),
  );
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [focusToken, setFocusToken] = useState(0);

  useEffect(() => {
    if (focusToken > 0) {
      formRef.current
        ?.querySelector('[aria-invalid="true"]')
        ?.focus();
    }
  }, [focusToken]);

  function setValue(name, value) {
    setValues((current) => ({ ...current, [name]: value }));

    setErrors((current) => {
      if (!current[name]) {
        return current;
      }

      const next = { ...current };
      delete next[name];

      return next;
    });
  }

  function toggleOption(name, optionValue) {
    const current = values[name] ?? [];

    setValue(
      name,
      current.includes(optionValue)
        ? current.filter((item) => item !== optionValue)
        : [...current, optionValue],
    );
  }

  async function handleSubmit(event) {
    event.preventDefault();

    if (submittingRef.current) {
      return;
    }

    const clientErrors = validateValues(fields, values, validate);

    if (Object.keys(clientErrors).length > 0) {
      setErrors(clientErrors);
      setFormError("");
      setFocusToken((token) => token + 1);

      return;
    }

    submittingRef.current = true;
    setSubmitting(true);
    setErrors({});
    setFormError("");

    try {
      await onSubmit(buildPayload(fields, values, { omitEmpty }), values);
      onClose?.();
    } catch (error) {
      submittingRef.current = false;
      const info = getErrorInfo(error);
      const known = new Set(fields.map((field) => field.name));
      const fieldErrors = {};
      const unmatched = [];

      Object.entries(info.fieldErrors).forEach(([name, message]) => {
        if (known.has(name)) {
          fieldErrors[name] = message;
        } else {
          unmatched.push(`${name}: ${message}`);
        }
      });

      const hasFieldErrors = Object.keys(fieldErrors).length > 0;
      const lines = [
        ...(hasFieldErrors ? [] : [info.message]),
        ...info.formErrors,
        ...unmatched,
      ];

      setErrors(fieldErrors);
      setFormError(lines.join(" "));
      setSubmitting(false);

      if (hasFieldErrors) {
        setFocusToken((token) => token + 1);
      }
    }
  }

  function renderField(field) {
    const common = {
      id: `${formId}-${field.name}`,
      name: field.name,
      label: field.label,
      required: field.required,
      error: errors[field.name],
      hint: field.hint,
      disabled: field.disabled || submitting,
    };

    switch (field.type) {
      case "custom":
        return field.render({
          ...common,
          value: values[field.name],
          onChange: (next) => setValue(field.name, next),
          values,
        });

      case "textarea":
        return (
          <Textarea
            {...common}
            maxLength={field.maxLength}
            onChange={(event) => setValue(field.name, event.target.value)}
            placeholder={field.placeholder}
            rows={field.rows}
            value={values[field.name]}
          />
        );

      case "select":
        return (
          <Select
            {...common}
            onChange={(event) => setValue(field.name, event.target.value)}
            value={values[field.name]}
          >
            <option value="">
              {field.placeholder || "Select an option"}
            </option>
            {(field.options ?? []).map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        );

      case "checkbox":
        return (
          <div>
            <label className="flex min-h-11 items-center gap-3 text-sm text-gray-700">
              <input
                aria-describedby={
                  errors[field.name] ? `${common.id}-message` : undefined
                }
                aria-invalid={errors[field.name] ? true : undefined}
                checked={Boolean(values[field.name])}
                className="h-4 w-4 accent-[#1B3A1E]"
                disabled={common.disabled}
                id={common.id}
                name={field.name}
                onChange={(event) =>
                  setValue(field.name, event.target.checked)
                }
                type="checkbox"
              />
              {field.label}
            </label>
            {errors[field.name] && (
              <p
                className="text-xs text-[#D32F2F]"
                id={`${common.id}-message`}
              >
                {errors[field.name]}
              </p>
            )}
          </div>
        );

      case "multiselect":
        return (
          <fieldset
            aria-describedby={
              errors[field.name] ? `${common.id}-message` : undefined
            }
          >
            <legend className="mb-2 text-sm font-medium text-gray-700">
              {field.label}
              {field.required && (
                <span aria-hidden="true" className="ml-0.5 text-[#D32F2F]">
                  *
                </span>
              )}
            </legend>
            <div className="grid gap-1 sm:grid-cols-2">
              {(field.options ?? []).map((option, index) => (
                <label
                  className="flex min-h-11 items-center gap-3 text-sm text-gray-700"
                  key={option.value}
                >
                  <input
                    aria-invalid={
                      index === 0 && errors[field.name] ? true : undefined
                    }
                    checked={(values[field.name] ?? []).includes(
                      option.value,
                    )}
                    className="h-4 w-4 accent-[#1B3A1E]"
                    disabled={common.disabled}
                    onChange={() => toggleOption(field.name, option.value)}
                    type="checkbox"
                    value={option.value}
                  />
                  {option.label}
                </label>
              ))}
            </div>
            {errors[field.name] ? (
              <p
                className="mt-1 text-xs text-[#D32F2F]"
                id={`${common.id}-message`}
              >
                {errors[field.name]}
              </p>
            ) : (
              field.hint && (
                <p className="mt-1 text-xs text-gray-500">{field.hint}</p>
              )
            )}
          </fieldset>
        );

      default:
        return (
          <Input
            {...common}
            autoComplete={field.autoComplete}
            inputMode={field.inputMode}
            max={field.max}
            maxLength={field.maxLength}
            min={field.min}
            onChange={(event) => setValue(field.name, event.target.value)}
            placeholder={field.placeholder}
            step={field.step}
            type={field.type || "text"}
            value={values[field.name]}
          />
        );
    }
  }

  return (
    <Modal
      closeDisabled={submitting}
      footer={
        <>
          <Button
            disabled={submitting}
            onClick={onClose}
            variant="secondary"
          >
            {cancelLabel}
          </Button>
          <Button form={formId} loading={submitting} type="submit">
            {submitting ? submittingLabel : submitLabel}
          </Button>
        </>
      }
      onClose={onClose}
      size={size}
      title={title}
    >
      <form
        id={formId}
        noValidate
        onSubmit={handleSubmit}
        ref={formRef}
      >
        {formError && (
          <p
            className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-[#D32F2F]"
            role="alert"
          >
            {formError}
          </p>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          {fields.map((field) => (
            <div
              className={field.width === "half" ? "" : "sm:col-span-2"}
              key={field.name}
            >
              {renderField(field)}
            </div>
          ))}
        </div>
      </form>
    </Modal>
  );
}
