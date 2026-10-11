/**
 * Localized instruction prompts for Templates / Sparks / Occasions.
 * Occasion (Moments) angles are English Gemini instructions only.
 * Language, dialect, and Arabizi stay on the Create + Gemini path.
 * Spark pools stay bilingual. Arabic spark pools are Arabic script only.
 */

const LAST_KEY = "nabad_challenge_prompt_last_v1";
const LAST_LOCAL_KEY = "nabad_challenge_prompt_last_local_v1";
export const CHALLENGE_LANG_STORAGE_KEY = "nabadai_challenge_lang_v1";

const ARABIC_SCRIPT_RE = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;

export function readStoredChallengeLanguageId() {
  try {
    const id = String(sessionStorage.getItem(CHALLENGE_LANG_STORAGE_KEY) || "").trim();
    if (id === "auto" || id === "english" || id === "arabic") return id;
    if (id === "levantine" || id === "neutral-arabic") return "arabic";
  } catch {}
  return "auto";
}

export function storeChallengeLanguageId(id) {
  const raw = String(id || "auto").trim();
  const next = raw === "levantine" || raw === "neutral-arabic" ? "arabic" : raw;
  try { sessionStorage.setItem(CHALLENGE_LANG_STORAGE_KEY, next); } catch {}
  return next;
}

export function resolveChallengePromptLang(languageId, extras = {}) {
  const id = String(languageId || "auto").trim().toLowerCase();
  if (id === "english") return "english";
  if (id === "levantine" || id === "neutral-arabic" || id === "arabic") return "arabic";

  const userText = String(extras.userText || extras.person || extras.trait || "").trim();
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
  if (String(extras.createDialect || extras.dialectId || "").trim()) return "arabic";

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

export function mapChallengeLangToCreate(promptLang, languageId, dialectId = "") {
  const lang = String(promptLang || "").trim();
  const id = String(languageId || "").trim();
  if (lang === "arabic" || id === "arabic" || id === "levantine" || id === "neutral-arabic") {
    const d = String(dialectId || "").trim().toLowerCase();
    if (id === "neutral-arabic" && !d) return { lyricsLanguage: "arabic", dialect: "" };
    if (d === "neutral" || d === "msa") return { lyricsLanguage: "arabic", dialect: "" };
    if (d === "lebanese" || d === "egyptian" || d === "gulf") {
      return { lyricsLanguage: "arabic", dialect: d };
    }
    return { lyricsLanguage: "arabic", dialect: d || "" };
  }
  if (lang === "english" || id === "english") {
    return { lyricsLanguage: "english", dialect: "" };
  }
  return null;
}

function readLastIndex(bucket) {
  try {
    const sessionVal = sessionStorage.getItem(`${LAST_KEY}:${bucket}`);
    if (sessionVal != null && sessionVal !== "") return Number(sessionVal);
  } catch {}
  try {
    const localVal = localStorage.getItem(`${LAST_LOCAL_KEY}:${bucket}`);
    if (localVal != null && localVal !== "") return Number(localVal);
  } catch {}
  return -1;
}

function writeLastIndex(bucket, idx) {
  const value = String(idx);
  try { sessionStorage.setItem(`${LAST_KEY}:${bucket}`, value); } catch {}
  try { localStorage.setItem(`${LAST_LOCAL_KEY}:${bucket}`, value); } catch {}
}

function pickFromPool(bucket, lines) {
  const pool = Array.isArray(lines) ? lines.filter(Boolean) : [];
  if (!pool.length) return { text: "", index: -1 };
  let last = readLastIndex(bucket);
  if (!Number.isFinite(last)) last = -1;
  let idx = Math.floor(Math.random() * pool.length);
  if (pool.length > 1 && idx === last) idx = (idx + 1) % pool.length;
  writeLastIndex(bucket, idx);
  return { text: String(pool[idx] || "").trim(), index: idx };
}

function scriptRule(lang) {
  return lang === "arabic"
    ? "اكتب الكلمات بالأحرف العربية فقط (سكربت عربي). ممنوع Arabizi أو فرانكو أو أحرف لاتينية."
    : "Write the lyrics in English.";
}

function addressYouLine(address) {
  const v = String(address || "").trim().toLowerCase();
  if (v === "male" || v === "him") return "Sing to you as him — إنتَ.";
  if (v === "female" || v === "her") return "Sing to you as her — إنتِ.";
  if (v === "group") return "Sing to you as a group — إنتو.";
  return "Sing to you (إنتَ or إنتِ from the address chip).";
}

const MOMENT_BAN_LIST = [
  "Never use يا غالي, غالي, شخص غالي, someone dear, or someone special as a stand-in for the person.",
  "Do not recycle tired gift clichés on every take.",
  "Use كل سنة وإنتَ/إنتِ طيب at most once, and only if it truly fits.",
  "Do not reuse the same opening line as this listener's last take for this moment.",
  "Light tease only. Never a mean roast. No gimmick plots.",
  "If the lyrics language is Arabic, write Arabic script only. Never Arabizi, Franco-Arabic, or Latin-letter Arabic. Arabizi is only when the user explicitly chose it.",
].join("\n");

/** English Gemini instructions — six grounded angles per Moment. */
const OCCASION_ANGLES = {
  birthday: [
    "What makes them special to the people around them — name that quality without listing compliments.",
    "A warm wish list for their new year: two or three real hopes, not a generic party chant.",
    "A light, loving tease about one habit that turns sweet by the chorus.",
    "Memories from the past year: one small scene, then a toast.",
    "Thank them for being in your life, like you are saying it across the table.",
    "The room changes when they walk in — make that the hook, keep it sincere.",
  ],
  anniversary: [
    "The first time we met, told as one quiet picture, then choosing each other now.",
    "The small daily things nobody notices, turned into the chorus.",
    "How we grew together without making it a speech.",
    "Choosing each other again every day — one plain promise.",
    "A promise for the years ahead, grounded, not cinematic vows.",
    "One ordinary evening that still feels like us.",
  ],
  wedding: [
    "The couple’s walk in: doors, faces, the first look, family-friendly joy.",
    "Families celebrating together — pride and welcome, not a dance tutorial.",
    "One short “how they met” line, then the room opens.",
    "Their names as a short chant once before the lift, then blessings.",
    "Joy and blessings for the new life, clap-ready but sincere.",
    "The moment the music starts and everyone stands — stay with that feeling.",
  ],
  engagement: [
    "The yes: one held look, then a simple promise starting tonight.",
    "Families coming together around two people, warm and proud.",
    "How they knew it was them — one small proof, not a fairy tale.",
    "A ring, a laugh, a future said in ordinary words.",
    "Blessings for the life they just chose, easy for the room to sing back.",
    "Soft tease about how long everyone saw this coming, then love.",
  ],
  graduation: [
    "Proud people watching them walk — name the pride, not the diploma.",
    "The work that got them here: late nights, one real detail, then lift.",
    "A wish for the next chapter, hopeful and specific.",
    "Friends from this year, one shared joke that stays kind.",
    "Thank the person who stood by them through it.",
    "Light tease about surviving the hard part, then “you did it” without shouting.",
  ],
  "mom-day": [
    "One thing she always did, said simply, then thank you.",
    "Protection and care as a chorus people can sing back.",
    "A memory from childhood that still feels close.",
    "How her voice or kitchen or wait-up still lives in you.",
    "Grateful without a greeting-card list.",
    "A quiet “I see you” for the work nobody clapped for.",
  ],
  christmas: [
    "Home, lights, and one person you want in the room — cozy, not a mall carol.",
    "A winter night indoors: warmth, not sleigh-bell clichés.",
    "Family around a table, one toast that sounds like you.",
    "Missing someone this season, gentle, not dramatic.",
    "A small gift of words: I am glad you are here.",
    "Quiet holiday love, modern and specific.",
  ],
  "new-year": [
    "Leave one real thing behind; step into one clear wish.",
    "Midnight as a held hand, not a countdown gimmick.",
    "A hopeful reset for them, personal not generic “new year new me”.",
    "What you want for them in the year ahead, two wishes max.",
    "Looking back at the year with kindness, then forward.",
    "A short toast at 12: stay, we start again.",
  ],
  congrats: [
    "Clapping for one person: the work finally paid off.",
    "Name the grind without bragging for them.",
    "Proud family/friends energy, warm not shouty.",
    "A door that opened — one next-step hope.",
    "“We knew you could” as a chorus, sincere.",
    "A quiet smile after the hard part, then lift.",
  ],
  prom: [
    "Lights, photos, friends, one unforgettable hour — young, not cheesy.",
    "Tonight only: the song you want to remember them by.",
    "A little nervous, a little brave, then the dance floor.",
    "One friend or date at the center, kind and specific.",
    "The ride home feeling, still glowing.",
    "A cinematic chorus that still sounds like real kids, not a movie trailer.",
  ],
  apology: [
    "What went wrong in one honest line, then one clear sorry.",
    "The message you should have said, short and complete.",
    "Hope to fix it without begging or drama.",
    "Own the mistake; keep the chorus human.",
    "A door left open, sincere not cheesy.",
    "Soft, direct, finished — no long confession.",
  ],
  thanks: [
    "One specific thing they did, then thank you in a singable chorus.",
    "The gratitude you never said out loud.",
    "A small kindness that stayed with you.",
    "Warm, short, complete — not a card.",
    "How they showed up, in one picture.",
    "“Because of you” without stacking clichés.",
  ],
  "proud-of-you": [
    "Clap for their hard work without shouting.",
    "You knew they could — grateful and specific.",
    "The quiet effort nobody saw.",
    "A proud look from across the room.",
    "Celebrate the person, not the trophy.",
    "Warm lift, finished last line.",
  ],
  "missing-you": [
    "A voice note to someone far: one memory, then I miss you in words you’d say.",
    "Conversational distance, not a tragic ballad.",
    "One place you still expect them.",
    "What you’d do if they walked in tonight.",
    "Keep it close and ordinary.",
    "End complete, no fading mid-sentence.",
  ],
  "just-because": [
    "No holiday, no excuse — they crossed your mind.",
    "One specific reason today.",
    "A surprise gift of a song, small and warm.",
    "“I was thinking of you” in a line people can repeat.",
    "Everyday love, not a grand speech.",
    "Short, personal, done.",
  ],
};

function occasionLabelForId(occasionId) {
  const labels = {
    birthday: "birthday",
    anniversary: "anniversary",
    wedding: "wedding entrance",
    engagement: "engagement",
    graduation: "graduation",
    "mom-day": "mom day",
    christmas: "Christmas",
    "new-year": "New Year",
    congrats: "congratulations",
    prom: "prom",
    apology: "sorry",
    thanks: "thank you",
    "proud-of-you": "proud of you",
    "missing-you": "missing you",
    "just-because": "just because",
  };
  return labels[String(occasionId || "").trim()] || "gift";
}

function angleIdFromText(occasionId, text, index) {
  const words = String(text || "").trim().replace(/\s+/g, " ").slice(0, 72);
  if (words) return words;
  return `${String(occasionId || "moment")}:${index}`;
}

export function pickOccasionLyricPrompt({
  occasionId,
  languageId = "auto",
  person = "",
  trait = "",
  address = "",
  createLang = "",
  createDialect = "",
  extraBrief = "",
} = {}) {
  const id = String(occasionId || "").trim() || "birthday";
  const pool = OCCASION_ANGLES[id] || OCCASION_ANGLES.birthday;
  const picked = pickFromPool(`occ:${id}`, pool);
  const angle = picked.text || pool[0] || "";
  const who = String(person || "").trim();
  const traitText = String(trait || "").trim();
  const lines = [
    `Write original lyrics for a ${occasionLabelForId(id)} gift song. Warm, sincere, personal. Dedicated to one person. Not a Spark or Challenge story.`,
    `Angle for this take: ${angle}`,
  ];
  if (who) {
    lines.push(`Use their real name "${who}" in the dedication. Do not replace it with a nickname placeholder.`);
  } else {
    lines.push(`No name was given. ${addressYouLine(address)} Never invent غالي, يا غالي, شخص غالي, someone dear, or someone special.`);
  }
  if (traitText) {
    lines.push(`The heart of the song is how they are: ${traitText}. Turn those words into natural sung lines. Do not quote them like tags or a list.`);
  }
  const extra = String(extraBrief || "").trim();
  if (extra) lines.push(extra);
  lines.push(MOMENT_BAN_LIST);
  return {
    prompt: lines.filter(Boolean).join("\n"),
    angle,
    angleId: angleIdFromText(id, angle, picked.index),
    traitUsed: Boolean(traitText),
  };
}

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
  const idea = pickFromPool(`spark:${sparkId}:${lang}`, pool[lang] || pool.english).text;
  if (!idea) return "";
  return [idea, scriptRule(lang)].filter(Boolean).join("\n");
}
