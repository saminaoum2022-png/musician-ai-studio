/**
 * GET /api/marketing/content?page=home&locale=en
 * Public read — merged CMS content with static defaults as fallback.
 */

const { setCors, sendJson } = require("../_lib/credits-auth");
const { loadMarketingContent } = require("../_lib/marketing-store");
const { resolveFeaturedDiscoverSongs } = require("../_lib/marketing-featured-songs");

module.exports = async function handler(req, res) {
  setCors(res);
  if (req.method === "OPTIONS") return res.end();
  if (req.method !== "GET") return sendJson(res, 405, { error: "Method not allowed" });

  const url = new URL(req.url, "http://localhost");
  const page = url.searchParams.get("page") || "home";
  const locale = url.searchParams.get("locale") || "en";

  const data = await loadMarketingContent(page, locale);
  if (!data.ok) return sendJson(res, data.status || 500, { error: data.error || "Failed to load content" });

  if (page === "home" && data.content?.discover?.featuredSongIds?.length) {
    const featuredSongs = await resolveFeaturedDiscoverSongs(data.content.discover.featuredSongIds);
    data.content.discover = { ...data.content.discover, featuredSongs };
  }

  const showcaseItems = data.content?.templates?.showcaseItems;
  const legacyShowcaseIds = data.content?.templates?.showcaseSongIds;
  const showcaseIds = Array.isArray(showcaseItems) && showcaseItems.length
    ? showcaseItems.map((it) => it.songId).filter(Boolean)
    : legacyShowcaseIds;
  if (page === "home" && Array.isArray(showcaseIds) && showcaseIds.length) {
    const tagById = new Map(
      (Array.isArray(showcaseItems) ? showcaseItems : []).map((it) => [String(it.songId), String(it.tag || "").trim()]),
    );
    const showcaseSongs = (await resolveFeaturedDiscoverSongs(showcaseIds)).map((song) => ({
      ...song,
      occasionLabel: tagById.get(String(song.id)) || "",
    }));
    data.content.templates = { ...data.content.templates, showcaseSongs };
  }

  res.setHeader("Cache-Control", "public, max-age=60, stale-while-revalidate=300");
  return sendJson(res, 200, {
    ok: true,
    page: data.page,
    locale: data.locale,
    content: data.content,
    source: data.source,
    updatedAt: data.updatedAt,
  });
};
