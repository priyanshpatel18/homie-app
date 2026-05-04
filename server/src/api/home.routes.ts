import { Router, type Request, type Response } from "express";
import { requireAuth } from "../middleware/auth";
import { requireWalletOwnership } from "../middleware/walletOwnership";
import {
  getPreferences,
  isGoal,
  isVerbosity,
  savePreferences,
  type Goal,
  type Verbosity,
} from "../db/preferencesStore";

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

export const homeRouter: Router = Router();

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

// ─── Preferences ──────────────────────────────────────────────────────────────

interface PrefsBody {
  walletAddress?: string;
  goal?: unknown;
  verbosity?: unknown;
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
    const prefs = savePreferences(wallet, body.goal, body.verbosity);
    res.json(prefs);
  }
);

homeRouter.get(
  "/preferences/:walletAddress",
  requireAuth,
  requireWalletOwnership,
  (req: Request, res: Response) => {
    const wallet = String(req.params.walletAddress ?? "");
    if (!wallet) return res.status(400).json({ error: "walletAddress required" });
    const prefs = getPreferences(wallet);
    res.json(prefs);
  }
);

// ─── Idle suggestion ──────────────────────────────────────────────────────────

interface IdleSuggestionResponse {
  walletAddress: string;
  idleBalanceUsd: number;
  suggestion: {
    protocol: string;
    action: string;
    amountUsd: number;
    rationale: string;
    apy: number | null;
  } | null;
  goal: Goal | null;
  verbosity: Verbosity | null;
}

interface SuggestionCandidate {
  protocol: string;
  action: string;
  apy: number | null;
}

function pickSuggestion(
  goal: Goal | null,
  rates: Record<string, number | string | null>
): SuggestionCandidate {
  const num = (k: string): number | null => {
    const v = rates[k];
    return typeof v === "number" ? v : null;
  };

  const marinade = num("marinade_apy");
  const jito = num("jitosol_apy");
  const sanctumInf = num("sanctum_inf_apy");
  const kaminoSolLend = num("kamino_sol_lending_apy");
  const kaminoUsdcLend = num("kamino_usdc_lending_apy");
  const kaminoLp = num("kamino_sol_usdc_lp_apy");
  const jupSolLend = num("jup_lend_sol_apy");
  const jupUsdcLend = num("jup_lend_usdc_apy");

  if (goal === "passive_income") {
    const stables: SuggestionCandidate[] = [
      { protocol: "Kamino", action: "Lend USDC", apy: kaminoUsdcLend },
      { protocol: "Jupiter Lend", action: "Lend USDC", apy: jupUsdcLend },
    ];
    const best = stables
      .filter((c): c is SuggestionCandidate & { apy: number } => c.apy != null)
      .sort((a, b) => b.apy - a.apy)[0];
    if (best) return best;
    return { protocol: "Marinade", action: "Stake SOL → mSOL", apy: marinade };
  }

  if (goal === "grow") {
    const growth: SuggestionCandidate[] = [
      { protocol: "Kamino", action: "SOL/USDC LP", apy: kaminoLp },
      { protocol: "Sanctum", action: "Stake SOL → INF", apy: sanctumInf },
      { protocol: "Jito", action: "Stake SOL → jitoSOL", apy: jito },
    ];
    const best = growth
      .filter((c): c is SuggestionCandidate & { apy: number } => c.apy != null)
      .sort((a, b) => b.apy - a.apy)[0];
    if (best) return best;
    return { protocol: "Marinade", action: "Stake SOL → mSOL", apy: marinade };
  }

  // explore (or unset) — recommend the safest, most liquid option
  const liquid: SuggestionCandidate[] = [
    { protocol: "Marinade", action: "Stake SOL → mSOL", apy: marinade },
    { protocol: "Jito", action: "Stake SOL → jitoSOL", apy: jito },
    { protocol: "Kamino", action: "Lend SOL", apy: kaminoSolLend },
    { protocol: "Jupiter Lend", action: "Lend SOL", apy: jupSolLend },
  ];
  const best = liquid
    .filter((c): c is SuggestionCandidate & { apy: number } => c.apy != null)
    .sort((a, b) => b.apy - a.apy)[0];
  return best ?? { protocol: "Marinade", action: "Stake SOL → mSOL", apy: null };
}

function rationaleFor(
  goal: Goal | null,
  verbosity: Verbosity | null,
  candidate: SuggestionCandidate,
  amountUsd: number
): string {
  const apyText = candidate.apy != null ? `${candidate.apy.toFixed(2)}% APY` : "live yield";
  const amount = `$${amountUsd.toFixed(2)}`;

  if (verbosity === "execute_report") {
    return `Put ${amount} into ${candidate.protocol} for ${apyText}.`;
  }

  if (verbosity === "explain") {
    if (goal === "passive_income") {
      return `${amount} idle could earn ${apyText} on ${candidate.protocol}. Stable yield, withdraw any time.`;
    }
    if (goal === "grow") {
      return `${amount} idle could compound at ${apyText} via ${candidate.protocol}. Slightly more risk, more upside.`;
    }
    return `${amount} idle could earn ${apyText} on ${candidate.protocol}. Liquid and easy to unwind while you explore.`;
  }

  // key_insight (default)
  return `${amount} idle → ${apyText} on ${candidate.protocol}.`;
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
      const [portfolio, market, rates] = await Promise.all([
        fetchPortfolio(walletAddress, network).catch(() => null),
        fetchMarketContext().catch(() => null),
        fetchLiveRates().catch(() => ({} as Record<string, number | string | null>)),
      ]);

      const solBalance = portfolio?.solBalance ?? 0;
      const solPrice = market?.sol?.usd ?? 0;
      const tokensUsd = (portfolio?.tokens ?? []).reduce(
        (sum, t) => sum + (t.usdValue ?? 0),
        0
      );
      const idleBalanceUsd =
        Math.round((solBalance * solPrice + tokensUsd) * 100) / 100;

      const prefs = getPreferences(walletAddress);
      const goal = prefs?.goal ?? null;
      const verbosity = prefs?.verbosity ?? null;

      let suggestion: IdleSuggestionResponse["suggestion"] = null;
      if (idleBalanceUsd > 0) {
        const candidate = pickSuggestion(goal, rates);
        suggestion = {
          protocol: candidate.protocol,
          action: candidate.action,
          amountUsd: idleBalanceUsd,
          apy: candidate.apy,
          rationale: rationaleFor(goal, verbosity, candidate, idleBalanceUsd),
        };
      }

      const response: IdleSuggestionResponse = {
        walletAddress,
        idleBalanceUsd,
        suggestion,
        goal,
        verbosity,
      };
      res.json(response);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("Idle suggestion error:", msg);
      res.status(500).json({ error: msg });
    }
  }
);
