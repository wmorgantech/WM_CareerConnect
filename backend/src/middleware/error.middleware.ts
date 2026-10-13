import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { HttpError } from "../lib/http-error.js";
import { logger } from "../lib/logger.js";

export function notFoundHandler(
  req: Request,
  res: Response,
  _next: NextFunction,
) {
  res.status(404).json({
    success: false,
    error: {
      code: "NOT_FOUND",
      message: `Route not found: ${req.method} ${req.originalUrl}`,
    },
  });
}

// Errors raised by the body parser carry their own 4xx status: malformed JSON is the
// client's mistake (400) and an oversized body is 413. Anything else with a status
// outside 4xx is treated as a server error.
function bodyParserStatus(err: unknown): { status: number; code: string; message: string } | null {
  if (typeof err !== "object" || err === null) return null;

  const { type, status } = err as { type?: unknown; status?: unknown };

  if (type === "entity.parse.failed") {
    return { status: 400, code: "INVALID_JSON", message: "The request body is not valid JSON" };
  }

  if (type === "entity.too.large" || status === 413) {
    return { status: 413, code: "PAYLOAD_TOO_LARGE", message: "The request body is too large" };
  }

  if (type === "encoding.unsupported" || type === "charset.unsupported") {
    return { status: 415, code: "UNSUPPORTED_MEDIA_TYPE", message: "Unsupported request encoding" };
  }

  return null;
}

export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
) {
  if (err instanceof HttpError) {
    return res.status(err.status).json({
      success: false,
      error: {
        code: err.code,
        message: err.message,
        ...(err.details !== undefined && { details: err.details }),
      },
    });
  }

  if (err instanceof ZodError) {
    const flattened = err.flatten();

    return res.status(400).json({
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Validation failed",
        details: {
          fieldErrors: flattened.fieldErrors,
        },
      },
    });
  }

  const client = bodyParserStatus(err);

  if (client) {
    return res.status(client.status).json({
      success: false,
      error: { code: client.code, message: client.message },
    });
  }

  // Only unexpected failures are logged, with the request for context. The response never
  // includes the error, its message or a stack.
  (req.log ?? logger).error({ err, method: req.method, path: req.path }, "unhandled request error");

  return res.status(500).json({
    success: false,
    error: {
      code: "INTERNAL_SERVER_ERROR",
      message: "Something went wrong",
    },
  });
}
