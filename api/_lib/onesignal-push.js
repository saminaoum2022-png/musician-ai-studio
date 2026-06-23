/**
 * Privacy-first OneSignal push delivery for Nabad.
 *
 * - Never send message bodies, usernames, emails, or song titles to OneSignal.
 * - Only generic copy (e.g. "New message", "New follower").
 * - Deep-link hints use opaque route/category keys only.
 * - Target by stored subscription IDs first; fall back to external_id (Supabase UUID).
 */

const ONESIGNAL_APP_ID = String(process.env.ONESIGNAL_APP_ID || "").trim();
const ONESIGNAL_REST_API_KEY = String(process.env.ONESIGNAL_REST_API_KEY || "").trim();
const SUPABASE_URL = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

/** @type {Record<string, { title: string, body: string, route: string } | null>} */
const PUSH_TEMPLATES = {
  follow: { title: "Nabad", body: "New follower", route: "activity" },
  social_like: { title: "Nabad", body: "New like", route: "activity" },
  social_reply: { title: "Nabad", body: "New activity", route: "activity" },
  chart_rank: { title: "Nabad", body: "Top 10 update", route: "activity" },
  dm_message: { title: "Nabad", body: "New message", route: "friends" },
  challenge_update: { title: "Nabad", body: "Challenge update", route: "challenges" },
};

function pushEnabled() {
  return Boolean(ONESIGNAL_APP_ID && ONESIGNAL_REST_API_KEY);
}

function cleanUserId(v) {
  const s = String(v || "").trim().toLowerCase();
  return /^[0-9a-f-]{36}$/.test(s) ? s : "";
}

function templateForType(type) {
  const t = String(type || "").trim();
  return PUSH_TEMPLATES[t] || null;
}

function onesignalHeaders() {
  return {
    Authorization: `Key ${ONESIGNAL_REST_API_KEY}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
}

async function fetchSubscriptionIdsFromDb(userId) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return [];
  try {
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/user_push_subscriptions?user_id=eq.${encodeURIComponent(userId)}&select=onesignal_subscription_id&order=updated_at.desc&limit=20`,
      {
        headers: {
          apikey: SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          Accept: "application/json",
        },
      },
    );
    if (!r.ok) return [];
    const rows = await r.json().catch(() => []);
    if (!Array.isArray(rows)) return [];
    return rows
      .map((row) => String(row?.onesignal_subscription_id || "").trim())
      .filter((id) => id.length >= 8 && id.length <= 120);
  } catch {
    return [];
  }
}

function extractPushSubscriptionIds(userPayload) {
  const subs = Array.isArray(userPayload?.subscriptions) ? userPayload.subscriptions : [];
  const ids = [];
  for (const sub of subs) {
    const id = String(sub?.id || "").trim();
    if (!id) continue;
    const type = String(sub?.type || sub?.channel || "").toLowerCase();
    const enabled = sub?.enabled !== false && sub?.disabled !== true;
    const isPush =
      !type ||
      type.includes("web") ||
      type.includes("push") ||
      type.includes("safari") ||
      type.includes("chrome");
    if (enabled && isPush) ids.push(id);
  }
  return ids;
}

async function fetchSubscriptionIdsFromOneSignal(userId) {
  try {
    const url = `https://api.onesignal.com/apps/${encodeURIComponent(ONESIGNAL_APP_ID)}/users/by/external_id/${encodeURIComponent(userId)}`;
    const r = await fetch(url, { headers: onesignalHeaders() });
    if (!r.ok) return [];
    const json = await r.json().catch(() => ({}));
    return extractPushSubscriptionIds(json);
  } catch {
    return [];
  }
}

async function resolvePushSubscriptionIds(userId) {
  const dbIds = await fetchSubscriptionIdsFromDb(userId);
  if (dbIds.length) return { ids: dbIds, source: "db" };
  const osIds = await fetchSubscriptionIdsFromOneSignal(userId);
  if (osIds.length) return { ids: osIds, source: "onesignal" };
  return { ids: [], source: "none" };
}

function buildNotificationPayload({ uid, tpl, data, subscriptionIds }) {
  const base = {
    app_id: ONESIGNAL_APP_ID,
    headings: { en: tpl.title },
    contents: { en: tpl.body },
    data,
  };
  if (subscriptionIds?.length) {
    return { ...base, include_subscription_ids: subscriptionIds.slice(0, 20) };
  }
  return {
    ...base,
    include_aliases: { external_id: [uid] },
    target_channel: "push",
  };
}

async function postOneSignalNotification(payload) {
  const r = await fetch("https://api.onesignal.com/notifications", {
    method: "POST",
    headers: onesignalHeaders(),
    body: JSON.stringify(payload),
  });
  const text = await r.text().catch(() => "");
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return { ok: r.ok, status: r.status, json, text };
}

/**
 * Send a generic push alert. Fire-and-forget from API handlers.
 * @param {{ userId: string, type: string, entityId?: string|null }} opts
 */
async function sendPrivacySafePush({ userId, type, entityId = null }) {
  if (!pushEnabled()) return { ok: false, skipped: true, reason: "push_not_configured" };
  const uid = cleanUserId(userId);
  const tpl = templateForType(type);
  if (!uid || !tpl) return { ok: false, skipped: true, reason: "unsupported_type" };

  const data = {
    nabad_route: tpl.route,
    nabad_category: String(type || "").slice(0, 80),
  };
  const eid = entityId ? String(entityId).trim().slice(0, 180) : "";
  if (eid) data.nabad_entity_id = eid;

  const resolved = await resolvePushSubscriptionIds(uid);
  let payload = buildNotificationPayload({
    uid,
    tpl,
    data,
    subscriptionIds: resolved.ids,
  });
  let result = await postOneSignalNotification(payload);

  // HTTP 200 with empty id means zero recipients — retry alternate targeting.
  if (result.ok && !result.json?.id) {
    if (resolved.ids.length > 0) {
      payload = buildNotificationPayload({ uid, tpl, data, subscriptionIds: [] });
      result = await postOneSignalNotification(payload);
    } else {
      const osIds = await fetchSubscriptionIdsFromOneSignal(uid);
      if (osIds.length) {
        payload = buildNotificationPayload({ uid, tpl, data, subscriptionIds: osIds });
        result = await postOneSignalNotification(payload);
      }
    }
  }

  if (!result.ok) {
    return {
      ok: false,
      status: result.status,
      error: result.json?.errors || result.text || "push_failed",
    };
  }
  if (!result.json?.id) {
    return {
      ok: false,
      reason: "no_recipients",
      source: resolved.source,
      errors: result.json?.errors || null,
    };
  }
  return { ok: true, id: result.json.id, source: resolved.source };
}

function queuePrivacySafePush(opts) {
  void sendPrivacySafePush(opts)
    .then((r) => {
      if (r?.ok || r?.skipped) return;
      console.warn(
        "[push] send failed",
        opts?.type,
        opts?.userId,
        r?.reason || r?.error || r?.errors,
      );
    })
    .catch((e) => {
      console.warn("[push]", e?.message || e);
    });
}

module.exports = {
  pushEnabled,
  sendPrivacySafePush,
  queuePrivacySafePush,
  templateForType,
};
