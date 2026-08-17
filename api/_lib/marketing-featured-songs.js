/**
 * Resolve public Discover songs for marketing homepage carousel.
 */

const SUPABASE_URL = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function supaHeaders() {
  if (!SUPABASE_SERVICE_ROLE_KEY) return null;
  return {
    apikey: SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
  };
}

async function supaRows(path) {
  const headers = supaHeaders();
  if (!SUPABASE_URL || !headers) return [];
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers });
    if (!r.ok) return [];
    const data = await r.json().catch(() => []);
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function normalizeSongIds(raw) {
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  const out = [];
  for (const id of raw) {
    const s = String(id || "").trim();
    if (!UUID_RE.test(s) || seen.has(s)) continue;
    seen.add(s);
    out.push(s);
    if (out.length >= 12) break;
  }
  return out;
}

async function resolveFeaturedDiscoverSongs(songIds) {
  const ids = normalizeSongIds(songIds);
  if (!ids.length) return [];

  const inClause = ids.map((id) => encodeURIComponent(id)).join(",");
  const rows = await supaRows(
    `user_songs?select=id,user_id,title,art_url,song_url,meta,public_on_profile&id=in.(${inClause})&public_on_profile=eq.true`,
  );
  const byId = new Map(rows.map((r) => [String(r.id), r]));
  const userIds = [...new Set(rows.map((r) => r.user_id).filter(Boolean))];
  let profileMap = new Map();
  if (userIds.length) {
    const profIn = userIds.map((id) => encodeURIComponent(id)).join(",");
    const profiles = await supaRows(
      `profiles?select=user_id,username,display_name&user_id=in.(${profIn})`,
    );
    profileMap = new Map(profiles.map((p) => [String(p.user_id), p]));
  }

  return ids
    .map((id) => {
      const row = byId.get(id);
      if (!row) return null;
      const prof = profileMap.get(String(row.user_id)) || {};
      const username = String(prof.username || "").trim();
      const songUrl = String(row.song_url || "").trim();
      const meta = row.meta && typeof row.meta === "object" ? row.meta : {};
      const hookRaw = Number(meta.hookStartSec ?? meta.hook_start_sec);
      const hookStartSec = Number.isFinite(hookRaw) && hookRaw >= 0 ? hookRaw : 0;
      const previewUrl = /^https?:\/\//i.test(songUrl) ? songUrl : "";
      return {
        id: row.id,
        title: String(row.title || "Untitled").trim() || "Untitled",
        artUrl: String(row.art_url || "").trim(),
        username,
        byLine: String(prof.display_name || prof.username || "").trim(),
        shareUrl: `/s/${encodeURIComponent(row.id)}`,
        previewUrl,
        hookStartSec,
      };
    })
    .filter(Boolean);
}

module.exports = {
  normalizeSongIds,
  resolveFeaturedDiscoverSongs,
};
