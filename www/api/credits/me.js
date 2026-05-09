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
  isAdminEmail,
  sendJson,
  setCors,
} = require("../_lib/credits-auth");

module.exports = async function handler(req, res) {
  setCors(res);
  if (req.method === "OPTIONS") return res.end();
  if (req.method !== "GET") return sendJson(res, 405, { error: "Method not allowed" });

  const user = await verifyUser(req);
  if (!user) return sendJson(res, 401, { error: "Not signed in" });

  const balanceRes = await selectFromTable(
    `user_credits?select=balance,updated_at&user_id=eq.${encodeURIComponent(user.userId)}`
  );
  const ledgerRes = await selectFromTable(
    `credit_ledger?select=delta,reason,ref,created_at&user_id=eq.${encodeURIComponent(
      user.userId
    )}&order=created_at.desc&limit=20`
  );

  const balance =
    Array.isArray(balanceRes.data) && balanceRes.data[0]
      ? Number(balanceRes.data[0].balance || 0)
      : 0;
  const ledger = Array.isArray(ledgerRes.data) ? ledgerRes.data : [];

  return sendJson(res, 200, {
    ok: true,
    balance,
    ledger,
    isAdmin: isAdminEmail(user.email),
    email: user.email,
  });
};
