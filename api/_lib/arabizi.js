/** Lebanese / Levantine Arabizi detection + prompt helpers (server). */

const ARABIC_SCRIPT_RE = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;
const LATIN_LETTER_RE = /[A-Za-z\u00C0-\u024F\u1E00-\u1EFF]/;
const ARABIZI_DIGIT_IN_WORD_RE = /(?:^|[\s'(\[])[a-zA-Z]*[253789][a-zA-Z][\w']*/;
const ARABIZI_MARKER_RE =
  /\b(?:shou|shu|chou|kif|keef|habib[iy]|7abib[iy]|yalla|mafi|ma\s+fi|b7k|b7ke|2elt|2alb|3ala|7ay|mesh|mish|mnih|minih|khalas|khallas)\w*/i;
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

function isLebaneseDialect(dialect = "", dialectHint = "") {
  const blob = `${dialect} ${dialectHint}`.toLowerCase();
  return /lebanese|beirut|لبنان|بيروت/.test(blob) && !/syrian|palestinian|سور|فلسط/.test(blob);
}

/** Lyria 3.5 Franco conversion prompt — Lebanese/Levantine (replaces legacy TO_ARABIZI_LINES). */
function buildLevantineFrancoConversionRules() {
  return [
    "You are a specialized phonetic text converter and editor for Lebanese Arabic music generation models like Lyria 3.5.",
    "Your task is to take input Arabic song lyrics (Lebanese / Levantine dialect) and convert them into strict Franco-Arabic (Arabizi) formatted specifically for text-to-speech audio models, avoiding Egyptian/Syrian Fusha pronunciation leakage.",
    "",
    "Follow these strict phonetic mapping rules:",
    "",
    "1. LEBANESE IMALA & VOWEL SYSTEM (CRITICAL):",
    "   - Use 'e' or 'eh' for the Lebanese Imala/E-sound at word endings (e.g., كلمة -> kelme, دني -> dene, حلوة -> 7elwe).",
    "   - Use 'i' or 'ee' for the short 'i' sound instead of 'u' or 'o' (e.g., كل -> kill, مش -> mish, شوارع -> shwaree).",
    "   - Use 'e' for past tense verbs (e.g., شفنا -> chefna, علمنا -> 3allemna).",
    "   - Extend 'a' sounds to 'ee' or 'ei' when pronounced with heavy Lebanese Imala (e.g., حياتي -> hayeeti / hayeeteh).",
    "",
    "2. SILENT QAF & HAMZA:",
    "   - Use apostrophe for glottal / hamza / silent qaf (e.g., قلبي -> 'albi, وقت -> wa't, دقيقة -> da'ee'a).",
    "",
    "3. AIN vs GHAIN:",
    "   - Spell Ain (ع) with vowels/context (e.g., عم -> 'am or aam, صعب -> sa'eb, عيونك -> 'yoonak).",
    "   - Replace Ghain (غ) with 'gh' (e.g., غيرك -> gherak).",
    "",
    "4. HAA (ح) vs HAA (هـ):",
    "   - Emphatic Ha (ح): use 'h' with clear vowel context or 'hh' when needed (e.g., حب -> hub, لحظة -> lahza).",
    "   - Replace Haa (هـ) with standard letter 'h' (e.g., هيداك -> haydak, هالدني -> hal-dene, هو -> huwwi).",
    "",
    "5. KHA (خ):",
    "   - Replace Kha (خ) with 'kh' (e.g., خليك -> khalleek, خليني -> khalleeni).",
    "",
    "6. DIGITS & CHARACTERS:",
    "   - DO NOT insert Latin digits (0–9) unless they already appear in the source lyrics.",
    "   - DO NOT use the letter 'q' or 'Q' for qaf — use apostrophe glottal or vowel spelling.",
    "   - Apostrophe (') is allowed for hamza/glottal.",
    "",
    "7. STRUCTURE TAGS:",
    "   - Keep all structural markers like [Intro], [Verse 1], [Verse 2], [Pre-Chorus], [Chorus], [Bridge], [Outro] intact and in English.",
    "",
    "8. CONVERSION INTEGRITY:",
    "   - Keep the SAME words, story, line count, and rhyme slots. Do NOT rewrite themes.",
    "   - Do NOT translate into English. Latin letters = Arabic words only.",
    "   - Honor Arabic address/gender hints in the dialect hint (e.g., masculine addressee حبيبي stays habibi / 7abibi).",
    "   - Output lyrics only — no Arabic script, no explanations.",
  ];
}

function buildToArabiziConversionLines({ dialect = "", dialectHint = "" } = {}) {
  const blob = `${dialect} ${dialectHint}`.toLowerCase();
  const levantine = isLevantineDialect(dialect, dialectHint);
  const lebanese = isLebaneseDialect(dialect, dialectHint);
  const isEgyptian = /egyptian|masri|مصر/.test(blob);
  const isGulf = /gulf|khaleeji|خليج/.test(blob);

  if (levantine) {
    const lines = buildLevantineFrancoConversionRules();
    if (!lebanese && /syrian|palestinian|سور|فلسط/.test(blob)) {
      lines.push(
        "",
        "Dialect color: Syrian/Palestinian Levantine — same Franco number system, slight spoken color from dialect hint; colloquial Levantine Franco.",
      );
    }
    if (dialect) lines.push(`Dialect label: ${dialect}`);
    if (dialectHint) lines.push(`Dialect / address hint: ${dialectHint}`);
    return lines;
  }

  if (isEgyptian) {
    return [
      "Convert Arabic lyrics to Franco-Arabic (Arabizi) for Lyria singing — Egyptian Masri colloquial phonetics.",
      "Keep SAME words, lines, section tags. Output Latin only, Arabic script off.",
      "Masri: apostrophe for hamza/ق, kh=خ, gh=غ, spell ع/ح with Latin letters — no digits unless already in source.",
      "Masri vowels: preserve Masri imala and spoken endings — keep Cairo Masri color.",
      "Keep [Verse] [Chorus] tags in English.",
      dialect ? `Dialect: ${dialect}` : "",
      dialectHint ? `Hint: ${dialectHint}` : "",
    ].filter(Boolean);
  }

  if (isGulf) {
    return [
      "Convert Arabic lyrics to Franco-Arabic (Arabizi) for Lyria singing — Khaleeji/Gulf colloquial phonetics.",
      "Keep SAME words, lines, section tags. Output Latin only, Arabic script off.",
      "Apostrophe for hamza/ق, kh=خ, gh=غ — no Latin digits unless already in source lyrics.",
      "Keep [Verse] [Chorus] tags in English.",
      dialect ? `Dialect: ${dialect}` : "",
      dialectHint ? `Hint: ${dialectHint}` : "",
    ].filter(Boolean);
  }

  return [
    "Convert Arabic lyrics to Franco-Arabic (Arabizi) for Lyria 3.5 — colloquial Arabic phonetics.",
    "Keep SAME words, story, line count, section tags. Output Latin only.",
    "Apostrophe for glottal/qaf, kh=خ, gh=غ — spell other sounds with Latin letters. No digits unless in source.",
    "Keep [Verse] [Chorus] tags in English.",
    dialect ? `Dialect: ${dialect}` : "",
    dialectHint ? `Hint: ${dialectHint}` : "",
  ].filter(Boolean);
}

function buildArabiziPromptLines({ dialect = "", dialectHint = "" } = {}) {
  const levantine = isLevantineDialect(dialect, dialectHint);
  return [
    "SCRIPT (required): Write ALL lyrics in Franco-Arabic (Arabizi) — Latin phonetic spelling for Lyria 3.5 (Arabic words sung as Arabic).",
    "Use Latin phonetic spelling only. Keep Arabic meaning; skip Arabic script for this pass.",
    levantine
      ? [
        "Lebanese/Levantine Franco spelling (Lyria 3.5):",
        "- Imala: word endings use e/eh (kelme, 7elwe); short i as i/ee (mish, kill); past tense e (chefna).",
        "- Glottal/qaf/hamza: apostrophe ('albi, wa't) — never letter q; never insert digits unless user seed has them",
        "- kh = خ, gh = غ; h = هـ (haydak, huwwi); spell ع with vowels/context",
        "- ch = ش for shou/chou words; keep spelling consistent within the song",
        "- Double end consonants when spoken (taraktinne)",
        "Examples: chou, kif, ma fi, habibi, yalla, 'eltelak, bke, mnih, khallasna",
      ].join("\n")
      : [
        "Latin phonetics: apostrophe for glottal, kh/gh/sh — match dialect. No digits unless user seed has them.",
        "Keep spelling consistent within the song.",
      ].join("\n"),
    "Keep section tags in English: [Verse] [Chorus] etc. Latin phonetic lyrics only.",
    "No commas, semicolons, or colons inside lyric lines — line breaks only.",
    dialect ? `Dialect flavor: ${dialect}` : "",
    dialectHint ? `Dialect hint: ${dialectHint}` : "",
  ].filter(Boolean);
}

/** Strong performance note injected into Lyria prompts when lyrics are Arabizi. */
function buildLyriaArabiziPerformanceNote({ dialect = "", dialectHint = "" } = {}) {
  const levantine = isLevantineDialect(dialect, dialectHint);
  const label = levantine ? "Lebanese Beirut colloquial Arabic" : "colloquial Arabic";
  return [
    `FRANCO-ARABIC LYRICS (${label} in Latin letters — sing as Arabic phonetics):`,
    "- Sing as a native Arabic speaker with authentic dialect pronunciation.",
    "- Latin spellings are phonetic Arabic only: Arabic vowels, Arabic stress, Levantine imala (e/eh endings).",
    "- Apostrophe = glottal/qaf ('albi); kh = خ, gh = غ; h = هـ — Latin letters only unless lyrics already use digits.",
    "- Double consonants at word end = gemination — hold the doubled letter (taraktinne).",
    levantine ? "- Lebanese spoken qaf/hamza = soft glottal (apostrophe or vowel), colloquial Levantine color." : "",
  ].filter(Boolean).join("\n");
}

function isArabiziScript({ scriptFormat = "", lyrics = "" } = {}) {
  const fmt = String(scriptFormat || "").trim().toLowerCase();
  if (fmt === "arabizi") return true;
  return looksLikeArabizi(lyrics);
}

/** @deprecated Use buildToArabiziConversionLines — kept for importers. */
const TO_ARABIZI_LINES = buildToArabiziConversionLines();

module.exports = {
  looksLikeArabizi,
  resolveScriptFormat,
  isLevantineDialect,
  isLebaneseDialect,
  isArabiziScript,
  buildArabiziPromptLines,
  buildToArabiziConversionLines,
  buildLevantineFrancoConversionRules,
  buildLyriaArabiziPerformanceNote,
  TO_ARABIZI_LINES,
};
