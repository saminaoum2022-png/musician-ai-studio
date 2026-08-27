/**
 * Admin blog CMS
 *
 * GET  /api/admin/blog?overview=1&locale=en
 * GET  /api/admin/blog?slug=my-post&locale=en
 * PUT  /api/admin/blog — { action: draft|publish|discard|create, slug, locale, content? }
 * DELETE /api/admin/blog?slug=my-post&locale=en
 */

const { setCors, sendJson, readJsonBody } = require("../_lib/credits-auth");
const {
  verifyAdmin,
  adminForbidden,
  adminUnauthorized,
} = require("../_lib/admin-auth");
const { LOCALES, postPreviewPath } = require("../_lib/blog-content");
const {
  getBlogAdminOverview,
  loadBlogAdminPost,
  saveBlogDraft,
  publishBlogPost,
  discardBlogDraft,
  createBlogPost,
  deleteBlogRow,
  normalizeSlug,
} = require("../_lib/blog-store");

function parseSlugLocale(body, reqUrl) {
  const url = new URL(reqUrl || "/", "http://localhost");
  const slug = String(body?.slug || url.searchParams.get("slug") || "").trim().toLowerCase();
  const locale = String(body?.locale || url.searchParams.get("locale") || "en").trim().toLowerCase();
  return { slug, locale };
}

module.exports = async function handler(req, res) {
  setCors(res);
  if (req.method === "OPTIONS") return res.end();

  const admin = await verifyAdmin(req, { view: "marketing", requireManageMarketing: true });
  if (!admin) {
    const { verifyUser } = require("../_lib/credits-auth");
    const user = await verifyUser(req);
    if (!user) return adminUnauthorized(res);
    return adminForbidden(res, "You do not have permission to edit blog posts.");
  }

  if (req.method === "GET") {
    const url = new URL(req.url || "/", "http://localhost");
    const locale = String(url.searchParams.get("locale") || "en").trim().toLowerCase();
    if (!LOCALES.includes(locale)) return sendJson(res, 400, { error: "Unsupported locale." });

    if (url.searchParams.get("overview") === "1") {
      const overview = await getBlogAdminOverview(locale);
      if (!overview.ok) return sendJson(res, overview.status || 500, { error: overview.error });
      return sendJson(res, 200, { ok: true, ...overview, locales: LOCALES });
    }

    const slug = String(url.searchParams.get("slug") || "").trim();
    if (!slug) return sendJson(res, 400, { error: "Missing slug." });

    const data = await loadBlogAdminPost(slug, locale);
    if (!data.ok) return sendJson(res, data.status || 500, { error: data.error });
    return sendJson(res, 200, {
      ok: true,
      ...data,
      previewPath: postPreviewPath(data.slug, data.locale),
      locales: LOCALES,
    });
  }

  if (req.method === "PUT") {
    const body = await readJsonBody(req);
    const action = String(body?.action || "draft").trim().toLowerCase();
    const { slug, locale } = parseSlugLocale(body || {}, req.url);
    if (!LOCALES.includes(locale)) return sendJson(res, 400, { error: "Unsupported locale." });

    if (action === "create") {
      const normalized = normalizeSlug(slug || body?.slug);
      if (!normalized) return sendJson(res, 400, { error: "Invalid slug." });
      const created = await createBlogPost({
        slug: normalized,
        locale,
        content: body?.content,
        userId: admin.userId,
        publish: body?.publish === true,
      });
      if (!created.ok) return sendJson(res, created.status || 500, { error: created.error });
      return sendJson(res, 200, { ok: true, action: "create", ...created });
    }

    if (!slug) return sendJson(res, 400, { error: "Missing slug." });

    if (action === "discard") {
      const result = await discardBlogDraft({ slug, locale, userId: admin.userId });
      if (!result.ok) return sendJson(res, result.status || 500, { error: result.error });
      return sendJson(res, 200, { ok: true, action: "discard", ...result });
    }

    if (action === "publish") {
      const result = await publishBlogPost({
        slug,
        locale,
        userId: admin.userId,
        content: body?.content ?? null,
      });
      if (!result.ok) return sendJson(res, result.status || 500, { error: result.error });
      return sendJson(res, 200, {
        ok: true,
        action: "publish",
        ...result,
        previewPath: postPreviewPath(result.slug, result.locale),
      });
    }

    const saved = await saveBlogDraft({
      slug,
      locale,
      content: body?.content,
      userId: admin.userId,
    });
    if (!saved.ok) return sendJson(res, saved.status || 500, { error: saved.error });
    return sendJson(res, 200, { ok: true, action: "draft", ...saved });
  }

  if (req.method === "DELETE") {
    const url = new URL(req.url || "/", "http://localhost");
    const { slug, locale } = parseSlugLocale({}, req.url);
    if (!slug) return sendJson(res, 400, { error: "Missing slug." });
    if (!LOCALES.includes(locale)) return sendJson(res, 400, { error: "Unsupported locale." });
    const result = await deleteBlogRow(slug, locale);
    if (!result.ok) return sendJson(res, result.status || 500, { error: result.error });
    return sendJson(res, 200, { ok: true, slug, locale });
  }

  return sendJson(res, 405, { error: "Method not allowed" });
};
