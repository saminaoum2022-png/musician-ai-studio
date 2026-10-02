/**
 * Private Supabase Storage buckets (dm_voice, song_archive) — path parsing,
 * access checks, and streaming via service role.
 */

const crypto = require("crypto");
const { Readable } = require("stream");
const { verifyUser } = require("./credits-auth");
const { userIsAdmin } = require("./admin-auth");

const SUPABASE_URL = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const ARCHIVE_KEY_RE = /^[0-9a-f-]{36}\/[^/]+\.[a-z0-9]+$/i;
const VOICE_KEY_RE = /^[0-9a-f-]{36}\/\d+\.[a-z0-9]+$/i;

function streamSignSecret() {
  return String(
    process.env.STREAM_SIGN_SECRET || process.env.CRON_SECRET || SUPABASE_SERVICE_ROLE_KEY || "",
  ).trim();
}

function cleanArchiveKey(v) {
  const key = String(v || "").trim();
  return ARCHIVE_KEY_RE.test(key) ? key : "";
}

function cleanVoiceKey(v) {
  const key = String(v || "").trim();
  return VOICE_KEY_RE.test(key) ? key : "";
}

function keyFromStorageUrl(url, bucket) {
  const b = String(bucket || "").trim();
  const s = String(url || "").trim();
  if (!b || !s) return "";
  const re = new RegExp(`/${b}/([^?]+)`, "i");
  const m = s.match(re);
  if (!m) return "";
  try {
    return decodeURIComponent(m[1]);
  } catch {
    return m[1];
  }
}

function archiveUrlLiteralsForKey(key) {
  const enc = key.split("/").map((p) => encodeURIComponent(p)).join("/");
  const base = SUPABASE_URL;
  if (!base) return [];
  return [
    `${base}/storage/v1/object/public/song_archive/${enc}`,
    `${base}/storage/v1/object/song_archive/${enc}`,
  ];
}

function isArchivedStorageUrl(url) {
  return /\/storage\/v1\/object\/(?:public\/)?song_archive\//i.test(String(url || ""));
}

async function svcFetch(path) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      Accept: "application/json",
    },
  });
  if (!r.ok) return { ok: false, data: null, status: r.status };
  const data = await r.json().catch(() => null);
  return { ok: true, data, status: r.status };
}

async function userCanStreamVoiceKey(userId, key) {
  const uid = String(userId || "").trim();
  const safeKey = String(key || "").trim();
  if (!uid || !safeKey) return false;
  const needle = safeKey.replace(/,/g, "");
  const r = await svcFetch(
    `dm_messages?select=thread_id&body=like.${encodeURIComponent(`%${needle}%`)}&limit=10`,
  );
  const rows = Array.isArray(r.data) ? r.data : [];
  for (const row of rows) {
    const tid = String(row.thread_id || "").trim();
    if (!tid) continue;
    const tr = await svcFetch(
      `dm_threads?select=id,user_a,user_b&id=eq.${encodeURIComponent(tid)}&limit=1`,
    );
    const thread = Array.isArray(tr.data) && tr.data[0] ? tr.data[0] : null;
    if (thread && (thread.user_a === uid || thread.user_b === uid)) return true;
  }
  return false;
}

function songRowDeleted(meta) {
  const m = meta && typeof meta === "object" ? meta : {};
  return Boolean(String(m.deletedAt || m.deleted_at || "").trim());
}

function songIsPublic(row) {
  if (!row) return false;
  if (songRowDeleted(row.meta)) return false;
  if (!row.public_on_profile) return false;
  const pub = String(row.published_at || "").trim();
  return Boolean(pub);
}

async function findUserSongsForArchiveKey(key) {
  const safeKey = cleanArchiveKey(key);
  if (!safeKey) return [];
  const filePart = safeKey.split("/").pop() || "";
  const ownerId = safeKey.split("/")[0] || "";
  const literals = archiveUrlLiteralsForKey(safeKey);
  const orParts = [
    ...literals.map((u) => `song_url.eq.${encodeURIComponent(u)}`),
    `song_url.ilike.${encodeURIComponent(`%${filePart.replace(/,/g, "")}%`)}`,
  ];
  const r = await svcFetch(
    `user_songs?select=id,user_id,public_on_profile,published_at,meta,song_url&or=(${orParts.join(",")})&limit=20`,
  );
  const rows = Array.isArray(r.data) ? r.data : [];
  return rows.filter((row) => {
    const url = String(row.song_url || "");
    if (literals.includes(url)) return true;
    return url.includes(filePart) && String(row.user_id || "") === ownerId;
  });
}

async function userCanStreamArchiveKey({ userId, key, songId, isAdmin }) {
  const safeKey = cleanArchiveKey(key);
  if (!safeKey) return false;
  const ownerId = safeKey.split("/")[0] || "";
  if (isAdmin) return true;
  if (userId && userId === ownerId) return true;

  let rows = [];
  const sid = String(songId || "").trim();
  if (UUID_RE.test(sid)) {
    const one = await svcFetch(
      `user_songs?select=id,user_id,public_on_profile,published_at,meta,song_url&id=eq.${encodeURIComponent(sid)}&limit=1`,
    );
    if (Array.isArray(one.data) && one.data[0]) rows = [one.data[0]];
  }
  if (!rows.length) rows = await findUserSongsForArchiveKey(safeKey);
  if (!rows.length) return false;

  function urlMatchesArchiveKey(songUrl) {
    const url = String(songUrl || "");
    const literals = archiveUrlLiteralsForKey(safeKey);
    if (literals.includes(url)) return true;
    return url.includes(safeKey.split("/").pop() || "");
  }

  if (sid) {
    const match = rows.find((r) => String(r.id) === sid);
    if (!match) return false;
    if (!urlMatchesArchiveKey(match.song_url)) return false;
    if (userId && String(match.user_id || "") === userId) return true;
    if (songIsPublic(match)) return true;
    // Same as GET /api/songs/shared — anyone with the song UUID can play.
    return true;
  }

  for (const row of rows) {
    if (!urlMatchesArchiveKey(row.song_url)) continue;
    if (userId && String(row.user_id || "") === userId) return true;
    if (songIsPublic(row)) return true;
  }
  return false;
}

function mintStreamSig(scope, expSec) {
  const secret = streamSignSecret();
  if (!secret) return "";
  return crypto.createHmac("sha256", secret).update(`${scope}\n${expSec}`).digest("base64url");
}

function verifyStreamSig(scope, expSec, sig) {
  const secret = streamSignSecret();
  if (!secret || !sig) return false;
  const exp = Number(expSec) || 0;
  if (!exp || Math.floor(Date.now() / 1000) > exp) return false;
  const expected = mintStreamSig(scope, exp);
  try {
    return crypto.timingSafeEqual(Buffer.from(String(sig)), Buffer.from(String(expected)));
  } catch {
    return false;
  }
}

function mintVoiceStreamQuery(key, ttlSec = 3600) {
  const k = cleanVoiceKey(key);
  if (!k) return null;
  const exp = Math.floor(Date.now() / 1000) + Math.min(7200, Math.max(60, ttlSec));
  const sig = mintStreamSig(`voice:${k}`, exp);
  if (!sig) return null;
  return { key: k, exp, sig };
}

async function streamStorageObject(res, { bucket, key, sendJson }) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return sendJson(res, 500, { ok: false, error: "Server not configured" });
  }
  const encKey = key.split("/").map((s) => encodeURIComponent(s)).join("/");
  const upstream = await fetch(`${SUPABASE_URL}/storage/v1/object/${bucket}/${encKey}`, {
    method: "GET",
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    },
  });
  if (!upstream.ok || !upstream.body) {
    const txt = await upstream.text().catch(() => "");
    return sendJson(res, upstream.status === 404 ? 404 : 502, {
      ok: false,
      error: upstream.status === 404 ? "File not found" : "Storage fetch failed",
      details: txt.slice(0, 200),
    });
  }
  res.statusCode = 200;
  res.setHeader("Content-Type", upstream.headers.get("content-type") || "application/octet-stream");
  res.setHeader("Cache-Control", "private, max-age=300");
  const cl = upstream.headers.get("content-length");
  if (cl) res.setHeader("Content-Length", cl);
  try {
    const nodeStream = Readable.fromWeb(upstream.body);
    nodeStream.on("error", () => {
      try {
        if (!res.writableEnded) res.end();
      } catch {}
    });
    res.on("close", () => {
      try {
        nodeStream.destroy();
      } catch {}
    });
    nodeStream.pipe(res);
  } catch {
    const ab = await upstream.arrayBuffer();
    res.end(Buffer.from(ab));
  }
  return true;
}

async function fetchStorageObjectBuffer(bucket, key, maxBytes = 55 * 1024 * 1024) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("missing_service_role");
  }
  const encKey = key.split("/").map((s) => encodeURIComponent(s)).join("/");
  const r = await fetch(`${SUPABASE_URL}/storage/v1/object/${bucket}/${encKey}`, {
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    },
  });
  if (!r.ok) throw new Error(`storage ${r.status}`);
  const ab = await r.arrayBuffer();
  if (ab.byteLength > maxBytes) throw new Error("asset too large");
  return {
    buffer: Buffer.from(ab),
    contentType: String(r.headers.get("content-type") || "application/octet-stream"),
  };
}

module.exports = {
  SUPABASE_URL,
  cleanArchiveKey,
  cleanVoiceKey,
  keyFromStorageUrl,
  archiveUrlLiteralsForKey,
  isArchivedStorageUrl,
  userCanStreamVoiceKey,
  userCanStreamArchiveKey,
  mintVoiceStreamQuery,
  verifyStreamSig,
  streamStorageObject,
  fetchStorageObjectBuffer,
  verifyUser,
  userIsAdmin,
};
