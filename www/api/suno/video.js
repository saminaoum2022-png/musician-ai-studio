/**
 * Suno music video (MP4 visualizer) proxy.
 *
 * POST /api/suno/video   { taskId, audioId, author? }
 *   -> Suno POST /api/v1/mp4/generate. Returns { taskId } of the video task.
 *   We always brand the watermark with nabadai.com; `author` (creator handle)
 *   is shown at the start of the video.
 *
 * GET /api/suno/video?taskId=...
 *   -> Suno GET /api/v1/mp4/record-info. Returns { status, videoUrl, errorMessage }.
 *   Status values per docs: PENDING | SUCCESS | CREATE_TASK_FAILED |
 *   GENERATE_MP4_FAILED | CALLBACK_EXCEPTION.
 *
 * Suno keeps generated videos for 15 days; the client caches taskId/videoUrl
 * in the song's meta so a re-tap inside that window never pays for a second
 * render (Suno also answers 409 when an MP4 already exists for the track).
 */
const { verifyUser } = require("../_lib/credits-auth");
const { applyCors } = require("../_lib/cors");
const { readJson, sendJson, sunoJsonRequest } = require("../_lib/suno-upstream");

module.exports = async function handler(req, res) {
  if (applyCors(req, res)) return;
  try {
    const apiKey = process.env.SUNO_API_KEY;
    if (!apiKey) return sendJson(res, 500, { error: "Missing SUNO_API_KEY on server" });

    const user = await verifyUser(req);
    if (!user) return sendJson(res, 401, { error: "Sign in to create a music video." });

    if (req.method === "GET") {
      const urlObj = new URL(req.url, "http://localhost");
      const taskId = String(urlObj.searchParams.get("taskId") || "").trim();
      if (!taskId) return sendJson(res, 400, { error: "Missing taskId" });
      const upstream = await sunoJsonRequest("/api/v1/mp4/record-info", {
        apiKey,
        query: { taskId },
      });
      if (!upstream.ok) {
        const msg =
          upstream.data?.msg || upstream.data?.message || upstream.data?.error || "Video status check failed";
        return sendJson(res, upstream.httpStatus >= 400 ? upstream.httpStatus : 502, {
          error: String(msg).slice(0, 240),
          code: upstream.code,
        });
      }
      const d = upstream.data?.data || {};
      return sendJson(res, 200, {
        status: String(d.successFlag || "PENDING").toUpperCase(),
        videoUrl: String(d?.response?.videoUrl || "").trim(),
        errorMessage: d.errorMessage ? String(d.errorMessage).slice(0, 240) : null,
      });
    }

    if (req.method !== "POST") return sendJson(res, 405, { error: "Method not allowed" });

    const body = await readJson(req);
    const taskId = String(body?.taskId || "").trim();
    const audioId = String(body?.audioId || "").trim();
    const author = String(body?.author || "").trim().slice(0, 50);
    if (!taskId || !audioId) {
      return sendJson(res, 400, { error: "Music videos need the song's Suno taskId and audioId." });
    }

    const { host, proto } = getHostProto(req);
    const upstream = await sunoJsonRequest("/api/v1/mp4/generate", {
      method: "POST",
      apiKey,
      body: {
        taskId,
        audioId,
        callBackUrl: `${proto}://${host}/api/suno/callback`,
        ...(author ? { author } : {}),
        domainName: "nabadai.com",
      },
    });

    if (!upstream.ok) {
      const code = Number(upstream.code);
      if (code === 409) {
        // An MP4 already exists for this track on Suno's side. The client
        // normally avoids this via cached meta; surface a stable code so it
        // can explain instead of showing a raw upstream error.
        return sendJson(res, 409, {
          error: "A music video already exists for this song.",
          code: 409,
        });
      }
      const msg =
        upstream.data?.msg || upstream.data?.message || upstream.data?.error || "Video creation failed";
      return sendJson(res, upstream.httpStatus >= 400 ? upstream.httpStatus : 502, {
        error: String(msg).slice(0, 240),
        code: upstream.code,
      });
    }

    const videoTaskId = String(upstream.data?.data?.taskId || "").trim();
    if (!videoTaskId) return sendJson(res, 502, { error: "Suno did not return a video task id" });
    return sendJson(res, 200, { taskId: videoTaskId });
  } catch (e) {
    return sendJson(res, 500, { error: e?.message || String(e) });
  }
};

function getHostProto(req) {
  const host = req.headers["x-forwarded-host"] || req.headers.host || "localhost";
  const proto = req.headers["x-forwarded-proto"] || "https";
  return { host, proto };
}
