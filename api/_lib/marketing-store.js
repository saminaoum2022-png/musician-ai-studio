/**
 * Marketing CMS — Supabase persistence (service role).
 */

const { mergeWithDefaults, normalizeContent } = require("./marketing-content");

const SUPABASE_URL = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

async function fetchMarketingRow(pageKey, locale) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return { ok: false, status: 500, row: null };
  }
  const page = encodeURIComponent(String(pageKey || "").trim().toLowerCase());
  const loc = encodeURIComponent(String(locale || "en").trim().toLowerCase());
  try {
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/marketing_pages?page_key=eq.${page}&locale=eq.${loc}&select=page_key,locale,content,published,updated_at,updated_by&limit=1`,
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

async function upsertMarketingRow({ pageKey, locale, content, userId, published = true }) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return { ok: false, status: 500 };
  }
  const row = {
    page_key: String(pageKey || "").trim().toLowerCase(),
    locale: String(locale || "en").trim().toLowerCase(),
    content,
    published: published !== false,
    updated_at: new Date().toISOString(),
    updated_by: userId || null,
  };
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
  if (!row || (!includeUnpublished && row.published === false)) {
    return {
      ok: true,
      page,
      locale: loc,
      content: mergeWithDefaults(page, loc, null),
      source: "defaults",
      updatedAt: null,
    };
  }
  return {
    ok: true,
    page,
    locale: loc,
    content: mergeWithDefaults(page, loc, row.content),
    source: "database",
    updatedAt: row.updated_at || null,
    published: row.published !== false,
  };
}

async function saveMarketingContent({ pageKey, locale, content, userId }) {
  const page = String(pageKey || "home").trim().toLowerCase();
  const loc = String(locale || "en").trim().toLowerCase();
  const normalized = normalizeContent(page, loc, content);
  if (normalized.error) return { ok: false, status: 400, error: normalized.error };

  const saved = await upsertMarketingRow({
    pageKey: page,
    locale: loc,
    content: normalized.content,
    userId,
    published: true,
  });
  if (!saved.ok) {
    return {
      ok: false,
      status: saved.status || 500,
      error: "Could not save marketing content. Run supabase/marketing_pages.sql if the table is missing.",
    };
  }
  return {
    ok: true,
    page,
    locale: loc,
    content: normalized.content,
    updatedAt: saved.row?.updated_at || new Date().toISOString(),
  };
}

module.exports = {
  loadMarketingContent,
  saveMarketingContent,
};
