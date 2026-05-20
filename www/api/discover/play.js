/**
 * Increment Discover survival score (+1 per qualified play).
 *
 * POST /api/discover/play  { songId }
 * Requires sign-in. Owner plays do not count.
 * Each listener may contribute at most LISTENER_PLAY_CAP plays per song.
 */

const { applyCors } = require("../_lib/cors");
const { verifyUser, sendJson, readJsonBody, selectFromTable } = require("../_lib/credits-auth");

const SUPABASE_URL = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const SCORE_CAP = 100;
const LISTENER_PLAY_CAP = 10;

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

async function getListenerPlayCount(songId, listenerId) {
  const path =
    `discover_play_counts?song_id=eq.${encodeURIComponent(songId)}` +
    `&listener_id=eq.${encodeURIComponent(listenerId)}` +
    `&select=play_count`;
  const res = await selectFromTable(path);
  const row = Array.isArray(res.data) ? res.data[0] : null;
  const n = Number(row?.play_count);
  return Number.isFinite(n) ? n : 0;
}

async function bumpListenerPlayCount(songId, listenerId) {
  const existing = await getListenerPlayCount(songId, listenerId);
  const next = existing + 1;
  if (existing === 0) {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/discover_play_counts`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify({
        song_id: songId,
        listener_id: listenerId,
        play_count: 1,
        updated_at: new Date().toISOString(),
      }),
    });
    if (r.ok) return { ok: true, playCount: 1 };
    const err = await r.json().catch(() => ({}));
    if (r.status !== 409 && !/duplicate/i.test(String(err?.message || ""))) {
      return { ok: false };
    }
  }
  const r = await fetch(
    `${SUPABASE_URL}/rest/v1/discover_play_counts?song_id=eq.${encodeURIComponent(songId)}&listener_id=eq.${encodeURIComponent(listenerId)}`,
    {
      method: "PATCH",
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify({
        play_count: next,
        updated_at: new Date().toISOString(),
      }),
    },
  );
  const data = await r.json().catch(() => []);
  const row = Array.isArray(data) ? data[0] : data;
  return { ok: r.ok, playCount: Number(row?.play_count) || next };
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

    const user = await verifyUser(req);
    if (!user?.userId) {
      return sendJson(res, 401, { ok: true, counted: false, reason: "sign_in_required" });
    }

    const rowRes = await selectFromTable(
      `user_songs?id=eq.${encodeURIComponent(songId)}&select=id,user_id,public_on_profile,discover_score,discover_expires_at`,
    );
    const row = Array.isArray(rowRes.data) ? rowRes.data[0] : null;
    if (!row?.id) return sendJson(res, 404, { error: "Song not found" });
    if (!row.public_on_profile) return sendJson(res, 400, { error: "Song not on Discover" });

    if (String(user.userId) === String(row.user_id)) {
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

    const listenerPlays = await getListenerPlayCount(songId, user.userId);
    if (listenerPlays >= LISTENER_PLAY_CAP) {
      return sendJson(res, 200, {
        ok: true,
        counted: false,
        reason: "listener_cap",
        listenerPlays,
        listenerCap: LISTENER_PLAY_CAP,
        discoverScore: score,
      });
    }

    const tracked = await bumpListenerPlayCount(songId, user.userId);
    if (!tracked.ok) return sendJson(res, 502, { error: "Could not record listener play" });

    const next = Math.min(SCORE_CAP, score + 1);
    const up = await patchSong(songId, { discover_score: next });
    if (!up.ok) return sendJson(res, 502, { error: "Could not update score" });

    return sendJson(res, 200, {
      ok: true,
      counted: true,
      discoverScore: next,
      survived: next >= 0,
      listenerPlays: tracked.playCount,
      listenerCap: LISTENER_PLAY_CAP,
    });
  } catch (e) {
    return sendJson(res, 500, { error: e?.message || String(e) });
  }
};
