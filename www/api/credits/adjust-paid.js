/**
 * POST /api/credits/adjust-paid
 * Body: {
 *   amount: number (>0),
 *   action?: "remove" | "add"   (default "remove")
 *   email?: string,
 *   userId?: uuid,
 *   reason?: string            (required for remove; logged in ledger)
 * }
 *
 * Admin-only: add or remove paid credits for TestFlight cleanup / support.
 */
const {
  verifyUser,
  callRpc,
  sendJson,
  setCors,
  readJsonBody,
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
    return adminForbidden(res, "You do not have permission to adjust credits.");
  }

  let body = {};
  try {
    body = (await readJsonBody(req)) || {};
  } catch {
    return sendJson(res, 400, { error: "Invalid JSON body." });
  }

  const action = String(body?.action || "remove").trim().toLowerCase() === "add" ? "add" : "remove";
  const amount = Number(body?.amount);
  if (!Number.isFinite(amount) || amount <= 0 || amount > 10000) {
    return sendJson(res, 400, { error: "Amount must be between 1 and 10000." });
  }

  const reasonRaw = String(body?.reason || "").trim();
  if (action === "remove" && reasonRaw.length < 3) {
    return sendJson(res, 400, { error: "Add a short reason (e.g. TestFlight sandbox cleanup)." });
  }

  const email = String(body?.email || "").trim().toLowerCase();
  const explicitUserId = String(body?.userId || body?.user_id || "").trim();
  let targetUserId = explicitUserId || "";
  let targetEmail = email || "";

  if (email) {
    const resolved = await resolveUserIdByEmail(email);
    if (!resolved) {
      return sendJson(res, 404, { error: `No user found for ${email}.` });
    }
    targetUserId = resolved;
    targetEmail = email;
  } else if (explicitUserId) {
    targetUserId = explicitUserId;
  } else {
    return sendJson(res, 400, { error: "Provide an email or userId." });
  }

  const delta = action === "add" ? amount : -amount;
  const reason =
    reasonRaw ||
    (action === "add" ? "admin_adjust" : "admin_remove");
  const ref = `admin:${admin.userId}:${action}`;

  const rpc = await callRpc("adjust_paid_credits", {
    p_user_id: targetUserId,
    p_delta: delta,
    p_reason: reason.slice(0, 80),
    p_ref: ref,
  });

  if (rpc.skipped || rpc.status === 404) {
    return sendJson(res, 503, {
      error: "Run supabase/adjust_paid_credits.sql in Supabase first.",
      code: "adjust_paid_not_migrated",
    });
  }

  const out = rpc.data || {};
  if (!rpc.ok || out.ok === false) {
    return sendJson(res, 400, { error: out.message || "Adjust failed." });
  }

  return sendJson(res, 200, {
    ok: true,
    action,
    userId: targetUserId,
    email: targetEmail || null,
    delta: Number(out.delta),
    requested: delta,
    balance: out.balance,
    paidBalance: out.paid_balance,
    giftBalance: out.gift_balance,
    promoBalance: out.promo_balance,
    reason,
  });
};
