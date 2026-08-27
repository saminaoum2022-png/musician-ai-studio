/**
 * GET /api/blog/post?slug=my-post&locale=en
 */

const { setCors, sendJson } = require("../_lib/credits-auth");
const { loadPublicPost } = require("../_lib/blog-store");
const { postPreviewPath } = require("../_lib/blog-content");

module.exports = async function handler(req, res) {
  setCors(res);
  if (req.method === "OPTIONS") return res.end();
  if (req.method !== "GET") return sendJson(res, 405, { error: "Method not allowed" });

  const url = new URL(req.url || "/", "http://localhost");
  const slug = String(url.searchParams.get("slug") || "").trim();
  const locale = String(url.searchParams.get("locale") || "en").trim().toLowerCase();

  if (!slug) return sendJson(res, 400, { error: "Missing slug." });

  const data = await loadPublicPost(slug, locale);
  if (!data.ok) return sendJson(res, data.status || 404, { error: data.error || "Post not found." });

  res.setHeader("Cache-Control", "public, max-age=60, stale-while-revalidate=300");
  return sendJson(res, 200, {
    ok: true,
    post: data.post,
    path: postPreviewPath(data.post.slug, data.post.locale),
  });
};
