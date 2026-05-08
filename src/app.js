import { generateArrangement, randomizeParams } from "./arrangement.js";
import { renderArrangementToWav } from "./render.js";
import { recordHumToMelody } from "./melody/extract.js";
import { mixStemsToWav } from "./studio/mixer.js";
import { encodeWav16 } from "./wav.js";

// Bumped on every deploy so we can verify, on-device, which JS version is live.
// Surfaces in the page footer (always visible) and Settings → Environment.
const APP_BUILD = "20260509y";

(() => {
  const f = document.getElementById("footerBuild");
  if (f) f.textContent = `Build ${APP_BUILD}`;
})();

const els = {
  sunoPrompt: document.getElementById("sunoPrompt"),
  sunoStyle: document.getElementById("sunoStyle"),
  sunoArtworkStyle: document.getElementById("sunoArtworkStyle"),
  sunoMaqam: document.getElementById("sunoMaqam"),
  sunoTitle: document.getElementById("sunoTitle"),
  sunoTiming: document.getElementById("sunoTiming"),
  sunoGroovePace: document.getElementById("sunoGroovePace"),
  sunoProsody: document.getElementById("sunoProsody"),
  sunoBeatStability: document.getElementById("sunoBeatStability"),
  sunoSongKey: document.getElementById("sunoSongKey"),
  sunoKeyHint: document.getElementById("sunoKeyHint"),
  sunoModel: document.getElementById("sunoModel"),
  sunoEngine: document.getElementById("sunoEngine"),
  sunoDialect: document.getElementById("sunoDialect"),
  sunoDialectHint: document.getElementById("sunoDialectHint"),
  sunoVoiceProfile: document.getElementById("sunoVoiceProfile"),
  sunoPersonaId: document.getElementById("sunoPersonaId"),
  btnCreatePersona: document.getElementById("btnCreatePersona"),
  sunoProMode: document.getElementById("sunoProMode"),
  vocalInstrumentalOnly: document.getElementById("vocalInstrumentalOnly"),
  vocalModeFull: document.getElementById("vocalModeFull"),
  vocalModeInstrumental: document.getElementById("vocalModeInstrumental"),
  sunoVocalUpload: document.getElementById("sunoVocalUpload"),
  sunoVocalUploadName: document.getElementById("sunoVocalUploadName"),
  vocalRefHint: document.getElementById("vocalRefHint"),
  sunoReferenceMode: document.getElementById("sunoReferenceMode"),
  sunoReferenceHint: document.getElementById("sunoReferenceHint"),
  btnVocalRefRec: document.getElementById("btnVocalRefRec"),
  btnVocalRefStop: document.getElementById("btnVocalRefStop"),
  btnSunoGenerate: document.getElementById("btnSunoGenerate"),
  presetPopClean: document.getElementById("presetPopClean"),
  presetBalladWarm: document.getElementById("presetBalladWarm"),
  presetClubPunch: document.getElementById("presetClubPunch"),
  btnAdvancedReset: document.getElementById("btnAdvancedReset"),
  btnAdvancedApply: document.getElementById("btnAdvancedApply"),
  fineTuneDetails: document.getElementById("fineTuneDetails"),
  btnGenerateOrb: document.getElementById("btnGenerateOrb"),
  btnLyricsMagic: document.getElementById("btnLyricsMagic"),
  btnImageMood: document.getElementById("btnImageMood"),
  imageMoodSummary: document.getElementById("imageMoodSummary"),
  imageMoodModal: document.getElementById("imageMoodModal"),
  btnCloseImageMood: document.getElementById("btnCloseImageMood"),
  imageMoodUpload: document.getElementById("imageMoodUpload"),
  imageMoodPreview: document.getElementById("imageMoodPreview"),
  imageMoodOutput: document.getElementById("imageMoodOutput"),
  imageMoodUseAsCover: document.getElementById("imageMoodUseAsCover"),
  btnAnalyzeImageMood: document.getElementById("btnAnalyzeImageMood"),
  btnApplyImageMood: document.getElementById("btnApplyImageMood"),
  lyricsMagicMenu: document.getElementById("lyricsMagicMenu"),
  btnMagicUploadVocal: document.getElementById("btnMagicUploadVocal"),
  btnMagicRecordVocal: document.getElementById("btnMagicRecordVocal"),
  btnPreviewVocalRef: document.getElementById("btnPreviewVocalRef"),
  btnSunoRefresh: document.getElementById("btnSunoRefresh"),
  btnSunoStems: document.getElementById("btnSunoStems"),
  btnSunoMultiStems: document.getElementById("btnSunoMultiStems"),
  btnSunoCredits: document.getElementById("btnSunoCredits"),
  sunoCredits: document.getElementById("sunoCredits"),
  sunoCreditsNote: document.getElementById("sunoCreditsNote"),
  sunoOut: document.getElementById("sunoOut"),
  sunoStemsOut: document.getElementById("sunoStemsOut"),
  sunoFullLink: document.getElementById("sunoFullLink"),
  sunoVocalLink: document.getElementById("sunoVocalLink"),
  sunoInstLink: document.getElementById("sunoInstLink"),
  btnPlayFull: document.getElementById("btnPlayFull"),
  btnPlayVocals: document.getElementById("btnPlayVocals"),
  btnPlayInstrumental: document.getElementById("btnPlayInstrumental"),
  btnMixerLoad: document.getElementById("btnMixerLoad"),
  btnMixerPlay: document.getElementById("btnMixerPlay"),
  btnMixerStop: document.getElementById("btnMixerStop"),
  btnMixerExport: document.getElementById("btnMixerExport"),
  mixerDownloadLink: document.getElementById("mixerDownloadLink"),
  mixerList: document.getElementById("mixerList"),
  btnBetaTopup: document.getElementById("btnBetaTopup"),
  btnOpenBilling: document.getElementById("btnOpenBilling"),
  btnCreditsHistoryRefresh: document.getElementById("btnCreditsHistoryRefresh"),
  btnCreditsHistoryClear: document.getElementById("btnCreditsHistoryClear"),
  btnCreditRecovery: document.getElementById("btnCreditRecovery"),
  creditsHistoryOut: document.getElementById("creditsHistoryOut"),
  btnPlayerPlay: document.getElementById("btnPlayerPlay"),
  btnPlayerPause: document.getElementById("btnPlayerPause"),
  btnPlayerStop: document.getElementById("btnPlayerStop"),
  btnPlayerToggle: document.getElementById("btnPlayerToggle"),
  playerTimeCurrent: document.getElementById("playerTimeCurrent"),
  playerTimeTotal: document.getElementById("playerTimeTotal"),
  btnPlayerShare: document.getElementById("btnPlayerShare"),
  btnPlayerDownloadVideo: document.getElementById("btnPlayerDownloadVideo"),
  btnPlayerBack: document.getElementById("btnPlayerBack"),
  playerSeek: document.getElementById("playerSeek"),
  playerVol: document.getElementById("playerVol"),
  playerTime: document.getElementById("playerTime"),
  playerSource: document.getElementById("playerSource"),
  playerArt: document.getElementById("playerArt"),
  playerTitle: document.getElementById("playerTitle"),
  playerSubtitle: document.getElementById("playerSubtitle"),
  btnLoadFull: document.getElementById("btnLoadFull"),
  btnLoadVocals: document.getElementById("btnLoadVocals"),
  btnLoadInstrumental: document.getElementById("btnLoadInstrumental"),
  clipStartSec: document.getElementById("clipStartSec"),
  clipEndSec: document.getElementById("clipEndSec"),
  btnShareClipHub: document.getElementById("btnShareClipHub"),
  btnOpenTrimSheet: document.getElementById("btnOpenTrimSheet"),
  btnCloseTrimSheet: document.getElementById("btnCloseTrimSheet"),
  btnShareFullHub: document.getElementById("btnShareFullHub"),
  trimSheet: document.getElementById("trimSheet"),
  btnPlayerChangeCover: document.getElementById("btnPlayerChangeCover"),
  playerCoverUpload: document.getElementById("playerCoverUpload"),

  // Multitrack session (Vocal Room)
  btnSessionLoadSuno: document.getElementById("btnSessionLoadSuno"),
  sessionUploadStems: document.getElementById("sessionUploadStems"),
  btnSessionClear: document.getElementById("btnSessionClear"),
  sessionStatus: document.getElementById("sessionStatus"),
  btnSessionPlay: document.getElementById("btnSessionPlay"),
  btnSessionStop: document.getElementById("btnSessionStop"),
  btnSessionExport: document.getElementById("btnSessionExport"),
  sessionDownload: document.getElementById("sessionDownload"),
  sessionTracks: document.getElementById("sessionTracks"),

  vocalPreset: document.getElementById("vocalPreset"),
  vocalMonitor: document.getElementById("vocalMonitor"),
  btnVocalArm: document.getElementById("btnVocalArm"),
  btnVocalRec: document.getElementById("btnVocalRec"),
  btnVocalStop: document.getElementById("btnVocalStop"),
  vocalStatus: document.getElementById("vocalStatus"),
  vocalTakes: document.getElementById("vocalTakes"),

  style: document.getElementById("style"),
  bpm: document.getElementById("bpm"),
  bars: document.getElementById("bars"),
  keyCenter: document.getElementById("keyCenter"),
  scale: document.getElementById("scale"),
  meter: document.getElementById("meter"),
  lyrics: document.getElementById("lyrics"),
  useAi: document.getElementById("useAi"),
  btnNewTake: document.getElementById("btnNewTake"),
  btnHumStart: document.getElementById("btnHumStart"),
  btnHumStop: document.getElementById("btnHumStop"),
  btnHumClear: document.getElementById("btnHumClear"),
  melodyOut: document.getElementById("melodyOut"),

  instOud: document.getElementById("instOud"),
  instViolin: document.getElementById("instViolin"),
  instPiano: document.getElementById("instPiano"),
  instTabla: document.getElementById("instTabla"),

  btnGenerate: document.getElementById("btnGenerate"),
  btnRandomize: document.getElementById("btnRandomize"),
  btnRender: document.getElementById("btnRender"),
  btnPlay: document.getElementById("btnPlay"),
  downloadLink: document.getElementById("downloadLink"),
  btnVoice: document.getElementById("btnVoice"),
  btnVoicePlay: document.getElementById("btnVoicePlay"),
  voiceDownloadLink: document.getElementById("voiceDownloadLink"),

  arrangementOut: document.getElementById("arrangementOut"),
  progressBar: document.getElementById("progressBar"),
  status: document.getElementById("status"),
  globalLoading: document.getElementById("globalLoading"),
  loadingTitle: document.getElementById("loadingTitle"),
  loadingSub: document.getElementById("loadingSub"),

  btnEnterApp: document.getElementById("btnEnterApp"),
  btnStartHelp: document.getElementById("btnStartHelp"),
  startHelp: document.getElementById("startHelp"),

  // Intro
  introTap: document.getElementById("introTap"),

  // Generate mode switch + agent
  genModeSimple: document.getElementById("genModeSimple"),
  genModeAgent: document.getElementById("genModeAgent"),
  agentBox: document.getElementById("agentBox"),
  agentChat: document.getElementById("agentChat"),
  agentInput: document.getElementById("agentInput"),
  agentSend: document.getElementById("agentSend"),
  simpleBox: document.getElementById("simpleBox"),
  resultCard: document.getElementById("resultCard"),
  resultArt: document.getElementById("resultArt"),
  resultTitle: document.getElementById("resultTitle"),
  btnResultPlay: document.getElementById("btnResultPlay"),
  btnResultOpenDirect: document.getElementById("btnResultOpenDirect"),
  btnResultListenRef: document.getElementById("btnResultListenRef"),
  resultDownload: document.getElementById("resultDownload"),
  resultCard2: document.getElementById("resultCard2"),
  resultArt2: document.getElementById("resultArt2"),
  resultTitle2: document.getElementById("resultTitle2"),
  btnResultPlay2: document.getElementById("btnResultPlay2"),
  btnResultOpenDirect2: document.getElementById("btnResultOpenDirect2"),
  resultDownload2: document.getElementById("resultDownload2"),
  btnOpenAdvancedSheet: document.getElementById("btnOpenAdvancedSheet"),
  btnCloseAdvancedSheet: document.getElementById("btnCloseAdvancedSheet"),
  advancedSheet: document.getElementById("advancedSheet"),
  libraryList: document.getElementById("libraryList"),
  hubList: document.getElementById("hubList"),
  hubAudioHint: document.getElementById("hubAudioHint"),
  hubUpdatedAt: document.getElementById("hubUpdatedAt"),
  hubSyncInfo: document.getElementById("hubSyncInfo"),
  hubFilterLatest: document.getElementById("hubFilterLatest"),
  hubFilterArabic: document.getElementById("hubFilterArabic"),
  hubFilterInstrumental: document.getElementById("hubFilterInstrumental"),
  hubFilterRemix: document.getElementById("hubFilterRemix"),
  hubFilterSelect: document.getElementById("hubFilterSelect"),
  hubSortLatest: document.getElementById("hubSortLatest"),
  hubSortTrending: document.getElementById("hubSortTrending"),
  hubDotLatest: document.getElementById("hubDotLatest"),
  hubDotArabic: document.getElementById("hubDotArabic"),
  hubDotInstrumental: document.getElementById("hubDotInstrumental"),
  hubDotRemix: document.getElementById("hubDotRemix"),
  hubTabDot: document.getElementById("hubTabDot"),
  hubTabLink: document.querySelector('.mobileTabbar [data-route-link="hub"]'),
  hubNowPlaying: document.getElementById("hubNowPlaying"),
  hubNowArt: document.getElementById("hubNowArt"),
  hubNowTitle: document.getElementById("hubNowTitle"),
  hubNowProgBar: document.getElementById("hubNowProgBar"),
  hubNowClose: document.getElementById("hubNowClose"),
  likeBurst: document.getElementById("likeBurst"),
  toast: document.getElementById("toast"),
  hubAddDemo: document.getElementById("hubAddDemo"),
  profilePreviewUsernameInput: document.getElementById("profilePreviewUsernameInput"),
  profilePreviewTimbreInput: document.getElementById("profilePreviewTimbreInput"),
  profilePreviewBioInput: document.getElementById("profilePreviewBioInput"),
  profileAvatarFile: document.getElementById("profileAvatarFile"),
  profileIsPublic: document.getElementById("profileIsPublic"),
  btnProfileSave: document.getElementById("btnProfileSave"),
  btnProfileEdit: document.getElementById("btnProfileEdit"),
  btnProfileCancel: document.getElementById("btnProfileCancel"),
  profileOwnStats: document.getElementById("profileOwnStats"),
  profileOwnSongCount: document.getElementById("profileOwnSongCount"),
  profileSavedMsg: document.getElementById("profileSavedMsg"),
  profileSaveToast: document.getElementById("profileSaveToast"),
  authLoginControls: document.getElementById("authLoginControls"),
  authLoggedInRow: document.getElementById("authLoggedInRow"),
  authLoggedInEmail: document.getElementById("authLoggedInEmail"),
  authLoggedInEmailInline: document.getElementById("authLoggedInEmailInline"),
  btnAuthGoogle: document.getElementById("btnAuthGoogle"),
  btnAuthGateGoogle: document.getElementById("btnAuthGateGoogle"),
  btnAuthGateGuest: document.getElementById("btnAuthGateGuest"),
  btnAuthLogout: document.getElementById("btnAuthLogout"),
  btnProfileDelete: document.getElementById("btnProfileDelete"),
  authStatus: document.getElementById("authStatus"),
  profilePreviewAvatar: document.getElementById("profilePreviewAvatar"),
  profilePreviewUsername: document.getElementById("profilePreviewUsername"),
  profilePreviewGenderIcon: document.getElementById("profilePreviewGenderIcon"),
  profilePreviewTimbre: document.getElementById("profilePreviewTimbre"),
  profilePreviewVisibility: document.getElementById("profilePreviewVisibility"),
  profilePreviewBio: document.getElementById("profilePreviewBio"),
  profilePreviewGenres: document.getElementById("profilePreviewGenres"),
  profilePreviewLinks: document.getElementById("profilePreviewLinks"),
  profileHubSharedList: document.getElementById("profileHubSharedList"),
  userPublicAvatar: document.getElementById("userPublicAvatar"),
  userPublicName: document.getElementById("userPublicName"),
  userPublicVoice: document.getElementById("userPublicVoice"),
  userPublicBio: document.getElementById("userPublicBio"),
  userPublicStats: document.getElementById("userPublicStats"),
  userPublicSongsCount: document.getElementById("userPublicSongsCount"),
  userPublicSongs: document.getElementById("userPublicSongs"),
  userPublicEmpty: document.getElementById("userPublicEmpty"),
  btnUserPublicBack: document.getElementById("btnUserPublicBack"),
  songDetailsModal: document.getElementById("songDetailsModal"),
  songDetailsBackdrop: document.getElementById("songDetailsBackdrop"),
  btnCloseSongDetails: document.getElementById("btnCloseSongDetails"),
  songDetailsContent: document.getElementById("songDetailsContent"),
  brandTitle: document.getElementById("brandTitle"),
  brandSecondary: document.getElementById("brandSecondary"),
  vocalRecorderModal: document.getElementById("vocalRecorderModal"),
  vocalRecorderBackdrop: document.getElementById("vocalRecorderBackdrop"),
  btnCloseVocalRecorder: document.getElementById("btnCloseVocalRecorder"),
  btnRecorderToggle: document.getElementById("btnRecorderToggle"),
  btnRecorderUse: document.getElementById("btnRecorderUse"),
  recorderStatus: document.getElementById("recorderStatus"),
  shareLiveModal: document.getElementById("shareLiveModal"),
  shareLiveBackdrop: document.getElementById("shareLiveBackdrop"),
  btnCloseShareLive: document.getElementById("btnCloseShareLive"),
  btnGoHub: document.getElementById("btnGoHub"),
  shareLiveText: document.getElementById("shareLiveText"),
  proofModal: document.getElementById("proofModal"),
  proofBackdrop: document.getElementById("proofBackdrop"),
  btnCloseProof: document.getElementById("btnCloseProof"),
  btnDownloadProof: document.getElementById("btnDownloadProof"),
  proofCard: document.getElementById("proofCard"),
  envBadge: document.getElementById("envBadge"),
};

// Must be initialized before any startup route/render calls.
var imageMoodAppliedForNextGen = false;
let currentProofPost = null;
let hubAudio = null;
let hubAudioPostId = null;
let hubNowMeta = null;
let miniSource = null;
function isPlayingHubPostVisible() {
  if (!hubAudioPostId) return false;
  const route = document.body.getAttribute("data-route") || "";
  if (route !== "hub") return false;
  const row = document.querySelector(`[data-hub-row="${hubAudioPostId}"]`);
  if (!row) return false;
  const r = row.getBoundingClientRect();
  const vh = window.innerHeight || document.documentElement.clientHeight || 0;
  const visiblePx = Math.max(0, Math.min(r.bottom, vh) - Math.max(r.top, 0));
  const ratio = r.height > 0 ? visiblePx / r.height : 0;
  return ratio >= 0.35;
}
function isPlayingLibraryRowVisible() {
  const route = document.body.getAttribute("data-route") || "";
  if (route !== "library") return false;
  if (!playerLoadedLabel) return false;
  const key = String(playerLoadedLabel).toLowerCase();
  const rows = Array.from(document.querySelectorAll("[data-lib-row]"));
  const target = rows.find((row) => {
    const txt = String(row.querySelector(".trackName")?.textContent || "").toLowerCase();
    return txt && key && txt.includes(key.replace(/^full song\s*/i, "").trim());
  });
  if (!target) return true;
  const r = target.getBoundingClientRect();
  const vh = window.innerHeight || document.documentElement.clientHeight || 0;
  const visiblePx = Math.max(0, Math.min(r.bottom, vh) - Math.max(r.top, 0));
  const ratio = r.height > 0 ? visiblePx / r.height : 0;
  return ratio >= 0.35;
}

/** Hub feed: auto-play the post whose vertical center is closest to the viewport center. */
let hubAutoplayMutedPostId = null;
let hubViewportTailTimer = null;
/** After Hub-tab “jump to top”, kill stale debounce timers and silence viewport
 * autoplay briefly — otherwise a pending `tryHubViewportAutoplay` from *before*
 * the tap fires ~140ms later, calls `startHubPlayback(oldPostId)`, and scroll-
 * snap fights bring the viewport back to that row. */
let hubSuppressViewportAutoplayUntil = 0;
let hubPlaybackSeq = 0;
// Persistent post metadata for whichever track is currently loaded into the
// shared audio element. Read by the timeupdate listener so we don't have to
// re-bind a closure (and another listener) every time the track changes.
let hubAudioCurrentPost = null;
// Fetched in advance for the next post: `fetch` → Blob → object URL. The
// audio proxy also streams now, but a fully-buffered local URL still makes
// track-to-track switches feel instant. postId -> object URL.
const HUB_BLOB_CACHE_MAX = 5;
let hubAudioBlobByPostId = new Map();
let hubBlobLru = [];
let hubPreloadInflight = new Map();
let hubPreloadTimer = null;

/** iOS/Safari allow programmatic audio only after a user gesture. Until then,
 * scroll-autoplay would call play(), fail, flash the UI — hence no autoplay
 * until the user taps ▶ once. Persist unlock for this tab via sessionStorage. */
const HUB_AUDIO_UNLOCK_KEY = "mas:hub:audioUnlock:v1";
function getHubAudioUnlocked() {
  try {
    return sessionStorage.getItem(HUB_AUDIO_UNLOCK_KEY) === "1";
  } catch {
    return false;
  }
}
function setHubAudioUnlocked() {
  try {
    sessionStorage.setItem(HUB_AUDIO_UNLOCK_KEY, "1");
  } catch {}
}
function updateHubAudioHint() {
  if (!els.hubAudioHint) return;
  if (getHubAudioUnlocked()) {
    els.hubAudioHint.style.display = "none";
    return;
  }
  const route = document.body.getAttribute("data-route") || "";
  if (route !== "hub") {
    els.hubAudioHint.style.display = "none";
    return;
  }
  let hasAudio = false;
  try {
    hasAudio = loadHubFeed().some((p) => String(p?.url || "").trim());
  } catch {
    hasAudio = false;
  }
  els.hubAudioHint.style.display = hasAudio ? "" : "none";
}

function suppressHubViewportAutoplayFor(ms) {
  if (hubViewportTailTimer) {
    try {
      clearTimeout(hubViewportTailTimer);
    } catch {}
    hubViewportTailTimer = null;
  }
  hubSuppressViewportAutoplayUntil = Date.now() + ms;
}

function getHubRowClosestToViewportCenter() {
  const root = els.hubList;
  if (!root) return null;
  const rows = root.querySelectorAll("[data-hub-row]");
  if (!rows.length) return null;
  const vh = window.innerHeight || document.documentElement.clientHeight || 0;
  const cy = vh / 2;
  let bestIntersectId = null;
  let bestIntersectDist = Infinity;
  let bestAnyId = null;
  let bestAnyDist = Infinity;
  rows.forEach((row) => {
    const r = row.getBoundingClientRect();
    const mid = r.top + r.height / 2;
    const d = Math.abs(mid - cy);
    const id = row.getAttribute("data-hub-row");
    if (!id) return;
    if (d < bestAnyDist) {
      bestAnyDist = d;
      bestAnyId = id;
    }
    const intersects = r.bottom > 0 && r.top < vh;
    if (intersects && d < bestIntersectDist) {
      bestIntersectDist = d;
      bestIntersectId = id;
    }
  });
  // Prefer a row that actually intersects the viewport (finger on a card).
  // When you scroll between two posts the viewport center can sit in the gap
  // between rows — then no row "intersects" and autoplay used to go silent.
  // Fall back to whichever row center is closest overall (still on the feed).
  return bestIntersectId || bestAnyId;
}

// Don't run *audio* on every scroll frame — that was the cause of "rapid
// play/stop": while the user dragged, every frame
// `getHubRowClosestToViewportCenter` could pick a different row and we'd
// start/abandon playback in a loop. So audio waits for the scroll to be
// quiet for ~140ms (or instantly on `scrollend`).
//
// VISUAL focus is a separate path (`updateHubFocusedRow`) that DOES run on
// every scroll frame, raf-throttled. Just toggling a class is cheap and
// makes the lift/dim/title-resize feel immediate instead of arriving late
// after the audio finally loads.
function scheduleHubViewportAutoplay() {
  if (hubViewportTailTimer) {
    try { clearTimeout(hubViewportTailTimer); } catch {}
  }
  hubViewportTailTimer = setTimeout(() => {
    hubViewportTailTimer = null;
    tryHubViewportAutoplay();
  }, 140);
}

// Visual focus tracking — separate from audio playback. Sets `.isActive`
// on the row whose center is closest to the viewport center, so all the
// "this is the focused card" CSS (lift, dim others, hero title, bigger
// action chips) snaps in the instant the user finishes a swipe instead of
// waiting for `startHubPlayback` to add `.isPlaying` after audio loads.
let hubFocusedPostId = null;
let hubFocusUpdateRaf = 0;
function updateHubFocusedRow() {
  if ((document.body.getAttribute("data-route") || "") !== "hub") return;
  if (!els.hubList) return;
  const centerId = getHubRowClosestToViewportCenter();
  if (centerId === hubFocusedPostId) return;
  hubFocusedPostId = centerId;
  const root = els.hubList;
  root.querySelectorAll(".hubRow").forEach((r) => {
    const isActive = centerId && r.getAttribute("data-hub-row") === centerId;
    r.classList.toggle("isActive", Boolean(isActive));
  });
}
function scheduleHubFocusUpdate() {
  if (hubFocusUpdateRaf) return;
  hubFocusUpdateRaf = requestAnimationFrame(() => {
    hubFocusUpdateRaf = 0;
    updateHubFocusedRow();
  });
}
function flushHubViewportAutoplay() {
  if (hubViewportTailTimer) {
    try { clearTimeout(hubViewportTailTimer); } catch {}
    hubViewportTailTimer = null;
  }
  tryHubViewportAutoplay();
}

async function hubAudioPlayWithRetry(audio) {
  try {
    await audio.play();
    return true;
  } catch {
    await new Promise((r) => setTimeout(r, 90));
    try {
      await audio.play();
      return true;
    } catch {
      return false;
    }
  }
}

// Hub next-track preload (`preloadNextHubTrack`, `hubPlaybackSrcForPost`, …)
// lives next to `toAudioProxyUrl` — it needs the proxy helper for same-origin
// `fetch()` while feed URLs are often remote Suno CDN links.

// Returns the single shared audio element used for all Hub playback. Creating
// one element and just swapping its src (instead of `new Audio()` per track)
// is the only way to guarantee one stream at a time on iOS — pause() on a
// freshly-created element is racy until its play() promise has settled.
// When a track finishes naturally (NOT when the user paused), smoothly bring
// the next post in DOM order into the viewport center. The existing
// scroll-driven autoplay then takes over and plays it. If the user has
// navigated away from Hub, we just let it stop — scrolling Hub from the
// background would jolt their position when they return.
function onHubTrackEnded(endedPostId) {
  if (!endedPostId) return;
  if ((document.body.getAttribute("data-route") || "") !== "hub") return;
  const root = els.hubList;
  if (!root) return;
  const currentRow = root.querySelector(`[data-hub-row="${endedPostId}"]`);
  if (!currentRow) return;
  let nextRow = currentRow.nextElementSibling;
  while (nextRow && !nextRow.matches?.("[data-hub-row]")) {
    nextRow = nextRow.nextElementSibling;
  }
  if (!nextRow) return;
  const nextId = nextRow.getAttribute("data-hub-row");
  try {
    nextRow.scrollIntoView({ behavior: "smooth", block: "center" });
  } catch {
    try {
      nextRow.scrollIntoView();
    } catch {}
  }
  // Don't rely on scroll-driven autoplay catching up — `scroll` events during
  // a programmatic smooth scroll are unreliable on iOS, so an explicit play
  // call here makes the hand-off seamless. The smooth scroll just supplies
  // the visual cue; this guarantees the audio.
  if (nextId) void startHubPlayback(nextId);
}

function ensureHubAudio() {
  if (hubAudio) return hubAudio;
  const a = new Audio();
  a.preload = "auto";
  a.addEventListener("ended", () => {
    const endedPostId = hubAudioPostId;
    stopHubPlayback();
    onHubTrackEnded(endedPostId);
  });
  a.addEventListener("timeupdate", () => {
    const postId = hubAudioPostId;
    const post = hubAudioCurrentPost;
    if (!postId || !post) return;
    const clip = post?.meta?.clip;
    if (clip && Number.isFinite(Number(clip.startSec)) && Number.isFinite(Number(clip.endSec))) {
      const s = Number(clip.startSec);
      const en = Number(clip.endSec);
      if (a.currentTime < s) a.currentTime = s;
      if (a.currentTime >= en) {
        const endedPostId = hubAudioPostId;
        stopHubPlayback();
        onHubTrackEnded(endedPostId);
        return;
      }
    }
    const prog = document.getElementById(`hubProg_${postId}`);
    if (!prog || !a?.duration) return;
    const pct = Math.max(0, Math.min(100, (a.currentTime / a.duration) * 100));
    prog.style.width = `${pct}%`;
    if (els.hubNowProgBar) els.hubNowProgBar.style.width = `${pct}%`;
    renderHubNowPlaying();
  });
  hubAudio = a;
  return a;
}

function tryHubViewportAutoplay() {
  if ((document.body.getAttribute("data-route") || "") !== "hub") return;
  if (!els.hubList) return;
  if (Date.now() < hubSuppressViewportAutoplayUntil) return;
  // Never attempt scroll-driven play until the browser has accepted audio once
  // (user tapped ▶). Otherwise play() fails repeatedly and the button flickers.
  if (!getHubAudioUnlocked()) return;
  const centerId = getHubRowClosestToViewportCenter();
  if (!centerId) return;
  if (hubAutoplayMutedPostId && centerId !== hubAutoplayMutedPostId) {
    hubAutoplayMutedPostId = null;
  }
  if (centerId === hubAutoplayMutedPostId) return;
  const feed = loadHubFeed();
  const p = feed.find((x) => x.id === centerId);
  if (!p?.url) return;
  // If we already targeted this post — even if play() hasn't resolved yet,
  // even if the element is momentarily paused mid-load — never kick off a
  // second startHubPlayback for the same id. Scroll-snap fires scroll events
  // while it animates the card into place, and re-triggering during that
  // window was racing the first call and producing rapid play/stop glitches.
  if (hubAudioPostId === centerId) return;
  void startHubPlayback(centerId);
}

function stopHubPlayback() {
  try {
    if (hubAudio) hubAudio.pause();
  } catch {}
  hubAudioPostId = null;
  hubAudioCurrentPost = null;
  hubNowMeta = null;
  miniSource = null;
  const root = els.hubList;
  if (root) {
    root.querySelectorAll("[data-hub-play]").forEach((btn) => {
      btn.textContent = "▶";
    });
    root.querySelectorAll(".hubPlayProgress > span").forEach((bar) => {
      bar.style.width = "0%";
    });
    root.querySelectorAll(".hubCoverWrap").forEach((w) => {
      w.classList.remove("isPlaying");
      w.classList.remove("isLoading");
    });
  }
  if (els.hubNowProgBar) els.hubNowProgBar.style.width = "0%";
  renderHubNowPlaying();
}

async function startHubPlayback(postId) {
  // Idempotent: if we're already targeting this post, just make sure it's
  // playing again (in case the user tapped pause earlier or the load was
  // interrupted). Don't re-allocate state — that's what produced the
  // play/stop glitch when scroll-snap fired during a fresh load.
  if (hubAudioPostId === postId && hubAudio) {
    if (hubAudio.paused) {
      try {
        await hubAudio.play();
      } catch {}
    }
    if (!hubAudio.paused) {
      setHubAudioUnlocked();
      updateHubAudioHint();
      scheduleHubPreloadNext(postId);
    }
    return;
  }

  const mySeq = ++hubPlaybackSeq;
  const p = loadHubFeed().find((x) => x.id === postId);
  if (!p?.url) return;

  // Don't await the in-flight preload — that was actually slower than just
  // streaming, because preload buffers the *whole* file before resolving.
  // If the blob already finished loading we use it (instant). Otherwise we
  // start playback against the streaming proxy URL right now and let the
  // background fetch finish for next time the user comes back to this post.

  const a = ensureHubAudio();
  try {
    a.pause();
  } catch {}

  hubAudioPostId = postId;
  hubAudioCurrentPost = p;
  miniSource = { type: "hub", id: postId };
  hubNowMeta = {
    title: p.title || "Hub song",
    art: p.artUrl || p.creatorAvatar || "./assets/nabadai-logo.png",
  };

  // Reset all per-row visuals and mark the new active row.
  const root = els.hubList;
  if (root) {
    root.querySelectorAll("[data-hub-play]").forEach((btn) => {
      btn.textContent = "▶";
    });
    root.querySelectorAll(".hubCoverWrap").forEach((w) => w.classList.remove("isPlaying"));
  }
  const playBtn =
    root?.querySelector?.(`[data-hub-play="${postId}"]`) ||
    document.querySelector(`[data-hub-play="${postId}"]`);
  const coverWrap = playBtn?.closest?.(".hubCoverWrap")
    || document.querySelector(`.hubCoverWrap[data-hub-cover="${postId}"]`);
  if (playBtn) {
    playBtn.textContent = "■";
    coverWrap?.classList.add("isPlaying");
  }
  // Loading shimmer on the progress bar — confirms "we heard you tap" while
  // the audio element is buffering. Cleared as soon as play() resolves
  // (success or failure), so it never lingers on a finished/dead row.
  coverWrap?.classList.add("isLoading");
  // Force focus visuals onto the playing row immediately. Useful when the
  // user taps ▶ on a card that isn't centered — without this, the row
  // would play audio without growing the title or chips.
  const playingRow = coverWrap?.closest?.(".hubRow")
    || document.querySelector(`[data-hub-row="${postId}"]`);
  if (playingRow && root) {
    root.querySelectorAll(".hubRow.isActive").forEach((r) => {
      if (r !== playingRow) r.classList.remove("isActive");
    });
    playingRow.classList.add("isActive");
    hubFocusedPostId = postId;
  }

  const targetSrc = hubPlaybackSrcForPost(postId, p);
  if (!targetSrc) {
    coverWrap?.classList.remove("isLoading");
    stopHubPlayback();
    return;
  }
  try {
    const wantAbs = new URL(targetSrc, location.href).href;
    const haveAbs = String(a.src || "").trim();
    if (haveAbs !== wantAbs) a.src = targetSrc;
  } catch {
    if (a.src !== targetSrc) a.src = targetSrc;
  }
  try {
    a.currentTime = 0;
  } catch {}

  let ok = await hubAudioPlayWithRetry(a);
  if (mySeq !== hubPlaybackSeq) {
    // A newer call already owns the shared audio element. Bail without
    // touching it — pausing here would stomp on the new owner's load.
    return;
  }
  // If the direct CDN URL failed (rare — e.g. expired token, blocked by
  // origin, brief network glitch), retry once through the /api/suno/audio
  // proxy. We only ever need this for plain http(s) URLs; blob:/data: URLs
  // skip the fallback because there is no proxy equivalent.
  if (!ok && typeof targetSrc === "string" && /^https?:\/\//i.test(targetSrc)) {
    const fallbackSrc = toAudioProxyUrl(targetSrc);
    if (fallbackSrc && fallbackSrc !== targetSrc) {
      try {
        a.src = fallbackSrc;
        a.currentTime = 0;
      } catch {}
      ok = await hubAudioPlayWithRetry(a);
      if (mySeq !== hubPlaybackSeq) return;
    }
  }
  if (!ok) {
    coverWrap?.classList.remove("isLoading");
    stopHubPlayback();
    setStatus("Tap a track once to start playback.");
    return;
  }
  coverWrap?.classList.remove("isLoading");
  if (p?.meta?.clip && Number.isFinite(Number(p.meta.clip.startSec))) {
    try {
      a.currentTime = Math.max(0, Number(p.meta.clip.startSec));
    } catch {}
  }
  setHubAudioUnlocked();
  updateHubAudioHint();
  scheduleHubPreloadNext(postId);
  renderHubNowPlaying();
}

function renderHubNowPlaying() {
  if (!els.hubNowPlaying) return;
  const route = document.body.getAttribute("data-route") || "";
  const hideOnHubVisible = isPlayingHubPostVisible();
  const hideOnLibrary = route === "library";
  const hideOnPlayer = route === "player" && miniSource?.type === "library";
  // hubAudio is now a persistent element (paused between tracks instead of
  // nulled), so use the active post id as the source of truth for whether
  // any track is currently playing.
  const isPlaying = Boolean(hubAudioPostId && hubAudio && !hubAudio.paused);
  const active = Boolean(hubNowMeta && isPlaying) && !hideOnHubVisible && !hideOnLibrary && !hideOnPlayer;
  if (!active) {
    els.hubNowPlaying.classList.remove("isVisible", "isPlaying");
    setTimeout(() => {
      if (!hubAudioPostId && els.hubNowPlaying) els.hubNowPlaying.style.display = "none";
    }, 220);
    return;
  }
  els.hubNowPlaying.style.display = "";
  requestAnimationFrame(() => {
    els.hubNowPlaying.classList.add("isVisible", "isPlaying");
  });
  if (els.hubNowArt) els.hubNowArt.src = hubNowMeta.art || "./assets/nabadai-logo.png";
  if (els.hubNowTitle) els.hubNowTitle.textContent = hubNowMeta.title || "Now playing";
  if (els.hubNowProgBar && hubAudio?.duration) {
    const pct = Math.max(0, Math.min(100, (hubAudio.currentTime / hubAudio.duration) * 100));
    els.hubNowProgBar.style.width = `${pct}%`;
  }
}
const LATEST_SUNO_MODEL = "V5_5";
const API_BASE = (window.__API_BASE__ || "").replace(/\/$/, "");
const apiUrl = (p) => API_BASE ? `${API_BASE}${p}` : p;
let SUPABASE_URL = "";
let SUPABASE_ANON_KEY = "";
let lastHubUpdateAt = 0;
function relativeTime(ts) {
  if (!ts) return "—";
  const diff = Date.now() - Number(ts || 0);
  if (diff < 10_000) return "just now";
  const min = Math.floor(diff / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const d = Math.floor(hr / 24);
  return `${d}d ago`;
}
function renderHubUpdatedAt() {
  if (!els.hubUpdatedAt) return;
  const relative = relativeTime(lastHubUpdateAt);
  els.hubUpdatedAt.textContent = `Updated: ${relative}`;
  if (els.hubSyncInfo) {
    els.hubSyncInfo.classList.remove("ok", "warn", "wait");
    if (hubLastSyncOk) {
      els.hubSyncInfo.classList.add("ok");
      els.hubSyncInfo.textContent = `● Live • rows ${hubLastSyncRows}`;
    } else if (hubLastSyncError) {
      els.hubSyncInfo.classList.add("warn");
      els.hubSyncInfo.textContent = `● Retrying • ${hubLastSyncError}`;
    } else {
      els.hubSyncInfo.classList.add("wait");
      els.hubSyncInfo.textContent = "● Waiting…";
    }
  }
}
function updateEnvironmentBadge() {
  if (!els.envBadge) return;
  const isNative = Boolean(window?.Capacitor?.isNativePlatform?.());
  const host = (() => {
    try {
      return new URL(API_BASE || window.location.origin).host;
    } catch {
      return "unknown";
    }
  })();
  const mode = isNative ? "Native iOS" : "Web";
  const target = API_BASE ? `Remote (${host})` : "Same-origin";
  els.envBadge.textContent = `Environment: ${mode} • ${target} • Build ${APP_BUILD}`;
}
async function loadPublicConfig() {
  try {
    const r = await fetch(apiUrl("/api/public-config"));
    const d = await r.json().catch(() => ({}));
    let rawUrl = String(d?.supabaseUrl || "").trim();
    // Accept either project root URL or mistakenly pasted REST URL.
    rawUrl = rawUrl.replace(/\/+$/, "");
    rawUrl = rawUrl.replace(/\/rest\/v1$/i, "");
    rawUrl = rawUrl.replace(/\/auth\/v1$/i, "");
    SUPABASE_URL = rawUrl;
    SUPABASE_ANON_KEY = String(d?.supabaseAnonKey || "");
  } catch {}
}
function haptic(kind = "light") {
  try {
    const cap = window?.Capacitor;
    const isNative = Boolean(
      cap?.isNativePlatform?.() ||
      cap?.getPlatform?.() === "ios" ||
      cap?.getPlatform?.() === "android"
    );
    const capHaptics = cap?.Plugins?.Haptics;
    if (capHaptics) {
      if (kind === "success") {
        void capHaptics.notification({ type: "SUCCESS" });
      } else if (kind === "impact") {
        void capHaptics.impact({ style: "HEAVY" });
      } else {
        void capHaptics.impact({ style: "LIGHT" });
      }
      return;
    }
    if (isNative) return;
    if (!("vibrate" in navigator)) return;
    if (kind === "success") navigator.vibrate([8, 24, 12]);
    else if (kind === "impact") navigator.vibrate(12);
    else navigator.vibrate(6);
  } catch {}
}
function showLikeBurst() {
  if (!els.likeBurst) return;
  const el = els.likeBurst;
  el.style.display = "";
  el.classList.remove("show");
  void el.offsetWidth;
  el.classList.add("show");
  setTimeout(() => {
    el.classList.remove("show");
    el.style.display = "none";
  }, 620);
}

var authSession = null;
var generationReadyNotice = false;

function applyRoute() {
  const hash = String(location.hash || "");
  const rawRoute = hash.startsWith("#/") ? hash.slice(2) : "generate";
  const route = rawRoute.split(/[?#&]/)[0].trim();
  // Public profile route: `#/u/USERNAME`. Treat as the dedicated `user`
  // route so it gets its own section + nav state. Username is preserved
  // separately so the renderer can pick it up after the route swap.
  let pendingPublicUsername = "";
  if (/^u\//.test(route)) {
    pendingPublicUsername = decodeURIComponent(route.slice(2)).trim();
  }
  const allowedRoutes = new Set(["intro", "start", "auth", "generate", "library", "hub", "settings", "profile", "player", "vocal", "stems", "advanced", "user"]);
  const normalized = pendingPublicUsername ? "user" : (route === "start" ? "intro" : route);
  let wanted = allowedRoutes.has(normalized) ? normalized : "generate";
  // Public profile is intentionally readable without auth so share-link
  // visitors don't hit a wall before discovering the rest of the product.
  const protectedRoutes = new Set(["generate", "library", "profile", "player", "vocal", "stems", "advanced"]);
  const isLoggedIn = Boolean(authSession?.user?.id);
  if (!isLoggedIn && protectedRoutes.has(wanted)) wanted = "auth";
  document.body.classList.toggle("isIntro", wanted === "intro");
  document.body.classList.toggle("isAuth", wanted === "auth");
  document.body.setAttribute("data-route", wanted);
  if (els.brandSecondary) {
    els.brandSecondary.textContent = wanted === "hub" ? "Hub" : "Music";
  }

  document.querySelectorAll("[data-route]").forEach((el) => {
    el.style.display = el.getAttribute("data-route") === wanted ? "" : "none";
  });
  document.querySelectorAll("[data-route-link]").forEach((a) => {
    a.classList.toggle("active", a.getAttribute("data-route-link") === wanted);
  });
  const main = document.querySelector("main.grid");
  if (main) {
    main.classList.remove("routeSwap");
    requestAnimationFrame(() => main.classList.add("routeSwap"));
  }
  if (wanted === "hub") {
    markAllHubSeen();
    renderHubDots();
    renderHubUpdatedAt();
    updateHubAudioHint();
    // Fire focus once on the next frame so the closest-to-center card
    // already shows the lift / hero title before any scroll event.
    requestAnimationFrame(() => updateHubFocusedRow());
    setTimeout(() => scheduleHubViewportAutoplay(), 60);
    // Always trigger a Supabase refresh on entering Hub. Boot already does
    // this once, but a cold visitor landing directly on `#/hub?post=ID`
    // (from a shared link) may render before boot's refresh resolves —
    // and that left them staring at an empty feed. This call is
    // idempotent (`hubSyncInFlight` guards re-entry).
    void refreshHubFromSupabase();
    // Honor a `?post=ID` query in the hash: scroll the post into view and,
    // if audio is already unlocked, kick off playback. Don't auto-play
    // before the user has tapped once — iOS/Safari would block it and
    // we'd just flash the play button. The Hub already handles the rest
    // via its scroll-driven autoplay.
    try {
      const q = String(hash).split("?")[1] || "";
      const sp = new URLSearchParams(q);
      const targetId = String(sp.get("post") || "").trim();
      if (targetId) {
        focusHubPostFromShare(targetId);
      }
    } catch {}
  }
  if (wanted === "profile") {
    void refreshAuthStateFromSupabase();
    setProfileEditing(false);
  }
  if (wanted === "user") {
    renderUserProfile(pendingPublicUsername);
    // Hub posts arrive via Supabase sync; on a cold visit (someone landing
    // straight on `#/u/USERNAME` from a share) we may need to wait for
    // them to populate. refreshHubFromSupabase is idempotent and re-renders
    // automatically when rows arrive.
    void refreshHubFromSupabase();
  }
  if (wanted === "generate" && generationReadyNotice) {
    generationReadyNotice = false;
    renderGenerateReadyDot();
    setLoading(false);
    showResultCard(true);
  }
  syncGenerateOrbVisibility();
  renderGenerateReadyDot();
}

function updateBrandPulse() {
  if (!els.brandTitle) return;
  const isGenerating = Boolean(els.btnSunoGenerate?.disabled);
  const isPlaying = Boolean(playerEl && !playerEl.paused && !playerEl.ended);
  els.brandTitle.classList.toggle("isGenerating", isGenerating);
  els.brandTitle.classList.toggle("isPlaying", isPlaying);
}

function resetAdvancedOptionsToDefaults() {
  if (els.sunoGroovePace) els.sunoGroovePace.value = "";
  if (els.sunoProsody) els.sunoProsody.value = "";
  if (els.sunoBeatStability) els.sunoBeatStability.value = "";
  if (els.sunoProMode) els.sunoProMode.checked = false;
  if (els.sunoTiming) els.sunoTiming.value = "";
  if (els.sunoSongKey) els.sunoSongKey.value = "";
  if (els.sunoMaqam) els.sunoMaqam.value = "";
  if (els.sunoVoiceProfile) els.sunoVoiceProfile.value = "";
  if (els.sunoDialect) els.sunoDialect.value = "";
  if (els.sunoDialectHint) els.sunoDialectHint.value = "";
  if (els.sunoPersonaId) els.sunoPersonaId.value = "";
  document.body.classList.remove("proMode");
  if (els.advancedSheet) els.advancedSheet.open = false;
}

function resetCreateDraft() {
  busyCount = 0;
  generationReadyNotice = false;
  if (els.sunoPrompt) els.sunoPrompt.value = "";
  if (els.sunoStyle) els.sunoStyle.value = "";
  if (els.sunoTitle) els.sunoTitle.value = "";
  if (els.sunoArtworkStyle) els.sunoArtworkStyle.value = "";
  if (els.sunoReferenceMode) els.sunoReferenceMode.value = "none";
  if (els.sunoVocalUpload) els.sunoVocalUpload.value = "";
  if (els.vocalInstrumentalOnly) els.vocalInstrumentalOnly.value = "0";
  resetAdvancedOptionsToDefaults();
  if (els.vocalModeFull) els.vocalModeFull.classList.add("active");
  if (els.vocalModeInstrumental) els.vocalModeInstrumental.classList.remove("active");
  if (els.sunoReferenceHint) {
    els.sunoReferenceHint.style.display = "none";
    els.sunoReferenceHint.textContent = "";
    els.sunoReferenceHint.classList.remove("isCritical");
  }
  vocalRefBlob = null;
  if (els.sunoVocalUploadName) els.sunoVocalUploadName.textContent = "No vocal reference attached.";
  if (vocalRefPreviewUrl) {
    safeRevokeObjectUrl(vocalRefPreviewUrl);
    vocalRefPreviewUrl = "";
  }
  if (els.btnSunoGenerate) {
    els.btnSunoGenerate.textContent = "Generate song";
    els.btnSunoGenerate.disabled = false;
    els.btnSunoGenerate.dataset.mode = "generate";
  }
  if (els.resultCard) els.resultCard.style.display = "none";
  if (els.resultCard2) els.resultCard2.style.display = "none";
  if (generatePollTimer) {
    clearInterval(generatePollTimer);
    generatePollTimer = null;
  }
  savePendingBackendTask("");
  pendingGeneratedCoverDataUrl = "";
  pendingBackendTaskId = "";
  imageMoodAppliedForNextGen = false;
  imageMoodData = null;
  imageMoodCoverDataUrl = "";
  sunoTaskId = null;
  sunoAudioId = null;
  lastSunoAudioId2 = "";
  if (lastSunoCachedUrl) safeRevokeObjectUrl(lastSunoCachedUrl);
  if (lastSunoCachedUrl2) safeRevokeObjectUrl(lastSunoCachedUrl2);
  lastSunoCachedUrl = "";
  lastSunoCachedUrl2 = "";
  lastSunoFullUrl = "";
  lastSunoProxyUrl = "";
  lastSunoArtUrl = "";
  lastSunoTitle = "";
  lastSunoFullUrl2 = "";
  lastSunoProxyUrl2 = "";
  lastSunoArtUrl2 = "";
  lastSunoTitle2 = "";
  lastSunoReferenceUrl = "";
  updateListenRefButton();
  if (playerEl) {
    try {
      playerEl.pause();
      playerEl.currentTime = 0;
    } catch {}
  }
  if (els.btnSunoStems) els.btnSunoStems.disabled = true;
  if (els.btnSunoMultiStems) els.btnSunoMultiStems.disabled = true;
  renderReferenceHints();
  setGenerateFieldsLocked(false);
  setLoading(false);
  setStatus("New draft started.");
  syncGenerateOrbVisibility();
}

window.addEventListener("hashchange", applyRoute);
if (!location.hash) location.hash = "#/intro";
applyRoute();
updateEnvironmentBadge();
document.body.classList.remove("booting");
document.querySelectorAll("[data-route-link]").forEach((a) => {
  a.addEventListener("click", () => haptic("light"));
});

function normalizeMaqamValue(v) {
  return String(v || "")
    .replaceAll("_", " ")
    .replace(/\s+/g, " ")
    .trim();
}

function applyMaqamToStyleInput() {
  if (!els.sunoMaqam || !els.sunoStyle) return;
  const maqam = normalizeMaqamValue(els.sunoMaqam.value);
  const base = String(els.sunoStyle.value || "").trim();
  // Remove any previous "maqam:" tag to avoid duplicates.
  const cleaned = base
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((t) => !/^maqam\s*:/i.test(t))
    .join(", ");
  const next = maqam ? [cleaned, `Maqam: ${maqam}`].filter(Boolean).join(", ") : cleaned;
  els.sunoStyle.value = next;
  if (els.sunoSongKey && els.sunoKeyHint) {
    if (maqam) {
      const current = String(els.sunoSongKey.value || "").trim();
      const rootOnly = current.replace(/\s+(Major|Minor)$/i, "").trim();
      if (rootOnly && rootOnly !== current) els.sunoSongKey.value = rootOnly;
      els.sunoKeyHint.textContent = "Maqam active: Song key acts as tonic/root note only.";
    } else {
      els.sunoKeyHint.textContent = "Tip: with Maqam selected, Song key is treated as tonic/root note only.";
    }
  }
}
function mapSolfegeToLetterKey(songKey) {
  const s = String(songKey || "");
  return s
    .replace(/^Do#/i, "C#")
    .replace(/^Do/i, "C")
    .replace(/^Re#/i, "D#")
    .replace(/^Re/i, "D")
    .replace(/^Mi/i, "E")
    .replace(/^Fa#/i, "F#")
    .replace(/^Fa/i, "F")
    .replace(/^Sol#/i, "G#")
    .replace(/^Sol/i, "G")
    .replace(/^La#/i, "A#")
    .replace(/^La/i, "A")
    .replace(/^Si/i, "B");
}

function openBilling() {
  window.open("https://sunoapi.org/billing", "_blank", "noopener,noreferrer");
  setStatus("Opened billing. After topping up, come back and click “Refresh credits”.");
}

/** @type {import("./types.js").Arrangement | null} */
let currentArrangement = null;
/** @type {Blob | null} */
let currentWav = null;
/** @type {HTMLAudioElement | null} */
let audioEl = null;
/** @type {Blob | null} */
let currentVoice = null;
/** @type {HTMLAudioElement | null} */
let voiceEl = null;
/** @type {import("./melody/extract.js").Melody | null} */
let currentMelody = null;
/** @type {{ stop: () => void } | null} */
let humSession = null;
let variationSeed = String(Date.now());
let sunoTaskId = null;
let sunoAudioId = null;
let sunoStemsTaskId = null;
let sunoMultiStemsTaskId = null;
let generatePollTimer = null;
let stemsPollTimer = null;
let multiStemsPollTimer = null;
let multiStemsInFlight = false;
let vocalRefRecorder = null;
let vocalRefStream = null;
let vocalRefBlob = null;
let vocalRefChunks = [];
let vocalRefPreviewUrl = "";
let imageMoodData = null;
let imageMoodCoverDataUrl = "";
let pendingGeneratedCoverDataUrl = "";
let pendingBackendTaskId = "";
const PENDING_TASK_KEY = "mas:pending_backend_task_v1";
var lastGenerationReadyAt = 0;

function renderGenerateReadyDot() {
  // Intentionally no tab-dot on Generate (user requested removal).
}

function markGenerationReadyNotice() {
  // User requested removing "songs ready" notice card completely.
  busyCount = 0;
  generationReadyNotice = false;
  lastGenerationReadyAt = Date.now();
  renderGenerateReadyDot();
  setLoading(false);
  showResultCard(true);
}

// Single source of truth for the active vocal reference. Updated whenever the
// user picks a file or finishes a recording, and cleared as soon as a Generate
// request fires. Avoids stale selections leaking from previous runs.
var currentVocalRefFile = null;

function setVocalRefFile(file, label) {
  currentVocalRefFile = file || null;
  vocalRefBlob = null;
  if (els.sunoVocalUploadName) {
    els.sunoVocalUploadName.textContent = currentVocalRefFile
      ? (label || `Voice reference attached: ${currentVocalRefFile.name || "vocal-reference"}`)
      : "No vocal reference attached.";
  }
  updateVocalRefPreviewState();
  renderReferenceHints();
}

function getVocalReferenceFile() {
  if (currentVocalRefFile) return currentVocalRefFile;
  if (vocalRefBlob) {
    return new File([vocalRefBlob], "vocal-reference.webm", {
      type: vocalRefBlob.type || "audio/webm",
    });
  }
  return null;
}

function clearVocalReferenceSelection() {
  currentVocalRefFile = null;
  vocalRefBlob = null;
  if (els.sunoVocalUpload) els.sunoVocalUpload.value = "";
  clearVocalRefPreviewUrl();
  if (els.sunoVocalUploadName) els.sunoVocalUploadName.textContent = "No vocal reference attached.";
  updateVocalRefPreviewState();
  renderReferenceHints();
}

function openVocalReferencePicker() {
  if (!els.sunoVocalUpload) return;
  // Force a fresh `change` event even when the user re-picks the same file path.
  try { els.sunoVocalUpload.value = ""; } catch {}
  els.sunoVocalUpload.click();
}
function clearVocalRefPreviewUrl() {
  if (vocalRefPreviewUrl) URL.revokeObjectURL(vocalRefPreviewUrl);
  vocalRefPreviewUrl = "";
}
function updateVocalRefPreviewState() {
  const hasRef = Boolean(getVocalReferenceFile());
  if (els.btnPreviewVocalRef) els.btnPreviewVocalRef.disabled = !hasRef;
}
function openVocalRecorderModal() {
  if (!els.vocalRecorderModal) return;
  els.vocalRecorderModal.style.display = "";
}
function closeVocalRecorderModal() {
  if (!els.vocalRecorderModal) return;
  els.vocalRecorderModal.style.display = "none";
  if (els.btnRecorderToggle) els.btnRecorderToggle.classList.remove("isRecording");
}
function pickRecorderMimeType() {
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];
  for (const m of candidates) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported?.(m)) return m;
  }
  return "";
}

async function startVocalReferenceRecording() {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
  const mimeType = pickRecorderMimeType();
  const rec = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
  const chunks = [];
  rec.ondataavailable = (e) => {
    if (e.data && e.data.size) chunks.push(e.data);
  };
  rec.onstop = () => {
    vocalRefChunks = chunks.slice();
    const blob = new Blob(chunks, { type: rec.mimeType || "audio/webm;codecs=opus" });
    vocalRefBlob = blob;
    let promoted = false;
    // Immediately promote the recording to the active reference and drop any
    // previously uploaded file. Otherwise an earlier upload still wins because
    // currentVocalRefFile takes priority over vocalRefBlob in the picker.
    if (blob && blob.size > 0) {
      const recordedFile = new File([blob], "vocal-reference.webm", {
        type: blob.type || "audio/webm",
      });
      if (els.sunoVocalUpload) {
        try { els.sunoVocalUpload.value = ""; } catch {}
      }
      setVocalRefFile(recordedFile, "Voice reference recorded and attached.");
      promoted = true;
    } else {
      renderReferenceHints();
      updateVocalRefPreviewState();
    }
    // Use recording stays enabled whenever we actually have a reference;
    // setVocalRefFile clears vocalRefBlob, so we cannot rely on it here.
    if (els.btnRecorderUse) {
      els.btnRecorderUse.disabled = !(promoted || getVocalReferenceFile());
    }
    if (els.recorderStatus) {
      els.recorderStatus.textContent = promoted
        ? "Recording ready. Tap Use recording or close."
        : "Recording empty. Try again.";
    }
  };
  vocalRefStream = stream;
  vocalRefRecorder = rec;
  rec.start();
  if (els.btnVocalRefRec) els.btnVocalRefRec.disabled = true;
  if (els.btnVocalRefStop) els.btnVocalRefStop.disabled = false;
  setStatus("Recording voice reference…");
}

function stopVocalReferenceRecording() {
  try {
    if (vocalRefRecorder && vocalRefRecorder.state !== "inactive") vocalRefRecorder.stop();
  } catch {}
  try {
    if (vocalRefStream) vocalRefStream.getTracks().forEach((t) => t.stop());
  } catch {}
  vocalRefRecorder = null;
  vocalRefStream = null;
  if (els.btnVocalRefRec) els.btnVocalRefRec.disabled = false;
  if (els.btnVocalRefStop) els.btnVocalRefStop.disabled = true;
  setStatus("Voice reference ready.");
  renderReferenceHints();
}
function extractTaskIdLoose(data) {
  return (
    data?.data?.taskId ||
    data?.data?.task_id ||
    data?.taskId ||
    data?.task_id ||
    data?.data?.id ||
    data?.id ||
    deepFindFirstStringByKeys(data, ["taskId", "task_id", "id"]) ||
    null
  );
}
function compactStyleForProvider(input, maxLen = 980) {
  let s = String(input || "")
    .replace(/\s+/g, " ")
    .replace(/\s*,\s*/g, ", ")
    .replace(/\s*\|\s*/g, " | ")
    .trim();
  if (!s) return "";
  if (s.length <= maxLen) return s;
  const parts = s.split(",").map((p) => p.trim()).filter(Boolean);
  let out = "";
  for (const p of parts) {
    const next = out ? `${out}, ${p}` : p;
    if (next.length > maxLen) break;
    out = next;
  }
  if (!out) out = s.slice(0, maxLen).trim();
  return out;
}
/** @type {Array<{ name:string, url:string, gain:number, pan?:number, muted?:boolean }>} */
let mixerStems = [];
/** @type {HTMLAudioElement[]} */
let mixerAudioEls = [];
let mixerIsPlaying = false;

// In-app player for Suno outputs
/** @type {HTMLAudioElement | null} */
let playerEl = null;
let playerLoadedLabel = "";
let playerSeekDragging = false;
let currentPlayerTrackRef = null;
let lastSunoFullUrl = "";
let lastSunoProxyUrl = "";
let lastSunoCachedUrl = "";
let lastSunoVocalUrl = "";
let lastSunoInstUrl = "";
let lastSunoInstProxyUrl = "";
let lastSunoArtUrl = "";
let lastSunoTitle = "";
let lastSunoFullUrl2 = "";
let lastSunoProxyUrl2 = "";
let lastSunoCachedUrl2 = "";
let lastSunoArtUrl2 = "";
let lastSunoTitle2 = "";
let lastSunoAudioId2 = "";
// Suno's temporary reference URL (3-day TTL) for the most recent reference
// upload. Surfaced as a "Listen to reference" button on the result card so
// the user can confirm the exact bytes Suno received as their vocal melody.
let lastSunoReferenceUrl = "";
let libraryNowPlayingId = null;
let lastGenerationMeta = null;
const PROFILE_KEY = "mas:profile:v1";
const PROFILE_PERSONAS_KEY = "mas:personas:v1";
const AUTH_SESSION_KEY = "mas:supabase:session:v1";
const AUTH_PKCE_KEY = "mas:supabase:pkce:v1";
let activeProfile = { id: "guest", username: "guest", email: "" };
authSession = null;
let lastAuthDebug = "";
function loadProfile() {
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    const p = raw ? JSON.parse(raw) : null;
    if (p && p.id) activeProfile = p;
  } catch {}
}
function saveProfile(p) {
  activeProfile = p;
  try { localStorage.setItem(PROFILE_KEY, JSON.stringify(p)); } catch {}
}
function profileLibraryKey() {
  return `mas:library:v1:${activeProfile.id || "guest"}`;
}
function profileLibraryKeyFor(id) {
  return `mas:library:v1:${id || "guest"}`;
}
function hubFeedKey() {
  return "mas:hub:v1";
}
function hubSeenKey() {
  return "mas:hub-seen:v1";
}
function localDeviceIdKey() {
  return "mas:device-id:v1";
}
function getLocalDeviceId() {
  try {
    let id = localStorage.getItem(localDeviceIdKey());
    if (!id) {
      id = `dev_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
      localStorage.setItem(localDeviceIdKey(), id);
    }
    return id;
  } catch {
    return "dev_fallback";
  }
}
let hubFilter = "latest";
let hubSyncTimer = null;
let hubLastSyncOk = false;
let hubLastSyncRows = 0;
let hubLastSyncError = "";
let hubSyncInFlight = false;
let hubRetryCount = 0;
let hubFeedMemory = [];
function loadHubSeen() {
  try {
    const raw = localStorage.getItem(hubSeenKey());
    const v = raw ? JSON.parse(raw) : {};
    return v && typeof v === "object" ? v : {};
  } catch {
    return {};
  }
}
function saveHubSeen(v) {
  try { localStorage.setItem(hubSeenKey(), JSON.stringify(v || {})); } catch {}
}
function categoryMatch(post, cat) {
  if (cat === "latest") return true;
  if (cat === "arabic") return /arab|خليج|مقام|oud|darbuka|hijaz/i.test(JSON.stringify(post.meta || {}) + " " + (post.title || ""));
  if (cat === "instrumental") return String(post.kind || "").includes("instrumental");
  if (cat === "remix") return /remix/i.test(String(post.title || ""));
  return false;
}
function markHubCategorySeen(cat) {
  const seen = loadHubSeen();
  seen[cat] = Date.now();
  saveHubSeen(seen);
}
function markAllHubSeen() {
  const seen = loadHubSeen();
  const now = Date.now();
  ["latest", "arabic", "instrumental", "remix"].forEach((cat) => {
    seen[cat] = now;
  });
  saveHubSeen(seen);
}
function renderHubDots() {
  const feed = loadHubFeed();
  const seen = loadHubSeen();
  const dots = {
    latest: els.hubDotLatest,
    arabic: els.hubDotArabic,
    instrumental: els.hubDotInstrumental,
    remix: els.hubDotRemix,
  };
  Object.entries(dots).forEach(([cat, el]) => {
    if (!el) return;
    const lastSeen = Number(seen[cat] || 0);
    const hasUnseen = feed.some((p) => categoryMatch(p, cat) && Number(p.ts || 0) > lastSeen);
    el.style.display = hasUnseen ? "inline-block" : "none";
  });
  if (els.hubTabDot) {
    const hasAnyUnseen = ["latest", "arabic", "instrumental", "remix"].some((cat) => {
      const lastSeen = Number(seen[cat] || 0);
      return feed.some((p) => categoryMatch(p, cat) && Number(p.ts || 0) > lastSeen);
    });
    els.hubTabDot.style.display = hasAnyUnseen ? "inline-block" : "none";
  }
}
async function supabaseSelectHub() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return null;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 12000);
  const selectCols = [
    "id",
    "created_at",
    "title",
    "cover_url",
    "song_url",
    "kind",
    "creator_username",
    "creator_avatar",
    "likes",
    "reacts",
    "remix_of",
    "proof",
    "meta",
  ].join(",");
  const r = await fetch(`${SUPABASE_URL}/rest/v1/hub_posts?select=${encodeURIComponent(selectCols)}&order=created_at.desc&limit=60`, {
    headers: {
      apikey: SUPABASE_ANON_KEY,
    },
    signal: ctrl.signal,
  });
  clearTimeout(timer);
  if (!r.ok) {
    const txt = await r.text().catch(() => "");
    throw new Error(`supabase select failed (${r.status}) ${String(txt).slice(0, 100)}`);
  }
  return await r.json().catch(() => []);
}
function loadAuthSession() {
  try {
    const raw = localStorage.getItem(AUTH_SESSION_KEY);
    authSession = raw ? JSON.parse(raw) : null;
  } catch {
    authSession = null;
  }
}
function saveAuthSession(sess) {
  authSession = sess || null;
  try {
    if (authSession) localStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(authSession));
    else localStorage.removeItem(AUTH_SESSION_KEY);
  } catch {}
  renderAuthStatus();
}
function getSupabaseAuthToken() {
  return authSession?.access_token || "";
}
function b64urlFromBytes(bytes) {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 1) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
async function sha256Base64Url(input) {
  const enc = new TextEncoder().encode(input);
  const buf = await crypto.subtle.digest("SHA-256", enc);
  return b64urlFromBytes(new Uint8Array(buf));
}
function randomVerifier(len = 64) {
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  return b64urlFromBytes(bytes).slice(0, len);
}
async function supabaseFetchUser(token) {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !token) return null;
  const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${token}`,
    },
  });
  if (!r.ok) {
    const t = await r.text().catch(() => "");
    lastAuthDebug = `user fetch ${r.status}: ${String(t || "").slice(0, 120)}`;
    if (r.status === 401 || r.status === 403) {
      const lower = String(t || "").toLowerCase();
      if (lower.includes("token") || lower.includes("jwt")) {
        saveAuthSession(null);
      }
    }
    return null;
  }
  lastAuthDebug = "";
  return await r.json().catch(() => null);
}
async function refreshAuthStateFromSupabase() {
  const token = getSupabaseAuthToken();
  if (!token) {
    renderAuthStatus();
    return null;
  }
  const remoteUser = await supabaseFetchUser(token);
  if (remoteUser) {
    saveAuthSession({ ...(authSession || {}), access_token: token, user: remoteUser });
    return remoteUser;
  }
  renderAuthStatus();
  return null;
}
function renderAuthStatus() {
  if (!els.authStatus) return;
  const email = authSession?.user?.email || "";
  const hasToken = Boolean(getSupabaseAuthToken());
  let msg = email
    ? ""
    : hasToken
      ? "Session found, validating account..."
      : "Not logged in.";
  if (!email && hasToken && lastAuthDebug) msg += ` • ${lastAuthDebug}`;
  els.authStatus.textContent = msg;
  els.authStatus.style.display = msg ? "" : "none";
  if (els.authLoginControls) els.authLoginControls.style.display = email ? "none" : "";
  if (els.authLoggedInRow) els.authLoggedInRow.style.display = email ? "flex" : "none";
  if (els.authLoggedInEmail) els.authLoggedInEmail.textContent = email ? email : "Logged in.";
  if (els.authLoggedInEmailInline) {
    els.authLoggedInEmailInline.textContent = email ? email : "";
    els.authLoggedInEmailInline.style.display = email ? "" : "none";
  }
}
function resetProfileUiToGuest() {
  activeProfile = {
    id: "guest",
    username: "guest",
    email: "",
    voiceTimbre: "",
    bio: "Add a short bio to introduce your music style.",
    avatar: "",
    genres: "",
    links: {},
    isPublic: true,
  };
  try { localStorage.setItem(PROFILE_KEY, JSON.stringify(activeProfile)); } catch {}
  if (els.profilePreviewUsernameInput) els.profilePreviewUsernameInput.value = "@guest";
  if (els.profilePreviewTimbreInput) els.profilePreviewTimbreInput.value = "";
  if (els.profilePreviewBioInput) els.profilePreviewBioInput.value = "Add a short bio to introduce your music style.";
  if (els.profileIsPublic) els.profileIsPublic.checked = true;
  if (els.profileAvatarFile) els.profileAvatarFile.value = "";
  renderProfilePreviewFromInputs();
  renderProfileHubShared();
  setProfileEditing(false);
  renderLibrary();
}
async function supabaseSendOtp(email) {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) throw new Error("Supabase config missing");
  const r = await fetch(`${SUPABASE_URL}/auth/v1/otp`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({
      email,
      create_user: true,
      email_redirect_to: `${window.location.origin}${window.location.pathname}#/profile`,
    }),
  });
  if (!r.ok) {
    const txt = await r.text().catch(() => "");
    throw new Error(`OTP send failed (${r.status}): ${txt.slice(0, 120)}`);
  }
}
function maybeHandleMagicLinkFromHash() {
  try {
    const hash = String(window.location.hash || "");
    const search = String(window.location.search || "");
    const rawHash = hash.startsWith("#") ? hash.slice(1) : hash;
    const tokenPartHash = rawHash.includes("access_token=")
      ? rawHash.slice(rawHash.indexOf("access_token="))
      : "";
    const tokenPartSearch = search.includes("access_token=")
      ? search.slice(search.indexOf("access_token=") + 1)
      : "";
    const raw = tokenPartHash || tokenPartSearch;
    if (!raw) return false;
    const qp = new URLSearchParams(raw);
    const access_token = qp.get("access_token");
    const refresh_token = qp.get("refresh_token");
    const expires_in = Number(qp.get("expires_in") || 3600);
    const token_type = qp.get("token_type") || "bearer";
    if (!access_token) return false;
    const email = qp.get("email") || "";
    const user = { id: qp.get("user_id") || "", email };
    if (!access_token || access_token.split(".").length < 3) {
      lastAuthDebug = "callback token invalid format";
      saveAuthSession(null);
      return false;
    }
    saveAuthSession({ access_token, refresh_token, expires_in, token_type, user });
    window.location.hash = "#/profile";
    setStatus("Logged in via magic link.");
    return true;
  } catch {
    return false;
  }
}
async function maybeHandleAuthCodeFromQuery() {
  try {
    const sp = new URLSearchParams(window.location.search || "");
    const code = sp.get("code");
    if (!code) return false;
    const verifier = localStorage.getItem(AUTH_PKCE_KEY) || "";
    if (!verifier) {
      lastAuthDebug = "missing pkce verifier";
      return false;
    }
    const r = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=pkce`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({ auth_code: code, code_verifier: verifier }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok || !d?.access_token) {
      lastAuthDebug = `code exchange ${r.status}: ${String(JSON.stringify(d)).slice(0, 120)}`;
      return false;
    }
    localStorage.removeItem(AUTH_PKCE_KEY);
    const user = d?.user || { id: "", email: "" };
    saveAuthSession({
      access_token: d.access_token,
      refresh_token: d.refresh_token || "",
      expires_in: Number(d.expires_in || 3600),
      token_type: d.token_type || "bearer",
      user,
    });
    window.history.replaceState({}, document.title, window.location.pathname + "#/profile");
    applyRoute();
    setStatus("Logged in via Google.");
    return true;
  } catch (e) {
    lastAuthDebug = `code flow error: ${e?.message || String(e)}`;
    return false;
  }
}
async function supabaseVerifyOtp(email, token) {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) throw new Error("Supabase config missing");
  const r = await fetch(`${SUPABASE_URL}/auth/v1/verify`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({
      email,
      token,
      type: "email",
    }),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d?.msg || `OTP verify failed (${r.status})`);
  return d;
}
async function supabaseGoogleLoginUrl() {
  const verifier = randomVerifier(64);
  localStorage.setItem(AUTH_PKCE_KEY, verifier);
  const challenge = await sha256Base64Url(verifier);
  const redirectTo = encodeURIComponent(`${window.location.origin}${window.location.pathname}`);
  return `${SUPABASE_URL}/auth/v1/authorize?provider=google&response_type=code&scope=email%20profile&code_challenge=${encodeURIComponent(challenge)}&code_challenge_method=S256&redirect_to=${redirectTo}`;
}
async function supabaseUpsertProfile(profile) {
  const token = getSupabaseAuthToken();
  if (!token) throw new Error("Login required");
  const payload = {
    user_id: authSession?.user?.id,
    username: profile.username || "guest",
    email: profile.email || "",
    gender: profile.gender || "",
    voice_timbre: profile.voiceTimbre || "",
    bio: profile.bio || "",
    avatar: profile.avatar || "",
    genres: profile.genres || "",
    instagram: profile.links?.instagram || "",
    youtube: profile.links?.youtube || "",
    tiktok: profile.links?.tiktok || "",
    is_public: profile.isPublic !== false,
    updated_at: new Date().toISOString(),
  };
  const r = await fetch(`${SUPABASE_URL}/rest/v1/profiles`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${token}`,
      Prefer: "resolution=merge-duplicates,return=representation",
    },
    body: JSON.stringify(payload),
  });
  if (!r.ok) {
    const txt = await r.text().catch(() => "");
    throw new Error(`Cloud save failed (${r.status}): ${txt.slice(0, 140)}`);
  }
}
async function supabaseLoadProfile() {
  const token = getSupabaseAuthToken();
  if (!token || !authSession?.user?.id) return null;
  const uid = encodeURIComponent(authSession.user.id);
  const r = await fetch(`${SUPABASE_URL}/rest/v1/profiles?user_id=eq.${uid}&select=*`, {
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${token}`,
    },
  });
  if (!r.ok) return null;
  const arr = await r.json().catch(() => []);
  if (!Array.isArray(arr) || !arr.length) return null;
  const p = arr[0];
  return {
    id: p.user_id || activeProfile.id,
    username: p.username || "guest",
    email: p.email || "",
    gender: p.gender || "",
    voiceTimbre: p.voice_timbre || "",
    bio: p.bio || "",
    avatar: p.avatar || "",
    genres: p.genres || "",
    links: {
      instagram: p.instagram || "",
      youtube: p.youtube || "",
      tiktok: p.tiktok || "",
    },
    isPublic: p.is_public !== false,
  };
}
async function supabaseLoadUserSongs() {
  const token = getSupabaseAuthToken();
  if (!token || !authSession?.user?.id) return [];
  const uid = encodeURIComponent(authSession.user.id);
  const r = await fetch(`${SUPABASE_URL}/rest/v1/user_songs?user_id=eq.${uid}&select=*&order=created_at.desc`, {
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${token}`,
    },
  });
  if (!r.ok) return [];
  const rows = await r.json().catch(() => []);
  if (!Array.isArray(rows)) return [];
  return rows.map((s) => ({
    id: String(s.id || `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`),
    ts: new Date(s.created_at || Date.now()).getTime(),
    title: s.title || "Generated song",
    artUrl: s.art_url || "",
    url: s.song_url || "",
    taskId: s.task_id || "",
    audioId: s.audio_id || "",
    kind: s.kind || "full",
    meta: s.meta || null,
  }));
}
async function supabaseInsertUserSong(track) {
  const token = getSupabaseAuthToken();
  if (!token || !authSession?.user?.id) return { ok: false, reason: "no_auth" };
  const payload = {
    user_id: authSession.user.id,
    title: track.title || "Generated song",
    art_url: track.artUrl || "",
    song_url: track.url || "",
    task_id: track.taskId || "",
    audio_id: track.audioId || "",
    kind: track.kind || "full",
    meta: track.meta || null,
  };
  const r = await fetch(`${SUPABASE_URL}/rest/v1/user_songs`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify(payload),
  }).catch(() => null);
  if (!r) return { ok: false, reason: "network" };
  if (!r.ok) {
    const txt = await r.text().catch(() => "");
    return { ok: false, reason: `http_${r.status}`, details: String(txt).slice(0, 180) };
  }
  return { ok: true };
}
async function supabaseDeleteUserSong(track) {
  const token = getSupabaseAuthToken();
  if (!token || !authSession?.user?.id) return;
  const title = encodeURIComponent(String(track?.title || ""));
  const songUrl = encodeURIComponent(String(track?.url || ""));
  if (!title || !songUrl) return;
  await fetch(`${SUPABASE_URL}/rest/v1/user_songs?user_id=eq.${encodeURIComponent(authSession.user.id)}&title=eq.${title}&song_url=eq.${songUrl}`, {
    method: "DELETE",
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${token}`,
      Prefer: "return=minimal",
    },
  }).catch(() => null);
}
async function supabaseInsertHub(post) {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return null;
  const payload = {
    title: post.title,
    song_url: post.url,
    cover_url: post.artUrl || null,
    creator_username: post.creator,
    creator_avatar: post.creatorAvatar || null,
    kind: post.kind || "full",
    likes: Number(post.likes || 0),
    reacts: post.reacts || { melody: 0, lyrics: 0, mix: 0, groove: 0 },
    remix_of: post.remixOf || null,
    proof: post.proof || null,
    meta: post.meta || null,
  };
  const r = await fetch(`${SUPABASE_URL}/rest/v1/hub_posts`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_ANON_KEY,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify(payload),
  });
  if (!r.ok) throw new Error("supabase insert failed");
  return await r.json().catch(() => []);
}
async function supabasePatchHub(id, patch) {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return null;
  const r = await fetch(`${SUPABASE_URL}/rest/v1/hub_posts?id=eq.${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: {
      apikey: SUPABASE_ANON_KEY,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify(patch),
  });
  if (!r.ok) throw new Error("supabase update failed");
  return await r.json().catch(() => []);
}
async function supabaseDeleteHub(id) {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return null;
  const r = await fetch(`${SUPABASE_URL}/rest/v1/hub_posts?id=eq.${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Prefer: "return=representation",
    },
  });
  if (!r.ok) throw new Error("supabase delete failed");
  return await r.json().catch(() => []);
}
function loadHubFeed() {
  return Array.isArray(hubFeedMemory) ? hubFeedMemory : [];
}
function saveHubFeed(items) {
  hubFeedMemory = Array.isArray(items) ? items : [];
}
function openShareLiveModal(title) {
  if (!els.shareLiveModal) return;
  if (els.shareLiveText) {
    els.shareLiveText.textContent = title
      ? `“${title}” is now live on Hub.`
      : "Your song is now live on Hub.";
  }
  els.shareLiveModal.style.display = "";
}
function closeShareLiveModal() {
  if (!els.shareLiveModal) return;
  els.shareLiveModal.style.display = "none";
}
function openProofModal(post) {
  if (!els.proofModal || !els.proofCard) return;
  currentProofPost = post || null;
  const ts = post?.ts ? new Date(post.ts) : new Date();
  const localTs = ts.toLocaleString();
  const utcTs = ts.toISOString();
  const text = [
    "NabadAi Music — Proof of Creation",
    "",
    "This certificate confirms that this musical work was created using NabadAi Music on the stated date and recorded with the unique creation fingerprint below.",
    "",
    `Title: ${post?.title || "Untitled"}`,
    `Creator: @${post?.creator || "guest"}`,
    `Date (Local): ${localTs}`,
    `Date (UTC): ${utcTs}`,
    `Fingerprint: #${post?.proof?.promptHash || "N/A"}`,
    `Model: ${post?.proof?.model || LATEST_SUNO_MODEL}`,
    `Mode: ${post?.proof?.mode || post?.kind || "full"}`,
    "",
    "This certificate records creation metadata and timestamp for attribution purposes.",
  ].join("\n");
  els.proofCard.textContent = text;
  els.proofModal.style.display = "";
}
function closeProofModal() {
  if (!els.proofModal) return;
  els.proofModal.style.display = "none";
}
function shareToHub(track) {
  const feed = loadHubFeed();
  const creator = String(activeProfile.username || "guest");
  const creatorUserId = String(authSession?.user?.id || "");
  const proof = {
    createdAt: Date.now(),
    mode: track?.meta?.mode || track?.kind || "full",
    model: track?.meta?.model || LATEST_SUNO_MODEL,
    promptHash: btoa(unescape(encodeURIComponent(String(track?.meta?.finalPrompt || track?.meta?.lyricsInput || track?.title || ""))))
      .slice(0, 16),
  };
  feed.unshift({
    id: `hub_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    ts: Date.now(),
    title: track.title || "Untitled",
    artUrl: track.artUrl || "",
    url: track.url || "",
    kind: track.kind || "full",
    creator,
    creatorAvatar: String(activeProfile.avatar || "./assets/nabadai-logo.png"),
    ownerDeviceId: getLocalDeviceId(),
    likes: 0,
    reacts: { melody: 0, lyrics: 0, mix: 0, groove: 0 },
    remixOf: track?.remixOf || "",
    proof,
    meta: { ...(track.meta || {}), creatorUserId },
  });
  saveHubFeed(feed.slice(0, 200));
  void supabaseInsertHub(feed[0]).catch(() => {});
  renderHub();
  renderProfileHubShared();
}
function makeDemoHubPost() {
  const creator = String(activeProfile.username || "guest");
  return {
    id: `hub_demo_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    ts: Date.now(),
    title: "Demo Hub Track",
    artUrl: "./assets/nabadai-logo.png",
    url: "",
    kind: "full",
    creator,
    creatorAvatar: String(activeProfile.avatar || "./assets/nabadai-logo.png"),
    ownerDeviceId: getLocalDeviceId(),
    likes: 0,
    reacts: { melody: 0, lyrics: 0, mix: 0, groove: 0 },
    remixOf: "",
    proof: {
      createdAt: Date.now(),
      mode: "demo",
      model: LATEST_SUNO_MODEL,
      promptHash: "DEMOPOST",
    },
    meta: { demo: true, styleInput: "demo style", lyricsInput: "demo lyrics" },
  };
}
// Trending score: engagement weighted by recency.
//   engagement = likes + melody + lyrics   (mix/groove removed from UI
//   and excluded here so old DB values don't skew ranking)
//   score      = (engagement + 1) * 0.5^(ageHours / 36)
// 36-hour half-life means a post's weight halves every ~1.5 days, so a
// fresh post with a few reactions can overtake an older popular one.
// Tunable via HUB_TRENDING_HALF_LIFE_HOURS.
const HUB_TRENDING_HALF_LIFE_HOURS = 36;
function hubTrendingScore(post, nowMs) {
  if (!post) return 0;
  const ts = Number(post.ts || 0);
  if (!ts) return 0;
  const ageMs = Math.max(0, (nowMs || Date.now()) - ts);
  const ageHours = ageMs / 3600000;
  const reacts = post.reacts || {};
  const reactsTotal = Number(reacts.melody || 0) + Number(reacts.lyrics || 0);
  const engagement = Number(post.likes || 0) + reactsTotal;
  const decay = Math.pow(0.5, ageHours / HUB_TRENDING_HALF_LIFE_HOURS);
  return (engagement + 1) * decay;
}
function renderHub() {
  if (!els.hubList) return;
  let items = loadHubFeed();
  if (hubFilter === "trending") {
    const now = Date.now();
    items = [...items].sort((a, b) => {
      const sa = hubTrendingScore(a, now);
      const sb = hubTrendingScore(b, now);
      if (sb !== sa) return sb - sa;
      return Number(b.ts || 0) - Number(a.ts || 0);
    });
  }
  // Legacy genre filters (arabic/instrumental/remix) were removed in
  // 20260509k — they were title regex, not real categories. The sort
  // segment is now Latest | Trending only.
  if (!items.length) {
    els.hubList.textContent = "No posts yet. Share songs from Library to Hub.";
    renderHubUpdatedAt();
    updateHubAudioHint();
    return;
  }
  els.hubList.innerHTML = items.map((p) => `
    <div class="trackRow hubRow" data-hub-row="${p.id}">
      <div class="hubCoverWrap" data-hub-cover="${p.id}">
        <img class="hubCover" src="${escapeHtml(p.artUrl || p.creatorAvatar || "./assets/nabadai-logo.png")}" alt="cover" />
        <div class="hubCoverScrim" aria-hidden="true"></div>
        <div class="hubEq" aria-hidden="true"><i></i><i></i><i></i></div>
        <button class="hubPlayOverlay" data-hub-play="${p.id}" aria-label="Play">▶</button>
        <div class="hubPlayProgress"><span id="hubProg_${p.id}" style="width:0%"></span></div>
        <button class="hubMoreCorner" data-hub-more="${p.id}" aria-label="More">⋯</button>
      </div>
      <div class="hubBody">
        <div class="hubMetaTop">
          <img class="hubAvatar" src="${escapeHtml(p.creatorAvatar || "./assets/nabadai-logo.png")}" alt="avatar" data-hub-user="${p.id}" />
          <div class="hubMetaText">
            <span class="hubCreator" data-hub-user="${p.id}">@${escapeHtml(p.creator)}</span>
            <span class="hubMetaDot">·</span>
            <span class="hubTimeAgo">${escapeHtml(relativeTime(p.ts))}</span>
          </div>
          <span class="hubProofChip" title="Proof ${escapeHtml(String(p?.proof?.model || LATEST_SUNO_MODEL))} · #${escapeHtml(String(p?.proof?.promptHash || ""))}">Proof</span>
        </div>
        <div class="trackName hubTitle">${escapeHtml(p.title)}</div>
        ${p.remixOf ? `<div class="hubRemixOf">Remix of: ${escapeHtml(p.remixOf)}</div>` : ""}
      </div>
      <div class="hubActionRow">
        <button class="hubLike" data-hub-like="${p.id}" aria-label="Like" data-count="${Number(p.likes || 0)}">
          <span class="hubLikeHeart" aria-hidden="true">♥</span>
          <span class="hubLikeCount">${Number(p.likes || 0)}</span>
        </button>
        <div class="hubReacts">
          <button class="hubReact" data-hub-react="${p.id}:melody" aria-label="Melody strong">
            <span class="hubReactIcon" aria-hidden="true">♪</span>
            <span class="hubReactLabel">Melody</span>
            <span class="hubReactCount">${Number(p?.reacts?.melody || 0)}</span>
          </button>
          <button class="hubReact" data-hub-react="${p.id}:lyrics" aria-label="Lyrics strong">
            <span class="hubReactIcon" aria-hidden="true">✎</span>
            <span class="hubReactLabel">Lyrics</span>
            <span class="hubReactCount">${Number(p?.reacts?.lyrics || 0)}</span>
          </button>
          <button class="hubReact hubShare" data-hub-share="${p.id}" aria-label="Share this song">
            <span class="hubReactIcon" aria-hidden="true">➤</span>
            <span class="hubReactLabel">Share</span>
          </button>
        </div>
      </div>
      <div class="libMenu hubMoreMenu" id="hubMore_${p.id}" style="display:none">
        <button class="ghost" data-hub-remix="${p.id}">Remix</button>
        <button class="ghost" data-hub-del="${p.id}">Remove</button>
      </div>
    </div>
  `).join("");
  renderHubDots();
  renderHubUpdatedAt();
  els.hubList.querySelectorAll("[data-hub-play]").forEach((b) =>
    b.addEventListener("click", async (e) => {
      e.stopPropagation();
      const id = b.getAttribute("data-hub-play");
      const p = loadHubFeed().find((x) => x.id === id);
      if (!p?.url) return;
      if (hubAudioPostId === id && hubAudio && !hubAudio.paused) {
        stopHubPlayback();
        hubAutoplayMutedPostId = id;
        return;
      }
      hubAutoplayMutedPostId = null;
      await startHubPlayback(id);
    })
  );
  els.hubList.querySelectorAll("[data-hub-cover]").forEach((el) => {
    el.addEventListener("click", (e) => e.stopPropagation());
  });
  els.hubList.querySelectorAll("[data-hub-like]").forEach((b) => b.addEventListener("click", (e) => {
    e.stopPropagation();
    haptic("light");
    showLikeBurst();
    const id = b.getAttribute("data-hub-like");
    const feed = loadHubFeed();
    const p = feed.find((x) => x.id === id);
    if (!p) return;
    p.likes = Number(p.likes || 0) + 1;
    saveHubFeed(feed);
    void supabasePatchHub(id, { likes: p.likes }).catch(() => {});
    // Update the count in place so the burst animation has somewhere to
    // live — re-rendering the entire feed would destroy this button before
    // the heart can pulse.
    const countEl = b.querySelector(".hubLikeCount");
    if (countEl) countEl.textContent = String(p.likes);
    b.setAttribute("data-count", String(p.likes));
    triggerHubPulse(b);
    setStatus("Liked");
  }));
  els.hubList.querySelectorAll("[data-hub-react]").forEach((b) => b.addEventListener("click", (e) => {
    e.stopPropagation();
    haptic("light");
    const raw = b.getAttribute("data-hub-react") || "";
    const [id, key] = raw.split(":");
    const feed = loadHubFeed();
    const p = feed.find((x) => x.id === id);
    if (!p) return;
    p.reacts = p.reacts || { melody: 0, lyrics: 0, mix: 0, groove: 0 };
    if (!Object.prototype.hasOwnProperty.call(p.reacts, key)) return;
    p.reacts[key] = Number(p.reacts[key] || 0) + 1;
    saveHubFeed(feed);
    void supabasePatchHub(id, { reacts: p.reacts }).catch(() => {});
    const countEl = b.querySelector(".hubReactCount");
    if (countEl) countEl.textContent = String(p.reacts[key]);
    triggerHubPulse(b);
    const labels = {
      melody: "Melody strong",
      lyrics: "Lyrics strong",
    };
    setStatus(`${labels[key] || "Reaction"} +1`);
  }));
  els.hubList.querySelectorAll("[data-hub-share]").forEach((b) => b.addEventListener("click", async (e) => {
    e.stopPropagation();
    haptic("light");
    triggerHubPulse(b);
    const id = b.getAttribute("data-hub-share");
    const p = loadHubFeed().find((x) => x.id === id);
    if (!p) return;
    await shareHubPost(p);
  }));
  els.hubList.querySelectorAll("[data-hub-remix]").forEach((b) => b.addEventListener("click", (e) => {
    e.stopPropagation();
    const id = b.getAttribute("data-hub-remix");
    const p = loadHubFeed().find((x) => x.id === id);
    if (!p) return;
    if (els.sunoPrompt) els.sunoPrompt.value = String(p?.meta?.lyricsInput || "").trim();
    if (els.sunoStyle) els.sunoStyle.value = String(p?.meta?.styleInput || "").trim();
    if (els.sunoTitle) els.sunoTitle.value = `${p.title} Remix`;
    location.hash = "#/generate";
    setStatus(`Remix seed loaded from Hub: ${p.title}`);
    syncGenerateOrbVisibility();
  }));
  els.hubList.querySelectorAll("[data-hub-user]").forEach((u) => u.addEventListener("click", (e) => {
    e.stopPropagation();
    const id = u.getAttribute("data-hub-user");
    const p = loadHubFeed().find((x) => x.id === id);
    const username = String(p?.creator || "").trim();
    if (!username) return;
    location.hash = `#/u/${encodeURIComponent(username)}`;
  }));
  els.hubList.querySelectorAll(".hubProofChip").forEach((chip) => chip.addEventListener("click", (e) => {
    e.stopPropagation();
    const row = chip.closest("[data-hub-row]");
    const id = row?.getAttribute("data-hub-row");
    const p = loadHubFeed().find((x) => x.id === id);
    if (!p) return;
    openProofModal(p);
  }));
  els.hubList.querySelectorAll("[data-hub-more]").forEach((b) => b.addEventListener("click", (e) => {
    e.stopPropagation();
    const id = b.getAttribute("data-hub-more");
    const menu = document.getElementById(`hubMore_${id}`);
    const open = menu && menu.style.display !== "none";
    els.hubList.querySelectorAll(".hubMoreMenu").forEach((m) => (m.style.display = "none"));
    if (menu) menu.style.display = open ? "none" : "";
  }));
  if (hubAudioPostId && hubAudio && !hubAudio.paused) {
    const btn = els.hubList.querySelector(`[data-hub-play="${hubAudioPostId}"]`);
    if (btn) {
      btn.textContent = "■";
      btn.closest(".hubCoverWrap")?.classList.add("isPlaying");
    }
  }
  // Reset cached focused id so updateHubFocusedRow re-evaluates against the
  // freshly rendered DOM (otherwise a stale id == previous id check would
  // skip toggling on the new elements).
  hubFocusedPostId = null;
  requestAnimationFrame(() => updateHubFocusedRow());
  setTimeout(() => scheduleHubViewportAutoplay(), 40);
  preloadInitialHubTracks();
  updateHubAudioHint();
}
if (els.hubList) {
  els.hubList.addEventListener("click", async (e) => {
    const btn = e.target?.closest?.("[data-hub-del]");
    if (!btn) return;
    e.stopPropagation();
    const id = btn.getAttribute("data-hub-del");
    const feed = loadHubFeed();
    const post = feed.find((x) => x.id === id);
    if (!post) return;
    const ok = window.confirm("Remove this post from Hub?");
    if (!ok) return;
    const next = feed.filter((x) => x.id !== id);
    saveHubFeed(next);
    renderHub();
    try {
      await supabaseDeleteHub(id);
      setStatus("Post removed from Hub.");
      await refreshHubFromSupabase();
    } catch {
      setStatus("Post removed locally. Cloud delete failed.");
    }
  });
}
async function refreshHubFromSupabase() {
  if (hubSyncInFlight) return;
  hubSyncInFlight = true;
  try {
    const rows = await supabaseSelectHub();
    if (!rows || !Array.isArray(rows)) return;
    hubLastSyncOk = true;
    hubLastSyncError = "";
    hubLastSyncRows = rows.length;
    hubRetryCount = 0;
    const prev = loadHubFeed();
    const mapped = rows.map((r) => ({
      id: String(r.id),
      ts: new Date(r.created_at).getTime(),
      title: r.title || "Untitled",
      artUrl: r.cover_url || "",
      url: r.song_url || "",
      kind: r.kind || "full",
      creator: r.creator_username || "guest",
      creatorAvatar: r.creator_avatar || "./assets/nabadai-logo.png",
      likes: Number(r.likes || 0),
      reacts: r.reacts || { melody: 0, lyrics: 0, mix: 0, groove: 0 },
      remixOf: r.remix_of || "",
      proof: r.proof || null,
      meta: r.meta || null,
    }));
    // Never wipe feed on empty cloud response.
    if (!mapped.length && prev.length) {
      renderHub();
      renderHubDots();
      return;
    }
    const byId = new Map();
    prev.forEach((p) => byId.set(String(p.id), p));
    mapped.forEach((p) => byId.set(String(p.id), p));
    const merged = Array.from(byId.values()).sort((a, b) => Number(b.ts || 0) - Number(a.ts || 0)).slice(0, 300);
    saveHubFeed(merged);
    lastHubUpdateAt = merged.length ? Math.max(...merged.map((x) => Number(x.ts || 0))) : 0;
    renderHub();
    renderHubDots();
    renderProfileHubShared();
    // If we're currently viewing a public profile, re-render so freshly
    // synced posts (or a cold-load via share link) show up immediately.
    if (document.body.getAttribute("data-route") === "user") {
      const h = String(location.hash || "");
      const m = h.match(/^#\/u\/([^?#]+)/);
      if (m) renderUserProfile(decodeURIComponent(m[1]));
    }
  } catch (e) {
    hubLastSyncOk = false;
    hubRetryCount += 1;
    hubLastSyncError = e?.name === "AbortError"
      ? "timeout, retrying…"
      : (e?.message ? String(e.message).slice(0, 100) : "unknown");
    renderHubUpdatedAt();
    const backoff = Math.min(8000, 1500 * Math.max(1, hubRetryCount));
    setTimeout(async () => {
      try {
        if (hubSyncInFlight) return;
        hubSyncInFlight = true;
        const rows = await supabaseSelectHub();
        if (!rows || !Array.isArray(rows)) return;
        const mapped = rows.map((r) => ({
          id: String(r.id),
          ts: new Date(r.created_at).getTime(),
          title: r.title || "Untitled",
          artUrl: r.cover_url || "",
          url: r.song_url || "",
          kind: r.kind || "full",
          creator: r.creator_username || "guest",
          creatorAvatar: r.creator_avatar || "./assets/nabadai-logo.png",
          likes: Number(r.likes || 0),
          reacts: r.reacts || { melody: 0, lyrics: 0, mix: 0, groove: 0 },
          remixOf: r.remix_of || "",
          proof: r.proof || null,
          meta: r.meta || null,
        }));
        if (!mapped.length) return;
        hubLastSyncOk = true;
        hubLastSyncError = "";
        hubLastSyncRows = rows.length;
        hubRetryCount = 0;
        saveHubFeed(mapped);
        lastHubUpdateAt = Math.max(...mapped.map((x) => Number(x.ts || 0)));
        renderHub();
        renderHubDots();
        renderProfileHubShared();
      } catch {} finally {
        hubSyncInFlight = false;
      }
    }, backoff);
  } finally {
    hubSyncInFlight = false;
  }
}
function startHubLiveSync() {
  if (hubSyncTimer) clearInterval(hubSyncTimer);
  // Always keep Hub fresh for guest + logged users.
  const isMobile = window.matchMedia?.("(max-width: 720px)")?.matches;
  const interval = isMobile ? 28000 : 15000;
  hubSyncTimer = setInterval(() => {
    void refreshHubFromSupabase();
  }, interval);
}
function profilePersonasKey() {
  return `${PROFILE_PERSONAS_KEY}:${activeProfile.id || "guest"}`;
}
function loadPersonas() {
  try {
    const raw = localStorage.getItem(profilePersonasKey());
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}
function savePersonas(items) {
  try {
    localStorage.setItem(profilePersonasKey(), JSON.stringify(items || []));
  } catch {}
}
function renderPersonaSelect() {
  if (!els.sunoPersonaId) return;
  const list = loadPersonas();
  const current = String(els.sunoPersonaId.value || "");
  const opts = ['<option value="">None (default voice)</option>']
    .concat(
      list.map(
        (p) =>
          `<option value="${escapeHtml(String(p.personaId || ""))}">${escapeHtml(
            String(p.label || p.personaId || "Persona")
          )}</option>`
      )
    )
    .join("");
  els.sunoPersonaId.innerHTML = opts;
  if (current && list.some((x) => String(x.personaId) === current)) els.sunoPersonaId.value = current;
}
function addPersona(personaId, label) {
  const items = loadPersonas();
  if (items.some((x) => String(x.personaId) === String(personaId))) return;
  items.unshift({
    personaId: String(personaId),
    label: label || `Persona ${items.length + 1}`,
    ts: Date.now(),
  });
  savePersonas(items.slice(0, 20));
  renderPersonaSelect();
}

let profileEditing = false;

function setProfileEditing(on) {
  profileEditing = Boolean(on);
  if (els.profilePreviewUsernameInput) els.profilePreviewUsernameInput.disabled = !profileEditing;
  if (els.profilePreviewTimbreInput) els.profilePreviewTimbreInput.disabled = !profileEditing;
  if (els.profilePreviewBioInput) els.profilePreviewBioInput.disabled = !profileEditing;
  if (els.btnProfileEdit) els.btnProfileEdit.style.display = profileEditing ? "none" : "";
  if (els.btnProfileCancel) els.btnProfileCancel.style.display = profileEditing ? "" : "none";
  if (els.btnProfileSave) els.btnProfileSave.style.display = profileEditing ? "" : "none";
  const hint = document.getElementById("profileAvatarEditHint");
  if (hint) hint.style.display = profileEditing ? "" : "none";
}

function restoreProfileInputsFromActive() {
  if (els.profilePreviewUsernameInput) els.profilePreviewUsernameInput.value = activeProfile.username ? `@${activeProfile.username}` : "@guest";
  if (els.profilePreviewTimbreInput) els.profilePreviewTimbreInput.value = activeProfile.voiceTimbre || "";
  if (els.profilePreviewBioInput) els.profilePreviewBioInput.value = activeProfile.bio || "";
  renderProfilePreviewFromInputs();
}

function renderProfileOwnStats() {
  if (!els.profileOwnStats) return;
  const creator = String(activeProfile.username || "guest");
  const uid = String(authSession?.user?.id || "");
  const items = loadHubFeed().filter((p) =>
    uid ? String(p?.meta?.creatorUserId || "") === uid : String(p?.creator || "") === creator,
  );
  const totalLikes = items.reduce((sum, p) => sum + Number(p.likes || 0), 0);
  if (els.profileOwnSongCount) els.profileOwnSongCount.textContent = items.length ? String(items.length) : "";
  if (!items.length) {
    els.profileOwnStats.innerHTML = "";
    els.profileOwnStats.style.display = "none";
    return;
  }
  els.profileOwnStats.style.display = "";
  els.profileOwnStats.innerHTML = `
    <span><strong>${items.length}</strong> song${items.length === 1 ? "" : "s"}</span>
    <span aria-hidden="true">·</span>
    <span><strong>${totalLikes}</strong> like${totalLikes === 1 ? "" : "s"}</span>
  `;
}

function renderProfilePreviewFromInputs() {
  const usernameRaw = String(els.profilePreviewUsernameInput?.value || "").trim().toLowerCase();
  const username = usernameRaw ? `@${usernameRaw.replace(/^@/, "")}` : "@guest";
  const voiceTimbre = String(els.profilePreviewTimbreInput?.value || "").trim();
  const bio = String(els.profilePreviewBioInput?.value || "").trim() || "Add a short bio to introduce your music style.";
  const genres = String(activeProfile.genres || "").trim();
  const isPublic = Boolean(els.profileIsPublic?.checked);

  if (els.profilePreviewUsernameInput) els.profilePreviewUsernameInput.value = username;
  if (els.profilePreviewGenderIcon) els.profilePreviewGenderIcon.style.display = "none";
  if (els.profilePreviewTimbreInput) els.profilePreviewTimbreInput.value = voiceTimbre;
  if (els.profilePreviewBioInput) els.profilePreviewBioInput.value = bio;
  if (els.profilePreviewBioInput) {
    els.profilePreviewBioInput.style.height = "auto";
    const h = Math.max(54, Math.min(132, els.profilePreviewBioInput.scrollHeight || 54));
    els.profilePreviewBioInput.style.height = `${h}px`;
  }
  if (els.profilePreviewGenres) {
    if (genres) {
      els.profilePreviewGenres.textContent = `Genres: ${genres}`;
      els.profilePreviewGenres.style.display = "";
    } else {
      els.profilePreviewGenres.textContent = "";
      els.profilePreviewGenres.style.display = "none";
    }
  }
  if (els.profilePreviewAvatar) {
    els.profilePreviewAvatar.src = activeProfile.avatar || "./assets/nabadai-logo.png";
  }
  renderProfileOwnStats();
}

/** Public-facing profile aggregated from this user's Hub posts. We use the
 * Hub feed as the source of truth (no separate "users" table yet) — this
 * keeps the route purely client-side and means a creator's bio / voice /
 * avatar reflects whatever was in their most recent post's meta. */
function renderUserProfile(rawUsername) {
  const username = String(rawUsername || "").replace(/^@/, "").trim();
  if (!els.userPublicName) return;
  const feed = loadHubFeed();
  // Compare case-insensitively but render the username with the casing
  // from the actual posts so it looks like the creator's chosen handle.
  const matches = feed.filter((p) =>
    String(p?.creator || "").toLowerCase() === username.toLowerCase());
  matches.sort((a, b) => Number(b.ts || 0) - Number(a.ts || 0));
  const latest = matches[0];
  const displayName = latest?.creator || username || "user";

  if (els.userPublicName) els.userPublicName.textContent = `@${displayName}`;
  if (els.userPublicAvatar) {
    els.userPublicAvatar.src = latest?.creatorAvatar || "./assets/nabadai-logo.png";
    els.userPublicAvatar.alt = `${displayName} avatar`;
  }
  if (els.userPublicVoice) {
    const voice = String(latest?.meta?.voiceTimbre || "").trim();
    if (voice) {
      const pretty = voice
        .replace(/_/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase());
      els.userPublicVoice.textContent = `Voice · ${pretty}`;
      els.userPublicVoice.style.display = "";
    } else {
      els.userPublicVoice.textContent = "";
      els.userPublicVoice.style.display = "none";
    }
  }
  if (els.userPublicBio) {
    const bio = String(latest?.meta?.bio || "").trim();
    if (bio) {
      els.userPublicBio.textContent = bio;
      els.userPublicBio.style.display = "";
    } else {
      els.userPublicBio.textContent = "";
      els.userPublicBio.style.display = "none";
    }
  }

  const totalLikes = matches.reduce((sum, p) => sum + Number(p.likes || 0), 0);
  if (els.userPublicStats) {
    if (matches.length) {
      els.userPublicStats.innerHTML = `
        <span><strong>${matches.length}</strong> song${matches.length === 1 ? "" : "s"}</span>
        <span aria-hidden="true">·</span>
        <span><strong>${totalLikes}</strong> like${totalLikes === 1 ? "" : "s"}</span>
      `;
      els.userPublicStats.style.display = "";
    } else {
      els.userPublicStats.style.display = "none";
    }
  }
  if (els.userPublicSongsCount) {
    els.userPublicSongsCount.textContent = matches.length ? String(matches.length) : "";
  }

  if (!matches.length) {
    if (els.userPublicSongs) els.userPublicSongs.innerHTML = "";
    if (els.userPublicEmpty) {
      els.userPublicEmpty.textContent = username
        ? `No public songs from @${displayName} yet.`
        : "User not found.";
      els.userPublicEmpty.style.display = "";
    }
    return;
  }
  if (els.userPublicEmpty) els.userPublicEmpty.style.display = "none";

  if (els.userPublicSongs) {
    els.userPublicSongs.innerHTML = matches.slice(0, 60).map((p) => `
      <button class="userPublicSong" data-user-song="${escapeHtml(p.id)}" type="button">
        <img class="userPublicSongCover" src="${escapeHtml(p.artUrl || p.creatorAvatar || "./assets/nabadai-logo.png")}" alt="" />
        <div class="userPublicSongMeta">
          <div class="userPublicSongTitle">${escapeHtml(p.title || "Untitled")}</div>
          <div class="userPublicSongTiny">${escapeHtml(relativeTime(p.ts))} · ❤ ${Number(p.likes || 0)}</div>
        </div>
        <span class="userPublicSongPlay" aria-hidden="true">▶</span>
      </button>
    `).join("");
    els.userPublicSongs.querySelectorAll("[data-user-song]").forEach((b) => {
      b.addEventListener("click", () => {
        const sid = b.getAttribute("data-user-song");
        if (!sid) return;
        location.hash = `#/hub?post=${encodeURIComponent(sid)}`;
      });
    });
  }
}

function renderProfileHubShared() {
  if (!els.profileHubSharedList) return;
  const creator = String(activeProfile.username || "guest");
  const uid = String(authSession?.user?.id || "");
  const items = loadHubFeed()
    .filter((p) => (uid ? String(p?.meta?.creatorUserId || "") === uid : String(p?.creator || "") === creator))
    .slice(0, 30);
  renderProfileOwnStats();
  if (!items.length) {
    els.profileHubSharedList.innerHTML = `<div class="profileOwnEmpty">No songs on Hub yet. Share from Library or Player.</div>`;
    return;
  }
  els.profileHubSharedList.innerHTML = items.map((p) => `
    <button type="button" class="profileOwnSong" data-profile-hub-open="${escapeHtml(String(p.id))}">
      <img class="profileOwnSongCover" src="${escapeHtml(p.artUrl || p.creatorAvatar || "./assets/nabadai-logo.png")}" alt="" />
      <div class="profileOwnSongMeta">
        <div class="profileOwnSongTitle">${escapeHtml(String(p.title || "Untitled"))}</div>
        <div class="profileOwnSongTiny">${escapeHtml(relativeTime(p.ts))} · ❤ ${Number(p.likes || 0)}</div>
      </div>
      <span class="profileOwnSongChev" aria-hidden="true">›</span>
    </button>
  `).join("");
  els.profileHubSharedList.querySelectorAll("[data-profile-hub-open]").forEach((b) => {
    b.addEventListener("click", () => {
      const sid = b.getAttribute("data-profile-hub-open");
      if (!sid) return;
      location.hash = `#/hub?post=${encodeURIComponent(sid)}`;
    });
  });
}

function loadLibrary() {
  try {
    const raw = localStorage.getItem(profileLibraryKey());
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}
function loadLibraryFor(id) {
  try {
    const raw = localStorage.getItem(profileLibraryKeyFor(id));
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}
function listAllLocalLibraryKeys() {
  const out = [];
  try {
    for (let i = 0; i < localStorage.length; i += 1) {
      const k = String(localStorage.key(i) || "");
      if (
        k.startsWith("mas:library:v1:") ||
        k.startsWith("mas:library:") ||
        k === "mas:library" ||
        k === "library" ||
        k === "songs" ||
        k.toLowerCase().includes("library")
      ) out.push(k);
    }
  } catch {}
  return out;
}
function looksLikeTrackRow(row) {
  if (!row || typeof row !== "object") return false;
  const hasTitle = typeof row.title === "string" && row.title.trim().length > 0;
  const hasUrl = typeof row.url === "string" && row.url.trim().length > 0;
  const hasSongUrl = typeof row.song_url === "string" && row.song_url.trim().length > 0;
  const hasArt = typeof row.artUrl === "string" || typeof row.art_url === "string";
  return (hasTitle && (hasUrl || hasSongUrl)) || (hasUrl && hasArt) || (hasSongUrl && hasArt);
}
function normalizeTrackRow(row) {
  const url = String(row?.url || row?.song_url || "").trim();
  return {
    id: String(row?.id || `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`),
    ts: Number(row?.ts || (row?.created_at ? new Date(row.created_at).getTime() : Date.now())),
    title: String(row?.title || "Generated song"),
    artUrl: String(row?.artUrl || row?.art_url || ""),
    url,
    taskId: String(row?.taskId || row?.task_id || ""),
    audioId: String(row?.audioId || row?.audio_id || ""),
    kind: String(row?.kind || "full"),
    meta: row?.meta || null,
  };
}
function loadAllLocalSongsDeduped() {
  const merged = [];
  const seen = new Set();
  const keys = listAllLocalLibraryKeys();
  for (const key of keys) {
    let rows = [];
    try {
      const raw = localStorage.getItem(key);
      const arr = raw ? JSON.parse(raw) : [];
      rows = Array.isArray(arr) ? arr : [];
    } catch {}
    for (const rawRow of rows) {
      if (!looksLikeTrackRow(rawRow)) continue;
      const row = normalizeTrackRow(rawRow);
      const url = String(row?.url || "").trim();
      const aid = String(row?.audioId || "").trim();
      const kind = String(row?.kind || "full").trim();
      const sig = `${url}|${aid}|${kind}`;
      if (seen.has(sig)) continue;
      seen.add(sig);
      merged.push(row);
    }
  }
  // Deep fallback: inspect every localStorage value for track-like arrays.
  try {
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = String(localStorage.key(i) || "");
      if (keys.includes(key)) continue;
      const raw = localStorage.getItem(key);
      if (!raw || raw[0] !== "[") continue;
      let arr = [];
      try { arr = JSON.parse(raw); } catch {}
      if (!Array.isArray(arr) || !arr.length) continue;
      for (const rawRow of arr) {
        if (!looksLikeTrackRow(rawRow)) continue;
        const row = normalizeTrackRow(rawRow);
        const url = String(row?.url || "").trim();
        const aid = String(row?.audioId || "").trim();
        const kind = String(row?.kind || "full").trim();
        const sig = `${url}|${aid}|${kind}`;
        if (seen.has(sig)) continue;
        seen.add(sig);
        merged.push(row);
      }
    }
  } catch {}
  return merged.sort((a, b) => Number(b?.ts || 0) - Number(a?.ts || 0));
}
function saveLibrary(items) {
  try {
    localStorage.setItem(profileLibraryKey(), JSON.stringify(items || []));
  } catch {}
}
function patchLibraryTrack(id, patch) {
  if (!id) return;
  const items = loadLibrary();
  const idx = items.findIndex((x) => String(x.id) === String(id));
  if (idx < 0) return;
  items[idx] = { ...items[idx], ...patch, ts: Date.now() };
  saveLibrary(items);
  renderLibrary();
}
async function syncHubCoverForTrack(track, coverUrl) {
  const title = String(track?.title || "").trim();
  const url = String(track?.url || "").trim();
  if (!coverUrl || (!title && !url)) return;
  const feed = loadHubFeed();
  const matches = feed.filter((p) => {
    const sameUrl = url && String(p?.url || "").trim() === url;
    const sameTitle = title && String(p?.title || "").trim() === title;
    return sameUrl || sameTitle;
  });
  if (!matches.length) return;
  matches.forEach((p) => { p.artUrl = coverUrl; });
  saveHubFeed(feed);
  if ((document.body.getAttribute("data-route") || "") === "hub") renderHub();
  await Promise.all(
    matches.map((p) =>
      supabasePatchHub(p.id, { cover_url: coverUrl }).catch(() => null)
    )
  );
}
function saveLibraryFor(id, items) {
  try {
    localStorage.setItem(profileLibraryKeyFor(id), JSON.stringify(items || []));
  } catch {}
}

async function ensureUserLibraryHydrated() {
  if (!authSession?.user?.id) return;
  const uid = String(authSession.user.id);

  // 1) Load cloud + local candidates and merge-dedupe.
  const cloudSongs = await supabaseLoadUserSongs();
  const guestSongs = loadLibraryFor("guest");
  const allLocalSongs = loadAllLocalSongsDeduped();
  const localCandidates = guestSongs.length ? guestSongs : allLocalSongs;

  const merged = [];
  const seen = new Set();
  const addMerged = (row) => {
    const url = String(row?.url || "").trim();
    const aid = String(row?.audioId || "").trim();
    const kind = String(row?.kind || "full").trim();
    const sig = `${url}|${aid}|${kind}`;
    if (seen.has(sig)) return;
    seen.add(sig);
    merged.push(row);
  };
  cloudSongs.forEach(addMerged);
  localCandidates.forEach(addMerged);
  merged.sort((a, b) => Number(b?.ts || 0) - Number(a?.ts || 0));

  if (!merged.length) {
    if (String(activeProfile.id) === uid) renderLibrary();
    return;
  }

  // 2) Upsert merged local tracks to cloud (best effort), then reload cloud.
  let okCount = 0;
  let failCount = 0;
  let firstFail = "";
  for (const t of merged) {
    // Best effort; ignore individual failures.
    // eslint-disable-next-line no-await-in-loop
    const ins = await supabaseInsertUserSong(t);
    if (ins?.ok) okCount += 1;
    else {
      failCount += 1;
      if (!firstFail) firstFail = `${ins?.reason || "insert_failed"}${ins?.details ? `: ${ins.details}` : ""}`;
    }
  }
  const cloudAfter = await supabaseLoadUserSongs();
  const finalSongs = cloudAfter.length ? cloudAfter : merged;
  saveLibraryFor(uid, finalSongs);
  if (String(activeProfile.id) === uid) {
    saveLibrary(finalSongs);
    renderLibrary();
    if (failCount > 0) {
      setStatus(`Library sync partial: ${okCount} saved, ${failCount} failed (${firstFail.slice(0, 90)})`);
    } else {
      setStatus(`Library sync complete: ${okCount} saved to cloud.`);
    }
  }
}
function addToLibrary(track) {
  const items = loadLibrary();
  const url = String(track.url || "").trim();
  const audioId = String(track.audioId || "").trim();
  const kind = String(track.kind || "full").trim();
  const duplicate = items.some((x) =>
    (url && String(x.url || "").trim() === url) ||
    (audioId && String(x.audioId || "").trim() === audioId && String(x.kind || "full").trim() === kind)
  );
  if (duplicate) return;
  const newTrack = {
    id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    ts: Date.now(),
    title: track.title || "Generated song",
    artUrl: track.artUrl || "",
    url: track.url || "",
    taskId: track.taskId || "",
    audioId: track.audioId || "",
    kind: track.kind || "full",
    meta: track.meta || null,
  };
  items.unshift(newTrack);
  saveLibrary(items.slice(0, 100));
  renderLibrary();
  void supabaseInsertUserSong(newTrack);
}
function removeFromLibrary(id) {
  const prev = loadLibrary();
  const removed = prev.find((x) => x.id === id);
  const items = prev.filter((x) => x.id !== id);
  saveLibrary(items);
  renderLibrary();
  if (removed) void supabaseDeleteUserSong(removed);
}
async function downloadLibraryVideoTrack(track) {
  const url = String(track?.url || "").trim();
  if (!url) throw new Error("Missing audio URL");
  const artSrc = String((track?.meta && track.meta.imageUrl) || track?.artUrl || "./assets/nabadai-logo.png");
  const audio = new Audio(url);
  audio.crossOrigin = "anonymous";
  await new Promise((resolve, reject) => {
    audio.addEventListener("loadedmetadata", resolve, { once: true });
    audio.addEventListener("error", () => reject(new Error("Audio load failed")), { once: true });
  });
  const duration = Math.max(1, Math.min(600, Number(audio.duration) || 1));
  const img = new Image();
  img.crossOrigin = "anonymous";
  await new Promise((resolve, reject) => {
    img.onload = resolve;
    img.onerror = () => reject(new Error("Artwork load failed"));
    img.src = artSrc;
  });
  const canvas = document.createElement("canvas");
  canvas.width = 720;
  canvas.height = 720;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas unavailable");
  const draw = () => {
    ctx.fillStyle = "#0b0d12";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const ratio = Math.max(canvas.width / img.width, canvas.height / img.height);
    const w = img.width * ratio;
    const h = img.height * ratio;
    const x = (canvas.width - w) / 2;
    const y = (canvas.height - h) / 2;
    ctx.drawImage(img, x, y, w, h);
  };
  draw();
  const vStream = canvas.captureStream(30);
  const ac = new (window.AudioContext || window.webkitAudioContext)();
  const src = ac.createMediaElementSource(audio);
  const dest = ac.createMediaStreamDestination();
  src.connect(dest);
  src.connect(ac.destination);
  const out = new MediaStream([...vStream.getVideoTracks(), ...dest.stream.getAudioTracks()]);
  const mime = MediaRecorder.isTypeSupported("video/webm;codecs=vp9,opus")
    ? "video/webm;codecs=vp9,opus"
    : "video/webm;codecs=vp8,opus";
  const rec = new MediaRecorder(out, { mimeType: mime });
  const chunks = [];
  rec.ondataavailable = (e) => { if (e.data?.size) chunks.push(e.data); };
  await ac.resume().catch(() => {});
  rec.start(500);
  await audio.play();
  await new Promise((resolve) => {
    audio.addEventListener("ended", resolve, { once: true });
    setTimeout(resolve, duration * 1000 + 1200);
  });
  if (rec.state !== "inactive") rec.stop();
  await new Promise((resolve) => rec.addEventListener("stop", resolve, { once: true }));
  src.disconnect();
  dest.disconnect();
  ac.close().catch(() => {});
  const blob = new Blob(chunks, { type: "video/webm" });
  const dl = document.createElement("a");
  dl.href = URL.createObjectURL(blob);
  dl.download = `${String(track?.title || "song").replace(/[^\w\- ]+/g, "").trim() || "song"}.webm`;
  document.body.appendChild(dl);
  dl.click();
  dl.remove();
  setTimeout(() => URL.revokeObjectURL(dl.href), 4000);
}
async function pollLibraryStemsUntilDone(taskId, kind) {
  let tries = 0;
  const maxTries = kind === "multi" ? 80 : 60;
  const delayMs = kind === "multi" ? 5000 : 4500;
  while (tries < maxTries) {
    tries += 1;
    await new Promise((r) => setTimeout(r, delayMs));
    try {
      const r = await fetch(`/api/suno/stems_status?taskId=${encodeURIComponent(taskId)}`);
      const data = await r.json().catch(() => ({}));
      if (!r.ok) continue;
      const flag =
        data?.data?.successFlag ||
        data?.data?.status ||
        data?.successFlag ||
        data?.status ||
        "";
      const resp = data?.data?.response || data?.response || data || {};
      if (String(flag).toUpperCase() === "SUCCESS") {
        if (kind === "multi") {
          printSunoStems(resp);
          if (els.btnMixerLoad) els.btnMixerLoad.disabled = false;
          setStatus("Multi-stems are ready. Load stems into mixer.");
        } else {
          lastSunoVocalUrl = resp.vocalUrl || "";
          lastSunoInstUrl = resp.instrumentalUrl || "";
          lastSunoInstProxyUrl = lastSunoInstUrl ? toAudioProxyUrl(lastSunoInstUrl) : "";
          setLink(els.sunoVocalLink, lastSunoVocalUrl || null);
          setLink(els.sunoInstLink, lastSunoInstProxyUrl || lastSunoInstUrl || null);
          if (els.btnLoadInstrumental) els.btnLoadInstrumental.disabled = !lastSunoInstUrl;
          if (els.btnPlayInstrumental) els.btnPlayInstrumental.disabled = !lastSunoInstUrl;
          setStatus("Instrumental version is ready.");
          if (lastSunoInstUrl) {
            addToLibrary({
              title: `${lastSunoTitle || "Generated song"} • Instrumental`,
              artUrl: lastSunoArtUrl || "",
              url: lastSunoInstProxyUrl || lastSunoInstUrl,
              kind: "instrumental",
            });
          }
        }
        setLoading(false);
        return;
      }
      if (String(flag).toUpperCase() === "FAILED") {
        setStatus(`${kind === "multi" ? "Multi-stems" : "Instrumental"} failed.`);
        setLoading(false);
        return;
      }
    } catch {}
  }
  setStatus(`${kind === "multi" ? "Multi-stems" : "Instrumental"} is delayed. Please try again.`);
  setLoading(false);
}
function renderLibrary() {
  if (!els.libraryList) return;
  const items = loadLibrary();
  if (!items.length) {
    els.libraryList.textContent = "No songs yet. Generate a song and it will appear here.";
    return;
  }
  els.libraryList.innerHTML = `
    <div class="libraryGrid">
      ${items.map((t) => `
        <div class="libTile libRow ${libraryNowPlayingId === t.id ? "libTilePlaying" : ""}" data-lib-row="${t.id}">
          <img class="libTileArt" src="${escapeHtml(String((t.meta && t.meta.imageUrl) || t.artUrl || "./assets/nabadai-logo.png"))}" alt="${escapeHtml(t.title || "Song artwork")}" />
          <button class="libTilePlay" data-lib-play="${t.id}" aria-label="Play">▶</button>
          <button class="libTileMenuBtn" data-lib-menu="${t.id}" aria-label="Song options">⋯</button>
          <div class="libTileShade">
            <div class="libTileTitle">${escapeHtml(t.title || "Generated song")}</div>
            <div class="libTileMeta">${new Date(t.ts).toLocaleDateString()}</div>
          </div>
          <div class="libMenu" id="libMenu_${t.id}" style="display:none">
            <a class="ghost" href="${t.url}" target="_blank" rel="noreferrer" data-lib-dlaudio="${t.id}">Download audio</a>
            <button class="ghost" data-lib-dlvideo="${t.id}">Download video</button>
            <button class="ghost" data-lib-share="${t.id}">Share to Hub</button>
            <button class="ghost" data-lib-details="${t.id}">Song details</button>
            ${t.kind === "instrumental" ? "" : `<button class="ghost" data-lib-inst="${t.id}">Get instrumental</button>`}
            ${t.kind === "instrumental" ? "" : `<button class="ghost" data-lib-stems="${t.id}">Get stems</button>`}
            <button class="ghost" data-lib-del="${t.id}">Delete</button>
          </div>
        </div>
      `).join("")}
    </div>
  `;
  els.libraryList.querySelectorAll("[data-lib-play]").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const id = btn.getAttribute("data-lib-play");
      const t = loadLibrary().find((x) => x.id === id);
      if (!t?.url) return;
      currentPlayerTrackRef = t;
      setPlayerMeta({
        title: t.title || "Library song",
        subtitle: "Library • Full song",
        artUrl: (t.meta && t.meta.imageUrl) || placeholderCoverDataUrl(),
      });
      miniSource = { type: "library", id };
      libraryNowPlayingId = id;
      renderLibrary();
      await playOnPlayerPage(t.url, "Full song", {
        title: t.title || "Library song",
        subtitle: "Library • Full song",
        artUrl: (t.meta && t.meta.imageUrl) || t.artUrl || placeholderCoverDataUrl(),
      });
    });
  });
  els.libraryList.querySelectorAll("[data-lib-row]").forEach((row) => {
    row.addEventListener("click", async (e) => {
      const tgt = e.target;
      if (tgt && (tgt.closest("[data-lib-menu]") || tgt.closest(".libMenu"))) return;
      const id = row.getAttribute("data-lib-row");
      const t = loadLibrary().find((x) => x.id === id);
      if (!t?.url) return;
      currentPlayerTrackRef = t;
      setPlayerMeta({
        title: t.title || "Library song",
        subtitle: "Library • Full song",
        artUrl: (t.meta && t.meta.imageUrl) || placeholderCoverDataUrl(),
      });
      miniSource = { type: "library", id };
      libraryNowPlayingId = id;
      renderLibrary();
      await playOnPlayerPage(t.url, "Full song", {
        title: t.title || "Library song",
        subtitle: "Library • Full song",
        artUrl: (t.meta && t.meta.imageUrl) || t.artUrl || placeholderCoverDataUrl(),
      });
    });
  });
  els.libraryList.querySelectorAll("[data-lib-menu]").forEach((b) => {
    b.addEventListener("click", (e) => {
      e.stopPropagation();
      const id = b.getAttribute("data-lib-menu");
      const menu = document.getElementById(`libMenu_${id}`);
      const open = menu && menu.style.display !== "none";
      els.libraryList.querySelectorAll(".libMenu").forEach((m) => (m.style.display = "none"));
      if (menu) menu.style.display = open ? "none" : "";
    });
  });
  els.libraryList.querySelectorAll("[data-lib-del]").forEach((b) => {
    b.addEventListener("click", (e) => e.stopPropagation());
    b.addEventListener("click", () => removeFromLibrary(b.getAttribute("data-lib-del")));
  });
  els.libraryList.querySelectorAll("[data-lib-details]").forEach((b) => {
    b.addEventListener("click", (e) => e.stopPropagation());
    b.addEventListener("click", () => {
      const id = b.getAttribute("data-lib-details");
      const t = loadLibrary().find((x) => x.id === id);
      if (!t) return;
      const details = {
        title: t.title,
        createdAt: new Date(t.ts).toLocaleString(),
        taskId: t.taskId || "",
        audioId: t.audioId || "",
        kind: t.kind || "",
        ...(t.meta || {}),
      };
      openSongDetailsModal(details);
    });
  });
  els.libraryList.querySelectorAll("[data-lib-share]").forEach((b) => {
    b.addEventListener("click", (e) => e.stopPropagation());
    b.addEventListener("click", () => {
      const id = b.getAttribute("data-lib-share");
      const t = loadLibrary().find((x) => x.id === id);
      if (!t) return;
      shareToHub(t);
      openShareLiveModal(t.title || "Your song");
      setStatus("Shared to Hub.");
    });
  });
  els.libraryList.querySelectorAll("[data-lib-dlvideo]").forEach((b) => {
    b.addEventListener("click", async (e) => {
      e.stopPropagation();
      const id = b.getAttribute("data-lib-dlvideo");
      const t = loadLibrary().find((x) => x.id === id);
      if (!t) return;
      try {
        setStatus("Preparing video download…");
        await downloadLibraryVideoTrack(t);
        setStatus("Video download is ready.");
      } catch (err) {
        setStatus(`Video download failed: ${err?.message || String(err)}`);
      }
    });
  });
  els.libraryList.querySelectorAll("[data-lib-inst]").forEach((b) => {
    b.addEventListener("click", async (e) => {
      e.stopPropagation();
      const id = b.getAttribute("data-lib-inst");
      const t = loadLibrary().find((x) => x.id === id);
      if (!t?.taskId || !t?.audioId) {
        setStatus("This song is missing generation ids for instrumental request.");
        return;
      }
      try {
        setStatus("Getting instrumental for selected song…");
        setLoading(true, { title: "Getting your instrumental version…", sub: "Processing selected library song." });
        const r = await fetch(apiUrl("/api/suno/stems"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ taskId: t.taskId, audioId: t.audioId, type: "separate_vocal" }),
        });
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(d?.error || "Instrumental request failed");
        sunoStemsTaskId = d?.data?.taskId || d?.data?.task_id || d?.taskId || null;
        if (!sunoStemsTaskId) throw new Error("Missing stems task id");
        setStatus("Instrumental requested from library song. Processing now…");
        void pollLibraryStemsUntilDone(sunoStemsTaskId, "inst");
      } catch (err) {
        setStatus(`Library instrumental failed: ${err?.message || String(err)}`);
        setLoading(false);
      }
    });
  });
  els.libraryList.querySelectorAll("[data-lib-stems]").forEach((b) => {
    b.addEventListener("click", async (e) => {
      e.stopPropagation();
      const ok = window.confirm("Get stems may consume around 50 credits. Do you want to continue?");
      if (!ok) return;
      const id = b.getAttribute("data-lib-stems");
      const t = loadLibrary().find((x) => x.id === id);
      if (!t?.taskId || !t?.audioId) {
        setStatus("This song is missing generation ids for stems request.");
        return;
      }
      try {
        setStatus("Getting multi-stems for selected song…");
        setLoading(true, { title: "Extracting multi-stems…", sub: "Processing selected library song." });
        const r = await fetch(apiUrl("/api/suno/stems"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ taskId: t.taskId, audioId: t.audioId, type: "split_stem" }),
        });
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(d?.error || "Multi-stems request failed");
        sunoMultiStemsTaskId = d?.data?.taskId || d?.data?.task_id || d?.taskId || null;
        if (!sunoMultiStemsTaskId) throw new Error("Missing multi-stems task id");
        setStatus("Multi-stems requested from library song. Processing now…");
        void pollLibraryStemsUntilDone(sunoMultiStemsTaskId, "multi");
      } catch (err) {
        setStatus(`Library multi-stems failed: ${err?.message || String(err)}`);
        setLoading(false);
      }
    });
  });
}
function openSongDetailsModal(details) {
  if (!els.songDetailsModal || !els.songDetailsContent) return;
  els.songDetailsContent.textContent = JSON.stringify(details || {}, null, 2);
  els.songDetailsModal.style.display = "";
}
function closeSongDetailsModal() {
  if (!els.songDetailsModal) return;
  els.songDetailsModal.style.display = "none";
}
if (els.songDetailsBackdrop) {
  els.songDetailsBackdrop.addEventListener("click", closeSongDetailsModal);
}
if (els.btnCloseSongDetails) {
  els.btnCloseSongDetails.addEventListener("click", closeSongDetailsModal);
}

// Vocal Room state
/** @type {AudioContext | null} */
let vocalCtx = null;
/** @type {MediaStream | null} */
let vocalMicStream = null;
/** @type {MediaRecorder | null} */
let vocalRecorder = null;
/** @type {MediaStreamAudioSourceNode | null} */
let vocalMicSource = null;
/** @type {MediaStreamAudioDestinationNode | null} */
let vocalRecordDest = null;
/** @type {GainNode | null} */
let vocalInputGainNode = null;
/** @type {GainNode | null} */
let vocalFxOutGainNode = null;
/** @type {Array<{ id:string, ts:number, preset:string, blob:Blob, url:string, label:string }>} */
let vocalTakes = [];
let vocalIsRecording = false;
/** @type {Blob | null} */
let lastVocalMixBlob = null;
let lastStudioMixBlob = null;
let lastStudioMixUrl = "";
let vocalSelectedTakeId = "";

// Multitrack session state (Vocal Room)
/**
 * @typedef {{ id:string, trackId:string, label:string, startSec:number, url?:string, blob?:Blob, sourceType:'url'|'blob', kind:'stem'|'vocal' }} SessionClip
 * @typedef {{ id:string, name:string, kind:'stem'|'vocal', gain:number, pan:number, muted:boolean, solo:boolean, clips:SessionClip[] }} SessionTrack
 */
/** @type {{ tracks: SessionTrack[] }} */
let session = { tracks: [] };
let sessionIsPlaying = false;
/** @type {AudioContext | null} */
let sessionCtx = null;
/** @type {AudioBuffer | null} */
let sessionBackingCache = null;
/** @type {Map<string, AudioBuffer>} */
const sessionBufferCache = new Map();
/** @type {Array<{ stop:() => void }>} */
let sessionPlayingNodes = [];
let sessionLastExportUrl = "";
const SESSION_VOCAL_TRACK_ID = "track_vocal";

function setVocalStatus(msg) {
  if (els.vocalStatus) els.vocalStatus.textContent = msg || "";
}

function setSessionStatus(msg) {
  if (els.sessionStatus) els.sessionStatus.textContent = msg || "";
}

function safeRevokeObjectUrl(url) {
  try {
    if (url) URL.revokeObjectURL(url);
  } catch {}
}

function setSessionDownloadUrl(url) {
  if (els.sessionDownload) {
    els.sessionDownload.href = url || "#";
    els.sessionDownload.classList.toggle("disabled", !url);
  }
}

function randomId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function ensureVocalTrack() {
  let t = session.tracks.find((x) => x.id === SESSION_VOCAL_TRACK_ID);
  if (!t) {
    t = {
      id: SESSION_VOCAL_TRACK_ID,
      name: "Vocal",
      kind: "vocal",
      gain: 1,
      pan: 0,
      muted: false,
      solo: false,
      clips: [],
    };
    session.tracks.unshift(t);
  }
  return t;
}

function clearSession() {
  for (const tr of session.tracks) {
    for (const c of tr.clips || []) {
      if (c.sourceType === "url" && c.url && c.url.startsWith("blob:")) safeRevokeObjectUrl(c.url);
    }
  }
  session = { tracks: [] };
  ensureVocalTrack();
  sessionBufferCache.clear();
  sessionPlayingNodes = [];
  sessionIsPlaying = false;
  if (sessionLastExportUrl) safeRevokeObjectUrl(sessionLastExportUrl);
  sessionLastExportUrl = "";
  setSessionDownloadUrl("");
  setSessionStatus("Session cleared.");
  renderSessionTracks();
  renderVocalTakes();
}

function getSessionAudibleTracks() {
  const anySolo = session.tracks.some((t) => t.solo);
  return session.tracks.filter((t) => {
    if (t.muted) return false;
    if (anySolo) return t.solo;
    return true;
  });
}

function updateSessionButtons() {
  const hasClips = session.tracks.some((t) => (t.clips || []).length > 0);
  if (els.btnSessionPlay) els.btnSessionPlay.disabled = !hasClips;
  if (els.btnSessionStop) els.btnSessionStop.disabled = !sessionIsPlaying;
  if (els.btnSessionExport) els.btnSessionExport.disabled = !hasClips;
}

function renderSessionTracks() {
  if (!els.sessionTracks) return;
  if (!session.tracks.length) ensureVocalTrack();

  const tracksHtml = session.tracks
    .map((t) => {
      const clip = (t.clips || [])[0] || null;
      const offset = clip ? clampNum(clip.startSec ?? 0, -10, 600) : 0;
      const clipLabel = clip ? clip.label : "—";
      const clipSrc = clip ? (clip.sourceType === "url" ? "url" : "blob") : "";

      return `
        <div class="trackRow">
          <div style="flex:1; min-width:240px">
            <div class="trackName">${t.name} ${t.kind === "vocal" ? '<span class="chip">Vocal</span>' : ""}</div>
            <div class="trackTiny">clip: ${clipLabel} ${clip ? `(${clipSrc})` : ""}</div>
          </div>

          <div class="trackCtl">
            <label class="trackTiny"><input type="checkbox" data-trk-mute="${t.id}" ${t.muted ? "checked" : ""}/> mute</label>
            <label class="trackTiny"><input type="checkbox" data-trk-solo="${t.id}" ${t.solo ? "checked" : ""}/> solo</label>
          </div>

          <div class="trackCtl">
            <span class="trackTiny">vol</span>
            <input type="range" min="0" max="2" step="0.01" value="${t.gain}" data-trk-gain="${t.id}" />
          </div>

          <div class="trackCtl">
            <span class="trackTiny">pan</span>
            <input type="range" min="-1" max="1" step="0.01" value="${t.pan}" data-trk-pan="${t.id}" />
          </div>

          <div class="trackCtl">
            <span class="trackTiny">offset(s)</span>
            <input type="number" step="0.01" value="${offset}" style="width:92px" data-clip-off="${t.id}" ${
              clip ? "" : "disabled"
            } />
          </div>

          <div class="trackCtl">
            ${t.id !== SESSION_VOCAL_TRACK_ID ? `<button class="ghost" data-trk-del="${t.id}">Remove</button>` : ""}
          </div>
        </div>
      `;
    })
    .join("");

  els.sessionTracks.innerHTML = tracksHtml || "No tracks yet.";

  els.sessionTracks.querySelectorAll("[data-trk-mute]").forEach((el) => {
    el.addEventListener("change", () => {
      const id = String(el.getAttribute("data-trk-mute") || "");
      const t = session.tracks.find((x) => x.id === id);
      if (!t) return;
      t.muted = Boolean(el.checked);
      renderSessionTracks();
      updateSessionButtons();
    });
  });
  els.sessionTracks.querySelectorAll("[data-trk-solo]").forEach((el) => {
    el.addEventListener("change", () => {
      const id = String(el.getAttribute("data-trk-solo") || "");
      const t = session.tracks.find((x) => x.id === id);
      if (!t) return;
      t.solo = Boolean(el.checked);
      renderSessionTracks();
      updateSessionButtons();
    });
  });
  els.sessionTracks.querySelectorAll("[data-trk-gain]").forEach((el) => {
    el.addEventListener("input", () => {
      const id = String(el.getAttribute("data-trk-gain") || "");
      const t = session.tracks.find((x) => x.id === id);
      if (!t) return;
      t.gain = clampNum(Number(el.value), 0, 2);
    });
  });
  els.sessionTracks.querySelectorAll("[data-trk-pan]").forEach((el) => {
    el.addEventListener("input", () => {
      const id = String(el.getAttribute("data-trk-pan") || "");
      const t = session.tracks.find((x) => x.id === id);
      if (!t) return;
      t.pan = clampNum(Number(el.value), -1, 1);
    });
  });
  els.sessionTracks.querySelectorAll("[data-clip-off]").forEach((el) => {
    el.addEventListener("change", () => {
      const trackId = String(el.getAttribute("data-clip-off") || "");
      const t = session.tracks.find((x) => x.id === trackId);
      if (!t) return;
      const c = (t.clips || [])[0];
      if (!c) return;
      c.startSec = clampNum(Number(el.value), -10, 600);
    });
  });
  els.sessionTracks.querySelectorAll("[data-trk-del]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = String(btn.getAttribute("data-trk-del") || "");
      const idx = session.tracks.findIndex((x) => x.id === id);
      if (idx < 0) return;
      const t = session.tracks[idx];
      for (const c of t.clips || []) {
        if (c.sourceType === "url" && c.url && c.url.startsWith("blob:")) safeRevokeObjectUrl(c.url);
      }
      session.tracks.splice(idx, 1);
      renderSessionTracks();
      updateSessionButtons();
    });
  });

  updateSessionButtons();
}

function addStemTrackFromUrl(name, url) {
  if (!url) return;
  const id = randomId("track");
  const clipId = randomId("clip");
  const t = /** @type {SessionTrack} */ ({
    id,
    name,
    kind: "stem",
    gain: 1,
    pan: 0,
    muted: false,
    solo: false,
    clips: [
      {
        id: clipId,
        trackId: id,
        label: name,
        startSec: 0,
        url,
        sourceType: "url",
        kind: "stem",
      },
    ],
  });
  session.tracks.push(t);
}

function addUploadedStemFile(file) {
  const url = URL.createObjectURL(file);
  addStemTrackFromUrl(file.name || "Uploaded", url);
}

function loadUploadedStemsIntoSession(files) {
  const vocal = ensureVocalTrack();
  // Keep Vocal track; remove existing stem tracks.
  session.tracks = [vocal];
  for (const f of files) addUploadedStemFile(f);
  renderSessionTracks();
}

function loadSunoMultiStemsIntoSession() {
  try {
    const raw = els.sunoStemsOut?.textContent || "";
    const obj = raw ? JSON.parse(raw) : null;
    const stems = stemsFromResponse(obj);
    if (!stems.length) {
      setSessionStatus("No multi-stems found yet. Generate multi-stems first.");
      return;
    }
    const vocal = ensureVocalTrack();
    session.tracks = [vocal];
    for (const s of stems) addStemTrackFromUrl(s.name, s.url);
    setSessionStatus(`Loaded ${stems.length} stem tracks.`);
    renderSessionTracks();
  } catch {
    setSessionStatus("Could not parse stems. Make sure multi-stems are SUCCESS and visible in Multi-stems panel.");
  }
}

function renderVocalTakes() {
  if (!els.vocalTakes) return;
  if (!vocalTakes.length) {
    els.vocalTakes.textContent = "No takes yet. Arm mic → Start recording.";
    if (els.btnVocalExport) els.btnVocalExport.disabled = true;
    return;
  }
  els.vocalTakes.innerHTML = vocalTakes
    .map((t, i) => {
      const dt = new Date(t.ts).toLocaleString();
      const selected = vocalSelectedTakeId ? t.id === vocalSelectedTakeId : i === 0;
      return `
        <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap; padding:10px; border:1px solid var(--border); border-radius:12px; margin-bottom:10px; background: rgba(10, 14, 22, 0.35);">
          <div style="flex:1; min-width:220px">
            <div style="font-weight:900">${t.label} ${selected ? '<span class="badge" style="margin-left:8px">Selected</span>' : ""}</div>
            <div class="small">${dt} • preset: ${t.preset}</div>
          </div>
          <button class="ghost" data-vtake-sel="${i}">Select</button>
          <button class="ghost" data-vtake-play="${i}">Play</button>
          <a class="ghost" href="${t.url}" download="vocal_take_${i + 1}.webm">Download take</a>
          <button class="ghost" data-vtake-del="${i}">Delete</button>
        </div>
      `;
    })
    .join("");

  els.vocalTakes.querySelectorAll("[data-vtake-sel]").forEach((b) => {
    b.addEventListener("click", () => {
      const i = Number(b.getAttribute("data-vtake-sel"));
      const t = vocalTakes[i];
      if (!t) return;
      vocalSelectedTakeId = t.id;
      renderVocalTakes();
      setVocalStatus(`Selected: ${t.label}`);
    });
  });
  els.vocalTakes.querySelectorAll("[data-vtake-play]").forEach((b) => {
    b.addEventListener("click", async () => {
      const i = Number(b.getAttribute("data-vtake-play"));
      const t = vocalTakes[i];
      if (!t) return;
      vocalSelectedTakeId = t.id;
      renderVocalTakes();
      await playOnPlayerPage(t.url, `Vocal take: ${t.label}`);
    });
  });
  els.vocalTakes.querySelectorAll("[data-vtake-del]").forEach((b) => {
    b.addEventListener("click", () => {
      const i = Number(b.getAttribute("data-vtake-del"));
      const t = vocalTakes[i];
      if (!t) return;
      safeRevokeObjectUrl(t.url);
      vocalTakes.splice(i, 1);
      if (vocalSelectedTakeId === t.id) vocalSelectedTakeId = "";
      renderVocalTakes();
    });
  });

  if (els.btnVocalExport) els.btnVocalExport.disabled = false;
}

function getVocalPreset() {
  return String(els.vocalPreset?.value || "clean");
}

function buildVocalFxChain(ctx, source, preset) {
  // Basic studio chain: HPF → (gate-ish) compressor → (tone) EQ → delay/reverb → output gain
  const inputGain = ctx.createGain();
  inputGain.gain.value = clampNum(Number(els.vocalVocalGain?.value ?? 1), 0, 1.5);

  const hpf = ctx.createBiquadFilter();
  hpf.type = "highpass";
  hpf.frequency.value = preset === "clean" ? 90 : 70;
  hpf.Q.value = 0.707;

  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = preset === "clean" ? -28 : -32;
  comp.knee.value = 24;
  comp.ratio.value = preset === "clean" ? 3.5 : 4.5;
  comp.attack.value = 0.006;
  comp.release.value = preset === "arabic_live" ? 0.22 : 0.18;

  const presence = ctx.createBiquadFilter();
  presence.type = "peaking";
  presence.frequency.value = 3500;
  presence.Q.value = 1.0;
  presence.gain.value = preset === "clean" ? 2.0 : 3.0;

  const sibilance = ctx.createBiquadFilter();
  sibilance.type = "highshelf";
  sibilance.frequency.value = 7800;
  sibilance.gain.value = preset === "studio_pop" ? 2.5 : 1.5;

  const dryGain = ctx.createGain();
  dryGain.gain.value = 1.0;

  const wetGain = ctx.createGain();
  wetGain.gain.value = preset === "clean" ? 0.12 : preset === "studio_pop" ? 0.18 : 0.28;

  const delay = ctx.createDelay(1.2);
  delay.delayTime.value = preset === "studio_pop" ? 0.16 : 0.12;
  const fb = ctx.createGain();
  fb.gain.value = preset === "arabic_live" ? 0.32 : 0.22;
  delay.connect(fb);
  fb.connect(delay);

  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 6500;
  lp.Q.value = 0.707;

  const outGain = ctx.createGain();
  outGain.gain.value = 1.0;

  // routing
  source.connect(inputGain);
  inputGain.connect(hpf);
  hpf.connect(comp);
  comp.connect(presence);
  presence.connect(sibilance);

  // dry
  sibilance.connect(dryGain);
  dryGain.connect(outGain);

  // wet (delay-ish)
  sibilance.connect(delay);
  delay.connect(lp);
  lp.connect(wetGain);
  wetGain.connect(outGain);

  return { out: outGain, inputGain, outGain };
}

async function armVocalMic() {
  if (vocalCtx && vocalMicStream && vocalMicSource && vocalRecordDest) return;

  setVocalStatus("Requesting microphone…");
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
    video: false,
  });

  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  const mic = ctx.createMediaStreamSource(stream);
  const dest = ctx.createMediaStreamDestination();

  const preset = getVocalPreset();
  const { out, inputGain } = buildVocalFxChain(ctx, mic, preset);

  // Always record the processed output.
  out.connect(dest);
  // Optional monitoring (hear yourself).
  if (els.vocalMonitor?.checked) out.connect(ctx.destination);

  vocalCtx = ctx;
  vocalMicStream = stream;
  vocalMicSource = mic;
  vocalRecordDest = dest;
  vocalInputGainNode = inputGain;
  vocalFxOutGainNode = out;

  setVocalStatus("Mic armed. Ready.");
  if (els.btnVocalRec) els.btnVocalRec.disabled = false;
  if (els.btnVocalStop) els.btnVocalStop.disabled = true;
}

function disarmVocalMic() {
  try {
    if (vocalRecorder && vocalRecorder.state !== "inactive") vocalRecorder.stop();
  } catch {}
  vocalRecorder = null;
  vocalIsRecording = false;

  try {
    if (vocalMicStream) vocalMicStream.getTracks().forEach((t) => t.stop());
  } catch {}
  vocalMicStream = null;

  try {
    vocalMicSource?.disconnect();
  } catch {}
  vocalMicSource = null;

  try {
    vocalInputGainNode?.disconnect();
  } catch {}
  vocalInputGainNode = null;

  try {
    vocalFxOutGainNode?.disconnect();
  } catch {}
  vocalFxOutGainNode = null;

  try {
    vocalRecordDest?.disconnect();
  } catch {}
  vocalRecordDest = null;

  try {
    vocalCtx?.close();
  } catch {}
  vocalCtx = null;

  if (els.btnVocalRec) els.btnVocalRec.disabled = true;
  if (els.btnVocalStop) els.btnVocalStop.disabled = true;
  setVocalStatus("Mic disarmed.");
}

async function startVocalRecording() {
  await armVocalMic();
  if (!vocalRecordDest) return;
  if (vocalIsRecording) return;

  const mimeCandidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/ogg;codecs=opus",
    "audio/ogg",
  ];
  const mimeType = mimeCandidates.find((m) => {
    try {
      return window.MediaRecorder && MediaRecorder.isTypeSupported(m);
    } catch {
      return false;
    }
  });

  const chunks = [];
  const rec = new MediaRecorder(vocalRecordDest.stream, mimeType ? { mimeType } : undefined);
  rec.addEventListener("dataavailable", (e) => {
    if (e.data && e.data.size > 0) chunks.push(e.data);
  });
  rec.addEventListener("stop", () => {
    const blob = new Blob(chunks, { type: rec.mimeType || "audio/webm" });
    const url = URL.createObjectURL(blob);
    const preset = getVocalPreset();
    const id = `${Date.now()}_${Math.random().toString(16).slice(2)}`;
    const label = `Take ${vocalTakes.length + 1}`;
    vocalTakes.unshift({ id, ts: Date.now(), preset, blob, url, label });
    // Add as a clip in the vocal track (multitrack session).
    const vt = ensureVocalTrack();
    vt.clips = [
      {
        id: randomId("clip"),
        trackId: vt.id,
        label,
        startSec: 0,
        blob,
        sourceType: "blob",
        kind: "vocal",
      },
    ];
    renderSessionTracks();
    updateSessionButtons();
    renderVocalTakes();
    setVocalStatus("Recorded take saved.");
  });

  vocalRecorder = rec;
  vocalIsRecording = true;
  rec.start(250); // timeslice
  setVocalStatus("Recording…");
  if (els.btnVocalRec) els.btnVocalRec.disabled = true;
  if (els.btnVocalStop) els.btnVocalStop.disabled = false;
}

function stopVocalRecording() {
  if (!vocalRecorder) return;
  try {
    vocalRecorder.stop();
  } catch {}
  vocalIsRecording = false;
  if (els.btnVocalRec) els.btnVocalRec.disabled = false;
  if (els.btnVocalStop) els.btnVocalStop.disabled = true;
  setVocalStatus("Stopping…");
}

async function decodeAudioFromArrayBuffer(ctx, buf) {
  // decodeAudioData may detach; use slice to avoid weirdness in some browsers
  const ab = buf.slice ? buf.slice(0) : buf;
  return await ctx.decodeAudioData(ab);
}

async function fetchArrayBuffer(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Fetch failed (${r.status})`);
  return await r.arrayBuffer();
}

async function getClipAudioBuffer(clip) {
  const key = clip.sourceType === "url" ? `url:${clip.url}` : `blob:${clip.id}`;
  const cached = sessionBufferCache.get(key);
  if (cached) return cached;

  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  try {
    let ab;
    if (clip.sourceType === "url") {
      if (!clip.url) throw new Error("Missing clip url");
      ab = await fetchArrayBuffer(clip.url);
    } else {
      if (!clip.blob) throw new Error("Missing clip blob");
      ab = await clip.blob.arrayBuffer();
    }
    const buf = await decodeAudioFromArrayBuffer(ctx, ab);
    sessionBufferCache.set(key, buf);
    return buf;
  } finally {
    ctx.close().catch(() => {});
  }
}

async function playSession() {
  if (sessionIsPlaying) return;
  const audibleTracks = getSessionAudibleTracks();
  const pairs = audibleTracks.flatMap((t) => (t.clips || []).map((c) => ({ t, c })));
  if (!pairs.length) {
    setSessionStatus("No clips to play.");
    return;
  }

  setSessionStatus("Decoding audio…");
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  sessionCtx = ctx;
  try {
    await ctx.resume();
  } catch {}

  // decode all clips first for reliable sync
  const decoded = await Promise.all(
    pairs.map(async ({ t, c }) => {
      const buf = await getClipAudioBuffer(c);
      return { t, c, buf };
    })
  );

  const startAt = ctx.currentTime + 0.12;
  sessionPlayingNodes = [];
  sessionIsPlaying = true;
  updateSessionButtons();
  setSessionStatus("Playing…");

  for (const { t, c, buf } of decoded) {
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const g = ctx.createGain();
    g.gain.value = clampNum(t.gain ?? 1, 0, 2);
    src.connect(g);

    let out = g;
    if (typeof ctx.createStereoPanner === "function") {
      const pn = ctx.createStereoPanner();
      pn.pan.value = clampNum(t.pan ?? 0, -1, 1);
      g.connect(pn);
      out = pn;
    }
    out.connect(ctx.destination);

    const when = startAt + (Number(c.startSec) || 0);
    src.start(Math.max(startAt, when));
    sessionPlayingNodes.push({
      stop: () => {
        try {
          src.stop();
        } catch {}
        try {
          src.disconnect();
        } catch {}
      },
    });
  }
}

function stopSession() {
  for (const n of sessionPlayingNodes) {
    try {
      n.stop();
    } catch {}
  }
  sessionPlayingNodes = [];
  sessionIsPlaying = false;
  updateSessionButtons();
  setSessionStatus("Stopped.");
  try {
    sessionCtx?.close();
  } catch {}
  sessionCtx = null;
}

function getSelectedVocalTake() {
  if (!vocalTakes.length) return null;
  if (!vocalSelectedTakeId) return vocalTakes[0] || null;
  return vocalTakes.find((t) => t.id === vocalSelectedTakeId) || vocalTakes[0] || null;
}

async function exportSessionMixWav() {
  const audibleTracks = getSessionAudibleTracks();
  const clips = audibleTracks.flatMap((t) => (t.clips || []).map((c) => ({ t, c })));
  if (!clips.length) throw new Error("No clips to export");

  setSessionStatus("Preparing export…");
  setLoading(true, { title: "Exporting session…", sub: "Rendering WAV offline in your browser." });

  const decoded = await Promise.all(
    clips.map(async ({ t, c }) => {
      const buf = await getClipAudioBuffer(c);
      return { t, c, buf };
    })
  );

  const sampleRate = 44100;
  const maxDur = decoded.reduce((m, x) => Math.max(m, (x.c.startSec || 0) + (x.buf.duration || 0)), 0);
  const frames = Math.max(1, Math.ceil(maxDur * sampleRate));
  const off = new OfflineAudioContext(2, frames, sampleRate);

  for (const { t, c, buf } of decoded) {
    const src = off.createBufferSource();
    src.buffer = buf;
    const g = off.createGain();
    g.gain.value = clampNum(t.gain ?? 1, 0, 2);
    src.connect(g);
    let out = g;
    if (typeof off.createStereoPanner === "function") {
      const pn = off.createStereoPanner();
      pn.pan.value = clampNum(t.pan ?? 0, -1, 1);
      g.connect(pn);
      out = pn;
    }
    out.connect(off.destination);
    src.start(Math.max(0, Number(c.startSec) || 0));
  }

  const rendered = await off.startRendering();
  const wavBlob = encodeWav16([rendered.getChannelData(0), rendered.getChannelData(1)], rendered.sampleRate);

  if (sessionLastExportUrl) safeRevokeObjectUrl(sessionLastExportUrl);
  const url = URL.createObjectURL(wavBlob);
  sessionLastExportUrl = url;
  setSessionDownloadUrl(url);
  setSessionStatus("Export complete. Download is ready.");
}

function ensurePlayer() {
  if (playerEl) return playerEl;
  playerEl = new Audio();
  playerEl.preload = "auto";
  playerEl.addEventListener("timeupdate", syncPlayerUI);
  playerEl.addEventListener("loadedmetadata", syncPlayerUI);
  playerEl.addEventListener("ended", () => {
    if (els.btnPlayerPlay) els.btnPlayerPlay.disabled = false;
    if (els.btnPlayerPause) els.btnPlayerPause.disabled = true;
  });
  return playerEl;
}

function placeholderCoverDataUrl() {
  return "./assets/nabadai-logo.png";
}

function setPlayerMeta({ title, subtitle, artUrl } = {}) {
  const hasTrack = Boolean(artUrl);
  if (els.playerTitle) els.playerTitle.textContent = title || "Now Playing";
  if (els.playerSubtitle) els.playerSubtitle.textContent = subtitle || "";
  if (els.playerArt) els.playerArt.src = artUrl || placeholderCoverDataUrl();
  const artWrap = document.querySelector(".playerArtWrap");
  if (artWrap) artWrap.classList.toggle("isEmpty", !hasTrack);
  if (els.playerArt) els.playerArt.classList.toggle("isPlaceholder", !hasTrack);
  hubNowMeta = {
    title: title || "Now playing",
    art: artUrl || placeholderCoverDataUrl(),
  };
  renderHubNowPlaying();
}

// Most recent http(s) URL handed to the player. Used by Download Video
// and Share so they don't depend on which entry point loaded the song
// (Library sets `currentPlayerTrackRef`, but Generate result cards and
// other paths don't).
let lastPlayerHttpUrl = "";
function setPlayerSource(url, label) {
  const a = ensurePlayer();
  a.pause();
  if (typeof url === "string" && /^https?:\/\//i.test(url)) {
    lastPlayerHttpUrl = url;
  }
  // Only same-origin or blob URLs need crossOrigin for WebAudio/spectrum; forcing
  // "anonymous" on arbitrary Suno CDN URLs breaks playback when ACAO is absent.
  try {
    const u = String(url || "");
    if (!u || u.startsWith("blob:")) {
      a.crossOrigin = "anonymous";
    } else {
      const parsed = new URL(u, location.href);
      if (parsed.origin === location.origin) {
        a.crossOrigin = "anonymous";
      } else {
        a.removeAttribute("crossOrigin");
      }
    }
  } catch {
    a.removeAttribute("crossOrigin");
  }
  a.src = url;
  a.currentTime = 0;
  playerLoadedLabel = label || "";
  if (els.playerSource) els.playerSource.textContent = label ? `Loaded: ${label}` : "";
  if (els.btnPlayerPlay) els.btnPlayerPlay.disabled = false;
  if (els.btnPlayerPause) els.btnPlayerPause.disabled = true;
  if (els.btnPlayerStop) els.btnPlayerStop.disabled = false;
  // Refresh the visible toggle button immediately; loadedmetadata fires
  // a moment later but we don't want a flash of "disabled".
  if (typeof syncPlayerToggleUI === "function") syncPlayerToggleUI();
  hubAudio = a;
  hubAudioPostId = null;
  if (!miniSource) miniSource = { type: "player" };
  if (!miniSource || miniSource.type !== "library") {
    libraryNowPlayingId = null;
    if ((document.body.getAttribute("data-route") || "") === "library") renderLibrary();
  }
  syncPlayerUI();
  renderHubNowPlaying();
}

async function cacheGeneratedAudio(url) {
  if (!url || url === "#") return null;
  try {
    const r = await fetch(url);
    if (!r.ok) return null;
    const blob = await r.blob();
    if (!blob || blob.size < 1024) return null;
    if (lastSunoCachedUrl) safeRevokeObjectUrl(lastSunoCachedUrl);
    lastSunoCachedUrl = URL.createObjectURL(blob);
    return lastSunoCachedUrl;
  } catch {
    return null;
  }
}
async function cacheGeneratedAudio2(url) {
  if (!url || url === "#") return null;
  try {
    const r = await fetch(url);
    if (!r.ok) return null;
    const blob = await r.blob();
    if (!blob || blob.size < 1024) return null;
    if (lastSunoCachedUrl2) safeRevokeObjectUrl(lastSunoCachedUrl2);
    lastSunoCachedUrl2 = URL.createObjectURL(blob);
    return lastSunoCachedUrl2;
  } catch {
    return null;
  }
}
function toAudioProxyUrl(url) {
  if (!url || url === "#") return "";
  return `/api/suno/audio?url=${encodeURIComponent(url)}`;
}

function hubAbsoluteUrl(pathOrUrl) {
  const s = String(pathOrUrl || "").trim();
  if (!s) return "";
  if (/^https?:\/\//i.test(s)) return s;
  try {
    return new URL(s, location.origin).toString();
  } catch {
    return s;
  }
}

/** Remote feed URLs use same-origin proxy so `fetch` works; blob stays blob. */
function hubPreloadFetchUrl(rawUrl) {
  const u = String(rawUrl || "").trim();
  if (!u || u === "#") return "";
  if (u.startsWith("blob:")) return u;
  if (u.includes("/api/suno/audio")) return hubAbsoluteUrl(u);
  if (/^https?:\/\//i.test(u)) return hubAbsoluteUrl(toAudioProxyUrl(u));
  return hubAbsoluteUrl(u);
}

function trimHubBlobCache() {
  while (hubBlobLru.length > HUB_BLOB_CACHE_MAX) {
    const id = hubBlobLru.shift();
    const ou = hubAudioBlobByPostId.get(id);
    if (ou) {
      try {
        URL.revokeObjectURL(ou);
      } catch {}
      hubAudioBlobByPostId.delete(id);
    }
  }
}

function rememberHubBlob(postId, objectUrl) {
  const prev = hubAudioBlobByPostId.get(postId);
  if (prev) {
    try {
      URL.revokeObjectURL(prev);
    } catch {}
  }
  hubAudioBlobByPostId.set(postId, objectUrl);
  hubBlobLru = hubBlobLru.filter((x) => x !== postId);
  hubBlobLru.push(postId);
  trimHubBlobCache();
}

/** If `url` is a `/api/suno/audio?url=…` wrapper, return the underlying CDN
 * URL so the browser can fetch from the origin and skip our serverless
 * function entirely. Anything else (raw https URL, blob:, data:) passes
 * through unchanged. */
function preferDirectAudioUrl(url) {
  const s = String(url || "").trim();
  if (!s || s === "#") return "";
  if (s.startsWith("blob:") || s.startsWith("data:")) return s;
  try {
    const u = new URL(s, location.origin);
    if (u.pathname.endsWith("/api/suno/audio")) {
      const raw = u.searchParams.get("url");
      if (raw) return raw;
    }
  } catch {}
  return s;
}

function hubPlaybackSrcForPost(postId, p) {
  const cached = hubAudioBlobByPostId.get(postId);
  if (cached) return cached;
  // Use the direct CDN URL when possible to avoid streaming the file through
  // our /api/suno/audio proxy (where every byte counts twice on Vercel
  // bandwidth). The HTML5 <audio> element happily plays cross-origin URLs
  // without a CORS preflight; if direct play fails we fall back to the
  // proxy URL inside startHubPlayback.
  return preferDirectAudioUrl(String(p?.url || "").trim());
}

async function fetchHubTrackIntoBlob(postId, rawUrl) {
  if (!postId || !rawUrl) return;
  if (hubAudioBlobByPostId.has(postId)) return;
  const inflight = hubPreloadInflight.get(postId);
  if (inflight) return inflight;
  const fetchUrl = hubPreloadFetchUrl(rawUrl);
  if (!fetchUrl) return;
  const job = (async () => {
    try {
      const r = await fetch(fetchUrl);
      if (!r.ok) return;
      const blob = await r.blob();
      if (!blob || blob.size < 1024) return;
      rememberHubBlob(postId, URL.createObjectURL(blob));
    } catch {}
  })();
  hubPreloadInflight.set(postId, job);
  job.finally(() => {
    hubPreloadInflight.delete(postId);
  });
  return job;
}

function preloadNextHubTrack(currentPostId) {
  if (!currentPostId) return;
  const root = els.hubList;
  if (!root) return;
  const currentRow = root.querySelector(`[data-hub-row="${currentPostId}"]`);
  if (!currentRow) return;
  let nextRow = currentRow.nextElementSibling;
  while (nextRow && !nextRow.matches?.("[data-hub-row]")) {
    nextRow = nextRow.nextElementSibling;
  }
  if (!nextRow) return;
  const nextId = nextRow.getAttribute("data-hub-row");
  if (!nextId) return;
  const nextPost = loadHubFeed().find((p) => p.id === nextId);
  const raw = String(nextPost?.url || "").trim();
  if (!raw) return;
  void fetchHubTrackIntoBlob(nextId, raw);
}

function scheduleHubPreloadNext(currentPostId) {
  if (hubPreloadTimer) {
    clearTimeout(hubPreloadTimer);
    hubPreloadTimer = null;
  }
  hubPreloadTimer = setTimeout(() => {
    hubPreloadTimer = null;
    preloadNextHubTrack(currentPostId);
  }, 400);
}

/** Preload the first row in the rendered Hub feed. Most users tap ▶ on the
 * top post, so having that file already buffered makes the very first play
 * feel instant — without committing bandwidth for the entire feed. */
/** Toggle `data-burst="1"` on a button to trigger its CSS keyframe pulse,
 * then clear it so a future click can re-trigger. The reflow read forces
 * the browser to commit the cleared state before re-setting — without it
 * the same animation wouldn't restart on rapid taps. */
function triggerHubPulse(el) {
  if (!el) return;
  el.removeAttribute("data-burst");
  void el.offsetWidth;
  el.setAttribute("data-burst", "1");
  setTimeout(() => {
    if (el.getAttribute("data-burst") === "1") el.removeAttribute("data-burst");
  }, 720);
}

/** Build the public link for a Hub post. Points at the dynamic share
 * page (`/s/POST_ID`) so chat apps + social platforms unfurl a real
 * preview card with cover art, title, and creator. The share page
 * client-side-redirects real users to `#/hub?post=ID` so the actual
 * playback experience works the same as before. */
function buildHubShareUrl(postId) {
  if (!postId) return "";
  try {
    return `${location.origin}/s/${encodeURIComponent(postId)}`;
  } catch {
    return `/s/${encodeURIComponent(postId)}`;
  }
}

/** Show a small floating toast above the bottom tab bar. Auto-dismisses
 * after a short pause. Falls back to setStatus if the toast element
 * isn't present (older shells). */
let toastDismissTimer = null;
function showToast(message, opts) {
  const text = String(message || "").trim();
  if (!text) return;
  const el = els.toast;
  if (!el) {
    setStatus(text);
    return;
  }
  const icon = String(opts?.icon || "").trim();
  el.innerHTML = icon
    ? `<span class="toastIcon" aria-hidden="true">${escapeHtml(icon)}</span>${escapeHtml(text)}`
    : escapeHtml(text);
  el.classList.add("show");
  if (toastDismissTimer) {
    try { clearTimeout(toastDismissTimer); } catch {}
  }
  const ms = Math.max(1200, Math.min(5000, Number(opts?.durationMs) || 2200));
  toastDismissTimer = setTimeout(() => {
    el.classList.remove("show");
    toastDismissTimer = null;
  }, ms);
}
function showShareToast(message) {
  showToast(message, { icon: "✓" });
}

/** Native share via Web Share API; falls back to copying the link to the
 * clipboard with a toast. Used by Hub posts and the Player page. */
async function shareHubLink({ title, text, url }) {
  const safeUrl = String(url || "").trim();
  if (!safeUrl) return false;
  const payload = {
    title: title || "Listen on Nabadai",
    text: text || "Made on Nabadai. Take a listen.",
    url: safeUrl,
  };
  if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
    try {
      await navigator.share(payload);
      return true;
    } catch (e) {
      const name = e?.name || "";
      // User dismissed the share sheet — not an error, don't show a toast.
      if (name === "AbortError" || name === "NotAllowedError") return false;
    }
  }
  try {
    await navigator.clipboard.writeText(safeUrl);
    showShareToast("Link copied");
    return true;
  } catch {
    showShareToast("Couldn't copy. Long-press the URL bar to share manually.");
    return false;
  }
}

async function shareHubPost(post) {
  if (!post?.id) return;
  const url = buildHubShareUrl(post.id);
  const title = post.title ? `${post.title} — Nabadai` : "Listen on Nabadai";
  const text = post.creator
    ? `“${post.title || "this song"}” by @${post.creator} on Nabadai`
    : `“${post.title || "this song"}” on Nabadai`;
  await shareHubLink({ title, text, url });
}

/** When landing on `#/hub?post=ID`, scroll the post into view and start it
 * (subject to iOS audio-unlock). Polls a short while to wait for the cloud
 * sync to land the post in the feed if this is a cold visit. */
let pendingShareFocusId = "";
function focusHubPostFromShare(postId) {
  const targetId = String(postId || "").trim();
  if (!targetId) return;
  pendingShareFocusId = targetId;
  const tryNow = () => {
    if (pendingShareFocusId !== targetId) return false;
    const row = document.querySelector(`[data-hub-row="${targetId}"]`);
    if (!row) return false;
    pendingShareFocusId = "";
    try {
      row.scrollIntoView({ behavior: "smooth", block: "center" });
    } catch {
      try { row.scrollIntoView(); } catch {}
    }
    if (getHubAudioUnlocked()) {
      void startHubPlayback(targetId);
    } else {
      setStatus("Tap ▶ on the highlighted song to play.");
    }
    return true;
  };
  if (tryNow()) return;
  // Cold visit — Supabase fetch may still be in flight. Nudge another
  // refresh in case the boot one already errored, then poll up to ~12s.
  void refreshHubFromSupabase();
  const start = Date.now();
  const poll = () => {
    if (pendingShareFocusId !== targetId) return;
    if (tryNow()) return;
    if (Date.now() - start > 12000) {
      pendingShareFocusId = "";
      showToast("Couldn't find that song. Browse the Hub below.");
      return;
    }
    setTimeout(poll, 250);
  };
  setTimeout(poll, 200);
}

function preloadInitialHubTracks() {
  if (!els.hubList) return;
  const firstRow = els.hubList.querySelector("[data-hub-row]");
  if (!firstRow) return;
  const id = firstRow.getAttribute("data-hub-row");
  if (!id) return;
  if (hubAudioBlobByPostId.has(id) || hubPreloadInflight.has(id)) return;
  const p = loadHubFeed().find((x) => x.id === id);
  const raw = String(p?.url || "").trim();
  if (!raw) return;
  void fetchHubTrackIntoBlob(id, raw);
}

function updateListenRefButton() {
  if (!els.btnResultListenRef) return;
  els.btnResultListenRef.style.display = lastSunoReferenceUrl ? "" : "none";
}

async function playOnPlayerPage(url, label, meta = null) {
  if (!url) return;
  setPlayerSource(url, label);
  if (meta && (meta.title || meta.subtitle || meta.artUrl)) {
    setPlayerMeta(meta);
  } else {
    setPlayerMeta({
      title: lastSunoTitle || "Generated song",
      subtitle: label ? `Generated • ${label}` : "Generated",
      artUrl: lastSunoArtUrl,
    });
  }
  location.hash = "#/player";
  // Give the route a moment to render, then play.
  const a = ensurePlayer();
  try {
    await a.play();
    if (els.btnPlayerPlay) els.btnPlayerPlay.disabled = true;
    if (els.btnPlayerPause) els.btnPlayerPause.disabled = false;
  } catch (e) {
    setStatus(`In-app playback failed (${e?.name || "error"}). Tap Open Direct.`);
  }
}

async function playInline(url, label, source) {
  if (!url) return;
  miniSource = source || { type: "player" };
  setPlayerSource(url, label);
  const a = ensurePlayer();
  try {
    await a.play();
    if (els.btnPlayerPlay) els.btnPlayerPlay.disabled = true;
    if (els.btnPlayerPause) els.btnPlayerPause.disabled = false;
  } catch (e) {
    setStatus(`In-app playback failed (${e?.name || "error"}). Tap Open Direct.`);
  }
}

function formatTime(sec) {
  const s = Math.max(0, Math.floor(sec || 0));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
}

function syncPlayerUI() {
  if (!playerEl) return;
  const dur = Number.isFinite(playerEl.duration) ? playerEl.duration : 0;
  const cur = Number.isFinite(playerEl.currentTime) ? playerEl.currentTime : 0;
  const artWrap = document.querySelector(".playerArtWrap");
  const playing = !playerEl.paused && !playerEl.ended && (dur > 0 || cur > 0);
  if (artWrap) artWrap.classList.toggle("isNowPlaying", playing);
  // Player card class for global focus styling (gradient title etc.)
  const playerCard = document.querySelector(".playerCard");
  if (playerCard) playerCard.classList.toggle("isPlaying", playing);
  if (els.playerTime) els.playerTime.textContent = `${formatTime(cur)} / ${formatTime(dur)}`;
  if (els.playerTimeCurrent) els.playerTimeCurrent.textContent = formatTime(cur);
  if (els.playerTimeTotal) els.playerTimeTotal.textContent = formatTime(dur);
  if (els.playerSeek && !playerSeekDragging) {
    const max = Number(els.playerSeek.max || 1000);
    const pct = dur > 0 ? (cur / dur) * 100 : 0;
    els.playerSeek.value = dur > 0 ? String(Math.round((cur / dur) * max)) : "0";
    // Drive the gradient fill via a custom property so the slider track
    // can show how far we are without needing a separate element.
    els.playerSeek.style.setProperty("--playerSeekPct", `${pct}%`);
  }
  renderHubNowPlaying();
}

function clampClipRange(startSec, endSec, durationSec) {
  const dur = Math.max(0, Number(durationSec || 0));
  let s = Math.max(0, Math.floor(Number(startSec || 0)));
  let e = Math.max(0, Math.floor(Number(endSec || 0)));
  if (dur > 0) {
    s = Math.min(s, Math.max(0, Math.floor(dur) - 1));
    e = Math.min(e, Math.floor(dur));
  }
  if (e <= s) e = Math.min((dur || s + 1), s + 1);
  return { startSec: s, endSec: e };
}

function getParams() {
  return {
    style: els.style.value,
    bpm: clampInt(parseInt(els.bpm.value, 10) || 96, 60, 180),
    bars: clampInt(parseInt(els.bars.value, 10) || 32, 8, 128),
    keyCenter: els.keyCenter.value,
    scale: els.scale.value,
    meter: els.meter.value,
    lyrics: (els.lyrics?.value || "").trim(),
    variationSeed,
  };
}

function setParams(p) {
  els.style.value = p.style;
  els.bpm.value = String(p.bpm);
  els.bars.value = String(p.bars);
  els.keyCenter.value = p.keyCenter;
  els.scale.value = p.scale;
  els.meter.value = p.meter;
  if (els.lyrics) els.lyrics.value = p.lyrics || els.lyrics.value || "";
}

function getInstrumentFlags() {
  return {
    oud: els.instOud.checked,
    violin: els.instViolin.checked,
    piano: els.instPiano.checked,
    tabla: els.instTabla.checked,
  };
}

function setStatus(text) {
  els.status.textContent = text;
  const s = String(text || "").toLowerCase();
  if (s.includes("failed") || s.includes("error")) {
    setAiBgState("error");
  } else if (s.includes("ready") || s.includes("generated") || s.includes("complete")) {
    setAiBgState("ready");
  }
  if (aiBgResetTimer) clearTimeout(aiBgResetTimer);
  aiBgResetTimer = setTimeout(() => {
    if (busyCount <= 0) setAiBgState("idle");
  }, 2600);
}

function setProgress(pct) {
  els.progressBar.style.width = `${Math.max(0, Math.min(100, pct))}%`;
}

let busyCount = 0;
let aiBgResetTimer = null;
let aiBgApplyTimer = null;
function setAiBgState(state) {
  // Background is intentionally stable (non-reactive) for a cleaner UI.
  return state;
}
function setLoading(on, { title, sub } = {}) {
  busyCount = Math.max(0, busyCount + (on ? 1 : -1));
  const show = busyCount > 0;
  const readyMode = false;
  if (els.globalLoading) els.globalLoading.style.display = show ? "" : "none";
  document.body.classList.toggle("isBusy", show);
  if (els.globalLoading) els.globalLoading.classList.toggle("isReadyNotice", readyMode);
  if (show && busyCount > 0) {
    if (aiBgResetTimer) {
      clearTimeout(aiBgResetTimer);
      aiBgResetTimer = null;
    }
    setAiBgState("processing");
  }
  if (show) {
    if (els.loadingTitle && title) els.loadingTitle.textContent = title;
    if (els.loadingSub && sub) els.loadingSub.textContent = sub;
  }
}

function savePendingBackendTask(taskId) {
  pendingBackendTaskId = String(taskId || "").trim();
  try {
    if (pendingBackendTaskId) localStorage.setItem(PENDING_TASK_KEY, pendingBackendTaskId);
    else localStorage.removeItem(PENDING_TASK_KEY);
  } catch {}
}

function loadPendingBackendTask() {
  try {
    return String(localStorage.getItem(PENDING_TASK_KEY) || "").trim();
  } catch {
    return "";
  }
}

function printArrangement(a) {
  els.arrangementOut.textContent = JSON.stringify(a, null, 2);
}

function printMelody(m) {
  if (!els.melodyOut) return;
  els.melodyOut.textContent = m ? JSON.stringify(m, null, 2) : "";
}

function printSuno(obj) {
  if (!els.sunoOut) return;
  els.sunoOut.textContent = obj ? JSON.stringify(obj, null, 2) : "";
}

function printSunoStems(obj) {
  if (!els.sunoStemsOut) return;
  els.sunoStemsOut.textContent = obj ? JSON.stringify(obj, null, 2) : "";
}

function deepFindFirstStringByKeys(obj, keys) {
  const wanted = new Set((keys || []).map((k) => String(k).toLowerCase()));
  const seen = new Set();
  const stack = [obj];
  while (stack.length) {
    const cur = stack.pop();
    if (!cur || typeof cur !== "object") continue;
    if (seen.has(cur)) continue;
    seen.add(cur);
    for (const [k, v] of Object.entries(cur)) {
      if (wanted.has(String(k).toLowerCase()) && typeof v === "string" && v.startsWith("http")) return v;
      if (v && typeof v === "object") stack.push(v);
    }
  }
  return "";
}

function renderMixerList() {
  if (!els.mixerList) return;
  if (!mixerStems.length) {
    els.mixerList.textContent = "No stems loaded yet.";
    return;
  }
  els.mixerList.innerHTML = mixerStems
    .map((s, idx) => {
      const muted = s.muted ? "checked" : "";
      const gain = typeof s.gain === "number" ? s.gain : 1;
      const safeName = escapeHtml(s.name);
      return `
        <div style="display:flex; gap:10px; align-items:center; padding:8px 0; border-bottom: 1px solid rgba(255,255,255,0.06)">
          <div style="min-width:140px; font-weight:800">${safeName}</div>
          <label style="display:flex; gap:8px; align-items:center; color: var(--muted); font-size:12px;">
            <input data-mute="${idx}" type="checkbox" ${muted}/> mute
          </label>
          <label style="display:flex; gap:8px; align-items:center; color: var(--muted); font-size:12px;">
            vol <input data-gain="${idx}" type="range" min="0" max="1.5" step="0.01" value="${gain}" />
            <span style="min-width:42px; text-align:right">${gain.toFixed(2)}</span>
          </label>
          <a class="ghost" style="padding:6px 10px" href="${s.url}" target="_blank" rel="noreferrer">open</a>
        </div>
      `;
    })
    .join("");

  els.mixerList.querySelectorAll("input[data-gain]").forEach((el) => {
    el.addEventListener("input", () => {
      const i = Number(el.getAttribute("data-gain"));
      mixerStems[i].gain = Number(el.value);
      applyMixerToAudio();
      renderMixerList();
    });
  });
  els.mixerList.querySelectorAll("input[data-mute]").forEach((el) => {
    el.addEventListener("change", () => {
      const i = Number(el.getAttribute("data-mute"));
      mixerStems[i].muted = Boolean(el.checked);
      applyMixerToAudio();
    });
  });
}

function escapeHtml(s) {
  return String(s || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function setLink(el, url) {
  if (!el) return;
  if (url) {
    el.href = url;
    el.classList.remove("disabled");
  } else {
    el.href = "#";
    el.classList.add("disabled");
  }
}

async function refreshSunoCredits() {
  if (!els.sunoCredits) return;
  try {
    if (els.btnSunoCredits) els.btnSunoCredits.disabled = true;
    if (els.sunoCreditsNote) els.sunoCreditsNote.textContent = " (updating…)";
    const r = await fetch(apiUrl("/api/suno/credits"));
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data?.error || "credits failed");
    const credits = data?.data;
    els.sunoCredits.textContent = Number.isFinite(Number(credits)) ? String(credits) : "—";
    if (els.sunoCreditsNote) els.sunoCreditsNote.textContent = "";
    return Number.isFinite(Number(credits)) ? Number(credits) : null;
  } catch (e) {
    els.sunoCredits.textContent = "—";
    if (els.sunoCreditsNote) els.sunoCreditsNote.textContent = " (failed)";
    return null;
  } finally {
    if (els.btnSunoCredits) els.btnSunoCredits.disabled = false;
  }
}

const CREDITS_HISTORY_KEY = "mas:sunoCreditsHistory:v1";

function loadCreditsHistory() {
  try {
    const raw = localStorage.getItem(CREDITS_HISTORY_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function saveCreditsHistory(items) {
  try {
    localStorage.setItem(CREDITS_HISTORY_KEY, JSON.stringify(items.slice(0, 200)));
  } catch {
    // ignore
  }
}

function pushCreditsEvent(ev) {
  const items = loadCreditsHistory();
  items.unshift(ev);
  saveCreditsHistory(items);
  renderCreditsHistory();
}

function renderCreditsHistory() {
  if (!els.creditsHistoryOut) return;
  const items = loadCreditsHistory();
  if (!items.length) {
    els.creditsHistoryOut.textContent = "No history yet.";
    return;
  }
  els.creditsHistoryOut.textContent = items
    .slice(0, 50)
    .map((e) => {
      const dt = new Date(e.ts).toLocaleString();
      const delta =
        typeof e.delta === "number" ? (e.delta > 0 ? `+${e.delta}` : String(e.delta)) : "—";
      const before = e.before ?? "—";
      const after = e.after ?? "—";
      const extra = e.extra ? ` | ${e.extra}` : "";
      return `${dt} | ${e.action} | credits ${before} → ${after} (${delta})${extra}`;
    })
    .join("\n");
}

function buildCreditRecoveryPayload() {
  const items = loadCreditsHistory();
  const latest = items[0] || null;
  const ts = latest?.ts ? new Date(latest.ts).toISOString() : new Date().toISOString();
  const action = latest?.action || "Suno: generate song";
  const before = latest?.before ?? "unknown";
  const after = latest?.after ?? "unknown";
  const delta = latest?.delta ?? "unknown";
  const extra = latest?.extra || "";
  const task = sunoTaskId || "unknown";
  const model = LATEST_SUNO_MODEL;
  return [
    "Credit Recovery Request",
    `Time (UTC): ${ts}`,
    `Action: ${action}`,
    `Task ID: ${task}`,
    `Model: ${model}`,
    `Credits before: ${before}`,
    `Credits after: ${after}`,
    `Credits delta: ${delta}`,
    `Details: ${extra}`,
    "Issue: Generation failed/timeout or playback failure after charge.",
  ].join("\n");
}

async function trackCreditsAround(action, fn, extra = "") {
  const before = await refreshSunoCredits();
  const t0 = Date.now();
  try {
    return await fn();
  } finally {
    const after = await refreshSunoCredits();
    const delta =
      typeof before === "number" && typeof after === "number" ? after - before : null;
    pushCreditsEvent({
      ts: Date.now(),
      action,
      before,
      after,
      delta,
      extra: extra || `took ${(Date.now() - t0) / 1000}s`,
    });
  }
}

/**
 * Replace the lead melody notes in an arrangement with detected hum melody.
 * Keeps chords/percussion/piano pad from the generator.
 * @param {import("./types.js").Arrangement} arrangement
 * @param {import("./melody/extract.js").Melody | null} melody
 */
function applyMelodyToArrangement(arrangement, melody) {
  if (!melody || !Array.isArray(melody.notes) || melody.notes.length === 0) return arrangement;

  const style = arrangement?.params?.style || "arabic-pop";
  const leadInstrument = style === "cinematic" ? "violin" : "oud";

  const beatsPerBar = arrangement.beatsPerBar;
  const totalBeats = arrangement.totalBeats;
  const maxBeats = Math.min(totalBeats, melodyMaxBeatsFromArrangement(arrangement));

  const carried = (arrangement.notes || []).filter((n) => n.instrument !== leadInstrument);
  // Softer hum lead vs chords/percussion so tabla/darbuka punches through (still synth-y until samples).
  const velScale = 0.42;
  const humNotes = melody.notes
    .map((n) => ({
      startBeat: Math.max(0, Math.min(maxBeats, n.startBeat)),
      durationBeats: Math.max(0.05, Math.min(n.durationBeats, Math.max(0, maxBeats - n.startBeat))),
      midi: n.midi,
      velocity: Math.max(0.1, Math.min(0.55, (n.velocity ?? 0.62) * velScale)),
      instrument: /** @type {any} */ (leadInstrument),
    }))
    .filter((n) => n.durationBeats > 0.05 && n.startBeat < maxBeats);

  return { ...arrangement, notes: [...carried, ...humNotes] };
}

function melodyMaxBeatsFromArrangement(arr) {
  // Keep a small tail so the hum doesn’t run into the render tail.
  return Math.max(1, arr.totalBeats - arr.beatsPerBar * 0.5);
}

function resetAudioOutputs() {
  currentWav = null;
  els.btnPlay.disabled = true;
  els.downloadLink.classList.add("disabled");
  els.downloadLink.href = "#";
  if (audioEl) {
    audioEl.pause();
    audioEl = null;
  }
}

function resetVoiceOutputs() {
  currentVoice = null;
  els.btnVoicePlay.disabled = true;
  els.voiceDownloadLink.classList.add("disabled");
  els.voiceDownloadLink.href = "#";
  if (voiceEl) {
    voiceEl.pause();
    voiceEl = null;
  }
}

async function generateArrangementMaybeAi(params) {
  const wantsAi = Boolean(els.useAi?.checked);
  if (!wantsAi) return generateArrangement(params);

  try {
    const r = await fetch(apiUrl("/api/compose"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ params }),
    });
    if (!r.ok) {
      const txt = await r.text().catch(() => "");
      throw new Error(`AI compose failed (${r.status}): ${txt.slice(0, 200)}`);
    }
    return await r.json();
  } catch (e) {
    // Fall back to the free local generator if AI quota/billing isn't enabled.
    console.warn("AI compose failed, falling back to local generator", e);
    setStatus("Server AI unavailable (quota/billing). Using free local generator instead.");
    return generateArrangement(params);
  }
}

els.btnGenerate.addEventListener("click", async () => {
  resetAudioOutputs();
  resetVoiceOutputs();
  const params = getParams();
  try {
    els.btnGenerate.disabled = true;
    els.btnRandomize.disabled = true;
    setStatus(els.useAi?.checked ? "Generating arrangement with AI…" : "Generating arrangement…");
    setProgress(10);
    currentArrangement = await generateArrangementMaybeAi(params);
    currentArrangement = applyMelodyToArrangement(currentArrangement, currentMelody);
    printArrangement(currentArrangement);
    setStatus("Arrangement generated. Render to WAV when ready.");
    setProgress(0);
  } catch (e) {
    console.error(e);
    setStatus(`Generate failed: ${e?.message || String(e)}`);
    setProgress(0);
  } finally {
    els.btnGenerate.disabled = false;
    els.btnRandomize.disabled = false;
  }
});

if (els.btnNewTake) {
  els.btnNewTake.addEventListener("click", () => {
    variationSeed = String(Date.now() + Math.random());
    setStatus("New take ready. Click Generate.");
    setProgress(0);
  });
}

els.btnRandomize.addEventListener("click", async () => {
  resetAudioOutputs();
  resetVoiceOutputs();
  variationSeed = String(Date.now() + Math.random());
  setParams(randomizeParams(getParams()));
  const params = getParams();
  try {
    els.btnGenerate.disabled = true;
    els.btnRandomize.disabled = true;
    setStatus(els.useAi?.checked ? "Randomized. Generating with AI…" : "Randomized. Generating…");
    setProgress(10);
    currentArrangement = await generateArrangementMaybeAi(params);
    currentArrangement = applyMelodyToArrangement(currentArrangement, currentMelody);
    printArrangement(currentArrangement);
    setStatus("Randomized + generated. Render to WAV when ready.");
    setProgress(0);
  } catch (e) {
    console.error(e);
    setStatus(`Randomize failed: ${e?.message || String(e)}`);
    setProgress(0);
  } finally {
    els.btnGenerate.disabled = false;
    els.btnRandomize.disabled = false;
  }
});

// Lyrics-first: as you type lyrics, the next Generate uses them.
// (We don’t auto-render audio to avoid heavy work on every keystroke.)
if (els.lyrics) {
  let t = null;
  els.lyrics.addEventListener("input", () => {
    if (t) clearTimeout(t);
    t = setTimeout(() => {
      const params = getParams();
      currentArrangement = generateArrangement(params);
      currentArrangement = applyMelodyToArrangement(currentArrangement, currentMelody);
      printArrangement(currentArrangement);
      setStatus("Updated arrangement from lyrics. Render to WAV when ready.");
      setProgress(0);
      resetAudioOutputs();
      resetVoiceOutputs();
    }, 250);
  });
}

els.btnRender.addEventListener("click", async () => {
  resetAudioOutputs();
  const params = getParams();
  const instrumentFlags = getInstrumentFlags();

  if (!currentArrangement) {
    currentArrangement = generateArrangement(params);
    printArrangement(currentArrangement);
  }

  const enabledCount = Object.values(instrumentFlags).filter(Boolean).length;
  if (enabledCount === 0) {
    setStatus("Select at least one instrument.");
    return;
  }

  try {
    els.btnRender.disabled = true;
    els.btnGenerate.disabled = true;
    els.btnRandomize.disabled = true;
    setProgress(1);
    setStatus("Rendering audio offline…");

    const { wavBlob, durationSec } = await renderArrangementToWav(currentArrangement, {
      instrumentFlags,
      onProgress: (p) => setProgress(5 + p * 95),
    });

    currentWav = wavBlob;
    const url = URL.createObjectURL(wavBlob);
    els.downloadLink.href = url;
    els.downloadLink.classList.remove("disabled");
    els.btnPlay.disabled = false;

    audioEl = new Audio(url);
    audioEl.preload = "auto";

    setStatus(`Rendered ${durationSec.toFixed(1)}s WAV. You can play or download.`);
    setProgress(100);
  } catch (e) {
    console.error(e);
    setStatus(`Render failed: ${e?.message || String(e)}`);
    setProgress(0);
  } finally {
    els.btnRender.disabled = false;
    els.btnGenerate.disabled = false;
    els.btnRandomize.disabled = false;
  }
});

els.btnPlay.addEventListener("click", async () => {
  if (!audioEl) return;
  try {
    await audioEl.play();
    setStatus("Playing…");
  } catch (e) {
    setStatus("Browser blocked autoplay. Click again or interact with the page.");
  }
});

els.btnVoice.addEventListener("click", async () => {
  resetVoiceOutputs();
  const params = getParams();
  const text = (params.lyrics || "").trim();
  if (!text) {
    setStatus("Type lyrics first, then Generate voice.");
    return;
  }
  try {
    els.btnVoice.disabled = true;
    setStatus("Generating voice…");
    setProgress(15);

    const r = await fetch(apiUrl("/api/voice"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, style: 0.35, stability: 0.5, similarity_boost: 0.75 }),
    });
    if (!r.ok) {
      if (r.status === 402) {
        throw new Error("Voice API requires a paid plan. Upgrade your voice provider plan, then redeploy on Vercel.");
      }
      const txt = await r.text().catch(() => "");
      throw new Error(`Voice failed (${r.status}): ${txt.slice(0, 200)}`);
    }
    const blob = await r.blob();
    currentVoice = blob;
    const url = URL.createObjectURL(blob);
    els.voiceDownloadLink.href = url;
    els.voiceDownloadLink.classList.remove("disabled");
    els.btnVoicePlay.disabled = false;
    voiceEl = new Audio(url);
    voiceEl.preload = "auto";
    setStatus("Voice generated. You can play or download.");
    setProgress(0);
  } catch (e) {
    console.error(e);
    setStatus(`Voice failed: ${e?.message || String(e)}`);
    setProgress(0);
  } finally {
    els.btnVoice.disabled = false;
  }
});

els.btnVoicePlay.addEventListener("click", async () => {
  if (!voiceEl) return;
  try {
    await voiceEl.play();
    setStatus("Playing voice…");
  } catch (e) {
    setStatus("Browser blocked autoplay. Click again or interact with the page.");
  }
});

// Suno full-song generation
if (els.btnSunoGenerate && els.btnSunoStems) {
  if (els.sunoVocalUpload) {
    els.sunoVocalUpload.addEventListener("change", () => {
      const f = els.sunoVocalUpload?.files?.[0];
      currentVocalRefFile = f || null;
      vocalRefBlob = null;
      clearVocalRefPreviewUrl();
      if (els.sunoVocalUploadName) {
        els.sunoVocalUploadName.textContent = f ? `Voice reference attached: ${f.name}` : "No vocal reference attached.";
      }
      renderReferenceHints();
      updateVocalRefPreviewState();
    });
  }
  if (els.btnVocalRefRec && els.btnVocalRefStop) {
    els.btnVocalRefRec.addEventListener("click", async () => {
      try {
        await startVocalReferenceRecording();
      } catch (e) {
        setStatus(`Microphone access failed: ${e?.message || String(e)}`);
      }
    });
    els.btnVocalRefStop.addEventListener("click", () => {
      stopVocalReferenceRecording();
    });
  }
  const syncVocalModeUi = () => {
    const instrumental = String(els.vocalInstrumentalOnly?.value || "0") === "1";
    if (els.vocalModeFull) els.vocalModeFull.classList.toggle("active", !instrumental);
    if (els.vocalModeInstrumental) els.vocalModeInstrumental.classList.toggle("active", instrumental);
  };
  if (els.vocalModeFull) {
    els.vocalModeFull.addEventListener("click", () => {
      if (els.vocalInstrumentalOnly) els.vocalInstrumentalOnly.value = "0";
      syncVocalModeUi();
    });
  }
  if (els.vocalModeInstrumental) {
    els.vocalModeInstrumental.addEventListener("click", () => {
      if (els.vocalInstrumentalOnly) els.vocalInstrumentalOnly.value = "1";
      syncVocalModeUi();
    });
  }
  syncVocalModeUi();
  const setGenerateFieldsLocked = (locked) => {
    const lockPreviewAllowed = !locked && Boolean(getVocalReferenceFile());
    if (els.sunoPrompt) els.sunoPrompt.disabled = locked;
    if (els.sunoStyle) els.sunoStyle.disabled = locked;
    if (els.sunoTitle) els.sunoTitle.disabled = locked;
    if (els.sunoReferenceMode) els.sunoReferenceMode.disabled = locked;
    if (els.sunoVocalUpload) els.sunoVocalUpload.disabled = locked;
    if (els.btnLyricsMagic) els.btnLyricsMagic.disabled = locked;
    if (els.btnMagicUploadVocal) els.btnMagicUploadVocal.disabled = locked;
    if (els.btnMagicRecordVocal) els.btnMagicRecordVocal.disabled = locked;
    if (els.vocalModeFull) els.vocalModeFull.disabled = locked;
    if (els.vocalModeInstrumental) els.vocalModeInstrumental.disabled = locked;
    if (els.btnPreviewVocalRef) els.btnPreviewVocalRef.disabled = locked ? true : !lockPreviewAllowed;
    if (els.btnVocalRefStop) els.btnVocalRefStop.disabled = true;
    if (els.btnOpenAdvancedSheet) els.btnOpenAdvancedSheet.disabled = locked;
    if (els.btnGenerateOrb) els.btnGenerateOrb.disabled = locked;
    document.body.classList.toggle("generateLocked", Boolean(locked));
  };

  const countSentences = (text) => {
    const t = String(text || "").trim();
    if (!t) return 0;
    const parts = t.split(/[.!?\n]+/).map((p) => p.trim()).filter(Boolean);
    return parts.length;
  };
  const detectLyricsMode = (text) => {
    const t = String(text || "");
    const count = countSentences(t);
    const hasSections = /\[(verse|chorus|bridge|outro|intro|final chorus|pre-chorus|hook|refrain)/i.test(t);
    if (hasSections && count >= 8) return "arrange";
    if (count >= 3) return "continue";
    return "full";
  };

  const generateLyricsWithMagic = async () => {
    if (!els.sunoPrompt) return;
    const lyricsBoxEl = els.sunoPrompt.closest(".lyricsBox");
    const seed = String(els.sunoPrompt.value || "").trim();
    const mode = detectLyricsMode(seed);
    const style = String(els.sunoStyle?.value || "").trim();
    const dialect = String(els.sunoDialect?.value || "").trim();
    const dialectHint = String(els.sunoDialectHint?.value || "").trim();
    try {
      if (els.btnLyricsMagic) {
        els.btnLyricsMagic.disabled = true;
        els.btnLyricsMagic.textContent = "…";
      }
      if (lyricsBoxEl) lyricsBoxEl.classList.add("generating");
      if (els.sunoPrompt) els.sunoPrompt.disabled = true;
      if (els.sunoStyle) els.sunoStyle.disabled = true;
      setStatus(mode === "continue" ? "AI is continuing your lyrics…" : mode === "arrange" ? "AI is arranging your lyrics for singing…" : "AI is writing structured lyrics…");
      const r = await fetch(apiUrl("/api/lyrics"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ seed, style, mode, dialect, dialectHint }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data?.error || "Lyrics generation failed");
      const nextLyrics = String(data?.lyrics || "").trim();
      if (!nextLyrics) throw new Error("No lyrics returned");
      if (mode === "continue" && seed) {
        els.sunoPrompt.value = `${seed}\n\n${nextLyrics}`.trim();
      } else {
        els.sunoPrompt.value = nextLyrics;
      }
      if (lyricsBoxEl) lyricsBoxEl.classList.add("wandGenerated");
      const provider = String(data?.provider || "").trim();
      const debugSuno = String(data?.debug?.suno || "").trim();
      const debugGemini = String(data?.debug?.gemini || "").trim();
      const providerNote = provider === "fallback" ? " (fallback mode)" : provider ? ` (${provider})` : "";
      const debugNote = debugSuno || debugGemini ? ` [suno:${debugSuno || "-"} gemini:${debugGemini || "-"}]` : "";
      setStatus(`Lyrics ready${providerNote}${debugNote}. Review and then generate song.`);
    } catch (e) {
      setStatus(`Lyrics assist failed: ${e?.message || String(e)}`);
    } finally {
      if (els.sunoPrompt) els.sunoPrompt.disabled = false;
      if (els.sunoStyle) els.sunoStyle.disabled = false;
      if (lyricsBoxEl) lyricsBoxEl.classList.remove("generating");
      if (els.btnLyricsMagic) {
        els.btnLyricsMagic.disabled = false;
        els.btnLyricsMagic.textContent = "✦";
      }
    }
  };

  const openImageMoodModal = () => {
    if (!els.imageMoodModal) return;
    els.imageMoodModal.style.display = "";
    els.imageMoodModal.setAttribute("aria-hidden", "false");
  };
  const closeImageMoodModal = () => {
    if (!els.imageMoodModal) return;
    els.imageMoodModal.style.display = "none";
    els.imageMoodModal.setAttribute("aria-hidden", "true");
  };
  const fileToDataUrl = (file) => new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result || ""));
    fr.onerror = () => reject(new Error("Could not read image file"));
    fr.readAsDataURL(file);
  });
  const downscaleImageDataUrl = async (dataUrl, maxSide = 1600, quality = 0.82) => {
    if (!String(dataUrl).startsWith("data:image/")) return dataUrl;
    const img = await new Promise((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error("Could not decode image"));
      i.src = dataUrl;
    });
    const w = Number(img.width || 0);
    const h = Number(img.height || 0);
    if (!w || !h) return dataUrl;
    const scale = Math.min(1, maxSide / Math.max(w, h));
    const tw = Math.max(1, Math.round(w * scale));
    const th = Math.max(1, Math.round(h * scale));
    const canvas = document.createElement("canvas");
    canvas.width = tw;
    canvas.height = th;
    const ctx = canvas.getContext("2d");
    if (!ctx) return dataUrl;
    ctx.drawImage(img, 0, 0, tw, th);
    // Force jpeg for much smaller payloads.
    return canvas.toDataURL("image/jpeg", quality);
  };
  const renderImageMood = (m) => {
    if (!els.imageMoodOutput) return;
    if (!m) {
      els.imageMoodOutput.textContent = "No analysis yet.";
      return;
    }
    const tags = Array.isArray(m.tags) ? m.tags.join(", ") : "";
    const lines = [
      m.concept ? `Mood: ${m.concept}` : "",
      tags ? `Suggested tags: ${tags}` : "",
      m.lyricSeed ? `Lyric seed: ${m.lyricSeed}` : "",
      m.artworkHint ? `Artwork hint: ${m.artworkHint}` : "",
      m.source ? `Source: ${m.source}` : "",
    ].filter(Boolean);
    els.imageMoodOutput.textContent = lines.join("\n\n") || "No analysis yet.";
  };
  const analyzeImageMood = async () => {
    const file = els.imageMoodUpload?.files?.[0];
    if (!file) {
      setStatus("Please upload an image first.");
      return;
    }
    try {
      if (els.btnAnalyzeImageMood) els.btnAnalyzeImageMood.disabled = true;
      if (els.btnApplyImageMood) els.btnApplyImageMood.disabled = true;
      const card = els.imageMoodOutput?.closest?.(".imageMoodCard");
      if (card) card.classList.add("analyzing");
      let dataUrl = await fileToDataUrl(file);
      dataUrl = await downscaleImageDataUrl(dataUrl, 1600, 0.82);
      // Safety cap: keep request under Vercel payload limits.
      if (dataUrl.length > 1_800_000) {
        dataUrl = await downscaleImageDataUrl(dataUrl, 1280, 0.72);
      }
      const r = await fetch(apiUrl("/api/image-mood"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: dataUrl }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d?.error || "Image analysis failed");
      imageMoodData = d || null;
      renderImageMood(imageMoodData);
      if (els.btnApplyImageMood) els.btnApplyImageMood.disabled = !imageMoodData;
      if (els.imageMoodSummary) {
        const tags = Array.isArray(d?.tags) ? d.tags.slice(0, 4).join(", ") : "";
        els.imageMoodSummary.textContent = tags || String(d?.concept || "Image mood ready.");
      }
      setStatus("Image mood ready. Tap apply to use it.");
    } catch (e) {
      setStatus(`Image mood failed: ${e?.message || String(e)}`);
    } finally {
      if (els.btnAnalyzeImageMood) els.btnAnalyzeImageMood.disabled = false;
      const card = els.imageMoodOutput?.closest?.(".imageMoodCard");
      if (card) card.classList.remove("analyzing");
    }
  };
  const applyImageMood = () => {
    if (!imageMoodData) return;
    const tags = Array.isArray(imageMoodData.tags) ? imageMoodData.tags.filter(Boolean) : [];
    if (els.sunoStyle && tags.length) {
      const existing = String(els.sunoStyle.value || "").trim();
      const current = existing ? existing.split(",").map((s) => s.trim()).filter(Boolean) : [];
      const merged = [...new Set([...current, ...tags])].slice(0, 12);
      els.sunoStyle.value = merged.join(", ");
    }
    // Do not auto-fill lyric seed into the main lyrics box.
    // This can be sung literally by the model and sounds like prompt leakage.
    imageMoodAppliedForNextGen = true;
    if (els.sunoArtworkStyle && imageMoodData.artworkHint) {
      const cur = String(els.sunoArtworkStyle.value || "").trim();
      if (!cur) els.sunoArtworkStyle.value = String(imageMoodData.artworkHint).trim();
    }
    if (els.imageMoodUseAsCover?.checked && imageMoodCoverDataUrl) {
      pendingGeneratedCoverDataUrl = imageMoodCoverDataUrl;
      if (els.imageMoodSummary) els.imageMoodSummary.textContent = "Image mood ready • cover will be used for next generation.";
    } else {
      pendingGeneratedCoverDataUrl = "";
    }
    closeImageMoodModal();
    setStatus("Image mood applied. If no lyrics are provided, generation will be instrumental.");
    syncGenerateOrbVisibility();
  };

  if (els.btnLyricsMagic) {
    let longPressTimer = null;
    let longPressTriggered = false;
    const closeMagicMenu = () => {
      if (els.lyricsMagicMenu) els.lyricsMagicMenu.style.display = "none";
    };
    const openMagicMenu = () => {
      if (els.lyricsMagicMenu) els.lyricsMagicMenu.style.display = "";
    };
    const startLongPress = () => {
      longPressTriggered = false;
      clearTimeout(longPressTimer);
      longPressTimer = setTimeout(() => {
        longPressTriggered = true;
        openMagicMenu();
      }, 480);
    };
    const cancelLongPress = () => {
      clearTimeout(longPressTimer);
    };
    els.btnLyricsMagic.addEventListener("mousedown", startLongPress);
    els.btnLyricsMagic.addEventListener("touchstart", startLongPress, { passive: true });
    els.btnLyricsMagic.addEventListener("mouseup", cancelLongPress);
    els.btnLyricsMagic.addEventListener("mouseleave", cancelLongPress);
    els.btnLyricsMagic.addEventListener("touchend", cancelLongPress);
    els.btnLyricsMagic.addEventListener("click", () => {
      if (longPressTriggered) return;
      closeMagicMenu();
      void generateLyricsWithMagic();
    });
    if (els.btnMagicUploadVocal) {
      els.btnMagicUploadVocal.addEventListener("click", () => {
        closeMagicMenu();
        openVocalReferencePicker();
      });
    }
    if (els.btnMagicRecordVocal) {
      els.btnMagicRecordVocal.addEventListener("click", () => {
        closeMagicMenu();
        openVocalRecorderModal();
      });
    }
    document.addEventListener("click", (e) => {
      const t = e.target;
      if (!t) return;
      if (t === els.btnLyricsMagic || t.closest?.("#lyricsMagicMenu")) return;
      closeMagicMenu();
    });
  }
  if (els.btnImageMood) {
    els.btnImageMood.addEventListener("click", openImageMoodModal);
  }
  if (els.btnCloseImageMood) {
    els.btnCloseImageMood.addEventListener("click", closeImageMoodModal);
  }
  if (els.imageMoodModal) {
    els.imageMoodModal.addEventListener("click", (e) => {
      if (e.target === els.imageMoodModal) closeImageMoodModal();
    });
  }
  if (els.imageMoodUpload) {
    els.imageMoodUpload.addEventListener("change", () => {
      const file = els.imageMoodUpload.files?.[0];
      if (!file) return;
      imageMoodData = null;
      renderImageMood(null);
      if (els.btnApplyImageMood) els.btnApplyImageMood.disabled = true;
      const preview = URL.createObjectURL(file);
      if (els.imageMoodPreview) {
        els.imageMoodPreview.src = preview;
        els.imageMoodPreview.style.display = "";
      }
      fileToDataUrl(file).then((v) => { imageMoodCoverDataUrl = v; }).catch(() => { imageMoodCoverDataUrl = ""; });
    });
  }
  if (els.btnAnalyzeImageMood) {
    els.btnAnalyzeImageMood.addEventListener("click", () => void analyzeImageMood());
  }
  if (els.btnApplyImageMood) {
    els.btnApplyImageMood.addEventListener("click", applyImageMood);
  }
  if (els.btnCloseVocalRecorder) {
    els.btnCloseVocalRecorder.addEventListener("click", closeVocalRecorderModal);
  }
  if (els.vocalRecorderBackdrop) {
    els.vocalRecorderBackdrop.addEventListener("click", closeVocalRecorderModal);
  }
  if (els.btnRecorderToggle) {
    els.btnRecorderToggle.addEventListener("click", async () => {
      const isRecording = Boolean(vocalRefRecorder && vocalRefRecorder.state === "recording");
      if (!isRecording) {
        try {
          await startVocalReferenceRecording();
        } catch (e) {
          setStatus(`Microphone access failed: ${e?.message || String(e)}`);
          return;
        }
        if (els.btnRecorderToggle) els.btnRecorderToggle.classList.add("isRecording");
        if (els.recorderStatus) els.recorderStatus.textContent = "Recording… tap again to stop";
      } else {
        stopVocalReferenceRecording();
        if (els.btnRecorderToggle) els.btnRecorderToggle.classList.remove("isRecording");
        if (els.recorderStatus) els.recorderStatus.textContent = "Recorded. Tap Use recording.";
      }
    });
  }
  if (els.btnRecorderUse) {
    els.btnRecorderUse.addEventListener("click", () => {
      // The recording is already promoted to currentVocalRefFile in
      // MediaRecorder.onstop. If a stale blob is still around, promote it now
      // as a safety net. Either way, just close the modal.
      if (vocalRefBlob && !currentVocalRefFile) {
        const recordedFile = new File(
          [vocalRefBlob],
          "vocal-reference.webm",
          { type: vocalRefBlob.type || "audio/webm" }
        );
        if (els.sunoVocalUpload) els.sunoVocalUpload.value = "";
        setVocalRefFile(recordedFile, "Voice reference recorded and attached.");
      }
      if (!getVocalReferenceFile()) return;
      closeVocalRecorderModal();
    });
  }
  if (els.btnPreviewVocalRef) {
    els.btnPreviewVocalRef.addEventListener("click", async () => {
      const f = getVocalReferenceFile();
      if (!f) return;
      clearVocalRefPreviewUrl();
      vocalRefPreviewUrl = URL.createObjectURL(f);
      try {
        const a = new Audio(vocalRefPreviewUrl);
        await a.play();
      } catch (e) {
        setStatus(`Preview failed: ${e?.message || String(e)}`);
      }
    });
  }
  const showResultCard = (show) => {
    if (!els.resultCard) return;
    els.resultCard.style.display = show ? "" : "none";
    if (els.resultCard2) els.resultCard2.style.display = show && (lastSunoFullUrl2 || lastSunoProxyUrl2) ? "" : "none";
    if (!show) {
      syncGenerateOrbVisibility();
      return;
    }
    if (els.resultTitle) els.resultTitle.textContent = lastSunoTitle || "Generated song";
    if (els.resultArt) {
      const fallbackCover = "/assets/nabadai-logo.png";
      els.resultArt.src = lastSunoArtUrl || fallbackCover;
      els.resultArt.style.display = "";
    }
    if (els.resultDownload) {
      const downloadUrl = lastSunoCachedUrl || lastSunoProxyUrl || lastSunoFullUrl;
      if (downloadUrl) {
        els.resultDownload.href = downloadUrl;
        els.resultDownload.classList.remove("disabled");
      } else {
        els.resultDownload.href = "#";
        els.resultDownload.classList.add("disabled");
      }
    }
    if (els.btnResultOpenDirect) {
      if (lastSunoProxyUrl || lastSunoFullUrl) {
        els.btnResultOpenDirect.href = lastSunoProxyUrl || lastSunoFullUrl;
        els.btnResultOpenDirect.classList.remove("disabled");
      } else {
        els.btnResultOpenDirect.href = "#";
        els.btnResultOpenDirect.classList.add("disabled");
      }
    }
    if (els.resultTitle2) els.resultTitle2.textContent = lastSunoTitle2 || "Generated song B";
    if (els.resultArt2) {
      const fallbackCover = "/assets/nabadai-logo.png";
      els.resultArt2.src = lastSunoArtUrl2 || lastSunoArtUrl || fallbackCover;
      els.resultArt2.style.display = "";
    }
    if (els.resultDownload2) {
      const downloadUrl2 = lastSunoCachedUrl2 || lastSunoProxyUrl2 || lastSunoFullUrl2;
      if (downloadUrl2) {
        els.resultDownload2.href = downloadUrl2;
        els.resultDownload2.classList.remove("disabled");
      } else {
        els.resultDownload2.href = "#";
        els.resultDownload2.classList.add("disabled");
      }
    }
    if (els.btnResultOpenDirect2) {
      if (lastSunoProxyUrl2 || lastSunoFullUrl2) {
        els.btnResultOpenDirect2.href = lastSunoProxyUrl2 || lastSunoFullUrl2;
        els.btnResultOpenDirect2.classList.remove("disabled");
      } else {
        els.btnResultOpenDirect2.href = "#";
        els.btnResultOpenDirect2.classList.add("disabled");
      }
    }
    syncGenerateOrbVisibility();
  };
  const setGenerateBtn = (label, disabled, mode) => {
    els.btnSunoGenerate.textContent = label;
    els.btnSunoGenerate.disabled = disabled;
    els.btnSunoGenerate.dataset.mode = mode;
    syncGenerateOrbVisibility();
    updateBrandPulse();
  };

  const fetchGenerationStatus = async () => {
    if (!sunoTaskId) return null;
    const r = await fetch(`/api/suno/status?taskId=${encodeURIComponent(sunoTaskId)}`);
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data?.error || "Status failed");
    const status = String(data?.data?.status || data?.status || "").toUpperCase();
    const genData = data?.data?.response?.sunoData || data?.data?.response?.suno_data || [];
    const first = Array.isArray(genData) ? genData[0] : null;
    const second = Array.isArray(genData) ? genData[1] : null;
    const audioUrl =
      first?.sourceAudioUrl ||
      first?.source_audio_url ||
      first?.sourceStreamAudioUrl ||
      first?.source_stream_audio_url ||
      first?.audioUrl ||
      first?.audio_url ||
      first?.streamAudioUrl ||
      first?.stream_audio_url ||
      "";
    const imageUrl =
      first?.sourceImageUrl ||
      first?.source_image_url ||
      first?.imageUrl ||
      first?.image_url ||
      first?.coverUrl ||
      first?.cover_url ||
      null;
    const title = first?.title || first?.songTitle || first?.song_title || "";
    sunoAudioId =
      first?.id ||
      first?.audioId ||
      first?.audio_id ||
      first?.songId ||
      first?.song_id ||
      null;
    printSuno({ status, taskId: sunoTaskId, first });
    if (audioUrl) {
      lastSunoFullUrl = audioUrl;
      lastSunoProxyUrl = toAudioProxyUrl(audioUrl);
      lastSunoArtUrl = imageUrl || lastSunoArtUrl;
      if (pendingGeneratedCoverDataUrl) {
        lastSunoArtUrl = pendingGeneratedCoverDataUrl;
      }
      lastSunoTitle = String(title || "").trim() || lastSunoTitle;
      setLink(els.sunoFullLink, lastSunoProxyUrl || audioUrl);
      await cacheGeneratedAudio(lastSunoProxyUrl || audioUrl);
      if (els.btnLoadFull) els.btnLoadFull.disabled = false;
    }
    const audioUrl2 =
      second?.sourceAudioUrl ||
      second?.source_audio_url ||
      second?.sourceStreamAudioUrl ||
      second?.source_stream_audio_url ||
      second?.audioUrl ||
      second?.audio_url ||
      second?.streamAudioUrl ||
      second?.stream_audio_url ||
      "";
    const imageUrl2 =
      second?.sourceImageUrl ||
      second?.source_image_url ||
      second?.imageUrl ||
      second?.image_url ||
      second?.coverUrl ||
      second?.cover_url ||
      null;
    const title2 = second?.title || second?.songTitle || second?.song_title || "";
    lastSunoAudioId2 =
      second?.id ||
      second?.audioId ||
      second?.audio_id ||
      second?.songId ||
      second?.song_id ||
      "";
    if (audioUrl2) {
      lastSunoFullUrl2 = audioUrl2;
      lastSunoProxyUrl2 = toAudioProxyUrl(audioUrl2);
      lastSunoArtUrl2 = imageUrl2 || "";
      if (pendingGeneratedCoverDataUrl) {
        lastSunoArtUrl2 = pendingGeneratedCoverDataUrl;
      }
      lastSunoTitle2 = String(title2 || "").trim() || "Generated song B";
      await cacheGeneratedAudio2(lastSunoProxyUrl2 || audioUrl2);
    }
    return { status, hasAudio: Boolean(lastSunoFullUrl || audioUrl) };
  };

  const startGeneratePolling = () => {
    if (generatePollTimer) clearInterval(generatePollTimer);
    let tries = 0;
    const maxTries = 160; // ~12 minutes at 4.5s interval
    generatePollTimer = setInterval(async () => {
      tries += 1;
      try {
        const state = await fetchGenerationStatus();
        if (!state) return;
        if (state.status === "SUCCESS" && state.hasAudio) {
          clearInterval(generatePollTimer);
          generatePollTimer = null;
          setGenerateBtn("Regenerate", false, "generate");
          showResultCard(true);
          addToLibrary({
            title: lastSunoTitle,
            artUrl: lastSunoArtUrl,
            url: lastSunoProxyUrl || lastSunoFullUrl,
            taskId: sunoTaskId || "",
            audioId: sunoAudioId || "",
            kind: "full",
            meta: lastGenerationMeta,
          });
          if (lastSunoProxyUrl2 || lastSunoFullUrl2) {
            addToLibrary({
              title: lastSunoTitle2 || "Generated song B",
              artUrl: lastSunoArtUrl2 || lastSunoArtUrl || "",
              url: lastSunoProxyUrl2 || lastSunoFullUrl2,
              taskId: sunoTaskId || "",
              audioId: lastSunoAudioId2 || "",
              kind: "full",
              meta: lastGenerationMeta,
            });
          }
          pendingGeneratedCoverDataUrl = "";
          els.btnSunoStems.disabled = !(sunoAudioId);
          if (els.btnSunoMultiStems) els.btnSunoMultiStems.disabled = !(sunoAudioId);
          setStatus("Song is ready. Press Play full.");
          savePendingBackendTask("");
          markGenerationReadyNotice();
          // Avoid stale vocal reference leaking into the next generation.
          clearVocalReferenceSelection();
          setGenerateFieldsLocked(false);
          return;
        }
        if (state.status === "FAILED") {
          clearInterval(generatePollTimer);
          generatePollTimer = null;
          setGenerateBtn("Generate song", false, "generate");
          setStatus("Generation failed. Please try again.");
          savePendingBackendTask("");
          clearVocalReferenceSelection();
          setGenerateFieldsLocked(false);
          setLoading(false);
        }
        if (tries >= maxTries) {
          clearInterval(generatePollTimer);
          generatePollTimer = null;
          setGenerateBtn("Check status", false, "resume");
          setStatus("Still processing in backend. Tap Check status.");
          setGenerateFieldsLocked(false);
          setLoading(true, { title: "Processing in backend...", sub: "You can keep using the app. Tap Check status anytime." });
        }
      } catch {}
    }, 4500);
  };

  const stopStemsPolling = () => {
    if (stemsPollTimer) clearInterval(stemsPollTimer);
    stemsPollTimer = null;
  };
  const setStemsBtn = (label, disabled) => {
    if (!els.btnSunoStems) return;
    els.btnSunoStems.textContent = label;
    els.btnSunoStems.disabled = disabled;
  };
  const setMultiStemsBtn = (label, disabled) => {
    if (!els.btnSunoMultiStems) return;
    els.btnSunoMultiStems.textContent = label;
    els.btnSunoMultiStems.disabled = disabled;
  };
  const stopMultiStemsPolling = () => {
    if (multiStemsPollTimer) clearInterval(multiStemsPollTimer);
    multiStemsPollTimer = null;
  };
  const startStemsPolling = () => {
    if (!sunoStemsTaskId) return;
    stopStemsPolling();
    let tries = 0;
    const maxTries = 60; // ~4.5 min
    stemsPollTimer = setInterval(async () => {
      tries += 1;
      try {
        const r = await fetch(`/api/suno/stems_status?taskId=${encodeURIComponent(sunoStemsTaskId)}`);
        const data = await r.json().catch(() => ({}));
        printSunoStems({ poll: "instrumental", taskId: sunoStemsTaskId, tries, data });
        if (!r.ok) return;
        const flag =
          data?.data?.successFlag ||
          data?.data?.status ||
          data?.successFlag ||
          data?.status ||
          "";
        const resp = data?.data?.response || data?.response || data || {};
        const vocalUrl =
          deepFindFirstStringByKeys(resp, ["vocalUrl", "vocal_url"]) ||
          deepFindFirstStringByKeys(data, ["vocalUrl", "vocal_url"]);
        const instrumentalUrl =
          deepFindFirstStringByKeys(resp, ["instrumentalUrl", "instrumental_url", "accompanimentUrl"]) ||
          deepFindFirstStringByKeys(data, ["instrumentalUrl", "instrumental_url", "accompanimentUrl"]);
        const doneByUrls = Boolean(vocalUrl || instrumentalUrl);
        if (String(flag).toUpperCase() === "SUCCESS" || doneByUrls) {
          stopStemsPolling();
          lastSunoVocalUrl = vocalUrl || "";
          lastSunoInstUrl = instrumentalUrl || "";
          lastSunoInstProxyUrl = lastSunoInstUrl ? toAudioProxyUrl(lastSunoInstUrl) : "";
          setLink(els.sunoVocalLink, lastSunoVocalUrl || null);
          setLink(els.sunoInstLink, lastSunoInstProxyUrl || lastSunoInstUrl || null);
          if (els.btnLoadVocals) els.btnLoadVocals.disabled = !lastSunoVocalUrl;
          if (els.btnLoadInstrumental) els.btnLoadInstrumental.disabled = !lastSunoInstUrl;
          if (els.btnPlayVocals) els.btnPlayVocals.disabled = !lastSunoVocalUrl;
          if (els.btnPlayInstrumental) els.btnPlayInstrumental.disabled = !lastSunoInstUrl;
          setStatus("Instrumental version is ready.");
          if (lastSunoInstUrl) {
            addToLibrary({
              title: `${lastSunoTitle || "Generated song"} • Instrumental`,
              artUrl: lastSunoArtUrl || "",
              url: lastSunoInstProxyUrl || lastSunoInstUrl,
              kind: "instrumental",
            });
          }
          setLoading(false);
          setStemsBtn("Get instrumental version", false);
          void refreshSunoCredits();
          return;
        }
        const failed = String(flag).toUpperCase() === "FAILED";
        if (failed || tries >= maxTries) {
          stopStemsPolling();
          const reason =
            data?.data?.message ||
            data?.message ||
            data?.error ||
            "Instrumental processing failed or timed out.";
          setStatus(`Instrumental failed: ${reason}`);
          setLoading(false);
          setStemsBtn("Get instrumental version", false);
        }
      } catch {}
    }, 4500);
  };
  const startMultiStemsPolling = () => {
    if (!sunoMultiStemsTaskId) return;
    stopMultiStemsPolling();
    let tries = 0;
    const maxTries = 80; // ~6 min
    multiStemsPollTimer = setInterval(async () => {
      tries += 1;
      try {
        const r = await fetch(`/api/suno/stems_status?taskId=${encodeURIComponent(sunoMultiStemsTaskId)}`);
        const data = await r.json().catch(() => ({}));
        printSunoStems({ poll: "multi", taskId: sunoMultiStemsTaskId, tries, data });
        if (!r.ok) return;
        const flag =
          data?.data?.successFlag ||
          data?.data?.status ||
          data?.successFlag ||
          data?.status ||
          "";
        const resp = data?.data?.response || data?.response || data || {};
        const anyStemUrl = deepFindFirstStringByKeys(resp, [
          "drumsUrl",
          "bassUrl",
          "guitarUrl",
          "keyboardUrl",
          "percussionUrl",
          "stringsUrl",
          "synthUrl",
          "fxUrl",
          "brassUrl",
          "woodwindsUrl",
          "vocalUrl",
          "instrumentalUrl",
        ]);
        if (String(flag).toUpperCase() === "SUCCESS" || Boolean(anyStemUrl)) {
          stopMultiStemsPolling();
          printSunoStems(resp);
          if (els.btnMixerLoad) els.btnMixerLoad.disabled = false;
          setStatus("Multi-stems are ready. Load stems into mixer.");
          setLoading(false);
          setMultiStemsBtn("Get multi-stems", false);
          void refreshSunoCredits();
          return;
        }
        const failed = String(flag).toUpperCase() === "FAILED";
        if (failed || tries >= maxTries) {
          stopMultiStemsPolling();
          const reason =
            data?.data?.message ||
            data?.message ||
            data?.error ||
            "Multi-stems processing failed or timed out.";
          setStatus(`Multi-stems failed: ${reason}`);
          setLoading(false);
          setMultiStemsBtn("Get multi-stems", false);
        }
      } catch {}
    }, 5000);
  };

  const REFERENCE_MELODY_LOCK =
    "strict melody lock, follow uploaded vocal contour and phrase timing, keep topline and cadence points, no spoken instructions";
  const GROOVE_MAP = {
    slow: "tempo target 68-78 bpm, softer groove emphasis",
    balanced: "tempo target 84-96 bpm, balanced groove emphasis",
    energetic: "tempo target 104-122 bpm, energetic groove emphasis",
  };
  const PROSODY_MAP = {
    natural: "prosody mode natural: keep lyrical flow with light timing freedom",
    tight: "prosody mode tight: keep clear syllable-to-beat alignment",
    ultra: "prosody mode ultra tight: strict syllable alignment and concise phrase lengths",
  };
  const BEAT_STABILITY_MAP = {
    flexible: "beat stability flexible: allow subtle push-pull feel",
    stable: "beat stability stable: keep steady pulse and section consistency",
    locked: "beat stability locked: strict tempo and entry consistency",
  };

  function syncDefaultSelectVisual(selectEl) {
    if (!selectEl) return;
    const isDefault = String(selectEl.value || "").trim() === "";
    selectEl.classList.toggle("isDefaultOption", isDefault);
  }
[els.sunoSongKey, els.sunoMaqam, els.sunoVoiceProfile, els.sunoDialect, els.sunoPersonaId, els.sunoGroovePace, els.sunoProsody, els.sunoBeatStability].forEach((sel) => {
    if (!sel) return;
    syncDefaultSelectVisual(sel);
    sel.addEventListener("change", () => syncDefaultSelectVisual(sel));
  });

  function sanitizeLyricsPrompt(raw) {
    const txt = String(raw || "").replace(/\r/g, "");
    if (!txt.trim()) return "";
    const banned = [
      "internal rhythm/prosody rules",
      "timing lock:",
      "timing:",
      "follow-prompt behavior:",
      "follow uploaded melody",
      "avoid off-beat phrasing",
      "clipped words",
      "unstable groove",
      "spoken meta text",
      "melody lock",
      "strict melody lock",
      "keep topline and cadence points",
      "respect vocal phrasing timing",
      "melody-preserving arrangement",
      "voice stability:",
      "accent lock:",
      "build a full song around this vocal reference",
      "do not",
      "keep this timing stable",
    ];
    const lines = txt
      .split("\n")
      .map((l) => l.trimEnd())
      .filter((l) => {
        const low = l.trim().toLowerCase();
        if (!low) return false;
        return !banned.some((b) => low.includes(b));
      });
    return lines.join("\n").trim();
  }

  els.btnSunoGenerate.addEventListener("click", async () => {
    haptic("impact");
    const actionMode = String(els.btnSunoGenerate?.dataset?.mode || "generate");
    if (actionMode === "resume") {
      const resumeTask = sunoTaskId || loadPendingBackendTask();
      if (!resumeTask) {
        setStatus("No pending backend task found.");
        setGenerateBtn("Generate song", false, "generate");
        setLoading(false);
        return;
      }
      sunoTaskId = resumeTask;
      savePendingBackendTask(resumeTask);
      setStatus("Checking backend status...");
      setLoading(true, { title: "Processing in backend...", sub: "Checking latest status..." });
      setGenerateBtn("Checking...", true, "resume");
      startGeneratePolling();
      return;
    }
    const promptText = String(els.sunoPrompt?.value || "").trim();
    const vocalRefFile = getVocalReferenceFile();
    const hasUploadedReference = Boolean(vocalRefFile);
    const referenceMode = hasUploadedReference ? "humming_music" : "none";
    const hasReference = hasUploadedReference;
    if (hasReference && !vocalRefFile) {
      window.alert("Please upload or record audio reference first.");
      return;
    }
    const allowImageOnlyFlow = Boolean(imageMoodAppliedForNextGen);
    if (!promptText && !vocalRefFile && !allowImageOnlyFlow) {
      window.alert("Please write lyrics or apply image mood before generating.");
      return;
    }
    try {
      const engine = "gemini_assisted";
      const referenceInstrumentalOnly = String(els.vocalInstrumentalOnly?.value || "0") === "1";
      const modeLabel = hasReference
        ? referenceInstrumentalOnly
          ? "Reference: Instrumental only"
          : "Reference: Full song"
        : "Normal";
      const engineLabel = "Suno + Gemini lyrics assist";
      setGenerateBtn("Generating…", true, "generate");
      setGenerateFieldsLocked(true);
      showResultCard(false);
      els.btnSunoStems.disabled = true;
      if (els.btnSunoMultiStems) els.btnSunoMultiStems.disabled = true;
      setStatus(`Submitting generation… (Mode: ${modeLabel} | Engine: ${engineLabel})`);
      setProgress(5);
      setLoading(true, { title: "Processing in backend...", sub: "This can take 30–120 seconds." });

      applyMaqamToStyleInput();
      const userPrompt = (els.sunoPrompt?.value || "").trim();
      const userStyle = (els.sunoStyle?.value || "").trim();
      const artworkStyle = (els.sunoArtworkStyle?.value || "").trim();
      const dialect = String(els.sunoDialect?.value || "").trim();
      const dialectHint = String(els.sunoDialectHint?.value || "").trim();
      const timing = String(els.sunoTiming?.value || "").trim();
      const timingClause = timing
        ? `Timing lock: ${timing}. Keep this timing stable across all sections and vocal entries.`
        : "";
      const groovePace = String(els.sunoGroovePace?.value || "").trim();
      const prosodyStrictness = String(els.sunoProsody?.value || "").trim();
      const beatStability = String(els.sunoBeatStability?.value || "").trim();
      let finalPrompt = sanitizeLyricsPrompt(userPrompt);
      const imageOnlyInstrumental = Boolean(imageMoodAppliedForNextGen && !finalPrompt && !hasReference);
      if (!hasReference) {
        try {
          setStatus("Preparing prompt with Gemini… (Engine: Gemini assisted + Suno render)");
          const rr = await fetch(apiUrl("/api/lyrics"), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ seed: userPrompt, style: userStyle, mode: "arrange", dialect, dialectHint }),
          });
          const dd = await rr.json().catch(() => ({}));
          if (rr.ok && dd?.lyrics) finalPrompt = sanitizeLyricsPrompt(dd.lyrics);
        } catch {}
      }
      // In vocal-reference flow, use clean native reference handling:
      // do not pass textual prompt guidance from app internals.
      if (hasReference && referenceInstrumentalOnly) finalPrompt = "";

      const styleExtras = hasReference
        ? ""
        : [
            dialect ? `Dialect: ${dialect}` : "",
            dialectHint ? `Hint: ${dialectHint}` : "",
            timing ? timing : "",
            groovePace ? (GROOVE_MAP[groovePace] || "") : "",
            prosodyStrictness ? (PROSODY_MAP[prosodyStrictness] || "") : "",
            beatStability ? (BEAT_STABILITY_MAP[beatStability] || "") : "",
            hasReference ? REFERENCE_MELODY_LOCK : "",
          ]
            .filter(Boolean)
            .join(", ");

      const payload = {
        prompt: finalPrompt,
        style: hasReference ? String(userStyle || "").trim() : `${userStyle}${userStyle ? " | " : ""}${timingClause}, ${styleExtras}${artworkStyle ? `, cover art: ${artworkStyle}` : ""}`,
        songKey: mapSolfegeToLetterKey((els.sunoSongKey?.value || "").trim()),
        title: (els.sunoTitle?.value || "").trim(),
        customMode: true,
        instrumental: imageOnlyInstrumental,
        model: LATEST_SUNO_MODEL,
        personaId: (els.sunoPersonaId?.value || "").trim() || undefined,
      };
      const vp = String(els.sunoVoiceProfile?.value || "").trim();
      let vocalProfileClause = "";
      if (vp.includes("|")) {
        const [gender, timbre] = vp.split("|");
        payload.vocalGender = gender || undefined;
        payload.voiceTimbre = timbre || undefined;
        const timbreLower = String(timbre || "").toLowerCase();
        if (timbreLower.includes("baritone")) {
          vocalProfileClause =
            "male baritone lead, lower tessitura, warm chest resonance, controlled dynamics, avoid shouting/high belt";
        } else if (timbreLower.includes("bass")) {
          vocalProfileClause =
            "male bass lead, deep low register, dark warm tone, no high-pitched delivery, avoid shouting";
        } else if (timbreLower.includes("tenor")) {
          vocalProfileClause =
            "male tenor lead with smooth upper range, keep tone lyrical, avoid harsh or shouty attacks";
        } else if (timbreLower.includes("alto") || timbreLower.includes("mezzo") || timbreLower.includes("soprano")) {
          vocalProfileClause =
            "female lead, smooth controlled phrasing, avoid harsh or shouty delivery";
        }
      }
      if (!hasReference && vocalProfileClause) payload.style = `${payload.style}, ${vocalProfileClause}`;
      payload.style = compactStyleForProvider(payload.style, 980);
      lastGenerationMeta = {
        engine,
        mode: modeLabel,
        lyricsInput: userPrompt,
        finalPrompt,
        styleInput: userStyle,
        artworkStyle,
        styleSent: payload.style,
        dialect,
        dialectHint,
        timing,
        groovePace,
        prosodyStrictness,
        beatStability,
        songKey: (els.sunoSongKey?.value || "").trim(),
        maqam: (els.sunoMaqam?.value || "").trim(),
        voiceProfile: (els.sunoVoiceProfile?.value || "").trim(),
        model: payload.model,
        imageOnlyInstrumental,
      };
      if (imageOnlyInstrumental) {
        setStatus("Image-inspired mode with no lyrics detected: generating instrumental.");
      }
      const data = await trackCreditsAround(
        hasReference ? "Suno: upload reference song" : "Suno: generate song",
        async () => {
          if (hasReference) {
            const fd = new FormData();
            fd.append("action", "add_instrumental");
            fd.append("referenceMode", referenceInstrumentalOnly ? "humming_music" : "vocal_full");
            fd.append("file", vocalRefFile, vocalRefFile?.name || "vocal-reference.webm");
            fd.append("fileName", vocalRefFile?.name || "vocal-reference.webm");
            fd.append("fileType", vocalRefFile?.type || "audio/webm");
            fd.append("style", String(userStyle || "").trim());
            if (finalPrompt) fd.append("prompt", String(finalPrompt));
            fd.append("title", String((els.sunoTitle?.value || "").trim() || "Reference full song"));
            fd.append("model", LATEST_SUNO_MODEL);
            if (payload?.vocalGender) fd.append("vocalGender", String(payload.vocalGender));
            if (payload?.voiceTimbre) fd.append("voiceTimbre", String(payload.voiceTimbre));
            if (payload?.songKey) fd.append("songKey", String(payload.songKey));
            if (timing) fd.append("timing", String(timing));
            if (dialect) fd.append("dialect", String(dialect));
            if (dialectHint) fd.append("dialectHint", String(dialectHint));
            if (payload?.personaId) fd.append("personaId", String(payload.personaId));
            // Drop the local reference state the moment the request is in flight.
            // The server already has its own copy in the multipart body, so any
            // residual state here can only cause stale-reuse on the next run.
            try { clearVocalReferenceSelection(); } catch {}
            const rr = await fetch(apiUrl("/api/suno/stems"), { method: "POST", body: fd });
            const dd = await rr.json().catch(() => ({}));
            if (!rr.ok) {
              const more = dd?.detailMessage || dd?.details?.message || dd?.details?.error || "";
              throw new Error(`${dd?.error || "Reference upload failed"}${more ? `: ${more}` : ""}`);
            }
            if (typeof dd?.code !== "undefined" && Number(dd.code) !== 200) {
              const bodyErr = dd?.msg || dd?.message || dd?.error || "Reference upload failed";
              throw new Error(`Suno rejected reference upload: ${bodyErr}`);
            }
            if (dd?.data && typeof dd.data?.code !== "undefined" && Number(dd.data.code) !== 200) {
              const nestedErr = dd?.data?.msg || dd?.data?.message || dd?.data?.error || "Reference upload failed";
              throw new Error(`Suno rejected reference upload: ${nestedErr}`);
            }
            return dd;
          }

          const r = await fetch(apiUrl("/api/suno/generate"), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
          const d = await r.json().catch(() => ({}));
          if (!r.ok) {
            const more = d?.detailMessage || d?.details?.message || d?.details?.error || "";
            throw new Error(`${d?.error || "Suno generate failed"}${more ? `: ${more}` : ""}`);
          }
          if (typeof d?.code !== "undefined" && Number(d.code) !== 200) {
            const bodyErr = d?.msg || d?.message || d?.error || "Suno generate failed";
            throw new Error(`Suno rejected request: ${bodyErr}`);
          }
          if (d?.data && typeof d.data?.code !== "undefined" && Number(d.data.code) !== 200) {
            const nestedErr = d?.data?.msg || d?.data?.message || d?.data?.error || "Suno generate failed";
            throw new Error(`Suno rejected request: ${nestedErr}`);
          }
          return d;
        },
        payload?.model ? `model=${payload.model}` : ""
      );

      sunoTaskId = extractTaskIdLoose(data);
      savePendingBackendTask(sunoTaskId || "");
      sunoAudioId = null;
      sunoStemsTaskId = null;
      sunoMultiStemsTaskId = null;
      // The backend echoes the temporary Suno upload URL on reference flows,
      // so we can offer "Listen to reference" on the result card and prove
      // exactly which audio Suno received for melody analysis.
      lastSunoReferenceUrl = hasReference ? String(data?.uploadUrl || "") : "";
      updateListenRefButton();
      printSuno(data);
      printSunoStems(null);

      setLink(els.sunoFullLink, null);
      setLink(els.sunoVocalLink, null);
      setLink(els.sunoInstLink, null);
      lastSunoFullUrl = "";
      lastSunoProxyUrl = "";
      if (lastSunoCachedUrl) safeRevokeObjectUrl(lastSunoCachedUrl);
      lastSunoCachedUrl = "";
      lastSunoVocalUrl = "";
      lastSunoInstUrl = "";
      lastSunoArtUrl = "";
      lastSunoTitle = "";
      lastSunoFullUrl2 = "";
      lastSunoProxyUrl2 = "";
      if (lastSunoCachedUrl2) safeRevokeObjectUrl(lastSunoCachedUrl2);
      lastSunoCachedUrl2 = "";
      lastSunoArtUrl2 = "";
      lastSunoTitle2 = "";
      if (els.btnLoadFull) els.btnLoadFull.disabled = true;
      if (els.btnLoadVocals) els.btnLoadVocals.disabled = true;
      if (els.btnLoadInstrumental) els.btnLoadInstrumental.disabled = true;
      if (els.btnPlayVocals) els.btnPlayVocals.disabled = true;
      if (els.btnPlayInstrumental) els.btnPlayInstrumental.disabled = true;

      if (!sunoTaskId) {
        const providerMsg =
          data?.msg ||
          data?.message ||
          data?.error ||
          data?.data?.msg ||
          data?.data?.message ||
          "";
        const immediateFullUrl =
          deepFindFirstStringByKeys(data, ["audioUrl", "audio_url", "streamAudioUrl", "stream_audio_url"]) ||
          deepFindFirstStringByKeys(data?.data, ["audioUrl", "audio_url", "streamAudioUrl", "stream_audio_url"]) ||
          deepFindFirstStringByKeys(data?.data?.response, ["audioUrl", "audio_url", "streamAudioUrl", "stream_audio_url"]);
        if (immediateFullUrl) {
          lastSunoFullUrl = immediateFullUrl;
          lastSunoProxyUrl = toAudioProxyUrl(immediateFullUrl);
          if (els.sunoFullLink) setLink(els.sunoFullLink, lastSunoProxyUrl || immediateFullUrl);
          if (els.btnLoadFull) els.btnLoadFull.disabled = false;
          setStatus("Song ready.");
          markGenerationReadyNotice();
          setGenerateBtn("Regenerate", false, "regenerate");
          setGenerateFieldsLocked(false);
          setProgress(100);
          showResultCard(true);
          imageMoodAppliedForNextGen = false;
          void refreshSunoCredits();
          return;
        }
        setStatus(
          `Generation failed to start: provider returned no task id.${providerMsg ? ` ${providerMsg}` : ""}`
        );
        setGenerateBtn("Generate song", false, "generate");
        setGenerateFieldsLocked(false);
        setLoading(false);
        setProgress(0);
        imageMoodAppliedForNextGen = false;
        return;
      }
      setStatus(
        hasReference
          ? `Processing your audio reference in backend… (Mode: ${referenceMode} | Engine: ${engineLabel})`
          : `Processing in backend… we will update automatically. (Mode: Normal | Engine: ${engineLabel})`
      );
      setGenerateBtn("Generating…", true, "generate");
      startGeneratePolling();
      setProgress(0);
    } catch (e) {
      console.error(e);
      setStatus(`Generation failed: ${e?.message || String(e)}`);
      setGenerateBtn("Generate song", false, "generate");
      savePendingBackendTask("");
      setGenerateFieldsLocked(false);
      imageMoodAppliedForNextGen = false;
      setProgress(0);
      setLoading(false);
    } finally {}
  });

  if (els.btnResultPlay) {
    els.btnResultPlay.addEventListener("click", async () => {
      haptic("light");
      const url =
        lastSunoCachedUrl ||
        lastSunoProxyUrl ||
        lastSunoFullUrl ||
        (els.sunoFullLink?.classList.contains("disabled") ? "" : els.sunoFullLink?.href);
      if (!url || url === "#") {
        setStatus("No playable result URL yet. Please wait a moment and try again.");
        return;
      }
      // Capture the canonical http URL for downstream Share/Download.
      // The played URL might be a blob: cache or a relative proxy path,
      // neither of which the server can fetch.
      if (lastSunoFullUrl) lastPlayerHttpUrl = lastSunoFullUrl;
      await playOnPlayerPage(url && url !== "#" ? url : "", "Full song");
    });
  }
  if (els.btnResultPlay2) {
    els.btnResultPlay2.addEventListener("click", async () => {
      haptic("light");
      const url = lastSunoCachedUrl2 || lastSunoProxyUrl2 || lastSunoFullUrl2;
      if (!url || url === "#") {
        setStatus("Second track is not ready for playback yet.");
        return;
      }
      if (lastSunoFullUrl2) lastPlayerHttpUrl = lastSunoFullUrl2;
      await playOnPlayerPage(url && url !== "#" ? url : "", "Full song B", {
        title: lastSunoTitle2 || "Generated song B",
        subtitle: "Generated • Full song B",
        artUrl: lastSunoArtUrl2 || lastSunoArtUrl,
      });
    });
  }
  if (els.btnResultListenRef) {
    // Opens the exact temporary file Suno received as the vocal reference in a
    // new tab so the system audio player handles it. We deliberately avoid the
    // in-app <audio> element here: when the generated song is already loaded
    // on the same element, iOS Safari sometimes refuses to swap src cleanly
    // and keeps playing the previous track, defeating the verification.
    els.btnResultListenRef.addEventListener("click", () => {
      haptic("light");
      if (!lastSunoReferenceUrl) {
        setStatus("No reference audio recorded for this generation.");
        return;
      }
      const directUrl = lastSunoReferenceUrl;
      const proxiedUrl = toAudioProxyUrl(directUrl) || directUrl;
      setStatus("Opening reference audio Suno used…");
      const a = document.createElement("a");
      a.href = proxiedUrl;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      document.body.appendChild(a);
      try { a.click(); } finally { setTimeout(() => a.remove(), 100); }
    });
  }
  // Delegation: clicking artwork/title opens player (same as Play); buttons/links handle themselves.
  if (els.resultCard) {
    els.resultCard.addEventListener(
      "click",
      (e) => {
        if (!e.target || !(e.target instanceof Element)) return;
        if (e.target.closest("button") || e.target.closest("a")) return;
        els.btnResultPlay?.click();
      },
      { capture: true }
    );
  }
  if (els.resultCard2) {
    els.resultCard2.addEventListener(
      "click",
      (e) => {
        if (!e.target || !(e.target instanceof Element)) return;
        if (e.target.closest("button") || e.target.closest("a")) return;
        els.btnResultPlay2?.click();
      },
      { capture: true }
    );
  }

  // Auto-resume pending backend generation on reopen/reload.
  const bootPendingTask = loadPendingBackendTask();
  if (bootPendingTask && !generatePollTimer) {
    sunoTaskId = bootPendingTask;
    setGenerateBtn("Check status", false, "resume");
    setStatus("Pending backend task found. Tap Check status.");
    setLoading(true, { title: "Processing in backend...", sub: "Pending task detected from last session." });
  }

  els.btnSunoStems.addEventListener("click", async () => {
    if (!sunoTaskId || !sunoAudioId) {
      setStatus("Stems unavailable yet: song id is missing. Wait for full SUCCESS and try Refresh once.");
      return;
    }
    try {
      setStemsBtn("Getting instrumental…", true);
      setStatus("Getting your instrumental version…");
      setProgress(15);
      setLoading(true, { title: "Getting your instrumental version…", sub: "Processing your track now." });

      const data = await trackCreditsAround(
        "Suno: instrumental version",
        async () => {
          const r = await fetch(apiUrl("/api/suno/stems"), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ taskId: sunoTaskId, audioId: sunoAudioId, type: "separate_vocal" }),
          });
          const d = await r.json().catch(() => ({}));
          if (!r.ok) throw new Error(d?.error || "Stem request failed");
          return d;
        },
        `taskId=${sunoTaskId}`
      );
      printSunoStems(data);
      sunoStemsTaskId = data?.data?.taskId || data?.data?.task_id || data?.taskId || null;
      printSuno({ stemsTaskId: sunoStemsTaskId, requested: "instrumental_version" });
      setStatus("Instrumental version requested. Processing now…");
      startStemsPolling();
      setProgress(0);
    } catch (e) {
      console.error(e);
      setStatus(`Stem request failed: ${e?.message || String(e)}`);
      setProgress(0);
      setLoading(false);
      setStemsBtn("Get instrumental version", false);
    } finally {
      // Keep loading visible until polling resolves (success/fail/timeout).
    }
  });

  if (els.btnSunoMultiStems) {
    els.btnSunoMultiStems.addEventListener("click", async () => {
      const ok = window.confirm("Get stems may consume around 50 credits. Do you want to continue?");
      if (!ok) return;
      if (!sunoTaskId || !sunoAudioId) {
        setStatus("Multi-stems unavailable yet: missing song ids. Generate and wait until song is fully ready.");
        return;
      }
      if (multiStemsInFlight) {
        setStatus("Multi-stems request already in progress. Please wait.");
        return;
      }
      try {
        multiStemsInFlight = true;
        setMultiStemsBtn("Getting multi-stems…", true);
        setStatus("Requesting multi-stems (drums/bass/… )…");
        setProgress(18);
        setLoading(true, { title: "Extracting multi-stems…", sub: "Drums, bass, strings… This can take longer." });

        const data = await trackCreditsAround(
          "Suno: multi-stems",
          async () => {
            const r = await fetch(apiUrl("/api/suno/stems"), {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ taskId: sunoTaskId, audioId: sunoAudioId, type: "split_stem" }),
            });
            const d = await r.json().catch(() => ({}));
            if (!r.ok) throw new Error(d?.error || "Multi-stems request failed");
            return d;
          },
          `taskId=${sunoTaskId}`
        );
        printSunoStems(data);
        sunoMultiStemsTaskId = data?.data?.taskId || data?.data?.task_id || data?.taskId || null;
        if (!sunoMultiStemsTaskId) {
          throw new Error("Provider did not return a multi-stems task id.");
        }
        printSunoStems({ ...data, _ui: { stemsTaskId: sunoMultiStemsTaskId, requested: "split_stem" } });
        setStatus("Multi-stems task created. Processing now…");
        startMultiStemsPolling();
        setProgress(0);
      } catch (e) {
        console.error(e);
        setStatus(`Multi-stems request failed: ${e?.message || String(e)}`);
        setProgress(0);
        setLoading(false);
        setMultiStemsBtn("Get multi-stems", false);
      } finally {
        multiStemsInFlight = false;
        // Keep loading visible until polling resolves (success/fail/timeout).
      }
    });
  }
}

// Stems status is auto-polled now (no manual refresh needed on Studio page).

if (els.btnSunoCredits) {
  els.btnSunoCredits.addEventListener("click", () => void refreshSunoCredits());
}
if (els.presetPopClean) {
  els.presetPopClean.addEventListener("click", () => {
    if (els.sunoGroovePace) els.sunoGroovePace.value = "balanced";
    if (els.sunoProsody) els.sunoProsody.value = "tight";
    if (els.sunoBeatStability) els.sunoBeatStability.value = "stable";
    setStatus("Preset applied: Pop Clean");
  });
}
if (els.presetBalladWarm) {
  els.presetBalladWarm.addEventListener("click", () => {
    if (els.sunoGroovePace) els.sunoGroovePace.value = "slow";
    if (els.sunoProsody) els.sunoProsody.value = "tight";
    if (els.sunoBeatStability) els.sunoBeatStability.value = "stable";
    setStatus("Preset applied: Ballad Warm");
  });
}
if (els.presetClubPunch) {
  els.presetClubPunch.addEventListener("click", () => {
    if (els.sunoGroovePace) els.sunoGroovePace.value = "energetic";
    if (els.sunoProsody) els.sunoProsody.value = "tight";
    if (els.sunoBeatStability) els.sunoBeatStability.value = "locked";
    setStatus("Preset applied: Club Punch");
  });
}
if (els.btnAdvancedReset) {
  els.btnAdvancedReset.addEventListener("click", () => {
    resetAdvancedOptionsToDefaults();
    setStatus("More options reset to defaults.");
  });
}
if (els.btnAdvancedApply) {
  els.btnAdvancedApply.addEventListener("click", () => {
    if (els.advancedSheet) els.advancedSheet.open = false;
    setStatus("More options applied.");
  });
}

if (els.btnGenerateOrb && els.btnSunoGenerate) {
  els.btnGenerateOrb.addEventListener("click", () => {
    haptic("impact");
    if (location.hash !== "#/generate") {
      location.hash = "#/generate";
      return;
    }
    els.btnSunoGenerate.click();
  });
}

function syncGenerateOrbVisibility() {
  if (!els.btnGenerateOrb) return;
  const route = document.body.getAttribute("data-route");
  const hasInput = Boolean(
    String(els.sunoPrompt?.value || "").trim() ||
    String(els.sunoStyle?.value || "").trim() ||
    imageMoodAppliedForNextGen
  );
  const generating = Boolean(els.btnSunoGenerate?.disabled);
  const hasResult = (els.resultCard?.style.display || "none") !== "none";
  const visible = route === "generate" && hasInput && !generating && !hasResult;
  els.btnGenerateOrb.style.display = visible ? "inline-flex" : "none";
}
function autoResizeLyricsBox() {
  if (!els.sunoPrompt) return;
  const el = els.sunoPrompt;
  el.style.height = "auto";
  const base = 132;
  const max = 340;
  const next = Math.max(base, Math.min(max, el.scrollHeight));
  el.style.height = `${next}px`;
}
function setGenerateInputFocus(activePanel) {
  const stack = document.querySelector('.createSectionStack');
  if (!stack) return;
  stack.classList.toggle("focusInput", Boolean(activePanel));
  document.querySelectorAll(".createSectionStack .inputPanel").forEach((p) => {
    p.classList.toggle("isFocusCard", p === activePanel && Boolean(activePanel));
  });
}

function parseBpmFromTimingText(txt) {
  const s = String(txt || "").toLowerCase();
  const m = s.match(/(\d{2,3})\s*bpm/);
  if (m) return Number(m[1]);
  const m2 = s.match(/\b(\d{2,3})\b/);
  return m2 ? Number(m2[1]) : null;
}

function getReferenceHints() {
  const hints = [];
  const pushHint = (text, severity = "warning") => hints.push({ text, severity });
  const lyrics = String(els.sunoPrompt?.value || "").trim();
  const style = String(els.sunoStyle?.value || "").trim();
  const timing = String(els.sunoTiming?.value || "").trim();
  const dialect = String(els.sunoDialect?.value || "").trim();
  const dialectHint = String(els.sunoDialectHint?.value || "").trim();
  const vp = String(els.sunoVoiceProfile?.value || "").trim().toLowerCase();
  const persona = String(els.sunoPersonaId?.value || "").trim();
  const hasRef = Boolean(getVocalReferenceFile());
  const refOn = hasRef;

  if (hasRef && !lyrics) {
    pushHint("For better accuracy, add at least 2–4 lyric lines.", "critical");
  }
  if (refOn && (dialect || vp || String(els.sunoSongKey?.value || "").trim() || persona)) {
    pushHint("For cleaner melody follow, keep Accent, Voice Profile, Song Key, and Persona on Auto first.", "critical");
  }
  if (dialect && !dialectHint) {
    pushHint("Add one short example line in this dialect to improve pronunciation.");
  }
  if ((vp.includes("baritone") || vp.includes("bass")) && timing) {
    const bpm = parseBpmFromTimingText(timing);
    const fastWords = /\b(fast|upbeat|dance|energetic|club)\b/i.test(timing);
    if ((Number.isFinite(bpm) && bpm >= 100) || fastWords) {
      pushHint("High BPM can push brighter pitch. For warmer baritone/bass tone, use slower timing.");
    }
  }
  if (refOn && lyrics.length > 220) {
    pushHint("Humming mode works better with short guidance. Keep lyrics minimal.");
  }
  if (refOn && persona) {
    pushHint("Persona may change tone away from your reference. Turn Persona off for stricter melody match.", "critical");
  }
  if (refOn && hints.length === 0) {
    pushHint("Best first attempt: keep options Auto, add clear lyrics, then increase controls step by step.");
  }
  return hints.slice(0, 2);
}

function renderReferenceHints() {
  const hasRef = Boolean(getVocalReferenceFile() || vocalRefBlob);
  if (els.vocalRefHint) els.vocalRefHint.style.display = hasRef ? "" : "none";
  if (!els.sunoReferenceHint) return;
  const hints = getReferenceHints();
  if (!hints.length) {
    els.sunoReferenceHint.style.display = "none";
    els.sunoReferenceHint.textContent = "";
    els.sunoReferenceHint.classList.remove("isCritical");
    return;
  }
  const hasCritical = hints.some((h) => h?.severity === "critical");
  els.sunoReferenceHint.classList.toggle("isCritical", hasCritical);
  els.sunoReferenceHint.style.display = "";
  els.sunoReferenceHint.textContent = hints.map((h, i) => `${i + 1}. ${h.text}`).join(" ");
}

function showReferenceHintsPopupOnce() {
  const hints = getReferenceHints();
  if (!hints.length) return;
  const msg = hints.map((h, i) => `${i + 1}. ${h.text}`).join("\n");
  window.alert(msg);
}
["input", "change"].forEach((ev) => {
  els.sunoPrompt?.addEventListener(ev, syncGenerateOrbVisibility);
  els.sunoStyle?.addEventListener(ev, syncGenerateOrbVisibility);
});
window.addEventListener("hashchange", syncGenerateOrbVisibility);

if (els.brandTitle) {
  els.brandTitle.addEventListener("click", () => {
    if ((document.body.getAttribute("data-route") || "") !== "generate") {
      location.hash = "#/generate";
      return;
    }
    const ok = window.confirm("Start a new song? Current draft will be cleared.");
    if (!ok) return;
    resetCreateDraft();
  });
}
els.sunoPrompt?.addEventListener("input", autoResizeLyricsBox);
els.sunoPrompt?.addEventListener("focus", autoResizeLyricsBox);
const generateStackEl = document.querySelector(".createSectionStack");
if (generateStackEl) {
  generateStackEl.addEventListener("focusin", (e) => {
    const target = e?.target;
    if (!target || !(target instanceof Element)) return;
    const panel = target.closest(".inputPanel");
    setGenerateInputFocus(panel || null);
  });
  generateStackEl.addEventListener("focusout", () => {
    setTimeout(() => {
      const active = document.activeElement;
      const panel = active instanceof Element ? active.closest(".createSectionStack .inputPanel") : null;
      setGenerateInputFocus(panel || null);
    }, 40);
  });
}
setTimeout(autoResizeLyricsBox, 0);
renderLibrary();
renderHub();
els.sunoPrompt?.addEventListener("focus", showReferenceHintsPopupOnce, { once: true });
els.sunoStyle?.addEventListener("focus", showReferenceHintsPopupOnce, { once: true });
els.sunoPrompt?.addEventListener("input", () => {
  const lyricsBoxEl = els.sunoPrompt?.closest?.(".lyricsBox");
  if (lyricsBoxEl?.classList.contains("wandGenerated")) {
    lyricsBoxEl.classList.remove("wandGenerated");
  }
});
void (async () => {
  await loadPublicConfig();
  await refreshHubFromSupabase();
  startHubLiveSync();
})();
window.addEventListener("focus", () => {
  void refreshHubFromSupabase();
});
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) void refreshHubFromSupabase();
});
// Hub feed sort segment: Latest | Trending. The genre dropdown
// (Arabic / Instrumental / Remix / Demo) was removed in 20260509k —
// those filters were title regex, not real categories. If proper genre
// tags are added later, we'll bring them back as a separate UI surface.
function setHubSort(next) {
  const value = next === "trending" ? "trending" : "latest";
  hubFilter = value;
  if (els.hubSortLatest) {
    const isLatest = value === "latest";
    els.hubSortLatest.classList.toggle("isActive", isLatest);
    els.hubSortLatest.setAttribute("aria-selected", isLatest ? "true" : "false");
  }
  if (els.hubSortTrending) {
    const isTrending = value === "trending";
    els.hubSortTrending.classList.toggle("isActive", isTrending);
    els.hubSortTrending.setAttribute("aria-selected", isTrending ? "true" : "false");
  }
  if (value === "latest") markHubCategorySeen("latest");
  renderHub();
}
if (els.hubSortLatest) els.hubSortLatest.addEventListener("click", () => setHubSort("latest"));
if (els.hubSortTrending) els.hubSortTrending.addEventListener("click", () => setHubSort("trending"));
/** Jump to the top of the Hub feed.
 *
 * Hub uses `scroll-snap-align: center` on every row. iOS Safari remembers
 * the previously-centered snap target across class changes — so any
 * timed strategy ("disable snap for X ms then re-enable") inevitably
 * rubber-bands us back to the user's last post when snap turns back on.
 *
 * Strategy that finally works:
 *   - Disable snap *for as long as it takes* (keep `body.hubJumpingToTop`
 *     on indefinitely after the jump).
 *   - Animate the scroll for ~320ms so the user sees the motion.
 *   - Wait for the next REAL user input (touchstart / wheel / keydown)
 *     before re-enabling snap. That guarantees the user sees the page
 *     pinned at top, and snap only re-engages once they're moving the
 *     feed themselves — no rubber-band possible.
 *
 * Suppress `tryHubViewportAutoplay` until the user starts scrolling so
 * the 140ms debounce can't restart the previous row mid-jump either.
 */
let hubJumpToTopRaf = 0;
let hubJumpToTopActive = false;
let hubJumpUserGestureHandler = null;
function endHubJumpGuard() {
  if (!hubJumpToTopActive) return;
  hubJumpToTopActive = false;
  document.body.classList.remove("hubJumpingToTop");
  if (hubJumpUserGestureHandler) {
    try {
      window.removeEventListener("touchstart", hubJumpUserGestureHandler);
      window.removeEventListener("wheel", hubJumpUserGestureHandler);
      window.removeEventListener("keydown", hubJumpUserGestureHandler);
      window.removeEventListener("pointerdown", hubJumpUserGestureHandler);
    } catch {}
    hubJumpUserGestureHandler = null;
  }
  updateHubFocusedRow();
}
function scrollHubFeedToTop() {
  if (hubJumpToTopRaf) {
    try { cancelAnimationFrame(hubJumpToTopRaf); } catch {}
    hubJumpToTopRaf = 0;
  }
  if (hubJumpToTopActive) {
    endHubJumpGuard();
  }

  document.body.classList.add("hubJumpingToTop");
  hubJumpToTopActive = true;
  // Block scroll-driven autoplay for a generous window. Released earlier
  // when the user resumes scrolling.
  suppressHubViewportAutoplayFor(8000);

  // Re-enable snap on the FIRST user gesture, not on a timer. iOS can no
  // longer rubber-band us because snap stays off until the user is the
  // one driving the scroll.
  hubJumpUserGestureHandler = () => {
    endHubJumpGuard();
  };
  // Pointerdown covers mouse + touch on iOS Safari; touchstart kept for
  // older WebViews. wheel covers desktop trackpads; keydown covers space
  // / arrows. All passive — we never preventDefault.
  try {
    window.addEventListener("touchstart", hubJumpUserGestureHandler, { once: true, passive: true });
    window.addEventListener("pointerdown", hubJumpUserGestureHandler, { once: true, passive: true });
    window.addEventListener("wheel", hubJumpUserGestureHandler, { once: true, passive: true });
    window.addEventListener("keydown", hubJumpUserGestureHandler, { once: true, passive: true });
  } catch {}

  const start = window.scrollY ?? document.documentElement.scrollTop ?? 0;
  let reducedMotion = false;
  try {
    reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {}

  if (start <= 2 || reducedMotion) {
    window.scrollTo(0, 0);
    return;
  }

  const animDurationMs = 320;
  const t0 = performance.now();
  const easeOutCubic = (u) => 1 - (1 - u) ** 3;
  const tick = (now) => {
    const elapsed = now - t0;
    const u = Math.min(1, elapsed / animDurationMs);
    const y = Math.round(start * (1 - easeOutCubic(u)));
    window.scrollTo(0, y);
    if (u < 1) {
      hubJumpToTopRaf = requestAnimationFrame(tick);
    } else {
      hubJumpToTopRaf = 0;
      window.scrollTo(0, 0);
    }
  };
  hubJumpToTopRaf = requestAnimationFrame(tick);
}
if (els.hubTabLink) {
  let hubTapAt = 0;
  let hubTapCount = 0;
  let hubSingleTimer = null;
  els.hubTabLink.addEventListener("click", (e) => {
    const onHub = (document.body.getAttribute("data-route") || "") === "hub";
    if (!onHub) return;
    e.preventDefault();
    try { stopHubPlayback(); } catch {}
    scrollHubFeedToTop();
    hubTapCount += 1;
    const now = Date.now();
    if (now - hubTapAt > 420) hubTapCount = 1;
    hubTapAt = now;
    if (hubSingleTimer) {
      clearTimeout(hubSingleTimer);
      hubSingleTimer = null;
    }
    hubSingleTimer = setTimeout(async () => {
      if (hubTapCount >= 2) {
        setStatus("Refreshing Hub…");
        await refreshHubFromSupabase();
        setStatus("Hub refreshed.");
        // After refresh, the feed re-rendered — re-pin to the top.
        requestAnimationFrame(() => scrollHubFeedToTop());
      }
      hubTapCount = 0;
    }, 250);
  });
}
if (els.hubNowClose) {
  els.hubNowClose.addEventListener("click", () => {
    const mutedId = hubAudioPostId;
    stopHubPlayback();
    if (mutedId) hubAutoplayMutedPostId = mutedId;
  });
}
if (els.hubNowPlaying) {
  els.hubNowPlaying.addEventListener("click", (e) => {
    const isClose = e.target?.closest?.("#hubNowClose");
    if (isClose) return;
    if (miniSource?.type === "hub" && hubAudioPostId) {
      if ((location.hash || "") !== "#/hub") location.hash = "#/hub";
      setTimeout(() => {
        const row = document.querySelector(`[data-hub-row="${hubAudioPostId}"]`);
        if (!row) return;
        row.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 120);
      return;
    }
    if (miniSource?.type === "library" && miniSource?.id) {
      if ((location.hash || "") !== "#/library") location.hash = "#/library";
      setTimeout(() => {
        const row = document.querySelector(`[data-lib-row="${miniSource.id}"]`);
        if (!row) return;
        row.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 120);
      return;
    }
    if (playerEl && !playerEl.paused) {
      location.hash = "#/player";
    }
  });
}
window.addEventListener("scroll", () => {
  if ((document.body.getAttribute("data-route") || "") === "hub") {
    scheduleHubFocusUpdate();
    scheduleHubViewportAutoplay();
  }
  if (hubAudio) renderHubNowPlaying();
}, { passive: true });
// `scrollend` fires once the page (or a programmatic smooth scroll) actually
// stops — much more reliable than waiting for `scroll` events to taper off.
// Supported on iOS Safari 16+, Chrome 114+, and Firefox 109+. Where it isn't
// supported the 140ms debounce above still covers us.
window.addEventListener("scrollend", () => {
  if ((document.body.getAttribute("data-route") || "") !== "hub") return;
  updateHubFocusedRow();
  flushHubViewportAutoplay();
}, { passive: true });
window.addEventListener("resize", () => {
  if ((document.body.getAttribute("data-route") || "") === "hub") {
    scheduleHubFocusUpdate();
    scheduleHubViewportAutoplay();
  }
}, { passive: true });
window.addEventListener("hashchange", () => {
  if (!hubAudio) return;
  setTimeout(() => renderHubNowPlaying(), 0);
});
window.addEventListener("hashchange", () => {
  const route = document.body.getAttribute("data-route") || "";
  if (route === "hub") void refreshHubFromSupabase();
});
if (els.shareLiveBackdrop) els.shareLiveBackdrop.addEventListener("click", closeShareLiveModal);
if (els.btnCloseShareLive) els.btnCloseShareLive.addEventListener("click", closeShareLiveModal);
if (els.btnGoHub) els.btnGoHub.addEventListener("click", () => {
  closeShareLiveModal();
  location.hash = "#/hub";
});
if (els.proofBackdrop) els.proofBackdrop.addEventListener("click", closeProofModal);
if (els.btnCloseProof) els.btnCloseProof.addEventListener("click", closeProofModal);
if (els.btnDownloadProof) {
  els.btnDownloadProof.addEventListener("click", () => {
    if (!currentProofPost) return;
    const ts = currentProofPost?.ts ? new Date(currentProofPost.ts) : new Date();
    const html = `
      <html><head><meta charset="utf-8"><title>Proof of Creation</title></head>
      <body style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;padding:28px;color:#0b0d12">
        <h1 style="margin:0 0 8px">NabadAi Music</h1>
        <h2 style="margin:0 0 18px;color:#2b3560">Proof of Creation</h2>
        <p>This certificate confirms that this musical work was created using NabadAi Music on the stated date and recorded with the unique creation fingerprint below.</p>
        <p><strong>Title:</strong> ${escapeHtml(currentProofPost.title || "Untitled")}</p>
        <p><strong>Creator:</strong> @${escapeHtml(currentProofPost.creator || "guest")}</p>
        <p><strong>Date (Local):</strong> ${escapeHtml(ts.toLocaleString())}</p>
        <p><strong>Date (UTC):</strong> ${escapeHtml(ts.toISOString())}</p>
        <p><strong>Fingerprint:</strong> #${escapeHtml(currentProofPost?.proof?.promptHash || "N/A")}</p>
        <p><strong>Model:</strong> ${escapeHtml(currentProofPost?.proof?.model || LATEST_SUNO_MODEL)}</p>
        <p><strong>Mode:</strong> ${escapeHtml(currentProofPost?.proof?.mode || currentProofPost?.kind || "full")}</p>
        <p style="margin-top:18px;font-size:12px;color:#4e5a7a">This certificate records creation metadata and timestamp for attribution purposes.</p>
      </body></html>`;
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.open();
    w.document.write(html);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 250);
  });
}

// In-app player controls
if (els.btnPlayerPlay) {
  els.btnPlayerPlay.addEventListener("click", async () => {
    const a = ensurePlayer();
    try {
      await a.play();
      els.btnPlayerPlay.disabled = true;
      if (els.btnPlayerPause) els.btnPlayerPause.disabled = false;
      updateBrandPulse();
    } catch {
      setStatus("Playback blocked. Click again or interact with the page.");
    }
  });
}
if (els.btnPlayerPause) {
  els.btnPlayerPause.addEventListener("click", () => {
    if (!playerEl) return;
    playerEl.pause();
    if (els.btnPlayerPlay) els.btnPlayerPlay.disabled = false;
    els.btnPlayerPause.disabled = true;
    updateBrandPulse();
  });
}
if (els.btnPlayerStop) {
  els.btnPlayerStop.addEventListener("click", () => {
    if (!playerEl) return;
    playerEl.pause();
    playerEl.currentTime = 0;
    if (els.btnPlayerPlay) els.btnPlayerPlay.disabled = false;
    if (els.btnPlayerPause) els.btnPlayerPause.disabled = true;
    syncPlayerUI();
    updateBrandPulse();
  });
}
// Single circular toggle that drives play/pause through the legacy
// hidden buttons. State is read from `playerEl` directly so it stays
// correct regardless of which path loaded the source.
const PLAYER_TOGGLE_PLAY_SVG = '<svg class="ico" viewBox="0 0 24 24"><polygon points="6 3 21 12 6 21 6 3" fill="currentColor" stroke="none"/></svg>';
const PLAYER_TOGGLE_PAUSE_SVG = '<svg class="ico" viewBox="0 0 24 24"><rect x="6" y="4" width="4" height="16" rx="1" fill="currentColor" stroke="none"/><rect x="14" y="4" width="4" height="16" rx="1" fill="currentColor" stroke="none"/></svg>';
function syncPlayerToggleUI() {
  const btn = els.btnPlayerToggle;
  if (!btn) return;
  const a = playerEl;
  const hasSrc = Boolean(a && (a.src || a.currentSrc));
  const isPlaying = Boolean(a && !a.paused && !a.ended && hasSrc);
  btn.disabled = !hasSrc;
  btn.classList.toggle("isPlaying", isPlaying);
  const icon = btn.querySelector(".playerToggleIcon");
  if (icon) {
    const next = isPlaying ? PLAYER_TOGGLE_PAUSE_SVG : PLAYER_TOGGLE_PLAY_SVG;
    if (icon.innerHTML !== next) icon.innerHTML = next;
  }
  btn.setAttribute("aria-label", isPlaying ? "Pause" : "Play");
}
if (els.btnPlayerToggle) {
  els.btnPlayerToggle.addEventListener("click", () => {
    if (!playerEl) return;
    haptic("light");
    if (playerEl.paused) {
      els.btnPlayerPlay?.click();
    } else {
      els.btnPlayerPause?.click();
    }
    requestAnimationFrame(syncPlayerToggleUI);
  });
  const a = ensurePlayer();
  if (a) {
    ["play", "pause", "ended", "loadedmetadata", "emptied"].forEach((evt) => {
      a.addEventListener(evt, syncPlayerToggleUI);
    });
  }
  syncPlayerToggleUI();
}
if (els.btnPlayerBack) {
  els.btnPlayerBack.addEventListener("click", () => {
    history.back();
  });
}
if (els.btnUserPublicBack) {
  els.btnUserPublicBack.addEventListener("click", () => {
    // If we have history (came from Hub), prefer back so the scroll
    // position is preserved. Otherwise land in Hub fresh.
    if (history.length > 1) {
      history.back();
    } else {
      location.hash = "#/hub";
    }
  });
}
if (els.btnPlayerShare) {
  els.btnPlayerShare.addEventListener("click", async () => {
    haptic("light");
    const trackUrl = String(currentPlayerTrackRef?.url || playerEl?.src || "").trim();
    const trackTitle = String(currentPlayerTrackRef?.title || els.playerTitle?.textContent || "").trim();
    if (!trackUrl) {
      showToast("Open a song first, then share.");
      return;
    }
    // Prefer a matching Hub post — that's a real, scrollable destination
    // with a proper preview card.
    const hubMatch = loadHubFeed().find((p) => {
      const sameUrl = trackUrl && String(p?.url || "").trim() === trackUrl;
      const sameTitle = trackTitle && String(p?.title || "").trim().toLowerCase() === trackTitle.toLowerCase();
      return sameUrl || sameTitle;
    });
    if (hubMatch) {
      await shareHubPost(hubMatch);
      return;
    }
    // Library song not yet on Hub — offer to publish first so the share
    // gets a real preview card instead of leaking a raw audio URL.
    const ok = window.confirm(
      "Publish this song to Hub first?\n\nThis gives the share a preview card (cover, title, your handle) instead of a bare audio link."
    );
    if (!ok) return;
    if (!currentPlayerTrackRef) {
      showToast("Couldn't find this track to publish.");
      return;
    }
    try {
      shareToHub(currentPlayerTrackRef);
    } catch {
      showToast("Couldn't publish to Hub. Try again.");
      return;
    }
    // Find the freshly-published post (it's at index 0 of the feed).
    const fresh = loadHubFeed()[0];
    if (!fresh) {
      showToast("Couldn't publish to Hub. Try again.");
      return;
    }
    await shareHubPost(fresh);
  });
}
if (els.btnPlayerDownloadVideo) {
  els.btnPlayerDownloadVideo.addEventListener("click", async () => {
    haptic("light");
    // The server needs a real http(s) URL it can fetch from. blob:/data:
    // URLs (which we sometimes use for in-app caching) are unfetchable from
    // Node, so prefer the track ref's persisted URL and only fall back to
    // playerEl.src when it's a plain remote URL.
    const isHttpUrl = (s) => /^https?:\/\//i.test(String(s || "").trim());
    // Try in this order:
    //   1. The library/profile track ref (Library entry point)
    //   2. The captured "last http url handed to the player" (covers
    //      Generate result cards which don't set the track ref)
    //   3. The most recent generated song URLs (raw CDN, then proxy)
    //   4. playerEl.src as a last resort (skipped if it's a blob: URL,
    //      which happens after a Hub playback shares the audio element)
    const candidates = [
      currentPlayerTrackRef?.url,
      currentPlayerTrackRef?.audioUrl,
      currentPlayerTrackRef?.song_url,
      lastPlayerHttpUrl,
      lastSunoFullUrl,
      lastSunoProxyUrl,
      lastSunoFullUrl2,
      lastSunoProxyUrl2,
      playerEl?.src,
    ];
    const trackUrl = (candidates.find((s) => isHttpUrl(s)) || "").trim();
    const trackTitle = String(
      currentPlayerTrackRef?.title
        || els.playerTitle?.textContent
        || lastSunoTitle
        || "song"
    ).trim();
    const artCandidates = [
      currentPlayerTrackRef?.artUrl,
      currentPlayerTrackRef?.coverUrl,
      currentPlayerTrackRef?.cover_url,
      lastSunoArtUrl,
      lastSunoArtUrl2,
      els.playerCover?.src,
    ];
    const trackArt = (artCandidates.find((s) => isHttpUrl(s)) || "").trim();
    if (!trackUrl) {
      showToast("This song isn't downloadable. Re-open it from Library and try again.");
      return;
    }
    const btn = els.btnPlayerDownloadVideo;
    const originalHtml = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = `<span class="dlSpin" aria-hidden="true"></span>`;
    btn.setAttribute("aria-label", "Rendering video…");
    showToast("Rendering video — this takes a few seconds…", { durationMs: 4000 });
    try {
      const u = new URL("/api/render-video", location.origin);
      u.searchParams.set("audioUrl", trackUrl);
      if (trackArt && /^https?:\/\//i.test(trackArt)) {
        u.searchParams.set("imageUrl", trackArt);
      }
      u.searchParams.set("title", trackTitle);
      const r = await fetch(u.toString(), { method: "GET" });
      if (!r.ok) {
        let detail = "";
        try { detail = (await r.json())?.error || ""; } catch {}
        throw new Error(detail || `HTTP ${r.status}`);
      }
      const blob = await r.blob();
      const filename = `${trackTitle.replace(/[\\/:*?"<>|]/g, "").trim() || "song"}.mp4`;
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      // Free the blob after the click has had time to take effect.
      setTimeout(() => URL.revokeObjectURL(blobUrl), 4000);
      showToast("Video saved", { durationMs: 1800 });
    } catch (e) {
      const msg = e?.message ? String(e.message).slice(0, 80) : "Render failed";
      showToast(`Couldn't render: ${msg}`, { durationMs: 3500 });
    } finally {
      btn.disabled = false;
      btn.innerHTML = originalHtml;
      btn.setAttribute("aria-label", "Download as video");
    }
  });
}
if (els.playerVol) {
  els.playerVol.addEventListener("input", () => {
    const a = ensurePlayer();
    a.volume = clampNum(Number(els.playerVol.value), 0, 1);
  });
}
if (els.btnShareClipHub) {
  els.btnShareClipHub.addEventListener("click", () => {
    if (!currentPlayerTrackRef?.url) {
      setStatus("Open a library song first, then share a clip.");
      return;
    }
    const a = ensurePlayer();
    const range = clampClipRange(
      Number(els.clipStartSec?.value || 0),
      Number(els.clipEndSec?.value || 0),
      Number(a?.duration || 0)
    );
    const clipTrack = {
      ...currentPlayerTrackRef,
      title: `${currentPlayerTrackRef.title || "Song"} [${range.startSec}s-${range.endSec}s]`,
      meta: {
        ...(currentPlayerTrackRef.meta || {}),
        clip: range,
      },
    };
    shareToHub(clipTrack);
    setStatus(`Clip shared to Hub (${range.startSec}s → ${range.endSec}s).`);
  });
}
if (els.btnOpenTrimSheet) {
  els.btnOpenTrimSheet.addEventListener("click", () => {
    if (els.trimSheet) els.trimSheet.style.display = "";
  });
}
if (els.btnCloseTrimSheet) {
  els.btnCloseTrimSheet.addEventListener("click", () => {
    if (els.trimSheet) els.trimSheet.style.display = "none";
  });
}
if (els.btnShareFullHub) {
  els.btnShareFullHub.addEventListener("click", () => {
    const id = currentPlayerTrackRef || playerLoadedLabel || `player_${Date.now()}`;
    const url = playerEl?.src || lastSunoFullUrl || "";
    if (!url) {
      setStatus("No loaded song to share.");
      return;
    }
    const title = (els.playerTitle?.textContent || "Shared song").trim();
    const item = {
      id: String(id),
      title,
      fullUrl: url,
      artUrl: els.playerArt?.src || "",
      kind: /instrumental/i.test(title) ? "instrumental" : "full",
      ts: Date.now(),
    };
    shareLibraryTrackToHub(item, { clip: null });
    setStatus("Shared full version to Hub.");
  });
}
if (els.btnPlayerChangeCover) {
  els.btnPlayerChangeCover.addEventListener("click", () => {
    if (!currentPlayerTrackRef?.id) {
      setStatus("Open a library song first.");
      return;
    }
    els.playerCoverUpload?.click();
  });
}
if (els.playerCoverUpload) {
  els.playerCoverUpload.addEventListener("change", () => {
    const f = els.playerCoverUpload?.files?.[0];
    if (!f || !currentPlayerTrackRef?.id) return;
    const url = URL.createObjectURL(f);
    patchLibraryTrack(currentPlayerTrackRef.id, { artUrl: url, meta: { ...(currentPlayerTrackRef.meta || {}), imageUrl: url } });
    currentPlayerTrackRef = { ...currentPlayerTrackRef, artUrl: url, meta: { ...(currentPlayerTrackRef.meta || {}), imageUrl: url } };
    setPlayerMeta({
      title: els.playerTitle?.textContent || currentPlayerTrackRef.title || "Library song",
      subtitle: els.playerSubtitle?.textContent || "Library • Full song",
      artUrl: url,
    });
    setStatus("Cover updated.");
    void syncHubCoverForTrack(currentPlayerTrackRef, url);
  });
}
if (els.playerSeek) {
  els.playerSeek.addEventListener("pointerdown", () => (playerSeekDragging = true));
  els.playerSeek.addEventListener("pointerup", () => {
    playerSeekDragging = false;
    if (!playerEl) return;
    const dur = Number.isFinite(playerEl.duration) ? playerEl.duration : 0;
    const max = Number(els.playerSeek.max || 1000);
    const v = Number(els.playerSeek.value || 0);
    if (dur > 0) playerEl.currentTime = (v / max) * dur;
  });
  els.playerSeek.addEventListener("input", () => {
    if (!playerSeekDragging || !playerEl) return;
    const dur = Number.isFinite(playerEl.duration) ? playerEl.duration : 0;
    const max = Number(els.playerSeek.max || 1000);
    const v = Number(els.playerSeek.value || 0);
    if (els.playerTime && dur > 0) els.playerTime.textContent = `${formatTime((v / max) * dur)} / ${formatTime(dur)}`;
    if (els.playerTimeCurrent && dur > 0) els.playerTimeCurrent.textContent = formatTime((v / max) * dur);
    const pct = max > 0 ? (v / max) * 100 : 0;
    els.playerSeek.style.setProperty("--playerSeekPct", `${pct}%`);
  });
}
if (els.btnLoadFull) {
  els.btnLoadFull.addEventListener("click", () => {
    const url =
      lastSunoCachedUrl ||
      lastSunoProxyUrl ||
      lastSunoFullUrl ||
      (els.sunoFullLink?.classList.contains("disabled") ? "" : els.sunoFullLink?.href);
    if (url && url !== "#") {
      setPlayerSource(url, "Full song");
      setPlayerMeta({ title: lastSunoTitle || "Generated song", subtitle: "Generated • Full song", artUrl: lastSunoArtUrl });
      location.hash = "#/player";
    }
  });
}
if (els.btnLoadVocals) {
  els.btnLoadVocals.addEventListener("click", () => {
    const url = lastSunoVocalUrl || (els.sunoVocalLink?.classList.contains("disabled") ? "" : els.sunoVocalLink?.href);
    if (url && url !== "#") {
      setPlayerSource(url, "Vocals");
      setPlayerMeta({ title: lastSunoTitle || "Generated song", subtitle: "Suno • Vocals", artUrl: lastSunoArtUrl });
      location.hash = "#/player";
    }
  });
}
if (els.btnLoadInstrumental) {
  els.btnLoadInstrumental.addEventListener("click", () => {
    const url = lastSunoInstUrl || (els.sunoInstLink?.classList.contains("disabled") ? "" : els.sunoInstLink?.href);
    if (url && url !== "#") {
      setPlayerSource(url, "Instrumental");
      setPlayerMeta({ title: lastSunoTitle || "Generated song", subtitle: "Suno • Instrumental", artUrl: lastSunoArtUrl });
      location.hash = "#/player";
    }
  });
}

if (els.btnPlayFull) {
  els.btnPlayFull.addEventListener("click", async () => {
    const url =
      lastSunoCachedUrl ||
      lastSunoProxyUrl ||
      lastSunoFullUrl ||
      (els.sunoFullLink?.classList.contains("disabled") ? "" : els.sunoFullLink?.href);
    await playOnPlayerPage(url && url !== "#" ? url : "", "Full song");
  });
}
if (els.btnPlayVocals) {
  els.btnPlayVocals.addEventListener("click", async () => {
    const url = lastSunoVocalUrl || (els.sunoVocalLink?.classList.contains("disabled") ? "" : els.sunoVocalLink?.href);
    await playOnPlayerPage(url && url !== "#" ? url : "", "Vocals");
  });
}
if (els.btnPlayInstrumental) {
  els.btnPlayInstrumental.addEventListener("click", async () => {
    const url = lastSunoInstUrl || (els.sunoInstLink?.classList.contains("disabled") ? "" : els.sunoInstLink?.href);
    await playOnPlayerPage(url && url !== "#" ? url : "", "Instrumental");
  });
}

// Vocal Room + Multitrack session
if (els.btnSessionLoadSuno) {
  els.btnSessionLoadSuno.addEventListener("click", () => {
    loadSunoMultiStemsIntoSession();
  });
}
if (els.sessionUploadStems) {
  els.sessionUploadStems.addEventListener("change", () => {
    const files = Array.from(els.sessionUploadStems.files || []);
    if (!files.length) return;
    loadUploadedStemsIntoSession(files);
    setSessionStatus(`Loaded ${files.length} uploaded stem track(s).`);
    els.sessionUploadStems.value = "";
  });
}
if (els.btnSessionClear) {
  els.btnSessionClear.addEventListener("click", () => clearSession());
}
if (els.btnSessionPlay) {
  els.btnSessionPlay.addEventListener("click", async () => {
    try {
      await playSession();
    } catch (e) {
      setSessionStatus(`Play error: ${e?.message || String(e)}`);
    }
  });
}
if (els.btnSessionStop) {
  els.btnSessionStop.addEventListener("click", () => stopSession());
}
if (els.btnSessionExport) {
  els.btnSessionExport.addEventListener("click", async () => {
    try {
      els.btnSessionExport.disabled = true;
      await exportSessionMixWav();
    } catch (e) {
      setSessionStatus(`Export error: ${e?.message || String(e)}`);
    } finally {
      els.btnSessionExport.disabled = false;
      setLoading(false);
    }
  });
}

// Vocal Room (recording)
if (els.btnVocalArm) {
  els.btnVocalArm.addEventListener("click", async () => {
    try {
      await armVocalMic();
    } catch (e) {
      setVocalStatus(`Mic error: ${e?.message || String(e)}`);
    }
  });
}
if (els.btnVocalRec) {
  els.btnVocalRec.addEventListener("click", async () => {
    try {
      await startVocalRecording();
    } catch (e) {
      setVocalStatus(`Record error: ${e?.message || String(e)}`);
    }
  });
}
if (els.btnVocalStop) {
  els.btnVocalStop.addEventListener("click", () => stopVocalRecording());
}
if (els.vocalPreset) {
  els.vocalPreset.addEventListener("change", () => {
    // Re-arm to apply the new preset cleanly.
    if (vocalIsRecording) return;
    disarmVocalMic();
    setVocalStatus("Preset changed. Arm mic again.");
  });
}
if (els.vocalMonitor) {
  els.vocalMonitor.addEventListener("change", () => {
    if (vocalIsRecording) return;
    disarmVocalMic();
    setVocalStatus("Monitor setting changed. Arm mic again.");
  });
}

renderVocalTakes();
renderSessionTracks();

// Generate mode switch (Simple vs Agent)
function setGenerateMode(mode) {
  const m = mode === "agent" ? "agent" : "simple";
  if (els.simpleBox) els.simpleBox.style.display = m === "simple" ? "" : "none";
  if (els.agentBox) els.agentBox.style.display = m === "agent" ? "" : "none";
  if (els.genModeSimple) els.genModeSimple.classList.toggle("active", m === "simple");
  if (els.genModeAgent) els.genModeAgent.classList.toggle("active", m === "agent");
}
if (els.genModeSimple) els.genModeSimple.addEventListener("click", () => setGenerateMode("simple"));
if (els.genModeAgent) els.genModeAgent.addEventListener("click", () => setGenerateMode("agent"));
setGenerateMode("simple");

// NabadAi Agent (MVP guided flow, local logic)
let agentState = { step: 0, answers: {} };
function addAgentMsg(role, text) {
  if (!els.agentChat) return;
  const div = document.createElement("div");
  div.className = `agentMsg ${role === "user" ? "user" : "bot"}`;
  div.textContent = text;
  els.agentChat.appendChild(div);
  els.agentChat.scrollTop = els.agentChat.scrollHeight;
}

function agentPromptForStep(step) {
  switch (step) {
    case 0:
      return "Tell me what you want to create (1 sentence). مثال: أغنية حب حزينة بلهجة شامية.";
    case 1:
      return "Choose a vibe (one word): romantic / sad / happy / energetic / dark";
    case 2:
      return "Pick a style (examples): Arabic pop / Dabke / Tarab / Trap / Cinematic";
    case 3:
      return "Do you want vocals? (yes/no) and gender (f/m/any). Example: yes f";
    case 4:
      return "Optional: Maqam? (Rast/Bayati/Hijaz/Nahawand/Saba/Kurd/Ajam or 'none')";
    case 5:
      return "Give it a short title (or type 'auto').";
    default:
      return "";
  }
}

function agentApplyToForm() {
  const a = agentState.answers;
  if (els.sunoPrompt && a.idea) els.sunoPrompt.value = String(a.idea).trim();
  const tags = [];
  if (a.vibe) tags.push(a.vibe);
  if (a.style) tags.push(a.style);
  if (a.maqam && a.maqam !== "none") tags.push(`Maqam: ${a.maqam}`);
  if (els.sunoStyle && tags.length) {
    els.sunoStyle.value = tags.join(", ");
  }
  if (els.sunoVoiceProfile && a.vocalGender) {
    const g = String(a.vocalGender || "").toLowerCase();
    if (g === "f") els.sunoVoiceProfile.value = "f|Mezzo-Soprano";
    if (g === "m") els.sunoVoiceProfile.value = "m|Baritone";
  }
  if (els.sunoTitle) {
    const t = a.title && a.title !== "auto" ? a.title : "";
    if (t) els.sunoTitle.value = t;
  }
}

function agentReset() {
  agentState = { step: 0, answers: {} };
  if (els.agentChat) els.agentChat.innerHTML = "";
  addAgentMsg("bot", "Hi — I’m NabadAi Agent. I’ll ask a few quick questions and fill the Generate settings for you.");
  addAgentMsg("bot", agentPromptForStep(0));
}

function normalizeWord(s) {
  return String(s || "").trim().toLowerCase();
}

function agentConsume(text) {
  const t = String(text || "").trim();
  const low = normalizeWord(t);
  const step = agentState.step;

  if (low === "/reset") {
    agentReset();
    return;
  }

  if (step === 0) {
    agentState.answers.idea = t;
  } else if (step === 1) {
    agentState.answers.vibe = t;
  } else if (step === 2) {
    agentState.answers.style = t;
  } else if (step === 3) {
    // "yes f" / "no" / "yes any"
    const parts = low.split(/\s+/).filter(Boolean);
    const yes = parts[0] === "yes" || parts[0] === "y";
    agentState.answers.instrumental = !yes;
    const g = parts[1] || (yes ? "any" : "any");
    agentState.answers.vocalGender = g === "f" ? "f" : g === "m" ? "m" : "";
  } else if (step === 4) {
    agentState.answers.maqam = t && low !== "none" ? t : "none";
    if (els.sunoMaqam) {
      // best-effort match
      const opts = Array.from(els.sunoMaqam.options || []);
      const match = opts.find((o) => normalizeWord(o.value) === normalizeWord(agentState.answers.maqam));
      if (match) els.sunoMaqam.value = match.value;
    }
  } else if (step === 5) {
    agentState.answers.title = t || "auto";
  }

  agentApplyToForm();
  agentState.step = step + 1;

  if (agentState.step <= 5) {
    addAgentMsg("bot", agentPromptForStep(agentState.step));
  } else {
    addAgentMsg("bot", "Done. I filled the settings. Switch to Simple to review, then press “Generate song”. Type /reset to start over.");
  }
}

if (els.agentSend && els.agentInput) {
  els.agentSend.addEventListener("click", () => {
    const v = String(els.agentInput.value || "").trim();
    if (!v) return;
    els.agentInput.value = "";
    addAgentMsg("user", v);
    agentConsume(v);
  });
  els.agentInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") els.agentSend.click();
  });
}

// Initialize agent chat lazily
agentReset();

// Intro screen (logo-only)
function enterApp() {
  if (document.body.classList.contains("pageTransitioning")) return;
  const hero = document.querySelector(".introHero");
  if (hero) hero.classList.add("entering");
  document.body.classList.add("pageTransitioning");
  setTimeout(() => {
    location.hash = "#/generate";
    requestAnimationFrame(() => {
      document.body.classList.remove("pageTransitioning");
      if (hero) hero.classList.remove("entering");
    });
  }, 260);
}
if (els.introTap) {
  els.introTap.addEventListener("click", () => enterApp());
}
setTimeout(() => {
  if (location.hash === "#/intro") enterApp();
}, 1900);

if (els.btnCreditsHistoryRefresh) {
  els.btnCreditsHistoryRefresh.addEventListener("click", () => renderCreditsHistory());
}
if (els.btnCreditsHistoryClear) {
  els.btnCreditsHistoryClear.addEventListener("click", () => {
    saveCreditsHistory([]);
    renderCreditsHistory();
    setStatus("Cleared credits history.");
  });
}
if (els.btnCreditRecovery) {
  els.btnCreditRecovery.addEventListener("click", async () => {
    const payload = buildCreditRecoveryPayload();
    try {
      await navigator.clipboard.writeText(payload);
      setStatus("Recovery request details copied. Paste into provider support.");
      alert(`Copied to clipboard:\n\n${payload}`);
    } catch {
      alert(payload);
      setStatus("Recovery details ready. Copy and send to provider support.");
    }
  });
}

if (els.sunoMaqam) {
  els.sunoMaqam.addEventListener("change", () => applyMaqamToStyleInput());
}
if (els.sunoProMode) {
  const syncPro = () => document.body.classList.toggle("proMode", Boolean(els.sunoProMode.checked));
  els.sunoProMode.addEventListener("change", syncPro);
  syncPro();
}
[
  els.sunoPrompt,
  els.sunoStyle,
  els.sunoTiming,
  els.sunoDialect,
  els.sunoDialectHint,
  els.sunoVoiceProfile,
  els.sunoSongKey,
  els.sunoPersonaId,
  els.sunoReferenceMode,
].forEach((el) => {
  if (!el) return;
  el.addEventListener("input", renderReferenceHints);
  el.addEventListener("change", renderReferenceHints);
});
renderReferenceHints();

if (els.btnBetaTopup) {
  els.btnBetaTopup.addEventListener("click", () => openBilling());
}
if (els.btnOpenBilling) {
  els.btnOpenBilling.addEventListener("click", () => openBilling());
}
if (els.btnOpenAdvancedSheet && els.advancedSheet) {
  els.btnOpenAdvancedSheet.addEventListener("click", () => {
    els.advancedSheet.open = true;
    if (els.fineTuneDetails) els.fineTuneDetails.open = true;
    els.advancedSheet.scrollTop = 0;
    const first = els.advancedSheet.querySelector("select, input");
    if (first) setTimeout(() => first.focus(), 120);
  });
}
if (els.btnCreatePersona) {
  els.btnCreatePersona.addEventListener("click", async () => {
    if (!sunoTaskId) {
      setStatus("Generate a song first, then create persona from that song.");
      return;
    }
    try {
      els.btnCreatePersona.disabled = true;
      setLoading(true, { title: "Creating persona…", sub: "Building persona from your last generated song." });
      const r = await fetch(apiUrl("/api/suno/persona"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskId: sunoTaskId }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d?.error || "Persona creation failed");
      const personaId = String(d?.personaId || "").trim();
      if (!personaId) throw new Error("Persona created but ID was missing.");
      addPersona(personaId, `${lastSunoTitle || "Generated"} persona`);
      if (els.sunoPersonaId) els.sunoPersonaId.value = personaId;
      setStatus("Persona created and selected for next generations.");
    } catch (e) {
      setStatus(`Persona failed: ${e?.message || String(e)}`);
    } finally {
      els.btnCreatePersona.disabled = false;
      setLoading(false);
    }
  });
}
if (els.btnProfileSave) {
  els.btnProfileSave.addEventListener("click", async () => {
    const usernameRaw = String(els.profilePreviewUsernameInput?.value || "").trim().toLowerCase();
    const username = usernameRaw.replace(/[^a-z0-9_.]/g, "").slice(0, 32) || "guest";
    const email = String(authSession?.user?.email || activeProfile.email || "").trim().toLowerCase();
    const voiceTimbre = String(els.profilePreviewTimbreInput?.value || "").trim();
    const bio = String(els.profilePreviewBioInput?.value || "").trim().slice(0, 280);
    const genres = String(activeProfile.genres || "").trim();
    const isPublic = Boolean(els.profileIsPublic?.checked);
    const id = email || `user:${username}`;
    saveProfile({
      id,
      username,
      email,
      voiceTimbre,
      bio,
      avatar: activeProfile.avatar || "",
      genres,
      links: {},
      isPublic,
    });
    try {
      await supabaseUpsertProfile({
        id,
        username,
        email,
        voiceTimbre,
        bio,
        avatar: activeProfile.avatar || "",
        genres,
        links: {},
        isPublic,
      });
    } catch (e) {
      setStatus(`Local save done. Cloud save skipped: ${e?.message || String(e)}`);
    }
    renderLibrary();
    renderPersonaSelect();
    setStatus(`Profile saved: @${username}`);
    renderProfilePreviewFromInputs();
    renderProfileHubShared();
    setProfileEditing(false);
    showToast("Profile saved.");
  });
}
if (els.btnProfileEdit) {
  els.btnProfileEdit.addEventListener("click", () => {
    setProfileEditing(true);
    if (els.profilePreviewUsernameInput) els.profilePreviewUsernameInput.focus();
    setStatus("Editing profile — adjust fields, then Save.");
  });
}
if (els.btnProfileCancel) {
  els.btnProfileCancel.addEventListener("click", () => {
    restoreProfileInputsFromActive();
    setProfileEditing(false);
    setStatus("Edits cancelled.");
  });
}
if (els.btnAuthGoogle) {
  els.btnAuthGoogle.addEventListener("click", async () => {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return setStatus("Supabase config missing.");
    try {
      if (els.btnAuthGoogle) {
        els.btnAuthGoogle.disabled = true;
        els.btnAuthGoogle.textContent = "Opening Google…";
      }
      setStatus("Opening Google login…");
      const url = await supabaseGoogleLoginUrl();
      if (!url) throw new Error("Could not create Google auth URL");
      window.location.assign(url);
      // If redirect is blocked, recover button state.
      setTimeout(() => {
        if (els.btnAuthGoogle) {
          els.btnAuthGoogle.disabled = false;
          els.btnAuthGoogle.textContent = "Continue with Google";
        }
      }, 3500);
    } catch (e) {
      if (els.btnAuthGoogle) {
        els.btnAuthGoogle.disabled = false;
        els.btnAuthGoogle.textContent = "Continue with Google";
      }
      setStatus(`Google login failed to start: ${e?.message || String(e)}`);
    }
  });
}
if (els.btnAuthGateGoogle) {
  els.btnAuthGateGoogle.addEventListener("click", () => {
    if (els.btnAuthGoogle) els.btnAuthGoogle.click();
  });
}
if (els.btnAuthGateGuest) {
  els.btnAuthGateGuest.addEventListener("click", () => {
    location.hash = "#/hub";
    setStatus("Guest mode enabled. Login anytime from Profile.");
  });
}
if (els.btnAuthLogout) {
  els.btnAuthLogout.addEventListener("click", () => {
    saveAuthSession(null);
    resetProfileUiToGuest();
    setProfileEditing(false);
    if (els.btnAuthGoogle) {
      els.btnAuthGoogle.disabled = false;
      els.btnAuthGoogle.textContent = "Continue with Google";
    }
    setStatus("Logged out.");
  });
}
if (els.btnProfileDelete) {
  els.btnProfileDelete.addEventListener("click", () => {
    if (!window.confirm("Delete local profile data on this device?")) return;
    activeProfile = {
      id: "guest",
      username: "guest",
      email: "",
      gender: "",
      voiceTimbre: "",
      bio: "",
      avatar: "",
      genres: "",
      links: {},
      isPublic: true,
    };
    saveProfile(activeProfile);
    resetProfileUiToGuest();
    setStatus("Local profile data deleted.");
  });
}
if (els.profileAvatarFile) {
  els.profileAvatarFile.addEventListener("change", () => {
    const f = els.profileAvatarFile?.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      activeProfile.avatar = String(reader.result || "");
      renderProfilePreviewFromInputs();
    };
    reader.readAsDataURL(f);
  });
}
if (els.profilePreviewAvatar && els.profileAvatarFile) {
  els.profilePreviewAvatar.addEventListener("click", () => {
    if (!profileEditing) return;
    els.profileAvatarFile.click();
  });
}
[
  els.profilePreviewUsernameInput,
  els.profilePreviewTimbreInput,
  els.profilePreviewBioInput,
].forEach((el) => {
  if (!el) return;
  el.addEventListener("input", renderProfilePreviewFromInputs);
  el.addEventListener("change", renderProfilePreviewFromInputs);
});
if (els.btnCloseAdvancedSheet && els.advancedSheet) {
  els.btnCloseAdvancedSheet.addEventListener("click", () => {
    els.advancedSheet.open = false;
  });
}

// Studio mixer
if (els.btnMixerLoad) {
  els.btnMixerLoad.addEventListener("click", () => {
    try {
      const raw = els.sunoStemsOut?.textContent || "";
      const obj = raw ? JSON.parse(raw) : null;
      const stems = stemsFromResponse(obj);
      mixerStems = stems.map((s) => ({ ...s, gain: 1, muted: false }));
      mixerAudioEls = stems.map((s) => {
        const a = new Audio(s.url);
        a.preload = "auto";
        a.crossOrigin = "anonymous";
        return a;
      });
      mixerIsPlaying = false;
      if (els.btnMixerStop) els.btnMixerStop.disabled = true;
      renderMixerList();
      applyMixerToAudio();
      if (els.btnMixerExport) els.btnMixerExport.disabled = mixerStems.length === 0;
      if (els.btnMixerPlay) els.btnMixerPlay.disabled = mixerStems.length === 0;
      setStatus(mixerStems.length ? "Stems loaded into studio." : "No stems found yet.");
    } catch (e) {
      setStatus("Could not load stems (make sure multi-stems are SUCCESS).");
    }
  });
}

function applyMixerToAudio() {
  for (let i = 0; i < mixerAudioEls.length; i++) {
    const a = mixerAudioEls[i];
    const s = mixerStems[i];
    if (!a || !s) continue;
    const muted = Boolean(s.muted);
    const vol = clampNum(s.gain ?? 1, 0, 1); // HTMLAudio volume is 0..1
    a.volume = muted ? 0 : vol;
  }
}

async function playMixer() {
  if (!mixerAudioEls.length) return;
  // Start all at the same time from the beginning.
  for (const a of mixerAudioEls) {
    try {
      a.pause();
      a.currentTime = 0;
    } catch {}
  }
  applyMixerToAudio();
  setStatus("Playing stems…");
  try {
    await Promise.all(mixerAudioEls.map((a) => a.play().catch(() => null)));
    mixerIsPlaying = true;
    if (els.btnMixerStop) els.btnMixerStop.disabled = false;
    if (els.btnMixerPlay) els.btnMixerPlay.textContent = "Restart";
  } catch (e) {
    setStatus("Playback blocked. Click again or interact with the page.");
  }
}

function stopMixer() {
  for (const a of mixerAudioEls) {
    try {
      a.pause();
      a.currentTime = 0;
    } catch {}
  }
  mixerIsPlaying = false;
  if (els.btnMixerStop) els.btnMixerStop.disabled = true;
  if (els.btnMixerPlay) els.btnMixerPlay.textContent = "Play mix";
  setStatus("Stopped.");
}

if (els.btnMixerPlay) {
  els.btnMixerPlay.addEventListener("click", async () => {
    if (!mixerAudioEls.length) return;
    await playMixer();
  });
}
if (els.btnMixerStop) {
  els.btnMixerStop.addEventListener("click", () => stopMixer());
}

if (els.btnMixerExport) {
  els.btnMixerExport.addEventListener("click", async () => {
    if (!mixerStems.length) return;
    try {
      els.btnMixerExport.disabled = true;
      setStatus("Exporting mix to WAV…");
      setProgress(25);
      setLoading(true, { title: "Exporting your mix…", sub: "Rendering WAV offline in your browser." });
      const wavBlob = await mixStemsToWav(mixerStems);
      lastStudioMixBlob = wavBlob;
      const url = URL.createObjectURL(wavBlob);
      lastStudioMixUrl = url;
      if (els.mixerDownloadLink) {
        els.mixerDownloadLink.href = url;
        els.mixerDownloadLink.classList.remove("disabled");
      }
      updateVocalRoomAvailability();
      setStatus("Mix exported. Download is ready.");
      setProgress(0);
    } catch (e) {
      console.error(e);
      setStatus(`Export failed: ${e?.message || String(e)}`);
      setProgress(0);
    } finally {
      els.btnMixerExport.disabled = false;
      setLoading(false);
    }
  });
}

function stemsFromResponse(resp) {
  if (!resp || typeof resp !== "object") return [];
  const map = {
    vocalUrl: "Vocals",
    backingVocalsUrl: "BackingVocals",
    instrumentalUrl: "Instrumental",
    drumsUrl: "Drums",
    bassUrl: "Bass",
    guitarUrl: "Guitar",
    keyboardUrl: "Keyboard",
    percussionUrl: "Percussion",
    stringsUrl: "Strings",
    synthUrl: "Synth",
    fxUrl: "FX",
    brassUrl: "Brass",
    woodwindsUrl: "Woodwinds",
  };
  const out = [];
  for (const [k, name] of Object.entries(map)) {
    const url = resp[k];
    if (typeof url === "string" && url.startsWith("http")) out.push({ name, url });
  }
  // Prefer keeping Instrumental out when multi stems exist (instrumentalUrl is null for split_stem anyway)
  return out;
}

function clampNum(n, min, max) {
  const x = Number.isFinite(Number(n)) ? Number(n) : min;
  return Math.max(min, Math.min(max, x));
}

// Initial credits fetch (best effort)
void refreshSunoCredits();
renderCreditsHistory();
loadProfile();
loadAuthSession();
renderAuthStatus();
void (async () => {
  await loadPublicConfig();
  const usedCodeFlow = await maybeHandleAuthCodeFromQuery();
  const usedTokenFlow = !usedCodeFlow && maybeHandleMagicLinkFromHash();
  await refreshAuthStateFromSupabase();
  if (usedCodeFlow || usedTokenFlow) window.location.hash = "#/generate";

  // Always hydrate from cloud when a valid session exists (not only callback flows).
  if (authSession?.user?.id) {
    const cloud = await supabaseLoadProfile();
    if (cloud) saveProfile(cloud);
    else {
      // Ensure profile id tracks logged-in user for per-user storage keys.
      saveProfile({ ...activeProfile, id: String(authSession.user.id), email: authSession.user.email || activeProfile.email || "" });
    }

    if (els.profilePreviewUsernameInput) els.profilePreviewUsernameInput.value = activeProfile.username ? `@${activeProfile.username}` : "@guest";
    if (els.profilePreviewTimbreInput) els.profilePreviewTimbreInput.value = activeProfile.voiceTimbre || "";
    if (els.profilePreviewBioInput) els.profilePreviewBioInput.value = activeProfile.bio || "";
    if (els.profileIsPublic) els.profileIsPublic.checked = activeProfile.isPublic !== false;
    renderProfilePreviewFromInputs();
    renderProfileHubShared();

    await ensureUserLibraryHydrated();
  } else {
    // Never leak previous user visuals when session is not valid.
    resetProfileUiToGuest();
    if ((location.hash || "") === "#/intro") location.hash = "#/auth";
  }
})();
if (els.profilePreviewUsernameInput) els.profilePreviewUsernameInput.value = activeProfile.username ? `@${activeProfile.username}` : "@guest";
if (els.profilePreviewTimbreInput) els.profilePreviewTimbreInput.value = activeProfile.voiceTimbre || "";
if (els.profilePreviewBioInput) els.profilePreviewBioInput.value = activeProfile.bio || "";
if (els.profileIsPublic) els.profileIsPublic.checked = activeProfile.isPublic !== false;
renderProfilePreviewFromInputs();
renderProfileHubShared();
setProfileEditing(false);

// Hum → melody (MVP)
if (els.btnHumStart && els.btnHumStop && els.btnHumClear) {
  els.btnHumStart.addEventListener("click", async () => {
    if (humSession) return;
    resetAudioOutputs();
    resetVoiceOutputs();
    currentMelody = null;
    printMelody(null);

    try {
      els.btnHumStart.disabled = true;
      els.btnHumStop.disabled = false;
      els.btnHumClear.disabled = true;
      setStatus("Starting mic…");
      setProgress(2);

      // recordHumToMelody returns a session immediately; await only that (not mic init) so Generate never "freezes".
      humSession = recordHumToMelody({
        maxSeconds: 60,
        bpm: getParams().bpm,
        meter: getParams().meter,
        onMicReady: () => setStatus("Recording hum…"),
        onPartial: (m) => {
          currentMelody = m;
          printMelody(m);
        },
        onProgress: (p) => setProgress(2 + p * 40),
        onDone: (m) => {
          currentMelody = m;
          printMelody(m);
          if (currentArrangement) {
            currentArrangement = applyMelodyToArrangement(currentArrangement, currentMelody);
            printArrangement(currentArrangement);
          }
          humSession = null;
          els.btnHumStart.disabled = false;
          els.btnHumStop.disabled = true;
          els.btnHumClear.disabled = !currentMelody?.notes?.length;
          setStatus(
            m?.notes?.length
              ? "Hum recorded. Melody merged into arrangement."
              : "Mic denied or no pitch detected — hum louder / closer to the mic."
          );
          setProgress(0);
        },
      });
    } catch (e) {
      console.error(e);
      setStatus(`Hum record failed: ${e?.message || String(e)}`);
      setProgress(0);
      humSession = null;
      els.btnHumStart.disabled = false;
      els.btnHumStop.disabled = true;
      els.btnHumClear.disabled = !currentMelody?.notes?.length;
    }
  });

  els.btnHumStop.addEventListener("click", async () => {
    if (!humSession) return;
    try {
      humSession.stop();
    } finally {
      humSession = null;
      els.btnHumStart.disabled = false;
      els.btnHumStop.disabled = true;
      els.btnHumClear.disabled = !currentMelody;
      setProgress(0);
      if (currentMelody && currentArrangement) {
        currentArrangement = applyMelodyToArrangement(currentArrangement, currentMelody);
        printArrangement(currentArrangement);
      }
      setStatus(currentMelody ? "Hum stopped. Melody merged into arrangement." : "Hum stopped.");
    }
  });

  els.btnHumClear.addEventListener("click", () => {
    if (humSession) return;
    currentMelody = null;
    printMelody(null);
    els.btnHumClear.disabled = true;
    setStatus("Cleared melody.");
  });
}

// Initialize with a first arrangement
currentArrangement = generateArrangement(getParams());
currentArrangement = applyMelodyToArrangement(currentArrangement, currentMelody);
printArrangement(currentArrangement);
setStatus(
  window?.Capacitor?.isNativePlatform?.()
    ? "Ready (Native iOS app)."
    : "Ready (Web mode). Generate a new arrangement or render to WAV."
);

function clampInt(n, min, max) {
  return Math.max(min, Math.min(max, Math.round(n)));
}
