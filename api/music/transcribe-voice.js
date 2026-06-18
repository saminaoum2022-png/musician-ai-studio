/**
 * Transcribe a short voice clip into singable lyrics text (provider-neutral path).
 *
 * POST /api/music/transcribe-voice   { audio: "data:audio/...;base64,..." }
 *   <- { transcript, provider }
 *
 * Used by Voice Note Flip: guess what the user sang/hummed, then Suno re-sings it.
 * Imperfect transcription is acceptable — better than unrelated AI lyrics.
 */
const { verifyUser } = require("../_lib/credits-auth");
const { applyCors } = require("../_lib/cors");
const { readJson, sendJson } = require("../_lib/suno-upstream");

const MAX_AUDIO_CHARS = 3_500_000;
const COOLDOWN_MS = 2500;
const lastCallByUser = new Map();

module.exports = async function handler(req, res) {
  if (applyCors(req, res)) return;
  try {
    if (req.method !== "POST") return sendJson(res, 405, { error: "Method not allowed" });

    const user = await verifyUser(req);
    if (!user) return sendJson(res, 401, { error: "Sign in to transcribe your voice clip." });

    const now = Date.now();
    const last = lastCallByUser.get(user.userId) || 0;
    if (now - last < COOLDOWN_MS) {
      return sendJson(res, 429, { error: "Transcribing too fast — try again in a few seconds." });
    }
    lastCallByUser.set(user.userId, now);
    if (lastCallByUser.size > 5000) lastCallByUser.clear();

    const body = await readJson(req);
    const dataUrl = String(body?.audio || "").trim();
    if (!dataUrl.startsWith("data:audio/")) {
      return sendJson(res, 400, { error: "Invalid audio payload — send a data:audio/… URL." });
    }
    if (dataUrl.length > MAX_AUDIO_CHARS) {
      return sendJson(res, 413, { error: "Voice clip too large — keep it under about a minute." });
    }

    const geminiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || "";
    if (!geminiKey) {
      return sendJson(res, 502, { error: "Voice transcription unavailable (missing GEMINI_API_KEY)." });
    }

    const dialect = String(body?.dialect || "").trim().slice(0, 120);
    const dialectHint = String(body?.dialectHint || "").trim().slice(0, 220);
    const styleHint = String(body?.style || "").trim().slice(0, 700);
    const languageHint = String(body?.languageHint || "").trim().slice(0, 120);

    const gem = await tryGeminiVoiceTranscript({
      geminiKey,
      dataUrl,
      dialect,
      dialectHint,
      styleHint,
      languageHint,
    });
    if (!gem?.ok) {
      return sendJson(res, 502, {
        error: gem?.error || "Could not transcribe voice clip — try again.",
      });
    }

    const transcript = sanitizeTranscript(gem.text);
    if (!transcript) {
      return sendJson(res, 502, { error: "No words detected in the clip — try singing or humming louder." });
    }

    return sendJson(res, 200, {
      transcript,
      lyrics: transcript,
      provider: `gemini:${gem.model || "unknown"}`,
    });
  } catch (e) {
    return sendJson(res, 500, { error: e?.message || String(e) });
  }
};

function inferLanguageHint({ languageHint, dialect, dialectHint, styleHint }) {
  const parts = [languageHint, dialect, dialectHint, styleHint]
    .map((s) => String(s || "").trim())
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  if (/arabic|عرب|levantine|egyptian|khaleeji|gulf|maghrebi|darija|masri|syrian|lebanese|iraqi|فصحى|عامية/.test(parts)) {
    return "Arabic";
  }
  return "";
}

async function tryGeminiVoiceTranscript({ geminiKey, dataUrl, dialect, dialectHint, styleHint, languageHint }) {
  const discovered = await listGeminiGenerateModels(geminiKey);
  const preferred = ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-2.0-flash-lite", "gemini-1.5-flash"];
  const models = [...preferred, ...discovered].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i);
  let lastError = discovered.length ? "unknown" : "no generateContent models discovered";

  const lang = inferLanguageHint({ languageHint, dialect, dialectHint, styleHint });
  const dialectLine = [dialect, dialectHint].filter(Boolean).join(" — ");
  // Do NOT pass styleHint into the model prompt — "emotional chorus" etc. makes
  // Gemini invent breakup lyrics instead of transcribing the clip.
  const prompt = [
    "You are a literal speech-to-text transcriber. You are NOT a songwriter.",
    "Listen once and write ONLY the words or syllables actually spoken or sung.",
    "Rules:",
    "- Same language as the speaker. Arabic script (عربي) if they use Arabic.",
    lang === "Arabic"
      ? "- Likely Arabic speech — use Arabic script, not English, unless they clearly sang English."
      : "",
    dialectLine ? `- Dialect hint: ${dialectLine}.` : "",
    "- One short line per phrase you hear. No [Verse] tags.",
    "- If a syllable is unclear, write the closest sound — never replace it with a new sentence.",
    "- NEVER add words that were not in the audio.",
    "- NEVER complete the thought, dramatize, or write emotional lyrics.",
    "- NEVER repeat a line unless you hear it repeated.",
    "- NEVER use lyrics from famous songs.",
    "- If mostly humming: syllables only (la la la, مم مم, etc.).",
    "- Keep it short — only as many lines as fit what you hear in the clip.",
    "Output plain transcribed text only. No commentary.",
  ]
    .filter(Boolean)
    .join("\n");

  for (const model of models) {
    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(geminiKey)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [{ text: prompt }, { inline_data: toInlineData(dataUrl) }],
            },
          ],
          generationConfig: { temperature: 0 },
        }),
      },
    );
    const text = await r.text().catch(() => "");
    const payload = safeJson(text) || {};
    if (!r.ok) {
      lastError = `gemini_http_${r.status}`;
      continue;
    }
    const out = extractText(payload);
    if (!out) {
      lastError = "empty_response";
      continue;
    }
    return { ok: true, text: out, model };
  }
  return { ok: false, error: lastError };
}

function sanitizeTranscript(raw) {
  let s = String(raw || "").trim();
  if (!s) return "";
  s = s.replace(/^```(?:text|lyrics)?|```$/gim, "").trim();
  s = s.replace(/^\s*(transcript|lyrics)\s*:\s*/i, "").trim();
  s = dedupeTranscriptLines(s);
  return s.slice(0, 3500);
}

function dedupeTranscriptLines(text) {
  const lines = String(text || "")
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean);
  const seen = new Set();
  const out = [];
  for (const line of lines) {
    const key = line.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(line);
  }
  return out.join("\n");
}

function toInlineData(dataUrl) {
  const m = dataUrl.match(/^data:(audio\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  return {
    mime_type: m ? m[1] : "audio/webm",
    data: m ? m[2] : "",
  };
}

function extractText(payload) {
  const parts = payload?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) return "";
  return parts.map((p) => String(p?.text || "")).join("").trim();
}

async function listGeminiGenerateModels(geminiKey) {
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(geminiKey)}`;
    const r = await fetch(url);
    const text = await r.text().catch(() => "");
    const data = safeJson(text) || {};
    if (!r.ok) return [];
    const models = Array.isArray(data?.models) ? data.models : [];
    return models
      .filter((m) => Array.isArray(m?.supportedGenerationMethods) && m.supportedGenerationMethods.includes("generateContent"))
      .map((m) => String(m?.name || "").replace(/^models\//, "").trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

function safeJson(s) {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}
