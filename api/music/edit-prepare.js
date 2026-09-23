/**
 * POST /api/music/edit-prepare
 * Body: { audioUrl } (library songs) or { audio: "data:audio/..." } (small device files)
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
  fetchElevenReferenceBytesFromUrl,
  resolveElevenMusicModel,
  unwrapProxyAudioUrl,
} = require("../_lib/elevenlabs-music-upstream");

const MAX_AUDIO_CHARS = 4_500_000;
/** Typical Nabad songs are ~4 MB (chart sample avg 4.1, max ~5.3). 8 MB covers that with room. */
const MAX_AUDIO_BYTES = 8 * 1024 * 1024;
const COOLDOWN_MS = 4000;
const lastCallByUser = new Map();

function isPrivateEditHost(hostname) {
  const h = String(hostname || "").toLowerCase();
  if (!h || h === "localhost" || h.endsWith(".local") || h === "0.0.0.0") return true;
  if (h === "127.0.0.1" || h === "::1") return true;
  if (/^\d+\.\d+\.\d+\.\d+$/.test(h)) {
    const [a, b] = h.split(".").map(Number);
    if (a === 10 || a === 127 || a === 0) return true;
    if (a === 192 && b === 168) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 169 && b === 254) return true;
  }
  return false;
}

function isAllowedEditAudioHost(hostname) {
  const h = String(hostname || "").toLowerCase();
  if (!h || isPrivateEditHost(h)) return false;
  if (h === "nabadai.com" || h === "www.nabadai.com") return true;
  if (h.endsWith(".supabase.co")) return true;
  if (h.endsWith(".vercel.app")) return true;
  if (h === "suno.ai" || h.endsWith(".suno.ai") || h.endsWith(".sunoapi.org")) return true;
  if (h.includes("audiopipe") || h.includes("audioprod")) return true;
  if (h === "elevenlabs.io" || h.endsWith(".elevenlabs.io")) return true;
  return false;
}

function resolveEditAudioUrl(raw) {
  const unwrapped = unwrapProxyAudioUrl(raw) || String(raw || "").trim();
  if (!unwrapped || !/^https?:\/\//i.test(unwrapped)) return "";
  try {
    const host = new URL(unwrapped).hostname;
    if (!isAllowedEditAudioHost(host)) return "";
    return unwrapped;
  } catch {
    return "";
  }
}

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
    const audioUrl = resolveEditAudioUrl(body?.audioUrl || body?.audio_url || "");
    let buffer = null;
    let mimeType = "audio/mpeg";

    if (audioUrl) {
      const fetched = await fetchElevenReferenceBytesFromUrl(audioUrl);
      if (!fetched.ok || !fetched.buffer?.length) {
        return sendJson(res, 400, { error: "Could not load that song for Edit — try again." });
      }
      buffer = fetched.buffer;
      mimeType = fetched.mimeType || "audio/mpeg";
    } else if (dataUrl.startsWith("data:audio/")) {
      if (dataUrl.length > MAX_AUDIO_CHARS) {
        return sendJson(res, 413, { error: "Audio too large to upload from the device — open the song from your library instead." });
      }
      const decoded = decodeReferenceAudioPayload(dataUrl);
      if (decoded?.buffer) {
        buffer = decoded.buffer;
        mimeType = decoded.mimeType || "audio/mpeg";
      }
    } else {
      return sendJson(res, 400, { error: "Invalid audio payload — send a song URL or a data:audio/… file." });
    }

    if (!buffer || buffer.length < 128) {
      return sendJson(res, 400, { error: "Could not read that audio file." });
    }
    if (buffer.length > MAX_AUDIO_BYTES) {
      return sendJson(res, 413, { error: "Audio too large (max 8 MB)." });
    }

    const extractModel = resolveElevenMusicModel("music_v2");
    const upload = await elevenlabsUploadMusic({
      apiKey,
      buffer,
      mimeType,
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
      ? Number(chunks[chunks.length - 1].endMs) || estimateReferenceDurationMs(buffer)
      : estimateReferenceDurationMs(buffer);
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
