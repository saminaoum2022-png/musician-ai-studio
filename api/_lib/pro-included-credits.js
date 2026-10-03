/**
 * Included Pro credits bucket (refresh each billing period, removed when the subscription expires).
 * Requires supabase/pro_included_credits.sql. Every helper is a safe no-op when it is not applied yet.
 */

const { callRpc, selectFromTable } = require("./credits-auth");
const { resolveProCreditPolicy } = require("./billing-config");

function cleanUserId(v) {
  const s = String(v || "").trim().toLowerCase();
  return /^[0-9a-f-]{36}$/.test(s) ? s : "";
}

/**
 * Reads status + credit_policy. `supported: false` means the column is missing (SQL not applied):
 * callers must then keep the old additive behaviour.
 */
async function fetchProCreditPolicyRow(userId) {
  const uid = cleanUserId(userId);
  if (!uid) return { supported: false };
  const res = await selectFromTable(
    `pro_subscriptions?select=status,credit_policy&user_id=eq.${encodeURIComponent(uid)}&limit=1`,
  );
  if (!res.ok) return { supported: false };
  const row = Array.isArray(res.data) && res.data[0] ? res.data[0] : null;
  return {
    supported: true,
    exists: Boolean(row),
    status: String(row?.status || "").toLowerCase(),
    policy: String(row?.credit_policy || "").toLowerCase(),
  };
}

/** Effective policy for a grant that is about to happen (applies the 1 Nov switch for grandfathered rows). */
async function effectiveProCreditPolicy(userId) {
  const row = await fetchProCreditPolicyRow(userId);
  if (!row.supported || !row.exists) return { supported: row.supported, policy: "", stored: "" };
  const policy = resolveProCreditPolicy({ storedPolicy: row.policy, incomingStatus: row.status });
  return { supported: true, policy, stored: row.policy };
}

/** Subscription ended: remove unspent included credits. */
async function expireProIncludedCredits(userId, ref = "") {
  const uid = cleanUserId(userId);
  if (!uid) return { expired: 0, skipped: true };
  const rpc = await callRpc("expire_pro_included_credits", {
    p_user_id: uid,
    p_ref: String(ref || "pro_end").trim(),
  });
  const out = rpc.data || {};
  if (rpc.skipped || rpc.status === 404) {
    return { expired: 0, skipped: true, error: "pro_included_not_migrated" };
  }
  if (!rpc.ok || out.ok === false) {
    return { expired: 0, skipped: true, error: out.message || "expire_failed" };
  }
  return { expired: Number(out.expired || 0), skipped: false, balance: out.balance };
}

module.exports = {
  fetchProCreditPolicyRow,
  effectiveProCreditPolicy,
  expireProIncludedCredits,
};
