import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { prisma } from "../src/lib/prisma.js";

const PROCESS_NAME = "WM-CareerConnect-API";
const targetEmail = process.env.CC_DIAG_SUPER_ADMIN_EMAIL?.trim();

if (!targetEmail) {
  console.error("Set CC_DIAG_SUPER_ADMIN_EMAIL to the authorized account email.");
  process.exit(1);
}

type AccountDiagnostic = {
  matchCount: number;
  status: "ACTIVE" | "INACTIVE" | "MULTIPLE" | "NOT_FOUND";
  hasSuperAdminRole: boolean;
  passwordHashValidBcryptFormat: boolean;
};

type ProcessDiagnostic = {
  name: string;
  status: string;
  deployedReleaseIdentifier: string | null;
  backendListeningPort: number | null;
};

function execText(command: string, args: string[], cwd?: string): string {
  return execFileSync(command, args, {
    cwd,
    encoding: "utf8",
    windowsHide: true,
    maxBuffer: 16 * 1024 * 1024,
  }).trim();
}

type Pm2Process = {
  name: string;
  status: string;
  pid: number | null;
  execPath: string | null;
};

function getPm2Process(): Pm2Process {
  const pm2Output =
    process.platform === "win32"
      ? execText(process.env.ComSpec ?? "cmd.exe", [
          "/d",
          "/s",
          "/c",
          "pm2 jlist",
        ])
      : execText("pm2", ["jlist"]);

  const processes: Array<{
    name?: string;
    pid?: number;
    pm_exec_path?: string;
    pm2_env?: {
      status?: string;
      pm_cwd?: string;
    };
  }> = JSON.parse(pm2Output);

  const matches = processes.filter(
    (processInfo) => processInfo.name === PROCESS_NAME,
  );

  if (matches.length !== 1) {
    return {
      name: PROCESS_NAME,
      status: matches.length === 0 ? "NOT_FOUND" : "MULTIPLE",
      pid: null,
      execPath: null,
    };
  }

  const processInfo = matches[0];

  return {
    name: PROCESS_NAME,
    status: processInfo?.pm2_env?.status ?? "UNKNOWN",
    pid:
      typeof processInfo?.pid === "number" && processInfo.pid > 0
        ? processInfo.pid
        : null,
    execPath: processInfo?.pm_exec_path
      ? resolve(
          processInfo.pm2_env?.pm_cwd ?? process.cwd(),
          processInfo.pm_exec_path,
        )
      : null,
  };
}

function getListeningPort(pid: number | null): number | null {
  if (pid === null) return null;

  const output =
    process.platform === "win32"
      ? execText("netstat", ["-ano", "-p", "tcp"])
      : execText("sh", [
          "-c",
          `ss -lntpH | awk -v pid="${pid}" '$0 ~ ("pid=" pid ",") {print $4}'`,
        ]);

  const ports = new Set<number>();

  for (const line of output.split(/\r?\n/)) {
    const fields = line.trim().split(/\s+/);

    if (process.platform === "win32") {
      if (
        fields[0]?.toUpperCase() !== "TCP" ||
        fields[3]?.toUpperCase() !== "LISTENING" ||
        Number(fields[4]) !== pid
      ) {
        continue;
      }

      const port = Number(fields[1]?.match(/:(\d+)$/)?.[1]);

      if (Number.isInteger(port)) ports.add(port);
      continue;
    }

    const endpoint = fields.at(-1);
    const port = Number(endpoint?.match(/:(\d+)$/)?.[1]);

    if (Number.isInteger(port)) ports.add(port);
  }

  return ports.size === 1 ? [...ports][0]! : null;
}

async function main() {
  const processes = getPm2Process();
  const releaseIdentifier = processes.execPath
    ? `sha256:${createHash("sha256")
        .update(readFileSync(processes.execPath))
        .digest("hex")}`
    : null;
  const backendListeningPort = getListeningPort(processes.pid);

  const rows = await prisma.$queryRaw<AccountDiagnostic[]>`
    SELECT
      COUNT(*)::int AS "matchCount",
      CASE
        WHEN COUNT(*) = 0 THEN 'NOT_FOUND'
        WHEN COUNT(*) > 1 THEN 'MULTIPLE'
        WHEN BOOL_OR(u.status::text = 'ACTIVE') THEN 'ACTIVE'
        ELSE 'INACTIVE'
      END AS status,
      (
        COUNT(*) = 1
        AND BOOL_OR(EXISTS (
          SELECT 1
          FROM "UserRole" ur
          JOIN "Role" r ON r.id = ur."roleId"
          WHERE ur."userId" = u.id
            AND r.name = 'SUPER_ADMIN'
        ))
      ) AS "hasSuperAdminRole",
      (
        COUNT(*) = 1
        AND BOOL_OR(
          u."passwordHash" ~ '^[$]2[aby][$](0[4-9]|[12][0-9]|3[01])[$][./A-Za-z0-9]{53}$'
        )
      ) AS "passwordHashValidBcryptFormat"
    FROM "User" u
    WHERE LOWER(u.email) = LOWER(${targetEmail})
  `;

  const account = rows[0];

  if (!account) {
    throw new Error("The read-only account diagnostic returned no result");
  }

  const processDiagnostic: ProcessDiagnostic = {
    name: processes.name,
    status: processes.status,
    deployedReleaseIdentifier: releaseIdentifier,
    backendListeningPort,
  };

  console.log(
    JSON.stringify(
      { account, process: processDiagnostic },
      null,
      2,
    ),
  );
}

main()
  .catch(() => {
    console.error(
      "Diagnostic failed. Verify read-only database access, PM2 permissions, and deployed source metadata; no diagnostic values were printed.",
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
