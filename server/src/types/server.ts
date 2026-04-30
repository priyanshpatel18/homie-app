/**
 * server.ts — request-scoped Express types.
 *
 * Augments Express.Request with:
 *   - privyUserId  (set by requireAuth)
 *   - requestId    (set by requestLogger)
 *   - log          (set by requestLogger — request-scoped structured logger)
 *   - _cgPrices    (used by the price proxy to stash partial CoinGecko hits)
 */

declare global {
  namespace Express {
    interface Request {
      privyUserId?: string;
      requestId?: string;
      log: Logger;
      _cgPrices?: Record<string, number>;
    }
  }
}

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogExtra {
  [key: string]: unknown;
}

export interface Logger {
  debug(msg: string, extra?: LogExtra): void;
  info(msg: string, extra?: LogExtra): void;
  warn(msg: string, extra?: LogExtra): void;
  error(msg: string, extra?: LogExtra): void;
}
