

const clean = (value) => (typeof value === "string" ? value.trim() : value);

export function compactPayload(values, keys) {
  const body = {};

  keys.forEach((key) => {
    const value = clean(values[key]);

    if (value !== "" && value !== undefined && value !== null) {
      body[key] = value;
    }
  });

  return body;
}

export function changedPayload(original, values, keys) {
  const body = {};

  keys.forEach((key) => {
    const value = clean(values[key]);
    const before = original?.[key];

    if (typeof value === "string") {
      if (value !== "" && value !== (before ?? "")) {
        body[key] = value;
      }
    } else if (value !== before) {
      body[key] = value;
    }
  });

  return body;
}

export function clearedKeys(original, values, keys) {
  return keys.filter(
    (key) => String(original?.[key] ?? "").trim() !== "" && clean(values[key]) === "",
  );
}

export const CANNOT_CLEAR = "A saved value can be changed but not removed. Enter a new value.";

export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
