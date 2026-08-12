/**
 * POST /api/admin/promos — create promo code(s)
 * PATCH /api/admin/promos — toggle active { code, active }
 *
 * Requires promos view + grant-credits permission (Owner / Admin / Support).
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

const PROMO_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function randSuffix(len = 4) {
  let out = "";
  for (let i = 0; i < len; i += 1) {
    out += PROMO_ALPHABET[Math.floor(Math.random() * PROMO_ALPHABET.length)];
  }
  return out;
}

function normalizeCode(code) {
  return String(code || "").trim().toUpperCase().replace(/\s+/g, "-");
}

async function serviceInsertPromos(rows) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return { ok: false, status: 500, data: null };
  }
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/promo_codes`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify(rows),
    });
    const text = await r.text().catch(() => "");
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    return { ok: r.ok, status: r.status, data };
  } catch {
    return { ok: false, status: 500, data: null };
  }
}

async function servicePatchPromo(code, body) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return { ok: false, status: 500 };
  }
  try {
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/promo_codes?code=eq.${encodeURIComponent(code)}`,
      {
        method: "PATCH",
        headers: {
          apikey: SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          "Content-Type": "application/json",
          Prefer: "return=representation",
        },
        body: JSON.stringify(body),
      },
    );
    const text = await r.text().catch(() => "");
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    return { ok: r.ok, status: r.status, data };
  } catch {
    return { ok: false, status: 500, data: null };
  }
}

function buildPromoRows(body) {
  const credits = Number(body.credits);
  const maxRedemptions = Number(body.maxRedemptions ?? body.max_redemptions ?? 1);
  const expiresAt = body.expiresAt || body.expires_at || null;
  const active = body.active !== false;

  if (!Number.isFinite(credits) || credits <= 0 || credits > 5000) {
    return { error: "Credits must be between 1 and 5000." };
  }
  if (!Number.isFinite(maxRedemptions) || maxRedemptions <= 0 || maxRedemptions > 10000) {
    return { error: "Max redemptions must be between 1 and 10000." };
  }

  let expires = null;
  if (expiresAt) {
    const d = new Date(expiresAt);
    if (Number.isNaN(d.getTime())) return { error: "Invalid expiry date." };
    expires = d.toISOString();
  }

  const batchCount = Math.min(Math.max(Number(body.count) || 1, 1), 50);
  const prefix = normalizeCode(body.prefix || "");
  const singleCode = normalizeCode(body.code || "");

  if (prefix && (!singleCode || batchCount > 1)) {
    if (prefix.length < 3) {
      return { error: "Batch create requires a prefix of at least 3 characters." };
    }
    const seen = new Set();
    const rows = [];
    let guard = 0;
    while (rows.length < batchCount && guard < batchCount * 20) {
      guard += 1;
      const code = `${prefix}-${randSuffix(4)}`;
      if (seen.has(code)) continue;
      seen.add(code);
      rows.push({
        code,
        credits: Math.round(credits),
        max_redemptions: Math.round(maxRedemptions),
        redemptions: 0,
        active,
        expires_at: expires,
      });
    }
    if (rows.length < batchCount) {
      return { error: "Could not generate enough unique codes — try again." };
    }
    return { rows };
  }

  if (!singleCode || singleCode.length < 4) {
    return { error: "Enter a promo code (min 4 characters) or use batch mode with a prefix." };
  }
  return {
    rows: [{
      code: singleCode,
      credits: Math.round(credits),
      max_redemptions: Math.round(maxRedemptions),
      redemptions: 0,
      active,
      expires_at: expires,
    }],
  };
}

module.exports = async function handler(req, res) {
  setCors(res);
  if (req.method === "OPTIONS") return res.end();

  const admin = await verifyAdmin(req, { view: "promos", requireGrantCredits: true });
  if (!admin) {
    const user = await verifyUser(req);
    if (!user) return adminUnauthorized(res);
    return adminForbidden(res, "You do not have permission to manage promo codes.");
  }

  if (req.method === "POST") {
    const body = await readJsonBody(req);
    const built = buildPromoRows(body || {});
    if (built.error) return sendJson(res, 400, { error: built.error });

    const insert = await serviceInsertPromos(built.rows);
    if (!insert.ok) {
      const msg = insert.status === 409
        ? "A promo code with that name already exists."
        : "Could not create promo code.";
      return sendJson(res, insert.status >= 400 ? insert.status : 500, { error: msg });
    }

    const created = Array.isArray(insert.data) ? insert.data : [insert.data].filter(Boolean);
    return sendJson(res, 200, {
      ok: true,
      created: created.map((row) => ({
        code: row.code,
        credits: Number(row.credits),
        maxRedemptions: Number(row.max_redemptions),
        active: Boolean(row.active),
        expiresAt: row.expires_at || null,
      })),
      codes: created.map((row) => row.code),
      message: created.length > 1
        ? `Created ${created.length} promo codes.`
        : `Created promo code ${created[0]?.code || ""}.`.trim(),
    });
  }

  if (req.method === "PATCH") {
    const body = await readJsonBody(req);
    const code = normalizeCode(body?.code);
    if (!code) return sendJson(res, 400, { error: "Missing promo code." });
    if (typeof body.active !== "boolean") {
      return sendJson(res, 400, { error: "Set active to true or false." });
    }

    const patch = await servicePatchPromo(code, { active: body.active });
    if (!patch.ok) {
      return sendJson(res, patch.status >= 400 ? patch.status : 500, {
        error: "Could not update promo code.",
      });
    }
    const row = Array.isArray(patch.data) ? patch.data[0] : patch.data;
    return sendJson(res, 200, {
      ok: true,
      code,
      active: Boolean(row?.active ?? body.active),
      message: body.active ? `Activated ${code}.` : `Deactivated ${code}.`,
    });
  }

  return sendJson(res, 405, { error: "Method not allowed" });
};
