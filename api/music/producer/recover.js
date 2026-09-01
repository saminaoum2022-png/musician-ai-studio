/**
 * GET /api/music/producer/recover
 *
 * Returns recent Nabad Producer Lyria outputs for the signed-in user so the
 * client can import songs that completed while polling/auth recovery failed.
 */
const { verifyUser, sendJson } = require("../../_lib/credits-auth");
const { applyCors } = require("../../_lib/cors");
const { selectFromTable } = require("../../_lib/credits-auth");
const { loadMusicProviderTaskStatus } = require("../../_lib/music-provider-task-store");
const { publicObjectUrl } = require("../../_lib/supabase-storage");
const { nabadProducerEnabled } = require("../../_lib/nabad-producer-lib");

const SONG_ARCHIVE_BUCKET = "song_archive";

function extractTaskStatusAudioUrl(statusPayload) {
  const clips = statusPayload?.data?.response?.sunoData
    || statusPayload?.data?.response?.suno_data
    || [];
  const clip = Array.isArray(clips) ? clips[0] : null;
  return String(clip?.audioUrl || clip?.audio_url || "").trim();
}

function extractTaskStatusTitle(statusPayload, fallback = "") {
  const clips = statusPayload?.data?.response?.sunoData
    || statusPayload?.data?.response?.suno_data
    || [];
  const clip = Array.isArray(clips) ? clips[0] : null;
  return String(clip?.title || fallback || "").trim();
}

async function probePublicStorageUrl(url) {
  const target = String(url || "").trim();
  if (!target) return "";
  try {
    const r = await fetch(target, { method: "HEAD", cache: "no-store" });
    if (r.ok) return target;
  } catch {}
  return "";
}

async function resolveTaskOutput({ userId, taskId, titleHint = "" }) {
  const uid = String(userId || "").trim();
  const tid = String(taskId || "").trim();
  if (!uid || !tid || !tid.startsWith("lyr_")) return null;

  const stored = await loadMusicProviderTaskStatus({ userId: uid, taskId: tid }).catch(() => ({ ok: false }));
  const statusPayload = stored.ok ? stored.data : null;
  const taskStatus = String(statusPayload?.data?.status || statusPayload?.status || "").trim().toUpperCase();
  let audioUrl = extractTaskStatusAudioUrl(statusPayload);
  if (!audioUrl) {
    audioUrl = await probePublicStorageUrl(publicObjectUrl(SONG_ARCHIVE_BUCKET, `${uid}/lyria/${tid}.mp3`));
  }
  if (!audioUrl) {
    audioUrl = await probePublicStorageUrl(publicObjectUrl(SONG_ARCHIVE_BUCKET, `${uid}/lyria/${tid}.wav`));
  }
  if (taskStatus !== "SUCCESS" || !audioUrl) {
    return {
      taskId: tid,
      status: taskStatus || "PENDING",
      title: String(titleHint || "").trim(),
      audioUrl: "",
      audioId: `${tid}_a`,
    };
  }

  const clips = statusPayload?.data?.response?.sunoData
    || statusPayload?.data?.response?.suno_data
    || [];
  const clip = Array.isArray(clips) ? clips[0] : null;
  const audioId = String(
    clip?.id || clip?.audioId || clip?.audio_id || `${tid}_a`,
  ).trim();

  return {
    taskId: tid,
    status: "SUCCESS",
    title: extractTaskStatusTitle(statusPayload, titleHint) || titleHint || "Nabad Producer",
    audioUrl,
    audioId,
  };
}

module.exports = async function handler(req, res) {
  applyCors(req, res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "GET") return sendJson(res, 405, { error: "Method not allowed" });

  const user = await verifyUser(req);
  if (!user?.userId) return sendJson(res, 401, { error: "Unauthorized" });

  if (!nabadProducerEnabled()) {
    return sendJson(res, 403, {
      error: "Nabad Producer is not enabled on this server.",
      code: "nabad_producer_disabled",
    });
  }

  try {
    const uidEnc = encodeURIComponent(user.userId);
    const since = new Date(Date.now() - 7 * 86400000).toISOString();
    const logRes = await selectFromTable(
      `music_generation_logs?select=task_id,prompt,status,created_at&user_id=eq.${uidEnc}&provider=eq.lyria&task_id=like.lyr_%25&request_detail=ilike.%25nabad_producer%25&created_at=gte.${encodeURIComponent(since)}&order=created_at.desc&limit=12`,
    );
    const rows = Array.isArray(logRes.data) ? logRes.data : [];
    const seen = new Set();
    const items = [];

    for (const row of rows) {
      const taskId = String(row.task_id || "").trim();
      if (!taskId || seen.has(taskId)) continue;
      seen.add(taskId);
      const titleHint = String(row.prompt || "").split("·")[0].trim();
      const resolved = await resolveTaskOutput({
        userId: user.userId,
        taskId,
        titleHint,
      });
      if (resolved) items.push(resolved);
    }

    return sendJson(res, 200, {
      code: 200,
      data: { items },
    });
  } catch (e) {
    return sendJson(res, 500, { error: e?.message || String(e) });
  }
};
