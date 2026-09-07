/** Colloquial Arabic + Lebanese tashkeel rules for Gemini lyrics and Lyria. */

function dialectFlags(dialect = "", dialectHint = "") {
  const blob = `${dialect} ${dialectHint}`.toLowerCase();
  const isMsa = /\bmsa\b|modern standard|fusha|fus'?ha|formal arabic|classical arabic|فصحى|فصح/.test(blob);
  const isLebanese = /lebanese|levantine|لبنان|بيروت|beirut/.test(blob);
  const isLevantineColloquial =
    isLebanese || /syrian|palestinian|jordanian|سور|فلسط|shami/.test(blob);
  return { blob, isMsa, isLebanese, isLevantineColloquial };
}

function isArabicLyricsContext({ dialect = "", dialectHint = "", scriptFormat = "", seed = "" } = {}) {
  const fmt = String(scriptFormat || "").trim().toLowerCase();
  if (fmt === "arabizi") return false;
  if (fmt === "arabic") return true;
  const flags = dialectFlags(dialect, dialectHint);
  if (flags.isMsa || flags.isLevantineColloquial) return true;
  if (/[\u0600-\u06FF]/.test(String(seed || ""))) return true;
  return /arabic|egyptian|iraqi|gulf|maghrebi|syrian|palestinian|tunisian|sudanese|darija|msa|فصحى|محك/.test(flags.blob);
}

/** Rules when Gemini writes Arabic script (full song, arrange, fix, etc.). */
function buildColloquialArabicGenerationLines({ isMsa = false, isLebanese = false, isLevantineColloquial = false } = {}) {
  if (isMsa) {
    return [
      "MSA / فصحى: formal Arabic OK, but do NOT add tanween (ًٌٍ) unless the user explicitly asked for classical nahwi endings.",
    ];
  }
  if (isLebanese) {
    return [
      "LEBANESE ARABIC SCRIPT (required):",
      "- Spoken Beirut colloquial ONLY — never fusHa nahwi, NEVER tanween (ًٌٍ) on any word unless user explicitly asked for MSA.",
      "- Lebanese closes syllables with sukoon (سكون): many consonants inside words and at word ends are stopped, not left open.",
      "- Tight word endings (ساكن): write how Lebanese speaks — ما not مًا، شو not شَوًّا، منيح not منيحًا; no accusative/genitive tanween.",
      "- Examples of stopped endings: خلّص، عم، منّ، فيّ، شُفت، قلّي — consonant feels closed, not classical open vowel + tanween.",
      "- Internal clusters keep sukoon feel (كتب، شفت، قلّي) — do NOT add formal tashkeel or tanween in generated lyrics.",
      "- ق = hamza in speech (قلب، قلت، قال) — not classical /q/.",
      "- Do NOT add vowel marks (tashkeel) in generated lyrics — diacritics is a separate step.",
    ];
  }
  if (isLevantineColloquial) {
    return [
      "LEVANTINE COLLOQUIAL ARABIC SCRIPT:",
      "- Spoken colloquial ONLY — no tanween (ًٌٍ) or nahwi case endings unless user asked for MSA.",
      "- Close word endings naturally (sukoon feel) — no open classical case endings on final words.",
      "- ق = hamza in this dialect, not classical /q/.",
      "- No heavy tashkeel in generated lyrics.",
    ];
  }
  return [
    "COLLOQUIAL ARABIC SCRIPT:",
    "- No tanween (ًٌٍ) or formal nahwi endings unless MSA was explicitly requested.",
    "- Spoken dialect forms, not textbook fusHa open endings.",
  ];
}

function buildLebaneseDiacriticsLinesAr() {
  return [
    "شكّل بحركات اللهجة اللبنانية المحكية: فتحة/كسرة/ضمة/شدة + سكّون (ْ) على الحروف الساكنة داخل الكلمة وآخرها.",
    "اللبناني فيه سكّون كتير — آخر الكلمة غالباً ينسكر بسكّون على الحرف الأخير (مش تنوين، مش إعراب).",
    "أمثلة: شُفتْ، مِنّ، فيّ، خلَّصْ، قلّي، عمْ — سكّون على السوكن، مش -ًا/-ٌ/-ٍ.",
    "ممنوع تماماً: تنوين (ًٌٍ)، إعراب، أو تشكيل نحوي على آخر الكلمات — إلا إذا طلب المستخدم فصحى صراحة.",
    "ق = همزة (2): قلب، قلت، قال — مش /q/ فصيح.",
    "امشي على نطق بيروت المحكي: شو، كيف، حبّيبي، عم، ما، منيح.",
  ];
}

function buildLebaneseDiacriticsLinesEn() {
  return [
    "Mark for spoken Beirut Lebanese: fatha/kasra/damma/shadda PLUS sukoon (ْ) on stopped consonants inside words AND at word ends.",
    "Lebanese uses many sukoons — final consonants are often closed with sukoon, NOT tanween or nahwi endings.",
    "Examples: shuftْ, minn, fiyy, khallasْ, qilli — sukoon on the stopped letter, never -an/-un/-in tanween.",
    "NEVER add tanween (ًٌٍ) or nahwi case endings unless user explicitly requested MSA/formal.",
    "Qaf ق = hamza (2), not classical /q/ — e.g. قلب، قلت، قال.",
    "Spoken Beirut: شو، كيف، حبّيبي، عم، ما، منيح.",
  ];
}

function buildLevantineDiacriticsLinesAr() {
  return [
    "شكّل بحركات اللهجة الشامية المحكية + سكّون على الحروف الساكنة (داخل وآخر الكلمة).",
    "ممنوع: تنوين (ًٌٍ)، إعراب، أو تشكيل نحوي على آخر الكلمات.",
    "ق باللهجة المحكية = همزة (2) مش /q/ فصيح.",
  ];
}

function buildLevantineDiacriticsLinesEn() {
  return [
    "Mark spoken Levantine with vowels + sukoon on stopped consonants at word ends and in clusters.",
    "NO tanween (ًٌٍ), NO nahwi case endings, NO textbook MSA pronunciation.",
    "Qaf ق = hamza in this dialect, not classical /q/.",
  ];
}

/** Strip tanween from colloquial Arabic lyrics. */
function stripColloquialTanween(input) {
  return String(input || "").replace(/[\u064B-\u064D]/g, "");
}

/**
 * Post-process Gemini tashkeel output.
 * Colloquial: always drop tanween; keep sukoon for Lebanese; strip all sukoon for other dialects.
 */
function lightenSungArabicDiacritics(input, { isMsa = false, isLebanese = false } = {}) {
  let text = stripColloquialTanween(input);
  if (!text) return text;
  if (!isMsa && !isLebanese) {
    text = text.replace(/\u0652/g, "");
  }
  return text;
}

function buildLyriaLebaneseArabicNote() {
  return "Lebanese colloquial Arabic: stopped consonants with sukoon at word ends and inside clusters; no tanween; no MSA case endings; qaf as hamza.";
}

module.exports = {
  dialectFlags,
  isArabicLyricsContext,
  buildColloquialArabicGenerationLines,
  buildLebaneseDiacriticsLinesAr,
  buildLebaneseDiacriticsLinesEn,
  buildLevantineDiacriticsLinesAr,
  buildLevantineDiacriticsLinesEn,
  stripColloquialTanween,
  lightenSungArabicDiacritics,
  buildLyriaLebaneseArabicNote,
};
