/**
 * GET /api/admin/team — list dashboard teammates
 * POST /api/admin/team — grant or update dashboard role { email, role }
 * DELETE /api/admin/team — revoke dashboard access { email }
 *
 * Owner / Admin only (profiles.role = admin or ADMIN_EMAILS).
 */

const {
  verifyUser,
  isAdminEmail,
  sendJson,
  setCors,
  readJsonBody,
  selectFromTable,
} = require("../_lib/credits-auth");
const {
  verifyAdmin,
  resolveUserIdByEmail,
  patchProfile,
  clearProfileRoleCache,
  adminForbidden,
  adminUnauthorized,
} = require("../_lib/admin-auth");
const {
  DASHBOARD_ROLES,
  listAssignableRoles,
  normalizeRole,
  isDashboardRole,
} = require("../_lib/admin-permissions");
const { ensureProfileRow } = require("../_lib/ensure-profile-row");

const SUPABASE_URL = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

async function fetchAuthUsersMap() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return new Map();
  const map = new Map();
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
      if (!r.ok) break;
      const data = await r.json().catch(() => null);
      const users = Array.isArray(data?.users) ? data.users : [];
      for (const u of users) {
        if (!u?.id) continue;
        map.set(String(u.id), {
          email: String(u.email || "").toLowerCase(),
          signupAt: u.created_at || null,
        });
      }
      if (users.length < perPage) break;
      page += 1;
    } catch {
      break;
    }
  }
  return map;
}

async function getTeamMembers() {
  const inClause = DASHBOARD_ROLES.map((r) => encodeURIComponent(r)).join(",");
  const profRes = await selectFromTable(
    `profiles?select=user_id,username,display_name,role,admin_granted_at,admin_granted_by&role=in.(${inClause})&order=admin_granted_at.desc.nullslast,created_at.desc&limit=200`,
  );
  const rows = Array.isArray(profRes.data) ? profRes.data : [];
  const authMap = await fetchAuthUsersMap();
  const granterIds = [...new Set(rows.map((r) => r.admin_granted_by).filter(Boolean))];
  let granterMap = new Map();
  if (granterIds.length) {
    const granterClause = granterIds.map((id) => encodeURIComponent(id)).join(",");
    const granterRes = await selectFromTable(
      `profiles?select=user_id,username,display_name&user_id=in.(${granterClause})`,
    );
    for (const p of Array.isArray(granterRes.data) ? granterRes.data : []) {
      granterMap.set(String(p.user_id), p);
    }
  }

  const members = rows.map((row) => {
    const uid = String(row.user_id || "");
    const auth = authMap.get(uid) || {};
    const granter = granterMap.get(String(row.admin_granted_by || "")) || {};
    const email = auth.email || "";
    return {
      userId: uid,
      email,
      username: String(row.username || "").trim(),
      name: String(row.display_name || "").trim(),
      role: normalizeRole(row.role),
      isOwner: isAdminEmail(email),
      grantedAt: row.admin_granted_at || null,
      grantedByLabel: String(granter.display_name || granter.username || row.admin_granted_by || "").trim() || null,
    };
  });

  members.sort((a, b) => {
    if (a.isOwner && !b.isOwner) return -1;
    if (!a.isOwner && b.isOwner) return 1;
    return String(b.grantedAt || "").localeCompare(String(a.grantedAt || ""));
  });

  return members;
}

async function setTeamRole(actor, { email, role }) {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  const nextRole = normalizeRole(role);
  if (!normalizedEmail) {
    return { status: 400, body: { error: "Email is required." } };
  }
  if (!isDashboardRole(nextRole)) {
    return { status: 400, body: { error: "Invalid role.", allowed: DASHBOARD_ROLES } };
  }
  if (isAdminEmail(normalizedEmail) && nextRole !== "admin") {
    return { status: 403, body: { error: "Owner accounts cannot be downgraded from Admin." } };
  }

  const targetUserId = await resolveUserIdByEmail(normalizedEmail);
  if (!targetUserId) {
    return { status: 404, body: { error: `No NabadAi account found for ${normalizedEmail}. They must sign up in the app first.` } };
  }

  await ensureProfileRow({ userId: targetUserId, email: normalizedEmail });
  const now = new Date().toISOString();
  const patch = await patchProfile(targetUserId, {
    role: nextRole,
    admin_granted_at: now,
    admin_granted_by: actor.userId,
    updated_at: now,
  });
  if (!patch.ok) {
    return { status: 500, body: { error: "Could not update role. Run supabase/admin_team_roles.sql if roles are not migrated yet." } };
  }
  clearProfileRoleCache(targetUserId);

  return {
    status: 200,
    body: {
      ok: true,
      userId: targetUserId,
      email: normalizedEmail,
      role: nextRole,
      grantedAt: now,
    },
  };
}

async function revokeTeamRole(actor, { email }) {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  if (!normalizedEmail) {
    return { status: 400, body: { error: "Email is required." } };
  }
  if (isAdminEmail(normalizedEmail)) {
    return { status: 403, body: { error: "Owner accounts cannot be revoked from the dashboard." } };
  }
  if (normalizedEmail === String(actor.email || "").toLowerCase()) {
    return { status: 403, body: { error: "You cannot revoke your own dashboard access." } };
  }

  const targetUserId = await resolveUserIdByEmail(normalizedEmail);
  if (!targetUserId) {
    return { status: 404, body: { error: `No account found for ${normalizedEmail}.` } };
  }

  const now = new Date().toISOString();
  const patch = await patchProfile(targetUserId, {
    role: "user",
    admin_granted_at: null,
    admin_granted_by: null,
    updated_at: now,
  });
  if (!patch.ok) {
    return { status: 500, body: { error: "Could not revoke access." } };
  }
  clearProfileRoleCache(targetUserId);

  return {
    status: 200,
    body: { ok: true, userId: targetUserId, email: normalizedEmail, role: "user" },
  };
}

module.exports = async function handler(req, res) {
  setCors(res);
  if (req.method === "OPTIONS") return res.end();

  const admin = await verifyAdmin(req, { requireManageTeam: true });
  if (!admin) {
    const user = await verifyUser(req);
    if (!user) return adminUnauthorized(res);
    return adminForbidden(res, "Only Owner / Admin can manage team access.");
  }

  try {
    if (req.method === "GET") {
      const members = await getTeamMembers();
      return sendJson(res, 200, {
        ok: true,
        members,
        roles: listAssignableRoles(),
        actor: {
          email: admin.email,
          role: admin.role,
          isOwner: admin.isOwner,
        },
      });
    }

    let body = {};
    try {
      body = (await readJsonBody(req)) || {};
    } catch {
      return sendJson(res, 400, { error: "Invalid JSON body." });
    }

    if (req.method === "POST") {
      const result = await setTeamRole(admin, body);
      return sendJson(res, result.status, result.body);
    }

    if (req.method === "DELETE") {
      const result = await revokeTeamRole(admin, body);
      return sendJson(res, result.status, result.body);
    }

    return sendJson(res, 405, { error: "Method not allowed" });
  } catch (e) {
    return sendJson(res, 500, { error: e?.message || String(e) });
  }
};
