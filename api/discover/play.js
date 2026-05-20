/**
 * Increment Discover survival score (+1 per qualified play).
 *
 * POST /api/discover/play  { songId }
 * Auth optional; owner plays do not count.
 */

const { applyCors } = require("../_lib/cors");
const { verifyUser, sendJson, readJsonBody, selectFromTable } = require("../_lib/credits-auth");

const SUPABASE_URL = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const SCORE_CAP = 100;

async function patchSong(songId, body) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/user_songs?id=eq.${encodeURIComponent(songId)}`, {
    method: "PATCH",
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify(body),
  });
  const data = await r.json().catch(() => []);
  return { ok: r.ok, data: Array.isArray(data) ? data[0] : data };
}

module.exports = async function handler(req, res) {
  if (applyCors(req, res)) return;
  try {
    if (req.method !== "POST") return sendJson(res, 405, { error: "Method not allowed" });
    if (!SUPABASE_SERVICE_ROLE_KEY) {
      return sendJson(res, 500, { error: "Missing SUPABASE_SERVICE_ROLE_KEY" });
    }

    const body = await readJsonBody(req);
    const songId = String(body?.songId || body?.song_id || "").trim();
    if (!songId) return sendJson(res, 400, { error: "Missing songId" });

    const rowRes = await selectFromTable(
      `user_songs?id=eq.${encodeURIComponent(songId)}&select=id,user_id,public_on_profile,discover_score,discover_expires_at`,
    );
    const row = Array.isArray(rowRes.data) ? rowRes.data[0] : null;
    if (!row?.id) return sendJson(res, 404, { error: "Song not found" });
    if (!row.public_on_profile) return sendJson(res, 400, { error: "Song not on Discover" });

    const user = await verifyUser(req);
    if (user && String(user.userId) === String(row.user_id)) {
      return sendJson(res, 200, { ok: true, counted: false, reason: "owner_play" });
    }

    const expires = row.discover_expires_at ? new Date(row.discover_expires_at).getTime() : 0;
    if (expires && expires < Date.now()) {
      return sendJson(res, 400, { error: "Discover window ended" });
    }

    let score = Number(row.discover_score);
    if (!Number.isFinite(score)) score = -100;
    if (score >= SCORE_CAP) {
      return sendJson(res, 200, { ok: true, discoverScore: score, capped: true });
    }

    const next = Math.min(SCORE_CAP, score + 1);
    const up = await patchSong(songId, { discover_score: next });
    if (!up.ok) return sendJson(res, 502, { error: "Could not update score" });

    return sendJson(res, 200, {
      ok: true,
      counted: true,
      discoverScore: next,
      survived: next >= 0,
    });
  } catch (e) {
    return sendJson(res, 500, { error: e?.message || String(e) });
  }
};
