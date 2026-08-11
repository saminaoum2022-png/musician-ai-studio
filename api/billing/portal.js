/**
 * POST /api/billing/portal
 * Stripe Customer Portal — manage or cancel web subscription.
 */
const { verifyUser, sendJson } = require("../_lib/credits-auth");
const { applyCors } = require("../_lib/cors");
const {
  isStripeConfigured,
  createPortalSession,
  publicOriginFromRequest,
} = require("../_lib/stripe-billing");

module.exports = async function handler(req, res) {
  if (applyCors(req, res)) return;
  if (req.method !== "POST") return sendJson(res, 405, { error: "Method not allowed" });

  if (!isStripeConfigured()) {
    return sendJson(res, 503, {
      error: "Web billing is not configured yet.",
      code: "billing_not_configured",
    });
  }

  const user = await verifyUser(req);
  if (!user) return sendJson(res, 401, { error: "Not signed in" });

  const origin = publicOriginFromRequest(req);
  const portal = await createPortalSession({ userId: user.userId, origin });

  if (!portal.ok) {
    return sendJson(res, portal.status || 502, {
      error: portal.error || "Could not open billing portal",
      code: portal.code || "portal_failed",
    });
  }

  return sendJson(res, 200, { ok: true, url: portal.url });
};
