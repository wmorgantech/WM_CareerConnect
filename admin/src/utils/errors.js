const DEFAULT_MESSAGE = "Something went wrong. Please try again.";

export function getErrorMessage(error, fallback = DEFAULT_MESSAGE) {
  return error?.message || fallback;
}

export function getFieldErrors(error) {
  const fieldErrors = error?.details?.fieldErrors;

  if (!fieldErrors || typeof fieldErrors !== "object") {
    return {};
  }

  return Object.entries(fieldErrors).reduce((result, [field, value]) => {
    const message = Array.isArray(value) ? value[0] : value;

    if (typeof message === "string" && message) {
      result[field] = message;
    }

    return result;
  }, {});
}

export function isAbortError(error) {
  return error?.name === "AbortError";
}
