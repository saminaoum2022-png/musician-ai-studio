/**
 * POST /api/credits/redeem
 * Body: { code: string }
 *
 * Atomic + idempotent. If the same user retries a code they already
 * redeemed, we return ok=true with status="already_redeemed" and the
 * current balance — no double-credit, no error toast.
 *
 * Auth: Authorization: Bearer <supabase access_token>
 */

const {
  verifyUser,
  callRpc,
  sendJson,
  setCors,
  readJsonBody,
} = require("../_lib/credits-auth");

module.exports = async function handler(req, res) {
  setCors(res);
  if (req.method === "OPTIONS") return res.end();
  if (req.method !== "POST") return sendJson(res, 405, { error: "Method not allowed" });

  const user = await verifyUser(req);
  if (!user) return sendJson(res, 401, { error: "Not signed in" });

  const body = await readJsonBody(req);
  const code = String(body?.code || "").trim().toUpperCase();
  if (!code) return sendJson(res, 400, { error: "Missing code" });
  if (code.length > 64) return sendJson(res, 400, { error: "Code too long" });

  const rpc = await callRpc("redeem_promo_code", {
    p_user_id: user.userId,
    p_code: code,
  });

  if (!rpc.ok) {
    return sendJson(res, rpc.status || 502, {
      ok: false,
      error: "Server error redeeming code",
      details: rpc.data || rpc.error || null,
    });
  }

  const out = rpc.data || {};
  return sendJson(res, 200, {
    ok: Boolean(out.ok),
    status: String(out.status || ""),
    balance: Number(out.balance || 0),
    creditsAdded: Number(out.credits_added || 0),
    message: String(out.message || ""),
  });
};
