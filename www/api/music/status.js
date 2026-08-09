/**
 * Provider-neutral generation status — MiniMax tasks (mmx_* ids).
 *
 * GET /api/music/status?taskId=mmx_...
 */
const { verifyUser } = require("../_lib/credits-auth");
const { applyCors } = require("../_lib/cors");
const { sendJson } = require("../_lib/suno-upstream");
const { loadMinimaxTaskStatus, isMinimaxTaskId } = require("../_lib/minimax-task-store");

module.exports = async function handler(req, res) {
  if (applyCors(req, res)) return;
  try {
    if (req.method !== "GET") return sendJson(res, 405, { error: "Method not allowed" });

    const user = await verifyUser(req);
    if (!user) return sendJson(res, 401, { error: "Sign in to check generation status." });

    const url = new URL(req.url, "http://localhost");
    const taskId = String(url.searchParams.get("taskId") || "").trim();
    if (!taskId) return sendJson(res, 400, { error: "Missing taskId" });
    if (!isMinimaxTaskId(taskId)) {
      return sendJson(res, 400, { error: "Not a MiniMax task id", code: "not_minimax_task" });
    }

    const stored = await loadMinimaxTaskStatus({ userId: user.userId, taskId });
    if (!stored.ok) {
      return sendJson(res, 404, { error: "Task not found or expired", code: stored.error || "not_found" });
    }

    return sendJson(res, 200, stored.data);
  } catch (e) {
    return sendJson(res, 500, { error: e?.message || String(e) });
  }
};
