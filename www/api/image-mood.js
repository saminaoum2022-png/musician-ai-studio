module.exports = async function handler(req, res) {
  setCors(res);
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return json(res, 405, { error: "Method not allowed" });
  try {
    const body = await readJson(req);
    const dataUrl = String(body?.image || "").trim();
    if (!dataUrl.startsWith("data:image/")) return json(res, 400, { error: "Invalid image payload" });

    const geminiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || "";
    if (!geminiKey) return json(res, 200, fallbackMood(dataUrl, "no_gemini_key"));

    const gem = await tryGeminiImageMood({ geminiKey, dataUrl });
    if (!gem?.ok) return json(res, 200, fallbackMood(dataUrl, gem?.error || "gemini_failed"));
    const parsed = tryParseGeminiObject(gem.text);
    if (!parsed || typeof parsed !== "object") return json(res, 200, fallbackMood(dataUrl, "parse_failed"));
    return json(res, 200, { ...sanitizeMood(parsed), source: `gemini:${gem.model || "unknown"}` });
  } catch (e) {
    return json(res, 200, fallbackMood("", "server_error"));
  }
};

async function tryGeminiImageMood({ geminiKey, dataUrl }) {
  const discovered = await listGeminiGenerateModels(geminiKey);
  const preferred = ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-2.0-flash-lite", "gemini-1.5-flash"];
  const models = [...preferred, ...discovered].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i);
  let lastError = discovered.length ? "unknown" : "no generateContent models discovered";

  for (const model of models) {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(geminiKey)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [
              { text: [
                "Analyze this image for music generation.",
                "Identify the true subject first (person, object/product, jewelry, landscape, city, abstract, etc).",
                "Do not default to human portrait unless a person is clearly dominant in the image.",
                "For product/object shots (like jewelry), return object-focused mood/tags, not portrait mood.",
                "Return JSON object only with keys:",
                "{\"concept\":\"...\",\"tags\":[\"...\"],\"lyricSeed\":\"...\",\"artworkHint\":\"...\"}",
                "No markdown fences."
              ].join(" ") },
              { inline_data: toInlineData(dataUrl) },
            ],
          },
        ],
        generationConfig: { temperature: 0.35 },
      }),
    });
    const text = await r.text().catch(() => "");
    const payload = safeJson(text) || {};
    if (!r.ok) {
      lastError = `gemini_http_${r.status}`;
      continue;
    }
    const out = extractText(payload);
    if (!out) {
      lastError = "empty_response";
      continue;
    }
    return { ok: true, text: out, model };
  }
  return { ok: false, error: lastError };
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

function fallbackMood(dataUrl, reason) {
  const presets = [
    {
      concept: "Open-air coastal mood",
      tags: ["chill", "ambient pop", "gentle groove", "sunset vibe"],
      lyricSeed: "A light, breezy mood with calm flow and easy singable hook.",
      artworkHint: "coastal cover art, airy tones, natural light, clean horizon",
    },
    {
      concept: "Clean natural visual mood",
      tags: ["organic", "mid-tempo", "balanced", "warm textures"],
      lyricSeed: "Natural, grounded emotion with simple lines and smooth chorus.",
      artworkHint: "nature-forward cover, soft contrast, minimal composition",
    },
    {
      concept: "Dreamy cinematic atmosphere",
      tags: ["cinematic", "emotional", "wide pads", "soft drums"],
      lyricSeed: "Dreamy cinematic lyrics with emotional arc and smooth chorus.",
      artworkHint: "soft cinematic cover art, moody light, gentle grain",
    },
  ];
  const idx = pickFromDataUrl(dataUrl, presets.length);
  return { ...presets[idx], source: `fallback:${reason || "unknown"}` };
}

function sanitizeMood(raw) {
  const concept = String(raw?.concept || "").trim().slice(0, 140) || fallbackMood().concept;
  const tags = Array.isArray(raw?.tags) ? raw.tags.map((x) => String(x || "").trim()).filter(Boolean).slice(0, 8) : fallbackMood().tags;
  const lyricSeed = String(raw?.lyricSeed || "").trim().slice(0, 220) || fallbackMood().lyricSeed;
  const artworkHint = String(raw?.artworkHint || "").trim().slice(0, 200) || fallbackMood().artworkHint;
  return { concept, tags, lyricSeed, artworkHint };
}

function toInlineData(dataUrl) {
  const m = dataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  return {
    mime_type: m ? m[1] : "image/png",
    data: m ? m[2] : "",
  };
}

function extractText(payload) {
  return String(payload?.candidates?.[0]?.content?.parts?.[0]?.text || "").trim();
}

function tryParseGeminiObject(text) {
  if (!text) return null;
  const direct = safeJson(text);
  if (direct && typeof direct === "object") return direct;
  const cleaned = text.replace(/```json|```/gi, "").trim();
  const cleanedParsed = safeJson(cleaned);
  if (cleanedParsed && typeof cleanedParsed === "object") return cleanedParsed;
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start >= 0 && end > start) {
    return safeJson(cleaned.slice(start, end + 1));
  }
  return null;
}

function pickFromDataUrl(dataUrl, modulo) {
  const b64 = String(dataUrl || "").split(",")[1] || "";
  if (!b64) return 0;
  let hash = 0;
  const limit = Math.min(180, b64.length);
  for (let i = 0; i < limit; i += 1) {
    hash = (hash * 33 + b64.charCodeAt(i)) >>> 0;
  }
  return hash % Math.max(1, modulo);
}

async function readJson(req) {
  if (req.body && typeof req.body === "object") return req.body;
  return await new Promise((resolve, reject) => {
    let s = "";
    req.on("data", (c) => (s += c));
    req.on("end", () => {
      try {
        resolve(s ? JSON.parse(s) : {});
      } catch (e) {
        reject(new Error("Invalid JSON body"));
      }
    });
    req.on("error", reject);
  });
}

function safeJson(s) {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, apikey");
}

function json(res, code, data) {
  res.statusCode = code;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(data));
}
