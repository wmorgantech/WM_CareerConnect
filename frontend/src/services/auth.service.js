import { apiRequest } from "./api";

export async function login(email, password) {
  return apiRequest("/auth/login", {
    method: "POST",
    body: JSON.stringify({
      email,
      password,
    }),
  });
}

export async function refreshAccessToken() {
  return apiRequest("/auth/refresh", {
    method: "POST",
  });
}

export async function logout() {
  return apiRequest("/auth/logout", {
    method: "POST",
  });
}

export async function getCurrentUser() {
  return apiRequest("/auth/me", {
    method: "GET",
  });
}