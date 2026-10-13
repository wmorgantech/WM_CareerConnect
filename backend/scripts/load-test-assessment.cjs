

const fs = require("node:fs");

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, ...v] = a.replace(/^--/, "").split("=");

    return [k, v.length ? v.join("=") : "true"];
  }),
);

function fail(message) {
  console.error(message);
  process.exit(2);
}

const base = (args.base || "").replace(/\/+$/, "");

if (!base) fail("Usage: --base=http://localhost:5000/api/v1 --credentials=file.json --confirm-isolated=I-AM-USING-AN-ISOLATED-DATABASE");
if (args["confirm-isolated"] !== "I-AM-USING-AN-ISOLATED-DATABASE") fail("Refusing to run: this test writes data. Pass --confirm-isolated=I-AM-USING-AN-ISOLATED-DATABASE once you are sure the server uses an isolated test database.");

const host = new URL(base).hostname;
const local = ["localhost", "127.0.0.1", "::1"].includes(host) || /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host);

if (!local && args["allow-remote"] !== "true") fail(`Refusing a non-local address (${host}). Add --allow-remote only for a disposable test server.`);
if (!args.credentials) fail("--credentials=file.json is required");

const credentials = JSON.parse(fs.readFileSync(args.credentials, "utf8"));
const concurrency = Math.min(Number(args.concurrency) || credentials.length, credentials.length);
const maxP95 = Number(args["max-p95-ms"]) || 1500;
const samples = {};
const errors = {};

function record(step, ms, ok, code) {
  (samples[step] ??= []).push(ms);

  if (!ok) {
    const key = `${step}:${code}`;

    errors[key] = (errors[key] || 0) + 1;
  }
}

async function call(step, token, method, path, body, cookieJar) {
  const started = performance.now();
  let res;

  try {
    res = await fetch(`${base}${path}`, {
      method,
      headers: {
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(cookieJar?.cookie ? { Cookie: cookieJar.cookie } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (error) {
    record(step, performance.now() - started, false, "NETWORK");

    return { ok: false, json: null };
  }

  const json = await res.json().catch(() => null);

  if (cookieJar) {
    const set = res.headers.getSetCookie?.()[0];

    if (set) cookieJar.cookie = set.split(";")[0];
  }

  record(step, performance.now() - started, res.ok, json?.error?.code || res.status);

  return { ok: res.ok, json };
}

async function student(creds) {
  const jar = {};
  let login = await call("login", null, "POST", "/candidate/auth/login", { loginId: creds.loginId, password: creds.password }, jar);

  if (!login.ok) return false;

  let token = login.json.data.accessToken;

  if (login.json.data.user.mustChangePassword) {
    if (!creds.newPassword) return false;

    if (!(await call("change-password", token, "POST", "/candidate/auth/change-password", { currentPassword: creds.password, newPassword: creds.newPassword })).ok) return false;
  }

  const info = await call("info", token, "GET", "/candidate/assessment");

  if (!info.ok) return false;

  const start = await call("start", token, "POST", "/candidate/attempts/start", { termsVersion: info.json.data.termsVersion, accepted: true });

  if (!start.ok) return false;

  const attemptId = start.json.data.attempt.id;
  const current = await call("paper", token, "GET", "/candidate/attempts/current");

  if (!current.ok) return false;

  const questions = current.json.data.questions;
  let seq = 0;

for (const q of questions) {
    seq += 1;

    const pick = q.options[Math.floor(Math.random() * q.options.length)].id;

    await call("save", token, "PATCH", `/candidate/attempts/${attemptId}/answers`, { answers: [{ questionId: q.questionId, selectedOptionId: pick, seq }] });
    await new Promise((r) => setTimeout(r, 20 + Math.random() * 60));
  }

  await call("event", token, "POST", `/candidate/attempts/${attemptId}/events`, { type: "TAB_HIDDEN" });

  const submit = await call("submit", token, "POST", `/candidate/attempts/${attemptId}/submit`, { confirm: true });

  return submit.ok;
}

const pct = (list, p) => {
  const sorted = [...list].sort((a, b) => a - b);

  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
};

(async () => {
  console.log(`Running ${concurrency} students against ${base}`);

  const started = performance.now();
  const queue = credentials.slice(0, concurrency);
  const results = await Promise.all(queue.map((c) => student(c).catch(() => false)));
  const seconds = ((performance.now() - started) / 1000).toFixed(1);
  const passed = results.filter(Boolean).length;

  console.log(`\nStudents completed: ${passed} of ${queue.length} in ${seconds}s`);
  console.log("step            n     p50ms   p95ms   max ms");

  let slow = false;

  for (const [step, list] of Object.entries(samples)) {
    const p95 = pct(list, 95);

    if (p95 > maxP95) slow = true;

    console.log(`${step.padEnd(14)} ${String(list.length).padStart(5)} ${pct(list, 50).toFixed(0).padStart(8)} ${p95.toFixed(0).padStart(7)} ${Math.max(...list).toFixed(0).padStart(8)}`);
  }

  if (Object.keys(errors).length) {
    console.log("\nErrors:");

    for (const [key, count] of Object.entries(errors)) console.log(`  ${key}: ${count}`);
  }

  const ok = passed === queue.length && !Object.keys(errors).length && !slow;

  console.log(ok ? "\nPASS" : `\nFAIL${slow ? ` (a p95 above ${maxP95} ms)` : ""}`);
  process.exit(ok ? 0 : 1);
})();
