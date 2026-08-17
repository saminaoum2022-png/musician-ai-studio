/**
 * Google Lyria 3 music generation via Gemini generateContent API.
 * @see https://ai.google.dev/gemini-api/docs/music-generation
 */
const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta";

function safeJson(txt) {
  try {
    return JSON.parse(txt);
  } catch {
    return null;
  }
}

function resolveLyriaModel(explicit) {
  const env = String(process.env.LYRIA_MUSIC_MODEL || "").trim();
  const m = String(explicit || env || "lyria-3-pro-preview").trim();
  return m || "lyria-3-pro-preview";
}

function lyriaGenerateEnabled() {
  const v = String(process.env.LYRIA_GENERATE_ENABLED || "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

/**
 * Build a single Lyria prompt from NabadAi create fields.
 */
function buildLyriaPrompt({
  stylePrompt = "",
  lyrics = "",
  title = "",
  instrumental = false,
} = {}) {
  const bits = [];
  const style = String(stylePrompt || "").trim();
  const lyricText = String(lyrics || "").trim();
  const songTitle = String(title || "").trim();

  if (songTitle) bits.push(`Title: ${songTitle}`);
  if (style) bits.push(`Musical direction: ${style}`);
  if (instrumental) {
    bits.push("Instrumental only — no vocals, no lyrics.");
  } else if (lyricText) {
    bits.push("Sing the following lyrics with clear structure tags where helpful:");
    bits.push(lyricText);
  } else {
    bits.push("Write and perform original lyrics matching the musical direction.");
  }
  return bits.join("\n\n").slice(0, 8000);
}

function decodeInlineAudio(inline) {
  if (!inline) return null;
  const data = String(inline?.data || "").trim();
  if (!data) return null;
  try {
    const buffer = Buffer.from(data, "base64");
    if (!buffer.length) return null;
    const mime = String(inline?.mimeType || inline?.mime_type || "audio/mpeg").split(";")[0].trim();
    return { buffer, mimeType: mime || "audio/mpeg" };
  } catch {
    return null;
  }
}

/**
 * Parse audio bytes from generateContent or Interactions-shaped payloads.
 */
function extractLyriaAudio(payload) {
  if (!payload || typeof payload !== "object") return null;

  const topAudio = decodeInlineAudio(payload?.output_audio);
  if (topAudio) return topAudio;

  const outputs = Array.isArray(payload?.outputs) ? payload.outputs : [];
  for (const out of outputs) {
    const inline = out?.inline_data || out?.inlineData || out?.audio || out;
    const parsed = decodeInlineAudio(inline);
    if (parsed) return parsed;
  }

  const parts = payload?.candidates?.[0]?.content?.parts;
  if (Array.isArray(parts)) {
    for (const part of parts) {
      const parsed = decodeInlineAudio(part?.inlineData || part?.inline_data);
      if (parsed) return parsed;
    }
  }

  return null;
}

function lyriaUserMessage(httpStatus, payload, rawText) {
  const err = payload?.error?.message || payload?.error;
  if (err) return String(err).slice(0, 280);
  const block = payload?.promptFeedback?.blockReason;
  if (block) return `Lyria blocked this prompt (${block}). Try softer wording.`;
  const finish = payload?.candidates?.[0]?.finishReason;
  if (finish && finish !== "STOP") return `Lyria could not finish (${finish}). Try again.`;
  if (httpStatus === 429) return "Lyria rate limit — wait a minute and try again.";
  if (httpStatus === 403) return "Lyria access denied — check GEMINI_API_KEY billing and Lyria access.";
  if (httpStatus >= 500) return "Lyria is temporarily unavailable — try again shortly.";
  const snippet = String(rawText || "").trim().slice(0, 180);
  return snippet || "Lyria generation failed — try again.";
}

/**
 * @param {{ apiKey: string, model?: string, prompt: string }} opts
 */
async function lyriaGenerateMusic({ apiKey, model, prompt }) {
  const resolvedModel = resolveLyriaModel(model);
  const url = `${GEMINI_BASE}/models/${encodeURIComponent(resolvedModel)}:generateContent`;
  const r = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": String(apiKey || "").trim(),
    },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: String(prompt || "").trim() }] }],
      generationConfig: {
        responseModalities: ["AUDIO", "TEXT"],
      },
    }),
  });
  const text = await r.text().catch(() => "");
  const data = safeJson(text);
  const audio = extractLyriaAudio(data);
  return {
    ok: r.ok && Boolean(audio?.buffer?.length),
    httpStatus: r.status,
    data,
    text,
    audio,
    model: resolvedModel,
    userMessage: lyriaUserMessage(r.status, data, text),
  };
}

module.exports = {
  buildLyriaPrompt,
  extractLyriaAudio,
  lyriaGenerateEnabled,
  lyriaGenerateMusic,
  lyriaUserMessage,
  resolveLyriaModel,
};
