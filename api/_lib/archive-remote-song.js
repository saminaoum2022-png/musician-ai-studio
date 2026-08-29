/**
 * Copy remote audio into Supabase song_archive and optionally patch user_songs.
 */
const { uploadObject, patchUserSongUrl } = require("./supabase-storage");
const { pickSunoClipAudioUrl, sunoClipAudioUrlCandidates } = require("./suno-upstream");

const BUCKET = "song_archive";
const MAX_AUDIO_BYTES = 50 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 45000;

function unwrapProxyUrl(raw, base = "https://www.nabadai.com") {
  let cur = String(raw || "").trim();
  if (!cur) return "";
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

function needsPublishedArchiveBackfill(songUrl) {
  const s = String(songUrl || "").trim();
  if (!s) return false;
  if (isArchivedStorageUrl(s)) return false;
  if (/\/api\/suno\/audio/i.test(s)) return true;
  try {
    const host = new URL(s).hostname.toLowerCase();
    if (host === "suno.ai" || host.endsWith(".suno.ai") || host.includes("audioprod")) return true;
  } catch {}
  return false;
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

async function resolveArchiveSource({ sourceUrl, taskId, audioId }) {
  let source = unwrapProxyUrl(sourceUrl);
  if (source && isArchivedStorageUrl(source)) {
    return { source, alreadyArchived: true, fetchCandidates: [] };
  }
  const tid = String(taskId || "").trim();
  const aid = String(audioId || "").trim();
  let fetchCandidates = source && /^https?:\/\//i.test(source) ? [source] : [];
  if (tid) {
    const apiKey = process.env.SUNO_API_KEY;
    if (!apiKey) throw new Error("missing_suno_key");
    const r = await fetch(
      `https://api.sunoapi.org/api/v1/generate/record-info?taskId=${encodeURIComponent(tid)}`,
      { headers: { Authorization: `Bearer ${apiKey}` } },
    );
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error("suno_status_failed");
    const st = String(data?.data?.status || data?.status || "").toUpperCase();
    if (st !== "SUCCESS") throw new Error("suno_not_ready");
    const clips = data?.data?.response?.sunoData || data?.data?.response?.suno_data || [];
    const arr = Array.isArray(clips) ? clips : [];
    let matchedClip = null;
    if (aid) {
      for (const clip of arr) {
        const cid = String(clip?.id || clip?.audioId || clip?.audio_id || "").trim();
        if (cid && cid === aid) {
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
    return { source, alreadyArchived: true, fetchCandidates: [] };
  }
  return { source, fetchCandidates, taskId: tid, audioId: aid };
}

async function patchUserSongById(songId, songUrl) {
  const SUPABASE_URL = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!SUPABASE_URL || !key || !songId) return { ok: false, error: "missing_patch_ref" };
  try {
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/user_songs?id=eq.${encodeURIComponent(String(songId))}`,
      {
        method: "PATCH",
        headers: {
          apikey: key,
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
          Prefer: "return=minimal",
        },
        body: JSON.stringify({ song_url: songUrl }),
      },
    );
    if (!r.ok) {
      const t = await r.text().catch(() => "");
      return { ok: false, status: r.status, error: t.slice(0, 200) };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e?.message || String(e) };
  }
}

async function archiveRemoteSongToStorage({
  userId,
  songId = "",
  sourceUrl,
  taskId = "",
  audioId = "",
  libraryLocalId = "",
}) {
  const resolved = await resolveArchiveSource({ sourceUrl, taskId, audioId });
  if (resolved.alreadyArchived) {
    return {
      ok: true,
      permanentUrl: resolved.source,
      alreadyArchived: true,
      cloudPatched: false,
    };
  }

  const fetchCandidates = [
    ...(Array.isArray(resolved.fetchCandidates) ? resolved.fetchCandidates : []),
    resolved.source,
  ];
  const { buffer, contentType, urlUsed } = await fetchAudioBufferFromCandidates(fetchCandidates);
  const ext = extFromContentType(contentType, urlUsed || resolved.source);
  const fileStem =
    safePathSegment(audioId) ||
    safePathSegment(taskId) ||
    safePathSegment(libraryLocalId) ||
    safePathSegment(songId) ||
    `${Date.now()}`;
  const storageKey = `${userId}/${fileStem}.${ext}`;

  const up = await uploadObject({
    bucket: BUCKET,
    key: storageKey,
    body: buffer,
    contentType: contentType.includes("audio") ? contentType.split(";")[0] : `audio/${ext === "mp3" ? "mpeg" : ext}`,
  });
  if (!up.ok) {
    return { ok: false, error: up.error || "upload_failed", status: up.status || 502 };
  }

  const permanentUrl = up.url;
  let cloudPatch = { ok: false };
  if (songId) {
    cloudPatch = await patchUserSongById(songId, permanentUrl);
  } else {
    cloudPatch = await patchUserSongUrl({
      userId,
      audioId,
      taskId,
      songUrl: permanentUrl,
    });
  }

  return {
    ok: true,
    permanentUrl,
    storageKey,
    cloudPatched: Boolean(cloudPatch?.ok),
    sourceUsed: urlUsed || resolved.source,
  };
}

async function fetchPublishedSongsNeedingArchive(serviceFetch) {
  const pageSize = 500;
  let offset = 0;
  const out = [];
  while (true) {
    const path =
      `user_songs?select=id,user_id,title,song_url,task_id,audio_id,published_at,created_at` +
      `&public_on_profile=eq.true&order=published_at.desc.nullslast,created_at.desc&limit=${pageSize}&offset=${offset}`;
    const res = await serviceFetch(path);
    const rows = Array.isArray(res.data) ? res.data : [];
    for (const row of rows) {
      if (needsPublishedArchiveBackfill(row.song_url)) out.push(row);
    }
    if (rows.length < pageSize) break;
    offset += pageSize;
  }
  return out;
}

async function backfillPublishedSongArchives({ dryRun = false, limit = 0 } = {}) {
  const SUPABASE_URL = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!SUPABASE_URL || !key) throw new Error("missing_supabase_service_role");

  async function serviceFetch(path) {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        Accept: "application/json",
      },
    });
    const data = await r.json().catch(() => null);
    return { ok: r.ok, status: r.status, data };
  }

  const rows = await fetchPublishedSongsNeedingArchive(serviceFetch);
  const targets = limit > 0 ? rows.slice(0, limit) : rows;
  const results = [];

  for (const row of targets) {
    const item = {
      id: row.id,
      title: row.title,
      userId: row.user_id,
      taskId: row.task_id || "",
      audioId: row.audio_id || "",
    };
    if (dryRun) {
      item.status = "dry_run";
      results.push(item);
      continue;
    }
    try {
      const archived = await archiveRemoteSongToStorage({
        userId: row.user_id,
        songId: row.id,
        sourceUrl: row.song_url,
        taskId: row.task_id || "",
        audioId: row.audio_id || "",
      });
      item.ok = archived.ok;
      item.permanentUrl = archived.permanentUrl || "";
      item.alreadyArchived = Boolean(archived.alreadyArchived);
      item.cloudPatched = Boolean(archived.cloudPatched);
      item.status = archived.ok ? "archived" : "failed";
      if (!archived.ok) item.error = archived.error || "archive_failed";
    } catch (e) {
      item.ok = false;
      item.status = "failed";
      item.error = e?.message || String(e);
    }
    results.push(item);
  }

  return {
    ok: true,
    dryRun,
    candidates: rows.length,
    processed: results.length,
    archived: results.filter((r) => r.status === "archived" && !r.alreadyArchived).length,
    alreadyArchived: results.filter((r) => r.alreadyArchived).length,
    failed: results.filter((r) => r.status === "failed").length,
    results,
  };
}

module.exports = {
  BUCKET,
  unwrapProxyUrl,
  isArchivedStorageUrl,
  needsPublishedArchiveBackfill,
  archiveRemoteSongToStorage,
  backfillPublishedSongArchives,
};
