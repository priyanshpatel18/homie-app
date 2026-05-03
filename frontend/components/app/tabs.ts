export const APP_TABS = ["home", "positions", "automations", "chat"] as const;
export type AppTab = (typeof APP_TABS)[number];

export function isAppTab(value: unknown): value is AppTab {
  return typeof value === "string" && (APP_TABS as readonly string[]).includes(value);
}
