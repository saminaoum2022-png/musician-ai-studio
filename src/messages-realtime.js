/**
 * DM live updates via Supabase Realtime (postgres_changes on dm_messages).
 * Thread channel: one conversation. Inbox channel: all participant threads (RLS-filtered).
 * Polling remains the safety fallback when Realtime is unavailable.
 */

import { createClient } from "../vendor/supabase/bundle.mjs";

const DM_REALTIME_FLAG_KEY = "nabad_dm_realtime:v1";

let _client = null;
let _threadChannel = null;
let _inboxChannel = null;
let _activeThreadId = "";
let _activeThreadPartnerId = "";
let _activeInboxUserId = "";
let _threadChannelReady = false;
let _inboxChannelReady = false;
let _onTypingHandler = null;
let _onThreadInsertHandler = null;
let _onThreadUpdateHandler = null;
let _onReadUpdateHandler = null;
let _onInboxInsertHandler = null;
let _onInboxUpdateHandler = null;

export function isDmThreadChannelReady() {
  return Boolean(_threadChannelReady && _threadChannel && _activeThreadId);
}

export function isDmInboxChannelReady() {
  return Boolean(_inboxChannelReady && _inboxChannel && _activeInboxUserId);
}

export async function sendDmThreadTypingBroadcast({ userId } = {}) {
  const uid = String(userId || "").trim();
  if (!_threadChannel || !_activeThreadId || !uid || !_threadChannelReady) return false;
  try {
    const status = await _threadChannel.send({
      type: "broadcast",
      event: "dm_typing",
      payload: { userId: uid, at: Date.now() },
    });
    return status === "ok";
  } catch (e) {
    console.warn("[dm-realtime] typing broadcast failed", e);
    return false;
  }
}

export function isDmPostgresRealtimeEnabled() {
  try {
    if (localStorage.getItem(DM_REALTIME_FLAG_KEY) === "0") return false;
  } catch {}
  return true;
}

function normalizeRow(raw) {
  if (!raw || typeof raw !== "object") return null;
  const id = String(raw.id || "").trim();
  if (!id) return null;
  const deliveredAt = String(raw.delivered_at || "").trim();
  return {
    id,
    thread_id: String(raw.thread_id || ""),
    sender_id: String(raw.sender_id || ""),
    body: String(raw.body || ""),
    created_at: String(raw.created_at || ""),
    delivered_at: deliveredAt || null,
  };
}

function getOrCreateClient(supabaseUrl, supabaseAnonKey) {
  const url = String(supabaseUrl || "").trim();
  const key = String(supabaseAnonKey || "").trim();
  if (!url || !key) return null;
  if (!_client) {
    _client = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
  }
  return _client;
}

export async function refreshDmThreadRealtimeAuth(accessToken) {
  const token = String(accessToken || "").trim();
  if (!_client || !token) return;
  try {
    _client.realtime.setAuth(token);
  } catch (e) {
    console.warn("[dm-realtime] setAuth failed", e);
  }
}

export async function stopDmThreadRealtime() {
  const client = _client;
  const channel = _threadChannel;
  _threadChannel = null;
  _activeThreadId = "";
  _activeThreadPartnerId = "";
  _threadChannelReady = false;
  _onTypingHandler = null;
  _onThreadInsertHandler = null;
  _onThreadUpdateHandler = null;
  _onReadUpdateHandler = null;
  if (!client || !channel) return;
  try {
    await client.removeChannel(channel);
  } catch (e) {
    console.warn("[dm-realtime] thread unsubscribe failed", e);
  }
}

export async function stopDmInboxRealtime() {
  const client = _client;
  const channel = _inboxChannel;
  _inboxChannel = null;
  _activeInboxUserId = "";
  _inboxChannelReady = false;
  _onInboxInsertHandler = null;
  _onInboxUpdateHandler = null;
  if (!client || !channel) return;
  try {
    await client.removeChannel(channel);
  } catch (e) {
    console.warn("[dm-realtime] inbox unsubscribe failed", e);
  }
}

export async function subscribeDmThread({
  supabaseUrl,
  supabaseAnonKey,
  accessToken,
  threadId,
  partnerUserId = "",
  onInsert,
  onMessageUpdate,
  onReadUpdate,
  onTyping,
  onStatus,
} = {}) {
  const tid = String(threadId || "").trim();
  const partnerId = String(partnerUserId || "").trim();
  const token = String(accessToken || "").trim();
  if (!tid || !token || !isDmPostgresRealtimeEnabled()) return false;

  const client = getOrCreateClient(supabaseUrl, supabaseAnonKey);
  if (!client) return false;

  if (_activeThreadId === tid && _threadChannel) {
    _activeThreadPartnerId = partnerId;
    _onTypingHandler = onTyping;
    _onThreadInsertHandler = onInsert;
    _onThreadUpdateHandler = onMessageUpdate;
    _onReadUpdateHandler = onReadUpdate;
    await refreshDmThreadRealtimeAuth(token);
    return true;
  }

  await stopDmThreadRealtime();
  _activeThreadPartnerId = partnerId;
  _onTypingHandler = onTyping;
  _onThreadInsertHandler = onInsert;
  _onThreadUpdateHandler = onMessageUpdate;
  _onReadUpdateHandler = onReadUpdate;

  try {
    client.realtime.setAuth(token);
  } catch (e) {
    console.warn("[dm-realtime] setAuth failed", e);
    return false;
  }

  const channel = client
    .channel(`dm-thread:${tid}`, {
      config: { broadcast: { self: false } },
    })
    .on(
      "broadcast",
      { event: "dm_typing" },
      (payload) => {
        const userId = String(payload?.payload?.userId || "").trim();
        if (!userId) return;
        try { _onTypingHandler?.({ userId, at: payload?.payload?.at }); } catch (e) { console.warn("[dm-realtime] onTyping", e); }
      },
    )
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "dm_messages",
        filter: `thread_id=eq.${tid}`,
      },
      (payload) => {
        const row = normalizeRow(payload?.new);
        if (row) {
          try { _onThreadInsertHandler?.(row); } catch (e) { console.warn("[dm-realtime] onInsert", e); }
        }
      },
    )
    .on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: "dm_messages",
        filter: `thread_id=eq.${tid}`,
      },
      (payload) => {
        const row = normalizeRow(payload?.new);
        if (row) {
          try { _onThreadUpdateHandler?.(row); } catch (e) { console.warn("[dm-realtime] onMessageUpdate", e); }
        }
      },
    )
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "dm_thread_reads",
        filter: `thread_id=eq.${tid}`,
      },
      (payload) => {
        const row = payload?.new;
        if (!row || typeof row !== "object") return;
        const readUserId = String(row.user_id || "").trim();
        const activePartnerId = String(_activeThreadPartnerId || "").trim();
        if (!activePartnerId || readUserId !== activePartnerId) return;
        const lastReadAt = String(row.last_read_at || "").trim();
        if (!lastReadAt) return;
        try { _onReadUpdateHandler?.({ userId: readUserId, lastReadAt }); } catch (e) { console.warn("[dm-realtime] onReadUpdate", e); }
      },
    )
    .subscribe((status, err) => {
      _threadChannelReady = status === "SUBSCRIBED";
      try {
        onStatus?.(status, err);
      } catch {}
      try {
        console.info("[dm-realtime]", { threadId: tid, status, error: err?.message || "" });
      } catch {}
    });

  _threadChannel = channel;
  _activeThreadId = tid;
  return true;
}

/** Inbox: all dm_messages INSERT visible to this user (RLS on dm_messages). */
export async function subscribeDmInbox({
  supabaseUrl,
  supabaseAnonKey,
  accessToken,
  userId,
  onInsert,
  onUpdate,
  onStatus,
} = {}) {
  const uid = String(userId || "").trim();
  const token = String(accessToken || "").trim();
  if (!uid || !token || !isDmPostgresRealtimeEnabled()) return false;

  const client = getOrCreateClient(supabaseUrl, supabaseAnonKey);
  if (!client) return false;

  if (_activeInboxUserId === uid && _inboxChannel) {
    _onInboxInsertHandler = onInsert;
    _onInboxUpdateHandler = onUpdate;
    await refreshDmThreadRealtimeAuth(token);
    return true;
  }

  await stopDmInboxRealtime();
  _onInboxInsertHandler = onInsert;
  _onInboxUpdateHandler = onUpdate;

  try {
    client.realtime.setAuth(token);
  } catch (e) {
    console.warn("[dm-realtime] setAuth failed", e);
    return false;
  }

  const channel = client
    .channel(`dm-inbox:${uid}`, {
      config: { broadcast: { self: false } },
    })
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "dm_messages",
      },
      (payload) => {
        const row = normalizeRow(payload?.new);
        if (row) {
          try { _onInboxInsertHandler?.(row); } catch (e) { console.warn("[dm-realtime] inbox onInsert", e); }
        }
      },
    )
    .on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: "dm_messages",
      },
      (payload) => {
        const row = normalizeRow(payload?.new);
        if (row) {
          try { _onInboxUpdateHandler?.(row); } catch (e) { console.warn("[dm-realtime] inbox onUpdate", e); }
        }
      },
    )
    .subscribe((status, err) => {
      _inboxChannelReady = status === "SUBSCRIBED";
      try {
        onStatus?.(status, err);
      } catch {}
      try {
        console.info("[dm-realtime]", { inbox: uid, status, error: err?.message || "" });
      } catch {}
    });

  _inboxChannel = channel;
  _activeInboxUserId = uid;
  return true;
}

export async function disconnectDmRealtime() {
  await stopDmThreadRealtime();
  await stopDmInboxRealtime();
  if (_client) {
    try {
      _client.realtime.disconnect();
    } catch {}
  }
  _client = null;
}
