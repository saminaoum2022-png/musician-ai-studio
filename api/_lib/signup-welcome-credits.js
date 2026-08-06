/**
 * One-time welcome credits for new signups (web users can't buy yet).
 * Uses existing refund_credits RPC → promo_balance. Idempotent via ledger check.
 */

const { callRpc, selectFromTable } = require("./credits-auth");

const WELCOME_CREDITS = Number(process.env.SIGNUP_WELCOME_CREDITS || 24);
const WELCOME_REASON = "signup_welcome";

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

async function grantSignupWelcomeCreditsIfNeeded(userId, { signupPlatform = "", clientShell = "" } = {}) {
  if (!userId || !Number.isFinite(WELCOME_CREDITS) || WELCOME_CREDITS <= 0) {
    return { granted: 0, skipped: true };
  }

  if (!isWebSignupEligible(signupPlatform, clientShell)) {
    return { granted: 0, skipped: true, webOnly: true };
  }

  const check = await selectFromTable(
    `credit_ledger?select=id&user_id=eq.${encodeURIComponent(userId)}&reason=eq.${encodeURIComponent(WELCOME_REASON)}&limit=1`,
  );
  if (check.ok && Array.isArray(check.data) && check.data.length > 0) {
    return { granted: 0, skipped: true, already: true };
  }

  const rpc = await callRpc("refund_credits", {
    p_user_id: userId,
    p_amount: WELCOME_CREDITS,
    p_reason: WELCOME_REASON,
    p_ref: "new_user_web",
  });

  if (!rpc.ok || !rpc.data?.ok) {
    return {
      granted: 0,
      skipped: true,
      error: rpc.data?.message || rpc.error || "grant_failed",
    };
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
  readSignupPlatform,
  isWebSignupEligible,
  grantSignupWelcomeCreditsIfNeeded,
};
