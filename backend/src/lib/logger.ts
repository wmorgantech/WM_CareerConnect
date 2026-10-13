import pino from "pino";
import { LOG_REDACT } from "./log-redaction.js";

const isProduction = process.env.NODE_ENV === "production";
const level = process.env.LOG_LEVEL || "info";

// Pretty printing runs in a worker thread; skip it when logging is silenced (the test runs).
const pretty = !isProduction && level !== "silent";

export const logger = !pretty
  ? pino({
      level,
      redact: LOG_REDACT,
    })
  : pino({
      level,
      redact: LOG_REDACT,
      transport: {
        target: "pino-pretty",
        options: {
          colorize: true,
          translateTime: "SYS:standard",
        },
      },
    });