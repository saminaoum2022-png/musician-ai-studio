/**
 * POST /api/push/job-ready
 * Client fallback when a job finishes while the app is backgrounded.
 * Deduped with Suno callback notifications.
 */

const { verifyUser } = require("../_lib/credits-auth");
const { applyCors } = require("../_lib/cors");
const { notifyJobReadyFromClient } = require("../_lib/suno-generation-watch");

module.exports = async function handler(req, res) {
  if (applyCors(req, res)) return;
  try {
    if (req.method !== "POST") return json(res, 405, { error: "Method not allowed" });
    const user = await verifyUser(req);
    if (!user) return json(res, 401, { error: "Sign in required." });
    const body = await readJson(req);
    const taskId = String(body?.taskId || "").trim();
    const kind = String(body?.kind || "song").trim();
    const title = String(body?.title || "").trim();
    if (!taskId) return json(res, 400, { error: "Missing taskId" });
    const result = await notifyJobReadyFromClient({
      userId: user.userId,
      taskId,
      kind,
      title,
    });
    return json(res, 200, result);
  } catch (e) {
    return json(res, 500, { error: e?.message || String(e) });
  }
};

function json(res, status, obj) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(obj));
}

async function readJson(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}
