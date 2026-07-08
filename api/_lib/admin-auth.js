/**
 * Admin gate for admin.nabadai.com API routes.
 * Checks profiles.role = 'admin', with ADMIN_EMAILS env fallback.
 */

const {
  verifyUser,
  selectFromTable,
  isAdminEmail,
  sendJson,
  setCors,
} = require("./credits-auth");

const profileRoleCache = new Map();
const PROFILE_ROLE_CACHE_TTL_MS = 60_000;

async function fetchProfileRole(userId) {
  const uid = String(userId || "").trim();
  if (!uid) return "user";
  const cached = profileRoleCache.get(uid);
  if (cached && cached.expAt > Date.now()) return cached.role;
  const res = await selectFromTable(
    `profiles?select=role&user_id=eq.${encodeURIComponent(uid)}&limit=1`,
  );
  const role = String(res.data?.[0]?.role || "user").trim().toLowerCase();
  profileRoleCache.set(uid, { role, expAt: Date.now() + PROFILE_ROLE_CACHE_TTL_MS });
  return role;
}

async function verifyAdmin(req) {
  const user = await verifyUser(req);
  if (!user) return null;
  const role = await fetchProfileRole(user.userId);
  if (role === "admin" || isAdminEmail(user.email)) {
    return { ...user, role: "admin" };
  }
  return null;
}

async function userIsAdmin(user) {
  if (!user?.userId) return false;
  const role = await fetchProfileRole(user.userId);
  return role === "admin" || isAdminEmail(user.email);
}

function adminForbidden(res) {
  return sendJson(res, 403, { error: "Forbidden", code: "not_admin" });
}

function adminUnauthorized(res) {
  return sendJson(res, 401, { error: "Not signed in" });
}

module.exports = {
  verifyAdmin,
  userIsAdmin,
  fetchProfileRole,
  adminForbidden,
  adminUnauthorized,
  sendJson,
  setCors,
};
