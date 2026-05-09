/**
 * GET /api/credits/admin
 *
 * Admin-only overview. Visible to emails listed in the ADMIN_EMAILS
 * env var (default: saminaoum2022@gmail.com). Returns:
 *   - master Suno credit balance (live from Suno API)
 *   - per-user balances summary (allocated, spent, outstanding)
 *   - list of promo codes with usage
 *
 * Auth: Authorization: Bearer <supabase access_token>
 */

const {
  verifyUser,
  callRpc,
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
  if (!isAdminEmail(user.email)) return sendJson(res, 403, { error: "Forbidden" });

  const summaryRpc = await callRpc("get_credits_summary", {});
  const summary = (summaryRpc.ok && summaryRpc.data) || {};

  const codesRes = await selectFromTable(
    `promo_codes?select=code,credits,max_redemptions,redemptions,active,expires_at,created_at&order=created_at.desc&limit=200`
  );
  const codes = Array.isArray(codesRes.data) ? codesRes.data : [];

  let masterSuno = null;
  try {
    const apiKey = process.env.SUNO_API_KEY;
    if (apiKey) {
      const r = await fetch("https://api.sunoapi.org/api/v1/generate/credit", {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      const text = await r.text().catch(() => "");
      let data = null;
      try { data = JSON.parse(text); } catch {}
      if (r.ok && data && Number.isFinite(Number(data.data))) {
        masterSuno = Number(data.data);
      }
    }
  } catch {}

  return sendJson(res, 200, {
    ok: true,
    masterSuno,
    summary: {
      users: Number(summary.users || 0),
      allocatedTotal: Number(summary.allocated_total || 0),
      spentTotal: Number(summary.spent_total || 0),
      outstanding: Number(summary.outstanding || 0),
      codesTotal: Number(summary.codes_total || 0),
      codesRedeemed: Number(summary.codes_redeemed || 0),
    },
    codes,
  });
};
