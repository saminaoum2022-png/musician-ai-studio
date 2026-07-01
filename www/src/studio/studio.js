/**
 * NabadAi Studio — UI controller (V1)
 * -----------------------------------
 * Owns the Studio screens and drives the StudioEngine. Kept as its own module
 * so the experience stays self-contained and modular (per the V1 spec) — app.js
 * only routes to it and hands it a small bridge of app capabilities.
 *
 * Screens (this slice): Studio Home + Recording scaffold. Review / Mix / Publish
 * mount onto the same root next.
 *
 * Design language: Nabad's documented "Voloco-style restraint" — neutral glass
 * surfaces, teal for the single primary action, violet for active/highlight.
 * No neon-everything.
 */

import {
  PITCH_PRESET_IDS,
  PITCH_PRESET_DEFAULT,
  PITCH_CORRECTION_PRESETS,
  ensureTakePitchState,
  getPitchCachedBuffer,
  ensurePitchPresetRendered,
  pitchPresetLabel,
  isPitchPresetInstant,
  normalizePitchPresetId,
  getPitchRenderMeta,
  describePitchRenderMeta,
  advPitchOverrides,
  microFilterFromAdv,
  getPitchAdvCachedBuffer,
  clearPitchAdvCache,
  ensurePitchAdvRendered,
} from "./pitch-correction.js";
import { StudioEngine, FINISH_PRESETS, FINISH_IDS } from "./engine.js";
import {
  listProjects,
  upsertProject,
  deleteProjectWithBlobs,
  nextProjectName,
  getProject,
  listRecordings,
  saveRecording,
  getRecordingBlob,
  deleteRecording,
  saveVocal,
  saveProjectTakeBlob,
  loadProjectTakeBlob,
} from "./store.js";

let engine = null;
let bridge = {};
let current = null; // { track, guideUrl, guideDuration, lyrics, mix, projectId }
let screen = "lobby";
let unsaved = false;
let recMode = "take"; // "take" (over a song) | "memo" (quick take, no music)

const DEFAULT_MIX = Object.freeze({
  voiceVol: 50,
  vocalGain: 50,
  musicVol: 70,
  reverb: 0,
  syncMs: 0,
  finish: "balanced",
  pitchAssist: "off",
  fxDenoise: 0,
  fxCompress: 0,
  fxEq: 0,
  fxDeesser: 0,
});

/** Applied after each new take — opens on Mix with these starting values. */
const POST_RECORD_MIX = Object.freeze({
  styleTab: "studio",
  mixPanel: "basic",
  voiceVol: 72,
  vocalGain: 59,
  musicVol: 70,
  reverb: 14,
  syncMs: 0,
  finish: "balanced",
  finishUserPick: true,
  finishSuggested: "balanced",
  _finishReady: true,
  fxDenoise: 50,
  fxCompress: 14,
  fxEq: 65,
  fxDeesser: 11,
});

function applyPostRecordMixDefaults() {
  if (!current) return;
  current.mix = { ...DEFAULT_MIX, ...POST_RECORD_MIX };
}

const FINISH_LABELS = {
  balanced: "Balanced",
  warm: "Warm",
  bright: "Bright",
  punchy: "Punchy",
};

/** Style preset tabs on Preview + Mix — pitch + mix + finish in one tap. */
const STYLE_TAB_IDS = Object.freeze(["original", "natural", "studio", "pop", "hardtune", "custom"]);

const STYLE_TABS = Object.freeze({
  original: {
    label: "Original",
    pitch: "none",
    finish: "balanced",
    mix: { voiceVol: 50, vocalGain: 50, musicVol: 70, fxDenoise: 0, fxCompress: 0, fxEq: 0, fxDeesser: 0, reverb: 0 },
  },
  natural: {
    label: "Natural",
    pitch: "natural",
    finish: "warm",
    mix: { voiceVol: 68, vocalGain: 54, musicVol: 74, fxDenoise: 30, fxCompress: 8, fxEq: 48, fxDeesser: 6, reverb: 8 },
  },
  studio: {
    label: "Studio",
    pitch: "balanced",
    finish: "balanced",
    mix: { voiceVol: 72, vocalGain: 59, musicVol: 70, fxDenoise: 50, fxCompress: 14, fxEq: 65, fxDeesser: 11, reverb: 14 },
  },
  pop: {
    label: "Pop",
    pitch: "pop",
    finish: "bright",
    mix: { voiceVol: 74, vocalGain: 62, musicVol: 68, fxDenoise: 45, fxCompress: 45, fxEq: 62, fxDeesser: 12, reverb: 16 },
  },
  hardtune: {
    label: "Hard Tune",
    pitch: "hardtune",
    finish: "punchy",
    mix: { voiceVol: 76, vocalGain: 64, musicVol: 66, fxDenoise: 40, fxCompress: 55, fxEq: 52, fxDeesser: 9, reverb: 6 },
  },
  custom: { label: "Custom", pitch: null, finish: null, mix: null },
});

const PITCH_RETUNE_STEPS = Object.freeze(["none", "natural", "balanced", "pop", "hardtune"]);

/** Pick a finish preset from song style/tags — used as default on Mix. */
function suggestFinishPreset(track) {
  const hay = [
    track?.style,
    track?.genre,
    track?.tags,
    track?.meta?.style,
    track?.meta?.tags,
    track?.meta?.prompt,
    track?.meta?.genre,
    track?.title,
  ].filter(Boolean).join(" ").toLowerCase();
  if (/\b(ballad|acoustic|soul|r&b|rnb|jazz|blues|slow|romantic|folk|unplugged)\b/.test(hay)) return "warm";
  if (/\b(hip hop|hip-hop|rap|trap|drill|dance|edm|club|bass|afro|reggaeton|phonk)\b/.test(hay)) return "punchy";
  if (/\b(pop|upbeat|indie|synth|electro|hyper|bright)\b/.test(hay)) return "bright";
  return "balanced";
}

function mixFxValue(m, key) {
  const v = m?.[key];
  if (v === true) return 100;
  if (v === false || v == null) return 0;
  return Math.max(0, Math.min(100, Math.round(Number(v) || 0)));
}

function ensureMixFx(m) {
  for (const k of ["fxDenoise", "fxCompress", "fxEq", "fxDeesser"]) {
    m[k] = mixFxValue(m, k);
  }
}

function ensureMixFinish(m) {
  if (m._finishReady) return;
  const suggested = suggestFinishPreset(current?.track);
  m.finishSuggested = suggested;
  if (!m.finishUserPick) m.finish = suggested;
  m._finishReady = true;
}

/** Where to land when reopening a saved project. */
function projectResumeScreen(p) {
  const hasTakes = (p.takes || []).length > 0;
  const saved = p.screen;
  if (saved === "mix" || saved === "edit" || saved === "review") {
    return hasTakes ? (saved === "review" ? "mix" : saved) : (p.guideUrl ? "home" : "source");
  }
  if (hasTakes) return "mix";
  if (p.guideUrl) return "home";
  return "source";
}

async function persistProject() {
  if (!current?.projectId) return;
  try {
    const takes = engine?.getTakes?.() || [];
    const takeMeta = [];
    for (const t of takes) {
      if (!t.id) continue;
      const blobKey = `pt_${current.projectId}_${t.id}`;
      if (t.blob?.size) await saveProjectTakeBlob(blobKey, t.blob);
      takeMeta.push({
        id: t.id,
        alignSec: t.alignSec || 0,
        nudgeMs: t.nudgeMs || 0,
        createdAt: t.createdAt || Date.now(),
        blobKey,
        pitchPreset: normalizePitchPresetId(t.pitchCorrection?.preset),
      });
    }
    const existing = getProject(current.projectId);
    upsertProject({
      id: current.projectId,
      name: existing?.name || nextProjectName(),
      track: trackRef(current.track),
      guideUrl: current.guideUrl || "",
      guideDuration: current.guideDuration || engine?.guideDuration || 0,
      screen,
      mix: { ...current.mix },
      activeTakeId: engine?.activeTakeId || "",
      takes: takeMeta,
    });
  } catch {}
}

async function restoreProjectSession(p) {
  if (!engine) engine = new StudioEngine();
  engine.clearTakes();
  current.mix = { ...DEFAULT_MIX, ...(p.mix || {}) };
  delete current.mix._finishReady;
  ensureMixFx(current.mix);
  ensureMixFinish(current.mix);
  current.guideUrl = p.guideUrl || "";
  current.guideDuration = p.guideDuration || 0;
  if (current.guideUrl) {
    try {
      await engine.ensureReady();
      current.guideDuration = await engine.loadGuide(current.guideUrl);
    } catch {}
  }
  for (const meta of p.takes || []) {
    const blob = meta.blobKey ? await loadProjectTakeBlob(meta.blobKey) : null;
    const take = {
      id: meta.id,
      blob,
      buffer: null,
      alignSec: meta.alignSec || 0,
      nudgeMs: meta.nudgeMs || 0,
      createdAt: meta.createdAt || Date.now(),
    };
    if (blob) await engine.hydrateTakeBuffer(take, { polish: false });
    if (meta.pitchPreset) {
      ensureTakePitchState(take).preset = normalizePitchPresetId(meta.pitchPreset);
    }
    engine.takes.push(take);
  }
  if (p.activeTakeId && engine.takes.some((t) => t.id === p.activeTakeId)) {
    engine.activeTakeId = p.activeTakeId;
  } else if (engine.takes.length) {
    engine.activeTakeId = engine.takes.at(-1).id;
  }
}

async function openSavedProject(root, p) {
  current = freshContext(p.track);
  current.projectId = p.id;
  await restoreProjectSession(p);
  screen = projectResumeScreen(p);
  unsaved = false;
  enterStudioRoot();
}

/**
 * One-time wiring from app.js. bridge: {
 *   showToast(msg, opts), haptic(kind), navigateBack(),
 *   prepareGuide(track) -> Promise<string url>,   // the AI instrumental
 *   lyricsForTrack(track) -> string,
 *   coverForTrack(track) -> string,
 * }
 */
export function configureStudio(b) {
  bridge = b || {};
}

export function studioHasUnsaved() {
  return unsaved;
}

/** Called from the player ⋯ menu. Stashes the track and routes to the source
 * chooser (load as-is vs separate vocals). */
export function openStudioForTrack(track) {
  current = freshContext(track);
  // Register a draft project the moment a song is opened in the Studio.
  try {
    current.projectId = `proj_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    upsertProject({ id: current.projectId, name: nextProjectName(), track: trackRef(track) });
  } catch {}
  screen = "source";
  unsaved = false;
  try { location.hash = "#/studio"; } catch {}
}

/** Called from the Create page card. Opens the Studio lobby (no song yet). */
export function openStudioLobby() {
  current = null;
  screen = "lobby";
  unsaved = false;
  try { location.hash = "#/studio"; } catch {}
}

function trackRef(t) {
  return {
    id: String(t?.id || ""),
    title: String(t?.title || ""),
    url: String(t?.url || ""),
    artUrl: String(t?.artUrl || t?.art || t?.meta?.imageThumb || t?.meta?.imageUrl || ""),
    taskId: String(t?.taskId || t?.meta?.taskId || ""),
    audioId: String(t?.audioId || t?.meta?.audioId || ""),
    kind: String(t?.kind || ""),
  };
}

function freshContext(track) {
  return {
    track,
    guideUrl: "",
    guideDuration: 0,
    lyrics: safe(bridge.lyricsForTrack?.(track)) || "",
    mix: { ...DEFAULT_MIX },
    monitor: readMonitorPref(),
    timedLines: null, // synced karaoke lines once fetched
    timedFetched: false,
  };
}

const MONITOR_PREF_KEY = "nabad.studio.monitor.v1";
function readMonitorPref() {
  try { return localStorage.getItem(MONITOR_PREF_KEY) !== "0"; } catch { return true; }
}
function writeMonitorPref(on) {
  try { localStorage.setItem(MONITOR_PREF_KEY, on ? "1" : "0"); } catch {}
}

/** Route enter hook. Renders into #studioRoot based on the current screen. */
export function enterStudioRoot() {
  const root = document.getElementById("studioRoot");
  if (!root) return;
  if (!engine) engine = new StudioEngine();

  // No song chosen → the Studio lobby (quick take, projects, recordings).
  if (!current) {
    if (screen === "recordings") { renderRecordings(root); return; }
    if (screen === "library") { renderLibraryPicker(root); return; }
    renderLobby(root);
    return;
  }
  if (screen === "source") { renderSource(root); return; }
  if (screen === "recording") { renderRecording(root); return; }
  if (screen === "review" || screen === "mix") { renderPreviewMix(root, engine?.getActiveTake?.()); return; }
  if (screen === "edit") { renderEditTake(root, engine?.getActiveTake?.()); return; }
  renderHome(root);
  void ensureGuide(root);
  void ensureTimedLyrics(root);
}

/* Fetch the song's word-level karaoke timing (once) and, if we're still on
 * Home, swap the plain lyrics for the synced view. */
async function ensureTimedLyrics(root) {
  if (!current || current.timedFetched) return;
  current.timedFetched = true;
  try {
    const lines = await Promise.resolve(bridge.timedLyricsForTrack?.(current.track));
    if (Array.isArray(lines) && lines.length) {
      current.timedLines = lines;
      if (screen === "home") updateHomeLyrics(root);
    }
  } catch {}
}

/** Cleanup when leaving the Studio route. */
export function leaveStudioRoot() {
  try { engine?.stopMix(); } catch {}
  try { if (engine?.isRecording) void engine.stopRecording(); } catch {}
  try { stopRecPlayback(); } catch {}
  void persistProject();
}

/* -------------------------------------------------------------------------- */
/* Screen: Source chooser (how do you want the music?)                         */
/* -------------------------------------------------------------------------- */

function renderSource(root) {
  screen = "source";
  const t = current.track || {};
  const cover = safe(bridge.coverForTrack?.(t)) || safe(t.artUrl) || "";
  const title = safe(t.title) || "Untitled";
  const isInstrumental = String(t.kind || "") === "instrumental";
  const cached = String(bridge.cachedInstrumental?.(t) || "");

  // An instrumental is already vocal-free — there's nothing to separate, so we
  // only offer to sing over it. Full songs get both options.
  const separateChoice = isInstrumental
    ? ""
    : `
        <button type="button" class="studioChoice studioChoice--accent" data-source="separate">
          <span class="studioChoiceIco" aria-hidden="true">🎤</span>
          <span class="studioChoiceBody">
            <span class="studioChoiceTitle">Separate the vocals${cached ? ` <span class="studioReadyTag">Ready</span>` : ""}</span>
            <span class="studioChoiceSub">${cached
              ? "Instrumental already made — use it instantly."
              : "Make a clean instrumental so only your voice carries the melody. <b>~2 credits.</b>"}</span>
          </span>
          <span class="studioChoiceChev" aria-hidden="true">→</span>
        </button>`;

  root.innerHTML = `
    <div class="studio studioSource" data-studio-screen="source">
      ${headerHtml("NABADAI STUDIO")}

      <div class="studioHero">
        <div class="studioCover">${cover ? `<img src="${esc(cover)}" alt="" />` : `<div class="studioCoverPlaceholder">♪</div>`}</div>
        <div class="studioHeroMeta">
          <h1 class="studioTitle">${esc(title)}</h1>
          <p class="studioArtist">${isInstrumental ? "This is already an instrumental" : "How do you want the music?"}</p>
        </div>
      </div>

      <div class="studioChoices">
        <button type="button" class="studioChoice" data-source="asis">
          <span class="studioChoiceIco" aria-hidden="true">♫</span>
          <span class="studioChoiceBody">
            <span class="studioChoiceTitle">${isInstrumental ? "Sing over this instrumental" : "Sing over the song"}</span>
            <span class="studioChoiceSub">${isInstrumental ? "It’s vocal-free already — load it and record." : "Load it as it is — the full track guides you."}</span>
          </span>
          <span class="studioChoiceChev" aria-hidden="true">→</span>
        </button>
        ${separateChoice}
      </div>
    </div>`;

  bindSource(root);
}

function bindSource(root) {
  bindHeader(root);
  root.querySelector('[data-source="asis"]')?.addEventListener("click", () => {
    bridge.haptic?.("light");
    current.guideUrl = String(current.track?.url || "");
    screen = "home";
    renderHome(root);
    void ensureGuide(root);
    void ensureTimedLyrics(root);
  });
  root.querySelector('[data-source="separate"]')?.addEventListener("click", () => {
    bridge.haptic?.("medium");
    void runSeparation(root);
  });
}

/* -------------------------------------------------------------------------- */
/* Screen: Separating (instrumental generation loading)                        */
/* -------------------------------------------------------------------------- */

function renderSeparating(root, phase) {
  screen = "separating";
  const cover = safe(bridge.coverForTrack?.(current.track)) || safe(current.track?.artUrl) || "";
  root.innerHTML = `
    <div class="studio studioPublish" data-studio-screen="separating">
      <div class="studioPublishInner">
        <div class="studioPublishArt ${cover ? "" : "isEmpty"}">
          ${cover ? `<img src="${esc(cover)}" alt="" />` : `<span aria-hidden="true">♪</span>`}
          <div class="studioPublishShimmer" aria-hidden="true"></div>
        </div>
        <h1 class="studioPublishTitle">Getting the instrumental</h1>
        <p class="studioPublishPhase" data-sep-phase>${esc(phase || "Starting…")}</p>
        <div class="studioPubBar"><span class="studioPubFill studioPubFill--indet"></span></div>
        <p class="studioPublishHint">Lifting the vocals off the music — this can take a minute. We’ll save the instrumental to this song too.</p>
      </div>
    </div>`;
}

async function runSeparation(root) {
  renderSeparating(root, "Requesting…");
  const setPhase = (txt) => { const e = root.querySelector("[data-sep-phase]"); if (e) e.textContent = txt; };
  try {
    const url = await Promise.resolve(
      bridge.separateVocals?.(current.track, (p) => {
        setPhase(
          p === "requesting" ? "Requesting…"
          : p === "processing" ? "Separating vocals…"
          : p === "ready" ? "Almost there…"
          : "Working…",
        );
      }),
    );
    if (!url) throw new Error("No instrumental came back.");
    current.guideUrl = url;
    screen = "home";
    renderHome(root);
    void ensureGuide(root);
    void ensureTimedLyrics(root);
    bridge.showToast?.("Instrumental ready — saved to your song too.");
  } catch (e) {
    screen = "source";
    renderSource(root);
    bridge.showToast?.(String(e?.message || "Couldn’t separate vocals."), { durationMs: 4200 });
  }
}

/* -------------------------------------------------------------------------- */
/* Screen: Nabad AI processing (post-record prep + save finalizing)            */
/* -------------------------------------------------------------------------- */

function yieldToUi() {
  return new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
}

function trackCoverUrl() {
  return safe(bridge.coverForTrack?.(current?.track)) || safe(current?.track?.artUrl) || "";
}

function setProcessingPhase(root, phase) {
  const el = root.querySelector("[data-nabad-phase]");
  if (el) el.textContent = phase;
}

function buildNabadScoreCopy(take, track, mix) {
  const aiRec = buildAiMixRecommendation(take, track);
  const finishLabel = FINISH_LABELS[mix?.finish] || "Balanced";
  const detail = `${aiRec.matchPct}% match with this song · ${finishLabel} finish`;
  let blurb = "Your vocal sits well on the guide — polishing tone and balance.";
  if (aiRec.matchPct >= 92) blurb = "Strong take — Nabad AI is dialing in a pro-sounding mix.";
  else if (aiRec.matchPct >= 84) blurb = "Nice energy — smoothing pitch and glueing you to the track.";
  else blurb = "Good raw take — gentle enhancement will help it sit in the mix.";
  return { score: aiRec.matchPct, finishLabel, detail, blurb, aiRec };
}

function renderNabadProcessing(root, opts = {}) {
  const procScreen = opts.screen || "processing";
  const cover = opts.cover ?? trackCoverUrl();
  const score = Number.isFinite(opts.score) ? Math.round(opts.score) : null;
  screen = procScreen;
  root.innerHTML = `
    <div class="studio studioPublish studioNabadProcess" data-studio-screen="${esc(procScreen)}">
      <div class="studioPublishInner">
        <div class="studioPublishArt ${cover ? "" : "isEmpty"}">
          ${cover ? `<img src="${esc(cover)}" alt="" />` : `<span aria-hidden="true">♪</span>`}
          <div class="studioPublishShimmer" aria-hidden="true"></div>
        </div>
        <p class="studioNabadKicker"><span aria-hidden="true">✨</span> Nabad AI</p>
        <h1 class="studioPublishTitle">${esc(opts.title || "Working…")}</h1>
        <p class="studioPublishPhase" data-nabad-phase>${esc(opts.phase || "Starting…")}</p>
        ${score != null ? `
          <div class="studioNabadScore" aria-live="polite">
            <span class="studioNabadScoreLbl">${esc(opts.scoreLabel || "Nabad Score")}</span>
            <span class="studioNabadScoreVal">${score}</span>
            <p class="studioNabadScoreDetail">${esc(opts.scoreDetail || "")}</p>
            ${opts.scoreBlurb ? `<p class="studioNabadScoreBlurb">${esc(opts.scoreBlurb)}</p>` : ""}
          </div>` : ""}
        <div class="studioPubBar"><span class="studioPubFill studioPubFill--indet"></span></div>
        <p class="studioPublishHint">${esc(opts.hint || "This only takes a moment.")}</p>
      </div>
    </div>`;
}

async function prepareTakeForPreview(root, take) {
  if (!take) {
    bridge.showToast?.("Nothing captured — try recording again.");
    return;
  }

  renderNabadProcessing(root, {
    screen: "processing",
    title: "Preparing Preview",
    phase: "Reading your take…",
    hint: "Nabad AI is enhancing your vocals and suggesting a mix.",
    cover: trackCoverUrl(),
  });

  const setPhase = (txt) => setProcessingPhase(root, txt);

  try {
    if (!take.buffer) {
      setPhase("Reading your take…");
      await yieldToUi();
      await engine?.hydrateTakeBuffer(take);
    }
    if (!take.buffer) throw new Error("no buffer");

    applyPostRecordMixDefaults();
    await engine?.ensureReady();

    ensureTakePitchState(take).cache.none = take.buffer;
    setPhase("Enhancing your vocals…");
    await yieldToUi();

    setPhase("Building pitch options…");
    await warmupPitchPresets(take);

    setPhase("Nabad AI is suggesting your mix…");
    await yieldToUi();
    const aiRec = buildAiMixRecommendation(take, current?.track);
    const tab = STYLE_TABS[aiRec.styleTab];
    const m = current.mix || (current.mix = { ...DEFAULT_MIX });
    if (tab?.mix) {
      m.styleTab = aiRec.styleTab;
      Object.assign(m, tab.mix);
      m.finish = tab.finish;
      m.finishUserPick = true;
      ensureTakePitchState(take).preset = tab.pitch;
      m.advPitch = pitchAdvDefaults(tab.pitch);
      await ensurePitchPresetRendered(take, tab.pitch, {
        audioContext: engine?.ctx,
        trackKey: trackKeyHint(),
      });
    }

    current._previewPreparedTakeId = take.id;
    void persistProject();
    renderPreviewMix(root, take);
  } catch (e) {
    console.warn("[studio] preview prep failed:", e);
    bridge.showToast?.("Couldn't prepare preview — try again.");
    if (take?.buffer) renderPreviewMix(root, take);
    else renderHome(root);
  }
}

function defaultVocalTitle() {
  const srcTitle = String(current?.track?.title || "").trim();
  return srcTitle ? `${srcTitle} — my version` : "Studio song";
}

function renderSaveDetails(root) {
  screen = "save-details";
  clearStudioOverlays(root);
  const pending = current?._pendingSave;
  if (!pending?.rendered) {
    renderPreviewMix(root, engine?.getActiveTake?.());
    return;
  }
  const cover = pending.cover || trackCoverUrl();
  const title = pending.title || defaultVocalTitle();

  root.innerHTML = `
    <div class="studio studioDetails" data-studio-screen="save-details">
      ${headerHtml("SAVE")}
      <div class="studioDetailsHero">
        <div class="studioDetailsArt ${cover ? "" : "isEmpty"}">
          ${cover ? `<img src="${esc(cover)}" alt="" />` : `<span aria-hidden="true">♪</span>`}
        </div>
        <p class="studioDetailsSub">Name your vocal before we add it to My Vocals.</p>
      </div>
      <label class="studioDetailsField">
        <span class="studioMixLabel">Song title</span>
        <input type="text" class="studioDetailsInput" data-save-title value="${esc(title)}" maxlength="120" autocomplete="off" enterkeyhint="done" />
      </label>
      <div class="studioFooter studioFooter--finish">
        <button type="button" class="studioPrimary studioPrimary--continue" data-save-confirm>Save to My Vocals</button>
      </div>
    </div>`;

  bindSaveDetails(root);
}

function bindSaveDetails(root) {
  bindHeader(root, () => {
    try { engine?.stopMix(); } catch {}
    renderPreviewMix(root, engine?.getActiveTake?.());
  });
  const inp = root.querySelector("[data-save-title]");
  root.querySelector("[data-save-confirm]")?.addEventListener("click", () => {
    void confirmSaveVocal(root, inp?.value?.trim() || defaultVocalTitle());
  });
  inp?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      void confirmSaveVocal(root, inp.value?.trim() || defaultVocalTitle());
    }
  });
  try { inp?.focus(); } catch {}
}

async function confirmSaveVocal(root, title) {
  const pending = current?._pendingSave;
  const btn = root.querySelector("[data-save-confirm]");
  if (!pending?.rendered) {
    bridge.showToast?.("Nothing to save — go back and try again.");
    return;
  }
  bridge.haptic?.("medium");
  if (btn) { btn.disabled = true; btn.textContent = "Saving…"; }
  try {
    await saveVocal({
      title,
      blob: pending.rendered.blob,
      durationSec: pending.rendered.durationSec,
      artUrl: pending.cover || "",
      sourceTitle: pending.sourceTitle || "",
      mime: "audio/wav",
      visibility: "private",
    });
    unsaved = false;
    try { bridge.onVocalsChanged?.(); } catch {}
    const projectId = current?.projectId;
    if (projectId) {
      try { await deleteProjectWithBlobs(projectId); } catch {}
    }
    try { engine?.clearTakes(); } catch {}
    current = null;
    screen = "lobby";
    bridge.showToast?.("Saved to My Vocals.");
    leaveStudioRoot();
    if (typeof bridge.openMyVocals === "function") bridge.openMyVocals();
    else bridge.navigateBack?.();
  } catch (e) {
    console.warn("[studio] save failed:", e);
    bridge.showToast?.("Couldn't save — your mix is still here.");
    if (btn) { btn.disabled = false; btn.textContent = "Save to My Vocals"; }
  }
}

/* -------------------------------------------------------------------------- */
/* Screen: Lobby (no song yet — quick take, projects, recordings)              */
/* -------------------------------------------------------------------------- */

function renderLobby(root) {
  screen = "lobby";
  const projects = listProjects();
  const recs = listRecordings();

  root.innerHTML = `
    <div class="studio studioLobby" data-studio-screen="lobby">
      ${headerHtml("NABADAI STUDIO")}

      <div class="studioLobbyHead">
        <h1 class="studioTitle">Studio</h1>
        <p class="studioArtist">Record over a song, or catch a quick idea before it’s gone.</p>
      </div>

      <button type="button" class="studioQuickTake" data-studio-quick>
        <span class="studioQuickIco" aria-hidden="true">●</span>
        <span class="studioQuickBody">
          <span class="studioQuickTitle">Quick take</span>
          <span class="studioQuickSub">Record a fast idea — just your voice, no music.</span>
        </span>
      </button>

      <button type="button" class="studioQuickTake studioQuickTake--alt" data-studio-newproject>
        <span class="studioQuickIco studioQuickIco--alt" aria-hidden="true">♪</span>
        <span class="studioQuickBody">
          <span class="studioQuickTitle">New project</span>
          <span class="studioQuickSub">Load a song from your library to sing over.</span>
        </span>
        <span class="studioChoiceChev" aria-hidden="true">→</span>
      </button>

      <div class="studioLobbySection">
        <div class="studioLobbySectionTop">
          <span class="studioLobbyKicker">Recordings</span>
          <button type="button" class="studioLink" data-studio-open-recordings>See all${recs.length ? ` (${recs.length})` : ""}</button>
        </div>
        ${recs.length
          ? `<div class="studioMiniList">${recs.slice(0, 3).map((r) => `
              <button type="button" class="studioMiniRow" data-rec-open="${esc(r.id)}">
                <span class="studioMiniIco" aria-hidden="true">▶</span>
                <span class="studioMiniName">${esc(r.name)}</span>
                <span class="studioMiniMeta">${fmtTime(r.durationSec)}</span>
              </button>`).join("")}</div>`
          : `<p class="studioLobbyEmpty">No recordings yet.</p>`}
      </div>

      <div class="studioLobbySection">
        <div class="studioLobbySectionTop"><span class="studioLobbyKicker">Projects</span></div>
        ${projects.length
          ? `<div class="studioMiniList">${projects.slice(0, 6).map((p) => `
              <div class="studioMiniRow studioMiniRow--proj">
                <button type="button" class="studioMiniMain" data-proj-open="${esc(p.id)}">
                  <span class="studioMiniIco" aria-hidden="true">♪</span>
                  <span class="studioMiniName">${esc(p.name)}${p.track?.title ? ` · ${esc(p.track.title)}` : ""}</span>
                </button>
                <button type="button" class="studioMiniDel" data-proj-del="${esc(p.id)}" aria-label="Delete project">✕</button>
              </div>`).join("")}</div>`
          : `<p class="studioLobbyEmpty">Open a song → ⋯ → <b>Open in Studio</b> to start a project.</p>`}
      </div>
    </div>`;

  bindLobby(root);
}

function bindLobby(root) {
  bindHeader(root);
  root.querySelector("[data-studio-quick]")?.addEventListener("click", () => startQuickTake(root));
  root.querySelector("[data-studio-newproject]")?.addEventListener("click", () => {
    bridge.haptic?.("light");
    current = null;
    renderLibraryPicker(root);
  });
  root.querySelector("[data-studio-open-recordings]")?.addEventListener("click", () => {
    bridge.haptic?.("light");
    current = null;
    renderRecordings(root);
  });
  root.querySelectorAll("[data-rec-open]").forEach((b) =>
    b.addEventListener("click", () => { bridge.haptic?.("light"); current = null; renderRecordings(root); }),
  );
  root.querySelectorAll("[data-proj-open]").forEach((b) =>
    b.addEventListener("click", () => {
      void (async () => {
        bridge.haptic?.("light");
        const p = listProjects().find((x) => x.id === b.getAttribute("data-proj-open"));
        if (!p?.track) return;
        await openSavedProject(root, p);
      })();
    }),
  );
  root.querySelectorAll("[data-proj-del]").forEach((b) =>
    b.addEventListener("click", (e) => {
      e.stopPropagation();
      bridge.haptic?.("light");
      void deleteProjectWithBlobs(b.getAttribute("data-proj-del")).then(() => renderLobby(root));
    }),
  );
}

function startQuickTake(root) {
  bridge.haptic?.("medium");
  recMode = "memo";
  current = {
    track: { title: "Quick take" },
    guideUrl: "",
    lyrics: "",
    mix: { ...DEFAULT_MIX },
    monitor: readMonitorPref(),
    timedLines: null,
    timedFetched: true,
  };
  renderRecording(root);
}

/* -------------------------------------------------------------------------- */
/* Screen: Library picker (New project — pick a song to sing over)             */
/* -------------------------------------------------------------------------- */

function renderLibraryPicker(root) {
  screen = "library";
  const songs = bridge.librarySongs?.() || [];
  root.innerHTML = `
    <div class="studio studioLibPick" data-studio-screen="library">
      ${headerHtml("NEW PROJECT")}
      <div class="studioLobbyHead">
        <h1 class="studioTitle">Pick a song</h1>
        <p class="studioArtist">Load one from your library to record over.</p>
      </div>
      ${songs.length
        ? `<div class="studioPickList">${songs.map((s) => `
            <button type="button" class="studioPickRow" data-pick="${esc(s.id)}">
              <span class="studioPickArt">${s.artUrl ? `<img src="${esc(s.artUrl)}" alt="" />` : `<span aria-hidden="true">♪</span>`}</span>
              <span class="studioPickBody">
                <span class="studioPickName">${esc(s.title)}</span>
                ${s.kind === "instrumental" ? `<span class="studioPickTag">Instrumental</span>` : ""}
              </span>
              <span class="studioChoiceChev" aria-hidden="true">→</span>
            </button>`).join("")}</div>`
        : `<div class="studioEmpty"><div class="studioEmptyIco" aria-hidden="true">♪</div><h2>No songs yet</h2><p>Create a song first, then load it here.</p></div>`}
    </div>`;
  bindLibraryPicker(root, songs);
}

function bindLibraryPicker(root, songs) {
  bindHeader(root, () => { current = null; renderLobby(root); });
  root.querySelectorAll("[data-pick]").forEach((b) =>
    b.addEventListener("click", () => {
      const s = (songs || []).find((x) => x.id === b.getAttribute("data-pick"));
      if (!s) return;
      bridge.haptic?.("light");
      current = freshContext(s);
      try {
        current.projectId = `proj_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
        upsertProject({ id: current.projectId, name: nextProjectName(), track: trackRef(s) });
      } catch {}
      renderSource(root);
    }),
  );
}

/* -------------------------------------------------------------------------- */
/* Screen: Recordings (local-only list)                                        */
/* -------------------------------------------------------------------------- */

function renderRecordings(root) {
  screen = "recordings";
  const recs = listRecordings();
  root.innerHTML = `
    <div class="studio studioRecordings" data-studio-screen="recordings">
      ${headerHtml("RECORDINGS")}
      <div class="studioLobbyHead">
        <h1 class="studioTitle">Recordings</h1>
        <p class="studioArtist">Voice ideas, saved on this device only.</p>
      </div>
      ${recs.length
        ? `<div class="studioRecList">${recs.map((r) => `
            <div class="studioRecItem">
              <button type="button" class="studioRecPlay" data-rec-play="${esc(r.id)}" aria-label="Play"><span aria-hidden="true">▶</span></button>
              <div class="studioRecItemBody">
                <div class="studioRecItemName">${esc(r.name)}</div>
                <div class="studioRecItemMeta">${fmtTime(r.durationSec)} · ${esc(fmtDate(r.createdAt))}</div>
              </div>
              <button type="button" class="studioRecDel" data-rec-del="${esc(r.id)}" aria-label="Delete">✕</button>
            </div>`).join("")}</div>`
        : `<div class="studioEmpty"><div class="studioEmptyIco" aria-hidden="true">🎙️</div><h2>No recordings yet</h2><p>Use Quick take to capture an idea.</p></div>`}
      <div class="studioFooter">
        <button type="button" class="studioPrimary" data-studio-quick><span class="studioPrimaryIco" aria-hidden="true">●</span> Quick take</button>
      </div>
    </div>`;
  bindRecordings(root);
}

function bindRecordings(root) {
  bindHeader(root, () => { current = null; renderLobby(root); });
  root.querySelector("[data-studio-quick]")?.addEventListener("click", () => startQuickTake(root));
  root.querySelectorAll("[data-rec-play]").forEach((b) =>
    b.addEventListener("click", () => playRecording(b.getAttribute("data-rec-play"), b)),
  );
  root.querySelectorAll("[data-rec-del]").forEach((b) =>
    b.addEventListener("click", async () => {
      bridge.haptic?.("light");
      await deleteRecording(b.getAttribute("data-rec-del"));
      renderRecordings(root);
    }),
  );
}

let _recAudio = null;
function stopRecPlayback() {
  if (_recAudio) { try { _recAudio.pause(); } catch {} _recAudio = null; }
}
async function playRecording(id) {
  try {
    stopRecPlayback();
    const blob = await getRecordingBlob(id);
    if (!blob) { bridge.showToast?.("Recording not found."); return; }
    const url = URL.createObjectURL(blob);
    _recAudio = new Audio(url);
    _recAudio.play().catch(() => {});
    _recAudio.onended = () => { try { URL.revokeObjectURL(url); } catch {} stopRecPlayback(); };
  } catch { bridge.showToast?.("Couldn’t play that recording."); }
}

/* -------------------------------------------------------------------------- */
/* Guide (AI instrumental) acquisition                                         */
/* -------------------------------------------------------------------------- */

async function ensureGuide(root) {
  if (!current) return;
  if (current.guideUrl) { setGuideStatus(root, "ready"); return; }
  setGuideStatus(root, "preparing");
  try {
    const url = await Promise.resolve(bridge.prepareGuide?.(current.track));
    if (!url) throw new Error("no guide url");
    current.guideUrl = url;
    current.guideDuration = engine?.guideDuration || 0;
    setGuideStatus(root, "ready");
    void persistProject();
  } catch {
    setGuideStatus(root, "error");
  }
}

function setGuideStatus(root, state) {
  const el = root.querySelector("[data-studio-guide-status]");
  const btn = root.querySelector("[data-studio-start]");
  if (el) {
    el.dataset.state = state;
    el.textContent =
      state === "preparing" ? "Preparing your AI Guide…"
      : state === "error" ? "Couldn’t prepare the instrumental — tap to retry"
      : "AI Guide ready";
  }
  if (btn) btn.disabled = state !== "ready";
}

/* -------------------------------------------------------------------------- */
/* Screen: Studio Home                                                         */
/* -------------------------------------------------------------------------- */

function clearStudioOverlays(root) {
  root?.querySelector?.("[data-audio-debug-sheet]")?.remove();
}

function renderHome(root) {
  screen = "home";
  clearStudioOverlays(root);
  const t = current.track || {};
  const cover = safe(bridge.coverForTrack?.(t)) || safe(t.artUrl) || "";
  const title = safe(t.title) || "Untitled";
  const artist = safe(t.artist) || "You";
  const lyrics = current.lyrics;

  root.innerHTML = `
    <div class="studio" data-studio-screen="home">
      ${headerHtml("NABADAI STUDIO")}

      <div class="studioHero">
        <div class="studioCover">
          ${cover ? `<img src="${esc(cover)}" alt="" />` : `<div class="studioCoverPlaceholder">♪</div>`}
        </div>
        <div class="studioHeroMeta">
          <h1 class="studioTitle">${esc(title)}</h1>
          <p class="studioArtist">${esc(artist)}</p>
          <span class="studioGuideTag">AI Guide · Instrumental</span>
        </div>
      </div>

      <div class="studioWave" aria-hidden="true">${waveBarsHtml(48)}</div>

      <div class="studioGuideRow">
        <span class="studioGuideStatus" data-studio-guide-status data-state="preparing">Preparing your AI Guide…</span>
        <label class="studioVolume">
          <span class="studioVolumeIco" aria-hidden="true">${studioIco("music")}</span>
          <input type="range" min="0" max="100" value="80" data-studio-guide-vol aria-label="AI Guide volume" />
        </label>
      </div>

      <button type="button" class="studioMonitorRow${current.monitor ? " isOn" : ""}" data-studio-monitor role="switch" aria-checked="${!!current.monitor}">
        <span class="studioMonitorIco" aria-hidden="true">${studioIco("headphones")}</span>
        <span class="studioMonitorText">
          <span class="studioMonitorTitle">Hear myself</span>
          <span class="studioMonitorSub">Your voice live in your ears · wired earphones recommended</span>
        </span>
        <span class="studioToggle${current.monitor ? " isOn" : ""}" aria-hidden="true"><span class="studioToggleKnob"></span></span>
      </button>

      <div class="studioLyricsWrap" data-studio-home-lyrics>${homeLyricsHtml()}</div>

      <div class="studioFooter">
        <button type="button" class="studioPrimary" data-studio-start disabled>
          <span class="studioPrimaryIco" aria-hidden="true">●</span> Start Recording
        </button>
        <button type="button" class="studioGhost" data-studio-preview>Listen to guide</button>
      </div>
    </div>`;

  bindHome(root);
}

function bindHome(root) {
  bindHeader(root);
  root.querySelector("[data-studio-start]")?.addEventListener("click", () => {
    bridge.haptic?.("medium");
    renderRecording(root);
  });
  root.querySelector("[data-studio-preview]")?.addEventListener("click", async () => {
    bridge.haptic?.("light");
    if (!current.guideUrl) { bridge.showToast?.("Guide isn’t ready yet."); return; }
    try {
      await engine.loadGuide(current.guideUrl);
      await engine.playMix({ musicVol: guideVol(root), voiceVol: 0, reverb: 0 });
    } catch {
      bridge.showToast?.("Couldn’t play the guide here.");
    }
  });
  root.querySelector("[data-studio-guide-status]")?.addEventListener("click", () => {
    if (root.querySelector("[data-studio-guide-status]")?.dataset.state === "error") void ensureGuide(root);
  });
  root.querySelector("[data-studio-monitor]")?.addEventListener("click", async (e) => {
    bridge.haptic?.("light");
    const row = e.currentTarget;
    const setRow = (on) => {
      current.monitor = on;
      writeMonitorPref(on);
      row.classList.toggle("isOn", on);
      row.setAttribute("aria-checked", String(on));
      row.querySelector(".studioToggle")?.classList.toggle("isOn", on);
    };
    if (current.monitor) { setRow(false); return; }

    // Turning ON: only makes sense through earphones. If we can positively tell
    // there are none, don't switch it on — just nudge the user to plug in.
    const hp = await headphonesLikely();
    if (hp === false) {
      setRow(false);
      bridge.showToast?.("Pop in your wired earphones to hear yourself — through the speaker it just echoes back into the mic. Connect them and tap again.", { durationMs: 4600 });
      return;
    }
    setRow(true);
    if (hp === null) {
      bridge.showToast?.("🎧 Best with wired earphones in — without them you may hear echo and lag.", { durationMs: 4200 });
    }
  });
}

// Best-effort "are headphones connected?" — returns true / false / null(unknown).
// iOS WebView usually can't enumerate audio outputs, so we return null and let
// the caller proceed with a gentle advisory rather than blocking real earphones.
async function headphonesLikely() {
  try {
    if (!navigator.mediaDevices?.enumerateDevices) return null;
    const devs = await navigator.mediaDevices.enumerateDevices();
    const outs = devs.filter((d) => d.kind === "audiooutput");
    if (!outs.length) return null;
    const label = outs.map((d) => (d.label || "").toLowerCase()).join(" ");
    if (!label.trim()) return null;
    if (/headphone|airpod|earbud|earphone|wired|bluetooth|\bbt\b|usb|headset/.test(label)) return true;
    if (outs.length === 1 && /speaker|receiver|built-?in/.test(label)) return false;
    return null;
  } catch {
    return null;
  }
}

function guideVol(root) {
  const v = Number(root.querySelector("[data-studio-guide-vol]")?.value || 80);
  return Math.max(0, Math.min(1, v / 100));
}

function homeLyricsHtml() {
  const timed = current.timedLines;
  if (Array.isArray(timed) && timed.length) {
    return `
      <div class="studioLyricsHead"><span class="studioLyricsBadge">♪ Synced lyrics</span></div>
      <div class="studioLyrics studioLyrics--timed">${timed
        .map((l) =>
          l.isSection
            ? `<p class="studioLyricSection">${esc(l.text)}</p>`
            : `<p dir="auto">${esc(l.text)}</p>`,
        )
        .join("")}</div>`;
  }
  const lyrics = current.lyrics;
  return lyrics
    ? `<div class="studioLyrics">${lyrics.split(/\n+/).map((l) => `<p dir="auto">${esc(l)}</p>`).join("")}</div>`
    : `<div class="studioLyrics studioLyricsEmpty"><p>No lyrics for this song — sing freely.</p></div>`;
}

function updateHomeLyrics(root) {
  const wrap = root.querySelector("[data-studio-home-lyrics]");
  if (wrap) wrap.innerHTML = homeLyricsHtml();
}

/* -------------------------------------------------------------------------- */
/* Screen: Recording (scaffold — real mic wiring runs on device)               */
/* -------------------------------------------------------------------------- */

function renderRecording(root) {
  screen = "recording";
  clearStudioOverlays(root);
  const memo = recMode === "memo";
  root.innerHTML = `
    <div class="studio studioRec" data-studio-screen="recording">
      <div class="studioRecTop">
        <span class="studioRecDot" aria-hidden="true"></span>
        <span class="studioRecLabel">${memo ? "Quick take…" : "Recording…"}</span>
        <span class="studioRecTimer" data-studio-timer>0:00</span>
      </div>

      <div class="studioCountIn" data-studio-countin hidden><span>3</span></div>

      <div class="studioRecWaves">
        ${memo ? "" : `<div class="studioRecWave studioRecWave--guide" aria-hidden="true">${waveBarsHtml(64)}</div>`}
        <div class="studioRecWave studioRecWave--voice" data-studio-voicewave aria-hidden="true">${waveBarsHtml(64)}</div>
      </div>

      ${memo
        ? `<div class="studioRecLyric studioRecLyric--memo">Sing or hum your idea — we’ll save it.</div>`
        : recLyricsHtml()}

      <div class="studioRecControls">
        <button type="button" class="studioStop" data-studio-stop aria-label="Stop recording">
          <span aria-hidden="true">■</span>
        </button>
      </div>
    </div>`;

  bindRecording(root);
  void startTake(root);
}

function bindRecording(root) {
  root.querySelector("[data-studio-stop]")?.addEventListener("click", async () => {
    bridge.haptic?.("medium");
    try { engine?.stopMix?.(); } catch {}
    let take = null;
    try { take = await engine.stopRecording(); } catch {}

    if (recMode === "memo") {
      // Quick take → save as a standalone local recording, then list them.
      if (take?.blob) {
        try {
          await saveRecording({
            blob: take.blob,
            durationSec: take.buffer?.duration || current?._recSec || 0,
          });
          bridge.showToast?.("Saved to your recordings.");
        } catch {}
        try { engine.removeTake(take.id); } catch {}
      } else {
        bridge.showToast?.("Nothing captured — try on your phone with mic access.");
      }
      recMode = "take";
      current = null;
      renderRecordings(root);
      return;
    }

    unsaved = true;
    clearStudioOverlays(root);
    void prepareTakeForPreview(root, take);
  });
}

function pulseCountIn(countEl, n) {
  if (!countEl || n <= 0) return;
  countEl.hidden = false;
  const span = countEl.querySelector("span");
  if (!span) return;
  span.textContent = String(n);
  span.classList.remove("studioCountPulse");
  void span.offsetWidth;
  span.classList.add("studioCountPulse");
}

async function startTake(root) {
  const memo = recMode === "memo";
  const countEl = root.querySelector("[data-studio-countin]");
  const timerEl = root.querySelector("[data-studio-timer]");
  const voiceWave = root.querySelector("[data-studio-voicewave]");
  if (current) current._recSec = 0;
  try {
    await engine.ensureReady();
    if (!memo && !engine.guideBuffer && current.guideUrl) await engine.loadGuide(current.guideUrl);
    await engine.startRecording({
      countInSec: memo ? 1 : 3,
      noGuide: memo,
      musicVol: guideVol(root),
      autoGainControl: false,
      monitor: !!current?.monitor,
      // Live monitor = dry voice + a light reverb tail only. We intentionally
      // drop the slap-back delay here: a 0.26s echo on what you hear reads as
      // "latency", and the round-trip already adds some. Reverb tail doesn't
      // delay the dry signal, so it stays tight.
      monitorReverb: Math.min(0.22, Math.max(0.1, (Number(current?.mix?.reverb) || 0) / 100)),
      monitorEcho: 0,
      onCountIn: (n) => {
        if (!countEl) return;
        if (n > 0) pulseCountIn(countEl, n);
        else countEl.hidden = true;
      },
      onLevel: (v) => animateVoiceWave(voiceWave, v),
      onTick: (sec) => {
        if (current) current._recSec = sec;
        if (timerEl) timerEl.textContent = fmtTime(sec);
        if (!memo) highlightTimedLine(root, sec);
      },
    });
  } catch (e) {
    // Simulator (or denied mic) — keep the scaffold visible without crashing.
    if (countEl) countEl.hidden = true;
    bridge.showToast?.("Microphone unavailable here — try on your phone.");
  }
}

function recLyricsHtml() {
  const timed = current.timedLines;
  if (Array.isArray(timed) && timed.length) {
    return `<div class="studioRecLyrics" data-studio-lyriclist>${timed
      .map((l, i) =>
        l.isSection
          ? `<div class="studioRecLyricSection" data-line="${i}">${esc(l.text)}</div>`
          : `<div class="studioRecLyricLine" data-line="${i}" dir="auto">${esc(l.text)}</div>`,
      )
      .join("")}</div>`;
  }
  return `<div class="studioRecLyric" data-studio-lyric>${esc((current.lyrics || "").split(/\n+/)[0] || "Sing your heart out")}</div>`;
}

// Highlight the karaoke line for the current guide position (guide time aligns
// to the song's own lyric timestamps). Mirrors the player overlay behaviour.
function highlightTimedLine(root, sec) {
  const list = root.querySelector("[data-studio-lyriclist]");
  const lines = current.timedLines;
  if (!list || !Array.isArray(lines)) return;
  let idx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].isSection && lines[i].startS <= sec + 0.25) idx = i;
  }
  if (idx === list._activeIdx) return;
  list._activeIdx = idx;
  const rows = list.children;
  for (let i = 0; i < rows.length; i++) {
    rows[i].classList.toggle("isActive", i === idx);
    rows[i].classList.toggle("isPast", i < idx && !lines[i]?.isSection);
  }
  const active = idx >= 0 ? rows[idx] : null;
  if (active) { try { active.scrollIntoView({ block: "center", behavior: "smooth" }); } catch {} }
}

function animateVoiceWave(wrap, level) {
  if (!wrap) return;
  const bars = wrap.children;
  const idx = Math.floor(Math.random() * bars.length);
  const b = bars[idx];
  if (b) b.style.transform = `scaleY(${0.18 + Math.min(1, level) * 0.82})`;
}

/* -------------------------------------------------------------------------- */
/* Screen: Take Review (listen only)                                           */
/* -------------------------------------------------------------------------- */

function mixState() {
  return current.mix || (current.mix = { ...DEFAULT_MIX });
}

function takeTabsHtml(takes, activeId) {
  if (!takes?.length) return "";
  if (takes.length === 1) {
    return `<span class="studioTakeBadge">Take 1</span>`;
  }
  return `<div class="studioTakeTabs" role="tablist" aria-label="Takes">${takes.map((t, i) =>
    `<button type="button" role="tab" class="studioTakeTab${t.id === activeId ? " isActive" : ""}" data-take-id="${esc(t.id)}" aria-selected="${t.id === activeId}">Take ${i + 1}</button>`,
  ).join("")}</div>`;
}

function peaksHtml(peaks) {
  if (!peaks?.length) {
    return Array.from({ length: 64 }, () => `<span class="studioPeakBar studioPeakBar--empty"></span>`).join("");
  }
  return peaks.map((p) => {
    const h = Math.max(6, Math.round((Number(p) || 0) * 94));
    return `<span class="studioPeakBar" style="height:${h}%"></span>`;
  }).join("");
}

function studioIco(name) {
  const icons = {
    voice: `<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path fill="currentColor" d="M12 14a3 3 0 0 0 3-3V6a3 3 0 1 0-6 0v5a3 3 0 0 0 3 3zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-3.08A7 7 0 0 0 19 11h-2z"/></svg>`,
    music: `<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path fill="currentColor" d="M12 3v10.55A4 4 0 1 0 14 15V7h4V3h-6z"/></svg>`,
    reverb: `<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.8" d="M4 12c0-4 3.5-7 8-7s8 3 8 7-3.5 7-8 7"/></svg>`,
    headphones: `<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M12 3a8 8 0 0 0-8 8v6a3 3 0 0 0 3 3h1v-9H5a6 6 0 1 1 12 0v9h1a3 3 0 0 0 3-3v-6a8 8 0 0 0-8-8z"/></svg>`,
    play: `<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M8 5v14l11-7z"/></svg>`,
    pause: `<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M6 5h4v14H6zm8 0h4v14h-4z"/></svg>`,
    trim: `<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" d="M6 7v10M18 7v10M6 12h12"/></svg>`,
    split: `<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.8" d="M12 4v16M8 8l4-4 4 4M8 16l4 4 4-4"/></svg>`,
    delete: `<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" d="M5 7h14M9 7V5h6v2M8 7l1 12h6l1-12"/></svg>`,
    levels: `<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M4 10h2v8H4zm5-4h2v12H9zm5 2h2v10h-2zm5-3h2v13h-2z"/></svg>`,
    undo: `<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" d="M9 7H5v4M5 11c1.5-3 4.5-5 8-5 4.4 0 8 3.6 8 8s-3.6 8-8 8"/></svg>`,
    note: `<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path fill="currentColor" d="M12 3v10.55A4 4 0 1 0 14 15V7h4V3h-6z"/></svg>`,
    gate: `<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" d="M4 12h6M14 12h6M10 8v8"/></svg>`,
    compress: `<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" d="M4 12h16M8 8v8M16 6v12"/></svg>`,
    eq: `<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path fill="currentColor" d="M4 10h2v8H4zm5-4h2v12H9zm5 2h2v10h-2zm5-3h2v13h-2z"/></svg>`,
    deess: `<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" d="M6 16s2-4 6-4 6 4 6 4M6 8h12"/></svg>`,
  };
  return icons[name] || "";
}

function timeRulerHtml(durSec, steps = 4) {
  const marks = [];
  for (let i = 0; i <= steps; i++) marks.push(fmtTime((durSec * i) / steps));
  return `<div class="studioEditRuler">${marks.map((t) => `<span>${t}</span>`).join("")}</div>`;
}

/** Guide-aligned vocal waveform metadata (peaks match what you hear at guide t=0). */
function takeWaveMeta(take) {
  if (!take?.buffer || !engine) {
    return { peaks: [], contentDur: 0, bufStart: 0, guideWidthPct: 100 };
  }
  const bufStart = engine.takePlayStartSec(take);
  const contentDur = engine.takeContentDuration(take);
  const guideDur = engine.guideDuration || contentDur || take.buffer.duration;
  const peaks = StudioEngine.computePeaks(take.buffer, 72, bufStart, take.buffer.duration);
  return {
    peaks,
    contentDur,
    bufStart,
    guideWidthPct: guideDur ? Math.min(100, (contentDur / guideDur) * 100) : 100,
  };
}

function buildAiMixRecommendation(take, track) {
  const finish = suggestFinishPreset(track);
  let styleTab = "studio";
  if (finish === "warm") styleTab = "natural";
  else if (finish === "punchy") styleTab = "hardtune";
  else if (finish === "bright") styleTab = "pop";
  const tab = STYLE_TABS[styleTab];
  const meta = take ? getPitchRenderMeta(take, tab.pitch) : null;
  let match = 86 + Math.min(8, Math.round((meta?.voicedRatio || 0.45) * 14));
  if (meta?.audible) match += 5;
  return {
    styleTab,
    finish: tab.finish,
    pitchId: tab.pitch,
    styleLabel: tab.label,
    pitchLabel: pitchPresetLabel(tab.pitch),
    finishLabel: FINISH_LABELS[tab.finish] || tab.finish,
    matchPct: Math.min(99, match),
  };
}

function aiMixCardHtml(rec) {
  return `
    <div class="studioAiCard" data-studio-ai-card>
      <div class="studioAiCardTop">
        <div class="studioAiCardBrand"><span class="studioAiSpark" aria-hidden="true">✨</span> Nabad AI</div>
        <span class="studioAiMatch">${rec.matchPct}% match</span>
      </div>
      <p class="studioAiCardSub">Recommended for this take</p>
      <div class="studioAiChips" aria-label="Recommended settings">
        <span class="studioAiChip">${esc(rec.styleLabel)}</span>
        <span class="studioAiChip">${esc(rec.finishLabel)} mix</span>
        <span class="studioAiChip">${esc(rec.pitchLabel)} pitch</span>
      </div>
      <button type="button" class="studioAiApply" data-studio-ai-apply>Apply AI Mix</button>
    </div>`;
}

function updateAiApplyUi(root, m, aiRec) {
  const card = root.querySelector("[data-studio-ai-card]");
  const btn = root.querySelector("[data-studio-ai-apply]");
  const applied = m.styleTab === aiRec?.styleTab && m.styleTab !== "custom";
  card?.classList.toggle("isApplied", applied);
  if (btn) {
    btn.textContent = applied ? "Applied ✓" : "Apply AI Mix";
    btn.setAttribute("aria-pressed", applied ? "true" : "false");
  }
}

function stylePresetTabsHtml(activeId) {
  return `
    <div class="studioStyleTabs" data-studio-style-tabs role="group" aria-label="Style preset">
      ${STYLE_TAB_IDS.map((id) =>
        `<button type="button" class="studioStyleTab${id === activeId ? " isActive" : ""}" data-style-tab="${id}">${esc(STYLE_TABS[id].label)}</button>`,
      ).join("")}
    </div>`;
}

function advPitchDiffersFromDefaults(pitchId, adv) {
  const d = pitchAdvDefaults(pitchId);
  return (
    Math.round(Number(adv.humanize) || 0) !== d.humanize
    || Math.round(Number(adv.flexTune) || 0) !== d.flexTune
    || Math.round(Number(adv.expressionProtection) || 0) !== d.expressionProtection
    || Math.round(Number(adv.microPitchFilter) || 0) !== d.microPitchFilter
  );
}

function pitchAdvDefaults(pitchId) {
  const p = PITCH_CORRECTION_PRESETS[normalizePitchPresetId(pitchId)];
  return {
    humanize: Math.round((p.humanize || 0) * 100),
    retuneSpeed: Math.round(Math.max(8, Math.min(98, 100 - (p.retuneMs || 35) * 1.4))),
    flexTune: Math.round((p.flexTune || 0) * 100),
    expressionProtection: p.vibratoPreserve === "on" ? 78 : p.vibratoPreserve === "slight" ? 52 : 24,
    microPitchFilter: 72,
    stereoWidth: 50,
  };
}

function ensureMixAdvPitch(m) {
  if (!m.advPitch) m.advPitch = pitchAdvDefaults(activePitchPreset(engine?.getActiveTake?.()));
  return m.advPitch;
}

function advSliderRow(key, label, value, iconKey, opts = {}) {
  const disabled = opts.disabled ? " disabled" : "";
  const hint = opts.hint ? `<span class="studioAdvSoon">${esc(opts.hint)}</span>` : "";
  return `
    <label class="studioSliderRow${opts.disabled ? " studioSliderRow--disabled" : ""}">
      <span class="studioSliderIco" aria-hidden="true">${studioIco(iconKey)}</span>
      <span class="studioSliderLabel">${esc(label)}${hint}</span>
      <input type="range" min="0" max="100" value="${Number(value) || 0}" data-adv-pitch="${key}" aria-label="${esc(label)}"${disabled} />
      <span class="studioSliderVal" data-adv-pitch-val="${key}">${Number(value) || 0}</span>
    </label>`;
}

function refreshMixSlidersUi(root, m) {
  root.querySelectorAll("[data-mix]").forEach((inp) => {
    const k = inp.getAttribute("data-mix");
    if (!k || m[k] == null) return;
    inp.value = String(m[k]);
    const out = root.querySelector(`[data-mix-val="${k}"]`);
    if (out) out.textContent = String(m[k]);
  });
  root.querySelectorAll("[data-studio-finish] .studioSegBtn").forEach((btn) => {
    btn.classList.toggle("isActive", btn.getAttribute("data-finish") === m.finish);
  });
  const adv = ensureMixAdvPitch(m);
  root.querySelectorAll("[data-adv-pitch]").forEach((inp) => {
    const k = inp.getAttribute("data-adv-pitch");
    if (adv[k] == null) return;
    inp.value = String(adv[k]);
    const out = root.querySelector(`[data-adv-pitch-val="${k}"]`);
    if (out) out.textContent = String(adv[k]);
  });
}

function updateStyleTabUi(root, activeId) {
  root.querySelectorAll("[data-style-tab]").forEach((btn) => {
    btn.classList.toggle("isActive", btn.getAttribute("data-style-tab") === activeId);
  });
}

async function applyStyleTab(root, take, tabId, state) {
  const m = current.mix || (current.mix = { ...DEFAULT_MIX });
  if (tabId === "custom") {
    m.styleTab = "custom";
    updateStyleTabUi(root, "custom");
    updateAiApplyUi(root, m, state?.aiRec);
    return;
  }
  const tab = STYLE_TABS[tabId];
  if (!tab?.mix) return;
  m.styleTab = tabId;
  Object.assign(m, tab.mix);
  m.finish = tab.finish;
  m.finishUserPick = true;
  ensureTakePitchState(take).preset = tab.pitch;
  m.advPitch = pitchAdvDefaults(tab.pitch);
  updateStyleTabUi(root, tabId);
  refreshMixSlidersUi(root, m);
  if (engine?.isPlaying) {
    try { engine.updateMix(mixParams()); } catch {}
  }
  await selectPitchPreset(root, take, tab.pitch, { ...state, silent: true });
  updateAiApplyUi(root, m, state?.aiRec);
  if (state?.fromAi) {
    bridge.showToast?.("AI mix applied — tap play to hear it.");
    if (engine?.isPlaying) void restartMixPreview(root);
  }
}

async function warmupPitchPresets(take) {
  if (!take?.buffer) return;
  ensureTakePitchState(take).cache.none = take.buffer;
  for (const id of ["natural", "balanced", "pop", "hardtune"]) {
    await ensurePitchPresetRendered(take, id, {
      audioContext: engine?.ctx,
      trackKey: trackKeyHint(),
    });
    await new Promise((r) => requestAnimationFrame(r));
  }
}

function pitchFromRetuneSlider(v) {
  const n = Math.max(0, Math.min(100, Number(v) || 0));
  const idx = Math.round((n / 100) * (PITCH_RETUNE_STEPS.length - 1));
  return PITCH_RETUNE_STEPS[idx];
}

function renderPreviewMix(root, take) {
  screen = "mix";
  clearStudioOverlays(root);
  take = take || engine?.getActiveTake?.() || null;
  const m = current.mix || (current.mix = { ...DEFAULT_MIX });
  ensureMixFx(m);
  ensureMixFinish(m);
  if (!m.styleTab) m.styleTab = "studio";
  ensureMixAdvPitch(m);

  const takes = engine?.getTakes?.() || [];
  const wave = takeWaveMeta(take);
  const dur = wave.contentDur || engine?.guideDuration || 0;
  const aiRec = buildAiMixRecommendation(take, current?.track);
  const mixPanel = m.mixPanel || "basic";
  const adv = ensureMixAdvPitch(m);
  const takeNum = take ? (takes.findIndex((t) => t.id === take.id) + 1) || 1 : 1;

  root.innerHTML = `
    <div class="studio studioFinish" data-studio-screen="mix">
      ${headerHtml("PREVIEW")}

      <div class="studioFinishHead">
        ${takeTabsHtml(takes, take?.id)}
        <div class="studioFinishTake">Take ${takeNum}</div>
      </div>

      <button type="button" class="studioPreviewPlay" data-studio-play aria-label="Play preview">
        <span class="studioPreviewPlayIco" data-studio-play-ico aria-hidden="true">${studioIco("play")}</span>
        <span class="studioPreviewPlayLbl">Play preview</span>
      </button>

      <div class="studioWave studioWave--review studioWave--finish" data-studio-scrub role="slider" aria-label="Scrub preview" tabindex="0">
        ${peaksHtml(wave.peaks)}
        <span class="studioWaveFill" data-wave-fill></span>
        <span class="studioWaveHandle" data-wave-handle></span>
      </div>
      <div class="studioReviewTime studioFinishTime"><span data-studio-pos>0:00</span> <span class="studioReviewTimeSep">/</span> <span>${fmtTime(dur)}</span></div>

      ${aiMixCardHtml(aiRec)}

      <div class="studioPresetBlock">
        <span class="studioMixLabel">Style preset</span>
        ${stylePresetTabsHtml(m.styleTab)}
      </div>

      <div class="studioMixTabs" role="tablist" aria-label="Mix controls">
        <button type="button" class="studioMixTab${mixPanel === "basic" ? " isActive" : ""}" data-mix-panel="basic" role="tab" aria-selected="${mixPanel === "basic"}">Basic</button>
        <button type="button" class="studioMixTab${mixPanel === "advanced" ? " isActive" : ""}" data-mix-panel="advanced" role="tab" aria-selected="${mixPanel === "advanced"}">Advanced</button>
      </div>

      <div class="studioMixPanel" data-mix-panel-basic ${mixPanel === "basic" ? "" : "hidden"}>
        <div class="studioSliders studioSliders--compact">
          ${sliderRow("voiceVol", "Voice", m.voiceVol, "voice")}
          ${sliderRow("musicVol", "Music", m.musicVol, "music")}
          ${sliderRow("vocalGain", "Vocal gain", m.vocalGain ?? 50, "voice")}
        </div>
      </div>

      <div class="studioMixPanel" data-mix-panel-advanced ${mixPanel === "advanced" ? "" : "hidden"}>
        <div class="studioSliders studioSliders--compact">
          ${sliderRow("fxDenoise", "Noise gate", m.fxDenoise, "gate")}
          ${sliderRow("fxCompress", "Compressor", m.fxCompress, "compress")}
          ${sliderRow("fxEq", "Warm EQ", m.fxEq, "eq")}
          ${sliderRow("fxDeesser", "De-esser", m.fxDeesser, "deess")}
          ${sliderRow("reverb", "Reverb", m.reverb, "reverb")}
        </div>
        <div class="studioMixField studioMixField--sync">
          <div class="studioMixFieldTop">
            <span class="studioMixLabel">Timing</span>
            <span class="studioSyncVal" data-sync-val>In sync</span>
          </div>
          <input type="range" class="studioSyncSlider" min="-200" max="200" step="10" value="${Number(m.syncMs) || 0}" data-studio-sync aria-label="Voice timing offset" />
        </div>
        <div class="studioSliders studioSliders--compact studioSliders--advPitch">
          ${advSliderRow("retuneSpeed", "Retune speed", adv.retuneSpeed, "note")}
          ${advSliderRow("humanize", "Humanize", adv.humanize, "voice")}
          ${advSliderRow("flexTune", "Flex tune", adv.flexTune, "note")}
          ${advSliderRow("expressionProtection", "Expression protection", adv.expressionProtection, "voice")}
          ${advSliderRow("microPitchFilter", "Micro pitch filter", adv.microPitchFilter, "note")}
          ${advSliderRow("stereoWidth", "Stereo width", adv.stereoWidth, "music", { disabled: true, hint: "Soon" })}
        </div>
      </div>

      <section class="studioFinishSection">
        <span class="studioMixLabel">Finish style</span>
        <div class="studioSeg studioSeg--finish" data-studio-finish role="group" aria-label="Finish preset">
          ${FINISH_IDS.map((id) =>
            `<button type="button" class="studioSegBtn${m.finish === id ? " isActive" : ""}" data-finish="${id}">${esc(FINISH_LABELS[id] || id)}</button>`,
          ).join("")}
        </div>
      </section>

      <div class="studioFooter studioFooter--finish">
        <button type="button" class="studioPrimary studioPrimary--continue" data-studio-save-vocal>Save to My Vocals</button>
      </div>
    </div>`;

  bindPreviewMix(root, take, aiRec);
}

function renderReview(root, take) {
  renderPreviewMix(root, take);
}

function renderMix(root) {
  renderPreviewMix(root, engine?.getActiveTake?.());
}

function setReviewProgress(root, frac) {
  frac = Math.max(0, Math.min(1, Number(frac) || 0));
  const fill = root.querySelector("[data-wave-fill]");
  const handle = root.querySelector("[data-wave-handle]");
  if (fill) fill.style.width = `${frac * 100}%`;
  if (handle) handle.style.left = `${frac * 100}%`;
}

function activePitchPreset(take) {
  return normalizePitchPresetId(ensureTakePitchState(take)?.preset);
}

function pitchVoiceBufferForTake(take) {
  if (!take?.buffer) return undefined;
  const preset = activePitchPreset(take);
  if (preset === "none") return undefined;
  const adv = current?.mix?.advPitch;
  if (adv && advPitchDiffersFromDefaults(preset, adv)) {
    return getPitchAdvCachedBuffer(take) || getPitchCachedBuffer(take, preset) || undefined;
  }
  return getPitchCachedBuffer(take, preset) || undefined;
}

function pitchAppliedSummary(take) {
  const preset = activePitchPreset(take);
  if (preset === "none") {
    return { label: "Original", detail: "No pitch correction — raw vocal in preview & save.", active: false, onPitch: true };
  }
  const name = pitchPresetLabel(preset);
  const meta = getPitchRenderMeta(take, preset);
  const ready = !!getPitchCachedBuffer(take, preset);
  if (!ready) {
    return { label: name, detail: `${name} — rendering…`, active: false, onPitch: false };
  }
  const detail = describePitchRenderMeta(meta, preset);
  return {
    label: name,
    detail,
    active: !!(meta?.audible && !meta?.passthrough),
    onPitch: !!meta?.onPitch || !!meta?.passthrough,
  };
}

function pitchCorrectionFieldHtml(activePresetId, hint) {
  const summary = PITCH_CORRECTION_PRESETS[activePresetId]?.label || pitchPresetLabel(activePresetId);
  return `
      <div class="studioPitchField" data-studio-pitch-field>
        <div class="studioMixFieldTop">
          <span class="studioMixLabel">Pitch Correction</span>
          <span class="studioPitchStatus" data-pitch-status>${esc(summary)}</span>
        </div>
        <div class="studioPitchApplied" data-pitch-applied>
          <span class="studioPitchAppliedDot" aria-hidden="true"></span>
          <span data-pitch-applied-text>${esc(hint || "")}</span>
        </div>
        <p class="studioSyncHint studioPitchHint">Tap <strong>Original</strong> then a preset while playing to A/B. Hard Tune is the most obvious.</p>
        <div class="studioSeg studioPitchSeg" data-studio-pitch-presets role="group" aria-label="Pitch correction preset">
          ${PITCH_PRESET_IDS.map((id) =>
            `<button type="button" class="studioSegBtn${id === activePresetId ? " isActive" : ""}" data-pitch-preset="${id}">${esc(pitchPresetLabel(id))}</button>`,
          ).join("")}
        </div>
        <div class="studioPitchLoading" data-pitch-loading hidden aria-live="polite">
          <span class="studioPitchSpinner" aria-hidden="true"></span>
          <span data-pitch-loading-label>Rendering…</span>
        </div>
      </div>`;
}

function updatePitchAppliedUi(root, take) {
  const { label, detail, active, onPitch } = pitchAppliedSummary(take);
  const statusEl = root.querySelector("[data-pitch-status]");
  const appliedEl = root.querySelector("[data-pitch-applied-text]");
  const field = root.querySelector("[data-studio-pitch-field]");
  const dot = root.querySelector(".studioPitchAppliedDot");
  if (statusEl) statusEl.textContent = label;
  if (appliedEl) appliedEl.textContent = detail;
  if (field) {
    field.classList.toggle("studioPitchField--active", !!active);
    field.classList.toggle("studioPitchField--onPitch", !!onPitch && activePitchPreset(take) !== "none");
  }
  if (dot) {
    const preset = activePitchPreset(take);
    const ready = preset !== "none" && !!getPitchCachedBuffer(take, preset);
    const meta = getPitchRenderMeta(take, preset);
    dot.classList.toggle("isOn", ready && !!active);
    dot.classList.toggle("isNeutral", ready && (onPitch || meta?.noPitchDetected) && preset !== "none");
    dot.classList.toggle("isWarn", ready && !!meta?.noPitchDetected);
  }
}

function reviewVoiceBuffer(take) {
  return pitchVoiceBufferForTake(take);
}

function pitchPlaybackBuffer(take, presetId) {
  if (!take?.buffer) return null;
  if (presetId === "none") return take.buffer;
  const adv = current?.mix?.advPitch;
  if (adv && advPitchDiffersFromDefaults(presetId, adv)) {
    return getPitchAdvCachedBuffer(take) || getPitchCachedBuffer(take, presetId);
  }
  return getPitchCachedBuffer(take, presetId);
}

function setPitchLoadingUi(root, presetId, loading) {
  const field = root.querySelector("[data-studio-pitch-field]");
  const loadingEl = root.querySelector("[data-pitch-loading]");
  const loadingLabel = root.querySelector("[data-pitch-loading-label]");
  field?.classList.toggle("studioPitchField--busy", loading);
  root.querySelectorAll("[data-pitch-preset]").forEach((btn) => {
    const id = btn.getAttribute("data-pitch-preset");
    btn.classList.toggle("isLoading", loading && id === presetId);
    btn.disabled = loading;
  });
  if (loadingEl) loadingEl.hidden = !loading;
  if (loading && loadingLabel) {
    loadingLabel.textContent = isPitchPresetInstant(presetId)
      ? "Applying…"
      : `Rendering ${pitchPresetLabel(presetId)}…`;
  }
}

function swapPitchVoice(take, presetId) {
  const buf = pitchPlaybackBuffer(take, presetId);
  if (!buf || !engine?.isPlaying) return;
  engine.swapVoiceBufferDuringMix(buf);
}

async function ensureTakePitchReady(take) {
  const preset = activePitchPreset(take);
  if (!take || preset === "none") return;
  const adv = current?.mix?.advPitch;
  if (adv && advPitchDiffersFromDefaults(preset, adv)) {
    if (getPitchAdvCachedBuffer(take)) return;
    await engine?.ensureReady();
    if (take?.blob && !take?.buffer) await engine?.hydrateTakeBuffer(take);
    if (!take?.buffer) return;
    await ensurePitchAdvRendered(take, preset, adv, {
      audioContext: engine?.ctx,
      trackKey: trackKeyHint(),
    });
    return;
  }
  if (getPitchCachedBuffer(take, preset)) return;
  await engine?.ensureReady();
  if (take?.blob && !take?.buffer) await engine?.hydrateTakeBuffer(take);
  if (!take?.buffer) return;
  await ensurePitchPresetRendered(take, preset, {
    audioContext: engine?.ctx,
    trackKey: trackKeyHint(),
  });
}

async function applyAdvPitchSliders(root, take, state) {
  if (!take?.buffer) return;
  const preset = activePitchPreset(take);
  if (preset === "none") return;
  const adv = ensureMixAdvPitch(current.mix || {});
  if (!advPitchDiffersFromDefaults(preset, adv)) {
    clearPitchAdvCache(take);
    swapPitchVoice(take, preset);
    return;
  }
  if (!state?.silent) setPitchLoadingUi(root, preset, true);
  try {
    await engine?.ensureReady();
    await ensurePitchAdvRendered(take, preset, adv, {
      audioContext: engine?.ctx,
      trackKey: trackKeyHint(),
    });
    if (!state?.silent) setPitchLoadingUi(root, preset, false);
    swapPitchVoice(take, preset);
  } catch (err) {
    console.warn("[studio] adv pitch failed:", err);
    setPitchLoadingUi(root, preset, false);
    if (!state?.silent) bridge.showToast?.("Couldn't update pitch settings.");
  }
}

function trackKeyHint() {
  const t = current?.track;
  return t?.key
    || t?.meta?.key
    || t?.meta?.musicalKey
    || t?.meta?.tonality
    || t?.meta?.scale
    || "";
}

async function selectPitchPreset(root, take, presetId, state) {
  if (!take?.buffer) return;
  clearPitchAdvCache(take);
  const pc = ensureTakePitchState(take);
  pc.preset = presetId;

  root.querySelectorAll("[data-pitch-preset]").forEach((btn) => {
    btn.classList.toggle("isActive", btn.getAttribute("data-pitch-preset") === presetId);
  });
  updatePitchAppliedUi(root, take);

  const cached = getPitchCachedBuffer(take, presetId);
  if (cached) {
    setPitchLoadingUi(root, presetId, false);
    swapPitchVoice(take, presetId);
    if (state?.onReady) state.onReady(take);
    return;
  }

  if (!state?.silent) setPitchLoadingUi(root, presetId, true);
  const guideSec = engine?.isPlaying ? engine.getMixGuidePosition() : (state?.lastGuideSec || 0);
  if (state) state.lastGuideSec = guideSec;

  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

  try {
    await engine?.ensureReady();
    if (take?.blob && !take?.buffer) await engine?.hydrateTakeBuffer(take);
    if (!take?.buffer) {
      setPitchLoadingUi(root, presetId, false);
      bridge.showToast?.("Vocal isn’t ready yet — try again.");
      return;
    }
    const buf = await ensurePitchPresetRendered(take, presetId, {
      audioContext: engine?.ctx,
      trackKey: trackKeyHint(),
    });
    setPitchLoadingUi(root, presetId, false);
    updatePitchAppliedUi(root, take);
    if (!buf) {
      if (!state?.silent) bridge.showToast?.("Couldn’t render pitch correction.");
      return;
    }
    swapPitchVoice(take, presetId);
    if (state?.onReady) state.onReady(take);
  } catch (err) {
    console.warn("[studio] pitch preset failed:", presetId, err);
    setPitchLoadingUi(root, presetId, false);
    if (!state?.silent) bridge.showToast?.("Couldn't render pitch correction.");
  }
}

function bindPitchPresets(root, take, state) {
  root.querySelectorAll("[data-pitch-preset]").forEach((btn) => {
    btn.addEventListener("click", () => {
      bridge.haptic?.("light");
      const id = btn.getAttribute("data-pitch-preset");
      if (!id) return;
      const pc = ensureTakePitchState(take);
      if (id === pc?.preset && getPitchCachedBuffer(take, id)) return;
      void selectPitchPreset(root, take, id, state);
    });
  });
}

function bindPreviewMix(root, take, aiRec) {
  bindHeader(root, () => renderHome(root));
  const m = current.mix || (current.mix = { ...DEFAULT_MIX });
  const pitchState = { lastGuideSec: 0, silent: true, aiRec };

  const btn = root.querySelector("[data-studio-play]");
  const icoWrap = root.querySelector("[data-studio-play-ico]");
  const lblEl = root.querySelector(".studioPreviewPlayLbl");
  const posEl = root.querySelector("[data-studio-pos]");
  const wave = root.querySelector("[data-studio-scrub]");
  const contentDur = () => engine?.guideDuration || engine?.takeContentDuration(take) || take?.buffer?.duration || 0;

  const setPlayingUi = (playing) => {
    if (icoWrap) icoWrap.innerHTML = playing ? studioIco("pause") : studioIco("play");
    btn?.classList.toggle("isPlaying", playing);
    if (lblEl) lblEl.textContent = playing ? "Pause" : "Play preview";
  };

  const playFrom = async (fromGuideSec) => {
    try {
      if (!engine.guideBuffer && current.guideUrl) await engine.loadGuide(current.guideUrl);
      engine.stopMix();
      setPlayingUi(true);
      const fromSec = Math.max(0, fromGuideSec || 0);
      pitchState.lastGuideSec = fromSec;
      const dur = contentDur();
      await engine.playMix(
        { ...mixParams(take?.id), fromSec },
        {
          onTick: (s) => {
            const g = fromSec + s;
            pitchState.lastGuideSec = g;
            if (posEl) posEl.textContent = fmtTime(Math.min(g, dur));
            if (dur) setReviewProgress(root, Math.min(1, g / dur));
          },
          onEnded: () => {
            setPlayingUi(false);
            setReviewProgress(root, 0);
            if (posEl) posEl.textContent = "0:00";
          },
        },
      );
    } catch {
      setPlayingUi(false);
      bridge.showToast?.("Couldn't play here.");
    }
  };
  pitchState.playFrom = playFrom;

  btn?.addEventListener("click", () => {
    bridge.haptic?.("light");
    if (engine?.isPlaying) { engine.stopMix(); setPlayingUi(false); return; }
    void playFrom(pitchState.lastGuideSec || 0);
  });

  const dur = contentDur();
  if (wave && dur > 0) {
    let seeking = false;
    const fracFromEvent = (ev) => {
      const r = wave.getBoundingClientRect();
      const x = (ev.clientX ?? ev.touches?.[0]?.clientX ?? 0) - r.left;
      return Math.max(0, Math.min(1, r.width ? x / r.width : 0));
    };
    wave.addEventListener("pointerdown", (e) => {
      seeking = true;
      try { wave.setPointerCapture(e.pointerId); } catch {}
      const f = fracFromEvent(e);
      setReviewProgress(root, f);
      if (posEl) posEl.textContent = fmtTime(f * dur);
    });
    wave.addEventListener("pointermove", (e) => {
      if (!seeking) return;
      const f = fracFromEvent(e);
      setReviewProgress(root, f);
      if (posEl) posEl.textContent = fmtTime(f * dur);
    });
    const release = (e) => {
      if (!seeking) return;
      seeking = false;
      bridge.haptic?.("light");
      void playFrom(fracFromEvent(e) * dur);
    };
    wave.addEventListener("pointerup", release);
    wave.addEventListener("pointercancel", () => { seeking = false; });
  }

  root.querySelectorAll("[data-take-id]").forEach((tab) => {
    tab.addEventListener("click", () => {
      bridge.haptic?.("light");
      try { engine.stopMix(); } catch {}
      engine.setActiveTake(tab.getAttribute("data-take-id"));
      void persistProject();
      renderPreviewMix(root, engine.getActiveTake());
    });
  });

  root.querySelectorAll("[data-style-tab]").forEach((tabBtn) => {
    tabBtn.addEventListener("click", () => {
      bridge.haptic?.("light");
      const id = tabBtn.getAttribute("data-style-tab");
      if (!id) return;
      void applyStyleTab(root, take, id, pitchState);
    });
  });

  updateAiApplyUi(root, m, aiRec);

  root.querySelector("[data-studio-ai-apply]")?.addEventListener("click", () => {
    bridge.haptic?.("medium");
    void applyStyleTab(root, take, aiRec?.styleTab || "studio", { ...pitchState, fromAi: true });
  });

  root.querySelectorAll("[data-mix-panel]").forEach((tabBtn) => {
    tabBtn.addEventListener("click", () => {
      bridge.haptic?.("light");
      const panel = tabBtn.getAttribute("data-mix-panel");
      if (!panel) return;
      m.mixPanel = panel;
      root.querySelectorAll(".studioMixTab").forEach((b) => {
        const on = b.getAttribute("data-mix-panel") === panel;
        b.classList.toggle("isActive", on);
        b.setAttribute("aria-selected", on ? "true" : "false");
      });
      root.querySelector("[data-mix-panel-basic]")?.toggleAttribute("hidden", panel !== "basic");
      root.querySelector("[data-mix-panel-advanced]")?.toggleAttribute("hidden", panel !== "advanced");
    });
  });

  root.querySelectorAll("[data-mix]").forEach((inp) => {
    inp.addEventListener("input", () => {
      const k = inp.getAttribute("data-mix");
      m[k] = Number(inp.value) || 0;
      m.styleTab = "custom";
      updateStyleTabUi(root, "custom");
      updateAiApplyUi(root, m, pitchState.aiRec);
      const out = root.querySelector(`[data-mix-val="${k}"]`);
      if (out) out.textContent = String(m[k]);
      if (engine?.isPlaying) {
        if (k === "fxDenoise") restartMixPreview(root);
        else { try { engine.updateMix(mixParams()); } catch {} }
      }
    });
  });

  root.querySelectorAll("[data-adv-pitch]").forEach((inp) => {
    inp.addEventListener("input", () => {
      const k = inp.getAttribute("data-adv-pitch");
      const adv = ensureMixAdvPitch(m);
      adv[k] = Number(inp.value) || 0;
      m.styleTab = "custom";
      updateStyleTabUi(root, "custom");
      updateAiApplyUi(root, m, pitchState.aiRec);
      const out = root.querySelector(`[data-adv-pitch-val="${k}"]`);
      if (out) out.textContent = String(adv[k]);
      if (k === "retuneSpeed" && take) {
        const pid = pitchFromRetuneSlider(adv.retuneSpeed);
        ensureTakePitchState(take).preset = pid;
        m.advPitch = pitchAdvDefaults(pid);
        refreshMixSlidersUi(root, m);
        void selectPitchPreset(root, take, pid, { ...pitchState, silent: true });
      } else if (k !== "stereoWidth" && take) {
        void applyAdvPitchSliders(root, take, pitchState);
      }
    });
  });

  const syncInp = root.querySelector("[data-studio-sync]");
  const syncValEl = root.querySelector("[data-sync-val]");
  const applySync = (v) => {
    m.syncMs = v;
    m.styleTab = "custom";
    updateStyleTabUi(root, "custom");
    updateAiApplyUi(root, m, pitchState.aiRec);
    if (syncValEl) {
      syncValEl.textContent = v === 0 ? "In sync" : `${v > 0 ? "+" : ""}${v} ms`;
    }
    const t = engine?.getActiveTake?.();
    if (t?.id) { try { engine.setTakeNudgeMs(t.id, -v); } catch {} }
  };
  applySync(Number(m.syncMs) || 0);
  syncInp?.addEventListener("input", () => applySync(Number(syncInp.value) || 0));
  syncInp?.addEventListener("change", () => { if (engine?.isPlaying) restartMixPreview(root); });

  root.querySelector("[data-studio-finish]")?.addEventListener("click", (e) => {
    const b = e.target.closest("[data-finish]");
    if (!b) return;
    bridge.haptic?.("light");
    m.finish = b.getAttribute("data-finish");
    m.finishUserPick = true;
    m.styleTab = "custom";
    updateStyleTabUi(root, "custom");
    updateAiApplyUi(root, m, pitchState.aiRec);
    root.querySelectorAll("[data-studio-finish] .studioSegBtn").forEach((x) => {
      x.classList.toggle("isActive", x === b);
    });
  });

  root.querySelector("[data-studio-save-vocal]")?.addEventListener("click", () => {
    void saveVocalFromPreview(root);
  });

  void (async () => {
    if (!take) return;
    if (!take.buffer && take.blob) await engine?.hydrateTakeBuffer(take);
    if (!take.buffer) return;
    ensureTakePitchState(take).cache.none = take.buffer;
    const tab = STYLE_TABS[m.styleTab] || STYLE_TABS.studio;
    if (tab.pitch) ensureTakePitchState(take).preset = tab.pitch;
    const prepared = current._previewPreparedTakeId === take.id;
    if (!prepared) void warmupPitchPresets(take);
    await selectPitchPreset(root, take, activePitchPreset(take), { ...pitchState, silent: true });
  })();
}

/* -------------------------------------------------------------------------- */
/* Screen: Edit Take (trim / split / delete)                                     */
/* -------------------------------------------------------------------------- */

function renderEditTake(root, take) {
  screen = "edit";
  take = take || engine?.getActiveTake?.() || null;
  const takes = engine?.getTakes?.() || [];
  const hasVoice = !!(take?.buffer);
  const guideDur = engine?.guideDuration || take?.buffer?.duration || 0;
  const wave = takeWaveMeta(take);
  const voicePeaks = wave.peaks;
  const voiceWidthPct = wave.guideWidthPct;
  const guidePeaks = engine?.guideBuffer ? StudioEngine.computePeaks(engine.guideBuffer, 72) : [];

  root.innerHTML = `
    <div class="studio studioEdit" data-studio-screen="edit">
      ${headerHtml("EDIT TAKE")}

      <div class="studioReviewHead">
        ${takeTabsHtml(takes, take?.id)}
        <p class="studioReviewSub studioEditSub">Trim or cut parts, then keep what you love.</p>
      </div>

      <div class="studioEditBody">
        ${timeRulerHtml(guideDur)}

        <div class="studioEditLanes" data-edit-lanes>
          <div class="studioEditPlayhead" data-edit-playhead hidden></div>

          <div class="studioEditLane studioEditLane--voice">
            <span class="studioEditLaneLabel">Vocal</span>
            <div class="studioEditTrack" data-edit-voice-track tabindex="0" aria-label="Vocal timeline">
              ${hasVoice ? `
                <div class="studioEditClip" style="left:0;width:${voiceWidthPct}%" data-edit-clip>
                  <div class="studioEditTrimShade studioEditTrimShade--left" data-trim-shade-l></div>
                  <div class="studioEditTrimShade studioEditTrimShade--right" data-trim-shade-r></div>
                  <div class="studioEditWave studioEditWave--voice">${peaksHtml(voicePeaks)}</div>
                  <div class="studioEditSelect" data-edit-select hidden></div>
                  <button type="button" class="studioEditTrimHandle studioEditTrimHandle--in" data-trim-in aria-label="Trim start"></button>
                  <button type="button" class="studioEditTrimHandle studioEditTrimHandle--out" data-trim-out aria-label="Trim end"></button>
                </div>` : `<div class="studioEditWave studioEditWave--empty">No vocal recorded</div>`}
            </div>
          </div>

          <div class="studioEditLane studioEditLane--music">
            <span class="studioEditLaneLabel">Instrumental</span>
            <div class="studioEditTrack" data-edit-music-track tabindex="0" aria-label="Instrumental timeline">
              <div class="studioEditWave studioEditWave--music">${peaksHtml(guidePeaks)}</div>
            </div>
          </div>
        </div>

        <div class="studioReviewTime">
          <span data-edit-pos>0:00</span>
          <span class="studioReviewTimeSep">/</span>
          <span>${fmtTime(guideDur)}</span>
        </div>

        <div class="studioEditTools" role="toolbar" aria-label="Edit tools">
          <button type="button" class="studioEditTool studioEditTool--play" data-edit-play aria-label="Play">
            ${studioIco("play")}
            <span>Play</span>
          </button>
          <button type="button" class="studioEditTool" data-edit-undo disabled aria-label="Undo">
            ${studioIco("undo")}
            <span>Undo</span>
          </button>
          <button type="button" class="studioEditTool" data-edit-trim aria-label="Trim">
            ${studioIco("trim")}
            <span>Trim</span>
          </button>
          <button type="button" class="studioEditTool" data-edit-split aria-label="Split">
            ${studioIco("split")}
            <span>Split</span>
          </button>
          <button type="button" class="studioEditTool studioEditTool--danger" data-edit-delete disabled aria-label="Delete">
            ${studioIco("delete")}
            <span>Delete</span>
          </button>
          <button type="button" class="studioEditTool" data-edit-levels aria-label="Levels">
            ${studioIco("levels")}
            <span>Levels</span>
          </button>
        </div>
      </div>

      <div class="studioLevelsSheet" data-levels-sheet hidden>
        <div class="studioLevelsBackdrop" data-levels-close tabindex="-1" aria-hidden="true"></div>
        <div class="studioLevelsPanel" role="dialog" aria-label="Levels">
          <div class="studioLevelsHead">
            <span class="studioLevelsTitle">Levels</span>
            <button type="button" class="studioLevelsDone" data-levels-close>Done</button>
          </div>
          <div class="studioLevelsSliders">
            ${sliderRow("voiceVol", "Voice", mixState().voiceVol, "voice")}
            ${sliderRow("vocalGain", "Vocal gain", mixState().vocalGain ?? 50, "voice")}
            ${sliderRow("musicVol", "Music", mixState().musicVol, "music")}
          </div>
        </div>
      </div>

      <div class="studioFooter studioFooter--edit">
        <button type="button" class="studioPrimary" data-edit-continue>Continue to Mix</button>
      </div>
    </div>`;

  bindEditTake(root, take);
}

function bindEditTake(root, take) {
  bindHeader(root, () => {
    try { engine?.stopMix(); } catch {}
    renderReview(root, take);
  });

  const m = mixState();
  const posEl = root.querySelector("[data-edit-pos]");
  const playBtn = root.querySelector("[data-edit-play]");
  const playhead = root.querySelector("[data-edit-playhead]");
  const lanesEl = root.querySelector("[data-edit-lanes]");
  const voiceTrack = root.querySelector("[data-edit-voice-track]");
  const musicTrack = root.querySelector("[data-edit-music-track]");
  const clipEl = root.querySelector("[data-edit-clip]");
  const selEl = root.querySelector("[data-edit-select]");
  const trimInEl = root.querySelector("[data-trim-in]");
  const trimOutEl = root.querySelector("[data-trim-out]");
  const shadeL = root.querySelector("[data-trim-shade-l]");
  const shadeR = root.querySelector("[data-trim-shade-r]");
  const btnDelete = root.querySelector("[data-edit-delete]");
  const levelsSheet = root.querySelector("[data-levels-sheet]");

  let playGuideSec = 0;
  let selGuide = null;
  let trimIn = 0;
  let trimOut = engine?.takeContentDuration(take) || take?.buffer?.duration || 0;

  const guideDur = () => engine?.guideDuration || take?.buffer?.duration || 0;
  const bufStart = () => engine?.takePlayStartSec(take) || 0;
  const contentDur = () => engine?.takeContentDuration(take) || 0;
  const toBufferSec = (guideSec) => bufStart() + guideSec;

  const editParams = () => {
    const params = { ...mixParams(take?.id), fromSec: playGuideSec };
    const vd = contentDur();
    if (trimIn > 0.02 || trimOut < vd - 0.02) {
      params.voiceClipStart = trimIn;
      params.voiceClipEnd = trimOut;
    }
    return params;
  };

  const setPlayhead = (guideSec) => {
    const dur = guideDur();
    if (!playhead || dur <= 0) return;
    playhead.hidden = false;
    playhead.style.left = `${Math.max(0, Math.min(1, guideSec / dur)) * 100}%`;
    if (posEl) posEl.textContent = fmtTime(guideSec);
  };

  const guideSecFromTrack = (trackEl, ev) => {
    const dur = guideDur();
    if (!trackEl || dur <= 0) return 0;
    const r = trackEl.getBoundingClientRect();
    const x = (ev.clientX ?? ev.touches?.[0]?.clientX ?? 0) - r.left;
    return Math.max(0, Math.min(dur, (r.width ? x / r.width : 0) * dur));
  };

  const paintTrimHandles = () => {
    const vd = contentDur();
    if (!clipEl || vd <= 0) return;
    const inPct = (trimIn / vd) * 100;
    const outPct = (trimOut / vd) * 100;
    if (trimInEl) trimInEl.style.left = `${inPct}%`;
    if (trimOutEl) trimOutEl.style.left = `${outPct}%`;
    if (shadeL) { shadeL.style.width = `${inPct}%`; shadeL.hidden = trimIn <= 0.02; }
    if (shadeR) { shadeR.style.width = `${100 - outPct}%`; shadeR.hidden = trimOut >= vd - 0.02; }
  };

  const validSelection = () => {
    if (!selGuide || !take?.buffer) return null;
    const a = Math.min(selGuide.a, selGuide.b);
    const b = Math.max(selGuide.a, selGuide.b);
    const end = contentDur();
    const lo = Math.max(0, Math.min(a, end));
    const hi = Math.max(lo, Math.min(b, end));
    if (hi - lo < 0.08) return null;
    return { contentA: lo, contentB: hi };
  };

  const paintSelection = () => {
    const sel = validSelection();
    if (btnDelete) btnDelete.disabled = !sel;
    if (!selEl || !take?.buffer) return;
    if (!sel) { selEl.hidden = true; return; }
    const vd = contentDur() || 1;
    selEl.hidden = false;
    selEl.style.left = `${(sel.contentA / vd) * 100}%`;
    selEl.style.width = `${((sel.contentB - sel.contentA) / vd) * 100}%`;
  };

  const setPlayingUi = (playing) => {
    if (playBtn) {
      playBtn.classList.toggle("isPlaying", playing);
      playBtn.innerHTML = `${playing ? studioIco("pause") : studioIco("play")}<span>${playing ? "Pause" : "Play"}</span>`;
    }
  };

  const playFrom = async (fromGuideSec) => {
    try {
      if (!engine.guideBuffer && current.guideUrl) await engine.loadGuide(current.guideUrl);
      engine.stopMix();
      playGuideSec = Math.max(0, fromGuideSec || 0);
      setPlayingUi(true);
      setPlayhead(playGuideSec);
      await engine.playMix(editParams(), {
        onTick: (s) => setPlayhead(playGuideSec + s),
        onEnded: () => { setPlayingUi(false); setPlayhead(0); playGuideSec = 0; },
      });
    } catch {
      setPlayingUi(false);
      bridge.showToast?.("Couldn’t play here.");
    }
  };

  playBtn?.addEventListener("click", () => {
    bridge.haptic?.("light");
    if (engine?.isPlaying) { engine.stopMix(); setPlayingUi(false); return; }
    void playFrom(playGuideSec);
  });

  const bindTrimHandle = (handleEl, which) => {
    if (!handleEl || !clipEl) return;
    handleEl.addEventListener("pointerdown", (e) => {
      e.stopPropagation();
      bridge.haptic?.("light");
      const vd = contentDur();
      const move = (ev) => {
        const clipR = clipEl.getBoundingClientRect();
        const x = (ev.clientX ?? 0) - clipR.left;
        const localSec = Math.max(0, Math.min(vd, (clipR.width ? x / clipR.width : 0) * vd));
        if (which === "in") trimIn = Math.min(localSec, trimOut - 0.08);
        else trimOut = Math.max(localSec, trimIn + 0.08);
        paintTrimHandles();
      };
      const up = () => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
    });
  };

  bindTrimHandle(trimInEl, "in");
  bindTrimHandle(trimOutEl, "out");
  paintTrimHandles();

  const btnUndo = root.querySelector("[data-edit-undo]");
  const syncUndoBtn = () => {
    if (btnUndo) btnUndo.disabled = !engine?.canUndo?.();
  };
  syncUndoBtn();

  btnUndo?.addEventListener("click", () => {
    if (!engine?.canUndo?.()) return;
    bridge.haptic?.("light");
    try { engine.stopMix(); } catch {}
    engine.undo();
    void persistProject();
    renderEditTake(root, engine.getActiveTake());
  });

  root.querySelector("[data-edit-trim]")?.addEventListener("click", () => {
    if (!take?.id || !take.buffer) return;
    bridge.haptic?.("medium");
    try { engine.stopMix(); } catch {}
    const vd = contentDur();
    if (trimIn <= 0.02 && trimOut >= vd - 0.02) {
      bridge.showToast?.("Drag the trim handles first.");
      return;
    }
    const ok = engine.trimTake(take.id, toBufferSec(trimIn), toBufferSec(trimOut));
    if (!ok) { bridge.showToast?.("Couldn’t trim."); return; }
    void persistProject();
    renderEditTake(root, engine.getActiveTake());
  });

  root.querySelector("[data-edit-split]")?.addEventListener("click", () => {
    if (!take?.id || !take.buffer) return;
    bridge.haptic?.("medium");
    try { engine.stopMix(); } catch {}
    const end = contentDur();
    if (playGuideSec <= 0.05 || playGuideSec >= end - 0.05) {
      bridge.showToast?.("Move the playhead inside your vocal to split.");
      return;
    }
    const newTake = engine.splitTake(take.id, toBufferSec(playGuideSec));
    if (!newTake) { bridge.showToast?.("Couldn’t split here."); return; }
    engine.setActiveTake(newTake.id);
    bridge.showToast?.("Split into two takes.");
    void persistProject();
    renderEditTake(root, engine.getActiveTake());
  });

  root.querySelector("[data-edit-delete]")?.addEventListener("click", () => {
    const sel = validSelection();
    if (!sel || !take?.id) return;
    bridge.haptic?.("medium");
    try { engine.stopMix(); } catch {}
    const ok = engine.deleteTakeRegion(take.id, toBufferSec(sel.contentA), toBufferSec(sel.contentB));
    if (!ok) { bridge.showToast?.("Couldn’t delete that part."); return; }
    selGuide = null;
    void persistProject();
    renderEditTake(root, engine.getActiveTake());
  });

  const openLevels = () => { if (levelsSheet) levelsSheet.hidden = false; };
  const closeLevels = () => { if (levelsSheet) levelsSheet.hidden = true; };
  root.querySelector("[data-edit-levels]")?.addEventListener("click", () => { bridge.haptic?.("light"); openLevels(); });
  root.querySelectorAll("[data-levels-close]").forEach((el) => {
    el.addEventListener("click", () => { bridge.haptic?.("light"); closeLevels(); });
  });
  levelsSheet?.querySelectorAll("[data-mix]").forEach((inp) => {
    inp.addEventListener("input", () => {
      const k = inp.getAttribute("data-mix");
      m[k] = Number(inp.value) || 0;
      const out = levelsSheet.querySelector(`[data-mix-val="${k}"]`);
      if (out) out.textContent = String(m[k]);
      if (engine?.isPlaying) { try { engine.updateMix(editParams()); } catch {} }
    });
  });

  root.querySelectorAll("[data-take-id]").forEach((tab) => {
    tab.addEventListener("click", () => {
      bridge.haptic?.("light");
      try { engine.stopMix(); } catch {}
      engine.setActiveTake(tab.getAttribute("data-take-id"));
      void persistProject();
      renderEditTake(root, engine.getActiveTake());
    });
  });

  root.querySelector("[data-edit-continue]")?.addEventListener("click", () => {
    bridge.haptic?.("medium");
    try { engine?.stopMix(); } catch {}
    const vd = contentDur();
    if (take?.id && take.buffer && (trimIn > 0.02 || trimOut < vd - 0.02)) {
      engine.trimTake(take.id, toBufferSec(trimIn), toBufferSec(trimOut));
    }
    void persistProject();
    renderMix(root);
  });

  const bindSeek = (trackEl) => {
    if (!trackEl) return;
    trackEl.addEventListener("pointerdown", (e) => {
      if (e.target.closest("[data-trim-in],[data-trim-out]")) return;
      playGuideSec = guideSecFromTrack(trackEl, e);
      setPlayhead(playGuideSec);
    });
  };

  const bindVoiceSelect = () => {
    if (!voiceTrack || !take?.buffer) return;
    let dragging = false;
    let moved = false;
    let startGuide = 0;
    voiceTrack.addEventListener("pointerdown", (e) => {
      if (e.target.closest("[data-trim-in],[data-trim-out]")) return;
      dragging = true;
      moved = false;
      startGuide = guideSecFromTrack(voiceTrack, e);
      try { voiceTrack.setPointerCapture(e.pointerId); } catch {}
    });
    voiceTrack.addEventListener("pointermove", (e) => {
      if (!dragging) return;
      const cur = guideSecFromTrack(voiceTrack, e);
      if (Math.abs(cur - startGuide) > 0.12) moved = true;
      if (!moved) return;
      e.preventDefault();
      selGuide = { a: startGuide, b: cur };
      paintSelection();
    });
    const finish = (e) => {
      if (!dragging) return;
      dragging = false;
      if (moved) { e.preventDefault(); paintSelection(); return; }
      playGuideSec = guideSecFromTrack(voiceTrack, e);
      setPlayhead(playGuideSec);
    };
    voiceTrack.addEventListener("pointerup", finish);
    voiceTrack.addEventListener("pointercancel", () => { dragging = false; });
  };

  bindSeek(musicTrack);
  bindVoiceSelect();

  if (lanesEl) {
    let scrubbing = false;
    playhead?.addEventListener("pointerdown", (e) => {
      scrubbing = true;
      try { playhead.setPointerCapture(e.pointerId); } catch {}
    });
    playhead?.addEventListener("pointermove", (e) => {
      if (!scrubbing) return;
      playGuideSec = guideSecFromTrack(lanesEl.querySelector("[data-edit-music-track]") || musicTrack, e);
      setPlayhead(playGuideSec);
    });
    playhead?.addEventListener("pointerup", () => { scrubbing = false; });
  }

  setPlayhead(0);
}


function sliderRow(key, label, value, iconKey) {
  return `
    <label class="studioSliderRow">
      <span class="studioSliderIco" aria-hidden="true">${studioIco(iconKey)}</span>
      <span class="studioSliderLabel">${esc(label)}</span>
      <input type="range" min="0" max="100" value="${Number(value) || 0}" data-mix="${key}" aria-label="${esc(label)}" />
      <span class="studioSliderVal" data-mix-val="${key}">${Number(value) || 0}</span>
    </label>`;
}

function mixParams(takeId) {
  const m = current.mix || DEFAULT_MIX;
  const tid = takeId || engine?.activeTakeId || engine?.getActiveTake?.()?.id || "";
  const take = tid
    ? (engine?.getTakes?.()?.find((t) => t.id === tid) || engine?.getActiveTake?.())
    : engine?.getActiveTake?.();
  const voiceBufferOverride = pitchVoiceBufferForTake(take);
  return {
    takeId: tid,
    voiceVol: (Number(m.voiceVol) ?? 50) / 100,
    vocalGain: (Number(m.vocalGain) ?? 50) / 100,
    musicVol: (Number(m.musicVol) || 0) / 100,
    reverb: (Number(m.reverb) || 0) / 100,
    fxDenoise: mixFxValue(m, "fxDenoise"),
    fxCompress: mixFxValue(m, "fxCompress"),
    fxEq: mixFxValue(m, "fxEq"),
    fxDeesser: mixFxValue(m, "fxDeesser"),
    finish: FINISH_PRESETS[m.finish] ? m.finish : "balanced",
    voiceBufferOverride,
  };
}

function setPlayUi(root, playing) {
  const ico = root.querySelector("[data-studio-play-ico]");
  const label = root.querySelector("[data-studio-play-label]");
  if (ico) ico.innerHTML = playing ? studioIco("pause") : studioIco("play");
  if (label) label.textContent = playing ? "Stop" : "Preview mix";
  root.querySelector("[data-studio-play]")?.classList.toggle("isPlaying", playing);
}

async function togglePreview(root) {
  bridge.haptic?.("light");
  if (engine?.isPlaying) { engine.stopMix(); setPlayUi(root, false); return; }
  try {
    if (!engine.guideBuffer && current.guideUrl) await engine.loadGuide(current.guideUrl);
    setPlayUi(root, true);
    await engine.playMix(mixParams(), { onEnded: () => setPlayUi(root, false) });
  } catch {
    setPlayUi(root, false);
    bridge.showToast?.("Couldn’t preview here.");
  }
}

async function restartMixPreview(root) {
  try { engine.stopMix(); await engine.playMix(mixParams(), { onEnded: () => setPlayUi(root, false) }); } catch {}
}

function saveDraft() {
  bridge.haptic?.("light");
  void persistProject().then(() => {
    unsaved = false;
    bridge.showToast?.("Draft saved on your device.");
  });
}


async function saveVocalFromPreview(root) {
  bridge.haptic?.("medium");
  try { engine?.stopMix(); } catch {}

  const take = engine?.getActiveTake?.();
  const m = current.mix || DEFAULT_MIX;
  const scoreCopy = buildNabadScoreCopy(take, current?.track, m);
  const cover = trackCoverUrl();
  const srcTitle = String(current?.track?.title || "").trim();

  renderNabadProcessing(root, {
    screen: "finalizing",
    title: "Finalizing your mix",
    phase: "Enhancing vocal tone…",
    hint: `Applying ${scoreCopy.finishLabel} finish before you name your song.`,
    cover,
    score: scoreCopy.score,
    scoreLabel: "Nabad Score",
    scoreDetail: scoreCopy.detail,
    scoreBlurb: scoreCopy.blurb,
  });

  const setPhase = (txt) => setProcessingPhase(root, txt);

  try {
    await yieldToUi();
    if (take) await ensureTakePitchReady(take);
    setPhase(`Applying ${scoreCopy.finishLabel} finish…`);
    await yieldToUi();
    setPhase("Rendering your release…");
    const rendered = await engine.renderMix(mixParams());
    setPhase("Preparing song details…");
    await yieldToUi();
    current._pendingSave = {
      rendered,
      title: defaultVocalTitle(),
      sourceTitle: srcTitle,
      cover,
    };
    renderSaveDetails(root);
  } catch (e) {
    console.warn("[studio] finalize failed:", e);
    bridge.showToast?.("Couldn't finalize — your take is still here.");
    renderPreviewMix(root, take);
  }
}

/* -------------------------------------------------------------------------- */
/* Shared bits                                                                 */
/* -------------------------------------------------------------------------- */

function headerHtml(title) {
  return `
    <header class="studioHeader">
      <button type="button" class="studioBack" data-studio-back aria-label="Leave Studio">
        <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path fill="currentColor" d="M15.5 4.5 8 12l7.5 7.5 1.4-1.4L10.8 12l6.1-6.1z"/></svg>
      </button>
      <span class="studioHeaderTitle">${esc(title)}</span>
      <span class="studioHeaderSpacer" aria-hidden="true"></span>
    </header>`;
}

function bindHeader(root, onBack) {
  root.querySelector("[data-studio-back]")?.addEventListener("click", () => {
    bridge.haptic?.("light");
    if (typeof onBack === "function") { onBack(); return; }
    if (unsaved) {
      const go = confirm("Leave the Studio? Your current take isn’t saved.");
      if (!go) return;
    }
    bridge.navigateBack?.();
  });
}

function emptyStateHtml() {
  return `
    <div class="studio" data-studio-screen="empty">
      ${headerHtml("NABADAI STUDIO")}
      <div class="studioEmpty">
        <div class="studioEmptyIco" aria-hidden="true">🎙️</div>
        <h2>Open a song to record</h2>
        <p>Pick a song, tap ⋯ and choose “Record My Voice”.</p>
      </div>
    </div>`;
}

function bindEmpty(root) { bindHeader(root); }

function waveBarsHtml(n) {
  let s = "";
  for (let i = 0; i < n; i++) {
    const h = 20 + Math.round(Math.abs(Math.sin(i * 0.7)) * 70);
    s += `<span style="height:${h}%"></span>`;
  }
  return s;
}

function fmtTime(sec) {
  const s = Math.max(0, Math.floor(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function fmtDate(ts) {
  const d = new Date(Number(ts) || 0);
  if (Number.isNaN(d.getTime())) return "";
  try {
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  } catch { return ""; }
}

function esc(v) {
  return String(v == null ? "" : v)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
function safe(v) { return typeof v === "string" ? v : (v == null ? "" : String(v)); }
