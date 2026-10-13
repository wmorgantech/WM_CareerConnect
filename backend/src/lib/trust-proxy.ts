

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
