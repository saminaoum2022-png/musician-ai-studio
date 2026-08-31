/**
 * Gemini text middleware — enriches Nabad Clip / Template Spark prompts before Lyria.
 * Opt-in via CLIP_GEMINI_PRODUCER_ENABLED=1 (staging preview first).
 */

const { buildLyriaVocalProfile, clipVocalProfileById } = require("./lyria-upstream");

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta";
const PRODUCER_TIMEOUT_MS = Number(process.env.CLIP_GEMINI_PRODUCER_TIMEOUT_MS || 15000);
const ENHANCED_STYLE_MAX_CHARS = 1200;

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

function normalizeProducerOutput(raw, { instrumental = false } = {}) {
  if (!raw || typeof raw !== "object") return null;
  let enhanced = String(raw.enhanced_style_prompt || raw.enhancedStylePrompt || "").trim();
  let structured = instrumental
    ? ""
    : String(raw.structured_lyrics || raw.structuredLyrics || "").trim();
  if (!enhanced) return null;
  if (enhanced.length > ENHANCED_STYLE_MAX_CHARS) {
    enhanced = enhanced.slice(0, ENHANCED_STYLE_MAX_CHARS).trim();
  }
  return {
    structured_lyrics: structured,
    enhanced_style_prompt: enhanced,
  };
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
  return lines.join("\n").slice(0, 4000);
}

/**
 * Call Gemini to enrich clip prompts. Returns { ok, ... } — caller falls back on !ok.
 */
async function enrichClipWithGeminiProducer({ apiKey, input } = {}) {
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
    systemInstruction: { parts: [{ text: CLIP_PRODUCER_SYSTEM_PROMPT }] },
    contents: [{ role: "user", parts: [{ text: userMessage }] }],
    generationConfig: {
      temperature: 0.65,
      responseMimeType: "application/json",
    },
  });

  let lastError = "unknown";
  let lastModel = models[0] || "gemini-3.6-flash";

  for (const model of models) {
    lastModel = model;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), PRODUCER_TIMEOUT_MS);

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
      const normalized = normalizeProducerOutput(parsed, { instrumental });
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

module.exports = {
  CLIP_PRODUCER_SYSTEM_PROMPT,
  appendProducerAdminDetail,
  buildClipProducerInput,
  clipGeminiProducerEnabled,
  enrichClipWithGeminiProducer,
};
