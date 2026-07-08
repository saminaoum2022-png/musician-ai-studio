/**
 * Verify Suno tasks are playable before sending generation push alerts.
 * Mirrors in-app polling: SUCCESS + audio (or video/stem URLs), not bare code 200.
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

function parseGenerationRecordInfo(data) {
  const inner = data?.data && typeof data.data === "object" ? data.data : data || {};
  const status = String(inner.status || data?.status || "").toUpperCase();
  const successFlag = String(inner.successFlag || data?.successFlag || "").toUpperCase();
  const genData = inner.response?.sunoData || inner.response?.suno_data || [];
  const arr = Array.isArray(genData) ? genData : [];
  const hasAudio = arr.some((clip) => pickClipAudio(clip));
  const failed =
    status === "FAILED"
    || status === "ERROR"
    || successFlag === "FAILED"
    || successFlag === "ERROR"
    || successFlag === "CREATE_TASK_FAILED"
    || successFlag === "GENERATE_AUDIO_FAILED";
  // Suno callbacks often arrive before status flips to SUCCESS — playable URLs are enough.
  const ready = hasAudio && !failed;
  return { status, successFlag, hasAudio, failed, ready };
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

async function verifyGenerationAudioReady(taskId, apiKey) {
  const upstream = await sunoJsonRequest("/api/v1/generate/record-info", {
    apiKey,
    query: { taskId },
  });
  if (!upstream.ok || !upstream.data) {
    return { ready: false, reason: "upstream_error" };
  }
  const parsed = parseGenerationRecordInfo(upstream.data);
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
  if (flag === "FAILED" || flag === "ERROR") {
    return { ready: false, failed: true, reason: "failed", status: flag };
  }
  if (instrumentalUrl) {
    return { ready: true, status: flag || "SUCCESS" };
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
 */
async function verifySunoWatchReady(taskId, kind) {
  const apiKey = process.env.SUNO_API_KEY;
  const tid = String(taskId || "").trim();
  if (!apiKey) return { ready: false, reason: "no_api_key" };
  if (!tid) return { ready: false, reason: "no_task_id" };

  const k = String(kind || "song").trim();
  if (k === "music_video") return verifyMusicVideoReady(tid, apiKey);
  if (k === "instrumental") return verifyInstrumentalReady(tid, apiKey);
  if (k === "studio_guide") return { ready: false, reason: "skipped" };
  // song, photo, sound, hum_track
  return verifyGenerationAudioReady(tid, apiKey);
}

module.exports = {
  parseGenerationRecordInfo,
  verifySunoWatchReady,
};
