

export type DemoUserTemplate = {
  email: string;
  name: string;
  role: string;
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
    return false;
  }

  return env.SEED_DEMO_USERS !== "false";
}

export function resolveDemoUsers(
  templates: DemoUserTemplate[],
  env: NodeJS.ProcessEnv,
): DemoUser[] {
  return templates.map((template) => {
    const emailKey = `SEED_${template.role}_EMAIL`;
    const passwordKey = `SEED_${template.role}_PASSWORD`;

    const email = (env[emailKey]?.trim() || template.email).toLowerCase();

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new Error(`${emailKey} is not a valid email address`);
    }

    const configuredPassword = env[passwordKey];

    if (!configuredPassword) {
      throw new Error(
        `${passwordKey} must be set to seed demo users`,
      );
    }

    if (configuredPassword.length < MIN_PASSWORD_LENGTH) {
      throw new Error(
        `${passwordKey} must be at least ${MIN_PASSWORD_LENGTH} characters`,
      );
    }

    return {
      email,
      name: template.name,
      role: template.role,
      password: configuredPassword,
    };
  });
}
