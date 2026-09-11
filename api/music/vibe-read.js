/**
 * POST /api/music/vibe-read
 * Body: { audio: "data:audio/...;base64,..." }
 *
 * Admin-only, staging-first. Reads vibe/structure/style from uploaded audio —
 * inspiration only, never lyrics or melody copy.
 */
const { verifyUser, sendJson, readJsonBody } = require("../_lib/credits-auth");
const { applyCors } = require("../_lib/cors");
const { userIsAdmin } = require("../_lib/admin-auth");
const { queueLogProviderUsage } = require("../_lib/provider-usage-log");
const { nabadVibeEnabled, callGeminiVibeRead } = require("../_lib/nabad-vibe-lib");

const MAX_AUDIO_CHARS = 4_500_000;
const COOLDOWN_MS = 4000;
const lastCallByUser = new Map();

module.exports = async function handler(req, res) {
  if (applyCors(req, res)) return;
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return sendJson(res, 405, { error: "Method not allowed" });

  const user = await verifyUser(req);
  if (!user?.userId) return sendJson(res, 401, { error: "Sign in to use Vibe read." });

  if (!nabadVibeEnabled()) {
    return sendJson(res, 403, {
      error: "Vibe read is not enabled on this server.",
      code: "nabad_vibe_disabled",
    });
  }

  if (!(await userIsAdmin(user))) {
    return sendJson(res, 403, {
      error: "Vibe read is admin-only on this environment.",
      code: "nabad_vibe_admin_only",
    });
  }

  const now = Date.now();
  const last = lastCallByUser.get(user.userId) || 0;
  if (now - last < COOLDOWN_MS) {
    return sendJson(res, 429, { error: "Vibe read too fast — wait a few seconds." });
  }
  lastCallByUser.set(user.userId, now);
  if (lastCallByUser.size > 5000) lastCallByUser.clear();

  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || "";
  if (!apiKey) return sendJson(res, 502, { error: "Vibe read unavailable (missing GEMINI_API_KEY)." });

  try {
    const body = await readJsonBody(req);
    const dataUrl = String(body?.audio || "").trim();
    if (!dataUrl.startsWith("data:audio/")) {
      return sendJson(res, 400, { error: "Invalid audio payload — send a data:audio/… URL." });
    }
    if (dataUrl.length > MAX_AUDIO_CHARS) {
      return sendJson(res, 413, { error: "Audio too large — use a clip under about 3 minutes." });
    }

    const out = await callGeminiVibeRead({ apiKey, dataUrl });
    if (!out?.ok) {
      return sendJson(res, 502, {
        error: "Could not read this track's vibe — try a shorter clip or another file.",
        code: out?.error || "vibe_read_failed",
      });
    }

    queueLogProviderUsage({ provider: "gemini", kind: "vibe_read", userId: user.userId });

    return sendJson(res, 200, {
      ...out.result,
      provider: `gemini:${out.model || "unknown"}`,
      disclaimer: "Inspiration only — mood, style, and structure. Not a copy of lyrics or melody.",
    });
  } catch (e) {
    return sendJson(res, 500, { error: e?.message || String(e) });
  }
};
