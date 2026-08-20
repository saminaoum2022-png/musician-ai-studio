/**
 * Admin generation logs for all Suno API calls (generate, cover, extend, stems, sounds).
 */

const { queueLogMusicGeneration, logMusicGeneration } = require("./music-generation-log");

const GENERATION_KINDS = Object.freeze([
  "song",
  "photo",
  "sound",
  "hum_track",
  "instrumental",
  "music_video",
  "studio_guide",
  "stems",
  "persona",
  "mashup",
  "cover",
  "extend",
  "remix",
  "other",
]);

function summarizeSunoPayload(payload) {
  if (!payload || typeof payload !== "object") return "";
  const copy = { ...payload };
  if (copy.uploadUrl) {
    try {
      const u = new URL(String(copy.uploadUrl));
      const base = u.pathname.split("/").filter(Boolean).pop() || "";
      // Keep the filename so admin can tell remix-source.mp3 from vocal clips.
      copy.uploadUrl = `[upload:${u.host}/…/${base}]`;
    } catch {
      copy.uploadUrl = "[upload]";
    }
  }
  if (copy.fileBytes) copy.fileBytes = `[${Buffer.isBuffer(copy.fileBytes) ? copy.fileBytes.length : "bytes"}]`;
  try {
    return JSON.stringify(copy, null, 2).slice(0, 3800);
  } catch {
    return String(copy).slice(0, 3800);
  }
}

function sunoErrorMessage(data, rawText, httpStatus) {
  const msg = data?.msg || data?.message || data?.error;
  if (msg) return String(msg).slice(0, 500);
  if (httpStatus) return `suno_http_${httpStatus}`;
  const text = String(rawText || "").trim();
  if (text && text.length < 500) return text;
  return text ? `${text.slice(0, 497)}…` : "Suno request failed";
}

function resolveStemsLogKind(body, isRemixAction, stemType) {
  if (!isRemixAction) {
    return stemType === "split_stem" ? "stems" : "stems";
  }
  const mode = String(body?.referenceMode || "").trim().toLowerCase();
  const instrumentPreset = String(body?.instrumentPreset || "").trim();
  const source = String(body?.source || "").trim();
  const sourceAudioUrl = String(body?.sourceAudioUrl || body?.source_audio_url || "").trim();
  const fileName = String(body?.fileName || "").trim().toLowerCase();
  if (instrumentPreset) return "hum_track";
  // Hub remix: prefer remix even if an older client sent vocal_full by mistake.
  if (
    mode === "song_remix" ||
    sourceAudioUrl ||
    /^remix-source\./i.test(fileName)
  ) {
    return "remix";
  }
  if (["vocal_full", "vocal_cover", "song_cover", "vocal_instrumental"].includes(mode)) return "cover";
  if (["vocal_extend", "song_extend"].includes(mode)) return "extend";
  if (source === "studio") return "studio_guide";
  if (["humming_music", "humming_backing"].includes(mode)) return "hum_track";
  return "instrumental";
}

function buildStemsPromptLabel(body, sunoPayload) {
  const title = String(body?.title || sunoPayload?.title || "").trim();
  const prompt = String(body?.prompt || sunoPayload?.prompt || "").trim();
  const style = String(body?.style || sunoPayload?.style || sunoPayload?.tags || "").trim();
  const mode = String(body?.referenceMode || "").trim();
  const bits = [
    mode ? `[${mode}]` : "",
    title,
    prompt,
    style,
  ].filter(Boolean);
  return bits.join(" · ").slice(0, 500);
}

function formatRequestDetail(endpoint, payload) {
  const parts = [];
  if (endpoint) parts.push(`Suno endpoint: ${endpoint}`);
  const body = summarizeSunoPayload(payload);
  if (body) parts.push(body);
  return parts.join("\n\n").slice(0, 4000);
}

function normalizeLogKind(kind) {
  const k = String(kind || "song").trim().toLowerCase();
  return GENERATION_KINDS.includes(k) ? k : "other";
}

function queueLogSunoGeneration({
  userId,
  taskId = "",
  kind = "song",
  endpoint = "",
  prompt = "",
  requestPayload = null,
  status = "pending",
  creditsUsed = 0,
  errorMessage = "",
  isAdmin = false,
} = {}) {
  const resolvedStatus = status === "refunded" && isAdmin ? "failed" : status;
  queueLogMusicGeneration({
    userId,
    taskId,
    kind: normalizeLogKind(kind),
    provider: "suno",
    prompt: String(prompt || "").slice(0, 2000),
    requestDetail: formatRequestDetail(endpoint, requestPayload),
    status: resolvedStatus,
    creditsUsed: Number(creditsUsed || 0),
    errorMessage: String(errorMessage || "").slice(0, 500),
  });
}

/** Prefer this in request handlers so the log lands before the lambda freezes. */
async function logSunoGeneration(opts) {
  const resolvedStatus = opts?.status === "refunded" && opts?.isAdmin ? "failed" : opts?.status;
  return logMusicGeneration({
    userId: opts?.userId,
    taskId: opts?.taskId,
    kind: normalizeLogKind(opts?.kind),
    provider: "suno",
    prompt: String(opts?.prompt || "").slice(0, 2000),
    requestDetail: formatRequestDetail(opts?.endpoint, opts?.requestPayload),
    status: resolvedStatus,
    creditsUsed: Number(opts?.creditsUsed || 0),
    errorMessage: String(opts?.errorMessage || "").slice(0, 500),
  });
}

module.exports = {
  GENERATION_KINDS,
  summarizeSunoPayload,
  sunoErrorMessage,
  resolveStemsLogKind,
  buildStemsPromptLabel,
  formatRequestDetail,
  queueLogSunoGeneration,
  logSunoGeneration,
};
