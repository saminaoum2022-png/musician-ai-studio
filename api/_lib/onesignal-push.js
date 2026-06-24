/**
 * Privacy-first OneSignal push delivery for Nabad.
 *
 * - Never send DM message bodies/content to OneSignal.
 * - DM copy stays private ("New message from <sender>").
 * - Social copy is concise actor + action.
 * - Deep-link hints use opaque route/category keys only.
 * - Target by external_id first (all linked devices); fall back to subscription IDs.
 */

const ONESIGNAL_APP_ID = String(process.env.ONESIGNAL_APP_ID || "").trim();
const ONESIGNAL_REST_API_KEY = String(process.env.ONESIGNAL_REST_API_KEY || "").trim();
const SUPABASE_URL = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

/** @type {Record<string, { route: string } | null>} */
const PUSH_TEMPLATES = {
  follow: { route: "activity" },
  social_like: { route: "activity" },
  social_reply: { route: "activity" },
  chart_rank: { route: "activity" },
  dm_message: { route: "friends" },
  challenge_update: { route: "challenges" },
  remix: { route: "activity" },
  song_feedback: { route: "activity" },
  play_milestone: { route: "activity" },
  public_song: { route: "activity" },
};

function pushEnabled() {
  return Boolean(ONESIGNAL_APP_ID && ONESIGNAL_REST_API_KEY);
}

function cleanUserId(v) {
  const s = String(v || "").trim().toLowerCase();
  return /^[0-9a-f-]{36}$/.test(s) ? s : "";
}

function cleanDisplayName(v) {
  const s = String(v || "").replace(/^@/, "").trim();
  return s.slice(0, 40);
}

function composePushCopy({ type, actorDisplayName }) {
  const actor = cleanDisplayName(actorDisplayName);
  if (type === "dm_message") {
    return {
      body: `New message from ${actor || "someone"}`,
    };
  }
  if (actor) {
    if (type === "follow") return { body: `${actor} followed you` };
    if (type === "social_like" || type === "song_feedback") return { body: `${actor} liked your song` };
    if (type === "social_reply") return { body: `${actor} commented on your song` };
    if (type === "remix") return { body: `${actor} remixed your song` };
    if (type === "challenge_update") return { body: `${actor} joined your challenge` };
  }
  if (type === "chart_rank") return { body: "Top 10 update" };
  if (type === "dm_message") return { body: "New message from someone" };
  return { body: "New activity" };
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

function isActivePushSubscription(sub) {
  const id = String(sub?.id || "").trim();
  if (!id) return false;
  const type = String(sub?.type || sub?.channel || "").toLowerCase();
  if (type.includes("email") || type.includes("sms")) return false;
  const status = String(sub?.status || sub?.subscription_status || "").toLowerCase();
  if (status.includes("unsubscribed") || status.includes("never")) return false;
  const token = String(sub?.token || sub?.push_token || "").trim();
  if (token) return true;
  if (sub?.enabled === true) return true;
  if (sub?.enabled === false || sub?.disabled === true) return false;
  // No explicit opt-out — include (Safari VAPID / iOS PWA subs vary by API shape).
  return !type || type.includes("web") || type.includes("push") || type.includes("safari") || type.includes("chrome");
}

function extractPushSubscriptionIds(userPayload) {
  const subs = Array.isArray(userPayload?.subscriptions) ? userPayload.subscriptions : [];
  const ids = [];
  for (const sub of subs) {
    if (!isActivePushSubscription(sub)) continue;
    ids.push(String(sub.id).trim());
  }
  return ids;
}

async function fetchOneSignalUserByExternalId(externalId) {
  const url = `https://api.onesignal.com/apps/${encodeURIComponent(ONESIGNAL_APP_ID)}/users/by/external_id/${encodeURIComponent(externalId)}`;
  const r = await fetch(url, { headers: onesignalHeaders() });
  if (!r.ok) return null;
  return r.json().catch(() => null);
}

async function fetchSubscriptionIdsFromOneSignal(userId) {
  const ids = new Set();
  const seen = new Set();
  // Try lowercase (current) then original casing for subs linked before normalization.
  for (const candidate of [userId, String(userId || "").trim()]) {
    const key = String(candidate || "").trim();
    if (!key || seen.has(key.toLowerCase())) continue;
    seen.add(key.toLowerCase());
    try {
      const json = await fetchOneSignalUserByExternalId(key);
      for (const id of extractPushSubscriptionIds(json || {})) ids.add(id);
    } catch {}
  }
  return [...ids];
}

async function resolveAllPushSubscriptionIds(userId) {
  const [dbIds, osIds] = await Promise.all([
    fetchSubscriptionIdsFromDb(userId),
    fetchSubscriptionIdsFromOneSignal(userId),
  ]);
  return [...new Set([...osIds, ...dbIds])];
}

function buildNotificationPayload({ uid, tpl, data, subscriptionIds, copy }) {
  // OneSignal Web Push requires `headings`; when omitted it defaults to the dashboard
  // Site Name (often "Nabadai Music App"). Put the alert text in headings so that
  // stale default never shows. Keep `contents` as a minimal placeholder — iOS PWA
  // still inserts a system "from <manifest name>" row between title and body.
  const base = {
    app_id: ONESIGNAL_APP_ID,
    headings: { en: copy.body },
    contents: { en: " " },
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
 * @param {{ userId: string, type: string, entityId?: string|null, actorDisplayName?: string }} opts
 */
async function sendPrivacySafePush({ userId, type, entityId = null, actorDisplayName = "" }) {
  if (!pushEnabled()) return { ok: false, skipped: true, reason: "push_not_configured" };
  const uid = cleanUserId(userId);
  const tpl = templateForType(type);
  if (!uid || !tpl) return { ok: false, skipped: true, reason: "unsupported_type" };
  const copy = composePushCopy({ type: String(type || "").trim(), actorDisplayName });

  const data = {
    nabad_route: tpl.route,
    nabad_category: String(type || "").slice(0, 80),
  };
  const eid = entityId ? String(entityId).trim().slice(0, 180) : "";
  if (eid) data.nabad_entity_id = eid;

  // external_id reaches every linked device (browser + iPhone PWA). Prefer this.
  let payload = buildNotificationPayload({ uid, tpl, data, subscriptionIds: [], copy });
  let result = await postOneSignalNotification(payload);
  let source = "external_id";

  if (result.ok && !result.json?.id) {
    const subIds = await resolveAllPushSubscriptionIds(uid);
    if (subIds.length) {
      payload = buildNotificationPayload({ uid, tpl, data, subscriptionIds: subIds, copy });
      result = await postOneSignalNotification(payload);
      source = "subscription_ids";
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
      source,
      errors: result.json?.errors || null,
    };
  }
  return { ok: true, id: result.json.id, source };
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
