/**
 * Gemini text middleware — enriches Nabad Clip / Template Spark prompts before Lyria.
 * Opt-in via CLIP_GEMINI_PRODUCER_ENABLED=1 (staging preview first).
 */

const { buildLyriaVocalProfile, clipVocalProfileById } = require("./lyria-upstream");

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
- The user ALWAYS provides lyrics when instrumental is false — preserve their words exactly (Arabic, English, or mixed). Do NOT translate. Do NOT rewrite lines. You may only trim if clearly too long for ~28s.
- Structure tags MUST be in English only, on their own lines, e.g.:
  [Quick Catchy Intro · 0:00–0:04]
  [Main Hook / Chorus Drop · 0:04–0:22]
  [Punchy Outro · 0:22–0:28]
- Clip arc: optional micro-intro → main hook/chorus (required) → punchy outro. NOT a full song (no second verse, bridge, or long intro).
- Fit ~28 seconds at natural vocal pace (~4–10 short lines depending on language).
- End on a complete phrase — never mid-word or mid-sentence.
- If instrumental is true, return "".

=== enhanced_style_prompt ===
Rich sonic specification for Lyria. Target length: 800–1200 characters max.

Include ALL when inferable (use sensible genre defaults if missing — never stay vague):
1. Duration: "~28 second clip" explicitly.
2. Tempo: exact BPM (integer) + rhythmic feel (e.g. dabke ~120–130, ballad ~70–90).
3. Key / scale — honor song_key if provided (e.g. "A minor", "D with hijaz color").
4. Genre + mood in producer language.
5. Layers: sub-bass, drums/percussion, harmonic bed, lead elements, ear-candy.
6. Hook/ad-sync dynamics for 30s:
   - Immediate catchy motif (no long ambient intro).
   - Fast build to main drop/peak (time cues OK, e.g. ~0:04–0:06).
   - Punchy outro with clean stop — not a fade mid-phrase.
7. Vocal: gender, character, delivery from inputs; merge vocal_lyria_hint if present.
   Conversational, warm, close-mic — NO shouting, belted stadium vocals, or extreme high notes.
8. Mix: density, brightness, space (e.g. "dry intimate vocal, wide chorus pads").
9. Hard limits: one optional verse + one chorus max; hook-focused compact clip.

Dialect: if dialect_hint is set (Levantine, Gulf, Egyptian, etc.), reflect in rhythm and vocal color — tasteful, not stereotyped.

If style_tags imply visual mood (sunset, party, melancholy), translate to sonic texture.

Be specific ("palm-muted guitar stabs", "808 on downbeats") — avoid vague filler alone.

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
- lines: user's lyric lines for that section ONLY — preserve Arabic/English/mixed exactly. Do NOT translate or rewrite. Max ~8 lines per section, max 200 chars per line.
- duration_seconds: integer 3–120 per chunk. Intro/outro shorter; chorus often longer.
- positive_styles: 6–10 English tags per chunk — genre, BPM (REQUIRED same number every chunk, e.g. "108 BPM"), key, instrumentation, vocal character, energy for THIS section. First chunk sets overall genre/tone.
- negative_styles: 2–6 English tags to avoid unwanted sounds in THIS section (e.g. chorus: ["drawn-out syllables", "a cappella"]; instrumental intro: ["vocals", "lyrics"]).
- Section dynamics: sparse intro → fuller verses → peak chorus → contrasting bridge → resolved outro.
- Lyric density vs duration: duration_seconds must fit the lyric line count at the stated BPM (~4–6 beats per line). Prefer shorter sections with tight lines over long sections that force stretched syllables. Split long lyric lines into two shorter lines instead of one long line.
- If instrumental is true: lines may be empty; use {instrumental} direction in section text via empty lines + styles that exclude vocals; every chunk negative_styles must include "vocals" and "lyrics".

=== VOCAL PERFORMANCE (critical — every vocal chunk) ===
- Honor vocal_gender from input: "f" → bright clear female pop vocal; "m" → warm male TENOR pop vocal (NOT deep bass, NOT baritone).
- Merge vocal_lyria_hint into positive_styles when present.
- EVERY vocal chunk positive_styles MUST include the exact BPM tag (e.g. "108 BPM") plus: "on-pitch accurate vocals", "tempo-locked to the beat", "concise syllables no melisma", "conversational pop vocal", "rhythmic tight phrasing", "clear diction".
- Verse / pre-chorus: "conversational on-beat delivery" — sing like pop radio, not ballad or opera.
- Chorus / hook: "hook on the beat", "sing-along clarity" — energy yes, but NO melisma, NO drawn-out syllables, NO stadium belt unless user asked.
- EVERY vocal chunk negative_styles MUST include: "off-key vocals", "drawn-out syllables", "melismatic singing", "slow legato vocal delivery", "oversinging", "rubato against the beat", "theatrical vocal performance", "slow vocal tempo", "operatic delivery".
- Arabic lyrics are fine — still use English tags for all styles. Keep Arabic lines short per line so they fit the beat.

=== VOCAL REFERENCE (when has_vocal_reference is true) ===
- User uploaded a hum/voice clip — timbre, pitch contour, and rhythmic feel should align with that reference.
- Still output full composition_chunks (4–8 sections); the server attaches the reference to each vocal section.
- Prefer shorter sections and shorter lines so lyrics fit the reference melody without stretching syllables.
- Every vocal chunk positive_styles should include "match reference melody and rhythm".

=== structured_lyrics ===
- Concatenation of all sections for display: section tag on its own line, then lines. Must match composition_chunks content.
- If instrumental is true, return "".

=== enhanced_style_prompt ===
- Global fallback brief (800–1200 chars): tempo, key, genre, vocal character, mix — used if chunk styles need a safety net.
- English only. No artist or band names.

Dialect: if dialect_hint is set, reflect in vocal color and rhythm via positive_styles — tasteful, not stereotyped.
Be specific in styles — avoid vague filler alone.

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
  if (!enhanced) return null;
  const cap = Math.max(400, Number(maxStyleChars) || ENHANCED_STYLE_MAX_CHARS);
  if (enhanced.length > cap) {
    enhanced = enhanced.slice(0, cap).trim();
  }
  return {
    structured_lyrics: structured,
    enhanced_style_prompt: enhanced,
  };
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
  const clipVocalProfileId = String(body?.clipVocalProfileId || "").trim();
  const catalog = clipVocalProfileById(clipVocalProfileId);
  const vocalLyriaHint = buildLyriaVocalProfile({
    vocalGender: String(body?.vocalGender || "").trim(),
    voiceTimbre: String(body?.voiceTimbre || "").trim(),
    challengeId: String(body?.challenge?.id || body?.challengeId || "").trim(),
    dialectHint: String(body?.dialectHint || body?.dialect || "").trim(),
    clipVocalProfileId,
  });

  return {
    title: String(body?.title || "").trim(),
    lyrics_raw: String(body?.prompt || "").trim(),
    style_tags: String(body?.style || "").trim(),
    instruments: String(body?.instruments || "").trim(),
    song_key: String(body?.songKey || "").trim(),
    tempo_hint: String(body?.tempo || body?.bpm || "").trim(),
    vocal_gender: String(body?.vocalGender || "").trim(),
    vocal_character_id: clipVocalProfileId,
    vocal_character_label: catalog?.label || "",
    vocal_lyria_hint: vocalLyriaHint,
    dialect_hint: String(body?.dialectHint || body?.dialect || "").trim(),
    challenge_id: String(body?.challenge?.id || body?.challengeId || "").trim(),
    instrumental: Boolean(body?.instrumental),
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
    has_vocal_reference: Boolean(body?.hasReference || body?.referenceAudio),
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
} = {}) {
  const started = Date.now();
  const instrumental = Boolean(input?.instrumental);
  if (!clipGeminiProducerEnabled()) {
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
async function enrichClipWithGeminiProducer({ apiKey, input } = {}) {
  return enrichWithGeminiProducer({
    apiKey,
    input,
    systemPrompt: CLIP_PRODUCER_SYSTEM_PROMPT,
    timeoutMs: PRODUCER_TIMEOUT_MS,
    maxStyleChars: ENHANCED_STYLE_MAX_CHARS,
  });
}

/** Full-length song enrichment for ElevenLabs Music (chunk plan + legacy fields). */
async function enrichSongWithGeminiProducer({ apiKey, input } = {}) {
  return enrichWithGeminiProducer({
    apiKey,
    input,
    systemPrompt: ELEVENLABS_SONG_PRODUCER_SYSTEM_PROMPT,
    timeoutMs: SONG_PRODUCER_TIMEOUT_MS,
    maxStyleChars: SONG_ENHANCED_STYLE_MAX_CHARS,
    normalizeFn: normalizeElevenSongProducerOutput,
  });
}

module.exports = {
  CLIP_PRODUCER_SYSTEM_PROMPT,
  ELEVENLABS_SONG_PRODUCER_SYSTEM_PROMPT,
  appendProducerAdminDetail,
  buildClipProducerInput,
  buildSongProducerInput,
  clipGeminiProducerEnabled,
  enrichClipWithGeminiProducer,
  enrichSongWithGeminiProducer,
};
