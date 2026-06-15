/**
 * Portrait lyric video: full-bleed cover + burned-in synced lyrics (ASS).
 *
 * POST /api/music/lyric-video
 *   { audioUrl, imageUrl?, title, taskId, audioId, author? }
 *   <- video/mp4
 *
 * Provider-neutral path; lyrics fetched from Suno upstream server-side.
 */
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");

const { verifyUser } = require("../_lib/credits-auth");
const { applyCors } = require("../_lib/cors");
const { readJson, sendJson, sunoJsonRequest } = require("../_lib/suno-upstream");
const { buildAssSubtitleFile } = require("../_lib/lyric-video-ass");

const MAX_AUDIO_BYTES = 60 * 1024 * 1024;
const MAX_IMAGE_BYTES = 12 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 25000;
const OUT_W = 1080;
const OUT_H = 1920;

const FONT_SRC = path.join(__dirname, "..", "_lib", "fonts", "NotoSansArabic-Regular.ttf");

function sanitizeFilename(name) {
  const trimmed = String(name || "song").trim();
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
  return new Promise((resolve, reject) => {
    const p = spawn(ffmpegPath, args);
    let stderr = "";
    p.stderr.on("data", (d) => {
      stderr += d.toString();
    });
    p.on("error", reject);
    p.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exit ${code}: ${stderr.slice(0, 800)}`));
    });
  });
}

async function fetchAlignedWords(taskId, audioId, apiKey) {
  const upstream = await sunoJsonRequest("/api/v1/generate/get-timestamped-lyrics", {
    method: "POST",
    apiKey,
    body: { taskId, audioId },
  });
  const d = upstream.data?.data || {};
  const words = Array.isArray(d.alignedWords) ? d.alignedWords : [];
  if (!upstream.ok || !words.length) {
    const msg = upstream.data?.msg || upstream.data?.message || "No synced lyrics for this track";
    throw new Error(String(msg).slice(0, 240));
  }
  return words
    .map((w) => ({
      word: String(w?.word ?? ""),
      startS: Number(w?.startS ?? w?.start_s ?? 0),
      endS: Number(w?.endS ?? w?.end_s ?? 0),
      success: w?.success !== false,
    }))
    .filter((w) => w.word !== "");
}

module.exports = async function handler(req, res) {
  if (applyCors(req, res)) return;

  const cleanup = [];
  try {
    if (req.method !== "POST") return sendJson(res, 405, { error: "Method not allowed" });

    const apiKey = process.env.SUNO_API_KEY;
    if (!apiKey) return sendJson(res, 500, { error: "Missing SUNO_API_KEY on server" });

    const user = await verifyUser(req);
    if (!user) return sendJson(res, 401, { error: "Sign in to create a lyric video." });

    const body = await readJson(req);
    const audioUrl = String(body?.audioUrl || "").trim();
    const imageUrl = String(body?.imageUrl || "").trim();
    const title = String(body?.title || "song").trim();
    const taskId = String(body?.taskId || "").trim();
    const audioId = String(body?.audioId || "").trim();
    const author = String(body?.author || "").trim().replace(/^@+/, "").slice(0, 50);

    if (!audioUrl) return sendJson(res, 400, { error: "Missing audioUrl" });
    if (!/^https?:\/\//i.test(audioUrl)) {
      return sendJson(res, 400, { error: "audioUrl must be http(s)" });
    }
    if (!taskId || !audioId) {
      return sendJson(res, 400, { error: "Lyric videos need the song's taskId and audioId." });
    }

    const safeImageUrl = imageUrl && /^https?:\/\//i.test(imageUrl) ? imageUrl : "";

    let ffmpegPath = null;
    try {
      ffmpegPath = require("ffmpeg-static");
    } catch {}
    if (!ffmpegPath) return sendJson(res, 500, { error: "ffmpeg unavailable on server" });
    if (!fs.existsSync(FONT_SRC)) {
      return sendJson(res, 500, { error: "Subtitle font missing on server" });
    }

    const words = await fetchAlignedWords(taskId, audioId, apiKey);
    const assContent = buildAssSubtitleFile(words, {
      width: OUT_W,
      height: OUT_H,
      title,
      author,
    });

    const audioPromise = fetchToBuffer(audioUrl, MAX_AUDIO_BYTES);
    const imagePromise = safeImageUrl
      ? fetchToBuffer(safeImageUrl, MAX_IMAGE_BYTES).catch(() => null)
      : Promise.resolve(null);
    const [audio, image] = await Promise.all([audioPromise, imagePromise]);

    const tmpDir = os.tmpdir();
    const stamp = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const audioExt = audioExtFromContentType(audio.contentType, audioUrl);
    const audioPath = path.join(tmpDir, `nabad-lyric-${stamp}.${audioExt}`);
    const assPath = path.join(tmpDir, `nabad-lyric-${stamp}.ass`);
    const fontDir = path.join(tmpDir, `nabad-lyric-fonts-${stamp}`);
    const outPath = path.join(tmpDir, `nabad-lyric-${stamp}.mp4`);

    fs.writeFileSync(audioPath, audio.buffer);
    fs.writeFileSync(assPath, assContent, "utf8");
    fs.mkdirSync(fontDir, { recursive: true });
    fs.copyFileSync(FONT_SRC, path.join(fontDir, "NotoSansArabic-Regular.ttf"));
    cleanup.push(audioPath, assPath, fontDir, outPath);

    let imagePath = "";
    if (image) {
      const imgExt = imageExtFromContentType(image.contentType, safeImageUrl);
      imagePath = path.join(tmpDir, `nabad-lyric-${stamp}.${imgExt}`);
      fs.writeFileSync(imagePath, image.buffer);
      cleanup.push(imagePath);
    }

    const assEsc = assPath.replace(/\\/g, "/").replace(/:/g, "\\:").replace(/'/g, "\\'");
    const fontEsc = fontDir.replace(/\\/g, "/").replace(/:/g, "\\:").replace(/'/g, "\\'");
    const vf = imagePath
      ? `scale=${OUT_W}:${OUT_H}:force_original_aspect_ratio=increase,crop=${OUT_W}:${OUT_H},setsar=1,ass='${assEsc}':fontsdir='${fontEsc}'`
      : `scale=${OUT_W}:${OUT_H},setsar=1,ass='${assEsc}':fontsdir='${fontEsc}'`;

    const ffArgs = [
      "-y",
      "-hide_banner",
      "-loglevel",
      "error",
      "-threads",
      "0",
    ];
    if (imagePath) {
      ffArgs.push("-loop", "1", "-i", imagePath);
    } else {
      ffArgs.push("-f", "lavfi", "-i", `color=c=black:s=${OUT_W}x${OUT_H}:r=1`);
    }
    ffArgs.push(
      "-i",
      audioPath,
      "-map",
      "0:v:0",
      "-map",
      "1:a:0",
      "-c:v",
      "libx264",
      "-tune",
      "stillimage",
      "-pix_fmt",
      "yuv420p",
      "-preset",
      "ultrafast",
      "-r",
      "1",
      "-vf",
      vf,
      "-c:a",
      "aac",
      "-b:a",
      "160k",
      "-movflags",
      "+faststart",
      "-shortest",
      outPath
    );

    await runFfmpeg(ffmpegPath, ffArgs);

    const out = fs.readFileSync(outPath);
    const filename = `${sanitizeFilename(title)}-lyric-video.mp4`;

    res.statusCode = 200;
    res.setHeader("Content-Type", "video/mp4");
    res.setHeader("Content-Length", String(out.length));
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`
    );
    res.setHeader("Cache-Control", "no-store");
    res.end(out);
  } catch (e) {
    const msg = e?.message ? String(e.message) : "lyric video render failed";
    console.error("[lyric-video] failed:", msg, e?.stack || "");
    return sendJson(res, 500, { error: msg });
  } finally {
    for (const f of cleanup) {
      try {
        if (fs.existsSync(f)) {
          const st = fs.statSync(f);
          if (st.isDirectory()) fs.rmSync(f, { recursive: true, force: true });
          else fs.unlinkSync(f);
        }
      } catch {}
    }
  }
};
