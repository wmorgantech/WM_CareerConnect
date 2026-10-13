

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";

const require = createRequire(import.meta.url);
const preflight = require("../scripts/db-preflight.cjs") as {
  TARGETS: Record<string, string>;
  parseArgs: (argv: string[]) => { ok: boolean; key?: string; dbName?: string; message?: string };
  sanitize: (message: unknown, secrets?: string[]) => string;
  inspect: (db: string, deps: { makeClient: () => any; migrationsOnDisk: string[]; log: (l: string) => void }) => Promise<void>;
};

type FakeOptions = {
  db?: string;
  readOnly?: string;
  failOn?: RegExp;
  failConnect?: boolean;
};

function fakeClient(opts: FakeOptions = {}) {
  const queries: string[] = [];
  const state = { ended: 0, connected: false };
  const client = {
    async connect() {
      if (opts.failConnect) throw new Error("connect ECONNREFUSED 127.0.0.1:5432");
      state.connected = true;
    },
    async query(sql: string) {
      queries.push(sql);
      if (opts.failOn?.test(sql)) throw new Error("canceling statement due to statement timeout");
      if (/current_database/.test(sql)) return { rows: [{ db: opts.db ?? "wm_careerconnect_itest", version: "16.0" }] };
      if (/transaction_read_only/.test(sql)) return { rows: [{ transaction_read_only: opts.readOnly ?? "on" }] };
      if (/_prisma_migrations/.test(sql) && /migration_name/.test(sql)) {
        return { rows: [{ migration_name: "20261006074640_initial_schema", finished: true, rolled_back: false }] };
      }
      if (/information_schema/.test(sql)) return { rows: [{ table_name: "User" }, { table_name: "we\"ird" }] };
      if (/count\(\*\)/.test(sql)) return { rows: [{ n: 3 }] };
      return { rows: [] };
    },
    async end() {
      state.ended += 1;
    },
  };

  return { client, queries, state };
}

const deps = (fake: ReturnType<typeof fakeClient>, lines: string[] = []) => ({
  makeClient: () => fake.client,
  migrationsOnDisk: ["20261006074640_initial_schema", "20261012120000_add_recruitment_pipeline"],
  log: (l: string) => lines.push(l),
});

test("arguments: only --only=test and --only=real are accepted, and map to the right databases", () => {
  assert.deepEqual(preflight.parseArgs(["--only=test"]), { ok: true, key: "test", dbName: "wm_careerconnect_itest" });
  assert.deepEqual(preflight.parseArgs(["--only=real"]), { ok: true, key: "real", dbName: "wm_careerconnect" });
});

test("arguments: missing, unknown, duplicated, extra and look-alike arguments are all rejected", () => {
  for (const argv of [
    [],
    ["--only"],
    ["--only="],
    ["--only=prod"],
    ["--only=TEST"],
    ["--only=test", "--only=real"],
    ["--only=test", "--only=test"],
    ["--only=test", "extra"],
    ["test"],
    ["--only=constructor"],
    ["--only=__proto__"],
    ["--confirm-target=wm_careerconnect"],
  ]) {
    assert.equal(preflight.parseArgs(argv).ok, false, JSON.stringify(argv));
  }
});

test("the usage check runs before .env is loaded and before pg is required: neither is required at the top level", () => {
  const source = readFileSync(new URL("../scripts/db-preflight.cjs", import.meta.url), "utf8");
  const topLevelRequires = source.split("\n").filter((line) => /^\S.*require\(/.test(line));

  assert.deepEqual(topLevelRequires, [], "no require() at column 0");
  assert.ok(source.indexOf("process.exit(2)") < source.indexOf("node_modules/dotenv"), "usage exit precedes dotenv");
  assert.ok(source.indexOf("process.exit(2)") < source.indexOf("node_modules/pg"), "usage exit precedes pg");
  assert.ok(source.indexOf("const parsed = parseArgs(argv)") < source.indexOf("node_modules/dotenv"));
});

test("inspect: one read-only transaction, transaction-local timeouts first, always rolled back, connection closed", async () => {
  const fake = fakeClient();
  const lines: string[] = [];

  await preflight.inspect("wm_careerconnect_itest", deps(fake, lines));

  assert.equal(fake.queries[0], "BEGIN READ ONLY");
  assert.equal(fake.queries[1], "SET LOCAL statement_timeout = '5s'");
  assert.equal(fake.queries[2], "SET LOCAL lock_timeout = '2s'");
  assert.equal(fake.queries.at(-1), "ROLLBACK");
  assert.equal(fake.queries.filter((q) => q === "ROLLBACK").length, 1);
  assert.equal(fake.queries.filter((q) => q === "BEGIN READ ONLY").length, 1);
  assert.equal(fake.state.ended, 1);
  assert.ok(lines.some((l) => /migrations in folder not yet applied here: 20261012120000_add_recruitment_pipeline/.test(l)));
  assert.ok(lines.some((l) => /applied migrations: 1; all finished and none rolled back: true/.test(l)));
});

test("inspect: only SELECT / SHOW / BEGIN READ ONLY / SET LOCAL / ROLLBACK are ever sent", async () => {
  const fake = fakeClient();

  await preflight.inspect("wm_careerconnect_itest", deps(fake));

  for (const sql of fake.queries) {
    assert.match(sql, /^(select |show |BEGIN READ ONLY$|SET LOCAL |ROLLBACK$)/i, sql);
    assert.doesNotMatch(sql, /\b(insert|update|delete|create|alter|drop|truncate|grant|revoke|copy|vacuum|lock)\b/i, sql);
  }

  assert.ok(fake.queries.filter((q) => /^set /i.test(q)).every((q) => /^SET LOCAL /.test(q)), "no session-level SET");
});

test("inspect: table names are quoted safely in the count queries", async () => {
  const fake = fakeClient();

  await preflight.inspect("wm_careerconnect_itest", deps(fake));

  assert.ok(fake.queries.includes('select count(*)::int as n from "User"'));
  assert.ok(fake.queries.includes('select count(*)::int as n from "we""ird"'));
});

test("inspect: a database that is not the selected one aborts before any table or migration is read", async () => {
  for (const [selected, actual] of [
    ["wm_careerconnect_itest", "wm_careerconnect"],
    ["wm_careerconnect", "wm_careerconnect_itest"],
    ["wm_careerconnect", "wm_careerconnect_other"],
  ] as const) {
    const fake = fakeClient({ db: actual });
    const lines: string[] = [];

    await assert.rejects(preflight.inspect(selected, deps(fake, lines)), /aborting/);

    assert.equal(fake.queries.some((q) => /_prisma_migrations|information_schema|count\(\*\)/.test(q)), false, "nothing inspected");
    assert.equal(fake.queries.at(-1), "ROLLBACK");
    assert.equal(fake.state.ended, 1, "connection closed");
    assert.deepEqual(lines, [], "no report is printed for the wrong database");
  }
});

test("inspect: a transaction that is not read-only aborts", async () => {
  const fake = fakeClient({ readOnly: "off" });

  await assert.rejects(preflight.inspect("wm_careerconnect_itest", deps(fake)), /not read-only/);
  assert.equal(fake.queries.some((q) => /_prisma_migrations|count\(\*\)/.test(q)), false);
  assert.equal(fake.queries.at(-1), "ROLLBACK");
  assert.equal(fake.state.ended, 1);
});

test("inspect: a failure part-way (for example a timeout) rolls back and closes the connection", async () => {
  const fake = fakeClient({ failOn: /count\(\*\)/ });

  await assert.rejects(preflight.inspect("wm_careerconnect_itest", deps(fake)), /statement timeout/);
  assert.equal(fake.queries.at(-1), "ROLLBACK");
  assert.equal(fake.state.ended, 1);
});

test("inspect: a failed connection sends no query", async () => {
  const fake = fakeClient({ failConnect: true });

  await assert.rejects(preflight.inspect("wm_careerconnect_itest", deps(fake)), /ECONNREFUSED/);
  assert.deepEqual(fake.queries, []);
});

test("sanitize: connection strings, the configured URL and password, and user names never survive", () => {
  const url = "postgresql://appuser:s3cr3t%21@db.example.test:5432/wm_careerconnect";
  const text = [
    `connect failed for ${url}`,
    'password authentication failed for user "appuser"',
    'role "appuser" does not exist',
    "password=s3cr3t!",
  ].join(" | ");
  const clean = preflight.sanitize(text, [url, "s3cr3t!", "s3cr3t%21", "appuser"]);

  for (const leaked of ["s3cr3t", "appuser", "postgresql://"]) assert.equal(clean.includes(leaked), false, leaked);
  assert.equal(preflight.sanitize(undefined), "undefined");
});

test("the report never contains credentials", async () => {
  const fake = fakeClient();
  const lines: string[] = [];

  await preflight.inspect("wm_careerconnect_itest", deps(fake, lines));

  const printed = lines.join("\n");

  assert.doesNotMatch(printed, /postgres(ql)?:\/\/|password|passwd/i);
});
