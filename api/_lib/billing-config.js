/**
 * Server-side billing config — keep in sync with src/pro-plan-config.js product IDs.
 */

const PRO_PRODUCTS = Object.freeze({
  "com.nabadai.music.pro.weekly": {
    planId: "weekly",
    creditsPerPeriod: 400,
    trialCredits: 400,
  },
  "com.nabadai.music.pro.monthly": {
    planId: "monthly",
    creditsPerPeriod: 1200,
    trialCredits: 0,
  },
});

const CREDIT_PACK_PRODUCTS = Object.freeze({
  "com.nabadai.music.credits.12": 200,
  "com.nabadai.music.credits.60": 850,
  "com.nabadai.music.credits.120": 1400,
});

const ENTITLEMENT_PRO = "pro";

const CREDIT_GRANT_EVENT_TYPES = new Set([
  "INITIAL_PURCHASE",
  "RENEWAL",
  "PRODUCT_CHANGE",
  "UNCANCELLATION",
]);

function planForProductId(productId) {
  const pid = String(productId || "").trim();
  return PRO_PRODUCTS[pid] || null;
}

function creditsForPackProductId(productId) {
  const pid = String(productId || "").trim();
  const n = CREDIT_PACK_PRODUCTS[pid];
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function creditsForSubscriptionGrant({ productId, periodType }) {
  const plan = planForProductId(productId);
  if (!plan) return 0;
  const period = String(periodType || "").toUpperCase();
  if (period === "TRIAL" && plan.trialCredits > 0) return plan.trialCredits;
  return plan.creditsPerPeriod;
}

function statusFromRevenueCatEvent(eventType, periodType, expirationMs) {
  const type = String(eventType || "").toUpperCase();
  const expMs = Number(expirationMs || 0);
  const expired = expMs > 0 && expMs <= Date.now();

  if (type === "EXPIRATION" || expired) return "expired";
  if (type === "BILLING_ISSUE") return "grace";
  if (type === "CANCELLATION") return "cancelled";
  if (String(periodType || "").toUpperCase() === "TRIAL") return "trialing";
  if (type === "INITIAL_PURCHASE" || type === "RENEWAL" || type === "UNCANCELLATION") {
    return "active";
  }
  return "active";
}

module.exports = {
  PRO_PRODUCTS,
  CREDIT_PACK_PRODUCTS,
  ENTITLEMENT_PRO,
  CREDIT_GRANT_EVENT_TYPES,
  planForProductId,
  creditsForPackProductId,
  creditsForSubscriptionGrant,
  statusFromRevenueCatEvent,
};
