/**
 * Supabase Storage helpers (service role) for server-side uploads.
 */

const SUPABASE_URL = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

function publicObjectUrl(bucket, objectKey) {
  const enc = objectKey.split("/").map((s) => encodeURIComponent(s)).join("/");
  return `${SUPABASE_URL}/storage/v1/object/public/${bucket}/${enc}`;
}

async function uploadObject({ bucket, key, body, contentType }) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return { ok: false, status: 500, error: "Missing SUPABASE_SERVICE_ROLE_KEY on server" };
  }
  const encKey = key.split("/").map((s) => encodeURIComponent(s)).join("/");
  try {
    const r = await fetch(`${SUPABASE_URL}/storage/v1/object/${bucket}/${encKey}`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        "Content-Type": contentType || "audio/mpeg",
        "x-upsert": "true",
        "Cache-Control": "public, max-age=31536000, immutable",
      },
      body,
    });
    const text = await r.text().catch(() => "");
    if (!r.ok) {
      return { ok: false, status: r.status, error: text.slice(0, 400) || `upload ${r.status}` };
    }
    return { ok: true, url: publicObjectUrl(bucket, key) };
  } catch (e) {
    return { ok: false, status: 500, error: e?.message || String(e) };
  }
}

async function patchUserSongUrl({ userId, audioId, taskId, songUrl }) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return { ok: false, error: "missing_service_role" };
  }
  const uid = encodeURIComponent(String(userId || ""));
  const aid = String(audioId || "").trim();
  const tid = String(taskId || "").trim();
  let filter = "";
  if (aid) filter = `user_id=eq.${uid}&audio_id=eq.${encodeURIComponent(aid)}`;
  else if (tid) filter = `user_id=eq.${uid}&task_id=eq.${encodeURIComponent(tid)}`;
  else return { ok: false, error: "no_row_ref" };

  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/user_songs?${filter}`, {
      method: "PATCH",
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({ song_url: songUrl }),
    });
    if (!r.ok) {
      const t = await r.text().catch(() => "");
      return { ok: false, status: r.status, error: t.slice(0, 200) };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e?.message || String(e) };
  }
}

module.exports = {
  SUPABASE_URL,
  publicObjectUrl,
  uploadObject,
  patchUserSongUrl,
};
