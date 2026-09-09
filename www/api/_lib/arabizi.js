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
    "   - Use 'i' or 'ee' for the short 'i' sound instead of 'u' or 'o' (e.g., كل -> kill, مش -> mish, شوارع -> shaware3).",
    "   - Use 'e' for past tense verbs (e.g., شفنا -> chefna, علمنا -> 3allemna).",
    "   - Extend 'a' sounds to 'ee' or 'ei' when pronounced with heavy Lebanese Imala (e.g., حياتي -> 7ayeeti / 7ayeeteh).",
    "",
    "2. SILENT QAF & HAMZA:",
    "   - Replace silent Qaf (ق) or Hamza (أ/إ/ؤ/ئ) with number '2' (e.g., قلبي -> 2albi, وقت -> wa2et, دقيقة -> da2ee2a).",
    "",
    "3. AIN vs GHAIN:",
    "   - Replace Ain (ع) with number '3' (e.g., عم -> 3am, صعب -> sa3eb, عيونك -> 3yoonak).",
    "   - Replace Ghain (غ) with 'gh' (e.g., غيرك -> gherak).",
    "",
    "4. HAA (ح) vs HAA (هـ):",
    "   - Replace Ha (ح) with number '7' (e.g., حب -> 7ub, لحظة -> la7za, حياتي -> 7ayeeteh).",
    "   - Replace Haa (هـ) with standard letter 'h' (e.g., هيداك -> haydak, هالدني -> hal-dene, هو -> huwwi).",
    "",
    "5. KHA (خ):",
    "   - Replace Kha (خ) with 'kh' (e.g., خليك -> khalleek, خليني -> khalleeni).",
    "",
    "6. FORBIDDEN CHARACTERS:",
    "   - DO NOT use the single quote (') character anywhere (e.g., write 2albi, NOT 'albi).",
    "   - DO NOT use the letter 'q' or 'Q'. Always use '2' for the Lebanese glottal stop.",
    "   - Use standard numbers ONLY: 2, 3, 7.",
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
        "Dialect color: Syrian/Palestinian Levantine — same Franco number system, slight spoken color from dialect hint; still NOT Fusha.",
      );
    }
    if (dialect) lines.push(`Dialect label: ${dialect}`);
    if (dialectHint) lines.push(`Dialect / address hint: ${dialectHint}`);
    return lines;
  }

  if (isEgyptian) {
    return [
      "Convert Arabic lyrics to Franco-Arabic (Arabizi) for Lyria singing — Egyptian Masri colloquial, NOT English.",
      "Keep SAME words, lines, section tags. Output Latin only, no Arabic script.",
      "Masri map: 2=hamza/ق glottal, 3=ع, 7=ح, kh=خ, gh=غ. No apostrophes. No letter q.",
      "Masri vowels: preserve Masri imala and spoken endings — do NOT Levantinize.",
      "Keep [Verse] [Chorus] tags in English.",
      dialect ? `Dialect: ${dialect}` : "",
      dialectHint ? `Hint: ${dialectHint}` : "",
    ].filter(Boolean);
  }

  if (isGulf) {
    return [
      "Convert Arabic lyrics to Franco-Arabic (Arabizi) for Lyria singing — Khaleeji/Gulf colloquial, NOT English.",
      "Keep SAME words, lines, section tags. Output Latin only, no Arabic script.",
      "Map: 2=hamza/ق, 3=ع, 7=ح, kh=خ, gh=غ. No apostrophes. No letter q.",
      "Keep [Verse] [Chorus] tags in English.",
      dialect ? `Dialect: ${dialect}` : "",
      dialectHint ? `Hint: ${dialectHint}` : "",
    ].filter(Boolean);
  }

  return [
    "Convert Arabic lyrics to Franco-Arabic (Arabizi) for Lyria 3.5 — colloquial Arabic phonetics, NOT English.",
    "Keep SAME words, story, line count, section tags. Output Latin only.",
    "Map: 2=glottal/qaf, 3=ع, 7=ح, kh=خ, gh=غ. No apostrophes. No letter q. Numbers 2, 3, 7 only.",
    "Keep [Verse] [Chorus] tags in English.",
    dialect ? `Dialect: ${dialect}` : "",
    dialectHint ? `Hint: ${dialectHint}` : "",
  ].filter(Boolean);
}

function buildArabiziPromptLines({ dialect = "", dialectHint = "" } = {}) {
  const levantine = isLevantineDialect(dialect, dialectHint);
  return [
    "SCRIPT (required): Write ALL lyrics in Franco-Arabic (Arabizi) — Latin phonetic spelling for Lyria 3.5 (Arabic words, NOT English).",
    "Do NOT use Arabic script. Do NOT write English words unless the song is intentionally mixed.",
    levantine
      ? [
        "Lebanese/Levantine Franco spelling (Lyria 3.5):",
        "- Imala: word endings use e/eh (kelme, 7elwe); short i as i/ee (mish, kill); past tense e (chefna).",
        "- 2 = silent qaf/hamza (2albi, wa2et) — NEVER apostrophe or letter q",
        "- 3 = ع, 7 = ح, kh = خ, gh = غ; h = هـ (haydak, huwwi)",
        "- ch = ش for shou/chou words; keep spelling consistent within the song",
        "- Double end consonants when spoken (taraktinne)",
        "Examples: chou, kif, ma fi, 7abibi, yalla, 2eltelak, b7ke, mnih, khallasna",
      ].join("\n")
      : [
        "Franco map: 2=glottal, 3=ع, 7=ح, kh=خ, gh=غ — match target dialect spoken sounds.",
        "No apostrophes. No letter q. Keep spelling consistent within the song.",
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
    `CRITICAL — FRANCO-ARABIC LYRICS (${label} in Latin letters, NOT English text):`,
    "- Sing as a native Arabic speaker with authentic dialect pronunciation — NEVER read lines as English words.",
    "- Latin spellings are phonetic Arabic only: Arabic vowels, Arabic stress, Levantine imala (e/eh endings).",
    "- 2 = glottal/qaf (2albi), 3 = ع, 7 = ح, kh = خ, gh = غ; h = هـ — NOT English letter-by-letter phonics.",
    "- Do NOT read digit 2 as the English word 'two' — it is a glottal stop marker only.",
    "- Double consonants at word end = gemination — hold the doubled letter (taraktinne).",
    "- No English accent, no anglicized syllables.",
    levantine ? "- Lebanese spoken qaf/hamza = 2 — never classical /q/ or /k/." : "",
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
