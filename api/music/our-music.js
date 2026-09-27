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
 * access to `listen_sessions`. Stats (including the cover's "tier") are
 * computed in api/_lib/our-music-stats.js, shared with our-music-cover.js
 * so the two endpoints can never disagree on the truth.
 */

const { applyCors } = require("../_lib/cors");
const { verifyUser, sendJson } = require("../_lib/credits-auth");
const { computeOurMusicStats } = require("../_lib/our-music-stats");

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function cleanUserId(v) {
  const s = String(v || "").trim().toLowerCase();
  return UUID_RE.test(s) ? s : "";
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

  const stats = await computeOurMusicStats(meId, otherId);
  return sendJson(res, 200, stats);
};
