import { request } from "./client";
import type {
  Position,
  RegisterPositionRequest,
  ActivityEntry,
  LogActivityRequest,
  UpdateActivityRequest,
  AgentSettings,
  AutopilotConfig,
} from "./types";

// ─── Positions ────────────────────────────────────────────────────────────────

export async function fetchPositions(walletAddress: string): Promise<Position[]> {
  const res = await request<{ count: number; positions: Position[] }>(
    `/api/monitor/positions/${walletAddress}`,
  );
  return res.positions;
}

export async function registerPosition(
  data: RegisterPositionRequest,
): Promise<Position> {
  const res = await request<{ success: true; position: Position }>(
    "/api/monitor/positions",
    { body: data },
  );
  return res.position;
}

export async function closePosition(
  walletAddress: string,
  positionId: string,
): Promise<void> {
  await request<{ success: true }>(
    `/api/monitor/positions/${walletAddress}/${positionId}`,
    { method: "DELETE" },
  );
}

// ─── Activity log ─────────────────────────────────────────────────────────────

export async function fetchActivityLog(
  walletAddress: string,
  limit = 30,
): Promise<ActivityEntry[]> {
  const res = await request<{ count: number; entries: ActivityEntry[] }>(
    `/api/monitor/activity/${walletAddress}?limit=${limit}`,
  );
  return res.entries;
}

export async function logActivity(
  data: LogActivityRequest,
): Promise<ActivityEntry> {
  const res = await request<{ success: true; entry: ActivityEntry }>(
    "/api/monitor/activity",
    { body: data },
  );
  return res.entry;
}

export async function updateActivity(
  walletAddress: string,
  id: string,
  updates: UpdateActivityRequest,
): Promise<ActivityEntry> {
  const res = await request<{ success: true; entry: ActivityEntry }>(
    `/api/monitor/activity/${walletAddress}/${id}`,
    { method: "PUT", body: updates },
  );
  return res.entry;
}

// ─── Agent settings ───────────────────────────────────────────────────────────

export async function fetchAgentSettings(
  walletAddress: string,
): Promise<AgentSettings> {
  const res = await request<{ settings: AgentSettings }>(
    `/api/monitor/settings/${walletAddress}`,
  );
  return res.settings;
}

export async function saveAgentSettings(
  walletAddress: string,
  settings: Partial<AgentSettings>,
): Promise<AgentSettings> {
  const res = await request<{ success: true; settings: AgentSettings }>(
    `/api/monitor/settings/${walletAddress}`,
    { body: settings },
  );
  return res.settings;
}

// ─── Autopilot ────────────────────────────────────────────────────────────────

export async function fetchAutopilot(
  walletAddress: string,
): Promise<AutopilotConfig | null> {
  const res = await request<{ config: AutopilotConfig | null }>(
    `/api/monitor/autopilot/${walletAddress}`,
  );
  return res.config;
}

export async function saveAutopilot(
  walletAddress: string,
  config: AutopilotConfig | null,
): Promise<void> {
  await request<{ success: true }>("/api/monitor/autopilot", {
    body: { walletAddress, config },
  });
}
