/**
 * GET /api/credits/me
 *
 * Returns the signed-in user's balance + last 20 ledger entries.
 *
 * Auth: Authorization: Bearer <supabase access_token>
 */

const {
  verifyUser,
  selectFromTable,
  callRpc,
  isAdminEmail,
  sendJson,
  setCors,
} = require("../_lib/credits-auth");
const { fetchProfileRole } = require("../_lib/admin-auth");
const { fetchProSubscriptionForUser } = require("../_lib/pro-subscription");
const { grantSignupWelcomeCreditsIfNeeded, WELCOME_CREDITS, readSignupPlatform } = require("../_lib/signup-welcome-credits");

module.exports = async function handler(req, res) {
  setCors(res);
  if (req.method === "OPTIONS") return res.end();
  if (req.method !== "GET") return sendJson(res, 405, { error: "Method not allowed" });

  const user = await verifyUser(req);
  if (!user) return sendJson(res, 401, { error: "Not signed in" });

  const clientShell =
    req.headers["x-nabad-client-shell"] ||
    req.headers["X-Nabad-Client-Shell"] ||
    "";
  const welcome = await grantSignupWelcomeCreditsIfNeeded(user.userId, {
    email: user.email,
    signupPlatform: readSignupPlatform(user.raw),
    clientShell,
  });

  const balanceRes = await selectFromTable(
    `user_credits?select=balance,paid_balance,gift_balance,promo_balance,updated_at&user_id=eq.${encodeURIComponent(user.userId)}`
  );
  const ledgerRes = await selectFromTable(
    `credit_ledger?select=delta,reason,ref,created_at&user_id=eq.${encodeURIComponent(
      user.userId
    )}&order=created_at.desc&limit=20`
  );

  const row =
    Array.isArray(balanceRes.data) && balanceRes.data[0]
      ? balanceRes.data[0]
      : null;
  const balance = row ? Number(row.balance || 0) : 0;
  const paidBalance = row && row.paid_balance != null ? Number(row.paid_balance || 0) : null;
  const giftBalance = row && row.gift_balance != null ? Number(row.gift_balance || 0) : null;
  const promoBalance = row && row.promo_balance != null ? Number(row.promo_balance || 0) : null;
  const bucketsReady = paidBalance != null && giftBalance != null && promoBalance != null;
  const ledger = Array.isArray(ledgerRes.data) ? ledgerRes.data : [];
  const pro = await fetchProSubscriptionForUser(user.userId);
  const role = await fetchProfileRole(user.userId);
  const isAdmin = role === "admin" || isAdminEmail(user.email);
  void callRpc("touch_user_last_active", { p_user_id: user.userId }).catch(() => null);

  return sendJson(res, 200, {
    ok: true,
    balance,
    paidBalance: bucketsReady ? paidBalance : balance,
    giftBalance: bucketsReady ? giftBalance : 0,
    promoBalance: bucketsReady ? promoBalance : 0,
    giftableBalance: bucketsReady ? paidBalance + promoBalance : 0,
    bucketsReady,
    ledger,
    isAdmin,
    email: user.email,
    pro,
    welcomeGranted: welcome.granted > 0 ? welcome.granted : 0,
    welcomeCreditsAmount: WELCOME_CREDITS,
  });
};
