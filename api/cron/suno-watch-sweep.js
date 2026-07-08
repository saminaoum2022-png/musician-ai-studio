/**
 * GET /api/cron/suno-watch-sweep
 * Vercel Cron backstop: re-check pending / prematurely-notified Suno watches.
 */

const { sweepSunoGenerationWatches } = require("../_lib/suno-generation-watch");

module.exports = async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "POST") {
    return json(res, 405, { error: "Method not allowed" });
  }

  const secret = String(process.env.CRON_SECRET || "");
  if (secret) {
    const auth = String(req.headers.authorization || req.headers.Authorization || "");
    if (auth !== `Bearer ${secret}`) {
      return json(res, 401, { ok: false, error: "unauthorized" });
    }
  }

  try {
    const result = await sweepSunoGenerationWatches({ limit: 30 });
    return json(res, 200, result);
  } catch (e) {
    console.warn("[suno-watch-sweep]", e?.message || e);
    return json(res, 500, { ok: false, error: e?.message || String(e) });
  }
};

function json(res, status, obj) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(obj));
}
