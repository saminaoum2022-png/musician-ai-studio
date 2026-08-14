/**
 * GET /api/music/pro-singers — public roster of approved active singers
 */

const {
  verifyUser,
  selectFromTable,
  sendJson,
  setCors,
} = require("../_lib/credits-auth");

function mapSinger(row, profile) {
  return {
    userId: row.user_id,
    displayName: row.display_name || profile?.display_name || profile?.username || "Singer",
    instagram: row.instagram || "",
    languages: row.languages || "",
    genres: row.genres || "",
    bio: row.bio || "",
    avatar: row.photo_url || profile?.avatar || "",
    username: profile?.username || "",
    featured: Boolean(row.featured),
  };
}

module.exports = async function handler(req, res) {
  setCors(res);
  if (req.method === "OPTIONS") return res.end();
  if (req.method !== "GET") return sendJson(res, 405, { error: "Method not allowed" });

  const user = await verifyUser(req);
  if (!user) return sendJson(res, 401, { error: "Sign in to continue." });

  const rosterRes = await selectFromTable(
    "pro_singers?select=*&active=eq.true&order=featured.desc,sort_order.asc,approved_at.desc&limit=100",
  );
  const roster = Array.isArray(rosterRes.data) ? rosterRes.data : [];
  if (!roster.length) return sendJson(res, 200, { singers: [] });

  const ids = roster.map((r) => r.user_id).filter(Boolean);
  const inList = ids.map((id) => encodeURIComponent(id)).join(",");
  const profRes = inList
    ? await selectFromTable(`profiles?select=user_id,username,display_name,avatar&user_id=in.(${inList})`)
    : { data: [] };
  const profiles = Array.isArray(profRes.data) ? profRes.data : [];
  const profileMap = new Map(profiles.map((p) => [p.user_id, p]));

  return sendJson(res, 200, {
    singers: roster.map((row) => mapSinger(row, profileMap.get(row.user_id))),
  });
};
