/**
 * Verify Suno tasks are playable before sending generation push alerts.
 * Mirrors in-app polling: SUCCESS + real clip audio (not task-accepted callbacks).
 */

const { sunoJsonRequest } = require("./suno-upstream");

function pickClipAudio(first) {
  if (!first || typeof first !== "object") return "";
  return String(
    first.sourceAudioUrl ||
      first.source_audio_url ||
      first.sourceStreamAudioUrl ||
      first.source_stream_audio_url ||
      first.audioUrl ||
      first.audio_url ||
      first.streamAudioUrl ||
      first.stream_audio_url ||
      "",
  ).trim();
}

function clipLooksPlayable(clip) {
  const url = pickClipAudio(clip);
  if (!url.startsWith("http")) return false;
  const id = String(clip?.id || clip?.audioId || clip?.audio_id || "").trim();
  const duration = Number(clip?.duration ?? clip?.duration_seconds ?? 0);
  // Real generated clips have stable ids and meaningful length (not task-accept stubs).
  return id.length >= 8 && Number.isFinite(duration) && duration >= 8;
}

function minClipLagForVariants(variantCount) {
  const n = Math.max(1, Math.min(2, Number(variantCount) || 1));
  return n >= 2 ? 70000 : 35000;
}

function parseGenerationRecordInfo(data, { variantCount = 1 } = {}) {
  const inner = data?.data && typeof data.data === "object" ? data.data : data || {};
  const status = String(inner.status || data?.status || "").toUpperCase();
  const successFlag = String(inner.successFlag || data?.successFlag || "").toUpperCase();
  const genData = inner.response?.sunoData || inner.response?.suno_data || [];
  const arr = Array.isArray(genData) ? genData : [];
  const playableClips = arr.filter((clip) => clipLooksPlayable(clip));
  const audioClipCount = playableClips.length;
  const expectedVariants = Math.max(1, Math.min(2, Number(variantCount) || 1));
  const hasAudio = audioClipCount > 0;
  const failed =
    status === "FAILED"
    || status === "ERROR"
    || successFlag === "FAILED"
    || successFlag === "ERROR"
    || successFlag === "CREATE_TASK_FAILED"
    || successFlag === "GENERATE_AUDIO_FAILED";
  const statusSucceeded = status === "SUCCESS" || successFlag === "SUCCESS";
  const taskCreateMs = Number(inner.createTime || inner.create_time || data?.createTime || 0);
  const clipCreateMs = playableClips
    .map((clip) => Number(clip.createTime || clip.create_time || 0))
    .filter((n) => Number.isFinite(n) && n > 0);
  const clipLagMs =
    taskCreateMs > 0 && clipCreateMs.length
      ? Math.min(...clipCreateMs) - taskCreateMs
      : 0;
  const minClipLagMs = minClipLagForVariants(expectedVariants);
  const clipsMatured = clipLagMs >= minClipLagMs;
  const ready =
    statusSucceeded
    && audioClipCount >= expectedVariants
    && clipsMatured
    && !failed;
  return {
    status,
    successFlag,
    hasAudio,
    audioClipCount,
    expectedVariants,
    clipLagMs,
    minClipLagMs,
    failed,
    ready,
  };
}

function deepFindFirstStringByKeys(obj, keys) {
  const wanted = new Set((keys || []).map((k) => String(k).toLowerCase()));
  const seen = new Set();
  const stack = [obj];
  while (stack.length) {
    const cur = stack.pop();
    if (!cur || typeof cur !== "object") continue;
    if (seen.has(cur)) continue;
    seen.add(cur);
    for (const [k, v] of Object.entries(cur)) {
      if (wanted.has(String(k).toLowerCase()) && typeof v === "string" && v.startsWith("http")) {
        return v.trim();
      }
      if (v && typeof v === "object") stack.push(v);
    }
  }
  return "";
}

async function verifyGenerationAudioReady(taskId, apiKey, { variantCount = 1 } = {}) {
  const upstream = await sunoJsonRequest("/api/v1/generate/record-info", {
    apiKey,
    query: { taskId },
  });
  if (!upstream.ok || !upstream.data) {
    return { ready: false, reason: "upstream_error" };
  }
  const parsed = parseGenerationRecordInfo(upstream.data, { variantCount });
  if (parsed.failed) return { ready: false, failed: true, reason: "failed", ...parsed };
  if (parsed.ready) return { ready: true, ...parsed };
  return { ready: false, reason: "not_ready", ...parsed };
}

async function verifyInstrumentalReady(taskId, apiKey) {
  const upstream = await sunoJsonRequest("/api/v1/vocal-removal/record-info", {
    apiKey,
    query: { taskId },
  });
  if (!upstream.ok || !upstream.data) {
    return { ready: false, reason: "upstream_error" };
  }
  const data = upstream.data;
  const flag = String(
    data?.data?.successFlag ||
      data?.data?.status ||
      data?.successFlag ||
      data?.status ||
      "",
  ).toUpperCase();
  const resp = data?.data?.response || data?.response || data?.data || data || {};
  const instrumentalUrl =
    deepFindFirstStringByKeys(resp, ["instrumentalUrl", "instrumental_url", "accompanimentUrl"]) ||
    deepFindFirstStringByKeys(data, ["instrumentalUrl", "instrumental_url", "accompanimentUrl"]);
  if (flag === "FAILED" || flag === "ERROR" || flag === "CREATE_TASK_FAILED") {
    return { ready: false, failed: true, reason: "failed", status: flag };
  }
  if ((flag === "SUCCESS" || flag === "COMPLETE") && instrumentalUrl) {
    return { ready: true, status: flag };
  }
  return { ready: false, reason: "not_ready", status: flag };
}

async function verifyMusicVideoReady(taskId, apiKey) {
  const upstream = await sunoJsonRequest("/api/v1/mp4/record-info", {
    apiKey,
    query: { taskId },
  });
  if (!upstream.ok || !upstream.data) {
    return { ready: false, reason: "upstream_error" };
  }
  const d = upstream.data?.data || upstream.data || {};
  const status = String(d.successFlag || d.status || "PENDING").toUpperCase();
  const videoUrl = String(d?.response?.videoUrl || d?.response?.video_url || "").trim();
  const failedFlags = new Set([
    "FAILED",
    "ERROR",
    "CREATE_TASK_FAILED",
    "GENERATE_MP4_FAILED",
    "CALLBACK_EXCEPTION",
  ]);
  if (failedFlags.has(status)) {
    return { ready: false, failed: true, reason: "failed", status };
  }
  if (status === "SUCCESS" && videoUrl) {
    return { ready: true, status };
  }
  return { ready: false, reason: "not_ready", status };
}

/**
 * @param {string} taskId
 * @param {string} kind - suno_generation_watch.kind
 * @param {{ variantCount?: number }} [opts]
 */
async function verifySunoWatchReady(taskId, kind, { variantCount = 1 } = {}) {
  const apiKey = process.env.SUNO_API_KEY;
  const tid = String(taskId || "").trim();
  if (!apiKey) return { ready: false, reason: "no_api_key" };
  if (!tid) return { ready: false, reason: "no_task_id" };

  const k = String(kind || "song").trim();
  if (k === "music_video") return verifyMusicVideoReady(tid, apiKey);
  if (k === "instrumental") return verifyInstrumentalReady(tid, apiKey);
  if (k === "studio_guide") return { ready: false, reason: "skipped" };
  // song, photo, sound, hum_track
  return verifyGenerationAudioReady(tid, apiKey, { variantCount });
}

module.exports = {
  parseGenerationRecordInfo,
  verifySunoWatchReady,
  clipLooksPlayable,
  minClipLagForVariants,
};
