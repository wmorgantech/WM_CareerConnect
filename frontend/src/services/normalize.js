// Normalizes the backend's response shapes so screens never depend on
// which module they talk to.
//
// List responses seen today:
//   colleges, drives, candidates, interviews, reports, audit logs
//        { data: [...], pagination: {...} }
//   users { data: { users: [...], pagination: {...} } }
// Single-item responses:
//   most modules   { data: {...} }
//   users          { data: { user: {...} } }

const DEFAULT_LIMIT = 20;

function toPositiveInt(value, fallback) {
  const number = Number(value);

  return Number.isInteger(number) && number > 0 ? number : fallback;
}

export function normalizePagination(raw, itemCount = 0) {
  const page = toPositiveInt(raw?.page, 1);
  const limit = toPositiveInt(raw?.limit, DEFAULT_LIMIT);

  const rawTotal = Number(raw?.total);
  const total =
    raw?.total !== undefined &&
    raw?.total !== null &&
    Number.isFinite(rawTotal) &&
    rawTotal >= 0
      ? rawTotal
      : itemCount;

  // The audit-log endpoint reports 0 pages for an empty result; the UI
  // always shows at least one page.
  const totalPages = Math.max(
    1,
    toPositiveInt(raw?.totalPages, Math.ceil(total / limit) || 1),
  );

  return { page, limit, total, totalPages };
}

export function normalizeList(response, { listKey } = {}) {
  const payload = response?.data;
  let items = [];
  let rawPagination = response?.pagination;

  if (Array.isArray(payload)) {
    items = payload;
  } else if (payload && typeof payload === "object") {
    const key =
      listKey && Array.isArray(payload[listKey])
        ? listKey
        : Object.keys(payload).find((name) =>
            Array.isArray(payload[name]),
          );

    if (key) {
      items = payload[key];
    }

    rawPagination = rawPagination ?? payload.pagination;
  }

  return {
    items,
    pagination: normalizePagination(rawPagination, items.length),
  };
}

export function normalizeItem(response, { itemKey } = {}) {
  const payload = response?.data ?? null;

  if (
    itemKey &&
    payload &&
    typeof payload === "object" &&
    itemKey in payload
  ) {
    return payload[itemKey];
  }

  return payload;
}

// Builds "?a=1&b=2" from an object, skipping undefined, null and empty
// strings. Returns "" when nothing remains.
export function buildQuery(params = {}) {
  const search = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") {
      return;
    }

    search.set(key, String(value));
  });

  const query = search.toString();

  return query ? `?${query}` : "";
}

// Accepts either a ready-made query string (legacy callers) or an object.
export function toQuery(params) {
  if (typeof params === "string") {
    return params && !params.startsWith("?") ? `?${params}` : params;
  }

  return buildQuery(params);
}
