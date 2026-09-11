/**
 * Persist provider-neutral generation status payloads (Suno-compatible shape) in Supabase Storage.
 * Spike store — no new DB table required.
 */
const { uploadObject, publicObjectUrl } = require("./supabase-storage");

const BUCKET = "song_archive";

function providerFolder(taskId) {
  const tid = String(taskId || "").trim();
  if (tid.startsWith("lyr_")) return "lyria";
  if (tid.startsWith("elv_")) return "elevenlabs";
  return "minimax";
}

function taskObjectKey(userId, taskId) {
  const uid = String(userId || "").trim();
  const tid = String(taskId || "").trim();
  const folder = providerFolder(tid);
  // song_archive bucket allows audio/* + octet-stream — not application/json.
  return `${uid}/${folder}/${tid}.json`;
}

async function readJsonUrl(url) {
  try {
    const r = await fetch(String(url), { cache: "no-store" });
    if (!r.ok) return null;
    return await r.json().catch(() => null);
  } catch {
    return null;
  }
}

async function probeArchiveAudioUrl(userId, taskId) {
  const uid = String(userId || "").trim();
  const tid = String(taskId || "").trim();
  if (!uid || !tid) return { ok: false };
  const folder = providerFolder(tid);
  for (const ext of ["mp3", "wav"]) {
    const key = `${uid}/${folder}/${tid}.${ext}`;
    const url = publicObjectUrl(BUCKET, key);
    try {
      const r = await fetch(url, { method: "HEAD", cache: "no-store" });
      if (r.ok) return { ok: true, url, ext };
    } catch {
      /* try next ext */
    }
  }
  return { ok: false };
}

/** When task JSON is missing but MP3 exists in song_archive (admin can play). */
function buildArchiveRecoveryStatusPayload({ taskId, audioUrl }) {
  const tid = String(taskId || "").trim();
  const audioId = `${tid}_a`;
  const clip = {
    id: audioId,
    audioId,
    audio_url: audioUrl,
    audioUrl,
    title: "Generated song",
    prompt: "",
  };
  const prov = tid.startsWith("lyr_") ? "lyria" : tid.startsWith("elv_") ? "elevenlabs" : "minimax";
  return {
    code: 200,
    data: {
      taskId: tid,
      status: "SUCCESS",
      response: { sunoData: [clip], suno_data: [clip] },
    },
    _provider: prov,
    _recoveredFromArchive: true,
  };
}

async function saveMusicProviderTaskStatus({ userId, taskId, statusPayload }) {
  const key = taskObjectKey(userId, taskId);
  const body = Buffer.from(JSON.stringify(statusPayload), "utf8");
  const up = await uploadObject({
    bucket: BUCKET,
    key,
    body,
    contentType: "application/octet-stream",
  });
  if (!up.ok) return { ok: false, error: up.error || "task_store_failed" };
  return { ok: true, url: up.url || publicObjectUrl(BUCKET, key) };
}

async function loadMusicProviderTaskStatus({ userId, taskId }) {
  const key = taskObjectKey(userId, taskId);
  const url = publicObjectUrl(BUCKET, key);
  const data = await readJsonUrl(url);
  if (data) return { ok: true, data, url };
  const audio = await probeArchiveAudioUrl(userId, taskId);
  if (!audio.ok) return { ok: false, error: "task_not_found" };
  return {
    ok: true,
    data: buildArchiveRecoveryStatusPayload({ taskId, audioUrl: audio.url }),
    url: audio.url,
    recoveredFromArchive: true,
  };
}

function isMusicProviderTaskId(taskId) {
  const tid = String(taskId || "").trim();
  return tid.startsWith("mmx_") || tid.startsWith("lyr_") || tid.startsWith("elv_");
}

function isMinimaxTaskId(taskId) {
  return String(taskId || "").trim().startsWith("mmx_");
}

function isLyriaTaskId(taskId) {
  return String(taskId || "").trim().startsWith("lyr_");
}

function isElevenlabsTaskId(taskId) {
  return String(taskId || "").trim().startsWith("elv_");
}

// Back-compat aliases for MiniMax spike call sites.
const saveMinimaxTaskStatus = saveMusicProviderTaskStatus;
const loadMinimaxTaskStatus = loadMusicProviderTaskStatus;

module.exports = {
  saveMusicProviderTaskStatus,
  loadMusicProviderTaskStatus,
  isMusicProviderTaskId,
  isMinimaxTaskId,
  isLyriaTaskId,
  isElevenlabsTaskId,
  saveMinimaxTaskStatus,
  loadMinimaxTaskStatus,
  taskObjectKey,
  providerFolder,
};
