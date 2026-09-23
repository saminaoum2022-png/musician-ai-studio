/**
 * Trial credit bucket: grant / convert on subscribe / expire if they walk away.
 * Requires supabase/trial_credits.sql on the shared DB.
 */

const { callRpc, selectFromTable } = require("./credits-auth");

function isTrialGrant({ periodType, eventType, subscriptionStatus } = {}) {
  const period = String(periodType || "").toUpperCase();
  const type = String(eventType || "").toUpperCase();
  const status = String(subscriptionStatus || "").toLowerCase();
  if (period === "TRIAL" || status === "trialing") {
    return type === "INITIAL_PURCHASE" || type === "";
  }
  return false;
}

async function grantTrialCredits({ userId, amount, ref }) {
  const uid = String(userId || "").trim();
  const credits = Number(amount || 0);
  if (!uid || !Number.isFinite(credits) || credits <= 0) {
    return { granted: 0, skipped: true };
  }
  const rpc = await callRpc("grant_trial_credits", {
    p_user_id: uid,
    p_amount: credits,
    p_ref: String(ref || "").trim(),
  });
  const out = rpc.data || {};
  if (rpc.skipped || rpc.status === 404) {
    return { granted: 0, skipped: true, error: "trial_credits_not_migrated" };
  }
  if (out.duplicate === true) {
    return { granted: 0, skipped: true, duplicate: true, balance: out.balance };
  }
  if (!rpc.ok || out.ok === false) {
    return { granted: 0, skipped: true, error: out.message || "grant_failed" };
  }
  return { granted: credits, skipped: false, balance: out.balance, trialBalance: out.trial_balance };
}

async function convertTrialCreditsToPaid(userId, ref = "") {
  const uid = String(userId || "").trim();
  if (!uid) return { converted: 0, skipped: true };
  const rpc = await callRpc("convert_trial_credits_to_paid", {
    p_user_id: uid,
    p_ref: String(ref || "").trim(),
  });
  const out = rpc.data || {};
  if (rpc.skipped || rpc.status === 404 || !rpc.ok || out.ok === false) {
    return { converted: 0, skipped: true };
  }
  return { converted: Number(out.converted || 0), skipped: false, balance: out.balance };
}

async function expireUnusedTrialCredits(userId, ref = "") {
  const uid = String(userId || "").trim();
  if (!uid) return { expired: 0, skipped: true };
  const rpc = await callRpc("expire_unused_trial_credits", {
    p_user_id: uid,
    p_ref: String(ref || "trial_end").trim(),
  });
  const out = rpc.data || {};
  if (rpc.skipped || rpc.status === 404) {
    return { expired: 0, skipped: true, error: "trial_credits_not_migrated" };
  }
  if (out.duplicate === true) {
    return { expired: 0, skipped: true, duplicate: true, balance: out.balance };
  }
  if (!rpc.ok || out.ok === false) {
    return { expired: 0, skipped: true, error: out.message || "expire_failed" };
  }
  return {
    expired: Number(out.expired || 0),
    skipped: false,
    balance: out.balance,
    trialBalance: out.trial_balance,
  };
}

async function remainingTrialCreditsToProtect(userId) {
  const uid = String(userId || "").trim();
  if (!uid) return 0;
  const res = await selectFromTable(
    `user_credits?select=trial_balance,paid_balance&user_id=eq.${encodeURIComponent(uid)}&limit=1`,
  );
  const row = Array.isArray(res.data) && res.data[0] ? res.data[0] : null;
  const trial = Number(row?.trial_balance || 0);
  if (Number.isFinite(trial) && trial > 0) return trial;
  return 0;
}

module.exports = {
  isTrialGrant,
  grantTrialCredits,
  convertTrialCreditsToPaid,
  expireUnusedTrialCredits,
  remainingTrialCreditsToProtect,
};
