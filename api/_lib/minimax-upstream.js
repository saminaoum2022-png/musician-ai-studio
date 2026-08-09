/**
 * Thin helpers for MiniMax Music Generation API.
 * @see https://platform.minimax.io/docs/api-reference/music-generation
 */
const MINIMAX_BASE = "https://api.minimax.io";

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
  const model = String(opts.model || process.env.MINIMAX_MUSIC_MODEL || "music-3.0-free").trim();
  const outputFormat = opts.outputFormat === "hex" ? "hex" : "url";
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

function minimaxUserMessage(statusCode, statusMsg) {
  const code = Number(statusCode);
  const msg = String(statusMsg || "").trim();
  if (code === 1002) return "MiniMax rate limit — wait a minute and try again.";
  if (code === 1004 || code === 2049) return "MiniMax authentication failed — check MINIMAX_API_KEY.";
  if (code === 1008) return "MiniMax balance is empty — add pay-as-you-go credits.";
  if (code === 1026) return "MiniMax flagged this content — try different lyrics or style.";
  if (code === 2013) return msg || "MiniMax rejected the request — check lyrics and style length.";
  return msg || "MiniMax music generation failed.";
}

module.exports = {
  MINIMAX_BASE,
  minimaxJsonRequest,
  minimaxGenerateMusic,
  minimaxUserMessage,
  safeJson,
};
