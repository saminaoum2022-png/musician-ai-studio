/**
 * GET /api/admin/runtime-settings
 * PATCH /api/admin/runtime-settings { key, enabled }
 *
 * Owner / Admin only. Used as a no-deploy kill switch for Lyria prompt extras.
 */

const {
  verifyUser,
  sendJson,
  setCors,
  readJsonBody,
} = require("../_lib/credits-auth");
const {
  verifyAdmin,
  adminForbidden,
  adminUnauthorized,
} = require("../_lib/admin-auth");
const { insertAuditRow } = require("../_lib/admin-audit");
const {
  KEY_ARABIZI_INSTRUCTION,
  getRuntimeSettings,
  setRuntimeSetting,
} = require("../_lib/admin-runtime-settings");

module.exports = async function handler(req, res) {
  setCors(res);
  if (req.method === "OPTIONS") return res.end();

  const admin = await verifyAdmin(req, { view: "settings", requireManageTeam: true });
  if (!admin) {
    const user = await verifyUser(req);
    if (!user) return adminUnauthorized(res);
    return adminForbidden(res, "Only Owner / Admin can change runtime settings.");
  }

  if (req.method === "GET") {
    const settings = await getRuntimeSettings({ fresh: true });
    return sendJson(res, 200, {
      ok: true,
      settings: {
        arabiziInstruction: settings[KEY_ARABIZI_INSTRUCTION] !== false,
      },
    });
  }

  if (req.method === "PATCH") {
    const body = await readJsonBody(req);
    const key = String(body?.key || "").trim();
    if (key !== KEY_ARABIZI_INSTRUCTION) {
      return sendJson(res, 400, { error: "Unknown setting." });
    }
    if (typeof body.enabled !== "boolean") {
      return sendJson(res, 400, { error: "Set enabled to true or false." });
    }
    const prev = await getRuntimeSettings({ fresh: true });
    const saved = await setRuntimeSetting(key, body.enabled, { updatedBy: admin.userId || null });
    if (!saved.ok) {
      return sendJson(res, saved.status >= 400 ? saved.status : 500, {
        error: saved.error === "not_configured"
          ? "Database is not configured."
          : "Could not save setting. Apply supabase/admin_runtime_settings.sql first.",
      });
    }
    await insertAuditRow({
      actorUserId: admin.userId || null,
      actorEmail: admin.email || null,
      action: "runtime_setting",
      previousRole: prev[key] ? "on" : "off",
      newRole: body.enabled ? "on" : "off",
      metadata: { key, enabled: body.enabled },
    });
    return sendJson(res, 200, {
      ok: true,
      settings: { arabiziInstruction: body.enabled },
      message: body.enabled
        ? "Arabizi instruction is on."
        : "Arabizi instruction is off. New songs use the previous Lyria prompt.",
    });
  }

  return sendJson(res, 405, { error: "Method not allowed" });
};
