import dotenv from "dotenv";

dotenv.config();

import app from "./app.js";
import { checkConfig } from "./lib/config.js";
import { logger } from "./lib/logger.js";
import { prisma } from "./lib/prisma.js";
import { startExpirySweep } from "./modules/assessment/expiry-sweep.js";

const report = checkConfig();

for (const warning of report.warnings) logger.warn(warning);

if (report.errors.length > 0) {
  for (const problem of report.errors) logger.fatal(problem);

  process.exit(1);
}

const PORT = Number(process.env.PORT) || 5000;

// Submits assessments whose time has run out even if the student closed the browser.
const stopSweep = startExpirySweep();

const server = app.listen(PORT, () => {
  logger.info({ port: PORT }, "WM CareerConnect API is running");
});

let shuttingDown = false;

async function shutdown(signal: string) {
  if (shuttingDown) return;

  shuttingDown = true;
  logger.info({ signal }, "shutting down");
  stopSweep();

  // Stop taking new connections, let running requests finish, then release the database.
  const forced = setTimeout(() => process.exit(1), 10_000);

  forced.unref();
  server.close(async () => {
    await prisma.$disconnect().catch(() => undefined);
    process.exit(0);
  });
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("unhandledRejection", (reason) => {
  logger.error({ err: reason instanceof Error ? reason.message : String(reason) }, "unhandled promise rejection");
});
process.on("uncaughtException", (error) => {
  logger.fatal({ err: error.message }, "uncaught exception");
  process.exit(1);
});
