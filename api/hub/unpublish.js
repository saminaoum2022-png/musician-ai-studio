/**
 * POST /api/hub/unpublish
 *
 * Body: { id: "<hub_post uuid>" }
 * Auth: Authorization: Bearer <supabase access_token>
 *
 * Why this exists: client-side DELETE against `hub_posts` was failing
 * intermittently because the table's RLS policy and the row's
 * creator-attribution shape don't always agree (some rows track owner
 * via `meta->>creatorUserId`, some via `creator_username`). Rather
 * than rely on RLS to do the right thing for every legacy row, this
 * endpoint:
 *
 *   1) Verifies the user via the bearer token.
 *   2) Loads the row using the service role.
 *   3) Confirms ownership: `meta->>creatorUserId === user.userId` OR
 *      a profile lookup whose `id === user.userId` matches the row's
 *      `creator_username`.
 *   4) Deletes the row using the service role (bypassing RLS).
 *
 * Anything else returns a 401/403/404. Front-end optimistic
 * removal-with-rollback continues to work because the response is a
 * clear { ok: true | false } with the actionable status code.
 */

const {
  verifyUser,
  sendJson,
  setCors,
  readJsonBody,
} = require("../_lib/credits-auth");

const SUPABASE_URL = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

function svcHeaders() {
  return {
    apikey: SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    "Content-Type": "application/json",
  };
}

async function fetchHubRow(id) {
  const url = `${SUPABASE_URL}/rest/v1/hub_posts?select=id,creator_username,meta&id=eq.${encodeURIComponent(id)}&limit=1`;
  const r = await fetch(url, { headers: svcHeaders() });
  if (!r.ok) return null;
  const arr = await r.json().catch(() => []);
  return Array.isArray(arr) && arr[0] ? arr[0] : null;
}

function metaCreatorUid(meta) {
  if (!meta) return "";
  const m = typeof meta === "string" ? (() => { try { return JSON.parse(meta); } catch { return null; } })() : meta;
  if (!m || typeof m !== "object") return "";
  return String(m.creatorUserId || m.creator_user_id || "").trim();
}

async function fetchProfileUsername(userId) {
  // `profiles` rows use `user_id` as the FK to auth.users — NOT `id`.
  // The client loads profiles with `user_id=eq.<uuid>` (see `supabaseLoadProfile`).
  const url = `${SUPABASE_URL}/rest/v1/profiles?select=username,user_id&user_id=eq.${encodeURIComponent(userId)}&limit=1`;
  const r = await fetch(url, { headers: svcHeaders() });
  if (!r.ok) return "";
  const arr = await r.json().catch(() => []);
  return Array.isArray(arr) && arr[0] ? String(arr[0].username || "") : "";
}

async function deleteHubRow(id) {
  const url = `${SUPABASE_URL}/rest/v1/hub_posts?id=eq.${encodeURIComponent(id)}`;
  const r = await fetch(url, {
    method: "DELETE",
    headers: { ...svcHeaders(), Prefer: "return=minimal" },
  });
  return r.ok;
}

module.exports = async function handler(req, res) {
  setCors(res);
  if (req.method === "OPTIONS") return res.end();
  if (req.method !== "POST") return sendJson(res, 405, { error: "Method not allowed" });

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return sendJson(res, 500, { error: "Server is missing SUPABASE_SERVICE_ROLE_KEY" });
  }

  const user = await verifyUser(req);
  if (!user) return sendJson(res, 401, { error: "Not signed in" });

  const body = await readJsonBody(req);
  const id = String(body?.id || "").trim();
  if (!id) return sendJson(res, 400, { error: "Missing post id" });

  const row = await fetchHubRow(id);
  if (!row) return sendJson(res, 404, { error: "Post not found" });

  // Ownership check — two sources (legacy rows often lack meta.creatorUserId):
  //   1) meta.creatorUserId / meta.creator_user_id === auth user id
  //   2) profiles.username (joined via profiles.user_id) === row.creator_username
  const metaUid = metaCreatorUid(row?.meta);
  let owns = metaUid && metaUid === user.userId;
  if (!owns) {
    const username = await fetchProfileUsername(user.userId);
    const rowCreator = String(row?.creator_username || "").trim();
    const normMine = String(username || "").trim().toLowerCase();
    const normRow = rowCreator.toLowerCase();
    if (normMine && normMine === normRow) owns = true;
  }
  if (!owns) return sendJson(res, 403, { error: "Not the post owner" });

  const ok = await deleteHubRow(id);
  if (!ok) return sendJson(res, 500, { error: "Delete failed" });
  return sendJson(res, 200, { ok: true });
};
