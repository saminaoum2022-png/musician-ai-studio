/**
 * Provider-neutral vocal clone: upload a short singing/speaking sample, get back a
 * reusable provider Vocal ID that later generations can sing with.
 *
 * POST /api/music/vocal-clone?provider=mureka   (multipart: file, description?)
 *
 * Admin-only for now (MUREKA_GENERATE_ENABLED=1 opens it to everyone, same as generate).
 * Mureka needs 15–30 s of vocals (mp3/m4a, <10 MB) — shorter/longer is handled upstream.
 */
const Busboy = require("busboy");
const { verifyUser } = require("../_lib/credits-auth");
const { userIsAdmin } = require("../_lib/admin-auth");
const { applyCors } = require("../_lib/cors");
const { sendJson } = require("../_lib/suno-upstream");
const { maybeTranscodeToMp3 } = require("../_lib/transcode-mp3");
const { murekaGenerateEnabled, murekaCloneVocal, murekaUserMessage } = require("../_lib/mureka-upstream");

const MAX_UPLOAD_BYTES = 25 * 1024 * 1024; // accept generously, then transcode down
const MUREKA_MAX_BYTES = 10 * 1024 * 1024;

function resolveProvider(req) {
  try {
    const u = new URL(req.url || "/", "http://localhost");
    const p = String(u.searchParams.get("provider") || "mureka").trim().toLowerCase();
    return p === "mur" ? "mureka" : p;
  } catch {
    return "mureka";
  }
}

function readMultipart(req) {
  return new Promise((resolve, reject) => {
    const bb = Busboy({ headers: req.headers, limits: { fileSize: MAX_UPLOAD_BYTES } });
    const out = { fileBytes: null, fileName: "vocal-sample.m4a", mime: "audio/mp4", description: "" };
    const chunks = [];
    let truncated = false;
    bb.on("field", (name, val) => {
      if (name === "description") out.description = String(val || "");
    });
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

module.exports = async function handler(req, res) {
  if (applyCors(req, res)) return;
  try {
    if (req.method !== "POST") return sendJson(res, 405, { error: "Method not allowed" });

    const provider = resolveProvider(req);
    if (provider !== "mureka") {
      return sendJson(res, 400, { error: `Vocal clone is not available for provider "${provider}".`, code: "provider_unsupported" });
    }

    const apiKey = process.env.MUREKA_API_KEY || "";
    if (!apiKey) return sendJson(res, 500, { error: "Missing MUREKA_API_KEY on server" });

    const user = await verifyUser(req);
    if (!user) return sendJson(res, 401, { error: "Sign in to clone a voice." });

    const isAdmin = await userIsAdmin(user);
    if (!isAdmin && !murekaGenerateEnabled()) {
      return sendJson(res, 403, { error: "Vocal clone is admin-only on this environment.", code: "mureka_admin_only" });
    }

    const parsed = await readMultipart(req);
    let bytes = parsed.fileBytes;
    if (!bytes || bytes.length < 2048) {
      return sendJson(res, 400, { error: "Missing or empty audio sample.", code: "mureka_sample_required" });
    }

    // Normalise to mono MP3 (also strips video from camera-roll clips).
    const norm = await maybeTranscodeToMp3({ bytes, mime: parsed.mime, name: parsed.fileName });
    bytes = norm.bytes;
    if (bytes.length > MUREKA_MAX_BYTES) {
      return sendJson(res, 413, { error: "Sample is over 10 MB — use a shorter clip (15–30 seconds).", code: "mureka_sample_too_large" });
    }

    const cloned = await murekaCloneVocal({
      apiKey,
      bytes,
      mime: norm.mime || "audio/mpeg",
      fileName: norm.name || "vocal-sample.mp3",
      description: parsed.description,
    });
    if (!cloned.ok) {
      console.warn("[vocal-clone] mureka failed", cloned.error, cloned.traceId || "");
      return sendJson(res, cloned.status && cloned.status >= 400 && cloned.status < 600 ? cloned.status : 502, {
        error: murekaUserMessage(cloned.error),
        code: cloned.code || "mureka_vocal_clone_failed",
        traceId: cloned.traceId || undefined,
        // Raw upstream body helps while this is an admin-only spike.
        upstream: isAdmin ? cloned.json || undefined : undefined,
      });
    }

    return sendJson(res, 200, {
      ok: true,
      provider: "mureka",
      vocalId: cloned.vocalId,
      traceId: cloned.traceId || undefined,
      upstream: isAdmin ? cloned.json || undefined : undefined,
    });
  } catch (e) {
    return sendJson(res, 500, { error: e?.message || String(e) });
  }
};
