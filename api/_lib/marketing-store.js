/**
 * Marketing CMS — Supabase persistence (service role).
 */

const { mergeWithDefaults, normalizeContent, PAGE_CATALOG, LOCALES, PAGE_KEYS } = require("./marketing-content");

const SUPABASE_URL = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

const MARKETING_ROW_SELECT =
  "page_key,locale,content,draft_content,published,updated_at,draft_updated_at,published_at,updated_by";

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

async function fetchMarketingRow(pageKey, locale) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return { ok: false, status: 500, row: null };
  }
  const page = encodeURIComponent(String(pageKey || "").trim().toLowerCase());
  const loc = encodeURIComponent(String(locale || "en").trim().toLowerCase());
  try {
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/marketing_pages?page_key=eq.${page}&locale=eq.${loc}&select=${MARKETING_ROW_SELECT}&limit=1`,
      {
        headers: {
          apikey: SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        },
      },
    );
    const data = await r.json().catch(() => null);
    if (!r.ok) return { ok: false, status: r.status, row: null, error: data };
    const row = Array.isArray(data) ? data[0] : null;
    return { ok: true, status: 200, row: row || null };
  } catch (e) {
    return { ok: false, status: 500, row: null, error: e?.message || String(e) };
  }
}

async function fetchAllMarketingRows() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return { ok: false, status: 500, rows: [] };
  }
  try {
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/marketing_pages?select=${MARKETING_ROW_SELECT}&order=updated_at.desc`,
      {
        headers: {
          apikey: SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        },
      },
    );
    const data = await r.json().catch(() => null);
    if (!r.ok) return { ok: false, status: r.status, rows: [], error: data };
    return { ok: true, status: 200, rows: Array.isArray(data) ? data : [] };
  } catch (e) {
    return { ok: false, status: 500, rows: [], error: e?.message || String(e) };
  }
}

async function upsertMarketingRow({
  pageKey,
  locale,
  content,
  draftContent,
  userId,
  published = true,
  touchDraft = false,
  touchPublished = false,
  clearDraft = false,
}) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return { ok: false, status: 500 };
  }
  const now = new Date().toISOString();
  const row = {
    page_key: String(pageKey || "").trim().toLowerCase(),
    locale: String(locale || "en").trim().toLowerCase(),
    published: published !== false,
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
  }
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/marketing_pages`, {
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
    if (!r.ok) return { ok: false, status: r.status, data };
    const saved = Array.isArray(data) ? data[0] : data;
    return { ok: true, status: 200, row: saved };
  } catch (e) {
    return { ok: false, status: 500, error: e?.message || String(e) };
  }
}

async function mergeBrandFromHomeEn(content, page, loc) {
  if (page === "home" && loc === "en") return content;
  const homeEn = await fetchMarketingRow("home", "en");
  const homeContent = mergeWithDefaults("home", "en", homeEn.row?.content ?? null);
  if (homeContent.brand) {
    return { ...content, brand: homeContent.brand };
  }
  return content;
}

async function loadMarketingContent(pageKey, locale, { includeUnpublished = false } = {}) {
  const page = String(pageKey || "home").trim().toLowerCase();
  const loc = String(locale || "en").trim().toLowerCase();
  const result = await fetchMarketingRow(page, loc);
  if (!result.ok) {
    return {
      ok: false,
      status: result.status || 500,
      error: "Could not load marketing content.",
    };
  }
  const row = result.row;
  let content;
  let source;
  let updatedAt;
  if (!row || (!includeUnpublished && row.published === false)) {
    content = mergeWithDefaults(page, loc, null);
    source = "defaults";
    updatedAt = null;
  } else {
    content = mergeWithDefaults(page, loc, row.content);
    source = "database";
    updatedAt = row.updated_at || null;
  }

  content = await mergeBrandFromHomeEn(content, page, loc);

  return {
    ok: true,
    page,
    locale: loc,
    content,
    source,
    updatedAt,
    published: row?.published !== false,
    publishedAt: row?.published_at || null,
  };
}

async function loadMarketingAdminContent(pageKey, locale) {
  const page = String(pageKey || "home").trim().toLowerCase();
  const loc = String(locale || "en").trim().toLowerCase();
  const result = await fetchMarketingRow(page, loc);
  if (!result.ok) {
    return {
      ok: false,
      status: result.status || 500,
      error: "Could not load marketing content.",
    };
  }
  const row = result.row;
  const liveContent = mergeWithDefaults(page, loc, row?.content ?? null);
  const hasDraft = draftDiffersFromLive(row);
  const draftRaw = hasDraft ? row.draft_content : null;
  const editContent = mergeWithDefaults(page, loc, draftRaw ?? row?.content ?? null);
  const liveMerged = await mergeBrandFromHomeEn(liveContent, page, loc);
  const editMerged = await mergeBrandFromHomeEn(editContent, page, loc);

  return {
    ok: true,
    page,
    locale: loc,
    content: editMerged,
    liveContent: liveMerged,
    hasDraftChanges: hasDraft,
    source: row ? "database" : "defaults",
    updatedAt: row?.updated_at || null,
    draftUpdatedAt: row?.draft_updated_at || null,
    publishedAt: row?.published_at || row?.updated_at || null,
    published: row?.published !== false,
  };
}

async function getMarketingSiteOverview() {
  const all = await fetchAllMarketingRows();
  if (!all.ok) {
    return { ok: false, status: all.status || 500, error: "Could not load marketing overview." };
  }
  const rows = all.rows || [];
  const rowMap = new Map(rows.map((r) => [`${r.page_key}:${r.locale}`, r]));
  let draftPageCount = 0;
  let lastPublishedAt = null;
  let lastDraftUpdatedAt = null;

  const pages = PAGE_CATALOG.flatMap((meta) =>
    LOCALES.map((loc) => {
      const row = rowMap.get(`${meta.key}:${loc}`) || null;
      const hasDraftChanges = draftDiffersFromLive(row);
      if (hasDraftChanges) draftPageCount += 1;
      const publishedAt = row?.published_at || row?.updated_at || null;
      const draftUpdatedAt = row?.draft_updated_at || null;
      if (publishedAt && (!lastPublishedAt || publishedAt > lastPublishedAt)) {
        lastPublishedAt = publishedAt;
      }
      if (draftUpdatedAt && (!lastDraftUpdatedAt || draftUpdatedAt > lastDraftUpdatedAt)) {
        lastDraftUpdatedAt = draftUpdatedAt;
      }
      return {
        key: meta.key,
        label: meta.label,
        locale: loc,
        path: meta.preview?.[loc] || "/",
        hasDraftChanges,
        publishedAt,
        draftUpdatedAt,
        hasLiveContent: Boolean(row?.content && Object.keys(row.content).length),
      };
    }),
  );

  return {
    ok: true,
    hasDraftChanges: draftPageCount > 0,
    draftPageCount,
    lastPublishedAt,
    lastDraftUpdatedAt,
    pages,
    pageKeys: PAGE_KEYS,
    locales: LOCALES,
    catalog: PAGE_CATALOG,
  };
}

async function saveMarketingDraft({ pageKey, locale, content, userId }) {
  const page = String(pageKey || "home").trim().toLowerCase();
  const loc = String(locale || "en").trim().toLowerCase();
  const normalized = normalizeContent(page, loc, content);
  if (normalized.error) return { ok: false, status: 400, error: normalized.error };

  const existing = await fetchMarketingRow(page, loc);
  const liveContent = existing.row?.content ?? null;
  const saved = await upsertMarketingRow({
    pageKey: page,
    locale: loc,
    content: liveContent ?? {},
    draftContent: normalized.content,
    userId,
    published: existing.row?.published !== false,
    touchDraft: true,
  });
  if (!saved.ok) {
    return {
      ok: false,
      status: saved.status || 500,
      error: "Could not save draft. Run supabase/marketing_pages_draft.sql if draft columns are missing.",
    };
  }
  return {
    ok: true,
    page,
    locale: loc,
    content: normalized.content,
    draftUpdatedAt: saved.row?.draft_updated_at || new Date().toISOString(),
    hasDraftChanges: draftDiffersFromLive(saved.row),
  };
}

async function publishMarketingContent({ pageKey, locale, userId, content = null }) {
  const page = String(pageKey || "home").trim().toLowerCase();
  const loc = String(locale || "en").trim().toLowerCase();
  const existing = await fetchMarketingRow(page, loc);
  let publishContent = content;
  if (publishContent == null) {
    if (existing.row?.draft_content && draftDiffersFromLive(existing.row)) {
      publishContent = existing.row.draft_content;
    } else if (existing.row?.content) {
      publishContent = existing.row.content;
    } else {
      return { ok: false, status: 400, error: "Nothing to publish for this page." };
    }
  }
  const normalized = normalizeContent(page, loc, publishContent);
  if (normalized.error) return { ok: false, status: 400, error: normalized.error };

  const saved = await upsertMarketingRow({
    pageKey: page,
    locale: loc,
    content: normalized.content,
    userId,
    published: true,
    touchPublished: true,
    clearDraft: true,
  });
  if (!saved.ok) {
    return {
      ok: false,
      status: saved.status || 500,
      error: "Could not publish marketing content.",
    };
  }
  return {
    ok: true,
    page,
    locale: loc,
    content: normalized.content,
    publishedAt: saved.row?.published_at || new Date().toISOString(),
    hasDraftChanges: false,
  };
}

async function publishAllMarketingDrafts({ userId }) {
  const all = await fetchAllMarketingRows();
  if (!all.ok) {
    return { ok: false, status: all.status || 500, error: "Could not load drafts." };
  }
  const pending = (all.rows || []).filter((row) => draftDiffersFromLive(row));
  if (!pending.length) {
    return { ok: true, publishedCount: 0, pages: [] };
  }
  const published = [];
  for (const row of pending) {
    const result = await publishMarketingContent({
      pageKey: row.page_key,
      locale: row.locale,
      userId,
      content: row.draft_content,
    });
    if (result.ok) {
      published.push({ page: row.page_key, locale: row.locale });
    }
  }
  return {
    ok: true,
    publishedCount: published.length,
    pages: published,
  };
}

async function discardMarketingDraft({ pageKey, locale, userId }) {
  const page = String(pageKey || "home").trim().toLowerCase();
  const loc = String(locale || "en").trim().toLowerCase();
  const existing = await fetchMarketingRow(page, loc);
  if (!existing.row?.draft_content) {
    return { ok: true, page, locale: loc, discarded: false };
  }
  const saved = await upsertMarketingRow({
    pageKey: page,
    locale: loc,
    content: existing.row.content,
    userId,
    published: existing.row.published !== false,
    clearDraft: true,
  });
  if (!saved.ok) {
    return { ok: false, status: saved.status || 500, error: "Could not discard draft." };
  }
  const liveContent = mergeWithDefaults(page, loc, saved.row?.content ?? null);
  return {
    ok: true,
    page,
    locale: loc,
    content: await mergeBrandFromHomeEn(liveContent, page, loc),
    discarded: true,
    hasDraftChanges: false,
  };
}

async function saveMarketingContent({ pageKey, locale, content, userId }) {
  return publishMarketingContent({ pageKey, locale, content, userId });
}

module.exports = {
  loadMarketingContent,
  loadMarketingAdminContent,
  getMarketingSiteOverview,
  saveMarketingDraft,
  publishMarketingContent,
  publishAllMarketingDrafts,
  discardMarketingDraft,
  saveMarketingContent,
};
