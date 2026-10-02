/**
 * POST /api/songs/sign-stream
 * Mint a short-lived signed URL for private song_archive playback (library drafts).
 *
 * Auth: Bearer <supabase access_token>
 * Body: { key: "<uid>/file.ext" }
 */

const { applyCors } = require("../_lib/cors");
const { verifyUser, sendJson, readJsonBody } = require("../_lib/credits-auth");
const {
  cleanArchiveKey,
  mintArchiveStreamQuery,
  userCanStreamArchiveKey,
  userIsAdmin,
} = require("../_lib/storage-private");

module.exports = async function handler(req, res) {
  if (applyCors(req, res)) return;
  if (req.method !== "POST") return sendJson(res, 405, { error: "Method not allowed" });

  const user = await verifyUser(req);
  if (!user) return sendJson(res, 401, { ok: false, error: "Not signed in" });

  const body = await readJsonBody(req);
  const key = cleanArchiveKey(body?.key || "");
  if (!key) return sendJson(res, 400, { ok: false, error: "Invalid key" });

  const songId = String(body?.songId || body?.id || "").trim();
  const admin = await userIsAdmin(user);
  const allowed = await userCanStreamArchiveKey({
    userId: user.userId,
    key,
    songId,
    isAdmin: admin,
  });
  if (!allowed) return sendJson(res, 403, { ok: false, error: "Forbidden" });

  const tok = mintArchiveStreamQuery(key);
  if (!tok) return sendJson(res, 500, { ok: false, error: "Signing unavailable" });

  const playUrl =
    `/api/songs/stream?key=${encodeURIComponent(tok.key)}` +
    `&exp=${encodeURIComponent(String(tok.exp))}&sig=${encodeURIComponent(tok.sig)}`;

  return sendJson(res, 200, { ok: true, playUrl, exp: tok.exp });
};
