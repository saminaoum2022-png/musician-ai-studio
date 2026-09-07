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
  const blob = `${dialect} ${dialectHint}`.toLowerCase();
  const levantine = isLevantineDialect(dialect, dialectHint);
  return [
    "SCRIPT (required): Write ALL lyrics in Arabizi — Latin letters + Franco-Arabic numbers for Arabic sounds.",
    "This phonetic spelling helps AI singers (Lyria) pronounce Lebanese/Levantine colloquial correctly. Do NOT use Arabic script.",
    levantine
      ? [
        "Lebanese / Levantine Arabizi map:",
        "- 2 = hamza AND spoken qaf (قل→2al, قلب→2alb, 2eltelak = قلتلك) — never classical /q/",
        "- 3 = ع (3ala, 3a2bel)",
        "- 5 = خ",
        "- 7 = ح (7abibi, b7ke)",
        "- 8 = غ",
        "Examples: shou, kif, ma fi, habibi, yalla, 2eltelak, b7ke, mnih, khallasna",
        "Natural Beirut texting style — keep spelling consistent within the song.",
      ].join("\n")
      : [
        "Arabizi map: 2=hamza/qaf, 3=ayn, 5=kha, 7=ha, 8=ghayn — match the target dialect's spoken sounds.",
        "Keep spelling consistent within the song.",
      ].join("\n"),
    "Keep section tags in English: [Verse] [Chorus] etc. No tashkeel. No Arabic script.",
    dialect ? `Dialect flavor: ${dialect}` : "",
    dialectHint ? `Dialect hint: ${dialectHint}` : "",
  ].filter(Boolean);
}

const TO_ARABIZI_LINES = [
  "Convert these lyrics to Arabizi (Latin phonetic spelling for AI singing).",
  "Keep the SAME words, story, section tags, and line count. Do NOT rewrite the theme.",
  "Use Lebanese / Levantine Franco-Arabic: 2=hamza/spoken qaf, 3=ع, 7=ح, 5=خ, 8=غ.",
  "Examples: قلتلك→2eltelak, بحكي→b7ke, شو→shou, قلب→2alb.",
  "Output lyrics only — Latin Arabizi, no Arabic script, no explanations.",
];

module.exports = {
  looksLikeArabizi,
  resolveScriptFormat,
  isLevantineDialect,
  buildArabiziPromptLines,
  TO_ARABIZI_LINES,
};
