import type { HomieConfig } from "./types";

// ─── Internal config store ───────────────────────────────────────────────────

let _config: HomieConfig | null = null;

/**
 * Initialise the SDK. Call once at app startup.
 *
 * ```ts
 * import { init } from "@homie/sdk";
 * init({ baseUrl: "https://api.homie.app" });
 * ```
 */
export function init(config: HomieConfig): void {
  _config = { timeout: 30_000, ...config };
}

/** Get current config — throws if init() wasn't called */
export function getConfig(): HomieConfig {
  if (!_config) throw new Error("[homie-sdk] call init() before using the SDK");
  return _config;
}

// ─── Fetch wrapper ───────────────────────────────────────────────────────────

export interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  body?: unknown;
  signal?: AbortSignal;
  /** Override default timeout (ms) for this request */
  timeout?: number;
}

export class HomieApiError extends Error {
  constructor(
    public status: number,
    public body: unknown,
  ) {
    super(`Homie API error ${status}`);
    this.name = "HomieApiError";
  }
}

/**
 * Thin fetch wrapper that handles JSON, auth headers, and timeouts.
 * Works identically in React Native and web — just uses global fetch.
 */
export async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const cfg = getConfig();
  const url = `${cfg.baseUrl}${path}`;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (cfg.token) headers["Authorization"] = `Bearer ${cfg.token}`;

  // Timeout via AbortSignal.timeout where available, else manual controller
  const timeoutMs = opts.timeout ?? cfg.timeout ?? 30_000;
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  let signal = opts.signal;

  if (!signal) {
    // AbortSignal.timeout is not available in older RN — fallback gracefully
    if (typeof AbortSignal !== "undefined" && "timeout" in AbortSignal) {
      signal = AbortSignal.timeout(timeoutMs);
    } else {
      const controller = new AbortController();
      signal = controller.signal;
      timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    }
  }

  try {
    const res = await fetch(url, {
      method: opts.method ?? (opts.body ? "POST" : "GET"),
      headers,
      body: opts.body ? JSON.stringify(opts.body) : undefined,
      signal,
    });

    if (!res.ok) {
      const body = await res.json().catch(() => res.statusText);
      throw new HomieApiError(res.status, body);
    }

    return (await res.json()) as T;
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}
