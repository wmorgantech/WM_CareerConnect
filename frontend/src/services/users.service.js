import { apiRequest } from "./api.js";
import { normalizeItem } from "./normalize.js";
import { createResourceService } from "./resource.service.js";

const options = { listKey: "users", itemKey: "user" };

const usersService = {
  ...createResourceService("/users", options),

  // PATCH /users/:id/status  { status: "ACTIVE" | "INACTIVE" }
  updateStatus: async (id, status) =>
    normalizeItem(
      await apiRequest(`/users/${encodeURIComponent(id)}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      }),
      { itemKey: options.itemKey },
    ),
};

export default usersService;
