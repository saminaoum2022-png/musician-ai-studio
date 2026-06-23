/**
 * Register or remove OneSignal subscription IDs for the signed-in user.
 * Stores only subscription ID + platform — no message content.
 */

const {
  verifyUser,
  sendJson,
  setCors,
  readJsonBody,
} = require("../_lib/credits-auth");

const SUPABASE_URL = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

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
    return { ok: false, status: 500, text: "Missing Supabase service role" };
  }
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...(opts || {}),
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
}

function cleanSubscriptionId(v) {
  const s = String(v || "").trim();
  if (s.length < 8 || s.length > 120) return "";
  if (!/^[a-zA-Z0-9-:_]+$/.test(s)) return "";
  return s;
}

function cleanPlatform(v) {
  const p = String(v || "web").trim().toLowerCase();
  return p === "ios" || p === "android" || p === "web" ? p : "web";
}

async function upsertSubscription(userId, subscriptionId, platform) {
  const now = new Date().toISOString();
  const ins = await svcFetch("user_push_subscriptions", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({
      user_id: userId,
      onesignal_subscription_id: subscriptionId,
      platform,
      updated_at: now,
    }),
  });
  return ins.ok;
}

async function deleteSubscription(userId, subscriptionId) {
  const q = subscriptionId
    ? `user_push_subscriptions?user_id=eq.${encodeURIComponent(userId)}&onesignal_subscription_id=eq.${encodeURIComponent(subscriptionId)}`
    : `user_push_subscriptions?user_id=eq.${encodeURIComponent(userId)}`;
  const del = await svcFetch(q, { method: "DELETE", headers: { Prefer: "return=minimal" } });
  return del.ok;
}

module.exports = async function handler(req, res) {
  setCors(res);
  if (req.method === "OPTIONS") return res.end();

  const user = await verifyUser(req);
  if (!user) return sendJson(res, 401, { ok: false, error: "Not signed in" });

  if (req.method === "POST") {
    const body = await readJsonBody(req);
    const subscriptionId = cleanSubscriptionId(body?.subscriptionId || body?.subscription_id);
    if (!subscriptionId) {
      return sendJson(res, 400, { ok: false, error: "Invalid subscriptionId" });
    }
    const platform = cleanPlatform(body?.platform);
    const ok = await upsertSubscription(user.userId, subscriptionId, platform);
    if (!ok) return sendJson(res, 500, { ok: false, error: "Could not save subscription" });
    return sendJson(res, 200, { ok: true });
  }

  if (req.method === "DELETE") {
    let subscriptionId = "";
    try {
      const url = new URL(req.url || "", "http://localhost");
      subscriptionId = cleanSubscriptionId(url.searchParams.get("subscriptionId"));
    } catch {}
    const ok = await deleteSubscription(user.userId, subscriptionId || "");
    if (!ok) return sendJson(res, 500, { ok: false, error: "Could not remove subscription" });
    return sendJson(res, 200, { ok: true });
  }

  return sendJson(res, 405, { ok: false, error: "Method not allowed" });
};
