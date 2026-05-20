/**
 * Suno Voice: submit verification recording — POST /api/v1/voice/generate
 */
const { verifyUser } = require("../_lib/credits-auth");
const { applyCors } = require("../_lib/cors");
const { readJson, sendJson, sunoJsonRequest } = require("../_lib/suno-upstream");

const SKILL = new Set(["beginner", "intermediate", "advanced", "professional"]);

module.exports = async function handler(req, res) {
  if (applyCors(req, res)) return;
  try {
    if (req.method !== "POST") return sendJson(res, 405, { error: "Method not allowed" });

    const apiKey = process.env.SUNO_API_KEY;
    if (!apiKey) return sendJson(res, 500, { error: "Missing SUNO_API_KEY on server" });

    const user = await verifyUser(req);
    if (!user) return sendJson(res, 401, { error: "Sign in to create a custom voice." });

    const body = await readJson(req);
    const taskId = String(body?.taskId || "").trim();
    const verifyUrl = String(body?.verifyUrl || "").trim();
    const voiceName = String(body?.voiceName || "My voice").trim().slice(0, 64);
    const description = String(body?.description || "").trim().slice(0, 600);
    const style = String(body?.style || "").trim().slice(0, 80);
    let singerSkillLevel = String(body?.singerSkillLevel || "intermediate").trim().toLowerCase();
    if (!SKILL.has(singerSkillLevel)) singerSkillLevel = "intermediate";

    if (!taskId) return sendJson(res, 400, { error: "Missing taskId" });
    if (!verifyUrl) return sendJson(res, 400, { error: "Missing verifyUrl" });

    const upstream = await sunoJsonRequest("/api/v1/voice/generate", {
      method: "POST",
      apiKey,
      body: {
        taskId,
        verifyUrl,
        voiceName,
        description: description || `Custom voice for ${voiceName}`,
        ...(style ? { style } : {}),
        singerSkillLevel,
      },
    });

    if (!upstream.ok) {
      const msg =
        upstream.data?.msg ||
        upstream.data?.message ||
        upstream.data?.error ||
        "Voice creation failed";
      return sendJson(res, upstream.httpStatus >= 400 ? upstream.httpStatus : 502, {
        error: String(msg).slice(0, 240),
        code: upstream.code,
        details: upstream.data || upstream.text,
      });
    }

    const voiceTaskId = String(upstream.data?.data?.taskId || "").trim();
    return sendJson(res, 200, {
      taskId: voiceTaskId,
      ...(upstream.data || {}),
    });
  } catch (e) {
    return sendJson(res, 500, { error: e?.message || String(e) });
  }
};
