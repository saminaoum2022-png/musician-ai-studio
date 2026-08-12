/**
 * POST /api/admin/moderate — admin moderation actions
 * Body: { action: "unpublish", songId: "uuid", reason?: string }
 *
 * Admin + Moderator roles only.
 */

const {
  verifyUser,
  sendJson,
  setCors,
  readJsonBody,
  selectFromTable,
} = require("../_lib/credits-auth");
const {
  verifyAdmin,
  adminForbidden,
  adminUnauthorized,
} = require("../_lib/admin-auth");
const { insertAuditRow } = require("../_lib/admin-audit");

const SUPABASE_URL = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

async function servicePatch(path, body) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return { ok: false, status: 500, data: null };
  }
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
      method: "PATCH",
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify(body || {}),
    });
    const text = await r.text().catch(() => "");
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    return { ok: r.ok, status: r.status, data };
  } catch {
    return { ok: false, status: 500, data: null };
  }
}

async function unpublishSong(admin, songId, reason = "") {
  const res = await selectFromTable(
    `user_songs?select=id,user_id,title,public_on_profile,published_at&id=eq.${encodeURIComponent(songId)}&limit=1`,
  );
  const row = Array.isArray(res.data) ? res.data[0] : null;
  if (!row?.id) {
    return { status: 404, body: { error: "Song not found." } };
  }
  if (row.public_on_profile !== true && row.public_on_profile !== "t") {
    return { status: 400, body: { error: "Song is not public." } };
  }

  const now = new Date().toISOString();
  const patch = await servicePatch(
    `user_songs?id=eq.${encodeURIComponent(songId)}`,
    {
      public_on_profile: false,
      published_at: null,
      updated_at: now,
    },
  );
  if (!patch.ok) {
    return { status: 500, body: { error: "Could not unpublish song." } };
  }

  let targetEmail = "";
  const prof = await selectFromTable(
    `profiles?select=email&user_id=eq.${encodeURIComponent(String(row.user_id || ""))}&limit=1`,
  );
  targetEmail = String(prof.data?.[0]?.email || "").trim().toLowerCase();

  await insertAuditRow({
    actorUserId: admin.userId,
    actorEmail: admin.email,
    targetUserId: row.user_id,
    targetEmail,
    action: "unpublish",
    metadata: {
      songId,
      title: String(row.title || ""),
      reason: String(reason || "").trim(),
    },
  });

  return {
    status: 200,
    body: {
      ok: true,
      songId,
      title: row.title || "",
      unpublishAt: now,
    },
  };
}

module.exports = async function handler(req, res) {
  setCors(res);
  if (req.method === "OPTIONS") return res.end();
  if (req.method !== "POST") return sendJson(res, 405, { error: "Method not allowed" });

  const admin = await verifyAdmin(req, { requireModeratePublications: true });
  if (!admin) {
    const user = await verifyUser(req);
    if (!user) return adminUnauthorized(res);
    return adminForbidden(res, "You do not have permission to moderate publications.");
  }

  let body = {};
  try {
    body = (await readJsonBody(req)) || {};
  } catch {
    return sendJson(res, 400, { error: "Invalid JSON body." });
  }

  const action = String(body?.action || "").trim().toLowerCase();
  if (action === "unpublish") {
    const songId = String(body?.songId || body?.song_id || body?.id || "").trim();
    if (!songId) return sendJson(res, 400, { error: "Missing songId." });
    const result = await unpublishSong(admin, songId, body?.reason);
    return sendJson(res, result.status, result.body);
  }

  return sendJson(res, 400, { error: "Unknown action", allowed: ["unpublish"] });
};
