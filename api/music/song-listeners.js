/**
 * Per-song listener analytics for the song OWNER only.
 *
 * GET /api/music/song-listeners?songId=...
 * Requires sign-in. Returns who played the caller's song and how many times,
 * sourced from social_song_plays — the same canonical play log the feed's
 * play counts come from. Provider-neutral path (data is not Suno-specific).
 *
 * Response: {
 *   ok: true,
 *   songId,
 *   totalPlays, uniqueListeners,
 *   listeners: [{ userId, username, avatar, plays, updatedAt }]  // ranked, plays desc
 * }
 */

const { applyCors } = require("../_lib/cors");
const { verifyUser, sendJson, selectFromTable } = require("../_lib/credits-auth");

const MAX_PLAY_ROWS = 5000;

module.exports = async function handler(req, res) {
  if (applyCors(req, res)) return;
  try {
    if (req.method !== "GET") {
      return sendJson(res, 405, { error: "Method not allowed" });
    }

    const url = new URL(req.url, "http://localhost");
    const songId = String(url.searchParams.get("songId") || "").trim();
    if (!songId) return sendJson(res, 400, { error: "Missing songId" });

    const user = await verifyUser(req);
    if (!user?.userId) return sendJson(res, 401, { error: "Sign in required" });

    // Ownership gate — analytics are private to the song owner.
    const songRes = await selectFromTable(
      `user_songs?id=eq.${encodeURIComponent(songId)}&select=id,user_id`,
    );
    const song = Array.isArray(songRes.data) ? songRes.data[0] : null;
    if (!song?.id) return sendJson(res, 404, { error: "Song not found" });
    if (String(song.user_id) !== String(user.userId)) {
      return sendJson(res, 403, { error: "Not your song" });
    }

    // Canonical play log (one row per qualified listen). This is the same
    // source the feed's play counts use, so totals match what the owner sees.
    const playsRes = await selectFromTable(
      `social_song_plays?song_id=eq.${encodeURIComponent(songId)}` +
        `&select=listener_user_id,created_at` +
        `&order=created_at.desc&limit=${MAX_PLAY_ROWS}`,
    );
    const rows = Array.isArray(playsRes.data) ? playsRes.data : [];

    // Aggregate by listener: plays = number of logged listens, updatedAt = most recent.
    let totalPlays = 0;
    const agg = new Map();
    for (const r of rows) {
      const lid = String(r?.listener_user_id || "").trim();
      if (!lid) continue;
      totalPlays += 1;
      const when = r?.created_at || null;
      const cur = agg.get(lid);
      if (cur) {
        cur.plays += 1;
        if (when && (!cur.updatedAt || when > cur.updatedAt)) cur.updatedAt = when;
      } else {
        agg.set(lid, { userId: lid, plays: 1, updatedAt: when });
      }
    }

    const byListener = [...agg.values()].sort((a, b) => {
      if (b.plays !== a.plays) return b.plays - a.plays;
      return String(b.updatedAt || "").localeCompare(String(a.updatedAt || ""));
    });

    // Resolve listener identities (username + avatar).
    let profMap = new Map();
    if (byListener.length) {
      const inList = byListener
        .map((l) => encodeURIComponent(l.userId))
        .join(",");
      const profRes = await selectFromTable(
        `profiles?user_id=in.(${inList})&select=user_id,username,avatar`,
      );
      const profs = Array.isArray(profRes.data) ? profRes.data : [];
      profMap = new Map(profs.map((p) => [String(p.user_id), p]));
    }

    const listeners = byListener.map((l) => {
      const p = profMap.get(l.userId) || {};
      return {
        userId: l.userId,
        username: p.username || "",
        avatar: p.avatar || "",
        plays: l.plays,
        updatedAt: l.updatedAt,
      };
    });

    return sendJson(res, 200, {
      ok: true,
      songId,
      totalPlays,
      uniqueListeners: listeners.length,
      listeners,
    });
  } catch (e) {
    return sendJson(res, 500, { error: e?.message || String(e) });
  }
};
