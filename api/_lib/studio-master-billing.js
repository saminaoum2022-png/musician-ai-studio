/**
 * Studio Pro Master — payment verification ($3.99 one-time).
 */
const {
  STUDIO_PRO_MASTER_PRODUCT_ID,
  STUDIO_PRO_MASTER_EVENT,
  STUDIO_PRO_MASTER_REDEEMED_EVENT,
} = require("./billing-config");
const { selectFromTable } = require("./credits-auth");

const SUPABASE_URL = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

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

function billingEventId(provider, externalId) {
  return `studio_master:${String(provider || "unknown")}:${String(externalId || "").trim()}`;
}

async function billingEventExists(id) {
  const eventId = String(id || "").trim();
  if (!eventId) return false;
  const res = await selectFromTable(
    `billing_events?select=id&id=eq.${encodeURIComponent(eventId)}&limit=1`,
  );
  return Boolean(res.ok && Array.isArray(res.data) && res.data.length > 0);
}

async function recordStudioMasterPayment({ userId, masteringTaskId, provider, externalId }) {
  const id = billingEventId(provider, externalId);
  if (await billingEventExists(id)) return { ok: true, skipped: true, id };
  return restWrite("billing_events", {
    method: "POST",
    body: {
      id,
      user_id: userId,
      provider: String(provider || "stripe"),
      event_type: STUDIO_PRO_MASTER_EVENT,
      plan_id: String(masteringTaskId || "").slice(0, 120),
      product_id: STUDIO_PRO_MASTER_PRODUCT_ID,
      credits_granted: 0,
    },
    prefer: "return=minimal",
  });
}

async function hasStudioMasterPayment(userId, masteringTaskId) {
  const uid = String(userId || "").trim();
  const taskId = String(masteringTaskId || "").trim();
  if (!uid || !taskId) return false;
  const res = await selectFromTable(
    `billing_events?select=id&user_id=eq.${encodeURIComponent(uid)}&event_type=eq.${encodeURIComponent(STUDIO_PRO_MASTER_EVENT)}&plan_id=eq.${encodeURIComponent(taskId)}&limit=1`,
  );
  return Boolean(res.ok && Array.isArray(res.data) && res.data.length > 0);
}

async function markStudioMasterRedeemed({ userId, masteringTaskId, provider }) {
  const id = billingEventId("redeemed", `${userId}:${masteringTaskId}`);
  if (await billingEventExists(id)) return { ok: true, skipped: true };
  return restWrite("billing_events", {
    method: "POST",
    body: {
      id,
      user_id: userId,
      provider: String(provider || "app"),
      event_type: STUDIO_PRO_MASTER_REDEEMED_EVENT,
      plan_id: String(masteringTaskId || "").slice(0, 120),
      product_id: STUDIO_PRO_MASTER_PRODUCT_ID,
      credits_granted: 0,
    },
    prefer: "return=minimal",
  });
}

async function verifyStudioMasterStripeSession({ sessionId, userId, masteringTaskId }) {
  const Stripe = require("stripe");
  const key = String(process.env.STRIPE_SECRET_KEY || "").trim();
  const priceId = String(process.env.STRIPE_PRICE_STUDIO_MASTER || "").trim();
  if (!key || !priceId) {
    return { ok: false, status: 503, error: "Web checkout not configured", code: "billing_not_configured" };
  }
  const stripe = new Stripe(key);
  let session;
  try {
    session = await stripe.checkout.sessions.retrieve(String(sessionId || "").trim(), {
      expand: ["line_items"],
    });
  } catch (e) {
    return { ok: false, status: 400, error: e?.message || "Invalid checkout session" };
  }

  const metaUser = String(session?.metadata?.user_id || session?.client_reference_id || "").trim();
  const metaTask = String(session?.metadata?.mastering_task_id || "").trim();
  const metaProduct = String(session?.metadata?.product || "").trim();
  const paid = String(session?.payment_status || "").toLowerCase() === "paid";

  if (!paid) return { ok: false, status: 402, error: "Payment not completed", code: "payment_incomplete" };
  if (metaUser !== String(userId || "").trim()) {
    return { ok: false, status: 403, error: "Checkout session belongs to another account.", code: "session_user_mismatch" };
  }
  if (metaTask !== String(masteringTaskId || "").trim()) {
    return { ok: false, status: 403, error: "Checkout session does not match this master.", code: "session_task_mismatch" };
  }
  if (metaProduct !== "studio_pro_master") {
    return { ok: false, status: 403, error: "Invalid checkout product.", code: "session_product_mismatch" };
  }

  return { ok: true };
}

async function verifyStudioMasterIapTransaction({ userId, transactionId, masteringTaskId }) {
  const tx = String(transactionId || "").trim();
  if (!tx) return { ok: false, status: 400, error: "Missing transaction id" };

  const id = billingEventId("iap_pending", tx);
  const exists = await billingEventExists(id);
  if (exists) {
    const res = await selectFromTable(
      `billing_events?select=plan_id&id=eq.${encodeURIComponent(id)}&limit=1`,
    );
    const row = res.ok && res.data?.[0] ? res.data[0] : null;
    const boundTask = String(row?.plan_id || "").trim();
    if (boundTask && boundTask !== String(masteringTaskId || "").trim()) {
      return { ok: false, status: 403, error: "Purchase already used for another master.", code: "iap_task_mismatch" };
    }
    return { ok: true };
  }

  // Webhook may not have landed yet — accept fresh IAP if RC secret can validate subscriber purchases.
  const secret = String(process.env.REVENUECAT_SECRET_API_KEY || "").trim();
  const uid = String(userId || "").trim();
  if (!secret || !uid) {
    return { ok: false, status: 402, error: "Waiting for App Store purchase confirmation.", code: "iap_pending" };
  }

  try {
    const r = await fetch(`https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(uid)}`, {
      headers: {
        Authorization: `Bearer ${secret}`,
        "Content-Type": "application/json",
      },
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      return { ok: false, status: 402, error: "Could not verify App Store purchase.", code: "iap_verify_failed" };
    }

    const nonSubs = data?.subscriber?.non_subscriptions || {};
    const entries = nonSubs[STUDIO_PRO_MASTER_PRODUCT_ID] || [];
    const match = (Array.isArray(entries) ? entries : []).find((e) => {
      const id = String(e?.store_transaction_id || e?.id || "").trim();
      return id === tx || String(e?.id || "").trim() === tx;
    });
    if (!match) {
      return { ok: false, status: 402, error: "Purchase not found — try again in a moment.", code: "iap_not_found" };
    }

    await recordStudioMasterPayment({
      userId: uid,
      masteringTaskId,
      provider: "revenuecat",
      externalId: tx,
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, status: 502, error: e?.message || "IAP verification failed" };
  }
}

module.exports = {
  recordStudioMasterPayment,
  hasStudioMasterPayment,
  markStudioMasterRedeemed,
  verifyStudioMasterStripeSession,
  verifyStudioMasterIapTransaction,
};
