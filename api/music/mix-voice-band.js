/**
 * POST /api/music/mix-voice-band
 *   { vocalUrl, bandUrl }
 *
 * Server-mix a chat voice drop over a Suno add-instrumental bed.
 * Browser mix cannot fetch Suno CDN audio (CORS), so it silently failed
 * and chat was sharing the instrumental-only file.
 */
const { verifyUser, sendJson, readJsonBody } = require("../_lib/credits-auth");
const { applyCors } = require("../_lib/cors");
const { unwrapProxyUrl } = require("../_lib/archive-remote-song");
const { uploadObject } = require("../_lib/supabase-storage");

const MAX_AUDIO_BYTES = 40 * 1024 * 1024;
const FETCH_MS = 45000;

function guessExt(ct, url, buf) {
  const lower = String(ct || "").toLowerCase();
  if (lower.includes("wav") || (buf && buf.slice(0, 4).toString("ascii") === "RIFF")) return "wav";
  if (lower.includes("webm") || (buf && buf[0] === 0x1a && buf[1] === 0x45)) return "webm";
  if (lower.includes("mp4") || lower.includes("m4a") || (buf && buf.slice(4, 8).toString("ascii") === "ftyp")) {
    return "m4a";
  }
  if (lower.includes("ogg") || (buf && buf.slice(0, 4).toString("ascii") === "OggS")) return "ogg";
  try {
    const m = new URL(url).pathname.match(/\.(mp3|m4a|wav|webm|ogg)$/i);
    if (m) return m[1].toLowerCase();
  } catch {}
  return "mp3";
}

async function fetchAudio(rawUrl) {
  const url = unwrapProxyUrl(rawUrl) || String(rawUrl || "").trim();
  if (!url || !/^https?:\/\//i.test(url)) throw new Error("missing_url");
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_MS);
  try {
    const r = await fetch(url, { signal: ctrl.signal, redirect: "follow" });
    if (!r.ok) throw new Error(`upstream_${r.status}`);
    const ab = await r.arrayBuffer();
    if (ab.byteLength < 8 * 1024) throw new Error("audio_too_small");
    if (ab.byteLength > MAX_AUDIO_BYTES) throw new Error("audio_too_large");
    return {
      buffer: Buffer.from(ab),
      contentType: String(r.headers.get("content-type") || "audio/mpeg"),
      url,
    };
  } finally {
    clearTimeout(timer);
  }
}

function runFfmpeg(ffmpegPath, args) {
  const { spawn } = require("child_process");
  return new Promise((resolve, reject) => {
    const p = spawn(ffmpegPath, args);
    let stderr = "";
    p.stderr.on("data", (d) => {
      stderr += d.toString();
    });
    p.on("error", reject);
    p.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exit ${code}: ${stderr.slice(-400)}`));
    });
  });
}

async function mixVoiceOverBand(vocalBuf, vocalExt, bandBuf, bandExt) {
  let ffmpegPath = null;
  try {
    ffmpegPath = require("ffmpeg-static");
  } catch {
    ffmpegPath = null;
  }
  if (!ffmpegPath) throw new Error("ffmpeg_missing");

  const fs = require("fs");
  const os = require("os");
  const path = require("path");
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const vocalPath = path.join(os.tmpdir(), `nabad-v-${stamp}.${vocalExt}`);
  const bandPath = path.join(os.tmpdir(), `nabad-b-${stamp}.${bandExt}`);
  const outPath = path.join(os.tmpdir(), `nabad-m-${stamp}.mp3`);

  fs.writeFileSync(vocalPath, vocalBuf);
  fs.writeFileSync(bandPath, bandBuf);
  try {
    // Loop the drop for the full band so the voice is not an 8s cameo
    // at the start of a 2-minute instrumental.
    await runFfmpeg(ffmpegPath, [
      "-y",
      "-hide_banner",
      "-loglevel",
      "error",
      "-i",
      bandPath,
      "-stream_loop",
      "-1",
      "-i",
      vocalPath,
      "-filter_complex",
      "[0:a]equalizer=f=90:t=q:w=0.9:g=-4,volume=0.56[b];[1:a]highpass=f=120,acompressor=threshold=-16dB:ratio=2.4:attack=8:release=120,volume=1.22[v];[b][v]amix=inputs=2:duration=first:dropout_transition=2:normalize=0[out]",
      "-map",
      "[out]",
      "-ac",
      "2",
      "-ar",
      "44100",
      "-c:a",
      "libmp3lame",
      "-b:a",
      "192k",
      outPath,
    ]);
    const out = fs.readFileSync(outPath);
    if (!out || out.length < 32 * 1024) throw new Error("mix_too_short");
    return out;
  } finally {
    try { fs.unlinkSync(vocalPath); } catch {}
    try { fs.unlinkSync(bandPath); } catch {}
    try { fs.unlinkSync(outPath); } catch {}
  }
}

module.exports = async function handler(req, res) {
  if (applyCors(req, res)) return;
  try {
    if (req.method !== "POST") return sendJson(res, 405, { error: "Method not allowed" });
    const user = await verifyUser(req);
    if (!user) return sendJson(res, 401, { error: "Sign in to mix this remix." });

    const body = await readJsonBody(req);
    const vocalUrl = String(body?.vocalUrl || body?.voiceUrl || "").trim();
    const bandUrl = String(body?.bandUrl || body?.instrumentalUrl || "").trim();
    if (!vocalUrl || !bandUrl) {
      return sendJson(res, 400, { error: "Missing vocalUrl or bandUrl" });
    }

    const vocal = await fetchAudio(vocalUrl);
    const band = await fetchAudio(bandUrl);
    const mixed = await mixVoiceOverBand(
      vocal.buffer,
      guessExt(vocal.contentType, vocal.url, vocal.buffer),
      band.buffer,
      guessExt(band.contentType, band.url, band.buffer),
    );

    const key = `${user.userId}/drop-mix-${Date.now()}.mp3`;
    const up = await uploadObject({
      bucket: "song_archive",
      key,
      body: mixed,
      contentType: "audio/mpeg",
    });
    if (!up.ok || !up.url) {
      return sendJson(res, 502, { error: up.error || "Could not store the mix." });
    }
    return sendJson(res, 200, { ok: true, url: up.url });
  } catch (e) {
    const msg = e?.message || String(e);
    console.warn("[music/mix-voice-band]", msg);
    return sendJson(res, 502, { error: "Couldn't put your voice on the band.", detail: msg.slice(0, 180) });
  }
};
