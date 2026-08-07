/**
 * One-time welcome credits for new website signups (web users can't buy yet).
 * Uses grant_promo_credits RPC → promo_balance (see supabase/grant_promo_credits.sql).
 *
 * Anti-abuse: welcome_credit_claims table keyed by email (survives account delete).
 */

const { callRpc, selectFromTable } = require("./credits-auth");

const SUPABASE_URL = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

const WELCOME_CREDITS = Number(process.env.SIGNUP_WELCOME_CREDITS || 24);
const WELCOME_REASON = "signup_welcome";
const CLAIMS_TABLE = "welcome_credit_claims";

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function readSignupPlatform(authUser) {
  const meta = authUser?.user_metadata || authUser?.raw_user_meta_data || {};
  return String(meta.signup_platform || "").trim().toLowerCase();
}

/** Welcome bonus is for website signups only (no web IAP yet). */
function isWebSignupEligible(signupPlatform, clientShell) {
  const platform = String(signupPlatform || "").trim().toLowerCase();
  if (platform === "ios" || platform === "android") return false;
  if (platform === "web") return true;
  return String(clientShell || "").trim().toLowerCase() === "web";
}

async function serviceRest(path, { method = "GET", body, prefer } = {}) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return { ok: false, status: 500, missingTable: false };
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
      (typeof data?.message === "string" && /welcome_credit_claims/i.test(data.message));
    return { ok: r.ok, status: r.status, data, missingTable };
  } catch {
    return { ok: false, status: 500, missingTable: false };
  }
}

async function fetchWelcomeClaimForEmail(email) {
  const emailLower = normalizeEmail(email);
  if (!emailLower) return { row: null, missingTable: false };
  const res = await serviceRest(
    `${CLAIMS_TABLE}?select=email_lower,credits_granted,source&email_lower=eq.${encodeURIComponent(emailLower)}&limit=1`,
  );
  if (res.missingTable) return { row: null, missingTable: true };
  const row = Array.isArray(res.data) && res.data[0] ? res.data[0] : null;
  return { row, missingTable: false };
}

async function upsertWelcomeClaim(email, { userId = null, creditsGranted = 0, source = "grant" } = {}) {
  const emailLower = normalizeEmail(email);
  if (!emailLower) return { ok: false, missingTable: false };

  const payload = {
    email_lower: emailLower,
    last_user_id: userId || null,
    credits_granted: Number(creditsGranted || 0),
    source: String(source || "grant"),
    updated_at: new Date().toISOString(),
  };

  const res = await serviceRest(CLAIMS_TABLE, {
    method: "POST",
    body: payload,
    prefer: "resolution=merge-duplicates,return=minimal",
  });

  return { ok: res.ok, missingTable: res.missingTable, status: res.status };
}

/** Insert-only — returns taken:true if this email already claimed or reserved. */
async function reserveWelcomeClaim(email, userId) {
  const emailLower = normalizeEmail(email);
  if (!emailLower) return { reserved: false };

  const res = await serviceRest(CLAIMS_TABLE, {
    method: "POST",
    body: {
      email_lower: emailLower,
      last_user_id: userId || null,
      credits_granted: 0,
      source: "reserved",
    },
  });

  if (res.missingTable) return { reserved: false, missingTable: true };
  if (res.status === 409) return { reserved: false, taken: true };
  if (!res.ok) return { reserved: false, error: res.status };
  return { reserved: true };
}

async function finalizeWelcomeClaim(email, userId) {
  return upsertWelcomeClaim(email, {
    userId,
    creditsGranted: WELCOME_CREDITS,
    source: "grant",
  });
}

async function releaseWelcomeClaim(email) {
  const emailLower = normalizeEmail(email);
  if (!emailLower) return;
  await serviceRest(
    `${CLAIMS_TABLE}?email_lower=eq.${encodeURIComponent(emailLower)}&source=eq.reserved`,
    { method: "DELETE" },
  );
}

/** Call on account delete so delete→recreate cannot reclaim welcome credits. */
async function recordWelcomeEligibilityUsed(email, { userId = null, source = "account_deleted" } = {}) {
  const emailLower = normalizeEmail(email);
  if (!emailLower) return { ok: false };

  const existing = await fetchWelcomeClaimForEmail(emailLower);
  if (existing.row) return { ok: true, already: true };

  return upsertWelcomeClaim(emailLower, {
    userId,
    creditsGranted: 0,
    source,
  });
}

async function grantSignupWelcomeCreditsIfNeeded(
  userId,
  { email = "", signupPlatform = "", clientShell = "" } = {},
) {
  if (!userId || !Number.isFinite(WELCOME_CREDITS) || WELCOME_CREDITS <= 0) {
    return { granted: 0, skipped: true };
  }

  if (!isWebSignupEligible(signupPlatform, clientShell)) {
    return { granted: 0, skipped: true, webOnly: true };
  }

  const emailLower = normalizeEmail(email);
  if (!emailLower) {
    return { granted: 0, skipped: true, error: "no_email" };
  }

  const claim = await fetchWelcomeClaimForEmail(emailLower);
  if (claim.row) {
    return { granted: 0, skipped: true, already: true, emailBlocked: true };
  }

  const ledgerCheck = await selectFromTable(
    `credit_ledger?select=id&user_id=eq.${encodeURIComponent(userId)}&reason=eq.${encodeURIComponent(WELCOME_REASON)}&limit=1`,
  );
  if (ledgerCheck.ok && Array.isArray(ledgerCheck.data) && ledgerCheck.data.length > 0) {
    if (!claim.missingTable) {
      await finalizeWelcomeClaim(emailLower, userId);
    }
    return { granted: 0, skipped: true, already: true };
  }

  let reserved = { missingTable: claim.missingTable };
  if (!claim.missingTable) {
    reserved = await reserveWelcomeClaim(emailLower, userId);
    if (reserved.taken) {
      return { granted: 0, skipped: true, already: true, emailBlocked: true };
    }
  }

  const rpc = await callRpc("grant_promo_credits", {
    p_user_id: userId,
    p_amount: WELCOME_CREDITS,
    p_reason: WELCOME_REASON,
    p_ref: "new_user_web",
  });

  if (!rpc.ok || !rpc.data?.ok) {
    if (reserved.reserved) await releaseWelcomeClaim(emailLower);
    return {
      granted: 0,
      skipped: true,
      error: rpc.data?.message || rpc.error || "grant_failed",
    };
  }

  if (!claim.missingTable) {
    await finalizeWelcomeClaim(emailLower, userId);
  }

  return {
    granted: WELCOME_CREDITS,
    skipped: false,
    balance: Number(rpc.data.balance || 0),
  };
}

module.exports = {
  WELCOME_CREDITS,
  WELCOME_REASON,
  normalizeEmail,
  readSignupPlatform,
  isWebSignupEligible,
  recordWelcomeEligibilityUsed,
  grantSignupWelcomeCreditsIfNeeded,
};
