/**
 * Server-side cache for timestamped (karaoke) lyrics — keyed by audio_id.
 * Word timing is immutable per clip; store once after the first Suno fetch.
 */

const SUPABASE_URL = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

function serviceHeaders(extra = {}) {
  return {
    apikey: SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    Accept: "application/json",
    ...extra,
  };
}

async function rest(path, { method = "GET", body, prefer = "" } = {}) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return { ok: false };
  const headers = serviceHeaders(body ? { "Content-Type": "application/json" } : {});
  if (prefer) headers.Prefer = prefer;
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await r.json().catch(() => null);
    return { ok: r.ok, status: r.status, data };
  } catch {
    return { ok: false };
  }
}

function cleanAudioId(v) {
  const s = String(v || "").trim();
  return s.length >= 6 && s.length <= 120 ? s : "";
}

function cleanTaskId(v) {
  const s = String(v || "").trim();
  return s.length >= 4 && s.length <= 120 ? s : "";
}

function normalizeAlignedWords(words) {
  if (!Array.isArray(words)) return [];
  return words
    .map((w) => ({
      word: String(w?.word ?? ""),
      startS: Number(w?.startS ?? w?.start_s ?? 0),
      endS: Number(w?.endS ?? w?.end_s ?? 0),
      success: w?.success !== false,
    }))
    .filter((w) => w.word !== "");
}

async function getCachedTimestampedLyrics(audioId) {
  const aid = cleanAudioId(audioId);
  if (!aid) return null;
  const r = await rest(
    `music_timestamped_lyrics?audio_id=eq.${encodeURIComponent(aid)}&select=aligned_words,hoot_cer&limit=1`,
  );
  if (!r.ok || !Array.isArray(r.data) || !r.data[0]) return null;
  const row = r.data[0];
  const alignedWords = normalizeAlignedWords(row.aligned_words);
  if (!alignedWords.length) return null;
  return {
    alignedWords,
    hootCer: Number.isFinite(Number(row.hoot_cer)) ? Number(row.hoot_cer) : null,
  };
}

async function cacheTimestampedLyrics({
  audioId,
  taskId = "",
  provider = "suno",
  alignedWords = [],
  hootCer = null,
} = {}) {
  const aid = cleanAudioId(audioId);
  const words = normalizeAlignedWords(alignedWords);
  if (!aid || !words.length) return { ok: false };
  return rest("music_timestamped_lyrics?on_conflict=audio_id", {
    method: "POST",
    body: {
      audio_id: aid,
      provider: provider === "lyria" ? "lyria" : provider === "elevenlabs" ? "elevenlabs" : provider === "other" ? "other" : "suno",
      provider_task_id: cleanTaskId(taskId),
      aligned_words: words,
      hoot_cer: Number.isFinite(Number(hootCer)) ? Number(hootCer) : null,
      fetched_at: new Date().toISOString(),
    },
    prefer: "resolution=merge-duplicates,return=minimal",
  });
}

function queueCacheTimestampedLyrics(opts) {
  void cacheTimestampedLyrics(opts).catch(() => null);
}

module.exports = {
  getCachedTimestampedLyrics,
  cacheTimestampedLyrics,
  queueCacheTimestampedLyrics,
  normalizeAlignedWords,
};
