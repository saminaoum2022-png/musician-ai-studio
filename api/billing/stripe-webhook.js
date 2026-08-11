/**
 * POST /api/billing/stripe-webhook
 * Stripe subscription events → pro_subscriptions + credit grants.
 */
const { sendJson } = require("../_lib/credits-auth");
const { applyCors } = require("../_lib/cors");
const {
  isStripeConfigured,
  applyStripeEvent,
  readRawBody,
  verifyStripeWebhook,
} = require("../_lib/stripe-billing");

module.exports = async function handler(req, res) {
  if (applyCors(req, res)) return;
  if (req.method !== "POST") return sendJson(res, 405, { error: "Method not allowed" });

  if (!isStripeConfigured()) {
    return sendJson(res, 503, { error: "Stripe billing not configured" });
  }

  const signature = String(
    req.headers?.["stripe-signature"] || req.headers?.["Stripe-Signature"] || "",
  ).trim();
  if (!signature) return sendJson(res, 400, { error: "Missing Stripe signature" });

  const rawBody = await readRawBody(req);
  const verified = verifyStripeWebhook(rawBody, signature);
  if (!verified.ok) {
    return sendJson(res, 400, { error: verified.error || "Invalid webhook signature" });
  }

  try {
    const result = await applyStripeEvent(verified.event);
    return sendJson(res, 200, { ok: true, result });
  } catch (e) {
    return sendJson(res, 500, { error: e?.message || "Webhook processing failed" });
  }
};
