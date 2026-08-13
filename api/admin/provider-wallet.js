/**
 * POST /api/admin/provider-wallet — log a vendor top-up or balance adjustment.
 *
 * Body: { provider, amountUsd?, amountCredits?, note? }
 * Requires providers view + Owner / Admin / Operations role.
 */

const {
  verifyUser,
  sendJson,
  setCors,
  readJsonBody,
} = require("../_lib/credits-auth");
const {
  verifyAdmin,
  adminForbidden,
  adminUnauthorized,
} = require("../_lib/admin-auth");

const SUPABASE_URL = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

const ALLOWED_PROVIDERS = new Set([
  "suno",
  "lyria",
  "elevenlabs",
  "gemini",
  "pollinations",
  "minimax",
  "other",
]);

function canLogProviderTopUp(admin) {
  if (!admin) return false;
  if (admin.isOwner) return true;
  return ["admin", "operations"].includes(String(admin.role || "").toLowerCase());
}

async function insertWalletEvent(row) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return { ok: false, status: 500, data: null };
  }
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/provider_wallet_events`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify(row),
    });
    const text = await r.text().catch(() => "");
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    return { ok: r.ok, status: r.status, data };
  } catch {
    return { ok: false, status: 500, data: null };
  }
}

module.exports = async function handler(req, res) {
  setCors(res);
  if (req.method === "OPTIONS") return res.end();
  if (req.method !== "POST") return sendJson(res, 405, { error: "Method not allowed" });

  const admin = await verifyAdmin(req, { view: "providers" });
  if (!admin) {
    const user = await verifyUser(req);
    if (!user) return adminUnauthorized(res);
    return adminForbidden(res, "You do not have access to log provider top-ups.");
  }
  if (!canLogProviderTopUp(admin)) {
    return adminForbidden(res, "Only Owner / Admin / Operations can log provider top-ups.");
  }

  let body = {};
  try {
    body = await readJsonBody(req);
  } catch {
    return sendJson(res, 400, { error: "Invalid JSON body" });
  }

  const provider = String(body.provider || "").trim().toLowerCase();
  if (!ALLOWED_PROVIDERS.has(provider)) {
    return sendJson(res, 400, { error: "Invalid provider", allowed: [...ALLOWED_PROVIDERS] });
  }

  const amountUsdRaw = body.amountUsd != null ? Number(body.amountUsd) : null;
  const amountCreditsRaw = body.amountCredits != null ? Number(body.amountCredits) : null;
  const amountUsd = amountUsdRaw != null && Number.isFinite(amountUsdRaw) ? amountUsdRaw : null;
  const amountCredits = amountCreditsRaw != null && Number.isFinite(amountCreditsRaw) ? amountCreditsRaw : null;

  if ((amountUsd == null || amountUsd <= 0) && (amountCredits == null || amountCredits <= 0)) {
    return sendJson(res, 400, { error: "Enter amountUsd and/or amountCredits (must be > 0)" });
  }

  const note = String(body.note || "").trim().slice(0, 500);

  const insert = {
    provider,
    event_type: "top_up",
    amount_usd: amountUsd,
    amount_credits: amountCredits,
    note: note || null,
    logged_by: admin.userId,
    logged_by_email: admin.email,
  };

  const result = await insertWalletEvent(insert);
  if (!result.ok) {
    const msg = typeof result.data === "object" && result.data?.message
      ? result.data.message
      : "Could not save top-up — run supabase/provider_wallet_events.sql first.";
    return sendJson(res, result.status >= 400 ? result.status : 500, { error: msg });
  }

  const row = Array.isArray(result.data) ? result.data[0] : result.data;
  return sendJson(res, 200, {
    ok: true,
    event: {
      id: row?.id,
      provider: row?.provider,
      amountUsd: row?.amount_usd != null ? Number(row.amount_usd) : null,
      amountCredits: row?.amount_credits != null ? Number(row.amount_credits) : null,
      note: row?.note || "",
      createdAt: row?.created_at,
    },
  });
};
