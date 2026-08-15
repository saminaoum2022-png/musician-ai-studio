/**
 * GET /api/marketing/content?page=home&locale=en
 * Public read — merged CMS content with static defaults as fallback.
 */

const { setCors, sendJson } = require("../_lib/credits-auth");
const { loadMarketingContent } = require("../_lib/marketing-store");

module.exports = async function handler(req, res) {
  setCors(res);
  if (req.method === "OPTIONS") return res.end();
  if (req.method !== "GET") return sendJson(res, 405, { error: "Method not allowed" });

  const url = new URL(req.url, "http://localhost");
  const page = url.searchParams.get("page") || "home";
  const locale = url.searchParams.get("locale") || "en";

  const data = await loadMarketingContent(page, locale);
  if (!data.ok) return sendJson(res, data.status || 500, { error: data.error || "Failed to load content" });

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
