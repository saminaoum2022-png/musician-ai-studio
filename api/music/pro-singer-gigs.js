/**
 * GET   /api/music/pro-singer-gigs — gigs assigned to the signed-in approved singer
 * PATCH /api/music/pro-singer-gigs — accept or decline an assignment
 *
 * PATCH body: { requestId, action: "accept" | "decline", declineReason? }
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

const STATUS_LABELS = Object.freeze({
  submitted: "Submitted",
  confirmed: "Confirmed",
  in_progress: "In production",
  review: "Almost ready",
  delivered: "Ready to listen",
  closed: "Complete",
  cancelled: "Cancelled",
});

const ASSIGNMENT_LABELS = Object.freeze({
  pending: "Awaiting your response",
  accepted: "Accepted",
  declined: "Declined",
});

function mapGig(row) {
  if (!row) return null;
  const assignment = String(row.singer_assignment_status || "").trim() || "pending";
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
    status: row.status,
    statusLabel: STATUS_LABELS[row.status] || row.status,
    assignmentStatus: assignment,
    assignmentLabel: ASSIGNMENT_LABELS[assignment] || assignment,
    declineReason: row.singer_decline_reason || "",
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
  };
}

async function servicePatchRequest(requestId, body) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return { ok: false, status: 500, data: null };
  }
  try {
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/pro_singer_requests?id=eq.${encodeURIComponent(requestId)}`,
      {
        method: "PATCH",
        headers: {
          apikey: SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          "Content-Type": "application/json",
          Prefer: "return=representation",
        },
        body: JSON.stringify({ ...body, updated_at: new Date().toISOString() }),
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

async function assertApprovedSinger(userId) {
  const res = await selectFromTable(
    `pro_singers?select=user_id,active&user_id=eq.${encodeURIComponent(userId)}&limit=1`,
  );
  const row = Array.isArray(res.data) ? res.data[0] : null;
  return Boolean(row?.user_id && row.active !== false);
}

module.exports = async function handler(req, res) {
  setCors(res);
  if (req.method === "OPTIONS") return res.end();

  const user = await verifyUser(req);
  if (!user) return sendJson(res, 401, { error: "Sign in to continue." });

  const isSinger = await assertApprovedSinger(user.userId);
  if (!isSinger) {
    return sendJson(res, 403, { error: "Singer Studio is for approved NabadAi Singers only." });
  }

  if (req.method === "GET") {
    const resRows = await selectFromTable(
      `pro_singer_requests?select=*&singer_id=eq.${encodeURIComponent(user.userId)}&order=created_at.desc&limit=50`,
    );
    const rows = Array.isArray(resRows.data) ? resRows.data : [];
    const gigs = rows.map((row) => {
      const gig = mapGig(row);
      if (row.singer_id && !row.singer_assignment_status) {
        gig.assignmentStatus = "pending";
        gig.assignmentLabel = ASSIGNMENT_LABELS.pending;
      }
      return gig;
    });
    const pendingCount = gigs.filter((g) => g.assignmentStatus === "pending").length;
    return sendJson(res, 200, { gigs, pendingCount });
  }

  if (req.method !== "PATCH") return sendJson(res, 405, { error: "Method not allowed" });

  let body = {};
  try {
    body = (await readJsonBody(req)) || {};
  } catch {
    return sendJson(res, 400, { error: "Invalid JSON body." });
  }

  const requestId = String(body.requestId || body.request_id || "").trim();
  const action = String(body.action || "").trim().toLowerCase();
  if (!requestId) return sendJson(res, 400, { error: "Missing requestId." });
  if (action !== "accept" && action !== "decline") {
    return sendJson(res, 400, { error: "action must be accept or decline." });
  }

  const reqRes = await selectFromTable(
    `pro_singer_requests?select=*&id=eq.${encodeURIComponent(requestId)}&limit=1`,
  );
  const row = Array.isArray(reqRes.data) ? reqRes.data[0] : null;
  if (!row?.id) return sendJson(res, 404, { error: "Gig not found." });
  if (String(row.singer_id || "") !== String(user.userId)) {
    return sendJson(res, 403, { error: "This gig is not assigned to you." });
  }

  const currentAssignment = String(row.singer_assignment_status || "").trim() || "pending";
  if (currentAssignment !== "pending") {
    return sendJson(res, 400, { error: "You already responded to this gig." });
  }

  const patchBody = action === "accept"
    ? { singer_assignment_status: "accepted", singer_decline_reason: "" }
    : {
      singer_assignment_status: "declined",
      singer_decline_reason: String(body.declineReason || body.decline_reason || "Not available.").trim().slice(0, 500),
    };

  const patch = await servicePatchRequest(requestId, patchBody);
  if (!patch.ok) return sendJson(res, patch.status || 500, { error: "Could not update gig." });

  const updated = Array.isArray(patch.data) ? patch.data[0] : patch.data;
  return sendJson(res, 200, {
    ok: true,
    gig: mapGig(updated),
    message: action === "accept" ? "Gig accepted — we'll follow up with details." : "Gig declined.",
  });
};
