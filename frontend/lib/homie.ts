import { init } from "@homie/sdk";

let initialized = false;

export const HOMIE_API_URL =
  process.env.NEXT_PUBLIC_HOMIE_API_URL ?? "http://localhost:3000";

export function ensureHomieInit(): void {
  if (initialized) return;
  init({ baseUrl: HOMIE_API_URL });
  initialized = true;
}
