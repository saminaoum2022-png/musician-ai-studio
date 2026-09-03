/**
 * POST /api/admin/stripe-sync
 * Body: { userId }
 * Re-read Stripe subscription and update pro_subscriptions (incl. cancel_at_period_end).
 * Owner / Admin + Support only.
 */

const { verifyUser, sendJson, setCors, readJsonBody } = require("../_lib/credits-auth");
const {
  verifyAdmin,
  adminForbidden,
  adminUnauthorized,
} = require("../_lib/admin-auth");
const { isStripeConfigured, syncStripeSubscriber } = require("../_lib/stripe-billing");
const { fetchProSubscriptionForUser } = require("../_lib/pro-subscription");

module.exports = async function handler(req, res) {
  setCors(res, req);
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    return res.end();
  }
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST, OPTIONS");
    return sendJson(res, 405, { error: "Method not allowed" });
  }

  const admin = await verifyAdmin(req, { requireSendSupportEmail: true });
  if (!admin) {
    const user = await verifyUser(req);
    if (!user) return adminUnauthorized(res);
    return adminForbidden(res, "Stripe sync requires Owner / Admin or Support role.");
  }

  if (!isStripeConfigured()) {
    return sendJson(res, 503, { error: "Stripe is not configured.", code: "stripe_not_configured" });
  }

  try {
    const body = await readJsonBody(req);
    const userId = String(body?.userId || "").trim();
    if (!userId) return sendJson(res, 400, { error: "userId required" });

    const sync = await syncStripeSubscriber(userId);
    if (!sync.ok) {
      return sendJson(res, 502, {
        error: sync.error || "Could not sync from Stripe",
        code: "stripe_sync_failed",
      });
    }

    const pro = await fetchProSubscriptionForUser(userId);
    return sendJson(res, 200, {
      ok: true,
      sync,
      subscription: pro,
    });
  } catch (e) {
    return sendJson(res, 500, { error: e?.message || String(e) });
  }
};
