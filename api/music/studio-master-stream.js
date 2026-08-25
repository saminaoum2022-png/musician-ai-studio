/**
 * GET /api/music/studio-master-stream?task=<id>&token=<jobToken>
 * Streams the 30s Pro Master preview for native <audio> (no Authorization header).
 */
const { applyCors } = require("../_lib/cors");
const { sendJson } = require("../_lib/credits-auth");
const { verifyJobToken } = require("../_lib/studio-master-job");
const { fetchPreviewAudioBuffer, fetchPreviewAudioBufferQuick, downloadRoexPreviewUrl } = require("../_lib/roex-upstream");

module.exports = async function handler(req, res) {
  if (applyCors(req, res)) return;
  if (req.method !== "GET") return sendJson(res, 405, { error: "Method not allowed" });

  try {
    const urlObj = new URL(req.url, "http://localhost");
    const masteringTaskId = String(urlObj.searchParams.get("task") || "").trim();
    const jobToken = String(urlObj.searchParams.get("token") || "").trim();
    if (!masteringTaskId || !jobToken) {
      return sendJson(res, 400, { error: "Missing preview parameters.", code: "missing_params" });
    }

    const tokenOk = verifyJobToken(jobToken, { masteringTaskId });
    if (!tokenOk) {
      return sendJson(res, 403, { error: "Invalid or expired Pro Master preview.", code: "invalid_job_token" });
    }

    const previewUrl = String(urlObj.searchParams.get("url") || tokenOk.previewUrl || "").trim();
    let fetched = null;
    if (previewUrl) {
      const dl = await downloadRoexPreviewUrl(previewUrl);
      if (dl.ok) {
        fetched = {
          ok: true,
          buffer: dl.buffer,
          contentType: dl.contentType,
        };
      } else if (dl.status && dl.status !== 404) {
        fetched = dl;
      }
    }
    if (!fetched?.ok) {
      fetched = await fetchPreviewAudioBufferQuick(masteringTaskId, { attempts: 6, delayMs: 2000 });
    }
    if (!fetched.ok) {
      return sendJson(res, fetched.pending ? 202 : fetched.status || 502, {
        error: fetched.error || "Preview not ready yet.",
        code: fetched.code || "preview_pending",
        pending: Boolean(fetched.pending),
      });
    }

    res.statusCode = 200;
    res.setHeader("Content-Type", fetched.contentType || "audio/wav");
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Accept-Ranges", "bytes");
    res.setHeader("Content-Length", String(fetched.buffer.length));
    res.end(fetched.buffer);
  } catch (e) {
    console.warn("[music/studio-master-stream]", e?.message || e);
    return sendJson(res, 500, { error: e?.message || "Preview stream failed." });
  }
};
