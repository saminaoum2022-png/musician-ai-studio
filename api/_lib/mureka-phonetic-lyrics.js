/**
 * Mureka has no official Arabic support — send Franco-Arabic (phonetic Latin) lyrics upstream.
 * Users can still type Arabic script in Create; we convert server-side before /v1/song/generate.
 */
const { stripInlinePunctuationFromLyrics } = require("./sung-lyrics-punctuation");
const {
  looksLikeArabizi,
  buildToArabiziConversionLines,
  buildLyriaArabiziPerformanceNote,
} = require("./arabizi");

const ARABIC_SCRIPT_RE = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;
const GEMINI_MODELS = ["gemini-2.5-flash", "gemini-2.0-flash"];

function safeJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function extractGeminiText(data) {
  const parts = data?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) return "";
  return parts.map((p) => String(p?.text || "")).join("").trim();
}

function sanitizePhoneticLyricsOutput(input) {
  const allowedHeader =
    /^\[(verse|chorus|bridge|outro|intro|final chorus|pre-chorus|hook|refrain|verse \d+|chorus \d+)\]$/i;
  const filtered = String(input || "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .filter((line) => {
      if (allowedHeader.test(line)) return true;
      if (/^style\s*:/i.test(line)) return false;
      if (/^(description|note|explanation|theme|meaning)\s*:/i.test(line)) return false;
      if (/^\(.*\)$/.test(line)) return false;
      return true;
    })
    .join("\n")
    .trim();
  return stripInlinePunctuationFromLyrics(filtered);
}

/** True when upstream lyrics should be converted from Arabic script to phonetic Latin. */
function needsMurekaPhoneticLyrics(lyrics, scriptFormat = "") {
  const s = String(lyrics || "").trim();
  if (!s) return false;
  const fmt = String(scriptFormat || "").trim().toLowerCase();
  const hasArabicScript = ARABIC_SCRIPT_RE.test(s);
  const arabizi = looksLikeArabizi(s);
  if (fmt === "arabizi" && arabizi && !hasArabicScript) return false;
  if (arabizi && !hasArabicScript) return false;
  if (hasArabicScript) return true;
  if (fmt === "arabic") return true;
  return false;
}

function buildMurekaArabiziPrompt({ lyrics, dialect = "", dialectHint = "", style = "" } = {}) {
  return [
    "Target: Mureka AI music API — lyrics must be Franco-Arabic (Latin phonetic spelling) only.",
    "Mureka does not read Arabic script; Latin letters must encode Arabic pronunciation for singing.",
    ...buildToArabiziConversionLines({ dialect, dialectHint }),
    style ? `Style/Tags (context only): ${String(style).slice(0, 400)}` : "",
    "",
    "Lyrics to convert:",
    lyrics,
  ]
    .filter(Boolean)
    .join("\n");
}

async function tryGeminiPhoneticConversion({ apiKey, prompt }) {
  const key = String(apiKey || "").trim();
  if (!key) return { ok: false, error: "missing_gemini_key" };
  let lastError = "unknown";
  for (const model of GEMINI_MODELS) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`;
    try {
      const r = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.1 },
        }),
      });
      const text = await r.text().catch(() => "");
      const data = safeJson(text) || {};
      if (!r.ok) {
        lastError = data?.error?.message || data?.error || text || `HTTP ${r.status}`;
        continue;
      }
      const out = sanitizePhoneticLyricsOutput(extractGeminiText(data));
      if (!out || ARABIC_SCRIPT_RE.test(out)) {
        lastError = "empty_or_still_arabic_script";
        continue;
      }
      return { ok: true, lyrics: out, model };
    } catch (e) {
      lastError = String(e?.message || e).slice(0, 200);
    }
  }
  return { ok: false, error: String(lastError).slice(0, 280) };
}

/**
 * @returns {Promise<{ lyrics: string, converted: boolean, skippedReason?: string, error?: string, model?: string }>}
 */
async function prepareMurekaPhoneticLyrics({
  geminiApiKey,
  lyrics,
  dialect = "",
  dialectHint = "",
  scriptFormat = "",
  style = "",
} = {}) {
  const original = String(lyrics || "").trim();
  if (!original) return { lyrics: "", converted: false, skippedReason: "empty" };
  if (!needsMurekaPhoneticLyrics(original, scriptFormat)) {
    return { lyrics: original, converted: false, skippedReason: "already_phonetic" };
  }
  const prompt = buildMurekaArabiziPrompt({ lyrics: original, dialect, dialectHint, style });
  const result = await tryGeminiPhoneticConversion({ apiKey: geminiApiKey, prompt });
  if (!result.ok || !result.lyrics) {
    console.warn("[mureka-phonetic] conversion failed — sending original lyrics", result.error);
    return {
      lyrics: original,
      converted: false,
      skippedReason: "conversion_failed",
      error: result.error,
    };
  }
  return { lyrics: result.lyrics, converted: true, model: result.model };
}

function murekaPhoneticStyleNote({ dialect = "", dialectHint = "" } = {}) {
  return buildLyriaArabiziPerformanceNote({ dialect, dialectHint }).replace(
    /Lyria 3\.5/g,
    "Mureka",
  );
}

module.exports = {
  needsMurekaPhoneticLyrics,
  prepareMurekaPhoneticLyrics,
  murekaPhoneticStyleNote,
};
