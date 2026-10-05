/**
 * Mureka has no official Arabic support — send plain Latin phonetic lyrics upstream.
 * Users can still type Arabic script in Create; we convert server-side before /v1/song/generate.
 *
 * Mureka’s singer reads Latin like English — avoid Franco digits (7, 3, 5…) and Lyria-style rules.
 */
const { stripInlinePunctuationFromLyrics } = require("./sung-lyrics-punctuation");
const {
  looksLikeArabizi,
  isLevantineDialect,
  isLebaneseDialect,
} = require("./arabizi");

const ARABIC_SCRIPT_RE = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;
const GEMINI_MODELS = ["gemini-2.5-flash", "gemini-2.0-flash"];
/** Words like 7abibi, ma3oul — Mureka reads digits as English numbers. */
const FRANCO_DIGIT_IN_WORD_RE = /[a-zA-Z]*[235789][a-zA-Z][\w']*/;

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

/**
 * Expand Franco-Arabizi digit spellings to letters Mureka can sing as Arabic (not "seven").
 */
function latinizeFrancoDigitsInWord(word) {
  let w = String(word || "");
  if (!FRANCO_DIGIT_IN_WORD_RE.test(w)) return w;
  return w
    .replace(/7/g, "h")
    .replace(/3/g, "'")
    .replace(/5/g, "kh")
    .replace(/8/g, "gh")
    .replace(/9/g, "'")
    .replace(/2/g, "'");
}

/** Common Franco / Lyria leftovers → letter spellings Mureka sings better. */
const MUREKA_WORD_REPLACEMENTS = [
  [/\b7abib(i|y|ee|eh)\b/gi, "habeebi"],
  [/\b7abeebi\b/gi, "habeebi"],
  [/\b3ala\b/gi, "aala"],
  [/\b3alaak\b/gi, "aalaak"],
  [/\b2alb(i|y)\b/gi, "albi"],
  [/\b2a2(i|y)\b/gi, "aa'i"],
  [/\b5alas\b/gi, "khallas"],
  [/\b5alleeni\b/gi, "khalleeni"],
  [/\b7ayati\b/gi, "hayati"],
  [/\b7elwe(h)?\b/gi, "helweh"],
  [/\bma3\b/gi, "ma'"],
  [/\bma3oul\b/gi, "maoul"],
  [/\bmesh\b/gi, "mish"],
  [/\b7aqq\b/gi, "haqq"],
];

function applyMurekaWordReplacements(word) {
  let w = String(word || "");
  for (const [re, rep] of MUREKA_WORD_REPLACEMENTS) {
    w = w.replace(re, rep);
  }
  return w;
}

function normalizeMurekaPhoneticLyrics(text) {
  return String(text || "")
    .split(/\r?\n/)
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed || /^\[/.test(trimmed)) return line;
      return trimmed
        .split(/(\s+)/)
        .map((part) => {
          if (!part.trim() || /^\s+$/.test(part)) return part;
          let w = latinizeFrancoDigitsInWord(part);
          w = applyMurekaWordReplacements(w);
          return w;
        })
        .join("");
    })
    .join("\n")
    .trim();
}

function buildMurekaPhoneticConversionLines({ dialect = "", dialectHint = "" } = {}) {
  const blob = `${dialect} ${dialectHint}`.toLowerCase();
  const levantine = isLevantineDialect(dialect, dialectHint);
  const lebanese = isLebaneseDialect(dialect, dialectHint);
  const egyptian = /egyptian|masri|مصر/.test(blob);
  const gulf = /gulf|khaleeji|خليج/.test(blob);

  const core = [
    "Target: Mureka AI — an English-biased singing model. Lyrics must be Latin letters only (no Arabic script).",
    "Goal: when sung, sound like colloquial ARABIC pronunciation — not English sentences.",
    "",
    "CRITICAL — NO FRANCO DIGITS:",
    "- Never use digits 2, 3, 5, 7, 8, 9 inside words (no 7abibi, ma3oul, 5alas). Mureka reads them as English numbers.",
    "- Use letter spellings only: habibi, maoul, khallas, hub, shou, kif, ghannili, khallini, hayati.",
    "",
    "Spelling style (Lebanese WhatsApp chat — NOT Franco digits, NOT dictionary English):",
    "- sh/ch for ش: shou, mish, kelme, helwe, shoufi.",
    "- kh for خ, gh for غ.",
    "- Apostrophe ' for hamza/qaf: albi, ra'ih, da'ee'a; write ma fi as two words.",
    "- Long vowels: double letters (habeebi, hayati, shoufii, khalleeni) so an English singer does not clip them.",
    "- Lebanese imala: -eh/-e endings (kelme, dene); avoid English-looking words (no the, and, my, love as English).",
    "- Keep [Verse] [Chorus] [Bridge] tags in English only.",
    "",
    "Example tone (structure only — match the user's words, not this story):",
    "Shou fi ma' albi",
    "Khalleeni 'aoudek hayati",
    "",
    "Do NOT translate to English. Do NOT rewrite the story. Same line count and rhyme slots.",
    "Output lyrics only — no notes.",
  ];

  if (levantine) {
    core.push(
      lebanese
        ? "Dialect: Lebanese Arabic (Beirut / Levantine colloquial)."
        : "Dialect: Levantine Arabic (Syrian/Palestinian/Lebanese colloquial).",
    );
  } else if (egyptian) {
    core.push("Dialect: Egyptian Masri — Masri vowels and endings, still NO digits in words.");
  } else if (gulf) {
    core.push("Dialect: Khaleeji/Gulf colloquial — NO digits in words.");
  } else {
    core.push("Dialect: colloquial Arabic (match dialect hint below).");
  }
  if (dialect) core.push(`Dialect label: ${dialect}`);
  if (dialectHint) core.push(`Dialect / address hint: ${dialectHint}`);
  return core;
}

function buildMurekaArabiziPrompt({ lyrics, dialect = "", dialectHint = "", style = "" } = {}) {
  return [
    ...buildMurekaPhoneticConversionLines({ dialect, dialectHint }),
    style ? `Style (context only, do not copy into lyrics): ${String(style).slice(0, 280)}` : "",
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
          generationConfig: { temperature: 0.05 },
        }),
      });
      const text = await r.text().catch(() => "");
      const data = safeJson(text) || {};
      if (!r.ok) {
        lastError = data?.error?.message || data?.error || text || `HTTP ${r.status}`;
        continue;
      }
      let out = sanitizePhoneticLyricsOutput(extractGeminiText(data));
      out = normalizeMurekaPhoneticLyrics(out);
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

/** True when upstream lyrics should be converted from Arabic script to phonetic Latin. */
function needsMurekaPhoneticLyrics(lyrics, scriptFormat = "") {
  const s = String(lyrics || "").trim();
  if (!s) return false;
  const fmt = String(scriptFormat || "").trim().toLowerCase();
  if (ARABIC_SCRIPT_RE.test(s) || fmt === "arabic") return true;
  if (looksLikeArabizi(s) && FRANCO_DIGIT_IN_WORD_RE.test(s)) return true;
  return false;
}

/**
 * @returns {Promise<{ lyrics: string, converted: boolean, normalized?: boolean, skippedReason?: string, error?: string, model?: string, blockUpstream?: boolean }>}
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

  const fmt = String(scriptFormat || "").trim().toLowerCase();
  const hasArabicScript = ARABIC_SCRIPT_RE.test(original);
  const needsGemini = hasArabicScript || fmt === "arabic";

  if (!needsGemini) {
    const normalized = normalizeMurekaPhoneticLyrics(original);
    if (normalized !== original) {
      return { lyrics: normalized, converted: false, normalized: true, skippedReason: "digit_cleanup" };
    }
    return { lyrics: original, converted: false, skippedReason: "already_phonetic" };
  }

  const prompt = buildMurekaArabiziPrompt({ lyrics: original, dialect, dialectHint, style });
  const result = await tryGeminiPhoneticConversion({ apiKey: geminiApiKey, prompt });
  if (!result.ok || !result.lyrics) {
    console.warn("[mureka-phonetic] conversion failed", result.error);
    return {
      lyrics: original,
      converted: false,
      skippedReason: "conversion_failed",
      error: result.error,
      blockUpstream: true,
    };
  }
  return { lyrics: result.lyrics, converted: true, model: result.model };
}

/** One line for Mureka style prompt — steer accent without blowing the 1024 cap. */
function murekaPhoneticStyleNote({ dialect = "", dialectHint = "" } = {}) {
  const levantine = isLevantineDialect(dialect, dialectHint);
  const dialectLabel = levantine ? "Lebanese/Levantine colloquial Arabic" : "colloquial Arabic";
  return `Vocal: ${dialectLabel}; sing Latin lyrics with Arabic accent and vowels (Lebanese chat romanization, not English).`;
}

module.exports = {
  needsMurekaPhoneticLyrics,
  normalizeMurekaPhoneticLyrics,
  prepareMurekaPhoneticLyrics,
  murekaPhoneticStyleNote,
};
