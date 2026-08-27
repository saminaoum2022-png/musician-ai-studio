/**
 * Blog post content validation and defaults.
 */

const LOCALES = Object.freeze(["en", "ar"]);

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function clip(str, max) {
  const s = String(str ?? "").trim();
  if (!s) return "";
  return s.length > max ? s.slice(0, max) : s;
}

function sanitizeHref(href) {
  const u = String(href || "").trim();
  if (!u) return "";
  if (u.startsWith("/")) return u.slice(0, 400);
  if (/^https?:\/\//i.test(u)) return u.slice(0, 400);
  if (u.startsWith("mailto:")) return u.slice(0, 200);
  return "";
}

function sanitizeImageUrl(url) {
  const u = String(url || "").trim();
  if (!u) return "";
  if (u.startsWith("/")) return u.slice(0, 400);
  if (/^https?:\/\//i.test(u)) return u.slice(0, 400);
  return "";
}

function sanitizeBodyHtml(html) {
  let s = String(html || "").trim();
  if (!s) return "";
  s = s.replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "");
  s = s.replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "");
  s = s.replace(/<iframe[\s\S]*?>[\s\S]*?<\/iframe>/gi, "");
  return s.slice(0, 80000);
}

function normalizeSlug(raw) {
  const slug = String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  if (!slug || !SLUG_RE.test(slug)) return null;
  return slug;
}

function defaultPostContent(locale = "en") {
  const isAr = locale === "ar";
  return {
    seo: {
      title: isAr ? "مقال NabadAi" : "NabadAi blog post",
      description: isAr
        ? "نصائح ومقالات عن صناعة الموسيقى بالذكاء الاصطناعي."
        : "Tips and stories about AI music creation with NabadAi.",
    },
    hero: {
      title: isAr ? "عنوان المقال" : "Article title",
      lead: isAr ? "مقدمة قصيرة للمقال." : "A short introduction to your article.",
      coverImageUrl: "",
      coverImageAlt: "",
    },
    body: { html: "" },
    author: { name: "NabadAi", avatarUrl: "" },
    tags: [],
    cta: {
      label: isAr ? "جرّب NabadAi" : "Try NabadAi",
      href: "/app/",
    },
  };
}

function normalizeTags(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((t) => clip(t, 40))
    .filter(Boolean)
    .slice(0, 8);
}

function normalizePostContent(raw, locale = "en") {
  const loc = LOCALES.includes(locale) ? locale : "en";
  const d = defaultPostContent(loc);
  const src = raw && typeof raw === "object" ? raw : {};
  const seo = src.seo && typeof src.seo === "object" ? src.seo : {};
  const hero = src.hero && typeof src.hero === "object" ? src.hero : {};
  const body = src.body && typeof src.body === "object" ? src.body : {};
  const author = src.author && typeof src.author === "object" ? src.author : {};
  const cta = src.cta && typeof src.cta === "object" ? src.cta : {};

  const content = {
    seo: {
      title: clip(seo.title, 120) || d.seo.title,
      description: clip(seo.description, 320) || d.seo.description,
    },
    hero: {
      title: clip(hero.title, 160) || d.hero.title,
      lead: clip(hero.lead, 400) || d.hero.lead,
      coverImageUrl: sanitizeImageUrl(hero.coverImageUrl) || d.hero.coverImageUrl,
      coverImageAlt: clip(hero.coverImageAlt, 200) || d.hero.coverImageAlt,
    },
    body: {
      html: sanitizeBodyHtml(body.html) || d.body.html,
    },
    author: {
      name: clip(author.name, 80) || d.author.name,
      avatarUrl: sanitizeImageUrl(author.avatarUrl) || d.author.avatarUrl,
    },
    tags: normalizeTags(src.tags),
    cta: {
      label: clip(cta.label, 60) || d.cta.label,
      href: sanitizeHref(cta.href) || d.cta.href,
    },
  };

  if (!content.body.html.trim()) {
    return { error: "Article body is required." };
  }
  return { content };
}

function mergeWithDefaults(locale, stored) {
  const d = defaultPostContent(locale);
  if (!stored || typeof stored !== "object") return d;
  const normalized = normalizePostContent(stored, locale);
  return normalized.content || d;
}

function postPreviewPath(slug, locale = "en") {
  const s = normalizeSlug(slug);
  if (!s) return locale === "ar" ? "/ar/blog" : "/blog";
  return locale === "ar" ? `/ar/blog/${s}` : `/blog/${s}`;
}

function postSummaryFromContent(slug, locale, content, meta = {}) {
  const c = content || {};
  return {
    slug,
    locale,
    title: c.hero?.title || c.seo?.title || slug,
    excerpt: c.hero?.lead || c.seo?.description || "",
    coverImageUrl: c.hero?.coverImageUrl || "",
    coverImageAlt: c.hero?.coverImageAlt || "",
    tags: Array.isArray(c.tags) ? c.tags : [],
    published: Boolean(meta.published),
    publishedAt: meta.publishedAt || null,
    updatedAt: meta.updatedAt || null,
    hasDraftChanges: Boolean(meta.hasDraftChanges),
  };
}

module.exports = {
  LOCALES,
  SLUG_RE,
  normalizeSlug,
  defaultPostContent,
  normalizePostContent,
  mergeWithDefaults,
  postPreviewPath,
  postSummaryFromContent,
  sanitizeBodyHtml,
};
