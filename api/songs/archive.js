/**
 * Archive a Suno (or other remote) audio URL into Supabase Storage.
 *
 * POST /api/songs/archive
 *   Authorization: Bearer <supabase access token>
 *   { sourceUrl, taskId?, audioId?, libraryLocalId? }
 *
 * Returns { ok, permanentUrl, storageKey, alreadyArchived? }
 *
 * Env: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
 */

const { applyCors } = require("../_lib/cors");
const { verifyUser, sendJson, readJsonBody } = require("../_lib/credits-auth");
const { archiveRemoteSongToStorage } = require("../_lib/archive-remote-song");

module.exports = async function handler(req, res) {
  if (applyCors(req, res)) return;
  try {
    if (req.method !== "POST") return sendJson(res, 405, { error: "Method not allowed" });

    const user = await verifyUser(req);
    if (!user) return sendJson(res, 401, { error: "Unauthorized" });

    const body = await readJsonBody(req);
    const audioId = String(body?.audioId || body?.audio_id || "").trim();
    const taskId = String(body?.taskId || body?.task_id || "").trim();
    const libId = String(body?.libraryLocalId || body?.library_local_id || "").trim();

    let result;
    try {
      result = await archiveRemoteSongToStorage({
        userId: user.userId,
        sourceUrl: body?.sourceUrl || body?.source_url || "",
        taskId,
        audioId,
        libraryLocalId: libId,
      });
    } catch (e) {
      const msg = e?.message || String(e);
      if (msg === "missing_source_url") return sendJson(res, 400, { error: msg });
      if (msg === "audio_too_large") return sendJson(res, 413, { error: msg });
      return sendJson(res, 502, { error: msg });
    }

    if (result.alreadyArchived) {
      return sendJson(res, 200, {
        ok: true,
        permanentUrl: result.permanentUrl,
        alreadyArchived: true,
      });
    }

    if (!result.ok) {
      return sendJson(res, result.status || 502, { ok: false, error: result.error || "upload_failed" });
    }

    return sendJson(res, 200, {
      ok: true,
      permanentUrl: result.permanentUrl,
      storageKey: result.storageKey,
      cloudPatched: Boolean(result.cloudPatched),
    });
  } catch (e) {
    return sendJson(res, 500, { error: e?.message || String(e) });
  }
};
