const { queueLogProviderUsage } = require("./_lib/provider-usage-log");

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
    queueLogProviderUsage({ provider: "gemini", kind: "image_mood" });
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
                "You are helping a music app turn a photo into a song brief.",
                "Identify the scene/subject first, then translate ONLY the emotional/visual atmosphere into music language.",
                "",
                "Return JSON only (no markdown) with keys:",
                "{\"concept\":\"...\",\"subject\":\"...\",\"tags\":[\"...\"],\"lyricSeed\":\"...\",\"artworkHint\":\"...\",\"vocalSuggestion\":\"lyrics|instrumental\"}",
                "",
                "Field rules:",
                "- concept: 1 short sentence for the musical mood (not a photo caption).",
                "- subject: what the photo is of in plain words (e.g. \"a dog indoors\", \"coastal sunset\", \"gold ring on marble\"). Empty if abstract.",
                "- tags: 4-7 MUSIC style tags for Suno. Allowed: genre, energy, tempo feel, production, instrumentation, atmosphere.",
                "  Examples: chill indie, warm acoustic, soft drums, cozy lo-fi, cinematic pads, intimate vocal.",
                "  FORBIDDEN in tags: subject nouns or photo objects (dog, cat, house, baby, car, jewelry, person, beach as a place-name, etc).",
                "  Never put the subject into tags. A dog photo → cozy acoustic / warm indie — NOT \"dog\".",
                "- lyricSeed: 1-2 sentences the user can turn into lyrics. Use the subject as story fuel when there is a clear subject.",
                "  If the image is abstract/landscape with no narrative subject, write an atmospheric lyric direction instead.",
                "  Prefer English unless Arabic script/culture is clearly dominant in the image.",
                "- artworkHint: short cover-art direction if we do NOT use the photo as cover. No text-in-image requests.",
                "- vocalSuggestion: \"lyrics\" when a subject/story is clear; \"instrumental\" for abstract/texture/landscape-only vibes.",
                "",
                "Do not default to human-portrait mood unless a person is clearly the dominant subject.",
              ].join("\n") },
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
      subject: "",
      tags: ["chill", "ambient pop", "gentle groove", "sunset vibe"],
      lyricSeed: "A light, breezy mood with calm flow and an easy singable hook.",
      artworkHint: "coastal cover art, airy tones, natural light, clean horizon",
      vocalSuggestion: "instrumental",
    },
    {
      concept: "Clean natural visual mood",
      subject: "",
      tags: ["organic", "mid-tempo", "balanced", "warm textures"],
      lyricSeed: "Natural, grounded emotion with simple lines and a smooth chorus.",
      artworkHint: "nature-forward cover, soft contrast, minimal composition",
      vocalSuggestion: "instrumental",
    },
    {
      concept: "Dreamy cinematic atmosphere",
      subject: "",
      tags: ["cinematic", "emotional", "wide pads", "soft drums"],
      lyricSeed: "Dreamy cinematic lyrics with an emotional arc and smooth chorus.",
      artworkHint: "soft cinematic cover art, moody light, gentle grain",
      vocalSuggestion: "lyrics",
    },
  ];
  const idx = pickFromDataUrl(dataUrl, presets.length);
  return { ...presets[idx], source: `fallback:${reason || "unknown"}` };
}

/** Words that are almost never valid Suno style tags — subjects / props. */
const SUBJECT_TAG_BLOCKLIST = new Set([
  "dog", "dogs", "puppy", "cat", "cats", "kitten", "pet", "pets", "animal", "animals",
  "house", "home", "room", "kitchen", "bedroom", "living", "indoor", "indoors", "outdoor", "outdoors",
  "person", "people", "man", "woman", "boy", "girl", "baby", "child", "kids", "family", "face", "portrait",
  "car", "cars", "bike", "phone", "jewelry", "ring", "necklace", "watch", "product",
  "food", "coffee", "drink", "flower", "flowers", "tree", "trees", "sky", "cloud", "clouds",
  "beach", "ocean", "sea", "mountain", "city", "street", "building", "selfie",
]);

function looksLikeSubjectTag(tag, subject) {
  const t = String(tag || "").trim().toLowerCase();
  if (!t) return true;
  if (SUBJECT_TAG_BLOCKLIST.has(t)) return true;
  // Single common noun with no musical modifier ("dogs" → "dog")
  if (/^[a-z]+$/.test(t) && SUBJECT_TAG_BLOCKLIST.has(t.replace(/s$/, ""))) return true;
  const sub = String(subject || "").toLowerCase();
  if (!sub) return false;
  // Only drop a tag when a whole subject noun token equals a whole tag token
  // (so "warm acoustic" survives subject "a warm dog indoors").
  const subjectNouns = sub.split(/[^a-z0-9]+/).filter((w) => w.length > 2 && SUBJECT_TAG_BLOCKLIST.has(w));
  if (!subjectNouns.length) return false;
  const tagTokens = t.split(/[^a-z0-9]+/).filter(Boolean);
  return subjectNouns.some((w) => tagTokens.includes(w));
}

function sanitizeMood(raw) {
  const fallback = fallbackMood();
  const concept = String(raw?.concept || "").trim().slice(0, 140) || fallback.concept;
  const subject = String(raw?.subject || "").trim().slice(0, 80);
  const rawTags = Array.isArray(raw?.tags) ? raw.tags.map((x) => String(x || "").trim()).filter(Boolean) : [];
  let tags = rawTags.filter((t) => !looksLikeSubjectTag(t, subject)).slice(0, 8);
  if (!tags.length) tags = fallback.tags.slice();
  let lyricSeed = String(raw?.lyricSeed || "").trim().slice(0, 280);
  if (!lyricSeed && subject) {
    lyricSeed = `Write lyrics inspired by ${subject} — keep it personal, concrete, and singable.`;
  }
  if (!lyricSeed) lyricSeed = fallback.lyricSeed;
  const artworkHint = String(raw?.artworkHint || "").trim().slice(0, 200) || fallback.artworkHint;
  const vocalRaw = String(raw?.vocalSuggestion || "").trim().toLowerCase();
  const vocalSuggestion = vocalRaw === "instrumental" || vocalRaw === "lyrics"
    ? vocalRaw
    : (subject ? "lyrics" : "instrumental");
  return { concept, subject, tags, lyricSeed, artworkHint, vocalSuggestion };
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
