
export const API_URL = (
  import.meta.env.VITE_API_URL || "http://localhost:5000/api/v1"
).replace(/\/+$/, "");

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

let accessToken = null;

let generation = 0;

let handlers = { onRefreshed: null, onExpired: null };

export function getAccessToken() {
  return accessToken;
}

export function setAccessToken(token) {
  accessToken = token;
}

export function clearSession() {
  generation += 1;
  accessToken = null;
}

export function setSessionHandlers(next) {
  handlers = { ...handlers, ...next };

  return () => {
    handlers = { onRefreshed: null, onExpired: null };
  };
}

function clientName() {
  const path = typeof window === "undefined" ? "/" : window.location.pathname;

  if (path === "/hod" || path.startsWith("/hod/")) return "hod";
  if (path === "/staff" || path.startsWith("/staff/")) return "staff-portal";

  return "admin";
}

function expireSession() {
  clearSession();

  try {
    handlers.onExpired?.();
  } catch {
    return;
  }
}

async function send(endpoint, options, token, responseType = "json") {
  const { body, headers, ...rest } = options;
  let response;
  let text;

  try {
    response = await fetch(`${API_URL}${endpoint}`, {
      ...rest,
      credentials: "include",
      headers: {

"X-WM-Client": clientName(),
        Accept: responseType === "blob" ? "*/*" : "application/json",

        ...(body !== undefined ? { "Content-Type": typeof body === "string" ? "text/csv" : "application/json" } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...headers,
      },
      body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
    });

    if (responseType === "blob" && response.ok) {
      return {
        blob: await response.blob(),

        filename: parseFilename(response.headers.get("content-disposition")),
        contentType: response.headers.get("content-type"),
      };
    }

    text = await response.text();
  } catch (error) {
    if (error?.name === "AbortError") {
      throw error;
    }

    throw new ApiError(
      "Unable to reach the server. Check your connection and try again.",
      { status: 0, code: "NETWORK_ERROR" },
    );
  }

  let data = null;
  let parsed = true;

  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      parsed = false;
    }
  }

  if (!response.ok) {
    const backendError = data?.error;

    throw new ApiError(backendError?.message || "Something went wrong.", {
      status: response.status,
      code: backendError?.code ?? null,
      details: backendError?.details ?? null,
    });
  }

  if (!parsed) {
    throw new ApiError("The server returned an unexpected response.", {
      status: response.status,
      code: "INVALID_RESPONSE",
    });
  }

  return data;
}

let refreshPromise = null;

async function runRefresh() {
  const startGeneration = generation;
  const response = await send("/auth/refresh", { method: "POST" }, null);
  const authData = response?.data;

  if (!authData?.accessToken || !authData?.user) {
    throw new ApiError("The server returned an unexpected response.", {
      code: "INVALID_RESPONSE",
    });
  }

  if (startGeneration !== generation) {
    throw new ApiError("Session ended.", {
      status: 401,
      code: "SESSION_ENDED",
    });
  }

  accessToken = authData.accessToken;
  handlers.onRefreshed?.(authData);

  return authData;
}

export function refreshSession() {
  if (!refreshPromise) {
    refreshPromise = runRefresh().finally(() => {
      refreshPromise = null;
    });
  }

  return refreshPromise;
}

function parseFilename(contentDisposition) {
  if (!contentDisposition) {
    return null;
  }

  const match = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(contentDisposition);

  if (!match) {
    return null;
  }

  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}

export function apiRequest(endpoint, options = {}) {
  return requestWithRefresh(endpoint, options, "json");
}

export function apiDownload(endpoint, options = {}) {
  return requestWithRefresh(endpoint, options, "blob");
}

async function requestWithRefresh(endpoint, options, responseType) {
  const usedToken = accessToken;

  try {
    return await send(endpoint, options, usedToken, responseType);
  } catch (error) {
    const path = endpoint.split("?")[0];

    if (
      !(error instanceof ApiError) ||
      error.status !== 401 ||
      NO_REFRESH_ENDPOINTS.has(path)
    ) {
      throw error;
    }

    let nextToken;

    if (accessToken && accessToken !== usedToken) {

      nextToken = accessToken;
    } else {
      try {
        nextToken = (await refreshSession()).accessToken;
      } catch (refreshError) {
        if (refreshError?.status === 401) {
          expireSession();

          throw error;
        }

        throw refreshError;
      }
    }

    return send(endpoint, options, nextToken, responseType);
  }
}
