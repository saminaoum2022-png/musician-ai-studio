/**
 * Suno Voice: check availability — POST /api/v1/voice/check-voice
 *
 * Docs: submit the voice-creation task id as `task_id`; the voice is ready
 * for generation only when `data.isAvailable` is true. Called after voice
 * creation and right before any generation that uses a recorded voice, so
 * we never burn credits on a generation Suno would render with a generic
 * fallback voice.
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
    if (!user) return sendJson(res, 401, { error: "Sign in to use a custom voice." });

    const body = await readJson(req);
    const taskId = String(body?.taskId || body?.task_id || "").trim();
    if (!taskId) return sendJson(res, 400, { error: "Missing taskId" });

    const upstream = await sunoJsonRequest("/api/v1/voice/check-voice", {
      method: "POST",
      apiKey,
      body: { task_id: taskId },
    });

    if (!upstream.ok) {
      const msg =
        upstream.data?.msg ||
        upstream.data?.message ||
        upstream.data?.error ||
        "Voice availability check failed";
      return sendJson(res, upstream.httpStatus >= 400 ? upstream.httpStatus : 502, {
        error: String(msg).slice(0, 240),
        code: upstream.code,
        details: upstream.data || upstream.text,
      });
    }

    return sendJson(res, 200, {
      isAvailable: upstream.data?.data?.isAvailable === true,
      raw: upstream.data,
    });
  } catch (e) {
    return sendJson(res, 500, { error: e?.message || String(e) });
  }
};
