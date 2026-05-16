/**
 * Lightweight social API: follows + internal notifications.
 *
 * No push notifications and no cron. Follow actions write the notification row
 * immediately, then the app reads it when the user opens Settings/inbox.
 */

const {
  verifyUser,
  sendJson,
  setCors,
  readJsonBody,
} = require("./_lib/credits-auth");

const SUPABASE_URL = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

function svcHeaders(extra) {
  return {
    apikey: SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    "Content-Type": "application/json",
    Accept: "application/json",
    ...(extra || {}),
  };
}

async function svcFetch(path, opts) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return { ok: false, status: 500, data: null, text: "Missing Supabase service role" };
  }
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...(opts || {}),
    headers: svcHeaders(opts?.headers),
  });
  const text = await r.text().catch(() => "");
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { ok: r.ok, status: r.status, data, text };
}

function cleanUserId(v) {
  const s = String(v || "").trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s) ? s : "";
}

function cleanUsername(v) {
  return String(v || "").replace(/^@/, "").trim().slice(0, 64);
}

async function profileByUserId(userId) {
  const uid = cleanUserId(userId);
  if (!uid) return null;
  const r = await svcFetch(`profiles?select=user_id,username,avatar&user_id=eq.${encodeURIComponent(uid)}&limit=1`);
  return Array.isArray(r.data) && r.data[0] ? r.data[0] : null;
}

async function profileByUsername(username) {
  const handle = cleanUsername(username);
  if (!handle) return null;
  const eq = encodeURIComponent(handle);
  const r = await svcFetch(`profiles?select=user_id,username,avatar&username=eq.${eq}&limit=1`);
  if (Array.isArray(r.data) && r.data[0]) return r.data[0];
  const ilike = encodeURIComponent(handle.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_"));
  const r2 = await svcFetch(`profiles?select=user_id,username,avatar&username=ilike.${ilike}&limit=1`);
  return Array.isArray(r2.data) && r2.data[0] ? r2.data[0] : null;
}

async function resolveTarget({ userId, username }) {
  return cleanUserId(userId) ? profileByUserId(userId) : profileByUsername(username);
}

async function countRows(path) {
  const r = await svcFetch(path);
  return Array.isArray(r.data) ? r.data.length : 0;
}

async function socialStats(userId, viewerId) {
  const uid = cleanUserId(userId);
  if (!uid) return null;
  const [followers, following, isFollowingRows] = await Promise.all([
    countRows(`social_follows?select=follower_user_id&following_user_id=eq.${encodeURIComponent(uid)}&limit=10000`),
    countRows(`social_follows?select=following_user_id&follower_user_id=eq.${encodeURIComponent(uid)}&limit=10000`),
    viewerId
      ? svcFetch(
          `social_follows?select=follower_user_id&follower_user_id=eq.${encodeURIComponent(viewerId)}&following_user_id=eq.${encodeURIComponent(uid)}&limit=1`,
        )
      : Promise.resolve({ data: [] }),
  ]);
  return {
    followers,
    following,
    isFollowing: Array.isArray(isFollowingRows.data) && isFollowingRows.data.length > 0,
  };
}

async function createFollowNotification({ actorUserId, targetUserId }) {
  const actor = await profileByUserId(actorUserId);
  const existing = await svcFetch(
    `social_notifications?select=id&user_id=eq.${encodeURIComponent(targetUserId)}&actor_user_id=eq.${encodeURIComponent(actorUserId)}&type=eq.follow&limit=1`,
  );
  if (Array.isArray(existing.data) && existing.data.length) return;
  await svcFetch("social_notifications", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({
      user_id: targetUserId,
      type: "follow",
      actor_user_id: actorUserId,
      metadata: {
        actor_username: actor?.username || "",
        actor_avatar: actor?.avatar || "",
      },
    }),
  });
}

async function handleGet(req, res, user) {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const type = String(url.searchParams.get("type") || "stats");

  if (type === "stats") {
    const target = await resolveTarget({
      userId: url.searchParams.get("userId"),
      username: url.searchParams.get("username"),
    });
    if (!target?.user_id) return sendJson(res, 404, { ok: false, error: "Profile not found" });
    const stats = await socialStats(target.user_id, user?.userId || "");
    return sendJson(res, 200, { ok: true, profile: target, stats });
  }

  if (type === "me") {
    if (!user) return sendJson(res, 401, { ok: false, error: "Not signed in" });
    const follows = await svcFetch(
      `social_follows?select=following_user_id,created_at&follower_user_id=eq.${encodeURIComponent(user.userId)}&order=created_at.desc&limit=100`,
    );
    const rows = Array.isArray(follows.data) ? follows.data : [];
    const profiles = await Promise.all(rows.map((r) => profileByUserId(r.following_user_id)));
    return sendJson(res, 200, {
      ok: true,
      following: rows.map((r, i) => ({
        userId: r.following_user_id,
        createdAt: r.created_at,
        username: profiles[i]?.username || "",
        avatar: profiles[i]?.avatar || "",
      })),
    });
  }

  if (type === "notifications") {
    if (!user) return sendJson(res, 401, { ok: false, error: "Not signed in" });
    const rows = await svcFetch(
      `social_notifications?select=id,type,actor_user_id,entity_id,metadata,read_at,created_at&user_id=eq.${encodeURIComponent(user.userId)}&order=created_at.desc&limit=50`,
    );
    return sendJson(res, 200, {
      ok: true,
      notifications: Array.isArray(rows.data) ? rows.data : [],
    });
  }

  return sendJson(res, 400, { ok: false, error: "Unknown social query" });
}

async function handlePost(req, res, user) {
  if (!user) return sendJson(res, 401, { ok: false, error: "Not signed in" });
  const body = await readJsonBody(req);
  const action = String(body?.action || "").trim();

  if (action === "follow" || action === "unfollow") {
    const target = await resolveTarget({ userId: body?.targetUserId, username: body?.username });
    const targetUserId = cleanUserId(target?.user_id);
    if (!targetUserId) return sendJson(res, 404, { ok: false, error: "Profile not found" });
    if (targetUserId === user.userId) return sendJson(res, 400, { ok: false, error: "Cannot follow yourself" });

    if (action === "follow") {
      const existing = await svcFetch(
        `social_follows?select=follower_user_id&follower_user_id=eq.${encodeURIComponent(user.userId)}&following_user_id=eq.${encodeURIComponent(targetUserId)}&limit=1`,
      );
      const already = Array.isArray(existing.data) && existing.data.length > 0;
      if (!already) {
        const ins = await svcFetch("social_follows", {
          method: "POST",
          headers: { Prefer: "return=minimal" },
          body: JSON.stringify({ follower_user_id: user.userId, following_user_id: targetUserId }),
        });
        if (!ins.ok) return sendJson(res, 500, { ok: false, error: "Follow failed", details: ins.text });
        await createFollowNotification({ actorUserId: user.userId, targetUserId });
      }
    } else {
      await svcFetch(
        `social_follows?follower_user_id=eq.${encodeURIComponent(user.userId)}&following_user_id=eq.${encodeURIComponent(targetUserId)}`,
        { method: "DELETE", headers: { Prefer: "return=minimal" } },
      );
    }

    const stats = await socialStats(targetUserId, user.userId);
    return sendJson(res, 200, { ok: true, profile: target, stats });
  }

  if (action === "mark_notifications_read") {
    const now = new Date().toISOString();
    await svcFetch(`social_notifications?user_id=eq.${encodeURIComponent(user.userId)}&read_at=is.null`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ read_at: now }),
    });
    return sendJson(res, 200, { ok: true });
  }

  return sendJson(res, 400, { ok: false, error: "Unknown social action" });
}

module.exports = async function handler(req, res) {
  setCors(res);
  if (req.method === "OPTIONS") return res.end();
  const user = await verifyUser(req);
  if (req.method === "GET") return handleGet(req, res, user);
  if (req.method === "POST") return handlePost(req, res, user);
  return sendJson(res, 405, { ok: false, error: "Method not allowed" });
};
