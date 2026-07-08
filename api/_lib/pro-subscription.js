/**
 * NabadAi Pro subscription status (provider-neutral).
 * IAP / App Store webhooks write `pro_subscriptions`; UI reads via /api/credits/me.
 */

const { selectFromTable } = require("./credits-auth");

const ACTIVE_STATUSES = new Set(["active", "trialing", "grace"]);

function normalizeProSubscriptionRow(row) {
  if (!row || typeof row !== "object") {
    return { active: false, planId: null, status: null, currentPeriodEnd: null, provider: null };
  }
  const status = String(row.status || "").trim().toLowerCase() || null;
  const planId = String(row.plan_id || row.planId || "").trim() || null;
  const provider = String(row.provider || "").trim() || null;
  const currentPeriodEnd = row.current_period_end || row.currentPeriodEnd || null;
  let active = ACTIVE_STATUSES.has(status);
  if (active && currentPeriodEnd) {
    const endMs = Date.parse(String(currentPeriodEnd));
    if (Number.isFinite(endMs) && endMs <= Date.now()) active = false;
  }
  return { active, planId, status, currentPeriodEnd, provider };
}

async function fetchProSubscriptionForUser(userId) {
  const uid = String(userId || "").trim();
  if (!uid) return normalizeProSubscriptionRow(null);
  const res = await selectFromTable(
    `pro_subscriptions?select=plan_id,status,current_period_end,provider,updated_at&user_id=eq.${encodeURIComponent(uid)}&limit=1`
  );
  if (!res.ok) return normalizeProSubscriptionRow(null);
  const row = Array.isArray(res.data) && res.data[0] ? res.data[0] : null;
  return normalizeProSubscriptionRow(row);
}

module.exports = {
  fetchProSubscriptionForUser,
  normalizeProSubscriptionRow,
};
