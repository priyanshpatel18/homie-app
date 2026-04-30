// @ts-nocheck
/**
 * tokenRegistry — fetches the Jupiter v2 token list and builds a fast
 * symbol → { address, decimals, name } lookup map.
 *
 * Uses Jupiter Token API v2 (api.jup.ag/tokens/v2) with API key auth.
 * Fetches the "verified" tag list for the registry (~fast, curated).
 * Falls back to /tokens/v2/search for live lookup of unknown tokens.
 *
 * Cache: 24 h — token list changes rarely.
 * Fallback: hardcoded well-known tokens for offline / rate-limit situations.
 */

const JUP_API_KEY  = process.env.JUP_API_KEY || "";
const JUP_BASE     = "https://api.jup.ag/tokens/v2";
const CACHE_TTL    = 24 * 60 * 60 * 1000; // 24 h

// Shared request headers — attach API key when available
function jupHeaders() {
  const h = { "Content-Type": "application/json" };
  if (JUP_API_KEY) h["Authorization"] = `Bearer ${JUP_API_KEY}`;
  return h;
}

// ─── Fallback — guarantees core tokens always resolve ────────────────────────
const FALLBACK_TOKENS = {
  SOL:  { address: "So11111111111111111111111111111111111111112",   decimals: 9,  name: "Solana" },
  USDC: { address: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", decimals: 6,  name: "USD Coin" },
  USDT: { address: "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB",  decimals: 6,  name: "Tether USD" },
  MSOL: { address: "mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So",  decimals: 9,  name: "Marinade staked SOL" },
  JUP:  { address: "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN",  decimals: 6,  name: "Jupiter" },
  BONK: { address: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263", decimals: 5,  name: "Bonk" },
  WIF:  { address: "EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm", decimals: 6,  name: "dogwifhat" },
  PYTH: { address: "HZ1JovNiVvGrGNiiYvEozEVgZ58xaU3RKwX8eACQBCt3", decimals: 6,  name: "Pyth Network" },
  RAY:  { address: "4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R", decimals: 6,  name: "Raydium" },
  ORCA: { address: "orcaEKTdK7LKz57vaAYr9QeNsVEPfiu6QeMU1kektZE",   decimals: 6,  name: "Orca" },
  PENGU:{ address: "2zMMhcVQEXDtdE6vsFS7S7D5oUodfJHE8vd1gnBouauv",  decimals: 6,  name: "Pudgy Penguins" },
  JITOSOL: { address: "J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn", decimals: 9, name: "Jito Staked SOL" },
  INF:  { address: "5oVNBeEEQvYi1cX3ir8Dx5n1P7pdxydbGF2X4TxVusJm",  decimals: 9,  name: "Infinity (Sanctum)" },
  USDE: { address: "DEkqHyPN7GMRJ5cArtQFAWefqbZb33Hyf6s5iCwjEonT", decimals: 18, name: "Ethena USDe" },
  SUSDE:{ address: "Eh6XEPhSwoLv5wFApukmnaVSHQ6sAnoD9BmgmwQoN2sN", decimals: 18, name: "Ethena Staked USDe" },
  USDY: { address: "A1KLoBrKBde8Ty9qtNQUtq3C2ortoC3u7twggz7sEto6", decimals: 6,  name: "Ondo US Dollar Yield" },
};

// Tag priority — lower index = higher priority when symbols conflict
const TAG_PRIORITY = ["verified", "strict", "community", "unknown"];

let tokenMap = new Map(
  Object.entries(FALLBACK_TOKENS).map(([sym, tok]) => [sym.toUpperCase(), tok])
);
let fetchedAt = 0;

// ─── Load / refresh registry ──────────────────────────────────────────────────
async function loadTokenRegistry() {
  if (Date.now() - fetchedAt < CACHE_TTL) return; // still fresh

  try {
    // Fetch verified tokens — fast, curated, covers most swap use-cases
    const res = await fetch(`${JUP_BASE}/tag?query=verified`, {
      headers: jupHeaders(),
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const body = await res.json() as any;
    // v2 response shape: array directly, or { tokens: [] }
    const tokens = Array.isArray(body) ? body : (body.tokens ?? []);

    const next = new Map(
      Object.entries(FALLBACK_TOKENS).map(([sym, tok]) => [sym.toUpperCase(), tok])
    );

    for (const t of tokens) {
      if (!t.address || !t.symbol || t.decimals == null) continue;
      const sym      = t.symbol.toUpperCase();
      const existing = next.get(sym);

      if (!existing) {
        next.set(sym, { address: t.address, decimals: t.decimals, name: t.name ?? sym });
        continue;
      }
      const existingPri = tagPriority(existing._tags);
      const newPri      = tagPriority(t.tags);
      if (newPri < existingPri) {
        next.set(sym, { address: t.address, decimals: t.decimals, name: t.name ?? sym, _tags: t.tags });
      }
    }

    tokenMap  = next;
    fetchedAt = Date.now();
    console.log(`[tokenRegistry] Loaded ${tokenMap.size} tokens from Jupiter v2`);
  } catch (err: any) {
    console.warn("[tokenRegistry] Fetch failed — keeping existing map:", err.message);
  }
}

function tagPriority(tags = []) {
  for (let i = 0; i < TAG_PRIORITY.length; i++) {
    if (tags.includes(TAG_PRIORITY[i])) return i;
  }
  return TAG_PRIORITY.length;
}

// ─── Exact lookup ─────────────────────────────────────────────────────────────
function getToken(symbolOrAddress) {
  const upper = symbolOrAddress.toUpperCase();
  if (tokenMap.has(upper)) return tokenMap.get(upper);
  for (const tok of tokenMap.values()) {
    if (tok.address === symbolOrAddress) return tok;
  }
  return null;
}

// ─── Live search via Jupiter v2 API ──────────────────────────────────────────
/**
 * Search Jupiter v2 /tokens/v2/search — covers ALL tokens, not just verified.
 * Returns normalised { symbol, address, decimals, name }[] (up to limit).
 */
async function searchTokenLive(query, limit = 5) {
  if (!query) return [];
  try {
    const url = `${JUP_BASE}/search?query=${encodeURIComponent(query)}`;
    const res = await fetch(url, {
      headers: jupHeaders(),
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = await res.json() as any;
    const tokens = Array.isArray(body) ? body : (body.tokens ?? []);
    return tokens.slice(0, limit).map((t) => ({
      symbol:   t.symbol   ?? "UNKNOWN",
      address:  t.address  ?? "",
      decimals: t.decimals ?? 6,
      name:     t.name     ?? t.symbol ?? "",
    }));
  } catch (err: any) {
    console.warn("[tokenRegistry] Live search failed:", err.message);
    return [];
  }
}

// ─── Local fuzzy search (registry only) ──────────────────────────────────────
const NOISE_WORDS = new Set(["COIN", "TOKEN", "PROTOCOL", "FINANCE", "SWAP", "THE"]);

function searchToken(query, limit = 5) {
  if (!query) return [];

  const raw      = query.toUpperCase().trim();
  const terms    = raw.split(/\s+/).filter((t) => t.length > 0);
  const meaningful = terms.filter((t) => !NOISE_WORDS.has(t));
  const searchTerms = meaningful.length > 0 ? meaningful : terms;
  const primary  = searchTerms.reduce((a, b) => (b.length > a.length ? b : a), searchTerms[0]);

  const exact = [], startSym = [], startName = [], contains = [];

  for (const [sym, tok] of tokenMap.entries()) {
    const nameUp = (tok.name || "").toUpperCase();
    if (sym === raw || sym === primary || tok.address === query) {
      exact.push({ symbol: sym, ...tok });
    } else if (sym.startsWith(primary)) {
      startSym.push({ symbol: sym, ...tok });
    } else if (nameUp.startsWith(primary)) {
      startName.push({ symbol: sym, ...tok });
    } else if (searchTerms.some((t) => sym.includes(t) || nameUp.includes(t))) {
      contains.push({ symbol: sym, ...tok });
    }
  }

  return [...exact, ...startSym, ...startName, ...contains]
    .slice(0, limit)
    .map(({ symbol, address, decimals, name }) => ({ symbol, address, decimals, name }));
}

function listTokens() {
  return Array.from(tokenMap.entries()).map(([symbol, tok]) => ({
    symbol, address: tok.address, decimals: tok.decimals, name: tok.name,
  }));
}

export { loadTokenRegistry, getToken, searchToken, searchTokenLive, listTokens };