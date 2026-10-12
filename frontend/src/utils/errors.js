const DEFAULT_MESSAGE = "Something went wrong. Please try again.";

function firstMessage(value) {
  if (Array.isArray(value)) {
    return typeof value[0] === "string" ? value[0] : "";
  }

  return typeof value === "string" ? value : "";
}

// Reads backend validation details. Two shapes exist and both end in
// details.fieldErrors ({ fieldName: ["message", ...] }):
//   controllers          details: parsed.error.flatten()
//   central error handler details: { fieldErrors }
export function getFieldErrors(error) {
  const fieldErrors = error?.details?.fieldErrors;

  if (!fieldErrors || typeof fieldErrors !== "object") {
    return {};
  }

  return Object.entries(fieldErrors).reduce((result, [field, value]) => {
    const message = firstMessage(value);

    if (message) {
      result[field] = message;
    }

    return result;
  }, {});
}

export function getFormErrors(error) {
  const formErrors = error?.details?.formErrors;

  return Array.isArray(formErrors)
    ? formErrors.filter((message) => typeof message === "string")
    : [];
}

export function getErrorMessage(error, fallback = DEFAULT_MESSAGE) {
  if (typeof error === "string" && error) {
    return error;
  }

  return error?.message || fallback;
}

// One call for forms and panels.
export function getErrorInfo(error) {
  return {
    message: getErrorMessage(error),
    status: error?.status ?? 0,
    code: error?.code ?? null,
    fieldErrors: getFieldErrors(error),
    formErrors: getFormErrors(error),
    isPermissionDenied: error?.status === 403,
    isNetworkError: error?.code === "NETWORK_ERROR",
  };
}
