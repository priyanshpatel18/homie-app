import db from "./database";

export type Goal = "passive_income" | "grow" | "explore";
export type Verbosity = "explain" | "key_insight" | "execute_report";

export interface UserPreferences {
  walletAddress: string;
  goal: Goal;
  verbosity: Verbosity;
  updatedAt: number;
}

export const GOALS: readonly Goal[] = ["passive_income", "grow", "explore"];
export const VERBOSITIES: readonly Verbosity[] = [
  "explain",
  "key_insight",
  "execute_report",
];

export function isGoal(v: unknown): v is Goal {
  return typeof v === "string" && (GOALS as readonly string[]).includes(v);
}

export function isVerbosity(v: unknown): v is Verbosity {
  return typeof v === "string" && (VERBOSITIES as readonly string[]).includes(v);
}

const upsertStmt = db.prepare(`
  INSERT INTO user_preferences (wallet, goal, verbosity, updated_at)
  VALUES (?, ?, ?, ?)
  ON CONFLICT(wallet) DO UPDATE SET
    goal = excluded.goal,
    verbosity = excluded.verbosity,
    updated_at = excluded.updated_at
`);

const selectStmt = db.prepare(
  "SELECT wallet, goal, verbosity, updated_at FROM user_preferences WHERE wallet = ?"
);

interface Row {
  wallet: string;
  goal: string;
  verbosity: string;
  updated_at: number;
}

export function savePreferences(
  walletAddress: string,
  goal: Goal,
  verbosity: Verbosity
): UserPreferences {
  const now = Date.now();
  upsertStmt.run(walletAddress, goal, verbosity, now);
  return { walletAddress, goal, verbosity, updatedAt: now };
}

export function getPreferences(
  walletAddress: string
): UserPreferences | null {
  const row = selectStmt.get(walletAddress) as Row | undefined;
  if (!row) return null;
  if (!isGoal(row.goal) || !isVerbosity(row.verbosity)) return null;
  return {
    walletAddress: row.wallet,
    goal: row.goal,
    verbosity: row.verbosity,
    updatedAt: row.updated_at,
  };
}
