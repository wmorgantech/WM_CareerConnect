import { apiRequest } from "./client.js";

export function loginRequest(email, password) {
  return apiRequest("/auth/login", {
    method: "POST",
    body: { email, password },
  });
}

export function logoutRequest() {
  return apiRequest("/auth/logout", { method: "POST" });
}
