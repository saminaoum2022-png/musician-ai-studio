/**
 * Suno Voice: start validation — POST /api/v1/voice/validate
 */
const { verifyUser } = require("../_lib/credits-auth");
const { applyCors } = require("../_lib/cors");
const { readJson, sendJson, sunoJsonRequest } = require("../_lib/suno-upstream");

module.exports = async function handler(req, res) {
  if (applyCors(req, res)) return;
  try {
    if (req.method !== "POST") return sendJson(res, 405, { error: "Method not allowed" });

    const apiKey = process.env.SUNO_API_KEY;
    if (!apiKey) return sendJson(res, 500, { error: "Missing SUNO_API_KEY on server" });

    const user = await verifyUser(req);
    if (!user) return sendJson(res, 401, { error: "Sign in to create a custom voice." });

    const body = await readJson(req);
    const voiceUrl = String(body?.voiceUrl || "").trim();
    const vocalStartS = Math.max(0, Math.floor(Number(body?.vocalStartS) || 0));
    const vocalEndS = Math.max(vocalStartS + 1, Math.floor(Number(body?.vocalEndS) || 10));
    const language = String(body?.language || "en").trim() || "en";

    if (!voiceUrl) return sendJson(res, 400, { error: "Missing voiceUrl" });
    if (vocalEndS - vocalStartS < 6) {
      return sendJson(res, 400, { error: "Vocal segment should be at least 6 seconds" });
    }
    if (vocalEndS - vocalStartS > 30) {
      return sendJson(res, 400, { error: "Vocal segment should be at most 30 seconds" });
    }

    const upstream = await sunoJsonRequest("/api/v1/voice/validate", {
      method: "POST",
      apiKey,
      body: { voiceUrl, vocalStartS, vocalEndS, language },
    });

    if (!upstream.ok) {
      const msg =
        upstream.data?.msg ||
        upstream.data?.message ||
        upstream.data?.error ||
        "Voice validation failed";
      return sendJson(res, upstream.httpStatus >= 400 ? upstream.httpStatus : 502, {
        error: String(msg).slice(0, 240),
        code: upstream.code,
        details: upstream.data || upstream.text,
      });
    }

    const taskId = String(upstream.data?.data?.taskId || "").trim();
    return sendJson(res, 200, {
      taskId,
      ...(upstream.data || {}),
    });
  } catch (e) {
    return sendJson(res, 500, { error: e?.message || String(e) });
  }
};
