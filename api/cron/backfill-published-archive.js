/**
 * POST /api/cron/backfill-published-archive
 * One-shot: archive published songs still on legacy Suno/proxy URLs.
 *
 * Auth: Authorization: Bearer <CRON_SECRET>
 * Query: dryRun=1 (list only, no uploads)
 */

const { backfillPublishedSongArchives } = require("../_lib/archive-remote-song");

module.exports = async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "POST") {
    return json(res, 405, { error: "Method not allowed" });
  }

  const secret = String(process.env.CRON_SECRET || "").trim();
  if (!secret) {
    return json(res, 503, { ok: false, error: "CRON_SECRET not configured" });
  }
  const auth = String(req.headers.authorization || req.headers.Authorization || "").trim();
  if (auth !== `Bearer ${secret}`) {
    return json(res, 401, { ok: false, error: "unauthorized" });
  }

  const url = new URL(req.url || "/", "https://www.nabadai.com");
  const dryRun = url.searchParams.get("dryRun") === "1" || url.searchParams.get("dry_run") === "1";
  const limit = Math.max(0, Number(url.searchParams.get("limit") || 0) || 0);

  try {
    const result = await backfillPublishedSongArchives({ dryRun, limit });
    return json(res, 200, result);
  } catch (e) {
    console.warn("[backfill-published-archive]", e?.message || e);
    return json(res, 500, { ok: false, error: e?.message || String(e) });
  }
};

function json(res, status, obj) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(obj));
}
