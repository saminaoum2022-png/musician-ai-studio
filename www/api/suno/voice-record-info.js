/**
 * Suno Voice: poll voice creation — GET /api/v1/voice/record-info?taskId=
 */
const { verifyUser } = require("../_lib/credits-auth");
const { applyCors } = require("../_lib/cors");
const { sendJson, sunoJsonRequest } = require("../_lib/suno-upstream");

module.exports = async function handler(req, res) {
  if (applyCors(req, res)) return;
  try {
    if (req.method !== "GET") return sendJson(res, 405, { error: "Method not allowed" });

    const apiKey = process.env.SUNO_API_KEY;
    if (!apiKey) return sendJson(res, 500, { error: "Missing SUNO_API_KEY on server" });

    const user = await verifyUser(req);
    if (!user) return sendJson(res, 401, { error: "Sign in to create a custom voice." });

    const taskId = String(req.query?.taskId || "").trim();
    if (!taskId) return sendJson(res, 400, { error: "Missing taskId" });

    const upstream = await sunoJsonRequest("/api/v1/voice/record-info", {
      method: "GET",
      apiKey,
      query: { taskId },
    });

    if (!upstream.ok) {
      const msg =
        upstream.data?.msg ||
        upstream.data?.message ||
        upstream.data?.error ||
        "Could not fetch voice status";
      return sendJson(res, upstream.httpStatus >= 400 ? upstream.httpStatus : 502, {
        error: String(msg).slice(0, 240),
        code: upstream.code,
        details: upstream.data || upstream.text,
      });
    }

    const d = upstream.data?.data || {};
    const voiceId = String(d.voiceId || d.voice_id || "").trim();
    return sendJson(res, 200, {
      taskId: String(d.taskId || taskId),
      status: String(d.status || ""),
      voiceId,
      errorMessage: d.errorMessage || null,
      errorCode: d.errorCode || null,
      raw: upstream.data,
    });
  } catch (e) {
    return sendJson(res, 500, { error: e?.message || String(e) });
  }
};
