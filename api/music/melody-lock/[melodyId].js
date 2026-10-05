/**
 * GET /api/music/melody-lock/:melodyId
 */
const { verifyUser, sendJson } = require("../../_lib/credits-auth");
const { applyCors } = require("../../_lib/cors");
const { melodyLockAccessAllowed } = require("../../_lib/melody-lock-config");
const { getMelodyLockSource, rowToClientPayload } = require("../../_lib/melody-lock-store");

module.exports = async function handler(req, res) {
  if (applyCors(req, res)) return;
  try {
    if (req.method !== "GET") return sendJson(res, 405, { error: "Method not allowed" });

    const user = await verifyUser(req);
    const access = melodyLockAccessAllowed(user);
    if (!access.ok) return sendJson(res, access.status, { error: access.error });

    const melodyId = getMelodyId(req);
    if (!melodyId) return sendJson(res, 400, { error: "Missing melody id." });

    const loaded = await getMelodyLockSource(melodyId, user.userId);
    if (!loaded.ok) return sendJson(res, loaded.status, { error: loaded.error });

    return sendJson(res, 200, { ok: true, ...rowToClientPayload(loaded.row) });
  } catch (e) {
    return sendJson(res, 500, { error: e?.message || String(e) });
  }
};

function getMelodyId(req) {
  const q = req.query?.melodyId;
  if (typeof q === "string" && q) return q;
  if (Array.isArray(q) && q[0]) return String(q[0]);
  const url = new URL(req.url || "/", "http://localhost");
  const parts = url.pathname.split("/").filter(Boolean);
  return parts[parts.length - 1] || "";
}
