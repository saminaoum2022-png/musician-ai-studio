/**
 * POST /api/music/cover-art
 * Generates a deterministic mood-rich abstract cover via Pollinations.
 */
const path = require("path");
const { pathToFileURL } = require("url");
const { verifyUser } = require("../_lib/credits-auth");
const { applyCors } = require("../_lib/cors");

const MAX_FIELD = 160;
let _promptMod = null;

async function getPromptModule() {
  if (!_promptMod) {
    const p = path.join(__dirname, "../../src/cover-art/prompt.js");
    _promptMod = await import(pathToFileURL(p).href);
  }
  return _promptMod;
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

function sendJson(res, code, data) {
  res.statusCode = code;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(data));
}

module.exports = async function handler(req, res) {
  if (applyCors(req, res)) return;
  try {
    if (req.method !== "POST") return sendJson(res, 405, { error: "Method not allowed" });

    const user = await verifyUser(req);
    if (!user) return sendJson(res, 401, { error: "Sign in to generate cover art." });

    const body = await readJson(req);
    const songId = String(body?.songId || body?.id || "").trim();
    if (!songId) return sendJson(res, 400, { error: "songId is required." });

    const { buildAbstractCoverPrompt, buildPollinationsUrl } = await getPromptModule();

    const { prompt, seed, bucket, visualMode, params } = buildAbstractCoverPrompt({
      songId,
      title: String(body?.title || "").trim().slice(0, MAX_FIELD),
      genre: String(body?.genre || body?.style || "").trim().slice(0, MAX_FIELD),
      mood: String(body?.mood || "").trim().slice(0, MAX_FIELD),
      tempo: body?.tempo,
      energy: body?.energy,
      brightness: body?.brightness,
      sonicProfile: String(body?.sonicProfile || "").trim().slice(0, 40),
      style: String(body?.style || body?.styleSent || "").trim().slice(0, MAX_FIELD),
      styleSent: String(body?.styleSent || "").trim().slice(0, MAX_FIELD),
    });

    const upstreamUrl = buildPollinationsUrl(prompt, seed);
    const upstream = await fetch(upstreamUrl, {
      headers: { "User-Agent": "NabadAi-CoverArt/1.0" },
    });

    if (!upstream.ok) {
      const errText = await upstream.text().catch(() => "");
      console.warn("[music/cover-art] pollinations failed", upstream.status, errText.slice(0, 200));
      return sendJson(res, 502, { error: "Cover image generation failed upstream." });
    }

    const mime = String(upstream.headers.get("content-type") || "image/jpeg").split(";")[0].trim();
    const buf = Buffer.from(await upstream.arrayBuffer());
    if (buf.length < 512) {
      return sendJson(res, 502, { error: "Cover image response was empty." });
    }

    const dataUrl = `data:${mime || "image/jpeg"};base64,${buf.toString("base64")}`;

    return sendJson(res, 200, {
      ok: true,
      dataUrl,
      seed,
      bucket,
      visualMode,
      params,
      provider: "pollinations",
      abstract: true,
    });
  } catch (e) {
    console.warn("[music/cover-art]", e?.message || e);
    return sendJson(res, 500, { error: e?.message || "Cover art generation failed." });
  }
};
