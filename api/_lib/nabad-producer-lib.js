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
    vocalGender: String(s.vocalGender || "").trim().slice(0, 16),
    clipVocalProfileId: String(s.clipVocalProfileId || "").trim().slice(0, 64),
    instruments: String(s.instruments || "").trim().slice(0, 200),
    lyrics: String(s.lyrics || "").trim().slice(0, 4000),
    referenceText: String(s.referenceText || "").trim().slice(0, 300),
    referenceNote: String(s.referenceNote || "").trim().slice(0, 600),
    title: String(s.title || "").trim().slice(0, 120),
    instrumental: Boolean(s.instrumental),
    referenceSkipped: Boolean(s.referenceSkipped),
    vocalCharacterDone: Boolean(s.vocalCharacterDone),
  };
}

function computeNextStep(session) {
  if (!session.genre) return "genre";
  if (!session.mood) return "mood";
  if (!session.tempo && session.bpm == null) return "tempo";
  if (!session.instrumental && !session.vocalGender) return "vocal";
  if (!session.instrumental && session.vocalGender && !session.vocalCharacterDone) return "vocal";
  if (!session.instruments) return "instruments";
  if (!session.instrumental && !session.lyrics) return "lyrics";
  if (!session.referenceSkipped && !session.referenceText && !session.referenceNote) return "reference";
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
    return { ...session, lyrics: "" };
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
  const copies = {
    genre: "Let's build your full song together. What genre should we start from?",
    mood: `Great — ${session.genre}. What mood should this track carry?`,
    tempo: "Pick an energy / tempo feel for the arrangement.",
    vocal: session.vocalGender && !session.vocalCharacterDone
      ? "Pick a vocal character — or skip for a default lead vocal."
      : "Who carries the vocal — or should this be instrumental?",
    instruments: "Any core instruments, or should I choose for the genre?",
    lyrics: session.instrumental
      ? "Instrumental track — paste a title idea or tap Skip if you want me to name it."
      : "Paste your lyrics here — I'll structure them for the full song without changing your words.",
    reference: "Optional: name a song or artist for *style inspiration* (text only). I'll describe the vibe — never copy a recording.",
    blueprint: "Here's your production blueprint. Review it, then generate when you're ready.",
  };
  return copies[step] || "Tell me what you'd like to adjust.";
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
  return parts.map((p) => String(p?.text || "").trim()).filter(Boolean).join("\n").trim();
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

async function geminiGenerateJson({ apiKey, systemPrompt, userMessage, timeoutMs }) {
  const models = resolveProducerModels();
  const body = JSON.stringify({
    systemInstruction: { parts: [{ text: systemPrompt }] },
    contents: [{ role: "user", parts: [{ text: userMessage }] }],
    generationConfig: {
      temperature: 0.65,
      responseMimeType: "application/json",
    },
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
      return { ok: true, model, text: extractGeminiText(data) };
    } catch (e) {
      lastError = e?.name === "AbortError" ? "timeout" : (e?.message || String(e));
    } finally {
      clearTimeout(timer);
    }
  }
  return { ok: false, error: lastError };
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
  const result = await geminiGenerateJson({
    apiKey,
    systemPrompt: BLUEPRINT_SYSTEM_PROMPT,
    userMessage: JSON.stringify(input),
    timeoutMs: BLUEPRINT_TIMEOUT_MS,
  });
  if (!result.ok) {
    return { ok: false, error: result.error || "blueprint_failed" };
  }
  const parsed = parseBlueprintJson(result.text);
  const normalized = normalizeBlueprint(parsed, { instrumental: session.instrumental });
  if (!normalized) {
    return { ok: false, error: "invalid_blueprint_json", model: result.model };
  }
  return { ok: true, model: result.model, ...normalized };
}

async function explainReferenceStyle({ apiKey, referenceText }) {
  const prompt = `The user wants style inspiration from: "${String(referenceText || "").slice(0, 200)}"

Reply in 2–3 short sentences for the user explaining what musical elements you'll take inspiration from (tempo class, arrangement density, vocal tone, instrumentation). 
Say clearly this is an original arrangement inspired by the style — not a copy.
Do NOT include the artist or song name in your reply — use generic descriptors only.
Return plain text only.`;

  const result = await geminiGenerateJson({
    apiKey,
    systemPrompt: "You are Nabad Producer, a friendly music coach.",
    userMessage: prompt,
    timeoutMs: COACH_TIMEOUT_MS,
  });
  if (!result.ok) {
    return `I'll translate that into original arrangement cues — tempo feel, layers, and vocal tone — without copying any recording.`;
  }
  return String(result.text || "").trim().slice(0, 500)
    || `I'll translate that into original arrangement cues — tempo feel, layers, and vocal tone — without copying any recording.`;
}

function applyTextToStep(session, step, message) {
  const text = String(message || "").trim();
  if (!text) return session;
  if (step === "lyrics") return { ...session, lyrics: text.slice(0, 4000) };
  if (step === "reference") return { ...session, referenceText: text.slice(0, 300), referenceSkipped: false };
  if (step === "instruments") return { ...session, instruments: text.slice(0, 200) };
  if (step === "genre") return { ...session, genre: text.slice(0, 120) };
  if (step === "mood") return { ...session, mood: text.slice(0, 120) };
  return session;
}

/**
 * One chat turn — patch session, return coach UI payload.
 */
async function producerChatTurn({ apiKey, session: rawSession, message = "", actionId = "" } = {}) {
  let session = normalizeSession(rawSession);

  if (actionId === "vocal_char_skip") {
    session = { ...session, clipVocalProfileId: "", vocalCharacterDone: true };
  } else if (actionId === "blueprint_retry") {
    // force blueprint rebuild
  } else if (actionId) {
    session = applyAction(session, actionId);
  }

  const stepBefore = computeNextStep(session);
  if (message && !actionId) {
    session = applyTextToStep(session, stepBefore, message);
  }

  if (actionId === "reference_skip" || (stepBefore === "reference" && actionId === "reference_skip")) {
    session.referenceSkipped = true;
  }

  if (stepBefore === "reference" && session.referenceText && !session.referenceNote && apiKey) {
    session.referenceNote = await explainReferenceStyle({ apiKey, referenceText: session.referenceText });
  }

  const conflict = detectConflict(session);
  let step = computeNextStep(session);

  if (actionId === "blueprint_edit_lyrics") {
    step = "lyrics";
  }

  let blueprint = null;
  let sessionReady = false;

  if (step === "blueprint") {
    if (apiKey) {
      const built = await buildProducerBlueprint({ apiKey, session });
      if (built.ok) {
        blueprint = {
          structured_lyrics: built.structured_lyrics,
          master_style_prompt: built.master_style_prompt,
          model: built.model,
        };
        sessionReady = true;
      }
    }
    if (!blueprint) {
      return {
        ok: false,
        error: "blueprint_failed",
        session,
        step,
        reply: "I couldn't build the blueprint right now — try again in a moment.",
        quickReplies: [{ id: "blueprint_retry", label: "Retry blueprint" }],
        conflict,
        blueprint: null,
        sessionReady: false,
      };
    }
  }

  let quickReplies = quickRepliesForStep(step, session);
  if (conflict?.suggestIds?.length) {
    quickReplies = conflict.suggestIds
      .map((id) => [...QUICK_REPLIES.tempo].find((q) => q.id === id))
      .filter(Boolean)
      .concat(quickReplies.slice(0, 2));
  }

  if (step === "lyrics" && session.instrumental) {
    quickReplies = [{ id: "reference_skip", label: "Skip · no lyrics needed" }];
  }

  if (step === "blueprint" && sessionReady) {
    quickReplies = QUICK_REPLIES.blueprint;
  }

  return {
    ok: true,
    session,
    step,
    stepIndex: STEPS.indexOf(step) + 1,
    stepTotal: STEPS.length,
    reply: conflict?.message || stepCoachCopy(step, session),
    quickReplies,
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
