/**
 * Insert in-app notification rows + optional OneSignal push.
 */

const { queuePrivacySafePush } = require("./onesignal-push");

const SUPABASE_URL = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

function cleanUserId(v) {
  const s = String(v || "").trim().toLowerCase();
  return /^[0-9a-f-]{36}$/.test(s) ? s : "";
}

async function insertAppNotification({ userId, type, entityId = null, metadata = {}, actorUserId = null }) {
  const uid = cleanUserId(userId);
  const t = String(type || "").trim().slice(0, 80);
  if (!uid || !t || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return false;

  const body = {
    user_id: uid,
    type: t,
    actor_user_id: actorUserId ? cleanUserId(actorUserId) || null : null,
    entity_id: entityId ? String(entityId).trim().slice(0, 180) : null,
    metadata: metadata && typeof metadata === "object" ? metadata : {},
  };

  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/social_notifications`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify(body),
    });
    if (!r.ok) return false;
  } catch {
    return false;
  }

  queuePrivacySafePush({
    userId: uid,
    type: t,
    entityId: body.entity_id,
    metadata: body.metadata,
  });
  return true;
}

module.exports = { insertAppNotification };
