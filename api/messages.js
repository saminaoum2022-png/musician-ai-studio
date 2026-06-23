/**
 * Direct messages — mutual follow opens a thread; otherwise message request.
 * Text only (v1). Service role writes; user JWT verified at edge.
 */

const {
  verifyUser,
  sendJson,
  setCors,
  readJsonBody,
  callRpc,
} = require("./_lib/credits-auth");
const { queuePrivacySafePush } = require("./_lib/onesignal-push");

const SUPABASE_URL = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const SVC_FETCH_TIMEOUT_MS = 8000;
const MAX_BODY = 500;

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

function orderedPair(a, b) {
  const x = cleanUserId(a);
  const y = cleanUserId(b);
  if (!x || !y || x === y) return null;
  return x < y ? [x, y] : [y, x];
}

async function profileByUserId(userId) {
  const uid = cleanUserId(userId);
  if (!uid) return null;
  const r = await svcFetch(
    `profiles?user_id=eq.${encodeURIComponent(uid)}&select=user_id,username,avatar&limit=1`,
  );
  const row = Array.isArray(r.data) && r.data[0] ? r.data[0] : null;
  if (!row) return null;
  return {
    user_id: String(row.user_id || ""),
    username: String(row.username || "").trim(),
    avatar: String(row.avatar || "").trim(),
  };
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
  if (!uid) return 0;
  const threads = await svcFetch(
    `dm_threads?select=id,last_message_at&or=(user_a.eq.${encodeURIComponent(uid)},user_b.eq.${encodeURIComponent(uid)})&order=last_message_at.desc&limit=100`,
  );
  const rows = Array.isArray(threads.data) ? threads.data : [];
  if (!rows.length) {
    const pending = await svcFetch(
      `dm_message_requests?select=id&to_user_id=eq.${encodeURIComponent(uid)}&status=eq.pending&limit=50`,
    );
    return Array.isArray(pending.data) ? pending.data.length : 0;
  }
  const reads = await svcFetch(
    `dm_thread_reads?select=thread_id,last_read_at&user_id=eq.${encodeURIComponent(uid)}`,
  );
  const readMap = new Map(
    (Array.isArray(reads.data) ? reads.data : []).map((r) => [String(r.thread_id), r.last_read_at]),
  );
  let unread = 0;
  for (const t of rows) {
    const tid = String(t.id || "");
    const lastRead = readMap.get(tid);
    if (!lastRead || new Date(t.last_message_at) > new Date(lastRead)) unread += 1;
  }
  const pending = await svcFetch(
    `dm_message_requests?select=id&to_user_id=eq.${encodeURIComponent(uid)}&status=eq.pending&limit=50`,
  );
  unread += Array.isArray(pending.data) ? pending.data.length : 0;
  return unread;
}

async function enrichThreadRow(thread, viewerId) {
  const partnerId = threadPartnerId(thread, viewerId);
  const prof = partnerId ? await profileByUserId(partnerId) : null;
  const last = await lastMessageForThread(thread.id);
  const reads = await svcFetch(
    `dm_thread_reads?select=last_read_at&thread_id=eq.${encodeURIComponent(thread.id)}&user_id=eq.${encodeURIComponent(viewerId)}&limit=1`,
  );
  const lastRead = Array.isArray(reads.data) && reads.data[0] ? reads.data[0].last_read_at : null;
  const unread = last && String(last.sender_id) !== String(viewerId)
    && (!lastRead || new Date(last.created_at) > new Date(lastRead));
  return {
    threadId: thread.id,
    partnerUserId: partnerId,
    partnerUsername: prof?.username || "",
    partnerAvatar: prof?.avatar || "",
    lastMessage: last?.body || "",
    lastMessageAt: last?.created_at || thread.last_message_at,
    unread: Boolean(unread),
  };
}

async function handleGet(req, res, user) {
  if (!user) return sendJson(res, 401, { ok: false, error: "Not signed in" });
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const type = String(url.searchParams.get("type") || "inbox");

  if (type === "unread_count") {
    const count = await unreadCountForUser(user.userId);
    return sendJson(res, 200, { ok: true, count });
  }

  if (type === "thread") {
    const threadId = String(url.searchParams.get("threadId") || "").trim();
    if (!threadId) return sendJson(res, 400, { ok: false, error: "Missing threadId" });
    const tr = await svcFetch(
      `dm_threads?select=id,user_a,user_b&or=(and(id.eq.${encodeURIComponent(threadId)},user_a.eq.${encodeURIComponent(user.userId)}),and(id.eq.${encodeURIComponent(threadId)},user_b.eq.${encodeURIComponent(user.userId)}))&limit=1`,
    );
    const thread = Array.isArray(tr.data) && tr.data[0] ? tr.data[0] : null;
    if (!thread) return sendJson(res, 404, { ok: false, error: "Thread not found" });
    const limit = Math.min(80, Math.max(1, Number(url.searchParams.get("limit")) || 40));
    const msgs = await svcFetch(
      `dm_messages?select=id,sender_id,body,created_at&thread_id=eq.${encodeURIComponent(threadId)}&order=created_at.asc&limit=${limit}`,
    );
    const partnerId = threadPartnerId(thread, user.userId);
    const prof = partnerId ? await profileByUserId(partnerId) : null;
    return sendJson(res, 200, {
      ok: true,
      thread: {
        threadId: thread.id,
        partnerUserId: partnerId,
        partnerUsername: prof?.username || "",
        partnerAvatar: prof?.avatar || "",
      },
      messages: Array.isArray(msgs.data) ? msgs.data : [],
    });
  }

  if (type === "inbox") {
    const threadsR = await svcFetch(
      `dm_threads?select=id,user_a,user_b,created_at,last_message_at&or=(user_a.eq.${encodeURIComponent(user.userId)},user_b.eq.${encodeURIComponent(user.userId)})&order=last_message_at.desc&limit=50`,
    );
    const threadRows = Array.isArray(threadsR.data) ? threadsR.data : [];
    const threads = await Promise.all(threadRows.map((t) => enrichThreadRow(t, user.userId)));

    const pendingR = await svcFetch(
      `dm_message_requests?select=id,from_user_id,body,created_at&to_user_id=eq.${encodeURIComponent(user.userId)}&status=eq.pending&order=created_at.desc&limit=50`,
    );
    const pendingRaw = Array.isArray(pendingR.data) ? pendingR.data : [];
    const requests = await Promise.all(
      pendingRaw.map(async (req) => {
        const prof = await profileByUserId(req.from_user_id);
        return {
          requestId: req.id,
          fromUserId: req.from_user_id,
          fromUsername: prof?.username || "",
          fromAvatar: prof?.avatar || "",
          body: req.body,
          createdAt: req.created_at,
        };
      }),
    );

    const sentR = await svcFetch(
      `dm_message_requests?select=id,to_user_id,body,created_at&from_user_id=eq.${encodeURIComponent(user.userId)}&status=eq.pending&order=created_at.desc&limit=50`,
    );
    const sentRaw = Array.isArray(sentR.data) ? sentR.data : [];
    const sentRequests = await Promise.all(
      sentRaw.map(async (req) => {
        const prof = await profileByUserId(req.to_user_id);
        return {
          requestId: req.id,
          toUserId: req.to_user_id,
          toUsername: prof?.username || "",
          toAvatar: prof?.avatar || "",
          body: req.body,
          createdAt: req.created_at,
        };
      }),
    );

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
        return sendJson(res, 403, { ok: false, error: "Follow each other to chat, or send a request" });
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
      queuePrivacySafePush({
        userId: recipientId,
        type: "dm_message",
        entityId: thread.id,
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
