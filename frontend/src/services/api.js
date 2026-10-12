const API_URL =
  import.meta.env.VITE_API_URL ||
  import.meta.env.NEXT_PUBLIC_API_URL ||
  "http://localhost:5000/api/v1";

const AUTH_STORAGE_KEY = "wm_careerconnect_auth";

// Auth endpoints that must never trigger a refresh-and-retry.
const NO_REFRESH_ENDPOINTS = new Set([
  "/auth/login",
  "/auth/refresh",
  "/auth/logout",
]);

export class ApiError extends Error {
  constructor(message, { status = 0, code = null, details = null } = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

/* ---------------------------------------------------------------------------
 * Stored session
 * ------------------------------------------------------------------------ */

// Incremented whenever the session is cleared, so an in-flight refresh that
// finishes after logout/expiry does not resurrect the session.
let sessionGeneration = 0;

export function getStoredAuth() {
  try {
    const stored = localStorage.getItem(AUTH_STORAGE_KEY);

    return stored ? JSON.parse(stored) : null;
  } catch {
    try {
      localStorage.removeItem(AUTH_STORAGE_KEY);
    } catch {
      // Storage unavailable.
    }

    return null;
  }
}

export function storeAuth({ user, accessToken }) {
  try {
    localStorage.setItem(
      AUTH_STORAGE_KEY,
      JSON.stringify({ user, accessToken }),
    );
  } catch {
    // Storage unavailable; the in-memory React state still holds the session.
  }
}

export function clearStoredAuth() {
  sessionGeneration += 1;

  try {
    localStorage.removeItem(AUTH_STORAGE_KEY);
  } catch {
    // Storage unavailable.
  }
}

/* ---------------------------------------------------------------------------
 * Session callbacks (registered by AuthProvider)
 * ------------------------------------------------------------------------ */

let sessionHandlers = {
  onSessionRefreshed: null,
  onSessionExpired: null,
};

export function setAuthHandlers(handlers) {
  sessionHandlers = { ...sessionHandlers, ...handlers };

  return () => {
    sessionHandlers = {
      onSessionRefreshed: null,
      onSessionExpired: null,
    };
  };
}

export function expireSession() {
  clearStoredAuth();

  try {
    sessionHandlers.onSessionExpired?.();
  } catch {
    // A faulty callback must not break request handling.
  }
}

/* ---------------------------------------------------------------------------
 * Low-level request
 * ------------------------------------------------------------------------ */

function parseFilename(contentDisposition) {
  if (!contentDisposition) {
    return null;
  }

  const match = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(
    contentDisposition,
  );

  if (!match) {
    return null;
  }

  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}

// responseType "json" (default) parses a JSON body. "blob" returns
// { blob, filename, contentType } for successful responses (file
// downloads); error responses are always parsed as JSON.
async function sendRequest(
  endpoint,
  options,
  accessToken,
  responseType = "json",
) {
  let response;
  let responseText;

  try {
    response = await fetch(`${API_URL}${endpoint}`, {
      ...options,
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        ...(accessToken
          ? { Authorization: `Bearer ${accessToken}` }
          : {}),
        ...options.headers,
      },
    });

    if (responseType === "blob" && response.ok) {
      const blob = await response.blob();

      return {
        blob,
        // Readable cross-origin only if the API exposes the header
        // (Access-Control-Expose-Headers); callers pass a fallback name.
        filename: parseFilename(
          response.headers.get("content-disposition"),
        ),
        contentType: response.headers.get("content-type"),
      };
    }

    responseText = await response.text();
  } catch (error) {
    if (error?.name === "AbortError") {
      throw error;
    }

    throw new ApiError(
      "Unable to reach the server. Please check your connection and try again.",
      { status: 0, code: "NETWORK_ERROR" },
    );
  }

  let data = null;
  let parsed = true;

  if (responseText) {
    try {
      data = JSON.parse(responseText);
    } catch {
      parsed = false;
    }
  }

  if (!response.ok) {
    const backendError = data?.error;

    throw new ApiError(
      backendError?.message || "Something went wrong",
      {
        status: response.status,
        code: backendError?.code ?? null,
        details: backendError?.details ?? null,
      },
    );
  }

  if (!parsed) {
    throw new ApiError("The server returned an unexpected response.", {
      status: response.status,
      code: "INVALID_RESPONSE",
    });
  }

  return data;
}

/* ---------------------------------------------------------------------------
 * Single-flight refresh
 * ------------------------------------------------------------------------ */

let refreshPromise = null;

async function runRefresh() {
  const startToken = getStoredAuth()?.accessToken ?? null;
  const generation = sessionGeneration;

  try {
    const response = await sendRequest(
      "/auth/refresh",
      { method: "POST" },
      null,
    );

    const authData = response?.data;

    if (!authData?.accessToken || !authData?.user) {
      throw new ApiError("The server returned an unexpected response.", {
        status: 0,
        code: "INVALID_RESPONSE",
      });
    }

    if (generation !== sessionGeneration) {
      // Logged out or expired while the refresh was in flight.
      throw new ApiError("Session ended", {
        status: 401,
        code: "SESSION_ENDED",
      });
    }

    storeAuth(authData);
    sessionHandlers.onSessionRefreshed?.(authData);

    return authData;
  } catch (error) {
    if (error?.status === 401 && generation === sessionGeneration) {
      // Another refresh (for example in another tab) may already have
      // established a newer session. Do not treat that as a failure.
      const current = getStoredAuth();

      if (
        current?.accessToken &&
        current?.user &&
        current.accessToken !== startToken
      ) {
        sessionHandlers.onSessionRefreshed?.(current);

        return current;
      }
    }

    throw error;
  }
}

/**
 * Refreshes the session using the refresh-token cookie. Concurrent callers
 * share one in-flight request. Resolves with { user, accessToken }.
 * Only a confirmed 401 means the session is gone; other errors
 * (network, 5xx) are rethrown without touching the stored session.
 */
export function refreshSession() {
  if (!refreshPromise) {
    refreshPromise = runRefresh().finally(() => {
      refreshPromise = null;
    });
  }

  return refreshPromise;
}

/* ---------------------------------------------------------------------------
 * Public request helper
 * ------------------------------------------------------------------------ */

async function requestWithRefresh(endpoint, options, responseType) {
  const usedToken = getStoredAuth()?.accessToken ?? null;

  try {
    return await sendRequest(endpoint, options, usedToken, responseType);
  } catch (error) {
    const path = endpoint.split("?")[0];

    if (
      !(error instanceof ApiError) ||
      error.status !== 401 ||
      NO_REFRESH_ENDPOINTS.has(path)
    ) {
      throw error;
    }

    // Eligible 401: refresh once, then retry the original request once.
    const latestToken = getStoredAuth()?.accessToken ?? null;
    let nextToken;

    if (latestToken && latestToken !== usedToken) {
      // A refresh already completed after this request was sent.
      nextToken = latestToken;
    } else {
      try {
        const authData = await refreshSession();

        nextToken = authData.accessToken;
      } catch (refreshError) {
        if (refreshError?.status === 401) {
          expireSession();

          throw error;
        }

        throw refreshError;
      }
    }

    return sendRequest(endpoint, options, nextToken, responseType);
  }
}

export function apiRequest(endpoint, options = {}) {
  return requestWithRefresh(endpoint, options, "json");
}

// Downloads a file (for example text/csv) as a Blob with the same auth,
// refresh-and-retry and error handling as apiRequest.
// Resolves with { blob, filename, contentType }.
export function apiDownload(endpoint, options = {}) {
  return requestWithRefresh(endpoint, options, "blob");
}
