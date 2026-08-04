// Render a "song video" on the fly: cover image + audio = mp4.
//
// POST multipart/form-data  audio=<file>  title=...  image=<file>?  fast=1
// POST application/octet-stream / audio/*  raw audio body + X-Nabad-* headers
// POST application/json     { audioUrl, audioBase64?, imageUrl?, title, fast? }
//
// Prefer multipart from the phone (audio already loaded via our proxy) so the
// server never fetches Suno CDN on a slow link.

const Busboy = require("busboy");

const MAX_AUDIO_BYTES = 60 * 1024 * 1024;
const MAX_BASE64_AUDIO_BYTES = 4 * 1024 * 1024;
const MAX_RAW_AUDIO_BYTES = 4 * 1024 * 1024;
const MAX_MULTIPART_AUDIO_BYTES = 4 * 1024 * 1024;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const TOTAL_BUDGET_MS = 58000;
const AUDIO_FETCH_MS = 22000;
const ARCHIVED_AUDIO_FETCH_MS = 12000;
const IMAGE_FETCH_MS = 5000;
const OUT_W = 720;
const OUT_H = 1280;

function sanitizeFilename(name) {
  const trimmed = String(name || "song").trim();
  return trimmed
    .replace(/[\\/:*?"<>|\u0000-\u001F]/g, "")
    .replace(/\s+/g, " ")
    .slice(0, 80) || "song";
}

function isFastRender(params) {
  const v = params?.fast;
  if (v === "0" || v === false || v === 0) return false;
  return true;
}

function isArchivedStorageUrl(url) {
  return /\/storage\/v1\/object\/public\/song_archive\//i.test(String(url || ""));
}

function resolveFetchUrl(url) {
  const s = String(url || "").trim();
  if (!s) return s;
  try {
    const u = new URL(s);
    const path = u.pathname || "";
    // Keep our audio proxy — direct Suno CDN fetch from Vercel often 500s/timeouts.
    if (/\/api\/suno\/audio$/i.test(path) && /nabadai\.com$/i.test(u.hostname.replace(/^www\./, ""))) {
      return s;
    }
    if (/\/api\/suno\/audio$/i.test(path) || /\/suno\/audio$/i.test(path)) {
      const inner = u.searchParams.get("url");
      if (inner && /^https?:\/\//i.test(inner)) return inner;
    }
  } catch {}
  return s;
}

function absoluteNabadAudioProxyUrl(leaf) {
  const target = resolveFetchUrl(String(leaf || "").trim());
  if (!target || !/^https?:\/\//i.test(target)) return "";
  if (/\/api\/suno\/audio$/i.test(new URL(target).pathname || "")) return target;
  const base = process.env.VERCEL_URL
    ? `https://${String(process.env.VERCEL_URL).replace(/^https?:\/\//, "")}`
    : "https://www.nabadai.com";
  return `${base.replace(/\/$/, "")}/api/suno/audio?url=${encodeURIComponent(target)}`;
}

async function fetchToBuffer(url, maxBytes, timeoutMs) {
  const target = resolveFetchUrl(url);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(target, {
      signal: ctrl.signal,
      redirect: "follow",
      headers: { "User-Agent": "Mozilla/5.0 (compatible; NabadAi/1.0)" },
    });
    clearTimeout(timer);
    if (!r.ok) throw new Error(`fetch ${r.status} ${r.statusText}`);
    const len = Number(r.headers.get("content-length") || 0);
    if (len && len > maxBytes) throw new Error(`asset too large (${len} bytes)`);
    const ab = await r.arrayBuffer();
    if (ab.byteLength > maxBytes) throw new Error(`asset too large (${ab.byteLength} bytes)`);
    if (ab.byteLength < 1024) throw new Error("asset too small");
    const ct = String(r.headers.get("content-type") || "").toLowerCase();
    return { buffer: Buffer.from(ab), contentType: ct };
  } catch (e) {
    clearTimeout(timer);
    throw e;
  }
}

function audioExtFromContentType(ct, fallbackUrl, fallbackName = "") {
  const lower = String(ct || "").toLowerCase();
  if (lower.includes("mpeg")) return "mp3";
  if (lower.includes("mp4") || lower.includes("m4a")) return "m4a";
  if (lower.includes("aac")) return "aac";
  if (lower.includes("wav")) return "wav";
  if (lower.includes("ogg")) return "ogg";
  if (lower.includes("webm")) return "webm";
  for (const src of [fallbackName, fallbackUrl]) {
    try {
      const m = String(src || "").match(/\.(mp3|m4a|aac|wav|ogg|webm)$/i);
      if (m) return m[1].toLowerCase();
    } catch {}
  }
  return "mp3";
}

function imageExtFromContentType(ct, fallbackName = "") {
  const lower = String(ct || "").toLowerCase();
  if (lower.includes("jpeg") || lower.includes("jpg")) return "jpg";
  if (lower.includes("png")) return "png";
  if (lower.includes("webp")) return "webp";
  const m = String(fallbackName || "").match(/\.(jpg|jpeg|png|webp)$/i);
  if (m) return m[1].toLowerCase().replace("jpeg", "jpg");
  return "jpg";
}

function runFfmpeg(ffmpegPath, args, timeoutMs) {
  const { spawn } = require("child_process");
  return new Promise((resolve, reject) => {
    const p = spawn(ffmpegPath, args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      try { p.kill("SIGKILL"); } catch {}
      reject(new Error(`ffmpeg timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    p.stderr.on("data", (d) => { stderr += d.toString(); });
    p.on("error", (e) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(e);
    });
    p.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exit ${code}: ${stderr.slice(0, 600)}`));
    });
  });
}

async function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (c) => { raw += c; });
    req.on("end", () => {
      if (!raw) return resolve({});
      try { resolve(JSON.parse(raw)); }
      catch (e) { reject(e); }
    });
    req.on("error", reject);
  });
}

function readRawBody(req, maxBytes) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > maxBytes) {
        reject(new Error("audio too large"));
        try { req.destroy(); } catch {}
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function headerMetaValue(req, name, fallback = "") {
  try {
    return decodeURIComponent(String(req.headers[name] || fallback).trim());
  } catch {
    return String(req.headers[name] || fallback).trim();
  }
}

function isRawAudioContentType(contentType) {
  const ct = String(contentType || "").toLowerCase();
  return (
    ct.includes("application/octet-stream") ||
    ct.startsWith("audio/")
  );
}

function readMultipart(req) {
  return new Promise((resolve, reject) => {
    const bb = Busboy({
      headers: req.headers,
      limits: { fileSize: MAX_MULTIPART_AUDIO_BYTES, files: 2, fields: 8 },
    });
    const out = {
      title: "song",
      fast: true,
      audio: null,
      image: null,
    };
    bb.on("field", (name, val) => {
      if (name === "title") out.title = String(val || "song").trim() || "song";
      if (name === "fast") out.fast = String(val || "1") !== "0";
    });
    bb.on("file", (name, file, info) => {
      const chunks = [];
      let truncated = false;
      file.on("data", (d) => chunks.push(d));
      file.on("limit", () => { truncated = true; });
      file.on("end", () => {
        if (truncated) return;
        const buffer = Buffer.concat(chunks);
        if (name === "audio") {
          out.audio = {
            buffer,
            filename: String(info?.filename || "song.mp3"),
            mime: String(info?.mimeType || "audio/mpeg"),
          };
        } else if (name === "image") {
          out.image = {
            buffer,
            filename: String(info?.filename || "cover.jpg"),
            mime: String(info?.mimeType || "image/jpeg"),
          };
        }
      });
    });
    bb.on("error", reject);
    bb.on("finish", () => resolve(out));
    req.pipe(bb);
  });
}

function probeMediaDurationSec(ffmpegPath, filePath) {
  const { spawnSync } = require("child_process");
  const r = spawnSync(ffmpegPath, ["-hide_banner", "-i", filePath, "-f", "null", "-"], {
    encoding: "utf8",
  });
  const text = `${r.stderr || ""}\n${r.stdout || ""}`;
  const m = text.match(/Duration:\s*(\d+):(\d{2}):(\d{2}(?:\.\d+)?)/);
  if (!m) return 0;
  return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(parseFloat(m[3]));
}

function buildFfmpegArgs({ imagePath, audioPath, outPath, fps = 1, durationSec = 0, isFast = true }) {
  const dur = Number(durationSec) || 0;
  const longSong = dur > 45;
  const outW = longSong && isFast ? 540 : OUT_W;
  const outH = longSong && isFast ? 960 : OUT_H;
  const outFps = Math.max(1, Number(fps) || 1);
  const vf = longSong && isFast
    ? `scale=${outW}:${outH}:force_original_aspect_ratio=increase,crop=${outW}:${outH},format=yuv420p`
    : `scale=${OUT_W}:${OUT_H}:force_original_aspect_ratio=increase,` +
      `crop=${OUT_W}:${OUT_H},fps=${outFps},format=yuv420p`;
  const ffArgs = ["-y", "-hide_banner", "-loglevel", "error", "-nostdin", "-threads", "0"];
  if (imagePath) {
    ffArgs.push("-loop", "1", "-framerate", String(outFps), "-i", imagePath);
  } else {
    // Loop the generated black frame for the full song (non-loop lavfi can end early).
    ffArgs.push("-loop", "1", "-f", "lavfi", "-i", `color=c=black:s=${outW}x${outH}:r=${outFps}`);
  }
  ffArgs.push("-i", audioPath);
  ffArgs.push(
    "-map", "0:v:0",
    "-map", "1:a:0",
    "-vf", vf,
    "-c:v", "libx264", "-tune", "stillimage", "-pix_fmt", "yuv420p",
    "-preset", "ultrafast", "-profile:v", "baseline",
    "-c:a", "aac", "-b:a", "128k", "-ar", "44100", "-ac", "2",
    "-movflags", "+faststart",
  );
  if (longSong && isFast) ffArgs.push("-r", "1");
  if (dur > 0.5) {
    ffArgs.push("-t", String(Math.ceil(dur + 0.35)));
  } else {
    ffArgs.push("-shortest");
  }
  ffArgs.push(outPath);
  return ffArgs;
}

async function renderToResponse({
  res,
  title,
  isFast,
  audioBuffer,
  audioContentType,
  audioName,
  audioUrlFallback,
  imageBuffer,
  imageContentType,
  imageName,
  imageUrlFallback,
  startedMs,
}) {
  const fs = require("fs");
  const os = require("os");
  const path = require("path");

  let ffmpegPath = null;
  try { ffmpegPath = require("ffmpeg-static"); } catch {}
  if (!ffmpegPath) throw new Error("ffmpeg unavailable on server");

  const cleanup = [];
  const remainingMs = (floor = 8000) =>
    Math.max(floor, TOTAL_BUDGET_MS - (Date.now() - startedMs));

  const tmpDir = os.tmpdir();
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const outPath = path.join(tmpDir, `nabad-vid-${stamp}.mp4`);

  let audioPath = "";
  if (audioBuffer?.length) {
    const audioExt = audioExtFromContentType(audioContentType, "", audioName);
    audioPath = path.join(tmpDir, `nabad-vid-${stamp}.${audioExt}`);
    fs.writeFileSync(audioPath, audioBuffer);
    cleanup.push(audioPath);
  } else if (audioUrlFallback) {
    const fetchMs = isArchivedStorageUrl(audioUrlFallback)
      ? Math.min(ARCHIVED_AUDIO_FETCH_MS, remainingMs(12000))
      : Math.min(AUDIO_FETCH_MS, remainingMs(15000));
    const audio = await fetchToBuffer(audioUrlFallback, MAX_AUDIO_BYTES, fetchMs);
    const audioExt = audioExtFromContentType(audio.contentType, audioUrlFallback, audioName);
    audioPath = path.join(tmpDir, `nabad-vid-${stamp}.${audioExt}`);
    fs.writeFileSync(audioPath, audio.buffer);
    cleanup.push(audioPath);
  } else {
    throw new Error("Missing audio");
  }

  let imagePath = "";
  if (imageBuffer?.length) {
    const imgExt = imageExtFromContentType(imageContentType, imageName);
    imagePath = path.join(tmpDir, `nabad-vid-${stamp}.${imgExt}`);
    fs.writeFileSync(imagePath, imageBuffer);
    cleanup.push(imagePath);
  } else if (imageUrlFallback) {
    try {
      const image = await fetchToBuffer(imageUrlFallback, MAX_IMAGE_BYTES, IMAGE_FETCH_MS);
      const imgExt = imageExtFromContentType(image.contentType, imageName);
      imagePath = path.join(tmpDir, `nabad-vid-${stamp}.${imgExt}`);
      fs.writeFileSync(imagePath, image.buffer);
      cleanup.push(imagePath);
    } catch (imgErr) {
      console.warn("[render-video] cover skipped:", imgErr?.message || imgErr);
    }
  }

  const encodeFps = isFast ? 1 : 2;
  const audioDurationSec = probeMediaDurationSec(ffmpegPath, audioPath);
  const ffBase = { audioPath, outPath, fps: encodeFps, durationSec: audioDurationSec, isFast };
  const ffmpegMs = audioBuffer?.length
    ? Math.min(remainingMs(6000), Math.max(45000, Math.ceil(audioDurationSec * 420) + 12000))
    : Math.min(remainingMs(8000), Math.max(28000, Math.ceil(audioDurationSec * 380) + 8000));

  try {
    await runFfmpeg(ffmpegPath, buildFfmpegArgs({ ...ffBase, imagePath }), ffmpegMs);
  } catch (firstErr) {
    if (imagePath) {
      console.warn("[render-video] cover encode failed, sound-only:", firstErr?.message || firstErr);
      await runFfmpeg(
        ffmpegPath,
        buildFfmpegArgs({ ...ffBase, imagePath: "" }),
        Math.max(22000, Math.min(remainingMs(6000), ffmpegMs)),
      );
    } else {
      throw firstErr;
    }
  }
  cleanup.push(outPath);

  const outDurationSec = probeMediaDurationSec(ffmpegPath, outPath);
  if (
    audioDurationSec > 3 &&
    outDurationSec > 0 &&
    outDurationSec < audioDurationSec * 0.85
  ) {
    throw new Error(
      `Video truncated (${Math.round(outDurationSec)}s of ${Math.round(audioDurationSec)}s) — try again on Wi‑Fi`,
    );
  }

  const outStat = fs.statSync(outPath);
  if (!outStat?.size || outStat.size < 2048) throw new Error("ffmpeg produced an empty video");

  const filename = `${sanitizeFilename(title)}.mp4`;
  res.statusCode = 200;
  res.setHeader("Content-Type", "video/mp4");
  res.setHeader("Content-Length", String(outStat.size));
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
  );
  res.setHeader("Cache-Control", "no-store");
  if (isFast) res.setHeader("X-Nabad-Video-Fast", "1");

  await new Promise((resolve, reject) => {
    const stream = fs.createReadStream(outPath);
    stream.on("error", reject);
    res.on("error", reject);
    stream.on("end", resolve);
    stream.pipe(res);
  });

  for (const f of cleanup) {
    try { fs.unlinkSync(f); } catch {}
  }
}

module.exports = async function handler(req, res) {
  const { applyCors } = require("./_lib/cors");
  if (applyCors(req, res)) return;

  const startedMs = Date.now();
  let cleanup = [];

  try {
    if (req.method !== "POST") {
      res.statusCode = 405;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: "POST required" }));
      return;
    }

    const contentType = String(req.headers["content-type"] || "").toLowerCase();

    if (contentType.includes("multipart/form-data")) {
      const form = await readMultipart(req);
      if (!form.audio?.buffer?.length) {
        res.statusCode = 400;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ error: "Missing audio file" }));
        return;
      }
      await renderToResponse({
        res,
        title: form.title,
        isFast: isFastRender(form),
        audioBuffer: form.audio.buffer,
        audioContentType: form.audio.mime,
        audioName: form.audio.filename,
        imageBuffer: form.image?.buffer,
        imageContentType: form.image?.mime,
        imageName: form.image?.filename,
        startedMs,
      });
      return;
    }

    if (isRawAudioContentType(contentType)) {
      const audioBuffer = await readRawBody(req, MAX_RAW_AUDIO_BYTES);
      if (!audioBuffer?.length || audioBuffer.length < 1024) {
        res.statusCode = 400;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ error: "Missing audio body" }));
        return;
      }
      const title = headerMetaValue(req, "x-nabad-title", "song") || "song";
      const isFast = String(req.headers["x-nabad-fast"] || "1") !== "0";
      const audioName = headerMetaValue(req, "x-nabad-audio-name", "song.mp3") || "song.mp3";
      const imageUrl = headerMetaValue(req, "x-nabad-image-url", "");
      const safeImageUrl = imageUrl && /^https?:\/\//i.test(imageUrl) ? imageUrl : "";
      await renderToResponse({
        res,
        title,
        isFast,
        audioBuffer,
        audioContentType: contentType.split(";")[0].trim() || "audio/mpeg",
        audioName,
        imageUrlFallback: safeImageUrl,
        startedMs,
      });
      return;
    }

    let params = {};
    try { params = await readJsonBody(req); } catch { params = {}; }

    const audioUrl = resolveFetchUrl(String(params.audioUrl || "").trim());
    const audioBase64 = String(params.audioBase64 || params.audio_base64 || "").trim();
    const imageBase64 = String(params.imageBase64 || params.image_base64 || "").trim();
    const title = String(params.title || "song").trim();
    const isFast = isFastRender(params);
    const imageUrl = String(params.imageUrl || "").trim();
    const safeImageUrl = imageUrl && /^https?:\/\//i.test(imageUrl) ? imageUrl : "";

    if (audioBase64) {
      let audioBuffer;
      try {
        audioBuffer = Buffer.from(audioBase64, "base64");
      } catch {
        res.statusCode = 400;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ error: "Invalid audioBase64" }));
        return;
      }
      if (!audioBuffer?.length || audioBuffer.length < 1024) {
        res.statusCode = 400;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ error: "audioBase64 too small" }));
        return;
      }
      if (audioBuffer.length > MAX_BASE64_AUDIO_BYTES) {
        res.statusCode = 413;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ error: "audioBase64 too large" }));
        return;
      }
      let imageBuffer = null;
      if (imageBase64) {
        try {
          imageBuffer = Buffer.from(imageBase64, "base64");
        } catch {
          imageBuffer = null;
        }
      }
      await renderToResponse({
        res,
        title,
        isFast,
        audioBuffer,
        audioContentType: "audio/mpeg",
        audioName: "song.mp3",
        imageBuffer,
        imageContentType: "image/jpeg",
        imageName: "cover.jpg",
        startedMs,
      });
      return;
    }

    if (!audioUrl || !/^https?:\/\//i.test(audioUrl)) {
      res.statusCode = 400;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: audioUrl ? "Invalid audioUrl" : "Missing audioUrl" }));
      return;
    }

    await renderToResponse({
      res,
      title,
      isFast,
      audioUrlFallback: isArchivedStorageUrl(audioUrl) ? audioUrl : (absoluteNabadAudioProxyUrl(audioUrl) || audioUrl),
      imageUrlFallback: safeImageUrl,
      startedMs,
    });
  } catch (e) {
    const msg = e?.message ? String(e.message) : "render failed";
    console.error("[render-video] failed:", msg, e?.stack || "");
    const timedOut = /timed out|abort/i.test(msg);
    if (!res.headersSent) {
      res.statusCode = timedOut ? 504 : 500;
      res.setHeader("Content-Type", "application/json");
      res.setHeader("Cache-Control", "no-store");
      res.end(JSON.stringify({ error: msg }));
    }
  } finally {
    const fs = require("fs");
    for (const f of cleanup) {
      try { fs.unlinkSync(f); } catch {}
    }
  }
};
