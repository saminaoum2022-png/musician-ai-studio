/**
 * PATCH /api/admin/singers
 *
 * Actions (body.action):
 *   approve_application { applicationId, adminNotes? }
 *   reject_application  { applicationId, adminNotes? }
 *   update_request      { requestId, status?, paymentStatus?, singerId?, adminNotes?, deliveredSongId? }
 *   toggle_singer       { userId, active }
 */

const {
  verifyUser,
  selectFromTable,
  sendJson,
  setCors,
  readJsonBody,
} = require("../_lib/credits-auth");
const {
  verifyAdmin,
  adminForbidden,
  adminUnauthorized,
} = require("../_lib/admin-auth");
const { insertAppNotification } = require("../_lib/app-notifications");

const SUPABASE_URL = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

async function servicePatch(table, filterPath, body) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return { ok: false, status: 500, data: null };
  }
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${filterPath}`, {
      method: "PATCH",
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify({ ...body, updated_at: new Date().toISOString() }),
    });
    const text = await r.text().catch(() => "");
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    return { ok: r.ok, status: r.status, data };
  } catch {
    return { ok: false, status: 500, data: null };
  }
}

async function serviceInsert(table, row) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return { ok: false, status: 500, data: null };
  }
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
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
  if (req.method !== "PATCH") return sendJson(res, 405, { error: "Method not allowed" });

  const user = await verifyUser(req);
  if (!user) return adminUnauthorized(res);
  const admin = await verifyAdmin(req, { view: "singers" });
  if (!admin) return adminForbidden(res);

  let body = {};
  try {
    body = (await readJsonBody(req)) || {};
  } catch {
    return sendJson(res, 400, { error: "Invalid JSON body." });
  }

  const action = String(body.action || "").trim().toLowerCase();
  const now = new Date().toISOString();

  if (action === "approve_application") {
    const applicationId = String(body.applicationId || body.application_id || "").trim();
    if (!applicationId) return sendJson(res, 400, { error: "Missing applicationId." });

    const appRes = await selectFromTable(
      `singer_applications?select=*&id=eq.${encodeURIComponent(applicationId)}&limit=1`,
    );
    const app = Array.isArray(appRes.data) ? appRes.data[0] : null;
    if (!app?.id) return sendJson(res, 404, { error: "Application not found." });

    const adminNotes = String(body.adminNotes || body.admin_notes || "").trim().slice(0, 1000);
    const patchApp = await servicePatch(
      "singer_applications",
      `id=eq.${encodeURIComponent(applicationId)}`,
      { status: "approved", admin_notes: adminNotes, reviewed_at: now },
    );
    if (!patchApp.ok) return sendJson(res, patchApp.status || 500, { error: "Could not approve application." });

    const upsertSinger = await fetch(
      `${SUPABASE_URL}/rest/v1/pro_singers?on_conflict=user_id`,
      {
        method: "POST",
        headers: {
          apikey: SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          "Content-Type": "application/json",
          Prefer: "resolution=merge-duplicates,return=representation",
        },
        body: JSON.stringify({
          user_id: app.user_id,
          application_id: app.id,
          display_name: app.display_name || "",
          instagram: app.instagram || "",
          languages: app.languages || "",
          genres: app.genres || "",
          bio: app.bio || "",
          photo_url: app.photo_url || "",
          active: true,
          approved_at: now,
        }),
      },
    );
    if (!upsertSinger.ok) {
      return sendJson(res, 500, { error: "Application approved but roster insert failed." });
    }

    void insertAppNotification({
      userId: app.user_id,
      type: "singer_approved",
      entityId: app.id,
      metadata: { display_name: app.display_name || "" },
    });

    return sendJson(res, 200, { ok: true, status: "approved" });
  }

  if (action === "reject_application") {
    const applicationId = String(body.applicationId || body.application_id || "").trim();
    if (!applicationId) return sendJson(res, 400, { error: "Missing applicationId." });
    const adminNotes = String(body.adminNotes || body.admin_notes || "Not accepted at this time.").trim().slice(0, 1000);
    const appRes = await selectFromTable(
      `singer_applications?select=*&id=eq.${encodeURIComponent(applicationId)}&limit=1`,
    );
    const appRow = Array.isArray(appRes.data) ? appRes.data[0] : null;

    const patchApp = await servicePatch(
      "singer_applications",
      `id=eq.${encodeURIComponent(applicationId)}`,
      { status: "rejected", admin_notes: adminNotes, reviewed_at: now },
    );
    if (!patchApp.ok) return sendJson(res, patchApp.status || 500, { error: "Could not reject application." });

    if (appRow?.user_id) {
      void insertAppNotification({
        userId: appRow.user_id,
        type: "singer_rejected",
        entityId: applicationId,
        metadata: { message: adminNotes },
      });
    }

    return sendJson(res, 200, { ok: true, status: "rejected" });
  }

  if (action === "toggle_singer") {
    const userId = String(body.userId || body.user_id || "").trim();
    if (!userId) return sendJson(res, 400, { error: "Missing userId." });
    const active = body.active !== false;
    const patch = await servicePatch(
      "pro_singers",
      `user_id=eq.${encodeURIComponent(userId)}`,
      { active },
    );
    if (!patch.ok) return sendJson(res, patch.status || 500, { error: "Could not update singer." });
    return sendJson(res, 200, { ok: true, active });
  }

  if (action === "update_request") {
    const requestId = String(body.requestId || body.request_id || "").trim();
    if (!requestId) return sendJson(res, 400, { error: "Missing requestId." });

    const prevRes = await selectFromTable(
      `pro_singer_requests?select=*&id=eq.${encodeURIComponent(requestId)}&limit=1`,
    );
    const prevRow = Array.isArray(prevRes.data) ? prevRes.data[0] : null;
    if (!prevRow?.id) return sendJson(res, 404, { error: "Request not found." });

    const patchBody = {};
    if (body.status) patchBody.status = String(body.status).trim();
    if (body.paymentStatus || body.payment_status) {
      patchBody.payment_status = String(body.paymentStatus || body.payment_status).trim();
    }
    if (body.singerId !== undefined || body.singer_id !== undefined) {
      const sid = String(body.singerId ?? body.singer_id ?? "").trim();
      patchBody.singer_id = sid || null;
      const prevSinger = String(prevRow.singer_id || "").trim();
      if (sid && sid !== prevSinger) {
        patchBody.singer_assignment_status = "pending";
        patchBody.singer_decline_reason = "";
      } else if (!sid) {
        patchBody.singer_assignment_status = "";
        patchBody.singer_decline_reason = "";
      }
    }
    if (body.adminNotes !== undefined || body.admin_notes !== undefined) {
      patchBody.admin_notes = String(body.adminNotes ?? body.admin_notes ?? "").trim().slice(0, 2000);
    }
    if (body.deliveredSongId !== undefined || body.delivered_song_id !== undefined) {
      patchBody.delivered_song_id = String(body.deliveredSongId ?? body.delivered_song_id ?? "").trim();
    }
    if (!Object.keys(patchBody).length) {
      return sendJson(res, 400, { error: "Nothing to update." });
    }

    const patch = await servicePatch(
      "pro_singer_requests",
      `id=eq.${encodeURIComponent(requestId)}`,
      patchBody,
    );
    if (!patch.ok) return sendJson(res, patch.status || 500, { error: "Could not update request." });
    const row = Array.isArray(patch.data) ? patch.data[0] : patch.data;

    const newSingerId = String(row?.singer_id || "").trim();
    const prevSingerId = String(prevRow.singer_id || "").trim();
    if (newSingerId && newSingerId !== prevSingerId) {
      void insertAppNotification({
        userId: newSingerId,
        type: "singer_assigned",
        entityId: requestId,
        metadata: {
          song_title: row.song_title || row.occasion || "Performance request",
          song_art_url: row.song_art_url || "",
          package_tier: row.package_tier || "",
        },
      });
    }

    return sendJson(res, 200, { ok: true, request: row });
  }

  return sendJson(res, 400, { error: "Unknown action." });
};
