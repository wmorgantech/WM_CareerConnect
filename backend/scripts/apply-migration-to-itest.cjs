

const path = require("path");
const fs = require("fs");
const os = require("os");
const crypto = require("crypto");
const { spawnSync } = require("child_process");

const BACKEND = path.join(__dirname, "..");
require(path.join(BACKEND, "node_modules/dotenv")).config({ path: path.join(BACKEND, ".env"), quiet: true });
const { Client } = require(path.join(BACKEND, "node_modules/pg"));

const TARGET = "wm_careerconnect_itest";
const REAL = "wm_careerconnect";
const MIGRATIONS_DIR = path.join(BACKEND, "prisma/migrations");

function argValue(name) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
}

function refuse(message) {
  console.error(`Refusing to run: ${message}`);
  process.exit(2);
}

if (argValue("confirm-target") !== TARGET) refuse(`pass --confirm-target=${TARGET}`);
const requested = argValue("migration");
if (!requested) refuse("pass --migration=<exact migration folder name>");
if (!/^\d{14}_[a-z0-9_]+$/.test(requested)) refuse("--migration is not a valid migration folder name");
const dryRun = process.argv.includes("--dry-run");

if (TARGET === REAL) refuse("target equals the real database name");
if (!process.env.DATABASE_URL) refuse("DATABASE_URL is not set");

const url = new URL(process.env.DATABASE_URL);
url.pathname = `/${TARGET}`;
const targetUrl = url.toString();

if (decodeURIComponent(new URL(targetUrl).pathname.slice(1)) !== TARGET) refuse("derived URL does not name the test database");

const folderMigrations = fs
  .readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name)
  .sort();

if (!folderMigrations.includes(requested)) refuse(`${requested} is not in prisma/migrations`);

async function readOnlyCheck(label) {
  const client = new Client({ connectionString: targetUrl });
  await client.connect();

  try {
    await client.query("BEGIN READ ONLY");
    const db = (await client.query("select current_database() as db")).rows[0].db;
    const rows = (await client.query(`select migration_name, checksum, finished_at is not null as finished, rolled_back_at is not null as rolled_back from "_prisma_migrations" order by started_at, migration_name`)).rows;
    await client.query("ROLLBACK");

    console.log(`[${label}] current_database() = ${db}; migration records = ${rows.length}`);

    if (db !== TARGET) throw new Error(`server says this is "${db}", expected "${TARGET}"`);

    return rows;
  } finally {
    await client.end();
  }
}

function assertPlan(rows) {
  const bad = rows.filter((r) => !r.finished || r.rolled_back);

  if (bad.length > 0) throw new Error(`unfinished or rolled-back migration records: ${bad.map((r) => r.migration_name).join(", ")}`);

  const applied = rows.map((r) => r.migration_name);

  if (applied.some((name, i) => name !== folderMigrations[i])) {
    throw new Error("applied migrations are not an ordered prefix of prisma/migrations; stopping without changes");
  }

  const pending = folderMigrations.slice(applied.length);

  if (pending.length !== 1 || pending[0] !== requested) {
    throw new Error(`expected exactly one pending migration (${requested}); pending is: ${pending.join(", ") || "none"}`);
  }

  return applied;
}

(async () => {
  const before = await readOnlyCheck("preflight");
  const applied = assertPlan(before);

  console.log(`plan: apply 1 migration (${requested}) on top of ${applied.length} applied; last applied = ${applied[applied.length - 1]}`);

  if (dryRun) {
    console.log("--dry-run: nothing was applied.");
    return;
  }

  const configPath = path.join(os.tmpdir(), `prisma-itest-${process.pid}.cjs`);

  fs.writeFileSync(
    configPath,
    `module.exports = { schema: ${JSON.stringify(path.join(BACKEND, "prisma/schema.prisma"))}, migrations: { path: ${JSON.stringify(MIGRATIONS_DIR)} }, datasource: { url: process.env.DATABASE_URL } };\n`,
  );

  try {
    const result = spawnSync(process.execPath, [path.join(BACKEND, "node_modules/prisma/build/index.js"), "migrate", "deploy", "--config", configPath], {
      cwd: BACKEND,
      env: { ...process.env, DATABASE_URL: targetUrl },
      encoding: "utf8",
    });

    const output = `${result.stdout ?? ""}${result.stderr ?? ""}`.split("\n").filter((l) => !/postgres(ql)?:\/\//i.test(l)).join("\n");
    console.log(output);

    if (result.status !== 0) {
      throw new Error("prisma migrate deploy failed; the migration file is transactional, so nothing was half-applied");
    }
  } finally {
    fs.rmSync(configPath, { force: true });
  }

  const after = await readOnlyCheck("post-check");

  if (after.length !== before.length + 1 || after[after.length - 1].migration_name !== requested) {
    throw new Error("post-check: migration list is not as expected");
  }

  if (!before.every((r, i) => after[i].migration_name === r.migration_name && after[i].checksum === r.checksum)) {
    throw new Error("post-check: an earlier migration record changed");
  }

  const fileSha = crypto.createHash("sha256").update(fs.readFileSync(path.join(MIGRATIONS_DIR, requested, "migration.sql"))).digest("hex");

  if (after[after.length - 1].checksum !== fileSha) {
    throw new Error("post-check: stored checksum differs from the checked-in file");
  }

  console.log("Done. Only wm_careerconnect_itest was touched.");
})().catch((error) => {
  console.error("STOPPED:", error.message);
  process.exit(1);
});
