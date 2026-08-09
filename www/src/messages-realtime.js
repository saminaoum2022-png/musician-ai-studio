/**
 * DM thread live updates via Supabase Realtime (postgres_changes on dm_messages).
 * Loaded lazily when opening a conversation; polling remains the safety fallback.
 */

import { createClient } from "../vendor/supabase/bundle.mjs";

const DM_REALTIME_FLAG_KEY = "nabad_dm_realtime:v1";

let _client = null;
let _channel = null;
let _activeThreadId = "";

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
  onInsert,
  onStatus,
} = {}) {
  const tid = String(threadId || "").trim();
  const token = String(accessToken || "").trim();
  if (!tid || !token || !isDmPostgresRealtimeEnabled()) return false;

  const client = getOrCreateClient(supabaseUrl, supabaseAnonKey);
  if (!client) return false;

  if (_activeThreadId === tid && _channel) {
    await refreshDmThreadRealtimeAuth(token);
    return true;
  }

  await stopDmThreadRealtime();

  try {
    client.realtime.setAuth(token);
  } catch (e) {
    console.warn("[dm-realtime] setAuth failed", e);
    return false;
  }

  const channel = client
    .channel(`dm-thread:${tid}`)
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
    .subscribe((status, err) => {
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
