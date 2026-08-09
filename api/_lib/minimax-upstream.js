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
function resolveMinimaxMusicModel(explicit) {
  const override = String(explicit || process.env.MINIMAX_MUSIC_MODEL || "").trim();
  if (override) return override;
  return minimaxKeyKind() === "subscription" ? "music-2.6" : "music-3.0-free";
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
 * Generate music via MiniMax Music 3.0 API.
 * @param {{ apiKey: string, model?: string, prompt: string, lyrics?: string, isInstrumental?: boolean, lyricsOptimizer?: boolean, outputFormat?: "url"|"hex" }} opts
 */
async function minimaxGenerateMusic(opts) {
  const model = resolveMinimaxMusicModel(opts.model);
  // Hex is the documented default and is more reliable than short-lived URLs.
  const outputFormat = opts.outputFormat === "url" ? "url" : "hex";
  const body = {
    model,
    output_format: outputFormat,
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
  return minimaxJsonRequest("/v1/music_generation", {
    apiKey: opts.apiKey,
    body,
  });
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
