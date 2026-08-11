/**
 * POST /api/billing/checkout
 * Start Stripe Checkout for NabadAi Pro (web).
 */
const { verifyUser, sendJson } = require("../_lib/credits-auth");
const { applyCors } = require("../_lib/cors");
const { readJson } = require("../_lib/suno-upstream");
const {
  isStripeConfigured,
  createCheckoutSession,
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

  const body = await readJson(req);
  const planId = String(body?.planId || body?.plan_id || "monthly").trim();
  if (planId !== "weekly" && planId !== "monthly") {
    return sendJson(res, 400, { error: "Invalid plan" });
  }

  const origin = publicOriginFromRequest(req);
  const session = await createCheckoutSession({
    userId: user.userId,
    email: user.email,
    planId,
    origin,
  });

  if (!session.ok) {
    return sendJson(res, session.status || 502, {
      error: session.error || "Could not start checkout",
      code: session.code || "checkout_failed",
    });
  }

  return sendJson(res, 200, { ok: true, url: session.url, sessionId: session.sessionId });
};
