import { apiRequest } from "./api.js";
import { normalizeItem } from "./normalize.js";

// Both resolve with the settings object.
export async function getSettings() {
  return normalizeItem(await apiRequest("/settings"));
}

export async function updateSettings(settings) {
  return normalizeItem(
    await apiRequest("/settings", {
      method: "PATCH",
      body: JSON.stringify(settings),
    }),
  );
}
