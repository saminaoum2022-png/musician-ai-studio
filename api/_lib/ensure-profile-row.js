/**
 * Ensure every auth user has a public.profiles row (admin, search, social).
 * Safe to call on every authenticated API hit — no-op when row exists.
 */

const SUPABASE_URL = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

function defaultUsernameFromUserId(userId) {
  const seed = String(userId || "").replace(/-/g, "").slice(0, 6).toLowerCase();
  if (seed && /^[a-z0-9]{4,}$/.test(seed)) return `user_${seed}`;
  return `user_${Math.random().toString(36).slice(2, 8)}`;
}

async function serviceRest(path, { method = "GET", body, prefer } = {}) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return { ok: false, status: 500, data: null };
  }
  try {
    const headers = {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      Accept: "application/json",
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(prefer ? { Prefer: prefer } : {}),
    };
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await r.text().catch(() => "");
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    return { ok: r.ok, status: r.status, data };
  } catch {
    return { ok: false, status: 500, data: null };
  }
}

/**
 * @param {{ userId?: string, email?: string, raw?: object }} user
 * @returns {Promise<{ created: boolean, existed: boolean, userId?: string, username?: string }>}
 */
async function ensureProfileRow(user) {
  const uid = String(user?.userId || user?.id || "").trim();
  if (!uid) return { created: false, existed: false };

  const existing = await serviceRest(
    `profiles?select=user_id,username&user_id=eq.${encodeURIComponent(uid)}&limit=1`,
  );
  if (Array.isArray(existing.data) && existing.data[0]?.user_id) {
    return {
      created: false,
      existed: true,
      userId: uid,
      username: String(existing.data[0].username || ""),
    };
  }

  const email = String(user?.email || "").trim().toLowerCase();
  const meta = user?.raw?.user_metadata || user?.raw?.raw_user_meta_data || {};
  const signupPlatform = String(meta.signup_platform || user?.signupPlatform || "")
    .trim()
    .toLowerCase();
  const username = defaultUsernameFromUserId(uid);
  const now = new Date().toISOString();
  const payload = {
    user_id: uid,
    username,
    email,
    display_name: "",
    bio: "",
    avatar: "",
    is_public: true,
    created_at: now,
    updated_at: now,
  };
  if (signupPlatform === "web" || signupPlatform === "ios" || signupPlatform === "android") {
    payload.signup_platform = signupPlatform;
  }

  const ins = await serviceRest("profiles", {
    method: "POST",
    body: payload,
    prefer: "resolution=merge-duplicates,return=representation",
  });
  const row = Array.isArray(ins.data) && ins.data[0] ? ins.data[0] : null;
  return {
    created: Boolean(ins.ok && row),
    existed: false,
    userId: uid,
    username: String(row?.username || username),
  };
}

module.exports = {
  ensureProfileRow,
  defaultUsernameFromUserId,
};
