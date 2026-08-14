/**
 * GET  /api/music/singer-applications — own application status
 * POST /api/music/singer-applications — apply or re-apply as NabadAi Singer
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

function normalizeInstagram(raw) {
  let s = String(raw || "").trim();
  if (!s) return "";
  s = s.replace(/^https?:\/\/(www\.)?instagram\.com\//i, "");
  s = s.replace(/^@+/, "");
  s = s.replace(/\/+$/, "");
  return s.slice(0, 80);
}

async function serviceUpsertApplication(row) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return { ok: false, status: 500, data: null };
  }
  try {
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/singer_applications?on_conflict=user_id`,
      {
        method: "POST",
        headers: {
          apikey: SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          "Content-Type": "application/json",
          Prefer: "resolution=merge-duplicates,return=representation",
        },
        body: JSON.stringify(row),
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

function normalizePhotoUrl(raw) {
  const s = String(raw || "").trim();
  if (!s) return "";
  if (!s.startsWith("data:image/")) return "";
  if (s.length > 400000) return "";
  return s;
}

function mapApplication(row) {
  if (!row) return null;
  return {
    id: row.id,
    status: row.status,
    displayName: row.display_name || "",
    instagram: row.instagram || "",
    languages: row.languages || "",
    genres: row.genres || "",
    demoUrl: row.demo_url || "",
    bio: row.bio || "",
    photoUrl: row.photo_url || "",
    adminNotes: row.admin_notes || "",
    reviewedAt: row.reviewed_at || null,
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
  };
}

module.exports = async function handler(req, res) {
  setCors(res);
  if (req.method === "OPTIONS") return res.end();

  const user = await verifyUser(req);
  if (!user) return sendJson(res, 401, { error: "Sign in to continue." });

  if (req.method === "GET") {
    const existing = await selectFromTable(
      `singer_applications?select=*&user_id=eq.${encodeURIComponent(user.userId)}&limit=1`,
    );
    const row = Array.isArray(existing.data) ? existing.data[0] : null;
    const roster = await selectFromTable(
      `pro_singers?select=user_id,active&user_id=eq.${encodeURIComponent(user.userId)}&limit=1`,
    );
    const singerRow = Array.isArray(roster.data) ? roster.data[0] : null;
    return sendJson(res, 200, {
      application: mapApplication(row),
      isApprovedSinger: Boolean(singerRow?.active),
    });
  }

  if (req.method !== "POST") return sendJson(res, 405, { error: "Method not allowed" });

  let body = {};
  try {
    body = (await readJsonBody(req)) || {};
  } catch {
    return sendJson(res, 400, { error: "Invalid JSON body." });
  }

  const instagram = normalizeInstagram(body.instagram);
  const displayName = String(body.displayName || body.display_name || "").trim().slice(0, 80);
  const languages = String(body.languages || "").trim().slice(0, 200);
  const genres = String(body.genres || "").trim().slice(0, 200);
  const demoUrl = String(body.demoUrl || body.demo_url || "").trim().slice(0, 500);
  const bio = String(body.bio || "").trim().slice(0, 1000);
  const photoUrl = normalizePhotoUrl(body.photoUrl || body.photo_url);

  if (!instagram || instagram.length < 2) {
    return sendJson(res, 400, { error: "Instagram handle is required." });
  }
  if (!displayName) {
    return sendJson(res, 400, { error: "Display name is required." });
  }
  if (!photoUrl) {
    return sendJson(res, 400, { error: "Profile photo is required." });
  }

  const existing = await selectFromTable(
    `singer_applications?select=status&user_id=eq.${encodeURIComponent(user.userId)}&limit=1`,
  );
  const prev = Array.isArray(existing.data) ? existing.data[0] : null;
  if (prev?.status === "approved") {
    return sendJson(res, 400, { error: "You are already an approved NabadAi Singer." });
  }
  if (prev?.status === "pending") {
    return sendJson(res, 400, { error: "Your application is already under review." });
  }

  const now = new Date().toISOString();
  const upsert = await serviceUpsertApplication({
    user_id: user.userId,
    display_name: displayName,
    instagram,
    languages,
    genres,
    demo_url: demoUrl,
    bio,
    photo_url: photoUrl,
    status: "pending",
    admin_notes: prev?.status === "rejected" ? "" : (prev?.admin_notes || ""),
    reviewed_at: null,
    updated_at: now,
    ...(prev ? {} : { created_at: now }),
  });

  if (!upsert.ok) {
    const msg = typeof upsert.data === "string"
      ? upsert.data
      : upsert.data?.message || upsert.data?.error || "Could not save application.";
    return sendJson(res, upsert.status || 500, {
      error: String(msg).includes("singer_applications")
        ? "Singer applications are not set up yet. Run supabase/pro_singers.sql first."
        : msg,
    });
  }

  const row = Array.isArray(upsert.data) ? upsert.data[0] : upsert.data;
  return sendJson(res, 200, {
    ok: true,
    application: mapApplication(row),
    message: "Application received — we review within a few days.",
  });
};
