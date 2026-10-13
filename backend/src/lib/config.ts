// Start-up checks for the environment. Nothing here prints a secret value: a problem names the
// variable and the rule it broke, never its content.

export type ConfigReport = { errors: string[]; warnings: string[] };

const MIN_SECRET_LENGTH = 32;

function secretProblems(name: string, value: string | undefined): string[] {
  if (!value) return [`${name} is not set`];
  if (value.length < MIN_SECRET_LENGTH) return [`${name} must be at least ${MIN_SECRET_LENGTH} characters`];

  return [];
}

export function checkConfig(env: NodeJS.ProcessEnv = process.env): ConfigReport {
  const production = env.NODE_ENV === "production";
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!env.DATABASE_URL) errors.push("DATABASE_URL is not set");

  const access = env.JWT_ACCESS_SECRET;
  const refresh = env.JWT_REFRESH_SECRET;
  const secrets = [...secretProblems("JWT_ACCESS_SECRET", access), ...secretProblems("JWT_REFRESH_SECRET", refresh)];

  if (production) {
    errors.push(...secrets);

    if (access && refresh && access === refresh) errors.push("JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must be different");
  } else {
    // In development a missing or short secret is only a warning, so a fresh checkout still starts.
    warnings.push(...secrets);
  }

  const origins = (env.WEB_ORIGIN ?? "").split(",").map((o) => o.trim()).filter(Boolean);

  if (production) {
    if (origins.length === 0) errors.push("WEB_ORIGIN must list the Admin and Student Portal origins in production");

    for (const origin of origins) {
      if (!/^https:\/\//i.test(origin)) warnings.push(`WEB_ORIGIN contains a non-HTTPS origin (${origin}); use HTTPS in production`);
    }

    if (!env.TRUST_PROXY) warnings.push("TRUST_PROXY is not set; behind a reverse proxy, rate limits and client IPs will be wrong");
  }

  return { errors, warnings };
}

// Connection pool size for PostgreSQL. 20 comfortably serves a few hundred concurrent students
// (each request holds a connection only briefly) and stays below PostgreSQL's default of 100.
export function dbPoolMax(env: NodeJS.ProcessEnv = process.env): number {
  const parsed = Number(env.DB_POOL_MAX);

  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 100 ? parsed : 20;
}
