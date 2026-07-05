/**
 * Client-side abstract cover generation via /api/music/cover-art
 */
import { coverArtParamsFromTrack, shouldUseAbstractCover } from "./params.js";
import { DEFAULT_SONG_COVER_URL, isDefaultSongCoverUrl } from "./placeholders.js";
import { stampCoverWithSplashMark } from "./branding.js";

let _deps = null;
const _inflight = new Map();
/** Serialize cover jobs so Suno A/B variants don't clobber each other's library saves. */
let _coverWorkChain = Promise.resolve();

export function configureCoverArt(deps) {
  _deps = deps;
}

function d() {
  if (!_deps) throw new Error("Cover art not configured");
  return _deps;
}

function enqueueCoverWork(fn) {
  const run = _coverWorkChain.then(fn, fn);
  _coverWorkChain = run.catch(() => {});
  return run;
}

export async function fetchAbstractCoverArt(params) {
  const { apiUrl, getSupabaseAuthToken } = d();
  const token = getSupabaseAuthToken?.() || "";
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;

  const r = await fetch(apiUrl("/api/music/cover-art"), {
    method: "POST",
    headers,
    body: JSON.stringify(params),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data?.error || `Cover art failed (${r.status})`);
  if (!data?.dataUrl) throw new Error("Cover art response missing image.");
  return data;
}

function patchLibraryTrackCover(trackId, patch) {
  const { loadLibrary, saveLibrary, refreshOwnSongsUi, patchLibraryRowCoverArt } = d();
  const tid = String(trackId || "").trim();
  const items = loadLibrary().slice();
  const idx = items.findIndex((x) => String(x.id) === tid);
  if (idx < 0) return null;
  const prev = items[idx];
  const {
    dataUrl,
    seed,
    params,
    bucket,
    coverSource = "pollinations",
    nabadAbstractCover = true,
    coverGenAttempted = false,
  } = patch;
  const nextMeta = {
    ...(prev.meta || {}),
    imageUrl: dataUrl,
    imageThumb: dataUrl,
    nabadAbstractCover,
    coverSource,
    coverSeed: seed || prev.meta?.coverSeed || "",
    coverBucket: bucket || params?.bucket || prev.meta?.coverBucket || "",
    coverStoryTheme: params?.storyTheme || prev.meta?.coverStoryTheme || "",
    coverArtworkSource: params?.artworkSource || prev.meta?.coverArtworkSource || "",
    coverParams: params || prev.meta?.coverParams,
    photoMode: false,
    coverNabadMark: coverSource === "pollinations",
    coverGenAttempted: coverGenAttempted || prev.meta?.coverGenAttempted || false,
  };
  const next = {
    ...prev,
    artUrl: dataUrl,
    meta: nextMeta,
    ts: Date.now(),
  };
  items[idx] = next;
  saveLibrary(items);
  try {
    patchLibraryRowCoverArt?.(tid, dataUrl);
    refreshOwnSongsUi?.({ soft: true });
  } catch {
    try {
      refreshOwnSongsUi?.();
    } catch {}
  }
  return next;
}

function refreshPlayerIfTrack(track) {
  const { currentPlayerTrackRef, libraryNowPlayingId, setPlayerMeta, releaseCaptionForTrack, remixAttributionForTrack } = d();
  try {
    const playingId = String(currentPlayerTrackRef?.()?.id || currentPlayerTrackRef?.id || libraryNowPlayingId?.() || "").trim();
    const trackId = String(track?.id || "");
    if (!playingId || playingId !== trackId) return;
    setPlayerMeta({
      title: track.title || "Now Playing",
      subtitle: document.getElementById("playerSubtitle")?.textContent || "",
      artUrl: track.artUrl || track.meta?.imageUrl,
      releaseCaption: releaseCaptionForTrack?.(track) || "",
      remixOf: remixAttributionForTrack?.(track) || null,
    });
  } catch {}
}

async function runCoverJobForTrack(track, id) {
  const params = coverArtParamsFromTrack(track);
  if (!params.songId) return null;

  let lastErr = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    if (attempt > 0) {
      await new Promise((r) => setTimeout(r, 900));
    }
    try {
      const result = await fetchAbstractCoverArt(params);
      const stampedUrl = await stampCoverWithSplashMark(result.dataUrl);
      const patched = patchLibraryTrackCover(id, {
        dataUrl: stampedUrl,
        seed: result.seed,
        bucket: result.bucket,
        params: result.params || params,
      });
      if (!patched) return null;
      const { persistTrackCoverIfNeeded } = d();
      void persistTrackCoverIfNeeded?.(patched);
      refreshPlayerIfTrack(patched);
      return patched;
    } catch (e) {
      lastErr = e;
      try {
        console.warn("[cover-art]", attempt === 0 ? "retry pending" : "failed", e?.message || e);
      } catch {}
    }
  }

  try {
    console.warn("[cover-art]", lastErr?.message || lastErr || "Cover generation failed");
  } catch {}
  const failed = patchLibraryTrackCover(id, {
    dataUrl: DEFAULT_SONG_COVER_URL,
    coverSource: "placeholder",
    nabadAbstractCover: false,
    coverGenAttempted: true,
  });
  if (failed) refreshPlayerIfTrack(failed);
  return null;
}

/** Generate Pollinations abstract cover for a library track (if applicable). */
export async function ensureAbstractCoverForTrack(track) {
  const id = String(track?.id || "").trim();
  if (!id || !shouldUseAbstractCover(track)) return null;
  if (_inflight.has(id)) return _inflight.get(id);

  const job = enqueueCoverWork(() => runCoverJobForTrack(track, id));
  _inflight.set(id, job);
  try {
    return await job;
  } finally {
    _inflight.delete(id);
  }
}

let _backfillQueued = new Set();

/** Retry library rows still on the music-note placeholder (race or transient API fail). */
export function backfillPendingAbstractCovers(items) {
  const list = Array.isArray(items) ? items : [];
  const pending = list
    .filter((t) => {
      const id = String(t?.id || "").trim();
      if (!id) return false;
      if (_backfillQueued.has(id) || _inflight.has(id)) return false;
      if (shouldUseAbstractCover(t)) return true;
      const meta = t?.meta && typeof t.meta === "object" ? t.meta : {};
      if (!meta.pollinationsCoverPending) return false;
      if (meta.photoMode || meta.imageOnlyInstrumental) return false;
      return isDefaultSongCoverUrl(t?.artUrl || meta?.imageUrl);
    })
    .slice(0, 8);
  for (const t of pending) {
    const id = String(t.id);
    _backfillQueued.add(id);
    const meta = t?.meta && typeof t.meta === "object" ? t.meta : {};
    const track =
      meta.coverGenAttempted && isDefaultSongCoverUrl(t?.artUrl || meta?.imageUrl)
        ? { ...t, meta: { ...meta, coverGenAttempted: false } }
        : t;
    void ensureAbstractCoverForTrack(track);
  }
}
