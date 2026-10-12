// Parses the optional TRUST_PROXY setting for Express.
//
// Unset, "false" or "0": do not trust proxy headers (correct when the API
// is reached directly, as in local development).
// A number: trust that many proxy hops in front of the API.
// Anything else: passed to Express as-is (for example "loopback" or a
// comma-separated list of proxy IPs/CIDRs).
//
// "true" is rejected on purpose: it trusts every client-supplied
// X-Forwarded-For value, which lets callers dodge IP-based rate limits.
export function parseTrustProxy(
  value: string | undefined,
): number | string | undefined {
  const trimmed = value?.trim();

  if (!trimmed) {
    return undefined;
  }

  const lower = trimmed.toLowerCase();

  if (lower === "false" || lower === "0") {
    return undefined;
  }

  if (lower === "true") {
    throw new Error(
      "TRUST_PROXY=true is not allowed. Use the number of proxy hops or a list of trusted proxy addresses.",
    );
  }

  if (/^\d+$/.test(trimmed)) {
    const hops = Number(trimmed);

    if (hops > 10) {
      throw new Error("TRUST_PROXY hop count must be between 1 and 10");
    }

    return hops;
  }

  return trimmed;
}
