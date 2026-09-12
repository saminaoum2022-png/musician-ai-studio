/** Colloquial Arabic + Lebanese tashkeel rules for Gemini lyrics and Lyria. */

function dialectFlags(dialect = "", dialectHint = "") {
  const blob = `${dialect} ${dialectHint}`.toLowerCase();
  const isMsa = /\bmsa\b|modern standard|fusha|fus'?ha|formal arabic|classical arabic|فصحى|فصح/.test(blob);
  const isEgyptian = /egyptian|masri|مصر|cairo/.test(blob) && !isMsa;
  const isLebanese = /lebanese|لبنان|بيروت|beirut/.test(blob) && !isEgyptian && !isMsa;
  const isIraqi = /iraqi|عراق|baghdad/.test(blob) && !isEgyptian && !isMsa;
  const isGulf = /gulf|khaleeji|خليج|kuwait|emirati|saudi/.test(blob) && !isIraqi && !isEgyptian && !isMsa;
  const isMaghrebi = /maghrebi|moroccan|darija|دارجة|tunisian|تونس/.test(blob) && !isMsa;
  const isLevantineColloquial =
    (isLebanese || /syrian|palestinian|jordanian|levantine|سور|فلسط|shami/.test(blob)) && !isEgyptian && !isMsa;
  return { blob, isMsa, isLebanese, isEgyptian, isIraqi, isGulf, isMaghrebi, isLevantineColloquial };
}

/** male | female | group — from the Create address chip, or inferred from the dialect hint. */
function normalizeArabicAddress(value = "", dialectHint = "") {
  const v = String(value || "").trim().toLowerCase();
  if (v === "male" || v === "female" || v === "group") return v;
  const blob = `${value} ${dialectHint}`.toLowerCase();
  if (/to a woman|حبيبتي|أنتِ|انتِ|كنتِ/.test(blob)) return "female";
  if (/to a group|إنتو|انتو|حبايبي|كنتو/.test(blob)) return "group";
  if (/to a man|حبيبي|أنتَ|انتَ/.test(blob)) return "male";
  return "";
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
function buildColloquialArabicGenerationLines({
  isMsa = false,
  isLebanese = false,
  isEgyptian = false,
  isLevantineColloquial = false,
} = {}) {
  if (isMsa) {
    return [
      "MSA / فصحى: formal Arabic OK, but do NOT add tanween (ًٌٍ) unless the user explicitly asked for classical nahwi endings.",
    ];
  }
  if (isEgyptian) {
    return [
      "EGYPTIAN ARABIC SCRIPT (required):",
      "- Spoken Cairo Masri ONLY — never fusHa nahwi, NEVER tanween (ًٌٍ) unless user explicitly asked for MSA.",
      "- Use Egyptian present-tense prefix ب- on verbs (بيحلى، بيقول، بشوف، بعمل).",
      "- Do NOT add heavy tashkeel in generated lyrics.",
      ...buildEgyptianLexiconLines(),
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
      ...buildLebaneseLexiconLines(),
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

function buildSparseDiacriticsLinesAr() {
  return [
    "تشكيل خفيف للغناء — مش كتاب مدرسي. كثرة الحركات بتقتل الغناء.",
    "شكّل فقط: (1) آخر الكلمة إذا الغناء ممكن يغلط، (2) العنوان إنتَ/إنتِ/إنتو وكاف المخاطبة، (3) شدة إذا بتغيّر اللفظ، (4) سكون لبناني/شامي على الحرف المسكور.",
    "ممنوع: فتحة/كسرة/ضمة على كل حرف، تنوين، إعراب نحوي.",
  ];
}

function buildSparseDiacriticsLinesEn() {
  return [
    "SPARSE sung tashkeel — heavy marks kill the vocal. Do NOT vowelize every letter.",
    "Mark ONLY: (1) word endings the singer might misread, (2) address إنتَ/إنتِ/إنتو and addressee kaf, (3) shadda when it changes the word, (4) Lebanese/Levantine sukoon on stopped letters.",
    "NO textbook full tashkeel. NO tanween. NO nahwi case endings.",
  ];
}

function buildLebaneseDiacriticsLinesAr() {
  return [
    "لبناني خفيف: سكّون (ْ) على آخر الكلمة إذا منسكر + شدة إذا لازمة. لا تحرّك كل حرف.",
    "أمثلة خفيفة: شفتْ، خلّصْ، عمْ، إنتَ/إنتِ — مش شَفْتُكَ المدرسية.",
    "ممنوع: تنوين (ًٌٍ)، إعراب، أو تشكيل على وسط الكلمة إلا إذا اللفظ بيتلبس.",
    "ق = همزة (2): قلب، قلت — مش /q/ فصيح.",
  ];
}

function buildLebaneseDiacriticsLinesEn() {
  return [
    "Light Lebanese: sukoon (ْ) on stopped word ends + shadda when needed. Do not mark every letter.",
    "Light examples: شفتْ، خلّصْ، عمْ، إنتَ/إنتِ — never textbook شَفْتُكَ.",
    "NEVER tanween (ًٌٍ) or nahwi. No mid-word vowels unless the singer would guess wrong.",
    "Qaf ق = hamza (2), not classical /q/.",
  ];
}

function buildLevantineDiacriticsLinesAr() {
  return [
    "شامي خفيف: سكّون على آخر الكلمة المسكور + آخر حرف للعنوان. لا تشكّل كل حرف.",
    "ممنوع: تنوين (ًٌٍ)، إعراب، أو تشكيل مدرسي.",
    "ق باللهجة المحكية = همزة (2) مش /q/ فصيح.",
  ];
}

function buildLevantineDiacriticsLinesEn() {
  return [
    "Light Levantine: sukoon on stopped word ends + address endings only. Do not mark every letter.",
    "NO tanween (ًٌٍ), NO nahwi, NO textbook MSA pronunciation.",
    "Qaf ق = hamza in this dialect, not classical /q/.",
  ];
}

function buildEgyptianDiacriticsLinesAr() {
  return [
    "مصري خفيف: آخر الكلمة + العنوان (إنتَ/إنتِ، معاكي). لا تشكّل كل حرف.",
    "ق = همزة (2) زي القاهرة. حافظ على معايا / بيحلى — مش معي اللبناني.",
    "ممنوع: تنوين (ًٌٍ)، إعراب مدرسي، أو تشكيل وسط الكلمة إلا للبس.",
  ];
}

function buildEgyptianDiacriticsLinesEn() {
  return [
    "Light Cairo Masri: word endings + address (إنتَ/إنتِ، معاكي). Do not mark every letter.",
    "Qaf ق = hamza (2) as in Cairo. Keep معايا / بيحلى — never Levantine معي.",
    "NO tanween (ًٌٍ), NO school nahwi, NO mid-word vowels unless ambiguous.",
  ];
}

function buildDiacriticsDialectLinesAr(flags = {}) {
  if (flags.isMsa) {
    return [
      "فصحى خفيفة: آخر الكلمة + ما يلزم للبس. لا تنوين إلا إذا طلب المستخدم إعراباً صراحة. ممنوع تشكيل كل حرف.",
    ];
  }
  if (flags.isEgyptian) return buildEgyptianDiacriticsLinesAr();
  if (flags.isLebanese) return buildLebaneseDiacriticsLinesAr();
  if (flags.isLevantineColloquial) return buildLevantineDiacriticsLinesAr();
  if (flags.isIraqi) {
    return [
      "شكّل بالعراقي المحكي. ق غالباً /g/ (گ) مش همزة شامية.",
      "ممنوع: تنوين (ًٌٍ)، إعراب، أو لفظ شامي/مصري.",
    ];
  }
  if (flags.isGulf) {
    return [
      "شكّل بالخليجي المحكي. ق غالباً /g/ مش همزة شامية.",
      "ممنوع: تنوين (ًٌٍ)، إعراب، أو لفظ شامي/مصري.",
    ];
  }
  if (flags.isMaghrebi) {
    return [
      "شكّل بالدارجة المغاربية المحكية كما تُغنّى — مش فصحى.",
      "ممنوع: تنوين (ًٌٍ)، إعراب مدرسي، أو قلب لشامي/مصري.",
    ];
  }
  return [
    "لا تشكّل كل حرف — شكّل الكلمات يلي ممكن يغلط فيها الغناء.",
    "ممنوع: تنوين (ًٌٍ)، إعراب، أو تشكيل نحوي على آخر الكلمات.",
  ];
}

function buildDiacriticsDialectLinesEn(flags = {}) {
  if (flags.isMsa) {
    return [
      "Light MSA: word endings + marks that prevent a wrong reading. No tanween unless user asked for nahwi. Do not vowelize every letter.",
    ];
  }
  if (flags.isEgyptian) return buildEgyptianDiacriticsLinesEn();
  if (flags.isLebanese) return buildLebaneseDiacriticsLinesEn();
  if (flags.isLevantineColloquial) return buildLevantineDiacriticsLinesEn();
  if (flags.isIraqi) {
    return [
      "Mark for sung Iraqi colloquial. Qaf ق is usually /g/, not Levantine hamza.",
      "NO tanween (ًٌٍ), NO nahwi, NO Levantine or Egyptian pronunciation.",
    ];
  }
  if (flags.isGulf) {
    return [
      "Mark for sung Gulf / Khaleeji. Qaf ق is usually /g/, not Levantine hamza.",
      "NO tanween (ًٌٍ), NO nahwi, NO Levantine or Egyptian pronunciation.",
    ];
  }
  if (flags.isMaghrebi) {
    return [
      "Mark for sung Maghrebi darija — not MSA.",
      "NO tanween (ًٌٍ), NO school nahwi, NO Levantine or Egyptian shift.",
    ];
  }
  return [
    "Mark vowels on words the singer might misread.",
    "NO tanween (ًٌٍ), NO nahwi case endings, NO full textbook tashkeel.",
  ];
}

function buildDiacriticsAddressLinesAr(address = "", flags = {}) {
  if (address === "female") {
    const ending = flags.isEgyptian
      ? "مصري للمؤنث: إنتِ، معاكي، عليكي، قلبكِ — ياء/كسرة المخاطبة، مش معكِ الشامية."
      : flags.isLebanese || flags.isLevantineColloquial
        ? "شامي/لبناني للمؤنث: إنتِ (كسرة)، معكِ، كيفكِ، قلبكِ — كاف المخاطبة مكسورة."
        : "إنتِ (كسرة على التاء) + كاف المخاطبة كِ (معكِ، قلبكِ).";
    return [
      "العنوان إلزامي: الأغنية موجهة لامرأة (المخاطَبة)، مش جنس المغنّي.",
      ending,
      "صيغ المخاطبة المؤنثة: إنتِ، حبيبتي، غالية، كنتِ.",
      "إذا الكلمة مخاطَبة واضحة (حبيب/غالي/إنت/كاف) وافق العنوان المؤنث. لا تعيد كتابة باقي الأغنية.",
    ];
  }
  if (address === "male") {
    const ending = flags.isEgyptian
      ? "مصري للمذكر: إنتَ، معاك، عليك، قلبك — مش معي اللبنانية."
      : flags.isLebanese || flags.isLevantineColloquial
        ? "شامي/لبناني للمذكر: إنتَ (فتحة)، معكْ/معك، قلبك — كاف المخاطبة مفتوحة أو ساكنة، مش كِ."
        : "إنتَ (فتحة) + كاف المخاطبة كَ (معك، قلبك).";
    return [
      "العنوان إلزامي: الأغنية موجهة لرجل (المخاطَب)، مش جنس المغنّي.",
      ending,
      "صيغ المخاطبة المذكرة: إنتَ، حبيبي، غالي، كنتَ.",
      "إذا الكلمة مخاطَبة واضحة (حبيب/غالي/إنت/كاف) وافق العنوان المذكر. لا تعيد كتابة باقي الأغنية.",
    ];
  }
  if (address === "group") {
    const ending = flags.isEgyptian
      ? "مصري للجمع: إنتوا، أنتوا، حبايبي، كنتوا."
      : flags.isLebanese || flags.isLevantineColloquial
        ? "شامي/لبناني للجمع: إنتو، كون/-كن، حبايبي، كنتو."
        : "إنتو / أنتم للجمع: حبايبي، غاليين، كنتو.";
    return [
      "العنوان إلزامي: الأغنية موجهة لمجموعة.",
      ending,
      "إذا الكلمة مخاطَبة واضحة وافق صيغ الجمع. لا تعيد كتابة باقي الأغنية.",
    ];
  }
  return [
    "العنوان غير محدد — شكّل حسب الكلمات الموجودة بدون تغيير الجنس.",
  ];
}

function buildDiacriticsAddressLinesEn(address = "", flags = {}) {
  if (address === "female") {
    const ending = flags.isEgyptian
      ? "Egyptian feminine addressee: إنتِ، معاكي، عليكي، قلبكِ — -ik / -ki, not Levantine معكِ."
      : flags.isLebanese || flags.isLevantineColloquial
        ? "Levantine feminine addressee: إنتِ (kasra), معكِ، كيفكِ، قلبكِ — feminine kaf."
        : "Feminine: إنتِ (kasra on ta) + kaf كِ (معكِ، قلبكِ).";
    return [
      "REQUIRED address: lyrics are sung TO a woman (addressee), not the singer's gender.",
      ending,
      "Feminine vocatives: إنتِ، حبيبتي، غالية، كنتِ.",
      "If a word is a clear addressee form (حبيب / غالي / إنت / kaf), align it to feminine. Do not rewrite the rest of the song.",
    ];
  }
  if (address === "male") {
    const ending = flags.isEgyptian
      ? "Egyptian masculine addressee: إنتَ، معاك، عليك، قلبك — not Levantine معي."
      : flags.isLebanese || flags.isLevantineColloquial
        ? "Levantine masculine addressee: إنتَ (fatha), معكْ/معك، قلبك — open or stopped kaf, not كِ."
        : "Masculine: إنتَ (fatha) + kaf كَ (معك، قلبك).";
    return [
      "REQUIRED address: lyrics are sung TO a man (addressee), not the singer's gender.",
      ending,
      "Masculine vocatives: إنتَ، حبيبي، غالي، كنتَ.",
      "If a word is a clear addressee form (حبيب / غالي / إنت / kaf), align it to masculine. Do not rewrite the rest of the song.",
    ];
  }
  if (address === "group") {
    const ending = flags.isEgyptian
      ? "Egyptian plural addressee: إنتوا، أنتوا، حبايبي، كنتوا."
      : flags.isLebanese || flags.isLevantineColloquial
        ? "Levantine plural addressee: إنتو، -kon/-كن، حبايبي، كنتو."
        : "Plural addressee: إنتو، حبايبي، غاليين، كنتو.";
    return [
      "REQUIRED address: lyrics are sung TO a group.",
      ending,
      "If a word is a clear addressee form, align it to plural. Do not rewrite the rest of the song.",
    ];
  }
  return [
    "Address unspecified — mark the words as written; do not change gender.",
  ];
}

/** Strip tanween from colloquial Arabic lyrics. */
function stripColloquialTanween(input) {
  return String(input || "").replace(/[\u064B-\u064D]/g, "");
}

function isArabicCombiningMark(ch) {
  const c = String(ch || "").charCodeAt(0);
  return (c >= 0x064B && c <= 0x065F) || c === 0x0670;
}

function isArabicShortVowel(ch) {
  return ch === "\u064E" || ch === "\u064F" || ch === "\u0650";
}

/**
 * Keep only singer-useful marks: last-letter short vowels (address / ending),
 * shadda, and optional sukoon. Mid-word fatha/kasra/damma get stripped so
 * Lyria is not locked into textbook tashkeel. Words of 1–2 letters keep their
 * short vowels (مِن، شُو).
 */
function sparseSungWordMarks(run, { keepSukoon = false } = {}) {
  const letters = [];
  for (const ch of String(run || "")) {
    if (isArabicCombiningMark(ch)) {
      if (letters.length) letters[letters.length - 1].marks.push(ch);
      continue;
    }
    letters.push({ letter: ch, marks: [] });
  }
  const n = letters.length;
  return letters
    .map((L, i) => {
      const keepShort = i === n - 1 || n <= 2;
      const marks = L.marks.filter((m) => {
        if (m === "\u0651") return true;
        if (m === "\u0652") return keepSukoon;
        if (m >= "\u064B" && m <= "\u064D") return false;
        if (isArabicShortVowel(m)) return keepShort;
        return false;
      });
      return `${L.letter}${marks.join("")}`;
    })
    .join("");
}

function applySparseSungDiacritics(text, { keepSukoon = false } = {}) {
  return String(text || "").replace(/[\u0600-\u06FF]+/g, (run) => {
    if (!/[\u0621-\u064A\u0671-\u06D3]/.test(run)) return run;
    return sparseSungWordMarks(run, { keepSukoon });
  });
}

/**
 * Post-process Gemini tashkeel: drop tanween, keep sukoon only for
 * Lebanese/Levantine, then strip mid-word short vowels so singing stays free.
 */
function lightenSungArabicDiacritics(input, { isMsa = false, isLebanese = false, isLevantineColloquial = false } = {}) {
  let text = stripColloquialTanween(input);
  if (!text) return text;
  const keepSukoon = Boolean(isMsa || isLebanese || isLevantineColloquial);
  if (!keepSukoon) {
    text = text.replace(/\u0652/g, "");
  }
  return applySparseSungDiacritics(text, { keepSukoon });
}

function buildLyriaLebaneseArabicNote() {
  return "Lebanese colloquial Arabic: stopped consonants with sukoon at word ends and inside clusters; no tanween; no MSA case endings; qaf as hamza.";
}

function buildLyriaEgyptianArabicNote() {
  return "Egyptian Masri colloquial Arabic: Cairo spoken forms, ب- present prefix on verbs, authentic Masri vocabulary; no tanween; no MSA case endings.";
}

/** Word-level Egyptian vs Levantine — for lyrics generation, not just vocal accent. */
function buildEgyptianLexiconLines() {
  return [
    "EGYPTIAN WORD CHOICE (required — Levantine vocabulary is WRONG):",
    "- with me: معايا — NEVER معي (Levantine).",
    "- in my imagination / in my mind: في خيالي or في بالي — NEVER بخيالي or ع خيالي (Levantine).",
    "- Use Egyptian present-tense prefix ب- on verbs (بيحلى، بيقول، بشوف، بعمل).",
    "- Prefer Egyptian: إزاي، كده، أوي، عايز، دلوقتي، ليه، مفيش، حاجة، كمان — not Lebanese شو، هيدا، عم، منيح، ليش.",
    "- Addressing a man: إنت، حبيبي، معاك — keep Masri pronouns, not Lebanese-only slang.",
  ];
}

/** Word-level Lebanese vs Egyptian — for lyrics generation, not just vocal accent. */
function buildLebaneseLexiconLines() {
  return [
    "LEBANESE WORD CHOICE (required — Egyptian vocabulary is WRONG):",
    "- with me: معي — NEVER معايا (Egyptian).",
    "- in my imagination / in my mind: بخيالي or ع خيالي — NEVER في خيالي (Egyptian).",
    "- Avoid Egyptian present-tense prefix ب- on verbs (بيحلى، بيقول، بشوف) — use Lebanese forms (عم + verb, or natural Lebanese present without Egyptian ب-).",
    "- Prefer Lebanese: شو، كيف، هيدا، هيك، منيح، يلّا، عم، ما، ليش — not Egyptian: إزاي، كده، أوي، عايز، دلوقتي، ليه، مفيش، حاجة.",
    "- Addressing a man: إنت، حبيبي، معك — keep Levantine pronouns, not Egyptian-only slang.",
  ];
}

module.exports = {
  dialectFlags,
  normalizeArabicAddress,
  isArabicLyricsContext,
  buildColloquialArabicGenerationLines,
  buildSparseDiacriticsLinesAr,
  buildSparseDiacriticsLinesEn,
  buildLebaneseDiacriticsLinesAr,
  buildLebaneseDiacriticsLinesEn,
  buildLevantineDiacriticsLinesAr,
  buildLevantineDiacriticsLinesEn,
  buildEgyptianDiacriticsLinesAr,
  buildEgyptianDiacriticsLinesEn,
  buildDiacriticsDialectLinesAr,
  buildDiacriticsDialectLinesEn,
  buildDiacriticsAddressLinesAr,
  buildDiacriticsAddressLinesEn,
  stripColloquialTanween,
  applySparseSungDiacritics,
  lightenSungArabicDiacritics,
  buildLyriaLebaneseArabicNote,
  buildLyriaEgyptianArabicNote,
  buildEgyptianLexiconLines,
  buildLebaneseLexiconLines,
};
