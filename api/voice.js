/**
 * Vercel Serverless Function: Voice AI (text -> speech).
 *
 * Env:
 * - ELEVENLABS_API_KEY
 * - ELEVENLABS_VOICE_ID (optional)
 */

module.exports = async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      res.statusCode = 405;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: "Method not allowed" }));
      return;
    }

    const apiKey = process.env.ELEVENLABS_API_KEY;
    if (!apiKey) {
      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: "Missing ELEVENLABS_API_KEY on server" }));
      return;
    }

    const voiceId = process.env.ELEVENLABS_VOICE_ID || "21m00Tcm4TlvDq8ikWAM"; // default: Rachel
    const body = await readJson(req);
    const text = String(body?.text || body?.lyrics || "").trim();
    if (!text) {
      res.statusCode = 400;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: "Missing text" }));
      return;
    }

    const payload = {
      text,
      model_id: body?.model_id || "eleven_multilingual_v2",
      voice_settings: {
        stability: clampNum(body?.stability, 0, 1, 0.5),
        similarity_boost: clampNum(body?.similarity_boost, 0, 1, 0.75),
        style: clampNum(body?.style, 0, 1, 0.35),
        use_speaker_boost: true,
      },
    };

    const url = `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(
      voiceId
    )}/stream?output_format=mp3_44100_128`;

    const r = await fetch(url, {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
      },
      body: JSON.stringify(payload),
    });

    if (!r.ok) {
      const errText = await r.text().catch(() => "");
      res.statusCode = 502;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: "Upstream voice error", status: r.status, details: errText.slice(0, 2000) }));
      return;
    }

    const buf = Buffer.from(await r.arrayBuffer());
    res.statusCode = 200;
    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Cache-Control", "no-store");
    res.end(buf);
  } catch (e) {
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: e?.message || String(e) }));
  }
};

async function readJson(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (!raw) return {};
  return JSON.parse(raw);
}

function clampNum(n, min, max, fallback) {
  const x = Number.isFinite(Number(n)) ? Number(n) : fallback;
  return Math.max(min, Math.min(max, x));
}
