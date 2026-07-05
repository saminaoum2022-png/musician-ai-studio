/**
 * In-flight priority jobs (Sounds, instrumental, music video) — Coach pill resume on reload.
 */

const STORAGE_KEY = "nabad.priority.pending.v1";

export function getPriorityPending() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw);
    if (!String(p?.kind || "").trim()) return null;
    if (!String(p?.taskId || "").trim() && !String(p?.videoTaskId || "").trim()) return null;
    return p;
  } catch {
    return null;
  }
}

export function setPriorityPending({
  kind,
  taskId = "",
  title = "",
  videoTaskId = "",
  sourceTrackId = "",
} = {}) {
  const pending = {
    kind: String(kind || "").trim(),
    taskId: String(taskId || "").trim(),
    title: String(title || "").trim() || "Your creation",
    videoTaskId: String(videoTaskId || "").trim(),
    sourceTrackId: String(sourceTrackId || "").trim(),
    startedAt: Date.now(),
  };
  if (!pending.kind) return null;
  if (!pending.taskId && !pending.videoTaskId) return null;
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(pending));
  } catch {}
  return pending;
}

export function clearPriorityPending(taskId) {
  const cur = getPriorityPending();
  const id = String(taskId || "").trim();
  if (
    id &&
    cur?.taskId &&
    String(cur.taskId) !== id &&
    cur?.videoTaskId &&
    String(cur.videoTaskId) !== id
  ) {
    return;
  }
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {}
}
