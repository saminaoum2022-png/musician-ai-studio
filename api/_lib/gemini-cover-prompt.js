/**
 * Gemini text-only cover scene writer.
 * Returns a subject/scene phrase; brand palette + safety wrappers stay in prompt.js.
 */
const CACHE_TTL_MS = 60 * 60 * 1000;
const CACHE_MAX = 400;
/** Keep in sync with src/cover-art/prompt.js COVER_PROMPT_POLICY_VERSION */
const COVER_PROMPT_POLICY_VERSION = 14;
const sceneCache = new Map();

const PREFERRED_MODELS = ["gemini-2.0-flash-lite", "gemini-2.0-flash", "gemini-2.5-flash", "gemini-1.5-flash"];

function safeJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function extractGeminiText(payload) {
  const parts = payload?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) return "";
  return parts.map((p) => String(p?.text || "")).join("").trim();
}

async function listGeminiGenerateModels(geminiKey) {
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(geminiKey)}`;
    const r = await fetch(url);
    const text = await r.text().catch(() => "");
    const data = safeJson(text) || {};
    if (!r.ok) return [];
    const models = Array.isArray(data?.models) ? data.models : [];
    return models
      .filter((m) => Array.isArray(m?.supportedGenerationMethods) && m.supportedGenerationMethods.includes("generateContent"))
      .map((m) => String(m?.name || "").replace(/^models\//, "").trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

function cacheGet(key) {
  const hit = sceneCache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > CACHE_TTL_MS) {
    sceneCache.delete(key);
    return null;
  }
  return hit;
}

function cacheSet(key, value) {
  if (sceneCache.size >= CACHE_MAX) {
    const oldest = sceneCache.keys().next().value;
    if (oldest) sceneCache.delete(oldest);
  }
  sceneCache.set(key, { ...value, at: Date.now() });
}

function trimField(value, max = 240) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function buildGeminiCoverBrief(input, { bucketKey, palette, artworkHint = "", occasionLabel = "", nabadBriefLine = "", visualDirection = null } = {}) {
  const humTrack = Boolean(input?.humTrack || input?.skipGeminiScene);
  const instrumentLabel = trimField(input?.instrumentLabel, 40);
  const mood = trimField(input?.mood, 80);
  const genre = trimField(input?.genre || input?.styleInput || input?.style, 140);
  const style = trimField(`${input?.styleInput || ""} ${input?.styleSent || ""}`, 220);
  const lyrics = trimField(input?.lyrics || input?.lyricsInput || "", 360);
  const hint = trimField(artworkHint, 220);
  const occasion = trimField(occasionLabel || input?.occasionLabel, 80);
  const templateTitle = trimField(input?.searchTemplateTitle, 120);
  const directorSubject = trimField(visualDirection?.mainSubject, 160);
  const directorSetting = trimField(visualDirection?.setting, 120);

  return [
    "Write ONE wordless photograph scene phrase for an AI image model.",
    "Output plain text only: comma-separated visual description, max 220 characters.",
    "No markdown, no quotes, no JSON.",
    "Describe symbolic objects, setting, lighting mood, and composition only.",
    "CRITICAL: absolutely no people, no humans, no faces, no hands, no fingers, no bodies, no silhouettes, no portraits — objects and environments only.",
    "For occasions, use symbolic props (e.g. wedding → diamond rings on satin; birthday → balloons and candles; graduation → cap and diploma on table).",
    "The image model outputs a square frame — compose the hero object centered for square still life; the app crops to vertical 9:16 afterward.",
    "Prefer one dominant object, one clear environment, realistic photography, simple composition, and minimal visual clutter.",
    "Avoid surreal or impossible combinations unless the mood, genre, or art direction below explicitly calls for them.",
    "CRITICAL: absolutely no readable text, letters, numbers, logos, signage, posters, banners, captions, song titles, or watermarks anywhere in the scene.",
    "Do NOT name colors or color palettes — brand color grading is appended separately.",
    nabadBriefLine ? trimField(nabadBriefLine, 220) : "",
    directorSubject ? `Visual direction subject (visual only): ${directorSubject}` : "",
    directorSetting ? `Visual direction setting: ${directorSetting}` : "",
    "",
    `Mood bucket: ${bucketKey || "default"}`,
    `Brand palette (for mood only — do not repeat in output): ${palette || "deep teal, rich violet, cinematic dark tones"}`,
    humTrack && instrumentLabel
      ? `Instrument focus (must dominate the scene): solo ${instrumentLabel}`
      : "",
    occasion ? `Occasion context (visual only, never as text): ${occasion}` : "",
    templateTitle && !humTrack
      ? `Template context (never render as text): ${templateTitle}`
      : "",
    mood ? `Mood: ${mood}` : "",
    genre ? `Genre: ${genre}` : "",
    style ? `Style: ${style}` : "",
    hint ? `Art direction (visual only): ${hint}` : "",
    lyrics ? `Lyrics excerpt (never render as text): ${lyrics}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function sanitizeGeminiScene(raw, { title = "" } = {}) {
  let s = String(raw || "")
    .replace(/^```[\s\S]*?```$/gm, " ")
    .replace(/^["'`]+|["'`]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!s) return "";
  if (title) {
    const esc = title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    s = s.replace(new RegExp(esc, "gi"), " ");
  }
  s = s.replace(/\b(deep teal|rich violet|electric teal|vivid violet|purple glow|violet dusk|teal and violet)\b/gi, " ");
  s = s.replace(
    /\b(person|people|human|humans|man|woman|child|couple|crowd|dancer|performer|musician|face|faces|portrait|silhouette|figure|body|hand|hands|finger|fingers|bride|groom|athlete|headshot)\b/gi,
    " ",
  );
  return s.replace(/\s+/g, " ").trim().slice(0, 220);
}

function isGeminiCoverPromptEnabled() {
  const flag = String(process.env.COVER_GEMINI_PROMPT || "1").trim().toLowerCase();
  return !["0", "false", "off", "no"].includes(flag);
}

/**
 * @param {object} input — cover-art request fields
 * @param {{ bucketKey?: string, palette?: string, artworkHint?: string }} context
 */
async function tryGeminiCoverScene(input, context = {}) {
  const nabadBriefLine = String(context?.nabadBriefLine || "").trim();
  const visualDirection = context?.visualDirection && typeof context.visualDirection === "object"
    ? context.visualDirection
    : null;
  const geminiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || "";
  if (!geminiKey || !isGeminiCoverPromptEnabled()) {
    return { ok: false, error: "disabled" };
  }
  if (input?.skipGeminiScene || input?.humTrack) {
    return { ok: false, error: "skipped_hum_track" };
  }

  const songId = String(input?.songId || input?.id || "").trim();
  const cacheKey = `${COVER_PROMPT_POLICY_VERSION}|${songId || `anon:${trimField(input?.title, 80)}`}`;
  const cached = cacheGet(cacheKey);
  if (cached?.scene) {
    return { ok: true, scene: cached.scene, model: cached.model, cached: true };
  }

  const brief = buildGeminiCoverBrief(input, context);
  const discovered = await listGeminiGenerateModels(geminiKey);
  const models = [...PREFERRED_MODELS, ...discovered].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i);
  let lastError = discovered.length ? "unknown" : "no_models";

  for (const model of models) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(geminiKey)}`;
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: brief }] }],
        generationConfig: {
          temperature: 0.55,
          maxOutputTokens: 180,
        },
      }),
    });
    const text = await r.text().catch(() => "");
    const payload = safeJson(text) || {};
    if (!r.ok) {
      lastError = payload?.error?.message || payload?.error || text || `HTTP ${r.status}`;
      continue;
    }
    const scene = sanitizeGeminiScene(extractGeminiText(payload), { title: input?.title });
    if (!scene) {
      lastError = "empty_scene";
      continue;
    }
    cacheSet(cacheKey, { scene, model });
    return { ok: true, scene, model, cached: false };
  }

  return { ok: false, error: String(lastError).slice(0, 280) };
}

module.exports = {
  tryGeminiCoverScene,
  isGeminiCoverPromptEnabled,
};
