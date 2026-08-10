/**
 * Apply subscription + credit grants from billing providers (RevenueCat / Apple).
 */

const {
  callRpc,
  selectFromTable,
} = require("./credits-auth");
const {
  planForProductId,
  creditsForPackProductId,
  creditsForSubscriptionGrant,
  statusFromRevenueCatEvent,
  CREDIT_GRANT_EVENT_TYPES,
  ENTITLEMENT_PRO,
} = require("./billing-config");

const SUPABASE_URL = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

function cleanUserId(v) {
  const s = String(v || "").trim().toLowerCase();
  return /^[0-9a-f-]{36}$/.test(s) ? s : "";
}

async function restWrite(path, { method = "POST", body = null, prefer = "" } = {}) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return { ok: false, status: 500, data: null };
  }
  const headers = {
    apikey: SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
  if (prefer) headers.Prefer = prefer;
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await r.text().catch(() => "");
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = text;
    }
    return { ok: r.ok, status: r.status, data };
  } catch (e) {
    return { ok: false, status: 500, data: { error: e?.message || String(e) } };
  }
}

async function billingEventExists(eventId) {
  const id = String(eventId || "").trim();
  if (!id) return false;
  const res = await selectFromTable(
    `billing_events?select=id&id=eq.${encodeURIComponent(id)}&limit=1`,
  );
  return Boolean(res.ok && Array.isArray(res.data) && res.data.length > 0);
}

async function recordBillingEvent({
  eventId,
  userId,
  provider,
  eventType,
  planId,
  productId,
  creditsGranted,
}) {
  const id = String(eventId || "").trim();
  if (!id) return { ok: false };
  return restWrite("billing_events", {
    method: "POST",
    body: {
      id,
      user_id: userId || null,
      provider,
      event_type: eventType || "",
      plan_id: planId || null,
      product_id: productId || null,
      credits_granted: Number(creditsGranted || 0),
    },
    prefer: "return=minimal",
  });
}

async function fetchProSubscriptionRow(userId) {
  const uid = cleanUserId(userId);
  if (!uid) return null;
  const res = await selectFromTable(
    `pro_subscriptions?select=plan_id,status,current_period_end,created_at&user_id=eq.${encodeURIComponent(uid)}&limit=1`,
  );
  if (!res.ok) return null;
  const row = Array.isArray(res.data) && res.data[0] ? res.data[0] : null;
  return row || null;
}

const WEEKLY_TRIAL_MS = 7 * 24 * 60 * 60 * 1000;

/** Sandbox weekly trials renew daily — don't flip trialing → active or extend the trial end. */
async function resolveStatusForUpsert(userId, planId, incomingStatus, periodType) {
  const period = String(periodType || "").toUpperCase();
  const inc = String(incomingStatus || "active").toLowerCase();
  if (period === "TRIAL" || inc === "trialing") return "trialing";
  if (period === "NORMAL") return inc === "expired" || inc === "cancelled" ? inc : "active";

  const pid = String(planId || "").trim();
  if (pid !== "weekly") return inc;

  const existing = await fetchProSubscriptionRow(userId);
  const prev = String(existing?.status || "").toLowerCase();
  if (prev === "trialing" && inc === "active") return "trialing";

  const createdMs = Date.parse(String(existing?.created_at || ""));
  if (Number.isFinite(createdMs) && Date.now() < createdMs + WEEKLY_TRIAL_MS && inc === "active") {
    return "trialing";
  }
  return inc;
}

/** During a free trial, keep the earliest period end — sandbox renewals can push it forward daily. */
async function resolvePeriodEndForUpsert(userId, status, periodEndIso) {
  const nextIso = String(periodEndIso || "").trim();
  if (String(status || "").toLowerCase() !== "trialing" || !nextIso) return nextIso || null;
  const existing = await fetchProSubscriptionRow(userId);
  const prevIso = String(existing?.current_period_end || "").trim();
  if (!prevIso) return nextIso;
  const prevMs = Date.parse(prevIso);
  const nextMs = Date.parse(nextIso);
  if (Number.isFinite(prevMs) && Number.isFinite(nextMs) && prevMs < nextMs) {
    return prevIso;
  }
  return nextIso;
}

async function upsertProSubscription({
  userId,
  provider,
  planId,
  status,
  periodEndIso,
  providerSubscriptionId,
}) {
  const uid = cleanUserId(userId);
  if (!uid || !planId) return { ok: false, error: "invalid_subscription_row" };
  const resolvedPeriodEnd = await resolvePeriodEndForUpsert(uid, status, periodEndIso);
  const row = {
    user_id: uid,
    provider: String(provider || "revenuecat"),
    plan_id: String(planId),
    status: String(status || "active"),
    current_period_end: resolvedPeriodEnd || null,
    provider_subscription_id: providerSubscriptionId
      ? String(providerSubscriptionId)
      : null,
    updated_at: new Date().toISOString(),
  };
  return restWrite("pro_subscriptions", {
    method: "POST",
    body: row,
    prefer: "resolution=merge-duplicates,return=minimal",
  });
}

async function grantCreditsOnce({
  eventId,
  userId,
  amount,
  ref,
  provider,
  eventType,
  planId,
  productId,
}) {
  const uid = cleanUserId(userId);
  const id = String(eventId || "").trim();
  const credits = Number(amount || 0);
  if (!uid || !id || !Number.isFinite(credits) || credits <= 0) {
    return { granted: 0, skipped: true };
  }
  if (await billingEventExists(id)) {
    return { granted: 0, skipped: true, duplicate: true };
  }

  const rpc = await callRpc("grant_paid_credits", {
    p_user_id: uid,
    p_amount: credits,
    p_ref: ref || `${provider}:${id}`,
  });
  if (rpc.skipped || rpc.status === 404) {
    return { granted: 0, skipped: true, error: "gifts_not_migrated" };
  }
  const out = rpc.data || {};
  if (!rpc.ok || out.ok === false) {
    return { granted: 0, skipped: true, error: out.message || "grant_failed" };
  }

  await recordBillingEvent({
    eventId: id,
    userId: uid,
    provider,
    eventType,
    planId,
    productId,
    creditsGranted: credits,
  });

  return { granted: credits, skipped: false, balance: out.balance };
}

function periodEndIsoFromMs(ms) {
  let n = Number(ms || 0);
  if (!Number.isFinite(n) || n <= 0) return null;
  if (n < 1e12) n *= 1000;
  return new Date(n).toISOString();
}

async function applyRevenueCatEvent(event) {
  const ev = event && typeof event === "object" ? event : {};
  const eventId = String(ev.id || "").trim();
  const eventType = String(ev.type || "").trim().toUpperCase();
  const productId = String(ev.product_id || "").trim();
  const periodType = String(ev.period_type || "").trim();
  const transactionId = String(ev.transaction_id || ev.original_transaction_id || eventId).trim();
  const expirationMs = ev.expiration_at_ms;

  const userCandidates = [
    ev.app_user_id,
    ev.original_app_user_id,
    ...(Array.isArray(ev.aliases) ? ev.aliases : []),
  ]
    .map(cleanUserId)
    .filter(Boolean);
  const userId = userCandidates.find(Boolean) || "";
  if (!userId) {
    return { ok: false, error: "missing_user_id" };
  }

  const packCredits = creditsForPackProductId(productId);
  if (packCredits > 0 && CREDIT_GRANT_EVENT_TYPES.has(eventType)) {
    const grant = await grantCreditsOnce({
      eventId: transactionId || eventId,
      userId,
      amount: packCredits,
      ref: `iap:${transactionId || eventId}`,
      provider: "revenuecat",
      eventType,
      planId: null,
      productId,
    });
    return { ok: true, kind: "credit_pack", userId, grant };
  }

  const plan = planForProductId(productId);
  if (!plan) {
    if (eventType === "EXPIRATION") {
      return { ok: true, kind: "expiration_no_plan", userId };
    }
    return { ok: true, kind: "ignored", userId, eventType, productId };
  }

  if (eventType === "EXPIRATION") {
    await upsertProSubscription({
      userId,
      provider: "revenuecat",
      planId: plan.planId,
      status: "expired",
      periodEndIso: periodEndIsoFromMs(expirationMs),
      providerSubscriptionId: transactionId,
    });
    return { ok: true, kind: "expiration", userId, planId: plan.planId };
  }

  const status = await resolveStatusForUpsert(
    userId,
    plan.planId,
    statusFromRevenueCatEvent(eventType, periodType, expirationMs, productId),
    periodType,
  );
  const subRes = await upsertProSubscription({
    userId,
    provider: "revenuecat",
    planId: plan.planId,
    status,
    periodEndIso: periodEndIsoFromMs(expirationMs),
    providerSubscriptionId: transactionId,
  });

  let grant = { granted: 0, skipped: true };
  if (CREDIT_GRANT_EVENT_TYPES.has(eventType)) {
    const amount = creditsForSubscriptionGrant({
      productId,
      periodType,
      eventType,
      subscriptionStatus: status,
    });
    grant = await grantCreditsOnce({
      eventId: transactionId || eventId,
      userId,
      amount,
      ref: `pro:${plan.planId}:${transactionId || eventId}`,
      provider: "revenuecat",
      eventType,
      planId: plan.planId,
      productId,
    });
  }

  return {
    ok: subRes.ok,
    kind: "subscription",
    userId,
    planId: plan.planId,
    status,
    grant,
  };
}

async function fetchRevenueCatSubscriber(appUserId) {
  const secret = String(process.env.REVENUECAT_SECRET_API_KEY || "").trim();
  const uid = cleanUserId(appUserId);
  if (!secret || !uid) return { ok: false, error: "billing_not_configured" };
  try {
    const r = await fetch(
      `https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(uid)}`,
      {
        headers: {
          Authorization: `Bearer ${secret}`,
          "Content-Type": "application/json",
        },
      },
    );
    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      return { ok: false, status: r.status, error: data?.message || "revenuecat_fetch_failed" };
    }
    return { ok: true, data };
  } catch (e) {
    return { ok: false, error: e?.message || String(e) };
  }
}

function pickActiveProSubscription(subscriber) {
  const subs = subscriber?.subscriptions || subscriber?.subscriber?.subscriptions || {};
  const entitlements =
    subscriber?.entitlements || subscriber?.subscriber?.entitlements || {};
  const proEnt = entitlements[ENTITLEMENT_PRO] || entitlements.pro;
  if (!proEnt || !subs || typeof subs !== "object") return null;

  const productId = String(proEnt.product_identifier || proEnt.productIdentifier || "").trim();
  const plan = planForProductId(productId);
  if (!plan) return null;

  const sub = subs[productId] || {};
  const expires = sub.expires_date || sub.expiresDate || proEnt.expires_date || proEnt.expiresDate;
  const expMs = expires ? Date.parse(String(expires)) : 0;
  const active = !expMs || expMs > Date.now();
  const periodType = String(sub.period_type || sub.periodType || "").toUpperCase();
  let status = "expired";
  if (active) {
    if (periodType === "TRIAL") status = "trialing";
    else if (plan.trialCredits > 0 && periodType !== "NORMAL") status = "trialing";
    else status = "active";
  }

  return {
    productId,
    planId: plan.planId,
    status,
    periodEndIso: expMs ? new Date(expMs).toISOString() : null,
    storeTransactionId: String(sub.store_transaction_id || sub.storeTransactionId || "").trim(),
    periodType,
    active,
  };
}

async function syncRevenueCatSubscriber(userId) {
  const uid = cleanUserId(userId);
  if (!uid) return { ok: false, error: "invalid_user" };
  const rc = await fetchRevenueCatSubscriber(uid);
  if (!rc.ok) return rc;

  const active = pickActiveProSubscription(rc.data?.subscriber || rc.data);
  if (!active) {
    return { ok: true, active: false };
  }

  const status = await resolveStatusForUpsert(uid, active.planId, active.status, active.periodType);
  const pinnedEnd = await resolvePeriodEndForUpsert(uid, status, active.periodEndIso);
  await upsertProSubscription({
    userId: uid,
    provider: "revenuecat",
    planId: active.planId,
    status,
    periodEndIso: active.periodEndIso,
    providerSubscriptionId: active.storeTransactionId || null,
  });

  return {
    ok: true,
    active: active.active,
    planId: active.planId,
    status,
    currentPeriodEnd: pinnedEnd || active.periodEndIso,
  };
}

module.exports = {
  cleanUserId,
  applyRevenueCatEvent,
  syncRevenueCatSubscriber,
  upsertProSubscription,
  grantCreditsOnce,
  fetchRevenueCatSubscriber,
  pickActiveProSubscription,
};
