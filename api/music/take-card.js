/**
 * GET  /api/music/take-card?taskId=...
 * POST /api/music/take-card { action: "attach", taskId, songId?, localSongId? }
 *
 * Admin-only. Provider-neutral path for Take 2 take cards.
 */

const { verifyUser } = require("../_lib/credits-auth");
const { userIsAdmin } = require("../_lib/admin-auth");
const { applyCors } = require("../_lib/cors");
const { readJson, sendJson } = require("../_lib/suno-upstream");
const {
  fetchTakeCardByTaskId,
  attachTakeCardSong,
  countChildTakes,
} = require("../_lib/song-take-card");

module.exports = async function handler(req, res) {
  if (applyCors(req, res)) return;
  try {
    const user = await verifyUser(req);
    if (!user) return sendJson(res, 401, { error: "Sign in first." });
    const isAdmin = await userIsAdmin(user);
    if (!isAdmin) return sendJson(res, 403, { error: "Admin only.", code: "admin_only" });

    if (req.method === "GET") {
      const url = new URL(req.url, "http://localhost");
      const taskId = String(url.searchParams.get("taskId") || "").trim();
      const parentSongId = String(url.searchParams.get("parentSongId") || "").trim();
      const parentTaskId = String(url.searchParams.get("parentTaskId") || "").trim();
      if (parentSongId || parentTaskId) {
        const count = await countChildTakes({
          userId: user.userId,
          parentSongId,
          parentTaskId,
        });
        return sendJson(res, 200, { ok: true, childCount: count, nextTakeNumber: count + 2 });
      }
      if (!taskId) return sendJson(res, 400, { error: "Missing taskId" });
      const fetched = await fetchTakeCardByTaskId({ userId: user.userId, taskId });
      if (!fetched.ok) {
        const status = fetched.error === "not_found" ? 404 : fetched.error === "table_missing" ? 404 : 500;
        return sendJson(res, status, { error: fetched.error || "not_found", hasCard: false });
      }
      return sendJson(res, 200, { ok: true, hasCard: true, takeCard: fetched.card });
    }

    if (req.method !== "POST") return sendJson(res, 405, { error: "Method not allowed" });
    const body = await readJson(req);
    const action = String(body?.action || "").trim();
    if (action !== "attach") return sendJson(res, 400, { error: "Unknown action" });
    const patched = await attachTakeCardSong({
      userId: user.userId,
      taskId: body?.taskId,
      songId: body?.songId,
      localSongId: body?.localSongId,
    });
    if (!patched.ok) {
      const status = patched.error === "table_missing" || patched.error === "not_found" ? 404 : 400;
      return sendJson(res, status, { error: patched.error || "attach_failed" });
    }
    return sendJson(res, 200, { ok: true, takeCard: patched.card });
  } catch (e) {
    return sendJson(res, 500, { error: e?.message || String(e) });
  }
};
