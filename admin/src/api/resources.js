import { apiRequest } from "./client.js";
import { buildQuery, normalizeItem, normalizeList } from "./normalize.js";

export function createResource(endpoint, { listKey, itemKey } = {}) {
  const path = (id) => `${endpoint}/${encodeURIComponent(id)}`;

  return {
    async list(params = {}, signal) {
      return normalizeList(
        await apiRequest(`${endpoint}${buildQuery(params)}`, { signal }),
        listKey,
      );
    },

    async get(id, signal) {
      return normalizeItem(await apiRequest(path(id), { signal }), itemKey);
    },

    async create(body) {
      return normalizeItem(
        await apiRequest(endpoint, { method: "POST", body }),
        itemKey,
      );
    },

    async update(id, body) {
      return normalizeItem(
        await apiRequest(path(id), { method: "PATCH", body }),
        itemKey,
      );
    },

    async remove(id) {
      await apiRequest(path(id), { method: "DELETE" });
    },
  };
}
