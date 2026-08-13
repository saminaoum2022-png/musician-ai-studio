/**
 * POST /api/credits/grant-paid
 * Body: { amount: number, userId?: uuid, email?: string }
 *
 * Admin-only: grants paid credits (giftable) for testing / future IAP wiring.
 * Omit userId and email to grant to the signed-in admin.
 */
const {
  verifyUser,
  callRpc,
  sendJson,
  setCors,
  readJsonBody,
  selectFromTable,
} = require("../_lib/credits-auth");
const {
  verifyAdmin,
  resolveUserIdByEmail,
  adminForbidden,
  adminUnauthorized,
} = require("../_lib/admin-auth");

module.exports = async function handler(req, res) {
  setCors(res);
  if (req.method === "OPTIONS") return res.end();
  if (req.method !== "POST") return sendJson(res, 405, { error: "Method not allowed" });

  const admin = await verifyAdmin(req, { requireGrantCredits: true });
  if (!admin) {
    const user = await verifyUser(req);
    if (!user) return adminUnauthorized(res);
    return adminForbidden(res, "You do not have permission to grant credits.");
  }
  const user = admin;

  let body = {};
  try {
    body = (await readJsonBody(req)) || {};
  } catch {
    return sendJson(res, 400, { error: "Invalid JSON body." });
  }

  const amount = Number(body?.amount);
  if (!Number.isFinite(amount) || amount <= 0 || amount > 500) {
    return sendJson(res, 400, { error: "Amount must be between 1 and 500." });
  }

  const email = String(body?.email || "").trim().toLowerCase();
  const explicitUserId = String(body?.userId || body?.user_id || "").trim();
  let targetUserId = explicitUserId || user.userId;
  let targetEmail = email || user.email || "";

  if (email) {
    const resolved = await resolveUserIdByEmail(email);
    if (!resolved) {
      return sendJson(res, 404, { error: `No user found for ${email}.` });
    }
    targetUserId = resolved;
    targetEmail = email;
  } else if (explicitUserId) {
    targetUserId = explicitUserId;
  }

  const rpc = await callRpc("grant_paid_credits", {
    p_user_id: targetUserId,
    p_amount: amount,
    p_ref: `admin:${user.userId}`,
  });

  if (rpc.skipped || rpc.status === 404) {
    return sendJson(res, 503, {
      error: "Run supabase/gifts.sql in Supabase first.",
      code: "gifts_not_migrated",
    });
  }

  const out = rpc.data || {};
  if (!rpc.ok || out.ok === false) {
    return sendJson(res, 400, { error: out.message || "Grant failed." });
  }

  const granted = Number(out.granted ?? amount);
  const balanceAfter = Number(out.balance);
  const balanceBefore = Number.isFinite(balanceAfter) ? balanceAfter - granted : null;
  const grantRef = `admin:${user.userId}`;

  if (Number.isFinite(granted) && granted > 0 && Number.isFinite(balanceBefore)) {
    let ledgerId = null;
    try {
      const ledgerLookup = await selectFromTable(
        `credit_ledger?select=id&user_id=eq.${encodeURIComponent(targetUserId)}&reason=eq.paid_purchase&ref=eq.${encodeURIComponent(grantRef)}&order=created_at.desc&limit=1`,
      );
      ledgerId = Array.isArray(ledgerLookup.data) && ledgerLookup.data[0]?.id
        ? ledgerLookup.data[0].id
        : null;
    } catch {
      ledgerId = null;
    }

    await callRpc("log_credit_transaction", {
      p_user_id: targetUserId,
      p_delta: granted,
      p_balance_before: balanceBefore,
      p_balance_after: balanceAfter,
      p_reason: "paid_purchase",
      p_ref: grantRef,
      p_ledger_id: ledgerId,
    }).catch(() => null);
  }

  return sendJson(res, 200, {
    ok: true,
    userId: targetUserId,
    email: targetEmail || null,
    granted: out.granted,
    balance: out.balance,
    paidBalance: out.paid_balance,
    giftBalance: out.gift_balance,
    promoBalance: out.promo_balance,
  });
};
