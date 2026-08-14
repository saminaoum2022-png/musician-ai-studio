/**
 * DM thread live updates via Supabase Realtime (postgres_changes on dm_messages).
 * Loaded lazily when opening a conversation; polling remains the safety fallback.
 */

import { createClient } from "../vendor/supabase/bundle.mjs";

const DM_REALTIME_FLAG_KEY = "nabad_dm_realtime:v1";

let _client = null;
let _channel = null;
let _activeThreadId = "";
let _channelReady = false;
let _onTypingHandler = null;

export async function sendDmThreadTypingBroadcast({ userId } = {}) {
  const uid = String(userId || "").trim();
  if (!_channel || !_activeThreadId || !uid || !_channelReady) return false;
  try {
    const status = await _channel.send({
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
  return {
    id,
    sender_id: String(raw.sender_id || ""),
    body: String(raw.body || ""),
    created_at: String(raw.created_at || ""),
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
  const channel = _channel;
  _channel = null;
  _activeThreadId = "";
  _channelReady = false;
  _onTypingHandler = null;
  if (!client || !channel) return;
  try {
    await client.removeChannel(channel);
  } catch (e) {
    console.warn("[dm-realtime] unsubscribe failed", e);
  }
}

export async function subscribeDmThread({
  supabaseUrl,
  supabaseAnonKey,
  accessToken,
  threadId,
  partnerUserId = "",
  onInsert,
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

  if (_activeThreadId === tid && _channel) {
    _onTypingHandler = onTyping;
    await refreshDmThreadRealtimeAuth(token);
    return true;
  }

  await stopDmThreadRealtime();
  _onTypingHandler = onTyping;

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
          try { onInsert?.(row); } catch (e) { console.warn("[dm-realtime] onInsert", e); }
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
        if (partnerId && readUserId !== partnerId) return;
        const lastReadAt = String(row.last_read_at || "").trim();
        if (!lastReadAt) return;
        try { onReadUpdate?.({ userId: readUserId, lastReadAt }); } catch (e) { console.warn("[dm-realtime] onReadUpdate", e); }
      },
    )
    .subscribe((status, err) => {
      _channelReady = status === "SUBSCRIBED";
      try {
        onStatus?.(status, err);
      } catch {}
      try {
        console.info("[dm-realtime]", { threadId: tid, status, error: err?.message || "" });
      } catch {}
    });

  _channel = channel;
  _activeThreadId = tid;
  return true;
}

export async function disconnectDmRealtime() {
  await stopDmThreadRealtime();
  if (_client) {
    try {
      _client.realtime.disconnect();
    } catch {}
  }
  _client = null;
}
