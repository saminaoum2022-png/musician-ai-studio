/**
 * Transcode uploads to mono MP3 (strips video tracks from phone videos).
 */
const { spawn } = require("child_process");

function guessInputExt(lowerMime, lowerName) {
  const fromName =
    lowerName.includes(".") && !lowerName.endsWith(".")
      ? lowerName.slice(lowerName.lastIndexOf(".") + 1)
      : "";
  if (["mp3", "wav", "m4a", "aac", "flac", "webm", "ogg", "opus", "mp4", "mov", "mkv"].includes(fromName)) {
    return fromName === "mov" || fromName === "mkv" ? "mp4" : fromName;
  }
  if (/video|mp4|quicktime|mov/.test(lowerMime)) return "mp4";
  if (/webm/.test(lowerMime)) return "webm";
  if (/ogg|opus/.test(lowerMime)) return "ogg";
  if (/mpeg|mp3/.test(lowerMime)) return "mp3";
  if (/wav|wave|x-wav/.test(lowerMime)) return "wav";
  if (/m4a|mp4|aac/.test(lowerMime)) return "m4a";
  if (/flac/.test(lowerMime)) return "flac";
  return "mp4";
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
      else reject(new Error(`ffmpeg exit ${code}: ${stderr.slice(0, 400)}`));
    });
  });
}

/** @returns {{ bytes: Buffer, mime: string, name: string }} */
async function maybeTranscodeToMp3({ bytes, mime, name }) {
  let ffmpegPath = null;
  try {
    ffmpegPath = require("ffmpeg-static");
  } catch {
    return { bytes, mime, name };
  }
  if (!ffmpegPath) return { bytes, mime, name };

  const fs = require("fs");
  const os = require("os");
  const path = require("path");

  const lowerMime = String(mime || "").toLowerCase();
  const lowerName = String(name || "").toLowerCase();
  const ext = guessInputExt(lowerMime, lowerName);
  const isAlreadyMp3 =
    ext === "mp3" && /mpeg|mp3/.test(lowerMime) && !/video/.test(lowerMime);

  const tmpDir = os.tmpdir();
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const inPath = path.join(tmpDir, `nabad-in-${stamp}.${ext}`);
  const outPath = path.join(tmpDir, `nabad-out-${stamp}.mp3`);

  const buf = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
  const mp3Name = `${String(name || "audio").replace(/\.[^.]+$/, "")}.mp3`;

  if (isAlreadyMp3 && buf.length >= 2048) {
    return { bytes: buf, mime: "audio/mpeg", name: mp3Name };
  }

  try {
    fs.writeFileSync(inPath, buf);
    await runFfmpeg(ffmpegPath, [
      "-y",
      "-hide_banner",
      "-loglevel",
      "error",
      "-i",
      inPath,
      "-vn",
      "-ac",
      "1",
      "-ar",
      "44100",
      "-c:a",
      "libmp3lame",
      "-b:a",
      "192k",
      outPath,
    ]);
    const out = fs.readFileSync(outPath);
    if (!out || out.length < 512) throw new Error("transcode output too short");
    return { bytes: out, mime: "audio/mpeg", name: mp3Name };
  } catch {
    return { bytes: buf, mime, name };
  } finally {
    try {
      fs.unlinkSync(inPath);
    } catch {}
    try {
      fs.unlinkSync(outPath);
    } catch {}
  }
}

module.exports = { maybeTranscodeToMp3, guessInputExt };
