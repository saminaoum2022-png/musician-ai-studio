/**
 * Upload audio to Suno's temporary file store (public URL ~3 days).
 * Video files from the camera roll are transcoded to MP3 (audio only).
 */
const Busboy = require("busboy");
const { verifyUser } = require("../_lib/credits-auth");
const { applyCors } = require("../_lib/cors");
const { sendJson } = require("../_lib/suno-upstream");
const { maybeTranscodeToMp3 } = require("../_lib/transcode-mp3");

const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

module.exports = async function handler(req, res) {
  if (applyCors(req, res)) return;
  try {
    if (req.method !== "POST") return sendJson(res, 405, { error: "Method not allowed" });

    const apiKey = process.env.SUNO_API_KEY;
    if (!apiKey) return sendJson(res, 500, { error: "Missing SUNO_API_KEY on server" });

    const user = await verifyUser(req);
    if (!user) return sendJson(res, 401, { error: "Sign in to upload audio." });

    const parsed = await readMultipart(req);
    let fileBytes = parsed?.fileBytes;
    if (!fileBytes || fileBytes.length < 512) {
      return sendJson(res, 400, { error: "Missing or empty audio file" });
    }
    if (fileBytes.length > MAX_UPLOAD_BYTES) {
      return sendJson(res, 413, { error: "File too large (max 25 MB)" });
    }

    let fileName = String(parsed.fileName || "voice-upload.mp3").slice(0, 120);
    let mime = String(parsed.mime || "audio/mpeg");

    const norm = await maybeTranscodeToMp3({ bytes: fileBytes, mime, name: fileName });
    fileBytes = norm.bytes;
    mime = norm.mime;
    fileName = norm.name;

    const up = new FormData();
    up.set("file", new Blob([fileBytes], { type: mime }), fileName);
    up.set("uploadPath", "audio/user-uploads");
    up.set("fileName", fileName);

    const upRes = await fetch("https://sunoapiorg.redpandaai.co/api/file-stream-upload", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: up,
    });
    const upText = await upRes.text().catch(() => "");
    let upData = null;
    try {
      upData = JSON.parse(upText);
    } catch {
      upData = null;
    }
    if (!upRes.ok || !upData?.success || !upData?.data?.downloadUrl) {
      return sendJson(res, 502, {
        error: "Temporary audio upload failed",
        status: upRes.status || 502,
        details: upData || upText,
      });
    }

    return sendJson(res, 200, {
      downloadUrl: String(upData.data.downloadUrl),
      fileName,
      transcoded: norm.mime === "audio/mpeg",
    });
  } catch (e) {
    return sendJson(res, 500, { error: e?.message || String(e) });
  }
};

function readMultipart(req) {
  return new Promise((resolve, reject) => {
    const bb = Busboy({ headers: req.headers, limits: { fileSize: MAX_UPLOAD_BYTES } });
    const out = { fileBytes: null, fileName: "voice-upload.mp3", mime: "audio/mpeg" };
    const chunks = [];
    let truncated = false;
    bb.on("file", (_name, file, info) => {
      const { filename, mimeType } = info || {};
      if (filename) out.fileName = filename;
      if (mimeType) out.mime = mimeType;
      file.on("data", (d) => chunks.push(d));
      file.on("limit", () => {
        truncated = true;
      });
    });
    bb.on("error", reject);
    bb.on("finish", () => {
      if (truncated) return reject(new Error("File too large"));
      out.fileBytes = Buffer.concat(chunks);
      resolve(out);
    });
    req.pipe(bb);
  });
}
