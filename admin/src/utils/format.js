

const IST_OFFSET_MS = 330 * 60 * 1000;
const IST = "Asia/Kolkata";

function toDate(value) {
  if (!value) {
    return null;
  }

  const date = new Date(value);

  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatDateTime(value) {
  const date = toDate(value);

  return date
    ? new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: IST }).format(date)
    : "—";
}

export function formatDate(value) {
  const date = toDate(value);

  return date
    ? new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeZone: IST }).format(date)
    : "—";
}

export function toIstDateTimeInput(value) {
  const date = toDate(value);

  return date ? new Date(date.getTime() + IST_OFFSET_MS).toISOString().slice(0, 16) : "";
}

export function fromIstDateTimeInput(local) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(local ?? "")) {
    return null;
  }

  const date = new Date(`${local}:00+05:30`);

  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function toIstDateInput(value) {
  const date = toDate(value);

  return date ? new Date(date.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10) : "";
}

export function fromIstDateInput(day) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day ?? "")) {
    return null;
  }

  const date = new Date(`${day}T00:00:00+05:30`);

  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function shortId(id) {
  const text = String(id ?? "");

  return text.length > 12 ? `${text.slice(0, 8)}…` : text;
}

export function isHttpUrl(value) {
  try {
    const url = new URL(value);

    return (url.protocol === "http:" || url.protocol === "https:") && url.hostname.length > 0;
  } catch {
    return false;
  }
}

export function saveBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
