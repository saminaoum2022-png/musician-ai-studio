/**
 * GET /api/blog/page?slug=my-post&locale=en
 * Server-rendered blog article shell with correct SEO tags for crawlers.
 */

const fs = require("fs");
const path = require("path");
const { loadPublicPost } = require("../_lib/blog-store");
const { postPreviewPath } = require("../_lib/blog-content");

const SITE_ORIGIN = "https://www.nabadai.com";

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/'/g, "&#39;");
}

function absoluteUrl(url) {
  const u = String(url || "").trim();
  if (!u) return "";
  if (/^https?:\/\//i.test(u)) return u.slice(0, 400);
  if (u.startsWith("/")) return `${SITE_ORIGIN}${u}`.slice(0, 400);
  return "";
}

function injectBlogPostSeo(html, { post, canonicalPath }) {
  const c = post.content || {};
  const slug = post.slug || "";
  const title = c.seo?.title || c.hero?.title || slug;
  const desc = c.seo?.description || c.hero?.lead || "";
  const docTitle = `${title} — NabadAi Blog`;
  const canonical = `${SITE_ORIGIN}${canonicalPath}`;
  const ogImage = absoluteUrl(c.hero?.coverImageUrl || "");

  let out = html;
  out = out.replace(/<title>[\s\S]*?<\/title>/, `<title>${escapeHtml(docTitle)}</title>`);
  out = out.replace(
    /<meta name="description" content="[^"]*">/,
    `<meta name="description" content="${escapeAttr(desc)}">`,
  );
  out = out.replace(
    /<link rel="canonical" href="[^"]*">/,
    `<link rel="canonical" href="${escapeAttr(canonical)}">`,
  );
  out = out.replace(
    /<meta property="og:title" content="[^"]*">/,
    `<meta property="og:title" content="${escapeAttr(title)}">`,
  );
  out = out.replace(
    /<meta property="og:description" content="[^"]*">/,
    `<meta property="og:description" content="${escapeAttr(desc)}">`,
  );

  if (out.includes('property="og:url"')) {
    out = out.replace(
      /<meta property="og:url" content="[^"]*">/,
      `<meta property="og:url" content="${escapeAttr(canonical)}">`,
    );
  } else {
    out = out.replace(
      "</head>",
      `  <meta property="og:url" content="${escapeAttr(canonical)}">\n</head>`,
    );
  }

  if (ogImage) {
    if (out.includes('property="og:image"')) {
      out = out.replace(
        /<meta property="og:image" content="[^"]*">/,
        `<meta property="og:image" content="${escapeAttr(ogImage)}">`,
      );
    } else {
      out = out.replace(
        "</head>",
        `  <meta property="og:image" content="${escapeAttr(ogImage)}">\n</head>`,
      );
    }
  }

  const heroTitle = escapeHtml(c.hero?.title || title);
  const heroLead = escapeHtml(c.hero?.lead || "");
  const bodyHtml = String(c.body?.html || "");

  out = out.replace(
    'data-blog="hero.title">Loading…</',
    `data-blog="hero.title">${heroTitle}</`,
  );
  if (heroLead) {
    out = out.replace(
      'data-blog="hero.lead"></',
      `data-blog="hero.lead">${heroLead}</`,
    );
  }
  if (bodyHtml) {
    out = out.replace(
      '<div class="blogArticleBody" data-blog="body.html"></div>',
      `<div class="blogArticleBody" data-blog="body.html">${bodyHtml}</div>`,
    );
  }

  out = out.replace(/data-blog-slug=""/, `data-blog-slug="${escapeAttr(slug)}"`);
  return out;
}

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    res.statusCode = 405;
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.end("Method not allowed");
    return;
  }

  const url = new URL(req.url || "/", "http://localhost");
  const slug = String(url.searchParams.get("slug") || "").trim();
  const locale = String(url.searchParams.get("locale") || "en").trim().toLowerCase();

  if (!slug) {
    res.statusCode = 400;
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.end("Missing slug");
    return;
  }

  const data = await loadPublicPost(slug, locale);
  if (!data.ok || !data.post) {
    res.statusCode = data.status || 404;
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    res.end("<!doctype html><html><head><title>Post not found</title></head><body><p>Post not found.</p><a href=\"/blog\">Back to blog</a></body></html>");
    return;
  }

  const templateRel = locale === "ar" ? "ar/blog-post.html" : "blog-post.html";
  const templatePath = path.join(process.cwd(), templateRel);
  if (!fs.existsSync(templatePath)) {
    res.statusCode = 500;
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.end("Blog template missing");
    return;
  }

  const canonicalPath = postPreviewPath(data.post.slug, data.post.locale);
  const html = injectBlogPostSeo(fs.readFileSync(templatePath, "utf8"), {
    post: data.post,
    canonicalPath,
  });

  res.statusCode = 200;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=60, stale-while-revalidate=300");
  res.end(html);
};
