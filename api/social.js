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

async function playCountForOwner(userId) {
  const uid = cleanUserId(userId);
  if (!uid) return 0;
  return countRows(`social_song_plays?select=id&owner_user_id=eq.${encodeURIComponent(uid)}&limit=10000`);
}

async function socialStats(userId, viewerId) {
  const uid = cleanUserId(userId);
  if (!uid) return null;
  const [followers, following, plays, isFollowingRows, followsViewerRows] = await Promise.all([
    countRows(`social_follows?select=follower_user_id&following_user_id=eq.${encodeURIComponent(uid)}&limit=10000`),
    countRows(`social_follows?select=following_user_id&follower_user_id=eq.${encodeURIComponent(uid)}&limit=10000`),
    playCountForOwner(uid),
    viewerId
      ? svcFetch(
          `social_follows?select=follower_user_id&follower_user_id=eq.${encodeURIComponent(viewerId)}&following_user_id=eq.${encodeURIComponent(uid)}&limit=1`,
        )
      : Promise.resolve({ data: [] }),
    viewerId
      ? svcFetch(
          `social_follows?select=follower_user_id&follower_user_id=eq.${encodeURIComponent(uid)}&following_user_id=eq.${encodeURIComponent(viewerId)}&limit=1`,
        )
      : Promise.resolve({ data: [] }),
  ]);
  return {
    followers,
    following,
    plays,
    isFollowing: Array.isArray(isFollowingRows.data) && isFollowingRows.data.length > 0,
    followsViewer: Array.isArray(followsViewerRows.data) && followsViewerRows.data.length > 0,
  };
}

function cleanSongId(v) {
  return String(v || "").trim().slice(0, 140);
}

const FEEDBACK_TYPES = new Set(["hook", "lyrics", "replay", "remix"]);

function cleanFeedbackType(v) {
  const t = String(v || "").trim().toLowerCase();
  return FEEDBACK_TYPES.has(t) ? t : "";
}

function feedbackLabel(type) {
  if (type === "hook") return "Loved the hook";
  if (type === "lyrics") return "Lyrics hit";
  if (type === "replay") return "Would replay";
  if (type === "remix") return "Remix-worthy";
  return "Feedback";
}

async function resolvePublicSong(songId) {
  const sid = cleanSongId(songId);
  if (!sid) return null;
  const eq = encodeURIComponent(sid);
  const r = await svcFetch(
    `user_songs?select=id,user_id,title,public_on_profile&id=eq.${eq}&limit=1`,
  );
  const row = Array.isArray(r.data) && r.data[0] ? r.data[0] : null;
  const isPublic = row?.public_on_profile === true || row?.public_on_profile === "t" || row?.public_on_profile === "true";
  if (!row || !isPublic) return null;
  return row;
}

async function notificationExists({ userId, type, entityId, actorUserId }) {
  const uid = cleanUserId(userId);
  const t = String(type || "").trim();
  const eid = String(entityId || "").trim();
  if (!uid || !t) return false;
  let path = `social_notifications?select=id&user_id=eq.${encodeURIComponent(uid)}&type=eq.${encodeURIComponent(t)}&limit=1`;
  if (eid) path += `&entity_id=eq.${encodeURIComponent(eid)}`;
  if (actorUserId) path += `&actor_user_id=eq.${encodeURIComponent(actorUserId)}`;
  const existing = await svcFetch(path);
  return Array.isArray(existing.data) && existing.data.length > 0;
}

async function insertNotification({ userId, type, actorUserId, entityId, metadata }) {
  const uid = cleanUserId(userId);
  const actor = cleanUserId(actorUserId);
  const t = String(type || "").trim().slice(0, 80);
  if (!uid || !t) return false;
  const body = {
    user_id: uid,
    type: t,
    actor_user_id: actor || null,
    entity_id: entityId ? String(entityId).trim().slice(0, 180) : null,
    metadata: metadata && typeof metadata === "object" ? metadata : {},
  };
  const ins = await svcFetch("social_notifications", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify(body),
  });
  return Boolean(ins.ok);
}

async function followersForUser(userId) {
  const uid = cleanUserId(userId);
  if (!uid) return [];
  const r = await svcFetch(
    `social_follows?select=follower_user_id&following_user_id=eq.${encodeURIComponent(uid)}&order=created_at.desc&limit=500`,
  );
  return Array.isArray(r.data)
    ? r.data.map((row) => cleanUserId(row.follower_user_id)).filter(Boolean)
    : [];
}

async function recordSongPlay({ songId, listenerUserId, listenedSeconds }) {
  const sid = cleanSongId(songId);
  const listener = cleanUserId(listenerUserId);
  if (!sid || !listener) return { counted: false, reason: "missing_input" };
  const song = await resolvePublicSong(sid);
  const owner = cleanUserId(song?.user_id);
  if (!song || !owner) return { counted: false, reason: "song_not_public" };
  if (owner === listener) return { counted: false, reason: "own_play" };
  const seconds = Math.max(0, Math.min(24 * 60 * 60, Math.round(Number(listenedSeconds) || 0)));
  const ins = await svcFetch("social_song_plays", {
    method: "POST",
    headers: { Prefer: "resolution=ignore-duplicates,return=minimal" },
    body: JSON.stringify({
      song_id: sid,
      owner_user_id: owner,
      listener_user_id: listener,
      listened_seconds: seconds,
    }),
  });
  if (!ins.ok) return { counted: false, reason: "insert_failed", details: ins.text };
  const playCount = await countRows(`social_song_plays?select=id&song_id=eq.${encodeURIComponent(sid)}&limit=10000`);
  await createPlayMilestoneNotification({ song, ownerUserId: owner, playCount });
  return { counted: true, ownerUserId: owner, playCount };
}

async function feedbackSummary({ songId, listenerUserId }) {
  const sid = cleanSongId(songId);
  if (!sid) return { counts: {}, viewer: [] };
  const r = await svcFetch(
    `social_song_feedback?select=feedback_type,listener_user_id&song_id=eq.${encodeURIComponent(sid)}&limit=10000`,
  );
  const rows = Array.isArray(r.data) ? r.data : [];
  const viewer = cleanUserId(listenerUserId);
  const counts = {};
  const viewerTypes = [];
  for (const row of rows) {
    const type = cleanFeedbackType(row.feedback_type);
    if (!type) continue;
    counts[type] = (counts[type] || 0) + 1;
    if (viewer && cleanUserId(row.listener_user_id) === viewer) viewerTypes.push(type);
  }
  return { counts, viewer: viewerTypes };
}

async function recordSongFeedback({ songId, listenerUserId, feedbackType }) {
  const sid = cleanSongId(songId);
  const listener = cleanUserId(listenerUserId);
  const type = cleanFeedbackType(feedbackType);
  if (!sid || !listener || !type) return { counted: false, reason: "missing_input" };
  const song = await resolvePublicSong(sid);
  const owner = cleanUserId(song?.user_id);
  if (!song || !owner) return { counted: false, reason: "song_not_public" };
  if (owner === listener) return { counted: false, reason: "own_song", ...(await feedbackSummary({ songId: sid, listenerUserId: listener })) };
  const ins = await svcFetch("social_song_feedback", {
    method: "POST",
    headers: { Prefer: "resolution=ignore-duplicates,return=minimal" },
    body: JSON.stringify({
      song_id: sid,
      owner_user_id: owner,
      listener_user_id: listener,
      feedback_type: type,
    }),
  });
  if (!ins.ok) return { counted: false, reason: "insert_failed", details: ins.text };
  await createFeedbackNotification({ song, ownerUserId: owner, actorUserId: listener, feedbackType: type });
  return { counted: true, ownerUserId: owner, ...(await feedbackSummary({ songId: sid, listenerUserId: listener })) };
}

async function createFollowNotification({ actorUserId, targetUserId }) {
  const actor = await profileByUserId(actorUserId);
  const exists = await notificationExists({
    userId: targetUserId,
    type: "follow",
    actorUserId,
  });
  if (exists) return;
  await insertNotification({
    userId: targetUserId,
    type: "follow",
    actorUserId,
    metadata: {
      actor_username: actor?.username || "",
      actor_avatar: actor?.avatar || "",
    },
  });
}

async function createFeedbackNotification({ song, ownerUserId, actorUserId, feedbackType }) {
  const owner = cleanUserId(ownerUserId);
  const actorId = cleanUserId(actorUserId);
  const sid = cleanSongId(song?.id);
  const type = cleanFeedbackType(feedbackType);
  if (!owner || !actorId || owner === actorId || !sid || !type) return false;
  const entityId = `${sid}:feedback:${actorId}:${type}`;
  if (await notificationExists({ userId: owner, type: "song_feedback", entityId })) return false;
  const actor = await profileByUserId(actorId);
  return insertNotification({
    userId: owner,
    type: "song_feedback",
    actorUserId: actorId,
    entityId,
    metadata: {
      actor_username: actor?.username || "",
      actor_avatar: actor?.avatar || "",
      song_id: sid,
      song_title: song?.title || "your song",
      feedback_type: type,
      feedback_label: feedbackLabel(type),
    },
  });
}

async function createPlayMilestoneNotification({ song, ownerUserId, playCount }) {
  const milestones = new Set([10, 50, 100, 500, 1000]);
  const count = Number(playCount || 0);
  const owner = cleanUserId(ownerUserId);
  const sid = cleanSongId(song?.id);
  if (!owner || !sid || !milestones.has(count)) return;
  const entityId = `${sid}:plays:${count}`;
  if (await notificationExists({ userId: owner, type: "play_milestone", entityId })) return;
  await insertNotification({
    userId: owner,
    type: "play_milestone",
    entityId,
    metadata: {
      song_id: sid,
      song_title: song?.title || "Your song",
      play_count: count,
    },
  });
}

async function createPublicSongNotifications({ actorUserId, songId, title }) {
  const actor = await profileByUserId(actorUserId);
  const followers = await followersForUser(actorUserId);
  const sid = cleanSongId(songId);
  if (!sid || !followers.length) return 0;
  let created = 0;
  for (const followerId of followers) {
    if (!followerId || followerId === actorUserId) continue;
    const exists = await notificationExists({ userId: followerId, type: "public_song", entityId: sid });
    if (exists) continue;
    const ok = await insertNotification({
      userId: followerId,
      type: "public_song",
      actorUserId,
      entityId: sid,
      metadata: {
        actor_username: actor?.username || "",
        actor_avatar: actor?.avatar || "",
        song_id: sid,
        song_title: String(title || "New song").trim().slice(0, 120),
      },
    });
    if (ok) created += 1;
  }
  return created;
}

async function createRemixNotification({ actorUserId, originalPostId, remixPostId, remixTitle }) {
  const originalId = String(originalPostId || "").trim();
  if (!originalId) return false;
  const r = await svcFetch(
    `hub_posts?select=id,title,creator_username,meta&id=eq.${encodeURIComponent(originalId)}&limit=1`,
  );
  const original = Array.isArray(r.data) && r.data[0] ? r.data[0] : null;
  const owner = cleanUserId(original?.meta?.creatorUserId);
  const actor = cleanUserId(actorUserId);
  if (!owner || !actor || owner === actor) return false;
  const actorProfile = await profileByUserId(actor);
  const entityId = String(remixPostId || `${originalId}:remix:${actor}`).trim().slice(0, 180);
  if (await notificationExists({ userId: owner, type: "remix", entityId })) return false;
  return insertNotification({
    userId: owner,
    type: "remix",
    actorUserId: actor,
    entityId,
    metadata: {
      actor_username: actorProfile?.username || "",
      actor_avatar: actorProfile?.avatar || "",
      original_post_id: originalId,
      original_title: original?.title || "your song",
      remix_post_id: String(remixPostId || ""),
      remix_title: String(remixTitle || "a remix").trim().slice(0, 120),
    },
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

  if (type === "song_feedback") {
    const songId = cleanSongId(url.searchParams.get("songId"));
    if (!songId) return sendJson(res, 400, { ok: false, error: "Missing songId" });
    const summary = await feedbackSummary({ songId, listenerUserId: user?.userId || "" });
    return sendJson(res, 200, { ok: true, ...summary });
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

  if (action === "record_play") {
    const result = await recordSongPlay({
      songId: body?.songId,
      listenerUserId: user.userId,
      listenedSeconds: body?.listenedSeconds,
    });
    return sendJson(res, 200, { ok: true, ...result });
  }

  if (action === "song_feedback") {
    const result = await recordSongFeedback({
      songId: body?.songId,
      listenerUserId: user.userId,
      feedbackType: body?.feedbackType,
    });
    return sendJson(res, 200, { ok: true, ...result });
  }

  if (action === "notify_public_song") {
    const song = await resolvePublicSong(body?.songId);
    if (!song?.id || cleanUserId(song.user_id) !== user.userId) {
      return sendJson(res, 404, { ok: false, error: "Public song not found" });
    }
    const created = await createPublicSongNotifications({
      actorUserId: user.userId,
      songId: song.id,
      title: song.title || body?.title,
    });
    return sendJson(res, 200, { ok: true, created });
  }

  if (action === "notify_remix") {
    const created = await createRemixNotification({
      actorUserId: user.userId,
      originalPostId: body?.originalPostId,
      remixPostId: body?.remixPostId,
      remixTitle: body?.remixTitle,
    });
    return sendJson(res, 200, { ok: true, created: Boolean(created) });
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
