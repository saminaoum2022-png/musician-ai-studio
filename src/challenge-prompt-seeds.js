/**
 * Localized instruction prompts for Templates / Sparks / Occasions.
 * Arabic pools are Arabic script only — never Franco / Arabizi.
 * Style (dabke, pop) stays in the style field; the lyric idea can be anything.
 */

const LAST_KEY = "nabad_challenge_prompt_last_v1";
export const CHALLENGE_LANG_STORAGE_KEY = "nabadai_challenge_lang_v1";

const ARABIC_SPARK_IDS = new Set(["dabke-drop", "arabic-trend-byte", "oud-loop"]);
const ARABIC_GENRE_IDS = new Set(["arabic-pop", "lev-dabke"]);

export function readStoredChallengeLanguageId() {
  try {
    const id = String(sessionStorage.getItem(CHALLENGE_LANG_STORAGE_KEY) || "").trim();
    if (id === "auto" || id === "english" || id === "levantine" || id === "neutral-arabic") return id;
  } catch {}
  return "auto";
}

export function storeChallengeLanguageId(id) {
  const next = String(id || "auto").trim();
  try { sessionStorage.setItem(CHALLENGE_LANG_STORAGE_KEY, next); } catch {}
  return next;
}

export function resolveChallengePromptLang(languageId, extras = {}) {
  const id = String(languageId || "auto").trim().toLowerCase();
  if (id === "english") return "english";
  if (id === "levantine" || id === "neutral-arabic" || id === "arabic") return "arabic";
  if (ARABIC_SPARK_IDS.has(String(extras.sparkId || "").trim())) return "arabic";
  if (ARABIC_GENRE_IDS.has(String(extras.genreId || "").trim())) return "arabic";
  return "english";
}

export function mapChallengeLangToCreate(promptLang, languageId) {
  const lang = String(promptLang || "").trim();
  const id = String(languageId || "").trim();
  if (lang === "arabic") {
    return {
      lyricsLanguage: "arabic",
      dialect: id === "neutral-arabic" ? "" : "lebanese",
    };
  }
  if (lang === "english" || id === "english") {
    return { lyricsLanguage: "english", dialect: "" };
  }
  return null;
}

function pickFromPool(bucket, lines) {
  const pool = Array.isArray(lines) ? lines.filter(Boolean) : [];
  if (!pool.length) return "";
  let last = -1;
  try { last = Number(sessionStorage.getItem(`${LAST_KEY}:${bucket}`) || "-1"); } catch {}
  let idx = Math.floor(Math.random() * pool.length);
  if (pool.length > 1 && idx === last) idx = (idx + 1) % pool.length;
  try { sessionStorage.setItem(`${LAST_KEY}:${bucket}`, String(idx)); } catch {}
  return String(pool[idx] || "").trim();
}

function variantLine(lang, variant) {
  if (lang === "arabic") {
    if (variant === "dance") return "خلّيها راقصة وكورسها يتكرر.";
    if (variant === "cinematic") return "خلّيها سينمائية وعاطفية والكورس واضح.";
    return "خلّيها شخصية وسهلة تغنّى.";
  }
  if (variant === "dance") return "Make it danceable with a repeatable hook.";
  if (variant === "cinematic") return "Make it cinematic, emotional, and chorus-led.";
  return "Make it catchy, personal, and easy to sing.";
}

function scriptRule(lang) {
  return lang === "arabic"
    ? "اكتب بالأحرف العربية فقط. ممنوع فرانكو أو Arabizi أو أحرف لاتينية في الكلمات."
    : "Write the lyrics in English.";
}

const OCCASION_IDEAS = {
  birthday: {
    english: [
      "A personal birthday hook for {name} — one memory, one wish, not a generic party chant.",
      "A warm short song for {name}'s day. Any real detail works: a joke, a habit, a late-night call.",
      "Celebrate {name} like a toast from a close friend. Keep the chorus easy to sing back.",
    ],
    arabic: [
      "اكتب كلمات عيد ميلاد لـ {name}. فكّر بهدية شخصية: ذكرى، مزحة، أمنية. مش لازم تحكي عن الكعكة.",
      "أغنية قصيرة لـ {name} بمزاج احتفال. أي تفصيل حقيقي ينفع. الكورس دافئ وسهل يتكرر.",
      "غنّي لـ {name} كأنك عم تعايدو بصوت عالٍ قدام رفاقو. خلّي الجملة الأولى شخصية.",
    ],
  },
  anniversary: {
    english: [
      "A private anniversary message for {name} that becomes a chorus — time, loyalty, choosing each other again.",
      "Write {name} a short love song about one shared night, not a generic forever vow.",
    ],
    arabic: [
      "اكتب كلمات ذكرى حب لـ {name}. رسالة خاصة تصير كورس: وقت، وفا، إنكن عم تختاروا بعض من جديد.",
      "أغنية قصيرة لـ {name} عن ليلة واحدة مشتركة. ابتعد عن كلام الحب العام.",
    ],
  },
  wedding: {
    english: [
      "A grand, family-friendly entrance hook for {name}. Names as a short chant — any joyful idea, not only 'I do'.",
      "Write a clap-ready wedding moment for {name}. The feeling is arrival and pride.",
    ],
    arabic: [
      "اكتب كلمات دخول فرح لـ {name}. كورس كبير وسهل للعائلة. أي فكرة فرح تنفع — مش لازم تحكي عن الدبكة.",
      "لحظة دخول لـ {name}: فخر، ضو، أحباب. خلّي الاسم يتردد مرة واحدة قبل الكورس.",
    ],
  },
  "mom-day": {
    english: [
      "A sincere thank-you for mom / {name}. Specific, not greeting-card. Chorus: gratitude and protection.",
      "Write {name} a short song about one thing she always did. Keep it warm and complete.",
    ],
    arabic: [
      "اكتب كلمات شكر لماما / {name}. جملة صادقة مش بطاقة جاهزة. الكورس: امتنان وحماية.",
      "أغنية قصيرة لـ {name} عن شي واحد كانت تعملو دايماً. دافئة ومكتملة.",
    ],
  },
  christmas: {
    english: [
      "A cozy modern holiday hook for {name} — lights, home, warmth, without sounding like a mall carol.",
      "Write a short winter-night song for {name}. Fresh images, not generic sleigh bells.",
    ],
    arabic: [
      "اكتب كلمات شتوية دافئة لـ {name}: بيت، ضو، أحباب. تجنّب كليشيه الأعياد.",
      "أغنية قصيرة لـ {name} عن ليلة شتوية هادية. صور جديدة، مش قالب جاهز.",
    ],
  },
  "new-year": {
    english: [
      "A hopeful countdown for {name} — leave the old year, step into a better one.",
      "Write {name} a short reset hook. Midnight energy, one clear wish.",
    ],
    arabic: [
      "اكتب كلمات عدّ تنازلي لـ {name}: اترك السنة القديمة وادخل سنة أحسن.",
      "أغنية قصيرة لـ {name} عن بداية جديدة. أمنية واحدة واضحة.",
    ],
  },
  congrats: {
    english: [
      "Everyone is clapping for {name}. Confident chorus about the work finally paying off.",
      "A proud short win song for {name} — specific grind, not empty 'you did it'.",
    ],
    arabic: [
      "كل العالم عم تصفّق لـ {name}. كورس واثق عن التعب اللي دفع أخيراً.",
      "أغنية فوز قصيرة لـ {name}. احكي عن الشغل الحقيقي، مش جملة تهنئة فاضية.",
    ],
  },
  prom: {
    english: [
      "A shiny prom-night hook for {name}: lights, photos, friends, one unforgettable hour.",
      "Write {name} a young cinematic chorus about tonight only.",
    ],
    arabic: [
      "اكتب كلمات ليلة تخرج لـ {name}: ضو، صور، رفاق، ساعة ما بتنتسى.",
      "كورس شبابي سينمائي لـ {name} عن هالليلة بس.",
    ],
  },
  apology: {
    english: [
      "A sincere apology to {name}. Verse: what went wrong. Chorus: one clear sorry and one hope to fix it.",
      "Write {name} the message you should have said. Short, direct, complete ending.",
    ],
    arabic: [
      "اكتب اعتذار صادق لـ {name}. البيت: وين غلطت. الكورس: أسف واضح وأمل تصلح.",
      "الرسالة اللي لازم تقلّه لـ {name}. قصيرة ومباشرة ونهاية مكتملة.",
    ],
  },
  "proud-of-you": {
    english: [
      "Clap for {name}. Chorus: proud, grateful, you knew they could do it.",
      "A warm short song for {name}'s hard work. Not shouty.",
    ],
    arabic: [
      "صفّق لـ {name}. الكورس: فخور، ممتِن، كنت عارف إنك بتقدر.",
      "أغنية دافئة قصيرة عن تعب {name}. مش صراخ.",
    ],
  },
  "missing-you": {
    english: [
      "A voice-note song to {name} far away. One memory, then I miss you in words you'd actually say.",
      "Write {name} a long-distance hook. Conversational, not dramatic.",
    ],
    arabic: [
      "اكتب كلمات مثل فويس نوت لـ {name} البعيد. ذكرى واحدة وبعدين اشتقتلك بجملة حقيقية.",
      "أغنية مسافة لـ {name}. عامّية، مش مسرحية.",
    ],
  },
  "just-because": {
    english: [
      "A warm unexpected song for {name} — no holiday, no excuse, just I was thinking of you.",
      "Write {name} a short gift with one specific reason they crossed your mind today.",
    ],
    arabic: [
      "أغنية دافئة ومفاجئة لـ {name} — بلا مناسبة. بس خطرلي.",
      "هدية قصيرة لـ {name} بسبب واحد خطر على بالك اليوم.",
    ],
  },
};

const SPARK_IDEAS = {
  "dabke-drop": {
    english: [
      "Write a short clip about a reunion with friends. Any personal idea. STYLE is Levantine dabke — do not write about dabke, weddings, or clapping.",
      "A late-night Beirut feeling: windows down, someone you missed. STYLE is dabke. Do not mention dabke in the lyrics.",
      "A proud hook about someone coming home. STYLE is festive dabke rhythm. The story can be love, win, or summer — not the dance.",
    ],
    arabic: [
      "اكتب كلمات قصيرة عن لمة رفاق بعد غياب. أي فكرة شخصية تنفع. الأسلوب دبكة شامية — لا تحكي عن الدبكة ولا العرس.",
      "مزاج ليلة بيروت: شباك مفتوح وشخص راجع. الأسلوب دبكة. ممنوع كلمة دبكة أو يلا يا دبكة بالكلمات.",
      "كورس فخور عن حدّا رجع عالبلد. الأسلوب إيقاع دبكة. القصة حب أو فوز أو صيف — مش الرقصة.",
      "اكتب عن فرح بسيط: خبر حلو، ضحكة، طريق رجعة. الأسلوب دبكة لبنانية حديثة. الفكرة مش عن الرقص.",
    ],
  },
  "arabic-trend-byte": {
    english: [
      "Turn one tiny spoken phrase into a short Arabic-pop hook. Keep it specific.",
      "A 20-second trend clip from one everyday line. Fresh, not generic 'yalla'.",
    ],
    arabic: [
      "حوّل جملة يومية صغيرة لكورس ترند عربي قصير. خلّيها محددة، مش كلام عام.",
      "مقطع عشرين ثانية من جملة حقيقية بتنقال بالبيت. جديدة، مش قالب يلا يلا.",
      "اكتب هوك قصير عن مزاج الليلة بجملة وحدة لاصقة. عربي فصيح عامّي مكتوب بالعربي.",
    ],
  },
  "oud-loop": {
    english: [
      "A short oud-led clip. Two poetic lines, then a hook. Any intimate idea.",
      "Minimal oud + modern beat. Write a finished thought, not a dance chant.",
    ],
    arabic: [
      "مقطع قصير على العود. بيتين شعريين وبعدين هوك. أي فكرة حميمة تنفع.",
      "عود + بيت حديث. اكتب فكرة مكتملة، مش هتاف رقص.",
      "كلمات هادية عن سهر أو شوق، مع هوك عربي قصير. الأسلوب عود حديث.",
    ],
  },
};

export function pickOccasionLyricPrompt({
  occasionId,
  languageId = "auto",
  genreId = "",
  person = "",
  variant = "anthem",
} = {}) {
  const lang = resolveChallengePromptLang(languageId, { genreId });
  const who = String(person || "").trim() || (lang === "arabic" ? "شخص غالي" : "someone special");
  const pool = OCCASION_IDEAS[String(occasionId || "").trim()] || OCCASION_IDEAS.birthday;
  const idea = pickFromPool(`occ:${occasionId}:${lang}`, pool[lang] || pool.english)
    .replaceAll("{name}", who);
  return [idea, variantLine(lang, variant), scriptRule(lang)].filter(Boolean).join("\n");
}

export function pickSparkLyricPrompt({ sparkId, languageId = "auto" } = {}) {
  const pool = SPARK_IDEAS[String(sparkId || "").trim()];
  if (!pool) return "";
  const lang = resolveChallengePromptLang(languageId, { sparkId });
  const idea = pickFromPool(`spark:${sparkId}:${lang}`, pool[lang] || pool.english);
  if (!idea) return "";
  return [idea, scriptRule(lang)].filter(Boolean).join("\n");
}
