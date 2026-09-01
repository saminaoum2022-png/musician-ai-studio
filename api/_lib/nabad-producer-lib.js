/**
 * Nabad Producer — guided full-song session (Gemini coach + Lyria Pro).
 * Staging-first: NABAD_PRODUCER_ENABLED=1 on Vercel Preview.
 */

const { buildLyriaVocalProfile, clipVocalProfileById } = require("./lyria-upstream");

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta";
const COACH_TIMEOUT_MS = Number(process.env.NABAD_PRODUCER_COACH_TIMEOUT_MS || 20000);
const BLUEPRINT_TIMEOUT_MS = Number(process.env.NABAD_PRODUCER_BLUEPRINT_TIMEOUT_MS || 25000);
const MASTER_STYLE_MAX_CHARS = 2000;

const NABAD_PRODUCER_CREDIT_COST = Math.max(
  1,
  Number(process.env.NABAD_PRODUCER_CREDIT_COST || 50),
);

const PRODUCER_MODEL_PREFERRED = [
  "gemini-3.6-flash",
  "gemini-3.5-flash",
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite",
];

const STEPS = ["genre", "mood", "tempo", "vocal", "instruments", "lyrics", "reference", "blueprint"];

const QUICK_REPLIES = {
  genre: [
    { id: "genre_dabke", label: "Levantine Dabke" },
    { id: "genre_pop", label: "Arabic Pop" },
    { id: "genre_ballad", label: "Ballad / Slow" },
    { id: "genre_rap", label: "Arabic Rap / Trap" },
    { id: "genre_khaliji", label: "Khaliji" },
    { id: "genre_cinematic", label: "Cinematic" },
  ],
  mood: [
    { id: "mood_joyful", label: "Joyful & upbeat" },
    { id: "mood_romantic", label: "Romantic" },
    { id: "mood_melancholy", label: "Melancholy" },
    { id: "mood_dark", label: "Dark & cinematic" },
    { id: "mood_party", label: "Party / festival" },
    { id: "mood_nostalgic", label: "Nostalgic" },
  ],
  tempo: [
    { id: "tempo_slow", label: "Slow · ~70–85 BPM" },
    { id: "tempo_mid", label: "Mid · ~95–110 BPM" },
    { id: "tempo_upbeat", label: "Upbeat · ~120–128 BPM" },
    { id: "tempo_fast", label: "Fast · ~130–140 BPM" },
  ],
  vocal: [
    { id: "vocal_m", label: "Male vocal" },
    { id: "vocal_f", label: "Female vocal" },
    { id: "vocal_duo", label: "Duo (verse / chorus)" },
    { id: "vocal_instrumental", label: "Instrumental only" },
  ],
  instruments: [
    { id: "inst_oud_darbuka", label: "Oud + darbuka" },
    { id: "inst_synth_pop", label: "Modern synth pop" },
    { id: "inst_strings", label: "Strings + piano" },
    { id: "inst_guitar_band", label: "Live band / guitar" },
    { id: "inst_minimal", label: "Minimal · voice + pad" },
    { id: "inst_skip", label: "Skip · let Producer decide" },
  ],
  reference: [
    { id: "reference_skip", label: "No reference · original style" },
  ],
  lyrics: [
    { id: "lyrics_help_write", label: "Write lyrics for me" },
    { id: "lyrics_help_continue", label: "Continue my lyrics" },
    { id: "lyrics_done", label: "Done · continue" },
  ],
  blueprint: [
    { id: "blueprint_edit_lyrics", label: "Edit lyrics" },
    { id: "blueprint_confirm", label: "Generate song · 50 credits" },
  ],
};

const BLUEPRINT_SYSTEM_PROMPT = `You are an expert music producer for NabadAi full-length songs (~3–4 minutes) for Google Lyria.

Return ONLY valid JSON with exactly two string fields. No markdown fences, no commentary.

{
  "structured_lyrics": "<string>",
  "master_style_prompt": "<string>"
}

structured_lyrics:
- Preserve user lyrics exactly (Arabic, English, or mixed). Do NOT translate or rewrite lines.
- English structure tags only, e.g. [Intro], [Verse 1], [Pre-Chorus], [Chorus - Dynamic Drop], [Verse 2], [Bridge], [Outro].
- Full song arc — not a 30s clip.
- If instrumental is true, return "".

master_style_prompt:
- 1200–2000 characters. Rich production brief for Lyria.
- Include: genre, mood, exact BPM, key/scale, vocal delivery, instrument layers, dynamic drops/builds, transitions, mix space.
- NEVER include copyrighted artist names, song titles, or album names — only generic musical descriptors.
- If reference_inspiration is provided, translate to abstract style only (tempo feel, arrangement density, vocal tone class).

Return ONLY the JSON object.`;

const COACH_REPLY_SYSTEM_PROMPT = `You are Nabad Producer — a real session producer in the NabadAi booth: warm, opinionated, musically literate. You think in arrangement, register, groove, timbre, and mix space — not form fields.

Reply in 2–4 sentences. Plain text only — no markdown, bullets, or chip menus in the text.

You receive JSON with: current_step, step_phase (optional sub-step), session_locked (choices already saved — NEVER re-ask these), user_action (chip they tapped), user_message, next_step, conflict_note, user_asks_for_options, chips_visible, chip_options (labels visible below when chips_visible is true).

Producer character:
- Give brief musical reasoning — e.g. why a male tenor cuts through dabke at 124 BPM, why oud+darbuka anchors Levantine feel, why a breathy female lead suits romantic ballads.
- When user_action is set, affirm the choice and explain ONE concrete production reason (register, texture, rhythm section, dynamic build) tied to their genre/mood/tempo so far.
- Offer a helpful hint or suggestion when teeing up next_step — instrument layer, vocal delivery, or energy — without overwhelming.
- If user_asks_for_options or chips_visible is true, point them to the chips below; they can tap one OR type their own answer.
- If user_message is small talk, respond warmly then gently return to the open step — do not repeat locked choices.
- NEVER ask again for something already in session_locked (genre, mood, tempo, vocal, etc.). If vocal gender is locked and step_phase is vocal_character, you're picking a vocal *character* tint — not re-asking male vs female.
- Arabic or English from the user is fine; match their language when obvious.
- Never name copyrighted artists unless the user already did in reference.
- Always finish complete sentences. Max 450 characters.`;

function allQuickReplyLabels() {
  const map = new Map();
  for (const list of Object.values(QUICK_REPLIES)) {
    for (const q of list) map.set(q.id, q.label);
  }
  map.set("vocal_char_male_jabali", "Folk · جبلي");
  map.set("vocal_char_male_bahha", "Grit · بحة");
  map.set("vocal_char_male_deep", "Deep · عميق");
  map.set("vocal_char_female_warm", "Warm Pop");
  map.set("vocal_char_female_emotional", "Emotional");
  map.set("vocal_char_female_soft", "Soft");
  map.set("vocal_char_duo_verse_chorus", "Duo · Verse/Chorus");
  map.set("vocal_char_skip", "Skip · default vocal");
  map.set("blueprint_retry", "Retry blueprint");
  map.set("blueprint_confirm", "Generate song");
  map.set("blueprint_edit_lyrics", "Edit lyrics");
  map.set("lyrics_help_write", "Write lyrics for me");
  map.set("lyrics_help_continue", "Continue my lyrics");
  map.set("lyrics_done", "Done · continue");
  return map;
}

const ACTION_LABELS = allQuickReplyLabels();

function actionLabelFromId(actionId) {
  return ACTION_LABELS.get(String(actionId || "").trim()) || "";
}

function isLikelyChitchat(message) {
  const t = String(message || "").trim();
  if (!t || t.length > 120) return false;
  const normalized = t.toLowerCase().replace(/[^\w\s\u0600-\u06FF']/gu, " ").replace(/\s+/g, " ").trim();
  if (/^(hi+|hey+|hello+|yo+|sup|how are you|how r u|what'?s up|how'?s it going|hope (you are|you'?re|all is) (good|well|ok)|good (morning|evening|night|afternoon)|thanks|thank you|thx|ok(ay)?|cool|nice|great|awesome|مرحبا|مرحب|اهلين|أهلين|هلا|السلام|كيفك|شكرا)([!.?\s]|$)/iu.test(normalized)) {
    return true;
  }
  if (/^(hi+|hey+|hello+)\b.*\b(how are you|how are u|how'?s it going)\b/iu.test(normalized)) return true;
  if (/\b(how are you|how r u|how'?s it going|hope all is good|hope you'?re well)\b/iu.test(normalized) && normalized.length <= 80) {
    return true;
  }
  if (/^(هاي|هلا|مرحب|أهلين|اهلين|السلام|كيفك|كيف حالك|شو اخبارك|شو الأخبار)([!.?\s]|$)/iu.test(normalized)) return true;
  if (/^(hi+|hey+|hello+)\b/iu.test(normalized) && /\b(كيفك|how are you)\b/iu.test(normalized)) return true;
  return false;
}

function isAskingForOptions(message) {
  const t = String(message || "").trim();
  if (!t || t.length > 160) return false;
  const lower = t.toLowerCase();
  return (
    /\b(what are (the )?options|show (me )?(the )?options|what can i choose|list (the )?options|see the options|what are my choices)\b/i.test(lower)
    || /\b(show (me )?the chips|display (the )?options)\b/i.test(lower)
    || /(فيني|فيمكنني|ممكن|بدي|بدّي).{0,24}(اشوف|أشوف|شوف|عرض).{0,24}(الخيارات|خيارات)/iu.test(t)
    || /(شو|ما|what).{0,16}(الخيارات|options|choices)/iu.test(t)
    || /(ورّيني|وريني|اعرض|أعرض).{0,16}(الخيارات|خيارات)/iu.test(t)
  );
}

function userPrefersArabic(message) {
  return /[\u0600-\u06FF]/.test(String(message || ""));
}

function optionsRevealReply(step, message) {
  const ar = userPrefersArabic(message);
  const stepAr = {
    genre: "أنواع الموسيقى",
    mood: "المود / الأحاسيس",
    tempo: "سرعة الإيقاع",
    vocal: "الغناء والصوت",
    instruments: "الآلات",
    lyrics: "كتابة الكلمات",
    reference: "المرجع الموسيقي",
  };
  const stepEn = {
    genre: "genre options",
    mood: "mood options",
    tempo: "tempo options",
    vocal: "vocal options",
    instruments: "instrument options",
    lyrics: "lyrics step",
    reference: "reference options",
  };
  if (ar) {
    const label = stepAr[step] || "الخيارات";
    return `أكيد — رح أعرضلك ${label} تحت هلّق. اختار chip أو احكيلي بكلماتك.`;
  }
  const label = stepEn[step] || "options";
  return `Sure — I'll show the ${label} below. Tap one, or describe it in your own words.`;
}

function normalizeVocalGenderValue(raw) {
  const t = String(raw || "").trim().toLowerCase();
  if (!t) return "";
  if (t === "m" || t === "male" || /\b(male|man|boy|tenor|baritone|ذكر|رجل|صوت رج)\b/i.test(t)) return "m";
  if (t === "f" || t === "female" || /\b(female|woman|girl|soprano|انث|امرأ|فتاة|صوت نس)\b/i.test(t)) return "f";
  if (t === "duo" || /\b(duo|duet|ثنائي|ذكر.*انث|male.*female)\b/i.test(t)) return "duo";
  return String(raw || "").trim().slice(0, 16);
}

function vocalStepPhase(session) {
  if (session.instrumental) return null;
  if (!normalizeVocalGenderValue(session.vocalGender)) return "vocal_gender";
  if (!session.vocalCharacterDone) return "vocal_character";
  return null;
}

function isVocalAdvanceMessage(message) {
  const t = String(message || "").trim().toLowerCase();
  if (!t) return false;
  return /^(ok(ay)?|yes|yep|sure|skip|default|next|done|تمام|طيب|خلص|كمل|ماشي|default vocal|any|whatever|don't care|no preference)/iu.test(t)
    || /\b(skip|default|no preference|anything|whatever)\b/i.test(t);
}

function isVocalGenderReconfirm(message, vocalGender) {
  const g = normalizeVocalGenderValue(vocalGender);
  const action = matchMessageToActionId("vocal", message);
  if (!g || !action) return false;
  const map = { vocal_m: "m", vocal_f: "f", vocal_duo: "duo" };
  return map[action] === g;
}

function matchVocalCharacterActionId(vocalGender, message) {
  const t = String(message || "").trim().toLowerCase();
  if (!t) return "";
  const g = normalizeVocalGenderValue(vocalGender);
  if (/skip|default|any|whatever|بدون|عادي/i.test(t)) return "vocal_char_skip";
  if (g === "m" || g === "duo") {
    if (/jabali|جبل|folk/i.test(t)) return "vocal_char_male_jabali";
    if (/bahha|بحة|grit|raspy|hoarse/i.test(t)) return "vocal_char_male_bahha";
    if (/deep|عميق|bass voice/i.test(t)) return "vocal_char_male_deep";
  }
  if (g === "f" || g === "duo") {
    if (/warm|pop|داف/i.test(t)) return "vocal_char_female_warm";
    if (/emotion|عاطف|dramatic/i.test(t)) return "vocal_char_female_emotional";
    if (/soft|ناعم|breathy|gentle/i.test(t)) return "vocal_char_female_soft";
  }
  if (g === "duo" && /duo|verse.*chorus|ثنائي/i.test(t)) return "vocal_char_duo_verse_chorus";
  return "";
}

function isLyricsHelpRequest(message) {
  const t = String(message || "").trim();
  if (!t || t.length > 800) return false;
  return (
    /\b(write (the )?lyrics|write for me|help (me )?(write|finish)|complete (my |the )?lyrics|continue (my |the )?lyrics|finish (the |my )?words|more lyrics)\b/i.test(t)
    || /(اكتب|كتبلي|اكتبلي|ساعدني|كمّل|كمل|كمّلي|كملي|خلص|أكمل|اكمل).{0,20}(الكلمات|كلمات|الغنا|الغناء|lyrics)/iu.test(t)
    || /(ما عطيتك|ما أعطيتك|ما كتبت|مو كامل|نقص| incomplete).{0,30}(كلمات|الكلام|lyrics)/iu.test(t)
    || /(خلينا|خلّينا|بدنا|بدي).{0,20}(نخلص|نكمّل|نكمل).{0,20}(الكلام|الكلمات|lyrics)/iu.test(t)
  );
}

function isLyricsRewindRequest(message) {
  const t = String(message || "").trim();
  if (!t) return false;
  return isLyricsHelpRequest(t)
    || /(back to lyrics|edit lyrics|change lyrics|رجع.*كلمات|عد.*كلمات|بدي عدّل الكلمات)/iu.test(t);
}

function isLyricsAdvanceIntent(message) {
  const t = String(message || "").trim().toLowerCase();
  if (!t) return false;
  return /^(done|next|continue|skip|ok(ay)?|that's all|move on|تمام|خلص|كمل|ماشي)/iu.test(t)
    || /\b(done with lyrics|continue to reference|no more lyrics)\b/i.test(t);
}

function chipLabelsForStep(step, session) {
  return quickRepliesForStep(step, session).map((q) => q.label).filter(Boolean);
}

function matchMessageToActionId(step, message) {
  const t = String(message || "").trim().toLowerCase();
  if (!t) return "";

  if (step === "genre") {
    if (/dabke|دبكة|levantine/i.test(t)) return "genre_dabke";
    if (/pop|بوب|عربي/i.test(t) && !/rap|trap/i.test(t)) return "genre_pop";
    if (/ballad|slow|بالاد|بطي/i.test(t)) return "genre_ballad";
    if (/rap|trap|راب|تrap/i.test(t)) return "genre_rap";
    if (/khaliji|خليج/i.test(t)) return "genre_khaliji";
    if (/cinematic|سينم/i.test(t)) return "genre_cinematic";
  }

  if (step === "mood") {
    if (/joy|upbeat|happy|حماس|فرح|قوي|strong|powerful|energetic/i.test(t)) return "mood_joyful";
    if (/romantic|love|روم|حب|عاطف/i.test(t)) return "mood_romantic";
    if (/melanchol|sad|حزن|أسى/i.test(t)) return "mood_melancholy";
    if (/dark|cinematic|مظلم/i.test(t)) return "mood_dark";
    if (/party|festival|dabke|حفل|رقص/i.test(t)) return "mood_party";
    if (/nostalg|ذكري/i.test(t)) return "mood_nostalgic";
  }

  if (step === "tempo") {
    if (/slow|بطي|هاد|calm|relaxed|70|85/i.test(t)) return "tempo_slow";
    if (/mid|medium|متوسط|95|110/i.test(t)) return "tempo_mid";
    if (/upbeat|danc|راقص|120|128|سريع.*رقص|رقص.*سريع/i.test(t)) return "tempo_upbeat";
    if (/fast|130|140|سريع/i.test(t)) return "tempo_fast";
  }

  if (step === "vocal") {
    if (/instrumental|no vocal|بدون غناء|موسيقى فقط|inst/i.test(t)) return "vocal_instrumental";
    if (/duo|ثنائي|ذكر.*انث|male.*female/i.test(t)) return "vocal_duo";
    if (/female|woman|girl|انث|امرأ|فتاة|صوت نس/i.test(t)) return "vocal_f";
    if (/male|man|boy|ذكر|رجل|صوت رج/i.test(t)) return "vocal_m";
  }

  if (step === "instruments") {
    if (/skip|decide|انت|اختر/i.test(t)) return "inst_skip";
    if (/oud|darbuka|عود|دراب/i.test(t)) return "inst_oud_darbuka";
    if (/synth|pop|سynth/i.test(t)) return "inst_synth_pop";
    if (/string|piano|كمان|بيانو/i.test(t)) return "inst_strings";
    if (/guitar|band|غitar|فرقة/i.test(t)) return "inst_guitar_band";
    if (/minimal|minimal|بسيط/i.test(t)) return "inst_minimal";
  }

  return "";
}

function applyMessageToSession(session, step, message) {
  const text = String(message || "").trim();
  if (!text) return session;

  if (step === "vocal" && !session.instrumental) {
    const gender = normalizeVocalGenderValue(session.vocalGender);
    if (gender && !session.vocalCharacterDone) {
      const charAction = matchVocalCharacterActionId(gender, text);
      if (charAction) return applyAction(session, charAction);
      if (isVocalAdvanceMessage(text) || isVocalGenderReconfirm(text, gender)) {
        return applyAction(session, "vocal_char_skip");
      }
    }
  }

  const actionId = matchMessageToActionId(step, text);
  if (actionId) return applyAction(session, actionId);
  return applyTextToStep(session, step, text);
}

function resolveVisibleQuickReplies({
  step,
  session,
  chitchat,
  wantsOptions,
  sessionReady,
}) {
  if (step === "blueprint" && sessionReady) {
    return QUICK_REPLIES.blueprint;
  }

  if (step === "lyrics" && session.instrumental) {
    return [{ id: "reference_skip", label: "Skip · no lyrics needed" }];
  }

  if (chitchat && !wantsOptions) return [];

  return quickRepliesForStep(step, session);
}

function chitchatFallbackReply(message) {
  const t = String(message || "").toLowerCase();
  if (/\b(how are you|how r u|how'?s it going|hope all is good|hope you'?re well)\b/.test(t)) {
    return "Doing great — thanks for asking! When you're ready, tap a chip below or tell me the vibe you want.";
  }
  if (/^(hi+|hey+|hello|yo|sup)\b/.test(t)) {
    return "Hey — glad you're here. Let's keep building your song whenever you're ready.";
  }
  if (/^(thanks|thank you|thx)\b/.test(t)) {
    return "Anytime! Let's keep going on your track.";
  }
  return null;
}

function isBrokenCoachReply(text) {
  const t = String(text || "").trim();
  if (!t || t.length < 6) return true;
  if (/^[\.*•\-\s]+$/u.test(t)) return true;
  if (/^[\.*]\s*[\.*]$/u.test(t)) return true;
  return false;
}

function clipCoachReply(text, max = 520) {
  const t = String(text || "").trim();
  if (t.length <= max) return t;
  let cut = t.slice(0, max);
  const lastEnd = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("! "), cut.lastIndexOf("? "));
  if (lastEnd > Math.floor(max * 0.45)) return cut.slice(0, lastEnd + 1).trim();
  const sp = cut.lastIndexOf(" ");
  if (sp > Math.floor(max * 0.6)) return cut.slice(0, sp).trim();
  return cut.trim();
}

function normalizeCoachReplyText(raw) {
  let reply = String(raw || "").trim().replace(/^["']|["']$/g, "");
  if (!reply) return "";
  reply = reply.replace(/^```[\s\S]*?```$/gm, "").trim();
  if (isBrokenCoachReply(reply)) return "";
  return clipCoachReply(reply, 520);
}

function sessionSnapshot(session) {
  return {
    genre: session.genre || null,
    mood: session.mood || null,
    tempo: session.tempo || null,
    bpm: session.bpm ?? null,
    vocal: session.instrumental ? "instrumental" : session.vocalGender || null,
    vocal_character: session.clipVocalProfileId || null,
    instruments: session.instruments || null,
    has_lyrics: Boolean(session.lyrics),
    reference: session.referenceSkipped ? "skipped" : session.referenceText || null,
  };
}

function safeJson(txt) {
  try {
    return JSON.parse(txt);
  } catch {
    return null;
  }
}

function envFlagEnabled(name, { defaultOn = false } = {}) {
  const v = String(process.env[name] || "").trim().toLowerCase();
  if (!v) return defaultOn;
  return v === "1" || v === "true" || v === "yes";
}

function nabadProducerEnabled() {
  return envFlagEnabled("NABAD_PRODUCER_ENABLED", { defaultOn: false });
}

function resolveProducerModels() {
  const override = String(process.env.NABAD_PRODUCER_MODEL || process.env.CLIP_GEMINI_PRODUCER_MODEL || "").trim();
  if (override) return [override];
  return PRODUCER_MODEL_PREFERRED;
}

function emptySession() {
  return {
    genre: "",
    mood: "",
    tempo: "",
    bpm: null,
    vocalGender: "",
    clipVocalProfileId: "",
    instruments: "",
    lyrics: "",
    referenceText: "",
    referenceNote: "",
    title: "",
    instrumental: false,
    referenceSkipped: false,
    vocalCharacterDone: false,
    lyricsDone: false,
    blueprintAttempts: 0,
  };
}

function normalizeSession(raw) {
  const s = raw && typeof raw === "object" ? raw : {};
  return {
    ...emptySession(),
    genre: String(s.genre || "").trim().slice(0, 120),
    mood: String(s.mood || "").trim().slice(0, 120),
    tempo: String(s.tempo || "").trim().slice(0, 80),
    bpm: s.bpm != null && Number.isFinite(Number(s.bpm)) ? Math.round(Number(s.bpm)) : null,
    vocalGender: normalizeVocalGenderValue(s.vocalGender),
    clipVocalProfileId: String(s.clipVocalProfileId || "").trim().slice(0, 64),
    instruments: String(s.instruments || "").trim().slice(0, 200),
    lyrics: String(s.lyrics || "").trim().slice(0, 4000),
    referenceText: String(s.referenceText || "").trim().slice(0, 300),
    referenceNote: String(s.referenceNote || "").trim().slice(0, 600),
    title: String(s.title || "").trim().slice(0, 120),
    instrumental: Boolean(s.instrumental),
    referenceSkipped: Boolean(s.referenceSkipped),
    vocalCharacterDone: Boolean(s.vocalCharacterDone),
    lyricsDone: Boolean(s.lyricsDone),
    blueprintAttempts: Math.max(0, Number(s.blueprintAttempts) || 0),
  };
}

function computeNextStep(session) {
  if (!session.genre) return "genre";
  if (!session.mood) return "mood";
  if (!session.tempo && session.bpm == null) return "tempo";
  if (!session.instrumental && !normalizeVocalGenderValue(session.vocalGender)) return "vocal";
  if (!session.instrumental && normalizeVocalGenderValue(session.vocalGender) && !session.vocalCharacterDone) return "vocal";
  if (!session.instruments) return "instruments";
  if (!session.instrumental && !session.lyricsDone) return "lyrics";
  if (!session.referenceSkipped && !session.referenceText) return "reference";
  return "blueprint";
}

function applyAction(session, actionId) {
  const id = String(actionId || "").trim();
  if (!id) return session;

  const map = {
    genre_dabke: { genre: "Levantine Dabke" },
    genre_pop: { genre: "Arabic Pop" },
    genre_ballad: { genre: "Ballad / Slow" },
    genre_rap: { genre: "Arabic Rap / Trap" },
    genre_khaliji: { genre: "Khaliji" },
    genre_cinematic: { genre: "Cinematic" },
    mood_joyful: { mood: "Joyful & upbeat" },
    mood_romantic: { mood: "Romantic" },
    mood_melancholy: { mood: "Melancholy" },
    mood_dark: { mood: "Dark & cinematic" },
    mood_party: { mood: "Party / festival" },
    mood_nostalgic: { mood: "Nostalgic" },
    tempo_slow: { tempo: "Slow", bpm: 78 },
    tempo_mid: { tempo: "Mid", bpm: 102 },
    tempo_upbeat: { tempo: "Upbeat", bpm: 124 },
    tempo_fast: { tempo: "Fast", bpm: 132 },
    vocal_m: { vocalGender: "m", instrumental: false, vocalCharacterDone: false, clipVocalProfileId: "" },
    vocal_f: { vocalGender: "f", instrumental: false, vocalCharacterDone: false, clipVocalProfileId: "" },
    vocal_duo: { vocalGender: "duo", instrumental: false, vocalCharacterDone: false, clipVocalProfileId: "" },
    vocal_instrumental: { vocalGender: "", instrumental: true, lyrics: "", vocalCharacterDone: true },
    inst_oud_darbuka: { instruments: "Oud, darbuka, bass, strings" },
    inst_synth_pop: { instruments: "Synth pads, modern drums, sub-bass, plucks" },
    inst_strings: { instruments: "Strings section, piano, soft percussion" },
    inst_guitar_band: { instruments: "Live drums, electric guitar, bass, keys" },
    inst_minimal: { instruments: "Minimal — voice, warm pad, subtle percussion" },
    inst_skip: { instruments: "Producer's choice — match genre and mood" },
    reference_skip: { referenceSkipped: true, referenceText: "", referenceNote: "" },
    lyrics_done: { lyricsDone: true },
    lyrics_help_write: { _lyricsHelp: "write" },
    lyrics_help_continue: { _lyricsHelp: "continue" },
    blueprint_edit_lyrics: { _editLyrics: true },
  };

  if (id.startsWith("vocal_char_")) {
    if (id === "vocal_char_skip") {
      return { ...session, clipVocalProfileId: "", vocalCharacterDone: true };
    }
    const profileId = id.slice("vocal_char_".length);
    const catalog = clipVocalProfileById(profileId);
    if (catalog) {
      return {
        ...session,
        clipVocalProfileId: profileId,
        vocalGender: catalog.gender === "duo" ? "duo" : catalog.gender === "f" ? "f" : "m",
        instrumental: false,
        vocalCharacterDone: true,
      };
    }
  }

  const patch = map[id];
  if (!patch) return session;
  if (patch._editLyrics) {
    return { ...session, lyrics: "", lyricsDone: false };
  }
  if (patch._lyricsHelp) {
    return { ...session, lyricsDone: false, referenceText: "", referenceNote: "", referenceSkipped: false };
  }
  return { ...session, ...patch };
}

function detectConflict(session) {
  const bpm = session.bpm || 0;
  const mood = String(session.mood || "").toLowerCase();
  const tempo = String(session.tempo || "").toLowerCase();

  if (bpm >= 120 && (mood.includes("melanchol") || mood.includes("ballad") || mood.includes("romantic"))) {
    return {
      message: "Fast tempo (~120+ BPM) usually fights a slow, romantic, or melancholy mood. Want a mid/slow tempo instead?",
      suggestIds: ["tempo_mid", "tempo_slow"],
    };
  }
  if (bpm > 0 && bpm <= 85 && (mood.includes("party") || mood.includes("dabke") || tempo.includes("fast"))) {
    return {
      message: "This tempo is quite slow for a party or dabke energy. Try mid or upbeat?",
      suggestIds: ["tempo_mid", "tempo_upbeat"],
    };
  }
  return null;
}

function stepCoachCopy(step, session) {
  const phase = vocalStepPhase(session);
  const copies = {
    genre: "Let's build your full song together — pick a genre below or tell me the vibe you're chasing.",
    mood: `Great — ${session.genre}. What mood should this track carry? Chips below, or describe the feeling.`,
    tempo: "Pick an energy / tempo feel — the chips map to BPM ranges, or tell me how it should move.",
    vocal: phase === "vocal_character"
      ? "Now let's tint the vocal character — warmer, grittier, softer? Pick below or say what you hear in your head."
      : "Who carries the vocal — male, female, duo, or instrumental? Tap a chip or describe the voice.",
    instruments: "Any core instruments you want in the arrangement? Pick below or name what you hear.",
    lyrics: session.instrumental
      ? "Instrumental track — paste a title idea or tap Done · continue when ready."
      : "Paste your lyrics, ask me to write or continue them, then tap Done · continue when ready.",
    reference: "Optional: name a song or artist for *style inspiration* (text only). I'll describe the vibe — never copy a recording.",
    blueprint: "Here's your production blueprint. Review it, then generate when you're ready.",
  };
  return copies[step] || "Tell me what you'd like to adjust — chips below if you want quick picks.";
}

function quickRepliesForStep(step, session) {
  if (step === "vocal" && session.vocalGender && !session.vocalCharacterDone && !session.instrumental) {
    const gender = session.vocalGender;
    const chars = [
      { id: "vocal_char_male_jabali", label: "Folk · جبلي" },
      { id: "vocal_char_male_bahha", label: "Grit · بحة" },
      { id: "vocal_char_male_deep", label: "Deep · عميق" },
      { id: "vocal_char_female_warm", label: "Warm Pop" },
      { id: "vocal_char_female_emotional", label: "Emotional" },
      { id: "vocal_char_female_soft", label: "Soft" },
      { id: "vocal_char_duo_verse_chorus", label: "Duo · Verse/Chorus" },
      { id: "vocal_char_skip", label: "Skip · default vocal" },
    ].filter((c) => {
      if (c.id === "vocal_char_skip") return true;
      if (gender === "duo") return c.id.includes("duo");
      if (gender === "f") return c.id.includes("female");
      return c.id.includes("male");
    });
    return chars;
  }
  return QUICK_REPLIES[step] || [];
}

function extractGeminiText(data) {
  const parts = data?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) return "";
  return parts
    .filter((p) => !p?.thought)
    .map((p) => String(p?.text || "").trim())
    .filter(Boolean)
    .join("\n")
    .trim();
}

function parseBlueprintJson(raw) {
  const text = String(raw || "").trim();
  if (!text) return null;
  let parsed = safeJson(text);
  if (parsed && typeof parsed === "object") return parsed;
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) parsed = safeJson(fence[1].trim());
  if (parsed && typeof parsed === "object") return parsed;
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start >= 0 && end > start) {
    parsed = safeJson(text.slice(start, end + 1));
    if (parsed && typeof parsed === "object") return parsed;
  }
  return null;
}

function normalizeBlueprint(raw, { instrumental = false } = {}) {
  if (!raw || typeof raw !== "object") return null;
  let master = String(raw.master_style_prompt || raw.enhanced_style_prompt || raw.enhancedStylePrompt || "").trim();
  let lyrics = instrumental
    ? ""
    : String(raw.structured_lyrics || raw.structuredLyrics || "").trim();
  if (!master) return null;
  if (master.length > MASTER_STYLE_MAX_CHARS) {
    master = master.slice(0, MASTER_STYLE_MAX_CHARS).trim();
  }
  return { structured_lyrics: lyrics, master_style_prompt: master };
}

async function geminiGenerateContent({
  apiKey,
  systemPrompt,
  userMessage,
  timeoutMs,
  jsonMode = false,
  temperature = 0.65,
  maxOutputTokens = 2048,
  disableThinking = false,
}) {
  const models = resolveProducerModels();
  const generationConfig = { temperature, maxOutputTokens };
  if (jsonMode) generationConfig.responseMimeType = "application/json";
  if (disableThinking) generationConfig.thinkingConfig = { thinkingBudget: 0 };

  const body = JSON.stringify({
    systemInstruction: { parts: [{ text: systemPrompt }] },
    contents: [{ role: "user", parts: [{ text: userMessage }] }],
    generationConfig,
  });

  let lastError = "unknown";
  for (const model of models) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const url = `${GEMINI_BASE}/models/${encodeURIComponent(model)}:generateContent`;
      const r = await fetch(url, {
        method: "POST",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": String(apiKey).trim(),
        },
        body,
      });
      const text = await r.text().catch(() => "");
      const data = safeJson(text);
      if (!r.ok) {
        lastError = data?.error?.message || text.slice(0, 200) || `HTTP ${r.status}`;
        continue;
      }
      return {
        ok: true,
        model,
        text: extractGeminiText(data),
        finishReason: String(data?.candidates?.[0]?.finishReason || "").trim(),
      };
    } catch (e) {
      lastError = e?.name === "AbortError" ? "timeout" : (e?.message || String(e));
    } finally {
      clearTimeout(timer);
    }
  }
  return { ok: false, error: lastError };
}

async function geminiGenerateJson({ apiKey, systemPrompt, userMessage, timeoutMs, maxOutputTokens = 4096 }) {
  return geminiGenerateContent({
    apiKey,
    systemPrompt,
    userMessage,
    timeoutMs,
    jsonMode: true,
    temperature: 0.65,
    maxOutputTokens,
    disableThinking: true,
  });
}

async function generateCoachReply({
  apiKey,
  session,
  step,
  nextStep,
  userAction = "",
  userMessage = "",
  conflict = null,
  wantsOptions = false,
  chipsVisible = false,
  chipOptions = [],
}) {
  if (!apiKey) return null;
  const payload = {
    current_step: step,
    step_phase: vocalStepPhase(session) || null,
    session_locked: sessionSnapshot(session),
    user_action: userAction || null,
    user_message: userMessage || null,
    next_step: nextStep,
    conflict_note: conflict?.message || null,
    user_asks_for_options: Boolean(wantsOptions),
    chips_visible: Boolean(chipsVisible),
    chip_options: chipsVisible ? chipOptions : [],
  };
  let result = await geminiGenerateContent({
    apiKey,
    systemPrompt: COACH_REPLY_SYSTEM_PROMPT,
    userMessage: JSON.stringify(payload),
    timeoutMs: COACH_TIMEOUT_MS,
    jsonMode: false,
    temperature: 0.82,
    maxOutputTokens: 640,
    disableThinking: true,
  });
  if (!result.ok) return null;
  let reply = normalizeCoachReplyText(result.text);
  if (result.finishReason === "MAX_TOKENS" && reply) {
    const cont = await geminiGenerateContent({
      apiKey,
      systemPrompt: COACH_REPLY_SYSTEM_PROMPT,
      userMessage: `Continue this producer reply from exactly where it stopped. Finish the sentence — no repetition, plain text only:\n"""${reply}"""`,
      timeoutMs: COACH_TIMEOUT_MS,
      jsonMode: false,
      temperature: 0.5,
      maxOutputTokens: 256,
      disableThinking: true,
    });
    if (cont.ok && cont.text) {
      reply = normalizeCoachReplyText(`${reply}${String(cont.text || "").trim()}`);
    }
  }
  if (!reply || isBrokenCoachReply(reply)) return null;
  return { reply, model: result.model };
}

function buildBlueprintInput(session) {
  const vocalLyriaHint = buildLyriaVocalProfile({
    vocalGender: session.vocalGender,
    clipVocalProfileId: session.clipVocalProfileId,
  });
  let referenceInspiration = "";
  if (session.referenceText && !session.referenceSkipped) {
    referenceInspiration = `User named this for mood only (do NOT repeat names in output): ${session.referenceText}`;
    if (session.referenceNote) {
      referenceInspiration += `. Producer note: ${session.referenceNote}`;
    }
  }

  return {
    genre: session.genre,
    mood: session.mood,
    tempo: session.tempo,
    bpm: session.bpm,
    instruments: session.instruments,
    lyrics_raw: session.lyrics,
    title: session.title,
    instrumental: session.instrumental,
    vocal_gender: session.vocalGender,
    vocal_character_id: session.clipVocalProfileId,
    vocal_lyria_hint: vocalLyriaHint,
    reference_inspiration: referenceInspiration,
    target: "full_length_song",
  };
}

async function buildProducerBlueprint({ apiKey, session }) {
  const input = buildBlueprintInput(session);
  let lastError = "blueprint_failed";
  for (let attempt = 0; attempt < 3; attempt++) {
    const result = await geminiGenerateJson({
      apiKey,
      systemPrompt: BLUEPRINT_SYSTEM_PROMPT,
      userMessage: JSON.stringify(input),
      timeoutMs: BLUEPRINT_TIMEOUT_MS + attempt * 8000,
      maxOutputTokens: 4096,
    });
    if (!result.ok) {
      lastError = result.error || lastError;
      continue;
    }
    const parsed = parseBlueprintJson(result.text);
    const normalized = normalizeBlueprint(parsed, { instrumental: session.instrumental });
    if (normalized) {
      return { ok: true, model: result.model, attempt: attempt + 1, ...normalized };
    }
    lastError = "invalid_blueprint_json";
  }
  return { ok: false, error: lastError };
}

function looksLikeReferenceMessage(message) {
  const t = String(message || "").trim();
  if (!t || t.length < 4 || isLyricsHelpRequest(t) || isLyricsRewindRequest(t)) return false;
  if (isLikelyChitchat(t)) return false;
  return (
    /\b(style|reference|like|similar|inspired|sound like|artist|song|track|steal|vibe)\b/i.test(t)
    || /(ستايل|ستيل|شبي|شبیه|مثل|زي|غنية|فنان|مرجع|بحب|على\s*غناء)/iu.test(t)
    || t.length >= 12
  );
}

function applyReferenceFromMessage(session, message) {
  const text = String(message || "").trim();
  if (!text || !looksLikeReferenceMessage(text)) return session;
  return {
    ...session,
    referenceText: text.slice(0, 300),
    referenceSkipped: false,
    referenceNote: "",
  };
}

function blueprintStatusReply(session, { error = "", attempt = 1, message = "", building = false } = {}) {
  const ar = userPrefersArabic(message || session.referenceText || session.lyrics);
  const refHint = session.referenceText
    ? (ar ? "مرجعك" : "your reference")
    : (ar ? "الجلسة" : "your session");
  if (building && attempt <= 1) {
    return ar
      ? `عم بجهّز الـ blueprint — عم أوّل الكلمات مع الصوت والإيقاع و${refHint} لستايل Lyria Pro...`
      : `Building your production blueprint — mapping lyrics, vocal, groove, and ${refHint} into a full Lyria Pro arrangement...`;
  }
  if (building && attempt === 2) {
    return ar
      ? "لسّا عم شغّل على الـ blueprint — عم ضبط الـ master style prompt والـ sections..."
      : "Still writing the blueprint — locking section structure and the master style prompt...";
  }
  if (ar) {
    return `ما قدرت أكمل الـ blueprint هلّق${error ? ` (${error})` : ""}. جرّب Retry blueprint — أو عدّل ${refHint} وابعتلي من جديد.`;
  }
  return `Couldn't finish the blueprint yet${error ? ` (${error})` : ""}. Tap Retry blueprint — or re-send ${refHint} and I'll rebuild it.`;
}

async function explainReferenceStyle({ apiKey, referenceText }) {
  const prompt = `The user wants style inspiration from: "${String(referenceText || "").slice(0, 200)}"

Reply in 2–3 short sentences for the user explaining what musical elements you'll take inspiration from (tempo class, arrangement density, vocal tone, instrumentation). 
Say clearly this is an original arrangement inspired by the style — not a copy.
Do NOT include the artist or song name in your reply — use generic descriptors only.
Return plain text only.`;

  const result = await geminiGenerateContent({
    apiKey,
    systemPrompt: "You are Nabad Producer, a friendly music coach.",
    userMessage: prompt,
    timeoutMs: COACH_TIMEOUT_MS,
    jsonMode: false,
    temperature: 0.7,
    maxOutputTokens: 200,
  });
  if (!result.ok) {
    return `I'll translate that into original arrangement cues — tempo feel, layers, and vocal tone — without copying any recording.`;
  }
  return String(result.text || "").trim().slice(0, 500)
    || `I'll translate that into original arrangement cues — tempo feel, layers, and vocal tone — without copying any recording.`;
}

async function generateProducerLyricsAssist({ apiKey, session, message = "", mode = "continue" } = {}) {
  const existing = String(session.lyrics || "").trim();
  const writeMode = mode === "write" || (!existing && /\b(write|اكتب|كتبلي)\b/iu.test(String(message || "")));
  const prompt = {
    mode: writeMode ? "write" : "continue",
    user_note: String(message || "").trim() || null,
    existing_lyrics: existing || null,
    genre: session.genre,
    mood: session.mood,
    tempo: session.tempo,
    bpm: session.bpm,
    vocal: session.instrumental ? "instrumental" : session.vocalGender,
    instruments: session.instruments,
  };
  const systemPrompt = `You are Nabad Producer — an expert Arabic/English songwriter in a studio session.

Return ONLY song lyrics with English structure tags: [Intro], [Verse 1], [Pre-Chorus], [Chorus], [Verse 2], [Bridge], [Outro].
- If mode is continue, preserve every existing user line exactly — only add new lines to complete the song arc (~3 min).
- If mode is write, create original lyrics matching genre/mood/tempo/vocal/instruments.
- Arabic, English, or mixed — match what the user used.
- No commentary outside the lyrics. No markdown fences.`;

  const result = await geminiGenerateContent({
    apiKey,
    systemPrompt,
    userMessage: JSON.stringify(prompt),
    timeoutMs: COACH_TIMEOUT_MS,
    jsonMode: false,
    temperature: 0.85,
    maxOutputTokens: 2048,
    disableThinking: true,
  });
  if (!result.ok) return { ok: false, error: result.error || "lyrics_assist_failed" };
  let lyrics = String(result.text || "").trim().replace(/^```[\s\S]*?```$/gm, "").trim();
  if (!lyrics) return { ok: false, error: "empty_lyrics" };
  if (lyrics.length > 4000) lyrics = lyrics.slice(0, 4000).trim();
  return { ok: true, lyrics, model: result.model };
}

function applyTextToStep(session, step, message) {
  const text = String(message || "").trim();
  if (!text) return session;
  if (step === "lyrics") {
    return { ...session, lyrics: text.slice(0, 4000), lyricsDone: false };
  }
  if (step === "reference") {
    if (isLyricsRewindRequest(text) || isLyricsHelpRequest(text)) {
      return {
        ...session,
        lyricsDone: false,
        referenceText: "",
        referenceNote: "",
        referenceSkipped: false,
      };
    }
    return { ...session, referenceText: text.slice(0, 300), referenceSkipped: false, referenceNote: "" };
  }
  if (step === "blueprint") {
    return applyReferenceFromMessage(session, text);
  }
  if (step === "instruments") return { ...session, instruments: text.slice(0, 200) };
  if (step === "genre") return { ...session, genre: text.slice(0, 120) };
  if (step === "mood") return { ...session, mood: text.slice(0, 120) };
  if (step === "tempo") {
    return { ...session, tempo: text.slice(0, 80), bpm: session.bpm ?? null };
  }
  if (step === "vocal") {
    if (/instrumental|بدون غناء|موسيقى فقط/i.test(text)) {
      return { ...session, instrumental: true, vocalGender: "", lyrics: "", vocalCharacterDone: true };
    }
    const genderAction = matchMessageToActionId("vocal", text);
    if (genderAction && genderAction !== "vocal_instrumental") {
      return applyAction(session, genderAction);
    }
    if (genderAction === "vocal_instrumental") {
      return applyAction(session, genderAction);
    }
    const normalized = normalizeVocalGenderValue(text);
    if (normalized) {
      return {
        ...session,
        vocalGender: normalized,
        instrumental: false,
        vocalCharacterDone: false,
        clipVocalProfileId: "",
      };
    }
    return session;
  }
  return session;
}

/**
 * One chat turn — patch session, return coach UI payload.
 */
async function producerChatTurn({ apiKey, session: rawSession, message = "", actionId = "" } = {}) {
  let session = normalizeSession(rawSession);
  let lyricsAssistReply = "";

  if (actionId === "vocal_char_skip") {
    session = { ...session, clipVocalProfileId: "", vocalCharacterDone: true };
  } else if (actionId === "blueprint_retry") {
    // force blueprint rebuild
  } else if (actionId) {
    session = applyAction(session, actionId);
  }

  const stepBefore = computeNextStep(session);
  const wantsOptions = message && !actionId && isAskingForOptions(message);
  const chitchat = message && !actionId && !wantsOptions && isLikelyChitchat(message);
  const lyricsHelp = Boolean(
    actionId === "lyrics_help_write"
    || actionId === "lyrics_help_continue"
    || (message && !actionId && isLyricsHelpRequest(message)),
  );
  const lyricsRewind = Boolean(message && !actionId && isLyricsRewindRequest(message));

  if (message && !actionId && !chitchat && !wantsOptions) {
    if (isLyricsAdvanceIntent(message) && (stepBefore === "lyrics" || String(session.lyrics || "").trim())) {
      session = { ...session, lyricsDone: true };
    } else if (stepBefore === "blueprint" && looksLikeReferenceMessage(message)) {
      session = applyReferenceFromMessage(session, message);
    } else {
      session = applyMessageToSession(session, stepBefore, message);
    }
  }

  if (actionId === "blueprint_retry") {
    session = { ...session, blueprintAttempts: 0 };
  }

  if (lyricsHelp || lyricsRewind) {
    session = {
      ...session,
      lyricsDone: false,
      referenceText: "",
      referenceNote: "",
      referenceSkipped: false,
    };
    if (apiKey && lyricsHelp) {
      const mode = actionId === "lyrics_help_write" ? "write" : "continue";
      const assisted = await generateProducerLyricsAssist({ apiKey, session, message, mode });
      if (assisted.ok && assisted.lyrics) {
        session = { ...session, lyrics: assisted.lyrics, lyricsDone: false };
        const intro = userPrefersArabic(message)
          ? "هاي مسودة الكلمات — عدّلها براحتك، ووقت ما تخلص اضغط Done · continue:"
          : "Here's a lyrics draft — edit anything you want, then tap Done · continue when ready:";
        lyricsAssistReply = `${intro}\n\n${assisted.lyrics}`;
      } else {
        lyricsAssistReply = userPrefersArabic(message)
          ? "ما قدرت أكمّل الكلمات هلّق — جرّب الصق اللي عندك أو اضغط Write lyrics for me."
          : "I couldn't draft lyrics just now — paste what you have or tap Write lyrics for me.";
      }
    } else if (lyricsRewind) {
      lyricsAssistReply = userPrefersArabic(message)
        ? "تمام — منرجع للكلمات. الصق أو اكتب اللي عندك، أو اطلب مني أكمّلها."
        : "Got it — back to lyrics. Paste what you have, or ask me to continue writing.";
    }
  }

  if (actionId === "reference_skip" || (stepBefore === "reference" && actionId === "reference_skip")) {
    session.referenceSkipped = true;
  }

  const refStep = computeNextStep(session) === "reference" || stepBefore === "reference" || stepBefore === "blueprint";
  if (refStep && session.referenceText && !session.referenceNote && apiKey && !lyricsHelp && !lyricsRewind) {
    session.referenceNote = await explainReferenceStyle({ apiKey, referenceText: session.referenceText });
  }

  const conflict = detectConflict(session);
  let step = computeNextStep(session);

  if (actionId === "blueprint_edit_lyrics") {
    step = "lyrics";
  }
  if (lyricsHelp || lyricsRewind) {
    step = "lyrics";
  }

  let blueprint = null;
  let sessionReady = false;

  if (step === "blueprint") {
    if (!session.lyricsDone && !session.instrumental && !String(session.lyrics || "").trim()) {
      step = "lyrics";
    } else if (apiKey) {
      const attemptBase = Number(session.blueprintAttempts) || 0;
      session = { ...session, blueprintAttempts: attemptBase + 1 };
      const built = await buildProducerBlueprint({ apiKey, session });
      if (built.ok) {
        blueprint = {
          structured_lyrics: built.structured_lyrics,
          master_style_prompt: built.master_style_prompt,
          model: built.model,
        };
        sessionReady = true;
        session = { ...session, blueprintAttempts: 0 };
      } else {
        const failReply = blueprintStatusReply(session, {
          error: String(built.error || "").slice(0, 80),
          attempt: session.blueprintAttempts,
          message,
        });
        return {
          ok: true,
          session,
          step: "blueprint",
          stepIndex: STEPS.indexOf("blueprint") + 1,
          stepTotal: STEPS.length,
          reply: lyricsAssistReply || failReply,
          coachModel: null,
          quickReplies: [
            { id: "blueprint_retry", label: "Retry blueprint" },
            ...(session.referenceText ? [] : [{ id: "reference_skip", label: "Skip reference · build now" }]),
          ],
          showQuickReplies: true,
          conflict,
          blueprint: null,
          sessionReady: false,
          blueprintStatus: "failed",
        };
      }
    }
  }

  let quickReplies = resolveVisibleQuickReplies({
    step,
    session,
    chitchat,
    wantsOptions,
    sessionReady,
  });
  if (conflict?.suggestIds?.length && quickReplies.length) {
    quickReplies = conflict.suggestIds
      .map((id) => [...QUICK_REPLIES.tempo].find((q) => q.id === id))
      .filter(Boolean)
      .concat(quickReplies.slice(0, 2));
  }

  const userActionLabel = actionLabelFromId(actionId);
  const coachStep = step;
  const nextStep = step;
  const chipsVisible = quickReplies.length > 0;
  const chipOptions = chipsVisible ? chipLabelsForStep(step, session) : [];
  let coachReply = null;
  if (apiKey && (step !== "blueprint" || sessionReady)) {
    coachReply = await generateCoachReply({
      apiKey,
      session,
      step: coachStep,
      nextStep,
      userAction: userActionLabel,
      userMessage: !actionId ? String(message || "").trim() : "",
      conflict,
      wantsOptions,
      chipsVisible,
      chipOptions,
    });
  }

  const fallbackReply = conflict?.message || stepCoachCopy(step, session);
  let reply = lyricsAssistReply
    || ((coachReply?.reply && !isBrokenCoachReply(coachReply.reply))
      ? coachReply.reply
      : ((chitchat && chitchatFallbackReply(message)) || fallbackReply));
  if (wantsOptions && (!coachReply?.reply || isBrokenCoachReply(coachReply?.reply))) {
    reply = optionsRevealReply(step, message);
  }

  return {
    ok: true,
    session,
    step,
    stepIndex: STEPS.indexOf(step) + 1,
    stepTotal: STEPS.length,
    reply,
    coachModel: coachReply?.model || null,
    quickReplies,
    showQuickReplies: chipsVisible,
    conflict,
    blueprint,
    sessionReady,
  };
}

function sessionToGenerateBody(session, blueprint) {
  return {
    prompt: blueprint?.structured_lyrics || session.lyrics,
    style: session.genre,
    instruments: session.instruments,
    title: session.title || session.genre || "Nabad Producer",
    instrumental: session.instrumental,
    vocalGender: session.vocalGender,
    clipVocalProfileId: session.clipVocalProfileId,
    nabadProducer: "1",
    structuredLyrics: blueprint?.structured_lyrics || "",
    masterStylePrompt: blueprint?.master_style_prompt || "",
    bpm: session.bpm,
    mood: session.mood,
  };
}

module.exports = {
  NABAD_PRODUCER_CREDIT_COST,
  STEPS,
  nabadProducerEnabled,
  emptySession,
  normalizeSession,
  producerChatTurn,
  buildProducerBlueprint,
  sessionToGenerateBody,
  buildBlueprintInput,
};
