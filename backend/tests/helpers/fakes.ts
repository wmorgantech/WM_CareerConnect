import type { AddressInfo } from "node:net";
import express from "express";
import { errorHandler } from "../../src/middleware/error.middleware.js";
import { prisma } from "../../src/lib/prisma.js";

export function installFakePrisma(
  overrides: Record<string, unknown>,
): () => void {
  const saved: [string, PropertyDescriptor | undefined][] = [];

  for (const [key, value] of Object.entries(overrides)) {
    saved.push([key, Object.getOwnPropertyDescriptor(prisma, key)]);
    Object.defineProperty(prisma, key, {
      configurable: true,
      writable: true,
      value,
    });
  }

  return () => {
    for (const [key, descriptor] of saved) {
      if (descriptor) {
        Object.defineProperty(prisma, key, descriptor);
      } else {
        delete (prisma as unknown as Record<string, unknown>)[key];
      }
    }
  };
}

export async function withFakePrisma(
  overrides: Record<string, unknown>,
  run: () => Promise<void>,
): Promise<void> {
  const restore = installFakePrisma(overrides);

  try {
    await run();
  } finally {
    restore();
  }
}

export async function withServer(
  user: { id: string; permissions: string[] },
  register: (app: express.Express) => void,
  run: (base: string) => Promise<void>,
): Promise<void> {
  const app = express();

  app.use(express.json());
  app.use((req, _res, next) => {
    req.user = user;
    next();
  });
  register(app);
  app.use(errorHandler);

  const server = await new Promise<import("node:http").Server>(
    (resolve) => {
      const started = app.listen(0, "127.0.0.1", () =>
        resolve(started),
      );
    },
  );

  try {
    const { port } = server.address() as AddressInfo;

    await run(`http://127.0.0.1:${port}`);
  } finally {
    server.closeAllConnections();
    server.close();
  }
}

export async function send(
  base: string,
  method: string,
  path: string,
  body?: unknown,
) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers:
      body !== undefined
        ? { "Content-Type": "application/json" }
        : {},
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();

  let json: any = null;

  try {
    json = JSON.parse(text);
  } catch {

  }

  return { status: response.status, json };
}
