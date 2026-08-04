// Render a "song video" on the fly: cover image + audio = mp4.
// Used by the Download Video button so the user can save and share their
// song as a single file (chat apps + social accept mp4 directly).
//
// GET  /api/render-video?audioUrl=...&imageUrl=...&title=...&fast=1
// POST /api/render-video  { audioUrl, imageUrl, title, lyrics?, fast? }
//   lyrics: [{ text, startS, endS }] — optional synced lines burned into the export
//
// Output is 9:16 (720×1280). Fast mode (default): 1fps, no lyrics, tight timeouts
// so the whole pipeline fits Vercel's 60s limit. Archived Supabase audio URLs are
// fed directly into ffmpeg (no full-file download on the server).
//
// Requires ffmpeg-static (see vercel.json `includeFiles`).

const MAX_AUDIO_BYTES = 60 * 1024 * 1024;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const TOTAL_BUDGET_MS = 55000;
const FAST_AUDIO_FETCH_MS = 18000;
const FAST_IMAGE_FETCH_MS = 6000;
const SLOW_AUDIO_FETCH_MS = 35000;
const SLOW_IMAGE_FETCH_MS = 12000;
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
  if (v === "1" || v === true || v === 1) return true;
  // Default fast — mobile exports need to finish inside 60s.
  return true;
}

function isArchivedStorageUrl(url) {
  return /\/storage\/v1\/object\/public\/song_archive\//i.test(String(url || ""));
}

function isSupabasePublicObjectUrl(url) {
  return /\/storage\/v1\/object\/public\//i.test(String(url || ""));
}

/** Unwrap nested `/api/suno/audio?url=…` so we fetch Suno directly (one hop). */
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

function ffmpegInputHeaders() {
  return "User-Agent: Mozilla/5.0 (compatible; NabadAi/1.0)\r\n";
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

function secondsToAssTime(s) {
  const sec = Math.max(0, Number(s) || 0);
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const ss = Math.floor(sec % 60);
  const cs = Math.min(99, Math.floor((sec % 1) * 100));
  return `${h}:${String(m).padStart(2, "0")}:${String(ss).padStart(2, "0")}.${String(cs).padStart(2, "0")}`;
}

function escapeAssText(text) {
  return String(text || "")
    .replace(/\\/g, "\\\\")
    .replace(/\{/g, "\\{")
    .replace(/\}/g, "\\}")
    .replace(/\n/g, "\\N");
}

function normalizeLyricLines(raw) {
  if (!Array.isArray(raw)) return [];
  const lines = raw
    .map((row) => ({
      text: String(row?.text || "").trim(),
      startS: Number(row?.startS ?? row?.start_s ?? 0),
      endS: Number(row?.endS ?? row?.end_s ?? 0),
    }))
    .filter((row) => row.text)
    .slice(0, 120);
  for (let i = 0; i < lines.length; i++) {
    const cur = lines[i];
    const next = lines[i + 1];
    if (next) cur.endS = Math.max(cur.endS, next.startS);
    else cur.endS = Math.max(cur.endS, cur.startS + 2.5);
    if (cur.endS <= cur.startS) cur.endS = cur.startS + 1.5;
  }
  return lines;
}

/** ASS styled like in-player karaoke: white current line, soft outline, lower third. */
function buildAssFromLyricLines(lines) {
  const events = lines
    .map(
      (line) =>
        `Dialogue: 0,${secondsToAssTime(line.startS)},${secondsToAssTime(line.endS)},Current,,0,0,0,,${escapeAssText(line.text)}`,
    )
    .join("\n");
  return `[Script Info]
ScriptType: v4.00+
PlayResX: ${OUT_W}
PlayResY: ${OUT_H}
WrapStyle: 0
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Current,DejaVu Sans,54,&H00FFFFFF,&H000000FF,&H64000000,&H80000000,1,0,0,0,100,100,0,0,1,3,0,2,48,48,220,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
${events}
`;
}

function ffmpegEscapeFilterPath(filePath) {
  return String(filePath || "")
    .replace(/\\/g, "/")
    .replace(/:/g, "\\:")
    .replace(/'/g, "'\\''");
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
      try {
        p.kill("SIGKILL");
      } catch {}
      reject(new Error(`ffmpeg timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    p.stderr.on("data", (d) => {
      stderr += d.toString();
    });
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

function buildFfmpegArgs({
  imagePath,
  imageUrl,
  audioPath,
  audioUrl,
  assPath,
  outPath,
  fps = OUT_FPS,
}) {
  const outFps = Math.max(1, Number(fps) || OUT_FPS);
  const scaleCrop =
    `scale=${OUT_W}:${OUT_H}:force_original_aspect_ratio=increase,` +
    `crop=${OUT_W}:${OUT_H}:(iw-ow)/2:0,fps=${outFps},format=yuv420p`;
  const vchain = assPath
    ? `${scaleCrop},subtitles='${ffmpegEscapeFilterPath(assPath)}':force_style='FontName=DejaVu Sans'`
    : scaleCrop;

  const ffArgs = [
    "-y",
    "-hide_banner",
    "-loglevel",
    "error",
    "-threads",
    "0",
    "-fflags",
    "+genpts",
  ];
  const hdr = ffmpegInputHeaders();

  if (imagePath) {
    ffArgs.push("-loop", "1", "-framerate", String(outFps), "-i", imagePath);
  } else if (imageUrl) {
    ffArgs.push("-headers", hdr, "-loop", "1", "-framerate", String(outFps), "-i", imageUrl);
  } else {
    ffArgs.push(
      "-f", "lavfi",
      "-i", `color=c=black:s=${OUT_W}x${OUT_H}:r=${outFps}`,
    );
  }

  if (audioPath) {
    ffArgs.push("-i", audioPath);
  } else if (audioUrl) {
    ffArgs.push("-headers", hdr, "-i", audioUrl);
  } else {
    throw new Error("missing audio input");
  }

  ffArgs.push(
    "-filter_complex",
    `[0:v]${vchain}[v];[1:a]aformat=sample_fmts=fltp:channel_layouts=stereo,aresample=async=1:first_pts=0[a]`,
    "-map", "[v]",
    "-map", "[a]",
    "-c:v", "libx264",
    "-tune", "stillimage",
    "-pix_fmt", "yuv420p",
    "-preset", "ultrafast",
    "-profile:v", "baseline",
    "-level", "3.1",
    "-r", String(outFps),
    "-c:a", "aac",
    "-profile:a", "aac_low",
    "-b:a", "128k",
    "-ar", "44100",
    "-ac", "2",
    "-movflags", "+faststart",
    "-shortest",
    outPath,
  );
  return ffArgs;
}

function lyricsBurnLikelyFailed(err) {
  const msg = String(err?.message || err || "").toLowerCase();
  return /subtitle|ass|libass|font|ffmpeg exit/i.test(msg);
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
    const lyricLines = isFast ? [] : normalizeLyricLines(params.lyrics);

    if (!audioUrl) {
      res.statusCode = 400;
      res.setHeader("Content-Type", "application/json");
      res.setHeader("Cache-Control", "no-store");
      res.end(JSON.stringify({ error: "Missing audioUrl" }));
      return;
    }
    if (!/^https?:\/\//i.test(audioUrl)) {
      res.statusCode = 400;
      res.setHeader("Content-Type", "application/json");
      res.setHeader("Cache-Control", "no-store");
      res.end(JSON.stringify({
        error: `audioUrl must be http(s). Got: ${audioUrl.slice(0, 40)}…`,
      }));
      return;
    }
    const safeImageUrl = imageUrl && /^https?:\/\//i.test(imageUrl) ? imageUrl : "";

    let ffmpegPath = null;
    try { ffmpegPath = require("ffmpeg-static"); } catch {}
    if (!ffmpegPath) {
      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json");
      res.setHeader("Cache-Control", "no-store");
      res.end(JSON.stringify({ error: "ffmpeg unavailable on server" }));
      return;
    }

    const tmpDir = os.tmpdir();
    const stamp = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const outPath = path.join(tmpDir, `nabad-vid-${stamp}.mp4`);

    // Archived Supabase audio → ffmpeg reads URL directly (saves 20–40s vs buffer-then-encode).
    const useDirectAudio = isArchivedStorageUrl(audioUrl);
    let audioPath = "";
    let directAudioUrl = "";

    if (useDirectAudio) {
      directAudioUrl = audioUrl;
    } else {
      const fetchMs = isFast ? FAST_AUDIO_FETCH_MS : SLOW_AUDIO_FETCH_MS;
      const audio = await fetchToBuffer(audioUrl, MAX_AUDIO_BYTES, fetchMs);
      const audioExt = audioExtFromContentType(audio.contentType, audioUrl);
      audioPath = path.join(tmpDir, `nabad-vid-${stamp}.${audioExt}`);
      fs.writeFileSync(audioPath, audio.buffer);
      cleanup.push(audioPath);
    }

    let imagePath = "";
    let directImageUrl = "";
    if (safeImageUrl) {
      const imgFetchMs = isFast ? FAST_IMAGE_FETCH_MS : SLOW_IMAGE_FETCH_MS;
      const canDirectImage = isSupabasePublicObjectUrl(safeImageUrl);
      if (canDirectImage && isFast) {
        directImageUrl = safeImageUrl;
      } else {
        try {
          const image = await fetchToBuffer(safeImageUrl, MAX_IMAGE_BYTES, imgFetchMs);
          const imgExt = imageExtFromContentType(image.contentType, safeImageUrl);
          imagePath = path.join(tmpDir, `nabad-vid-${stamp}.${imgExt}`);
          fs.writeFileSync(imagePath, image.buffer);
          cleanup.push(imagePath);
        } catch (imgErr) {
          console.warn("[render-video] cover fetch skipped:", imgErr?.message || imgErr);
        }
      }
    }

    let assPath = "";
    if (lyricLines.length) {
      assPath = path.join(tmpDir, `nabad-vid-${stamp}.ass`);
      fs.writeFileSync(assPath, buildAssFromLyricLines(lyricLines), "utf8");
      cleanup.push(assPath);
    }

    const ffBase = {
      imagePath,
      imageUrl: directImageUrl,
      audioPath,
      audioUrl: directAudioUrl,
      outPath,
      fps: encodeFps,
    };
    let burnedLyrics = false;
    const ffmpegMs = remainingMs(useDirectAudio ? 12000 : 10000);

    try {
      await runFfmpeg(ffmpegPath, buildFfmpegArgs({ ...ffBase, assPath }), ffmpegMs);
      burnedLyrics = Boolean(assPath);
    } catch (firstErr) {
      if (assPath && lyricsBurnLikelyFailed(firstErr)) {
        console.warn("[render-video] lyric burn failed, retrying without subtitles:", firstErr?.message || firstErr);
        await runFfmpeg(
          ffmpegPath,
          buildFfmpegArgs({ ...ffBase, assPath: "" }),
          remainingMs(8000),
        );
      } else if (directAudioUrl && /ffmpeg exit|timed out/i.test(String(firstErr?.message || ""))) {
        // Direct URL failed (rare) — fall back to one buffered fetch if time remains.
        console.warn("[render-video] direct audio failed, buffering:", firstErr?.message || firstErr);
        const audio = await fetchToBuffer(audioUrl, MAX_AUDIO_BYTES, remainingMs(10000));
        const audioExt = audioExtFromContentType(audio.contentType, audioUrl);
        audioPath = path.join(tmpDir, `nabad-vid-${stamp}-fb.${audioExt}`);
        fs.writeFileSync(audioPath, audio.buffer);
        cleanup.push(audioPath);
        await runFfmpeg(
          ffmpegPath,
          buildFfmpegArgs({ ...ffBase, audioPath, audioUrl: "", assPath: "" }),
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
    res.setHeader("X-Nabad-Video-Has-Lyrics", burnedLyrics ? "1" : "0");
    if (isFast) res.setHeader("X-Nabad-Video-Fast", "1");
    if (useDirectAudio) res.setHeader("X-Nabad-Video-Direct-Audio", "1");

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
    const timedOut = /timed out|abort|504/i.test(msg);
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
