import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(root, "src");
const studentDir = join(src, "student");
const problems = [];

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);

    return statSync(full).isDirectory() ? walk(full) : /\.(js|jsx)$/.test(name) ? [full] : [];
  });
}

const STAFF_PATHS = /["'`]\/(auth|users|roles|colleges|drives|candidates|questions|test-templates|applications|interviews\/|reports|settings|audit-logs|dashboard|results)\b/;

for (const file of walk(src)) {
  const rel = relative(root, file);
  const text = readFileSync(file, "utf8");

  if (!file.startsWith(studentDir + sep)) {
    problems.push(`${rel}: only src/student is allowed in this project`);
    continue;
  }

  for (const match of text.matchAll(/(?:from|import)\s*\(?\s*["']([^"']+)["']/g)) {
    const spec = match[1];

    if (spec.startsWith(".")) {
      const target = resolve(dirname(file), spec);

      if (!target.startsWith(studentDir)) problems.push(`${rel}: imports "${spec}" from outside src/student`);
    } else if (/(^|\/)admin(\/|$)/.test(spec)) {
      problems.push(`${rel}: imports "${spec}" (staff console)`);
    }
  }

  if (/\b(localStorage|sessionStorage|indexedDB)\b/.test(text)) problems.push(`${rel}: uses browser storage`);
  if (STAFF_PATHS.test(text)) problems.push(`${rel}: references a staff API path`);
}

if (problems.length > 0) {
  console.error("Student portal boundary check FAILED:\n  " + problems.join("\n  "));
  process.exit(1);
}

console.log("Student portal boundary check passed.");
