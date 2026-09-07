/** Lebanese / Levantine Arabizi detection + prompt helpers (server). */

const ARABIC_SCRIPT_RE = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;
const LATIN_LETTER_RE = /[A-Za-z\u00C0-\u024F\u1E00-\u1EFF]/;
const ARABIZI_DIGIT_IN_WORD_RE = /(?:^|[\s'(\[])[a-zA-Z]*[253789][a-zA-Z][\w']*/;
const ARABIZI_MARKER_RE =
  /\b(?:shou|shu|kif|keef|habib[iy]|7abib[iy]|yalla|mafi|ma\s+fi|b7k|b7ke|2elt|2alb|3ala|7ay|mesh|mish|mnih|minih|khalas|khallas)\w*/i;
const ARABIZI_PARTICLE_RE =
  /\b(?:ana|ente|inti|int[aie]|ma\s|fi\s|min\s|hal|hay|w\s|ya\s)\b/i;

function latinLetterCount(text) {
  return (String(text || "").match(/[a-zA-Z]/g) || []).length;
}

function arabicLetterCount(text) {
  let n = 0;
  for (const ch of String(text || "")) {
    if (ARABIC_SCRIPT_RE.test(ch)) n += 1;
  }
  return n;
}

/** True when lyrics are primarily Latin Arabizi, not Arabic script. */
function looksLikeArabizi(text) {
  const s = String(text || "");
  if (!s.trim()) return false;
  const arabic = arabicLetterCount(s);
  const latin = latinLetterCount(s);
  if (arabic > latin && arabic >= 6) return false;
  if (latin < 8) return false;
  if (ARABIZI_DIGIT_IN_WORD_RE.test(s)) return true;
  if (ARABIZI_MARKER_RE.test(s)) return true;
  if (ARABIZI_PARTICLE_RE.test(s) && latin >= 20) return true;
  return false;
}

function resolveScriptFormat(body = {}, seed = "") {
  const explicit = String(body?.scriptFormat || "").trim().toLowerCase();
  if (explicit === "arabizi" || explicit === "arabic") return explicit;
  if (looksLikeArabizi(seed)) return "arabizi";
  if (ARABIC_SCRIPT_RE.test(String(seed || ""))) return "arabic";
  return "latin";
}

function isLevantineDialect(dialect = "", dialectHint = "") {
  const blob = `${dialect} ${dialectHint}`.toLowerCase();
  return /lebanese|levantine|syrian|palestinian|beirut|shami|لبنان|بيروت/.test(blob);
}

function buildArabiziPromptLines({ dialect = "", dialectHint = "" } = {}) {
  const levantine = isLevantineDialect(dialect, dialectHint);
  return [
    "SCRIPT (required): Write ALL lyrics in Arabizi — Latin phonetic spelling for AI singing (Lebanese Arabic words, NOT English).",
    "Do NOT use Arabic script. Do NOT write English words unless the song is intentionally mixed.",
    levantine
      ? [
        "Lebanese Arabizi spelling (for Lyria pronunciation):",
        "- ch = ش (chou, b7ke — NOT shou/sh)",
        "- kh = خ (NOT 5), gh = غ (NOT 8), 7 = ح, 3 = ع",
        "- hamza mid-word: apostrophe ' (NOT digit 2 — Lyria reads 2 as English)",
        "- word-initial hamza/qaf: omit ' and 2 — start with vowel/consonant (el, alb, not 'el or 2alb)",
        "- Lebanese gemination: double the consonant at word end when spoken (taraktinne not taraktini)",
        "- Keep French-style é where natural; consistent spelling within the song",
        "Examples: chou, kif, ma fi, habibi, yalla, 'eltelak, b7ke, mnih, khallasna",
      ].join("\n")
      : [
        "Arabizi map: ch=sh, kh=خ, gh=غ, 7=ح, 3=ع, apostrophe=hamza — match target dialect spoken sounds.",
        "Keep spelling consistent within the song.",
      ].join("\n"),
    "Keep section tags in English: [Verse] [Chorus] etc. No tashkeel. No Arabic script.",
    dialect ? `Dialect flavor: ${dialect}` : "",
    dialectHint ? `Dialect hint: ${dialectHint}` : "",
  ].filter(Boolean);
}

/** Strong performance note injected into Lyria prompts when lyrics are Arabizi. */
function buildLyriaArabiziPerformanceNote({ dialect = "", dialectHint = "" } = {}) {
  const levantine = isLevantineDialect(dialect, dialectHint);
  const label = levantine ? "Lebanese Beirut colloquial Arabic" : "colloquial Arabic";
  return [
    `CRITICAL — ARABIZI LYRICS (${label} in Latin letters, NOT English text):`,
    "- Sing as a native Arabic speaker with authentic dialect pronunciation — NEVER read lines as English words.",
    "- Latin spellings are phonetic Arabic only: Arabic vowels, Arabic stress, Levantine mouth shapes.",
    "- ch = ش, kh = خ, gh = غ, 7 = ح, 3 = ع; apostrophe ' = hamza mid-word (not English /t/ or /k/).",
    "- Double consonants at word end = Lebanese gemination — hold the doubled letter (taraktinne).",
    "- No English accent, no anglicized syllables, no letter-by-letter English phonics.",
    levantine ? "- Lebanese spoken qaf is glottal (') — never classical /k/." : "",
  ].filter(Boolean).join("\n");
}

function isArabiziScript({ scriptFormat = "", lyrics = "" } = {}) {
  const fmt = String(scriptFormat || "").trim().toLowerCase();
  if (fmt === "arabizi") return true;
  return looksLikeArabizi(lyrics);
}

const TO_ARABIZI_LINES = [
  "Convert these lyrics to Arabizi (Latin phonetic spelling for AI singing — Arabic words, NOT English).",
  "Keep the SAME words, story, section tags, and line count. Do NOT rewrite the theme.",
  "Lebanese spelling: ch=ش, kh=خ, gh=غ, 7=ح, 3=ع, apostrophe=hamza mid-word; double end consonants when spoken.",
  "Examples: قلتلك→'eltelak, بحكي→b7ke, شو→chou, قلب→alb (no leading 2).",
  "Output lyrics only — Latin Arabizi, no Arabic script, no explanations.",
];

module.exports = {
  looksLikeArabizi,
  resolveScriptFormat,
  isLevantineDialect,
  isArabiziScript,
  buildArabiziPromptLines,
  buildLyriaArabiziPerformanceNote,
  TO_ARABIZI_LINES,
};
