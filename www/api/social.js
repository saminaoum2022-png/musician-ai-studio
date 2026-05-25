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

function cleanPostId(v) {
  return cleanUserId(v);
}

function normalizeWaveformPeaks(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .slice(0, 64)
    .map((n) => Math.max(0, Math.min(1, Number(n) || 0)));
}

function mapStatusPostRow(p, prof) {
  const audioUrl = String(p?.audio_url || "").trim();
  return {
    id: p.id,
    userId: p.user_id,
    postType: p.post_type,
    body: p.body,
    audioUrl,
    durationMs: Number(p?.duration_ms) || 0,
    waveformPeaks: normalizeWaveformPeaks(p?.waveform_peaks),
    createdAt: p.created_at,
    username: prof?.username || "",
    avatar: prof?.avatar || "",
  };
}

function mapEchoRow(row, prof, extras = {}) {
  return {
    id: row.id,
    userId: row.user_id,
    audioUrl: String(row.audio_url || "").trim(),
    durationMs: Number(row.duration_ms) || 0,
    waveformPeaks: normalizeWaveformPeaks(row.waveform_peaks),
    body: String(row.body || "").trim(),
    listenOnce: Boolean(row.listen_once),
    replyTo: row.reply_to || null,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    username: prof?.username || "",
    avatar: prof?.avatar || "",
    listened: Boolean(extras.listened),
    reaction: String(extras.reaction || "").trim(),
    reactionCounts: extras.reactionCounts || {},
  };
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

const SOCIAL_TARGET_KINDS = new Set(["song", "status", "echo"]);
const REPLY_BODY_MAX = 280;

function cleanTargetKind(v) {
  const s = String(v || "").trim().toLowerCase();
  return SOCIAL_TARGET_KINDS.has(s) ? s : "";
}

function cleanTargetId(v) {
  return cleanUserId(v);
}

function cleanReplyBody(v) {
  return String(v || "").replace(/\s+\n/g, "\n").trim().slice(0, REPLY_BODY_MAX);
}

/**
 * Resolve the owner user id for a feed target so we can notify them when
 * they get a like / reply. Returns null if the target doesn't exist or
 * isn't a known kind.
 */
async function resolveSocialTargetOwner(targetKind, targetId) {
  const kind = cleanTargetKind(targetKind);
  const tid = cleanTargetId(targetId);
  if (!kind || !tid) return null;
  if (kind === "song") {
    const r = await svcFetch(
      `user_songs?select=id,user_id,title,public_on_profile&id=eq.${encodeURIComponent(tid)}&limit=1`,
    );
    const row = Array.isArray(r.data) && r.data[0] ? r.data[0] : null;
    const isPublic = row?.public_on_profile === true || row?.public_on_profile === "t" || row?.public_on_profile === "true";
    if (!row || !isPublic) return null;
    return { kind, id: row.id, ownerUserId: cleanUserId(row.user_id), title: row.title || "" };
  }
  if (kind === "status") {
    const r = await svcFetch(
      `social_status_posts?select=id,user_id,body&id=eq.${encodeURIComponent(tid)}&limit=1`,
    );
    const row = Array.isArray(r.data) && r.data[0] ? r.data[0] : null;
    if (!row) return null;
    return { kind, id: row.id, ownerUserId: cleanUserId(row.user_id), title: String(row.body || "").slice(0, 80) };
  }
  if (kind === "echo") {
    const r = await svcFetch(
      `social_echoes?select=id,user_id,body,expires_at&id=eq.${encodeURIComponent(tid)}&limit=1`,
    );
    const row = Array.isArray(r.data) && r.data[0] ? r.data[0] : null;
    if (!row) return null;
    return { kind, id: row.id, ownerUserId: cleanUserId(row.user_id), title: String(row.body || "").slice(0, 80) };
  }
  return null;
}

/**
 * Batch-fetch like + reply stats for a set of feed items. Splits the ids
 * by kind, hits Supabase REST with one `in.(...)` query per kind, then
 * aggregates counts (and the viewer's own liked-state) in memory.
 */
async function fetchFeedSocialStats({ songIds, statusIds, echoIds, viewerId }) {
  const stats = {
    likes: { song: {}, status: {}, echo: {} },
    replies: { song: {}, status: {}, echo: {} },
  };
  const idGroups = {
    song: Array.isArray(songIds) ? songIds.map(cleanTargetId).filter(Boolean).slice(0, 64) : [],
    status: Array.isArray(statusIds) ? statusIds.map(cleanTargetId).filter(Boolean).slice(0, 64) : [],
    echo: Array.isArray(echoIds) ? echoIds.map(cleanTargetId).filter(Boolean).slice(0, 64) : [],
  };
  const viewer = cleanUserId(viewerId);

  await Promise.all(
    Object.entries(idGroups).map(async ([kind, ids]) => {
      if (!ids.length) return;
      const inList = ids.map((id) => encodeURIComponent(id)).join(",");

      const [likeRows, replyRows] = await Promise.all([
        svcFetch(
          `social_likes?select=target_id,user_id&target_kind=eq.${encodeURIComponent(kind)}&target_id=in.(${inList})&limit=10000`,
        ),
        svcFetch(
          `social_replies?select=target_id&target_kind=eq.${encodeURIComponent(kind)}&target_id=in.(${inList})&limit=10000`,
        ),
      ]);

      const likeBucket = stats.likes[kind];
      for (const id of ids) likeBucket[id] = { count: 0, liked: false };
      for (const row of Array.isArray(likeRows.data) ? likeRows.data : []) {
        const id = String(row.target_id || "");
        if (!likeBucket[id]) continue;
        likeBucket[id].count += 1;
        if (viewer && cleanUserId(row.user_id) === viewer) likeBucket[id].liked = true;
      }

      const replyBucket = stats.replies[kind];
      for (const id of ids) replyBucket[id] = { count: 0 };
      for (const row of Array.isArray(replyRows.data) ? replyRows.data : []) {
        const id = String(row.target_id || "");
        if (!replyBucket[id]) continue;
        replyBucket[id].count += 1;
      }
    }),
  );

  return stats;
}

async function fetchRepliesForTarget({ targetKind, targetId, limit = 50 }) {
  const kind = cleanTargetKind(targetKind);
  const tid = cleanTargetId(targetId);
  if (!kind || !tid) return [];
  const max = Math.min(200, Math.max(1, Number(limit) || 50));
  const rows = await svcFetch(
    `social_replies?select=id,user_id,body,created_at&target_kind=eq.${encodeURIComponent(kind)}&target_id=eq.${encodeURIComponent(tid)}&order=created_at.asc&limit=${max}`,
  );
  const raw = Array.isArray(rows.data) ? rows.data : [];
  if (!raw.length) return [];
  const profiles = await Promise.all(raw.map((r) => profileByUserId(r.user_id)));
  return raw.map((row, i) => ({
    id: row.id,
    userId: row.user_id,
    body: row.body,
    createdAt: row.created_at,
    username: profiles[i]?.username || "",
    avatar: profiles[i]?.avatar || "",
  }));
}

async function countLikesForTarget(targetKind, targetId) {
  const kind = cleanTargetKind(targetKind);
  const tid = cleanTargetId(targetId);
  if (!kind || !tid) return 0;
  return countRows(
    `social_likes?select=id&target_kind=eq.${encodeURIComponent(kind)}&target_id=eq.${encodeURIComponent(tid)}&limit=10000`,
  );
}

async function countRepliesForTarget(targetKind, targetId) {
  const kind = cleanTargetKind(targetKind);
  const tid = cleanTargetId(targetId);
  if (!kind || !tid) return 0;
  return countRows(
    `social_replies?select=id&target_kind=eq.${encodeURIComponent(kind)}&target_id=eq.${encodeURIComponent(tid)}&limit=10000`,
  );
}

async function createSocialLikeNotification({ target, actorUserId }) {
  if (!target?.ownerUserId) return false;
  const owner = cleanUserId(target.ownerUserId);
  const actor = cleanUserId(actorUserId);
  if (!owner || !actor || owner === actor) return false;
  const entityId = `${target.kind}:${target.id}:like:${actor}`;
  if (await notificationExists({ userId: owner, type: "social_like", entityId })) return false;
  const actorProfile = await profileByUserId(actor);
  return insertNotification({
    userId: owner,
    type: "social_like",
    actorUserId: actor,
    entityId,
    metadata: {
      actor_username: actorProfile?.username || "",
      actor_avatar: actorProfile?.avatar || "",
      target_kind: target.kind,
      target_id: target.id,
      target_title: target.title || "",
    },
  });
}

async function createSocialReplyNotification({ target, actorUserId, replyId, body }) {
  if (!target?.ownerUserId) return false;
  const owner = cleanUserId(target.ownerUserId);
  const actor = cleanUserId(actorUserId);
  if (!owner || !actor || owner === actor) return false;
  const entityId = `${target.kind}:${target.id}:reply:${replyId}`;
  if (await notificationExists({ userId: owner, type: "social_reply", entityId })) return false;
  const actorProfile = await profileByUserId(actor);
  return insertNotification({
    userId: owner,
    type: "social_reply",
    actorUserId: actor,
    entityId,
    metadata: {
      actor_username: actorProfile?.username || "",
      actor_avatar: actorProfile?.avatar || "",
      target_kind: target.kind,
      target_id: target.id,
      target_title: target.title || "",
      reply_id: replyId,
      reply_preview: String(body || "").slice(0, 140),
    },
  });
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

function feedbackInsertFailureReason(details) {
  const text = String(details || "");
  if (/relation .*social_song_feedback.* does not exist|42P01/i.test(text)) return "feedback_table_missing";
  if (/column .* does not exist|42703/i.test(text)) return "feedback_schema_mismatch";
  if (/violates foreign key constraint|23503/i.test(text)) return "feedback_foreign_key";
  if (/row-level security|42501|permission denied/i.test(text)) return "feedback_policy";
  if (/invalid input syntax|22P02|operator does not exist|42883/i.test(text)) return "feedback_type_mismatch";
  return "insert_failed";
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
  const existing = await svcFetch(
    `social_song_feedback?select=id&song_id=eq.${encodeURIComponent(sid)}&listener_user_id=eq.${encodeURIComponent(listener)}&feedback_type=eq.${encodeURIComponent(type)}&limit=1`,
  );
  if (Array.isArray(existing.data) && existing.data.length) {
    return { counted: true, existing: true, ownerUserId: owner, ...(await feedbackSummary({ songId: sid, listenerUserId: listener })) };
  }
  const ins = await svcFetch("social_song_feedback", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({
      song_id: sid,
      owner_user_id: owner,
      listener_user_id: listener,
      feedback_type: type,
    }),
  });
  if (!ins.ok) {
    const afterConflict = await svcFetch(
      `social_song_feedback?select=id&song_id=eq.${encodeURIComponent(sid)}&listener_user_id=eq.${encodeURIComponent(listener)}&feedback_type=eq.${encodeURIComponent(type)}&limit=1`,
    );
    if (Array.isArray(afterConflict.data) && afterConflict.data.length) {
      return { counted: true, existing: true, ownerUserId: owner, ...(await feedbackSummary({ songId: sid, listenerUserId: listener })) };
    }
    return { counted: false, reason: feedbackInsertFailureReason(ins.text), details: String(ins.text || "").slice(0, 260) };
  }
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

  if (type === "song_play_counts") {
    const raw = String(url.searchParams.get("songIds") || "");
    const ids = raw
      .split(",")
      .map((x) => cleanSongId(x))
      .filter(Boolean)
      .slice(0, 64);
    const counts = {};
    await Promise.all(
      ids.map(async (sid) => {
        counts[sid] = await countRows(
          `social_song_plays?select=id&song_id=eq.${encodeURIComponent(sid)}&limit=10000`,
        );
      }),
    );
    return sendJson(res, 200, { ok: true, counts });
  }

  if (type === "my_status") {
    if (!user) return sendJson(res, 401, { ok: false, error: "Not signed in" });
    const limit = Math.min(80, Math.max(1, Number(url.searchParams.get("limit")) || 40));
    const rows = await svcFetch(
      `social_status_posts?select=id,user_id,post_type,body,audio_url,duration_ms,waveform_peaks,created_at&user_id=eq.${encodeURIComponent(user.userId)}&order=created_at.desc&limit=${limit}`,
    );
    const rawPosts = Array.isArray(rows.data) ? rows.data : [];
    const prof = await profileByUserId(user.userId);
    return sendJson(res, 200, {
      ok: true,
      posts: rawPosts.map((p) => mapStatusPostRow(p, prof)),
    });
  }

  if (type === "following_status") {
    if (!user) return sendJson(res, 401, { ok: false, error: "Not signed in" });
    const limit = Math.min(60, Math.max(1, Number(url.searchParams.get("limit")) || 40));
    const follows = await svcFetch(
      `social_follows?select=following_user_id&follower_user_id=eq.${encodeURIComponent(user.userId)}&limit=100`,
    );
    const followIds = (Array.isArray(follows.data) ? follows.data : [])
      .map((r) => cleanUserId(r.following_user_id))
      .filter(Boolean);
    const authorIds = [...new Set(followIds)];
    if (!authorIds.length) return sendJson(res, 200, { ok: true, posts: [] });
    const inList = authorIds.map((id) => encodeURIComponent(id)).join(",");
    const rows = await svcFetch(
      `social_status_posts?select=id,user_id,post_type,body,audio_url,duration_ms,waveform_peaks,created_at&user_id=in.(${inList})&order=created_at.desc&limit=${limit}`,
    );
    const rawPosts = Array.isArray(rows.data) ? rows.data : [];
    const profiles = await Promise.all(rawPosts.map((p) => profileByUserId(p.user_id)));
    return sendJson(res, 200, {
      ok: true,
      posts: rawPosts.map((p, i) => mapStatusPostRow(p, profiles[i])),
    });
  }

  if (type === "moments_rail" || type === "user_moments") {
    if (!user && type === "moments_rail") {
      return sendJson(res, 401, { ok: false, error: "Not signed in" });
    }
    const nowIso = new Date().toISOString();
    let userIds = [];
    if (type === "user_moments") {
      const target = await resolveTarget({
        userId: url.searchParams.get("userId"),
        username: url.searchParams.get("username"),
      });
      if (!target?.user_id) return sendJson(res, 404, { ok: false, error: "Profile not found" });
      userIds = [target.user_id];
    } else {
      const follows = await svcFetch(
        `social_follows?select=following_user_id&follower_user_id=eq.${encodeURIComponent(user.userId)}&limit=100`,
      );
      const followIds = (Array.isArray(follows.data) ? follows.data : [])
        .map((r) => cleanUserId(r.following_user_id))
        .filter(Boolean);
      userIds = [...new Set([user.userId, ...followIds])];
    }
    if (!userIds.length) return sendJson(res, 200, { ok: true, moments: [] });
    const inList = userIds.map((id) => encodeURIComponent(id)).join(",");
    const limit = Math.min(120, Math.max(1, Number(url.searchParams.get("limit")) || 48));
    const rows = await svcFetch(
      `social_moments?select=id,user_id,body,image_url,created_at,expires_at,kind,song_title,song_audio_url&user_id=in.(${inList})&expires_at=gt.${encodeURIComponent(nowIso)}&order=created_at.desc&limit=${limit}`,
    );
    const raw = Array.isArray(rows.data) ? rows.data : [];
    const byUser = new Map();
    for (const row of raw) {
      const uid = cleanUserId(row.user_id);
      if (!uid) continue;
      if (!byUser.has(uid)) byUser.set(uid, []);
      byUser.get(uid).push(row);
    }
    const sortedUsers = [...byUser.entries()].sort((a, b) => {
      const ta = new Date(a[1][0]?.created_at || 0).getTime();
      const tb = new Date(b[1][0]?.created_at || 0).getTime();
      return tb - ta;
    });
    const profiles = await Promise.all(sortedUsers.map(([uid]) => profileByUserId(uid)));
    const stories = sortedUsers.map(([uid, rows], i) => ({
      userId: uid,
      username: profiles[i]?.username || "",
      avatar: profiles[i]?.avatar || "",
      moments: rows.map((m) => ({
        id: m.id,
        userId: uid,
        body: m.body,
        imageUrl: m.image_url,
        createdAt: m.created_at,
        expiresAt: m.expires_at,
        kind: m.kind || "photo",
        songTitle: m.song_title || "",
        songAudioUrl: m.song_audio_url || "",
        username: profiles[i]?.username || "",
        avatar: profiles[i]?.avatar || "",
      })),
    }));
    return sendJson(res, 200, {
      ok: true,
      stories,
      moments: stories.map((s) => s.moments[0]).filter(Boolean),
    });
  }

  if (type === "echo_rail") {
    if (!user) return sendJson(res, 401, { ok: false, error: "Not signed in" });
    const nowIso = new Date().toISOString();
    const follows = await svcFetch(
      `social_follows?select=following_user_id&follower_user_id=eq.${encodeURIComponent(user.userId)}&limit=100`,
    );
    const followIds = (Array.isArray(follows.data) ? follows.data : [])
      .map((r) => cleanUserId(r.following_user_id))
      .filter(Boolean);
    const userIds = [...new Set([user.userId, ...followIds])];
    if (!userIds.length) return sendJson(res, 200, { ok: true, echoes: [] });
    const inList = userIds.map((id) => encodeURIComponent(id)).join(",");
    const limit = Math.min(80, Math.max(1, Number(url.searchParams.get("limit")) || 40));
    const rows = await svcFetch(
      `social_echoes?select=id,user_id,audio_url,duration_ms,waveform_peaks,body,listen_once,reply_to,created_at,expires_at&user_id=in.(${inList})&expires_at=gt.${encodeURIComponent(nowIso)}&order=created_at.desc&limit=${limit}`,
    );
    const raw = Array.isArray(rows.data) ? rows.data : [];
    const echoIds = raw.map((r) => r.id).filter(Boolean);
    let listenedSet = new Set();
    let reactionByEcho = new Map();
    if (echoIds.length) {
      const inEcho = echoIds.map((id) => encodeURIComponent(id)).join(",");
      const listens = await svcFetch(
        `social_echo_listens?select=echo_id&user_id=eq.${encodeURIComponent(user.userId)}&echo_id=in.(${inEcho})`,
      );
      listenedSet = new Set(
        (Array.isArray(listens.data) ? listens.data : []).map((r) => r.echo_id).filter(Boolean),
      );
      const reacts = await svcFetch(
        `social_echo_reactions?select=echo_id,reaction,user_id&echo_id=in.(${inEcho})`,
      );
      const reactRows = Array.isArray(reacts.data) ? reacts.data : [];
      for (const rr of reactRows) {
        if (!reactionByEcho.has(rr.echo_id)) reactionByEcho.set(rr.echo_id, { counts: {}, mine: "" });
        const bucket = reactionByEcho.get(rr.echo_id);
        const k = String(rr.reaction || "");
        bucket.counts[k] = (bucket.counts[k] || 0) + 1;
        if (rr.user_id === user.userId) bucket.mine = k;
      }
    }
    const byUser = new Map();
    for (const row of raw) {
      const uid = cleanUserId(row.user_id);
      if (!uid) continue;
      if (!byUser.has(uid)) byUser.set(uid, []);
      byUser.get(uid).push(row);
    }
    const sortedUsers = [...byUser.entries()].sort((a, b) => {
      const ta = new Date(a[1][0]?.created_at || 0).getTime();
      const tb = new Date(b[1][0]?.created_at || 0).getTime();
      return tb - ta;
    });
    const profiles = await Promise.all(sortedUsers.map(([uid]) => profileByUserId(uid)));
    const echoes = sortedUsers.map(([uid, userRows], i) => {
      const prof = profiles[i];
      const slides = userRows.map((row) => {
        const rx = reactionByEcho.get(row.id) || { counts: {}, mine: "" };
        return mapEchoRow(row, prof, {
          listened: listenedSet.has(row.id),
          reaction: rx.mine,
          reactionCounts: rx.counts,
        });
      });
      return { userId: uid, username: prof?.username || "", avatar: prof?.avatar || "", echoes: slides };
    });
    return sendJson(res, 200, { ok: true, echoes });
  }

  if (type === "feed_social_stats") {
    const songIds = String(url.searchParams.get("song_ids") || "")
      .split(",")
      .map((x) => cleanTargetId(x))
      .filter(Boolean)
      .slice(0, 64);
    const statusIds = String(url.searchParams.get("status_ids") || "")
      .split(",")
      .map((x) => cleanTargetId(x))
      .filter(Boolean)
      .slice(0, 64);
    const echoIds = String(url.searchParams.get("echo_ids") || "")
      .split(",")
      .map((x) => cleanTargetId(x))
      .filter(Boolean)
      .slice(0, 64);
    const stats = await fetchFeedSocialStats({
      songIds,
      statusIds,
      echoIds,
      viewerId: user?.userId || "",
    });
    return sendJson(res, 200, { ok: true, ...stats });
  }

  if (type === "replies") {
    const targetKind = cleanTargetKind(url.searchParams.get("targetKind"));
    const targetId = cleanTargetId(url.searchParams.get("targetId"));
    if (!targetKind || !targetId) {
      return sendJson(res, 400, { ok: false, error: "Missing targetKind / targetId" });
    }
    const replies = await fetchRepliesForTarget({
      targetKind,
      targetId,
      limit: Number(url.searchParams.get("limit")) || 50,
    });
    return sendJson(res, 200, { ok: true, replies });
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

  if (action === "post_status") {
    const allowed = new Set(["update", "advice", "brainstorm", "song_request", "recommend"]);
    const postType = allowed.has(String(body?.postType || "").trim())
      ? String(body.postType).trim()
      : "update";
    const text = String(body?.body || "").trim().slice(0, 320);
    const audioUrl = String(body?.audioUrl || body?.audio_url || "").trim().slice(0, 2048);
    const durationMs = Math.min(60000, Math.max(0, Math.round(Number(body?.durationMs || body?.duration_ms) || 0)));
    const waveformPeaks = normalizeWaveformPeaks(body?.waveformPeaks || body?.waveform_peaks);
    if (!text && !audioUrl) {
      return sendJson(res, 400, { ok: false, error: "Add a voice note or write something to post" });
    }
    if (audioUrl && !/^https?:\/\//i.test(audioUrl)) {
      return sendJson(res, 400, { ok: false, error: "Invalid voice audio URL" });
    }
    const finalBody = text || (audioUrl ? "Voice drop" : "");
    const ins = await svcFetch("social_status_posts", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        user_id: user.userId,
        post_type: postType,
        body: finalBody,
        audio_url: audioUrl || null,
        duration_ms: audioUrl ? (durationMs || null) : null,
        waveform_peaks: audioUrl && waveformPeaks.length ? waveformPeaks : null,
      }),
    });
    if (!ins.ok) {
      return sendJson(res, 500, { ok: false, error: "Post failed", details: ins.text });
    }
    const row = Array.isArray(ins.data) && ins.data[0] ? ins.data[0] : null;
    const prof = await profileByUserId(user.userId);
    return sendJson(res, 200, {
      ok: true,
      post: row ? mapStatusPostRow(row, prof) : null,
    });
  }

  if (action === "delete_status") {
    const postId = cleanPostId(body?.postId);
    if (!postId) return sendJson(res, 400, { ok: false, error: "Invalid post" });
    const del = await svcFetch(
      `social_status_posts?id=eq.${encodeURIComponent(postId)}&user_id=eq.${encodeURIComponent(user.userId)}`,
      { method: "DELETE", headers: { Prefer: "return=minimal" } },
    );
    if (!del.ok) return sendJson(res, 500, { ok: false, error: "Delete failed", details: del.text });
    return sendJson(res, 200, { ok: true });
  }

  if (action === "post_moment") {
    const text = String(body?.body || "").trim().slice(0, 320);
    const imageUrl = String(body?.imageUrl || body?.image_url || "").trim().slice(0, 2048);
    const kind = String(body?.kind || "photo").trim().toLowerCase() === "song" ? "song" : "photo";
    const songTitle = String(body?.songTitle || body?.song_title || "").trim().slice(0, 200);
    const songAudioUrl = String(body?.songAudioUrl || body?.song_audio_url || "").trim().slice(0, 2048);
    if (!text) return sendJson(res, 400, { ok: false, error: "Write a caption for your moment" });
    if (!imageUrl || !/^https?:\/\//i.test(imageUrl)) {
      return sendJson(res, 400, { ok: false, error: "Missing moment image" });
    }
    if (kind === "song" && (!songTitle || !songAudioUrl || !/^https?:\/\//i.test(songAudioUrl))) {
      return sendJson(res, 400, { ok: false, error: "Song story needs title and audio" });
    }
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const ins = await svcFetch("social_moments", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        user_id: user.userId,
        body: text,
        image_url: imageUrl,
        expires_at: expiresAt,
        kind,
        song_title: kind === "song" ? songTitle : null,
        song_audio_url: kind === "song" ? songAudioUrl : null,
      }),
    });
    if (!ins.ok) {
      return sendJson(res, 500, { ok: false, error: "Moment failed", details: ins.text });
    }
    const row = Array.isArray(ins.data) && ins.data[0] ? ins.data[0] : null;
    const prof = await profileByUserId(user.userId);
    return sendJson(res, 200, {
      ok: true,
      moment: row
        ? {
            id: row.id,
            userId: row.user_id,
            body: row.body,
            imageUrl: row.image_url,
            createdAt: row.created_at,
            expiresAt: row.expires_at,
            kind: row.kind || "photo",
            songTitle: row.song_title || "",
            songAudioUrl: row.song_audio_url || "",
            username: prof?.username || "",
            avatar: prof?.avatar || "",
          }
        : null,
    });
  }

  if (action === "delete_moment") {
    const momentId = cleanPostId(body?.momentId || body?.postId);
    if (!momentId) return sendJson(res, 400, { ok: false, error: "Invalid moment" });
    const del = await svcFetch(
      `social_moments?id=eq.${encodeURIComponent(momentId)}&user_id=eq.${encodeURIComponent(user.userId)}`,
      { method: "DELETE", headers: { Prefer: "return=minimal" } },
    );
    if (!del.ok) return sendJson(res, 500, { ok: false, error: "Delete failed", details: del.text });
    return sendJson(res, 200, { ok: true });
  }

  if (action === "post_echo") {
    const audioUrl = String(body?.audioUrl || body?.audio_url || "").trim().slice(0, 2048);
    const durationMs = Math.min(120000, Math.max(0, Math.round(Number(body?.durationMs || body?.duration_ms) || 0)));
    const peaks = normalizeWaveformPeaks(body?.waveformPeaks || body?.waveform_peaks);
    const text = String(body?.body || "").trim().slice(0, 200);
    const listenOnce = Boolean(body?.listenOnce ?? body?.listen_once);
    const replyTo = cleanPostId(body?.replyTo || body?.reply_to) || null;
    if (!audioUrl || !/^https?:\/\//i.test(audioUrl)) {
      return sendJson(res, 400, { ok: false, error: "Missing echo audio" });
    }
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const ins = await svcFetch("social_echoes", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        user_id: user.userId,
        audio_url: audioUrl,
        duration_ms: durationMs || null,
        waveform_peaks: peaks.length ? peaks : null,
        body: text || null,
        listen_once: listenOnce,
        reply_to: replyTo,
        expires_at: expiresAt,
      }),
    });
    if (!ins.ok) return sendJson(res, 500, { ok: false, error: "Echo failed", details: ins.text });
    const row = Array.isArray(ins.data) && ins.data[0] ? ins.data[0] : null;
    const prof = await profileByUserId(user.userId);
    return sendJson(res, 200, {
      ok: true,
      echo: row ? mapEchoRow(row, prof, { listened: false, reaction: "", reactionCounts: {} }) : null,
    });
  }

  if (action === "echo_listen") {
    const echoId = cleanPostId(body?.echoId);
    if (!echoId) return sendJson(res, 400, { ok: false, error: "Invalid echo" });
    const ins = await svcFetch("social_echo_listens", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ echo_id: echoId, user_id: user.userId }),
    });
    if (!ins.ok && ins.status !== 409) {
      return sendJson(res, 500, { ok: false, error: "Listen record failed", details: ins.text });
    }
    return sendJson(res, 200, { ok: true });
  }

  if (action === "echo_react") {
    const echoId = cleanPostId(body?.echoId);
    const reaction = String(body?.reaction || "").trim().toLowerCase();
    const allowed = new Set(["fire", "heart", "cry", "eyes"]);
    if (!echoId || !allowed.has(reaction)) {
      return sendJson(res, 400, { ok: false, error: "Invalid reaction" });
    }
    const ins = await svcFetch("social_echo_reactions", {
      method: "POST",
      headers: { Prefer: "return=representation,resolution=merge-duplicates" },
      body: JSON.stringify({ echo_id: echoId, user_id: user.userId, reaction }),
    });
    if (!ins.ok) return sendJson(res, 500, { ok: false, error: "Reaction failed", details: ins.text });
    return sendJson(res, 200, { ok: true });
  }

  if (action === "like" || action === "unlike") {
    const targetKind = cleanTargetKind(body?.targetKind);
    const targetId = cleanTargetId(body?.targetId);
    if (!targetKind || !targetId) {
      return sendJson(res, 400, { ok: false, error: "Missing targetKind / targetId" });
    }
    const target = await resolveSocialTargetOwner(targetKind, targetId);
    if (!target) return sendJson(res, 404, { ok: false, error: "Target not found" });

    if (action === "like") {
      const ins = await svcFetch("social_likes", {
        method: "POST",
        headers: {
          Prefer: "return=minimal,resolution=ignore-duplicates",
        },
        body: JSON.stringify({
          target_kind: targetKind,
          target_id: targetId,
          user_id: user.userId,
        }),
      });
      if (!ins.ok && ins.status !== 409) {
        return sendJson(res, 500, { ok: false, error: "Like failed", details: ins.text });
      }
      const count = await countLikesForTarget(targetKind, targetId);
      void createSocialLikeNotification({ target, actorUserId: user.userId });
      return sendJson(res, 200, { ok: true, liked: true, count });
    }
    await svcFetch(
      `social_likes?target_kind=eq.${encodeURIComponent(targetKind)}&target_id=eq.${encodeURIComponent(targetId)}&user_id=eq.${encodeURIComponent(user.userId)}`,
      { method: "DELETE", headers: { Prefer: "return=minimal" } },
    );
    const count = await countLikesForTarget(targetKind, targetId);
    return sendJson(res, 200, { ok: true, liked: false, count });
  }

  if (action === "reply") {
    const targetKind = cleanTargetKind(body?.targetKind);
    const targetId = cleanTargetId(body?.targetId);
    const text = cleanReplyBody(body?.body);
    if (!targetKind || !targetId) {
      return sendJson(res, 400, { ok: false, error: "Missing targetKind / targetId" });
    }
    if (!text) {
      return sendJson(res, 400, { ok: false, error: "Reply text is empty" });
    }
    const target = await resolveSocialTargetOwner(targetKind, targetId);
    if (!target) return sendJson(res, 404, { ok: false, error: "Target not found" });

    const ins = await svcFetch("social_replies", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        target_kind: targetKind,
        target_id: targetId,
        user_id: user.userId,
        body: text,
      }),
    });
    if (!ins.ok) {
      return sendJson(res, 500, { ok: false, error: "Reply failed", details: ins.text });
    }
    const row = Array.isArray(ins.data) && ins.data[0] ? ins.data[0] : null;
    if (!row) return sendJson(res, 500, { ok: false, error: "Reply not returned" });
    const profile = await profileByUserId(user.userId);
    const count = await countRepliesForTarget(targetKind, targetId);
    void createSocialReplyNotification({
      target,
      actorUserId: user.userId,
      replyId: row.id,
      body: text,
    });
    return sendJson(res, 200, {
      ok: true,
      count,
      reply: {
        id: row.id,
        userId: row.user_id,
        body: row.body,
        createdAt: row.created_at,
        username: profile?.username || "",
        avatar: profile?.avatar || "",
      },
    });
  }

  if (action === "delete_reply") {
    const replyId = cleanTargetId(body?.replyId);
    if (!replyId) return sendJson(res, 400, { ok: false, error: "Invalid reply" });
    const existing = await svcFetch(
      `social_replies?select=target_kind,target_id&id=eq.${encodeURIComponent(replyId)}&user_id=eq.${encodeURIComponent(user.userId)}&limit=1`,
    );
    const row = Array.isArray(existing.data) && existing.data[0] ? existing.data[0] : null;
    if (!row) return sendJson(res, 404, { ok: false, error: "Reply not found" });
    const del = await svcFetch(
      `social_replies?id=eq.${encodeURIComponent(replyId)}&user_id=eq.${encodeURIComponent(user.userId)}`,
      { method: "DELETE", headers: { Prefer: "return=minimal" } },
    );
    if (!del.ok) return sendJson(res, 500, { ok: false, error: "Delete failed", details: del.text });
    const count = await countRepliesForTarget(row.target_kind, row.target_id);
    return sendJson(res, 200, { ok: true, count, targetKind: row.target_kind, targetId: row.target_id });
  }

  if (action === "delete_echo") {
    const echoId = cleanPostId(body?.echoId);
    if (!echoId) return sendJson(res, 400, { ok: false, error: "Invalid echo" });
    const del = await svcFetch(
      `social_echoes?id=eq.${encodeURIComponent(echoId)}&user_id=eq.${encodeURIComponent(user.userId)}`,
      { method: "DELETE", headers: { Prefer: "return=minimal" } },
    );
    if (!del.ok) return sendJson(res, 500, { ok: false, error: "Delete failed", details: del.text });
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
