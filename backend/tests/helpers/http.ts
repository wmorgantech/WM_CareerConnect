

import type { AddressInfo } from "node:net";
import cookieParser from "cookie-parser";
import express from "express";
import { errorHandler, notFoundHandler } from "../../src/middleware/error.middleware.js";
import router from "../../src/routes/index.js";
import { createMemoryDb, type MemoryDb, type RoleName } from "./memory-db.js";

export type CallOptions = { token?: string; body?: unknown; raw?: string; headers?: Record<string, string> };
export type CallResult = { status: number; json: any; text: string; setCookie: string[]; headers: Headers };
export type Call = (method: string, path: string, opts?: CallOptions) => Promise<CallResult>;

export async function api(run: (call: Call) => Promise<void>) {
  const app = express();

  app.use(express.json());
  app.use(cookieParser());
  app.use("/api/v1", router);
  app.use(notFoundHandler);
  app.use(errorHandler);

  const server = await new Promise<import("node:http").Server>((resolve) => {
    const s = app.listen(0, "127.0.0.1", () => resolve(s));
  });
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1`;
  const originalError = console.error;

  console.error = () => {};

  try {
    await run(async (method, path, opts = {}) => {
      const headers: Record<string, string> = { ...(opts.headers ?? {}) };

      if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
      if (opts.body !== undefined) headers["Content-Type"] = "application/json";

      const response = await fetch(`${base}${path}`, { method, headers, body: opts.raw !== undefined ? opts.raw : opts.body !== undefined ? JSON.stringify(opts.body) : undefined });
      const text = await response.text();
      let json: any = null;

      try { json = JSON.parse(text); } catch {  }

      return { status: response.status, json, text, setCookie: response.headers.getSetCookie(), headers: response.headers };
    });
  } finally {
    console.error = originalError;
    server.closeAllConnections();
    server.close();
  }
}

export function staff(db: MemoryDb, role: RoleName | RoleName[], over: Record<string, unknown> = {}) {
  const user = db.addUser(role, over);

  return { user, token: db.accessTokenFor(user.id) };
}

export const fourOptions = (correct = 0) => ({
  options: ["First option", "Second option", "Third option", "Fourth option"],
  correctIndex: correct,
});

export const questionBody = (over: Record<string, unknown> = {}) => ({
  level: "BOTH",
  section: "oop",
  difficulty: "EASY",
  text: "Which keyword creates an object in many languages?",
  ...fourOptions(1),
  ...over,
});
