/**
 * Register Suno tasks for callback-driven push when generation completes.
 */

const { queuePrivacySafePush } = require("./onesignal-push");

const SUPABASE_URL = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

function serviceHeaders(extra = {}) {
  return {
    apikey: SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    Accept: "application/json",
    ...extra,
  };
}

function cleanUserId(v) {
  const s = String(v || "").trim().toLowerCase();
  return /^[0-9a-f-]{36}$/.test(s) ? s : "";
}

function cleanTaskId(v) {
  const s = String(v || "").trim();
  return s.length >= 6 && s.length <= 120 ? s : "";
}

function pushKindForWatchKind(kind) {
  const k = String(kind || "").trim();
  if (k === "sound") return "sound_ready";
  if (k === "music_video") return "music_video_ready";
  if (k === "instrumental") return "instrumental_ready";
  if (k === "hum_track") return "hum_track_ready";
  if (k === "photo") return "photo_ready";
  return "generation_ready";
}

function pushBodyForWatch(row) {
  const title = String(row?.title || "").trim();
  const short = title.slice(0, 40) + (title.length > 40 ? "…" : "");
  const kind = String(row?.kind || "").trim();
  if (kind === "sound") {
    return short ? `Your sound “${short}” is ready` : "Your sound is ready";
  }
  if (kind === "music_video") {
    return short ? `Music video for “${short}” is ready` : "Your music video is ready";
  }
  if (kind === "instrumental") {
    return short ? `Instrumental for “${short}” is ready` : "Your instrumental is ready";
  }
  if (kind === "hum_track") {
    return "Your Hum Track is ready";
  }
  if (kind === "photo") {
    return Number(row?.variant_count || 1) > 1 ? "Your Photo Mood songs are ready" : "Your Photo Mood song is ready";
  }
  return Number(row?.variant_count || 1) > 1 ? "Your songs are ready" : "Your song is ready";
}

async function rest(path, { method = "GET", body, prefer = "" } = {}) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return { ok: false, data: null };
  const headers = serviceHeaders(body ? { "Content-Type": "application/json" } : {});
  if (prefer) headers.Prefer = prefer;
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await r.json().catch(() => null);
  return { ok: r.ok, status: r.status, data };
}

async function registerSunoWatch({
  userId,
  taskId,
  kind,
  title = "",
  variantCount = 1,
  notifyPush = true,
} = {}) {
  const uid = cleanUserId(userId);
  const tid = cleanTaskId(taskId);
  const k = String(kind || "").trim();
  if (!uid || !tid || !k) return { ok: false, reason: "invalid_args" };
  const row = {
    user_id: uid,
    task_id: tid,
    kind: k,
    title: String(title || "").trim().slice(0, 120),
    variant_count: Math.max(1, Math.min(2, Number(variantCount) || 1)),
    notify_push: notifyPush !== false,
    status: "pending",
  };
  const r = await rest("suno_generation_watch", {
    method: "POST",
    body: row,
    prefer: "resolution=merge-duplicates",
  });
  return { ok: r.ok, row };
}

async function fetchWatchByTaskId(taskId) {
  const tid = cleanTaskId(taskId);
  if (!tid) return null;
  const r = await rest(
    `suno_generation_watch?task_id=eq.${encodeURIComponent(tid)}&select=*&limit=1`,
  );
  if (!r.ok || !Array.isArray(r.data) || !r.data[0]) return null;
  return r.data[0];
}

async function markWatchStatus(taskId, status) {
  const tid = cleanTaskId(taskId);
  if (!tid) return;
  const patch = {
    status,
    ...(status === "complete" || status === "notified" ? { completed_at: new Date().toISOString() } : {}),
    ...(status === "notified" ? { notified_at: new Date().toISOString() } : {}),
  };
  await rest(`suno_generation_watch?task_id=eq.${encodeURIComponent(tid)}`, {
    method: "PATCH",
    body: patch,
  });
}

async function sendWatchReadyPush(row) {
  if (!row?.user_id || row.notify_push === false) return { ok: false, skipped: true };
  if (String(row.kind || "") === "studio_guide") return { ok: false, skipped: true };
  if (row.notified_at || row.status === "notified") return { ok: false, skipped: true };
  const pushType = pushKindForWatchKind(row.kind);
  queuePrivacySafePush({
    userId: row.user_id,
    type: pushType,
    entityId: String(row.task_id || "").slice(0, 180),
    actorDisplayName: pushBodyForWatch(row),
  });
  await markWatchStatus(row.task_id, "notified");
  return { ok: true };
}

function extractCallbackTaskId(body) {
  const data = body?.data && typeof body.data === "object" ? body.data : {};
  return cleanTaskId(
    data.task_id ||
      data.taskId ||
      body?.task_id ||
      body?.taskId ||
      data?.vocal_removal_info?.task_id,
  );
}

function callbackLooksSuccessful(body) {
  const code = Number(body?.code);
  if (Number.isFinite(code) && code === 200) return true;
  const flag = String(
    body?.data?.successFlag || body?.data?.status || body?.successFlag || "",
  ).toUpperCase();
  return flag === "SUCCESS" || flag === "COMPLETE";
}

async function handleSunoCallback(body) {
  const taskId = extractCallbackTaskId(body);
  if (!taskId) return { ok: false, reason: "no_task_id" };
  const row = await fetchWatchByTaskId(taskId);
  if (!row) return { ok: false, reason: "watch_not_found" };
  const success = callbackLooksSuccessful(body);
  if (!success) {
    await markWatchStatus(taskId, "failed");
    return { ok: false, reason: "failed" };
  }
  await markWatchStatus(taskId, "complete");
  return sendWatchReadyPush(row);
}

async function notifyJobReadyFromClient({ userId, taskId, kind, title = "" } = {}) {
  const uid = cleanUserId(userId);
  const tid = cleanTaskId(taskId);
  if (!uid || !tid) return { ok: false, reason: "invalid_args" };
  let row = await fetchWatchByTaskId(tid);
  if (!row) {
    await registerSunoWatch({
      userId: uid,
      taskId: tid,
      kind: String(kind || "song").trim() || "song",
      title,
      notifyPush: true,
    });
    row = await fetchWatchByTaskId(tid);
  }
  if (!row) return { ok: false, reason: "watch_missing" };
  if (row.status === "notified" || row.notified_at) return { ok: true, skipped: true };
  await markWatchStatus(tid, "complete");
  return sendWatchReadyPush({ ...row, title: title || row.title });
}

function queueRegisterSunoWatch(opts) {
  void registerSunoWatch(opts).catch((e) => {
    console.warn("[suno-watch] register failed", e?.message || e);
  });
}

module.exports = {
  registerSunoWatch,
  queueRegisterSunoWatch,
  handleSunoCallback,
  notifyJobReadyFromClient,
  pushBodyForWatch,
};
