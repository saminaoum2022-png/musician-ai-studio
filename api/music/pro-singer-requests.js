/**
 * GET  /api/music/pro-singer-requests — list own requests
 * POST /api/music/pro-singer-requests — submit a pro singer performance request
 */

const {
  verifyUser,
  selectFromTable,
  sendJson,
  setCors,
  readJsonBody,
} = require("../_lib/credits-auth");

const SUPABASE_URL = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

const PACKAGES = Object.freeze({
  re_vocal: { tier: "re_vocal", label: "Pro Re-vocal", priceUsd: 49, requestType: "re_vocal" },
  occasion: { tier: "occasion", label: "Occasion song", priceUsd: 99, requestType: "occasion" },
  premium: { tier: "premium", label: "Premium", priceUsd: 149, requestType: "premium" },
});

const SPECIFIC_SINGER_ADDON_USD = 20;

const STATUS_LABELS = Object.freeze({
  submitted: "Submitted",
  confirmed: "Confirmed",
  in_progress: "In production",
  review: "Almost ready",
  delivered: "Ready to listen",
  closed: "Complete",
  cancelled: "Cancelled",
});

async function serviceInsertRequest(row) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return { ok: false, status: 500, data: null };
  }
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/pro_singer_requests`, {
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

function mapRequest(row) {
  if (!row) return null;
  return {
    id: row.id,
    requestType: row.request_type,
    packageTier: row.package_tier,
    priceUsd: Number(row.price_usd || 0),
    songId: row.song_id || "",
    songTitle: row.song_title || "",
    songArtUrl: row.song_art_url || "",
    occasion: row.occasion || "",
    brief: row.brief || "",
    singerNotes: row.singer_notes || "",
    singerId: row.singer_id || null,
    specificSingerAddon: Boolean(row.specific_singer_addon),
    status: row.status,
    statusLabel: STATUS_LABELS[row.status] || row.status,
    paymentStatus: row.payment_status,
    contactEmail: row.contact_email || "",
    contactInstagram: row.contact_instagram || "",
    deliveredSongId: row.delivered_song_id || "",
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
  };
}

function resolvePackage(tier) {
  const key = String(tier || "").trim().toLowerCase();
  return PACKAGES[key] || null;
}

module.exports = async function handler(req, res) {
  setCors(res);
  if (req.method === "OPTIONS") return res.end();

  const user = await verifyUser(req);
  if (!user) return sendJson(res, 401, { error: "Sign in to continue." });

  if (req.method === "GET") {
    const resRows = await selectFromTable(
      `pro_singer_requests?select=*&requester_id=eq.${encodeURIComponent(user.userId)}&order=created_at.desc&limit=50`,
    );
    const rows = Array.isArray(resRows.data) ? resRows.data : [];
    return sendJson(res, 200, {
      requests: rows.map(mapRequest),
      packages: Object.values(PACKAGES).map((p) => ({
        tier: p.tier,
        label: p.label,
        priceUsd: p.priceUsd,
      })),
      specificSingerAddonUsd: SPECIFIC_SINGER_ADDON_USD,
    });
  }

  if (req.method !== "POST") return sendJson(res, 405, { error: "Method not allowed" });

  let body = {};
  try {
    body = (await readJsonBody(req)) || {};
  } catch {
    return sendJson(res, 400, { error: "Invalid JSON body." });
  }

  const pkg = resolvePackage(body.packageTier || body.package_tier);
  if (!pkg) return sendJson(res, 400, { error: "Choose a valid package." });

  const songId = String(body.songId || body.song_id || "").trim();
  const songTitle = String(body.songTitle || body.song_title || "").trim().slice(0, 200);
  const songArtUrl = String(body.songArtUrl || body.song_art_url || "").trim().slice(0, 500);
  const occasion = String(body.occasion || "").trim().slice(0, 120);
  const brief = String(body.brief || "").trim().slice(0, 2000);
  const singerNotes = String(body.singerNotes || body.singer_notes || "").trim().slice(0, 1000);
  const contactEmail = String(body.contactEmail || body.contact_email || user.email || "").trim().slice(0, 200);
  const contactInstagram = String(body.contactInstagram || body.contact_instagram || "").trim().slice(0, 80);
  const singerIdRaw = String(body.singerId || body.singer_id || "").trim();
  const bestMatch = body.bestMatch === true || body.best_match === true || !singerIdRaw;
  let singerId = bestMatch ? null : singerIdRaw;
  const specificSingerAddon = !bestMatch && Boolean(singerId);

  if (pkg.tier === "re_vocal" && !songId) {
    return sendJson(res, 400, { error: "Choose a song from your library for Pro Re-vocal." });
  }
  if ((pkg.tier === "occasion" || pkg.tier === "premium") && !brief && !occasion) {
    return sendJson(res, 400, { error: "Tell us about the occasion or story." });
  }
  if (!brief && pkg.tier === "re_vocal") {
    return sendJson(res, 400, { error: "Add a short brief for the singer." });
  }

  if (singerId) {
    const singerRes = await selectFromTable(
      `pro_singers?select=user_id&user_id=eq.${encodeURIComponent(singerId)}&active=eq.true&limit=1`,
    );
    const singerRow = Array.isArray(singerRes.data) ? singerRes.data[0] : null;
    if (!singerRow?.user_id) {
      return sendJson(res, 400, { error: "That singer is no longer available. Choose Best match." });
    }
    if (singerId === user.userId) {
      return sendJson(res, 400, { error: "You cannot request yourself as the singer." });
    }
  }

  let priceUsd = pkg.priceUsd;
  if (specificSingerAddon) priceUsd += SPECIFIC_SINGER_ADDON_USD;

  const now = new Date().toISOString();
  const insert = await serviceInsertRequest({
    requester_id: user.userId,
    request_type: pkg.requestType,
    package_tier: pkg.tier,
    price_usd: priceUsd,
    song_id: songId,
    song_title: songTitle,
    song_art_url: songArtUrl,
    occasion,
    brief,
    singer_notes: singerNotes,
    singer_id: singerId,
    specific_singer_addon: specificSingerAddon,
    status: "submitted",
    payment_status: "pending",
    contact_email: contactEmail,
    contact_instagram: contactInstagram,
    created_at: now,
    updated_at: now,
  });

  if (!insert.ok) {
    const msg = typeof insert.data === "string"
      ? insert.data
      : insert.data?.message || insert.data?.error || "Could not submit request.";
    return sendJson(res, insert.status || 500, {
      error: String(msg).includes("pro_singer_requests")
        ? "Pro singer requests are not set up yet. Run supabase/pro_singers.sql first."
        : msg,
    });
  }

  const row = Array.isArray(insert.data) ? insert.data[0] : insert.data;
  return sendJson(res, 200, {
    ok: true,
    request: mapRequest(row),
    message: "Request received — we'll contact you within 24 hours with a payment link.",
  });
};
