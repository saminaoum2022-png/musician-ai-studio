module.exports = async function handler(req, res) {
  setCors(res);
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return json(res, 405, { error: "Method not allowed" });
  try {
    const body = await readJson(req);
    const dataUrl = String(body?.image || "").trim();
    if (!dataUrl.startsWith("data:image/")) return json(res, 400, { error: "Invalid image payload" });

    const geminiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || "";
    if (!geminiKey) {
      return json(res, 200, fallbackMood());
    }

    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${encodeURIComponent(geminiKey)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [
              { text: "Analyze this image for music generation. Return strict JSON only: {\"concept\":\"...\",\"tags\":[\"...\"],\"lyricSeed\":\"...\",\"artworkHint\":\"...\"}" },
              { inline_data: toInlineData(dataUrl) },
            ],
          },
        ],
        generationConfig: { temperature: 0.4 },
      }),
    });
    const text = await r.text().catch(() => "");
    const payload = safeJson(text) || {};
    if (!r.ok) return json(res, 200, fallbackMood());
    const out = extractText(payload);
    const parsed = safeJson(out);
    if (!parsed || typeof parsed !== "object") return json(res, 200, fallbackMood());
    return json(res, 200, sanitizeMood(parsed));
  } catch (e) {
    return json(res, 200, fallbackMood());
  }
};

function fallbackMood() {
  return {
    concept: "Moody cinematic atmosphere",
    tags: ["cinematic", "emotional", "warm pads", "clean groove"],
    lyricSeed: "A cinematic emotional moment with warm tone and clear chorus.",
    artworkHint: "soft cinematic cover art, moody light, clean contrast",
  };
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
