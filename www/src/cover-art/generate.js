/**
 * Client-side abstract cover generation via /api/music/cover-art
 */
import { coverArtParamsFromTrack, shouldUseAbstractCover } from "./params.js";
import { DEFAULT_SONG_COVER_URL } from "./placeholders.js";
import { stampCoverWithSplashMark } from "./branding.js";

let _deps = null;
const _inflight = new Map();

export function configureCoverArt(deps) {
  _deps = deps;
}

function d() {
  if (!_deps) throw new Error("Cover art not configured");
  return _deps;
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
  const { loadLibrary, saveLibrary, refreshOwnSongsUi } = d();
  const items = loadLibrary();
  const idx = items.findIndex((x) => String(x.id) === String(trackId));
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
    coverParams: params || prev.meta?.coverParams,
    photoMode: false,
    coverNabadMark: coverSource === "pollinations",
    coverGenAttempted: coverGenAttempted || prev.meta?.coverGenAttempted || false,
  };
  items[idx] = {
    ...prev,
    artUrl: dataUrl,
    meta: nextMeta,
    ts: Date.now(),
  };
  saveLibrary(items);
  try {
    refreshOwnSongsUi?.();
  } catch {}
  return items[idx];
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

/** Generate Pollinations abstract cover for a library track (if applicable). */
export async function ensureAbstractCoverForTrack(track) {
  const id = String(track?.id || "").trim();
  if (!id || !shouldUseAbstractCover(track)) return null;
  if (_inflight.has(id)) return _inflight.get(id);

  const job = (async () => {
    const params = coverArtParamsFromTrack(track);
    if (!params.songId) return null;
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
  })();

  _inflight.set(id, job);
  try {
    return await job;
  } catch (e) {
    try {
      console.warn("[cover-art]", e?.message || e);
    } catch {}
    try {
      const failed = patchLibraryTrackCover(id, {
        dataUrl: DEFAULT_SONG_COVER_URL,
        coverSource: "placeholder",
        nabadAbstractCover: false,
        coverGenAttempted: true,
      });
      if (failed) refreshPlayerIfTrack(failed);
    } catch {}
    return null;
  } finally {
    _inflight.delete(id);
  }
}
