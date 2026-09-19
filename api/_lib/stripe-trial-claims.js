/**
 * One Stripe weekly trial per email (survives account delete).
 * Mirrors welcome_credit_claims — keyed by email, not user_id or subscription id.
 */

const SUPABASE_URL = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

const CLAIMS_TABLE = "stripe_trial_claims";

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

async function serviceRest(path, { method = "GET", body, prefer } = {}) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    // Not configured at all — nothing we can check, but this is a config
    // problem, not evidence the table is missing. Callers must NOT treat
    // this as "fail open" for trial-eligibility checks.
    return { ok: false, status: 500, missingTable: false, error: "not_configured" };
  }
  try {
    const headers = {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      Accept: "application/json",
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(prefer ? { Prefer: prefer } : {}),
    };
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
    const missingTable =
      r.status === 404 ||
      (typeof data?.message === "string" && /stripe_trial_claims/i.test(data.message));
    if (!r.ok && !missingTable) {
      console.error(
        `[stripe-trial-claims] Supabase REST error (status=${r.status}) for ${path.split("?")[0]}:`,
        typeof data === "string" ? data.slice(0, 500) : JSON.stringify(data || {}).slice(0, 500),
      );
    }
    return { ok: r.ok, status: r.status, data, missingTable };
  } catch (e) {
    console.error(`[stripe-trial-claims] Supabase REST exception for ${path.split("?")[0]}:`, e?.message || e);
    return { ok: false, status: 500, missingTable: false, error: e?.message || "network_error" };
  }
}

/**
 * Looks up the trial claim for an email.
 * - missingTable=true  → table genuinely doesn't exist yet (404). Safe to fail open
 *   (pre-migration safety net); callers grant the trial.
 * - error=true          → real failure (network, auth, RLS, timeout, bad response).
 *   We do NOT know if a claim exists. Callers must fail CLOSED (do not grant a
 *   trial and do not overwrite/record a claim) rather than assuming "no claim".
 * - otherwise           → row is the authoritative claim (or null = truly no claim).
 */
async function fetchStripeTrialClaimForEmail(email) {
  const emailLower = normalizeEmail(email);
  if (!emailLower) return { row: null, missingTable: false, error: false };
  const res = await serviceRest(
    `${CLAIMS_TABLE}?select=email_lower,last_user_id,stripe_subscription_id,source&email_lower=eq.${encodeURIComponent(emailLower)}&limit=1`,
  );
  if (res.missingTable) return { row: null, missingTable: true, error: false };
  if (!res.ok) {
    // Real error — unknown eligibility. Do not treat as "no claim".
    return { row: null, missingTable: false, error: true };
  }
  const row = Array.isArray(res.data) && res.data[0] ? res.data[0] : null;
  return { row, missingTable: false, error: false };
}

async function hasUsedStripeTrial(email) {
  const claim = await fetchStripeTrialClaimForEmail(email);
  if (claim.missingTable) return false;
  return Boolean(claim.row);
}

async function recordStripeTrialUsed(
  email,
  { userId = null, subscriptionId = null, source = "trial_start" } = {},
) {
  const emailLower = normalizeEmail(email);
  if (!emailLower) return { ok: false };

  const payload = {
    email_lower: emailLower,
    last_user_id: userId || null,
    stripe_subscription_id: subscriptionId ? String(subscriptionId) : null,
    source: String(source || "trial_start"),
    updated_at: new Date().toISOString(),
  };

  const res = await serviceRest(CLAIMS_TABLE, {
    method: "POST",
    body: payload,
    prefer: "resolution=merge-duplicates,return=minimal",
  });

  return { ok: res.ok, missingTable: res.missingTable, status: res.status };
}

/** Reserve trial slot on account delete when user had a Stripe weekly sub. */
async function recordStripeTrialEligibilityUsed(
  email,
  { userId = null, subscriptionId = null, source = "account_deleted" } = {},
) {
  const existing = await fetchStripeTrialClaimForEmail(email);
  if (existing.error) {
    console.error(
      `[stripe-trial-claims] recordStripeTrialEligibilityUsed: claim lookup failed; skipping write to avoid clobbering an existing claim.`,
    );
    return { ok: false, error: true };
  }
  if (existing.row) return { ok: true, already: true };
  return recordStripeTrialUsed(email, { userId, subscriptionId, source });
}

/**
 * Returns trial credit amount (0 if email already used a trial on a different sub).
 * Records the claim when granting trial credits for the first time.
 */
async function resolveStripeTrialCreditAmount(stripe, sub, plan, status, userId) {
  const pid = String(plan?.planId || "").trim();
  if (status === "active") {
    return { amount: Number(plan?.creditsPerPeriod || 0), blocked: false };
  }
  if (status !== "trialing" || Number(plan?.trialCredits || 0) <= 0) {
    return { amount: 0, blocked: false };
  }

  const subId = String(sub?.id || "").trim();
  const email = await customerEmailFromSubscription(stripe, sub);
  if (!email) {
    return { amount: Number(plan.trialCredits || 0), blocked: false };
  }

  const claim = await fetchStripeTrialClaimForEmail(email);
  if (claim.missingTable) {
    return { amount: Number(plan.trialCredits || 0), blocked: false };
  }
  if (claim.error) {
    // Unknown eligibility due to a real lookup failure — fail CLOSED.
    // Do not grant and do not record a claim (we might overwrite a real one).
    console.error(
      `[stripe-trial-claims] resolveStripeTrialCreditAmount: claim lookup failed for sub ${subId}; blocking trial grant instead of assuming eligible.`,
    );
    return { amount: 0, blocked: true, reason: "trial_claim_lookup_failed" };
  }

  if (claim.row) {
    const priorSubId = String(claim.row.stripe_subscription_id || "").trim();
    if (priorSubId && priorSubId === subId) {
      return { amount: Number(plan.trialCredits || 0), blocked: false };
    }
    return { amount: 0, blocked: true, reason: "trial_email_reused" };
  }

  await recordStripeTrialUsed(email, {
    userId,
    subscriptionId: subId,
    source: "trial_start",
  });

  return { amount: Number(plan.trialCredits || 0), blocked: false };
}

/** Record trial start on subscription webhook even when credits grant is deferred. */
async function markStripeTrialStartedIfNeeded(stripe, sub, { userId, planId, status }) {
  if (status !== "trialing" || String(planId || "").trim() !== "weekly") {
    return { recorded: false };
  }
  const subId = String(sub?.id || "").trim();
  if (!subId) return { recorded: false };

  const email = await customerEmailFromSubscription(stripe, sub);
  if (!email) return { recorded: false };

  const claim = await fetchStripeTrialClaimForEmail(email);
  if (claim.error) {
    // Unknown state — do NOT write, could clobber an existing claim's
    // subscription_id via the merge-duplicates upsert.
    console.error(
      `[stripe-trial-claims] markStripeTrialStartedIfNeeded: claim lookup failed for sub ${subId}; skipping write.`,
    );
    return { recorded: false, error: true };
  }
  if (claim.row) return { recorded: false, already: true };

  await recordStripeTrialUsed(email, {
    userId,
    subscriptionId: subId,
    source: "trial_start",
  });
  return { recorded: true };
}

async function customerEmailFromSubscription(stripe, sub) {
  if (!stripe || !sub) return "";
  try {
    if (sub.customer && typeof sub.customer === "object" && sub.customer.email) {
      return normalizeEmail(sub.customer.email);
    }
    const customerId = String(sub.customer || "").trim();
    if (!customerId) return "";
    const customer = await stripe.customers.retrieve(customerId);
    return normalizeEmail(customer?.email);
  } catch {
    return "";
  }
}

module.exports = {
  normalizeEmail,
  fetchStripeTrialClaimForEmail,
  hasUsedStripeTrial,
  recordStripeTrialUsed,
  recordStripeTrialEligibilityUsed,
  resolveStripeTrialCreditAmount,
  markStripeTrialStartedIfNeeded,
  customerEmailFromSubscription,
};
