/**
 * Append-only audit log for admin dashboard actions (service role writes).
 */

const { selectFromTable } = require("./credits-auth");

const SUPABASE_URL = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

async function insertAuditRow(row) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return { ok: false };
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/admin_role_audit`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({
        actor_user_id: row.actorUserId || null,
        actor_email: row.actorEmail || null,
        target_user_id: row.targetUserId || null,
        target_email: row.targetEmail || null,
        action: String(row.action || "unknown"),
        previous_role: row.previousRole || null,
        new_role: row.newRole || null,
        metadata: row.metadata && typeof row.metadata === "object" ? row.metadata : {},
        created_at: row.createdAt || new Date().toISOString(),
      }),
    });
    return { ok: r.ok, status: r.status };
  } catch {
    return { ok: false };
  }
}

async function fetchAuditLog({ limit = 50, offset = 0 } = {}) {
  const lim = Math.min(Math.max(Number(limit) || 50, 1), 200);
  const off = Math.max(Number(offset) || 0, 0);
  const res = await selectFromTable(
    `admin_role_audit?select=id,actor_user_id,actor_email,target_user_id,target_email,action,previous_role,new_role,metadata,created_at&order=created_at.desc&limit=${lim}&offset=${off}`,
  );
  const rows = Array.isArray(res.data) ? res.data : [];
  return {
    entries: rows.map((r) => ({
      id: r.id,
      actorUserId: r.actor_user_id,
      actorEmail: r.actor_email,
      targetUserId: r.target_user_id,
      targetEmail: r.target_email,
      action: r.action,
      previousRole: r.previous_role,
      newRole: r.new_role,
      metadata: r.metadata || {},
      createdAt: r.created_at,
    })),
    total: rows.length,
  };
}

module.exports = {
  insertAuditRow,
  fetchAuditLog,
};
