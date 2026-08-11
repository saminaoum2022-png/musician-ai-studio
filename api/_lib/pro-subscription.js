/**
 * NabadAi Pro subscription status (provider-neutral).
 * IAP / App Store webhooks write `pro_subscriptions`; UI reads via /api/credits/me.
 */

const { selectFromTable } = require("./credits-auth");

const ACTIVE_STATUSES = new Set(["active", "trialing", "grace"]);
const WEEKLY_TRIAL_MS = 7 * 24 * 60 * 60 * 1000;

function normalizeProSubscriptionRow(row) {
  if (!row || typeof row !== "object") {
    return {
      active: false,
      planId: null,
      status: null,
      currentPeriodEnd: null,
      provider: null,
      trialStartedAt: null,
      providerSubscriptionId: null,
    };
  }
  let status = String(row.status || "").trim().toLowerCase() || null;
  const planId = String(row.plan_id || row.planId || "").trim() || null;
  const provider = String(row.provider || "").trim() || null;
  const trialStartedAt = row.created_at || row.createdAt || null;
  let currentPeriodEnd = row.current_period_end || row.currentPeriodEnd || null;

  if (planId === "weekly" && trialStartedAt) {
    const createdMs = Date.parse(String(trialStartedAt));
    if (Number.isFinite(createdMs)) {
      const trialEndMs = createdMs + WEEKLY_TRIAL_MS;
      if (Date.now() < trialEndMs) {
        status = "trialing";
        currentPeriodEnd = new Date(trialEndMs).toISOString();
      }
    }
  }

  let active = ACTIVE_STATUSES.has(status);
  if (active && currentPeriodEnd) {
    const endMs = Date.parse(String(currentPeriodEnd));
    if (Number.isFinite(endMs) && endMs <= Date.now()) active = false;
  }
  return { active, planId, status, currentPeriodEnd, provider, trialStartedAt, providerSubscriptionId: row.provider_subscription_id || row.providerSubscriptionId || null };
}

async function fetchProSubscriptionForUser(userId) {
  const uid = String(userId || "").trim();
  if (!uid) return normalizeProSubscriptionRow(null);
  const res = await selectFromTable(
    `pro_subscriptions?select=plan_id,status,current_period_end,provider,provider_subscription_id,created_at,updated_at&user_id=eq.${encodeURIComponent(uid)}&limit=1`
  );
  if (!res.ok) return normalizeProSubscriptionRow(null);
  const row = Array.isArray(res.data) && res.data[0] ? res.data[0] : null;
  return normalizeProSubscriptionRow(row);
}

module.exports = {
  fetchProSubscriptionForUser,
  normalizeProSubscriptionRow,
};
