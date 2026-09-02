/**
 * Resolve provider output clips for admin generation detail + recovery.
 */
const { loadMusicProviderTaskStatus, providerFolder } = require("./music-provider-task-store");
const { publicObjectUrl } = require("./supabase-storage");
const {
  sunoJsonRequest,
  pickSunoClipAudioUrl,
  sunoClipAudioUrlCandidates,
  isSunoMusicGenerationTaskId,
} = require("./suno-upstream");
const { archiveRemoteSongToStorage } = require("./archive-remote-song");

const SONG_ARCHIVE_BUCKET = "song_archive";
const SUPABASE_URL = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

const CLIP_IMAGE_KEYS = ["imageUrl", "image_url", "coverUrl", "cover_url"];

function pickSunoClipImageUrl(clip) {
  if (!clip || typeof clip !== "object") return "";
  for (const key of CLIP_IMAGE_KEYS) {
    const s = String(clip[key] || "").trim();
    if (s.startsWith("http")) return s;
  }
  return "";
}

function clipVariantLabel(index, total) {
  if (total <= 1) return "Output";
  if (index === 0) return "Variant A";
  if (index === 1) return "Variant B";
  return `Clip ${index + 1}`;
}

function parseClipsFromStatusPayload(statusPayload) {
  const clips = statusPayload?.data?.response?.sunoData
    || statusPayload?.data?.response?.suno_data
    || [];
  return Array.isArray(clips) ? clips : [];
}

function extractTaskStatusFromPayload(statusPayload) {
  return String(statusPayload?.data?.status || statusPayload?.status || "").trim().toUpperCase();
}

function extractTaskErrorFromPayload(statusPayload) {
  return String(
    statusPayload?.data?.errorMessage
    || statusPayload?.errorMessage
    || "",
  ).trim();
}

async function probePublicStorageUrl(url) {
  const target = String(url || "").trim();
  if (!target) return "";
  try {
    const r = await fetch(target, { method: "HEAD", cache: "no-store" });
    if (r.ok) return target;
  } catch {}
  return "";
}

async function probeArchivedClipUrls({ userId, taskId, audioId }) {
  const uid = String(userId || "").trim();
  const tid = String(taskId || "").trim();
  const aid = String(audioId || "").trim();
  const keys = [];
  if (aid) {
    keys.push(`${uid}/${aid}.mp3`, `${uid}/${aid}.wav`, `${uid}/${aid}.m4a`);
  }
  if (tid) {
    const folder = providerFolder(tid);
    keys.push(
      `${uid}/${folder}/${tid}.mp3`,
      `${uid}/${folder}/${tid}.wav`,
      `${uid}/${tid}.mp3`,
      `${uid}/${tid}.wav`,
    );
  }
  const seen = new Set();
  const urls = [];
  for (const key of keys) {
    const url = publicObjectUrl(SONG_ARCHIVE_BUCKET, key);
    if (seen.has(url)) continue;
    seen.add(url);
    const hit = await probePublicStorageUrl(url);
    if (hit) urls.push(hit);
  }
  return urls;
}

function clipAudioId(clip, taskId, index) {
  const fromClip = String(clip?.id || clip?.audioId || clip?.audio_id || "").trim();
  if (fromClip) return fromClip;
  const tid = String(taskId || "").trim();
  if (tid.startsWith("lyr_") || tid.startsWith("mmx_") || tid.startsWith("elv_")) {
    return `${tid}_${index === 0 ? "a" : index === 1 ? "b" : index + 1}`;
  }
  return "";
}

async function fetchSunoRecordInfo(taskId) {
  const tid = String(taskId || "").trim();
  if (!tid || !isSunoMusicGenerationTaskId(tid)) return null;
  const apiKey = process.env.SUNO_API_KEY;
  if (!apiKey) return null;
  const upstream = await sunoJsonRequest("/api/v1/generate/record-info", {
    apiKey,
    query: { taskId: tid },
  });
  if (!upstream.ok || !upstream.data) return null;
  return upstream.data;
}

async function buildOutputClip(clip, index, total, { userId, taskId, savedSongs = [] }) {
  const audioId = clipAudioId(clip, taskId, index);
  const upstreamUrl = pickSunoClipAudioUrl(clip);
  const archivedUrls = await probeArchivedClipUrls({ userId, taskId, audioId });
  const playUrl = archivedUrls[0] || upstreamUrl || "";
  const saved = (savedSongs || []).find((s) => {
    if (audioId && s.audioId && s.audioId === audioId) return true;
    if (audioId && s.audio_id && s.audio_id === audioId) return true;
    return false;
  }) || null;

  return {
    index,
    label: clipVariantLabel(index, total),
    audioId,
    title: String(clip?.title || "").trim(),
    imageUrl: pickSunoClipImageUrl(clip),
    playUrl,
    upstreamUrl,
    archivedUrls,
    audioUrlCandidates: [
      ...new Set([
        ...archivedUrls,
        ...sunoClipAudioUrlCandidates(clip),
        upstreamUrl,
      ].filter(Boolean)),
    ],
    savedSongId: saved?.id || "",
    inUserLibrary: Boolean(saved?.id),
    recoverable: Boolean(playUrl || upstreamUrl || audioId),
  };
}

async function resolveGenerationOutput({ userId, taskId, savedSongs = [] }) {
  const uid = String(userId || "").trim();
  const tid = String(taskId || "").trim();
  if (!uid || !tid) {
    return {
      taskStatus: "",
      taskStatusUrl: "",
      taskError: "",
      outputAudioUrl: "",
      outputAudioCandidates: [],
      outputClips: [],
    };
  }

  const folder = providerFolder(tid);
  const taskStatusUrl = publicObjectUrl(SONG_ARCHIVE_BUCKET, `${uid}/${folder}/${tid}.json`);

  const stored = await loadMusicProviderTaskStatus({ userId: uid, taskId: tid }).catch(() => ({ ok: false }));
  const storedPayload = stored.ok ? stored.data : null;

  let statusPayload = storedPayload;
  let taskStatus = extractTaskStatusFromPayload(storedPayload);
  let taskError = extractTaskErrorFromPayload(storedPayload);

  if (isSunoMusicGenerationTaskId(tid)) {
    const sunoPayload = await fetchSunoRecordInfo(tid);
    if (sunoPayload) {
      statusPayload = sunoPayload;
      const upstreamStatus = extractTaskStatusFromPayload(sunoPayload);
      const upstreamError = extractTaskErrorFromPayload(sunoPayload);
      if (upstreamStatus) taskStatus = upstreamStatus;
      if (upstreamError) taskError = upstreamError;
    }
  }

  let rawClips = parseClipsFromStatusPayload(statusPayload);
  if (!rawClips.length && storedPayload && storedPayload !== statusPayload) {
    rawClips = parseClipsFromStatusPayload(storedPayload);
  }

  if (!rawClips.length && taskStatus === "SUCCESS") {
    const archivedOnly = await probeArchivedClipUrls({ userId: uid, taskId: tid, audioId: "" });
    if (archivedOnly.length) {
      rawClips = archivedOnly.map((url, index) => ({
        id: clipAudioId(null, tid, index),
        title: "",
        audioUrl: url,
      }));
    }
  }

  const outputClips = await Promise.all(
    rawClips.map((clip, index) => buildOutputClip(clip, index, rawClips.length, {
      userId: uid,
      taskId: tid,
      savedSongs,
    })),
  );

  const allUrls = [];
  for (const clip of outputClips) {
    for (const url of clip.audioUrlCandidates || []) {
      if (url && !allUrls.includes(url)) allUrls.push(url);
    }
  }

  const outputAudioUrl = outputClips.find((c) => c.playUrl)?.playUrl || allUrls[0] || "";

  return {
    taskStatus,
    taskStatusUrl,
    taskError,
    outputAudioUrl,
    outputAudioCandidates: allUrls,
    outputClips,
  };
}

function songKindForLogKind(kind) {
  const k = String(kind || "").trim().toLowerCase();
  if (k === "remix") return "remix";
  if (k === "mashup") return "mashup";
  if (k === "cover") return "cover";
  if (k === "instrumental" || k === "stems") return "instrumental";
  if (k === "clip") return "clip";
  return "full";
}

async function serviceFetch(path, { method = "GET", body, prefer = "return=representation" } = {}) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return { ok: false, data: null };
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
      method,
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        Accept: "application/json",
        ...(body ? { "Content-Type": "application/json", Prefer: prefer } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await r.text().catch(() => "");
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    return { ok: r.ok, status: r.status, data };
  } catch (e) {
    return { ok: false, status: 500, data: { error: e?.message || String(e) } };
  }
}

async function recoverGenerationSongToUser({
  generationRow,
  clip,
  titleHint = "",
}) {
  const uid = String(generationRow?.user_id || "").trim();
  const taskId = String(generationRow?.task_id || "").trim();
  const audioId = String(clip?.audioId || "").trim();
  const sourceUrl = String(clip?.playUrl || clip?.upstreamUrl || "").trim();

  if (!uid || !taskId) {
    return { ok: false, status: 400, error: "missing_generation_task" };
  }
  if (!sourceUrl && !audioId) {
    return { ok: false, status: 400, error: "no_playable_output" };
  }

  const archived = await archiveRemoteSongToStorage({
    userId: uid,
    taskId,
    audioId,
    sourceUrl,
  });
  if (!archived.ok || !archived.permanentUrl) {
    return {
      ok: false,
      status: 502,
      error: archived.error || "archive_failed",
    };
  }

  const permanentUrl = archived.permanentUrl;
  const title = String(
    clip?.title
    || titleHint
    || generationRow?.prompt
    || "Recovered song",
  ).trim().slice(0, 200) || "Recovered song";
  const artUrl = String(clip?.imageUrl || "").trim();
  const kind = songKindForLogKind(generationRow?.kind);
  const now = new Date().toISOString();

  let existing = null;
  if (audioId) {
    const found = await serviceFetch(
      `user_songs?select=id,title,song_url,audio_id&user_id=eq.${encodeURIComponent(uid)}&audio_id=eq.${encodeURIComponent(audioId)}&limit=1`,
    );
    existing = Array.isArray(found.data) && found.data[0] ? found.data[0] : null;
  }
  if (!existing) {
    const found = await serviceFetch(
      `user_songs?select=id,title,song_url,audio_id&user_id=eq.${encodeURIComponent(uid)}&task_id=eq.${encodeURIComponent(taskId)}&limit=6`,
    );
    const rows = Array.isArray(found.data) ? found.data : [];
    if (audioId) {
      existing = rows.find((r) => String(r.audio_id || "") === audioId) || null;
    }
    if (!existing && rows.length === 1) existing = rows[0];
  }

  if (existing?.id) {
    const patch = await serviceFetch(
      `user_songs?id=eq.${encodeURIComponent(String(existing.id))}`,
      {
        method: "PATCH",
        body: {
          song_url: permanentUrl,
          ...(artUrl ? { art_url: artUrl } : {}),
          meta: {
            recoveredByAdmin: true,
            recoveredAt: now,
            generationId: generationRow.id,
            taskId,
            audioId,
          },
        },
        prefer: "return=representation",
      },
    );
    if (!patch.ok) {
      return { ok: false, status: 500, error: "patch_failed", details: patch.data };
    }
    const row = Array.isArray(patch.data) && patch.data[0] ? patch.data[0] : existing;
    return {
      ok: true,
      action: "updated",
      songId: row.id,
      songUrl: permanentUrl,
      title: row.title || title,
      audioId,
      taskId,
    };
  }

  const insert = await serviceFetch("user_songs", {
    method: "POST",
    body: {
      user_id: uid,
      title,
      art_url: artUrl,
      song_url: permanentUrl,
      task_id: taskId,
      audio_id: audioId,
      kind,
      public_on_profile: false,
      meta: {
        recoveredByAdmin: true,
        recoveredAt: now,
        generationId: generationRow.id,
        taskId,
        audioId,
      },
    },
    prefer: "return=representation",
  });
  if (!insert.ok) {
    return { ok: false, status: 500, error: "insert_failed", details: insert.data };
  }
  const row = Array.isArray(insert.data) && insert.data[0] ? insert.data[0] : null;
  return {
    ok: true,
    action: "inserted",
    songId: row?.id || "",
    songUrl: permanentUrl,
    title,
    audioId,
    taskId,
  };
}

module.exports = {
  resolveGenerationOutput,
  recoverGenerationSongToUser,
  songKindForLogKind,
};
