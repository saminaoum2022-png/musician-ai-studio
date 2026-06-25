/**
 * Per-song listener analytics for the song OWNER only.
 *
 * GET /api/music/song-listeners?songId=...
 * Requires sign-in. Returns who played the caller's song and how many times,
 * sourced from the existing discover_play_counts table. Provider-neutral path
 * (data is not Suno-specific).
 *
 * Response: {
 *   ok: true,
 *   songId, title,
 *   totalPlays, uniqueListeners, listenerCap,
 *   listeners: [{ userId, username, avatar, plays }]  // ranked, plays desc
 * }
 */

const { applyCors } = require("../_lib/cors");
const { verifyUser, sendJson, selectFromTable } = require("../_lib/credits-auth");

const LISTENER_PLAY_CAP = 10;
const MAX_LISTENERS = 500;

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

    const playsRes = await selectFromTable(
      `discover_play_counts?song_id=eq.${encodeURIComponent(songId)}` +
        `&select=listener_id,play_count,updated_at` +
        `&order=play_count.desc&limit=${MAX_LISTENERS}`,
    );
    const rows = Array.isArray(playsRes.data) ? playsRes.data : [];

    let totalPlays = 0;
    const byListener = [];
    for (const r of rows) {
      const lid = String(r?.listener_id || "").trim();
      if (!lid) continue;
      const plays = Math.max(0, Number(r?.play_count) || 0);
      totalPlays += plays;
      byListener.push({ userId: lid, plays, updatedAt: r?.updated_at || null });
    }

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
      listenerCap: LISTENER_PLAY_CAP,
      listeners,
    });
  } catch (e) {
    return sendJson(res, 500, { error: e?.message || String(e) });
  }
};
