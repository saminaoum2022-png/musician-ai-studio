/**
 * GET/POST /api/cron/expire-gift-credits — daily sweep that removes gifted credits past their 30-day expiry.
 * (Expiry is also applied lazily on every spend and every /api/credits/me read; this keeps totals clean.)
 *
 * Auth: Authorization: Bearer <CRON_SECRET> (Vercel Cron sends it automatically).
 * Requires supabase/gift_credit_lots.sql; a no-op until it is applied.
 */

const { callRpc } = require("../_lib/credits-auth");

module.exports = async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "POST") {
    return json(res, 405, { error: "Method not allowed" });
  }

  const secret = String(process.env.CRON_SECRET || "").trim();
  if (!secret) return json(res, 503, { ok: false, error: "CRON_SECRET not configured" });
  const auth = String(req.headers.authorization || req.headers.Authorization || "").trim();
  if (auth !== `Bearer ${secret}`) return json(res, 401, { ok: false, error: "unauthorized" });

  try {
    const rpc = await callRpc("expire_all_gift_credit_lots", {});
    if (rpc.skipped || rpc.status === 404) {
      return json(res, 200, { ok: true, skipped: true, reason: "gift_credit_lots_not_migrated" });
    }
    if (!rpc.ok) return json(res, 500, { ok: false, error: "sweep_failed" });
    return json(res, 200, { ok: true, ...(rpc.data || {}) });
  } catch (e) {
    console.warn("[expire-gift-credits]", e?.message || e);
    return json(res, 500, { ok: false, error: e?.message || String(e) });
  }
};

function json(res, status, obj) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(obj));
}
