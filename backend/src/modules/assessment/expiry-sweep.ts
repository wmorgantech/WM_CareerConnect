import { isMissingSchemaError } from "../../lib/http-error.js";
import { logger } from "../../lib/logger.js";
import { recruitmentClientReady } from "../../lib/recruitment-db.js";
import { finalizeExpiredAttempts } from "./assessment.service.js";

const INTERVAL_MS = 30_000;

export function startExpirySweep(intervalMs: number = INTERVAL_MS): () => void {
  let running = false;
  let warnedMissing = false;

  const timer = setInterval(async () => {
    if (running) return;

    running = true;

    try {
      if (!recruitmentClientReady()) {
        if (!warnedMissing) {
          warnedMissing = true;
          logger.warn("the Prisma client has no assessment models yet; expiry sweep is idle until the client is regenerated");
        }

        return;
      }

      const closed = await finalizeExpiredAttempts();

      warnedMissing = false;

      if (closed > 0) logger.info({ closed }, "auto-submitted expired assessments");
    } catch (error) {
      if (isMissingSchemaError(error)) {
        if (!warnedMissing) {
          warnedMissing = true;
          logger.warn("assessment tables not found; expiry sweep is idle until the database is migrated");
        }
      } else {
        logger.error({ err: error instanceof Error ? error.message : String(error) }, "expiry sweep failed");
      }
    } finally {
      running = false;
    }
  }, intervalMs);

  timer.unref();

  return () => clearInterval(timer);
}
