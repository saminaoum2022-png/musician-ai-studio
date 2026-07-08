/**
 * Register Suno tasks for callback-driven push when generation completes.
 */

const { sendPrivacySafePush } = require("./onesignal-push");
const { verifySunoWatchReady, minClipLagForVariants } = require("./suno-job-ready");
const { queueUpdateMusicGenerationByTaskId } = require("./music-generation-log");

const SUPABASE_URL = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

/** Notifies faster than this after watch creation are treated as premature. */
const PREMATURE_NOTIFY_MS = 15000;
/** Ignore Suno stub "ready" signals until the watch has aged at least this long. */
const MIN_WATCH_AGE_MS = 45000;

function defaultVariantCountForKind(kind) {
  const k = String(kind || "song").trim();
  if (k === "sound" || k === "music_video" || k === "instrumental" || k === "studio_guide") {
    return 1;
  }
  return 2;
}

function watchAgeMs(row) {
  const created = new Date(row?.created_at).getTime();
  if (!Number.isFinite(created)) return 0;
  return Date.now() - created;
}

function canNotifyWatchNow(row, verified, { forceRenotify = false } = {}) {
  const ageMs = watchAgeMs(row);
  if (ageMs >= MIN_WATCH_AGE_MS) return true;
  if (!forceRenotify) return false;
  const clipLagMs = Number(verified?.clipLagMs || 0);
  const minLag = Number(verified?.minClipLagMs || minClipLagForVariants(row?.variant_count || 1));
  if (clipLagMs < minLag) return false;
  return wasLikelyPrematureNotify(row) || shouldRenotifyWatch(row, verified);
}

function wasFalseEarlyNotify(row, verified) {
  if (!row?.notified_at) return false;
  if (wasLikelyPrematureNotify(row)) return true;
  if (!verified?.ready) return false;
  const created = new Date(row.created_at).getTime();
  const notified = new Date(row.notified_at).getTime();
  if (!Number.isFinite(created) || !Number.isFinite(notified)) return false;
  const notifyAgeMs = notified - created;
  const clipLagMs = Number(verified.clipLagMs || 0);
  const minLag = Number(verified.minClipLagMs || minClipLagForVariants(row?.variant_count || 1));
  if (clipLagMs >= minLag && notifyAgeMs + 15000 < clipLagMs) return true;
  return false;
}

function shouldRenotifyWatch(row, verified) {
  return wasFalseEarlyNotify(row, verified);
}

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
  const desiredVariantCount = Math.max(
    1,
    Math.min(2, Number(variantCount) || defaultVariantCountForKind(k)),
  );
  const existing = await fetchWatchByTaskId(tid);
  if (existing) {
    const patch = {
      kind: k || existing.kind,
      title: String(title || existing.title || "").trim().slice(0, 120),
      variant_count: Math.max(Number(existing.variant_count) || 1, desiredVariantCount),
      notify_push: notifyPush !== false,
    };
    const r = await rest(`suno_generation_watch?task_id=eq.${encodeURIComponent(tid)}`, {
      method: "PATCH",
      body: patch,
    });
    return { ok: r.ok, row: { ...existing, ...patch } };
  }
  const row = {
    user_id: uid,
    task_id: tid,
    kind: k,
    title: String(title || "").trim().slice(0, 120),
    variant_count: desiredVariantCount,
    notify_push: notifyPush !== false,
    status: "pending",
    notified_at: null,
    completed_at: null,
  };
  const r = await rest("suno_generation_watch", {
    method: "POST",
    body: row,
    prefer: "return=representation",
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

async function markWatchStatus(taskId, status, extra = {}) {
  const tid = cleanTaskId(taskId);
  if (!tid) return;
  const patch = {
    status,
    ...extra,
    ...(status === "complete" || status === "notified" ? { completed_at: new Date().toISOString() } : {}),
    ...(status === "notified" ? { notified_at: new Date().toISOString() } : {}),
  };
  await rest(`suno_generation_watch?task_id=eq.${encodeURIComponent(tid)}`, {
    method: "PATCH",
    body: patch,
  });
}

function wasLikelyPrematureNotify(row) {
  if (!row?.notified_at || !row?.created_at) return false;
  const created = new Date(row.created_at).getTime();
  const notified = new Date(row.notified_at).getTime();
  if (!Number.isFinite(created) || !Number.isFinite(notified)) return false;
  return notified - created < PREMATURE_NOTIFY_MS;
}

async function verifyWatchRowReady(row) {
  const taskId = cleanTaskId(row?.task_id);
  const kind = String(row?.kind || "").trim();
  if (!taskId || !kind) return { ready: false, reason: "invalid_args" };
  return verifySunoWatchReady(taskId, kind, {
    variantCount: row?.variant_count || 1,
  });
}

async function sendWatchReadyPush(row, { forceRenotify = false } = {}) {
  if (!row?.user_id || row.notify_push === false) return { ok: false, skipped: true };
  if (String(row.kind || "") === "studio_guide") return { ok: false, skipped: true };

  const alreadyNotified = Boolean(row.notified_at || row.status === "notified");
  if (alreadyNotified && !forceRenotify) {
    return { ok: false, skipped: true, reason: "already_notified" };
  }

  const pushType = pushKindForWatchKind(row.kind);
  const pushResult = await sendPrivacySafePush({
    userId: row.user_id,
    type: pushType,
    entityId: String(row.task_id || "").slice(0, 180),
    actorDisplayName: pushBodyForWatch(row),
  });

  if (!pushResult.ok && !pushResult.skipped) {
    console.warn("[suno-watch] push delivery failed", row.task_id, pushResult.reason || pushResult.error);
    return pushResult;
  }

  await markWatchStatus(row.task_id, "notified");
  return { ok: true, push: pushResult };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function scheduleBackgroundWork(promise) {
  let waitUntilFn = null;
  try {
    waitUntilFn = require("@vercel/functions").waitUntil;
  } catch {}
  if (typeof waitUntilFn === "function") {
    waitUntilFn(promise);
    return;
  }
  void promise;
}

async function maybeNotifyWatchRow(row, { forceRenotify = false } = {}) {
  const taskId = cleanTaskId(row?.task_id);
  if (!taskId) return { ok: false, reason: "invalid_args" };

  const verified = await verifyWatchRowReady(row);
  if (verified.failed) {
    await markWatchStatus(taskId, "failed");
    queueUpdateMusicGenerationByTaskId(taskId, { status: "failed", error_message: "verify_failed" });
    return { ok: false, reason: "failed" };
  }
  if (!verified.ready) {
    return { ok: false, reason: "not_ready", status: verified.status || "" };
  }

  if (!canNotifyWatchNow(row, verified, { forceRenotify })) {
    return {
      ok: false,
      reason: "watch_too_young",
      ageMs: watchAgeMs(row),
      minAgeMs: MIN_WATCH_AGE_MS,
    };
  }

  const alreadyNotified = Boolean(row.notified_at || row.status === "notified");
  if (alreadyNotified) {
    if (forceRenotify || shouldRenotifyWatch(row, verified)) {
      await markWatchStatus(taskId, "complete", { notified_at: null });
    } else {
      return { ok: true, skipped: true, reason: "already_notified" };
    }
  } else {
    await markWatchStatus(taskId, "complete");
  }

  queueUpdateMusicGenerationByTaskId(taskId, { status: "completed" });
  return sendWatchReadyPush(row, { forceRenotify: true });
}

/**
 * Suno callbacks often fire before record-info has playable URLs.
 * Keep checking until audio exists or the watch fails / times out.
 */
async function retrySunoWatchReadyAndNotify(row, { attempts = 36, delayMs = 5000 } = {}) {
  const taskId = cleanTaskId(row?.task_id);
  if (!taskId) return { ok: false, reason: "invalid_args" };

  for (let i = 0; i < attempts; i += 1) {
    const current = await fetchWatchByTaskId(taskId);
    if (!current) return { ok: false, reason: "watch_gone" };
    if (current.status === "failed") return { ok: false, reason: "failed" };

    const verified = await verifyWatchRowReady(current);
    if (verified.failed) {
      await markWatchStatus(taskId, "failed");
      queueUpdateMusicGenerationByTaskId(taskId, { status: "failed", error_message: "verify_failed" });
      return { ok: false, reason: "failed" };
    }

    if (verified.ready) {
      const alreadyNotified = Boolean(current.notified_at || current.status === "notified");
      const renotify = shouldRenotifyWatch(current, verified);
      if (alreadyNotified && !renotify) {
        return { ok: true, skipped: true, reason: "already_notified" };
      }
      const notifyResult = await maybeNotifyWatchRow(current, { forceRenotify: renotify });
      if (notifyResult?.reason === "watch_too_young" && i < attempts - 1) {
        await sleep(delayMs);
        continue;
      }
      return notifyResult;
    }

    if (i < attempts - 1) await sleep(delayMs);
  }
  return { ok: false, reason: "not_ready_timeout", status: row?.status || "" };
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

function callbackLooksFailed(body) {
  const flag = String(
    body?.data?.successFlag || body?.data?.status || body?.successFlag || body?.status || "",
  ).toUpperCase();
  return (
    flag === "FAILED"
    || flag === "ERROR"
    || flag === "CREATE_TASK_FAILED"
    || flag === "GENERATE_AUDIO_FAILED"
    || flag === "CALLBACK_EXCEPTION"
    || flag === "SENSITIVE_WORD_ERROR"
  );
}

async function handleSunoCallback(body) {
  const taskId = extractCallbackTaskId(body);
  if (!taskId) return { ok: false, reason: "no_task_id" };
  const row = await fetchWatchByTaskId(taskId);
  if (!row) return { ok: false, reason: "watch_not_found" };

  if (callbackLooksFailed(body)) {
    const verified = await verifyWatchRowReady(row);
    if (verified.failed) {
      await markWatchStatus(taskId, "failed");
      queueUpdateMusicGenerationByTaskId(taskId, { status: "failed", error_message: "callback_failed" });
      return { ok: false, reason: "failed" };
    }
    // Interim failure-shaped callback — keep watching via retry.
  }

  const verified = await verifyWatchRowReady(row);
  if (verified.failed) {
    await markWatchStatus(taskId, "failed");
    queueUpdateMusicGenerationByTaskId(taskId, { status: "failed", error_message: "verify_failed" });
    return { ok: false, reason: "failed" };
  }
  if (!verified.ready) {
    scheduleBackgroundWork(
      retrySunoWatchReadyAndNotify(row).catch((e) => {
        console.warn("[suno-watch] callback retry failed", taskId, e?.message || e);
      }),
    );
    return { ok: false, reason: "not_ready_yet", status: verified.status || "" };
  }

  const renotify = shouldRenotifyWatch(row, verified);
  const notifyResult = await maybeNotifyWatchRow(row, { forceRenotify: renotify });
  if (notifyResult?.reason === "watch_too_young") {
    scheduleBackgroundWork(
      retrySunoWatchReadyAndNotify(row).catch((e) => {
        console.warn("[suno-watch] young-watch retry failed", taskId, e?.message || e);
      }),
    );
    return { ok: false, reason: "watch_too_young", ageMs: notifyResult.ageMs || 0 };
  }
  return notifyResult;
}

async function notifyJobReadyFromClient({ userId, taskId, kind, title = "" } = {}) {
  const uid = cleanUserId(userId);
  const tid = cleanTaskId(taskId);
  if (!uid || !tid) return { ok: false, reason: "invalid_args" };
  let row = await fetchWatchByTaskId(tid);
  if (!row) {
    const watchKind = String(kind || "song").trim() || "song";
    await registerSunoWatch({
      userId: uid,
      taskId: tid,
      kind: watchKind,
      title,
      variantCount: defaultVariantCountForKind(watchKind),
      notifyPush: true,
    });
    row = await fetchWatchByTaskId(tid);
  }
  if (!row) return { ok: false, reason: "watch_missing" };

  const merged = { ...row, title: title || row.title };
  const verified = await verifyWatchRowReady(merged);
  if (verified.failed) {
    await markWatchStatus(tid, "failed");
    return { ok: false, reason: "failed" };
  }
  if (!verified.ready) {
    return { ok: false, reason: "not_ready" };
  }

  const alreadyNotified = Boolean(merged.notified_at || merged.status === "notified");
  if (alreadyNotified && !shouldRenotifyWatch(merged, verified)) {
    return { ok: true, skipped: true, reason: "already_notified" };
  }

  return maybeNotifyWatchRow(merged, {
    forceRenotify: shouldRenotifyWatch(merged, verified) || alreadyNotified,
  });
}

function queueRegisterSunoWatch(opts) {
  void registerSunoWatch(opts).catch((e) => {
    console.warn("[suno-watch] register failed", e?.message || e);
  });
}

/**
 * Backstop when Suno callbacks or waitUntil retries miss a completion.
 * Re-checks pending watches and premature notifies from the last few hours.
 */
async function sweepSunoGenerationWatches({ limit = 30 } = {}) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return { ok: false, reason: "no_supabase" };
  }
  const since = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();
  const max = Math.max(1, Math.min(50, Number(limit) || 30));
  const [pendingRes, notifiedRes] = await Promise.all([
    rest(
      `suno_generation_watch?status=eq.pending&created_at=gte.${encodeURIComponent(since)}&select=*&order=created_at.asc&limit=${max}`,
    ),
    rest(
      `suno_generation_watch?status=eq.notified&created_at=gte.${encodeURIComponent(since)}&select=*&order=created_at.desc&limit=${max}`,
    ),
  ]);

  const candidates = [];
  if (pendingRes.ok && Array.isArray(pendingRes.data)) candidates.push(...pendingRes.data);
  if (notifiedRes.ok && Array.isArray(notifiedRes.data)) {
    for (const row of notifiedRes.data) {
      if (wasLikelyPrematureNotify(row)) candidates.push(row);
    }
  }

  const seen = new Set();
  const results = [];
  for (const row of candidates) {
    const taskId = cleanTaskId(row?.task_id);
    if (!taskId || seen.has(taskId)) continue;
    seen.add(taskId);
    if (String(row.kind || "") === "studio_guide") continue;

    const verified = await verifyWatchRowReady(row);
    if (verified.failed) {
      await markWatchStatus(taskId, "failed");
      queueUpdateMusicGenerationByTaskId(taskId, { status: "failed", error_message: "sweep_verify_failed" });
      results.push({ taskId, ok: false, reason: "failed" });
      continue;
    }
    if (!verified.ready) {
      results.push({ taskId, ok: false, reason: "not_ready" });
      continue;
    }

    const renotify = shouldRenotifyWatch(row, verified);
    const notifyResult = await maybeNotifyWatchRow(row, { forceRenotify: renotify });
    results.push({ taskId, ...notifyResult });
  }

  return { ok: true, checked: seen.size, results };
}

module.exports = {
  registerSunoWatch,
  queueRegisterSunoWatch,
  handleSunoCallback,
  notifyJobReadyFromClient,
  sweepSunoGenerationWatches,
  pushBodyForWatch,
  wasLikelyPrematureNotify,
  MIN_WATCH_AGE_MS,
};
