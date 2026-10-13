function positiveInt(value, fallback) {
  const number = Number(value);

  return Number.isInteger(number) && number > 0 ? number : fallback;
}

export function normalizePagination(raw, itemCount = 0) {
  const page = positiveInt(raw?.page, 1);
  const limit = positiveInt(raw?.limit, 20);
  const total = Number.isFinite(Number(raw?.total)) && raw?.total != null ? Number(raw.total) : itemCount;

return {
    page,
    limit,
    total,
    totalPages: Math.max(1, positiveInt(raw?.totalPages, Math.ceil(total / limit) || 1)),
  };
}

export function normalizeList(response, listKey) {
  const payload = response?.data;
  let items = [];
  let rawPagination = response?.pagination;

  if (Array.isArray(payload)) {
    items = payload;
  } else if (payload && typeof payload === "object") {
    const key =
      listKey && Array.isArray(payload[listKey])
        ? listKey
        : Object.keys(payload).find((name) => Array.isArray(payload[name]));

    items = key ? payload[key] : [];
    rawPagination = rawPagination ?? payload.pagination;
  }

  return { items, pagination: normalizePagination(rawPagination, items.length) };
}

export function normalizeItem(response, itemKey) {
  const payload = response?.data ?? null;

  return itemKey && payload && typeof payload === "object" && itemKey in payload
    ? payload[itemKey]
    : payload;
}

export function buildQuery(params = {}) {
  const search = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      search.set(key, String(value));
    }
  });

  const query = search.toString();

  return query ? `?${query}` : "";
}
