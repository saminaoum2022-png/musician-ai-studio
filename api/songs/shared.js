/**
 * Public metadata for a shared library track (`/s/:id` → `/#/player?track=UUID`).
 * Uses the service role so recipients do not need to sign in.
 *
 * GET /api/songs/shared?id=<uuid>
 */

const { applyCors } = require("../_lib/cors");
const { sendJson } = require("../_lib/credits-auth");

const SUPABASE_URL = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function svcGet(path) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      Accept: "application/json",
    },
  });
  if (!r.ok) return null;
  const rows = await r.json().catch(() => []);
  return Array.isArray(rows) && rows[0] ? rows[0] : null;
}

module.exports = async function handler(req, res) {
  if (applyCors(req, res)) return;
  if (req.method !== "GET") return sendJson(res, 405, { ok: false, error: "Method not allowed" });
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return sendJson(res, 500, { ok: false, error: "Server not configured" });
  }

  let id = "";
  try {
    const u = new URL(req.url, "http://x");
    id = String(u.searchParams.get("id") || "").trim();
  } catch {}
  if (!UUID_RE.test(id)) return sendJson(res, 400, { ok: false, error: "Invalid song id" });

  const row = await svcGet(
    `user_songs?select=id,user_id,title,art_url,song_url&id=eq.${encodeURIComponent(id)}&limit=1`,
  );
  if (!row?.id || !String(row.song_url || "").trim()) {
    return sendJson(res, 404, { ok: false, error: "Song not found" });
  }

  let creator_username = "";
  const uid = String(row.user_id || "").trim();
  if (uid) {
    const prof = await svcGet(
      `profiles?select=username&user_id=eq.${encodeURIComponent(uid)}&limit=1`,
    );
    creator_username = String(prof?.username || "").trim();
  }

  return sendJson(res, 200, {
    ok: true,
    song: {
      id: row.id,
      user_id: uid,
      title: row.title || "Song",
      art_url: row.art_url || "",
      song_url: row.song_url || "",
      creator_username,
    },
  });
};
