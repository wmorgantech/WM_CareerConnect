import { apiRequest } from "./api.js";
import { normalizeList } from "./normalize.js";

// GET /roles (users.manage): role choices for the Users form.
// Resolves with [{ id, name, description }].
export async function getRoles() {
  const { items } = normalizeList(await apiRequest("/roles"));

  return items;
}
