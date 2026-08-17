/**
 * GET  /api/admin/marketing?overview=1 — site-wide live/draft status
 * GET  /api/admin/marketing?page=home&locale=en — load editable draft (or live)
 * PUT  /api/admin/marketing — save draft { action: "draft" | "publish" | "discard" | "publish_all" }
 * POST /api/admin/marketing — upload hero image { filename, contentType, dataBase64 }
 *
 * Requires admin dashboard access (marketing view — Owner / Admin only).
 */

const { setCors, sendJson, readJsonBody } = require("../_lib/credits-auth");
const {
  verifyAdmin,
  adminForbidden,
  adminUnauthorized,
} = require("../_lib/admin-auth");
const { LOCALES, PAGE_KEYS, PAGE_CATALOG, isSeoPage } = require("../_lib/marketing-content");
const {
  loadMarketingAdminContent,
  getMarketingSiteOverview,
  saveMarketingDraft,
  publishMarketingContent,
  publishAllMarketingDrafts,
  discardMarketingDraft,
} = require("../_lib/marketing-store");
const { uploadObject } = require("../_lib/supabase-storage");
const { marketingHeroImageApiPath } = require("../_lib/marketing-hero-image");

const MARKETING_BUCKET = "marketing_assets";

function parsePageLocale(body, reqUrl) {
  const url = new URL(reqUrl || "/", "http://localhost");
  const page = String(body?.page || url.searchParams.get("page") || "home").trim().toLowerCase();
  const locale = String(body?.locale || url.searchParams.get("locale") || "en").trim().toLowerCase();
  return { page, locale };
}

function extForMime(mime) {
  const m = String(mime || "").toLowerCase();
  if (m.includes("png")) return "png";
  if (m.includes("webp")) return "webp";
  return "jpg";
}

function sniffImageMime(buf) {
  if (!buf || buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return "image/png";
  if (
    buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46
    && buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50
  ) {
    return "image/webp";
  }
  return null;
}

module.exports = async function handler(req, res) {
  setCors(res);
  if (req.method === "OPTIONS") return res.end();

  const admin = await verifyAdmin(req, { view: "marketing", requireManageMarketing: true });
  if (!admin) {
    const { verifyUser } = require("../_lib/credits-auth");
    const user = await verifyUser(req);
    if (!user) return adminUnauthorized(res);
    return adminForbidden(res, "You do not have permission to edit marketing content.");
  }

  if (req.method === "GET") {
    const url = new URL(req.url || "/", "http://localhost");
    if (url.searchParams.get("overview") === "1") {
      const overview = await getMarketingSiteOverview();
      if (!overview.ok) return sendJson(res, overview.status || 500, { error: overview.error });
      return sendJson(res, 200, { ok: true, ...overview });
    }

    const { page, locale } = parsePageLocale({}, req.url);
    if (!PAGE_KEYS.includes(page)) return sendJson(res, 400, { error: "Unsupported page." });
    if (!LOCALES.includes(locale)) return sendJson(res, 400, { error: "Unsupported locale." });

    const data = await loadMarketingAdminContent(page, locale);
    if (!data.ok) return sendJson(res, data.status || 500, { error: data.error });

    return sendJson(res, 200, {
      ok: true,
      page: data.page,
      locale: data.locale,
      content: data.content,
      liveContent: data.liveContent,
      hasDraftChanges: data.hasDraftChanges,
      source: data.source,
      updatedAt: data.updatedAt,
      draftUpdatedAt: data.draftUpdatedAt,
      publishedAt: data.publishedAt,
      pages: PAGE_CATALOG,
      pageKeys: PAGE_KEYS,
      locales: LOCALES,
    });
  }

  if (req.method === "PUT") {
    const body = await readJsonBody(req);
    const action = String(body?.action || "draft").trim().toLowerCase();
    const { page, locale } = parsePageLocale(body || {}, req.url);

    if (action === "publish_all") {
      const result = await publishAllMarketingDrafts({ userId: admin.userId });
      if (!result.ok) return sendJson(res, result.status || 500, { error: result.error });
      return sendJson(res, 200, {
        ok: true,
        action: "publish_all",
        publishedCount: result.publishedCount,
        pages: result.pages,
      });
    }

    if (!PAGE_KEYS.includes(page)) return sendJson(res, 400, { error: "Unsupported page." });
    if (!LOCALES.includes(locale)) return sendJson(res, 400, { error: "Unsupported locale." });

    if (action === "discard") {
      const result = await discardMarketingDraft({ pageKey: page, locale, userId: admin.userId });
      if (!result.ok) return sendJson(res, result.status || 500, { error: result.error });
      return sendJson(res, 200, {
        ok: true,
        action: "discard",
        page: result.page,
        locale: result.locale,
        content: result.content,
        hasDraftChanges: false,
      });
    }

    if (action === "publish") {
      const result = await publishMarketingContent({
        pageKey: page,
        locale,
        userId: admin.userId,
        content: body?.content ?? null,
      });
      if (!result.ok) return sendJson(res, result.status || 500, { error: result.error });
      return sendJson(res, 200, {
        ok: true,
        action: "publish",
        page: result.page,
        locale: result.locale,
        content: result.content,
        publishedAt: result.publishedAt,
        hasDraftChanges: false,
        heroImageApiPath:
          result.page === "home" || isSeoPage(result.page)
            ? marketingHeroImageApiPath(result.page, result.locale)
            : null,
      });
    }

    const saved = await saveMarketingDraft({
      pageKey: page,
      locale,
      content: body?.content,
      userId: admin.userId,
    });
    if (!saved.ok) return sendJson(res, saved.status || 500, { error: saved.error });

    return sendJson(res, 200, {
      ok: true,
      action: "draft",
      page: saved.page,
      locale: saved.locale,
      content: saved.content,
      draftUpdatedAt: saved.draftUpdatedAt,
      hasDraftChanges: saved.hasDraftChanges,
    });
  }

  if (req.method === "POST") {
    const body = await readJsonBody(req);
    const b64 = String(body?.dataBase64 || "").trim();
    if (!b64) return sendJson(res, 400, { error: "Missing image data." });

    let buf;
    try {
      const raw = b64.includes(",") ? b64.split(",").pop() : b64;
      buf = Buffer.from(raw, "base64");
    } catch {
      return sendJson(res, 400, { error: "Invalid image data." });
    }
    if (!buf.length || buf.length > 8 * 1024 * 1024) {
      return sendJson(res, 400, { error: "Image must be under 8 MB." });
    }

    const contentTypeRaw = String(body?.contentType || "image/jpeg").toLowerCase();
    let contentType = /^image\/(jpeg|png|webp)$/.test(contentTypeRaw) ? contentTypeRaw : null;
    if (!contentType) contentType = sniffImageMime(buf);
    if (!contentType) return sendJson(res, 400, { error: "Use JPEG, PNG, or WebP." });

    const baseName = String(body?.filename || "hero")
      .replace(/[^a-zA-Z0-9._-]+/g, "-")
      .slice(0, 48) || "hero";
    const key = `uploads/${Date.now()}-${baseName}.${extForMime(contentType)}`;
    const uploaded = await uploadObject({
      bucket: MARKETING_BUCKET,
      key,
      body: buf,
      contentType,
    });
    if (!uploaded.ok) {
      return sendJson(res, uploaded.status || 500, {
        error: uploaded.error || "Upload failed. Run supabase/marketing_assets_storage.sql if the bucket is missing.",
      });
    }

    return sendJson(res, 200, { ok: true, url: uploaded.url, key });
  }

  return sendJson(res, 405, { error: "Method not allowed" });
};
