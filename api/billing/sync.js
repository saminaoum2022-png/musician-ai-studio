/**
 * POST /api/billing/sync
 * Refresh Pro subscription state from RevenueCat (iOS) and/or Stripe (web).
 */
const { verifyUser, sendJson, setCors } = require("../_lib/credits-auth");
const { syncRevenueCatSubscriber } = require("../_lib/billing-subscription");
const { isStripeConfigured, syncStripeSubscriber } = require("../_lib/stripe-billing");
const { fetchProSubscriptionForUser } = require("../_lib/pro-subscription");

module.exports = async function handler(req, res) {
  setCors(res);
  if (req.method === "OPTIONS") return res.end();
  if (req.method !== "POST") return sendJson(res, 405, { error: "Method not allowed" });

  const user = await verifyUser(req);
  if (!user) return sendJson(res, 401, { error: "Not signed in" });

  const rcSecret = String(process.env.REVENUECAT_SECRET_API_KEY || "").trim();
  const stripeOk = isStripeConfigured();

  if (!rcSecret && !stripeOk) {
    return sendJson(res, 503, {
      error: "Billing is not configured yet.",
      code: "billing_not_configured",
    });
  }

  const sync = { ok: true };

  if (stripeOk) {
    const stripeSync = await syncStripeSubscriber(user.userId);
    sync.stripe = stripeSync;
    if (!stripeSync.ok) {
      return sendJson(res, 502, {
        error: stripeSync.error || "Could not sync Stripe subscription",
        code: "billing_sync_failed",
      });
    }
  }

  if (rcSecret) {
    const rcSync = await syncRevenueCatSubscriber(user.userId);
    sync.revenuecat = rcSync;
  }

  const pro = await fetchProSubscriptionForUser(user.userId);
  return sendJson(res, 200, {
    ok: true,
    sync,
    pro,
  });
};
