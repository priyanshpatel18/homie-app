// @ts-nocheck
/**
 * Sentiment scoring engine.
 *
 * Pipeline:
 *   raw data (Birdeye + StockTwits + Nitter + Google News)
 *     → on-chain score (price/volume math)
 *     → social score (StockTwits bullish ratio)
 *     → news score (LLM classifies headlines via OpenRouter)
 *     → final blended score + label + one-sentence summary
 *     → in-memory cache (10 min TTL)
 */

const { fetchAllSentimentData } = require("../data/fetchSentimentData");
const { client, LLM_MODEL } = require("./llmConfig");

// ─── In-memory cache ─────────────────────────────────────────────────────────
const CACHE = new Map(); // key → { data, ts }
const TTL   = 10 * 60 * 1000; // 10 minutes

function getCache(key) {
  const entry = CACHE.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > TTL) { CACHE.delete(key); return null; }
  return entry.data;
}
function setCache(key, data) {
  CACHE.set(key, { data, ts: Date.now() });
}

// ─── On-chain score (-100 → +100, then normalized to 0–100) ─────────────────
function calcOnChainScore(onChain) {
  if (!onChain) return null;
  const priceChange  = onChain.priceChange24h ?? 0;
  const volumeChange = onChain.volumeChange   ?? 0;

  // Raw score — weighted: volume is a leading indicator
  const raw = (priceChange * 0.4) + (volumeChange * 0.3);
  // Clamp to -100…+100, then shift to 0–100
  const clamped = Math.min(100, Math.max(-100, raw));
  return Math.round((clamped + 100) / 2); // 0–100 scale
}

// ─── Social score from StockTwits bullish% ───────────────────────────────────
function calcSocialScore(social) {
  if (!social || !social.messageCount) return null;
  // bullishPct is already 0–100
  return social.bullishPct;
}

// ─── LLM news/tweet sentiment scoring ────────────────────────────────────────
async function scoreHeadlinesWithLLM(symbol, headlines) {
  if (!headlines || headlines.length === 0) return null;

  const listed = headlines.slice(0, 10).map((h, i) => `${i + 1}. ${h}`).join("\n");

  try {
    const res = await client.chat.completions.create({
      model: LLM_MODEL,
      messages: [
        {
          role: "user",
          content:
`You are a crypto market analyst. Score the following news/social headlines for ${symbol} sentiment.
Headlines:
${listed}

Respond with ONLY valid JSON (no markdown):
{"score": 0-100, "reason": "one short sentence explaining the dominant signal"}

0 = extremely bearish, 50 = neutral, 100 = extremely bullish.`,
        },
      ],
      temperature: 0.1,
      max_tokens: 120,
    });

    const raw = res.choices[0].message.content || "";
    const cleaned = raw.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "").trim();
    const parsed = JSON.parse(cleaned);
    return {
      score:  Math.min(100, Math.max(0, Number(parsed.score) || 50)),
      reason: parsed.reason || null,
    };
  } catch {
    return null;
  }
}

// ─── One-sentence LLM summary ────────────────────────────────────────────────
async function generateSummary(symbol, score, label, onChain, llmReason) {
  try {
    const priceStr   = onChain?.priceChange24h != null
      ? `${onChain.priceChange24h > 0 ? "+" : ""}${onChain.priceChange24h.toFixed(1)}%`
      : null;
    const volStr     = onChain?.volumeChange != null
      ? `${onChain.volumeChange > 0 ? "+" : ""}${onChain.volumeChange.toFixed(1)}%`
      : null;
    const contextBits = [
      priceStr  && `price ${priceStr} 24h`,
      volStr    && `volume ${volStr}`,
      llmReason && llmReason,
    ].filter(Boolean).join("; ");

    const res = await client.chat.completions.create({
      model: LLM_MODEL,
      messages: [
        {
          role: "user",
          content:
`Write exactly one casual sentence explaining why ${symbol} looks ${label.toLowerCase()} right now.
Context: ${contextBits || "mixed signals"}.
Sentence must be under 15 words. No emojis. No "I" pronoun. Respond with the sentence only.`,
        },
      ],
      temperature: 0.4,
      max_tokens: 60,
    });
    return (res.choices[0].message.content || "").trim().replace(/^"|"$/g, "");
  } catch {
    return `${symbol} showing ${label.toLowerCase()} signals across on-chain and social data.`;
  }
}

// ─── Label from score ────────────────────────────────────────────────────────
function toLabel(score) {
  if (score >= 62) return "Bullish";
  if (score <= 38) return "Bearish";
  return "Neutral";
}

// ─── Main entry ──────────────────────────────────────────────────────────────
/**
 * Returns full sentiment result for a token.
 * Cached for 10 minutes per symbol.
 *
 * @param {string} symbol  e.g. "SOL"
 * @param {string} [mint]  optional mint address for richer on-chain data
 * @returns {Promise<Object>} sentiment result
 */
async function getSentiment(symbol, mint) {
  const sym  = symbol.toUpperCase();
  const key  = mint ? `${sym}:${mint}` : sym;
  const hit  = getCache(key);
  if (hit) return hit;

  const { onChain, social, headlines } = await fetchAllSentimentData(sym, mint);

  // Score each signal independently
  const onChainScore = calcOnChainScore(onChain);
  const socialScore  = calcSocialScore(social);
  const llmResult    = await scoreHeadlinesWithLLM(sym, headlines);
  const newsScore    = llmResult?.score ?? null;

  // Blend available scores — weight by availability
  const scores  = [onChainScore, socialScore, newsScore].filter((s) => s != null);
  const weights = [
    onChainScore != null ? 0.40 : 0,
    socialScore  != null ? 0.25 : 0,
    newsScore    != null ? 0.35 : 0,
  ];
  const totalWeight = weights.reduce((a, b) => a + b, 0);

  let finalScore = 50; // default neutral
  if (scores.length > 0 && totalWeight > 0) {
    finalScore = Math.round(
      scores.reduce((sum, s, i) => sum + s * weights[i], 0) / totalWeight
    );
  }

  const label   = toLabel(finalScore);
  const summary = await generateSummary(sym, finalScore, label, onChain, llmResult?.reason);

  const result = {
    token:   sym,
    score:   finalScore,
    label,
    summary,
    sources: {
      onChain: onChain
        ? {
            priceChange24h: onChain.priceChange24h,
            volumeChange:   onChain.volumeChange,
            score:          onChainScore,
          }
        : null,
      social: social
        ? {
            bullishPct:   social.bullishPct,
            bearishPct:   social.bearishPct,
            messageCount: social.messageCount,
            score:        socialScore,
          }
        : null,
      news: newsScore != null
        ? { headlineCount: headlines.length, score: newsScore }
        : null,
    },
    fetchedAt: new Date().toISOString(),
  };

  setCache(key, result);
  return result;
}

module.exports = { getSentiment };