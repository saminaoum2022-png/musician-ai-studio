/**
 * GET /api/admin/team — list teammates, pending invites, ?search= user lookup
 * POST /api/admin/team — grant role { email | username | lookup, role, sendInvite? }
 * DELETE /api/admin/team — revoke access { email } or cancel invite { inviteId }
 *
 * Owner / Admin only.
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
  fetchProfileRole,
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
const { insertAuditRow, fetchAuditLog } = require("../_lib/admin-audit");
const { resolveUserLookup, searchUsers, normalizeLookup } = require("../_lib/admin-user-resolve");

const SUPABASE_URL = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

async function serviceWrite(table, body, { method = "POST" } = {}) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return { ok: false, status: 500 };
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
      method,
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json",
        Prefer: method === "POST" ? "return=representation" : "return=minimal",
      },
      body: JSON.stringify(body),
    });
    const text = await r.text().catch(() => "");
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    return { ok: r.ok, status: r.status, data };
  } catch {
    return { ok: false, status: 500, data: null };
  }
}

async function servicePatchFilter(tableFilter, body) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return { ok: false };
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${tableFilter}`, {
      method: "PATCH",
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify(body),
    });
    return { ok: r.ok, status: r.status };
  } catch {
    return { ok: false, status: 500 };
  }
}

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

async function getPendingInvites() {
  const res = await selectFromTable(
    "admin_team_invites?select=id,email,role,invited_by,invited_at&accepted_at=is.null&revoked_at=is.null&order=invited_at.desc&limit=100",
  );
  const rows = Array.isArray(res.data) ? res.data : [];
  if (!rows.length) return [];
  const granterIds = [...new Set(rows.map((r) => r.invited_by).filter(Boolean))];
  let granterMap = new Map();
  if (granterIds.length) {
    const clause = granterIds.map((id) => encodeURIComponent(id)).join(",");
    const granterRes = await selectFromTable(
      `profiles?select=user_id,username,display_name&user_id=in.(${clause})`,
    );
    for (const p of Array.isArray(granterRes.data) ? granterRes.data : []) {
      granterMap.set(String(p.user_id), p);
    }
  }
  return rows.map((row) => {
    const granter = granterMap.get(String(row.invited_by || "")) || {};
    return {
      id: row.id,
      email: String(row.email || "").toLowerCase(),
      role: normalizeRole(row.role),
      invitedAt: row.invited_at,
      invitedByLabel: String(granter.display_name || granter.username || "").trim() || null,
    };
  });
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
    const email = auth.email || String(row.email || "").toLowerCase();
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

function resolveLookupInput(body) {
  return String(body?.lookup || body?.email || body?.username || "").trim();
}

async function inviteAuthUserByEmail(email) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return { ok: false, skipped: true };
  try {
    const r = await fetch(`${SUPABASE_URL}/auth/v1/invite`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email,
        data: { invited_via: "nabadai_admin" },
      }),
    });
    if (r.ok) return { ok: true, sent: true };
    const data = await r.json().catch(() => ({}));
    const msg = String(data?.msg || data?.message || data?.error_description || "").toLowerCase();
    if (msg.includes("already") || msg.includes("registered")) {
      return { ok: false, alreadyRegistered: true };
    }
    return { ok: false, error: data?.msg || data?.message || "Invite failed" };
  } catch (e) {
    return { ok: false, error: e?.message || "Invite failed" };
  }
}

async function createPendingInvite(actor, email, role) {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  const now = new Date().toISOString();
  await servicePatchFilter(
    `admin_team_invites?email=eq.${encodeURIComponent(normalizedEmail)}&accepted_at=is.null&revoked_at=is.null`,
    { revoked_at: now },
  );
  const ins = await serviceWrite("admin_team_invites", {
    email: normalizedEmail,
    role,
    invited_by: actor.userId,
    invited_at: now,
  });
  if (!ins.ok) return { ok: false };
  const row = Array.isArray(ins.data) ? ins.data[0] : null;
  return { ok: true, inviteId: row?.id || null };
}

async function setTeamRole(actor, body) {
  const lookupRaw = resolveLookupInput(body);
  const nextRole = normalizeRole(body?.role);
  const sendInvite = body?.sendInvite !== false;

  if (!lookupRaw) {
    return { status: 400, body: { error: "Email or @username is required." } };
  }
  if (!isDashboardRole(nextRole)) {
    return { status: 400, body: { error: "Invalid role.", allowed: DASHBOARD_ROLES } };
  }

  const parsed = normalizeLookup(lookupRaw);
  let targetEmail = parsed.type === "email" ? parsed.value : "";
  let targetUser = await resolveUserLookup(lookupRaw);

  if (targetUser) {
    if (!targetUser.email) {
      const authMap = await fetchAuthUsersMap();
      targetUser.email = authMap.get(targetUser.userId)?.email || "";
    }
    targetEmail = targetUser.email || targetEmail;
  }

  if (targetEmail && isAdminEmail(targetEmail) && nextRole !== "admin") {
    return { status: 403, body: { error: "Owner accounts cannot be downgraded from Admin." } };
  }

  if (!targetUser && parsed.type === "username") {
    return { status: 404, body: { error: `No NabadAi user found for @${parsed.value}. Try their email instead.` } };
  }

  if (!targetUser && parsed.type === "email") {
    if (!sendInvite) {
      return { status: 404, body: { error: `No NabadAi account for ${parsed.value}. Enable "Send signup invite" or ask them to sign up first.` } };
    }

    const pending = await createPendingInvite(actor, parsed.value, nextRole);
    if (!pending.ok) {
      return { status: 500, body: { error: "Could not save pending invite. Run supabase/admin_team_audit.sql." } };
    }

    const inviteResult = await inviteAuthUserByEmail(parsed.value);

    await insertAuditRow({
      actorUserId: actor.userId,
      actorEmail: actor.email,
      targetEmail: parsed.value,
      action: inviteResult.sent ? "invite_sent" : "invite_pending",
      newRole: nextRole,
      metadata: {
        inviteId: pending.inviteId,
        supabaseInvite: inviteResult.sent === true,
        note: inviteResult.alreadyRegistered
          ? "User may already exist — they will get access on next login once profile syncs."
          : inviteResult.error || null,
      },
    });

    return {
      status: 202,
      body: {
        ok: true,
        pending: true,
        email: parsed.value,
        role: nextRole,
        inviteEmailSent: inviteResult.sent === true,
        message: inviteResult.sent
          ? `Signup invite emailed to ${parsed.value}. Dashboard access applies when they join.`
          : `Pending invite saved for ${parsed.value}. Ask them to sign up at nabadai.com — access applies automatically.`,
      },
    };
  }

  if (!targetUser?.userId) {
    return { status: 404, body: { error: "User not found." } };
  }

  targetEmail = targetEmail || targetUser.email || "";
  const previousRole = await fetchProfileRole(targetUser.userId);

  await ensureProfileRow({ userId: targetUser.userId, email: targetEmail });
  const now = new Date().toISOString();
  const patch = await patchProfile(targetUser.userId, {
    role: nextRole,
    admin_granted_at: now,
    admin_granted_by: actor.userId,
    updated_at: now,
  });
  if (!patch.ok) {
    return { status: 500, body: { error: "Could not update role. Run supabase/admin_team_roles.sql if roles are not migrated yet." } };
  }
  clearProfileRoleCache(targetUser.userId);

  await insertAuditRow({
    actorUserId: actor.userId,
    actorEmail: actor.email,
    targetUserId: targetUser.userId,
    targetEmail,
    action: previousRole === "user" || !isDashboardRole(previousRole) ? "grant" : "role_change",
    previousRole,
    newRole: nextRole,
    metadata: { username: targetUser.username || null },
  });

  return {
    status: 200,
    body: {
      ok: true,
      userId: targetUser.userId,
      email: targetEmail,
      username: targetUser.username || null,
      role: nextRole,
      grantedAt: now,
    },
  };
}

async function revokeTeamRole(actor, body) {
  const inviteId = String(body?.inviteId || "").trim();
  if (inviteId) {
    const now = new Date().toISOString();
    const res = await selectFromTable(
      `admin_team_invites?select=id,email,role&id=eq.${encodeURIComponent(inviteId)}&limit=1`,
    );
    const row = Array.isArray(res.data) ? res.data[0] : null;
    if (!row?.id) return { status: 404, body: { error: "Invite not found." } };
    const patch = await servicePatchFilter(
      `admin_team_invites?id=eq.${encodeURIComponent(inviteId)}`,
      { revoked_at: now },
    );
    if (!patch.ok) return { status: 500, body: { error: "Could not cancel invite." } };
    await insertAuditRow({
      actorUserId: actor.userId,
      actorEmail: actor.email,
      targetEmail: String(row.email || "").toLowerCase(),
      action: "invite_revoked",
      previousRole: normalizeRole(row.role),
      metadata: { inviteId },
    });
    return { status: 200, body: { ok: true, inviteId, email: row.email } };
  }

  const normalizedEmail = String(body?.email || resolveLookupInput(body) || "").trim().toLowerCase();
  if (!normalizedEmail) {
    return { status: 400, body: { error: "Email or inviteId is required." } };
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

  const previousRole = await fetchProfileRole(targetUserId);
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

  await insertAuditRow({
    actorUserId: actor.userId,
    actorEmail: actor.email,
    targetUserId,
    targetEmail: normalizedEmail,
    action: "revoke",
    previousRole,
    newRole: "user",
  });

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
      const url = new URL(req.url || "/", "http://localhost");
      const search = String(url.searchParams.get("search") || "").trim();
      if (search) {
        const results = await searchUsers(search);
        return sendJson(res, 200, { ok: true, results });
      }

      const [members, pendingInvites, audit] = await Promise.all([
        getTeamMembers(),
        getPendingInvites(),
        fetchAuditLog({ limit: 40, offset: 0 }),
      ]);

      return sendJson(res, 200, {
        ok: true,
        members,
        pendingInvites,
        audit: audit.entries,
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
