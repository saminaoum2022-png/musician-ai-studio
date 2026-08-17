/**
 * Timestamped (karaoke) lyrics — provider-neutral path.
 * Suno: proxied from get-timestamped-lyrics (0.5 credits, cached after first fetch).
 * ElevenLabs: cached at generation time from compose_detailed with_timestamps.
 * Lyria: cached at generation time from generateContent lyrics [sec:] markers.
 *
 * POST /api/music/timestamped-lyrics   { taskId, audioId }
 *   <- { alignedWords: [{ word, startS, endS, success }], hootCer }
 */
const { verifyUser } = require("../_lib/credits-auth");
const { applyCors } = require("../_lib/cors");
const { readJson, sendJson, sunoJsonRequest, isSunoMusicGenerationTaskId } = require("../_lib/suno-upstream");
const { isElevenlabsTaskId, isLyriaTaskId } = require("../_lib/music-provider-task-store");
const {
  getCachedTimestampedLyrics,
  queueCacheTimestampedLyrics,
  normalizeAlignedWords,
} = require("../_lib/music-timestamped-lyrics-cache");

module.exports = async function handler(req, res) {
  if (applyCors(req, res)) return;
  try {
    if (req.method !== "POST") return sendJson(res, 405, { error: "Method not allowed" });

    const user = await verifyUser(req);
    if (!user) return sendJson(res, 401, { error: "Sign in to view synced lyrics." });

    const body = await readJson(req);
    const taskId = String(body?.taskId || "").trim();
    const audioId = String(body?.audioId || "").trim();
    if (!taskId || !audioId) {
      return sendJson(res, 400, { error: "Synced lyrics need the song's taskId and audioId." });
    }

    const cached = await getCachedTimestampedLyrics(audioId);
    if (cached?.alignedWords?.length) {
      return sendJson(res, 200, cached);
    }

    if (isElevenlabsTaskId(taskId)) {
      return sendJson(res, 404, {
        error: "No synced lyrics for this ElevenLabs track — regenerate with vocals to enable karaoke.",
        code: "elevenlabs_timestamps_missing",
      });
    }

    if (isLyriaTaskId(taskId)) {
      return sendJson(res, 404, {
        error: "No synced lyrics for this Lyria track — regenerate with vocals to enable karaoke.",
        code: "lyria_timestamps_missing",
      });
    }

    if (!isSunoMusicGenerationTaskId(taskId)) {
      return sendJson(res, 404, {
        error: "Synced lyrics are not available for this provider.",
        code: "unsupported_provider",
      });
    }

    const apiKey = process.env.SUNO_API_KEY;
    if (!apiKey) return sendJson(res, 500, { error: "Missing SUNO_API_KEY on server" });

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
