/**
 * Shared, server-authoritative stats for "Our Music Together" — used by both
 * the data endpoint (api/music/our-music.js) and the cover-art endpoint
 * (api/music/our-music-cover.js) so the generated cover's "tier" can never be
 * spoofed by a client-supplied query param: it's always recomputed here from
 * real listen_sessions rows.
 */

const { selectFromTable } = require("./credits-auth");

const TRACKLIST_LIMIT = 5;
const TAG_LIMIT = 6;

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

/** The cover's visual "tier" — grows the longer + more consistently a pair stays in sync.
 *  Thresholds are in days-in-sync (time since their first Listen Together session). */
const OUR_MUSIC_TIERS = [
  { id: "spark", minDays: 0, label: "Spark" },
  { id: "glow", minDays: 7, label: "Glow" },
  { id: "constellation", minDays: 30, label: "Constellation" },
  { id: "aurora", minDays: 90, label: "Aurora" },
];

function ourMusicTierForDays(daysInSync) {
  const d = Math.max(0, Number(daysInSync) || 0);
  let cur = OUR_MUSIC_TIERS[0];
  for (const t of OUR_MUSIC_TIERS) if (d >= t.minDays) cur = t;
  return cur;
}

function ourMusicNextTier(daysInSync) {
  const d = Math.max(0, Number(daysInSync) || 0);
  return OUR_MUSIC_TIERS.find((t) => t.minDays > d) || null;
}

/** Full stats for a pair, computed fresh from real session/tag rows — never trust a
 *  client-supplied number for anything that affects the generated cover's tier. */
async function computeOurMusicStats(meId, otherId) {
  const [sessions, myTags, theirTags] = await Promise.all([
    fetchPairSessions(meId, otherId),
    fetchUserTopTags(meId),
    fetchUserTopTags(otherId),
  ]);

  const sessionCount = sessions.length;
  const firstSessionAt = sessionCount ? sessions[0].started_at : null;

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

  // Streak: consecutive rolling 7-day windows, counting back from right now, with at
  // least one session — relative to "now" rather than fixed calendar-epoch weeks, so a
  // session yesterday always counts toward week 0 instead of possibly landing on the
  // wrong side of an arbitrary bucket boundary.
  const weekMs = 7 * 86_400_000;
  const now = Date.now();
  const weeksAgoWithSession = new Set(
    sessions.map((s) => Math.floor((now - new Date(s.started_at).getTime()) / weekMs)),
  );
  let streakWeeks = 0;
  for (let w = 0; weeksAgoWithSession.has(w); w++) streakWeeks += 1;

  const tier = ourMusicTierForDays(daysInSync);
  const nextTier = ourMusicNextTier(daysInSync);

  return {
    sessionCount,
    daysInSync,
    streakWeeks,
    firstSessionAt,
    tracklist,
    sharedTags,
    matchPct,
    hasHistory: sessionCount > 0,
    tier: tier.id,
    tierLabel: tier.label,
    nextTierId: nextTier?.id || null,
    nextTierLabel: nextTier?.label || null,
    daysToNextTier: nextTier ? Math.max(0, nextTier.minDays - daysInSync) : 0,
  };
}

module.exports = {
  computeOurMusicStats,
  ourMusicTierForDays,
  ourMusicNextTier,
  OUR_MUSIC_TIERS,
};
