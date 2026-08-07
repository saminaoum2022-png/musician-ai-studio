/**
 * Gemini native image generation for cover regen (Nano Banana / flash-image models).
 * Normal first-time cover generation stays on Pollinations.
 */

const PREFERRED_IMAGE_MODELS = [
  "gemini-2.5-flash-image",
  "gemini-3.1-flash-image",
  "gemini-3.1-flash-lite-image",
  "gemini-2.0-flash-preview-image-generation",
];

function safeJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}


function isFalseyEnv(value) {
  const v = String(value || "").trim().toLowerCase();
  return ["0", "false", "no", "off"].includes(v);
}

/** Regen image backend — default Gemini on staging branch, Pollinations elsewhere. */
function resolveCoverRegenImageProvider() {
  const explicit = String(process.env.COVER_REGEN_IMAGE_PROVIDER || "").trim().toLowerCase();
  if (explicit === "gemini" || explicit === "pollinations") return explicit;
  const branch = String(process.env.VERCEL_GIT_COMMIT_REF || "").trim().toLowerCase();
  if (branch === "staging") return "gemini";
  return "pollinations";
}

function geminiRegenFallbackEnabled() {
  const flag = process.env.COVER_REGEN_GEMINI_FALLBACK;
  if (flag == null || flag === "") return true;
  return !isFalseyEnv(flag);
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

function pickGeminiImageModels(discovered) {
  const override = String(process.env.COVER_REGEN_GEMINI_MODEL || "").trim();
  if (override) return [override];
  const imageDiscovered = discovered.filter((m) => /image/i.test(m));
  const merged = [...PREFERRED_IMAGE_MODELS, ...imageDiscovered].filter(Boolean);
  return merged.filter((v, i, a) => a.indexOf(v) === i);
}

function extractGeminiImagePart(payload) {
  const parts = payload?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) return null;
  for (const part of parts) {
    const inline = part?.inlineData || part?.inline_data;
    const data = String(inline?.data || "").trim();
    if (!data) continue;
    return {
      mime: String(inline?.mimeType || inline?.mime_type || "image/png").split(";")[0].trim(),
      data,
    };
  }
  return null;
}

function buildGeminiCoverImagePrompt(prompt) {
  const core = String(prompt || "").replace(/\s+/g, " ").trim().slice(0, 3800);
  return [
    "Create one vertical album cover photograph (9:16 portrait).",
    "Wordless image only — absolutely no text, letters, numbers, logos, captions, watermarks, or readable signage.",
    "Absolutely no people, faces, hands, bodies, or silhouettes — objects and environments only.",
    core,
  ]
    .filter(Boolean)
    .join(" ");
}

/**
 * @param {{ prompt: string, aspectRatio?: string, imageSize?: string, timeoutMs?: number }} opts
 * @returns {Promise<{ ok: boolean, buf?: Buffer, mime?: string, model?: string, error?: string }>}
 */
async function tryGeminiCoverImage(opts = {}) {
  const geminiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || "";
  if (!geminiKey) return { ok: false, error: "no_gemini_key" };

  const prompt = buildGeminiCoverImagePrompt(opts.prompt);
  if (!prompt) return { ok: false, error: "empty_prompt" };

  const aspectRatio = String(opts.aspectRatio || process.env.COVER_REGEN_GEMINI_ASPECT || "9:16").trim();
  const imageSize = String(opts.imageSize || process.env.COVER_REGEN_GEMINI_SIZE || "1K").trim();
  const timeoutMs = Math.max(8000, Number(opts.timeoutMs) || 45000);

  const discovered = await listGeminiGenerateModels(geminiKey);
  const models = pickGeminiImageModels(discovered);
  if (!models.length) return { ok: false, error: "no_image_models" };

  let lastError = "unknown";
  for (const model of models) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(geminiKey)}`;
      const r = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: ctrl.signal,
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.65,
            responseModalities: ["TEXT", "IMAGE"],
            responseFormat: {
              image: {
                aspectRatio,
                imageSize,
              },
            },
          },
        }),
      });
      const text = await r.text().catch(() => "");
      const payload = safeJson(text) || {};
      if (!r.ok) {
        lastError = payload?.error?.message || payload?.error || text || `HTTP ${r.status}`;
        continue;
      }
      const imagePart = extractGeminiImagePart(payload);
      if (!imagePart?.data) {
        lastError = "empty_image";
        continue;
      }
      const buf = Buffer.from(imagePart.data, "base64");
      if (buf.length < 512) {
        lastError = "tiny_image";
        continue;
      }
      return {
        ok: true,
        buf,
        mime: imagePart.mime || "image/png",
        model,
      };
    } catch (e) {
      lastError = e?.name === "AbortError" ? "timeout" : (e?.message || String(e));
    } finally {
      clearTimeout(timer);
    }
  }

  return { ok: false, error: String(lastError).slice(0, 280) };
}

module.exports = {
  resolveCoverRegenImageProvider,
  geminiRegenFallbackEnabled,
  tryGeminiCoverImage,
  buildGeminiCoverImagePrompt,
};
