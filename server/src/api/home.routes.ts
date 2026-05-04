import { Router, type Request, type Response } from "express";
import { requireAuth } from "../middleware/auth";
import { requireWalletOwnership } from "../middleware/walletOwnership";
import {
  defaultRiskFor,
  getPersona,
  isGoal,
  isRisk,
  isVerbosity,
  savePersona,
  type Goal,
  type Persona,
  type Risk,
  type Verbosity,
} from "../db/personasStore";

const { fetchPortfolio } = require("../data/fetchPortfolio") as {
  fetchPortfolio: (
    wallet: string,
    network?: string
  ) => Promise<{
    solBalance: number;
    tokens: Array<{ symbol?: string; usdValue: number | null }>;
    positions: unknown[];
  }>;
};

const { fetchMarketContext } = require("../data/fetchMarket") as {
  fetchMarketContext: () => Promise<{ sol?: { usd: number } | null } | null>;
};

const { fetchLiveRates } = require("../data/fetchRates") as {
  fetchLiveRates: () => Promise<Record<string, number | string | null>>;
};

const { getRiskAnalysis } = require("../engine/risk/scorer") as {
  getRiskAnalysis: (pool: PoolInput) => RiskAnalysis;
};

interface PoolInput {
  pair: string;
  tvl: number;
  apy: number;
  volume7d: number;
  tokens: string[];
  isStablePair: boolean;
  isBluechip: boolean;
  isMeme: boolean;
  isUnknown: boolean;
  audited: boolean;
  rewardSource: "fees" | "emissions" | "mixed";
  protocol: string;
  action: "stake" | "lend" | "lp";
}

interface RiskAnalysis {
  score: number;
  risk: Risk;
  label: string;
  reasons: string[];
  warnings: string[];
}

export const homeRouter: Router = Router();

// ─── Snapshot ─────────────────────────────────────────────────────────────────

homeRouter.get(
  "/snapshot/:walletAddress",
  requireAuth,
  requireWalletOwnership,
  async (req: Request, res: Response) => {
    const walletAddress = String(req.params.walletAddress ?? "");
    if (!walletAddress) {
      return res.status(400).json({ error: "walletAddress required" });
    }

    const network =
      typeof req.query.network === "string" ? req.query.network : "mainnet";

    try {
      const [portfolio, market] = await Promise.all([
        fetchPortfolio(walletAddress, network),
        fetchMarketContext().catch(() => null),
      ]);

      const solBalance = portfolio?.solBalance ?? 0;
      const solPrice = market?.sol?.usd ?? 0;
      const tokensUsd = (portfolio?.tokens ?? []).reduce(
        (sum, t) => sum + (t.usdValue ?? 0),
        0
      );

      const idleBalanceUsd =
        Math.round((solBalance * solPrice + tokensUsd) * 100) / 100;
      const positionCount = portfolio?.positions?.length ?? 0;

      res.json({
        idleBalanceUsd,
        positionCount,
        dailyStatStub: null,
        topSuggestionStub: null,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("Home snapshot error:", msg);
      res.status(500).json({ error: msg });
    }
  }
);

// ─── Persona (preferences) ────────────────────────────────────────────────────

interface PrefsBody {
  walletAddress?: string;
  goal?: unknown;
  verbosity?: unknown;
  risk?: unknown;
}

homeRouter.post(
  "/preferences",
  requireAuth,
  requireWalletOwnership,
  (req: Request, res: Response) => {
    const body = (req.body ?? {}) as PrefsBody;
    const wallet = String(body.walletAddress ?? "");
    if (!wallet) return res.status(400).json({ error: "walletAddress required" });
    if (!isGoal(body.goal)) {
      return res.status(400).json({
        error: "goal must be one of passive_income | grow | explore",
      });
    }
    if (!isVerbosity(body.verbosity)) {
      return res.status(400).json({
        error: "verbosity must be one of explain | key_insight | execute_report",
      });
    }
    const risk = isRisk(body.risk) ? body.risk : undefined;
    const persona = savePersona(wallet, body.goal, body.verbosity, risk);
    res.json(persona);
  }
);

homeRouter.get(
  "/preferences/:walletAddress",
  requireAuth,
  requireWalletOwnership,
  (req: Request, res: Response) => {
    const wallet = String(req.params.walletAddress ?? "");
    if (!wallet) return res.status(400).json({ error: "walletAddress required" });
    res.json(getPersona(wallet));
  }
);

// ─── Idle suggestion ──────────────────────────────────────────────────────────
// Risk-ranked recommendation across three protocols. Pool stubs are fed into
// the same getRiskAnalysis() the strategy engine uses, then filtered down to
// the persona's risk band.

interface CandidateProtocol {
  protocol: string;
  action: string;
  pair: string;
  apyRateKey: string;
  fallbackApy: number;
  tvl: number;
  rewardSource: "fees" | "emissions" | "mixed";
}

const CANDIDATES: readonly CandidateProtocol[] = [
  {
    protocol: "Marinade",
    action: "Stake SOL → mSOL",
    pair: "mSOL (Marinade)",
    apyRateKey: "marinade_apy",
    fallbackApy: 7.0,
    tvl: 800_000_000,
    rewardSource: "fees",
  },
  {
    protocol: "Kamino",
    action: "Lend SOL",
    pair: "SOL Lending (Kamino)",
    apyRateKey: "kamino_sol_lending_apy",
    fallbackApy: 5.5,
    tvl: 150_000_000,
    rewardSource: "fees",
  },
  {
    protocol: "Jupiter Lend",
    action: "Lend SOL",
    pair: "SOL Lending (Jupiter)",
    apyRateKey: "jup_lend_sol_apy",
    fallbackApy: 6.0,
    tvl: 80_000_000,
    rewardSource: "fees",
  },
];

interface ScoredCandidate {
  protocol: string;
  action: string;
  apy: number;
  score: number;
  risk: Risk;
}

function rateAsNumber(
  rates: Record<string, number | string | null>,
  key: string
): number | null {
  const v = rates[key];
  return typeof v === "number" ? v : null;
}

function scoreCandidates(
  rates: Record<string, number | string | null>
): ScoredCandidate[] {
  return CANDIDATES.map((c) => {
    const liveApy = rateAsNumber(rates, c.apyRateKey);
    const apy = liveApy ?? c.fallbackApy;
    const action = c.action.startsWith("Stake") ? "stake" : "lend";

    const pool: PoolInput = {
      pair: c.pair,
      tvl: c.tvl,
      apy,
      volume7d: c.tvl * 0.1,
      tokens: ["SOL"],
      isStablePair: false,
      isBluechip: true,
      isMeme: false,
      isUnknown: false,
      audited: true,
      rewardSource: c.rewardSource,
      protocol: c.protocol,
      action,
    };

    const analysis = getRiskAnalysis(pool);
    return {
      protocol: c.protocol,
      action: c.action,
      apy,
      score: analysis.score,
      risk: analysis.risk,
    };
  });
}

// Distance from the persona's risk preference. low=0, medium=1, high=2.
const RISK_RANK: Record<Risk, number> = { low: 0, medium: 1, high: 2 };

function rankForPersona(
  candidates: ScoredCandidate[],
  personaRisk: Risk
): ScoredCandidate[] {
  return [...candidates].sort((a, b) => {
    const da = Math.abs(RISK_RANK[a.risk] - RISK_RANK[personaRisk]);
    const db = Math.abs(RISK_RANK[b.risk] - RISK_RANK[personaRisk]);
    if (da !== db) return da - db;                  // closer to preference first
    if (b.score !== a.score) return b.score - a.score; // safer-within-band first
    return b.apy - a.apy;                            // higher APY tiebreaker
  });
}

function rationaleFor(
  persona: Persona | null,
  pick: ScoredCandidate
): string {
  const apyText = `${pick.apy.toFixed(2)}% APY`;
  const verbosity = persona?.verbosity ?? "key_insight";

  if (verbosity === "execute_report") {
    return `Route idle SOL into ${pick.protocol} for ${apyText}.`;
  }

  if (verbosity === "explain") {
    const goal = persona?.goal ?? null;
    const riskNote =
      pick.risk === "low"
        ? "Conservative pick — high TVL, audited protocol."
        : pick.risk === "medium"
          ? "Moderate risk — established protocol with reasonable yield."
          : "Higher upside — accept more protocol risk for the extra yield.";
    if (goal === "passive_income") {
      return `${pick.protocol} earns ${apyText}. ${riskNote}`;
    }
    if (goal === "grow") {
      return `${pick.protocol} compounds at ${apyText}. ${riskNote}`;
    }
    return `${pick.protocol} earns ${apyText}. ${riskNote}`;
  }

  return `${pick.protocol} → ${apyText} (${pick.risk} risk).`;
}

interface IdleSuggestionResponse {
  walletAddress: string;
  idleSol: number;
  persona: Persona | null;
  suggestion: {
    protocol: string;
    action: string;
    rationale: string;
    estimatedApyPct: number;
    preparedTxStub: null;
  } | null;
}

homeRouter.get(
  "/idle-suggestion/:walletAddress",
  requireAuth,
  requireWalletOwnership,
  async (req: Request, res: Response) => {
    const walletAddress = String(req.params.walletAddress ?? "");
    if (!walletAddress) {
      return res.status(400).json({ error: "walletAddress required" });
    }
    const network =
      typeof req.query.network === "string" ? req.query.network : "mainnet";

    try {
      const [portfolio, rates] = await Promise.all([
        fetchPortfolio(walletAddress, network).catch(() => null),
        fetchLiveRates().catch(
          () => ({}) as Record<string, number | string | null>
        ),
      ]);

      const idleSol = portfolio?.solBalance ?? 0;
      const persona = getPersona(walletAddress);

      // No persona yet → fall back to the goal-derived default risk.
      const personaRisk: Risk =
        persona?.risk ?? defaultRiskFor(persona?.goal ?? "explore");

      let suggestion: IdleSuggestionResponse["suggestion"] = null;
      if (idleSol > 0) {
        const ranked = rankForPersona(scoreCandidates(rates), personaRisk);
        const pick = ranked[0];
        if (pick) {
          suggestion = {
            protocol: pick.protocol,
            action: pick.action,
            rationale: rationaleFor(persona, pick),
            estimatedApyPct: parseFloat(pick.apy.toFixed(2)),
            preparedTxStub: null,
          };
        }
      }

      const response: IdleSuggestionResponse = {
        walletAddress,
        idleSol,
        persona,
        suggestion,
      };
      res.json(response);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("Idle suggestion error:", msg);
      res.status(500).json({ error: msg });
    }
  }
);
