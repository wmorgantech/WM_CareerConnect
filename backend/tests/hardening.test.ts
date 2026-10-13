import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { checkConfig, dbPoolMax } from "../src/lib/config.js";
import { createMemoryDb, type MemoryDb } from "./helpers/memory-db.js";
import { api, staff } from "./helpers/http.js";

let db: MemoryDb | null = null;

afterEach(() => {
  db?.restore();
  db = null;
});

const strong = "x".repeat(40);
const other = "y".repeat(40);

describe("start-up configuration check", () => {
  it("accepts a complete production configuration and never echoes a secret", () => {
    const report = checkConfig({ NODE_ENV: "production", DATABASE_URL: "postgresql://u:p@db/x", JWT_ACCESS_SECRET: strong, JWT_REFRESH_SECRET: other, WEB_ORIGIN: "https://admin.example.org,https://students.example.org", TRUST_PROXY: "1" } as NodeJS.ProcessEnv);

    assert.deepEqual(report, { errors: [], warnings: [] });
  });

  it("refuses production without strong, distinct secrets or without allowed origins", () => {
    const missing = checkConfig({ NODE_ENV: "production" } as NodeJS.ProcessEnv);

    assert.ok(missing.errors.includes("DATABASE_URL is not set"));
    assert.ok(missing.errors.includes("JWT_ACCESS_SECRET is not set"));
    assert.ok(missing.errors.some((e) => /WEB_ORIGIN/.test(e)));

    const weak = checkConfig({ NODE_ENV: "production", DATABASE_URL: "postgresql://u:p@db/x", JWT_ACCESS_SECRET: "short", JWT_REFRESH_SECRET: "short", WEB_ORIGIN: "https://a.example.org" } as NodeJS.ProcessEnv);

    assert.ok(weak.errors.some((e) => /JWT_ACCESS_SECRET must be at least 32/.test(e)));
    assert.ok(!JSON.stringify(weak).includes("short"), "the value of a secret is never reported");

    const same = checkConfig({ NODE_ENV: "production", DATABASE_URL: "postgresql://u:p@db/x", JWT_ACCESS_SECRET: strong, JWT_REFRESH_SECRET: strong, WEB_ORIGIN: "https://a.example.org" } as NodeJS.ProcessEnv);

    assert.ok(same.errors.some((e) => /must be different/.test(e)));
  });

  it("warns about plain-HTTP origins and a missing TRUST_PROXY in production", () => {
    const report = checkConfig({ NODE_ENV: "production", DATABASE_URL: "postgresql://u:p@db/x", JWT_ACCESS_SECRET: strong, JWT_REFRESH_SECRET: other, WEB_ORIGIN: "http://admin.example.org" } as NodeJS.ProcessEnv);

    assert.deepEqual(report.errors, []);
    assert.ok(report.warnings.some((w) => /non-HTTPS/.test(w)));
    assert.ok(report.warnings.some((w) => /TRUST_PROXY/.test(w)));
  });

  it("development only warns, so a fresh checkout still starts", () => {
    const report = checkConfig({ NODE_ENV: "development", DATABASE_URL: "postgresql://u:p@db/x" } as NodeJS.ProcessEnv);

    assert.deepEqual(report.errors, []);
    assert.ok(report.warnings.some((w) => /JWT_ACCESS_SECRET/.test(w)));
  });

  it("sizes the database pool from DB_POOL_MAX, defaulting to 20 and ignoring nonsense", () => {
    assert.equal(dbPoolMax({} as NodeJS.ProcessEnv), 20);
    assert.equal(dbPoolMax({ DB_POOL_MAX: "35" } as NodeJS.ProcessEnv), 35);

    for (const bad of ["0", "-1", "1000", "abc", "2.5", ""]) assert.equal(dbPoolMax({ DB_POOL_MAX: bad } as NodeJS.ProcessEnv), 20, bad);
  });
});

describe("client mistakes are 4xx, not 500", () => {
  it("answers malformed JSON with 400 INVALID_JSON and an oversized body with 413", async () => {
    db = createMemoryDb();

    const { token } = staff(db, "SUPER_ADMIN");

    await api(async (call) => {
      const bad = await call("POST", "/colleges", { token, raw: "{not json", headers: { "Content-Type": "application/json" } });

      assert.equal(bad.status, 400);
      assert.equal(bad.json.error.code, "INVALID_JSON");
      assert.equal(JSON.stringify(bad.json).includes("Unexpected token"), false, "the parser's message is not echoed");

      const big = await call("POST", "/colleges", { token, raw: JSON.stringify({ name: "x".repeat(200_000), city: "Chennai" }), headers: { "Content-Type": "application/json" } });

      assert.equal(big.status, 413);
      assert.equal(big.json.error.code, "PAYLOAD_TOO_LARGE");
    });
  });

  it("an unknown route is 404 and a validation failure is 400 with field errors only", async () => {
    db = createMemoryDb();

    const { token } = staff(db, "SUPER_ADMIN");

    await api(async (call) => {
      assert.equal((await call("GET", "/does-not-exist", { token })).status, 404);

      const invalid = await call("POST", "/colleges", { token, body: { name: "x" } });

      assert.equal(invalid.status, 400);
      assert.equal(invalid.json.error.code, "VALIDATION_ERROR");
    });
  });
});
