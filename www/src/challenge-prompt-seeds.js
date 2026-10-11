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

export const SPARK_ID_ALIASES = {
  "hook-rush": "hook-first",
  "tiktok-teaser": "hook-first",
  "arabic-trend-byte": "hook-first",
  "three-word-hook": "hook-first",
  "countdown-hook": "hook-first",
  "sad-to-dance": "mood-flip",
  "sad-to-dance-challenge": "mood-flip",
  "before-after": "mood-flip",
  "whisper-to-hook": "mood-flip",
  "wrong-genre-party": "genre-passport",
  "makhlouta-genre": "genre-passport",
  "oud-loop": "tiny-thing",
};

export const FEATURED_SPARK_ID = "hook-first";
const SPARK_ROLL_HISTORY_KEY = "nabad_spark_roll_history_v1";
const SPARK_ROLL_HISTORY_MAX = 10;

export function resolveSparkId(id) {
  const raw = String(id || "").trim();
  return SPARK_ID_ALIASES[raw] || raw;
}

export function resolveSparkPromptLang(languageId, extras = {}) {
  const id = String(languageId || "auto").trim().toLowerCase();
  if (id === "english") return "english";
  if (id === "levantine" || id === "neutral-arabic" || id === "arabic") return "arabic";

  const userText = String(extras.userText || extras.phrase || extras.object || "").trim();
  if (userText) {
    if (ARABIC_SCRIPT_RE.test(userText)) return "arabic";
    if (/[A-Za-z]/.test(userText)) {
      const createLang = String(extras.createLang || extras.appLang || "").trim().toLowerCase();
      if (createLang === "arabic" || createLang === "arabizi") return "arabic";
      if (createLang === "english") return "english";
    }
  }

  const appLang = String(extras.appLang || extras.createLang || "").trim().toLowerCase();
  if (appLang === "english") return "english";
  if (appLang === "arabic" || appLang === "arabizi") return "arabic";
  return "arabic";
}

const SPARK_TWISTS = [
  { id: "4am", chip: "4 am", text: "Set the whole song at 4 am." },
  { id: "second-language", chip: "second language", text: "One line in the other language (Arabic ↔ English). Never Arabizi." },
  { id: "end-question", chip: "end on a question", text: "The last sung line is a question." },
  { id: "smell-first", chip: "smell first", text: "A smell in the first line." },
  { id: "sound-first", chip: "sound first", text: "A sound in the first line." },
  { id: "no-chorus-word", chip: "no chorus word", text: "Never say the title topic in the chorus." },
  { id: "one-room", chip: "one room", text: "The whole story stays in one room." },
  { id: "leftover-food", chip: "leftover food", text: "A leftover meal is in the verse." },
  { id: "unread", chip: "unread", text: "Someone left them on read." },
  { id: "wrong-name", chip: "wrong name", text: "They almost say the wrong name." },
  { id: "taxi-meter", chip: "taxi meter", text: "A meter, timer, or receipt appears." },
  { id: "shared-charger", chip: "shared charger", text: "They share a charger or a cable." },
  { id: "rain-glass", chip: "rain on glass", text: "Rain or AC drip on glass." },
  { id: "voice-note", chip: "voice note", text: "A voice note is playing or unsent." },
  { id: "blue-ticks", chip: "blue ticks", text: "WhatsApp blue ticks, then nothing." },
  { id: "power-cut", chip: "power cut", text: "The lights go out mid-thought." },
  { id: "balcony-ash", chip: "balcony", text: "Someone is on the balcony." },
  { id: "elevator", chip: "elevator", text: "They meet or avoid each other in an elevator." },
  { id: "grocery-line", chip: "grocery line", text: "The hook happens in a queue." },
  { id: "old-hoodie", chip: "old hoodie", text: "They are wearing something that is not theirs." },
  { id: "two-timestamps", chip: "two timestamps", text: "Verse is then, chorus is now." },
  { id: "three-words", chip: "three words", text: "One line is only three words." },
  { id: "laugh-ache", chip: "laugh then ache", text: "A laugh in the verse, ache in the chorus." },
  { id: "almost-call", chip: "almost call", text: "They type a number and delete it." },
  { id: "neighbor-tv", chip: "neighbor TV", text: "A TV or radio leaks through the wall." },
  { id: "low-battery", chip: "low battery", text: "Phone at 1%." },
  { id: "airport-gate", chip: "airport gate", text: "A gate number or last call." },
  { id: "cheap-coffee", chip: "cheap coffee", text: "Bad coffee, good feeling — or the reverse." },
  { id: "screenshot", chip: "screenshot", text: "They screenshot a chat and regret it." },
  { id: "spare-key", chip: "spare key", text: "A key they should have given back." },
  { id: "group-chat", chip: "group chat", text: "The family group chat lights up." },
  { id: "cold-tile", chip: "cold tile", text: "Bare feet on cold tile." },
  { id: "window-down", chip: "window down", text: "One window is down on the highway." },
  { id: "name-once", chip: "name once", text: "Say the person's name only once." },
  { id: "no-sorry", chip: "no sorry", text: "They never say sorry, and that is the point." },
  { id: "borrowed-time", chip: "borrowed time", text: "They have ten minutes only." },
  { id: "street-cat", chip: "street cat", text: "A street cat is the witness." },
  { id: "wrong-floor", chip: "wrong floor", text: "They press the wrong elevator floor." },
  { id: "hold-ending", chip: "hold the ending", text: "Last word is held, unfinished thought." },
  { id: "two-voices", chip: "two voices", text: "One line is what they said, one is what they meant." },
];

const SPARK_SEEDS = [
  "balcony", "cardamom coffee", "voice note", "power cut", "rooftop", "Corniche",
  "WhatsApp blue ticks", "taxi receipt", "spare charger", "old hoodie", "perfume sample",
  "plastic lighter", "house key", "elevator mirror", "grocery bag", "airport tray",
  "gym towel", "group-chat ping", "AC drip", "sand on the dash", "kettle click",
  "prayer beads", "neon pharmacy", "wet marble stairs",
];

const OVERHEARD_LINES = [
  "Keep the change, I might come back.",
  "Don't tell her I was here.",
  "Two cardamoms, extra hot, like always.",
  "If he texts, I'm not here.",
  "This table heard too much already.",
  "Take the Corniche, I'm not ready to go home.",
  "Meter's fine. Talking is extra.",
  "I left my charger at hers. That's the problem.",
  "Airport? No. Just drive.",
  "She said five minutes. That was an hour.",
  "Who ate the last labneh.",
  "Mama saw the story. Delete it.",
  "Your cousin is getting engaged. Be nice.",
  "Bring dessert. Don't bring your mood.",
  "Blue ticks and still no answer.",
  "One more set then I call him.",
  "I only come here to not think.",
  "That playlist is doing too much.",
  "Don't look at the mirror like that.",
  "I ran from the feeling, not the pace.",
  "Last call and I'm still in the queue.",
  "Gate changed. So did we.",
  "I packed the hoodie that still smells like you.",
  "Don't cry at duty free.",
  "Window seat. I need the sky to behave.",
  "Power's out, talk to me.",
  "The elevator knows all our fights.",
  "Neighbor's TV is louder than my pride.",
  "Spare key's still under the pot.",
  "Balcony's full of people who left.",
  "The meeting could have been a voice note.",
  "Print it. I don't trust the cloud today.",
  "We're out of the good coffee. Metaphor.",
  "Your boss just walked in smiling. Run.",
  "I'll take the late shift. I don't sleep anyway.",
  "4 am and the kettle is the only honest thing.",
  "Don't leave me on read in two languages.",
  "The cat knows. The cat always knows.",
  "Sand on the dash and a song I skip.",
  "I screenshot it. That's worse.",
  "Tell them I'm in traffic. I'm in the bathroom.",
  "First rain and everyone remembers someone.",
  "Humidity 90 and my patience left.",
  "She said 'we' like it still worked.",
  "I kept the receipt. Not the person.",
  "Voice note is 0:14 and I still haven't pressed play.",
  "WhatsApp says last seen. I said last chance.",
  "The rooftop is closed. So is that chapter.",
  "He called me by the old nickname. I let it land.",
  "Grocery line, and that's when I missed you.",
];

const TINY_OBJECTS = [
  "keys", "lighter", "mug", "charger", "old hoodie", "perfume", "spare earphones",
  "taxi receipt", "house key", "polaroid", "prayer beads", "hair tie", "metro card",
  "cracked phone case", "boarding pass", "plastic rose", "gym lock", "empty perfume sample",
];

const OTHER_VIEWPOINTS = [
  "the ex", "the boss", "the cat", "the mother-in-law", "the neighbor",
  "the little sibling", "the driver", "the best friend who took a side",
  "the new person", "the doorman", "the old phone", "the version of them that stayed",
];

const WEATHER_POOL = [
  "heatwave", "khamsin", "humidity 90%", "first rain", "sandstorm",
  "coastal mist", "power-cut dark", "rooftop wind", "AC winter in July", "Friday noon glare",
];

const FILM_GENRES = ["heist", "romance", "80s action", "noir"];

const HOOK_PHRASES = [
  "Say it once", "Don't call it late", "Blue ticks", "Leave the light", "I saw the story",
  "Not tonight", "Keep the change", "Still here", "Close the group", "One more voice note",
  "That's my song", "Come downstairs", "Don't start", "I already know", "After the rain",
  "Hold the elevator", "You left first", "I'm in the taxi", "Mute the chat", "Same perfume",
  "Tell them later", "Window seat", "No more extras", "Write it ugly",
];

const PASSPORT_GENRES = [
  { id: "bossa-night", label: "Bossa night", arabic: "greek-arabic-pop-fusion", english: "latin_dance_pop" },
  { id: "uk-garage", label: "UK garage", arabic: "dance-indie-pop", english: "deep_house_garage" },
  { id: "afrobeats", label: "Afrobeats bounce", arabic: "egyptian-baladi-electro", english: "latin_dance_pop" },
  { id: "70s-funk", label: "70s funk", arabic: "middle-eastern-shaabi-lounge", english: "rnb_pop" },
  { id: "khaleeji-pop", label: "Khaleeji pop", arabic: "modern-khaleeji-pop", english: "contemporary_rnb" },
  { id: "city-pop", label: "City pop", arabic: "levantine-pop-fusion", english: "synthpop_80s" },
];

function A(id, text) {
  return { id, text };
}

const SPARK_RECIPES = {
  overheard: {
    title: "Overheard",
    kicker: "Spy",
    blurb: "One invented line from a café, taxi, or group chat becomes the song.",
    extraKind: "overheard",
    styles: {
      arabic: ["arabic-pop", "middle-eastern-rnb", "egyptian-pop-2000s", "levantine-indie-folk"],
      english: ["indie_folk", "contemporary_rnb", "lofi_hiphop", "rnb_pop"],
    },
    angles: [
      A("not-supposed", "They were not supposed to hear it, and they cannot unhear it."),
      A("funny-then", "The line is funny until the second time they think about it."),
      A("steal-back", "They steal the line and say it back later, softer."),
      A("someone-love", "The overheard person is someone they love."),
      A("stranger", "The overheard person is a stranger they will never see again."),
      A("line-chorus", "The line is the chorus; the verse is why it hurt."),
      A("argue-home", "They argue with the line in their head the whole way home."),
      A("meant-else", "The line was meant for someone else."),
      A("notes-hook", "They write the line in Notes and it becomes a hook."),
      A("unsaid-reply", "The song is the reply they did not say out loud."),
    ],
  },
  "tiny-thing": {
    title: "Tiny Thing, Big Feeling",
    kicker: "Object",
    blurb: "One small object holding a memory. Name one, or let the AI pick.",
    extraKind: "object",
    extraPlaceholder: "Name the object (optional)",
    styles: {
      arabic: ["levantine-indie-folk", "middle-eastern-rnb", "greek-arabic-pop-fusion", "egyptian-pop-2000s"],
      english: ["indie_folk", "lofi_hiphop", "contemporary_rnb", "synthpop_80s"],
    },
    angles: [
      A("in-pocket", "The object is still in their pocket."),
      A("drawer", "They find it in a drawer and lose the afternoon."),
      A("throw-away", "They almost throw it away."),
      A("smells-year", "It smells like a year they cannot return."),
      A("borrowed", "They borrowed it and never gave it back."),
      A("cheap-outlast", "It is cheap and it outlasted the person."),
      A("stranger-same", "They see the same object on a stranger."),
      A("object-speaks", "The chorus is what the object would say."),
      A("pack-trip", "They pack it for a trip they will not take."),
      A("broken-keep", "It is broken and they still keep it."),
    ],
  },
  "other-side": {
    title: "The Other Side",
    kicker: "Flip",
    blurb: "The story from the other person's view — funny or tender.",
    extraKind: "viewpoint",
    styles: {
      arabic: ["levantine-pop-fusion", "middle-eastern-rnb", "modern-rai", "arabic-pop"],
      english: ["rnb_pop", "indie_folk", "alt_rock", "contemporary_rnb"],
    },
    angles: [
      A("kind-wrong", "They were trying to be kind and it came out wrong."),
      A("at-door", "They are still waiting at the door."),
      A("better-ending", "They saw the story and wrote a better ending."),
      A("smaller-love", "They loved them in a smaller way."),
      A("group-villain", "They are the villain in the group chat."),
      A("one-sentence", "They only wanted one honest sentence."),
      A("kept-plant", "They kept the plant alive. That is the whole defense."),
      A("other-chair", "They replay the last fight from the other chair."),
      A("forgive-first", "They forgive first, and hate that."),
      A("not-sorry", "They are not sorry, and they explain why gently."),
    ],
  },
  "weather-heart": {
    title: "Weather Report of My Heart",
    kicker: "Mood",
    blurb: "A mood as a weather forecast — heatwave, khamsin, first rain.",
    extraKind: "weather",
    styles: {
      arabic: ["modern-khaleeji-pop", "levantine-pop-fusion", "middle-eastern-rnb", "arabic-pop"],
      english: ["synthpop_80s", "contemporary_rnb", "deep_house_garage", "indie_folk"],
    },
    angles: [
      A("wrong-forecast", "The forecast is wrong and so were they."),
      A("dressed-past", "They dress for weather that already passed."),
      A("city-fine", "The city is fine; the chest is not."),
      A("check-weather", "They check the weather to avoid checking the chat."),
      A("two-warnings", "A warning on the phone, a warning in the body."),
      A("others-sun", "Everyone else enjoys the sun."),
      A("wait-rain", "They wait for the first rain like a text."),
      A("sand-love", "Sand gets into the love story."),
      A("heavy-air", "Humidity makes every word heavy."),
      A("clear-none", "Clear skies, no visibility."),
    ],
  },
  "main-character": {
    title: "Main Character Minute",
    kicker: "Scene",
    blurb: "An ordinary hour scored like a movie. Genre rolls.",
    extraKind: "film",
    styles: {
      arabic: ["arabic-trap", "dance-indie-pop", "cyber-dabkeh", "dark-levantine-trap"],
      english: ["synthpop_80s", "alt_rock", "kpop_dance", "deep_house_garage"],
    },
    angles: [
      A("traffic-chase", "Traffic as the opening chase."),
      A("coffee-cute", "Coffee run as the meet-cute."),
      A("meeting-heist", "The meeting as a heist briefing."),
      A("grocery-standoff", "Grocery line as a standoff."),
      A("elevator-scene", "The elevator as the only scene."),
      A("credits-walk", "They walk home like the credits already started."),
      A("missed-twist", "A missed call is the plot twist."),
      A("pay-leave", "They pay and leave like they won."),
      A("almost-true", "The ordinary day almost tells the truth."),
      A("take-frame", "They are extra in someone else's movie, then take the frame."),
    ],
  },
  "mood-flip": {
    title: "Mood Flip",
    kicker: "Flip",
    blurb: "The roll picks the flip: sad to dance, before & after, or whisper to hook.",
    extraKind: "",
    styles: {
      arabic: ["dance-indie-pop", "arabic-pop", "middle-eastern-rnb", "egyptian-baladi-electro"],
      english: ["rnb_pop", "latin_dance_pop", "kpop_dance", "synthpop_80s"],
    },
    angles: [
      A("sad-dance", "Sad to dance — keep the ache, move the body."),
      A("before-after", "Before & after — same story, different light."),
      A("whisper-hook", "Whisper to hook — start close, land open."),
      A("anger-laugh", "Anger to laugh — they are done being heavy."),
      A("numb-warm", "Numb to warm — feeling returns in the chorus."),
      A("proud-soft", "Proud mask, soft middle."),
      A("night-morning", "Night panic, morning shrug."),
      A("cry-tease", "They cry in the verse and tease in the chorus."),
      A("hope-drop", "The drop is hope, not revenge."),
      A("quiet-loud", "Quiet house, loud chest."),
    ],
  },
  "hook-first": {
    title: "Hook First",
    kicker: "Hook",
    blurb: "A rolled hook phrase — or type your own. Instant replay.",
    extraKind: "hook",
    extraPlaceholder: "Your hook phrase (optional)",
    styles: {
      arabic: ["arabic-pop", "egyptian-pop-2000s", "egyptian-shaabi-mahraganat", "levantine-pop-fusion"],
      english: ["kpop_dance", "rnb_pop", "latin_dance_pop", "synthpop_80s"],
    },
    angles: [
      A("cold-open", "Cold open — first sung line is already the chorus."),
      A("unsent-text", "The phrase is a text they should not send."),
      A("mama-say", "The phrase is something Mama would say."),
      A("dare", "The phrase is a dare."),
      A("repeat-shift", "Repeat the phrase until it changes meaning."),
      A("verse-sets", "The verse exists only to set that one line."),
      A("social-short", "Social-short: hook in the first breath."),
      A("trend-byte", "Trend-byte: everyday talk, huge hook."),
      A("shop-keep", "They hear the phrase in a shop and keep it."),
      A("kind-mean", "The phrase is kind and a little mean."),
    ],
  },
  "genre-passport": {
    title: "Genre Passport",
    kicker: "Stamp",
    blurb: "The roll assigns a genre you would never pick.",
    extraKind: "passport",
    styles: {
      arabic: PASSPORT_GENRES.map((g) => g.arabic),
      english: PASSPORT_GENRES.map((g) => g.english),
    },
    angles: [
      A("local-else", "The story is local; the groove is from somewhere else."),
      A("complain-fall", "They complain about the genre, then fall into it."),
      A("should-ballad", "Love story that should have been a ballad, isn't."),
      A("wrong-club", "Roast that landed in the wrong club."),
      A("heartbreak-party", "Heartbreak in a genre that wants to party."),
      A("kitchen-big", "A small kitchen fight in a big arrangement."),
      A("stay-cool", "They try to stay cool and the chorus won't let them."),
      A("stamp-hook", "Passport stamp in the first hook."),
      A("two-cities", "Two cities in one feeling."),
      A("night-picked", "They didn't pick this sound. The night did."),
    ],
  },
  "roast-song": {
    title: "Roast Song",
    kicker: "Roast",
    blurb: "A playful roast for a friend — funny, never cruel.",
    extraKind: "",
    styles: {
      arabic: ["arabic-pop", "egyptian-shaabi-mahraganat", "modern-rai", "dance-indie-pop"],
      english: ["kpop_dance", "alt_rock", "rnb_pop", "latin_dance_pop"],
    },
    angles: [
      A("always-late", "Always late, still invited."),
      A("excuse-discog", "Their excuses have a discography."),
      A("forty-leave", "They take 40 minutes to leave the house."),
      A("screenshot-all", "They screenshot everything."),
      A("outside-elev", "They say “I'm outside” from the elevator."),
      A("lyrics-plans", "They know every lyric except their own plans."),
      A("story-charger", "They bring a story, never the charger."),
      A("soft-hard", "Soft roast, hard chorus love."),
      A("chat-wrote", "The group chat already wrote this song."),
      A("sincere-last", "Funny verse, sincere last line."),
    ],
  },
  "one-line-reply": {
    title: "One-Line Reply",
    kicker: "Reply",
    blurb: "The text you wish you'd sent — or paste theirs.",
    extraKind: "reply",
    extraPlaceholder: "Paste the text (optional)",
    styles: {
      arabic: ["middle-eastern-rnb", "arabic-pop", "egyptian-pop-2000s", "levantine-indie-folk"],
      english: ["contemporary_rnb", "rnb_pop", "lofi_hiphop", "indie_folk"],
    },
    angles: [
      A("typed-deleted", "The reply they typed and deleted."),
      A("too-honest", "The reply that is too honest."),
      A("voice-note-reply", "The reply that is only a voice note."),
      A("seen-213", "Seen at 2:13, answered in a song."),
      A("question-back", "They answer a question with a question."),
      A("kind-knife", "Kind, then a knife."),
      A("refuse-fight", "They refuse the fight."),
      A("sorry-if", "They accept the apology with a condition."),
      A("say-less", "They say less than the other person wanted."),
      A("exact-send", "The chorus is the exact line they would send."),
    ],
  },
  "dabke-drop": {
    title: "Dabke Drop",
    kicker: "Party",
    blurb: "Any story. Dabke is the style, not the plot.",
    extraKind: "",
    styles: {
      arabic: ["modern-levantine-dabke", "summer-levantine-dabke-pop", "cyber-dabkeh", "dance-indie-pop"],
      english: ["latin_dance_pop", "kpop_dance", "rnb_pop", "alt_rock"],
    },
    angles: [
      A("reunion", "Reunion after too long."),
      A("windows-down", "Summer night, windows down."),
      A("came-home", "Someone came home."),
      A("pride-quiet", "Pride without a speech."),
      A("missed-loud", "Missed them in a loud room."),
      A("circle-in", "The circle opens and they step in."),
      A("good-news", "Good news arrives badly dressed."),
      A("dance-unsaid", "They dance the thing they cannot say."),
      A("last-song", "Last song before the lights."),
      A("small-win", "A small win treated like a wedding."),
    ],
  },
  "caption-song": {
    title: "Caption Song",
    kicker: "Social",
    blurb: "Your caption is the song. Paste one, or let the AI invent.",
    extraKind: "caption",
    extraPlaceholder: "Paste the caption (optional)",
    styles: {
      arabic: ["levantine-pop-fusion", "arabic-pop", "middle-eastern-rnb", "egyptian-pop-2000s"],
      english: ["rnb_pop", "synthpop_80s", "kpop_dance", "contemporary_rnb"],
    },
    angles: [
      A("posted", "The caption they posted."),
      A("drafted", "The caption they drafted and didn't."),
      A("no-caption", "A story with no caption — the song is the caption."),
      A("soft-flex", "Soft flex, real feeling."),
      A("place-person", "A place tag that is a person."),
      A("no-comment", "“No comment” is the comment."),
      A("old-photo", "Old photo, new caption."),
      A("one-person", "They posted for one person only."),
      A("comments-nice", "The comments are nicer than the truth."),
      A("archive-after", "They archive it after the chorus."),
    ],
  },
  "city-night": {
    title: "City Night",
    kicker: "Night",
    blurb: "Neon, windows down — one city, one hook.",
    extraKind: "",
    styles: {
      arabic: ["arabic-trap", "dark-levantine-trap", "levantine-pop-fusion", "egyptian-pop-2000s"],
      english: ["synthpop_80s", "lofi_hiphop", "deep_house_garage", "alt_rock"],
    },
    angles: [
      A("beirut", "Beirut windows down."),
      A("dubai", "Dubai after the meeting."),
      A("cairo", "Cairo heat at 1 am."),
      A("late-taxi", "Late taxi, radio on."),
      A("rooftop-closed", "Rooftop that closed."),
      A("corniche", "Corniche walk with no plan."),
      A("pharmacy", "Neon pharmacy as a lighthouse."),
      A("shortcuts", "They know every shortcut except this feeling."),
      A("city-full", "The city is full and they are not."),
      A("streetlight", "One streetlight does all the talking."),
    ],
  },
  "shower-thought": {
    title: "Shower Thought",
    kicker: "Thought",
    blurb: "That random thought — make it a hook.",
    extraKind: "",
    styles: {
      arabic: ["levantine-indie-folk", "middle-eastern-rnb", "arabic-pop", "greek-arabic-pop-fusion"],
      english: ["indie_folk", "lofi_hiphop", "contemporary_rnb", "alt_rock"],
    },
    angles: [
      A("dumb-true", "A dumb thought that is true."),
      A("love-rule", "They invent a rule for love."),
      A("steam-q", "They ask a question steam can hold."),
      A("shampoo", "Philosophy in shampoo time."),
      A("small-cruel", "They remember a small cruelty."),
      A("forgive-none", "They forgive someone for no reason."),
      A("funny-then", "The thought is funny until it isn't."),
      A("fear-brand", "They name a fear like a brand."),
      A("decide-un", "They decide something and un-decide it."),
      A("unchanged", "The hook is the thought, unchanged."),
    ],
  },
};

const PHOTO_SPARK_IDEAS = {
  "last-photo-song": {
    english: [
      "Write original lyrics inspired by a personal photo — a real moment in a frame, not a generic memories song. Verse: 2 close specific lines (light, a face, a place). Chorus: 3–4 lines with one repeatable hook that holds that picture. Intimate and finished.",
    ],
    arabic: [
      "اكتب كلمات أصليّة من صورة شخصية — لحظة حقيقية بالإطار، مش أغنية ذكريات عامة. البيت: سطرين قريبين (ضو، وجه، مكان). الكورس: 3–4 أسطر وهوك يتكرر يمسك هالصورة. حميمة ومكتملة.",
    ],
  },
};

function readSparkRollHistory() {
  try {
    const raw = JSON.parse(localStorage.getItem(SPARK_ROLL_HISTORY_KEY) || "[]");
    return Array.isArray(raw) ? raw.filter((row) => row && row.sparkId) : [];
  } catch {
    return [];
  }
}

function writeSparkRollHistory(rows) {
  try {
    localStorage.setItem(SPARK_ROLL_HISTORY_KEY, JSON.stringify(rows.slice(-SPARK_ROLL_HISTORY_MAX)));
  } catch {}
}

function pickRandom(list) {
  const pool = Array.isArray(list) ? list.filter(Boolean) : [];
  if (!pool.length) return null;
  return pool[Math.floor(Math.random() * pool.length)];
}

function sparkPairKey(sparkId, angleId, twistId) {
  return `${sparkId}|${angleId}|${twistId}`;
}

function rollSparkExtra(recipe, extras = {}) {
  const kind = String(recipe?.extraKind || "");
  const userText = String(extras.userText || "").trim();
  if (kind === "overheard") {
    return { kind, overheard: pickFromPool("spark-overheard", OVERHEARD_LINES).text };
  }
  if (kind === "object") {
    return { kind, object: userText || pickFromPool("spark-object", TINY_OBJECTS).text, userNamed: Boolean(userText) };
  }
  if (kind === "viewpoint") {
    const tone = Math.random() < 0.5 ? "funny" : "tender";
    return { kind, viewpoint: pickFromPool("spark-viewpoint", OTHER_VIEWPOINTS).text, tone };
  }
  if (kind === "weather") {
    return { kind, weather: pickFromPool("spark-weather", WEATHER_POOL).text };
  }
  if (kind === "film") {
    return { kind, film: pickFromPool("spark-film", FILM_GENRES).text };
  }
  if (kind === "hook") {
    return { kind, hook: userText || pickFromPool("spark-hook", HOOK_PHRASES).text, userNamed: Boolean(userText) };
  }
  if (kind === "reply" || kind === "caption") {
    return { kind, userText };
  }
  if (kind === "passport") {
    return { kind, passport: pickRandom(PASSPORT_GENRES) };
  }
  return { kind };
}

export function composeSparkIdeaBrief({
  recipe,
  angle,
  twist,
  seed,
  extra = {},
  lang = "arabic",
} = {}) {
  const lines = [
    `Write original lyrics for a Spark called ${recipe?.title || "Spark"}. Playful, specific, finished. No ready lyrics in the style line. Verse and chorus. Short-to-medium lines. Complete last phrase.`,
    `Angle: ${angle?.text || ""}`,
    `Twist: ${twist?.text || ""}`,
    seed ? `Put this concrete image in the lyric world: ${seed}.` : "",
  ];
  if (extra.overheard) {
    lines.push(`The song is built around this invented overheard line (do not treat it as a real quote from a real person): “${extra.overheard}”`);
  }
  if (extra.object) {
    lines.push(`The small object at the center is: ${extra.object}.`);
  }
  if (extra.viewpoint) {
    lines.push(`Tell it from ${extra.viewpoint}. Tone: ${extra.tone || "tender"}.`);
  }
  if (extra.weather) {
    lines.push(`The heart-weather is: ${extra.weather}. Light Gulf/Levant flavor. Weather is the metaphor, not a climate lecture.`);
  }
  if (extra.film) {
    lines.push(`Score an ordinary minute like a ${extra.film} scene.`);
  }
  if (extra.hook) {
    lines.push(`The hook phrase is: “${extra.hook}”. First sung line can already be the chorus.`);
  }
  if (extra.kind === "reply" && extra.userText) {
    lines.push(`They are answering this text: “${extra.userText}”.`);
  }
  if (extra.kind === "caption" && extra.userText) {
    lines.push(`The caption is: “${extra.userText}”.`);
  }
  if (extra.passport) {
    lines.push(`Genre passport: write a personal story that lives in a ${extra.passport.label} feeling. Do not name the genre in the lyrics.`);
  }
  if (String(recipe?.id || "") === "dabke-drop" || recipe?.title === "Dabke Drop") {
    lines.push("Dabke is the style, not the story. Do not write lyrics about dabke or weddings unless the angle needs a celebration.");
  }
  if (recipe?.title === "Roast Song") {
    lines.push("Funny, never cruel. End like you still love them.");
  }
  lines.push("If the lyrics language is Arabic, write Arabic script only. Never Arabizi, Franco-Arabic, or Latin-letter Arabic.");
  lines.push(scriptRule(lang));
  return lines.filter(Boolean).join("\n");
}

export function getSparkRecipe(id) {
  return SPARK_RECIPES[resolveSparkId(id)] || null;
}

export function isRecipeSparkId(id) {
  return Boolean(getSparkRecipe(id));
}

export function listRecipeSparkIds() {
  return Object.keys(SPARK_RECIPES);
}

export function dailySparkDeckIds({ count = 7 } = {}) {
  const rest = listRecipeSparkIds().filter((id) => id !== FEATURED_SPARK_ID);
  const n = Math.max(6, Math.min(8, Number(count) || 7));
  if (!rest.length) return [];
  const day = Math.floor(Date.now() / 86400000);
  const start = ((day % rest.length) + rest.length) % rest.length;
  return Array.from({ length: Math.min(n, rest.length) }, (_, i) => rest[(start + i) % rest.length]);
}

export function pickSparkRecipe({
  sparkId,
  languageId = "auto",
  createLang = "",
  createDialect = "",
  appLang = "",
  userText = "",
} = {}) {
  const id = resolveSparkId(sparkId);
  const recipe = SPARK_RECIPES[id];
  if (!recipe) return null;
  const lang = resolveSparkPromptLang(languageId, { createLang, createDialect, appLang, userText });
  const history = readSparkRollHistory();
  const used = new Set(
    history.filter((row) => row.sparkId === id).map((row) => sparkPairKey(row.sparkId, row.angleId, row.twistId)),
  );
  let angle = pickRandom(recipe.angles);
  let twist = pickRandom(SPARK_TWISTS);
  for (let i = 0; i < 14; i += 1) {
    if (!used.has(sparkPairKey(id, angle?.id, twist?.id))) break;
    twist = pickRandom(SPARK_TWISTS);
    if (i >= 7) angle = pickRandom(recipe.angles);
  }
  const extra = rollSparkExtra({ ...recipe, id }, { userText });
  let styleIds = lang === "english" ? recipe.styles.english : recipe.styles.arabic;
  if (extra.passport) {
    styleIds = [lang === "english" ? extra.passport.english : extra.passport.arabic];
  }
  const styleId = pickFromPool(`spark-style:${id}:${lang}`, styleIds).text || styleIds[0] || "";
  const seed = pickFromPool(`spark-seed:${id}`, SPARK_SEEDS).text || SPARK_SEEDS[0];
  const prompt = composeSparkIdeaBrief({ recipe: { ...recipe, id }, angle, twist, seed, extra, lang });
  writeSparkRollHistory([
    ...history,
    { sparkId: id, angleId: angle?.id || "", twistId: twist?.id || "" },
  ]);
  return {
    sparkId: id,
    title: recipe.title,
    kicker: recipe.kicker,
    blurb: recipe.blurb,
    prompt,
    angle: angle?.text || "",
    angleId: angle?.id || "",
    twist: twist?.text || "",
    twistId: twist?.id || "",
    twistChip: twist?.chip || "",
    seed,
    styleId,
    extra,
    extraPlaceholder: recipe.extraPlaceholder || "",
    extraKind: recipe.extraKind || "",
    chip: [twist?.chip, seed].filter(Boolean).join(" · "),
    lang,
  };
}

export function pickSparkLyricPrompt({
  sparkId,
  languageId = "auto",
  createLang = "",
  createDialect = "",
  appLang = "",
  userText = "",
} = {}) {
  const id = resolveSparkId(sparkId);
  if (SPARK_RECIPES[id]) {
    return pickSparkRecipe({
      sparkId: id,
      languageId,
      createLang,
      createDialect,
      appLang,
      userText,
    })?.prompt || "";
  }
  const pool = PHOTO_SPARK_IDEAS[String(sparkId || "").trim()] || PHOTO_SPARK_IDEAS[id];
  if (!pool) return "";
  const lang = resolveSparkPromptLang(languageId, {
    sparkId,
    createLang,
    createDialect,
    appLang,
    userText,
  });
  const idea = pickFromPool(`spark:${id}:${lang}`, pool[lang] || pool.english).text;
  if (!idea) return "";
  return [idea, scriptRule(lang)].filter(Boolean).join("\n");
}
