/**
 * Thin helpers for MiniMax Music Generation API.
 * @see https://platform.minimax.io/docs/api-reference/music-generation
 */
const MINIMAX_BASE = "https://api.minimax.io";
const MINIMAX_REMAINS_URL = "https://www.minimax.io/v1/token_plan/remains";

/** @returns {"paygo"|"subscription"} */
function minimaxKeyKind() {
  const v = String(process.env.MINIMAX_KEY_KIND || "paygo").trim().toLowerCase();
  if (v === "subscription" || v === "credits" || v === "token") return "subscription";
  return "paygo";
}

/**
 * Pick model for the configured key type.
 * - paygo Access API key → music-3.0-free ($0/song, needs Balance wallet)
 * - Subscription / Credits key → music-2.6 (~$0.15/song; music-3.0 needs $20/mo Token Plan)
 */
function normalizeMinimaxMusicModel(name) {
  return String(name || "").trim().toLowerCase();
}

function resolveMinimaxMusicModel(explicit) {
  const keyKind = minimaxKeyKind();
  const explicitModel = normalizeMinimaxMusicModel(explicit);
  const envModel = normalizeMinimaxMusicModel(process.env.MINIMAX_MUSIC_MODEL);

  if (keyKind === "subscription") {
    // Credits / Subscription keys cannot call music-3.0* — force 2.6 unless user
    // explicitly picked another supported paid model (not 3.x, not -free).
    const candidate = explicitModel || envModel;
    if (candidate && !candidate.startsWith("music-3") && !candidate.endsWith("-free")) {
      return candidate;
    }
    return "music-2.6";
  }

  // Pay-as-you-go Access API key — free tier unless explicitly overridden.
  if (explicitModel) return explicitModel;
  if (envModel) return envModel;
  return "music-3.0-free";
}

function safeJson(txt) {
  try {
    return JSON.parse(txt);
  } catch {
    return null;
  }
}

/**
 * @param {string} path - e.g. "/v1/music_generation"
 * @param {{ method?: string, apiKey: string, body?: object }} opts
 */
async function minimaxJsonRequest(path, opts) {
  const method = opts.method || "POST";
  const url = new URL(path, MINIMAX_BASE);
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
  const statusCode =
    data?.base_resp?.status_code != null ? Number(data.base_resp.status_code) : r.ok ? 0 : r.status;
  return {
    ok: r.ok && statusCode === 0,
    httpStatus: r.status,
    statusCode,
    statusMsg: String(data?.base_resp?.status_msg || "").trim(),
    data,
    text,
  };
}

/**
 * Generate music via MiniMax Music API (streaming hex — required for long tracks).
 * @param {{ apiKey: string, model?: string, prompt: string, lyrics?: string, isInstrumental?: boolean, lyricsOptimizer?: boolean, outputFormat?: "url"|"hex" }} opts
 */
async function minimaxGenerateMusic(opts) {
  const model = resolveMinimaxMusicModel(opts.model);
  const body = {
    model,
    stream: true,
    output_format: "hex",
    audio_setting: {
      sample_rate: 44100,
      bitrate: 256000,
      format: "mp3",
    },
    is_instrumental: Boolean(opts.isInstrumental),
  };
  const prompt = String(opts.prompt || "").trim();
  const lyrics = String(opts.lyrics || "").trim();
  if (prompt) body.prompt = prompt;
  if (lyrics) body.lyrics = lyrics;
  if (opts.lyricsOptimizer) body.lyrics_optimizer = true;

  const url = new URL("/v1/music_generation", MINIMAX_BASE);
  const headers = {
    Authorization: `Bearer ${opts.apiKey}`,
    "Content-Type": "application/json",
  };
  let r;
  try {
    r = await fetch(url.toString(), {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
  } catch (e) {
    return {
      ok: false,
      httpStatus: 0,
      statusCode: 0,
      statusMsg: e?.message || String(e),
      data: null,
      text: "",
      audioBuffer: null,
    };
  }

  const contentType = String(r.headers.get("content-type") || "").toLowerCase();
  if (contentType.includes("text/event-stream") || contentType.startsWith("audio/")) {
    const streamed = await readMinimaxMusicStream(r);
    if (!streamed.ok) {
      return {
        ok: false,
        httpStatus: r.status,
        statusCode: streamed.statusCode || r.status,
        statusMsg: streamed.statusMsg || "MiniMax stream failed",
        data: streamed.data || null,
        text: streamed.text || "",
        audioBuffer: null,
      };
    }
    return {
      ok: true,
      httpStatus: r.status,
      statusCode: 0,
      statusMsg: "success",
      data: streamed.data || null,
      text: "",
      audioBuffer: streamed.buffer,
      contentType: streamed.contentType || "audio/mpeg",
    };
  }

  const text = await r.text().catch(() => "");
  const data = safeJson(text);
  const statusCode =
    data?.base_resp?.status_code != null ? Number(data.base_resp.status_code) : r.ok ? 0 : r.status;
  const genStatus = Number(data?.data?.status || 0);
  const parsed = extractMinimaxAudio(data);
  const audioBuffer = parsed?.kind === "hex" ? parsed.buffer : null;
  const ok = r.ok && statusCode === 0 && genStatus === 2 && Boolean(audioBuffer || parsed?.kind === "url");
  return {
    ok,
    httpStatus: r.status,
    statusCode: ok ? 0 : statusCode || (genStatus === 1 ? 202 : statusCode),
    statusMsg: String(data?.base_resp?.status_msg || "").trim() || (genStatus === 1 ? "still_processing" : ""),
    data,
    text,
    audioBuffer,
    contentType: "audio/mpeg",
  };
}

function decodeMinimaxBinaryChunk(raw) {
  const trimmed = String(raw || "").trim();
  if (!trimmed) return null;
  const hex = trimmed.replace(/^0x/i, "");
  if (/^[0-9a-f]+$/i.test(hex) && hex.length >= 64 && hex.length % 2 === 0) {
    return Buffer.from(hex, "hex");
  }
  try {
    const buf = Buffer.from(trimmed, "base64");
    return buf.length >= 128 ? buf : null;
  } catch {
    return null;
  }
}

/** Parse MiniMax SSE stream or raw audio/mpeg body into one MP3 buffer. */
async function readMinimaxMusicStream(response) {
  const contentType = String(response.headers.get("content-type") || "").toLowerCase();
  if (contentType.startsWith("audio/")) {
    const ab = await response.arrayBuffer();
    const buffer = Buffer.from(ab);
    if (buffer.length < 128) {
      return { ok: false, statusMsg: "empty_audio_body", buffer: null };
    }
    return { ok: true, buffer, contentType, data: null };
  }

  const text = await response.text().catch(() => "");
  if (!response.ok) {
    const data = safeJson(text);
    return {
      ok: false,
      statusCode: data?.base_resp?.status_code,
      statusMsg: data?.base_resp?.status_msg || text.slice(0, 200),
      text,
      data,
      buffer: null,
    };
  }

  const chunks = [];
  let lastData = null;
  for (const rawLine of text.split(/\r?\n/u)) {
    const line = rawLine.trim();
    if (!line.startsWith("data:")) continue;
    const json = line.slice(5).trim();
    if (!json || json === "[DONE]") continue;
    const frame = safeJson(json);
    if (!frame) continue;
    lastData = frame;
    const code = Number(frame?.base_resp?.status_code || 0);
    if (code && code !== 0) {
      return {
        ok: false,
        statusCode: code,
        statusMsg: frame?.base_resp?.status_msg || "MiniMax stream error",
        data: frame,
        buffer: null,
      };
    }
    const audio = String(frame?.data?.audio || "").trim();
    if (!audio) continue;
    // Final frame may repeat full audio — keep the largest assembled buffer.
    if (String(frame?.data?.status ?? "") === "2" && chunks.length > 0) continue;
    const piece = decodeMinimaxBinaryChunk(audio);
    if (piece) chunks.push(piece);
  }
  const buffer = Buffer.concat(chunks);
  if (buffer.length < 128) {
    return {
      ok: false,
      statusMsg: "MiniMax stream returned no audio",
      data: lastData,
      buffer: null,
      text: text.slice(0, 400),
    };
  }
  return { ok: true, buffer, contentType: "audio/mpeg", data: lastData };
}

function isLikelyHttpUrl(value) {
  const s = String(value || "").trim();
  return s.startsWith("http://") || s.startsWith("https://");
}

/** Parse MiniMax music response — audio may be a URL or hex string. */
function extractMinimaxAudio(upstreamData) {
  const root = upstreamData && typeof upstreamData === "object" ? upstreamData : {};
  const block = root.data && typeof root.data === "object" ? root.data : root;
  const urlCandidate = String(block.audio_url || root.audio_url || "").trim();
  if (isLikelyHttpUrl(urlCandidate)) return { kind: "url", url: urlCandidate };
  const audioRaw = String(block.audio || root.audio || "").trim();
  if (isLikelyHttpUrl(audioRaw)) return { kind: "url", url: audioRaw };
  const hex = audioRaw.replace(/^0x/i, "");
  if (hex.length > 64 && /^[0-9a-fA-F]+$/.test(hex)) {
    return { kind: "hex", buffer: Buffer.from(hex, "hex") };
  }
  return null;
}

/** Check Token Plan / Credits balance (Subscription key only). */
async function minimaxCreditsRemain(apiKey) {
  try {
    const r = await fetch(MINIMAX_REMAINS_URL, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
    });
    const text = await r.text().catch(() => "");
    const data = safeJson(text);
    return { ok: r.ok, httpStatus: r.status, data, text };
  } catch (e) {
    return { ok: false, error: e?.message || String(e) };
  }
}

function minimaxUserMessage(statusCode, statusMsg, ctx = {}) {
  const code = Number(statusCode);
  const msg = String(statusMsg || "").trim();
  const model = String(ctx.model || "").trim();
  const keyKind = ctx.keyKind || minimaxKeyKind();
  if (code === 1002) return "MiniMax rate limit — wait a minute and try again.";
  if (code === 1004 || code === 2049) return "MiniMax authentication failed — check MINIMAX_API_KEY.";
  if (code === 1008) {
    if (keyKind === "subscription") {
      return "MiniMax Credits empty or wrong key — use Subscription key + MINIMAX_KEY_KIND=subscription.";
    }
    if (model.endsWith("-free")) {
      return "MiniMax pay-as-you-go balance empty — music-3.0-free needs ~$25 Balance wallet.";
    }
    return "MiniMax balance is empty — add pay-as-you-go credits or Token Plan Credits.";
  }
  if (code === 2061 || /not support model/i.test(msg)) {
    if (model.startsWith("music-3")) {
      return "MiniMax Credits don't include music-3.0 — try music-2.6, or subscribe to Token Plan Plus ($20/mo).";
    }
    return msg || "MiniMax plan doesn't support this music model — try music-2.6.";
  }
  if (code === 1026) return "MiniMax flagged this content — try different lyrics or style.";
  if (code === 2013) return msg || "MiniMax rejected the request — check lyrics and style length.";
  if (code === 202 || msg === "still_processing") {
    return "MiniMax is still composing — wait a minute and try again.";
  }
  return msg || "MiniMax music generation failed.";
}

module.exports = {
  MINIMAX_BASE,
  MINIMAX_REMAINS_URL,
  minimaxKeyKind,
  resolveMinimaxMusicModel,
  minimaxJsonRequest,
  minimaxGenerateMusic,
  minimaxCreditsRemain,
  minimaxUserMessage,
  extractMinimaxAudio,
  safeJson,
};
