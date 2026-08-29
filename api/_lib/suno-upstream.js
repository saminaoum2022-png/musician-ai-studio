/**
 * Thin helpers for proxying requests to api.sunoapi.org.
 */
const SUNO_BASE = "https://api.sunoapi.org";

async function readJson(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (!raw) return {};
  return JSON.parse(raw);
}

function safeJson(txt) {
  try {
    return JSON.parse(txt);
  } catch {
    return null;
  }
}

function sendJson(res, status, obj) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(obj));
}

/**
 * @param {string} path - e.g. "/api/v1/voice/validate"
 * @param {{ method?: string, apiKey: string, body?: object, query?: Record<string,string> }} opts
 */
async function sunoJsonRequest(path, opts) {
  const method = opts.method || "GET";
  const url = new URL(path, SUNO_BASE);
  if (opts.query) {
    for (const [k, v] of Object.entries(opts.query)) {
      if (v != null && String(v).trim() !== "") url.searchParams.set(k, String(v));
    }
  }
  const headers = {
    Authorization: `Bearer ${opts.apiKey}`,
    "Content-Type": "application/json",
  };
  const init = { method, headers };
  if (method !== "GET" && method !== "HEAD" && opts.body != null) {
    init.body = JSON.stringify(opts.body);
  }
  const r = await fetch(url.toString(), init);
  const text = await r.text().catch(() => "");
  const data = safeJson(text);
  const code =
    data && typeof data === "object" && "code" in data ? Number(data.code) : r.ok ? 200 : r.status;
  return { ok: r.ok && code === 200, httpStatus: r.status, code, data, text };
}

const SUNO_CLIP_AUDIO_KEYS = [
  "audioUrl",
  "audio_url",
  "streamAudioUrl",
  "stream_audio_url",
  "sourceAudioUrl",
  "source_audio_url",
  "sourceStreamAudioUrl",
  "source_stream_audio_url",
];

/** Kie mirrors playable audio in audioUrl; Suno origin source* links are often 403. */
function pickSunoClipAudioUrl(clip) {
  if (!clip || typeof clip !== "object") return "";
  for (const key of SUNO_CLIP_AUDIO_KEYS) {
    const s = String(clip[key] || "").trim();
    if (s.startsWith("http")) return s;
  }
  return "";
}

function sunoClipAudioUrlCandidates(clip) {
  if (!clip || typeof clip !== "object") return [];
  const out = [];
  const seen = new Set();
  for (const key of SUNO_CLIP_AUDIO_KEYS) {
    const s = String(clip[key] || "").trim();
    if (!s.startsWith("http") || seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }
  return out;
}

function isLikelySunoOriginCdnUrl(url) {
  const raw = String(url || "").trim();
  if (!raw) return false;
  try {
    const host = new URL(raw).hostname.toLowerCase();
    return host === "suno.ai" || host.endsWith(".suno.ai") || host.includes("audioprod");
  } catch {
    return false;
  }
}

/** Suno timestamped lyrics only work for Suno music tasks — not Lyria/MiniMax/ElevenLabs ids. */
function isSunoMusicGenerationTaskId(taskId) {
  const tid = String(taskId || "").trim();
  if (!tid) return false;
  if (/^(mmx_|lyr_|elv_)/i.test(tid)) return false;
  return true;
}

module.exports = {
  readJson,
  safeJson,
  sendJson,
  sunoJsonRequest,
  pickSunoClipAudioUrl,
  sunoClipAudioUrlCandidates,
  isLikelySunoOriginCdnUrl,
  isSunoMusicGenerationTaskId,
  SUNO_BASE,
};
