/**
 * Portfolio fetcher — Helius DAS API (Digital Asset Standard).
 *
 * Uses getAssetsByOwner with showFungibleTokens:true — the same API that
 * Phantom, Backpack, and Solflare use. Returns metadata (symbol, name, logo)
 * for ALL tokens in a single call, eliminating the need for a hardcoded
 * KNOWN_TOKENS list.
 *
 * Falls back to the old getParsedTokenAccountsByOwner RPC if DAS fails.
 *
 * Downstream shape is unchanged:
 *   { walletAddress, solBalance, tokens: [...], positions: [...], fetchedAt }
 */

const { Connection, PublicKey, LAMPORTS_PER_SOL } = require("@solana/web3.js");
const { TOKEN_PROGRAM_ID } = require("@solana/spl-token");

const HELIUS_RPC = process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com";

const RPC_URLS: Record<string, string> = {
  mainnet: HELIUS_RPC,
  devnet:  "https://api.devnet.solana.com",
};

// Mints we recognise as liquid staking tokens — surfaced as "positions"
const LST_MINTS: Record<string, { protocol: string; type: string }> = {
  mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So:  { protocol: "Marinade Finance", type: "liquid_stake" },
  J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn: { protocol: "Jito",             type: "liquid_stake" },
  "5oVNBeEEQvYi1cX3ir8Dx5n1P7pdxydbGF2X4TxVusJm": { protocol: "Sanctum (INF)",    type: "liquid_stake" },
  bSo13r4TkiE4KumL71LsHTPpL2euBYLFx6h9HP3piy1:   { protocol: "BlazeStake",       type: "liquid_stake" },
};

const MSOL_MINT = "mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So";

// Kamino obligations API
const KAMINO_OBLIGATIONS_API = "https://api.kamino.finance/v2/obligations";

// ─── Helius DAS: getAssetsByOwner ────────────────────────────────────────────

interface DasAsset {
  id: string;
  interface: string;
  content?: {
    metadata?: { symbol?: string; name?: string };
    links?: { image?: string };
  };
  token_info?: {
    balance?: number;
    decimals?: number;
    price_info?: { price_per_token?: number; total_price?: number };
  };
}

async function fetchViaDas(walletAddress: string, rpcUrl: string) {
  const body = {
    jsonrpc: "2.0",
    id: "homie-portfolio",
    method: "getAssetsByOwner",
    params: {
      ownerAddress: walletAddress,
      page: 1,
      limit: 1000,
      displayOptions: {
        showFungible: true,       // THIS is the correct flag — NOT showFungibleTokens
        showNativeBalance: true,
      },
    },
  };

  const res = await fetch(rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(12_000),
  });

  if (!res.ok) throw new Error(`DAS HTTP ${res.status}`);

  const json = await res.json() as any;
  if (json.error) throw new Error(`DAS error: ${json.error.message ?? JSON.stringify(json.error)}`);

  const result = json.result ?? {};
  const items: DasAsset[] = result.items ?? [];
  const nativeBalance = result.nativeBalance;

  // SOL balance — from DAS nativeBalance or computed
  const solBalance = nativeBalance
    ? (nativeBalance.lamports ?? 0) / LAMPORTS_PER_SOL
    : 0;

  // Filter to fungible tokens only (FungibleToken + FungibleAsset — mSOL comes as FungibleAsset)
  const fungibles = items.filter(
    (a) => a.interface === "FungibleToken" || a.interface === "FungibleAsset"
  );

  const tokens: any[] = [];

  for (const asset of fungibles) {
    const mint = asset.id;
    const decimals = asset.token_info?.decimals ?? 0;
    const rawBalance = asset.token_info?.balance ?? 0;
    const balance = rawBalance / (10 ** decimals);

    // Skip zero/dust balances
    if (balance <= 0) continue;

    const symbol = asset.content?.metadata?.symbol ?? "Unknown";
    const name = asset.content?.metadata?.name ?? mint.slice(0, 8) + "...";

    // Spam filtering: skip airdropped scam tokens
    // - 0 decimals + balance exactly 1 = classic airdrop spam pattern
    // - Names containing URLs, non-ASCII, or suspicious patterns
    if (decimals === 0 && rawBalance <= 2) continue;
    if (/https?:|\.com|\.xyz|\.io|0x[Ff]{2}/i.test(name)) continue;
    if (/https?:|\.com|\.xyz|\.io/i.test(symbol)) continue;

    const logoUri = asset.content?.links?.image ?? null;

    // Price info from DAS (Helius enriches this automatically)
    const pricePerToken = asset.token_info?.price_info?.price_per_token ?? null;
    const usdValue = asset.token_info?.price_info?.total_price ?? (pricePerToken ? balance * pricePerToken : null);

    tokens.push({
      mint,
      symbol,
      name,
      decimals,
      balance,
      logoUri,
      usdValue,
      isKnown: symbol !== "Unknown",
    });
  }

  // Sort: tokens with USD value first (descending), then by balance
  tokens.sort((a: any, b: any) => {
    if (a.usdValue && b.usdValue) return b.usdValue - a.usdValue;
    if (a.usdValue) return -1;
    if (b.usdValue) return 1;
    return b.balance - a.balance;
  });

  return { solBalance, tokens };
}

// ─── Fallback: old getParsedTokenAccountsByOwner RPC ─────────────────────────
// Used when DAS is unavailable (non-Helius RPC, devnet, etc.)

async function fetchViaRpc(walletAddress: string, rpcUrl: string) {
  const connection = new Connection(rpcUrl, "confirmed");
  const pubkey = new PublicKey(walletAddress);

  const solBalance = (await connection.getBalance(pubkey)) / LAMPORTS_PER_SOL;

  const accounts = await connection.getParsedTokenAccountsByOwner(pubkey, {
    programId: TOKEN_PROGRAM_ID,
  });

  const tokens: any[] = [];

  for (const { account } of accounts.value) {
    const parsed = account.data?.parsed?.info;
    if (!parsed) continue;

    const mint = parsed.mint;
    const rawAmount = parsed.tokenAmount?.amount;
    const decimals = parsed.tokenAmount?.decimals ?? 0;
    const uiAmount = parsed.tokenAmount?.uiAmount ?? 0;

    if (!rawAmount || rawAmount === "0" || uiAmount === 0) continue;

    tokens.push({
      mint,
      symbol: "Unknown",
      name: mint.slice(0, 8) + "...",
      decimals,
      balance: uiAmount,
      logoUri: null,
      usdValue: null,
      isKnown: false,
    });
  }

  tokens.sort((a: any, b: any) => b.balance - a.balance);

  return { solBalance, tokens };
}

// ─── LST position extraction ─────────────────────────────────────────────────
// Extracts known LSTs (mSOL, jitoSOL, INF, bSOL) from the token list and
// surfaces them as "positions" for the UI health card and strategy engine.

async function extractLstPositions(tokens: any[]) {
  const positions: any[] = [];
  const remaining: any[] = [];

  for (const tok of tokens) {
    const lstInfo = LST_MINTS[tok.mint];
    if (lstInfo && tok.balance > 0) {
      // For mSOL, fetch the SOL exchange rate from Marinade
      let solValue = null;
      if (tok.mint === MSOL_MINT) {
        try {
          const res = await fetch("https://api.marinade.finance/msol/price_sol", {
            signal: AbortSignal.timeout(5000),
          });
          if (res.ok) {
            const data = await res.json() as any;
            const solPerMsol = data?.value ?? data?.price ?? null;
            if (solPerMsol) solValue = parseFloat((tok.balance * solPerMsol).toFixed(6));
          }
        } catch {}
      }

      positions.push({
        protocol: lstInfo.protocol,
        type: lstInfo.type,
        mint: tok.mint,
        symbol: tok.symbol,
        msolBalance: tok.mint === MSOL_MINT ? tok.balance : undefined,
        lstBalance: tok.balance,
        solValue,
        usdValue: tok.usdValue ?? null,
        description: `${tok.balance.toFixed(4)} ${tok.symbol}${solValue ? ` = ${solValue.toFixed(4)} SOL (staked)` : " (staked)"}`,
      });
    } else {
      remaining.push(tok);
    }
  }

  return { positions, remaining };
}

// ─── Kamino lending positions ─────────────────────────────────────────────────

async function fetchKaminoPositions(walletAddress: string) {
  try {
    const res = await fetch(
      `${KAMINO_OBLIGATIONS_API}?wallet=${walletAddress}&status=open`,
      {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(8000),
      }
    );

    if (!res.ok) return [];

    const data = await res.json() as any;
    const obligations = Array.isArray(data) ? data : data?.obligations ?? data?.data ?? [];

    return obligations.map((ob: any) => {
      const deposits = (ob.deposits ?? ob.collateral ?? []).map((d: any) => ({
        token:   d.symbol ?? d.token ?? "?",
        amount:  d.amount ?? d.depositedAmount ?? 0,
        usdValue: d.usdValue ?? d.marketValue ?? null,
      }));

      const borrows = (ob.borrows ?? ob.liabilities ?? []).map((b: any) => ({
        token:    b.symbol ?? b.token ?? "?",
        amount:   b.amount ?? b.borrowedAmount ?? 0,
        usdValue: b.usdValue ?? b.marketValue ?? null,
      }));

      return {
        protocol:    "Kamino Lend",
        type:        "lending",
        obligationId: ob.obligationId ?? ob.id ?? null,
        deposits,
        borrows,
        netApy:      ob.netApy ?? ob.net_apy ?? null,
        healthFactor: ob.healthFactor ?? ob.loanToValue ?? null,
      };
    });
  } catch {
    return [];
  }
}

// ─── Main export ─────────────────────────────────────────────────────────────

async function fetchPortfolio(walletAddress: string, network = "mainnet") {
  const rpcUrl = RPC_URLS[network] ?? RPC_URLS.mainnet;
  const isHelius = rpcUrl.includes("helius");

  // Primary: Helius DAS API (fast, returns metadata for all tokens)
  // Fallback: old RPC method (slower, no metadata)
  let solBalance: number;
  let allTokens: any[];

  if (isHelius && network === "mainnet") {
    try {
      const dasResult = await fetchViaDas(walletAddress, rpcUrl);
      solBalance = dasResult.solBalance;
      allTokens = dasResult.tokens;
      console.log(`[Portfolio] DAS: ${allTokens.length} tokens found for ${walletAddress.slice(0,8)}...`);
    } catch (err: any) {
      console.warn("[Portfolio] DAS failed, falling back to RPC:", err.message);
      const rpcResult = await fetchViaRpc(walletAddress, rpcUrl);
      solBalance = rpcResult.solBalance;
      allTokens = rpcResult.tokens;
    }
  } else {
    const rpcResult = await fetchViaRpc(walletAddress, rpcUrl);
    solBalance = rpcResult.solBalance;
    allTokens = rpcResult.tokens;
  }

  // Extract LST positions and Kamino positions in parallel
  const [{ positions: lstPositions, remaining: otherTokens }, kaminoPositions] = await Promise.all([
    extractLstPositions(allTokens),
    fetchKaminoPositions(walletAddress),
  ]);

  return {
    walletAddress,
    solBalance,
    tokens: otherTokens,
    positions: [
      ...lstPositions,
      ...kaminoPositions,
    ],
    fetchedAt: new Date().toISOString(),
  };
}

export { fetchPortfolio };