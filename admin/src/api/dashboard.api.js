import { apiRequest } from "./client.js";

export function dashboardStatsRequest(signal) {
  return apiRequest("/dashboard/stats", { signal });
}
