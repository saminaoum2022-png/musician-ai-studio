/**
 * GET /api/marketing/hero-image?page=home&locale=en
 * Redirects to the published CMS hero image — no HTML rebuild needed after admin save.
 */

const { setCors, sendJson } = require("../_lib/credits-auth");
const { LOCALES, PAGE_KEYS } = require("../_lib/marketing-content");
const { resolveMarketingHeroRedirect } = require("../_lib/marketing-hero-image");

module.exports = async function handler(req, res) {
  setCors(res);
  if (req.method === "OPTIONS") return res.end();
  if (req.method !== "GET") return sendJson(res, 405, { error: "Method not allowed" });

  const url = new URL(req.url, "http://localhost");
  const page = String(url.searchParams.get("page") || "home").trim().toLowerCase();
  const locale = String(url.searchParams.get("locale") || "en").trim().toLowerCase();

  if (!PAGE_KEYS.includes(page)) return sendJson(res, 400, { error: "Unsupported page." });
  if (!LOCALES.includes(locale)) return sendJson(res, 400, { error: "Unsupported locale." });

  const resolved = await resolveMarketingHeroRedirect(page, locale, req);
  if (!resolved.ok) return sendJson(res, resolved.status || 404, { error: resolved.error || "Hero image not found." });

  res.setHeader("Cache-Control", "public, max-age=30, stale-while-revalidate=120");
  if (resolved.updatedAt) res.setHeader("X-Hero-Updated-At", resolved.updatedAt);
  res.statusCode = 302;
  res.setHeader("Location", resolved.location);
  return res.end();
};
