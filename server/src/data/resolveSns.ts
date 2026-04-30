// @ts-nocheck
/**
 * Resolves Solana Name Service (.sol) domains to public keys.
 * Uses the Bonfida SNS HTTP proxy — no extra package needed.
 *
 * Handles:
 *  - Raw base58 addresses  → returned as-is
 *  - "toly.sol" / "toly"   → direct SNS lookup
 *  - "raj gokal"           → tries name-derived domain candidates, returns all owned domains
 */

const SNS_PROXY = "https://sns-sdk-proxy.bonfida.workers.dev";
const BASE58_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

async function snsGet(path) {
  const res = await fetch(`${SNS_PROXY}${path}`, {
    headers: { "User-Agent": "homie-server/1.0" },
    signal: AbortSignal.timeout(6_000),
  });
  if (!res.ok) throw new Error(`SNS HTTP ${res.status} for ${path}`);
  return res.json();
}

// ─── Resolve a single .sol domain → address ──────────────────────────────────
async function resolveDomain(domain) {
  const clean = domain.toLowerCase().replace(/\.sol$/, "");
  const data  = await snsGet(`/resolve/${clean}`);
  if (data.s !== "ok" || !data.result) throw new Error(`"${clean}.sol" not found`);
  return data.result; // base58 public key
}

// ─── Get all .sol domains owned by an address ────────────────────────────────
async function getDomainsForAddress(address) {
  try {
    const data = await snsGet(`/domains/${address}`);
    if (data.s !== "ok" || !Array.isArray(data.result)) return [];
    // Each item is { domain: "toly", address: "..." }
    return data.result.map((d) => d.domain + ".sol");
  } catch {
    return [];
  }
}

// ─── Build domain candidates from a human name ───────────────────────────────
function nameToCandidates(name) {
  const parts = name.toLowerCase().trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return [];
  const [first, ...rest] = parts;
  const last = rest[rest.length - 1];
  const candidates = new Set();
  candidates.add(parts.join(""));          // rajgokal
  candidates.add(first);                   // raj
  if (last) candidates.add(last);          // gokal
  if (last) candidates.add(first + last);  // rajgokal (explicit)
  candidates.add(parts.join("-"));         // raj-gokal
  candidates.add(parts.join("_"));         // raj_gokal
  return [...candidates];
}

// ─── Main export ─────────────────────────────────────────────────────────────
/**
 * Resolve any input to { address, domains[] }.
 *
 * Input can be:
 *  - A base58 address  → { address, domains: [] (or fetched) }
 *  - "toly" / "toly.sol" → exact SNS lookup + reverse domain fetch
 *  - "raj gokal"        → tries name candidates, returns first match + all domains
 *
 * Throws if nothing resolves.
 */
async function resolveSnsAddress(input) {
  const trimmed = (input || "").trim();
  if (!trimmed) throw new Error("No address or domain provided.");

  // Raw base58 public key — skip SNS, just fetch domains
  if (BASE58_RE.test(trimmed)) {
    const domains = await getDomainsForAddress(trimmed);
    return { address: trimmed, domains };
  }

  // Looks like a .sol domain or single word — try direct lookup first
  const looksLikeDomain = !trimmed.includes(" ");
  if (looksLikeDomain) {
    try {
      const address = await resolveDomain(trimmed);
      const domains = await getDomainsForAddress(address);
      return { address, domains };
    } catch {
      // Fall through to name-candidate logic below
    }
  }

  // Multi-word name (or failed single-word) — try derived candidates
  const candidates = nameToCandidates(trimmed);
  for (const candidate of candidates) {
    try {
      const address = await resolveDomain(candidate);
      const domains = await getDomainsForAddress(address);
      return { address, domains };
    } catch {
      // try next
    }
  }

  throw new Error(
    `Could not resolve "${trimmed}" — tried: ${candidates.map((c) => c + ".sol").join(", ")}. ` +
    `The person may not have a .sol domain or it may be under a different name.`
  );
}

export { resolveSnsAddress };