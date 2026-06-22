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
  callRpc,
} = require("./_lib/credits-auth");

const SUPABASE_URL = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const SVC_FETCH_TIMEOUT_MS = 8000;

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
  const timeoutMs = Math.max(1000, Number(opts?.timeoutMs) || SVC_FETCH_TIMEOUT_MS);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
      ...(opts || {}),
      signal: controller.signal,
      headers: svcHeaders(opts?.headers),
    });
    const text = await r.text().catch(() => "");
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    return { ok: r.ok, status: r.status, data, text };
  } catch (e) {
    const aborted = e?.name === "AbortError";
    return {
      ok: false,
      status: aborted ? 504 : 500,
      data: null,
      text: aborted ? "timeout" : e?.message || String(e),
    };
  } finally {
    clearTimeout(timer);
  }
}

/** PostgREST exact count via HEAD + Prefer: count=exact (no row payload). */
async function countExact(path, timeoutMs = SVC_FETCH_TIMEOUT_MS) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return 0;
  const cleanPath = String(path || "").replace(/&limit=\d+/g, "");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${cleanPath}`, {
      method: "HEAD",
      headers: svcHeaders({ Prefer: "count=exact" }),
      signal: controller.signal,
    });
    if (!r.ok) return 0;
    const range = String(r.headers.get("content-range") || "");
    const slash = range.lastIndexOf("/");
    if (slash < 0) return 0;
    const n = parseInt(range.slice(slash + 1), 10);
    return Number.isFinite(n) ? Math.max(0, n) : 0;
  } catch {
    return 0;
  } finally {
    clearTimeout(timer);
  }
}

function cleanUserId(v) {
  const s = String(v || "").trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s) ? s : "";
}

function cleanPostId(v) {
  return cleanUserId(v);
}

function coerceJsonbField(raw) {
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw);
    } catch {
      return raw;
    }
  }
  return raw;
}

function normalizeWaveformPeaks(raw) {
  // Echo waveform_peaks can be either:
  //   - a flat number[] (older rows, or status posts)
  //   - { p: number[], b: { id, v, s } } (echoes uploaded with a beat —
  //     we tuck beat metadata into the same JSONB column so we don't
  //     have to migrate the table)
  // We accept both and return a flat clamped array.
  const parsed = coerceJsonbField(raw);
  let arr = parsed;
  if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
    arr = Array.isArray(parsed.p) ? parsed.p : Array.isArray(parsed.peaks) ? parsed.peaks : [];
  }
  if (!Array.isArray(arr)) return [];
  return arr
    .slice(0, 64)
    .map((n) => Math.max(0, Math.min(1, Number(n) || 0)));
}

const ECHO_BEAT_IDS_API = new Set([
  "lofi",
  "ambient",
  "oud",
  "piano",
  "soul",
  "eight08",
]);
const ECHO_BEAT_SPEEDS_API = new Set(["slow", "slowed", "normal", "fast"]);

function normalizeEchoBeatMeta(raw) {
  // Pull a beat descriptor out of either the JSONB envelope on
  // waveform_peaks or a top-level body field. Returns null if invalid.
  if (!raw || typeof raw !== "object") return null;
  const id = String(raw.id || "").trim().toLowerCase();
  if (!ECHO_BEAT_IDS_API.has(id)) return null;
  const v = Number.isFinite(Number(raw.v)) ? Math.max(0, Number(raw.v) | 0) : 0;
  const sRaw = String(raw.s || "normal").trim().toLowerCase();
  const s = ECHO_BEAT_SPEEDS_API.has(sRaw) ? sRaw : "normal";
  return { id, v, s };
}

function extractEchoBeatFromRow(rawPeaks) {
  const parsed = coerceJsonbField(rawPeaks);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  return normalizeEchoBeatMeta(parsed.b || parsed.beat || null);
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
    beat: extractEchoBeatFromRow(row.waveform_peaks),
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

/** Per-request memo — weekly_chart / me / replies reuse the same profiles. */
let profileCache = null;

function resetProfileCache() {
  profileCache = new Map();
}

async function profileByUserId(userId) {
  const uid = cleanUserId(userId);
  if (!uid) return null;
  if (profileCache?.has(uid)) return profileCache.get(uid);
  const r = await svcFetch(`profiles?select=user_id,username,avatar&user_id=eq.${encodeURIComponent(uid)}&limit=1`);
  const row = Array.isArray(r.data) && r.data[0] ? r.data[0] : null;
  if (profileCache) profileCache.set(uid, row);
  return row;
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
  return countExact(path);
}

async function playCountForOwner(userId) {
  const uid = cleanUserId(userId);
  if (!uid) return 0;
  return countExact(`social_song_plays?owner_user_id=eq.${encodeURIComponent(uid)}&select=id`);
}

async function playCountForSong(songId) {
  const sid = cleanSongId(songId);
  if (!sid) return 0;
  return countExact(`social_song_plays?song_id=eq.${encodeURIComponent(sid)}&select=id`);
}

async function batchSongPlayCounts(songIds) {
  const ids = [...new Set((songIds || []).map((x) => cleanSongId(x)).filter(Boolean))];
  const counts = Object.fromEntries(ids.map((sid) => [sid, 0]));
  if (!ids.length) return counts;

  const rpc = await callRpc("social_song_play_counts", { p_song_ids: ids });
  if (rpc.ok && Array.isArray(rpc.data)) {
    for (const row of rpc.data) {
      const sid = cleanSongId(row?.song_id);
      if (!sid) continue;
      counts[sid] = Math.max(0, Number(row?.play_count) || 0);
    }
    return counts;
  }

  await Promise.all(
    ids.map(async (sid) => {
      counts[sid] = await playCountForSong(sid);
    }),
  );
  return counts;
}

async function socialStats(userId, viewerId) {
  const uid = cleanUserId(userId);
  if (!uid) return null;
  const viewer = cleanUserId(viewerId) || null;
  const rpc = await callRpc("social_profile_stats", {
    p_user_id: uid,
    p_viewer_id: viewer,
  });
  if (rpc.ok && rpc.data && typeof rpc.data === "object") {
    const d = rpc.data;
    return {
      followers: Math.max(0, Number(d.followers) || 0),
      following: Math.max(0, Number(d.following) || 0),
      plays: Math.max(0, Number(d.plays) || 0),
      isFollowing: Boolean(d.is_following),
      followsViewer: Boolean(d.follows_viewer),
    };
  }
  const [followers, following, plays, isFollowingRows, followsViewerRows] = await Promise.all([
    countRows(`social_follows?select=follower_user_id&following_user_id=eq.${encodeURIComponent(uid)}&limit=10000`),
    countRows(`social_follows?select=following_user_id&follower_user_id=eq.${encodeURIComponent(uid)}&limit=10000`),
    playCountForOwner(uid),
    viewer
      ? svcFetch(
          `social_follows?select=follower_user_id&follower_user_id=eq.${encodeURIComponent(viewer)}&following_user_id=eq.${encodeURIComponent(uid)}&limit=1`,
        )
      : Promise.resolve({ data: [] }),
    viewer
      ? svcFetch(
          `social_follows?select=follower_user_id&follower_user_id=eq.${encodeURIComponent(uid)}&following_user_id=eq.${encodeURIComponent(viewer)}&limit=1`,
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
      `user_songs?select=id,user_id,title,art_url,public_on_profile&id=eq.${encodeURIComponent(tid)}&limit=1`,
    );
    const row = Array.isArray(r.data) && r.data[0] ? r.data[0] : null;
    const isPublic = row?.public_on_profile === true || row?.public_on_profile === "t" || row?.public_on_profile === "true";
    if (!row || !isPublic) return null;
    return {
      kind,
      id: row.id,
      ownerUserId: cleanUserId(row.user_id),
      title: row.title || "",
      artUrl: String(row.art_url || "").trim(),
    };
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

async function mapWithConcurrency(items, limit, fn) {
  const out = new Array(items.length);
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx], idx);
    }
  }
  const workers = Array.from({ length: Math.min(limit, items.length) }, () => worker());
  await Promise.all(workers);
  return out;
}

/** Fallback when social_target_stats RPC is not deployed yet. */
async function fetchTargetStatsForKindFallback(kind, ids, viewerId) {
  const likeBucket = {};
  const replyBucket = {};
  for (const id of ids) {
    likeBucket[id] = { count: 0, liked: false };
    replyBucket[id] = { count: 0 };
  }
  const viewer = cleanUserId(viewerId);
  if (viewer && ids.length) {
    const inList = ids.map((id) => encodeURIComponent(id)).join(",");
    const likedRows = await svcFetch(
      `social_likes?select=target_id&target_kind=eq.${encodeURIComponent(kind)}&target_id=in.(${inList})&user_id=eq.${encodeURIComponent(viewer)}&limit=${ids.length}`,
    );
    for (const row of Array.isArray(likedRows.data) ? likedRows.data : []) {
      const id = String(row.target_id || "");
      if (likeBucket[id]) likeBucket[id].liked = true;
    }
  }
  await mapWithConcurrency(ids, 8, async (id) => {
    likeBucket[id].count = await countLikesForTarget(kind, id);
    replyBucket[id].count = await countRepliesForTarget(kind, id);
  });
  return { likes: likeBucket, replies: replyBucket };
}

async function fetchTargetStatsForKind(kind, ids, viewerId) {
  const uuidIds = (ids || []).map(cleanTargetId).filter(Boolean).slice(0, 64);
  if (!uuidIds.length) return { likes: {}, replies: {} };

  const viewer = cleanUserId(viewerId) || null;
  const rpc = await callRpc("social_target_stats", {
    p_target_kind: kind,
    p_target_ids: uuidIds,
    p_viewer_id: viewer,
  });
  if (rpc.ok && Array.isArray(rpc.data)) {
    const likes = {};
    const replies = {};
    for (const id of uuidIds) {
      likes[id] = { count: 0, liked: false };
      replies[id] = { count: 0 };
    }
    for (const row of rpc.data) {
      const id = String(row?.target_id || "");
      if (!likes[id]) continue;
      likes[id] = {
        count: Math.max(0, Number(row?.like_count) || 0),
        liked: Boolean(row?.viewer_liked),
      };
      replies[id] = { count: Math.max(0, Number(row?.reply_count) || 0) };
    }
    return { likes, replies };
  }

  return fetchTargetStatsForKindFallback(kind, uuidIds, viewer);
}

/**
 * Batch-fetch like + reply stats for a set of feed items. Uses aggregated
 * RPC per kind (no limit=10000 row scans).
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

  await Promise.all(
    Object.entries(idGroups).map(async ([kind, ids]) => {
      if (!ids.length) return;
      const { likes, replies } = await fetchTargetStatsForKind(kind, ids, viewerId);
      stats.likes[kind] = likes;
      stats.replies[kind] = replies;
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
      ...(target.kind === "song" && target.artUrl ? { song_art_url: target.artUrl } : {}),
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
      ...(target.kind === "song" && target.artUrl ? { song_art_url: target.artUrl } : {}),
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
    `user_songs?select=id,user_id,title,art_url,public_on_profile&id=eq.${eq}&limit=1`,
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

const CHART_NOTIFY_MAX_RANK = 5;
const _chartNotifyInflight = new Map();

async function maybeNotifyChartRank({ userId, entityId, metadata }) {
  const rank = Number(metadata?.rank || 0);
  if (!rank || rank > CHART_NOTIFY_MAX_RANK) return;
  const lockKey = String(entityId || "").trim();
  if (!lockKey) return;
  if (_chartNotifyInflight.has(lockKey)) return _chartNotifyInflight.get(lockKey);
  const job = (async () => {
    try {
      if (await notificationExists({ userId, type: "chart_rank", entityId: lockKey })) return;
      await insertNotification({
        userId,
        type: "chart_rank",
        entityId: lockKey,
        metadata,
      });
    } finally {
      _chartNotifyInflight.delete(lockKey);
    }
  })();
  _chartNotifyInflight.set(lockKey, job);
  return job;
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
  const playCount = await playCountForSong(sid);
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
      song_art_url: String(song?.art_url || "").trim(),
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
      song_art_url: String(song?.art_url || "").trim(),
      play_count: count,
    },
  });
}

async function createPublicSongNotifications({ actorUserId, songId, title }) {
  const actor = await profileByUserId(actorUserId);
  const followers = await followersForUser(actorUserId);
  const sid = cleanSongId(songId);
  if (!sid || !followers.length) return 0;
  const songRow = await resolvePublicSong(sid);
  const songArtUrl = String(songRow?.art_url || "").trim();
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
        song_art_url: songArtUrl,
      },
    });
    if (ok) created += 1;
  }
  return created;
}

async function createRemixNotification({
  actorUserId,
  originalPostId,
  remixPostId,
  remixTitle,
  originalSongId,
  remixSongId,
}) {
  const originalId = String(originalPostId || "").trim();
  const origSongId = cleanSongId(originalSongId);
  const remSongId = cleanSongId(remixSongId);
  if (!originalId && !origSongId) return false;

  let owner = "";
  let originalTitle = "your song";
  let remixArtUrl = "";

  if (origSongId) {
    const songR = await svcFetch(
      `user_songs?select=id,user_id,title,art_url&id=eq.${encodeURIComponent(origSongId)}&limit=1`,
    );
    const song = Array.isArray(songR.data) && songR.data[0] ? songR.data[0] : null;
    owner = cleanUserId(song?.user_id);
    originalTitle = String(song?.title || originalTitle).trim() || originalTitle;
  } else if (originalId) {
    const songR = await svcFetch(
      `user_songs?select=id,user_id,title,art_url&id=eq.${encodeURIComponent(originalId)}&limit=1`,
    );
    const song = Array.isArray(songR.data) && songR.data[0] ? songR.data[0] : null;
    owner = cleanUserId(song?.user_id);
    originalTitle = String(song?.title || originalTitle).trim() || originalTitle;
  }

  const actor = cleanUserId(actorUserId);
  if (!owner || !actor || owner === actor) return false;

  if (remSongId) {
    const remixR = await svcFetch(
      `user_songs?select=art_url&id=eq.${encodeURIComponent(remSongId)}&limit=1`,
    );
    const remixRow = Array.isArray(remixR.data) && remixR.data[0] ? remixR.data[0] : null;
    remixArtUrl = String(remixRow?.art_url || "").trim();
  }

  const actorProfile = await profileByUserId(actor);
  const entityId = String(
    remSongId || remixPostId || `${originalId || origSongId}:remix:${actor}`,
  )
    .trim()
    .slice(0, 180);
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
      original_song_id: origSongId,
      original_title: originalTitle,
      remix_post_id: String(remixPostId || ""),
      remix_song_id: remSongId,
      song_id: remSongId || "",
      song_art_url: remixArtUrl,
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
    const limit = Math.min(50, Math.max(1, Number(url.searchParams.get("limit")) || 30));
    const offset = Math.max(0, Number(url.searchParams.get("offset")) || 0);
    const rows = await svcFetch(
      `social_notifications?select=id,type,actor_user_id,entity_id,metadata,read_at,created_at&user_id=eq.${encodeURIComponent(user.userId)}&order=created_at.desc&limit=${limit}&offset=${offset}`,
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

  if (type === "song_feedback_inbox") {
    const songId = cleanSongId(url.searchParams.get("songId"));
    if (!songId) return sendJson(res, 400, { ok: false, error: "Missing songId" });
    if (!user?.userId) return sendJson(res, 401, { ok: false, error: "Sign in required" });
    const song = await resolvePublicSong(songId);
    const owner = cleanUserId(song?.user_id);
    if (!song || !owner) return sendJson(res, 404, { ok: false, error: "Song not found" });
    if (owner !== user.userId) return sendJson(res, 403, { ok: false, error: "Owner only" });
    const r = await svcFetch(
      `social_song_feedback?select=feedback_type,listener_user_id,created_at&song_id=eq.${encodeURIComponent(songId)}&order=created_at.desc&limit=100`,
    );
    const rows = Array.isArray(r.data) ? r.data : [];
    const listenerIds = [...new Set(rows.map((row) => cleanUserId(row.listener_user_id)).filter(Boolean))];
    const profiles = new Map();
    await Promise.all(
      listenerIds.map(async (lid) => {
        const prof = await profileByUserId(lid);
        if (prof) profiles.set(lid, prof);
      }),
    );
    const items = rows
      .map((row) => {
        const type = cleanFeedbackType(row.feedback_type);
        const listenerUserId = cleanUserId(row.listener_user_id);
        if (!type || !listenerUserId) return null;
        const prof = profiles.get(listenerUserId);
        return {
          feedbackType: type,
          feedbackLabel: feedbackLabel(type),
          listenerUserId,
          username: String(prof?.username || "").trim(),
          avatar: String(prof?.avatar || "").trim(),
          createdAt: row.created_at || null,
        };
      })
      .filter(Boolean);
    return sendJson(res, 200, { ok: true, items });
  }

  if (type === "song_play_counts") {
    const raw = String(url.searchParams.get("songIds") || "");
    const ids = raw
      .split(",")
      .map((x) => cleanSongId(x))
      .filter(Boolean)
      .slice(0, 64);
    const counts = await batchSongPlayCounts(ids);
    return sendJson(res, 200, { ok: true, counts });
  }

  if (type === "weekly_chart") {
    // Top songs of the week: rank public songs by real engagement in the
    // last 7 days (plays + reactions, reactions weighted x2). The previous
    // 7-day window provides movement arrows (▲ ▼ NEW). Best-effort
    // "your song charted" notifications are deduped per ISO week.
    const now = Date.now();
    const weekAgoIso = new Date(now - 7 * 86400000).toISOString();
    const twoWeeksAgoIso = new Date(now - 14 * 86400000).toISOString();
    const curScore = new Map();
    const curPlays = new Map();
    const prevScore = new Map();
    const bump = (map, sid, w) => map.set(sid, (map.get(sid) || 0) + w);

    const weeklyRpc = await callRpc("social_weekly_engagement", {
      p_two_weeks_ago: twoWeeksAgoIso,
      p_week_ago: weekAgoIso,
    });
    if (weeklyRpc.ok && Array.isArray(weeklyRpc.data)) {
      for (const row of weeklyRpc.data) {
        const sid = cleanSongId(row?.song_id);
        if (!sid) continue;
        const curP = Math.max(0, Number(row?.cur_plays) || 0);
        const prevP = Math.max(0, Number(row?.prev_plays) || 0);
        const curF = Math.max(0, Number(row?.cur_feedback) || 0);
        const prevF = Math.max(0, Number(row?.prev_feedback) || 0);
        const curS = curP + curF * 2;
        const prevS = prevP + prevF * 2;
        if (curS > 0) curScore.set(sid, curS);
        if (curP > 0) curPlays.set(sid, curP);
        if (prevS > 0) prevScore.set(sid, prevS);
      }
    } else {
      // Fallback when RPC not deployed — capped row scan (not limit=10000).
      const WEEKLY_CHART_ROW_CAP = 2000;
      const [playsR, feedbackR] = await Promise.all([
        svcFetch(
          `social_song_plays?select=song_id,created_at&created_at=gte.${encodeURIComponent(twoWeeksAgoIso)}&order=created_at.desc&limit=${WEEKLY_CHART_ROW_CAP}`,
        ),
        svcFetch(
          `social_song_feedback?select=song_id,created_at&created_at=gte.${encodeURIComponent(twoWeeksAgoIso)}&order=created_at.desc&limit=${WEEKLY_CHART_ROW_CAP}`,
        ),
      ]);
      for (const row of Array.isArray(playsR.data) ? playsR.data : []) {
        const sid = cleanSongId(row?.song_id);
        if (!sid) continue;
        if (String(row?.created_at || "") >= weekAgoIso) {
          bump(curScore, sid, 1);
          bump(curPlays, sid, 1);
        } else {
          bump(prevScore, sid, 1);
        }
      }
      for (const row of Array.isArray(feedbackR.data) ? feedbackR.data : []) {
        const sid = cleanSongId(row?.song_id);
        if (!sid) continue;
        if (String(row?.created_at || "") >= weekAgoIso) bump(curScore, sid, 2);
        else bump(prevScore, sid, 2);
      }
    }
    const rankEntries = (map) => [...map.entries()].sort((a, b) => b[1] - a[1]);
    const curRanked = rankEntries(curScore).slice(0, 20);
    const prevRankMap = new Map(rankEntries(prevScore).map(([sid], i) => [sid, i + 1]));
    if (!curRanked.length) return sendJson(res, 200, { ok: true, chart: [] });

    const candidateIds = curRanked.map(([sid]) => sid);
    const songsR = await svcFetch(
      `user_songs?select=id,title,song_url,art_url,user_id,task_id,audio_id&id=in.(${candidateIds.map(encodeURIComponent).join(",")})&public_on_profile=eq.true&limit=20`,
    );
    const songById = new Map(
      (Array.isArray(songsR.data) ? songsR.data : []).map((s) => [String(s.id), s]),
    );
    const chart = [];
    for (const [sid, score] of curRanked) {
      if (chart.length >= 10) break;
      const song = songById.get(sid);
      if (!song || !String(song.song_url || "").trim()) continue;
      const rank = chart.length + 1;
      const prevRank = prevRankMap.get(sid) || 0;
      const delta = prevRank ? prevRank - rank : 0;
      chart.push({
        songId: sid,
        rank,
        prevRank,
        movement: !prevRank ? "new" : delta > 0 ? "up" : delta < 0 ? "down" : "same",
        delta: Math.abs(delta),
        score,
        weeklyPlays: curPlays.get(sid) || 0,
        title: String(song.title || "Song").trim(),
        artUrl: String(song.art_url || "").trim(),
        url: String(song.song_url || "").trim(),
        taskId: String(song.task_id || ""),
        audioId: String(song.audio_id || ""),
        userId: cleanUserId(song.user_id),
      });
    }
    const profiles = await Promise.all(chart.map((e) => profileByUserId(e.userId)));
    chart.forEach((e, i) => {
      e.username = profiles[i]?.username || "";
      e.avatar = profiles[i]?.avatar || "";
    });

    const monday = new Date(now);
    monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));
    const weekKey = monday.toISOString().slice(0, 10);
    // Chart JSON must return fast; rank notifications are best-effort after.
    // Only notify top 5 — lower ranks (6–10) spam Activity when Discover reloads the chart.
    void Promise.all(
      chart
        .filter((e) => e.rank <= CHART_NOTIFY_MAX_RANK)
        .map((e) =>
          maybeNotifyChartRank({
            userId: e.userId,
            entityId: `chart:${weekKey}:${e.songId}`,
            metadata: {
              song_id: e.songId,
              song_title: e.title,
              song_art_url: e.artUrl,
              rank: e.rank,
              weekly_plays: e.weeklyPlays,
              week_key: weekKey,
            },
          }),
        ),
    ).catch(() => {});
    return sendJson(res, 200, { ok: true, weekKey, chart });
  }

  if (type === "my_status" || type === "following_status") {
    if (!user) return sendJson(res, 401, { ok: false, error: "Not signed in" });
    return sendJson(res, 200, { ok: true, posts: [] });
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
      originalSongId: body?.originalSongId,
      remixSongId: body?.remixSongId,
    });
    return sendJson(res, 200, { ok: true, created: Boolean(created) });
  }

  if (action === "post_status") {
    return sendJson(res, 410, { ok: false, error: "Status posts are no longer available" });
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
    const rawPeaks = coerceJsonbField(body?.waveformPeaks || body?.waveform_peaks);
    const peaks = normalizeWaveformPeaks(rawPeaks);
    let beat = normalizeEchoBeatMeta(body?.beat);
    if (!beat && rawPeaks && typeof rawPeaks === "object" && !Array.isArray(rawPeaks)) {
      beat = normalizeEchoBeatMeta(rawPeaks.b || rawPeaks.beat);
    }
    const text = String(body?.body || "").trim().slice(0, 200);
    const listenOnce = Boolean(body?.listenOnce ?? body?.listen_once);
    const replyTo = cleanPostId(body?.replyTo || body?.reply_to) || null;
    if (!audioUrl || !/^https?:\/\//i.test(audioUrl)) {
      return sendJson(res, 400, { ok: false, error: "Missing echo audio" });
    }
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    let peaksPayload = peaks.length ? peaks : null;
    if (beat) peaksPayload = { p: peaks, b: beat };
    else if (
      rawPeaks &&
      typeof rawPeaks === "object" &&
      !Array.isArray(rawPeaks) &&
      (rawPeaks.b || rawPeaks.beat)
    ) {
      const recovered = normalizeEchoBeatMeta(rawPeaks.b || rawPeaks.beat);
      if (recovered) peaksPayload = { p: peaks, b: recovered };
    }
    const ins = await svcFetch("social_echoes", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        user_id: user.userId,
        audio_url: audioUrl,
        duration_ms: durationMs || null,
        waveform_peaks: peaksPayload,
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
  resetProfileCache();
  setCors(res);
  if (req.method === "OPTIONS") return res.end();
  const user = await verifyUser(req);
  if (req.method === "GET") return handleGet(req, res, user);
  if (req.method === "POST") return handlePost(req, res, user);
  return sendJson(res, 405, { ok: false, error: "Method not allowed" });
};
