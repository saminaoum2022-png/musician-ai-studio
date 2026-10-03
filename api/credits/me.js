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
const { ensureProfileRow } = require("../_lib/ensure-profile-row");
const { GIFT_DAILY_LIMIT, GIFT_RECIPIENT_DAILY_LIMIT, GIFT_EXPIRY_DAYS } = require("../_lib/gift-config");

module.exports = async function handler(req, res) {
  setCors(res);
  if (req.method === "OPTIONS") return res.end();
  if (req.method !== "GET") return sendJson(res, 405, { error: "Method not allowed" });

  const user = await verifyUser(req);
  if (!user) return sendJson(res, 401, { error: "Not signed in" });

  await ensureProfileRow(user).catch(() => null);

  const clientShell =
    req.headers["x-nabad-client-shell"] ||
    req.headers["X-Nabad-Client-Shell"] ||
    "";
  const welcome = await grantSignupWelcomeCreditsIfNeeded(user.userId, {
    email: user.email,
    signupPlatform: readSignupPlatform(user.raw),
    clientShell,
  });

  // Remove gifted credits past their 30-day expiry before reading balances (no-op until gift_credit_lots.sql).
  await callRpc("expire_gift_credit_lots", { p_user_id: user.userId }).catch(() => null);

  const balanceRes = await selectFromTable(
    `user_credits?select=balance,paid_balance,gift_balance,promo_balance,trial_balance,updated_at&user_id=eq.${encodeURIComponent(user.userId)}`
  );
  // Included Pro credits (needs supabase/pro_included_credits.sql); absent column → 0.
  const includedRes = await selectFromTable(
    `user_credits?select=pro_included_balance&user_id=eq.${encodeURIComponent(user.userId)}`
  );
  const proIncludedBalance =
    includedRes.ok && Array.isArray(includedRes.data) && includedRes.data[0]
      ? Number(includedRes.data[0].pro_included_balance || 0)
      : 0;
  const nowIso = new Date().toISOString();
  const since24hIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const lotsRes = await selectFromTable(
    `gift_credit_lots?select=remaining,expires_at&user_id=eq.${encodeURIComponent(user.userId)}&remaining=gt.0&expires_at=gt.${encodeURIComponent(nowIso)}&order=expires_at.asc&limit=20`
  );
  const giftLots =
    lotsRes.ok && Array.isArray(lotsRes.data)
      ? lotsRes.data.map((l) => ({ amount: Number(l.remaining || 0), expiresAt: l.expires_at }))
      : [];
  const sentRes = await selectFromTable(
    `gift_events?select=amount&sender_user_id=eq.${encodeURIComponent(user.userId)}&created_at=gt.${encodeURIComponent(since24hIso)}&limit=200`
  );
  const giftSentLast24h =
    sentRes.ok && Array.isArray(sentRes.data)
      ? sentRes.data.reduce((sum, g) => sum + Number(g.amount || 0), 0)
      : 0;
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
  const trialBalance = row && row.trial_balance != null ? Number(row.trial_balance || 0) : 0;
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
    trialBalance: bucketsReady ? trialBalance : 0,
    proIncludedBalance,
    // Included Pro + paid + promo are giftable; received gifts and trial credits are not.
    giftableBalance: bucketsReady ? paidBalance + promoBalance + proIncludedBalance : 0,
    giftLots,
    giftSentLast24h,
    giftDailyLimit: GIFT_DAILY_LIMIT,
    giftRecipientDailyLimit: GIFT_RECIPIENT_DAILY_LIMIT,
    giftExpiryDays: GIFT_EXPIRY_DAYS,
    bucketsReady,
    ledger,
    isAdmin,
    email: user.email,
    pro,
    welcomeGranted: welcome.granted > 0 ? welcome.granted : 0,
    welcomeCreditsAmount: WELCOME_CREDITS,
  });
};
