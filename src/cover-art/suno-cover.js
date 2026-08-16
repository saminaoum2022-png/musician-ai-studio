/**
 * Suno cover art — fetch upstream image, brand-grade on server, stamp N mark client-side.
 */
import { stampCoverWithSplashMark } from "./branding.js";
import { DEFAULT_SONG_COVER_URL } from "./placeholders.js";
import { shouldProcessSunoCover } from "./params.js";

let _deps = null;
const _inflight = new Map();

const SUNO_COVER_TIMEOUT_MS = 45000;
const SUNO_COVER_ATTEMPTS = 2;

export function configureSunoCoverArt(deps) {
  _deps = deps;
}

function d() {
  if (!_deps) throw new Error("Suno cover art not configured");
  return _deps;
}

async function squareCoverThumbFromDataUrl(dataUrl, maxSide = 256) {
  const src = String(dataUrl || "");
  if (!src.startsWith("data:image/")) return "";
  const img = await new Promise((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = () => reject(new Error("Could not decode image"));
    i.src = src;
  });
  const w = Number(img.width || 0);
  const h = Number(img.height || 0);
  if (!w || !h) return "";
  const out = Math.max(1, Math.round(maxSide));
  const crop = Math.min(w, h);
  const sx = (w - crop) / 2;
  const sy = h > w * 1.08 ? 0 : (h - crop) / 2;
  const canvas = document.createElement("canvas");
  canvas.width = out;
  canvas.height = out;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  ctx.drawImage(img, sx, sy, crop, crop, 0, 0, out, out);
  try {
    const webp = canvas.toDataURL("image/webp", 0.72);
    if (webp.startsWith("data:image/webp")) return webp;
  } catch {}
  return canvas.toDataURL("image/jpeg", 0.7);
}

async function fetchGradedSunoCover(imageUrl) {
  const { apiUrl, getSupabaseAuthToken } = d();
  const token = getSupabaseAuthToken?.() || "";
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), SUNO_COVER_TIMEOUT_MS);
  try {
    const r = await fetch(apiUrl("/api/music/suno-cover"), {
      method: "POST",
      headers,
      signal: ctrl.signal,
      body: JSON.stringify({ imageUrl }),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data?.error || `Suno cover failed (${r.status})`);
    if (!data?.dataUrl?.startsWith("data:image/")) throw new Error("Suno cover response missing image.");
    return data;
  } finally {
    clearTimeout(timer);
  }
}

function patchLibraryTrackSunoCover(trackId, patch) {
  const { loadLibrary, saveLibrary, refreshOwnSongsUi, patchLibraryRowCoverArt } = d();
  const tid = String(trackId || "").trim();
  const items = loadLibrary().slice();
  const idx = items.findIndex((x) => String(x.id) === tid);
  if (idx < 0) return null;
  const prev = items[idx];
  const prevMeta = prev.meta && typeof prev.meta === "object" ? prev.meta : {};
  const {
    dataUrl,
    thumbUrl,
    sourceImageUrl = "",
    coverGenAttempted = true,
    clearPending = true,
  } = patch;
  const nextMeta = {
    ...prevMeta,
    imageUrl: dataUrl,
    imageThumb: thumbUrl || dataUrl,
    coverSource: "suno",
    coverNabadMark: true,
    nabadAbstractCover: false,
    sourceImageUrl: sourceImageUrl || prevMeta.sourceImageUrl || "",
    coverGenAttempted,
    ...(clearPending ? { sunoCoverPending: false, pollinationsCoverPending: false } : {}),
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
    patchLibraryRowCoverArt?.(tid);
    refreshOwnSongsUi?.({ soft: false });
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

async function runSunoCoverJob(track) {
  const id = String(track?.id || "").trim();
  const meta = track?.meta && typeof track.meta === "object" ? track.meta : {};
  const imageUrl = String(meta.sourceImageUrl || track?.artUrl || "").trim();
  if (!id || !/^https?:\/\//i.test(imageUrl)) return null;

  let lastErr = null;
  for (let attempt = 0; attempt < SUNO_COVER_ATTEMPTS; attempt += 1) {
    if (attempt > 0) {
      await new Promise((r) => setTimeout(r, 1200 * attempt));
    }
    try {
      const result = await fetchGradedSunoCover(imageUrl);
      const stampedUrl = await stampCoverWithSplashMark(result.dataUrl);
      let thumbUrl = "";
      try {
        thumbUrl = await squareCoverThumbFromDataUrl(stampedUrl);
      } catch {}
      const patched = patchLibraryTrackSunoCover(id, {
        dataUrl: stampedUrl,
        thumbUrl,
        sourceImageUrl: imageUrl,
        coverGenAttempted: true,
        clearPending: true,
      });
      if (!patched) return null;
      const { persistTrackCoverIfNeeded } = d();
      void persistTrackCoverIfNeeded?.(patched);
      refreshPlayerIfTrack(patched);
      return patched;
    } catch (e) {
      lastErr = e;
      try {
        console.warn("[suno-cover]", attempt < SUNO_COVER_ATTEMPTS - 1 ? "retry pending" : "failed", e?.message || e);
      } catch {}
    }
  }

  try {
    console.warn("[suno-cover]", lastErr?.message || lastErr || "Suno cover processing failed — keeping upstream URL.");
  } catch {}
  patchLibraryTrackSunoCover(id, {
    dataUrl: imageUrl,
    thumbUrl: imageUrl,
    sourceImageUrl: imageUrl,
    coverGenAttempted: true,
    clearPending: true,
  });
  return null;
}

/** Brand-grade Suno's cover for a library track (default path for new songs). */
export async function processSunoCoverForTrack(track) {
  const id = String(track?.id || "").trim();
  if (!id || !shouldProcessSunoCover(track)) return null;
  if (_inflight.has(id)) return _inflight.get(id);

  const job = runSunoCoverJob(track);
  _inflight.set(id, job);
  try {
    return await job;
  } finally {
    _inflight.delete(id);
  }
}

export function backfillPendingSunoCovers(items) {
  const list = Array.isArray(items) ? items : [];
  for (const t of list.slice(0, 8)) {
    const id = String(t?.id || "").trim();
    if (!id || _inflight.has(id)) continue;
    if (!shouldProcessSunoCover(t)) continue;
    void processSunoCoverForTrack(t);
  }
}

export function resolveSunoCoverSourceUrl(track) {
  const meta = track?.meta && typeof track.meta === "object" ? track.meta : {};
  const url = String(meta.sourceImageUrl || track?.artUrl || "").trim();
  return /^https?:\/\//i.test(url) ? url : "";
}

export function initialArtUrlForSunoCover(track) {
  const url = resolveSunoCoverSourceUrl(track);
  return url || DEFAULT_SONG_COVER_URL;
}
