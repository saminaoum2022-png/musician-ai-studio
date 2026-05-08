// Render a "song video" on the fly: still cover image + audio = mp4.
// Used by the Download Video button so the user can save and share their
// song as a single file (most chat apps + social platforms accept mp4
// directly, unlike a bare audio URL).
//
// GET  /api/render-video?audioUrl=...&imageUrl=...&title=...
// POST /api/render-video  { audioUrl, imageUrl, title }
//
// Streaming the mp4 back via res.end(buffer). For songs >5 min the
// encode time may approach Vercel's 60s ceiling; we cap input fetch to
// 25s and keep the encode at -preset ultrafast for headroom.
//
// Requires ffmpeg-static to be packaged with the function (see
// vercel.json `includeFiles`).

const MAX_AUDIO_BYTES = 60 * 1024 * 1024; // 60MB — way more than any song
const MAX_IMAGE_BYTES = 12 * 1024 * 1024; // 12MB — covers any reasonable cover
const FETCH_TIMEOUT_MS = 25000;

function sanitizeFilename(name) {
  const trimmed = String(name || "song").trim();
  // Strip filesystem-hostile chars; keep unicode (titles often have it).
  return trimmed
    .replace(/[\\/:*?"<>|\u0000-\u001F]/g, "")
    .replace(/\s+/g, " ")
    .slice(0, 80) || "song";
}

async function fetchToBuffer(url, maxBytes) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const r = await fetch(url, { signal: ctrl.signal, redirect: "follow" });
    clearTimeout(timer);
    if (!r.ok) throw new Error(`fetch ${r.status} ${r.statusText}`);
    const len = Number(r.headers.get("content-length") || 0);
    if (len && len > maxBytes) throw new Error(`asset too large (${len} bytes)`);
    const ab = await r.arrayBuffer();
    if (ab.byteLength > maxBytes) throw new Error(`asset too large (${ab.byteLength} bytes)`);
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
  if (lower.includes("flac")) return "flac";
  if (lower.includes("ogg")) return "ogg";
  if (lower.includes("webm")) return "webm";
  // Fall back to URL extension
  try {
    const u = new URL(fallbackUrl);
    const m = u.pathname.match(/\.(mp3|m4a|aac|wav|flac|ogg|webm)$/i);
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

module.exports = async function handler(req, res) {
  const fs = require("fs");
  const os = require("os");
  const path = require("path");

  let cleanup = [];
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
        };
      } catch { params = {}; }
    }

    const audioUrl = String(params.audioUrl || "").trim();
    const imageUrl = String(params.imageUrl || "").trim();
    const title = String(params.title || "song").trim();
    if (!audioUrl) {
      res.statusCode = 400;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: "Missing audioUrl" }));
      return;
    }
    // Node's fetch only handles http/https. A blob:, data:, or relative URL
    // would otherwise crash with a vague "Failed to parse URL" message.
    if (!/^https?:\/\//i.test(audioUrl)) {
      res.statusCode = 400;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({
        error: `audioUrl must be http(s). Got: ${audioUrl.slice(0, 40)}…`,
      }));
      return;
    }
    // Image is optional. Drop any non-http(s) imageUrl so the render
    // falls back to a black background instead of failing the whole job.
    const safeImageUrl = imageUrl && /^https?:\/\//i.test(imageUrl) ? imageUrl : "";

    let ffmpegPath = null;
    try { ffmpegPath = require("ffmpeg-static"); } catch {}
    if (!ffmpegPath) {
      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: "ffmpeg unavailable on server" }));
      return;
    }

    // Pull both assets in parallel. Image is optional — if it fails or
    // the URL is empty, we render with a solid black background instead.
    const audioPromise = fetchToBuffer(audioUrl, MAX_AUDIO_BYTES);
    const imagePromise = safeImageUrl
      ? fetchToBuffer(safeImageUrl, MAX_IMAGE_BYTES).catch(() => null)
      : Promise.resolve(null);
    const [audio, image] = await Promise.all([audioPromise, imagePromise]);

    const tmpDir = os.tmpdir();
    const stamp = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const audioExt = audioExtFromContentType(audio.contentType, audioUrl);
    const audioPath = path.join(tmpDir, `nabad-vid-${stamp}.${audioExt}`);
    const outPath = path.join(tmpDir, `nabad-vid-${stamp}.mp4`);
    fs.writeFileSync(audioPath, audio.buffer);
    cleanup.push(audioPath);

    let imagePath = "";
    if (image) {
      const imgExt = imageExtFromContentType(image.contentType, safeImageUrl);
      imagePath = path.join(tmpDir, `nabad-vid-${stamp}.${imgExt}`);
      fs.writeFileSync(imagePath, image.buffer);
      cleanup.push(imagePath);
    }

    // 1080x1080 square output. Pad with black if cover isn't square (most
    // covers ARE square, but Suno occasionally returns 16:9 thumbnails).
    // -preset ultrafast keeps us under Vercel's function timeout.
    // -shortest stops video when audio ends.
    // -tune stillimage optimises for a single-frame source.
    const ffArgs = [
      "-y",
      "-hide_banner",
      "-loglevel",
      "error",
    ];
    if (imagePath) {
      ffArgs.push("-loop", "1", "-i", imagePath);
    } else {
      // No image — generate a solid black 1080x1080 source.
      ffArgs.push(
        "-f", "lavfi",
        "-i", "color=c=black:s=1080x1080:r=1",
      );
    }
    ffArgs.push(
      "-i", audioPath,
      "-map", "0:v:0",
      "-map", "1:a:0",
      "-c:v", "libx264",
      "-tune", "stillimage",
      "-pix_fmt", "yuv420p",
      "-preset", "ultrafast",
      "-r", "1",
      "-vf", "scale=1080:1080:force_original_aspect_ratio=decrease,pad=1080:1080:(ow-iw)/2:(oh-ih)/2:color=black",
      "-c:a", "aac",
      "-b:a", "192k",
      "-movflags", "+faststart",
      "-shortest",
      outPath,
    );

    await runFfmpeg(ffmpegPath, ffArgs);
    cleanup.push(outPath);

    const out = fs.readFileSync(outPath);
    const filename = `${sanitizeFilename(title)}.mp4`;

    res.statusCode = 200;
    res.setHeader("Content-Type", "video/mp4");
    res.setHeader("Content-Length", String(out.length));
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
    );
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.end(out);
  } catch (e) {
    const msg = e?.message ? String(e.message) : "render failed";
    console.error("[render-video] failed:", msg, e?.stack || "");
    res.statusCode = 500;
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
