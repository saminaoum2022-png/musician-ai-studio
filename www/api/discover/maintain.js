/**
 * Expire Discover songs that missed survival (score < 0 after deadline).
 * Graduated songs (score >= 0) stay public; failed ones leave Discover only.
 *
 * POST /api/discover/maintain
 */

const { applyCors } = require("../_lib/cors");
const { sendJson } = require("../_lib/credits-auth");

const SUPABASE_URL = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

module.exports = async function handler(req, res) {
  if (applyCors(req, res)) return;
  try {
    if (req.method !== "POST" && req.method !== "GET") {
      return sendJson(res, 405, { error: "Method not allowed" });
    }
    if (!SUPABASE_SERVICE_ROLE_KEY) {
      return sendJson(res, 500, { error: "Missing SUPABASE_SERVICE_ROLE_KEY" });
    }

    const nowIso = new Date().toISOString();
    const filter =
      `public_on_profile=eq.true&discover_expires_at=lt.${encodeURIComponent(nowIso)}&or=(discover_score.lt.0,discover_score.is.null)`;

    const r = await fetch(`${SUPABASE_URL}/rest/v1/user_songs?${filter}&select=id`, {
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        Accept: "application/json",
      },
    });
    if (!r.ok) {
      const txt = await r.text().catch(() => "");
      if (/discover_score|discover_expires_at|42703/i.test(txt)) {
        return sendJson(res, 200, { ok: true, expired: 0, skipped: "columns_missing" });
      }
      return sendJson(res, 502, { error: txt.slice(0, 200) || "fetch failed" });
    }
    const rows = await r.json().catch(() => []);
    const ids = (Array.isArray(rows) ? rows : []).map((x) => x.id).filter(Boolean);
    if (!ids.length) {
      return sendJson(res, 200, { ok: true, expired: 0 });
    }

    const patch = await fetch(
      `${SUPABASE_URL}/rest/v1/user_songs?id=in.(${ids.map((id) => encodeURIComponent(id)).join(",")})`,
      {
        method: "PATCH",
        headers: {
          apikey: SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          "Content-Type": "application/json",
          Prefer: "return=minimal",
        },
        body: JSON.stringify({ public_on_profile: false }),
      },
    );
    if (!patch.ok) {
      const txt = await patch.text().catch(() => "");
      return sendJson(res, 502, { error: txt.slice(0, 200) || "patch failed" });
    }

    return sendJson(res, 200, { ok: true, expired: ids.length });
  } catch (e) {
    return sendJson(res, 500, { error: e?.message || String(e) });
  }
};
