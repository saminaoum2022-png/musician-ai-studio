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
/** Mureka song/generate: lyrics up to ~3000 chars (third-party docs); stay under with margin. */
const MUREKA_LYRICS_MAX_BYTES = 2800;
/** Style `prompt` field — platform limit ~1024 chars (1020 errors are often prompt, not lyrics). */
const MUREKA_PROMPT_MAX_CHARS = 1000;
/** @deprecated use byte cap — kept for logs / UI hints */
const MUREKA_LYRICS_MAX_CHARS = MUREKA_LYRICS_MAX_BYTES;

function murekaLyricsByteLength(text) {
  return Buffer.byteLength(String(text || ""), "utf8");
}

function murekaLyricsWithinLimit(text, maxBytes = MUREKA_LYRICS_MAX_BYTES) {
  return murekaLyricsByteLength(text) <= maxBytes;
}

/**
 * Fit lyrics into Mureka's cap (whole string including [Verse] tags).
 * Prefer dropping lines from the bottom over mid-line chop. Limit is UTF-8 bytes (Arabic script is multi-byte).
 */
function prepareMurekaLyrics(raw, maxBytes = MUREKA_LYRICS_MAX_BYTES) {
  const max = Math.max(200, Math.min(1020, Number(maxBytes) || MUREKA_LYRICS_MAX_BYTES));
  let s = String(raw || "").trim();
  if (!s) return { lyrics: "", truncated: false, charCount: 0, byteCount: 0 };
  if (murekaLyricsWithinLimit(s, max)) {
    return {
      lyrics: s,
      truncated: false,
      charCount: s.length,
      byteCount: murekaLyricsByteLength(s),
    };
  }

  const lines = s.split(/\r?\n/);
  const kept = [];
  for (const line of lines) {
    const next = kept.length ? `${kept.join("\n")}\n${line}` : line;
    if (!murekaLyricsWithinLimit(next, max)) break;
    kept.push(line);
  }
  const joined = kept.join("\n").trim();
  if (joined.length >= 80 && murekaLyricsWithinLimit(joined, max)) {
    return {
      lyrics: joined,
      truncated: true,
      charCount: joined.length,
      byteCount: murekaLyricsByteLength(joined),
      droppedFrom: s.length,
    };
  }

  let lo = 0;
  let hi = s.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    const candidate = s.slice(0, mid).trim();
    if (!candidate) {
      hi = mid - 1;
      continue;
    }
    if (murekaLyricsWithinLimit(candidate, max)) lo = mid;
    else hi = mid - 1;
  }
  const lyrics = s.slice(0, lo).trim();
  return {
    lyrics,
    truncated: true,
    charCount: lyrics.length,
    byteCount: murekaLyricsByteLength(lyrics),
    droppedFrom: s.length,
  };
}

function prepareMurekaPrompt(raw, maxChars = MUREKA_PROMPT_MAX_CHARS) {
  const max = Math.max(80, Math.min(1024, Number(maxChars) || MUREKA_PROMPT_MAX_CHARS));
  const s = String(raw || "").replace(/\s+/g, " ").trim();
  if (!s) return { prompt: "", truncated: false, charCount: 0 };
  if (s.length <= max) return { prompt: s, truncated: false, charCount: s.length };
  const prompt = s.slice(0, max).trim();
  return { prompt, truncated: true, charCount: prompt.length, droppedFrom: s.length };
}

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

async function murekaFetch(path, { apiKey, method = "GET", body = null } = {}) {
  const key = String(apiKey || "").trim();
  if (!key) return { ok: false, status: 0, error: "missing_mureka_api_key", json: null };
  const url = `${murekaApiBase()}${path.startsWith("/") ? path : `/${path}`}`;
  const headers = {
    Authorization: `Bearer ${key}`,
    Accept: "application/json",
  };
  let payload = null;
  if (body != null) {
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
  const prepared = prepareMurekaLyrics(lyrics);
  if (!prepared.lyrics) {
    return { ok: false, error: "Mureka lyrics-to-song needs lyrics.", code: "mureka_lyrics_required" };
  }
  if (!murekaLyricsWithinLimit(prepared.lyrics)) {
    return {
      ok: false,
      error: `Lyrics exceed Mureka limit (${prepared.byteCount || murekaLyricsByteLength(prepared.lyrics)} bytes)`,
      code: "mureka_lyrics_too_long",
    };
  }
  const body = {
    lyrics: prepared.lyrics,
    model: resolveMurekaModel(model),
    n: Math.max(1, Math.min(3, Number(n) || 1)),
    stream: Boolean(stream),
  };
  const stylePrep = prepareMurekaPrompt(prompt);
  if (stylePrep.prompt) body.prompt = stylePrep.prompt;
  const g = mapMurekaGender(gender) || String(gender || "").trim();
  if (g) body.gender = g;
  const vid = resolveMurekaVocalId(vocalId);
  if (vid) body.vocal_id = vid;
  const rid = String(referenceId || "").trim();
  if (rid) body.reference_id = rid;
  const mid = String(melodyId || "").trim();
  if (mid) body.melody_id = mid;

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
  if (/character|1020|1024|exceed|too long/i.test(raw)) {
    if (/prompt|style|parameter|1024/i.test(raw)) {
      return "Style was too long for Mureka (max ~1024 characters) — shorten Style/Tags and try again.";
    }
    if (/lyrics/i.test(raw)) {
      return "Lyrics were too long for Mureka — use shorter lines or fewer sections.";
    }
    return "Request was too long for Mureka — shorten Style/Tags first (max ~1024), then lyrics if needed.";
  }
  return raw.slice(0, 280);
}

module.exports = {
  MUREKA_LYRICS_MAX_BYTES,
  MUREKA_LYRICS_MAX_CHARS,
  MUREKA_PROMPT_MAX_CHARS,
  murekaLyricsByteLength,
  murekaLyricsWithinLimit,
  prepareMurekaLyrics,
  prepareMurekaPrompt,
  murekaGenerateEnabled,
  murekaApiBase,
  resolveMurekaModel,
  resolveMurekaVocalId,
  mapMurekaGender,
  murekaGenerateSong,
  murekaQuerySong,
  murekaWaitForSong,
  normalizeMurekaChoices,
  murekaUserMessage,
};
