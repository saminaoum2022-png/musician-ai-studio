/**
 * POST /api/music/melody-lock/ear-check
 * Admin human ear verdict (required in addition to numeric score).
 * Body: { taskId, verdict: "pass"|"fail", notes?: string }
 */
const { verifyUser, sendJson, readJsonBody, isAdminEmail } = require("../../_lib/credits-auth");
const { applyCors } = require("../../_lib/cors");
const { melodyLockEnabled } = require("../../_lib/melody-lock-config");
const {
  patchMelodyLockEarCheck,
  getMelodyLockRunByTask,
  runToClient,
} = require("../../_lib/melody-lock-runs");
const { queueUpdateMusicGenerationByTaskId } = require("../../_lib/music-generation-log");

module.exports = async function handler(req, res) {
  if (applyCors(req, res)) return;
  try {
    if (req.method !== "POST") return sendJson(res, 405, { error: "Method not allowed" });
    if (!melodyLockEnabled()) return sendJson(res, 503, { error: "Melody Lock is not enabled." });

    const user = await verifyUser(req);
    if (!user) return sendJson(res, 401, { error: "Sign in required." });
    if (!isAdminEmail(user.email)) {
      return sendJson(res, 403, { error: "Admin ear check is admin-only." });
    }

    const body = await readJsonBody(req);
    const taskId = String(body?.taskId || "").trim();
    const verdict = String(body?.verdict || body?.earPass || "").trim();
    const notes = String(body?.notes || body?.adminEarNotes || "").trim();
    if (!taskId) return sendJson(res, 400, { error: "Missing taskId." });

    const patched = await patchMelodyLockEarCheck({
      taskId,
      userId: user.userId,
      verdict,
      adminNotes: notes,
    });
    if (!patched.ok) return sendJson(res, patched.status || 500, { error: patched.error || "Update failed." });

    const loaded = await getMelodyLockRunByTask(taskId, user.userId);
    const run = runToClient(loaded.ok ? loaded.row : patched.row);

    const earLine = `melody_lock_ear_pass: ${verdict}`;
    queueAppendMelodyEarToLog(taskId, earLine, notes);

    return sendJson(res, 200, { ok: true, run });
  } catch (e) {
    return sendJson(res, 500, { error: e?.message || String(e) });
  }
};

function queueAppendMelodyEarToLog(taskId, earLine, notes) {
  void (async () => {
    try {
      const extra = notes ? `${earLine}\nadmin_ear_notes: ${notes.slice(0, 400)}` : earLine;
      const SUPABASE_URL = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
      const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
      if (!SUPABASE_URL || !key) return;
      const r = await fetch(
        `${SUPABASE_URL}/rest/v1/music_generation_logs?task_id=eq.${encodeURIComponent(taskId)}&select=request_detail&limit=1`,
        {
          headers: {
            apikey: key,
            Authorization: `Bearer ${key}`,
            Accept: "application/json",
          },
        },
      );
      const rows = await r.json().catch(() => []);
      const prev = Array.isArray(rows) && rows[0]?.request_detail ? String(rows[0].request_detail) : "";
      queueUpdateMusicGenerationByTaskId(taskId, {
        request_detail: `${prev}\n${extra}`.trim().slice(0, 4000),
      });
    } catch {
      /* non-fatal */
    }
  })();
}
