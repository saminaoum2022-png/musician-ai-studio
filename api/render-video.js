// Render a "song video" on the fly: cover image + audio = mp4.
// Used by the Download Video button so the user can save and share their
// song as a single file (chat apps + social accept mp4 directly).
//
// GET  /api/render-video?audioUrl=...&imageUrl=...&title=...&fast=1
// POST /api/render-video  { audioUrl, imageUrl, title, lyrics?, fast? }
//
// Fast mode (default): 1fps, no lyrics, local temp files only (no ffmpeg HTTP inputs).

const MAX_AUDIO_BYTES = 60 * 1024 * 1024;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const TOTAL_BUDGET_MS = 55000;
const FAST_AUDIO_FETCH_MS = 22000;
const FAST_IMAGE_FETCH_MS = 5000;
const OUT_W = 720;
const OUT_H = 1280;
const OUT_FPS = 2;

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

function resolveFetchUrl(url) {
  const s = String(url || "").trim();
  if (!s) return s;
  try {
    const u = new URL(s);
    const path = u.pathname || "";
    if (/\/api\/suno\/audio$/i.test(path) || /\/suno\/audio$/i.test(path)) {
      const inner = u.searchParams.get("url");
      if (inner && /^https?:\/\//i.test(inner)) return inner;
    }
  } catch {}
  return s;
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

function audioExtFromContentType(ct, fallbackUrl) {
  const lower = String(ct || "").toLowerCase();
  if (lower.includes("mpeg")) return "mp3";
  if (lower.includes("mp4")) return "m4a";
  if (lower.includes("aac")) return "aac";
  if (lower.includes("wav")) return "wav";
  if (lower.includes("ogg")) return "ogg";
  if (lower.includes("webm")) return "webm";
  try {
    const u = new URL(fallbackUrl);
    const m = u.pathname.match(/\.(mp3|m4a|aac|wav|ogg|webm)$/i);
    if (m) return m[1].toLowerCase();
  } catch {}
  return "mp3";
}

function imageExtFromContentType(ct, fallbackUrl) {
  const lower = String(ct || "").toLowerCase();
  if (lower.includes("jpeg") || lower.includes("jpg")) return "jpg";
  if (lower.includes("png")) return "png";
  if (lower.includes("webp")) return "webp";
  try {
    const u = new URL(fallbackUrl);
    const m = u.pathname.match(/\.(jpg|jpeg|png|webp)$/i);
    if (m) return m[1].toLowerCase().replace("jpeg", "jpg");
  } catch {}
  return "jpg";
}

function runFfmpeg(ffmpegPath, args, timeoutMs) {
  const { spawn } = require("child_process");
  return new Promise((resolve, reject) => {
    const p = spawn(ffmpegPath, args);
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

/** Reliable local-file encode — avoids ffmpeg HTTP inputs that fail on Vercel. */
function buildFfmpegArgs({ imagePath, audioPath, outPath, fps = 1 }) {
  const outFps = Math.max(1, Number(fps) || 1);
  const vf =
    `scale=${OUT_W}:${OUT_H}:force_original_aspect_ratio=increase,` +
    `crop=${OUT_W}:${OUT_H},fps=${outFps},format=yuv420p`;
  const ffArgs = [
    "-y", "-hide_banner", "-loglevel", "error", "-threads", "0",
  ];
  if (imagePath) {
    ffArgs.push("-loop", "1", "-framerate", String(outFps), "-i", imagePath);
  } else {
    ffArgs.push("-f", "lavfi", "-i", `color=c=black:s=${OUT_W}x${OUT_H}:r=${outFps}`);
  }
  ffArgs.push("-i", audioPath);
  ffArgs.push(
    "-vf", vf,
    "-c:v", "libx264",
    "-tune", "stillimage",
    "-pix_fmt", "yuv420p",
    "-preset", "ultrafast",
    "-profile:v", "baseline",
    "-c:a", "aac",
    "-b:a", "128k",
    "-ar", "44100",
    "-ac", "2",
    "-movflags", "+faststart",
    "-shortest",
    outPath,
  );
  return ffArgs;
}

module.exports = async function handler(req, res) {
  const { applyCors } = require("./_lib/cors");
  if (applyCors(req, res)) return;

  const fs = require("fs");
  const os = require("os");
  const path = require("path");

  let cleanup = [];
  const startedMs = Date.now();
  const remainingMs = (floor = 8000) =>
    Math.max(floor, TOTAL_BUDGET_MS - (Date.now() - startedMs));

  try {
    let params = {};
    if (req.method === "POST") {
      try { params = await readJsonBody(req); } catch { params = {}; }
    } else {
      try {
        const u = new URL(req.url, "http://x");
        params = {
          audioUrl: u.searchParams.get("audioUrl") || "",
          imageUrl: u.searchParams.get("imageUrl") || "",
          title: u.searchParams.get("title") || "",
          fast: u.searchParams.get("fast") || "",
        };
      } catch { params = {}; }
    }

    const audioUrl = resolveFetchUrl(String(params.audioUrl || "").trim());
    const imageUrl = String(params.imageUrl || "").trim();
    const title = String(params.title || "song").trim();
    const isFast = isFastRender(params);
    const encodeFps = isFast ? 1 : OUT_FPS;

    if (!audioUrl || !/^https?:\/\//i.test(audioUrl)) {
      res.statusCode = 400;
      res.setHeader("Content-Type", "application/json");
      res.setHeader("Cache-Control", "no-store");
      res.end(JSON.stringify({ error: audioUrl ? "Invalid audioUrl" : "Missing audioUrl" }));
      return;
    }

    let ffmpegPath = null;
    try { ffmpegPath = require("ffmpeg-static"); } catch {}
    if (!ffmpegPath) {
      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: "ffmpeg unavailable on server" }));
      return;
    }

    const safeImageUrl = imageUrl && /^https?:\/\//i.test(imageUrl) ? imageUrl : "";
    const tmpDir = os.tmpdir();
    const stamp = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const outPath = path.join(tmpDir, `nabad-vid-${stamp}.mp4`);

    const audio = await fetchToBuffer(audioUrl, MAX_AUDIO_BYTES, FAST_AUDIO_FETCH_MS);
    const audioExt = audioExtFromContentType(audio.contentType, audioUrl);
    const audioPath = path.join(tmpDir, `nabad-vid-${stamp}.${audioExt}`);
    fs.writeFileSync(audioPath, audio.buffer);
    cleanup.push(audioPath);

    let imagePath = "";
    if (safeImageUrl) {
      try {
        const image = await fetchToBuffer(safeImageUrl, MAX_IMAGE_BYTES, FAST_IMAGE_FETCH_MS);
        const imgExt = imageExtFromContentType(image.contentType, safeImageUrl);
        imagePath = path.join(tmpDir, `nabad-vid-${stamp}.${imgExt}`);
        fs.writeFileSync(imagePath, image.buffer);
        cleanup.push(imagePath);
      } catch (imgErr) {
        console.warn("[render-video] cover skipped:", imgErr?.message || imgErr);
      }
    }

    const ffBase = { audioPath, outPath, fps: encodeFps };
    const ffmpegMs = remainingMs(10000);

    try {
      await runFfmpeg(ffmpegPath, buildFfmpegArgs({ ...ffBase, imagePath }), ffmpegMs);
    } catch (firstErr) {
      if (imagePath) {
        console.warn("[render-video] encode with cover failed, retrying sound-only:", firstErr?.message || firstErr);
        await runFfmpeg(
          ffmpegPath,
          buildFfmpegArgs({ ...ffBase, imagePath: "" }),
          remainingMs(8000),
        );
      } else {
        throw firstErr;
      }
    }
    cleanup.push(outPath);

    const outStat = fs.statSync(outPath);
    if (!outStat?.size || outStat.size < 2048) {
      throw new Error("ffmpeg produced an empty video");
    }
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
  } catch (e) {
    const msg = e?.message ? String(e.message) : "render failed";
    console.error("[render-video] failed:", msg, e?.stack || "");
    const timedOut = /timed out|abort/i.test(msg);
    res.statusCode = timedOut ? 504 : 500;
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Cache-Control", "no-store");
    res.end(JSON.stringify({ error: msg }));
  } finally {
    const fs = require("fs");
    for (const f of cleanup) {
      try { fs.unlinkSync(f); } catch {}
    }
  }
};
