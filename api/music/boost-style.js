/**
 * Boost Music Style proxy (provider-neutral path; currently backed by Suno).
 *
 * POST /api/music/boost-style   { content: "dabke pop, wedding energy" }
 *   -> Suno POST /api/v1/style/generate
 *   <- { result: "rich produced style description…" }
 *
 * Free for signed-in users: the upstream cost is a small fraction of a
 * Suno credit, and a better style prompt directly improves song quality,
 * so we don't debit user credits here. Abuse is bounded by requiring
 * auth, capping input length, and a best-effort per-user cooldown.
 */
const { verifyUser } = require("../_lib/credits-auth");
const { applyCors } = require("../_lib/cors");
const { readJson, sendJson, sunoJsonRequest } = require("../_lib/suno-upstream");

const MAX_CONTENT_CHARS = 500;
const COOLDOWN_MS = 4000;
// Instance-local, so this only throttles bursts hitting a warm function —
// good enough to stop a tap-spammed button without a shared store.
const lastCallByUser = new Map();

module.exports = async function handler(req, res) {
  if (applyCors(req, res)) return;
  try {
    if (req.method !== "POST") return sendJson(res, 405, { error: "Method not allowed" });

    const apiKey = process.env.SUNO_API_KEY;
    if (!apiKey) return sendJson(res, 500, { error: "Missing SUNO_API_KEY on server" });

    const user = await verifyUser(req);
    if (!user) return sendJson(res, 401, { error: "Sign in to boost a style." });

    const now = Date.now();
    const last = lastCallByUser.get(user.userId) || 0;
    if (now - last < COOLDOWN_MS) {
      return sendJson(res, 429, { error: "Boosting too fast — try again in a few seconds." });
    }
    lastCallByUser.set(user.userId, now);
    if (lastCallByUser.size > 5000) lastCallByUser.clear();

    const body = await readJson(req);
    const content = String(body?.content || "").trim().slice(0, MAX_CONTENT_CHARS);
    if (!content) return sendJson(res, 400, { error: "Describe a style first." });

    const upstream = await sunoJsonRequest("/api/v1/style/generate", {
      method: "POST",
      apiKey,
      body: { content },
    });

    const d = upstream.data?.data || {};
    const result = String(d.result || "").trim();
    if (!upstream.ok || !result) {
      const msg =
        d.errorMessage || upstream.data?.msg || upstream.data?.message || "Style boost failed";
      console.warn("[music/boost-style] upstream failure", {
        httpStatus: upstream.httpStatus,
        code: upstream.code,
        successFlag: d.successFlag,
        msg: String(msg).slice(0, 200),
      });
      return sendJson(res, 502, { error: String(msg).slice(0, 240), code: upstream.code });
    }

    return sendJson(res, 200, { result });
  } catch (e) {
    return sendJson(res, 500, { error: e?.message || String(e) });
  }
};
