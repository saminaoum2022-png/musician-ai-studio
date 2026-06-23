/**
 * Privacy-first OneSignal push delivery for Nabad.
 *
 * - Never send message bodies, usernames, emails, or song titles to OneSignal.
 * - Only generic copy (e.g. "New message", "New follower").
 * - Deep-link hints use opaque route/category keys only.
 * - Target users by Supabase auth UUID via OneSignal external_id (set client-side).
 */

const ONESIGNAL_APP_ID = String(process.env.ONESIGNAL_APP_ID || "").trim();
const ONESIGNAL_REST_API_KEY = String(process.env.ONESIGNAL_REST_API_KEY || "").trim();

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
  const s = String(v || "").trim();
  return /^[0-9a-f-]{36}$/i.test(s) ? s : "";
}

function templateForType(type) {
  const t = String(type || "").trim();
  return PUSH_TEMPLATES[t] || null;
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

  const payload = {
    app_id: ONESIGNAL_APP_ID,
    include_aliases: { external_id: [uid] },
    target_channel: "push",
    headings: { en: tpl.title },
    contents: { en: tpl.body },
    data,
  };

  try {
    const r = await fetch("https://api.onesignal.com/notifications", {
      method: "POST",
      headers: {
        Authorization: `Key ${ONESIGNAL_REST_API_KEY}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(payload),
    });
    const text = await r.text().catch(() => "");
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }
    if (!r.ok) {
      return { ok: false, status: r.status, error: json?.errors || text || "push_failed" };
    }
    return { ok: true, id: json?.id || null };
  } catch (e) {
    return { ok: false, error: String(e?.message || e) };
  }
}

function queuePrivacySafePush(opts) {
  void sendPrivacySafePush(opts).catch((e) => {
    console.warn("[push]", e?.message || e);
  });
}

module.exports = {
  pushEnabled,
  sendPrivacySafePush,
  queuePrivacySafePush,
  templateForType,
};
