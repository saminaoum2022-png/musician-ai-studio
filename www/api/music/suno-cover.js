/**
 * POST /api/music/suno-cover
 * Fetch Suno's generated cover, brand-grade, and return portrait JPEG as data URL.
 */
const { verifyUser } = require("../_lib/credits-auth");
const { applyCors } = require("../_lib/cors");
const { sanitizeCoverImageUrl, processSunoCoverFromUrl } = require("../_lib/suno-cover-brand");

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
    if (!user) return sendJson(res, 401, { error: "Sign in to process cover art." });

    const body = await readJson(req);
    const imageUrl = sanitizeCoverImageUrl(body?.imageUrl || body?.sourceImageUrl || "");
    if (!imageUrl) return sendJson(res, 400, { error: "imageUrl is required." });

    const result = await processSunoCoverFromUrl(imageUrl);
    const dataUrl = `data:${result.mime};base64,${result.buf.toString("base64")}`;
    return sendJson(res, 200, {
      ok: true,
      dataUrl,
      provider: "suno",
      coverWidth: result.width,
      coverHeight: result.height,
    });
  } catch (e) {
    console.warn("[music/suno-cover]", e?.message || e);
    return sendJson(res, 500, { error: e?.message || "Could not process Suno cover." });
  }
};
