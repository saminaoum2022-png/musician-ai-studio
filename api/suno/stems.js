/**
 * Suno API proxy: request vocal/instrument separation.
 *
 * POST /api/suno/stems
 * Body:
 * - { taskId, audioId, type: "separate_vocal" | "split_stem" }
 * - { action:"add_instrumental", fileBase64?, audioUrl?, fileName?, fileType?, style?, title?, model? }
 *
 * Env:
 * - SUNO_API_KEY
 */

const Busboy = require("busboy");

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
      const fileBytes = body?.fileBytes || null;
      if (!fileBytes) return json(res, 400, { error: "Missing uploaded file" });
      const fileName = String(body?.fileName || "vocal-reference.webm").trim();
      const fileType = String(body?.fileType || "audio/webm").trim();
      const style = String(body?.style || "").trim();
      const prompt = String(body?.prompt || "").trim();
      const referenceMode = String(body?.referenceMode || "").trim();
      const title = String(body?.title || "").trim();
      const model = String(body?.model || "V5_5").trim();
      const vocalGender = String(body?.vocalGender || "").trim().toLowerCase();
      const voiceTimbre = String(body?.voiceTimbre || "").trim();
      const songKey = String(body?.songKey || "").trim();
      const timing = String(body?.timing || "").trim();
      const dialect = String(body?.dialect || "").trim();
      const dialectHint = String(body?.dialectHint || "").trim();
      const personaId = String(body?.personaId || "").trim();

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
      const safeModel = allowedModels.has(requestedModel) ? requestedModel : "V4_5PLUS";
      const melodyLockInstruction =
        "preserve uploaded vocal/humming melodic contour and phrase timing; keep topline and cadence points";

      // Vocal -> Full song OR Song -> Remix use upload-extend (full-song flow).
      if (referenceMode === "vocal_full" || referenceMode === "song_remix") {
        // Keep prompt strictly lyrical/content-only (no control instructions),
        // otherwise provider can sing meta instructions as lyrics.
        const cleanPrompt = String(prompt || "").trim();
        const fullPrompt = cleanPrompt;
        const voiceHint =
          vocalGender === "m" ? "male lead vocal" : vocalGender === "f" ? "female lead vocal" : "";
        const lockedStyle = [
          style,
          voiceHint,
          voiceTimbre ? `voice timbre: ${voiceTimbre}` : "",
          songKey ? `key: ${songKey}` : "",
          timing ? `timing: ${timing}` : "",
          dialect ? `dialect: ${dialect}` : "",
          dialectHint ? `dialect hint: ${dialectHint}` : "",
          melodyLockInstruction,
          referenceMode === "song_remix"
            ? "keep original topline; change arrangement/groove/harmony/instrumentation"
            : "build full arrangement around uploaded reference",
        ]
          .filter(Boolean)
          .join(", ");
        const extPayload = {
          uploadUrl,
          defaultParamFlag: true,
          model: safeModel,
          callBackUrl,
          instrumental: false,
          prompt: fullPrompt || "",
          style: lockedStyle || "melody-preserving arrangement",
          title: title || "Reference full song",
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

      // Humming -> Music uses add-instrumental (music around melody).
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
        negativeTags: "spoken word, narration, noise",
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
    const bb = Busboy({ headers: req.headers });
    const out = {};
    let fileChunks = [];
    bb.on("field", (name, val) => {
      out[name] = val;
    });
    bb.on("file", (name, file, info) => {
      const { filename, mimeType } = info || {};
      out.fileName = out.fileName || filename || "vocal-reference.webm";
      out.fileType = out.fileType || mimeType || "audio/webm";
      file.on("data", (d) => fileChunks.push(d));
    });
    bb.on("error", reject);
    bb.on("finish", () => {
      out.fileBytes = fileChunks.length ? Buffer.concat(fileChunks) : null;
      resolve(out);
    });
    req.pipe(bb);
  });
}

function readMultipartFromRaw(rawText, headers) {
  return new Promise((resolve, reject) => {
    const { Readable } = require("stream");
    const bb = Busboy({ headers });
    const out = {};
    let fileChunks = [];
    bb.on("field", (name, val) => {
      out[name] = val;
    });
    bb.on("file", (name, file, info) => {
      const { filename, mimeType } = info || {};
      out.fileName = out.fileName || filename || "vocal-reference.webm";
      out.fileType = out.fileType || mimeType || "audio/webm";
      file.on("data", (d) => fileChunks.push(d));
    });
    bb.on("error", reject);
    bb.on("finish", () => {
      out.fileBytes = fileChunks.length ? Buffer.concat(fileChunks) : null;
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
