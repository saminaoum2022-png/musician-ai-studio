/**
 * Persist MiniMax generation status payloads (Suno-compatible shape) in Supabase Storage.
 * Spike store — no new DB table required.
 */
const { uploadObject, publicObjectUrl } = require("./supabase-storage");

const BUCKET = "song_archive";

function taskObjectKey(userId, taskId) {
  const uid = String(userId || "").trim();
  const tid = String(taskId || "").trim();
  // Same folder as archived mp3 — song_archive bucket only allows audio/* + octet-stream.
  return `${uid}/minimax/${tid}.json`;
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

async function saveMinimaxTaskStatus({ userId, taskId, statusPayload }) {
  const key = taskObjectKey(userId, taskId);
  const body = Buffer.from(JSON.stringify(statusPayload), "utf8");
  const up = await uploadObject({
    bucket: BUCKET,
    key,
    body,
    // Bucket mime allowlist has no application/json — octet-stream is allowed.
    contentType: "application/octet-stream",
  });
  if (!up.ok) return { ok: false, error: up.error || "task_store_failed" };
  return { ok: true, url: up.url || publicObjectUrl(BUCKET, key) };
}

async function loadMinimaxTaskStatus({ userId, taskId }) {
  const key = taskObjectKey(userId, taskId);
  const url = publicObjectUrl(BUCKET, key);
  const data = await readJsonUrl(url);
  if (!data) return { ok: false, error: "task_not_found" };
  return { ok: true, data, url };
}

function isMinimaxTaskId(taskId) {
  return String(taskId || "").trim().startsWith("mmx_");
}

module.exports = {
  saveMinimaxTaskStatus,
  loadMinimaxTaskStatus,
  isMinimaxTaskId,
  taskObjectKey,
};
