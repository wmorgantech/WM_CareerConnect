

const TARGETS = {
  test: "wm_careerconnect_itest",
  real: "wm_careerconnect",
};

const USAGE = [
  "Usage: node scripts/db-preflight.cjs --only=test|real",
  "  --only=test   inspect wm_careerconnect_itest",
  "  --only=real   inspect wm_careerconnect (read-only)",
].join("\n");

const STATEMENT_TIMEOUT = "5s";
const LOCK_TIMEOUT = "2s";
const CONNECT_TIMEOUT_MS = 5000;

function parseArgs(argv) {
  if (argv.length !== 1) {
    return { ok: false, message: "Exactly one argument is required." };
  }

  const match = /^--only=(.*)$/.exec(argv[0]);

  if (!match || !Object.prototype.hasOwnProperty.call(TARGETS, match[1])) {
    return { ok: false, message: "Unknown or missing target." };
  }

  return { ok: true, key: match[1], dbName: TARGETS[match[1]] };
}

function sanitize(message, secrets = []) {
  let text = String(message);

  for (const secret of secrets) {
    if (secret) text = text.split(secret).join("[redacted]");
  }

  return text
    .replace(/postgres(ql)?:\/\/\S+/gi, "[redacted-url]")
    .replace(/(user|role) "[^"]*"/gi, '$1 "[redacted]"')
    .replace(/(password|passwd|pwd)=\S+/gi, "$1=[redacted]");
}

async function inspect(dbName, { makeClient, migrationsOnDisk, log }) {
  const client = makeClient();
  let connected = false;
  let inTransaction = false;

  try {
    await client.connect();
    connected = true;

    await client.query("BEGIN READ ONLY");
    inTransaction = true;

    await client.query(`SET LOCAL statement_timeout = '${STATEMENT_TIMEOUT}'`);
    await client.query(`SET LOCAL lock_timeout = '${LOCK_TIMEOUT}'`);

    const who = (
      await client.query("select current_database() as db, current_setting('server_version') as version")
    ).rows[0];

if (who.db !== dbName) {
      throw new Error(`Connected database is "${who.db}" but "${dbName}" was selected; aborting.`);
    }

    const readOnly = (await client.query("show transaction_read_only")).rows[0].transaction_read_only;

    if (readOnly !== "on") {
      throw new Error("The transaction is not read-only; aborting.");
    }

    const applied = (
      await client.query(
        `select migration_name, finished_at is not null as finished, rolled_back_at is not null as rolled_back from "_prisma_migrations" order by started_at`,
      )
    ).rows;
    const tables = (
      await client.query(
        `select table_name from information_schema.tables where table_schema='public' and table_name <> '_prisma_migrations' order by 1`,
      )
    ).rows.map((r) => r.table_name);
    const counts = {};

    for (const t of tables) {
      const quoted = `"${String(t).replace(/"/g, '""')}"`;

      counts[t] = (await client.query(`select count(*)::int as n from ${quoted}`)).rows[0].n;
    }

    await client.query("ROLLBACK");
    inTransaction = false;

    const appliedNames = applied.map((m) => m.migration_name);
    const pending = migrationsOnDisk.filter((m) => !appliedNames.includes(m));

    log(`\n== ${dbName} ==`);
    log(`server reports current_database() = ${who.db}   (expected ${dbName}: OK)`);
    log(`PostgreSQL ${who.version}; transaction_read_only = ${readOnly}`);
    log(`applied migrations: ${applied.length}; all finished and none rolled back: ${applied.every((m) => m.finished && !m.rolled_back)}`);
    log(`migrations in folder not yet applied here: ${pending.length ? pending.join(", ") : "none"}`);
    log(`tables (${tables.length}): ${tables.join(", ")}`);
    log(`row counts: ${JSON.stringify(counts)}`);
  } finally {
    if (inTransaction) {
      try {
        await client.query("ROLLBACK");
      } catch {

      }
    }

    if (connected) {
      try {
        await client.end();
      } catch {

      }
    }
  }
}

function run(argv) {
  const parsed = parseArgs(argv);

if (!parsed.ok) {
    console.error(`${parsed.message}\n${USAGE}`);
    process.exit(2);
  }

  const path = require("path");
  const fs = require("fs");
  const BACKEND = path.join(__dirname, "..");

  require(path.join(BACKEND, "node_modules/dotenv")).config({ path: path.join(BACKEND, ".env"), quiet: true });

  const { Client } = require(path.join(BACKEND, "node_modules/pg"));
  const rawUrl = process.env.DATABASE_URL;
  let secrets = [rawUrl];

  return (async () => {
    if (!rawUrl) throw new Error("DATABASE_URL is not set");

    const u = new URL(rawUrl);

    secrets = [rawUrl, u.password, decodeURIComponent(u.password), u.username];
    u.pathname = `/${parsed.dbName}`;

    const migrationsOnDisk = fs
      .readdirSync(path.join(BACKEND, "prisma/migrations"), { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
      .sort();

    console.log(`target: ${parsed.dbName} on ${u.hostname}:${u.port || "5432"}`);

    await inspect(parsed.dbName, {
      makeClient: () => new Client({ connectionString: u.toString(), connectionTimeoutMillis: CONNECT_TIMEOUT_MS }),
      migrationsOnDisk,
      log: (line) => console.log(line),
    });
  })().catch((error) => {
    console.error("preflight failed:", sanitize(error && error.message, secrets));
    process.exit(1);
  });
}

if (require.main === module) {
  run(process.argv.slice(2));
}

module.exports = { TARGETS, parseArgs, sanitize, inspect };
