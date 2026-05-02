/**
 * Portfolio fetcher — returns SOL balance, SPL token balances,
 * Marinade mSOL staking position, and Kamino lending positions.
 */

const { Connection, PublicKey, LAMPORTS_PER_SOL } = require("@solana/web3.js");
const { TOKEN_PROGRAM_ID } = require("@solana/spl-token");

const RPC_URLS = {
  mainnet: process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com",
  devnet:  "https://api.devnet.solana.com",
};

// Known token mints — expanded to cover all common Solana tokens so
// portfolio shows accurate balances (matching Backpack, Phantom, etc.)
const KNOWN_TOKENS: Record<string, { symbol: string; name: string; decimals: number }> = {
  // Liquid staking tokens
  mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So: { symbol: "mSOL", name: "Marinade staked SOL", decimals: 9 },
  J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn: { symbol: "jitoSOL", name: "Jito Staked SOL", decimals: 9 },
  "5oVNBeEEQvYi1cX3ir8Dx5n1P7pdxydbGF2X4TxVusJm": { symbol: "INF", name: "Infinity (Sanctum)", decimals: 9 },
  bSo13r4TkiE4KumL71LsHTPpL2euBYLFx6h9HP3piy1: { symbol: "bSOL", name: "BlazeStake SOL", decimals: 9 },

  // Stablecoins
  EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v: { symbol: "USDC", name: "USD Coin", decimals: 6 },
  Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB: { symbol: "USDT", name: "Tether USD", decimals: 6 },

  // Wrapped assets
  "7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs": { symbol: "WETH", name: "Wrapped Ether", decimals: 8 },
  "9n4nbM75f5Ui33ZbPYXn59EwSgE8CGsHtAeTH5YFeJ9E": { symbol: "BTC",  name: "Wrapped Bitcoin", decimals: 6 },

  // Major Solana ecosystem tokens
  DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263: { symbol: "BONK", name: "Bonk", decimals: 5 },
  JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN: { symbol: "JUP",  name: "Jupiter", decimals: 6 },
  EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm: { symbol: "WIF",  name: "dogwifhat", decimals: 6 },
  HZ1JovNiVvGrGNiiYvEozEVgZ58xaU3RKwX8eACQBCt3: { symbol: "PYTH", name: "Pyth Network", decimals: 6 },
  "4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R": { symbol: "RAY",  name: "Raydium", decimals: 6 },
  orcaEKTdK7LKz57vaAYr9QeNsVEPfiu6QeMU1kektZE: { symbol: "ORCA", name: "Orca", decimals: 6 },
  "2zMMhcVQEXDtdE6vsFS7S7D5oUodfJHE8vd1gnBouauv": { symbol: "PENGU", name: "Pudgy Penguins", decimals: 6 },
  jtojtomepa8beP8AuQc6eXt5FriJwfFMwQx2v2f9mCL: { symbol: "JTO",  name: "Jito Governance", decimals: 9 },
  rndrizKT3MK1iimdxRdWabcF7Zg7AR5T4nud4EkHBof: { symbol: "RENDER", name: "Render Network", decimals: 8 },
  HeLp6NuQkmYB4pYWo2zYs22mESHXPQYzXbB8n4V98jwC: { symbol: "AI16Z", name: "ai16z", decimals: 9 },
  TNSRxcUxoT9xBG3de7PiJyTDYu7kskLqcpddxnEJAS6: { symbol: "TNSR", name: "Tensor", decimals: 9 },
  MEW1gQWJ3nEXg2qgERiKu7FAFj79PHvQVREQUzScPP5: { symbol: "MEW",  name: "cat in a dogs world", decimals: 5 },
  WENWENvqqNya429ubCdR81ZmD69brwQaaBYY6p3LCpk: { symbol: "WEN",  name: "Wen", decimals: 5 },

  // Ethena / Ondo
  DEkqHyPN7GMRJ5cArtQFAWefqbZb33Hyf6s5iCwjEonT: { symbol: "USDe", name: "Ethena USDe", decimals: 18 },
  Eh6XEPhSwoLv5wFApukmnaVSHQ6sAnoD9BmgmwQoN2sN: { symbol: "sUSDe", name: "Ethena Staked USDe", decimals: 18 },
  A1KLoBrKBde8Ty9qtNQUtq3C2ortoC3u7twggz7sEto6: { symbol: "USDY", name: "Ondo US Dollar Yield", decimals: 6 },
};

const MSOL_MINT = "mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So";

// Kamino main market on mainnet
const KAMINO_MARKET_API = "https://api.kamino.finance/v2/kamino-market";
const KAMINO_OBLIGATIONS_API = "https://api.kamino.finance/v2/obligations";

async function fetchSolBalance(connection, pubkey) {
  const lamports = await connection.getBalance(pubkey);
  return lamports / LAMPORTS_PER_SOL;
}

async function fetchSplBalances(connection, pubkey) {
  const accounts = await connection.getParsedTokenAccountsByOwner(pubkey, {
    programId: TOKEN_PROGRAM_ID,
  });

  const tokens = [];

  for (const { account } of accounts.value) {
    const parsed = account.data?.parsed?.info;
    if (!parsed) continue;

    const mint = parsed.mint;
    const rawAmount = parsed.tokenAmount?.amount;
    const decimals  = parsed.tokenAmount?.decimals ?? 0;
    const uiAmount  = parsed.tokenAmount?.uiAmount ?? 0;

    // Skip zero balances
    if (!rawAmount || rawAmount === "0" || uiAmount === 0) continue;

    const known = KNOWN_TOKENS[mint];
    tokens.push({
      mint,
      symbol:   known?.symbol  ?? "Unknown",
      name:     known?.name    ?? mint.slice(0, 8) + "...",
      decimals: known?.decimals ?? decimals,
      balance:  uiAmount,
      isKnown:  !!known,
    });
  }

  // Sort: known tokens first, then by balance descending
  tokens.sort((a, b) => {
    if (a.isKnown !== b.isKnown) return a.isKnown ? -1 : 1;
    return b.balance - a.balance;
  });

  return tokens;
}

async function fetchMarinadePosition(splTokens) {
  const mSolToken = splTokens.find((t) => t.mint === MSOL_MINT);
  if (!mSolToken || mSolToken.balance === 0) return null;

  const res = await fetch("https://api.marinade.finance/msol/price_sol", {
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) throw new Error(`Marinade price API ${res.status}`);
  const data = await res.json() as any;
  const solPerMsol = data?.value ?? data?.price ?? null;
  if (!solPerMsol) throw new Error("Marinade: no exchange rate in response");

  const stakedSol = mSolToken.balance * solPerMsol;
  return {
    protocol: "Marinade Finance",
    type: "liquid_stake",
    msolBalance: mSolToken.balance,
    solValue: parseFloat(stakedSol.toFixed(6)),
    description: `${mSolToken.balance.toFixed(4)} mSOL = ${stakedSol.toFixed(4)} SOL (staked)`,
  };
}

async function fetchKaminoPositions(walletAddress) {
  try {
    // Kamino exposes obligations by owner address
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

    return obligations.map((ob) => {
      const deposits = (ob.deposits ?? ob.collateral ?? []).map((d) => ({
        token:   d.symbol ?? d.token ?? "?",
        amount:  d.amount ?? d.depositedAmount ?? 0,
        usdValue: d.usdValue ?? d.marketValue ?? null,
      }));

      const borrows = (ob.borrows ?? ob.liabilities ?? []).map((b) => ({
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

/**
 * Main export — returns a full portfolio snapshot.
 */
async function fetchPortfolio(walletAddress, network = "mainnet") {
  const rpc = RPC_URLS[network] ?? RPC_URLS.mainnet;
  const connection = new Connection(rpc, "confirmed");
  const pubkey = new PublicKey(walletAddress);

  // Run SOL balance and SPL balances in parallel
  const [solBalance, splTokens] = await Promise.all([
    fetchSolBalance(connection, pubkey),
    fetchSplBalances(connection, pubkey),
  ]);

  const [marinadeResult, kaminoPositions] = await Promise.all([
    fetchMarinadePosition(splTokens).catch((err) => {
      console.error("[Portfolio] Marinade position fetch failed:", err.message);
      return null;
    }),
    fetchKaminoPositions(walletAddress),
  ]);
  const marinadePosition = marinadeResult;

  // Filter mSOL out of the general token list since we surface it as a position
  const otherTokens = splTokens.filter((t) => t.mint !== MSOL_MINT);

  return {
    walletAddress,
    solBalance,
    tokens: otherTokens,
    positions: [
      ...(marinadePosition ? [marinadePosition] : []),
      ...kaminoPositions,
    ],
    fetchedAt: new Date().toISOString(),
  };
}

export { fetchPortfolio };