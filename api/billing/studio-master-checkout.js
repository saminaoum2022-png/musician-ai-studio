/**
 * POST /api/billing/studio-master-checkout
 * Stripe one-time checkout for Studio Pro Master ($3.99).
 */
const { verifyUser, sendJson, readJsonBody } = require("../_lib/credits-auth");
const { applyCors } = require("../_lib/cors");
const { fetchProSubscriptionForUser } = require("../_lib/pro-subscription");
const { requireProForWebApi } = require("../_lib/pro-web-gate");
const {
  isStripeConfigured,
  createStudioMasterCheckoutSession,
  publicOriginFromRequest,
} = require("../_lib/stripe-billing");

module.exports = async function handler(req, res) {
  if (applyCors(req, res)) return;
  if (req.method !== "POST") return sendJson(res, 405, { error: "Method not allowed" });

  const priceId = String(process.env.STRIPE_PRICE_STUDIO_MASTER || "").trim();
  if (!isStripeConfigured() || !priceId) {
    return sendJson(res, 503, {
      error: "Pro Master checkout is not configured yet.",
      code: "billing_not_configured",
    });
  }

  const user = await verifyUser(req);
  if (!user) return sendJson(res, 401, { error: "Sign in first." });

  const proGate = await requireProForWebApi(req, user.userId);
  if (!proGate.ok) {
    return sendJson(res, proGate.status || 403, { error: proGate.error, code: proGate.code });
  }
  const pro = await fetchProSubscriptionForUser(user.userId);
  if (!pro?.active) {
    return sendJson(res, 403, { error: "NabadAi Pro is required for Pro Master.", code: "pro_required" });
  }

  const body = await readJsonBody(req);
  const masteringTaskId = String(body?.masteringTaskId || "").trim();
  if (!masteringTaskId) return sendJson(res, 400, { error: "Missing mastering task id." });

  const origin = publicOriginFromRequest(req);
  const session = await createStudioMasterCheckoutSession({
    userId: user.userId,
    email: user.email,
    origin,
    masteringTaskId,
    jobToken: String(body?.jobToken || "").trim(),
  });

  if (!session.ok) {
    return sendJson(res, session.status || 502, {
      error: session.error || "Could not start checkout",
      code: session.code || "checkout_failed",
    });
  }

  return sendJson(res, 200, { ok: true, url: session.url, sessionId: session.id, priceUsd: 3.99 });
};
