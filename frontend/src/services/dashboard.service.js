import { apiRequest } from "./api";

export async function getDashboardStats() {
  const response = await apiRequest("/dashboard/stats");

  return response.data;
}

// Interviewer overview. GET /interviews is scoped by the backend to the
// signed-in interviewer's own interviews (requires interviews.feedback or
// interviews.schedule). Returns first-page items (limit 100, soonest first)
// and the true totals from `pagination.total`.
export async function getInterviewerOverview() {
  const [scheduled, completed] = await Promise.all([
    apiRequest("/interviews?status=SCHEDULED&limit=100"),
    apiRequest("/interviews?status=COMPLETED&limit=100"),
  ]);

  return {
    scheduled: {
      items: Array.isArray(scheduled?.data) ? scheduled.data : [],
      total: scheduled?.pagination?.total ?? null,
    },
    completed: {
      items: Array.isArray(completed?.data) ? completed.data : [],
      total: completed?.pagination?.total ?? null,
    },
  };
}
