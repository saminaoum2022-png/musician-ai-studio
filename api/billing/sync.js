/**
 * POST /api/billing/sync
 * Refresh Pro subscription state from RevenueCat for the signed-in user.
 * Call after purchase / restore on iOS.
 */
const { verifyUser, sendJson, setCors } = require("../_lib/credits-auth");
const { syncRevenueCatSubscriber } = require("../_lib/billing-subscription");
const { fetchProSubscriptionForUser } = require("../_lib/pro-subscription");

module.exports = async function handler(req, res) {
  setCors(res);
  if (req.method === "OPTIONS") return res.end();
  if (req.method !== "POST") return sendJson(res, 405, { error: "Method not allowed" });

  const user = await verifyUser(req);
  if (!user) return sendJson(res, 401, { error: "Not signed in" });

  const secret = String(process.env.REVENUECAT_SECRET_API_KEY || "").trim();
  if (!secret) {
    return sendJson(res, 503, {
      error: "Billing is not configured yet.",
      code: "billing_not_configured",
    });
  }

  const sync = await syncRevenueCatSubscriber(user.userId);
  if (!sync.ok) {
    return sendJson(res, sync.status === 404 ? 404 : 502, {
      error: sync.error || "Could not sync subscription",
      code: "billing_sync_failed",
    });
  }

  const pro = await fetchProSubscriptionForUser(user.userId);
  return sendJson(res, 200, {
    ok: true,
    sync,
    pro,
  });
};
