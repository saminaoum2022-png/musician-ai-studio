/**
 * Suno audio proxy: streams remote audio URL via our server.
 *
 * GET /api/suno/audio?url=<encoded remote audio url>
 */

const { Readable } = require("stream");
const { applyCors } = require("../_lib/cors");

module.exports = async function handler(req, res) {
  if (applyCors(req, res)) return;
  try {
    if (req.method !== "GET") return json(res, 405, { error: "Method not allowed" });

    const urlObj = new URL(req.url, "http://localhost");
    const raw = urlObj.searchParams.get("url");
    if (!raw) return json(res, 400, { error: "Missing url" });

    let target;
    try {
      target = new URL(raw);
    } catch {
      return json(res, 400, { error: "Invalid url" });
    }
    if (!/^https?:$/.test(target.protocol)) return json(res, 400, { error: "Invalid protocol" });

    const upstream = await fetch(target.toString(), { method: "GET", redirect: "follow" });
    if (!upstream.ok || !upstream.body) {
      const txt = await upstream.text().catch(() => "");
      return json(res, 502, { error: "Upstream audio fetch failed", status: upstream.status, details: txt.slice(0, 300) });
    }

    res.statusCode = 200;
    res.setHeader("Content-Type", upstream.headers.get("content-type") || "audio/mpeg");
    res.setHeader("Cache-Control", "no-store");
    const cd = upstream.headers.get("content-disposition");
    if (cd) res.setHeader("Content-Disposition", cd);

    // Stream through instead of buffering the whole file first — the old
    // arrayBuffer() path delayed *every* byte until Vercel had the full song,
    // which felt like a 1–2s stall before playback could start.
    try {
      const nodeStream = Readable.fromWeb(upstream.body);
      nodeStream.on("error", () => {
        try {
          if (!res.writableEnded) res.end();
        } catch {}
      });
      res.on("close", () => {
        try {
          nodeStream.destroy();
        } catch {}
      });
      nodeStream.pipe(res);
    } catch {
      const ab = await upstream.arrayBuffer();
      res.end(Buffer.from(ab));
    }
  } catch (e) {
    return json(res, 500, { error: e?.message || String(e) });
  }
};

function json(res, status, obj) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(obj));
}

