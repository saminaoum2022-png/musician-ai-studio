/**
 * Archive a Suno (or other remote) audio URL into Supabase Storage.
 *
 * POST /api/songs/archive
 *   Authorization: Bearer <supabase access token>
 *   { sourceUrl, taskId?, audioId?, libraryLocalId? }
 *
 * Returns { ok, permanentUrl, storageKey, alreadyArchived? }
 *
 * Env: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
 */

const { applyCors } = require("../_lib/cors");
const { verifyUser, sendJson, readJsonBody } = require("../_lib/credits-auth");
const { uploadObject, patchUserSongUrl } = require("../_lib/supabase-storage");
const { pickSunoClipAudioUrl, sunoClipAudioUrlCandidates } = require("../_lib/suno-upstream");

const BUCKET = "song_archive";
/** Must match `file_size_limit` on storage.buckets `song_archive` (50 MB). */
const MAX_AUDIO_BYTES = 50 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 45000;

function unwrapProxyUrl(raw) {
  let cur = String(raw || "").trim();
  if (!cur) return "";
  const base = (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "https://nabadai.com");
  for (let i = 0; i < 8; i++) {
    if (!cur.toLowerCase().includes("api/suno/audio")) break;
    try {
      const u = /^https?:\/\//i.test(cur) ? new URL(cur) : new URL(cur, base);
      const inner = u.searchParams.get("url");
      if (!inner) break;
      cur = inner.includes("%") ? decodeURIComponent(inner) : inner;
    } catch {
      break;
    }
  }
  return cur.trim();
}

function isArchivedStorageUrl(url) {
  return /\/storage\/v1\/object\/public\/song_archive\//i.test(String(url || ""));
}

function safePathSegment(s) {
  return String(s || "")
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .slice(0, 120) || "";
}

function extFromContentType(ct, url) {
  const lower = String(ct || "").toLowerCase();
  if (lower.includes("mpeg") || lower.includes("mp3")) return "mp3";
  if (lower.includes("mp4") || lower.includes("m4a")) return "m4a";
  if (lower.includes("wav")) return "wav";
  if (lower.includes("webm")) return "webm";
  if (lower.includes("ogg")) return "ogg";
  try {
    const m = new URL(url).pathname.match(/\.(mp3|m4a|wav|webm|ogg)$/i);
    if (m) return m[1].toLowerCase();
  } catch {}
  return "mp3";
}

async function fetchAudioBuffer(url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const r = await fetch(url, { signal: ctrl.signal, redirect: "follow" });
    clearTimeout(timer);
    if (!r.ok) throw new Error(`upstream ${r.status}`);
    const len = Number(r.headers.get("content-length") || 0);
    if (len && len > MAX_AUDIO_BYTES) throw new Error("audio_too_large");
    const ab = await r.arrayBuffer();
    if (ab.byteLength > MAX_AUDIO_BYTES) throw new Error("audio_too_large");
    if (ab.byteLength < 1024) throw new Error("audio_too_small");
    const ct = String(r.headers.get("content-type") || "").toLowerCase();
    return { buffer: Buffer.from(ab), contentType: ct || "audio/mpeg", urlUsed: url };
  } catch (e) {
    clearTimeout(timer);
    throw e;
  }
}

async function fetchAudioBufferFromCandidates(urls) {
  const list = [...new Set((urls || []).map((u) => String(u || "").trim()).filter((u) => u.startsWith("http")))];
  if (!list.length) throw new Error("missing_source_url");
  let lastErr;
  for (const url of list) {
    try {
      return await fetchAudioBuffer(url);
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error("fetch_failed");
}

async function resolveSourceUrl(body, userId) {
  let source = unwrapProxyUrl(body?.sourceUrl || body?.source_url || "");
  if (source && isArchivedStorageUrl(source)) {
    return { source, alreadyArchived: true };
  }
  const taskId = String(body?.taskId || body?.task_id || "").trim();
  const audioId = String(body?.audioId || body?.audio_id || "").trim();
  let fetchCandidates = source ? [source] : [];
  if (taskId) {
    const apiKey = process.env.SUNO_API_KEY;
    if (!apiKey) throw new Error("missing_suno_key");
    const r = await fetch(
      `https://api.sunoapi.org/api/v1/generate/record-info?taskId=${encodeURIComponent(taskId)}`,
      { headers: { Authorization: `Bearer ${apiKey}` } },
    );
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error("suno_status_failed");
    const st = String(data?.data?.status || data?.status || "").toUpperCase();
    if (st !== "SUCCESS") throw new Error("suno_not_ready");
    const clips = data?.data?.response?.sunoData || data?.data?.response?.suno_data || [];
    const arr = Array.isArray(clips) ? clips : [];
    let matchedClip = null;
    if (audioId) {
      for (const clip of arr) {
        const cid = String(clip?.id || clip?.audioId || clip?.audio_id || "").trim();
        if (cid && cid === audioId) {
          matchedClip = clip;
          break;
        }
      }
    }
    if (!matchedClip && arr[0]) matchedClip = arr[0];
    if (matchedClip) {
      const kieUrl = pickSunoClipAudioUrl(matchedClip);
      if (kieUrl) source = kieUrl;
      fetchCandidates = sunoClipAudioUrlCandidates(matchedClip);
      if (source && !fetchCandidates.includes(source)) fetchCandidates.unshift(source);
    }
  }
  if (!source || !/^https?:\/\//i.test(source)) {
    throw new Error("missing_source_url");
  }
  if (isArchivedStorageUrl(source)) {
    return { source, alreadyArchived: true };
  }
  return { source, taskId, audioId, userId, fetchCandidates };
}

module.exports = async function handler(req, res) {
  if (applyCors(req, res)) return;
  try {
    if (req.method !== "POST") return sendJson(res, 405, { error: "Method not allowed" });

    const user = await verifyUser(req);
    if (!user) return sendJson(res, 401, { error: "Unauthorized" });

    const body = await readJsonBody(req);
    let resolved;
    try {
      resolved = await resolveSourceUrl(body, user.userId);
    } catch (e) {
      const msg = e?.message || String(e);
      if (msg === "missing_source_url") return sendJson(res, 400, { error: msg });
      if (msg === "audio_too_large") return sendJson(res, 413, { error: msg });
      return sendJson(res, 502, { error: msg });
    }

    if (resolved.alreadyArchived) {
      return sendJson(res, 200, {
        ok: true,
        permanentUrl: resolved.source,
        alreadyArchived: true,
      });
    }

    const audioId = String(body?.audioId || body?.audio_id || resolved.audioId || "").trim();
    const taskId = String(body?.taskId || body?.task_id || resolved.taskId || "").trim();
    const libId = safePathSegment(body?.libraryLocalId || body?.library_local_id || "");
    const fileStem = safePathSegment(audioId) || safePathSegment(taskId) || libId || `${Date.now()}`;
    const fetchCandidates = [
      ...(Array.isArray(resolved.fetchCandidates) ? resolved.fetchCandidates : []),
      resolved.source,
    ];
    const { buffer, contentType, urlUsed } = await fetchAudioBufferFromCandidates(fetchCandidates);
    const ext = extFromContentType(contentType, urlUsed || resolved.source);
    const storageKey = `${user.userId}/${fileStem}.${ext}`;

    const up = await uploadObject({
      bucket: BUCKET,
      key: storageKey,
      body: buffer,
      contentType: contentType.includes("audio") ? contentType.split(";")[0] : `audio/${ext === "mp3" ? "mpeg" : ext}`,
    });
    if (!up.ok) {
      return sendJson(res, up.status || 502, { ok: false, error: up.error || "upload_failed" });
    }

    const permanentUrl = up.url;
    const cloudPatch = await patchUserSongUrl({
      userId: user.userId,
      audioId,
      taskId,
      songUrl: permanentUrl,
    });

    return sendJson(res, 200, {
      ok: true,
      permanentUrl,
      storageKey,
      cloudPatched: Boolean(cloudPatch?.ok),
    });
  } catch (e) {
    return sendJson(res, 500, { error: e?.message || String(e) });
  }
};
