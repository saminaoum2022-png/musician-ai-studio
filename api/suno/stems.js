/**
 * Suno API proxy: vocal/instrument separation, plus reference-based song generation.
 *
 * POST /api/suno/stems
 * Modes (action="add_instrumental"):
 *  - referenceMode = "vocal_full" | "vocal_cover" | "song_remix" | "song_cover"
 *      -> /api/v1/generate/upload-cover
 *      Suno analyses the uploaded melody and re-sings the user's lyrics on a NEW
 *      arrangement that follows the same melodic contour. THIS is the correct
 *      flow for "I sang/hummed something, sing my lyrics on a new song".
 *
 *  - referenceMode = "vocal_extend" | "song_extend"
 *      -> /api/v1/generate/upload-extend
 *      The upload is treated as the start of the song; Suno continues from
 *      `continueAt` onward. The original recording is preserved.
 *
 *  - referenceMode = "humming_music" | "humming_backing" | "" (default)
 *      -> /api/v1/generate/add-instrumental
 *      Suno keeps the original vocal/hum and writes a backing band around it.
 *      No new vocals are generated.
 *
 * Stems action (default when no `action` is "add_instrumental"):
 *  - { taskId, audioId, type: "separate_vocal" | "split_stem" }
 *      -> /api/v1/vocal-removal/generate
 *
 * Audio is auto-transcoded to MP3 (mono, 44.1 kHz, 192 kbps) on the server
 * when the upload is webm/opus or any non-standard format Suno may reject.
 * Requires `ffmpeg-static` to be installed; falls back to passing the
 * original bytes through if ffmpeg is unavailable.
 *
 * Env:
 * - SUNO_API_KEY
 */

const Busboy = require("busboy");

const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

module.exports = async function handler(req, res) {
  try {
    if (req.method !== "POST") return json(res, 405, { error: "Method not allowed" });

    const apiKey = process.env.SUNO_API_KEY;
    if (!apiKey) return json(res, 500, { error: "Missing SUNO_API_KEY on server" });

    const { host, proto } = getHostProto(req);
    const callBackUrl = `${proto}://${host}/api/suno/callback`;
    const contentType = String(req.headers["content-type"] || "");
    const isMultipart = contentType.toLowerCase().includes("multipart/form-data");
    let body = isMultipart ? await readMultipart(req) : await readJson(req);
    if (!isMultipart && body?._raw && String(body._raw).startsWith("--")) {
      // Some runtimes/clients may miss content-type header on forwarded multipart.
      body = await readMultipartFromRaw(body._raw, req.headers);
    }
    if (body?._parseError) {
      return json(res, 400, {
        error: "Invalid request body for /api/suno/stems",
        detailMessage: body._parseError,
      });
    }
    const action = String(body?.action || "").trim();

    if (action === "add_instrumental") {
      let fileBytes = body?.fileBytes || null;
      if (!fileBytes) return json(res, 400, { error: "Missing uploaded file" });
      if (Buffer.isBuffer(fileBytes) && fileBytes.length > MAX_UPLOAD_BYTES) {
        return json(res, 413, { error: "Audio reference is too large. Max 25 MB." });
      }
      let fileName = String(body?.fileName || "vocal-reference.webm").trim();
      let fileType = String(body?.fileType || "audio/webm").trim();

      // Convert webm/opus and other non-standard formats to MP3 so Suno
      // reliably accepts the upload and can analyse pitch/melody.
      const norm = await maybeTranscodeToMp3({ bytes: fileBytes, mime: fileType, name: fileName });
      fileBytes = norm.bytes;
      fileName = norm.name;
      fileType = norm.mime;

      const style = String(body?.style || "").trim();
      const prompt = String(body?.prompt || "").trim();
      const referenceMode = String(body?.referenceMode || "").trim().toLowerCase();
      const title = String(body?.title || "").trim();
      const model = String(body?.model || "V5_5").trim();
      const vocalGender = String(body?.vocalGender || "").trim().toLowerCase();
      const voiceTimbre = String(body?.voiceTimbre || "").trim();
      const songKey = String(body?.songKey || "").trim();
      const timing = String(body?.timing || "").trim();
      const dialect = String(body?.dialect || "").trim();
      const dialectHint = String(body?.dialectHint || "").trim();
      const personaId = String(body?.personaId || "").trim();
      const negativeTags = String(body?.negativeTags || "").trim();

      // 1) Upload file to Suno temporary file store (3-day URL)
      const up = new FormData();
      up.set("file", new Blob([fileBytes], { type: fileType }), fileName);
      up.set("uploadPath", "audio/user-uploads");
      up.set("fileName", fileName);
      const upRes = await fetch("https://sunoapiorg.redpandaai.co/api/file-stream-upload", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}` },
        body: up,
      });
      const upText = await upRes.text().catch(() => "");
      const upData = safeJson(upText);
      if (!upRes.ok || !upData?.success || !upData?.data?.downloadUrl) {
        return json(res, 502, {
          error: "Suno temporary upload failed",
          status: upRes.status || 502,
          details: upData || upText,
        });
      }
      const uploadUrl = String(upData.data.downloadUrl);

      // 2) Route by reference mode
      const requestedModel = String(model || "").trim().toUpperCase();
      const allowedModels = new Set(["V4_5PLUS", "V5", "V5_5", "V4_5ALL", "V4_5", "V4"]);
      const safeModel = allowedModels.has(requestedModel) ? requestedModel : "V5_5";

      // === Cover mode: melody-following re-sing with new lyrics & arrangement ===
      const coverModes = new Set(["vocal_full", "vocal_cover", "song_remix", "song_cover"]);
      if (coverModes.has(referenceMode)) {
        const coverPayload = {
          uploadUrl,
          customMode: true,
          instrumental: false,
          model: safeModel,
          callBackUrl,
          prompt: prompt || "",
          style: style || "",
          title: title || "Cover from reference",
          ...(negativeTags ? { negativeTags } : {}),
          ...(vocalGender === "m" || vocalGender === "f" ? { vocalGender } : {}),
          ...(personaId ? { personaId } : {}),
        };
        const coverRes = await fetch("https://api.sunoapi.org/api/v1/generate/upload-cover", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(coverPayload),
        });
        const coverText = await coverRes.text().catch(() => "");
        const coverData = safeJson(coverText);
        if (!coverRes.ok || (coverData && "code" in coverData && Number(coverData.code) !== 200)) {
          return json(res, 502, {
            error: "Upload-cover failed",
            status: coverRes.status || 502,
            details: coverData || coverText,
            uploadUrl,
          });
        }
        return json(res, 200, coverData || { raw: coverText, uploadUrl });
      }

      // === Extend mode: explicit "use upload as intro, continue from continueAt" ===
      if (referenceMode === "vocal_extend" || referenceMode === "song_extend") {
        const extPayload = {
          uploadUrl,
          defaultParamFlag: true,
          model: safeModel,
          callBackUrl,
          instrumental: false,
          prompt: prompt || "",
          style: style || "",
          title: title || "Extended from reference",
          continueAt: 1,
          ...(vocalGender === "m" || vocalGender === "f" ? { vocalGender } : {}),
          ...(personaId ? { personaId } : {}),
        };
        const extRes = await fetch("https://api.sunoapi.org/api/v1/generate/upload-extend", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(extPayload),
        });
        const extText = await extRes.text().catch(() => "");
        const extData = safeJson(extText);
        if (!extRes.ok || (extData && "code" in extData && Number(extData.code) !== 200)) {
          return json(res, 502, {
            error: "Upload-extend failed",
            status: extRes.status || 502,
            details: extData || extText,
            uploadUrl,
          });
        }
        return json(res, 200, extData || { raw: extText, uploadUrl });
      }

      // === Backing mode (humming_music / humming_backing / default): keep upload as lead, add band ===
      const instModel = ["V4_5PLUS", "V5", "V5_5"].includes(safeModel) ? safeModel : "V4_5PLUS";
      const hummingLockedTags = [
        style,
        songKey ? `key: ${songKey}` : "",
        timing ? `timing: ${timing}` : "",
        dialect ? `dialect: ${dialect}` : "",
        voiceTimbre ? `voice timbre: ${voiceTimbre}` : "",
        "follow humming contour",
        "stable phrase timing",
        "do not replace main motif",
      ]
        .filter(Boolean)
        .join(", ");
      const addPayload = {
        uploadUrl,
        title: title || "Reference instrumental",
        tags: hummingLockedTags || "instrumental, follow humming contour, stable phrase timing",
        negativeTags: negativeTags || "spoken word, narration, noise",
        callBackUrl,
        model: instModel,
        ...(vocalGender === "m" || vocalGender === "f" ? { vocalGender } : {}),
        ...(personaId ? { personaId } : {}),
      };
      const addRes = await fetch("https://api.sunoapi.org/api/v1/generate/add-instrumental", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(addPayload),
      });
      const addText = await addRes.text().catch(() => "");
      const addData = safeJson(addText);
      if (!addRes.ok || (addData && "code" in addData && Number(addData.code) !== 200)) {
        return json(res, 502, {
          error: "Add instrumental failed",
          status: addRes.status || 502,
          details: addData || addText,
          uploadUrl,
        });
      }
      return json(res, 200, addData || { raw: addText, uploadUrl });
    }

    const taskId = String(body?.taskId || "").trim();
    const audioId = String(body?.audioId || "").trim();
    const type = body?.type === "split_stem" ? "split_stem" : "separate_vocal";
    if (!taskId || !audioId) return json(res, 400, { error: "Missing taskId or audioId" });

    const payload = { taskId, audioId, type, callBackUrl };

    const r = await fetch("https://api.sunoapi.org/api/v1/vocal-removal/generate", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const text = await r.text().catch(() => "");
    const data = safeJson(text);
    if (!r.ok) {
      return json(res, 502, { error: "Upstream Suno error", status: r.status, details: data || text });
    }
    if (data && typeof data === "object" && "code" in data && data.code !== 200) {
      return json(res, 502, { error: "Suno rejected request", details: data });
    }
    return json(res, 200, data || { raw: text });
  } catch (e) {
    return json(res, 500, { error: e?.message || String(e) });
  }
};

// === helpers ===

async function maybeTranscodeToMp3({ bytes, mime, name }) {
  let ffmpegPath = null;
  try {
    ffmpegPath = require("ffmpeg-static");
  } catch {
    return { bytes, mime, name };
  }
  if (!ffmpegPath) return { bytes, mime, name };

  const lowerMime = String(mime || "").toLowerCase();
  const lowerName = String(name || "").toLowerCase();
  const ext = lowerName.includes(".") ? lowerName.split(".").pop() : "";
  const acceptableMime = /^audio\/(mpeg|mp3|wav|x-wav|wave|mp4|m4a|aac|flac|x-flac)$/.test(lowerMime);
  const acceptableExt = ["mp3", "wav", "m4a", "aac", "flac"].includes(ext);
  // Suno's pitch/melody analysis is most reliable on mp3/wav/m4a/aac/flac.
  // Anything else (notably webm/opus from MediaRecorder) is transcoded.
  if (acceptableMime || acceptableExt) return { bytes, mime, name };

  const { spawn } = require("child_process");
  const fs = require("fs");
  const os = require("os");
  const path = require("path");
  const tmpDir = os.tmpdir();
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const inPath = path.join(tmpDir, `nabad-in-${stamp}.${ext || "webm"}`);
  const outPath = path.join(tmpDir, `nabad-out-${stamp}.mp3`);
  try {
    fs.writeFileSync(inPath, Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes));
    await new Promise((resolve, reject) => {
      const p = spawn(ffmpegPath, [
        "-y",
        "-i", inPath,
        "-vn",
        "-ac", "1",
        "-ar", "44100",
        "-b:a", "192k",
        outPath,
      ]);
      let stderr = "";
      p.stderr.on("data", (d) => (stderr += d.toString()));
      p.on("error", reject);
      p.on("close", (code) =>
        code === 0
          ? resolve()
          : reject(new Error(`ffmpeg exit ${code}: ${stderr.slice(0, 240)}`))
      );
    });
    const out = fs.readFileSync(outPath);
    const newName = (name || "vocal").replace(/\.[^.]+$/, "") + ".mp3";
    return { bytes: out, mime: "audio/mpeg", name: newName };
  } catch {
    // Graceful fallback: send original bytes; Suno may still accept them.
    return { bytes, mime, name };
  } finally {
    try { fs.unlinkSync(inPath); } catch {}
    try { fs.unlinkSync(outPath); } catch {}
  }
}

function getHostProto(req) {
  const host = req.headers["x-forwarded-host"] || req.headers.host || "localhost";
  const proto = req.headers["x-forwarded-proto"] || "https";
  return { host, proto };
}

function json(res, status, obj) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(obj));
}

async function readJson(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch (e) {
    return { _parseError: e?.message || "Invalid JSON", _raw: raw };
  }
}

function readMultipart(req) {
  return new Promise((resolve, reject) => {
    const bb = Busboy({ headers: req.headers, limits: { fileSize: MAX_UPLOAD_BYTES } });
    const out = {};
    let fileChunks = [];
    let truncated = false;
    bb.on("field", (name, val) => {
      out[name] = val;
    });
    bb.on("file", (name, file, info) => {
      const { filename, mimeType } = info || {};
      out.fileName = out.fileName || filename || "vocal-reference.webm";
      out.fileType = out.fileType || mimeType || "audio/webm";
      file.on("data", (d) => fileChunks.push(d));
      file.on("limit", () => {
        truncated = true;
      });
    });
    bb.on("error", reject);
    bb.on("finish", () => {
      out.fileBytes = fileChunks.length ? Buffer.concat(fileChunks) : null;
      out._truncated = truncated;
      resolve(out);
    });
    req.pipe(bb);
  });
}

function readMultipartFromRaw(rawText, headers) {
  return new Promise((resolve, reject) => {
    const { Readable } = require("stream");
    const bb = Busboy({ headers, limits: { fileSize: MAX_UPLOAD_BYTES } });
    const out = {};
    let fileChunks = [];
    let truncated = false;
    bb.on("field", (name, val) => {
      out[name] = val;
    });
    bb.on("file", (name, file, info) => {
      const { filename, mimeType } = info || {};
      out.fileName = out.fileName || filename || "vocal-reference.webm";
      out.fileType = out.fileType || mimeType || "audio/webm";
      file.on("data", (d) => fileChunks.push(d));
      file.on("limit", () => {
        truncated = true;
      });
    });
    bb.on("error", reject);
    bb.on("finish", () => {
      out.fileBytes = fileChunks.length ? Buffer.concat(fileChunks) : null;
      out._truncated = truncated;
      resolve(out);
    });
    const stream = Readable.from(Buffer.from(rawText, "utf8"));
    stream.pipe(bb);
  });
}

function safeJson(txt) {
  try {
    return JSON.parse(txt);
  } catch {
    return null;
  }
}
