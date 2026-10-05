/**
 * Gemini text middleware — enriches Nabad Clip / Template Spark prompts before Lyria.
 * Opt-in via CLIP_GEMINI_PRODUCER_ENABLED=1 (staging preview first).
 */

const { buildLyriaVocalProfile, clipVocalProfileById, sanitizeLyriaLyricsForSinging, normalizeLyriaArrangementLines } = require("./lyria-upstream");
const { stripInlinePunctuationFromLyrics } = require("./sung-lyrics-punctuation");

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta";
const PRODUCER_TIMEOUT_MS = Number(process.env.CLIP_GEMINI_PRODUCER_TIMEOUT_MS || 15000);
const SONG_PRODUCER_TIMEOUT_MS = Number(process.env.SONG_GEMINI_PRODUCER_TIMEOUT_MS || 25000);
const ENHANCED_STYLE_MAX_CHARS = 1200;
const SONG_ENHANCED_STYLE_MAX_CHARS = 2000;

const CLIP_PRODUCER_SYSTEM_PROMPT = `You are an expert audio engineer and music producer specializing in ultra-short, high-impact music clips (~28–30 seconds) for NabadAi — mobile hook clips, not full songs.

Transform the user's raw inputs into a production-ready brief for Google Lyria. Return ONLY valid JSON with exactly two string fields. No markdown, no code fences, no commentary, no extra keys.

OUTPUT SCHEMA:
{
  "structured_lyrics": "<string>",
  "enhanced_style_prompt": "<string>"
}

=== structured_lyrics ===
- If idea_brief is set (prompt-to-song): WRITE original singable lyrics that fulfill the brief. Do NOT copy the brief, challenge instructions, line counts, or phrases like "Write a clip" into sung lines.
- Else if lyrics_raw is set: the user provided lyrics — preserve their words exactly (Arabic, English, or mixed). Do NOT translate. Do NOT rewrite lines. You may only trim if clearly too long for ~28s.
- Structure tags MUST be in English only, on their own lines, e.g.:
  [Quick Catchy Intro]
  [Main Hook / Chorus Drop]
  [Punchy Outro]
- Clip arc: optional micro-intro → main hook/chorus (required) → punchy outro. NOT a full song (no second verse, bridge, or long intro).
- Fit ~28 seconds at natural vocal pace (~4–10 short lines depending on language).
- NEVER put timing stamps, BPM, or production instructions inside structured_lyrics — Lyria may sing them.
- End on a complete phrase — never mid-word or mid-sentence.
- If instrumental is true, return "".

=== enhanced_style_prompt ===
Musical brief for Lyria Clip. Target 500–900 characters — a real song sketch, not a stacked plugin list.

Include when inferable:
1. Duration: "~28 second clip".
2. Tempo: exact BPM + feel (dabke ~120–130, ballad ~70–90, pop ~100–115).
3. Key / scale — honor song_key if provided.
4. Genre + mood in producer language.
5. Arrangement as a composed hook (pick ONE of each — do not stack):
   - A lead melody a human could hum after one listen.
   - Simple chord movement (not a one-chord loop).
   - One drum identity (kit OR dabke percussion — not 808 + trap hats + folk drums).
   - One harmonic bed (keys OR guitar OR oud).
   - Bass that follows the chords. Skip generic 808 / "ear-candy" / risers unless the genre is trap.
6. Hook dynamics: motif in the first 2 seconds, chorus peak, clean last phrase.
7. Vocal: honor vocal_gender, vocal_character_id, and vocal_lyria_hint.
   Default male (warm / empty / unknown character): modern pop TENOR — mid-range, on-pitch, radio-ready. Never default to baritone, bass, rasp, or jabali folk.
   Default female: warm modern pop alto.
   Folk / grit / deep / soft characters only when vocal_character_id names them.
   Conversational close-mic; belt only if the character or genre needs it.
8. Mix: vocal forward, instruments support the melody, leave space.

Avoid: "ear-candy", stacked 808+pads+plucks, ringtone / MIDI-demo language, stadium crowd, vague cinematic filler with no melody.

Hard limits: one optional verse + one chorus; hook-focused compact clip.

Dialect: if dialect_hint is set (Levantine, Gulf, Egyptian, etc.), reflect in vocal color and rhythm — tasteful, not stereotyped.

If style_tags imply visual mood (sunset, party, melancholy), translate to sonic texture (harmony + melody), not extra layers.

Be specific ("palm-muted guitar stabs", "mijwiz hook") — avoid vague filler alone.

Return ONLY the JSON object.`;

const ELEVENLABS_SONG_PRODUCER_SYSTEM_PROMPT = `You are an expert music producer for NabadAi full-length songs (~2–3 minutes) for ElevenLabs Music v2 composition plans.

Transform the user's raw inputs into a section-by-section production plan. Return ONLY valid JSON. No markdown, no code fences, no commentary.

OUTPUT SCHEMA:
{
  "structured_lyrics": "<string>",
  "enhanced_style_prompt": "<string>",
  "composition_chunks": [
    {
      "section": "[Intro]",
      "lines": ["lyric line 1", "lyric line 2"],
      "duration_seconds": 12,
      "positive_styles": ["English style tag", "120 BPM", "C minor", "warm male vocal"],
      "negative_styles": ["shouting", "a cappella"]
    }
  ]
}

=== composition_chunks (PRIMARY — required, 4–8 chunks) ===
- Ordered song sections for ElevenLabs music_v2. Sum of duration_seconds ≈ target_length_seconds (±10%).
- section: English tag in brackets, e.g. [Intro], [Verse 1], [Pre-Chorus], [Chorus], [Verse 2], [Bridge], [Final Chorus], [Outro].
- lines: if idea_brief is set, WRITE original lyric lines for that section (do not sing the brief or instructions). Else use the user's lyric lines for that section ONLY — preserve Arabic/English/mixed exactly. Do NOT translate or rewrite. Max ~8 lines per section, max 200 chars per line.
- duration_seconds: integer 3–120 per chunk. Intro/outro shorter; chorus often longer.
- positive_styles: 6–10 English tags per chunk — genre, BPM (REQUIRED same number every chunk, e.g. "108 BPM"), key, instrumentation, vocal character, energy for THIS section. First chunk sets overall genre/tone; INTRO must differ by genre (pad swell, riff, drop-in, vocal cold-open — not the same pickup every song).
- negative_styles: 2–6 English tags to avoid unwanted sounds in THIS section (e.g. chorus: ["a cappella", "mumbled lyrics"]; instrumental intro: ["vocals", "lyrics"]).
- Section dynamics: varied intro → fuller verses → peak chorus → contrasting bridge → resolved outro.
- Lyric density vs duration: duration_seconds must fit the lyric line count at the stated BPM (~5–8 beats per line). Allow room for expressive phrasing; split overcrowded lines instead of cramming.
- If instrumental is true: lines may be empty; use {instrumental} direction in section text via empty lines + styles that exclude vocals; every chunk negative_styles must include "vocals" and "lyrics".

=== VOCAL PERFORMANCE (critical — every vocal chunk) ===
- Honor vocal_gender from input: "f" → expressive female vocal with clear tone; "m" → warm male TENOR pop vocal (NOT deep bass, NOT baritone).
- Merge vocal_lyria_hint into positive_styles when present.
- EVERY vocal chunk positive_styles MUST include the exact BPM tag (e.g. "108 BPM") plus: "on-pitch accurate vocals", "expressive vocal performance", "natural lyrical phrasing", "clear diction".
- Verse / pre-chorus: emotional storytelling, breath and dynamics, melody-led singing — still on groove.
- Chorus / hook: "powerful chorus lift", "sing-along hook", "full-voice energy" — allow melisma/vibrato when genre fits (R&B, Arabic, ballad).
- EVERY vocal chunk negative_styles MUST include only: "off-key vocals", "pitchy singing", "mumbled lyrics", "spoken word".
- Arabic lyrics are fine — still use English tags for all styles. Lines can breathe; honor dialect ornamentation when dialect_hint suggests it.

=== HUM TRACK (when hum_track is true) ===
- User hummed a melody to be rendered as ONE solo instrument (instrumental is true). Do NOT treat the hum as vocals to sing or replay.
- enhanced_style_prompt: solo instrument only, translate hum to pitch/rhythm on that instrument, no voice/humming in output.
- composition_chunks: optional; server may bypass chunks for hum track. If you output chunks: 2–3 max, empty lines, negative_styles must include vocals, humming, voice, speech.

=== VOCAL REFERENCE (when has_vocal_reference is true) ===
- User uploaded a hum/voice clip — match singer timbre and melodic shape; intro section should NOT mimic the reference pickup verbatim.
- Still output full composition_chunks (4–8 sections); the server attaches the reference to vocal sections (intro often without reference).
- Give enough duration per section for natural phrasing on the reference melody.
- First vocal section after intro: "match reference singer timbre and melodic shape". Later sections: section-specific energy tags, not duplicate intro pickup language.

=== structured_lyrics ===
- Concatenation of all sections for display: section tag on its own line, then lines. Must match composition_chunks content.
- If instrumental is true, return "".

=== enhanced_style_prompt ===
- Global fallback brief (800–1200 chars): tempo, key, genre, vocal character, mix — used if chunk styles need a safety net.
- English only. No artist or band names.

Dialect: if dialect_hint is set, reflect in vocal color and rhythm via positive_styles — tasteful, not stereotyped.
Be specific in styles — avoid vague filler alone.

Return ONLY the JSON object.`;

const LYRIA_SONG_PRODUCER_SYSTEM_PROMPT = `You are an expert music producer for NabadAi full-length songs powered by Google Lyria 3.5.

Lyria hard cap: about 180 seconds (3 minutes). Too many sections or too many lyric lines makes the model rush and lose the groove — prefer FEWER sung words and a repeatable chorus hook.

Transform the user's raw inputs into a production-ready brief for Lyria. Return ONLY valid JSON with exactly three string fields. No markdown, no code fences, no commentary, no extra keys.

OUTPUT SCHEMA:
{
  "structured_lyrics": "<string>",
  "arrangement": "<string>",
  "enhanced_style_prompt": "<string>"
}

=== structured_lyrics (SUNG WORDS ONLY) ===
- If idea_brief is set (prompt-to-song): WRITE original catchy singable lyrics that fulfill the brief. Do NOT copy the brief, challenge instructions, line counts, or phrases like "Write a song" / "Create a" into sung lines.
- Else if lyrics_raw is set: preserve the user's words and meaning. You MAY trim extra sections (Intro/Pre-Chorus/Outro) to fit ~180s — do NOT add new sections the user did not write.
- COMPACT structure only (max ~18 sung lines total):
  [Verse 1] — up to 4 lines
  [Chorus] — up to 4 lines (sticky hook — repeat verbatim in second chorus)
  [Verse 2] — up to 4 lines
  [Chorus] — same hook lines
  Optional [Bridge] — up to 2 lines ONLY if needed (skip otherwise)
- Do NOT use [Intro], [Pre-Chorus], [Outro], [Final Chorus], or a third verse unless lyrics_raw already contains them — then trim, do not expand.
- Structure tags MUST be plain English section labels ONLY — NO timestamps inside tags.
- NEVER put timing, BPM, dialect notes, style directions, or "Create a song…" inside structured_lyrics — Lyria will sing them.
- NO commas, semicolons, colons, or bullets inside lyric lines — Lyria reads them like tashkeel; use line breaks only.
- Each sung line: ONLY 3–5 words (about 4–10 speakable syllables). Split longer thoughts into extra lines — never one long sentence per line.
- One hum-able chorus hook. Honor target_length_seconds — less lyric text is better than cramming.
- End on a complete phrase — never mid-word or mid-sentence.
- If instrumental is true, return "".

=== arrangement (TIMING AS ARRANGEMENT LINES — NOT LYRICS) ===
- REQUIRED for full songs. Use Google Lyria timing format, one section per line. Keep 5–7 blocks max for ~180s:
  [0:00 - 0:35] Verse 1: sparse groove, leave space for vocal
  [0:35 - 1:05] Chorus: hook melody lands, fuller drums
  [1:05 - 1:35] Verse 2: same pocket, new words
  [1:35 - 2:05] Chorus: repeat hook, slightly bigger
  [2:05 - 2:25] Optional bridge or instrumental breath (omit if no bridge lyrics)
  [2:25 - target_end] Final chorus hook + clean resolve (no extra lyric sections)
- Times must add up near target_length_seconds (±15s). Instrumental: still provide arrangement, no vocal cues.
- Describe instruments / dynamics / hook placement — NEVER put sung lyric words here.

=== ARABIZI (when script_format is "arabizi") ===
- Lyrics are Arabizi: colloquial Arabic in Latin letters for Lyria — NOT English lyrics.
- Preserve the user's Arabizi spelling exactly — do NOT translate to English or Arabic script.
- enhanced_style_prompt MUST include vocal direction matching dialect_hint (e.g. native Egyptian Masri or Lebanese Beirut), "authentic colloquial Arabic pronunciation", "Arabizi phonetic lyrics — sing as Arabic NOT English".

=== enhanced_style_prompt ===
Rich sonic brief for Lyria. Target 900–1800 characters. Prioritize CATCHY melodic hooks and clear groove — not a stacked plugin list.

Include when inferable:
1. Duration: match target_length_seconds (e.g. "~180 second full song").
2. Tempo: exact BPM + feel (dabke ~120–130, ballad ~70–90, pop ~100–115).
3. Key / scale — honor song_key if provided.
4. Genre + mood in producer language — concrete and vivid.
5. ONE memorable melodic hook a listener can hum; verse/chorus contrast; pocketed drums.
6. Layers: pick a clear lead + harmonic bed + bass + drum identity (do not stack every instrument).
7. Dynamics: sparse intro → fuller chorus → breathing bridge → resolved outro.
8. Vocal: gender, character, close-mic conversational delivery from inputs; merge vocal_lyria_hint if present.
9. Arabic/dialect: honor dialect_hint for vocabulary and vocal color when present.

Be specific ("palm-muted guitar stabs", "808 on downbeats", "mijwiz hook") — avoid vague filler.

Return ONLY the JSON object.`;

function safeJson(txt) {
  try {
    return JSON.parse(txt);
  } catch {
    return null;
  }
}

function clipGeminiProducerEnabled() {
  const v = String(process.env.CLIP_GEMINI_PRODUCER_ENABLED || "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

/** Admin Settings toggle can override env for A/B (`geminiProducer: "0"|"1"`). */
function resolveGeminiProducerEnabled(body, isAdmin = false) {
  if (isAdmin) {
    const raw = body?.geminiProducer;
    if (raw === "0" || raw === 0 || raw === false || raw === "false") return false;
    if (raw === "1" || raw === 1 || raw === true || raw === "true") return true;
  }
  return clipGeminiProducerEnabled();
}

const PRODUCER_MODEL_PREFERRED = [
  "gemini-3.6-flash",
  "gemini-3.5-flash",
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite",
];

function resolveProducerModels() {
  const override = String(process.env.CLIP_GEMINI_PRODUCER_MODEL || "").trim();
  if (override) return [override];
  return PRODUCER_MODEL_PREFERRED;
}

function extractGeminiText(data) {
  const parts = data?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) return "";
  return parts.map((p) => String(p?.text || "").trim()).filter(Boolean).join("\n").trim();
}

function parseProducerJson(raw) {
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

function normalizeProducerOutput(raw, { instrumental = false, maxStyleChars = ENHANCED_STYLE_MAX_CHARS } = {}) {
  if (!raw || typeof raw !== "object") return null;
  let enhanced = String(
    raw.enhanced_style_prompt ||
      raw.enhancedStylePrompt ||
      raw.master_style_prompt ||
      raw.masterStylePrompt ||
      "",
  ).trim();
  let structured = instrumental
    ? ""
    : String(raw.structured_lyrics || raw.structuredLyrics || "").trim();
  let arrangement = String(raw.arrangement || raw.arrangement_lines || raw.arrangementLines || "").trim();
  if (!enhanced && !arrangement) return null;
  if (!enhanced && arrangement) {
    enhanced = "Catchy full-band arrangement with a memorable melodic hook and clear verse/chorus contrast.";
  }
  const cap = Math.max(400, Number(maxStyleChars) || ENHANCED_STYLE_MAX_CHARS);
  if (enhanced.length > cap) {
    enhanced = enhanced.slice(0, cap).trim();
  }
  // Keep sung lyrics clean — strip instruction / timing bleed before Lyria.
  if (structured) {
    structured = stripInlinePunctuationFromLyrics(sanitizeLyriaLyricsForSinging(structured));
  }
  if (arrangement) {
    arrangement = normalizeLyriaArrangementLines(arrangement);
  }
  const out = {
    structured_lyrics: structured,
    enhanced_style_prompt: enhanced,
  };
  if (arrangement) out.arrangement = arrangement;
  return out;
}

function normalizeElevenProducerChunk(raw, fallbackStyleTags = []) {
  if (!raw || typeof raw !== "object") return null;
  const sectionRaw = String(raw.section || raw.tag || raw.section_name || "").trim();
  if (!sectionRaw) return null;
  const section = sectionRaw.startsWith("[") ? sectionRaw : `[${sectionRaw.replace(/^\[|\]$/g, "")}]`;
  const lines = Array.isArray(raw.lines)
    ? raw.lines.map((l) => String(l || "").trim()).filter(Boolean).slice(0, 30)
    : String(raw.text || "")
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter((l) => l && !/^\[[^\]]+\]$/.test(l))
        .slice(0, 30);
  const durationSec = Number(raw.duration_seconds ?? raw.durationSeconds ?? raw.duration_sec);
  const positiveRaw = raw.positive_styles || raw.positiveStyles || raw.positive_local_styles || [];
  const negativeRaw = raw.negative_styles || raw.negativeStyles || raw.negative_local_styles || [];
  let positive_styles = Array.isArray(positiveRaw)
    ? positiveRaw.map(String).map((s) => s.trim()).filter(Boolean)
    : String(positiveRaw || "")
        .split(/[,|]/)
        .map((s) => s.trim())
        .filter(Boolean);
  if (positive_styles.length < 3 && fallbackStyleTags.length) {
    positive_styles = [...new Set([...positive_styles, ...fallbackStyleTags])];
  }
  const negative_styles = Array.isArray(negativeRaw)
    ? negativeRaw.map(String).map((s) => s.trim()).filter(Boolean)
    : String(negativeRaw || "")
        .split(/[,|]/)
        .map((s) => s.trim())
        .filter(Boolean);
  return {
    section,
    lines: lines.map((l) => l.slice(0, 200)),
    duration_seconds:
      Number.isFinite(durationSec) && durationSec >= 3 ? Math.min(120, Math.round(durationSec)) : null,
    positive_styles: positive_styles.slice(0, 50),
    negative_styles: negative_styles.slice(0, 50),
  };
}

function structuredLyricsFromChunks(chunks) {
  return chunks
    .map((c) => {
      const body = (c.lines || []).join("\n");
      return body ? `${c.section}\n${body}` : c.section;
    })
    .join("\n\n")
    .trim();
}

/** ElevenLabs Phase C — chunk plan + legacy string fields. */
function normalizeElevenSongProducerOutput(raw, { instrumental = false, maxStyleChars = SONG_ENHANCED_STYLE_MAX_CHARS, input = {} } = {}) {
  if (!raw || typeof raw !== "object") return null;
  let enhanced = String(
    raw.enhanced_style_prompt || raw.enhancedStylePrompt || raw.master_style_prompt || "",
  ).trim();
  const fallbackTags = String(input?.style_tags || "")
    .split(/[,|]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 10);
  const rawChunks = raw.composition_chunks || raw.compositionChunks || raw.chunks || [];
  const composition_chunks = (Array.isArray(rawChunks) ? rawChunks : [])
    .map((c) => normalizeElevenProducerChunk(c, fallbackTags))
    .filter(Boolean)
    .slice(0, 30);
  let structured = instrumental ? "" : String(raw.structured_lyrics || raw.structuredLyrics || "").trim();
  if (!structured && composition_chunks.length && !instrumental) {
    structured = structuredLyricsFromChunks(composition_chunks);
  }
  if (!enhanced && composition_chunks.length) {
    const first = composition_chunks[0];
    enhanced = [
      `Target length: ${Number(input?.target_length_seconds) || 180} seconds`,
      ...first.positive_styles.slice(0, 8),
    ].join(", ");
  }
  if (!enhanced) return null;
  const cap = Math.max(400, Number(maxStyleChars) || SONG_ENHANCED_STYLE_MAX_CHARS);
  if (enhanced.length > cap) enhanced = enhanced.slice(0, cap).trim();
  const out = {
    structured_lyrics: structured,
    enhanced_style_prompt: enhanced,
  };
  if (composition_chunks.length >= 2) {
    out.composition_chunks = composition_chunks;
    out.chunk_plan = true;
  }
  return out;
}

/**
 * Build producer input JSON from clip generate body.
 */
function buildClipProducerInput(body, flow = "nabad_clip") {
  const vocalLyriaHint = buildLyriaVocalProfile({
    vocalGender: String(body?.vocalGender || "").trim(),
    dialectHint: String(body?.dialectHint || body?.dialect || "").trim(),
    lyrics: String(body?.prompt || "").trim(),
    scriptFormat: String(body?.scriptFormat || "").trim(),
    nabadVocalToggles: body?.nabadVocalChain || body?.nabadVocalToggles || null,
    useNabadVocalIdentity: true,
  });
  const ideaPrompt = body?.ideaPrompt === true
    || body?.ideaPrompt === 1
    || body?.ideaPrompt === "1"
    || String(body?.ideaPrompt || "").toLowerCase() === "true";
  const rawPrompt = String(body?.prompt || "").trim();
  const ideaBrief = String(body?.ideaBrief || (ideaPrompt ? rawPrompt : "")).trim();

  return {
    title: String(body?.title || "").trim(),
    lyrics_raw: ideaPrompt ? "" : rawPrompt,
    idea_brief: ideaBrief,
    style_tags: String(body?.style || "").trim(),
    instruments: String(body?.instruments || "").trim(),
    song_key: String(body?.songKey || "").trim(),
    tempo_hint: String(body?.tempo || body?.bpm || "").trim(),
    vocal_gender: String(body?.vocalGender || "").trim(),
    vocal_character_id: "",
    vocal_character_label: "Nabad Signature",
    vocal_lyria_hint: vocalLyriaHint,
    dialect_hint: String(body?.dialectHint || body?.dialect || "").trim(),
    challenge_id: String(body?.challenge?.id || body?.challengeId || "").trim(),
    instrumental: Boolean(body?.instrumental),
    script_format: String(body?.scriptFormat || "").trim(),
    clip_target_seconds: 28,
    flow: String(flow || "nabad_clip").trim(),
  };
}

/** Full-length song producer input (ElevenLabs, Lyria full, etc.). */
function buildSongProducerInput(body, flow = "elevenlabs") {
  const base = buildClipProducerInput(body, flow);
  const musicLengthMs = Number(body?.musicLengthMs) > 0
    ? Number(body.musicLengthMs)
    : Number(process.env.ELEVENLABS_MUSIC_LENGTH_MS || 180000);
  const targetSeconds = Math.max(60, Math.min(360, Math.round(musicLengthMs / 1000)));
  return {
    ...base,
    target: "full_length_song",
    target_length_seconds: targetSeconds,
    mood: String(body?.mood || "").trim(),
    hum_track: Boolean(body?.humTrack),
    has_vocal_reference: Boolean(
      (body?.hasReference || body?.referenceAudio) && !body?.humTrack,
    ),
  };
}

function appendProducerAdminDetail(baseDetail, producerResult) {
  const lines = [String(baseDetail || "").trim()].filter(Boolean);
  if (!producerResult) {
    lines.push("gemini_producer: skipped");
    return lines.join("\n").slice(0, 4000);
  }
  lines.push(`gemini_producer: ${producerResult.used ? "applied" : "fallback"}`);
  if (producerResult.model) lines.push(`gemini_producer_model: ${producerResult.model}`);
  if (producerResult.error) lines.push(`gemini_producer_error: ${producerResult.error}`);
  if (producerResult.latencyMs != null) lines.push(`gemini_producer_ms: ${producerResult.latencyMs}`);
  if (producerResult.enhanced_style_prompt) {
    lines.push(`enhanced_style_prompt: ${producerResult.enhanced_style_prompt.slice(0, 600)}`);
  }
  if (producerResult.arrangement) {
    lines.push(`arrangement: ${String(producerResult.arrangement).slice(0, 500)}`);
  }
  if (producerResult.structured_lyrics) {
    lines.push(`structured_lyrics: ${producerResult.structured_lyrics.slice(0, 400)}`);
  }
  if (producerResult.chunk_plan && Array.isArray(producerResult.composition_chunks)) {
    lines.push(`gemini_chunk_plan: ${producerResult.composition_chunks.length} sections`);
  }
  return lines.join("\n").slice(0, 4000);
}

async function enrichWithGeminiProducer({
  apiKey,
  input,
  systemPrompt,
  timeoutMs,
  maxStyleChars,
  normalizeFn,
  enabled,
} = {}) {
  const started = Date.now();
  const instrumental = Boolean(input?.instrumental);
  const producerOn = typeof enabled === "boolean" ? enabled : clipGeminiProducerEnabled();
  if (!producerOn) {
    return { ok: false, used: false, fallback: true, error: "producer_disabled" };
  }
  if (!apiKey) {
    return { ok: false, used: false, fallback: true, error: "missing_gemini_api_key" };
  }

  const models = resolveProducerModels();
  const userMessage = JSON.stringify(input || {}, null, 0);
  const requestBody = JSON.stringify({
    systemInstruction: { parts: [{ text: String(systemPrompt || "").trim() }] },
    contents: [{ role: "user", parts: [{ text: userMessage }] }],
    generationConfig: {
      temperature: 0.65,
      responseMimeType: "application/json",
    },
  });

  let lastError = "unknown";
  let lastModel = models[0] || "gemini-3.6-flash";
  const waitMs = Math.max(5000, Number(timeoutMs) || PRODUCER_TIMEOUT_MS);
  const normalize =
    typeof normalizeFn === "function"
      ? normalizeFn
      : (parsed) => normalizeProducerOutput(parsed, { instrumental, maxStyleChars });

  for (const model of models) {
    lastModel = model;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), waitMs);

    try {
      const url = `${GEMINI_BASE}/models/${encodeURIComponent(model)}:generateContent`;
      const r = await fetch(url, {
        method: "POST",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": String(apiKey).trim(),
        },
        body: requestBody,
      });
      const text = await r.text().catch(() => "");
      const data = safeJson(text);
      const latencyMs = Date.now() - started;

      if (!r.ok) {
        lastError = data?.error?.message || text.slice(0, 200) || `HTTP ${r.status}`;
        continue;
      }

      const parsed = parseProducerJson(extractGeminiText(data));
      const normalized = normalize(parsed, { instrumental, maxStyleChars, input });
      if (!normalized) {
        lastError = "invalid_json";
        continue;
      }

      return {
        ok: true,
        used: true,
        fallback: false,
        model,
        latencyMs,
        ...normalized,
      };
    } catch (e) {
      lastError = e?.name === "AbortError" ? "timeout" : (e?.message || String(e));
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    ok: false,
    used: false,
    fallback: true,
    error: lastError,
    model: lastModel,
    latencyMs: Date.now() - started,
  };
}

/** Call Gemini to enrich clip prompts. Returns { ok, ... } — caller falls back on !ok. */
async function enrichClipWithGeminiProducer({ apiKey, input, enabled } = {}) {
  return enrichWithGeminiProducer({
    apiKey,
    input,
    systemPrompt: CLIP_PRODUCER_SYSTEM_PROMPT,
    timeoutMs: PRODUCER_TIMEOUT_MS,
    maxStyleChars: ENHANCED_STYLE_MAX_CHARS,
    enabled,
  });
}

/** Full-length song enrichment for ElevenLabs Music (chunk plan + legacy fields). */
async function enrichSongWithGeminiProducer({ apiKey, input, enabled } = {}) {
  return enrichWithGeminiProducer({
    apiKey,
    input,
    systemPrompt: ELEVENLABS_SONG_PRODUCER_SYSTEM_PROMPT,
    timeoutMs: SONG_PRODUCER_TIMEOUT_MS,
    maxStyleChars: SONG_ENHANCED_STYLE_MAX_CHARS,
    normalizeFn: normalizeElevenSongProducerOutput,
    enabled,
  });
}

/** Full-length Lyria 3.5 song — structured lyrics + rich style (same shape as clip producer). */
async function enrichLyriaSongWithGeminiProducer({ apiKey, input, enabled } = {}) {
  return enrichWithGeminiProducer({
    apiKey,
    input,
    systemPrompt: LYRIA_SONG_PRODUCER_SYSTEM_PROMPT,
    timeoutMs: SONG_PRODUCER_TIMEOUT_MS,
    maxStyleChars: SONG_ENHANCED_STYLE_MAX_CHARS,
    enabled,
  });
}

module.exports = {
  CLIP_PRODUCER_SYSTEM_PROMPT,
  LYRIA_SONG_PRODUCER_SYSTEM_PROMPT,
  ELEVENLABS_SONG_PRODUCER_SYSTEM_PROMPT,
  appendProducerAdminDetail,
  buildClipProducerInput,
  buildSongProducerInput,
  clipGeminiProducerEnabled,
  resolveGeminiProducerEnabled,
  enrichClipWithGeminiProducer,
  enrichSongWithGeminiProducer,
  enrichLyriaSongWithGeminiProducer,
};
