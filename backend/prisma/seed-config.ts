

export type DemoUserTemplate = {
  email: string;
  name: string;
  role: string;
  defaultPassword: string;
};

export type DemoUser = {
  email: string;
  name: string;
  role: string;
  password: string;
};

const MIN_PASSWORD_LENGTH = 8;

export function shouldSeedDemoUsers(
  env: NodeJS.ProcessEnv,
): boolean {
  if (env.NODE_ENV === "production") {
    return env.SEED_DEMO_USERS === "true";
  }

  return env.SEED_DEMO_USERS !== "false";
}

export function resolveDemoUsers(
  templates: DemoUserTemplate[],
  env: NodeJS.ProcessEnv,
): DemoUser[] {
  const isProduction = env.NODE_ENV === "production";

  return templates.map((template) => {
    const emailKey = `SEED_${template.role}_EMAIL`;
    const passwordKey = `SEED_${template.role}_PASSWORD`;

    const email = (env[emailKey]?.trim() || template.email).toLowerCase();

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new Error(`${emailKey} is not a valid email address`);
    }

    const configuredPassword = env[passwordKey];

    if (!configuredPassword && isProduction) {
      throw new Error(
        `${passwordKey} must be set to seed demo users in production`,
      );
    }

    const password = configuredPassword || template.defaultPassword;

    if (password.length < MIN_PASSWORD_LENGTH) {
      throw new Error(
        `${passwordKey} must be at least ${MIN_PASSWORD_LENGTH} characters`,
      );
    }

    return {
      email,
      name: template.name,
      role: template.role,
      password,
    };
  });
}
