import { PrivyClient } from "@privy-io/server-auth";
import type { Request, Response, NextFunction } from "express";

const PRIVY_CONFIGURED = !!(process.env.PRIVY_APP_ID && process.env.PRIVY_APP_SECRET);

const privy = PRIVY_CONFIGURED
  ? new PrivyClient(process.env.PRIVY_APP_ID!, process.env.PRIVY_APP_SECRET!)
  : null;

/**
 * Verifies the Privy JWT in the Authorization header.
 * Attaches req.privyUserId on success.
 * Returns 401 if token is missing, invalid, or expired.
 * When PRIVY_APP_ID/SECRET are not configured, skips verification (dev mode).
 */
export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  if (!PRIVY_CONFIGURED) {
    req.privyUserId = "dev-user";
    next();
    return;
  }

  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : null;

  if (!token) {
    res.status(401).json({ error: "Authorization required" });
    return;
  }

  try {
    const claims = await privy!.verifyAuthToken(token);
    req.privyUserId = claims.userId;
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired session — please log in again" });
  }
}
