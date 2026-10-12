import { apiRequest } from "./api.js";
import { normalizeItem, normalizeList, toQuery } from "./normalize.js";
import { createResourceService } from "./resource.service.js";

const interviewsService = createResourceService("/interviews");

// GET /interviews/interviewers (interviews.schedule): active users with the
// INTERVIEWER role, for the scheduling form. Resolves with
// [{ id, name, email }]. `params`: { search, limit }.
export async function listInterviewers(params = {}) {
  const { items } = normalizeList(
    await apiRequest(`/interviews/interviewers${toQuery(params)}`),
  );

  return items;
}

// POST /interviews/:id/feedback (interviews.feedback; the assigned
// interviewer, interview COMPLETED, feedback not locked).
// Body: { feedback: 1-5000 chars, score: integer 0-100 }. Submitting locks
// the feedback. Resolves with the updated interview.
export async function submitFeedback(id, { feedback, score }) {
  return normalizeItem(
    await apiRequest(`/interviews/${encodeURIComponent(id)}/feedback`, {
      method: "POST",
      body: JSON.stringify({ feedback, score }),
    }),
  );
}

// POST /interviews/:id/feedback/unlock: only an active SUPER_ADMIN (checked
// by the API against the database). Resolves with the updated interview.
export async function unlockFeedback(id) {
  return normalizeItem(
    await apiRequest(
      `/interviews/${encodeURIComponent(id)}/feedback/unlock`,
      { method: "POST" },
    ),
  );
}

export default interviewsService;
