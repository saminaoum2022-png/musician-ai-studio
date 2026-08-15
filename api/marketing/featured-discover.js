/**
 * GET /api/marketing/featured-discover?ids=uuid,uuid
 * Public resolver for homepage Discover carousel (draft preview + client fetch).
 */

const { setCors, sendJson } = require("../_lib/credits-auth");
const { resolveFeaturedDiscoverSongs, normalizeSongIds } = require("../_lib/marketing-featured-songs");

module.exports = async function handler(req, res) {
  setCors(res);
  if (req.method === "OPTIONS") return res.end();
  if (req.method !== "GET") return sendJson(res, 405, { error: "Method not allowed" });

  const url = new URL(req.url, "http://localhost");
  const raw = url.searchParams.get("ids") || "";
  const ids = normalizeSongIds(raw.split(/[\s,]+/g).filter(Boolean));

  if (!ids.length) {
    return sendJson(res, 200, { ok: true, songs: [] });
  }

  const songs = await resolveFeaturedDiscoverSongs(ids);
  res.setHeader("Cache-Control", "public, max-age=30, stale-while-revalidate=120");
  return sendJson(res, 200, { ok: true, songs });
};
