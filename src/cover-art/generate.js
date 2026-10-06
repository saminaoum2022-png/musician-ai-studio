/**
 * Client-side abstract cover generation via /api/music/cover-art
 */
import { canRegeneratePollinationsCover, canRegenerateTrackCover, coverArtParamsFromTrack, hasUserPhotoCoverMeta, isAbstractApiCoverSource, isPollinationsCoverEligible, shouldUseAbstractCover, shouldUseTitleGradientCover } from "./params.js";
import { generateTitleGradientCoverDataUrl, generateTitleGradientThumbDataUrl, defaultThumbOffsetYForTitleY, TITLE_GRADIENT_PLAYER_Y } from "./title-gradient-cover.js";
import { applyNabadColorWashToDataUrl } from "./nabad-color-wash.js";
import { fnv1a } from "./prompt.js";
import { buildAbstractCoverPrompt, classifyVisualBucket, COVER_PROMPT_POLICY_VERSION, resolveStoryTheme, resolveRegenMoodFromHint, shouldUseConcreteSubjectDna, userHintRequestsDaylight } from "./prompt.js";
import { resolveVisualDirection } from "./visual-director/director.mjs";
import { nabadIdentityPhrases } from "./visual-director/nabad-identity.mjs";
import { DEFAULT_SONG_COVER_URL, isDefaultSongCoverUrl } from "./placeholders.js";
import { stampCoverWithSplashMark } from "./branding.js";
import { normalizePortraitCoverDataUrl } from "./portrait-normalize.js";

let _deps = null;
const _inflight = new Map();
/** Serialize library read/patch/save so parallel Pollinations fetches cannot clobber each other. */
let _libraryPatchChain = Promise.resolve();
let _coverWatchTimer = null;

const COVER_FETCH_TIMEOUT_MS = 95000;
const COVER_CLIENT_ATTEMPTS = 3;
const COVER_WATCH_INTERVAL_MS = 12000;

/** Square-crop a cover data URL to a list thumb (center crop for 9:16 portraits). */
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
  const sy = (h - crop) / 2;
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

export function configureCoverArt(deps) {
  _deps = deps;
}

function d() {
  if (!_deps) throw new Error("Cover art not configured");
  return _deps;
}

function enqueueLibraryPatch(fn) {
  const run = _libraryPatchChain.then(fn, fn);
  _libraryPatchChain = run.catch(() => {});
  return run;
}

function trackNeedsCoverRetry(track) {
  const meta = track?.meta && typeof track.meta === "object" ? track.meta : {};
  if (hasUserPhotoCoverMeta(meta)) return false;
  if (!meta.pollinationsCoverPending) return false;
  if (meta.photoMode || meta.imageOnlyInstrumental) return false;
  if (isAbstractApiCoverSource(meta?.coverSource) && meta?.nabadAbstractCover) return false;
  if (String(track?.artUrl || meta?.imageUrl || "").startsWith("data:") && meta?.nabadAbstractCover) {
    return false;
  }
  return isDefaultSongCoverUrl(track?.artUrl || meta?.imageUrl);
}

/** Local regen bundle: Visual Director + Nabad DNA + latest prompt policy (no server Gemini cache). */
async function resolveRegenPromptBundle(params, regenOpts = {}) {
  const regenSalt = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const hintOverride = String(
    regenOpts.artworkHint ||
    regenOpts.artworkStyle ||
    params?.regenArtworkHint ||
    params?.artworkHint ||
    params?.artworkStyle ||
    "",
  ).trim().slice(0, 280);

  const bucketKey = classifyVisualBucket(params);
  const { theme, storyScore } = resolveStoryTheme(params);

  const vd = await resolveVisualDirection(params, {
    applyToPrompt: true,
    tryGemini: false,
    hints: {
      bucketKey,
      storyThemeId: storyScore > 0 && theme?.id ? theme.id : undefined,
      storyScene: theme?.scene || "",
      visualModeHint: theme?.visualMode || "abstract",
      regenBright: true,
    },
  });

  const promptInput = hintOverride
    ? { ...(vd.coverInput || params), artworkStyle: hintOverride, artworkHint: hintOverride }
    : { ...(vd.coverInput || params), artworkStyle: "", artworkHint: "" };
  const regenMood = hintOverride ? resolveRegenMoodFromHint(hintOverride) : null;
  const identityBucket = regenMood?.bucket || bucketKey;
  const concreteSubject = Boolean(hintOverride && shouldUseConcreteSubjectDna(hintOverride, { userArtworkOverride: hintOverride }));
  const userDaylight = userHintRequestsDaylight(hintOverride);
  const identityPhrases = userDaylight
    ? ""
    : nabadIdentityPhrases({
      songId: String(params?.songId || "").trim(),
      bucketKey: identityBucket,
      energy: params?.energy,
      visualMode: vd.direction?.visualMode,
      humTrack: params?.humTrack,
      concreteSubject,
      regenBright: true,
    }).text;
  /** No-hint regen: rotate atmospheric scenes via regenSalt; keep Nabad identity + mood palette. */
  const built = buildAbstractCoverPrompt(promptInput, {
    regenSalt,
    regenVariety: !hintOverride,
    /** No-hint regen uses REGEN_VARIETY scenes in prompt.js — director heuristics skew night/dark and must not feed Flux scratch. */
    directorSceneHint: hintOverride ? (vd.sceneHint || "") : "",
    nabadIdentityPhrases: identityPhrases,
    visualDirection: vd.direction || undefined,
    userArtworkOverride: hintOverride || undefined,
    userExplicitArtwork: Boolean(hintOverride),
    creativeMode: true,
  });

  const avoidTags = [params.avoidTagsInput || "", vd.avoidMerged || ""].filter(Boolean).join(", ");
  return {
    ...built,
    avoidTags,
    regenSalt,
    visualDirection: vd.direction || null,
  };
}

export async function fetchAbstractCoverArt(params, opts = {}) {
  const { apiUrl, getSupabaseAuthToken } = d();
  const token = getSupabaseAuthToken?.() || "";
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;

  const body = { ...params };
  if (opts.coverRegenerate) {
    const userHint = String(
      opts.artworkHint || opts.artworkStyle || params?.regenArtworkHint || "",
    ).trim().slice(0, 280);
    const bundle = await resolveRegenPromptBundle(params, opts);
    body.coverRegenerate = true;
    body.skipGeminiScene = true;
    body.promptPolicyVersion = COVER_PROMPT_POLICY_VERSION;
    body.regenSalt = bundle.regenSalt;
    body.clientPrompt = bundle.prompt;
    body.clientSeed = bundle.seed;
    body.clientBucket = bundle.bucket;
    body.clientStoryTheme = bundle.storyTheme;
    body.clientVisualMode = bundle.visualMode;
    body.clientArtworkSource = bundle.artworkSource;
    body.clientParams = bundle.params;
    body.clientAvoidTags = bundle.avoidTags;
    if (userHint) body.regenUserHint = userHint;
  }

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), COVER_FETCH_TIMEOUT_MS);
  try {
    const r = await fetch(apiUrl("/api/music/cover-art"), {
      method: "POST",
      headers,
      signal: ctrl.signal,
      body: JSON.stringify(body),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data?.error || `Cover art failed (${r.status})`);
    if (!data?.dataUrl) throw new Error("Cover art response missing image.");
    return data;
  } finally {
    clearTimeout(timer);
  }
}

function patchLibraryTrackCover(trackId, patch) {
  const { loadLibrary, saveLibrary, refreshOwnSongsUi, patchLibraryRowCoverArt } = d();
  const tid = String(trackId || "").trim();
  const items = loadLibrary().slice();
  const idx = items.findIndex((x) => String(x.id) === tid);
  if (idx < 0) return null;
  const prev = items[idx];
  const prevMeta = prev.meta && typeof prev.meta === "object" ? prev.meta : {};
  if (prevMeta.photoMode && !patch.replacePhotoCover) return null;
  const {
    dataUrl,
    thumbUrl,
    thumbFrame,
    seed,
    params,
    bucket,
    coverSource = "cloudflare",
    coverImageProvider = "",
    regenFallbackReason = "",
    nabadAbstractCover = true,
    coverGenAttempted = false,
    clearCoverPending = false,
    replacePhotoCover = false,
  } = patch;
  const nextMeta = {
    ...(prevMeta && typeof prevMeta === "object" ? prevMeta : {}),
    imageUrl: dataUrl,
    imageThumb: thumbUrl || dataUrl,
    nabadAbstractCover,
    coverSource,
    coverSeed: seed || prev.meta?.coverSeed || "",
    coverBucket: bucket || params?.bucket || prev.meta?.coverBucket || "",
    coverStoryTheme: params?.storyTheme || prev.meta?.coverStoryTheme || "",
    coverArtworkSource: params?.artworkSource || prev.meta?.coverArtworkSource || "",
    coverParams: params || prev.meta?.coverParams,
    coverImageProvider: coverImageProvider || params?.regenAttemptedProvider || prev.meta?.coverImageProvider || "",
    regenFallbackReason: regenFallbackReason || params?.regenFallbackReason || "",
    photoMode: false,
    coverNabadMark: isAbstractApiCoverSource(coverSource),
    coverGenAttempted: coverGenAttempted || prev.meta?.coverGenAttempted || false,
    ...(clearCoverPending ? { pollinationsCoverPending: false } : {}),
    ...(thumbFrame && typeof thumbFrame === "object"
      ? {
        thumbFrame: {
          scale: Number(thumbFrame.scale) || 1,
          offsetY: Number(thumbFrame.offsetY) || 0,
        },
      }
      : {}),
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

function refreshPlayerIfTrack(track, opts = {}) {
  if (opts.skipPlayerRefresh || opts.coverRegenerate) return;
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

async function buildTitleGradientCoverResult(params, opts = {}) {
  const regen = Boolean(opts.coverRegenerate);
  const seed = regen
    ? (Date.now() ^ fnv1a(String(params.songId || params.title || ""))) % 2147483646
    : fnv1a(`title-gradient|${params.songId || ""}`) % 2147483646 || 1;
  const dataUrl = await generateTitleGradientCoverDataUrl({
    title: params.title || "Untitled",
    seed,
  });
  let thumbUrl = "";
  try {
    thumbUrl = await generateTitleGradientThumbDataUrl({
      title: params.title || "Untitled",
      seed,
    });
  } catch {}
  const thumbFrame = { scale: 1, offsetY: defaultThumbOffsetYForTitleY(TITLE_GRADIENT_PLAYER_Y) };
  return {
    dataUrl,
    thumbUrl,
    thumbFrame,
    seed,
    bucket: "default",
    params: { ...params, artworkSource: "title_gradient", storyTheme: "title_gradient" },
    provider: "title_gradient",
  };
}

async function runCoverJobForTrack(track, id, opts = {}) {
  const hint = String(opts.artworkHint || opts.artworkStyle || "").trim();
  const params = coverArtParamsFromTrack(track, {
    artworkHintOverride: hint,
    regenAutoMusic: Boolean(opts.regenAutoMusic || (opts.coverRegenerate && !hint)),
  });
  if (!params.songId) return null;

  if (shouldUseTitleGradientCover(track, opts)) {
    try {
      const result = await buildTitleGradientCoverResult(params, opts);
      const patched = await enqueueLibraryPatch(() =>
        patchLibraryTrackCover(id, {
          dataUrl: result.dataUrl,
          thumbUrl: result.thumbUrl || "",
          thumbFrame: result.thumbFrame,
          seed: result.seed,
          bucket: result.bucket,
          params: result.params,
          coverSource: "title_gradient",
          coverImageProvider: "title_gradient",
          clearCoverPending: true,
          replacePhotoCover: Boolean(opts.coverRegenerate),
        }),
      );
      if (!patched) return null;
      const { persistTrackCoverIfNeeded } = d();
      void persistTrackCoverIfNeeded?.(patched);
      refreshPlayerIfTrack(patched, opts);
      return patched;
    } catch (e) {
      try {
        console.warn("[cover-art] title gradient failed, falling back to API", e?.message || e);
      } catch {}
    }
  }

  let lastErr = null;
  for (let attempt = 0; attempt < COVER_CLIENT_ATTEMPTS; attempt += 1) {
    if (attempt > 0) {
      await new Promise((r) => setTimeout(r, 1500 * attempt));
    }
    try {
      const result = await fetchAbstractCoverArt(params, opts);
      const preferCenter = true;
      const normalizedUrl = await normalizePortraitCoverDataUrl(result.dataUrl, { preferCenter });
      const washedUrl = await applyNabadColorWashToDataUrl(normalizedUrl);
      const stampedUrl = await stampCoverWithSplashMark(washedUrl);
      let thumbUrl = "";
      try {
        thumbUrl = await squareCoverThumbFromDataUrl(stampedUrl);
      } catch {}
      const coverProvider = String(result.provider || "cloudflare").trim().toLowerCase();
      const patched = await enqueueLibraryPatch(() =>
        patchLibraryTrackCover(id, {
          dataUrl: stampedUrl,
          thumbUrl,
          seed: result.seed,
          bucket: result.bucket,
          params: result.params || params,
          coverSource: coverProvider,
          coverImageProvider: String(result.provider || result.regenAttemptedProvider || "").trim(),
          regenFallbackReason: String(result.regenFallbackReason || result.params?.regenFallbackReason || "").trim(),
          clearCoverPending: true,
          replacePhotoCover: Boolean(opts.coverRegenerate),
        }),
      );
      if (!patched) return null;
      const { persistTrackCoverIfNeeded } = d();
      void persistTrackCoverIfNeeded?.(patched);
      refreshPlayerIfTrack(patched, opts);
      patched._coverRegenProvider = String(result.provider || "").trim();
      patched._coverRegenAttemptedProvider = String(result.regenAttemptedProvider || result.provider || "").trim();
      patched._coverRegenFallbackReason = String(result.regenFallbackReason || result.params?.regenFallbackReason || "").trim();
      return patched;
    } catch (e) {
      lastErr = e;
      try {
        console.warn("[cover-art]", attempt < COVER_CLIENT_ATTEMPTS - 1 ? "retry pending" : "failed", e?.message || e);
      } catch {}
    }
  }

  try {
    console.warn("[cover-art]", lastErr?.message || lastErr || "Cover generation failed");
  } catch {}
  await enqueueLibraryPatch(() =>
    patchLibraryTrackCover(id, {
      dataUrl: DEFAULT_SONG_COVER_URL,
      coverSource: "placeholder",
      nabadAbstractCover: false,
    }),
  ).then((failed) => {
    if (failed) refreshPlayerIfTrack(failed);
    return failed;
  });
  return null;
}

/** Generate Pollinations abstract cover for a library track (if applicable). */
async function awaitParallelPrefetchForTrack(track) {
  const id = String(track?.id || "").trim();
  const prefetchId = resolveParallelCoverSongId(track) || id;
  const job =
    (id && _parallelCoverJobBySongId.get(id)) ||
    (prefetchId && _parallelCoverJobBySongId.get(prefetchId)) ||
    null;
  if (!job) return null;
  try {
    return await job;
  } catch {
    return null;
  }
}

export async function ensureAbstractCoverForTrack(track) {
  const id = String(track?.id || "").trim();
  if (!id || !shouldUseAbstractCover(track)) return null;
  if (_inflight.has(id)) return _inflight.get(id);

  const prefetch = await awaitParallelPrefetchForTrack(track);
  if (prefetch?.dataUrl) {
    const { loadLibrary } = d();
    const fresh = loadLibrary().find((x) => String(x?.id || "") === id);
    if (fresh && !shouldUseAbstractCover(fresh)) return fresh;
    if (fresh) track = fresh;
    if (!shouldUseAbstractCover(track)) return track;
  }

  watchPendingCoverArt();

  const job = runCoverJobForTrack(track, id);
  _inflight.set(id, job);
  try {
    return await job;
  } finally {
    _inflight.delete(id);
  }
}

/** Manual / UI retry for a library row still on the placeholder tile. */
export async function retryAbstractCoverForTrack(track) {
  const id = String(track?.id || "").trim();
  if (!id || !trackNeedsCoverRetry(track)) return null;
  const meta = track?.meta && typeof track.meta === "object" ? track.meta : {};
  const reset = {
    ...track,
    meta: { ...meta, coverGenAttempted: false, pollinationsCoverPending: true },
  };
  return ensureAbstractCoverForTrack(reset);
}

/** User-requested new Pollinations cover (replaces abstract or Photo Mood photo). */
export async function regenerateAbstractCoverForTrack(track, opts = {}) {
  const id = String(track?.id || "").trim();
  const meta = track?.meta && typeof track.meta === "object" ? track.meta : {};
  const fromPhoto = Boolean(meta.photoMode);
  if (!id || !canRegenerateTrackCover(track)) return null;
  if (_inflight.has(id)) return _inflight.get(id);
  const userHint = String(opts.artworkHint ?? opts.artworkStyle ?? "").trim().slice(0, 280);
  /** Only an artwork hint typed for this regen counts — never reuse stale meta hints. */
  const hintOverride = userHint;
  const reset = {
    ...track,
    meta: {
      ...meta,
      coverGenAttempted: false,
      pollinationsCoverPending: true,
      photoMode: false,
      thumbFrame: undefined,
      ...(hintOverride
        ? { artworkHint: hintOverride, artworkStyle: hintOverride }
        : { artworkHint: "", artworkStyle: "" }),
    },
  };
  await enqueueLibraryPatch(() => {
    const items = d().loadLibrary().slice();
    const idx = items.findIndex((x) => String(x.id) === id);
    if (idx < 0) return null;
    items[idx] = { ...items[idx], meta: { ...(items[idx].meta || {}), ...reset.meta } };
    d().saveLibrary(items);
    return items[idx];
  });
  watchPendingCoverArt();
  const job = runCoverJobForTrack(reset, id, {
    coverRegenerate: true,
    artworkHint: hintOverride || undefined,
    regenAutoMusic: !hintOverride && !fromPhoto,
  });
  _inflight.set(id, job);
  try {
    return await job;
  } finally {
    _inflight.delete(id);
  }
}

/** Keep retrying placeholder rows until covers land or the user leaves the app. */
export function watchPendingCoverArt() {
  try {
    backfillPendingAbstractCovers(d().loadLibrary());
  } catch {}
  if (_coverWatchTimer) return;
  _coverWatchTimer = setInterval(() => {
    try {
      const items = d().loadLibrary();
      if (!items.some(trackNeedsCoverRetry)) {
        clearInterval(_coverWatchTimer);
        _coverWatchTimer = null;
        return;
      }
      backfillPendingAbstractCovers(items);
    } catch {
      /* ignore */
    }
  }, COVER_WATCH_INTERVAL_MS);
}

let _backfillQueued = new Set();

/** In-flight Pollinations jobs keyed by Suno taskId → variant key → entry. */
const _parallelCoverByTask = new Map();
/** Prefetch jobs keyed by stable cover song id — survives cancelParallelCoverForTask (plan map only). */
const _parallelCoverJobBySongId = new Map();

/** Stable cover song id shared between parallel prefetch and addToLibrary. */
export function parallelCoverSongId(taskId, variantKey = "A") {
  const tid = String(taskId || "").trim();
  const key = String(variantKey || "A").trim().toUpperCase() || "A";
  if (!tid) return "";
  return `pc_${tid.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 40)}_${key}`;
}

function parallelVariantKeyFromTrack(track, fallback = "A") {
  const explicit = String(track?.coverVariantKey || track?.meta?.variant || "").trim().toUpperCase();
  if (explicit === "A" || explicit === "B") return explicit;
  const title = String(track?.title || "").trim();
  if (/\bB$/i.test(title) || title.endsWith(" B")) return "B";
  return fallback;
}

/**
 * Start Pollinations while Suno is still generating (same params as library row will use).
 * @param {string} taskId
 * @param {{ key?: string, title?: string, meta?: object }[]} variants
 */
export function startParallelCoverForTask(taskId, variants) {
  const tid = String(taskId || "").trim();
  if (!tid || !Array.isArray(variants) || !variants.length) return;

  cancelParallelCoverForTask(tid);
  const plan = new Map();

  for (const row of variants) {
    const key = String(row?.key || "A").trim().toUpperCase() || "A";
    const meta = row?.meta && typeof row.meta === "object" ? row.meta : {};
    if (!isPollinationsCoverEligible(meta)) continue;

    const songId = parallelCoverSongId(tid, key);
    if (!songId) continue;

    const pseudoTrack = {
      id: songId,
      title: String(row?.title || "Untitled").trim() || "Untitled",
      artUrl: DEFAULT_SONG_COVER_URL,
      taskId: tid,
      meta: {
        ...meta,
        variant: key,
        pollinationsCoverPending: true,
      },
    };

    /** @type {{ key: string, songId: string, result: object|null, job: Promise<object|null> }} */
    const entry = {
      key,
      songId,
      result: null,
      job: Promise.resolve(null),
    };

    const job = runParallelCoverJob(pseudoTrack, songId).then((result) => {
      entry.result = result;
      return result;
    });
    entry.job = job;
    _parallelCoverJobBySongId.set(songId, job);
    void job.finally(() => {
      if (_parallelCoverJobBySongId.get(songId) === job) {
        _parallelCoverJobBySongId.delete(songId);
      }
    });
    plan.set(key, entry);
  }

  if (plan.size) _parallelCoverByTask.set(tid, plan);
}

export function cancelParallelCoverForTask(taskId) {
  _parallelCoverByTask.delete(String(taskId || "").trim());
}

/** Build A/B variant specs for standard two-output generations. */
export function buildParallelCoverVariants(taskId, { title, meta, variantCount = 2 } = {}) {
  const tid = String(taskId || "").trim();
  if (!tid) return [];
  const base = String(title || "Generated song").trim() || "Generated song";
  const m = meta && typeof meta === "object" ? meta : {};
  const count = Math.max(1, Math.min(2, Number(variantCount) || 2));
  const rows = [
    { key: "A", title: base, meta: { ...m, variant: "A" }, songId: parallelCoverSongId(tid, "A") },
  ];
  if (count > 1) {
    const titleB = base.endsWith(" B") ? base : `${base} B`;
    rows.push({
      key: "B",
      title: titleB,
      meta: { ...m, variant: "B" },
      songId: parallelCoverSongId(tid, "B"),
    });
  }
  return rows;
}

async function runParallelCoverJob(track, songId) {
  const params = coverArtParamsFromTrack(track);
  if (!params.songId) return null;

  if (shouldUseTitleGradientCover(track)) {
    try {
      const result = await buildTitleGradientCoverResult(params);
      const patch = {
        dataUrl: result.dataUrl,
        thumbUrl: result.thumbUrl || "",
        thumbFrame: result.thumbFrame,
        seed: result.seed,
        bucket: result.bucket,
        params: result.params,
        coverSource: "title_gradient",
        coverImageProvider: "title_gradient",
        clearCoverPending: true,
      };
      const patched = await enqueueLibraryPatch(() => patchLibraryTrackCover(songId, patch));
      if (patched) {
        const { persistTrackCoverIfNeeded } = d();
        void persistTrackCoverIfNeeded?.(patched);
        refreshPlayerIfTrack(patched);
      }
      return patch;
    } catch (e) {
      try {
        console.warn("[cover-art] parallel title gradient failed", e?.message || e);
      } catch {}
    }
  }

  let lastErr = null;
  for (let attempt = 0; attempt < COVER_CLIENT_ATTEMPTS; attempt += 1) {
    if (attempt > 0) {
      await new Promise((r) => setTimeout(r, 1500 * attempt));
    }
    try {
      const result = await fetchAbstractCoverArt(params);
      const preferCenter = true;
      const normalizedUrl = await normalizePortraitCoverDataUrl(result.dataUrl, { preferCenter });
      const washedUrl = await applyNabadColorWashToDataUrl(normalizedUrl);
      const stampedUrl = await stampCoverWithSplashMark(washedUrl);
      const patch = {
        dataUrl: stampedUrl,
        seed: result.seed,
        bucket: result.bucket,
        params: result.params || params,
        clearCoverPending: true,
      };
      const patched = await enqueueLibraryPatch(() => patchLibraryTrackCover(songId, patch));
      if (patched) {
        const { persistTrackCoverIfNeeded } = d();
        void persistTrackCoverIfNeeded?.(patched);
        refreshPlayerIfTrack(patched);
        return patch;
      }
      return patch;
    } catch (e) {
      lastErr = e;
      try {
        console.warn(
          "[cover-art]",
          attempt < COVER_CLIENT_ATTEMPTS - 1 ? "parallel retry pending" : "parallel failed",
          e?.message || e,
        );
      } catch {}
    }
  }

  try {
    console.warn("[cover-art]", lastErr?.message || lastErr || "Parallel cover generation failed");
  } catch {}
  return null;
}

async function applyParallelCoverPatch(trackId, result) {
  const id = String(trackId || "").trim();
  if (!id || !result?.dataUrl) return false;
  const patched = await enqueueLibraryPatch(() =>
    patchLibraryTrackCover(id, { ...result, clearCoverPending: true }),
  );
  if (patched) {
    const { persistTrackCoverIfNeeded } = d();
    void persistTrackCoverIfNeeded?.(patched);
    refreshPlayerIfTrack(patched);
    return true;
  }
  const { loadLibrary } = d();
  const fresh = loadLibrary().find((x) => String(x?.id || "") === id);
  if (fresh && !shouldUseAbstractCover(fresh)) return true;
  return false;
}

/** Apply a prefetched cover when the library row lands (or return true if already patched). */
export async function applyParallelCoverForTrack(track) {
  const tid = String(track?.taskId || "").trim();
  const key = parallelVariantKeyFromTrack(track);
  const id = String(track?.id || "").trim();
  if (!id) return false;

  const { loadLibrary } = d();
  const existing = loadLibrary().find((x) => String(x?.id || "") === id);
  if (existing && !shouldUseAbstractCover(existing)) return true;

  const plan = tid ? _parallelCoverByTask.get(tid) : null;
  const entry = plan?.get(key);

  if (entry?.result?.dataUrl) {
    if (await applyParallelCoverPatch(id, entry.result)) return true;
  }

  if (entry?.job) {
    const result = await entry.job;
    if (await applyParallelCoverPatch(id, result)) return true;
  }

  const prefetchId = resolveParallelCoverSongId(track) || id;
  const inflight =
    _parallelCoverJobBySongId.get(id) ||
    (prefetchId !== id ? _parallelCoverJobBySongId.get(prefetchId) : null);
  if (inflight) {
    const result = await inflight;
    if (await applyParallelCoverPatch(id, result)) return true;
  }

  return false;
}

export function resolveParallelCoverSongId(track) {
  const tid = String(track?.taskId || "").trim();
  if (!tid) return "";
  const key = parallelVariantKeyFromTrack(track);
  return parallelCoverSongId(tid, key);
}

/** Retry library rows still on the music-note placeholder (race or transient API fail). */
export function backfillPendingAbstractCovers(items) {
  const list = Array.isArray(items) ? items : [];
  const pending = list
    .filter((t) => {
      const id = String(t?.id || "").trim();
      if (!id) return false;
      if (_inflight.has(id)) return false;
      if (shouldUseAbstractCover(t)) return true;
      return trackNeedsCoverRetry(t);
    })
    .slice(0, 8);
  for (const t of pending) {
    const id = String(t.id);
    if (_backfillQueued.has(id)) continue;
    _backfillQueued.add(id);
    const meta = t?.meta && typeof t.meta === "object" ? t.meta : {};
    const track =
      meta.coverGenAttempted && isDefaultSongCoverUrl(t?.artUrl || meta?.imageUrl)
        ? { ...t, meta: { ...meta, coverGenAttempted: false } }
        : t;
    void ensureAbstractCoverForTrack(track).finally(() => {
      _backfillQueued.delete(id);
    });
  }
}
