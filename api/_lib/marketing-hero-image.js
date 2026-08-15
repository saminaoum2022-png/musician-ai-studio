/**
 * Stable public path for marketing hero images — resolves CMS URL on each request.
 */

const { loadMarketingContent } = require("./marketing-store");

function marketingHeroImageApiPath(page, locale) {
  const p = String(page || "home").trim().toLowerCase();
  const l = String(locale || "en").trim().toLowerCase();
  return `/api/marketing/hero-image?page=${encodeURIComponent(p)}&locale=${encodeURIComponent(l)}`;
}

function marketingHeroMetaApiPath(page, locale) {
  const p = String(page || "home").trim().toLowerCase();
  const l = String(locale || "en").trim().toLowerCase();
  return `/api/marketing/hero-meta?page=${encodeURIComponent(p)}&locale=${encodeURIComponent(l)}`;
}

function toAbsoluteRedirectUrl(heroImageUrl, req) {
  const url = String(heroImageUrl || "").trim();
  if (!url) return null;
  if (/^https?:\/\//i.test(url)) return url;
  if (!url.startsWith("/")) return null;
  const host = String(req.headers["x-forwarded-host"] || req.headers.host || "www.nabadai.com").split(",")[0].trim();
  const proto = String(req.headers["x-forwarded-proto"] || "https").split(",")[0].trim();
  return `${proto}://${host}${url}`;
}

async function resolveMarketingHeroRedirect(page, locale, req) {
  const data = await loadMarketingContent(page, locale);
  if (!data.ok || !data.content?.hero?.heroImageUrl) {
    return { ok: false, status: data.status || 404, error: data.error || "Hero image not found." };
  }
  const location = toAbsoluteRedirectUrl(data.content.hero.heroImageUrl, req);
  if (!location) {
    return { ok: false, status: 500, error: "Invalid hero image URL." };
  }
  return {
    ok: true,
    location,
    updatedAt: data.updatedAt || null,
    alt: data.content.hero.heroImageAlt || "",
  };
}

module.exports = {
  marketingHeroImageApiPath,
  marketingHeroMetaApiPath,
  resolveMarketingHeroRedirect,
};
