/**
 * POST /api/music/admin/recover-generation
 *
 * Admin-only: archive a generation output clip and insert/patch user_songs
 * so a lost song reappears in the user's library.
 *
 * Body: { generationId: "uuid", audioId?: string, clipIndex?: number }
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
const {
  resolveGenerationOutput,
  recoverGenerationSongToUser,
} = require("../../_lib/admin-generation-output");

const SUPABASE_URL = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

function cleanGenerationId(v) {
  const s = String(v || "").trim();
  return /^[0-9a-f-]{36}$/i.test(s) ? s : "";
}

async function serviceFetch(path) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return { ok: false, data: null };
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        Accept: "application/json",
      },
    });
    const text = await r.text().catch(() => "");
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    return { ok: r.ok, status: r.status, data };
  } catch {
    return { ok: false, data: null };
  }
}

module.exports = async function handler(req, res) {
  setCors(res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return sendJson(res, 405, { error: "Method not allowed" });

  const admin = await verifyAdmin(req, { view: "generation" });
  if (!admin) {
    const user = await verifyUser(req);
    if (!user) return adminUnauthorized(res);
    return adminForbidden(res, "You do not have access to recover songs.");
  }

  let body = {};
  try {
    body = await readJsonBody(req);
  } catch {
    return sendJson(res, 400, { error: "Invalid JSON body" });
  }

  const generationId = cleanGenerationId(body?.generationId);
  const audioId = String(body?.audioId || "").trim();
  const clipIndex = Number.isFinite(Number(body?.clipIndex)) ? Number(body.clipIndex) : null;

  if (!generationId) {
    return sendJson(res, 400, { error: "Missing or invalid generationId" });
  }

  try {
    const logRes = await serviceFetch(
      `music_generation_logs?select=id,user_id,task_id,kind,prompt,status&limit=1&id=eq.${encodeURIComponent(generationId)}`,
    );
    const row = Array.isArray(logRes.data) && logRes.data[0] ? logRes.data[0] : null;
    if (!row?.id) {
      return sendJson(res, 404, { error: "Generation not found" });
    }

    const taskId = String(row.task_id || "").trim();
    if (!taskId) {
      return sendJson(res, 400, { error: "Generation has no provider task id" });
    }

    const songsRes = await serviceFetch(
      `user_songs?select=id,audio_id,task_id,title&task_id=eq.${encodeURIComponent(taskId)}&order=created_at.desc&limit=12`,
    );
    const savedSongs = Array.isArray(songsRes.data) ? songsRes.data : [];

    const output = await resolveGenerationOutput({
      userId: row.user_id,
      taskId,
      savedSongs,
    });
    const clips = Array.isArray(output.outputClips) ? output.outputClips : [];
    if (!clips.length) {
      return sendJson(res, 400, { error: "No output clips found for this generation" });
    }

    let clip = null;
    if (audioId) {
      clip = clips.find((c) => c.audioId === audioId) || null;
    } else if (clipIndex != null) {
      clip = clips.find((c) => c.index === clipIndex) || clips[clipIndex] || null;
    } else {
      clip = clips.find((c) => c.playUrl || c.upstreamUrl) || clips[0];
    }

    if (!clip) {
      return sendJson(res, 404, { error: "Output clip not found" });
    }
    if (!clip.recoverable) {
      return sendJson(res, 400, { error: "Clip is not recoverable yet (no audio URL)" });
    }

    const titleHint = String(row.prompt || "").split("·")[0].trim();
    const result = await recoverGenerationSongToUser({
      generationRow: row,
      clip,
      titleHint,
    });

    if (!result.ok) {
      return sendJson(res, result.status || 500, {
        error: result.error || "recover_failed",
        details: result.details || null,
      });
    }

    await insertAuditRow({
      actorUserId: admin.userId,
      actorEmail: admin.email,
      targetUserId: row.user_id,
      action: "recover_generation_song",
      metadata: {
        generationId,
        taskId,
        audioId: result.audioId,
        songId: result.songId,
        recoverAction: result.action,
      },
    }).catch(() => null);

    return sendJson(res, 200, {
      ok: true,
      ...result,
      shareUrl: result.songId
        ? `https://www.nabadai.com/s/${encodeURIComponent(result.songId)}`
        : "",
    });
  } catch (e) {
    return sendJson(res, 500, { error: e?.message || String(e) });
  }
};
