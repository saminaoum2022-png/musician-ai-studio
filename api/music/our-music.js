/**
 * "Our Music Together" — a friends-only summary of two people's shared
 * listening: how many Listen Together sessions, the songs from those
 * sessions (used as the "tracklist"), how many days since the first one,
 * and a taste-match built from each person's own published-song style tags.
 *
 * GET /api/music/our-music?userId=<other user's id>
 *
 * Auth required (the caller's own token). Reads `listen_sessions` and
 * `user_songs` with the service role, since RLS denies direct client
 * access to `listen_sessions`.
 */

const { applyCors } = require("../_lib/cors");
const { verifyUser, sendJson, selectFromTable } = require("../_lib/credits-auth");

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TRACKLIST_LIMIT = 5;
const TAG_LIMIT = 6;

function cleanUserId(v) {
  const s = String(v || "").trim().toLowerCase();
  return UUID_RE.test(s) ? s : "";
}

/** Every ended (or live) session between exactly these two people, oldest first. */
async function fetchPairSessions(meId, otherId) {
  const cols = "id,host_user_id,guest_user_id,song_id,song_title,song_cover,song_url,started_at,status";
  const filter =
    `or=(and(host_user_id.eq.${meId},guest_user_id.eq.${otherId}),and(host_user_id.eq.${otherId},guest_user_id.eq.${meId}))`;
  const r = await selectFromTable(
    `listen_sessions?${filter}&select=${cols}&order=started_at.asc&limit=200`,
  );
  if (!r.ok || !Array.isArray(r.data)) return [];
  return r.data;
}

/** Top style tags across a user's own published songs (same idea as the profile's style-chip cloud). */
async function fetchUserTopTags(userId) {
  const r = await selectFromTable(
    `user_songs?user_id=eq.${userId}&public_on_profile=eq.true&select=meta_style_tags:meta->styleTags&limit=200`,
  );
  if (!r.ok || !Array.isArray(r.data)) return new Set();
  const counts = new Map();
  for (const row of r.data) {
    const tags = Array.isArray(row?.meta_style_tags) ? row.meta_style_tags : [];
    for (const raw of tags) {
      const tag = String(raw || "").trim();
      if (!tag) continue;
      counts.set(tag, (counts.get(tag) || 0) + 1);
    }
  }
  return new Set(
    [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([t]) => t),
  );
}

module.exports = async (req, res) => {
  if (applyCors(req, res)) return;
  if (req.method !== "GET") return sendJson(res, 405, { error: "Method not allowed" });

  const auth = await verifyUser(req);
  if (!auth?.userId) return sendJson(res, 401, { error: "Sign in required" });

  const meId = String(auth.userId).toLowerCase();
  const otherId = cleanUserId(req.query?.userId || req.query?.user_id);
  if (!otherId) return sendJson(res, 400, { error: "Missing or invalid userId" });
  if (otherId === meId) return sendJson(res, 400, { error: "Can't build this with yourself" });

  const [sessions, myTags, theirTags] = await Promise.all([
    fetchPairSessions(meId, otherId),
    fetchUserTopTags(meId),
    fetchUserTopTags(otherId),
  ]);

  const sessionCount = sessions.length;
  const firstSessionAt = sessionCount ? sessions[0].started_at : null;

  // "Tracklist": distinct songs from those sessions, ranked by how often they came up.
  const bySong = new Map();
  for (const s of sessions) {
    const id = String(s.song_id || s.song_title || "").trim();
    if (!id) continue;
    const cur = bySong.get(id) || {
      songId: String(s.song_id || ""),
      title: String(s.song_title || "Song"),
      cover: String(s.song_cover || ""),
      url: String(s.song_url || ""),
      count: 0,
      lastAt: s.started_at,
    };
    cur.count += 1;
    cur.lastAt = s.started_at;
    bySong.set(id, cur);
  }
  const tracklist = [...bySong.values()]
    .sort((a, b) => b.count - a.count || new Date(b.lastAt) - new Date(a.lastAt))
    .slice(0, TRACKLIST_LIMIT);

  const sharedTags = [...myTags].filter((t) => theirTags.has(t)).slice(0, TAG_LIMIT);
  const totalTags = new Set([...myTags, ...theirTags]).size;
  const matchPct = totalTags ? Math.round((sharedTags.length / totalTags) * 100) : 0;

  const daysInSync = firstSessionAt
    ? Math.max(0, Math.floor((Date.now() - new Date(firstSessionAt).getTime()) / 86_400_000))
    : 0;

  return sendJson(res, 200, {
    sessionCount,
    daysInSync,
    firstSessionAt,
    tracklist,
    sharedTags,
    matchPct,
    hasHistory: sessionCount > 0,
  });
};
