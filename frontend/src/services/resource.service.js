import { apiRequest } from "./api.js";
import { normalizeItem, normalizeList, toQuery } from "./normalize.js";

// Creates a CRUD service for a backend resource and normalizes its
// responses:
//   list(params)  -> { items, pagination: { page, limit, total, totalPages } }
//   get(id)       -> the item
//   create(data)  -> the created item
//   update(id, d) -> the updated item
//   remove(id)    -> the removed item, or null when the API returns none
//
// `params` for list is an object (empty values are dropped) or, for older
// callers, a ready-made query string.
//
// Options for modules whose payload is wrapped in a named key:
//   listKey  e.g. "users"  ({ data: { users: [...] } })
//   itemKey  e.g. "user"   ({ data: { user: {...} } })
export function createResourceService(
  endpoint,
  { listKey, itemKey } = {},
) {
  const listOptions = listKey ? { listKey } : {};
  const itemOptions = itemKey ? { itemKey } : {};
  const path = (id) => `${endpoint}/${encodeURIComponent(id)}`;

  return {
    list: async (params = {}) =>
      normalizeList(
        await apiRequest(`${endpoint}${toQuery(params)}`),
        listOptions,
      ),

    get: async (id) =>
      normalizeItem(await apiRequest(path(id)), itemOptions),

    create: async (data) =>
      normalizeItem(
        await apiRequest(endpoint, {
          method: "POST",
          body: JSON.stringify(data),
        }),
        itemOptions,
      ),

    update: async (id, data) =>
      normalizeItem(
        await apiRequest(path(id), {
          method: "PATCH",
          body: JSON.stringify(data),
        }),
        itemOptions,
      ),

    remove: async (id) =>
      normalizeItem(
        await apiRequest(path(id), { method: "DELETE" }),
        itemOptions,
      ),
  };
}
