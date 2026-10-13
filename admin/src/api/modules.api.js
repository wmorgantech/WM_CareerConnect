import { apiDownload, apiRequest } from "./client.js";
import { buildQuery, normalizeItem, normalizeList } from "./normalize.js";
import { createResource } from "./resources.js";

export const usersApi = {
  ...createResource("/users", { listKey: "users", itemKey: "user" }),

async setStatus(id, status) {
    return normalizeItem(
      await apiRequest(`/users/${encodeURIComponent(id)}/status`, {
        method: "PATCH",
        body: { status },
      }),
      "user",
    );
  },
};

export async function listRoles(signal) {
  return normalizeList(await apiRequest("/roles", { signal })).items;
}

export const collegesApi = createResource("/colleges");

export const drivesApi = createResource("/drives");

export const candidatesApi = createResource("/candidates");

export const interviewsApi = {
  ...createResource("/interviews"),

async interviewers(params = {}, signal) {
    return normalizeList(
      await apiRequest(`/interviews/interviewers${buildQuery(params)}`, { signal }),
    ).items;
  },

async submitFeedback(id, body) {
    return normalizeItem(
      await apiRequest(`/interviews/${encodeURIComponent(id)}/feedback`, {
        method: "POST",
        body,
      }),
    );
  },

async unlockFeedback(id) {
    return normalizeItem(
      await apiRequest(`/interviews/${encodeURIComponent(id)}/feedback/unlock`, {
        method: "POST",
      }),
    );
  },
};

export const reportsApi = {
  async list(params, signal) {
    return normalizeList(await apiRequest(`/reports${buildQuery(params)}`, { signal }));
  },

  exportCsv(params) {
    return apiDownload(`/reports/export${buildQuery(params)}`);
  },
};

export const settingsApi = {
  async get(signal) {
    return normalizeItem(await apiRequest("/settings", { signal }));
  },

  async update(body) {
    return normalizeItem(await apiRequest("/settings", { method: "PATCH", body }));
  },
};

export const auditApi = {
  async list(params, signal) {
    return normalizeList(await apiRequest(`/audit-logs${buildQuery(params)}`, { signal }), "logs");
  },
};

export const questionsApi = {
  ...createResource("/questions"),

async summary(signal) {
    return normalizeItem(await apiRequest("/questions/summary", { signal }));
  },

importTemplate() {
    return apiDownload("/questions/import/template");
  },

async importCsv(csv, { dryRun, activate = false }) {
    return normalizeItem(await apiRequest(`/questions/import?dryRun=${dryRun ? "true" : "false"}&activate=${activate ? "true" : "false"}`, { method: "POST", body: csv }));
  },

async setStatus(id, isActive) {
    return normalizeItem(
      await apiRequest(`/questions/${encodeURIComponent(id)}/status`, { method: "PATCH", body: { isActive } }),
    );
  },
};

export const templatesApi = {
  async list(signal) {
    return normalizeList(await apiRequest("/test-templates", { signal })).items;
  },

  async get(id, signal) {
    return normalizeItem(await apiRequest(`/test-templates/${encodeURIComponent(id)}`, { signal }));
  },

  async create(body) {
    return normalizeItem(await apiRequest("/test-templates", { method: "POST", body }));
  },

  async update(id, body) {
    return normalizeItem(await apiRequest(`/test-templates/${encodeURIComponent(id)}`, { method: "PATCH", body }));
  },

  async setStatus(id, isActive) {
    return normalizeItem(
      await apiRequest(`/test-templates/${encodeURIComponent(id)}/status`, { method: "PATCH", body: { isActive } }),
    );
  },

  async remove(id) {
    await apiRequest(`/test-templates/${encodeURIComponent(id)}`, { method: "DELETE" });
  },

async capacity(id, signal) {
    return normalizeItem(await apiRequest(`/test-templates/${encodeURIComponent(id)}/capacity`, { signal }));
  },
};

export const driveConfigApi = {
  async get(id, signal) {
    return normalizeItem(await apiRequest(`/drives/${encodeURIComponent(id)}/config`, { signal }));
  },

async update(id, body) {
    return normalizeItem(await apiRequest(`/drives/${encodeURIComponent(id)}/config`, { method: "PATCH", body }));
  },

  async setTemplate(id, level, templateId) {
    return normalizeItem(
      await apiRequest(`/drives/${encodeURIComponent(id)}/templates/${level}`, { method: "PUT", body: { templateId } }),
    );
  },

  async removeTemplate(id, level) {
    return normalizeItem(await apiRequest(`/drives/${encodeURIComponent(id)}/templates/${level}`, { method: "DELETE" }));
  },

  async assignCoordinator(id, userId) {
    return normalizeItem(
      await apiRequest(`/drives/${encodeURIComponent(id)}/coordinators`, { method: "PUT", body: { userId } }),
    );
  },

  async unassignCoordinator(id, userId) {
    return normalizeItem(
      await apiRequest(`/drives/${encodeURIComponent(id)}/coordinators/${encodeURIComponent(userId)}`, { method: "DELETE" }),
    );
  },

async templateOptions(signal) {
    return normalizeList(await apiRequest("/drives/template-options", { signal })).items;
  },

  async coordinatorCandidates(signal) {
    return normalizeList(await apiRequest("/drives/coordinator-candidates", { signal })).items;
  },
};

export const studentsApi = {
  async myDrives(signal) {
    return normalizeList(await apiRequest("/applications/my-drives", { signal })).items;
  },

async list(params = {}, signal) {
    return normalizeList(await apiRequest(`/applications${buildQuery(params)}`, { signal }));
  },

async register(body) {
    return normalizeItem(await apiRequest("/applications", { method: "POST", body }));
  },

  async verify(id) {
    return normalizeItem(await apiRequest(`/applications/${encodeURIComponent(id)}/verify`, { method: "POST" }));
  },

async setStatus(id, body) {
    return normalizeItem(await apiRequest(`/applications/${encodeURIComponent(id)}/status`, { method: "PATCH", body }));
  },

async bulkStatus(body) {
    return normalizeItem(await apiRequest("/applications/bulk-status", { method: "POST", body }));
  },

async issueCredential(id) {
    return normalizeItem(await apiRequest(`/applications/${encodeURIComponent(id)}/credential`, { method: "POST" }));
  },
};

export const resultsApi = {

  async list(params = {}, signal) {
    const response = await apiRequest(`/results${buildQuery(params)}`, { signal });

    return { ...normalizeList(response), summary: response?.summary ?? null };
  },

async ranking(params = {}, signal) {
    return apiRequest(`/results/ranking${buildQuery(params)}`, { signal });
  },

  async get(applicationId, signal) {
    return normalizeItem(await apiRequest(`/results/${encodeURIComponent(applicationId)}`, { signal }));
  },

  exportCsv(params = {}) {
    return apiDownload(`/results/export${buildQuery(params)}`);
  },
};

// Read-only placement views for the HOD and STAFF portals. The backend applies the college scope.
const PLACEMENT_PATHS = { assessment: "assessment", interviews: "interviews", final: "final" };

export const placementApi = {
  async overview(params = {}, signal) {
    return normalizeItem(await apiRequest(`/results/placement/overview${buildQuery(params)}`, { signal }));
  },

  async list(view, params = {}, signal) {
    return normalizeList(await apiRequest(`/results/placement/${PLACEMENT_PATHS[view]}${buildQuery(params)}`, { signal }));
  },
};

export const userCollegesApi = {
  async get(userId, signal) {
    return normalizeList(await apiRequest(`/users/${encodeURIComponent(userId)}/colleges`, { signal })).items;
  },

  async set(userId, collegeIds) {
    return normalizeList(
      await apiRequest(`/users/${encodeURIComponent(userId)}/colleges`, { method: "PUT", body: { collegeIds } }),
    ).items;
  },
};
