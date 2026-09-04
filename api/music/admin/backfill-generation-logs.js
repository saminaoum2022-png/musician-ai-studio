/**
 * POST /api/music/admin/backfill-generation-logs
 *
 * Owner/admin: insert missing music_generation_logs from credit debits + Suno watch rows.
 * Body: { daysBack?: number, dryRun?: boolean, limit?: number }
 */
const {
  verifyAdmin,
  adminForbidden,
  adminUnauthorized,
  sendJson,
  setCors,
} = require("../../_lib/admin-auth");
const { verifyUser, readJsonBody } = require("../../_lib/credits-auth");
const { insertAuditRow } = require("../../_lib/admin-audit");
const { backfillMissingGenerationLogs } = require("../../_lib/backfill-generation-logs");

module.exports = async function handler(req, res) {
  setCors(res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return sendJson(res, 405, { error: "Method not allowed" });

  const admin = await verifyAdmin(req, { view: "generation" });
  if (!admin) {
    const user = await verifyUser(req);
    if (!user) return adminUnauthorized(res);
    return adminForbidden(res, "You do not have access to backfill generation logs.");
  }
  if (!admin.isOwner && admin.role !== "admin") {
    return adminForbidden(res, "Only Owner / Admin can backfill generation logs.");
  }

  let body = {};
  try {
    body = await readJsonBody(req);
  } catch {
    return sendJson(res, 400, { error: "Invalid JSON body" });
  }

  const daysBack = Math.min(Math.max(Number(body?.daysBack) || 90, 1), 365);
  const limit = Math.min(Math.max(Number(body?.limit) || 5000, 1), 20000);
  const dryRun = body?.dryRun !== false && body?.dryRun !== 0 && String(body?.dryRun || "").toLowerCase() !== "false";

  try {
    const result = await backfillMissingGenerationLogs({ daysBack, dryRun, limit });
    if (!dryRun) {
      await insertAuditRow({
        actorUserId: admin.userId,
        actorEmail: admin.email,
        action: "backfill_generation_logs",
        targetUserId: null,
        metadata: { daysBack, inserted: result.inserted, skipped: result.skipped },
      }).catch(() => null);
    }
    return sendJson(res, 200, { ok: true, ...result });
  } catch (e) {
    return sendJson(res, 500, { error: e?.message || String(e) });
  }
};
