

export const API_URL = (import.meta.env.VITE_API_URL || "http://localhost:5000/api/v1").replace(/\/+$/, "");

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
let onExpired = null;

export function setAccessToken(token) {
  accessToken = token;
}

export function clearSession() {
  generation += 1;
  accessToken = null;
}

export function setExpiredHandler(handler) {
  onExpired = handler;
}

async function send(path, { method = "GET", body, signal } = {}, token) {
  let response;
  let text;

  try {
    response = await fetch(`${API_URL}${path}`, {
      method,
      credentials: "include",
      signal,
      cache: "no-store",
      headers: {
        Accept: "application/json",
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    text = await response.text();
  } catch (error) {
    if (error?.name === "AbortError") throw error;

    throw new ApiError("Can't reach the server. Check your connection.", { status: 0, code: "NETWORK_ERROR" });
  }

  let data = null;

  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }

  if (!response.ok) {
    throw new ApiError(data?.error?.message || "Something went wrong.", {
      status: response.status,
      code: data?.error?.code ?? null,
      details: data?.error?.details ?? null,
    });
  }

  return data;
}

const NO_REFRESH = new Set(["/candidate/auth/login", "/candidate/auth/refresh", "/candidate/auth/logout"]);

let refreshing = null;

export function refreshSession() {
  if (!refreshing) {
    const started = generation;

    refreshing = send("/candidate/auth/refresh", { method: "POST" })
      .then((response) => {
        if (started !== generation) throw new ApiError("Session ended.", { status: 401, code: "SESSION_ENDED" });

        accessToken = response.data.accessToken;

        return response.data;
      })
      .finally(() => {
        refreshing = null;
      });
  }

  return refreshing;
}

export async function request(path, options = {}) {
  const used = accessToken;

  try {
    return await send(path, options, used);
  } catch (error) {
    if (!(error instanceof ApiError) || error.status !== 401 || NO_REFRESH.has(path)) throw error;

    try {
      const next = accessToken && accessToken !== used ? accessToken : (await refreshSession()).accessToken;

      return await send(path, options, next);
    } catch (refreshError) {
      if (refreshError?.status === 401) {
        clearSession();
        onExpired?.();
      }

      throw refreshError instanceof ApiError && refreshError.status === 401 ? error : refreshError;
    }
  }
}

export const studentApi = {
  login: (loginId, password) => send("/candidate/auth/login", { method: "POST", body: { loginId, password } }),
  logout: () => send("/candidate/auth/logout", { method: "POST" }),
  // Public self-registration: no token, nothing is signed in by it.
  registrationDrive: (code) => send(`/candidate/registration/drive?code=${encodeURIComponent(code)}`).then((r) => r.data),
  register: (body) => send("/candidate/registration", { method: "POST", body }).then((r) => r.data),
  changePassword: (currentPassword, newPassword) =>
    request("/candidate/auth/change-password", { method: "POST", body: { currentPassword, newPassword } }),
  me: (signal) => request("/candidate/me", { signal }).then((r) => r.data),
  interviews: (signal) => request("/candidate/interviews", { signal }).then((r) => r.data),
  assessment: (signal) => request("/candidate/assessment", { signal }).then((r) => r.data),
  start: (termsVersion) =>
    request("/candidate/attempts/start", { method: "POST", body: { termsVersion, accepted: true } }).then((r) => r.data),
  current: (signal) => request("/candidate/attempts/current", { signal }).then((r) => r.data),
  saveAnswers: (attemptId, answers) =>
    request(`/candidate/attempts/${encodeURIComponent(attemptId)}/answers`, { method: "PATCH", body: { answers } }).then((r) => r.data),
  event: (attemptId, event) =>
    request(`/candidate/attempts/${encodeURIComponent(attemptId)}/events`, { method: "POST", body: event }).then((r) => r.data),
  submit: (attemptId) =>
    request(`/candidate/attempts/${encodeURIComponent(attemptId)}/submit`, { method: "POST", body: { confirm: true } }).then((r) => r.data),
};
