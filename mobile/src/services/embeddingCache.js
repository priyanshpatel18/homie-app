/**
 * embeddingCache — local semantic memory for Homie conversations.
 *
 * Flow:
 *   saveConversationEmbedding(walletAddress, convId, text)
 *     → hits /api/embed on the server
 *     → stores the 1536-dim vector locally in AsyncStorage as base64
 *
 *   findSimilarConversations(walletAddress, queryText, topK)
 *     → embeds the query
 *     → loads all local vectors
 *     → runs cosine similarity entirely on-device
 *     → returns topK matches with { id, title, preview, score }
 *
 * Nothing sensitive leaves the device after the initial embed request.
 * The embedding model sees only text — no keys, no signatures.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import { API_URL } from "./api";

const VEC_KEY   = (id)     => `@homie_vec_${id}`;
const INDEX_KEY = (wallet) => `@homie_vec_index_${wallet}`;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function vecToBase64(vec) {
  const buf = new Float32Array(vec).buffer;
  const bytes = new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}

function base64ToVec(b64) {
  const s = atob(b64);
  const buf = new ArrayBuffer(s.length);
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i);
  return new Float32Array(buf);
}

function cosine(a, b) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na  += a[i] * a[i];
    nb  += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

// ─── Fetch embedding from server ─────────────────────────────────────────────

async function fetchEmbedding(text) {
  const res = await fetch(`${API_URL}/api/embed`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
    signal: AbortSignal.timeout(8_000),
  });
  if (!res.ok) throw new Error(`embed ${res.status}`);
  const { embedding } = await res.json();
  return embedding; // number[]
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Called after saveConversation — embeds title + preview and stores locally.
 * Fires-and-forgets; caller should not await if it's on the hot path.
 */
export async function saveConversationEmbedding(walletAddress, convId, { title, preview }) {
  try {
    const text = `${title}. ${preview}`.slice(0, 1200);
    const vec  = await fetchEmbedding(text);

    await AsyncStorage.setItem(VEC_KEY(convId), vecToBase64(vec));

    const raw   = await AsyncStorage.getItem(INDEX_KEY(walletAddress));
    let index   = raw ? JSON.parse(raw) : [];
    index       = index.filter(e => e.id !== convId);
    index.unshift({ id: convId, title, preview });
    if (index.length > 50) index = index.slice(0, 50);
    await AsyncStorage.setItem(INDEX_KEY(walletAddress), JSON.stringify(index));
  } catch {
    // Non-fatal — semantic memory is a nice-to-have
  }
}

/**
 * Find topK conversations semantically similar to queryText.
 * Cosine similarity runs entirely on-device.
 * Returns [{ id, title, preview, score }] sorted by descending score.
 */
export async function findSimilarConversations(walletAddress, queryText, topK = 3) {
  try {
    const [queryVec, rawIndex] = await Promise.all([
      fetchEmbedding(queryText.slice(0, 500)),
      AsyncStorage.getItem(INDEX_KEY(walletAddress)),
    ]);

    const index = rawIndex ? JSON.parse(rawIndex) : [];
    if (!index.length) return [];

    const qVec = new Float32Array(queryVec);

    const scored = await Promise.all(
      index.map(async (entry) => {
        try {
          const b64 = await AsyncStorage.getItem(VEC_KEY(entry.id));
          if (!b64) return null;
          const vec   = base64ToVec(b64);
          const score = cosine(qVec, vec);
          return { ...entry, score };
        } catch {
          return null;
        }
      })
    );

    return scored
      .filter(e => e !== null && e.score > 0.72)  // threshold: relevance floor
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);
  } catch {
    return [];
  }
}

/**
 * Build a context snippet to prepend to the agent prompt.
 * Returns null if nothing relevant is found.
 */
export async function buildMemoryContext(walletAddress, userMessage) {
  if (!walletAddress || !userMessage || userMessage.length < 12) return null;
  try {
    const matches = await findSimilarConversations(walletAddress, userMessage, 2);
    if (!matches.length) return null;

    const lines = matches
      .map(m => `- "${m.title}" — ${m.preview}`)
      .join("\n");

    return `Relevant past conversations:\n${lines}`;
  } catch {
    return null;
  }
}
