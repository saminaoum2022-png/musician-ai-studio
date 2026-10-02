/**
 * GET /api/songs/stream?key=<uid/file.ext>&songId=<uuid?>
 *
 * Streams song_archive objects after access check. Works with <audio src>
 * (no Authorization header) when songId matches a public or owned row.
 */

const { applyCors } = require("../_lib/cors");
const { sendJson } = require("../_lib/credits-auth");
const {
  cleanArchiveKey,
  userCanStreamArchiveKey,
  streamStorageObject,
  verifyStreamSig,
  verifyUser,
  userIsAdmin,
} = require("../_lib/storage-private");

const BUCKET = "song_archive";

module.exports = async function handler(req, res) {
  if (applyCors(req, res)) return;
  if (req.method !== "GET") return sendJson(res, 405, { error: "Method not allowed" });

  let key = "";
  let songId = "";
  try {
    const u = new URL(req.url, "http://localhost");
    key = cleanArchiveKey(u.searchParams.get("key") || "");
    songId = String(u.searchParams.get("songId") || u.searchParams.get("id") || "").trim();
  } catch {}

  if (!key) return sendJson(res, 400, { ok: false, error: "Invalid key" });

  let exp = "";
  let sig = "";
  try {
    const u = new URL(req.url, "http://localhost");
    exp = String(u.searchParams.get("exp") || "");
    sig = String(u.searchParams.get("sig") || "");
  } catch {}
  if (exp && sig && verifyStreamSig(`archive:${key}`, exp, sig)) {
    await streamStorageObject(res, { bucket: BUCKET, key, sendJson });
    return;
  }

  const user = await verifyUser(req);
  const admin = user ? await userIsAdmin(user) : false;
  const allowed = await userCanStreamArchiveKey({
    userId: user?.userId || "",
    key,
    songId,
    isAdmin: admin,
  });
  if (!allowed) return sendJson(res, 403, { ok: false, error: "Forbidden" });

  await streamStorageObject(res, { bucket: BUCKET, key, sendJson });
};
