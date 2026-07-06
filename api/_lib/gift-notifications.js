/**
 * In-app + push notification when someone receives a gift.
 */
const { sendPrivacySafePush } = require("./onesignal-push");

const SUPABASE_URL = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const SVC_FETCH_TIMEOUT_MS = 8000;

function cleanUserId(v) {
  const s = String(v || "").trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s) ? s : "";
}

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
      data = text;
    }
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

async function profileByUserId(userId) {
  const uid = cleanUserId(userId);
  if (!uid) return null;
  const r = await svcFetch(
    `profiles?select=user_id,username,avatar&user_id=eq.${encodeURIComponent(uid)}&limit=1`,
  );
  return Array.isArray(r.data) && r.data[0] ? r.data[0] : null;
}

async function notifyGiftReceived({
  giftId,
  senderUserId,
  recipientUserId,
  amount,
  targetKind,
  targetId,
  targetTitle = "",
  targetArtUrl = "",
}) {
  const recipient = cleanUserId(recipientUserId);
  const sender = cleanUserId(senderUserId);
  const gid = String(giftId || "").trim();
  const kind = String(targetKind || "").trim();
  const tid = String(targetId || "").trim();
  if (!recipient || !sender || !gid || !kind || !tid) {
    console.warn("[gift] notify skipped — missing fields", {
      recipient: Boolean(recipient),
      sender: Boolean(sender),
      giftId: gid,
      targetKind: kind,
      targetId: tid,
    });
    return false;
  }

  const senderProfile = await profileByUserId(sender);
  const giftAmount = Number(amount) || 0;
  const entityId = `${kind}:${tid}:gift:${gid}`.slice(0, 180);
  const metadata = {
    actor_username: senderProfile?.username || "",
    actor_avatar: senderProfile?.avatar || "",
    target_kind: kind,
    target_id: tid,
    target_title: String(targetTitle || "").trim(),
    gift_amount: giftAmount,
    ...(kind === "song" && targetArtUrl ? { song_art_url: String(targetArtUrl).trim() } : {}),
  };

  const ins = await svcFetch("social_notifications", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({
      user_id: recipient,
      type: "gift_received",
      actor_user_id: sender,
      entity_id: entityId,
      metadata,
    }),
  });
  if (!ins.ok) {
    console.warn("[gift] notification insert failed", ins.status, ins.text || ins.data);
    return false;
  }

  const actorDisplayName = String(metadata.actor_username || "").replace(/^@/, "").trim();
  try {
    await sendPrivacySafePush({
      userId: recipient,
      type: "gift_received",
      entityId,
      actorDisplayName,
      metadata: { amount: giftAmount },
    });
  } catch (e) {
    console.warn("[gift] push failed", e?.message || e);
  }
  return true;
}

module.exports = { notifyGiftReceived };
