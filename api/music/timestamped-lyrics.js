/**
 * Timestamped (karaoke) lyrics proxy — provider-neutral path, currently
 * backed by Suno's generate/get-timestamped-lyrics.
 *
 * POST /api/music/timestamped-lyrics   { taskId, audioId }
 *   <- { alignedWords: [{ word, startS, endS, success }], hootCer }
 *
 * Server caches per audioId in Supabase after the first Suno fetch (0.5 credits).
 * Clients also cache locally; repeat plays/devices hit the server cache only.
 */
const { verifyUser } = require("../_lib/credits-auth");
const { applyCors } = require("../_lib/cors");
const { readJson, sendJson, sunoJsonRequest, isSunoMusicGenerationTaskId } = require("../_lib/suno-upstream");
const {
  getCachedTimestampedLyrics,
  queueCacheTimestampedLyrics,
  normalizeAlignedWords,
} = require("../_lib/music-timestamped-lyrics-cache");

module.exports = async function handler(req, res) {
  if (applyCors(req, res)) return;
  try {
    if (req.method !== "POST") return sendJson(res, 405, { error: "Method not allowed" });

    const apiKey = process.env.SUNO_API_KEY;
    if (!apiKey) return sendJson(res, 500, { error: "Missing SUNO_API_KEY on server" });

    const user = await verifyUser(req);
    if (!user) return sendJson(res, 401, { error: "Sign in to view synced lyrics." });

    const body = await readJson(req);
    const taskId = String(body?.taskId || "").trim();
    const audioId = String(body?.audioId || "").trim();
    if (!taskId || !audioId) {
      return sendJson(res, 400, { error: "Synced lyrics need the song's taskId and audioId." });
    }
    if (!isSunoMusicGenerationTaskId(taskId)) {
      return sendJson(res, 404, {
        error: "Synced lyrics are only available for Suno-generated songs.",
        code: "unsupported_provider",
      });
    }

    const cached = await getCachedTimestampedLyrics(audioId);
    if (cached?.alignedWords?.length) {
      return sendJson(res, 200, cached);
    }

    const upstream = await sunoJsonRequest("/api/v1/generate/get-timestamped-lyrics", {
      method: "POST",
      apiKey,
      body: { taskId, audioId },
    });

    const d = upstream.data?.data || {};
    const words = Array.isArray(d.alignedWords) ? d.alignedWords : [];
    if (!upstream.ok || !words.length) {
      const msg = upstream.data?.msg || upstream.data?.message || "No synced lyrics for this track";
      return sendJson(res, upstream.ok ? 404 : 502, {
        error: String(msg).slice(0, 240),
        code: upstream.code,
      });
    }

    const alignedWords = normalizeAlignedWords(words);
    const hootCer = Number.isFinite(Number(d.hootCer)) ? Number(d.hootCer) : null;

    queueCacheTimestampedLyrics({
      audioId,
      taskId,
      provider: "suno",
      alignedWords,
      hootCer,
    });

    return sendJson(res, 200, { alignedWords, hootCer });
  } catch (e) {
    return sendJson(res, 500, { error: e?.message || String(e) });
  }
};
