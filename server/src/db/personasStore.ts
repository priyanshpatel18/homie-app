import db from "./database";

export type Goal = "passive_income" | "grow" | "explore";
export type Verbosity = "explain" | "key_insight" | "execute_report";
export type Risk = "low" | "medium" | "high";

export interface Persona {
  walletAddress: string;
  goal: Goal;
  verbosity: Verbosity;
  risk: Risk;
  updatedAt: number;
}

export const GOALS: readonly Goal[] = ["passive_income", "grow", "explore"];
export const VERBOSITIES: readonly Verbosity[] = [
  "explain",
  "key_insight",
  "execute_report",
];
export const RISKS: readonly Risk[] = ["low", "medium", "high"];

export function isGoal(v: unknown): v is Goal {
  return typeof v === "string" && (GOALS as readonly string[]).includes(v);
}

export function isVerbosity(v: unknown): v is Verbosity {
  return typeof v === "string" && (VERBOSITIES as readonly string[]).includes(v);
}

export function isRisk(v: unknown): v is Risk {
  return typeof v === "string" && (RISKS as readonly string[]).includes(v);
}

// Map a goal to a sensible default risk band when the client doesn't supply
// one. The onboarding sheet only asks for goal + verbosity today.
export function defaultRiskFor(goal: Goal): Risk {
  switch (goal) {
    case "passive_income":
      return "low";
    case "explore":
      return "medium";
    case "grow":
      return "high";
  }
}

const upsertStmt = db.prepare(`
  INSERT INTO personas (wallet, goal, verbosity, risk, updated_at)
  VALUES (?, ?, ?, ?, ?)
  ON CONFLICT(wallet) DO UPDATE SET
    goal       = excluded.goal,
    verbosity  = excluded.verbosity,
    risk       = excluded.risk,
    updated_at = excluded.updated_at
`);

const selectStmt = db.prepare(
  "SELECT wallet, goal, verbosity, risk, updated_at FROM personas WHERE wallet = ?"
);

interface Row {
  wallet: string;
  goal: string;
  verbosity: string;
  risk: string;
  updated_at: number;
}

export function savePersona(
  walletAddress: string,
  goal: Goal,
  verbosity: Verbosity,
  risk?: Risk
): Persona {
  const now = Date.now();
  const finalRisk = risk ?? defaultRiskFor(goal);
  upsertStmt.run(walletAddress, goal, verbosity, finalRisk, now);
  return {
    walletAddress,
    goal,
    verbosity,
    risk: finalRisk,
    updatedAt: now,
  };
}

export function getPersona(walletAddress: string): Persona | null {
  const row = selectStmt.get(walletAddress) as Row | undefined;
  if (!row) return null;
  if (!isGoal(row.goal) || !isVerbosity(row.verbosity) || !isRisk(row.risk)) {
    return null;
  }
  return {
    walletAddress: row.wallet,
    goal: row.goal,
    verbosity: row.verbosity,
    risk: row.risk,
    updatedAt: row.updated_at,
  };
}
