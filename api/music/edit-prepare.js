/**
 * POST /api/music/edit-prepare
 * Body: { audio: "data:audio/...;base64,..." }
 *
 * Admin-only, staging-first. Uploads a song to ElevenLabs and extracts a
 * composition plan so the Create Edit tab can Keep / Rewrite sections.
 */
const { verifyUser, sendJson, readJsonBody } = require("../_lib/credits-auth");
const { applyCors } = require("../_lib/cors");
const { userIsAdmin } = require("../_lib/admin-auth");
const { nabadSongEditEnabled } = require("../_lib/nabad-song-edit-lib");
const {
  decodeReferenceAudioPayload,
  elevenlabsUploadMusic,
  estimateReferenceDurationMs,
  extractUploadedEditPlan,
  resolveElevenMusicModel,
} = require("../_lib/elevenlabs-music-upstream");

const MAX_AUDIO_CHARS = 4_500_000;
const COOLDOWN_MS = 4000;
const lastCallByUser = new Map();

module.exports = async function handler(req, res) {
  if (applyCors(req, res)) return;
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return sendJson(res, 405, { error: "Method not allowed" });

  const user = await verifyUser(req);
  if (!user?.userId) return sendJson(res, 401, { error: "Sign in to use Edit." });

  if (!nabadSongEditEnabled()) {
    return sendJson(res, 403, {
      error: "Song Edit is not enabled on this server.",
      code: "nabad_song_edit_disabled",
    });
  }

  if (!(await userIsAdmin(user))) {
    return sendJson(res, 403, {
      error: "Song Edit is admin-only on this environment.",
      code: "nabad_song_edit_admin_only",
    });
  }

  const now = Date.now();
  const last = lastCallByUser.get(user.userId) || 0;
  if (now - last < COOLDOWN_MS) {
    return sendJson(res, 429, { error: "Edit upload too fast — wait a few seconds." });
  }
  lastCallByUser.set(user.userId, now);
  if (lastCallByUser.size > 5000) lastCallByUser.clear();

  const apiKey = process.env.ELEVENLABS_API_KEY || "";
  if (!apiKey) return sendJson(res, 502, { error: "Edit unavailable (missing ELEVENLABS_API_KEY)." });

  try {
    const body = await readJsonBody(req);
    const dataUrl = String(body?.audio || "").trim();
    if (!dataUrl.startsWith("data:audio/")) {
      return sendJson(res, 400, { error: "Invalid audio payload — send a data:audio/… URL." });
    }
    if (dataUrl.length > MAX_AUDIO_CHARS) {
      return sendJson(res, 413, { error: "Audio too large — use an MP3 under about 3 minutes (~3 MB)." });
    }

    const decoded = decodeReferenceAudioPayload(dataUrl);
    if (!decoded?.buffer || decoded.buffer.length < 128) {
      return sendJson(res, 400, { error: "Could not read that audio file." });
    }
    if (decoded.buffer.length > 15 * 1024 * 1024) {
      return sendJson(res, 413, { error: "Audio too large (max 15 MB)." });
    }

    const extractModel = resolveElevenMusicModel("music_v2");
    const upload = await elevenlabsUploadMusic({
      apiKey,
      buffer: decoded.buffer,
      mimeType: decoded.mimeType,
      filename: "song-edit-source.mp3",
      extractCompositionPlan: extractModel,
    });
    if (!upload.ok || !upload.songId) {
      return sendJson(res, upload.httpStatus && upload.httpStatus >= 400 && upload.httpStatus < 500 ? upload.httpStatus : 502, {
        error: upload.userMessage || "ElevenLabs could not read this song — try another file.",
        code: "elevenlabs_edit_upload_failed",
      });
    }

    const extracted = extractUploadedEditPlan(upload.data);
    let chunks = extracted.chunks;
    const durationMs = chunks.length
      ? Number(chunks[chunks.length - 1].endMs) || estimateReferenceDurationMs(decoded.buffer)
      : estimateReferenceDurationMs(decoded.buffer);
    if (!chunks.length) {
      const endMs = Math.max(3000, durationMs);
      chunks = [{
        index: 0,
        label: "Full song",
        text: "",
        lyrics: "",
        durationMs: endMs,
        startMs: 0,
        endMs,
        positiveStyles: [],
        negativeStyles: [],
      }];
    }

    return sendJson(res, 200, {
      songId: upload.songId,
      durationMs,
      chunks,
      globalPositive: extracted.globalPositive || [],
      globalNegative: extracted.globalNegative || [],
      model: extractModel,
    });
  } catch (e) {
    return sendJson(res, 500, { error: e?.message || String(e) });
  }
};
