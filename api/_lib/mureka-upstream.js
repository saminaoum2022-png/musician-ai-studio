/**
 * Mureka AI music generation (https://api.mureka.ai).
 * Admin spike: lyrics → song via POST /v1/song/generate + GET /v1/song/query/{id}.
 *
 * Env:
 * - MUREKA_API_KEY (required)
 * - MUREKA_API_BASE (optional, default https://api.mureka.ai)
 * - MUREKA_MUSIC_MODEL (optional, default auto)
 * - MUREKA_VOCAL_ID (optional reusable Vocal ID from /v1/song/vocal-clone)
 * - MUREKA_GENERATE_ENABLED=1 — allow non-admins (default off = admin-only)
 */

const DEFAULT_BASE = "https://api.mureka.ai";
const DEFAULT_MODEL = "auto";
const POLL_INTERVAL_MS = 2500;
const POLL_TIMEOUT_MS = 8 * 60 * 1000;

function murekaGenerateEnabled() {
  const v = String(process.env.MUREKA_GENERATE_ENABLED || "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

function murekaApiBase() {
  return String(process.env.MUREKA_API_BASE || DEFAULT_BASE).trim().replace(/\/+$/, "") || DEFAULT_BASE;
}

function resolveMurekaModel(explicit) {
  const env = String(process.env.MUREKA_MUSIC_MODEL || "").trim();
  const raw = String(explicit || env || DEFAULT_MODEL).trim();
  return raw || DEFAULT_MODEL;
}

function resolveMurekaVocalId(explicit) {
  const fromBody = String(explicit || "").trim();
  if (fromBody) return fromBody;
  return String(process.env.MUREKA_VOCAL_ID || "").trim();
}

function mapMurekaGender(vocalGender) {
  const g = String(vocalGender || "").trim().toLowerCase();
  if (g === "f" || g === "female" || g === "woman") return "female";
  if (g === "m" || g === "male" || g === "man") return "male";
  return "";
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function safeJson(txt) {
  try {
    return JSON.parse(txt);
  } catch {
    return null;
  }
}

function murekaErrorMessage(json, status) {
  const err = json?.error;
  if (typeof err === "string" && err.trim()) return err.trim();
  if (err && typeof err === "object") {
    const msg = String(err.message || err.msg || "").trim();
    if (msg) return msg;
  }
  const failed = String(json?.failed_reason || "").trim();
  if (failed) return failed;
  return `Mureka request failed (${status || "?"})`;
}

async function murekaFetch(path, { apiKey, method = "GET", body = null, formData = null } = {}) {
  const key = String(apiKey || "").trim();
  if (!key) return { ok: false, status: 0, error: "missing_mureka_api_key", json: null };
  const url = `${murekaApiBase()}${path.startsWith("/") ? path : `/${path}`}`;
  const headers = {
    Authorization: `Bearer ${key}`,
    Accept: "application/json",
  };
  let payload = null;
  if (formData != null) {
    // multipart/form-data — let fetch set the boundary header itself.
    payload = formData;
  } else if (body != null) {
    headers["Content-Type"] = "application/json";
    payload = JSON.stringify(body);
  }
  try {
    const r = await fetch(url, { method, headers, body: payload });
    const text = await r.text();
    const json = safeJson(text);
    if (!r.ok) {
      return {
        ok: false,
        status: r.status,
        error: murekaErrorMessage(json, r.status),
        json,
        traceId: json?.trace_id || "",
      };
    }
    return { ok: true, status: r.status, json, traceId: json?.trace_id || "" };
  } catch (e) {
    return { ok: false, status: 0, error: e?.message || String(e), json: null };
  }
}

/**
 * Start lyrics → song. Returns Mureka's async task id (numeric/string).
 */
async function murekaGenerateSong({
  apiKey,
  lyrics,
  prompt = "",
  model = "",
  n = 1,
  gender = "",
  vocalId = "",
  referenceId = "",
  melodyId = "",
  stream = false,
} = {}) {
  const body = {
    lyrics: String(lyrics || "").trim(),
    model: resolveMurekaModel(model),
    n: Math.max(1, Math.min(3, Number(n) || 1)),
    stream: Boolean(stream),
  };
  const style = String(prompt || "").trim().slice(0, 2000);
  if (style) body.prompt = style;
  const vid = resolveMurekaVocalId(vocalId);
  if (vid) body.vocal_id = vid;
  // A cloned voice already defines the singer — don't also pin a gender on top of it.
  const g = vid ? "" : mapMurekaGender(gender) || String(gender || "").trim();
  if (g) body.gender = g;
  const rid = String(referenceId || "").trim();
  if (rid) body.reference_id = rid;
  const mid = String(melodyId || "").trim();
  if (mid) body.melody_id = mid;

  if (!body.lyrics) {
    return { ok: false, error: "Mureka lyrics-to-song needs lyrics.", code: "mureka_lyrics_required" };
  }

  const res = await murekaFetch("/v1/song/generate", { apiKey, method: "POST", body });
  if (!res.ok) {
    return {
      ok: false,
      error: res.error || "Mureka generate failed",
      status: res.status,
      json: res.json,
      traceId: res.traceId,
    };
  }
  const taskId = String(res.json?.id || "").trim();
  if (!taskId) {
    return { ok: false, error: "Mureka returned no task id", json: res.json, traceId: res.traceId };
  }
  return {
    ok: true,
    upstreamTaskId: taskId,
    model: String(res.json?.model || body.model || ""),
    status: String(res.json?.status || "preparing"),
    json: res.json,
    traceId: res.traceId,
  };
}

async function murekaQuerySong({ apiKey, upstreamTaskId }) {
  const tid = encodeURIComponent(String(upstreamTaskId || "").trim());
  if (!tid) return { ok: false, error: "missing_task_id" };
  return murekaFetch(`/v1/song/query/${tid}`, { apiKey, method: "GET" });
}

/**
 * The vocal-clone docs do not pin the response field name, so read the ID tolerantly:
 * id / vocal_id / vocalId / vocal_clone_id / vocalCloneId (top level or under data / vocal / vocal_clone),
 * then fall back to any string field whose key looks like an id.
 */
function pickVocalCloneId(json) {
  const scopes = [json, json?.data, json?.vocal, json?.vocal_clone, json?.vocalClone, json?.result];
  const names = ["id", "vocal_id", "vocalId", "vocal_clone_id", "vocalCloneId", "voice_id", "voiceId"];
  for (const scope of scopes) {
    if (!scope || typeof scope !== "object") continue;
    for (const n of names) {
      const v = scope[n];
      if ((typeof v === "string" || typeof v === "number") && String(v).trim()) return String(v).trim();
    }
  }
  for (const scope of scopes) {
    if (!scope || typeof scope !== "object") continue;
    for (const [k, v] of Object.entries(scope)) {
      if (/(^|_)id$/i.test(k) && !/trace/i.test(k) && (typeof v === "string" || typeof v === "number") && String(v).trim()) {
        return String(v).trim();
      }
    }
  }
  return "";
}

/**
 * Vocal clone: upload a 15–30 s vocal sample (mp3/m4a, <10 MB) → reusable Vocal ID.
 * The Vocal ID is then passed as `vocal_id` on /v1/song/generate.
 */
async function murekaCloneVocal({ apiKey, bytes, mime = "audio/mpeg", fileName = "vocal.mp3", description = "" } = {}) {
  if (!bytes || !bytes.length) {
    return { ok: false, error: "Missing vocal sample audio.", code: "mureka_sample_required" };
  }
  const form = new FormData();
  form.set("file", new Blob([bytes], { type: mime }), fileName);
  const desc = String(description || "").trim().slice(0, 1024);
  if (desc) form.set("description", desc);

  const res = await murekaFetch("/v1/song/vocal-clone", { apiKey, method: "POST", formData: form });
  if (!res.ok) {
    return { ok: false, error: res.error || "Mureka vocal clone failed", status: res.status, json: res.json, traceId: res.traceId };
  }
  const j = res.json || {};
  const vocalId = pickVocalCloneId(j);
  if (!vocalId) {
    return { ok: false, error: "Mureka returned no Vocal ID.", json: j, traceId: res.traceId, code: "mureka_no_vocal_id" };
  }
  return { ok: true, vocalId, json: j, traceId: res.traceId };
}

function pickChoiceAudioUrl(choice) {
  const c = choice && typeof choice === "object" ? choice : {};
  return String(c.url || c.mp3_url || c.wav_url || c.flac_url || c.stream_url || "").trim();
}

function normalizeMurekaChoices(json) {
  const choices = Array.isArray(json?.choices) ? json.choices : [];
  return choices
    .map((c, i) => {
      const url = pickChoiceAudioUrl(c);
      if (!url) return null;
      return {
        index: Number.isFinite(Number(c?.index)) ? Number(c.index) : i,
        id: String(c?.id || "").trim(),
        url,
        wavUrl: String(c?.wav_url || "").trim(),
        flacUrl: String(c?.flac_url || "").trim(),
        durationMs: Number(c?.duration) > 0 ? Number(c.duration) : null,
        lyricsSections: Array.isArray(c?.lyrics_sections) ? c.lyrics_sections : [],
      };
    })
    .filter(Boolean);
}

/**
 * Poll until succeeded / failed / timeout. Returns first choice audio by default.
 */
async function murekaWaitForSong({
  apiKey,
  upstreamTaskId,
  timeoutMs = POLL_TIMEOUT_MS,
  intervalMs = POLL_INTERVAL_MS,
} = {}) {
  const started = Date.now();
  let lastStatus = "";
  let lastJson = null;
  while (Date.now() - started < timeoutMs) {
    const q = await murekaQuerySong({ apiKey, upstreamTaskId });
    if (!q.ok) {
      return {
        ok: false,
        error: q.error || "Mureka query failed",
        status: q.status,
        json: q.json,
        lastStatus,
      };
    }
    lastJson = q.json;
    lastStatus = String(q.json?.status || "").trim().toLowerCase();
    if (lastStatus === "succeeded") {
      const choices = normalizeMurekaChoices(q.json);
      if (!choices.length) {
        return { ok: false, error: "Mureka succeeded but returned no audio URLs", json: q.json, lastStatus };
      }
      return {
        ok: true,
        status: lastStatus,
        choices,
        audioUrl: choices[0].url,
        model: String(q.json?.model || ""),
        json: q.json,
        failedReason: "",
      };
    }
    if (["failed", "timeouted", "cancelled"].includes(lastStatus)) {
      return {
        ok: false,
        error: murekaErrorMessage(q.json, 200) || `Mureka ${lastStatus}`,
        lastStatus,
        json: q.json,
      };
    }
    await sleep(intervalMs);
  }
  return {
    ok: false,
    error: `Mureka timed out after ${Math.round(timeoutMs / 1000)}s (last: ${lastStatus || "unknown"})`,
    lastStatus,
    json: lastJson,
  };
}

function murekaUserMessage(err) {
  const raw = String(err || "").trim();
  if (!raw) return "Mureka generation failed — try again.";
  if (/invalid authentication|unauthorized|401/i.test(raw)) {
    return "Mureka API key invalid — check MUREKA_API_KEY.";
  }
  if (/insufficient|balance|credit|quota|402/i.test(raw)) {
    return "Mureka balance too low — top up on platform.mureka.ai.";
  }
  if (/lyrics/i.test(raw) && /required|empty/i.test(raw)) {
    return "Mureka needs lyrics — add lyrics and try again.";
  }
  return raw.slice(0, 280);
}

module.exports = {
  murekaGenerateEnabled,
  murekaApiBase,
  resolveMurekaModel,
  resolveMurekaVocalId,
  mapMurekaGender,
  murekaGenerateSong,
  murekaCloneVocal,
  murekaQuerySong,
  murekaWaitForSong,
  normalizeMurekaChoices,
  murekaUserMessage,
};
