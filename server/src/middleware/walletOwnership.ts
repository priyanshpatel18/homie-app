/**
 * walletOwnership.ts — verify the authenticated Privy user owns the wallet.
 *
 * After requireAuth populates req.privyUserId, this middleware checks that
 * the wallet address in the request (body or params) is actually linked to
 * that Privy user.
 *
 * If PRIVY_APP_ID / PRIVY_APP_SECRET are not set (local dev), this is a
 * pass-through so development isn't blocked.
 */

import { PrivyClient } from "@privy-io/server-auth";
import type { Request, Response, NextFunction } from "express";

let privy: PrivyClient | null = null;
if (process.env.PRIVY_APP_ID && process.env.PRIVY_APP_SECRET) {
  privy = new PrivyClient(process.env.PRIVY_APP_ID, process.env.PRIVY_APP_SECRET);
}

interface CacheEntry {
  wallets: Set<string>;
  ts: number;
}
const walletCache = new Map<string, CacheEntry>();
const CACHE_TTL = 5 * 60 * 1000;

async function getLinkedWallets(privyUserId: string): Promise<Set<string> | null> {
  const cached = walletCache.get(privyUserId);
  if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.wallets;

  try {
    const user = await privy!.getUser(privyUserId);
    const wallets = new Set<string>(
      (user.linkedAccounts || [])
        .filter((a: any) => a.type === "wallet" && a.address)
        .map((a: any) => String(a.address).toLowerCase())
    );
    walletCache.set(privyUserId, { wallets, ts: Date.now() });
    return wallets;
  } catch {
    return null;
  }
}

export async function requireWalletOwnership(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  if (!privy) { next(); return; }

  const wallet = (req.body?.walletAddress || req.params?.walletAddress || "").toLowerCase();
  if (!wallet) { next(); return; }

  const userId = req.privyUserId;
  if (!userId) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  const linkedWallets = await getLinkedWallets(userId);
  if (linkedWallets === null) {
    const logger = req.log || console;
    logger.warn("wallet_ownership_check_skipped", {
      privyUser: userId,
      wallet,
      reason: "privy_lookup_failed",
    });
    next();
    return;
  }

  if (!linkedWallets.has(wallet)) {
    res.status(403).json({ error: "Wallet does not belong to authenticated user" });
    return;
  }

  next();
}
