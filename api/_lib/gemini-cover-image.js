/**
 * TEMP: final cover image generation via Gemini (replaces Pollinations fetch only).
 * Prompt + negative prompt are passed through unchanged from cover-art.js / prompt.js.
 */
const PREFERRED_IMAGE_MODELS = [
  "gemini-2.5-flash-image",
  "gemini-3.1-flash-image",
  "gemini-3-pro-image-preview",
  "gemini-2.0-flash-preview-image-generation",
];

function safeJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function geminiImageKey() {
  return process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || "";
}

async function listGeminiImageModels(geminiKey) {
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
      .filter((name) => /image/i.test(name));
  } catch {
    return [];
  }
}

function extractInlineImagePart(payload) {
  const parts = payload?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) return null;
  for (const part of parts) {
    const inline = part?.inlineData || part?.inline_data;
    if (!inline?.data) continue;
    const mime = String(inline.mimeType || inline.mime_type || "image/png").split(";")[0].trim();
    return { mime: mime || "image/png", data: String(inline.data) };
  }
  return null;
}

function buildGeminiImagePrompt(prompt, negativePrompt) {
  const main = String(prompt || "").trim();
  const neg = String(negativePrompt || "").trim();
  if (!neg) return main;
  return `${main}\n\nNegative prompt (exclude these elements): ${neg}`;
}

function aspectRatioForSize(width, height) {
  const w = Math.max(1, Number(width) || 1024);
  const h = Math.max(1, Number(height) || 1024);
  const ratio = w / h;
  const pairs = [
    ["1:1", 1],
    ["3:4", 3 / 4],
    ["4:3", 4 / 3],
    ["9:16", 9 / 16],
    ["16:9", 16 / 9],
  ];
  let best = "1:1";
  let bestDelta = Infinity;
  for (const [label, target] of pairs) {
    const delta = Math.abs(ratio - target);
    if (delta < bestDelta) {
      bestDelta = delta;
      best = label;
    }
  }
  return best;
}

/**
 * @param {{ prompt: string, negativePrompt?: string, width?: number, height?: number, timeoutMs?: number }} opts
 * @returns {Promise<{ ok: true, buf: Buffer, mime: string, model: string } | { ok: false, error: string }>}
 */
async function generateCoverImageViaGemini(opts = {}) {
  const geminiKey = geminiImageKey();
  if (!geminiKey) return { ok: false, error: "missing_gemini_key" };

  const prompt = buildGeminiImagePrompt(opts.prompt, opts.negativePrompt);
  if (!prompt) return { ok: false, error: "empty_prompt" };

  const width = Math.max(256, Number(opts.width) || 1024);
  const height = Math.max(256, Number(opts.height) || 1024);
  const timeoutMs = Math.max(15000, Number(opts.timeoutMs) || 120000);
  const aspectRatio = aspectRatioForSize(width, height);

  const envModel = String(process.env.COVER_GEMINI_IMAGE_MODEL || "").trim();
  const discovered = await listGeminiImageModels(geminiKey);
  const models = [...(envModel ? [envModel] : []), ...PREFERRED_IMAGE_MODELS, ...discovered]
    .filter(Boolean)
    .filter((v, i, a) => a.indexOf(v) === i);

  let lastError = discovered.length || envModel ? "unknown" : "no_image_models";

  for (const model of models) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(geminiKey)}`;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const r = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: ctrl.signal,
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: {
            responseModalities: ["TEXT", "IMAGE"],
            imageConfig: {
              aspectRatio,
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
      const inline = extractInlineImagePart(payload);
      if (!inline?.data) {
        lastError = "empty_image";
        continue;
      }
      const buf = Buffer.from(inline.data, "base64");
      if (buf.length < 512) {
        lastError = "image_too_small";
        continue;
      }
      return { ok: true, buf, mime: inline.mime, model };
    } catch (e) {
      lastError = e?.name === "AbortError" ? "timeout" : (e?.message || String(e));
    } finally {
      clearTimeout(timer);
    }
  }

  return { ok: false, error: String(lastError).slice(0, 280) };
}

module.exports = {
  generateCoverImageViaGemini,
};
