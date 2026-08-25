/**
 * RoEx Tonn API — server-side only (Studio Pro Master).
 * https://tonn-portal.roexaudio.com/docs/
 */

const ROEX_BASE = "https://tonn.roexaudio.com";

const FINISH_TO_ROEX = Object.freeze({
  balanced: { musicalStyle: "POP", desiredLoudness: "MEDIUM" },
  warm: { musicalStyle: "ACOUSTIC", desiredLoudness: "LOW" },
  bright: { musicalStyle: "POP", desiredLoudness: "HIGH" },
  punchy: { musicalStyle: "HIPHOP_GRIME", desiredLoudness: "HIGH" },
});

function roexApiKey() {
  return String(process.env.ROEX_API_KEY || process.env.TONN_API_KEY || "").trim();
}

function roexConfigured() {
  return Boolean(roexApiKey());
}

async function roexJson(path, { method = "POST", body } = {}) {
  const key = roexApiKey();
  if (!key) return { ok: false, status: 503, error: "RoEx API key not configured", code: "roex_not_configured" };

  const url = `${ROEX_BASE}${path}${path.includes("?") ? "&" : "?"}key=${encodeURIComponent(key)}`;
  let r;
  try {
    r = await fetch(url, {
      method,
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": key,
      },
      body: body != null ? JSON.stringify(body) : undefined,
    });
  } catch (e) {
    return { ok: false, status: 502, error: e?.message || "RoEx request failed", code: "roex_network" };
  }

  const text = await r.text().catch(() => "");
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  if (!r.ok) {
    const msg =
      (data && typeof data === "object" && (data.message || data.error || data.detail)) ||
      (typeof data === "string" ? data : "") ||
      `RoEx HTTP ${r.status}`;
    return { ok: false, status: r.status >= 400 && r.status < 600 ? r.status : 502, error: String(msg).slice(0, 400), data };
  }

  return { ok: true, status: r.status, data };
}

async function getUploadUrls({ filename, contentType }) {
  const res = await roexJson("/upload", {
    body: {
      filename: String(filename || "studio-mix.wav").slice(0, 180),
      contentType: String(contentType || "audio/wav"),
    },
  });
  if (!res.ok) return res;
  const signed = String(res.data?.signed_url || "").trim();
  const readable = String(res.data?.readable_url || "").trim();
  if (!signed || !readable) {
    return { ok: false, status: 502, error: "RoEx upload URL missing", code: "roex_upload_invalid" };
  }
  return { ok: true, signedUrl: signed, readableUrl: readable };
}

function roexParamsForFinish(finishId) {
  const id = FINISH_TO_ROEX[finishId] ? finishId : "balanced";
  return { finishId: id, ...FINISH_TO_ROEX[id] };
}

async function createMasteringPreview({ trackUrl, finishId = "balanced" }) {
  const trackURL = String(trackUrl || "").trim();
  if (!trackURL) return { ok: false, status: 400, error: "Missing track URL", code: "missing_track_url" };

  const { musicalStyle, desiredLoudness } = roexParamsForFinish(finishId);
  const res = await roexJson("/masteringpreview", {
    body: {
      masteringData: {
        trackData: [{ trackURL }],
        musicalStyle,
        desiredLoudness,
        sampleRate: "44100",
      },
    },
  });
  if (!res.ok) return res;

  const masteringTaskId = String(res.data?.mastering_task_id || "").trim();
  if (!masteringTaskId) {
    return { ok: false, status: 502, error: "RoEx mastering task id missing", code: "roex_task_missing" };
  }
  return { ok: true, masteringTaskId, musicalStyle, desiredLoudness };
}

async function retrievePreviewMaster(masteringTaskId) {
  const id = String(masteringTaskId || "").trim();
  if (!id) return { ok: false, status: 400, error: "Missing mastering task id", code: "missing_task_id" };

  const res = await roexJson("/retrievepreviewmaster", {
    body: { masteringData: { masteringTaskId: id } },
  });
  if (!res.ok) return res;

  const preview = res.data?.previewMasterTaskResults || {};
  const downloadUrl = String(preview.download_url_mastered_preview || "").trim();
  if (!downloadUrl) {
    return { ok: false, status: 202, error: "Preview not ready yet", code: "preview_pending", pending: true };
  }
  return {
    ok: true,
    downloadUrl,
    previewStartTime: Number(preview.preview_start_time),
  };
}

async function pollPreviewMaster(masteringTaskId, { attempts = 12, delayMs = 2500 } = {}) {
  for (let i = 0; i < attempts; i++) {
    const res = await retrievePreviewMaster(masteringTaskId);
    if (res.ok) return res;
    if (!res.pending) return res;
    await new Promise((r) => setTimeout(r, delayMs));
  }
  return { ok: false, status: 504, error: "Preview timed out — try again.", code: "preview_timeout", pending: true };
}

async function retrieveFinalMaster(masteringTaskId) {
  const id = String(masteringTaskId || "").trim();
  if (!id) return { ok: false, status: 400, error: "Missing mastering task id", code: "missing_task_id" };

  const res = await roexJson("/retrievefinalmaster", {
    body: { masteringData: { masteringTaskId: id } },
  });
  if (!res.ok) return res;

  const downloadUrl = String(res.data?.finalMasterTaskResults || "").trim();
  if (!downloadUrl) {
    return { ok: false, status: 502, error: "RoEx final master URL missing", code: "roex_final_missing" };
  }
  return { ok: true, downloadUrl };
}

async function downloadRoexAudio(url) {
  const u = String(url || "").trim();
  if (!u) return { ok: false, status: 400, error: "Missing download URL" };
  let r;
  try {
    r = await fetch(u);
  } catch (e) {
    return { ok: false, status: 502, error: e?.message || "Download failed" };
  }
  if (!r.ok) return { ok: false, status: 502, error: `Download HTTP ${r.status}` };
  const buf = Buffer.from(await r.arrayBuffer());
  const contentType = String(r.headers.get("content-type") || "audio/wav").split(";")[0].trim();
  return { ok: true, buffer: buf, contentType };
}

module.exports = {
  roexConfigured,
  roexParamsForFinish,
  getUploadUrls,
  createMasteringPreview,
  retrievePreviewMaster,
  pollPreviewMaster,
  retrieveFinalMaster,
  downloadRoexAudio,
};
