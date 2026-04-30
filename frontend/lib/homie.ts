import { init } from "@homie/sdk";

let initialized = false;
let currentToken: string | null = null;

export const HOMIE_API_URL =
  process.env.NEXT_PUBLIC_HOMIE_API_URL ?? "http://localhost:3000";

export function ensureHomieInit(): void {
  if (initialized) return;
  init({ baseUrl: HOMIE_API_URL, token: currentToken ?? undefined });
  initialized = true;
}

/**
 * Set the Privy bearer token used for SDK requests. Call this whenever the
 * auth provider issues a new token (login, refresh, foreground resume) and
 * pass `null` on logout. Re-runs `init()` so the SDK picks up the new value.
 *
 * Safe to call before `ensureHomieInit()` — the token is stashed and applied
 * once init runs.
 */
export function setHomieAuthToken(token: string | null): void {
  currentToken = token;
  if (initialized) {
    init({ baseUrl: HOMIE_API_URL, token: token ?? undefined });
  }
}
