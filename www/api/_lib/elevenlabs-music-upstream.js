/**
 * ElevenLabs Music API (music_v2).
 * @see https://elevenlabs.io/docs/api-reference/music/compose
 */
const ELEVEN_MUSIC_URL = "https://api.elevenlabs.io/v1/music";

function safeJson(txt) {
  try {
    return JSON.parse(txt);
  } catch {
    return null;
  }
}

function elevenlabsGenerateEnabled() {
  const v = String(process.env.ELEVENLABS_GENERATE_ENABLED || "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

function resolveElevenMusicModel(explicit) {
  const env = String(process.env.ELEVENLABS_MUSIC_MODEL || "").trim();
  const m = String(explicit || env || "music_v2").trim();
  return m === "music_v1" ? "music_v1" : "music_v2";
}

function resolveElevenMusicLengthMs(explicit) {
  const env = Number(process.env.ELEVENLABS_MUSIC_LENGTH_MS || "180000");
  const n = Number(explicit || env);
  if (!Number.isFinite(n)) return 180000;
  return Math.max(3000, Math.min(600000, Math.round(n)));
}

function splitLyricLines(text) {
  return String(text || "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, 30)
    .map((l) => l.slice(0, 200));
}

/**
 * Build a single prompt for Eleven Music v2 (prompt mode).
 */
function buildElevenMusicPrompt({ stylePrompt = "", lyrics = "", title = "", instrumental = false } = {}) {
  const bits = [];
  const style = String(stylePrompt || "").trim();
  const lyricText = String(lyrics || "").trim();
  const songTitle = String(title || "").trim();

  if (songTitle) bits.push(`Title: ${songTitle}`);
  if (style) bits.push(`Style and production: ${style}`);
  if (instrumental) {
    bits.push("Instrumental only — no vocals, no lyrics.");
  } else if (lyricText) {
    bits.push("Lyrics to sing (keep section tags like [Verse] and [Chorus]):");
    bits.push(lyricText);
  } else {
    bits.push("Write and perform original lyrics that match the style.");
  }
  bits.push("Studio-grade production, clear structure, professional mix.");
  return bits.join("\n\n").slice(0, 8000);
}

function elevenUserMessage(httpStatus, payload, rawText) {
  const err =
    payload?.detail?.message ||
    payload?.detail ||
    payload?.message ||
    payload?.error;
  if (typeof err === "string" && err.trim()) return err.trim().slice(0, 280);
  if (err && typeof err === "object" && err.message) return String(err.message).slice(0, 280);
  if (httpStatus === 401) return "ElevenLabs API key invalid — check ELEVENLABS_API_KEY.";
  if (httpStatus === 402 || httpStatus === 403) {
    return "ElevenLabs Music requires a paid plan with Music API access.";
  }
  if (httpStatus === 429) return "ElevenLabs rate limit — wait a minute and try again.";
  if (httpStatus >= 500) return "ElevenLabs is temporarily unavailable — try again shortly.";
  const snippet = String(rawText || "").trim().slice(0, 180);
  return snippet || "ElevenLabs generation failed — try again.";
}

/**
 * @param {{ apiKey: string, prompt: string, model?: string, musicLengthMs?: number, instrumental?: boolean }} opts
 */
async function elevenlabsGenerateMusic({ apiKey, prompt, model, musicLengthMs, instrumental = false }) {
  const resolvedModel = resolveElevenMusicModel(model);
  const lengthMs = resolveElevenMusicLengthMs(musicLengthMs);
  const url = `${ELEVEN_MUSIC_URL}?output_format=mp3_48000_192`;
  const body = {
    prompt: String(prompt || "").trim(),
    model_id: resolvedModel,
    music_length_ms: lengthMs,
    ...(instrumental ? { force_instrumental: true } : {}),
  };

  const r = await fetch(url, {
    method: "POST",
    headers: {
      "xi-api-key": String(apiKey || "").trim(),
      "Content-Type": "application/json",
      Accept: "audio/mpeg",
    },
    body: JSON.stringify(body),
  });

  const ct = String(r.headers.get("content-type") || "").toLowerCase();
  if (r.ok && ct.includes("audio")) {
    const ab = await r.arrayBuffer();
    const buffer = Buffer.from(ab);
    return {
      ok: buffer.length >= 128,
      httpStatus: r.status,
      audio: { buffer, mimeType: "audio/mpeg" },
      model: resolvedModel,
      musicLengthMs: lengthMs,
      userMessage: buffer.length >= 128 ? "" : "ElevenLabs returned empty audio.",
    };
  }

  const text = await r.text().catch(() => "");
  const data = safeJson(text);
  return {
    ok: false,
    httpStatus: r.status,
    data,
    text,
    model: resolvedModel,
    musicLengthMs: lengthMs,
    userMessage: elevenUserMessage(r.status, data, text),
  };
}

module.exports = {
  buildElevenMusicPrompt,
  elevenlabsGenerateEnabled,
  elevenlabsGenerateMusic,
  elevenUserMessage,
  resolveElevenMusicLengthMs,
  resolveElevenMusicModel,
};
