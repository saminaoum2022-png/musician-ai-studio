/**
 * GET /api/music/melody-lock/run?taskId=lyr_...
 */
const { verifyUser, sendJson, isAdminEmail } = require("../../_lib/credits-auth");
const { applyCors } = require("../../_lib/cors");
const { melodyLockEnabled } = require("../../_lib/melody-lock-config");
const { getMelodyLockRunByTask, runToClient } = require("../../_lib/melody-lock-runs");

module.exports = async function handler(req, res) {
  if (applyCors(req, res)) return;
  try {
    if (req.method !== "GET") return sendJson(res, 405, { error: "Method not allowed" });
    if (!melodyLockEnabled()) return sendJson(res, 503, { error: "Melody Lock is not enabled." });

    const user = await verifyUser(req);
    if (!user) return sendJson(res, 401, { error: "Sign in required." });

    const url = new URL(req.url, "http://localhost");
    const taskId = String(url.searchParams.get("taskId") || "").trim();
    if (!taskId) return sendJson(res, 400, { error: "Missing taskId." });

    const loaded = await getMelodyLockRunByTask(taskId, user.userId);
    if (!loaded.ok) return sendJson(res, loaded.status || 404, { error: "Melody Lock run not found." });

    const payload = runToClient(loaded.row);
    return sendJson(res, 200, {
      ok: true,
      run: payload,
      admin: isAdminEmail(user.email) || undefined,
    });
  } catch (e) {
    return sendJson(res, 500, { error: e?.message || String(e) });
  }
};
