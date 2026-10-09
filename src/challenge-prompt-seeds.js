/**
 * Localized instruction prompts for Templates / Sparks / Occasions.
 * Arabic pools are Arabic script only (positive instruction — never "no Arabizi" in the seed).
 * Style (dabke, pop) stays in the style field; the lyric idea can be anything.
 */

const LAST_KEY = "nabad_challenge_prompt_last_v1";
export const CHALLENGE_LANG_STORAGE_KEY = "nabadai_challenge_lang_v1";

const ARABIC_SCRIPT_RE = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;

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

  const userText = String(extras.userText || extras.person || "").trim();
  if (userText) {
    if (ARABIC_SCRIPT_RE.test(userText)) return "arabic";
    if (/[A-Za-z]/.test(userText)) {
      const createLang = String(extras.createLang || extras.appLang || "").trim().toLowerCase();
      if (createLang === "arabic" || createLang === "arabizi") return "arabic";
      if (createLang === "english") return "english";
    }
  }

  const createLang = String(extras.createLang || extras.appLang || "").trim().toLowerCase();
  if (createLang === "arabic" || createLang === "arabizi") return "arabic";
  if (createLang === "english") return "english";
  if (String(extras.createDialect || "").trim()) return "arabic";

  // Auto with no user text: follow app language, never force Sparks to English.
  return "arabic";
}

export function withShelfScriptRule(text, lang) {
  const body = String(text || "").trim();
  const rule = scriptRule(lang);
  if (!body) return rule;
  if (body.includes(rule)) return body;
  return `${body}\n${rule}`;
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
    ? "اكتب الكلمات بالأحرف العربية فقط (سكربت عربي)."
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
  thanks: {
    english: [
      "A sincere thank-you for {name}. One specific thing they did, then thank you in a chorus people can sing back.",
      "Write {name} the gratitude you never said out loud. Warm, short, complete.",
    ],
    arabic: [
      "اكتب شكر صادق لـ {name}. شي واحد عملو، وبعدين شكراً بكورس سهل يتكرر.",
      "الأغنية اللي لازم تقلّه لـ {name}: امتنان حقيقي، مش بطاقة جاهزة.",
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
      "Write a short clip about a reunion with friends. Any personal idea. Style field carries Levantine dabke — keep lyrics about people and feeling.",
      "A late-night Beirut feeling: windows down, someone you missed. Style is dabke rhythm — keep the lyric story personal.",
      "A proud hook about someone coming home. Festive dabke groove in the style — story can be love, win, or summer.",
    ],
    arabic: [
      "اكتب كلمات قصيرة عن لمة رفاق بعد غياب. أي فكرة شخصية تنفع. الأسلوب دبكة شامية — خلّي القصة عن الناس والشعور.",
      "مزاج ليلة بيروت: شباك مفتوح وشخص راجع. الأسلوب دبكة — خلّي الكلمات عن الشوق أو الرجعة.",
      "كورس فخور عن حدّا رجع عالبلد. الأسلوب إيقاع دبكة. القصة حب أو فوز أو صيف.",
      "اكتب عن فرح بسيط: خبر حلو، ضحكة، طريق رجعة. الأسلوب دبكة لبنانية حديثة.",
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
      "اكتب هوك قصير عن مزاج الليلة بجملة وحدة لاصقة. عربي محكي عامّي بالأحرف العربية.",
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
  "hook-rush": {
    english: [
      "Write original lyrics for a cold-open pop hook. No intro — the first sung line is already the chorus people replay. One short verse (2 lines) naming a now-or-never moment, then a chorus (3–4 lines) with one sticky phrase repeated. Specific, not generic party talk. End on a complete held last word.",
    ],
    arabic: [
      "اكتب كلمات أصليّة لهوك بوب يفتح على طول. بلا مقدمة — أول جملة هي الكورس اللي بينعاد. بيت قصير (سطرين) عن لحظة هلق أو أبداً، وبعدين كورس (3–4 أسطر) فيه جملة لاصقة تتكرر. محددة، مش كلام حفلة عام. نهاية مكتملة.",
    ],
  },
  "roast-song": {
    english: [
      "Write a playful roast for a friend — funny, never cruel. Verse: 4 original lines of affectionate teasing (habits, timing, excuses), not a stock joke. Chorus: 3–4 lines that land the roast with a smile, then make it clear you still love them. Light, singable, finished.",
    ],
    arabic: [
      "اكتب روست مرح لرفيق — مضحك، مش جارح. البيت: 4 أسطر أصليّة عن عادة أو تأخير أو حجة، مش نكتة جاهزة. الكورس: 3–4 أسطر بنكتة وضحكة، وبعدين واضح إنك بعدك بتحبّو. خفيفة، سهلة تغنّى، مكتملة.",
    ],
  },
  "three-word-hook": {
    english: [
      "Write original lyrics whose chorus uses only three words, repeated. Verse: 2 short lines that set a scene. Chorus: those three words only, sung as a huge chantable hook. Pick three vivid words (not \"I love you\"). Impossible to forget. End cleanly.",
    ],
    arabic: [
      "اكتب كلمات أصليّة الكورس فيها ثلاث كلمات بس، تتكرر. البيت: سطرين قصار يرسموا مشهد. الكورس: هالثلاث كلمات بس، هوك كبير ينهدّ. اختار ثلاث كلمات حيّة (مش بحبّك). ما بتنتسى. نهاية نظيفة.",
    ],
  },
  "wrong-genre-party": {
    english: [
      "Write original lyrics for a collision: a heavy, stormy verse and a sweet, sugary chorus. Verse: 4 lines that lean into dark vs bright without naming genres. Chorus: 3–4 catchy joyful lines that win the argument. Personal story. Complete last phrase.",
    ],
    arabic: [
      "اكتب كلمات أصليّة لتصادم: بيت ثقيل وعاصف، وكورس حلو وخفيف. البيت: 4 أسطر عن غامق مقابل مشرق من دون تسمية ستايلات. الكورس: 3–4 أسطر فرحة لاصقة بتكسب الجدال. قصة شخصية. جملة أخيرة مكتملة.",
    ],
  },
  "last-photo-song": {
    english: [
      "Write original lyrics inspired by a personal photo — a real moment in a frame, not a generic memories song. Verse: 2 close specific lines (light, a face, a place). Chorus: 3–4 lines with one repeatable hook that holds that picture. Intimate and finished.",
    ],
    arabic: [
      "اكتب كلمات أصليّة من صورة شخصية — لحظة حقيقية بالإطار، مش أغنية ذكريات عامة. البيت: سطرين قريبين (ضو، وجه، مكان). الكورس: 3–4 أسطر وهوك يتكرر يمسك هالصورة. حميمة ومكتملة.",
    ],
  },
  "sad-to-dance-challenge": {
    english: [
      "Write original lyrics that flip a sad feeling into dance without losing the emotion. Verse: 2–3 quiet honest lines, like a text you never sent. Pre-chorus: let the feeling lift. Chorus: 3–4 lines with one repeatable hook — dance through it. Personal and finished.",
    ],
    arabic: [
      "اكتب كلمات أصليّة تقلب حزن لرقص من دون ما تضيع الشعور. البيت: 2–3 أسطر هادية وصادقة، مثل رسالة ما انبعتت. قبل الكورس: الشعور بيرتفع. الكورس: 3–4 أسطر وهوك يتكرر — ارقص بالحزن. شخصية ومكتملة.",
    ],
  },
  "one-line-reply": {
    english: [
      "Write a ~25 second reply-song to a text or DM. Verse: 2 lines reacting to what they said. Chorus: 2–4 lines — the line you'd actually send back. Short words. End on a complete phrase.",
    ],
    arabic: [
      "اكتب أغنية رد قصيرة (~25 ثانية) على رسالة. البيت: سطرين ردّ فعل. الكورس: 2–4 أسطر — الجملة اللي كنت بدك تبعتها. كلمات قصيرة. نهاية مكتملة.",
    ],
  },
  "whisper-to-hook": {
    english: [
      "Start quiet, land loud — keep it ~25 seconds. Verse: 2 whisper-soft personal lines. Chorus: 3–4 bigger lines, not shouty; end on a held final word. No bridge. Must feel finished.",
    ],
    arabic: [
      "ابدأ هادي وخلّص قوي — حوالي 25 ثانية. البيت: سطرين همس شخصيين. الكورس: 3–4 أسطر أكبر، مش صراخ؛ نهاية على كلمة ممسوكة. بلا جسر. حسّ مكتمل.",
    ],
  },
};

export function pickOccasionLyricPrompt({
  occasionId,
  languageId = "auto",
  genreId = "",
  person = "",
  variant = "anthem",
  createLang = "",
  createDialect = "",
  extraBrief = "",
} = {}) {
  const lang = resolveChallengePromptLang(languageId, {
    genreId,
    person,
    userText: person,
    createLang,
    createDialect,
  });
  const who = String(person || "").trim() || (lang === "arabic" ? "شخص غالي" : "someone special");
  const pool = OCCASION_IDEAS[String(occasionId || "").trim()] || OCCASION_IDEAS.birthday;
  const idea = pickFromPool(`occ:${occasionId}:${lang}`, pool[lang] || pool.english)
    .replaceAll("{name}", who);
  const extra = String(extraBrief || "").trim().replaceAll("{name}", who);
  return [idea, extra, variantLine(lang, variant), scriptRule(lang)].filter(Boolean).join("\n");
}

export function pickSparkLyricPrompt({
  sparkId,
  languageId = "auto",
  createLang = "",
  createDialect = "",
  userText = "",
} = {}) {
  const pool = SPARK_IDEAS[String(sparkId || "").trim()];
  if (!pool) return "";
  const lang = resolveChallengePromptLang(languageId, {
    sparkId,
    createLang,
    createDialect,
    userText,
  });
  const idea = pickFromPool(`spark:${sparkId}:${lang}`, pool[lang] || pool.english);
  if (!idea) return "";
  return [idea, scriptRule(lang)].filter(Boolean).join("\n");
}
