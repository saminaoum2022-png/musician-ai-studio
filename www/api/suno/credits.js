/**
 * Suno API proxy: get remaining credits (master account).
 *
 * GET /api/suno/credits
 *
 * Admin-only — exposes upstream Suno balance.
 *
 * Env:
 * - SUNO_API_KEY
 */

const { verifyUser, sendJson, setCors } = require("../_lib/credits-auth");
const { userIsAdmin, adminForbidden, adminUnauthorized } = require("../_lib/admin-auth");

module.exports = async function handler(req, res) {
  try {
    setCors(res);
    if (req.method === "OPTIONS") return res.end();
    if (req.method !== "GET") return sendJson(res, 405, { error: "Method not allowed" });

    const user = await verifyUser(req);
    if (!user) return adminUnauthorized(res);

    const isAdmin = await userIsAdmin(user);
    if (!isAdmin) return adminForbidden(res);

    const apiKey = process.env.SUNO_API_KEY;
    if (!apiKey) return sendJson(res, 500, { error: "Missing SUNO_API_KEY on server" });

    const r = await fetch("https://api.sunoapi.org/api/v1/generate/credit", {
      headers: { Authorization: `Bearer ${apiKey}` },
    });

    const text = await r.text().catch(() => "");
    const data = safeJson(text);
    if (!r.ok) {
      return sendJson(res, 502, { error: "Upstream engine error", status: r.status, details: data || text });
    }
    return sendJson(res, 200, data || { raw: text });
  } catch (e) {
    return sendJson(res, 500, { error: e?.message || String(e) });
  }
};

function safeJson(txt) {
  try {
    return JSON.parse(txt);
  } catch {
    return null;
  }
}
