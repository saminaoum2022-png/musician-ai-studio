/**
 * Stripe web subscriptions — Checkout, Portal, webhooks, sync.
 */

const Stripe = require("stripe");
const {
  isStripeConfigured,
  planForStripePriceId,
  stripePriceIdForPlan,
  statusFromStripeSubscription,
  CREDIT_GRANT_EVENT_TYPES,
} = require("./billing-config");
const {
  cleanUserId,
  upsertProSubscription,
  grantCreditsOnce,
} = require("./billing-subscription");
const { fetchProSubscriptionForUser } = require("./pro-subscription");

let _stripe = null;

function getStripe() {
  if (_stripe) return _stripe;
  const key = String(process.env.STRIPE_SECRET_KEY || "").trim();
  if (!key) return null;
  _stripe = new Stripe(key);
  return _stripe;
}

function publicOriginFromRequest(req) {
  const envOrigin = String(process.env.NABAD_PUBLIC_ORIGIN || "").trim().replace(/\/$/, "");
  if (envOrigin) return envOrigin;
  const host = String(req.headers?.["x-forwarded-host"] || req.headers?.host || "").trim();
  const proto = String(req.headers?.["x-forwarded-proto"] || "https").trim();
  if (host) return `${proto}://${host}`.replace(/\/$/, "");
  return "https://www.nabadai.com";
}

function proRouteUrl(origin, query = "") {
  const base = String(origin || "").replace(/\/$/, "");
  const q = query ? `?${query}` : "";
  return `${base}/#/settings/pro${q}`;
}

async function findStripeCustomerId(userId) {
  const stripe = getStripe();
  const uid = cleanUserId(userId);
  if (!stripe || !uid) return null;
  try {
    const res = await stripe.customers.search({
      query: `metadata['user_id']:'${uid}'`,
      limit: 1,
    });
    return res?.data?.[0]?.id || null;
  } catch {
    return null;
  }
}

async function ensureStripeCustomer(userId, email) {
  const stripe = getStripe();
  const uid = cleanUserId(userId);
  if (!stripe || !uid) return null;
  const existing = await findStripeCustomerId(uid);
  if (existing) return existing;
  const customer = await stripe.customers.create({
    email: String(email || "").trim() || undefined,
    metadata: { user_id: uid },
  });
  return customer.id;
}

function planIdFromSubscription(sub) {
  const priceId =
    sub?.items?.data?.[0]?.price?.id ||
    sub?.plan?.id ||
    "";
  const plan = planForStripePriceId(priceId);
  return plan?.planId || String(sub?.metadata?.plan_id || "").trim() || null;
}

function periodEndIsoFromSubscription(sub) {
  const end = Number(sub?.current_period_end || 0);
  if (!Number.isFinite(end) || end <= 0) return null;
  return new Date(end * 1000).toISOString();
}

function userIdFromStripeObject(obj) {
  const direct = cleanUserId(obj?.metadata?.user_id);
  if (direct) return direct;
  return cleanUserId(obj?.client_reference_id);
}

async function applyStripeSubscription(sub, { grantCredits = false, invoiceId = "" } = {}) {
  const stripe = getStripe();
  if (!stripe || !sub?.id) return { ok: false, error: "invalid_subscription" };

  let full = sub;
  if (!sub.items?.data?.length) {
    full = await stripe.subscriptions.retrieve(sub.id, { expand: ["items.data.price"] });
  }

  const userId = userIdFromStripeObject(full);
  if (!userId) return { ok: false, error: "missing_user_id" };

  const planId = planIdFromSubscription(full);
  if (!planId) return { ok: true, kind: "ignored", userId };

  const status = statusFromStripeSubscription(full);
  const periodEndIso = periodEndIsoFromSubscription(full);

  await upsertProSubscription({
    userId,
    provider: "stripe",
    planId,
    status,
    periodEndIso,
    providerSubscriptionId: String(full.id),
  });

  let grant = { granted: 0, skipped: true };
  if (grantCredits && CREDIT_GRANT_EVENT_TYPES.has("INITIAL_PURCHASE")) {
    const priceId = full?.items?.data?.[0]?.price?.id || "";
    const plan = planForStripePriceId(priceId);
    if (plan) {
      let amount = 0;
      const eventType = "INITIAL_PURCHASE";
      if (status === "trialing" && plan.trialCredits > 0) {
        amount = plan.trialCredits;
      } else if (status === "active") {
        amount = plan.creditsPerPeriod;
      }
      if (amount > 0) {
        const eventKey = `sub_initial:${full.id}`;
        grant = await grantCreditsOnce({
          eventId: `stripe:${eventKey}`,
          userId,
          amount,
          ref: `stripe:pro:${planId}:${eventKey}`,
          provider: "stripe",
          eventType,
          planId,
          productId: priceId,
        });
      }
    }
  }

  return {
    ok: true,
    kind: "subscription",
    userId,
    planId,
    status,
    grant,
  };
}

async function applyStripeInvoicePaid(invoice) {
  const stripe = getStripe();
  if (!stripe || !invoice?.id) return { ok: false, error: "invalid_invoice" };

  const subscriptionId = String(
    invoice.subscription ||
      (typeof invoice.subscription === "object" ? invoice.subscription?.id : "") ||
      "",
  ).trim();
  if (!subscriptionId) return { ok: true, kind: "ignored_non_subscription" };

  const sub = await stripe.subscriptions.retrieve(subscriptionId, {
    expand: ["items.data.price"],
  });
  const userId = userIdFromStripeObject(sub) || userIdFromStripeObject(invoice);
  if (!userId) return { ok: false, error: "missing_user_id" };

  const planId = planIdFromSubscription(sub);
  const priceId = sub?.items?.data?.[0]?.price?.id || "";
  const plan = planForStripePriceId(priceId);
  if (!plan) return { ok: true, kind: "ignored", userId };

  const status = statusFromStripeSubscription(sub);
  await upsertProSubscription({
    userId,
    provider: "stripe",
    planId,
    status,
    periodEndIso: periodEndIsoFromSubscription(sub),
    providerSubscriptionId: subscriptionId,
  });

  const billingReason = String(invoice.billing_reason || "").trim();
  let amount = 0;
  let eventType = "RENEWAL";
  let grantEventId = String(invoice.id).trim();

  if (billingReason === "subscription_create") {
    eventType = "INITIAL_PURCHASE";
    grantEventId = `sub_initial:${subscriptionId}`;
    if (status === "trialing" && plan.trialCredits > 0) {
      amount = plan.trialCredits;
    } else {
      amount = plan.creditsPerPeriod;
    }
  } else if (billingReason === "subscription_cycle") {
    if (status === "trialing") {
      return { ok: true, kind: "trial_cycle_skip", userId };
    }
    amount = plan.creditsPerPeriod;
  } else {
    return { ok: true, kind: "ignored_billing_reason", userId, billingReason };
  }

  if (amount <= 0) {
    return { ok: true, kind: "no_credits", userId, billingReason };
  }

  const grant = await grantCreditsOnce({
    eventId: `stripe:${grantEventId}`,
    userId,
    amount,
    ref: `stripe:pro:${planId}:${grantEventId}`,
    provider: "stripe",
    eventType,
    planId,
    productId: priceId,
  });

  return { ok: true, kind: "invoice", userId, planId, grant };
}

async function applyStripeEvent(event) {
  const ev = event && typeof event === "object" ? event : {};
  const type = String(ev.type || "").trim();

  if (type === "customer.subscription.deleted") {
    const sub = ev.data?.object;
    const userId = userIdFromStripeObject(sub);
    const planId = planIdFromSubscription(sub);
    if (!userId || !planId) return { ok: true, kind: "ignored" };
    await upsertProSubscription({
      userId,
      provider: "stripe",
      planId,
      status: "expired",
      periodEndIso: periodEndIsoFromSubscription(sub),
      providerSubscriptionId: String(sub.id || ""),
    });
    return { ok: true, kind: "expiration", userId, planId };
  }

  if (type === "customer.subscription.created" || type === "customer.subscription.updated") {
    return applyStripeSubscription(ev.data?.object, { grantCredits: false });
  }

  if (type === "invoice.paid") {
    return applyStripeInvoicePaid(ev.data?.object);
  }

  if (type === "checkout.session.completed") {
    const session = ev.data?.object;
    const subId = String(session?.subscription || "").trim();
    if (!subId) return { ok: true, kind: "checkout_no_subscription" };
    const stripe = getStripe();
    const sub = await stripe.subscriptions.retrieve(subId, { expand: ["items.data.price"] });
    if (session?.customer && userIdFromStripeObject(session)) {
      try {
        await stripe.customers.update(String(session.customer), {
          metadata: { user_id: userIdFromStripeObject(session) },
        });
      } catch {}
    }
    return applyStripeSubscription(sub, { grantCredits: true });
  }

  return { ok: true, kind: "ignored", type };
}

async function createCheckoutSession({ userId, email, planId, origin }) {
  const stripe = getStripe();
  const uid = cleanUserId(userId);
  const pid = String(planId || "").trim();
  const priceId = stripePriceIdForPlan(pid);
  if (!stripe || !uid || !priceId) {
    return { ok: false, error: "billing_not_configured" };
  }

  const existing = await fetchProSubscriptionForUser(uid);
  if (existing.active && existing.provider && existing.provider !== "stripe") {
    return {
      ok: false,
      status: 409,
      error: "You already have NabadAi Pro through the iPhone app. Manage it in iPhone Settings → Subscriptions.",
      code: "already_subscribed_ios",
    };
  }
  if (existing.active && existing.provider === "stripe") {
    return {
      ok: false,
      status: 409,
      error: "You already have an active web subscription. Use Manage subscription to change or cancel.",
      code: "already_subscribed_stripe",
    };
  }

  const customerId = await ensureStripeCustomer(uid, email);
  const subscriptionData = {
    metadata: { user_id: uid, plan_id: pid },
  };
  if (pid === "weekly") {
    subscriptionData.trial_period_days = 7;
  }

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    client_reference_id: uid,
    line_items: [{ price: priceId, quantity: 1 }],
    subscription_data: subscriptionData,
    metadata: { user_id: uid, plan_id: pid },
    success_url: proRouteUrl(origin, "checkout=success&session_id={CHECKOUT_SESSION_ID}"),
    cancel_url: proRouteUrl(origin, "checkout=cancelled"),
    allow_promotion_codes: false,
  });

  return { ok: true, url: session.url, sessionId: session.id };
}

async function createPortalSession({ userId, origin }) {
  const stripe = getStripe();
  const uid = cleanUserId(userId);
  if (!stripe || !uid) return { ok: false, error: "billing_not_configured" };

  let customerId = await findStripeCustomerId(uid);
  if (!customerId) {
    const pro = await fetchProSubscriptionForUser(uid);
    const subId = String(pro?.provider === "stripe" ? pro.providerSubscriptionId : "").trim();
    if (subId) {
      try {
        const sub = await stripe.subscriptions.retrieve(subId);
        customerId = String(sub.customer || "");
      } catch {}
    }
  }
  if (!customerId) {
    return { ok: false, status: 404, error: "No Stripe subscription found for this account.", code: "no_stripe_customer" };
  }

  const session = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: proRouteUrl(origin),
  });
  return { ok: true, url: session.url };
}

async function ensureStripeInitialCreditsGranted(sub) {
  if (!sub?.id) return { granted: 0, skipped: true };
  const userId = userIdFromStripeObject(sub);
  const planId = planIdFromSubscription(sub);
  const priceId = sub?.items?.data?.[0]?.price?.id || "";
  const plan = planForStripePriceId(priceId);
  if (!userId || !planId || !plan) return { granted: 0, skipped: true };

  const status = statusFromStripeSubscription(sub);
  if (status !== "active" && status !== "trialing") {
    return { granted: 0, skipped: true };
  }

  let amount = 0;
  if (status === "trialing" && plan.trialCredits > 0) {
    amount = plan.trialCredits;
  } else if (status === "active") {
    amount = plan.creditsPerPeriod;
  }
  if (amount <= 0) return { granted: 0, skipped: true };

  const eventKey = `sub_initial:${sub.id}`;
  return grantCreditsOnce({
    eventId: `stripe:${eventKey}`,
    userId,
    amount,
    ref: `stripe:pro:${planId}:${eventKey}`,
    provider: "stripe",
    eventType: "INITIAL_PURCHASE",
    planId,
    productId: priceId,
  });
}

async function syncStripeSubscriber(userId) {
  const stripe = getStripe();
  const uid = cleanUserId(userId);
  if (!stripe || !uid) return { ok: false, error: "billing_not_configured" };

  const pro = await fetchProSubscriptionForUser(uid);
  const subId =
    pro.provider === "stripe"
      ? String(pro.providerSubscriptionId || "").trim()
      : "";

  if (!subId) {
    const customerId = await findStripeCustomerId(uid);
    if (!customerId) return { ok: true, active: false };
    const subs = await stripe.subscriptions.list({
      customer: customerId,
      status: "all",
      limit: 5,
      expand: ["data.items.data.price"],
    });
    const activeSub =
      subs.data.find((s) => ["active", "trialing", "past_due"].includes(String(s.status))) ||
      null;
    if (!activeSub) return { ok: true, active: false };
    const result = await applyStripeSubscription(activeSub, { grantCredits: false });
    const grant = await ensureStripeInitialCreditsGranted(activeSub);
    return {
      ok: true,
      active: ["active", "trialing", "grace"].includes(result.status),
      planId: result.planId,
      status: result.status,
      grant,
    };
  }

  try {
    const sub = await stripe.subscriptions.retrieve(subId, { expand: ["items.data.price"] });
    const result = await applyStripeSubscription(sub, { grantCredits: false });
    const grant = await ensureStripeInitialCreditsGranted(sub);
    const active = ["active", "trialing", "grace"].includes(String(result.status));
    return {
      ok: true,
      active,
      planId: result.planId,
      status: result.status,
      currentPeriodEnd: periodEndIsoFromSubscription(sub),
      grant,
    };
  } catch (e) {
    return { ok: false, error: e?.message || "stripe_sync_failed" };
  }
}

async function readRawBody(req) {
  if (Buffer.isBuffer(req.body)) return req.body;
  if (typeof req.body === "string") return Buffer.from(req.body);
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks);
}

function verifyStripeWebhook(rawBody, signature) {
  const stripe = getStripe();
  const secret = String(process.env.STRIPE_WEBHOOK_SECRET || "").trim();
  if (!stripe || !secret) return { ok: false, error: "billing_not_configured" };
  try {
    const event = stripe.webhooks.constructEvent(rawBody, signature, secret);
    return { ok: true, event };
  } catch (e) {
    return { ok: false, error: e?.message || "invalid_signature" };
  }
}

module.exports = {
  getStripe,
  isStripeConfigured,
  publicOriginFromRequest,
  createCheckoutSession,
  createPortalSession,
  syncStripeSubscriber,
  applyStripeEvent,
  readRawBody,
  verifyStripeWebhook,
};
