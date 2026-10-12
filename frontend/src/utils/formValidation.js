// Field-config based form helpers used by FormModal.
//
// A field is:
//   {
//     name, label,
//     type: "text" | "email" | "password" | "number" | "tel" | "url" |
//           "date" | "datetime-local" | "textarea" | "select" |
//           "checkbox" | "multiselect",
//     required, minLength, maxLength, min, max, pattern, patternMessage,
//     options: [{ value, label }]        (select, multiselect)
//     utcOffsetMinutes: 330              (datetime-local only) read and write
//                                        the value as wall-clock time in that
//                                        fixed UTC offset (330 = IST) instead
//                                        of the browser's time zone
//     render(props) -> element           (type "custom") renders the control;
//                                        props: id, name, label, required,
//                                        error, hint, disabled, value,
//                                        onChange(value), values
//     validate(value, values) -> string  (extra rule; return "" when valid)
//     format(value, values) -> any       (transform the value sent to the API)
//     placeholder, hint, disabled, width: "half"
//   }

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function pad(number) {
  return String(number).padStart(2, "0");
}

// ISO string -> value for <input type="datetime-local"> (browser local time)
export function toLocalInputValue(iso) {
  const date = new Date(iso);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate(),
  )}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

// ISO string -> "YYYY-MM-DDTHH:mm" wall-clock time at a fixed UTC offset.
export function toOffsetInputValue(iso, offsetMinutes) {
  const date = new Date(iso);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return new Date(date.getTime() + offsetMinutes * 60000)
    .toISOString()
    .slice(0, 16);
}

// "YYYY-MM-DDTHH:mm" read as wall-clock time at a fixed UTC offset -> Date.
export function fromOffsetInputValue(value, offsetMinutes) {
  if (!value) {
    return new Date(NaN);
  }

  const sign = offsetMinutes < 0 ? "-" : "+";
  const abs = Math.abs(offsetMinutes);
  const offset = `${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
  const time = value.length === 16 ? `${value}:00` : value;

  return new Date(`${time}${offset}`);
}

function defaultValueFor(field) {
  if (field.type === "multiselect") return [];
  if (field.type === "checkbox") return false;

  return "";
}

function toInputValue(field, value) {
  if (value === undefined || value === null) {
    return defaultValueFor(field);
  }

  if (field.type === "datetime-local") {
    return field.utcOffsetMinutes !== undefined
      ? toOffsetInputValue(value, field.utcOffsetMinutes)
      : toLocalInputValue(value);
  }

  if (field.type === "date") {
    return String(value).slice(0, 10);
  }

  if (field.type === "multiselect") {
    return Array.isArray(value) ? value : [];
  }

  if (field.type === "checkbox") {
    return Boolean(value);
  }

  return String(value);
}

export function getInitialValues(fields, initialValues = {}) {
  return fields.reduce((values, field) => {
    values[field.name] = toInputValue(field, initialValues[field.name]);

    return values;
  }, {});
}

function isEmptyValue(field, value) {
  if (field.type === "checkbox") return value !== true;
  if (Array.isArray(value)) return value.length === 0;

  return value === undefined || value === null || String(value).trim() === "";
}

function validateField(field, value, values) {
  const label = field.label || field.name;

  if (isEmptyValue(field, value)) {
    return field.required ? `${label} is required` : "";
  }

  if (field.type === "checkbox" || field.type === "multiselect") {
    return field.validate?.(value, values) || "";
  }

  const text = String(value).trim();

  if (field.type === "email" && !EMAIL_PATTERN.test(text)) {
    return "Please enter a valid email address";
  }

  if (field.type === "number") {
    const number = Number(text);

    if (!Number.isFinite(number)) {
      return `${label} must be a number`;
    }

    if (field.min !== undefined && number < field.min) {
      return `${label} must be at least ${field.min}`;
    }

    if (field.max !== undefined && number > field.max) {
      return `${label} must not exceed ${field.max}`;
    }
  }

  if (field.minLength !== undefined && text.length < field.minLength) {
    return `${label} must be at least ${field.minLength} characters`;
  }

  if (field.maxLength !== undefined && text.length > field.maxLength) {
    return `${label} must not exceed ${field.maxLength} characters`;
  }

  if (field.pattern && !field.pattern.test(text)) {
    return field.patternMessage || `${label} is not in the expected format`;
  }

  return field.validate?.(value, values) || "";
}

// Returns { fieldName: message } for every invalid field (empty when the
// form is valid). `validate(values)` may add cross-field errors; it never
// replaces an error a field rule already produced.
export function validateValues(fields, values, validate) {
  const errors = {};

  fields.forEach((field) => {
    const message = validateField(field, values[field.name], values);

    if (message) {
      errors[field.name] = message;
    }
  });

  const extra = validate?.(values) || {};

  Object.entries(extra).forEach(([name, message]) => {
    if (message && !errors[name]) {
      errors[name] = message;
    }
  });

  return errors;
}

// Converts form values to the API payload: strings are trimmed, numbers
// become numbers, datetime-local becomes an ISO string, and (by default)
// empty values are left out so optional fields are not sent as "".
export function buildPayload(fields, values, { omitEmpty = true } = {}) {
  const payload = {};

  fields.forEach((field) => {
    const raw = values[field.name];
    let value;

    if (field.type === "checkbox") {
      value = Boolean(raw);
    } else if (field.type === "multiselect") {
      value = Array.isArray(raw) ? raw : [];
    } else if (isEmptyValue(field, raw)) {
      value = omitEmpty ? undefined : "";
    } else if (field.type === "number") {
      value = Number(String(raw).trim());
    } else if (field.type === "datetime-local") {
      value = (
        field.utcOffsetMinutes !== undefined
          ? fromOffsetInputValue(raw, field.utcOffsetMinutes)
          : new Date(raw)
      ).toISOString();
    } else if (field.type === "password") {
      value = String(raw);
    } else {
      value = String(raw).trim();
    }

    if (field.format && value !== undefined) {
      value = field.format(value, values);
    }

    if (value !== undefined) {
      payload[field.name] = value;
    }
  });

  return payload;
}
