/**
 * Blog posts — Supabase persistence (service role).
 */

const {
  LOCALES,
  normalizeSlug,
  normalizePostContent,
  mergeWithDefaults,
  postSummaryFromContent,
} = require("./blog-content");

const SUPABASE_URL = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

const BLOG_ROW_SELECT =
  "slug,locale,content,draft_content,published,published_at,draft_updated_at,updated_at,updated_by";

function stableJson(value) {
  try {
    return JSON.stringify(value ?? null);
  } catch {
    return "";
  }
}

function draftDiffersFromLive(row) {
  if (!row?.draft_content || typeof row.draft_content !== "object") return false;
  return stableJson(row.draft_content) !== stableJson(row.content);
}

function missingTableHint(err) {
  const msg = String(err?.message || err || "").toLowerCase();
  if (msg.includes("blog_posts") || msg.includes("does not exist") || msg.includes("42p01")) {
    return "Blog table missing. Run supabase/blog_posts.sql on your Supabase project.";
  }
  return null;
}

async function fetchBlogRow(slug, locale) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return { ok: false, status: 500, row: null, error: "Supabase not configured." };
  }
  const s = encodeURIComponent(String(slug || "").trim().toLowerCase());
  const loc = encodeURIComponent(String(locale || "en").trim().toLowerCase());
  try {
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/blog_posts?slug=eq.${s}&locale=eq.${loc}&select=${BLOG_ROW_SELECT}&limit=1`,
      {
        headers: {
          apikey: SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        },
      },
    );
    const data = await r.json().catch(() => null);
    if (!r.ok) {
      return { ok: false, status: r.status, row: null, error: missingTableHint(data) || data };
    }
    const row = Array.isArray(data) ? data[0] : null;
    return { ok: true, status: 200, row: row || null };
  } catch (e) {
    return { ok: false, status: 500, row: null, error: e?.message || String(e) };
  }
}

async function fetchBlogRows({ locale, publishedOnly = false, limit = 50, offset = 0 } = {}) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return { ok: false, status: 500, rows: [], error: "Supabase not configured." };
  }
  const loc = encodeURIComponent(String(locale || "en").trim().toLowerCase());
  const parts = [
    `locale=eq.${loc}`,
    `select=${BLOG_ROW_SELECT}`,
    "order=published_at.desc.nullslast,updated_at.desc",
    `limit=${Math.min(Math.max(Number(limit) || 20, 1), 100)}`,
    `offset=${Math.max(Number(offset) || 0, 0)}`,
  ];
  if (publishedOnly) parts.unshift("published=eq.true");
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/blog_posts?${parts.join("&")}`, {
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      },
    });
    const data = await r.json().catch(() => null);
    if (!r.ok) {
      return { ok: false, status: r.status, rows: [], error: missingTableHint(data) || data };
    }
    return { ok: true, status: 200, rows: Array.isArray(data) ? data : [] };
  } catch (e) {
    return { ok: false, status: 500, rows: [], error: e?.message || String(e) };
  }
}

async function upsertBlogRow({
  slug,
  locale,
  content,
  draftContent,
  userId,
  published = false,
  touchDraft = false,
  touchPublished = false,
  clearDraft = false,
}) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return { ok: false, status: 500, error: "Supabase not configured." };
  }
  const now = new Date().toISOString();
  const row = {
    slug: String(slug || "").trim().toLowerCase(),
    locale: String(locale || "en").trim().toLowerCase(),
    published: published === true,
    updated_at: now,
    updated_by: userId || null,
  };
  if (content != null) row.content = content;
  if (touchDraft) {
    row.draft_content = draftContent ?? null;
    row.draft_updated_at = draftContent ? now : null;
  }
  if (clearDraft) {
    row.draft_content = null;
    row.draft_updated_at = null;
  }
  if (touchPublished) {
    row.published_at = now;
    row.published = true;
  }
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/blog_posts`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates,return=representation",
      },
      body: JSON.stringify(row),
    });
    const text = await r.text().catch(() => "");
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    if (!r.ok) {
      return { ok: false, status: r.status, error: missingTableHint(data) || data?.message || text };
    }
    const saved = Array.isArray(data) ? data[0] : data;
    return { ok: true, status: 200, row: saved };
  } catch (e) {
    return { ok: false, status: 500, error: e?.message || String(e) };
  }
}

async function deleteBlogRow(slug, locale) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return { ok: false, status: 500, error: "Supabase not configured." };
  }
  const s = encodeURIComponent(String(slug || "").trim().toLowerCase());
  const loc = encodeURIComponent(String(locale || "en").trim().toLowerCase());
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/blog_posts?slug=eq.${s}&locale=eq.${loc}`, {
      method: "DELETE",
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      },
    });
    if (!r.ok) {
      const data = await r.json().catch(() => null);
      return { ok: false, status: r.status, error: data };
    }
    return { ok: true, status: 200 };
  } catch (e) {
    return { ok: false, status: 500, error: e?.message || String(e) };
  }
}

function rowToPublicPost(row) {
  if (!row?.slug) return null;
  const locale = row.locale || "en";
  const content = mergeWithDefaults(locale, row.content);
  return {
    slug: row.slug,
    locale,
    content,
    publishedAt: row.published_at || null,
    updatedAt: row.updated_at || null,
  };
}

async function loadPublicPost(slug, locale = "en") {
  const normalized = normalizeSlug(slug);
  if (!normalized) return { ok: false, status: 400, error: "Invalid slug." };
  const loc = LOCALES.includes(locale) ? locale : "en";
  const fetched = await fetchBlogRow(normalized, loc);
  if (!fetched.ok) return { ok: false, status: fetched.status || 500, error: fetched.error };
  const row = fetched.row;
  if (!row || !row.published) return { ok: false, status: 404, error: "Post not found." };
  return { ok: true, post: rowToPublicPost(row) };
}

async function loadPublicPosts(locale = "en", { limit = 20, offset = 0 } = {}) {
  const loc = LOCALES.includes(locale) ? locale : "en";
  const fetched = await fetchBlogRows({ locale: loc, publishedOnly: true, limit, offset });
  if (!fetched.ok) return { ok: false, status: fetched.status || 500, error: fetched.error, posts: [] };
  const posts = fetched.rows
    .map((row) => {
      const content = mergeWithDefaults(loc, row.content);
      return postSummaryFromContent(row.slug, loc, content, {
        published: true,
        publishedAt: row.published_at,
        updatedAt: row.updated_at,
      });
    })
    .filter(Boolean);
  return { ok: true, posts, locale: loc };
}

async function loadBlogAdminPost(slug, locale = "en") {
  const normalized = normalizeSlug(slug);
  if (!normalized) return { ok: false, status: 400, error: "Invalid slug." };
  const loc = LOCALES.includes(locale) ? locale : "en";
  const fetched = await fetchBlogRow(normalized, loc);
  if (!fetched.ok) return { ok: false, status: fetched.status || 500, error: fetched.error };

  const row = fetched.row;
  const liveContent = mergeWithDefaults(loc, row?.content);
  const hasDraft = row ? draftDiffersFromLive(row) : false;
  const editable = hasDraft && row?.draft_content
    ? mergeWithDefaults(loc, row.draft_content)
    : liveContent;

  return {
    ok: true,
    slug: normalized,
    locale: loc,
    content: editable,
    liveContent,
    hasDraftChanges: hasDraft,
    published: Boolean(row?.published),
    updatedAt: row?.updated_at || null,
    draftUpdatedAt: row?.draft_updated_at || null,
    publishedAt: row?.published_at || null,
    source: row ? (hasDraft ? "draft" : "live") : "defaults",
  };
}

async function getBlogAdminOverview(locale = "en") {
  const loc = LOCALES.includes(locale) ? locale : "en";
  const fetched = await fetchBlogRows({ locale: loc, publishedOnly: false, limit: 200, offset: 0 });
  if (!fetched.ok) return { ok: false, status: fetched.status || 500, error: fetched.error };

  const posts = fetched.rows.map((row) => {
    const content = mergeWithDefaults(loc, row.content);
    const hasDraftChanges = draftDiffersFromLive(row);
    return postSummaryFromContent(row.slug, loc, content, {
      published: row.published,
      publishedAt: row.published_at,
      updatedAt: row.updated_at,
      hasDraftChanges,
    });
  });

  const draftCount = posts.filter((p) => p.hasDraftChanges).length;
  const publishedCount = posts.filter((p) => p.published).length;
  const lastPublishedAt = posts
    .map((p) => p.publishedAt)
    .filter(Boolean)
    .sort()
    .pop() || null;

  return {
    ok: true,
    locale: loc,
    posts,
    draftCount,
    publishedCount,
    hasDraftChanges: draftCount > 0,
    lastPublishedAt,
  };
}

async function saveBlogDraft({ slug, locale, content, userId }) {
  const normalized = normalizeSlug(slug);
  if (!normalized) return { ok: false, status: 400, error: "Invalid slug." };
  const loc = LOCALES.includes(locale) ? locale : "en";
  const validated = normalizePostContent(content, loc);
  if (validated.error) return { ok: false, status: 400, error: validated.error };

  const existing = await fetchBlogRow(normalized, loc);
  if (!existing.ok) return { ok: false, status: existing.status || 500, error: existing.error };

  const upserted = await upsertBlogRow({
    slug: normalized,
    locale: loc,
    content: existing.row?.content || validated.content,
    draftContent: validated.content,
    userId,
    published: Boolean(existing.row?.published),
    touchDraft: true,
  });
  if (!upserted.ok) return { ok: false, status: upserted.status || 500, error: upserted.error };

  const row = upserted.row;
  return {
    ok: true,
    slug: normalized,
    locale: loc,
    content: mergeWithDefaults(loc, row?.draft_content || validated.content),
    draftUpdatedAt: row?.draft_updated_at || null,
    hasDraftChanges: draftDiffersFromLive(row),
  };
}

async function publishBlogPost({ slug, locale, content, userId }) {
  const normalized = normalizeSlug(slug);
  if (!normalized) return { ok: false, status: 400, error: "Invalid slug." };
  const loc = LOCALES.includes(locale) ? locale : "en";

  const existing = await fetchBlogRow(normalized, loc);
  if (!existing.ok) return { ok: false, status: existing.status || 500, error: existing.error };

  let finalContent = content;
  if (finalContent == null && existing.row?.draft_content) {
    finalContent = existing.row.draft_content;
  } else if (finalContent == null && existing.row?.content) {
    finalContent = existing.row.content;
  }
  const validated = normalizePostContent(finalContent, loc);
  if (validated.error) return { ok: false, status: 400, error: validated.error };

  const upserted = await upsertBlogRow({
    slug: normalized,
    locale: loc,
    content: validated.content,
    userId,
    published: true,
    touchPublished: true,
    clearDraft: true,
  });
  if (!upserted.ok) return { ok: false, status: upserted.status || 500, error: upserted.error };

  const row = upserted.row;
  return {
    ok: true,
    slug: normalized,
    locale: loc,
    content: mergeWithDefaults(loc, row?.content),
    publishedAt: row?.published_at || null,
    hasDraftChanges: false,
  };
}

async function discardBlogDraft({ slug, locale, userId }) {
  const normalized = normalizeSlug(slug);
  if (!normalized) return { ok: false, status: 400, error: "Invalid slug." };
  const loc = LOCALES.includes(locale) ? locale : "en";
  const existing = await fetchBlogRow(normalized, loc);
  if (!existing.ok) return { ok: false, status: existing.status || 500, error: existing.error };
  if (!existing.row) return { ok: false, status: 404, error: "Post not found." };

  const upserted = await upsertBlogRow({
    slug: normalized,
    locale: loc,
    content: existing.row.content,
    userId,
    published: Boolean(existing.row.published),
    clearDraft: true,
  });
  if (!upserted.ok) return { ok: false, status: upserted.status || 500, error: upserted.error };

  return {
    ok: true,
    slug: normalized,
    locale: loc,
    content: mergeWithDefaults(loc, existing.row.content),
    hasDraftChanges: false,
  };
}

async function createBlogPost({ slug, locale, content, userId, publish = false }) {
  const normalized = normalizeSlug(slug);
  if (!normalized) return { ok: false, status: 400, error: "Invalid slug." };
  const loc = LOCALES.includes(locale) ? locale : "en";
  const existing = await fetchBlogRow(normalized, loc);
  if (!existing.ok) return { ok: false, status: existing.status || 500, error: existing.error };
  if (existing.row) return { ok: false, status: 409, error: "A post with this slug already exists." };

  const validated = normalizePostContent(content, loc);
  if (validated.error) return { ok: false, status: 400, error: validated.error };

  const upserted = await upsertBlogRow({
    slug: normalized,
    locale: loc,
    content: validated.content,
    userId,
    published: publish === true,
    touchPublished: publish === true,
  });
  if (!upserted.ok) return { ok: false, status: upserted.status || 500, error: upserted.error };

  return {
    ok: true,
    slug: normalized,
    locale: loc,
    content: validated.content,
    published: publish === true,
    publishedAt: upserted.row?.published_at || null,
  };
}

async function fetchPublishedBlogSitemapEntries() {
  const entries = [];
  for (const locale of LOCALES) {
    const fetched = await fetchBlogRows({ locale, publishedOnly: true, limit: 500, offset: 0 });
    if (!fetched.ok) continue;
    for (const row of fetched.rows) {
      const prefix = locale === "ar" ? "/ar/blog/" : "/blog/";
      entries.push({
        path: `${prefix}${row.slug}`,
        lastmod: row.published_at || row.updated_at || "",
      });
    }
  }
  return entries;
}

module.exports = {
  LOCALES,
  fetchBlogRow,
  fetchBlogRows,
  deleteBlogRow,
  loadPublicPost,
  loadPublicPosts,
  loadBlogAdminPost,
  getBlogAdminOverview,
  saveBlogDraft,
  publishBlogPost,
  discardBlogDraft,
  createBlogPost,
  fetchPublishedBlogSitemapEntries,
  normalizeSlug,
};
