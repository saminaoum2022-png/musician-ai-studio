/**
 * GET /api/blog/posts?locale=en&limit=20&offset=0
 */

const { setCors, sendJson } = require("../_lib/credits-auth");
const { loadPublicPosts } = require("../_lib/blog-store");

module.exports = async function handler(req, res) {
  setCors(res);
  if (req.method === "OPTIONS") return res.end();
  if (req.method !== "GET") return sendJson(res, 405, { error: "Method not allowed" });

  const url = new URL(req.url || "/", "http://localhost");
  const locale = String(url.searchParams.get("locale") || "en").trim().toLowerCase();
  const limit = Number(url.searchParams.get("limit") || 20);
  const offset = Number(url.searchParams.get("offset") || 0);

  const data = await loadPublicPosts(locale, { limit, offset });
  if (!data.ok) {
    return sendJson(res, data.status || 500, {
      error: typeof data.error === "string" ? data.error : "Could not load blog posts.",
      posts: [],
    });
  }

  res.setHeader("Cache-Control", "public, max-age=60, stale-while-revalidate=300");
  return sendJson(res, 200, { ok: true, posts: data.posts, locale: data.locale });
};
