/**
 * POST /api/account/delete
 *
 * Permanently deletes the signed-in user's auth account via Supabase Admin API.
 * Related rows with ON DELETE CASCADE (profiles, user_songs, credits, social, etc.)
 * are removed by the database when configured.
 *
 * Body: { "confirm": "DELETE" }
 * Auth: Authorization: Bearer <supabase access_token>
 */

const { applyCors } = require("../_lib/cors");
const {
  verifyUser,
  sendJson,
  readJsonBody,
} = require("../_lib/credits-auth");
const { recordWelcomeEligibilityUsed } = require("../_lib/signup-welcome-credits");
const { recordStripeTrialEligibilityUsed } = require("../_lib/stripe-trial-claims");
const { fetchProSubscriptionForUser } = require("../_lib/pro-subscription");

const SUPABASE_URL = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

async function deleteAuthUser(userId) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return { ok: false, status: 500, error: "Server not configured for account deletion" };
  }
  try {
    const r = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${encodeURIComponent(userId)}`, {
      method: "DELETE",
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      },
    });
    if (r.ok || r.status === 404) {
      return { ok: true, status: r.status };
    }
    const text = await r.text().catch(() => "");
    return { ok: false, status: r.status, error: text || `auth delete ${r.status}` };
  } catch (e) {
    return { ok: false, status: 500, error: e?.message || String(e) };
  }
}

module.exports = async function handler(req, res) {
  if (applyCors(req, res)) return;
  if (req.method !== "POST") return sendJson(res, 405, { error: "Method not allowed" });

  const user = await verifyUser(req);
  if (!user) return sendJson(res, 401, { error: "Not signed in" });

  const body = await readJsonBody(req);
  if (String(body?.confirm || "").trim() !== "DELETE") {
    return sendJson(res, 400, {
      error: 'Confirmation required. Send { "confirm": "DELETE" } in the request body.',
    });
  }

  const proBeforeDelete = await fetchProSubscriptionForUser(user.userId).catch(() => null);
  if (proBeforeDelete?.active) {
    return sendJson(res, 409, {
      error: "Cancel your NabadAi Pro subscription before deleting your account. Deleting your account does not stop billing.",
      code: "active_subscription",
      provider: proBeforeDelete.provider || null,
    });
  }
  const hadStripeWeekly =
    proBeforeDelete?.provider === "stripe" && String(proBeforeDelete?.planId || "").trim() === "weekly";

  const result = await deleteAuthUser(user.userId);
  if (!result.ok) {
    return sendJson(res, result.status || 500, {
      error: result.error || "Could not delete account",
    });
  }

  void recordWelcomeEligibilityUsed(user.email, {
    userId: user.userId,
    source: "account_deleted",
  });

  if (hadStripeWeekly) {
    void recordStripeTrialEligibilityUsed(user.email, {
      userId: user.userId,
      subscriptionId: proBeforeDelete?.providerSubscriptionId || null,
      source: "account_deleted",
    });
  }

  return sendJson(res, 200, {
    ok: true,
    deleted: true,
    userId: user.userId,
  });
};
