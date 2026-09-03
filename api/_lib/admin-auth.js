/**
 * Admin gate for admin.nabadai.com API routes.
 * Checks profiles.role dashboard roles, with ADMIN_EMAILS env as owner fallback.
 */

const {
  verifyUser,
  selectFromTable,
  isAdminEmail,
  sendJson,
  setCors,
} = require("./credits-auth");
const {
  buildAdminContext,
  canAccessView,
  canGrantCredits,
  canSendSupportEmail,
  canManageTeam,
  canModeratePublications,
  isDashboardRole,
  normalizeRole,
} = require("./admin-permissions");

const SUPABASE_URL = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

const profileRoleCache = new Map();
const PROFILE_ROLE_CACHE_TTL_MS = 60_000;

function clearProfileRoleCache(userId) {
  if (userId) profileRoleCache.delete(String(userId));
  else profileRoleCache.clear();
}

async function fetchProfileRole(userId) {
  const uid = String(userId || "").trim();
  if (!uid) return "user";
  const cached = profileRoleCache.get(uid);
  if (cached && cached.expAt > Date.now()) return cached.role;
  const res = await selectFromTable(
    `profiles?select=role&user_id=eq.${encodeURIComponent(uid)}&limit=1`,
  );
  const role = normalizeRole(res.data?.[0]?.role || "user");
  profileRoleCache.set(uid, { role, expAt: Date.now() + PROFILE_ROLE_CACHE_TTL_MS });
  return role;
}

async function verifyAdmin(req, options = {}) {
  const user = await verifyUser(req);
  if (!user) return null;

  const profileRole = await fetchProfileRole(user.userId);
  const isOwner = isAdminEmail(user.email);
  const ctx = buildAdminContext(user, profileRole, { isOwner });
  if (!ctx) return null;

  const view = options.view ? String(options.view).trim().toLowerCase() : null;
  if (view && view !== "session" && !canAccessView(ctx.role, view, { isOwner: ctx.isOwner })) {
    return null;
  }
  if (options.requireManageTeam && !ctx.canManageTeam) return null;
  if (options.requireGrantCredits && !ctx.canGrantCredits) return null;
  if (options.requireSendSupportEmail && !ctx.canSendSupportEmail) return null;
  if (options.requireModeratePublications && !ctx.canModeratePublications) return null;
  if (options.requireManageMarketing && !ctx.canManageMarketing) return null;

  return ctx;
}

/** Legacy full-privilege check for in-app admin perks (free credits, alt engines). */
async function userIsAdmin(user) {
  if (!user?.userId) return false;
  const role = await fetchProfileRole(user.userId);
  return role === "admin" || isAdminEmail(user.email);
}

function adminForbidden(res, message = "Forbidden") {
  return sendJson(res, 403, { error: message, code: "not_admin" });
}

function adminUnauthorized(res) {
  return sendJson(res, 401, { error: "Not signed in" });
}

/** Resolve auth.users id by email (admin grant flows). */
async function resolveUserIdByEmail(email) {
  const normalized = String(email || "").trim().toLowerCase();
  if (!normalized || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return null;
  let page = 1;
  const perPage = 200;
  for (let guard = 0; guard < 20; guard += 1) {
    try {
      const r = await fetch(
        `${SUPABASE_URL}/auth/v1/admin/users?page=${page}&per_page=${perPage}`,
        {
          headers: {
            apikey: SUPABASE_SERVICE_ROLE_KEY,
            Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          },
        },
      );
      if (!r.ok) return null;
      const data = await r.json().catch(() => null);
      const users = Array.isArray(data?.users) ? data.users : [];
      const hit = users.find((u) => String(u?.email || "").toLowerCase() === normalized);
      if (hit?.id) return String(hit.id);
      if (users.length < perPage) break;
      page += 1;
    } catch {
      return null;
    }
  }
  return null;
}

async function patchProfile(userId, body) {
  const uid = String(userId || "").trim();
  if (!uid || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return { ok: false, status: 500, data: null };
  }
  try {
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/profiles?user_id=eq.${encodeURIComponent(uid)}`,
      {
        method: "PATCH",
        headers: {
          apikey: SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          "Content-Type": "application/json",
          Prefer: "return=representation",
        },
        body: JSON.stringify(body || {}),
      },
    );
    const text = await r.text().catch(() => "");
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    return { ok: r.ok, status: r.status, data };
  } catch {
    return { ok: false, status: 500, data: null };
  }
}

module.exports = {
  verifyAdmin,
  userIsAdmin,
  fetchProfileRole,
  clearProfileRoleCache,
  resolveUserIdByEmail,
  patchProfile,
  adminForbidden,
  adminUnauthorized,
  sendJson,
  setCors,
  isDashboardRole,
  canAccessView,
  canGrantCredits,
  canManageTeam,
  canModeratePublications,
};
