import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import { logger } from "./lib/logger.js";
import { createCorsOptions } from "./lib/cors.js";
import { parseTrustProxy } from "./lib/trust-proxy.js";
import {
  notFoundHandler,
  errorHandler,
} from "./middleware/error.middleware.js";
import apiRoutes from "./routes/index.js";

const app = express();

// Trust proxy headers only when TRUST_PROXY is configured for this
// deployment, so client IPs (used by the login rate limiter) cannot be
// spoofed through X-Forwarded-For.
const trustProxy = parseTrustProxy(process.env.TRUST_PROXY);

if (trustProxy !== undefined) {
  app.set("trust proxy", trustProxy);
}

app.use(helmet());

app.use(cors(createCorsOptions()));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

app.use(pinoHttp({ logger }));

app.use("/api/v1", apiRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

export default app;