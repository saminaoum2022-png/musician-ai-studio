/**
 * POST /api/billing/webhook
 * RevenueCat subscription webhook (provider-neutral path).
 */
const { readJson, sendJson } = require("../_lib/suno-upstream");
const { applyCors } = require("../_lib/cors");
const { applyRevenueCatEvent } = require("../_lib/billing-subscription");

function webhookAuthorized(req) {
  const expected = String(process.env.REVENUECAT_WEBHOOK_AUTH || "").trim();
  if (!expected) return false;
  const auth = String(req.headers?.authorization || req.headers?.Authorization || "").trim();
  if (!auth) return false;
  if (auth === expected) return true;
  if (auth === `Bearer ${expected}`) return true;
  return false;
}

module.exports = async function handler(req, res) {
  if (applyCors(req, res)) return;
  if (req.method !== "POST") return sendJson(res, 405, { error: "Method not allowed" });
  if (!webhookAuthorized(req)) return sendJson(res, 401, { error: "Unauthorized" });

  const body = await readJson(req);
  const event = body?.event;
  if (!event || typeof event !== "object") {
    return sendJson(res, 400, { error: "Missing event payload" });
  }

  try {
    const result = await applyRevenueCatEvent(event);
    return sendJson(res, 200, { ok: true, result });
  } catch (e) {
    return sendJson(res, 500, { error: e?.message || "Webhook processing failed" });
  }
};
