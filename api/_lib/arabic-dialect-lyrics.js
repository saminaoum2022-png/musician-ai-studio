/** Colloquial Arabic + Lebanese tashkeel rules for Gemini lyrics and Lyria. */

/**
 * True only when the hint *requests* MSA/fusha — not when it says "NOT formal MSA".
 * Dialect chips historically include contrastive "NOT MSA/nahwi" clauses; matching those
 * as MSA flipped Lebanese/Egyptian off and pushed Lyria into فصحى delivery.
 */
function hintRequestsFormalMsa(blob = "") {
  const text = String(blob || "").toLowerCase();
  if (!text.trim()) return false;
  // Colloquial dialect name always wins over a negated MSA mention in the same hint.
  if (hasPositiveDialectKeyword(text)) return false;
  if (
    /\b(not|no|never|avoid|without)\b[^.\n|;]{0,48}\b(msa|modern standard|fusha|fus'?ha|formal arabic|classical arabic|nahwi|فصحى|فصح)\b/.test(
      text,
    )
  ) {
    return false;
  }
  return /\bmsa\b|modern standard|fusha|fus'?ha|formal arabic|classical arabic|\bnahwi\b|فصحى|فصح/.test(
    text,
  );
}

/** Strip "NOT Egyptian / no MSA …" clauses so contrastive text does not flip dialect flags. */
function scrubNegatedDialectClauses(blob = "") {
  return String(blob || "")
    .replace(
      /\b(not|no|never|avoid|without)\b[^.\n|;]{0,56}/gi,
      " ",
    )
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function hasPositiveDialectKeyword(blob = "") {
  return /\b(lebanese|beirut|syrian|palestinian|jordanian|levantine|egyptian|masri|iraqi|gulf|khaleeji|moroccan|darija|tunisian|sudanese|شامي|لبناني|مصري|عراقي|خليج)\b/.test(
    String(blob || "").toLowerCase(),
  );
}

function dialectFlags(dialect = "", dialectHint = "") {
  const blob = `${dialect} ${dialectHint}`.toLowerCase();
  const positive = scrubNegatedDialectClauses(blob);
  const isMsa = hintRequestsFormalMsa(blob);
  const isEgyptian = /egyptian|masri|مصر|cairo/.test(positive) && !isMsa;
  const isLebanese = /lebanese|لبنان|بيروت|beirut/.test(positive) && !isEgyptian && !isMsa;
  const isIraqi = /iraqi|عراق|baghdad/.test(positive) && !isEgyptian && !isMsa;
  const isGulf = /gulf|khaleeji|خليج|kuwait|emirati|saudi/.test(positive) && !isIraqi && !isEgyptian && !isMsa;
  const isMaghrebi = /maghrebi|moroccan|darija|دارجة|tunisian|تونس/.test(positive) && !isMsa;
  const isLevantineColloquial =
    (isLebanese || /syrian|palestinian|jordanian|levantine|سور|فلسط|shami/.test(positive)) && !isEgyptian && !isMsa;
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
      "- Write Cairo hamza/qaf as أ (ألبي) — not classical /q/. Do NOT insert Latin digits unless the user's seed has them.",
      ...buildSungReadyGenerationLines({ isEgyptian: true }),
      ...buildEgyptianLexiconLines(),
    ];
  }
  if (isLebanese) {
    return [
      "LEBANESE ARABIC SCRIPT (required):",
      "- Spoken Beirut colloquial ONLY — never fusHa nahwi, NEVER tanween (ًٌٍ) on any word unless user explicitly asked for MSA.",
      "- Lebanese closes syllables with sukoon (سكون): many consonants inside words and at word ends are stopped, not left open.",
      "- Tight word endings (ساكن): write how Lebanese speaks — ما not مًا، شو not شَوًّا، منيح not منيحًا; no accusative/genitive tanween.",
      "- Examples of stopped endings: خلّص، عم، منّ، فيّ، شفت، قلّي — consonant feels closed, not classical open vowel + tanween.",
      "- ق = hamza in speech — write with أ (ألبي not قلبي), not classical /q/. ذ and ظ → ز (Levantine spoken).",
      "- NEVER insert Latin digits (0–9) in lyrics unless the user's seed already contains them.",
      ...buildSungReadyGenerationLines({ isLebanese: true }),
      ...buildLebaneseLexiconLines(),
    ];
  }
  if (isLevantineColloquial) {
    return [
      "LEVANTINE COLLOQUIAL ARABIC SCRIPT:",
      "- Spoken colloquial ONLY — no tanween (ًٌٍ) or nahwi case endings unless user asked for MSA.",
      "- Close word endings naturally (sukoon feel) — no open classical case endings on final words.",
      "- ق → أ (hamza), ذ → ز, ظ → ز — not classical /q/ or MSA ذ/ظ.",
      "- NEVER insert Latin digits (0–9) unless the user's seed already contains them.",
      ...buildSungReadyGenerationLines({ isLevantineColloquial: true }),
    ];
  }
  return [
    "COLLOQUIAL ARABIC SCRIPT:",
    "- No tanween (ًٌٍ) or formal nahwi endings unless MSA was explicitly requested.",
    "- Spoken dialect forms, not textbook fusHa open endings.",
  ];
}

/** Singer-ready marks baked into AI Generate (one shot) — Add vowel marks still does a fuller pass on user lyrics. */
function buildSungReadyGenerationLines({
  isLebanese = false,
  isLevantineColloquial = false,
  isEgyptian = false,
} = {}) {
  const levantine = isLebanese || isLevantineColloquial;
  const lines = [
    "SUNG tashkeel in this output (sparse, for the AI singer — NOT textbook full vowelization):",
    "ADD: sukoon on stopped consonants, shadda where it changes the word, address marks إنتَ/إنتِ/إنتو only.",
    "ADD: last-letter and mid-word short vowels only when the singer could misread (بَعد vs بُعد).",
    "NEVER: tanween (ًٌٍ), nahwi case endings, marks on kaf in قلبك/معك/كيفك, or vowelizing every letter.",
  ];
  if (levantine) {
    lines.push(
      "Levantine orthography in Arabic script: ق→أ, ذ→ز, ظ→ز (e.g. ألبي, زكرة). No Latin digits.",
    );
  } else if (isEgyptian) {
    lines.push("Egyptian: Cairo hamza as أ on qaf (ألبي). Keep Masri ذ/ظ as written unless seed uses ز.");
  }
  return lines;
}

function buildSparseDiacriticsLinesAr() {
  return [
    "تشكيل خفيف للغناء — مش كتاب مدرسي. كثرة الحركات بتقتل الغناء.",
    "شكّل فقط: (1) آخر الكلمة إذا الغناء ممكن يغلط، (2) العنوان إنتَ/إنتِ/إنتو فقط — ممنوع حركة على كاف قلبك/معك، (3) شدة إذا بتغيّر اللفظ، (4) سكون لبناني/شامي على الحرف المسكور.",
    "ممنوع: فتحة/كسرة/ضمة على كل حرف، تنوين، إعراب نحوي، وقلبكَ/قلبكِ، أو إدخال أرقام لاتينية.",
  ];
}

function buildSparseDiacriticsLinesEn() {
  return [
    "SPARSE sung tashkeel — heavy marks kill the vocal. Do NOT vowelize every letter.",
    "Mark ONLY: (1) word endings the singer might misread, (2) address إنتَ/إنتِ/إنتو only — NEVER fatha/kasra on kaf (قلبك not قلبكَ/قلبكِ), (3) shadda when it changes the word, (4) Lebanese/Levantine sukoon on stopped letters.",
    "NO textbook full tashkeel. NO tanween. NO nahwi case endings.",
  ];
}

/** Richer Lebanese sung pass — clearer pronunciation without school nahwi. */
function buildLebaneseSungDiacriticsGuideAr() {
  return [
    "تشكيل لبناني للغناء (أغنى من تلميح التوليد) — الهدف لفظ محكي واضح للـAI singer.",
    "مطلوب بكثرة: سكون على الحروف المسكورة (آخر الكلمة + جوا التجميع): شفتْ، خلّصْ، رحتْ، عمْ، درستْ، وقّفْ.",
    "مطلوب: شدة وين بتتغيّر الكلمة (خلّص، هوّي، إنّو، عمّي).",
    "مطلوب: العنوان إنتَ / إنتِ / إنتو فقط — ممنوع قلبكَ/قلبكِ (خلّيها قلبك).",
    "مطلوب عند اللبس: حركة وسط الكلمة إذا المغنّي ممكن يقرأ غلط (مثال: بَعد vs بُعد، حَبّ vs حِبّ) — مش على كل حرف.",
    "مطلوب: حركات آخر الكلمة القصيرة وين بتوجّه اللفظ (هوّي، هيدي، منيحْ).",
    "ممنوع: تنوين (ًٌٍ)، إعراب نحوي، تشكيل مدرسي كامل لكل حرف، أرقام لاتينية، أو ق/ذ/ظ فصحى.",
    "مطلوب: ق→أ (ألبي، ألت)، ذ→ز، ظ→ز — مش /q/ فصحى.",
    "أمثلة صح: شفتْك، خلّصْ، عمْ بَحكي، إنتَ، إنتِ، هوّي، منّيحْ، ألبي.",
  ];
}

function buildLebaneseSungDiacriticsGuideEn() {
  return [
    "Lebanese SUNG tashkeel (richer than Generate's hint) — goal: clear colloquial pronunciation for the AI singer.",
    "ADD generously: sukoon on stopped consonants (word ends + clusters): شفتْ، خلّصْ، رحتْ، عمْ، درستْ، وقّفْ.",
    "ADD: shadda wherever it changes the word (خلّص، هوّي، إنّو).",
    "ADD: address marks إنتَ / إنتِ / إنتو only — NEVER mark kaf (قلبك not قلبكَ/قلبكِ).",
    "ADD mid-word short vowels when the singer could misread (بَعد vs بُعد) — not on every letter.",
    "ADD last-letter short vowels that steer spoken Lebanese (هوّي، هيدي، منيحْ).",
    "NEVER tanween (ًٌٍ), nahwi case endings, Latin digits, or full textbook vowelization.",
    "REQUIRED: Levantine orthography ق→أ, ذ→ز, ظ→ز (ألبي not قلبي / kalbi).",
    "Good examples: شفتْك، خلّصْ، عمْ بَحكي، إنتَ، إنتِ، هوّي، منّيحْ، ألبي.",
  ];
}

function buildLebaneseDiacriticsLinesAr() {
  return buildLebaneseSungDiacriticsGuideAr();
}

function buildLebaneseDiacriticsLinesEn() {
  return buildLebaneseSungDiacriticsGuideEn();
}

function buildLevantineDiacriticsLinesAr() {
  return [
    "شامي للغناء (أغنى من التلميح): زيد سكون على المسكور + شدة + حركة آخر الكلمة + وسط الكلمة إذا اللفظ بيتلبس.",
    "العنوان إنتَ/إنتِ/إنتو فقط — ممنوع قلبكَ/قلبكِ.",
    "ممنوع: تنوين (ًٌٍ)، إعراب مدرسي، أو تشكيل كل حرف.",
    "مطلوب: ق→أ، ذ→ز، ظ→ز — مش /q/ فصحى. ممنوع أرقام لاتينية.",
  ];
}

function buildLevantineDiacriticsLinesEn() {
  return [
    "Levantine sung pass (richer than hint): ADD sukoon on stopped letters + shadda + ending vowels + mid-word vowels when ambiguous.",
    "Address إنتَ/إنتِ/إنتو only — NEVER mark kaf on قلبك/معك.",
    "NO tanween (ًٌٍ), NO nahwi, NO full textbook marks, NO Latin digits.",
    "REQUIRED: ق→أ, ذ→ز, ظ→ز (ألبي not قلبي) — never classical /q/.",
  ];
}

function buildEgyptianDiacriticsLinesAr() {
  return [
    "مصري خفيف: آخر الكلمة + العنوان (إنتَ/إنتِ، معاكي). لا تشكّل كل حرف.",
    "ق = همزة على أ (ألبي) زي القاهرة. حافظ على معايا / بيحلى — مش معي اللبناني.",
    "ممنوع: تنوين (ًٌٍ)، إعراب مدرسي، أو تشكيل وسط الكلمة إلا للبس.",
  ];
}

function buildEgyptianDiacriticsLinesEn() {
  return [
    "Light Cairo Masri: word endings + address (إنتَ/إنتِ، معاكي). Do not mark every letter.",
    "Qaf ق → أ (Cairo hamza, ألبي). Keep معايا / بيحلى — never Levantine معي. No Latin digits.",
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
      ? "مصري للمؤنث: إنتِ، معاكي، عليكي (ياء). ممنوع قلبكِ المدرسية."
      : flags.isLebanese || flags.isLevantineColloquial
        ? "شامي/لبناني للمؤنث: إنتِ فقط. قلبك / معك / كيفك بلا حركة على الكاف — اللفظ al-bik مش قلبكِ (albaki)."
        : "إنتِ فقط. قلبك / معك بلا كَ أو كِ — ممنوع قلبكِ المدرسية.";
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
        ? "شامي/لبناني للمذكر: إنتَ فقط. قلبك / معك بلا فتحة على الكاف — اللفظ al-bak مش قلبكَ (albaka)."
        : "إنتَ فقط. قلبك / معك بلا حركة على الكاف.";
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
      ? "Egyptian feminine addressee: إنتِ، معاكي، عليكي (yeh). Never textbook قلبكِ."
      : flags.isLebanese || flags.isLevantineColloquial
        ? "Levantine feminine: mark إنتِ only. Write قلبك / معك / كيفك with NO mark on kaf — sung al-bik, never قلبكِ (albaki)."
        : "Feminine: إنتِ only. Do not mark kaf on قلبك / معك.";
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
        ? "Levantine masculine: mark إنتَ only. Write قلبك / معك with NO fatha on kaf — sung al-bak, never قلبكَ (albaka)."
        : "Masculine: إنتَ only. Do not mark kaf on قلبك / معك.";
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

/** Count harakat so we can tell a hint pass from a fuller sung pass. */
function countArabicDiacritics(input) {
  return (String(input || "").match(/[\u064B-\u0652\u0670]/g) || []).length;
}

/** Drop short vowels / sukoon / tanween but keep shadda — used before Add vowel marks. */
function stripSungMarksKeepShadda(input) {
  return String(input || "").replace(/[\u064B-\u0650\u0652-\u065F\u0670]/g, "");
}

function isArabicCombiningMark(ch) {
  const c = String(ch || "").charCodeAt(0);
  return (c >= 0x064B && c <= 0x065F) || c === 0x0670;
}

function isArabicShortVowel(ch) {
  return ch === "\u064E" || ch === "\u064F" || ch === "\u0650";
}

/**
 * Keep singer-useful marks.
 * Default (sparse): last-letter short vowels, shadda, optional sukoon; strip mid-word short vowels.
 * Richer Lebanese/Levantine: also keep mid-word short vowels Gemini added for pronunciation,
 * still strip tanween and kaf address marks (قلبكَ → قلبك).
 */
function sparseSungWordMarks(run, { keepSukoon = false, preserveMidWordVowels = false } = {}) {
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
      const isLast = i === n - 1;
      const lastKaf = isLast && L.letter === "ك";
      const keepShort =
        !lastKaf && (isLast || n <= 2 || preserveMidWordVowels);
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

function applySparseSungDiacritics(input, {
  keepSukoon = false,
  preserveMidWordVowels = false,
} = {}) {
  return String(input || "").replace(/[\u0600-\u06FF]+/g, (run) => {
    if (!/[\u0621-\u064A\u0671-\u06D3]/.test(run)) return run;
    return sparseSungWordMarks(run, { keepSukoon, preserveMidWordVowels });
  });
}

/**
 * Generate-time hint: address marks + shadda only. Sukoon is the vowel-marks button.
 */
function hintSungWordMarks(run) {
  const letters = [];
  for (const ch of String(run || "")) {
    if (isArabicCombiningMark(ch)) {
      if (letters.length) letters[letters.length - 1].marks.push(ch);
      continue;
    }
    letters.push({ letter: ch, marks: [] });
  }
  const n = letters.length;
  const bare = letters.map((L) => L.letter).join("");
  const intaIntiWord = /^(?:[اأإ]نت|كنت)/.test(bare);
  return letters
    .map((L, i) => {
      const isLast = i === n - 1;
      const lastKaf = isLast && L.letter === "ك";
      const keepShort = !lastKaf && isLast && (n <= 2 || intaIntiWord);
      const marks = L.marks.filter((m) => {
        if (m === "\u0651") return true;
        if (m === "\u0652") return false;
        if (m >= "\u064B" && m <= "\u064D") return false;
        if (isArabicShortVowel(m)) return keepShort;
        return false;
      });
      return `${L.letter}${marks.join("")}`;
    })
    .join("");
}

/** Generate-time hint: address marks + shadda only. Sukoon is the vowel-marks button. */
function hintSungArabicDiacritics(input) {
  let text = stripColloquialTanween(input);
  if (!text) return text;
  return String(text).replace(/[\u0600-\u06FF]+/g, (run) => {
    if (!/[\u0621-\u064A\u0671-\u06D3]/.test(run)) return run;
    return hintSungWordMarks(run);
  });
}

/**
 * Post-process Gemini tashkeel: drop tanween; keep sukoon for colloquial sung passes;
 * Levantine/Egyptian: colloquial letter spelling (ق→أ, etc.) — never inject Latin digits.
 */
function lightenSungArabicDiacritics(input, {
  isMsa = false,
  isLebanese = false,
  isLevantineColloquial = false,
  isEgyptian = false,
  richer = false,
} = {}) {
  let text = stripColloquialTanween(input);
  if (!text) return text;
  const keepSukoon = Boolean(
    isMsa || isLebanese || isLevantineColloquial || (richer && isEgyptian),
  );
  const preserveMidWordVowels = Boolean(
    richer && (isLebanese || isLevantineColloquial || isMsa || isEgyptian),
  );
  if (!keepSukoon) {
    text = text.replace(/\u0652/g, "");
  }
  text = applySparseSungDiacritics(text, { keepSukoon, preserveMidWordVowels });
  text = applyColloquialArabicOrthography(text, {
    isLebanese,
    isLevantineColloquial,
    isEgyptian,
  });
  return text;
}

/**
 * Colloquial Arabic script spelling (deterministic). Does not touch kaf ك or user Latin digits.
 */
function applyColloquialArabicOrthography(input, {
  isLebanese = false,
  isLevantineColloquial = false,
  isEgyptian = false,
} = {}) {
  let text = String(input || "");
  if (isLebanese || isLevantineColloquial) {
    text = text.replace(/\u0642/g, "\u0623");
    text = text.replace(/\u0630/g, "\u0632");
    text = text.replace(/\u0638/g, "\u0632");
  } else if (isEgyptian) {
    text = text.replace(/\u0642/g, "\u0623");
  }
  return text;
}

function buildLyriaLebaneseArabicNote() {
  return "Lebanese colloquial Arabic: stopped consonants with sukoon at word ends and inside clusters; spoken Levantine vowels; qaf as hamza.";
}

function buildLyriaEgyptianArabicNote() {
  return "Egyptian Masri colloquial Arabic: Cairo spoken forms, ب- present prefix on verbs, authentic Masri vocabulary; spoken Cairo vowels.";
}

/** Word-level Egyptian vs Levantine — for lyrics generation, not just vocal accent. */
function buildEgyptianLexiconLines() {
  return [
    "EGYPTIAN WORD CHOICE (required — stick to Masri vocabulary):",
    "- with me: معايا",
    "- in my imagination / in my mind: في خيالي or في بالي",
    "- Use Egyptian present-tense prefix ب- on verbs (بيحلى، بيقول، بشوف، بعمل).",
    "- Prefer Egyptian: إزاي، كده، أوي، عايز، دلوقتي، ليه، مفيش، حاجة، كمان.",
    "- Addressing a man: إنت، حبيبي، معاك — Masri pronouns and endings.",
  ];
}

/** Word-level Lebanese vs Egyptian — for lyrics generation, not just vocal accent. */
function buildLebaneseLexiconLines() {
  return [
    "LEBANESE WORD CHOICE (required — stick to Levantine vocabulary):",
    "- with me: معي",
    "- in my imagination / in my mind: بخيالي or ع خيالي",
    "- Prefer Lebanese present forms (عم + verb, or natural Levantine present) over Egyptian ب- verb prefix (بيحلى، بيقول).",
    "- Prefer Lebanese: شو، كيف، هيدا، هيك، منيح، يلّا، عم، ما، ليش — Levantine spoken vocabulary.",
    "- Addressing a man: إنت، حبيبي، معك — Levantine pronouns and endings.",
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
  countArabicDiacritics,
  stripSungMarksKeepShadda,
  applySparseSungDiacritics,
  hintSungArabicDiacritics,
  lightenSungArabicDiacritics,
  applyColloquialArabicOrthography,
  hintRequestsFormalMsa,
  buildLyriaLebaneseArabicNote,
  buildLyriaEgyptianArabicNote,
  buildEgyptianLexiconLines,
  buildLebaneseLexiconLines,
};
