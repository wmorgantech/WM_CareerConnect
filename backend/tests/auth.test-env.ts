process.env.DATABASE_URL =
  "postgresql://test:test@127.0.0.1:1/test";
process.env.JWT_ACCESS_SECRET =
  "isolated-auth-access-secret-for-tests";
process.env.JWT_REFRESH_SECRET =
  "isolated-auth-refresh-secret-for-tests";
process.env.REGISTRATION_SUBMIT_LIMIT = "1000";
process.env.REGISTRATION_LOOKUP_LIMIT = "1000";
process.env.LOG_LEVEL = "silent";
