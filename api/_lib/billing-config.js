/**
 * Server-side billing config — keep in sync with src/pro-plan-config.js product IDs.
 */

const {
  MONTHLY_LEGACY_1200_USER_IDS: MONTHLY_LEGACY_1200_USER_IDS_HARDCODED,
} = require("./monthly-legacy-allowlist");

const PRO_PRODUCTS = Object.freeze({
  "com.nabadai.music.pro.weekly": {
    planId: "weekly",
    creditsPerPeriod: 400,
    trialCredits: 90,
  },
  "com.nabadai.music.pro.monthly": {
    planId: "monthly",
    creditsPerPeriod: 1000,
    trialCredits: 0,
  },
});

/** Old monthly allotment (1,000 + 200 bonus) for grandfathered renewals only. */
const MONTHLY_LEGACY_CREDITS = 1200;

/**
 * Monthly subs that started before the 1,000-credit plan shipped keep 1,200 on
 * renewal until they expire and re-subscribe (created_at is then refreshed).
 * Match staging push of the 1,000 plan (2026-09-29).
 */
const MONTHLY_LEGACY_CUTOFF_MS = Date.parse("2026-09-29T16:00:00.000Z");

function parseMonthlyLegacyAllowlistIds() {
  const fromEnv = String(process.env.MONTHLY_LEGACY_1200_USER_IDS || "")
    .split(/[,;\s]+/)
    .map((s) => s.trim().toLowerCase())
    .filter((s) => /^[0-9a-f-]{36}$/.test(s));
  const fromFile = (MONTHLY_LEGACY_1200_USER_IDS_HARDCODED || [])
    .map((s) => String(s || "").trim().toLowerCase())
    .filter((s) => /^[0-9a-f-]{36}$/.test(s));
  return new Set([...fromFile, ...fromEnv]);
}

const MONTHLY_LEGACY_1200_USER_IDS = parseMonthlyLegacyAllowlistIds();

function isMonthlyLegacyAllowlisted(userId) {
  const uid = String(userId || "").trim().toLowerCase();
  return Boolean(uid && MONTHLY_LEGACY_1200_USER_IDS.has(uid));
}

/**
 * Paid monthly grant amount. New subscribers (INITIAL_PURCHASE) always get 1,000.
 * Legacy allowlisted / pre-cutoff continuous monthlies get 1,200 on renewals.
 * Weekly → monthly upgrades are not legacy (previousPlanId !== "monthly").
 */
function monthlyPaidCredits({
  userId,
  eventType,
  subscriptionCreatedAt,
  previousPlanId,
} = {}) {
  const type = String(eventType || "").toUpperCase();
  const defaultCredits = PRO_PRODUCTS["com.nabadai.music.pro.monthly"].creditsPerPeriod;
  if (type === "INITIAL_PURCHASE") return defaultCredits;
  if (isMonthlyLegacyAllowlisted(userId)) return MONTHLY_LEGACY_CREDITS;
  const prevPlan = String(previousPlanId || "").trim().toLowerCase();
  if (prevPlan && prevPlan !== "monthly") return defaultCredits;
  const createdMs = Date.parse(String(subscriptionCreatedAt || ""));
  if (Number.isFinite(createdMs) && createdMs < MONTHLY_LEGACY_CUTOFF_MS) {
    return MONTHLY_LEGACY_CREDITS;
  }
  return defaultCredits;
}

const CREDIT_PACK_PRODUCTS = Object.freeze({
  "com.nabadai.music.credits.12": 200,
  "com.nabadai.music.credits.60": 850,
  "com.nabadai.music.credits.120": 1400,
});

/** One-time Studio Pro Master (RoEx) — $3.99 consumable, not a credit pack. */
const STUDIO_PRO_MASTER_PRODUCT_ID = "com.nabadai.music.studio_pro_master";
const STUDIO_PRO_MASTER_EVENT = "STUDIO_PRO_MASTER";
const STUDIO_PRO_MASTER_REDEEMED_EVENT = "STUDIO_PRO_MASTER_REDEEMED";

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

function creditsForSubscriptionGrant({
  productId,
  periodType,
  eventType,
  subscriptionStatus,
  userId,
  subscriptionCreatedAt,
  previousPlanId,
} = {}) {
  const plan = planForProductId(productId);
  if (!plan) return 0;
  const period = String(periodType || "").toUpperCase();
  const type = String(eventType || "").toUpperCase();
  const status = String(subscriptionStatus || "").toLowerCase();
  if (plan.trialCredits > 0 && (period === "TRIAL" || status === "trialing")) {
    return type === "INITIAL_PURCHASE" ? plan.trialCredits : 0;
  }
  if (plan.planId === "monthly") {
    return monthlyPaidCredits({
      userId,
      eventType: type,
      subscriptionCreatedAt,
      previousPlanId,
    });
  }
  return plan.creditsPerPeriod;
}

/** Stripe path — plan object instead of Apple product id. */
function creditsForPlanGrant({
  plan,
  eventType,
  userId,
  subscriptionCreatedAt,
  previousPlanId,
  periodType,
  subscriptionStatus,
} = {}) {
  if (!plan) return 0;
  const period = String(periodType || "").toUpperCase();
  const type = String(eventType || "").toUpperCase();
  const status = String(subscriptionStatus || "").toLowerCase();
  if (plan.trialCredits > 0 && (period === "TRIAL" || status === "trialing")) {
    return type === "INITIAL_PURCHASE" ? plan.trialCredits : 0;
  }
  if (plan.planId === "monthly") {
    return monthlyPaidCredits({
      userId,
      eventType: type,
      subscriptionCreatedAt,
      previousPlanId,
    });
  }
  return plan.creditsPerPeriod;
}

function stripePriceIds() {
  return {
    weekly: String(process.env.STRIPE_PRICE_WEEKLY || "").trim(),
    monthly: String(process.env.STRIPE_PRICE_MONTHLY || "").trim(),
  };
}

function isStripeConfigured() {
  const ids = stripePriceIds();
  return Boolean(
    String(process.env.STRIPE_SECRET_KEY || "").trim() &&
      ids.weekly &&
      ids.monthly,
  );
}

function planForStripePriceId(priceId) {
  const pid = String(priceId || "").trim();
  if (!pid) return null;
  const ids = stripePriceIds();
  if (pid === ids.weekly) return PRO_PRODUCTS["com.nabadai.music.pro.weekly"];
  if (pid === ids.monthly) return PRO_PRODUCTS["com.nabadai.music.pro.monthly"];
  return null;
}

function stripePriceIdForPlan(planId) {
  const id = String(planId || "").trim();
  const ids = stripePriceIds();
  if (id === "weekly") return ids.weekly;
  if (id === "monthly") return ids.monthly;
  return "";
}

function statusFromRevenueCatEvent(eventType, periodType, expirationMs, productId) {
  const type = String(eventType || "").toUpperCase();
  const period = String(periodType || "").toUpperCase();
  const expMs = Number(expirationMs || 0);
  const expired = expMs > 0 && expMs <= Date.now();
  const plan = planForProductId(productId);

  if (type === "EXPIRATION" || expired) return "expired";
  if (type === "BILLING_ISSUE") return "grace";
  if (type === "CANCELLATION") return "cancelled";
  if (period === "TRIAL") return "trialing";
  if (plan?.trialCredits > 0 && type === "INITIAL_PURCHASE") return "trialing";
  if (plan?.trialCredits > 0 && period !== "NORMAL") return "trialing";
  if (type === "INITIAL_PURCHASE" || type === "RENEWAL" || type === "UNCANCELLATION") {
    return "active";
  }
  return "active";
}

function statusFromStripeSubscription(sub) {
  const s = String(sub?.status || "").toLowerCase();
  const endMs = Number(sub?.current_period_end || 0) * 1000;
  const inPeriod = endMs > Date.now();
  if (s === "trialing") return "trialing";
  if (s === "active") return "active";
  if (s === "past_due") return "grace";
  if (s === "canceled" || s === "unpaid") {
    return inPeriod ? "cancelled" : "expired";
  }
  if (s === "incomplete" || s === "incomplete_expired" || s === "paused") {
    return inPeriod ? "cancelled" : "expired";
  }
  return inPeriod ? "cancelled" : "expired";
}

module.exports = {
  PRO_PRODUCTS,
  CREDIT_PACK_PRODUCTS,
  STUDIO_PRO_MASTER_PRODUCT_ID,
  STUDIO_PRO_MASTER_EVENT,
  STUDIO_PRO_MASTER_REDEEMED_EVENT,
  ENTITLEMENT_PRO,
  CREDIT_GRANT_EVENT_TYPES,
  MONTHLY_LEGACY_CREDITS,
  MONTHLY_LEGACY_CUTOFF_MS,
  MONTHLY_LEGACY_1200_USER_IDS,
  isMonthlyLegacyAllowlisted,
  monthlyPaidCredits,
  planForProductId,
  creditsForPackProductId,
  creditsForSubscriptionGrant,
  creditsForPlanGrant,
  statusFromRevenueCatEvent,
  stripePriceIds,
  isStripeConfigured,
  planForStripePriceId,
  stripePriceIdForPlan,
  statusFromStripeSubscription,
};
