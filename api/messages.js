/**
 * Direct messages — mutual follow opens a thread; otherwise message request.
 * Text only (v1). Service role writes; user JWT verified at edge.
 */

const { Readable } = require("stream");
const {
  verifyUser,
  sendJson,
  setCors,
  readJsonBody,
  callRpc,
} = require("./_lib/credits-auth");
const { queuePrivacySafePush } = require("./_lib/onesignal-push");
const { uploadObject } = require("./_lib/supabase-storage");

const SUPABASE_URL = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const SVC_FETCH_TIMEOUT_MS = 80000;
const MAX_BODY = 2000;
const DM_VOICE_BUCKET = "dm_voice";
const DM_VOICE_MAX_BYTES = 512 * 1024;

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
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = null;
    }
    return { ok: r.ok, status: r.status, data, text };
  } catch (e) {
    return { ok: false, status: 500, data: null, text: String(e?.message || e) };
  } finally {
    clearTimeout(timer);
  }
}

function cleanUserId(v) {
  const s = String(v || "").trim();
  return /^[0-9a-f-]{36}$/i.test(s) ? s : "";
}

function cleanBody(v) {
  const s = String(v || "").trim().slice(0, MAX_BODY);
  return s.length ? s : "";
}

function extFromAudioContentType(contentType) {
  const ct = String(contentType || "").toLowerCase();
  if (ct.includes("mp4") || ct.includes("m4a") || ct.includes("aac")) return "m4a";
  if (ct.includes("mpeg") || ct.includes("mp3")) return "mp3";
  if (ct.includes("ogg")) return "ogg";
  if (ct.includes("wav")) return "wav";
  return "webm";
}

async function uploadVoiceDropForUser(userId, { dataBase64 = "", contentType = "audio/webm" } = {}) {
  const uid = cleanUserId(userId);
  if (!uid) return { ok: false, error: "Not signed in" };
  const raw = String(dataBase64 || "").trim();
  if (!raw) return { ok: false, error: "Missing audio" };
  const match = raw.match(/^data:([^;]+);base64,(.+)$/i);
  const ct = match ? match[1] : String(contentType || "audio/webm");
  const b64 = match ? match[2] : raw;
  let buf;
  try {
    buf = Buffer.from(b64, "base64");
  } catch {
    return { ok: false, error: "Invalid audio data" };
  }
  if (!buf.length) return { ok: false, error: "Empty recording" };
  if (buf.length < 800) {
    return { ok: false, error: "Recording too short — try again." };
  }
  if (buf.length > DM_VOICE_MAX_BYTES) {
    return { ok: false, error: "Recording too large — keep it under 30 seconds." };
  }
  const ext = extFromAudioContentType(ct);
  const key = `${uid}/${Date.now()}.${ext}`;
  const up = await uploadObject({
    bucket: DM_VOICE_BUCKET,
    key,
    body: buf,
    contentType: ct.split(";")[0].trim() || "audio/webm",
  });
  if (!up.ok) {
    const hint = /bucket|not found|404/i.test(String(up.error || ""))
      ? " Run supabase/dm_voice_storage.sql in Supabase."
      : "";
    return { ok: false, error: `Voice upload failed.${hint}` };
  }
  return { ok: true, url: up.url, key, bytes: buf.length };
}

function orderedPair(a, b) {
  const x = cleanUserId(a);
  const y = cleanUserId(b);
  if (!x || !y || x === y) return null;
  return x < y ? [x, y] : [y, x];
}

async function profileByUserId(userId) {
  const uid = cleanUserId(userId);
  if (!uid) return null;
  const map = await profilesByUserIds([uid]);
  return map.get(uid) || null;
}

const INBOX_BATCH_CHUNK = 40;

function chunkIds(ids, size = INBOX_BATCH_CHUNK) {
  const clean = [...new Set((ids || []).map((id) => String(id || "").trim()).filter(Boolean))];
  const out = [];
  for (let i = 0; i < clean.length; i += size) out.push(clean.slice(i, i + size));
  return out;
}

async function profilesByUserIds(userIds) {
  const map = new Map();
  for (const chunk of chunkIds(userIds)) {
    const inClause = chunk.map(encodeURIComponent).join(",");
    const r = await svcFetch(
      `profiles?user_id=in.(${inClause})&select=user_id,username,avatar`,
    );
    for (const row of Array.isArray(r.data) ? r.data : []) {
      const uid = String(row.user_id || "");
      if (!uid) continue;
      map.set(uid, {
        user_id: uid,
        username: String(row.username || "").trim(),
        avatar: String(row.avatar || "").trim(),
      });
    }
  }
  return map;
}

async function readsForUserThreads(userId, threadIds) {
  const uid = cleanUserId(userId);
  const map = new Map();
  if (!uid) return map;
  for (const chunk of chunkIds(threadIds)) {
    const inClause = chunk.map(encodeURIComponent).join(",");
    const r = await svcFetch(
      `dm_thread_reads?select=thread_id,last_read_at&user_id=eq.${encodeURIComponent(uid)}&thread_id=in.(${inClause})`,
    );
    for (const row of Array.isArray(r.data) ? r.data : []) {
      map.set(String(row.thread_id), row.last_read_at);
    }
  }
  return map;
}

async function partnerReadsForThreads(viewerId, threadRows) {
  const uid = cleanUserId(viewerId);
  const map = new Map();
  if (!uid || !threadRows.length) return map;
  const threadIds = threadRows.map((t) => String(t.id || "")).filter(Boolean);
  for (const chunk of chunkIds(threadIds)) {
    const inClause = chunk.map(encodeURIComponent).join(",");
    const r = await svcFetch(
      `dm_thread_reads?select=thread_id,user_id,last_read_at&thread_id=in.(${inClause})`,
    );
    for (const row of Array.isArray(r.data) ? r.data : []) {
      const tid = String(row.thread_id || "");
      if (!tid || map.has(tid)) continue;
      const thread = threadRows.find((t) => String(t.id || "") === tid);
      if (!thread) continue;
      const partnerId = threadPartnerId(thread, uid);
      if (partnerId && String(row.user_id || "") === String(partnerId)) {
        map.set(tid, row.last_read_at);
      }
    }
  }
  return map;
}

async function lastMessagesForThreads(threadIds) {
  const map = new Map();
  const tids = [...new Set((threadIds || []).map((id) => String(id || "").trim()).filter(Boolean))];
  if (!tids.length) return map;
  for (const chunk of chunkIds(tids, 30)) {
    const inClause = chunk.map(encodeURIComponent).join(",");
    const limit = Math.min(500, chunk.length * 8);
    const r = await svcFetch(
      `dm_messages?select=thread_id,body,sender_id,created_at&thread_id=in.(${inClause})&order=created_at.desc&limit=${limit}`,
    );
    for (const row of Array.isArray(r.data) ? r.data : []) {
      const tid = String(row.thread_id || "");
      if (tid && !map.has(tid)) map.set(tid, row);
    }
  }
  const missing = tids.filter((tid) => !map.has(tid));
  if (missing.length) {
    await Promise.all(missing.map(async (tid) => {
      const last = await lastMessageForThread(tid);
      if (last) map.set(tid, last);
    }));
  }
  return map;
}

function countUnreadFromPartnerMessages(messages, threadId, lastReadAt) {
  const tid = String(threadId || "");
  const lr = lastReadAt ? new Date(lastReadAt).getTime() : 0;
  let n = 0;
  for (const m of messages || []) {
    if (String(m.thread_id) !== tid) continue;
    if (new Date(m.created_at).getTime() > lr) n += 1;
  }
  return Math.min(n, 99);
}

async function partnerUnreadMessagesForThreads(viewerId, threadIds, readMap) {
  const uid = cleanUserId(viewerId);
  const counts = new Map();
  const needIds = (threadIds || []).map((id) => String(id || "").trim()).filter(Boolean);
  if (!needIds.length || !uid) return counts;
  const partnerMsgs = [];
  for (const chunk of chunkIds(needIds, 30)) {
    const inClause = chunk.map(encodeURIComponent).join(",");
    const r = await svcFetch(
      `dm_messages?select=thread_id,created_at&thread_id=in.(${inClause})&sender_id=neq.${encodeURIComponent(uid)}&order=created_at.desc&limit=1000`,
    );
    partnerMsgs.push(...(Array.isArray(r.data) ? r.data : []));
  }
  for (const tid of needIds) {
    counts.set(tid, countUnreadFromPartnerMessages(partnerMsgs, tid, readMap.get(tid)));
  }
  return counts;
}

async function enrichInboxThreads(threadRows, viewerId) {
  const uid = cleanUserId(viewerId);
  if (!uid || !threadRows.length) return [];
  const threadIds = threadRows.map((t) => String(t.id || "")).filter(Boolean);
  const partnerIds = threadRows.map((t) => threadPartnerId(t, uid)).filter(Boolean);
  const [profileMap, readMap, lastMsgMap, partnerReadMap] = await Promise.all([
    profilesByUserIds(partnerIds),
    readsForUserThreads(uid, threadIds),
    lastMessagesForThreads(threadIds),
    partnerReadsForThreads(uid, threadRows),
  ]);
  const unreadCandidates = [];
  for (const thread of threadRows) {
    const tid = String(thread.id || "");
    const last = lastMsgMap.get(tid);
    const lastRead = readMap.get(tid);
    const hasUnread = last && String(last.sender_id) !== String(uid)
      && (!lastRead || new Date(last.created_at) > new Date(lastRead));
    if (hasUnread) unreadCandidates.push(tid);
  }
  const unreadMap = unreadCandidates.length
    ? await partnerUnreadMessagesForThreads(uid, unreadCandidates, readMap)
    : new Map();
  return threadRows.map((thread) => {
    const tid = String(thread.id || "");
    const partnerId = threadPartnerId(thread, uid);
    const prof = partnerId ? profileMap.get(partnerId) : null;
    const last = lastMsgMap.get(tid);
    const lastRead = readMap.get(tid);
    const hasUnread = last && String(last.sender_id) !== String(uid)
      && (!lastRead || new Date(last.created_at) > new Date(lastRead));
    const unreadCount = hasUnread ? (unreadMap.get(tid) || 1) : 0;
    return {
      threadId: thread.id,
      partnerUserId: partnerId,
      partnerUsername: prof?.username || "",
      partnerAvatar: prof?.avatar || "",
      lastMessage: last?.body || "",
      lastMessageAt: last?.created_at || thread.last_message_at,
      lastMessageSenderId: last?.sender_id ? String(last.sender_id) : "",
      partnerLastReadAt: partnerReadMap.get(tid) || null,
      unread: Boolean(hasUnread),
      unreadCount,
    };
  });
}

function mapMessageRequests(rows, profileMap, { fromField, toField, mapRow }) {
  return (rows || []).map((req) => {
    const prof = profileMap.get(String(req[fromField] || "")) || null;
    return mapRow(req, prof);
  });
}

async function isBlockedEitherWay(a, b) {
  const ua = cleanUserId(a);
  const ub = cleanUserId(b);
  if (!ua || !ub) return true;
  const q = `or=(and(blocker_id.eq.${encodeURIComponent(ua)},blocked_id.eq.${encodeURIComponent(ub)}),and(blocker_id.eq.${encodeURIComponent(ub)},blocked_id.eq.${encodeURIComponent(ua)}))`;
  const r = await svcFetch(`dm_blocks?select=blocker_id&${q}&limit=1`);
  return Array.isArray(r.data) && r.data.length > 0;
}

async function isMutualFollow(userA, userB) {
  const a = cleanUserId(userA);
  const b = cleanUserId(userB);
  if (!a || !b) return false;
  const rpc = await callRpc("social_profile_stats", {
    p_user_id: b,
    p_viewer_id: a,
  });
  if (rpc.ok && rpc.data && typeof rpc.data === "object") {
    return Boolean(rpc.data.is_following) && Boolean(rpc.data.follows_viewer);
  }
  const [f1, f2] = await Promise.all([
    svcFetch(
      `social_follows?select=follower_user_id&follower_user_id=eq.${encodeURIComponent(a)}&following_user_id=eq.${encodeURIComponent(b)}&limit=1`,
    ),
    svcFetch(
      `social_follows?select=follower_user_id&follower_user_id=eq.${encodeURIComponent(b)}&following_user_id=eq.${encodeURIComponent(a)}&limit=1`,
    ),
  ]);
  return (
    f1.ok && f2.ok &&
    Array.isArray(f1.data) && f1.data.length > 0 &&
    Array.isArray(f2.data) && f2.data.length > 0
  );
}

async function presencePrefsForUser(userId) {
  const uid = cleanUserId(userId);
  if (!uid) return { enabled: false, hideTitles: false };
  const r = await svcFetch(
    `profiles?user_id=eq.${encodeURIComponent(uid)}&select=presence_enabled,presence_hide_titles&limit=1`,
  );
  const row = Array.isArray(r.data) && r.data[0] ? r.data[0] : null;
  // Default ON when the column is absent/null (feature is opt-out).
  return {
    enabled: row ? row.presence_enabled !== false : true,
    hideTitles: row ? row.presence_hide_titles === true : false,
  };
}

/** Read a partner's live presence, gated by mutual follow + their privacy. */
async function presenceForViewer(viewerId, partnerId) {
  const viewer = cleanUserId(viewerId);
  const partner = cleanUserId(partnerId);
  if (!viewer || !partner || viewer === partner) return { status: "idle" };
  const mutual = await isMutualFollow(viewer, partner);
  if (!mutual) return { status: "idle" };
  const prefs = await presencePrefsForUser(partner);
  if (!prefs.enabled) return { status: "idle" };
  const r = await svcFetch(
    `user_presence?user_id=eq.${encodeURIComponent(partner)}&select=status,song_id,song_title,song_cover,song_url,song_owner_id,expires_at&limit=1`,
  );
  const row = Array.isArray(r.data) && r.data[0] ? r.data[0] : null;
  if (!row) return { status: "idle" };
  const status = String(row.status || "idle");
  if (status === "idle") return { status: "idle" };
  if (row.expires_at && new Date(row.expires_at) < new Date()) return { status: "idle" };
  const out = { status };
  if (status === "now_playing") {
    out.isYourSong = cleanUserId(row.song_owner_id) === viewer;
    out.songId = String(row.song_id || "");
    out.songOwnerId = cleanUserId(row.song_owner_id);
    if (!prefs.hideTitles) {
      out.songTitle = String(row.song_title || "");
      out.songCover = String(row.song_cover || "");
      out.songUrl = String(row.song_url || "");
    } else {
      out.hideTitle = true;
    }
  }
  return out;
}

async function getThreadForUsers(userA, userB) {
  const pair = orderedPair(userA, userB);
  if (!pair) return null;
  const [user_a, user_b] = pair;
  const r = await svcFetch(
    `dm_threads?select=id,user_a,user_b,created_at,last_message_at&user_a=eq.${encodeURIComponent(user_a)}&user_b=eq.${encodeURIComponent(user_b)}&limit=1`,
  );
  return Array.isArray(r.data) && r.data[0] ? r.data[0] : null;
}

async function getOrCreateThread(userA, userB) {
  const existing = await getThreadForUsers(userA, userB);
  if (existing) return existing;
  const pair = orderedPair(userA, userB);
  if (!pair) return null;
  const [user_a, user_b] = pair;
  const ins = await svcFetch("dm_threads", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ user_a, user_b }),
  });
  if (ins.ok && Array.isArray(ins.data) && ins.data[0]) return ins.data[0];
  return getThreadForUsers(userA, userB);
}

function threadPartnerId(thread, viewerId) {
  const v = cleanUserId(viewerId);
  const a = cleanUserId(thread?.user_a);
  const b = cleanUserId(thread?.user_b);
  if (v === a) return b;
  if (v === b) return a;
  return "";
}

async function lastMessageForThread(threadId) {
  const tid = String(threadId || "").trim();
  if (!tid) return null;
  const r = await svcFetch(
    `dm_messages?select=id,body,sender_id,created_at&thread_id=eq.${encodeURIComponent(tid)}&order=created_at.desc&limit=1`,
  );
  return Array.isArray(r.data) && r.data[0] ? r.data[0] : null;
}

async function unreadCountForUser(userId) {
  const uid = cleanUserId(userId);
  if (!uid) return { count: 0, messageCount: 0, threadCount: 0 };
  const [threadsR, pendingR] = await Promise.all([
    svcFetch(
      `dm_threads?select=id,last_message_at&or=(user_a.eq.${encodeURIComponent(uid)},user_b.eq.${encodeURIComponent(uid)})&order=last_message_at.desc&limit=100`,
    ),
    svcFetch(
      `dm_message_requests?select=id&to_user_id=eq.${encodeURIComponent(uid)}&status=eq.pending&limit=50`,
    ),
  ]);
  const rows = Array.isArray(threadsR.data) ? threadsR.data : [];
  const pendingCount = Array.isArray(pendingR.data) ? pendingR.data.length : 0;
  if (!rows.length) {
    return { count: pendingCount, messageCount: pendingCount, threadCount: pendingCount };
  }
  const threadIds = rows.map((t) => String(t.id || "")).filter(Boolean);
  const [readMap, lastMsgMap] = await Promise.all([
    readsForUserThreads(uid, threadIds),
    lastMessagesForThreads(threadIds),
  ]);
  const unreadThreads = rows.filter((t) => {
    const tid = String(t.id || "");
    const lastRead = readMap.get(tid);
    const last = lastMsgMap.get(tid);
    if (last) {
      return String(last.sender_id) !== String(uid)
        && (!lastRead || new Date(last.created_at) > new Date(lastRead));
    }
    return !lastRead || new Date(t.last_message_at) > new Date(lastRead);
  });
  const unreadMap = unreadThreads.length
    ? await partnerUnreadMessagesForThreads(uid, unreadThreads.map((t) => String(t.id)), readMap)
    : new Map();
  let messageCount = pendingCount;
  let threadCount = pendingCount;
  for (const t of unreadThreads) {
    const tid = String(t.id || "");
    threadCount += 1;
    messageCount += unreadMap.get(tid) || 1;
  }
  return { count: messageCount, messageCount, threadCount };
}

function cleanVoiceDropKey(v) {
  const key = String(v || "").trim();
  return /^[\da-f-]{36}\/\d+\.[a-z0-9]+$/i.test(key) ? key : "";
}

async function userCanStreamVoiceKey(userId, key) {
  const uid = cleanUserId(userId);
  const safeKey = String(key || "").trim();
  if (!uid || !safeKey) return false;
  const needle = safeKey.replace(/,/g, "");
  const r = await svcFetch(
    `dm_messages?select=thread_id&body=like.${encodeURIComponent(`%${needle}%`)}&limit=10`,
  );
  const rows = Array.isArray(r.data) ? r.data : [];
  for (const row of rows) {
    const tid = String(row.thread_id || "").trim();
    if (!tid) continue;
    const tr = await svcFetch(
      `dm_threads?select=id,user_a,user_b&id=eq.${encodeURIComponent(tid)}&limit=1`,
    );
    const thread = Array.isArray(tr.data) && tr.data[0] ? tr.data[0] : null;
    if (thread && (thread.user_a === uid || thread.user_b === uid)) return true;
  }
  return false;
}

async function streamVoiceDropObject(res, key) {
  const encKey = key.split("/").map((s) => encodeURIComponent(s)).join("/");
  const upstream = await fetch(`${SUPABASE_URL}/storage/v1/object/${DM_VOICE_BUCKET}/${encKey}`, {
    method: "GET",
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    },
  });
  if (!upstream.ok || !upstream.body) {
    const txt = await upstream.text().catch(() => "");
    return sendJson(res, upstream.status === 404 ? 404 : 502, {
      ok: false,
      error: upstream.status === 404 ? "Voice file not found" : "Voice fetch failed",
      details: txt.slice(0, 200),
    });
  }
  res.statusCode = 200;
  res.setHeader("Content-Type", upstream.headers.get("content-type") || "audio/mp4");
  res.setHeader("Cache-Control", "private, max-age=3600");
  const cl = upstream.headers.get("content-length");
  if (cl) res.setHeader("Content-Length", cl);
  try {
    const nodeStream = Readable.fromWeb(upstream.body);
    nodeStream.on("error", () => {
      try {
        if (!res.writableEnded) res.end();
      } catch {}
    });
    res.on("close", () => {
      try {
        nodeStream.destroy();
      } catch {}
    });
    nodeStream.pipe(res);
  } catch {
    const ab = await upstream.arrayBuffer();
    res.end(Buffer.from(ab));
  }
  return true;
}

async function partnerLastReadAtForThread(thread, viewerId) {
  const partnerId = threadPartnerId(thread, viewerId);
  if (!partnerId || !thread?.id) return null;
  const reads = await svcFetch(
    `dm_thread_reads?select=last_read_at&thread_id=eq.${encodeURIComponent(thread.id)}&user_id=eq.${encodeURIComponent(partnerId)}&limit=1`,
  );
  return Array.isArray(reads.data) && reads.data[0] ? reads.data[0].last_read_at : null;
}

async function handleGet(req, res, user) {
  if (!user) return sendJson(res, 401, { ok: false, error: "Not signed in" });
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const type = String(url.searchParams.get("type") || "inbox");

  if (type === "unread_count") {
    const stats = await unreadCountForUser(user.userId);
    return sendJson(res, 200, {
      ok: true,
      count: stats.messageCount,
      messageCount: stats.messageCount,
      threadCount: stats.threadCount,
    });
  }

  if (type === "blocks") {
    const r = await svcFetch(
      `dm_blocks?select=blocked_id,created_at&blocker_id=eq.${encodeURIComponent(user.userId)}&order=created_at.desc&limit=200`,
    );
    const rows = Array.isArray(r.data) ? r.data : [];
    const blocked = await Promise.all(
      rows.map(async (row) => {
        const prof = await profileByUserId(row.blocked_id);
        return {
          userId: String(row.blocked_id || ""),
          username: prof?.username || "",
          avatar: prof?.avatar || "",
          blockedAt: row.created_at || "",
        };
      }),
    );
    return sendJson(res, 200, { ok: true, blocked });
  }

  if (type === "presence") {
    const partnerId = cleanUserId(url.searchParams.get("userId"));
    if (!partnerId) return sendJson(res, 400, { ok: false, error: "Missing userId" });
    const presence = await presenceForViewer(user.userId, partnerId);
    return sendJson(res, 200, { ok: true, presence });
  }

  if (type === "voice_drop") {
    const key = cleanVoiceDropKey(url.searchParams.get("key"));
    if (!key) return sendJson(res, 400, { ok: false, error: "Invalid key" });
    const allowed = await userCanStreamVoiceKey(user.userId, key);
    if (!allowed) return sendJson(res, 403, { ok: false, error: "Forbidden" });
    await streamVoiceDropObject(res, key);
    return;
  }

  if (type === "thread_read") {
    const threadId = String(url.searchParams.get("threadId") || "").trim();
    if (!threadId) return sendJson(res, 400, { ok: false, error: "Missing threadId" });
    const tr = await svcFetch(
      `dm_threads?select=id,user_a,user_b&or=(and(id.eq.${encodeURIComponent(threadId)},user_a.eq.${encodeURIComponent(user.userId)}),and(id.eq.${encodeURIComponent(threadId)},user_b.eq.${encodeURIComponent(user.userId)}))&limit=1`,
    );
    const thread = Array.isArray(tr.data) && tr.data[0] ? tr.data[0] : null;
    if (!thread) return sendJson(res, 404, { ok: false, error: "Thread not found" });
    const partnerLastReadAt = await partnerLastReadAtForThread(thread, user.userId);
    return sendJson(res, 200, { ok: true, partnerLastReadAt: partnerLastReadAt || null });
  }

  if (type === "thread") {
    const threadId = String(url.searchParams.get("threadId") || "").trim();
    if (!threadId) return sendJson(res, 400, { ok: false, error: "Missing threadId" });
    const tr = await svcFetch(
      `dm_threads?select=id,user_a,user_b&or=(and(id.eq.${encodeURIComponent(threadId)},user_a.eq.${encodeURIComponent(user.userId)}),and(id.eq.${encodeURIComponent(threadId)},user_b.eq.${encodeURIComponent(user.userId)}))&limit=1`,
    );
    const thread = Array.isArray(tr.data) && tr.data[0] ? tr.data[0] : null;
    if (!thread) return sendJson(res, 404, { ok: false, error: "Thread not found" });
    const limit = Math.min(80, Math.max(1, Number(url.searchParams.get("limit")) || 80));
    const before = String(url.searchParams.get("before") || "").trim();
    let msgPath =
      `dm_messages?select=id,sender_id,body,created_at,delivered_at&thread_id=eq.${encodeURIComponent(threadId)}&order=created_at.desc&limit=${limit}`;
    if (before) msgPath += `&created_at=lt.${encodeURIComponent(before)}`;
    const msgs = await svcFetch(msgPath);
    const rows = Array.isArray(msgs.data) ? [...msgs.data].reverse() : [];
    const partnerId = threadPartnerId(thread, user.userId);
    const prof = partnerId ? await profileByUserId(partnerId) : null;
    const partnerLastReadAt = await partnerLastReadAtForThread(thread, user.userId);
    return sendJson(res, 200, {
      ok: true,
      thread: {
        threadId: thread.id,
        partnerUserId: partnerId,
        partnerUsername: prof?.username || "",
        partnerAvatar: prof?.avatar || "",
      },
      partnerLastReadAt: partnerLastReadAt || null,
      messages: rows,
    });
  }

  if (type === "inbox") {
    const [threadsR, pendingR, sentR] = await Promise.all([
      svcFetch(
        `dm_threads?select=id,user_a,user_b,created_at,last_message_at&or=(user_a.eq.${encodeURIComponent(user.userId)},user_b.eq.${encodeURIComponent(user.userId)})&order=last_message_at.desc&limit=50`,
      ),
      svcFetch(
        `dm_message_requests?select=id,from_user_id,body,created_at&to_user_id=eq.${encodeURIComponent(user.userId)}&status=eq.pending&order=created_at.desc&limit=50`,
      ),
      svcFetch(
        `dm_message_requests?select=id,to_user_id,body,created_at&from_user_id=eq.${encodeURIComponent(user.userId)}&status=eq.pending&order=created_at.desc&limit=50`,
      ),
    ]);
    const threadRows = Array.isArray(threadsR.data) ? threadsR.data : [];
    const pendingRaw = Array.isArray(pendingR.data) ? pendingR.data : [];
    const sentRaw = Array.isArray(sentR.data) ? sentR.data : [];
    const requestUserIds = [
      ...pendingRaw.map((r) => r.from_user_id),
      ...sentRaw.map((r) => r.to_user_id),
    ];
    const [threads, requestProfiles] = await Promise.all([
      enrichInboxThreads(threadRows, user.userId),
      profilesByUserIds(requestUserIds),
    ]);
    const requests = mapMessageRequests(pendingRaw, requestProfiles, {
      fromField: "from_user_id",
      mapRow: (req, prof) => ({
        requestId: req.id,
        fromUserId: req.from_user_id,
        fromUsername: prof?.username || "",
        fromAvatar: prof?.avatar || "",
        body: req.body,
        createdAt: req.created_at,
      }),
    });
    const sentRequests = mapMessageRequests(sentRaw, requestProfiles, {
      fromField: "to_user_id",
      mapRow: (req, prof) => ({
        requestId: req.id,
        toUserId: req.to_user_id,
        toUsername: prof?.username || "",
        toAvatar: prof?.avatar || "",
        body: req.body,
        createdAt: req.created_at,
      }),
    });

    return sendJson(res, 200, { ok: true, threads, requests, sentRequests });
  }

  return sendJson(res, 400, { ok: false, error: "Unknown messages query" });
}

async function insertMessage({ threadId, senderId, body, clientMessageId = "" }) {
  const now = new Date().toISOString();
  const row = {
    thread_id: threadId,
    sender_id: senderId,
    body,
  };
  const ins = await svcFetch("dm_messages", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(row),
  });
  if (!ins.ok) return { ok: false, error: ins.text || "Send failed" };
  await svcFetch(`dm_threads?id=eq.${encodeURIComponent(threadId)}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ last_message_at: now }),
  });
  await svcFetch("dm_thread_reads", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({
      thread_id: threadId,
      user_id: senderId,
      last_read_at: now,
    }),
  });
  const message = Array.isArray(ins.data) && ins.data[0] ? ins.data[0] : null;
  const clientId = String(clientMessageId || "").trim();
  if (message && clientId) message.client_message_id = clientId;
  return { ok: true, message };
}

async function handlePost(req, res, user) {
  if (!user) return sendJson(res, 401, { ok: false, error: "Not signed in" });
  const body = await readJsonBody(req);
  const action = String(body?.action || "").trim();
  const targetUserId = cleanUserId(body?.targetUserId);

  if (action === "upload_voice_drop") {
    const uploaded = await uploadVoiceDropForUser(user.userId, {
      dataBase64: body?.dataBase64 || body?.audioBase64,
      contentType: body?.contentType,
    });
    if (!uploaded.ok) {
      return sendJson(res, 400, { ok: false, error: uploaded.error || "Upload failed" });
    }
    return sendJson(res, 200, {
      ok: true,
      url: uploaded.url,
      key: uploaded.key,
      bytes: uploaded.bytes,
    });
  }

  if (action === "set_presence") {
    const allowed = new Set(["idle", "now_playing", "creating", "recording"]);
    const status = allowed.has(String(body?.status)) ? String(body.status) : "idle";
    const ttl = Math.min(900, Math.max(5, Number(body?.ttlSeconds) || 60));
    const nowIso = new Date().toISOString();
    const row = {
      user_id: user.userId,
      status,
      song_id: status === "now_playing" ? String(body?.songId || "").slice(0, 200) || null : null,
      song_title: status === "now_playing" ? String(body?.songTitle || "").slice(0, 200) || null : null,
      song_cover: status === "now_playing" ? String(body?.songCover || "").slice(0, 600) || null : null,
      song_url: status === "now_playing" ? String(body?.songUrl || "").slice(0, 900) || null : null,
      song_owner_id: status === "now_playing" ? (cleanUserId(body?.songOwnerId) || null) : null,
      updated_at: nowIso,
      expires_at: status === "idle" ? nowIso : new Date(Date.now() + ttl * 1000).toISOString(),
    };
    const r = await svcFetch("user_presence", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify(row),
    });
    if (!r.ok) return sendJson(res, 500, { ok: false, error: "Presence update failed" });
    return sendJson(res, 200, { ok: true });
  }

  if (action === "set_presence_prefs") {
    const patch = {};
    if (typeof body?.presenceEnabled === "boolean") patch.presence_enabled = body.presenceEnabled;
    if (typeof body?.hideTitles === "boolean") patch.presence_hide_titles = body.hideTitles;
    if (!Object.keys(patch).length) return sendJson(res, 200, { ok: true });
    const r = await svcFetch(`profiles?user_id=eq.${encodeURIComponent(user.userId)}`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify(patch),
    });
    if (!r.ok) return sendJson(res, 500, { ok: false, error: "Presence prefs update failed" });
    return sendJson(res, 200, { ok: true });
  }

  if (action === "mark_read") {
    const threadId = String(body?.threadId || "").trim();
    if (!threadId) return sendJson(res, 400, { ok: false, error: "Missing threadId" });
    const now = new Date().toISOString();
    await svcFetch("dm_thread_reads", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify({
        thread_id: threadId,
        user_id: user.userId,
        last_read_at: now,
      }),
    });
    return sendJson(res, 200, { ok: true });
  }

  if (action === "mark_delivered") {
    const threadId = String(body?.threadId || "").trim();
    const messageIds = (Array.isArray(body?.messageIds) ? body.messageIds : [])
      .map((id) => String(id || "").trim())
      .filter(Boolean)
      .slice(0, 48);
    if (!threadId || !messageIds.length) {
      return sendJson(res, 400, { ok: false, error: "Missing threadId or messageIds" });
    }
    const tr = await svcFetch(
      `dm_threads?select=id,user_a,user_b&or=(and(id.eq.${encodeURIComponent(threadId)},user_a.eq.${encodeURIComponent(user.userId)}),and(id.eq.${encodeURIComponent(threadId)},user_b.eq.${encodeURIComponent(user.userId)}))&limit=1`,
    );
    const thread = Array.isArray(tr.data) && tr.data[0] ? tr.data[0] : null;
    if (!thread) return sendJson(res, 404, { ok: false, error: "Thread not found" });
    const now = new Date().toISOString();
    const inClause = messageIds.map((id) => encodeURIComponent(id)).join(",");
    const r = await svcFetch(
      `dm_messages?id=in.(${inClause})&thread_id=eq.${encodeURIComponent(threadId)}&sender_id=neq.${encodeURIComponent(user.userId)}&delivered_at=is.null`,
      {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({ delivered_at: now }),
      },
    );
    if (!r.ok) {
      const missingCol = /delivered_at|column|42703/i.test(String(r.text || ""));
      if (missingCol) return sendJson(res, 200, { ok: true, skipped: true });
      return sendJson(res, 500, { ok: false, error: "Delivery ack failed" });
    }
    return sendJson(res, 200, { ok: true, deliveredAt: now });
  }

  if (action === "block") {
    if (!targetUserId) return sendJson(res, 400, { ok: false, error: "Missing targetUserId" });
    if (targetUserId === user.userId) return sendJson(res, 400, { ok: false, error: "Invalid target" });
    await svcFetch("dm_blocks", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ blocker_id: user.userId, blocked_id: targetUserId }),
    });
    return sendJson(res, 200, { ok: true });
  }

  if (action === "unblock") {
    if (!targetUserId) return sendJson(res, 400, { ok: false, error: "Missing targetUserId" });
    await svcFetch(
      `dm_blocks?blocker_id=eq.${encodeURIComponent(user.userId)}&blocked_id=eq.${encodeURIComponent(targetUserId)}`,
      { method: "DELETE", headers: { Prefer: "return=minimal" } },
    );
    return sendJson(res, 200, { ok: true });
  }

  if (action === "respond_request") {
    const requestId = String(body?.requestId || "").trim();
    const decision = String(body?.decision || "").trim();
    if (!requestId || !["accept", "decline"].includes(decision)) {
      return sendJson(res, 400, { ok: false, error: "Invalid request response" });
    }
    const reqR = await svcFetch(
      `dm_message_requests?select=id,from_user_id,to_user_id,body,status&id=eq.${encodeURIComponent(requestId)}&to_user_id=eq.${encodeURIComponent(user.userId)}&limit=1`,
    );
    const reqRow = Array.isArray(reqR.data) && reqR.data[0] ? reqR.data[0] : null;
    if (!reqRow || reqRow.status !== "pending") {
      return sendJson(res, 404, { ok: false, error: "Request not found" });
    }
    const now = new Date().toISOString();
    if (decision === "decline") {
      await svcFetch(`dm_message_requests?id=eq.${encodeURIComponent(requestId)}`, {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({ status: "declined", responded_at: now }),
      });
      return sendJson(res, 200, { ok: true, declined: true });
    }
    if (await isBlockedEitherWay(user.userId, reqRow.from_user_id)) {
      return sendJson(res, 403, { ok: false, error: "Blocked" });
    }
    const thread = await getOrCreateThread(user.userId, reqRow.from_user_id);
    if (!thread) return sendJson(res, 500, { ok: false, error: "Could not open thread" });
    await insertMessage({
      threadId: thread.id,
      senderId: reqRow.from_user_id,
      body: String(reqRow.body || "").trim(),
    });
    await svcFetch(`dm_message_requests?id=eq.${encodeURIComponent(requestId)}`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ status: "accepted", responded_at: now }),
    });
    return sendJson(res, 200, { ok: true, threadId: thread.id });
  }

  if (action === "send_request") {
    const text = cleanBody(body?.body);
    if (!targetUserId || !text) {
      return sendJson(res, 400, { ok: false, error: "Missing target or message" });
    }
    if (targetUserId === user.userId) return sendJson(res, 400, { ok: false, error: "Invalid target" });
    if (await isBlockedEitherWay(user.userId, targetUserId)) {
      return sendJson(res, 403, { ok: false, error: "Cannot message this user" });
    }
    if (await isMutualFollow(user.userId, targetUserId)) {
      return sendJson(res, 400, { ok: false, error: "Mutual follow — send a message instead" });
    }
    const existingThread = await getThreadForUsers(user.userId, targetUserId);
    if (existingThread) {
      return sendJson(res, 400, { ok: false, error: "Thread already open" });
    }
    const ins = await svcFetch("dm_message_requests", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        from_user_id: user.userId,
        to_user_id: targetUserId,
        body: text,
        status: "pending",
      }),
    });
    if (!ins.ok) {
      const dup = /duplicate|unique|23505/i.test(String(ins.text || ""));
      if (dup) return sendJson(res, 409, { ok: false, error: "Request already pending" });
      return sendJson(res, 500, { ok: false, error: "Request failed", details: ins.text });
    }
    const senderProfile = await profileByUserId(user.userId);
    queuePrivacySafePush({
      userId: targetUserId,
      type: "dm_request",
      actorDisplayName: senderProfile?.username || "Someone",
    });
    return sendJson(res, 200, {
      ok: true,
      request: Array.isArray(ins.data) && ins.data[0] ? ins.data[0] : null,
    });
  }

  if (action === "open_thread") {
    if (!targetUserId) return sendJson(res, 400, { ok: false, error: "Missing targetUserId" });
    if (targetUserId === user.userId) return sendJson(res, 400, { ok: false, error: "Invalid target" });
    if (await isBlockedEitherWay(user.userId, targetUserId)) {
      return sendJson(res, 403, { ok: false, error: "Cannot message this user" });
    }
    const mutual = await isMutualFollow(user.userId, targetUserId);
    if (!mutual) {
      return sendJson(res, 200, { ok: true, needsRequest: true, targetUserId });
    }
    const thread = await getOrCreateThread(user.userId, targetUserId);
    if (!thread) return sendJson(res, 500, { ok: false, error: "Could not open thread" });
    return sendJson(res, 200, { ok: true, threadId: thread.id });
  }

  if (action === "send_message") {
    const text = cleanBody(body?.body);
    const threadId = String(body?.threadId || "").trim();
    if (!text) return sendJson(res, 400, { ok: false, error: "Message required" });

    let thread = null;
    if (threadId) {
      const tr = await svcFetch(
        `dm_threads?select=id,user_a,user_b&id=eq.${encodeURIComponent(threadId)}&limit=1`,
      );
      thread = Array.isArray(tr.data) && tr.data[0] ? tr.data[0] : null;
      const a = cleanUserId(thread?.user_a);
      const b = cleanUserId(thread?.user_b);
      if (!thread || (user.userId !== a && user.userId !== b)) {
        return sendJson(res, 404, { ok: false, error: "Thread not found" });
      }
    } else if (targetUserId) {
      if (targetUserId === user.userId) return sendJson(res, 400, { ok: false, error: "Invalid target" });
      if (await isBlockedEitherWay(user.userId, targetUserId)) {
        return sendJson(res, 403, { ok: false, error: "Cannot message this user" });
      }
      const mutual = await isMutualFollow(user.userId, targetUserId);
      if (!mutual) {
        return sendJson(res, 403, { ok: false, error: "Become mutual fans to chat, or send a request" });
      }
      thread = await getOrCreateThread(user.userId, targetUserId);
    } else {
      return sendJson(res, 400, { ok: false, error: "Missing threadId or targetUserId" });
    }

    const sent = await insertMessage({
      threadId: thread.id,
      senderId: user.userId,
      body: text,
      clientMessageId: String(body?.clientMessageId || body?.client_message_id || "").trim(),
    });
    if (!sent.ok) return sendJson(res, 500, { ok: false, error: sent.error || "Send failed" });
    const recipientId = threadPartnerId(thread, user.userId);
    if (recipientId) {
      const senderProfile = await profileByUserId(user.userId);
      queuePrivacySafePush({
        userId: recipientId,
        type: "dm_message",
        entityId: thread.id,
        actorDisplayName: senderProfile?.username || "Someone",
      });
    }
    return sendJson(res, 200, { ok: true, threadId: thread.id, message: sent.message });
  }

  return sendJson(res, 400, { ok: false, error: "Unknown messages action" });
}

module.exports = async function handler(req, res) {
  setCors(res);
  if (req.method === "OPTIONS") return res.end();
  const user = await verifyUser(req);
  if (req.method === "GET") return handleGet(req, res, user);
  if (req.method === "POST") return handlePost(req, res, user);
  return sendJson(res, 405, { ok: false, error: "Method not allowed" });
};
