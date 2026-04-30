/**
 * logger.ts — structured JSON logging for Homie Server.
 *
 * Every log entry is a single-line JSON object with:
 *   ts, level, msg, requestId, wallet, ...extra
 */

import crypto from "crypto";
import type { Request, Response, NextFunction } from "express";
import type { LogLevel, LogExtra, Logger } from "../types/server";

const LOG_LEVEL_MAP: Record<string, number> = { debug: 0, info: 1, warn: 2, error: 3 };
const MIN_LEVEL = LOG_LEVEL_MAP[process.env.LOG_LEVEL || "info"] ?? 1;

function formatEntry(level: string, msg: string, extra: LogExtra = {}): string {
  return JSON.stringify({
    ts: new Date().toISOString(),
    level,
    msg,
    ...extra,
  });
}

function emit(level: LogLevel, msg: string, extra?: LogExtra): void {
  if (LOG_LEVEL_MAP[level] < MIN_LEVEL) return;
  const line = formatEntry(level, msg, extra);
  if (level === "error") {
    process.stderr.write(line + "\n");
  } else {
    process.stdout.write(line + "\n");
  }
}

const log: Logger = {
  debug: (msg, extra) => emit("debug", msg, extra),
  info:  (msg, extra) => emit("info",  msg, extra),
  warn:  (msg, extra) => emit("warn",  msg, extra),
  error: (msg, extra) => emit("error", msg, extra),
};

export function createRequestLogger(requestId: string, wallet: string | null): Logger {
  const base: LogExtra = { requestId, ...(wallet ? { wallet } : {}) };
  return {
    debug: (msg, extra) => emit("debug", msg, { ...base, ...extra }),
    info:  (msg, extra) => emit("info",  msg, { ...base, ...extra }),
    warn:  (msg, extra) => emit("warn",  msg, { ...base, ...extra }),
    error: (msg, extra) => emit("error", msg, { ...base, ...extra }),
  };
}

export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const requestId = (req.headers["x-request-id"] as string) || crypto.randomUUID();
  const start = Date.now();

  req.requestId = requestId;
  req.log = createRequestLogger(requestId, null);

  res.setHeader("X-Request-Id", requestId);

  res.on("finish", () => {
    const duration = Date.now() - start;
    const wallet = req.body?.walletAddress || req.params?.walletAddress || undefined;
    const entry: LogExtra = {
      requestId,
      method: req.method,
      path: req.originalUrl,
      status: res.statusCode,
      duration,
      ...(wallet ? { wallet } : {}),
      ...(req.privyUserId ? { privyUser: req.privyUserId } : {}),
    };
    if (res.statusCode >= 500) {
      emit("error", "request_complete", entry);
    } else if (res.statusCode >= 400) {
      emit("warn", "request_complete", entry);
    } else {
      emit("info", "request_complete", entry);
    }
  });

  next();
}

export default log;
