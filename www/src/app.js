import { generateArrangement, randomizeParams } from "./arrangement.js";
import { renderArrangementToWav } from "./render.js";
import { recordHumToMelody } from "./melody/extract.js";
import { mixStemsToWav } from "./studio/mixer.js";
import { encodeWav16 } from "./wav.js";

// Bumped on every deploy so we can verify, on-device, which JS version is live.
// Surfaces in the page footer (always visible) and Settings → Environment.
const APP_BUILD = "20260509tabs";

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
  profileCreditsBalance: document.getElementById("profileCreditsBalance"),
  profileCreditsNote: document.getElementById("profileCreditsNote"),
  profileCreditsLink: document.getElementById("profileCreditsLink"),
  profileQuickLinkCreditsSub: document.getElementById("profileQuickLinkCreditsSub"),
  profilePersonaRow: document.getElementById("profilePersonaRow"),
  profilePersonaLabel: document.getElementById("profilePersonaLabel"),
  creditsBalanceBig: document.getElementById("creditsBalanceBig"),
  creditsHeroEmail: document.getElementById("creditsHeroEmail"),
  creditsRedeemInput: document.getElementById("creditsRedeemInput"),
  btnCreditsRedeem: document.getElementById("btnCreditsRedeem"),
  creditsRedeemMsg: document.getElementById("creditsRedeemMsg"),
  creditsLedgerList: document.getElementById("creditsLedgerList"),
  creditsAdminCard: document.getElementById("creditsAdminCard"),
  adminMasterSuno: document.getElementById("adminMasterSuno"),
  adminAllocated: document.getElementById("adminAllocated"),
  adminSpent: document.getElementById("adminSpent"),
  adminOutstanding: document.getElementById("adminOutstanding"),
  adminUsers: document.getElementById("adminUsers"),
  adminCodesRedeemed: document.getElementById("adminCodesRedeemed"),
  adminCodesList: document.getElementById("adminCodesList"),
  soundPrompt: document.getElementById("soundPrompt"),
  soundLoop: document.getElementById("soundLoop"),
  soundTempo: document.getElementById("soundTempo"),
  soundTempoLabel: document.getElementById("soundTempoLabel"),
  soundKeySelect: document.getElementById("soundKeySelect"),
  soundGrabLyrics: document.getElementById("soundGrabLyrics"),
  btnSoundGenerate: document.getElementById("btnSoundGenerate"),
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
  playerConfirm: document.getElementById("playerConfirm"),
  playerConfirmThumb: document.getElementById("playerConfirmThumb"),
  playerConfirmText: document.getElementById("playerConfirmText"),
  playerConfirmCancel: document.getElementById("playerConfirmCancel"),
  playerConfirmOk: document.getElementById("playerConfirmOk"),

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
  btnLibraryDiagnostic: document.getElementById("btnLibraryDiagnostic"),
  libraryDiagnosticOutput: document.getElementById("libraryDiagnosticOutput"),
  libraryStorageBanner: document.getElementById("libraryStorageBanner"),
  libraryStorageBannerText: document.getElementById("libraryStorageBannerText"),
  btnLibraryFreeSpace: document.getElementById("btnLibraryFreeSpace"),
  btnLibraryFreeSpaceAlt: document.getElementById("btnLibraryFreeSpaceAlt"),
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
  libraryTabDot: document.getElementById("libraryTabDot"),
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
/** Avoid mini-player toggling when scroll hovers near the visibility threshold. */
let hubPlayingPostProminent = false;
function isPlayingHubPostVisible() {
  if (!hubAudioPostId) return false;
  const route = document.body.getAttribute("data-route") || "";
  if (route !== "hub") {
    hubPlayingPostProminent = false;
    return false;
  }
  const row = document.querySelector(`[data-hub-row="${hubAudioPostId}"]`);
  if (!row) {
    hubPlayingPostProminent = false;
    return false;
  }
  const r = row.getBoundingClientRect();
  const vh = window.innerHeight || document.documentElement.clientHeight || 0;
  const visiblePx = Math.max(0, Math.min(r.bottom, vh) - Math.max(r.top, 0));
  const ratio = r.height > 0 ? visiblePx / r.height : 0;
  const ENTER = 0.42;
  const EXIT = 0.26;
  if (!hubPlayingPostProminent) {
    if (ratio >= ENTER) hubPlayingPostProminent = true;
  } else if (ratio <= EXIT) {
    hubPlayingPostProminent = false;
  }
  return hubPlayingPostProminent;
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
 * the tap fires ~280ms later, calls `startHubPlayback(oldPostId)`, and scroll-
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

function getHubRowIntersectionRatio(row) {
  if (!row) return 0;
  const r = row.getBoundingClientRect();
  const vh = window.innerHeight || document.documentElement.clientHeight || 0;
  const visiblePx = Math.max(0, Math.min(r.bottom, vh) - Math.max(r.top, 0));
  return r.height > 0 ? visiblePx / r.height : 0;
}

function getHubRowClosestToViewportCenter() {
  const root = els.hubList;
  if (!root) return null;
  const rows = root.querySelectorAll("[data-hub-row]");
  if (!rows.length) return null;
  const vh = window.innerHeight || document.documentElement.clientHeight || 0;
  const cy = vh / 2;
  const bandTop = vh * 0.22;
  const bandBottom = vh * 0.78;
  let bestInBandId = null;
  let bestInBandDist = Infinity;
  let bestIntersectId = null;
  let bestIntersectDist = Infinity;
  let bestAreaId = null;
  let bestAreaPx = -1;
  rows.forEach((row) => {
    const r = row.getBoundingClientRect();
    const id = row.getAttribute("data-hub-row");
    if (!id) return;
    const mid = r.top + r.height / 2;
    const d = Math.abs(mid - cy);
    const visiblePx = Math.max(0, Math.min(r.bottom, vh) - Math.max(r.top, 0));
    const overlapsBand = r.bottom > bandTop && r.top < bandBottom;
    if (overlapsBand && visiblePx > 12 && d < bestInBandDist) {
      bestInBandDist = d;
      bestInBandId = id;
    }
    if (visiblePx > 0 && d < bestIntersectDist) {
      bestIntersectDist = d;
      bestIntersectId = id;
    }
    if (visiblePx > bestAreaPx) {
      bestAreaPx = visiblePx;
      bestAreaId = id;
    }
  });
  // Prefer the row that crosses the middle “reading band” — stable when the
  // viewport center sits in whitespace between two cards.
  return bestInBandId || bestIntersectId || bestAreaId;
}

// Don't run *audio* on every scroll frame — that was the cause of "rapid
// play/stop": while the user dragged, every frame
// `getHubRowClosestToViewportCenter` could pick a different row and we'd
// start/abandon playback in a loop. So audio waits for the scroll to be
// quiet for ~280ms (or instantly on `scrollend`).
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
  }, 280);
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
  // `metadata` fetches just the headers (~16 KB) so we know duration
  // without committing to the entire file. The full bytes only arrive
  // when the user actually presses play, which keeps cellular cold-starts
  // snappy. Once playback starts the browser switches to streaming
  // automatically.
  a.preload = "metadata";
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
  const centerRow = els.hubList.querySelector(`[data-hub-row="${centerId}"]`);
  if (getHubRowIntersectionRatio(centerRow) < 0.1) return;
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
  hubPlayingPostProminent = false;
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
  if (hubAudioPostId !== postId) hubPlayingPostProminent = false;
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
  // The mini-player is now a global persistent surface — it shows for any
  // active source (Hub post, Library track, generated result) and hides
  // contextually so it never duplicates a richer "now playing" UI:
  //  - hidden on /player (the full-screen Now Playing replaces it);
  //  - hidden on Hub when the playing post is on-screen;
  //  - hidden on Library (the row already shows the EQ + dot indicator);
  //  - hidden on Generate when a result card is mid-playback (the card
  //    shows its own progress + play/pause already).
  const hideOnHubVisible = isPlayingHubPostVisible();
  const hideOnLibrary = route === "library";
  const hideOnPlayer = route === "player";
  const hideOnGenerate = route === "generate" && miniSource?.type === "generateResult";
  // hubAudio is the active audio element (either the internal hub audio or
  // playerEl when streaming Library/Generated tracks), so its paused state
  // is the single source of truth for "is anything playing right now".
  const isPlaying = Boolean(hubAudio && !hubAudio.paused && !hubAudio.ended);
  const active = Boolean(hubNowMeta && isPlaying) && !hideOnHubVisible && !hideOnLibrary && !hideOnPlayer && !hideOnGenerate;
  if (!active) {
    els.hubNowPlaying.classList.remove("isVisible", "isPlaying");
    setTimeout(() => {
      if (els.hubNowPlaying && !els.hubNowPlaying.classList.contains("isVisible")) {
        els.hubNowPlaying.style.display = "none";
      }
    }, 220);
    return;
  }
  els.hubNowPlaying.style.display = "";
  requestAnimationFrame(() => {
    els.hubNowPlaying.classList.add("isVisible", "isPlaying");
  });
  if (els.hubNowArt) els.hubNowArt.src = hubNowMeta.art || "./assets/nabadai-logo.png";
  if (els.hubNowTitle) els.hubNowTitle.textContent = hubNowMeta.title || "Now playing";
  if (els.hubNowProgBar && hubAudio?.duration && Number.isFinite(hubAudio.duration)) {
    const pct = Math.max(0, Math.min(100, (hubAudio.currentTime / hubAudio.duration) * 100));
    els.hubNowProgBar.style.width = `${pct}%`;
  }
}

let hubNowPlayingScrollRaf = 0;
function scheduleRenderHubNowPlaying() {
  if (hubNowPlayingScrollRaf) return;
  hubNowPlayingScrollRaf = requestAnimationFrame(() => {
    hubNowPlayingScrollRaf = 0;
    renderHubNowPlaying();
  });
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
    // Once we know the Supabase host, hint the browser so the very first
    // hub_posts query opens TLS instantly. Idempotent — multiple calls
    // just stack identical <link> tags which the browser collapses.
    if (SUPABASE_URL) addPreconnectHint(SUPABASE_URL);
  } catch {}
}
const _addedPreconnects = new Set();
function addPreconnectHint(url) {
  try {
    const u = new URL(url, location.origin);
    const origin = `${u.protocol}//${u.host}`;
    if (_addedPreconnects.has(origin)) return;
    _addedPreconnects.add(origin);
    const link = document.createElement("link");
    link.rel = "preconnect";
    link.href = origin;
    link.crossOrigin = "anonymous";
    document.head.appendChild(link);
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

/** Suno "Sounds" task polling (separate from full-song generate). */
let soundTaskId = "";
let soundPollTimer = null;

/** Shorten a sound's title for display: keep just the first 2 meaningful
 *  words (or up to ~24 chars). The full prompt remains in `meta.soundPrompt`
 *  so we can render it as a description later without losing context. */
function shortenSoundTitle(raw) {
  const cleaned = String(raw || "").replace(/[\r\n]+/g, " ").replace(/\s+/g, " ").trim();
  if (!cleaned) return "Sound";
  const upTo = cleaned.split(/[,.;:!?]/)[0].trim() || cleaned;
  const words = upTo.split(/\s+/).filter(Boolean);
  let head = words.slice(0, 2).join(" ");
  if (head.length < 3) head = words.slice(0, 3).join(" ");
  if (head.length > 28) head = `${head.slice(0, 27)}…`;
  if (!head) head = cleaned.slice(0, 24);
  return head.charAt(0).toUpperCase() + head.slice(1);
}

/** Library tab red-dot persistence — fires on sound generations to nudge the
 *  user that something landed; full songs use the result card instead. */
const LIBRARY_TAB_DOT_KEY = "mas:libraryTabDot:v1";
function markLibraryTabDot(on) {
  try {
    if (on) localStorage.setItem(LIBRARY_TAB_DOT_KEY, "1");
    else localStorage.removeItem(LIBRARY_TAB_DOT_KEY);
  } catch {}
  if (els.libraryTabDot) {
    const route = document.body.getAttribute("data-route") || "";
    const visible = on && route !== "library";
    els.libraryTabDot.style.display = visible ? "inline-block" : "none";
  }
}
function syncLibraryTabDotFromStorage() {
  let stored = "";
  try { stored = localStorage.getItem(LIBRARY_TAB_DOT_KEY) || ""; } catch {}
  markLibraryTabDot(stored === "1");
}

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
  const allowedRoutes = new Set(["intro", "start", "auth", "generate", "library", "hub", "settings", "profile", "player", "search", "vocal", "stems", "advanced", "user", "credits", "sounds"]);
  const normalized = pendingPublicUsername ? "user" : (route === "start" ? "intro" : route);
  let wanted = allowedRoutes.has(normalized) ? normalized : "generate";
  // Public profile is intentionally readable without auth so share-link
  // visitors don't hit a wall before discovering the rest of the product.
  const protectedRoutes = new Set(["generate", "library", "profile", "player", "vocal", "stems", "advanced", "credits", "sounds"]);
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
    // Paint synchronously from the local feed cache so the Hub never
    // looks blank on route entry. Cloud refresh below repaints once the
    // merged set lands. Same pattern as Library: cache-first, network
    // catches up.
    try { renderHub(); } catch {}
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
    void refreshMyCredits({ silent: true });
    renderPersonaSelect();
  }
  if (wanted === "credits" || wanted === "sounds") {
    void refreshMyCredits({ silent: true });
  }
  if (wanted === "library") {
    markLibraryTabDot(false);
    // One synchronous paint from the in-memory + memoized local cache so
    // the tab never flashes empty while `reconcileLibraryFromCloud` waits
    // for idle + network (scheduled from hashchange).
    renderLibrary();
    // If we're logged in but local JSON is still empty (hydrate failed,
    // storage quota, or first tap landed before boot finished), pull once
    // with `force` so the 30s reconcile throttle doesn't block recovery.
    if (authSession?.user?.id && !loadLibrary().length) {
      const run = () => void reconcileLibraryFromCloud({ force: true });
      if (typeof requestIdleCallback === "function") {
        requestIdleCallback(run, { timeout: 1200 });
      } else {
        setTimeout(run, 0);
      }
    }
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
  updateProfilePersonaRow();
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
  savePersonaSelection("");
  document.body.classList.remove("proMode");
  if (els.advancedSheet) els.advancedSheet.open = false;
  updateProfilePersonaRow();
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
syncLibraryTabDotFromStorage();
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
const PERSONA_SELECTED_KEY = "mas:personaSelected:v1";
function personaSelectedStorageKey() {
  const uid = authSession?.user?.id || activeProfile?.id || "guest";
  return `${PERSONA_SELECTED_KEY}:${uid}`;
}
function loadPersonaSelection() {
  try {
    return localStorage.getItem(personaSelectedStorageKey()) || "";
  } catch {
    return "";
  }
}
function savePersonaSelection(id) {
  try {
    const k = personaSelectedStorageKey();
    if (id) localStorage.setItem(k, String(id));
    else localStorage.removeItem(k);
  } catch {}
}
function updateProfilePersonaRow() {
  if (!els.profilePersonaRow || !els.profilePersonaLabel) return;
  if (!authSession?.user?.id) {
    els.profilePersonaRow.style.display = "none";
    return;
  }
  const idFromSelect = String(els.sunoPersonaId?.value || "").trim();
  const idSaved = loadPersonaSelection().trim();
  const id = idFromSelect || idSaved;
  const list = loadPersonas();
  const hit = list.find((x) => String(x.personaId) === id);
  if (!id || !hit) {
    els.profilePersonaRow.style.display = "none";
    return;
  }
  els.profilePersonaRow.style.display = "";
  els.profilePersonaLabel.textContent = hit.label || id.slice(0, 12) + "…";
}
const AUTH_SESSION_KEY = "mas:supabase:session:v1";
const AUTH_PKCE_KEY = "mas:supabase:pkce:v1";
let activeProfile = { id: "guest", username: "guest", email: "" };
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
  // 30 rows is enough to fill the visible feed plus a healthy backlog
  // for the IntersectionObserver "Load more" path. Older posts are
  // still reachable via subsequent paginated fetches if we ever need
  // them (kept in sync with HUB_PAGE_SIZE * ~1.5).
  const r = await fetch(`${SUPABASE_URL}/rest/v1/hub_posts?select=${encodeURIComponent(selectCols)}&order=created_at.desc&limit=30`, {
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

/* -----------------------------------------------------------------
 *  Per-user credits (friends-beta promo system)
 *
 *  - Profile shows a live balance pill that links to the Credits page.
 *  - Credits page redeems promo codes, shows ledger, and (admin only)
 *    surfaces the master Suno balance + per-code usage.
 *  - Generation paths inspect the same balance to display a friendly
 *    "redeem a code" prompt instead of a generic Suno error.
 *
 *  Server side: api/credits/* and api/_lib/credits-auth.js.
 * ----------------------------------------------------------------- */
const FULL_SONG_CREDIT_COST = 12;
/** Mirrors Suno pricing for `/api/v1/generate/sounds` (beta). */
const SOUND_CREDIT_COST = 2.5;
const creditsState = {
  balance: 0,
  ledger: [],
  isAdmin: false,
  loaded: false,
  inFlight: false,
  lastError: "",
};

function formatCreditsAmount(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return "0";
  const clamped = Math.max(0, x);
  const s = clamped.toFixed(4).replace(/\.?0+$/, "");
  return s || "0";
}

function setCreditsBalance(n) {
  const raw = Number(n);
  const v = Number.isFinite(raw) ? Math.max(0, raw) : 0;
  creditsState.balance = v;
  const disp = formatCreditsAmount(v);
  if (els.profileCreditsBalance) els.profileCreditsBalance.textContent = disp;
  if (els.creditsBalanceBig) els.creditsBalanceBig.textContent = disp;
  if (els.profileQuickLinkCreditsSub) {
    els.profileQuickLinkCreditsSub.textContent = creditsState.loaded
      ? (v > 0 ? `Balance: ${disp} credits` : "Tap to redeem a code")
      : "Tap to redeem a code";
  }
}

function formatLedgerReason(reason) {
  const r = String(reason || "");
  if (r === "promo_redeem") return "Promo code redeemed";
  if (r === "full_song") return "Full song generation";
  if (r === "sound_generate") return "Sound generation";
  if (r === "refund_full_song") return "Refund (failed generation)";
  if (r === "refund_sound_generate") return "Refund (failed sound)";
  if (r === "stems") return "Stems";
  if (r === "persona") return "Voice persona";
  return r.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
}

function renderCreditsLedger() {
  const root = els.creditsLedgerList;
  if (!root) return;
  const rows = creditsState.ledger || [];
  if (!rows.length) {
    root.innerHTML = `<div class="creditsLedgerEmpty">No activity yet.</div>`;
    return;
  }
  root.innerHTML = rows
    .map((row) => {
      const delta = Number(row?.delta || 0);
      const deltaDisp = formatCreditsAmount(Math.abs(delta));
      const sign = delta > 0 ? "+" : delta < 0 ? "−" : "";
      const cls = delta > 0 ? "isPositive" : delta < 0 ? "isNegative" : "";
      const reason = formatLedgerReason(row?.reason);
      const ref = String(row?.ref || "").trim();
      const ts = row?.created_at ? new Date(row.created_at) : null;
      const when = ts && !Number.isNaN(ts.valueOf()) ? ts.toLocaleString() : "";
      return `
        <div class="creditsLedgerRow ${cls}">
          <div class="creditsLedgerMain">
            <div class="creditsLedgerReason">${escapeHtml(reason)}</div>
            <div class="creditsLedgerSub">${escapeHtml(when)}${ref ? ` · ${escapeHtml(ref)}` : ""}</div>
          </div>
          <div class="creditsLedgerDelta">${sign}${deltaDisp}</div>
        </div>`;
    })
    .join("");
}

async function refreshMyCredits({ silent = false } = {}) {
  if (creditsState.inFlight) return creditsState;
  const token = getSupabaseAuthToken();
  if (!token) {
    creditsState.loaded = false;
    setCreditsBalance(0);
    creditsState.ledger = [];
    renderCreditsLedger();
    if (els.creditsAdminCard) els.creditsAdminCard.style.display = "none";
    return creditsState;
  }
  creditsState.inFlight = true;
  try {
    const r = await fetch(apiUrl("/api/credits/me"), {
      headers: { Authorization: `Bearer ${token}` },
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d?.error || `credits/me ${r.status}`);
    creditsState.balance = Number(d?.balance || 0);
    creditsState.ledger = Array.isArray(d?.ledger) ? d.ledger : [];
    creditsState.isAdmin = Boolean(d?.isAdmin);
    creditsState.loaded = true;
    creditsState.lastError = "";
    setCreditsBalance(creditsState.balance);
    renderCreditsLedger();
    if (els.creditsHeroEmail && d?.email) {
      els.creditsHeroEmail.textContent = String(d.email);
      els.creditsHeroEmail.style.display = "";
    } else if (els.creditsHeroEmail) {
      els.creditsHeroEmail.style.display = "none";
    }
    if (els.creditsAdminCard) {
      els.creditsAdminCard.style.display = creditsState.isAdmin ? "" : "none";
    }
    if (creditsState.isAdmin) void refreshAdminCreditsView();
  } catch (e) {
    creditsState.lastError = e?.message || String(e);
    if (!silent) console.warn("[credits/me]", creditsState.lastError);
  } finally {
    creditsState.inFlight = false;
  }
  return creditsState;
}

async function refreshAdminCreditsView() {
  const token = getSupabaseAuthToken();
  if (!token) return;
  try {
    const r = await fetch(apiUrl("/api/credits/admin"), {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!r.ok) return;
    const d = await r.json().catch(() => ({}));
    if (!d?.ok) return;
    if (els.adminMasterSuno) els.adminMasterSuno.textContent = d.masterSuno == null ? "—" : String(d.masterSuno);
    const s = d.summary || {};
    if (els.adminAllocated) els.adminAllocated.textContent = String(s.allocatedTotal || 0);
    if (els.adminSpent) els.adminSpent.textContent = String(s.spentTotal || 0);
    if (els.adminOutstanding) els.adminOutstanding.textContent = String(s.outstanding || 0);
    if (els.adminUsers) els.adminUsers.textContent = String(s.users || 0);
    if (els.adminCodesRedeemed)
      els.adminCodesRedeemed.textContent = `${s.codesRedeemed || 0} / ${s.codesTotal || 0}`;
    if (els.adminCodesList) {
      const codes = Array.isArray(d.codes) ? d.codes : [];
      els.adminCodesList.innerHTML = codes.length
        ? codes
            .map((c) => {
              const used = Number(c?.redemptions || 0) >= Number(c?.max_redemptions || 1);
              const cls = !c?.active || used ? "isUsed" : "isOpen";
              return `
                <div class="creditsAdminCodeRow ${cls}">
                  <div class="creditsAdminCodeText">${escapeHtml(c.code)}</div>
                  <div class="creditsAdminCodeMeta">${Number(c.credits || 0)} cr · ${Number(c.redemptions || 0)}/${Number(c.max_redemptions || 1)}${c.active ? "" : " · inactive"}</div>
                </div>`;
            })
            .join("")
        : `<div class="creditsLedgerEmpty">No promo codes yet.</div>`;
    }
  } catch {}
}

function setCreditsRedeemMsg(text, kind) {
  if (!els.creditsRedeemMsg) return;
  if (!text) {
    els.creditsRedeemMsg.style.display = "none";
    els.creditsRedeemMsg.textContent = "";
    els.creditsRedeemMsg.classList.remove("isOk", "isWarn", "isErr");
    return;
  }
  els.creditsRedeemMsg.style.display = "";
  els.creditsRedeemMsg.textContent = text;
  els.creditsRedeemMsg.classList.remove("isOk", "isWarn", "isErr");
  els.creditsRedeemMsg.classList.add(
    kind === "ok" ? "isOk" : kind === "warn" ? "isWarn" : "isErr"
  );
}

async function redeemPromoCode(rawCode) {
  const token = getSupabaseAuthToken();
  if (!token) {
    setCreditsRedeemMsg("Sign in with Google first to redeem a code.", "err");
    return;
  }
  const code = String(rawCode || "").trim().toUpperCase();
  if (!code) {
    setCreditsRedeemMsg("Enter a code to redeem.", "warn");
    return;
  }
  if (els.btnCreditsRedeem) els.btnCreditsRedeem.disabled = true;
  setCreditsRedeemMsg("Redeeming…", "warn");
  try {
    const r = await fetch(apiUrl("/api/credits/redeem"), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ code }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok || !d?.ok) {
      setCreditsRedeemMsg(d?.message || d?.error || "Could not redeem code.", "err");
      return;
    }
    if (d.status === "redeemed") {
      setCreditsRedeemMsg(
        `+${formatCreditsAmount(d.creditsAdded)} credits added. New balance: ${formatCreditsAmount(d.balance)}.`,
        "ok"
      );
      if (els.creditsRedeemInput) els.creditsRedeemInput.value = "";
    } else if (d.status === "already_redeemed") {
      setCreditsRedeemMsg("You already redeemed this code.", "warn");
    } else {
      setCreditsRedeemMsg(d.message || "Code not accepted.", "err");
    }
    await refreshMyCredits();
  } catch (e) {
    setCreditsRedeemMsg(e?.message || "Network error.", "err");
  } finally {
    if (els.btnCreditsRedeem) els.btnCreditsRedeem.disabled = false;
  }
}

function extractFirstClipFromSunoStatusPayload(data) {
  const genData = data?.data?.response?.sunoData || data?.data?.response?.suno_data || [];
  const first = Array.isArray(genData) ? genData[0] : null;
  if (!first) {
    return { first: null, audioUrl: "", imageUrl: null, title: "", audioId: "" };
  }
  const audioUrl =
    first.sourceAudioUrl ||
    first.source_audio_url ||
    first.sourceStreamAudioUrl ||
    first.source_stream_audio_url ||
    first.audioUrl ||
    first.audio_url ||
    first.streamAudioUrl ||
    first.stream_audio_url ||
    "";
  const imageUrl =
    first.sourceImageUrl ||
    first.source_image_url ||
    first.imageUrl ||
    first.image_url ||
    first.coverUrl ||
    first.cover_url ||
    null;
  const title = first.title || first.songTitle || first.song_title || "";
  const audioId =
    first.id ||
    first.audioId ||
    first.audio_id ||
    first.songId ||
    first.song_id ||
    "";
  return { first, audioUrl, imageUrl, title, audioId };
}

function stopSoundGenerationPolling() {
  if (soundPollTimer) {
    clearInterval(soundPollTimer);
    soundPollTimer = null;
  }
}

function startSoundGenerationPolling(meta) {
  stopSoundGenerationPolling();
  let tries = 0;
  const maxTries = 160;
  soundPollTimer = setInterval(async () => {
    tries += 1;
    try {
      const r = await fetch(apiUrl(`/api/suno/status?taskId=${encodeURIComponent(soundTaskId)}`));
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data?.error || "Status failed");
      const status = String(data?.data?.status || data?.status || "").toUpperCase();
      const clip = extractFirstClipFromSunoStatusPayload(data);
      if (clip.audioUrl) {
        const url = toAudioProxyUrl(clip.audioUrl) || clip.audioUrl;
        stopSoundGenerationPolling();
        const candidate = String(clip.title || meta.fallbackTitle || "Sound").trim();
        const finalTitle = shortenSoundTitle(candidate || "Sound");
        addToLibrary({
          title: finalTitle,
          artUrl: clip.imageUrl || "./assets/nabadai-logo.png",
          url,
          taskId: soundTaskId || "",
          audioId: String(clip.audioId || ""),
          kind: "sound",
          meta: meta.libraryMeta,
        });
        setStatus("Sound saved to Library.");
        setLoading(false);
        if (els.btnSoundGenerate) els.btnSoundGenerate.disabled = false;
        markLibraryTabDot(true);
        showToast("Sound saved to your Library", { icon: "✓", durationMs: 3200 });
        void refreshMyCredits({ silent: true });
        return;
      }
      if (status === "FAILED" || status === "ERROR") {
        stopSoundGenerationPolling();
        setStatus("Sound generation failed on Suno's side. Check Recent activity for charges.");
        setLoading(false);
        if (els.btnSoundGenerate) els.btnSoundGenerate.disabled = false;
        return;
      }
      if (tries >= maxTries) {
        stopSoundGenerationPolling();
        setStatus("Still processing — check Library in a minute.");
        setLoading(false);
        if (els.btnSoundGenerate) els.btnSoundGenerate.disabled = false;
      }
    } catch (e) {
      if (tries >= 10) {
        stopSoundGenerationPolling();
        setStatus(`Could not get sound status: ${e?.message || String(e)}`);
        setLoading(false);
        if (els.btnSoundGenerate) els.btnSoundGenerate.disabled = false;
      }
    }
  }, 4500);
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
    void refreshMyCredits({ silent: true });
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
  // Reset hydrate flags so the next sign-in re-runs the cloud pull
  // and the loading state appears for the new account.
  _libraryHydrateInFlight = false;
  _libraryHydrateCompleted = false;
  _lastUserSongInsertFailure = "";
  _lastLibraryPersistError = "";
  _lastLibraryPersistedCount = 0;
  invalidateLibraryMemCache();
  renderProfilePreviewFromInputs();
  renderProfileHubShared();
  setProfileEditing(false);
  renderLibrary();
  if (els.profilePersonaRow) els.profilePersonaRow.style.display = "none";
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
/** Last status of the most recent `supabaseLoadUserSongs` call. The
 *  Library renderer uses this to differentiate between "cloud has
 *  zero rows" (user genuinely has nothing synced) and "fetch failed"
 *  (network / auth / RLS issue) so the empty state can show a
 *  different message in each case.
 */
let _lastUserSongsLoadStatus = "ok"; // "ok" | "auth" | "network" | "http"
let _lastUserSongsLoadDetails = "";

async function supabaseLoadUserSongs() {
  const token = getSupabaseAuthToken();
  if (!token || !authSession?.user?.id) {
    _lastUserSongsLoadStatus = "auth";
    _lastUserSongsLoadDetails = !token ? "no_token" : "no_user_id";
    return [];
  }
  const uid = encodeURIComponent(authSession.user.id);
  // Slim list: render-only columns. We deliberately omit `meta` here
  // because legacy rows can carry base64 cover data URLs in
  // `meta.imageUrl`, which inflated the response into multi-MB
  // territory on cold PWA logins. Custom covers now live in
  // localStorage thumbs; metadata is only needed by Song Details (and
  // the local copy already has it for tracks generated on this device).
  const cols = "id,created_at,title,art_url,song_url,task_id,audio_id,kind";
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 12000);
  let r;
  try {
    r = await fetch(`${SUPABASE_URL}/rest/v1/user_songs?user_id=eq.${uid}&select=${cols}&order=created_at.desc&limit=500`, {
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${token}`,
      },
      signal: ctrl.signal,
      cache: "no-store",
    });
  } catch (e) {
    clearTimeout(timer);
    _lastUserSongsLoadStatus = "network";
    _lastUserSongsLoadDetails = String(e?.message || e || "fetch_aborted").slice(0, 120);
    return [];
  }
  clearTimeout(timer);
  if (!r.ok) {
    _lastUserSongsLoadStatus = "http";
    const txt = await r.text().catch(() => "");
    _lastUserSongsLoadDetails = `${r.status} ${String(txt).slice(0, 120)}`;
    return [];
  }
  const rows = await r.json().catch(() => []);
  if (!Array.isArray(rows)) {
    _lastUserSongsLoadStatus = "http";
    _lastUserSongsLoadDetails = "non_array_response";
    return [];
  }
  _lastUserSongsLoadStatus = "ok";
  _lastUserSongsLoadDetails = "";
  return rows.map((s) => ({
    id: String(s.id || `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`),
    ts: new Date(s.created_at || Date.now()).getTime(),
    title: s.title || "Generated song",
    artUrl: s.art_url || "",
    url: s.song_url || "",
    taskId: s.task_id || "",
    audioId: s.audio_id || "",
    kind: s.kind || "full",
    meta: null,
  }));
}
/** Strip values that aren't safe / efficient to ship to a JSONB row in
 *  Supabase. v1 Library cloud sync intentionally leaves custom-cover
 *  data: URLs out of the payload — they're typically 200–500 KB each
 *  and would inflate every user_songs row by an order of magnitude.
 *  Phase C will upload custom covers to Supabase Storage and store the
 *  resulting public URL here instead.
 */
function sanitizeMetaForCloud(meta) {
  if (!meta || typeof meta !== "object") return meta || null;
  const out = { ...meta };
  for (const k of ["imageUrl", "imageThumb"]) {
    const v = out[k];
    if (typeof v === "string" && v.startsWith("data:")) delete out[k];
  }
  return out;
}

/** Last cloud insert failure for `user_songs` (RLS, missing table,
 *  schema mismatch). Cleared on a successful insert. The Library
 *  empty state surfaces this so "0 rows" isn't mistaken for "no songs"
 *  when the real issue is writes blocked server-side.
 */
let _lastUserSongInsertFailure = "";

function recordUserSongInsertResult(ins) {
  if (ins?.ok) {
    _lastUserSongInsertFailure = "";
    return;
  }
  const msg = `${ins?.reason || "fail"}${ins?.details ? `: ${ins.details}` : ""}`.slice(0, 280);
  _lastUserSongInsertFailure = msg;
  try {
    console.warn("[user_songs] insert failed:", msg);
  } catch {}
}

async function supabaseInsertUserSong(track) {
  const token = getSupabaseAuthToken();
  if (!token || !authSession?.user?.id) {
    return { ok: false, reason: "no_auth" };
  }
  const rawArt = String(track.artUrl || "");
  const payload = {
    user_id: authSession.user.id,
    title: track.title || "Generated song",
    // Skip data: URLs for the same reason as meta above. If the only
    // cover we have right now is a local upload, send empty and let
    // Phase C populate a real URL later.
    art_url: rawArt.startsWith("data:") ? "" : rawArt,
    song_url: track.url || "",
    task_id: track.taskId || "",
    audio_id: track.audioId || "",
    kind: track.kind || "full",
    meta: sanitizeMetaForCloud(track.meta || null),
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
  if (!r) {
    const fail = { ok: false, reason: "network" };
    recordUserSongInsertResult(fail);
    return fail;
  }
  if (!r.ok) {
    const txt = await r.text().catch(() => "");
    // HTTP 409 / Postgres unique_violation (SQLSTATE 23505) means the
    // row already exists in the cloud — that's a success from the
    // app's perspective (the song is safely synced), not a failure.
    // Don't surface it as an error and don't poison the empty-state
    // "Last cloud save error" line.
    const looksDuplicate = r.status === 409 || /23505|duplicate key/i.test(txt);
    if (looksDuplicate) {
      recordUserSongInsertResult({ ok: true });
      return { ok: true, reason: "duplicate" };
    }
    const fail = { ok: false, reason: `http_${r.status}`, details: String(txt).slice(0, 180) };
    recordUserSongInsertResult(fail);
    return fail;
  }
  recordUserSongInsertResult({ ok: true });
  return { ok: true };
}
/** Patch an existing `user_songs` row keyed by (user_id, song_url, kind).
 *  Used when a track changes locally — currently just custom-cover
 *  uploads from the Player. Fire-and-forget; failures fall back to
 *  localStorage being authoritative until the next reconcile.
 */
async function supabasePatchUserSong(track, patch) {
  const token = getSupabaseAuthToken();
  if (!token || !authSession?.user?.id) return { ok: false, reason: "no_auth" };
  const songUrl = String(track?.url || "").trim();
  if (!songUrl) return { ok: false, reason: "no_song_url" };
  const uid = encodeURIComponent(authSession.user.id);
  const url = encodeURIComponent(songUrl);
  const kind = encodeURIComponent(String(track?.kind || "full"));
  const body = {};
  if (typeof patch?.title === "string") body.title = patch.title;
  // Same reasoning as in supabaseInsertUserSong: don't ship a custom
  // cover data URL into a JSONB row, and don't overwrite an existing
  // remote art_url with empty just because the user uploaded a local
  // cover. We push only real (non-data:) URLs.
  if (typeof patch?.artUrl === "string" && patch.artUrl && !patch.artUrl.startsWith("data:")) {
    body.art_url = patch.artUrl;
  }
  if (patch?.meta && typeof patch.meta === "object") {
    body.meta = sanitizeMetaForCloud(patch.meta);
  }
  if (Object.keys(body).length === 0) return { ok: false, reason: "noop" };
  const r = await fetch(`${SUPABASE_URL}/rest/v1/user_songs?user_id=eq.${uid}&song_url=eq.${url}&kind=eq.${kind}`, {
    method: "PATCH",
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify(body),
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
  // Local-only id for the optimistic render. We swap it out for the
  // cloud-issued UUID as soon as the insert returns, so the next
  // refresh from Supabase merges by id without producing a duplicate.
  const localId = `hub_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const url = String(track.url || "").trim();
  const title = String(track.title || "Untitled").trim();
  const kind = track.kind || "full";

  // Defensive dedupe: if this same song was just published by the same
  // creator (within 30s) and is already in the feed (e.g. user
  // double-tapped Publish), drop the older local placeholder.
  const recentDupe = feed.findIndex((p) => {
    const sameUrl = url && String(p?.url || "").trim() === url;
    const sameKind = String(p?.kind || "full") === kind;
    const sameCreator = String(p?.creator || "") === creator;
    const isRecent = Math.abs(Date.now() - Number(p?.ts || 0)) < 30_000;
    return sameUrl && sameKind && sameCreator && isRecent;
  });
  if (recentDupe >= 0) feed.splice(recentDupe, 1);

  const newPost = {
    id: localId,
    ts: Date.now(),
    title,
    artUrl: track.artUrl || "",
    url,
    kind,
    creator,
    creatorAvatar: String(activeProfile.avatar || "./assets/nabadai-logo.png"),
    ownerDeviceId: getLocalDeviceId(),
    likes: 0,
    reacts: { melody: 0, lyrics: 0, mix: 0, groove: 0 },
    remixOf: track?.remixOf || "",
    proof,
    meta: {
      ...(track.meta || {}),
      creatorUserId,
      taskId: String(track.taskId || track?.meta?.taskId || ""),
      audioId: String(track.audioId || track?.meta?.audioId || ""),
    },
  };
  feed.unshift(newPost);
  saveHubFeed(feed.slice(0, 200));
  // Fire-and-forget: when the cloud row lands, replace the local id
  // with the real UUID so subsequent merges dedupe cleanly.
  void supabaseInsertHub(newPost).then((rows) => {
    const row = Array.isArray(rows) ? rows[0] : rows;
    const cloudId = String(row?.id || "");
    if (!cloudId) return;
    const cur = loadHubFeed();
    const idx = cur.findIndex((p) => String(p?.id || "") === localId);
    if (idx < 0) return;
    cur[idx] = {
      ...cur[idx],
      id: cloudId,
      // Trust cloud's created_at if it came back; keeps ts in step.
      ts: row?.created_at ? new Date(row.created_at).getTime() : cur[idx].ts,
    };
    saveHubFeed(cur);
    if ((document.body.getAttribute("data-route") || "") === "hub") renderHub();
    renderProfileHubShared();
  }).catch(() => {});
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
// Initial Hub render shows just enough rows to fill the first viewport;
// the rest reveals via "Load more" + an IntersectionObserver sentinel.
// Keeping this small means cold opens on cellular don't kick off 60
// parallel cover requests.
const HUB_PAGE_SIZE = 24;
let hubVisibleCount = HUB_PAGE_SIZE;
let _hubLastRenderedFilter = null;
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
    els.hubList.innerHTML = `
      <div class="emptyState">
        <div class="emptyStateIcon" aria-hidden="true">♫</div>
        <p class="emptyStateTitle">The Hub is quiet</p>
        <p class="emptyStateHint">Songs you publish from your Library will land here. Be the first to share something today.</p>
        <a href="#/library" class="emptyStateCta" data-route-link="library">Open Library</a>
      </div>
    `;
    renderHubUpdatedAt();
    updateHubAudioHint();
    return;
  }
  // Filter switch resets the visible window so users always start at
  // the top of the new sort. New posts trickling in (DESC by created_at)
  // slot at the top automatically without resetting.
  if (_hubLastRenderedFilter !== hubFilter) {
    _hubLastRenderedFilter = hubFilter;
    hubVisibleCount = HUB_PAGE_SIZE;
  }
  const totalCount = items.length;
  const visibleItems = items.slice(0, Math.min(hubVisibleCount, totalCount));
  const hasMore = totalCount > visibleItems.length;
  els.hubList.innerHTML = visibleItems.map((p, i) => {
    // First row gets the eager + high-priority treatment so the user's
    // first impression is sharp; everything else loads lazily.
    const isFirst = i === 0;
    const loadingAttr = isFirst ? `loading="eager" fetchpriority="high"` : `loading="lazy" fetchpriority="low"`;
    const coverSrc = toCoverThumbUrl(
      p.artUrl || p.creatorAvatar || "./assets/nabadai-logo.png",
      { width: 480, quality: 72 },
    );
    const avatarSrc = toCoverThumbUrl(
      p.creatorAvatar || "./assets/nabadai-logo.png",
      { width: 48, quality: 70 },
    );
    return `
    <div class="trackRow hubRow" data-hub-row="${p.id}">
      <div class="hubCoverWrap" data-hub-cover="${p.id}">
        <img class="hubCover" src="${escapeHtml(coverSrc)}" alt="cover" decoding="async" ${loadingAttr} />
        <div class="hubCoverScrim" aria-hidden="true"></div>
        <div class="hubEq" aria-hidden="true"><i></i><i></i><i></i></div>
        <button class="hubPlayOverlay" data-hub-play="${p.id}" aria-label="Play">▶</button>
        <div class="hubPlayProgress"><span id="hubProg_${p.id}" style="width:0%"></span></div>
        <button class="hubMoreCorner" data-hub-more="${p.id}" aria-label="More">⋯</button>
      </div>
      <div class="hubBody">
        <div class="hubMetaTop">
          <img class="hubAvatar" src="${escapeHtml(avatarSrc)}" alt="avatar" width="24" height="24" decoding="async" loading="lazy" data-hub-user="${p.id}" />
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
        <button class="ghost" data-hub-persona="${p.id}">Use this voice (persona)</button>
        <button class="ghost" data-hub-del="${p.id}">Remove</button>
      </div>
    </div>
  `;
  }).join("") + (hasMore ? `
    <div class="hubLoadMoreWrap" data-hub-loadmore-sentinel>
      <button type="button" class="hubLoadMore" id="hubLoadMore">Load more</button>
    </div>
  ` : "");
  // Auto-trigger Load more when the sentinel scrolls into view, so the
  // feed feels endless without us having to render 60 rows up front.
  const loadMoreBtn = document.getElementById("hubLoadMore");
  const sentinel = els.hubList.querySelector("[data-hub-loadmore-sentinel]");
  if (loadMoreBtn) {
    loadMoreBtn.addEventListener("click", () => {
      hubVisibleCount = Math.min(loadHubFeed().length, hubVisibleCount + HUB_PAGE_SIZE);
      renderHub();
    });
  }
  if (sentinel && typeof IntersectionObserver === "function") {
    const io = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        io.disconnect();
        loadMoreBtn?.click();
        break;
      }
    }, { rootMargin: "240px 0px" });
    io.observe(sentinel);
  }
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
  els.hubList.querySelectorAll("[data-hub-persona]").forEach((b) => b.addEventListener("click", async (e) => {
    e.stopPropagation();
    const id = b.getAttribute("data-hub-persona");
    const p = loadHubFeed().find((x) => x.id === id);
    if (!p) return;
    document.getElementById(`hubMore_${id}`)?.style.setProperty("display", "none");
    await createPersonaFromHubPost(p);
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
    // Cloud is the source of truth. Index it by id and by content
    // signature so a prev local-only placeholder (e.g. cloud insert
    // is still in flight, or its id swap hasn't run yet) gets
    // collapsed into the canonical cloud row instead of duplicating.
    const cloudById = new Map();
    const cloudBySig = new Map();
    const sigOf = (p) =>
      `${String(p?.url || "").trim()}|${String(p?.kind || "full")}|${String(p?.creator || "")}|${String(p?.title || "").trim().toLowerCase()}`;
    mapped.forEach((p) => {
      cloudById.set(String(p.id), p);
      cloudBySig.set(sigOf(p), p);
    });
    const byId = new Map();
    // Keep prev local-only rows that have NO cloud counterpart yet;
    // drop the ones the cloud has already absorbed.
    prev.forEach((p) => {
      if (cloudById.has(String(p.id))) return;
      if (cloudBySig.has(sigOf(p))) return;
      byId.set(String(p.id), p);
    });
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
  const saved = loadPersonaSelection().trim();
  const domCurrent = String(els.sunoPersonaId.value || "").trim();
  const current =
    (domCurrent && list.some((x) => String(x.personaId) === domCurrent) && domCurrent) ||
    (saved && list.some((x) => String(x.personaId) === saved) && saved) ||
    "";
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
  if (current) els.sunoPersonaId.value = current;
  updateProfilePersonaRow();
}
function addPersona(personaId, label) {
  const id = String(personaId || "").trim();
  if (!id) return;
  const items = loadPersonas();
  if (!items.some((x) => String(x.personaId) === id)) {
    items.unshift({
      personaId: id,
      label: label || `Persona ${items.length + 1}`,
      ts: Date.now(),
    });
    savePersonas(items.slice(0, 20));
  }
  savePersonaSelection(id);
  renderPersonaSelect();
}

async function createPersonaFromHubPost(post) {
  const taskId = String(post?.meta?.taskId || "").trim();
  const creator = String(post?.creator || "artist").trim() || "artist";
  const title = String(post?.title || "song").trim() || "song";
  if (!taskId) {
    const msg = "This post is older and doesn't carry a voice signature. Try a newer post.";
    setStatus(msg);
    showToast(msg, { icon: "!", durationMs: 3600 });
    return;
  }
  const ok = window.confirm(
    `Save @${creator}'s voice from "${title}" as a persona you can reuse?`
  );
  if (!ok) return;
  try {
    setLoading(true, {
      title: "Saving voice…",
      sub: `Capturing @${creator}'s vocal style as a persona.`,
    });
    showToast("Saving voice as persona…", { icon: "♪", durationMs: 2400 });
    const r = await fetch(apiUrl("/api/suno/persona"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ taskId }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) {
      const det = d?.lastError || d?.details;
      const extra = det
        ? ` — ${typeof det === "string" ? det : JSON.stringify(det).slice(0, 200)}`
        : "";
      throw new Error((d?.error || "Persona creation failed") + extra);
    }
    const personaId = String(d?.personaId || "").trim();
    if (!personaId) throw new Error("Persona created but ID was missing.");
    const label = `@${creator} · ${title}`.slice(0, 60);
    addPersona(personaId, label);
    if (els.sunoPersonaId) els.sunoPersonaId.value = personaId;
    const okMsg = `Saved @${creator}'s voice. It will be used on your next generations.`;
    setStatus(okMsg);
    showToast(`Voice saved: @${creator}`, { icon: "✓", durationMs: 3200 });
  } catch (e) {
    const errMsg = `Couldn't save voice: ${e?.message || String(e)}`;
    setStatus(errMsg);
    showToast(errMsg, { icon: "!", durationMs: 4400 });
  } finally {
    setLoading(false);
  }
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
  // Songs count chip (sits in the Songs header, Library-style). The renderer
  // for the Songs list also keeps this in sync; this branch covers stat
  // refreshes triggered without a full re-render.
  if (els.profileOwnSongCount) {
    if (items.length) {
      els.profileOwnSongCount.textContent = `${items.length} ${items.length === 1 ? "song" : "songs"}`;
      els.profileOwnSongCount.hidden = false;
    } else {
      els.profileOwnSongCount.textContent = "";
      els.profileOwnSongCount.hidden = true;
    }
  }
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
  // Mirror the Library count chip when there is something to count, hide it
  // otherwise so the empty state owns the visual weight.
  const countEl = document.getElementById("profileOwnSongCount");
  if (countEl) {
    if (items.length) {
      countEl.textContent = `${items.length} ${items.length === 1 ? "song" : "songs"}`;
      countEl.hidden = false;
    } else {
      countEl.textContent = "";
      countEl.hidden = true;
    }
  }
  if (!items.length) {
    els.profileHubSharedList.innerHTML = `
      <div class="emptyState">
        <div class="emptyStateIcon" aria-hidden="true">♪</div>
        <p class="emptyStateTitle">No songs on Hub yet</p>
        <p class="emptyStateHint">Share a track from your Library or Player and it'll show up here for everyone who lands on your profile.</p>
        <a href="#/library" class="emptyStateCta" data-route-link="library">Open Library</a>
      </div>
    `;
    return;
  }
  // Reuse the Library row markup so the visual language stays consistent
  // (cover · title · meta · ▶ badge on hover). Profile rows don't need a
  // ⋯ menu — the click target is the whole row and it deep-links to the
  // post in the Hub feed.
  els.profileHubSharedList.innerHTML = `
    <ul class="libraryRows" role="list">
      ${items.map((p) => {
        const safeTitle = escapeHtml(String(p.title || "Untitled"));
        const art = String(p.artUrl || p.creatorAvatar || "./assets/nabadai-logo.png");
        const dateLabel = relativeTime(p.ts);
        const likes = Number(p.likes || 0);
        const subBits = [];
        if (dateLabel) subBits.push(`<span class="libRowDot">${escapeHtml(dateLabel)}</span>`);
        if (likes > 0) subBits.push(`<span class="libRowChip libRowChipLikes">❤ ${likes}</span>`);
        return `
          <li class="libRow" data-profile-hub-row="${escapeHtml(String(p.id))}">
            <button class="libRowMain" type="button" data-profile-hub-open="${escapeHtml(String(p.id))}" aria-label="Open ${safeTitle} on Hub">
              <span class="libRowArt">
                <img src="${escapeHtml(art)}" alt="" />
                <span class="libRowArtBadge" aria-hidden="true">▶</span>
              </span>
              <span class="libRowInfo">
                <span class="libRowTitle">${safeTitle}</span>
                <span class="libRowSub">${subBits.join("")}</span>
              </span>
            </button>
          </li>
        `;
      }).join("")}
    </ul>
  `;
  els.profileHubSharedList.querySelectorAll("[data-profile-hub-open]").forEach((b) => {
    b.addEventListener("click", () => {
      const sid = b.getAttribute("data-profile-hub-open");
      if (!sid) return;
      location.hash = `#/hub?post=${encodeURIComponent(sid)}`;
    });
  });
}

/** Max tracks persisted locally (matches `addToLibrary`). Keeps JSON under
 *  typical mobile localStorage limits when cloud merge pulls 100+ rows. */
const LIBRARY_MAX_TRACKS = 100;

function capLibraryItems(items) {
  return Array.isArray(items) ? items.slice(0, LIBRARY_MAX_TRACKS) : [];
}

/** Parsed Library JSON — `loadLibrary()` can run many times per tick
 *  (render, reconcile, handlers). Re-parsing a multi-megabyte string
 *  (custom covers as base64 in meta) was a major source of jank.
 *  Invalidate on every `saveLibrary` / `saveLibraryFor` write.
 */
let _libraryMemCache = null;
let _libraryMemCacheKey = "";

function invalidateLibraryMemCache() {
  _libraryMemCache = null;
  _libraryMemCacheKey = "";
}

/** If we have a stored Supabase session, the library key must be
 *  `mas:library:v1:<userId>`. Stale on-disk profile sometimes still
 *  says "guest" until the async auth IIFE runs — that made the
 *  deferred `renderLibrary` read the wrong localStorage key while Hub
 *  + Profile were already on the right user. Sync synchronously so the
 *  first paint and `ensureUserLibraryHydrated` both target the same
 *  store as the session. */
function syncActiveProfileIdFromSession() {
  const uid = authSession?.user?.id;
  if (!uid) return;
  if (String(activeProfile?.id || "guest") === String(uid)) return;
  saveProfile({
    ...activeProfile,
    id: String(uid),
    email: authSession.user.email || activeProfile.email || "",
  });
  invalidateLibraryMemCache();
  renderPersonaSelect();
}

/** Where the Library JSON blob lives in localStorage. When signed in,
 *  always key off `authSession.user.id` — not `activeProfile.id`, which
 *  can still be `"guest"` until async boot finishes. Otherwise `saveLibrary`
 *  writes `mas:library:v1:guest` while `saveLibraryFor(uid)` writes the
 *  real account key; `loadLibrary()` then reads the wrong slot and looks
 *  empty despite a successful cloud merge. */
function getLibraryStorageKey() {
  const uid = authSession?.user?.id;
  if (uid) return profileLibraryKeyFor(uid);
  return profileLibraryKey();
}

function loadLibrary() {
  const key = getLibraryStorageKey();
  if (_libraryMemCacheKey === key && _libraryMemCache) return _libraryMemCache;
  try {
    const raw = localStorage.getItem(key);
    const arr = raw ? JSON.parse(raw) : [];
    _libraryMemCache = Array.isArray(arr) ? arr : [];
    _libraryMemCacheKey = key;
    return _libraryMemCache;
  } catch {
    _libraryMemCache = [];
    _libraryMemCacheKey = key;
    return _libraryMemCache;
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
let _lastLibraryPersistError = "";
let _lastLibraryPersistedCount = 0;

/** Strip every data: URL out of a track row before localStorage. iOS
 *  PWA mobile quota historically caps around ~5 MB per origin; a
 *  single base64 cover is 200–500 KB, so 100 rows of "small" UI data
 *  with covers easily blows past it. The cloud row we just fetched
 *  doesn't carry data: URLs anyway — only stale local rows do. */
function slimTrackForStorage(t) {
  if (!t || typeof t !== "object") return t;
  const out = { ...t };
  const art = String(out.artUrl || "");
  if (art.startsWith("data:")) out.artUrl = "";
  if (out.meta && typeof out.meta === "object") {
    const meta = { ...out.meta };
    if (typeof meta.imageUrl === "string" && meta.imageUrl.startsWith("data:")) delete meta.imageUrl;
    if (typeof meta.imageThumb === "string" && meta.imageThumb.startsWith("data:")) delete meta.imageThumb;
    out.meta = meta;
  }
  return out;
}

function slimLibraryForStorage(items) {
  return (Array.isArray(items) ? items : []).map(slimTrackForStorage);
}

/** Aggressive localStorage reset: drop everything except the absolute
 *  minimum needed to stay logged in and remember device identity.
 *  Everything else either rebuilds from the cloud (Library, Hub) or
 *  starts at safe defaults (tab-tip, credits-history, personas). The
 *  active library key is dropped too — the in-memory cache holds the
 *  current merge and saveLibrary() will re-write it fresh after this. */
function freeUpLocalStorage() {
  const keepKeys = new Set([
    "mas:auth-session:v1",
    "mas:profile:v1",
    "mas:device-id:v1",
    "mas:public-config:v1",
    "mas:auth-pkce:v1",
  ]);
  let beforeBytes = 0;
  let afterBytes = 0;
  let droppedCount = 0;
  const toDelete = [];
  try {
    for (let i = 0; i < localStorage.length; i += 1) {
      const k = String(localStorage.key(i) || "");
      const v = String(localStorage.getItem(k) || "");
      beforeBytes += k.length + v.length;
      if (!keepKeys.has(k)) toDelete.push(k);
    }
  } catch {}
  for (const k of toDelete) {
    try { localStorage.removeItem(k); droppedCount += 1; } catch {}
  }
  try {
    for (let i = 0; i < localStorage.length; i += 1) {
      const k = String(localStorage.key(i) || "");
      const v = String(localStorage.getItem(k) || "");
      afterBytes += k.length + v.length;
    }
  } catch {}
  try { hubFeedMemory = []; } catch {}
  return {
    beforeKB: Math.round(beforeBytes / 1024),
    afterKB: Math.round(afterBytes / 1024),
    dropped: droppedCount,
  };
}

/** Best-effort localStorage write. Tries the full slim payload, then
 *  shrinks (60 / 40 / 20 / 10 / 5 / 1) until something fits.
 *  Returns the count actually persisted plus the underlying error
 *  on the last attempt. The mem cache update is the caller's job
 *  (we keep it independent so the UI renders even if persistence
 *  fails entirely). */
function persistLibraryToStorage(items, key) {
  const slim = slimLibraryForStorage(items);
  const fullN = slim.length;
  const sizes = [fullN, 60, 40, 20, 10, 5, 1].filter(
    (n) => n > 0 && n <= fullN
  );
  // Dedupe (e.g. fullN === 60 would double up)
  const tried = Array.from(new Set(sizes));
  let lastErr = null;
  for (const n of tried) {
    try {
      localStorage.setItem(key, JSON.stringify(slim.slice(0, n)));
      return { ok: true, savedCount: n, error: null };
    } catch (e) {
      lastErr = e;
    }
  }
  // Last resort: clear the slot so next render at least has []
  // instead of stale partial JSON.
  try {
    localStorage.removeItem(key);
  } catch {}
  return { ok: false, savedCount: 0, error: lastErr };
}

function classifyPersistError(e) {
  if (!e) return "save_failed";
  const quota =
    e.name === "QuotaExceededError" ||
    e.code === 22 ||
    e.code === 1014 ||
    /quota|exceeded|storage/i.test(String(e.message || ""));
  return quota ? "quota" : String(e.message || e || "save_failed").slice(0, 120);
}

function saveLibrary(items) {
  const capped = capLibraryItems(items);
  const key = getLibraryStorageKey();
  // The mem cache is the source of truth for `loadLibrary()` /
  // `renderLibrary()` during this session. Update it FIRST so the UI
  // works regardless of whether localStorage accepts the bytes.
  _libraryMemCache = capped;
  _libraryMemCacheKey = key;
  const r = persistLibraryToStorage(capped, key);
  _lastLibraryPersistedCount = r.savedCount;
  if (r.ok) {
    _lastLibraryPersistError = "";
    if (r.savedCount < capped.length) {
      setStatus(`Library cached in memory; ${r.savedCount} of ${capped.length} saved on this device.`);
    }
  } else {
    _lastLibraryPersistError = classifyPersistError(r.error);
    setStatus("Couldn't save library to this device storage. Cloud still has your songs.");
  }
}
function patchLibraryTrack(id, patch) {
  if (!id) return;
  const items = loadLibrary();
  const idx = items.findIndex((x) => String(x.id) === String(id));
  if (idx < 0) return;
  const prev = items[idx];
  items[idx] = { ...prev, ...patch, ts: Date.now() };
  saveLibrary(items);
  renderLibrary();
  // Fire-and-forget cloud sync. The PATCH is keyed by the song_url +
  // kind of the previous row (those don't change in any current patch
  // path), so we use `prev` as the lookup. Custom-cover data: URLs are
  // stripped server-side by sanitizeArtUrl/sanitizeMetaForCloud — see
  // notes in those helpers for the v1 limitation.
  void supabasePatchUserSong(prev, {
    title: items[idx].title,
    artUrl: items[idx].artUrl,
    meta: items[idx].meta,
  });
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
  const writeKey = profileLibraryKeyFor(id);
  const capped = capLibraryItems(items);
  const isActive = writeKey === getLibraryStorageKey();
  if (isActive) {
    _libraryMemCache = capped;
    _libraryMemCacheKey = writeKey;
  }
  const r = persistLibraryToStorage(capped, writeKey);
  if (isActive) {
    _lastLibraryPersistedCount = r.savedCount;
    if (r.ok) {
      _lastLibraryPersistError = "";
    } else {
      _lastLibraryPersistError = classifyPersistError(r.error);
    }
  }
}

/** True from the moment we know we *intend* to hydrate (synchronously,
 *  during boot, if there's a stored auth session) until the cloud
 *  fetch resolves. The Library renderer reads this so the empty-state
 *  shows "Loading your library…" instead of the "Nothing here yet"
 *  CTA during a PWA cold start. Unlike `_libraryHydrateCompleted` it
 *  flips back to `false` after each hydrate, so a future re-hydrate
 *  reuses it cleanly.
 */
let _libraryHydrateInFlight = false;
/** Has the boot-time hydrate completed at least once for this
 *  session? Used to suppress the "Nothing here yet" empty state in
 *  the narrow window between page load and the IIFE-triggered hydrate
 *  actually starting. Reset on logout / profile reset.
 */
let _libraryHydrateCompleted = false;

async function ensureUserLibraryHydrated(prefetchedCloud) {
  if (!authSession?.user?.id) {
    // No session → there's nothing to hydrate; mark complete so the
    // empty-state stops showing the "Loading your library…" copy and
    // falls back to the create-song CTA.
    _libraryHydrateCompleted = true;
    _libraryHydrateInFlight = false;
    return;
  }
  const uid = String(authSession.user.id);
  syncActiveProfileIdFromSession();

  _libraryHydrateInFlight = true;
  // Safety net: if the network hangs (e.g. captive Wi-Fi / blocked
  // request), don't pin the user on a "Loading…" forever. After 15s
  // we drop the in-flight flag and mark the hydrate complete so the
  // empty state can render normally. The fetch itself already has a
  // 12s AbortController inside `supabaseLoadUserSongs`.
  const safetyTimer = setTimeout(() => {
    if (_libraryHydrateInFlight) {
      _libraryHydrateInFlight = false;
      _libraryHydrateCompleted = true;
      try { renderLibrary(); } catch {}
    }
  }, 15000);
  // Repaint the Library tab immediately so the loading state can show
  // before the first network response lands.
  try { renderLibrary(); } catch {}

  // 1) Load cloud + local candidates and merge-dedupe.
  const cloudSongs =
    prefetchedCloud !== undefined ? prefetchedCloud : await supabaseLoadUserSongs();
  const guestSongs = loadLibraryFor("guest");
  const allLocalSongs = loadAllLocalSongsDeduped();
  const localCandidates = guestSongs.length ? guestSongs : allLocalSongs;

  const sigOf = (row) => {
    const url = String(row?.url || "").trim();
    const aid = String(row?.audioId || "").trim();
    const kind = String(row?.kind || "full").trim();
    return `${url}|${aid}|${kind}`;
  };
  const cloudSigs = new Set(cloudSongs.map(sigOf));

  const merged = [];
  const seen = new Set();
  const addMerged = (row) => {
    const sig = sigOf(row);
    if (seen.has(sig)) return;
    seen.add(sig);
    merged.push(row);
  };
  cloudSongs.forEach(addMerged);
  localCandidates.forEach(addMerged);
  merged.sort((a, b) => Number(b?.ts || 0) - Number(a?.ts || 0));

  // Fast path: merge is already the full set we want the user to see.
  // Painting here keeps Library in step with Hub + Profile. The
  // previous version awaited one network round-trip *per song* to
  // `supabaseInsertUserSong` before the first `renderLibrary`, which
  // made the Library tab look "stuck" for many seconds on PWAs.
  saveLibraryFor(uid, merged);
  _libraryHydrateInFlight = false;
  _libraryHydrateCompleted = true;
  clearTimeout(safetyTimer);
  saveLibrary(merged);
  renderLibrary();

  if (!merged.length) return;

  // Background: only upload local-only rows (the ones not already in
  // the cloud snapshot we just fetched). The previous version pushed
  // every merged row, including cloud-resident ones, which wasted
  // dozens of round-trips on every PWA cold start.
  const localOnly = merged.filter((row) => !cloudSigs.has(sigOf(row)));
  if (!localOnly.length) {
    _libraryReconcileLastAt = Date.now();
    return;
  }
  void (async () => {
    let okCount = 0;
    let failCount = 0;
    let firstFail = "";
    for (const t of localOnly) {
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
    saveLibrary(finalSongs);
    renderLibrary();
    if (failCount > 0) {
      setStatus(`Library sync partial: ${okCount} uploaded, ${failCount} failed (${firstFail.slice(0, 90)})`);
    } else if (okCount > 0) {
      setStatus(`Library sync complete: ${okCount} new songs uploaded.`);
    }
    _libraryReconcileLastAt = Date.now();
  })();
}
// ─── Lightweight cloud → local reconcile for ongoing sync ─────────────
// `ensureUserLibraryHydrated` (above) is the heavy migration path that
// runs once at boot: it uploads every local-only track. Once that's
// done we don't want to re-run it every time the user taps Library —
// it's slow and serial. `reconcileLibraryFromCloud` is the cheap
// alternative: pull the latest cloud rows, merge with local (preserving
// any local custom-cover data: URLs that v1 doesn't ship to the cloud),
// re-render. Throttled so we don't hammer Supabase if the user
// rapid-toggles tabs.
let _libraryReconcileInFlight = false;
let _libraryReconcileLastAt = 0;
const LIBRARY_RECONCILE_MIN_INTERVAL_MS = 30_000;

async function reconcileLibraryFromCloud({ force = false } = {}) {
  if (!authSession?.user?.id) return;
  if (_libraryReconcileInFlight) return;
  if (!force && Date.now() - _libraryReconcileLastAt < LIBRARY_RECONCILE_MIN_INTERVAL_MS) return;
  _libraryReconcileInFlight = true;
  try {
    const cloud = await supabaseLoadUserSongs();
    if (!Array.isArray(cloud)) return;
    const local = loadLibrary();

    // Two indices for the merge. Signature pins a logical track
    // (song URL + audio id + kind) without depending on the DB id
    // (cloud rows use UUIDs, local rows use timestamp+random).
    const sigOf = (t) =>
      `${String(t?.url || "").trim()}|${String(t?.audioId || "").trim()}|${String(t?.kind || "full").trim()}`;
    const localBySig = new Map();
    for (const t of local) localBySig.set(sigOf(t), t);
    const cloudSigs = new Set(cloud.map(sigOf));

    const merged = [];
    const seen = new Set();
    // Cloud is the source of truth — but we keep the local id (so any
    // open menus / now-playing references stay valid) and we keep the
    // local cover when the local copy has a custom data: URL that the
    // cloud row doesn't carry yet (Phase C will fix that).
    for (const c of cloud) {
      const sig = sigOf(c);
      if (seen.has(sig)) continue;
      seen.add(sig);
      const localCopy = localBySig.get(sig);
      if (localCopy) {
        const localArtIsCustom = String(localCopy.artUrl || "").startsWith("data:");
        const localImgIsCustom = String(localCopy.meta?.imageUrl || "").startsWith("data:");
        merged.push({
          ...c,
          id: localCopy.id || c.id,
          artUrl: localArtIsCustom ? localCopy.artUrl : (c.artUrl || localCopy.artUrl || ""),
          meta: {
            ...(c.meta || {}),
            ...(localCopy.meta || {}),
            ...(localImgIsCustom
              ? { imageUrl: localCopy.meta.imageUrl, ...(localCopy.meta.imageThumb ? { imageThumb: localCopy.meta.imageThumb } : {}) }
              : {}),
          },
        });
      } else {
        merged.push(c);
      }
    }

    // Local-only tracks (created in this session before the cloud
    // insert finished, or where insert failed). Keep them visible and
    // re-attempt the insert in the background.
    for (const t of local) {
      const sig = sigOf(t);
      if (cloudSigs.has(sig) || seen.has(sig)) continue;
      seen.add(sig);
      merged.push(t);
      if (t.url) void supabaseInsertUserSong(t);
    }

    merged.sort((a, b) => Number(b?.ts || 0) - Number(a?.ts || 0));
    saveLibrary(merged);
    if ((document.body.getAttribute("data-route") || "") === "library") {
      renderLibrary();
    }
    _libraryReconcileLastAt = Date.now();
  } catch {
    // Silent: reconcile is purely an optimization on top of localStorage.
  } finally {
    _libraryReconcileInFlight = false;
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
  saveLibrary(items);
  renderLibrary();
  void (async () => {
    const ins = await supabaseInsertUserSong(newTrack);
    if (!ins?.ok) {
      setStatus(`Could not save copy to the cloud (${ins.reason}). Song is still saved on this device. ${_lastUserSongInsertFailure || ""}`.slice(0, 280));
      // If Library is empty-looking elsewhere, refresh so any diagnostic
      // empty-state can pick up `_lastUserSongInsertFailure`.
      try { renderLibrary(); } catch {}
    }
  })();
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
function formatLibraryDate(ts) {
  const d = new Date(Number(ts) || 0);
  if (Number.isNaN(d.getTime())) return "";
  const now = new Date();
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startThat = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diffDays = Math.round((startToday - startThat) / 86400000);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays > 1 && diffDays < 7) return `${diffDays} days ago`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: d.getFullYear() !== now.getFullYear() ? "numeric" : undefined });
}

/** Backfill missing meta.imageThumb for tracks whose cover is stored as
 *  a base64 data URL (i.e. custom covers uploaded before we started
 *  saving thumbs). Runs lazily after a Library render so the page paints
 *  first. Skips remote URLs because those usually CORS-block canvas;
 *  we already lazy-load remote covers anyway, so the saving there is
 *  small.
 */
let _libraryThumbBackfilling = false;
async function backfillLibraryThumbsLazy() {
  if (_libraryThumbBackfilling) return;
  _libraryThumbBackfilling = true;
  try {
    const items = loadLibrary();
    let changed = false;
    for (const t of items) {
      const m = t && t.meta;
      if (!m) continue;
      if (m.imageThumb) continue;
      const src = String(m.imageUrl || "").trim();
      if (!src.startsWith("data:")) continue;
      // eslint-disable-next-line no-await-in-loop
      const thumb = await buildCoverThumbDataUrl(src);
      if (thumb) {
        m.imageThumb = thumb;
        changed = true;
      }
    }
    if (changed) {
      saveLibrary(items);
      // Re-render once so the thumbs swap in for the next paint.
      try { renderLibrary(); } catch {}
    }
  } catch {
    // Silent: backfill is purely an optimization.
  } finally {
    _libraryThumbBackfilling = false;
  }
}

// Track which row's menu is currently expanded so the delegated click
// handler can toggle it cheaply and we never have more than one menu
// inflated in the DOM at a time.
let _libraryOpenMenuId = "";

/** Build the per-row "more options" menu HTML on demand. We don't ship
 *  these 7 buttons in the initial render anymore — at 24 rows that was
 *  168 hidden DOM nodes that nobody saw until they tapped ⋯, and they
 *  were the dominant cost of `renderLibrary()` after pagination
 *  trimmed the row count. The lazy build keeps the closed-state Library
 *  list as small as Hub's.
 */
function buildLibMenuHtml(track) {
  const id = String(track?.id || "");
  const isInstrumental = track?.kind === "instrumental";
  const url = String(track?.url || "");
  return `
    <div class="libMenu" id="libMenu_${id}">
      <a class="ghost" href="${escapeHtml(url)}" target="_blank" rel="noreferrer" data-lib-dlaudio="${id}">Download audio</a>
      <button class="ghost" data-lib-dlvideo="${id}">Download video</button>
      <button class="ghost" data-lib-share="${id}">Share to Hub</button>
      <button class="ghost" data-lib-details="${id}">Song details</button>
      ${isInstrumental ? "" : `<button class="ghost" data-lib-inst="${id}">Get instrumental</button>`}
      ${isInstrumental ? "" : `<button class="ghost" data-lib-stems="${id}">Get stems</button>`}
      <button class="ghost libRowDelete" data-lib-del="${id}">Delete</button>
    </div>
  `;
}

/** Close any currently-open Library row menu. */
function closeLibraryMenu() {
  if (!_libraryOpenMenuId || !els.libraryList) return;
  const node = els.libraryList.querySelector(`#libMenu_${CSS.escape(_libraryOpenMenuId)}`);
  if (node && node.parentNode) node.parentNode.removeChild(node);
  _libraryOpenMenuId = "";
}

/** Toggle the menu for a given row id. Builds the menu DOM lazily on
 *  first open and removes it from the DOM on close, so the closed-state
 *  Library list stays minimal.
 */
function toggleLibraryMenuFor(id) {
  if (!els.libraryList) return;
  if (_libraryOpenMenuId === id) {
    closeLibraryMenu();
    return;
  }
  closeLibraryMenu();
  const t = loadLibrary().find((x) => String(x.id) === String(id));
  if (!t) return;
  const row = els.libraryList.querySelector(`[data-lib-row="${CSS.escape(String(id))}"]`);
  if (!row) return;
  row.insertAdjacentHTML("beforeend", buildLibMenuHtml(t));
  _libraryOpenMenuId = String(id);
}

let _libraryListenersBound = false;
/** Install one delegated `click` listener on the Library list. Replaces
 *  the previous render-time loop that attached ~9 listeners per row.
 *  Bound exactly once for the lifetime of the page.
 */
function bindLibraryDelegatedListeners() {
  if (_libraryListenersBound || !els.libraryList) return;
  _libraryListenersBound = true;
  els.libraryList.addEventListener("click", async (e) => {
    const target = e.target;
    if (!(target instanceof Element)) return;

    // 1) ⋯ menu toggle button.
    const menuBtn = target.closest("[data-lib-menu]");
    if (menuBtn && els.libraryList.contains(menuBtn)) {
      e.stopPropagation();
      toggleLibraryMenuFor(menuBtn.getAttribute("data-lib-menu"));
      return;
    }

    // 2) Anything inside an open menu (lazy-built so inspect first).
    const inMenu = target.closest(".libMenu");
    if (inMenu) {
      e.stopPropagation();
      const dlAudio = target.closest("[data-lib-dlaudio]");
      if (dlAudio) {
        // Native anchor handles the actual download. Just close the menu.
        closeLibraryMenu();
        return;
      }
      const del = target.closest("[data-lib-del]");
      if (del) {
        removeFromLibrary(del.getAttribute("data-lib-del"));
        closeLibraryMenu();
        return;
      }
      const det = target.closest("[data-lib-details]");
      if (det) {
        const id = det.getAttribute("data-lib-details");
        const t = loadLibrary().find((x) => x.id === id);
        if (t) {
          openSongDetailsModal({
            title: t.title,
            createdAt: new Date(t.ts).toLocaleString(),
            taskId: t.taskId || "",
            audioId: t.audioId || "",
            kind: t.kind || "",
            ...(t.meta || {}),
          });
        }
        closeLibraryMenu();
        return;
      }
      const sh = target.closest("[data-lib-share]");
      if (sh) {
        const id = sh.getAttribute("data-lib-share");
        const t = loadLibrary().find((x) => x.id === id);
        if (t) {
          shareToHub(t);
          openShareLiveModal(t.title || "Your song");
          setStatus("Shared to Hub.");
        }
        closeLibraryMenu();
        return;
      }
      const dlv = target.closest("[data-lib-dlvideo]");
      if (dlv) {
        const id = dlv.getAttribute("data-lib-dlvideo");
        const t = loadLibrary().find((x) => x.id === id);
        if (t) {
          try {
            setStatus("Preparing video download…");
            await downloadLibraryVideoTrack(t);
            setStatus("Video download is ready.");
          } catch (err) {
            setStatus(`Video download failed: ${err?.message || String(err)}`);
          }
        }
        closeLibraryMenu();
        return;
      }
      const inst = target.closest("[data-lib-inst]");
      if (inst) {
        const id = inst.getAttribute("data-lib-inst");
        const t = loadLibrary().find((x) => x.id === id);
        if (!t?.taskId || !t?.audioId) {
          setStatus("This song is missing generation ids for instrumental request.");
        } else {
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
        }
        closeLibraryMenu();
        return;
      }
      const stems = target.closest("[data-lib-stems]");
      if (stems) {
        const ok = window.confirm("Get stems may consume around 50 credits. Do you want to continue?");
        if (!ok) { closeLibraryMenu(); return; }
        const id = stems.getAttribute("data-lib-stems");
        const t = loadLibrary().find((x) => x.id === id);
        if (!t?.taskId || !t?.audioId) {
          setStatus("This song is missing generation ids for stems request.");
        } else {
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
        }
        closeLibraryMenu();
        return;
      }
      // Click landed inside the menu but not on an action — leave open.
      return;
    }

    // 3) Play / row tap. Both behaviors are identical, so a single
    //    branch covers `[data-lib-play]` (the main button) and
    //    `[data-lib-row]` (anywhere on the card).
    const play = target.closest("[data-lib-play]") || target.closest("[data-lib-row]");
    if (play && els.libraryList.contains(play)) {
      const id = play.getAttribute("data-lib-play") || play.getAttribute("data-lib-row");
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
    }
  });
}

/** Runs cloud + local probes and writes to `#libraryDiagnosticOutput`
 *  (sibling of `#libraryList`). Must NOT live inside `libraryList`
 *  innerHTML — `ensureUserLibraryHydrated` calls `renderLibrary()`, which
 *  replaces the list DOM and would wipe an inline diagnostic `<pre>`.
 */
async function runLibraryDiagnostic() {
  const out = els.libraryDiagnosticOutput || document.getElementById("libraryDiagnosticOutput");
  const btn = els.btnLibraryDiagnostic || document.getElementById("btnLibraryDiagnostic");
  if (!out) return;
  out.hidden = false;
  out.textContent = "Running diagnostic…";
  if (btn) btn.disabled = true;
  const lines = [];
  try {
    const token = getSupabaseAuthToken();
    const uid = String(authSession?.user?.id || "");
    const email = String(authSession?.user?.email || "");
    lines.push(`auth.email: ${email || "(none)"}`);
    lines.push(`auth.user.id: ${uid || "(none)"}`);
    lines.push(`token length: ${token ? token.length : 0}`);
    lines.push(`activeProfile.id: ${String(activeProfile?.id || "")}`);
    const libKey = getLibraryStorageKey();
    lines.push(`libraryStorageKey: ${libKey}`);
    let rawLen = 0;
    try { rawLen = (localStorage.getItem(libKey) || "").length; } catch {}
    lines.push(`local raw bytes @ key: ${rawLen}`);
    lines.push(`loadLibrary().length: ${loadLibrary().length}`);
    lines.push(`memCache: ${_libraryMemCache ? _libraryMemCache.length : "null"}`);
    lines.push(`persisted: ${_lastLibraryPersistedCount} (err=${_lastLibraryPersistError || "ok"})`);
    lines.push(`hydrate inFlight=${_libraryHydrateInFlight} completed=${_libraryHydrateCompleted}`);
    try {
      let totalBytes = 0;
      const heavy = [];
      for (let i = 0; i < localStorage.length; i += 1) {
        const k = String(localStorage.key(i) || "");
        const v = String(localStorage.getItem(k) || "");
        totalBytes += k.length + v.length;
        if (v.length > 50_000) heavy.push(`${k}=${(v.length / 1024).toFixed(0)}KB`);
      }
      lines.push(`localStorage total: ${(totalBytes / 1024).toFixed(0)}KB across ${localStorage.length} keys`);
      if (heavy.length) lines.push(`heavy keys: ${heavy.slice(0, 6).join(", ")}`);
    } catch {}
    try {
      const r1 = await fetch(`${SUPABASE_URL}/rest/v1/user_songs?select=id&limit=1`, {
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${token}`,
          Prefer: "count=exact",
          Range: "0-0",
        },
      });
      const cr = r1.headers.get("content-range") || r1.headers.get("Content-Range") || "";
      lines.push(`probe.unfiltered: HTTP ${r1.status} content-range=${cr}`);
    } catch (e) {
      lines.push(`probe.unfiltered ERR: ${e?.message || String(e)}`);
    }
    try {
      const r2 = await fetch(`${SUPABASE_URL}/rest/v1/user_songs?user_id=eq.${encodeURIComponent(uid)}&select=id,title&limit=3`, {
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${token}`,
        },
      });
      const t2 = await r2.text().catch(() => "");
      lines.push(`probe.filtered: HTTP ${r2.status} body=${t2.slice(0, 200)}`);
    } catch (e) {
      lines.push(`probe.filtered ERR: ${e?.message || String(e)}`);
    }
    try {
      const r3 = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${token}`,
        },
      });
      const t3 = await r3.text().catch(() => "");
      const parsed = (() => { try { return JSON.parse(t3); } catch { return null; } })();
      lines.push(`probe.user: HTTP ${r3.status} id=${parsed?.id || "?"} email=${parsed?.email || "?"}`);
    } catch (e) {
      lines.push(`probe.user ERR: ${e?.message || String(e)}`);
    }
    lines.push("--- forced hydrate ---");
    _libraryHydrateInFlight = false;
    _libraryHydrateCompleted = false;
    _libraryReconcileLastAt = 0;
    try {
      const beforeLen = loadLibrary().length;
      const t0 = performance.now();
      const cloudSongs = await supabaseLoadUserSongs();
      const dt = Math.round(performance.now() - t0);
      lines.push(`supabaseLoadUserSongs: ${cloudSongs.length} rows in ${dt}ms (status=${_lastUserSongsLoadStatus})`);
      if (cloudSongs.length) {
        const sample = cloudSongs[0];
        lines.push(`first row: title="${String(sample?.title || "").slice(0, 40)}" url=${(sample?.url || "").slice(0, 60)}`);
      }
      await ensureUserLibraryHydrated(cloudSongs);
      const afterLen = loadLibrary().length;
      lines.push(`loadLibrary() before=${beforeLen} after=${afterLen}`);
      lines.push(`activeProfile.id (post-hydrate): ${String(activeProfile?.id || "")}`);
      lines.push(`libraryStorageKey (post-hydrate): ${getLibraryStorageKey()}`);
      let rawAfter = 0;
      try { rawAfter = (localStorage.getItem(getLibraryStorageKey()) || "").length; } catch {}
      lines.push(`local raw bytes @ key (post-hydrate): ${rawAfter}`);
      if (afterLen > 0) {
        lines.push("→ hydrate succeeded; list refreshed below.");
        try { renderLibrary(); } catch {}
      }
    } catch (e) {
      lines.push(`forced hydrate ERR: ${e?.message || String(e)}`);
    }
    const text = lines.join("\n");
    out.textContent = text;
    try {
      await navigator.clipboard.writeText(text);
      setStatus("Diagnostic copied to clipboard.");
    } catch {
      setStatus("Diagnostic ready — scroll the panel below.");
    }
  } finally {
    if (btn) btn.disabled = false;
  }
}

// Library pagination — same pattern as Hub. Rendering 100 rows at once
// builds ~1000 DOM nodes (each row has a hidden 7-button menu) and binds
// ~900 listeners across the row/menu queries, which is what made the
// Library feel slow even though Hub was snappy. We render 24 by default
// and auto-extend via an IntersectionObserver on the "Load more" sentinel.
const LIB_PAGE_SIZE = 24;
let libVisibleCount = LIB_PAGE_SIZE;
// Tracks total items count from the previous render so we know when to
// reset the visible window (e.g. when a song is deleted, the list
// shrinks; when a new song lands, we keep the user's scrolled position).
let _libLastTotal = -1;

/** Inline warning when localStorage couldn't fit the full Library or
 *  quota blocked writes. Hidden when persistence matches memory. */
function syncLibraryStorageBanner() {
  const b = els.libraryStorageBanner;
  const txt = els.libraryStorageBannerText;
  const alt = els.btnLibraryFreeSpaceAlt;
  if (!b || !txt) return;
  const items = loadLibrary();
  const memN = items.length;
  const persistShort =
    memN > 0 && _lastLibraryPersistedCount < memN;
  const show =
    Boolean(authSession?.user?.id) &&
    (Boolean(_lastLibraryPersistError) || persistShort);
  if (!show) {
    b.hidden = true;
    if (alt) alt.hidden = true;
    return;
  }
  let msg = "";
  if (_lastLibraryPersistError === "quota") {
    msg =
      "Device storage is tight — not everything could be saved offline. Tap to clear cache.";
  } else if (_lastLibraryPersistError) {
    msg = `Couldn't save the full library on this device (${_lastLibraryPersistError}). Tap to free space.`;
  } else {
    msg = `${_lastLibraryPersistedCount} of ${memN} songs saved locally — tap to free space and retry.`;
  }
  txt.textContent = msg;
  b.hidden = false;
  if (alt) alt.hidden = false;
}

function renderLibrary() {
  if (!els.libraryList) return;
  // Re-rendering blows away the lazy-built menu DOM (it's not in the
  // HTML template), so clear the open-id tracker too. Otherwise the
  // first ⋯ tap after a re-render would think the menu is open and
  // close-then-noop.
  _libraryOpenMenuId = "";
  const items = loadLibrary();
  syncLibraryStorageBanner();
  const totalCount = items.length;
  // Reset the window if the underlying list shrunk OR is the same size
  // as last render but only on a full re-render after a route swap. The
  // simplest heuristic: any time the count drops, snap back to page 1.
  if (_libLastTotal !== -1 && totalCount < _libLastTotal) {
    libVisibleCount = LIB_PAGE_SIZE;
  }
  // Always cap to page size when the count just became "small enough" to
  // fit on a single page anyway.
  if (totalCount <= LIB_PAGE_SIZE) libVisibleCount = LIB_PAGE_SIZE;
  _libLastTotal = totalCount;
  const visibleItems = items.slice(0, Math.min(libVisibleCount, totalCount));
  const hasMore = totalCount > visibleItems.length;
  const countEl = document.getElementById("libraryCount");
  if (countEl) {
    if (!totalCount) {
      countEl.textContent = "";
      countEl.hidden = true;
    } else {
      countEl.textContent = `${totalCount} saved`;
      countEl.hidden = false;
    }
  }
  if (!totalCount) {
    // PWA cold start: localStorage is empty, hydrate hasn't completed
    // yet. Show a "Loading…" state so the user doesn't see the "Nothing
    // here yet" CTA flash for a couple of seconds and assume their
    // songs are gone. We trust either the in-flight flag or the "never
    // completed yet during this session" flag — the latter covers the
    // window between page boot and the IIFE actually firing hydrate.
    const isLoggedIn = Boolean(authSession?.user?.id);
    if (_libraryHydrateInFlight || (isLoggedIn && !_libraryHydrateCompleted)) {
      els.libraryList.innerHTML = `
        <div class="emptyState">
          <div class="emptyStateIcon" aria-hidden="true">♪</div>
          <p class="emptyStateTitle">Loading your library…</p>
          <p class="emptyStateHint">Pulling your songs from the cloud.</p>
        </div>
      `;
      return;
    }
    // Hydrate finished but result is empty. Three sub-cases:
    //  (a) fetch errored → show "Couldn't reach cloud" + Retry
    //  (b) authed user with 0 cloud rows → show migration hint
    //      (their old browser localStorage hasn't been pushed yet —
    //      common when first opening the standalone PWA)
    //  (c) guest / never logged in → original "Nothing here yet" CTA
    if (isLoggedIn && _lastUserSongsLoadStatus !== "ok") {
      els.libraryList.innerHTML = `
        <div class="emptyState">
          <div class="emptyStateIcon" aria-hidden="true">♪</div>
          <p class="emptyStateTitle">Couldn't sync your library</p>
          <p class="emptyStateHint">Network or sign-in issue. Tap Retry to try again.</p>
          <button type="button" class="emptyStateCta" id="libraryEmptyRetry">Retry sync</button>
        </div>
      `;
      const retry = document.getElementById("libraryEmptyRetry");
      if (retry) retry.addEventListener("click", () => {
        setStatus("Retrying library sync…");
        void ensureUserLibraryHydrated();
      });
      return;
    }
    if (isLoggedIn) {
      const failLine = _lastUserSongInsertFailure
        ? `<p class="emptyStateHint" style="margin-top:10px;font-size:12px;line-height:1.45;opacity:0.88">Last cloud save error: ${escapeHtml(_lastUserSongInsertFailure)}</p>`
        : "";
      const persistLine = _lastLibraryPersistError === "quota"
        ? `<p class="emptyStateHint" style="margin-top:10px;font-size:12px;line-height:1.45;opacity:0.88">Device storage is full. Tap Free up space to clear cached covers and song lists, then retry.</p>`
        : (_lastLibraryPersistError
          ? `<p class="emptyStateHint" style="margin-top:10px;font-size:12px;line-height:1.45;opacity:0.88">Local device save: ${escapeHtml(_lastLibraryPersistError)}</p>`
          : "");
      const freeBtn = _lastLibraryPersistError === "quota"
        ? `<button type="button" class="emptyStateCta" id="libraryEmptyFreeSpace" style="margin-top:10px;border:none;cursor:pointer;font:inherit">Free up space &amp; retry</button>`
        : "";
      els.libraryList.innerHTML = `
        <div class="emptyState">
          <div class="emptyStateIcon" aria-hidden="true">♪</div>
          <p class="emptyStateTitle">No songs synced yet</p>
          <p class="emptyStateHint">The cloud has no songs stored for your account yet. Create one here while logged in — it should appear after generation. If you used Safari before adding this app to your Home Screen, open the site in Safari once so older local songs can upload.</p>
          ${failLine}
          ${persistLine}
          ${freeBtn}
          <button type="button" class="emptyStateCta" id="libraryEmptyUploadAgain" style="margin-top:10px;border:none;cursor:pointer;font:inherit">Try sync from this device</button>
          <a href="#/generate" class="emptyStateCta" data-route-link="generate" style="margin-top:8px;display:inline-flex">Create a song</a>
        </div>
      `;
      const uploadAgain = document.getElementById("libraryEmptyUploadAgain");
      if (uploadAgain) {
        uploadAgain.addEventListener("click", () => {
          setStatus("Syncing library to cloud…");
          void ensureUserLibraryHydrated();
        });
      }
      const freeUp = document.getElementById("libraryEmptyFreeSpace");
      if (freeUp) {
        freeUp.addEventListener("click", () => {
          freeUpLocalStorage();
          setStatus("Cleared cached space — retrying sync.");
          void ensureUserLibraryHydrated();
        });
      }
      return;
    }
    els.libraryList.innerHTML = `
      <div class="emptyState">
        <div class="emptyStateIcon" aria-hidden="true">♪</div>
        <p class="emptyStateTitle">Nothing here yet</p>
        <p class="emptyStateHint">Create a song — it lands here automatically so you can replay or share it anytime.</p>
        <a href="#/generate" class="emptyStateCta" data-route-link="generate">Go to Create</a>
      </div>
    `;
    return;
  }
  els.libraryList.innerHTML = `
    <ul class="libraryRows" role="list">
      ${visibleItems.map((t, i) => {
        // Prefer the small thumbnail when one is saved (custom covers
        // generate it on save). Fall back to the full-size cover, then
        // the original artUrl, then the bundled placeholder. Library
        // rows render small (~56px) so the thumb is always sharp enough
        // and shaves the decode cost off long lists.
        const art = String(
          (t.meta && (t.meta.imageThumb || t.meta.imageUrl)) ||
          t.artUrl ||
          "./assets/nabadai-logo.png"
        );
        const playing = libraryNowPlayingId === t.id;
        const dateLabel = formatLibraryDate(t.ts);
        const isInstrumental = t.kind === "instrumental";
        const isSound = t.kind === "sound";
        const rawTitle = String(t.title || "").trim() || (isSound ? "Sound" : "Generated song");
        const displayTitle = isSound ? shortenSoundTitle(rawTitle) : rawTitle;
        const safeTitle = escapeHtml(displayTitle);
        const subBits = [];
        if (dateLabel) subBits.push(`<span class="libRowDot">${escapeHtml(dateLabel)}</span>`);
        if (isInstrumental) subBits.push(`<span class="libRowChip">Instrumental</span>`);
        if (isSound) subBits.push(`<span class="libRowChip">Sound</span>`);
        // First row paints with high priority so the page never looks
        // empty above the fold; everything else is lazy + low-priority,
        // identical pattern to Hub.
        const isFirst = i === 0;
        const loadingAttr = isFirst
          ? `loading="eager" fetchpriority="high"`
          : `loading="lazy" fetchpriority="low"`;
        return `
          <li class="libRow ${playing ? "libRowPlaying" : ""}" data-lib-row="${t.id}">
            <button class="libRowMain" type="button" data-lib-play="${t.id}" aria-label="Play ${safeTitle}">
              <span class="libRowArt">
                <img src="${escapeHtml(art)}" alt="" width="56" height="56" decoding="async" ${loadingAttr} />
                <span class="libRowArtBadge" aria-hidden="true">${playing ? "❚❚" : "▶"}</span>
              </span>
              <span class="libRowInfo">
                <span class="libRowTitle">${safeTitle}</span>
                <span class="libRowSub">${subBits.join("")}</span>
              </span>
              ${playing ? `<span class="libRowEq" aria-hidden="true"><span></span><span></span><span></span></span>` : ""}
            </button>
            <button class="libRowMore" type="button" data-lib-menu="${t.id}" aria-label="More options for ${safeTitle}">⋯</button>
          </li>
        `;
      }).join("")}
    </ul>
    ${hasMore ? `
      <div class="libLoadMoreWrap" data-lib-loadmore-sentinel>
        <button type="button" class="libLoadMore" id="libLoadMore">Load more</button>
      </div>
    ` : ""}
  `;
  // Mirror Hub's auto-extension: clicking "Load more" reveals another
  // page; an IntersectionObserver on the sentinel auto-clicks it as the
  // user scrolls so the list feels endless without burning the initial
  // paint budget.
  const libLoadMoreBtn = document.getElementById("libLoadMore");
  const libSentinel = els.libraryList.querySelector("[data-lib-loadmore-sentinel]");
  if (libLoadMoreBtn) {
    libLoadMoreBtn.addEventListener("click", () => {
      libVisibleCount = Math.min(loadLibrary().length, libVisibleCount + LIB_PAGE_SIZE);
      renderLibrary();
    });
  }
  if (libSentinel && typeof IntersectionObserver === "function") {
    const io = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        io.disconnect();
        libLoadMoreBtn?.click();
        break;
      }
    }, { rootMargin: "240px 0px" });
    io.observe(libSentinel);
  }
  // All row interactions are dispatched via one delegated listener
  // installed below (`bindLibraryDelegatedListeners`). Doing it that way
  // means each `renderLibrary()` is just `innerHTML` + the load-more
  // setup above — no per-row `addEventListener` calls. With 24 visible
  // rows that's 200+ fewer listeners attached on every render.
  bindLibraryDelegatedListeners();
  // Fire-and-forget thumb backfill once the list is in the DOM. Wraps in
  // requestIdleCallback when available so it never competes with the
  // initial paint or a play tap.
  const _scheduleThumbBackfill = () => { void backfillLibraryThumbsLazy(); };
  if (typeof requestIdleCallback === "function") {
    requestIdleCallback(_scheduleThumbBackfill, { timeout: 1500 });
  } else {
    setTimeout(_scheduleThumbBackfill, 600);
  }
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
if (els.btnLibraryDiagnostic) {
  els.btnLibraryDiagnostic.addEventListener("click", () => void runLibraryDiagnostic());
}
async function handleLibraryFreeSpaceClick() {
  const r = freeUpLocalStorage();
  // iOS Safari PWA: localStorage, Cache API, and IndexedDB share a
  // single origin quota, so we sweep the Cache API too. SW caches
  // (audio/cover blobs, prebuilt page chunks) are often the real
  // hogs even when localStorage looks small.
  let cachesCleared = 0;
  try {
    if (typeof caches !== "undefined" && caches?.keys) {
      const names = await caches.keys();
      for (const name of names) {
        try {
          const ok = await caches.delete(name);
          if (ok) cachesCleared += 1;
        } catch {}
      }
    }
  } catch {}
  const items = loadLibrary();
  if (items.length) saveLibrary(items);
  const memN = items.length;
  const persistedN = _lastLibraryPersistedCount;
  syncLibraryStorageBanner();
  const freedKB = Math.max(0, r.beforeKB - r.afterKB);
  setStatus(
    `Freed ${freedKB}KB (${r.dropped} keys${cachesCleared ? ` + ${cachesCleared} caches` : ""}). Saved ${persistedN}/${memN} songs locally.`
  );
  void ensureUserLibraryHydrated();
}
if (els.btnLibraryFreeSpace) {
  els.btnLibraryFreeSpace.addEventListener("click", () => void handleLibraryFreeSpaceClick());
}
if (els.btnLibraryFreeSpaceAlt) {
  els.btnLibraryFreeSpaceAlt.addEventListener("click", () => void handleLibraryFreeSpaceClick());
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
  // iOS Safari often reports `duration === Infinity` on Suno-proxied audio
  // until enough is buffered. `durationchange` and `canplay` are the events
  // that actually fire when a real duration becomes available.
  playerEl.addEventListener("durationchange", syncPlayerUI);
  playerEl.addEventListener("canplay", syncPlayerUI);
  playerEl.addEventListener("progress", syncPlayerUI);
  playerEl.addEventListener("play", syncPlayerUI);
  playerEl.addEventListener("pause", syncPlayerUI);
  playerEl.addEventListener("ended", () => {
    if (els.btnPlayerPlay) els.btnPlayerPlay.disabled = false;
    if (els.btnPlayerPause) els.btnPlayerPause.disabled = true;
  });
  return playerEl;
}

/** Best-effort track duration — works even when `audio.duration` is Infinity
 *  (common on streamed Suno proxy URLs in iOS Safari). Falls back to the last
 *  seekable timestamp, then to the buffered end. Returns 0 when nothing is
 *  known yet so callers can still treat it as "unknown". */
function getPlayerDuration() {
  if (!playerEl) return 0;
  const raw = Number(playerEl.duration);
  if (Number.isFinite(raw) && raw > 0) return raw;
  try {
    const sk = playerEl.seekable;
    if (sk && sk.length) {
      const end = Number(sk.end(sk.length - 1));
      if (Number.isFinite(end) && end > 0) return end;
    }
  } catch {}
  try {
    const bf = playerEl.buffered;
    if (bf && bf.length) {
      const end = Number(bf.end(bf.length - 1));
      if (Number.isFinite(end) && end > 0) return end;
    }
  } catch {}
  return 0;
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
/** Rewrite Supabase Storage public URLs through the image transformer
 *  for a smaller, faster thumbnail. Anything else (Suno CDN URLs,
 *  data/blob URLs, local assets) is returned unchanged so this helper
 *  is safe to apply blanket-fashion to any cover/avatar `<img src>`.
 *
 *  Supabase pricing: image transformations are billed per
 *  transformation, but the resulting WebP is heavily cached at the
 *  edge so the marginal cost on a feed reload is essentially zero.
 *
 *  Why we don't proxy Suno covers: their CDN is already fast and they
 *  serve reasonably compressed JPEGs. Routing them through a Vercel
 *  function would double-pay bandwidth and add a hop for no real win.
 */
function toCoverThumbUrl(url, opts) {
  const s = String(url || "").trim();
  if (!s) return "";
  if (s.startsWith("data:") || s.startsWith("blob:") || s.startsWith("./")) return s;
  // Only touch Supabase Storage public-object URLs. The transformer is
  // exposed at `/storage/v1/render/image/public/...` with the same path
  // segment after `public/` as the original object URL.
  const match = s.match(/^(https?:\/\/[^/]+)\/storage\/v1\/object\/(public|sign)\/(.+)$/i);
  if (!match) return s;
  const [, origin, mode, rest] = match;
  const w = Number(opts?.width || 240);
  const q = Number(opts?.quality || 70);
  // Strip any query string the original URL carried (e.g. signed token);
  // signed URLs would need different handling and we'd refuse to thumb
  // them anyway, since the signature ties the response to the original
  // path. For public objects, this is a clean rewrite.
  if (mode !== "public") return s;
  const cleanRest = rest.split("?")[0].split("#")[0];
  return `${origin}/storage/v1/render/image/public/${cleanRest}?width=${w}&quality=${q}&resize=cover`;
}

/** Read a picked file as a data URL (same pattern as the Image Mood flow). */
function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result || ""));
    fr.onerror = () => reject(new Error("Could not read file"));
    fr.readAsDataURL(file);
  });
}

/** Downscale a raster image data URL to JPEG for smaller localStorage + Hub payloads. */
async function downscaleImageDataUrl(dataUrl, maxSide = 1600, quality = 0.82) {
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
  return canvas.toDataURL("image/jpeg", quality);
}

/** Turn a user-picked cover into a persistent data URL (no blob: URLs).
 *  Stored in Library JSON + Supabase `cover_url`, so it must survive
 *  refresh and load on other devices — blobObjectURLs break both.
 */
async function fileToCoverDataUrl(file) {
  if (!file || !String(file.type || "").startsWith("image/")) {
    throw new Error("Choose an image file.");
  }
  let dataUrl = await readFileAsDataUrl(file);
  dataUrl = await downscaleImageDataUrl(dataUrl, 1024, 0.78);
  if (dataUrl.length > 450_000) dataUrl = await downscaleImageDataUrl(dataUrl, 800, 0.72);
  if (dataUrl.length > 280_000) dataUrl = await downscaleImageDataUrl(dataUrl, 640, 0.68);
  return dataUrl;
}

/** Build a small (256px) JPEG thumbnail from any cover URL/data-URL.
 *  Library rows render at ~56px so this is plenty crisp; the saving
 *  is dramatic on lists with many custom covers because we no longer
 *  hand the browser a 1024px image to decode for every row.
 *
 *  Returns "" on failure (CORS, decode error) so callers can fall
 *  back to the original cover URL.
 */
async function buildCoverThumbDataUrl(src) {
  const s = String(src || "").trim();
  if (!s) return "";
  if (s.startsWith("./")) return ""; // bundled placeholder, no thumb needed
  try {
    const img = await new Promise((resolve, reject) => {
      const i = new Image();
      // crossOrigin lets us paint remote covers (Suno CDN) into a canvas
      // when the host serves CORS headers. If it doesn't, the draw will
      // throw a SecurityError and we return "" — caller falls back to
      // the original src, no harm done.
      if (!s.startsWith("data:") && !s.startsWith("blob:")) {
        i.crossOrigin = "anonymous";
      }
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error("Could not decode image"));
      i.src = s;
    });
    const max = 256;
    const w = Number(img.width || 0);
    const h = Number(img.height || 0);
    if (!w || !h) return "";
    const scale = Math.min(1, max / Math.max(w, h));
    const tw = Math.max(1, Math.round(w * scale));
    const th = Math.max(1, Math.round(h * scale));
    const canvas = document.createElement("canvas");
    canvas.width = tw;
    canvas.height = th;
    const ctx = canvas.getContext("2d");
    if (!ctx) return "";
    ctx.drawImage(img, 0, 0, tw, th);
    return canvas.toDataURL("image/jpeg", 0.7);
  } catch {
    return "";
  }
}

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

/** Whether the current network looks fast enough to spend bytes on
 * speculative preloads. Returns true on WiFi/4G+ and unknown (when the
 * Network Information API isn't available, we don't penalize the user
 * — they probably have a fast connection). Returns false on 2g/3g and
 * when the user has explicitly opted into Data Saver. */
function shouldPreloadHubBytes() {
  try {
    const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    if (!conn) return true;
    if (conn.saveData) return false;
    const t = String(conn.effectiveType || "").toLowerCase();
    if (t === "slow-2g" || t === "2g" || t === "3g") return false;
    return true;
  } catch {
    return true;
  }
}

function preloadNextHubTrack(currentPostId) {
  if (!currentPostId) return;
  if (!shouldPreloadHubBytes()) return;
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

/** Inline confirm bar inside the player. Returns a Promise that
 *  resolves true if the user tapped the primary action, false on
 *  cancel / dismiss. Replaces window.confirm() so we can keep the
 *  app's minimal aesthetic and avoid the iOS PWA system dialog. */
let _playerConfirmResolver = null;
function playerInlineConfirm({ text, confirmLabel, cancelLabel, thumbUrl, danger } = {}) {
  return new Promise((resolve) => {
    const wrap = els.playerConfirm;
    const txt = els.playerConfirmText;
    const okBtn = els.playerConfirmOk;
    const cancelBtn = els.playerConfirmCancel;
    const thumb = els.playerConfirmThumb;
    if (!wrap || !txt || !okBtn || !cancelBtn) {
      // Fallback: if the bar isn't in the DOM, just resolve true so
      // existing behavior continues. setStatus surfaces the action.
      if (text) setStatus(text);
      resolve(true);
      return;
    }
    if (_playerConfirmResolver) {
      try { _playerConfirmResolver(false); } catch {}
    }
    _playerConfirmResolver = resolve;
    txt.textContent = String(text || "Are you sure?");
    okBtn.textContent = String(confirmLabel || "Confirm");
    cancelBtn.textContent = String(cancelLabel || "Cancel");
    okBtn.classList.toggle("danger", Boolean(danger));
    if (thumb) {
      const url = String(thumbUrl || "").trim();
      if (url) {
        thumb.src = url;
        thumb.hidden = false;
      } else {
        thumb.removeAttribute("src");
        thumb.hidden = true;
      }
    }
    wrap.hidden = false;
    requestAnimationFrame(() => wrap.classList.add("show"));
  });
}
function dismissPlayerConfirm(answer) {
  const wrap = els.playerConfirm;
  if (wrap) {
    wrap.classList.remove("show");
    setTimeout(() => { if (!wrap.classList.contains("show")) wrap.hidden = true; }, 220);
  }
  if (els.playerConfirmOk) els.playerConfirmOk.classList.remove("danger");
  if (_playerConfirmResolver) {
    try { _playerConfirmResolver(Boolean(answer)); } catch {}
    _playerConfirmResolver = null;
  }
}
if (typeof document !== "undefined") {
  document.addEventListener("DOMContentLoaded", () => {
    if (els.playerConfirmOk) {
      els.playerConfirmOk.addEventListener("click", () => dismissPlayerConfirm(true));
    }
    if (els.playerConfirmCancel) {
      els.playerConfirmCancel.addEventListener("click", () => dismissPlayerConfirm(false));
    }
    // Tap the dim backdrop = cancel.
    if (els.playerConfirm) {
      els.playerConfirm.addEventListener("click", (e) => {
        if (e.target === els.playerConfirm) dismissPlayerConfirm(false);
      });
    }
    // Escape = cancel, Enter = confirm (only while the modal is open).
    document.addEventListener("keydown", (e) => {
      const wrap = els.playerConfirm;
      if (!wrap || wrap.hidden || !wrap.classList.contains("show")) return;
      if (e.key === "Escape") {
        e.preventDefault();
        dismissPlayerConfirm(false);
      } else if (e.key === "Enter") {
        e.preventDefault();
        dismissPlayerConfirm(true);
      }
    });
  }, { once: true });
}

/** Briefly flash the player cover after a save. Pure visual feedback —
 *  no behavior change. */
function flashPlayerCover() {
  const img = els.playerArt || document.getElementById("playerArt");
  if (!img) return;
  img.classList.remove("playerCoverFlash");
  // Force reflow so the animation restarts on rapid re-saves.
  // eslint-disable-next-line no-unused-expressions
  img.offsetWidth;
  img.classList.add("playerCoverFlash");
  setTimeout(() => img.classList.remove("playerCoverFlash"), 900);
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
  // Skip the eager first-track download on slow networks. The user pays
  // a small "first tap" delay later, but the Hub feed itself paints fast.
  if (!shouldPreloadHubBytes()) return;
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

/** Style/timing chips under generated-result titles (Create page). */
function buildGeneratedResultMetaLine() {
  const style = String(els.sunoStyle?.value || "").trim();
  const timingEl = document.getElementById("sunoTiming");
  const timing = timingEl ? String(timingEl.value || "").trim() : "";
  const bits = [];
  if (style) {
    const tags = style.split(/[,，]/).map((x) => x.trim()).filter(Boolean).slice(0, 5);
    if (tags.length) bits.push(tags.join(" · "));
  }
  if (timing) bits.push(timing);
  const line = bits.slice(0, 2).join(" · ");
  return line || "Ready — tap the cover to listen";
}

/** Share sheet / copy-link for a freshly generated variant (no Hub post required). */
async function shareGeneratedTrack(variant) {
  const title =
    variant === "b"
      ? String(lastSunoTitle2 || "").trim() || "Generated song B"
      : String(lastSunoTitle || "").trim() || "Generated song";
  const rawUrl =
    variant === "b"
      ? lastSunoFullUrl2 || lastSunoProxyUrl2 || ""
      : lastSunoFullUrl || lastSunoProxyUrl || "";
  const trimmed = String(rawUrl || "").trim();
  const url =
    trimmed && /^https?:\/\//i.test(trimmed)
      ? trimmed
      : String(lastPlayerHttpUrl || "").trim() || window.location.href;
  const ver = variant === "b" ? "Version B" : "Version A";
  await shareHubLink({
    title: `${title} — Nabadai`,
    text: `Made with NabadAi (${ver})`,
    url,
  });
}

/** Progress + play/pause affordances on Create-page result cards while audio plays inline. */
function syncResultCardsFromPlayer() {
  const route = document.body.getAttribute("data-route") || "";
  const onGenerate = route === "generate";
  const a = playerEl;
  const dur = a && Number.isFinite(a.duration) ? a.duration : 0;
  const cur = a && Number.isFinite(a.currentTime) ? a.currentTime : 0;
  const playing = Boolean(a && !a.paused && !a.ended && (dur > 0 || cur > 0));
  const mini =
    miniSource && miniSource.type === "generateResult" ? miniSource.variant : null;

  const playingA = onGenerate && mini === "a" && playing;
  const playingB = onGenerate && mini === "b" && playing;
  const progressA = onGenerate && mini === "a" && dur > 0;
  const progressB = onGenerate && mini === "b" && dur > 0;

  const wrapA = document.getElementById("resultArtWrap");
  const wrapB = document.getElementById("resultArtWrap2");
  if (wrapA) wrapA.classList.toggle("isPlaying", playingA);
  if (wrapB) wrapB.classList.toggle("isPlaying", playingB);

  const btnA = document.getElementById("btnResultPlay");
  const btnB = document.getElementById("btnResultPlay2");
  const toggIco = (btn, on) => {
    if (!btn) return;
    const pPlay = btn.querySelector(".resultArtPlayIco--play");
    const pPause = btn.querySelector(".resultArtPlayIco--pause");
    if (pPlay && pPause) {
      pPlay.hidden = Boolean(on);
      pPause.hidden = !on;
    }
    const idleLabel = btn.id === "btnResultPlay2" ? "Play version B" : "Play";
    btn.setAttribute("aria-label", on ? "Pause" : idleLabel);
  };
  toggIco(btnA, playingA);
  toggIco(btnB, playingB);

  const rowA = document.getElementById("resultProgressRow");
  const rowB = document.getElementById("resultProgressRow2");
  const fillA = document.getElementById("resultProgressFill");
  const fillB = document.getElementById("resultProgressFill2");
  const labA = document.getElementById("resultTimeLabel");
  const labB = document.getElementById("resultTimeLabel2");

  if (rowA && fillA && labA) {
    if (progressA) {
      rowA.hidden = false;
      const pct = dur > 0 ? Math.min(100, (cur / dur) * 100) : 0;
      fillA.style.width = `${pct}%`;
      labA.textContent = `${formatTime(cur)} / ${formatTime(dur)}`;
    } else {
      rowA.hidden = true;
      fillA.style.width = "0%";
      labA.textContent = "";
    }
  }
  if (rowB && fillB && labB) {
    if (progressB) {
      rowB.hidden = false;
      const pct = dur > 0 ? Math.min(100, (cur / dur) * 100) : 0;
      fillB.style.width = `${pct}%`;
      labB.textContent = `${formatTime(cur)} / ${formatTime(dur)}`;
    } else {
      rowB.hidden = true;
      fillB.style.width = "0%";
      labB.textContent = "";
    }
  }
}

function syncPlayerUI() {
  if (!playerEl) return;
  const dur = getPlayerDuration();
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
  syncResultCardsFromPlayer();
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

function setSunoCreditsNote(text) {
  const note = els.sunoCreditsNote;
  if (!note) return;
  if (text) {
    note.textContent = text;
    note.hidden = false;
  } else {
    note.textContent = "";
    note.hidden = true;
  }
}

async function refreshSunoCredits() {
  if (!els.sunoCredits) return;
  try {
    if (els.btnSunoCredits) els.btnSunoCredits.disabled = true;
    setSunoCreditsNote("updating…");
    const r = await fetch(apiUrl("/api/suno/credits"));
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data?.error || "credits failed");
    const credits = data?.data;
    els.sunoCredits.textContent = Number.isFinite(Number(credits)) ? String(credits) : "—";
    setSunoCreditsNote("");
    return Number.isFinite(Number(credits)) ? Number(credits) : null;
  } catch (e) {
    els.sunoCredits.textContent = "—";
    setSunoCreditsNote("failed");
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
    const metaLine = buildGeneratedResultMetaLine();
    const rm = document.getElementById("resultMetaLine");
    const rm2 = document.getElementById("resultMetaLine2");
    if (rm) rm.textContent = metaLine;
    if (rm2) rm2.textContent = metaLine;
    if (els.resultArt) {
      const fallbackCover = "/assets/nabadai-logo.png";
      els.resultArt.src = lastSunoArtUrl || fallbackCover;
      els.resultArt.alt = lastSunoTitle ? `Cover: ${lastSunoTitle}` : "Song cover";
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
      els.resultArt2.alt = lastSunoTitle2 ? `Cover: ${lastSunoTitle2}` : "Song cover B";
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

          const authToken = getSupabaseAuthToken();
          const r = await fetch(apiUrl("/api/suno/generate"), {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
            },
            body: JSON.stringify(payload),
          });
          const d = await r.json().catch(() => ({}));
          if (r.status === 402 || d?.code === "insufficient_credits") {
            const need = Number(d?.needed ?? FULL_SONG_CREDIT_COST);
            const have = Number(d?.balance || 0);
            const err = new Error(
              `Not enough credits (you have ${formatCreditsAmount(have)}, need ${formatCreditsAmount(need)}). Open Profile → Credits to redeem a code.`
            );
            err.code = "insufficient_credits";
            err.balance = have;
            err.needed = need;
            throw err;
          }
          if (r.status === 401) {
            throw new Error("Please sign in with Google before generating a song.");
          }
          if (!r.ok) {
            const more = d?.detailMessage || d?.details?.message || d?.details?.error || "";
            throw new Error(`${d?.error || "Suno generate failed"}${more ? `: ${more}` : ""}`);
          }
          if (d?._credits && Number.isFinite(Number(d._credits.balance))) {
            setCreditsBalance(Number(d._credits.balance));
            creditsState.loaded = true;
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
    els.btnResultPlay.addEventListener("click", async (ev) => {
      ev.stopPropagation();
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
      if (
        miniSource?.type === "generateResult" &&
        miniSource?.variant === "a" &&
        playerEl &&
        !playerEl.paused
      ) {
        playerEl.pause();
        if (typeof syncPlayerToggleUI === "function") syncPlayerToggleUI();
        syncPlayerUI();
        return;
      }
      if (lastSunoFullUrl) lastPlayerHttpUrl = lastSunoFullUrl;
      setPlayerMeta({
        title: lastSunoTitle || "Generated song",
        subtitle: "Generated • Version A",
        artUrl: lastSunoArtUrl,
      });
      await playInline(url && url !== "#" ? url : "", "Full song", { type: "generateResult", variant: "a" });
    });
  }
  if (els.btnResultPlay2) {
    els.btnResultPlay2.addEventListener("click", async (ev) => {
      ev.stopPropagation();
      haptic("light");
      const url = lastSunoCachedUrl2 || lastSunoProxyUrl2 || lastSunoFullUrl2;
      if (!url || url === "#") {
        setStatus("Second track is not ready for playback yet.");
        return;
      }
      if (
        miniSource?.type === "generateResult" &&
        miniSource?.variant === "b" &&
        playerEl &&
        !playerEl.paused
      ) {
        playerEl.pause();
        if (typeof syncPlayerToggleUI === "function") syncPlayerToggleUI();
        syncPlayerUI();
        return;
      }
      if (lastSunoFullUrl2) lastPlayerHttpUrl = lastSunoFullUrl2;
      setPlayerMeta({
        title: lastSunoTitle2 || "Generated song B",
        subtitle: "Generated • Version B",
        artUrl: lastSunoArtUrl2 || lastSunoArtUrl,
      });
      await playInline(url && url !== "#" ? url : "", "Full song B", {
        type: "generateResult",
        variant: "b",
      });
    });
  }

  const btnResultShare = document.getElementById("btnResultShare");
  const btnResultShare2 = document.getElementById("btnResultShare2");
  if (btnResultShare) {
    btnResultShare.addEventListener("click", async (ev) => {
      ev.stopPropagation();
      haptic("light");
      await shareGeneratedTrack("a");
    });
  }
  if (btnResultShare2) {
    btnResultShare2.addEventListener("click", async (ev) => {
      ev.stopPropagation();
      haptic("light");
      await shareGeneratedTrack("b");
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
  // Click delegation on the result card body (anywhere except the inner
  // controls) opens the full-screen Now Playing for that variant.
  // The cover's ▶ button still triggers inline preview so users who just
  // want to listen don't get pulled off Create.
  const openResultInPlayer = async (variant) => {
    haptic("light");
    const candidates = variant === "b"
      ? [lastSunoCachedUrl2, lastSunoProxyUrl2, lastSunoFullUrl2].filter(Boolean)
      : [
          lastSunoCachedUrl,
          lastSunoProxyUrl,
          lastSunoFullUrl,
          els.sunoFullLink?.classList.contains("disabled") ? "" : els.sunoFullLink?.href,
        ].filter((u) => u && u !== "#");
    const url = candidates[0] || "";
    if (!url) {
      setStatus(variant === "b"
        ? "Second track is not ready for playback yet."
        : "No playable result URL yet. Please wait a moment and try again.");
      return;
    }
    // If the player already has this variant loaded (e.g. user pressed the
    // cover ▶ a moment ago), just expand to full-screen instead of seeking
    // back to 0 and re-buffering.
    const currentSrc = String(playerEl?.src || "");
    const alreadyLoaded = candidates.some((u) => u && currentSrc === u);
    miniSource = { type: "player" };
    if (alreadyLoaded) {
      location.hash = "#/player";
      try {
        if (playerEl?.paused) await playerEl.play();
      } catch {}
      return;
    }
    if (variant === "b") {
      if (lastSunoFullUrl2) lastPlayerHttpUrl = lastSunoFullUrl2;
      await playOnPlayerPage(url, "Full song B", {
        title: lastSunoTitle2 || "Generated song B",
        subtitle: "Generated • Version B",
        artUrl: lastSunoArtUrl2 || lastSunoArtUrl,
      });
      return;
    }
    if (lastSunoFullUrl) lastPlayerHttpUrl = lastSunoFullUrl;
    await playOnPlayerPage(url, "Full song", {
      title: lastSunoTitle || "Generated song",
      subtitle: "Generated • Version A",
      artUrl: lastSunoArtUrl,
    });
  };
  const isInteractive = (target) =>
    target && target instanceof Element && (
      target.closest("button") ||
      target.closest("a") ||
      target.closest("details") ||
      target.closest("summary")
    );
  if (els.resultCard) {
    els.resultCard.addEventListener("click", (e) => {
      if (isInteractive(e.target)) return;
      void openResultInPlayer("a");
    });
  }
  if (els.resultCard2) {
    els.resultCard2.addEventListener("click", (e) => {
      if (isInteractive(e.target)) return;
      void openResultInPlayer("b");
    });
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
  if (els.btnGenerateOrb) {
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
  syncCreateTabMorph();
}

// Subtle morph of the bottom Create tab into a Generate / Listen button when
// the user is on the Create page and inputs are ready. The tab's underlying
// route navigation is preserved on every other page.
var _tabListenTimer = null;
var _tabListenFlashedForRun = false;
var _tabLastHasResult = false;
var TAB_TIP_KEY = "nabadai_tab_generate_tip_v1";
var _tabTipTimer = null;
function syncCreateTabMorph() {
  const tab = document.getElementById("tabCreate");
  if (!tab) return;
  const tooltip = document.getElementById("tabCreateTooltip");
  const route = document.body.getAttribute("data-route");
  const onCreate = route === "generate";

  const hasInput = Boolean(
    String(els.sunoPrompt?.value || "").trim() ||
    String(els.sunoStyle?.value || "").trim() ||
    imageMoodAppliedForNextGen
  );
  const generating = Boolean(els.btnSunoGenerate?.disabled);
  const hasResult = (els.resultCard?.style.display || "none") !== "none";

  // Reset listen-flash bookkeeping when the user starts a fresh run.
  if (generating) _tabListenFlashedForRun = false;

  // Detect rising edge: result just became visible while on Create.
  const justFinished = onCreate && hasResult && !_tabLastHasResult && !_tabListenFlashedForRun;
  _tabLastHasResult = hasResult;

  if (justFinished) {
    _tabListenFlashedForRun = true;
    tab.classList.remove("tabIsReady", "tabIsGenerating");
    tab.classList.add("tabIsListen");
    if (_tabListenTimer) clearTimeout(_tabListenTimer);
    _tabListenTimer = setTimeout(() => {
      tab.classList.remove("tabIsListen");
      _tabListenTimer = null;
      try { syncCreateTabMorph(); } catch {}
    }, 2400);
    return;
  }

  // While the listen flash timer is running, leave it alone.
  if (_tabListenTimer) return;

  // Off the Create page → no morph at all.
  if (!onCreate) {
    tab.classList.remove("tabIsReady", "tabIsGenerating", "tabIsListen");
    if (tooltip) tooltip.hidden = true;
    return;
  }

  if (generating) {
    tab.classList.add("tabIsGenerating");
    tab.classList.remove("tabIsReady", "tabIsListen");
    if (tooltip) tooltip.hidden = true;
    return;
  }

  const ready = hasInput && !hasResult;
  const wasReady = tab.classList.contains("tabIsReady");
  tab.classList.toggle("tabIsReady", ready);
  tab.classList.remove("tabIsGenerating");

  if (ready && !wasReady) {
    try {
      if (tooltip && !localStorage.getItem(TAB_TIP_KEY)) {
        tooltip.hidden = false;
        if (_tabTipTimer) clearTimeout(_tabTipTimer);
        _tabTipTimer = setTimeout(() => {
          tooltip.hidden = true;
          try { localStorage.setItem(TAB_TIP_KEY, "1"); } catch {}
        }, 2400);
      }
    } catch {}
  }
  if (!ready && tooltip) tooltip.hidden = true;
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

const _tabMo = new MutationObserver(() => {
  try { syncCreateTabMorph(); } catch {}
});
try {
  _tabMo.observe(document.body, { attributes: true, attributeFilter: ["data-route", "class"] });
  if (els.resultCard) _tabMo.observe(els.resultCard, { attributes: true, attributeFilter: ["style"] });
  if (els.btnSunoGenerate) _tabMo.observe(els.btnSunoGenerate, { attributes: true, attributeFilter: ["disabled"] });
} catch {}
syncCreateTabMorph();

(function wireCreateTabMorphClick() {
  const tab = document.getElementById("tabCreate");
  if (!tab) return;
  tab.addEventListener("click", (ev) => {
    const route = document.body.getAttribute("data-route");
    if (route !== "generate") return; // let normal navigation happen
    if (tab.classList.contains("tabIsGenerating")) {
      ev.preventDefault();
      return;
    }
    if (tab.classList.contains("tabIsListen")) {
      ev.preventDefault();
      try { haptic("impact"); } catch {}
      const playA = document.getElementById("btnResultPlay");
      if (playA) {
        playA.click();
        try { playA.scrollIntoView({ behavior: "smooth", block: "center" }); } catch {}
      }
      return;
    }
    if (tab.classList.contains("tabIsReady")) {
      ev.preventDefault();
      try { haptic("impact"); } catch {}
      try { localStorage.setItem(TAB_TIP_KEY, "1"); } catch {}
      const tooltip = document.getElementById("tabCreateTooltip");
      if (tooltip) tooltip.hidden = true;
      if (els.btnSunoGenerate && !els.btnSunoGenerate.disabled) {
        els.btnSunoGenerate.click();
      }
    }
  }, true);
})();

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
// Defer the cold-start Library + Hub renders to after first paint.
// Both lists read from localStorage which is heavy when Library has
// custom-cover data URLs, and both inflate large amounts of HTML. Doing
// this after the browser has shown the initial frame keeps the route
// swap snappy regardless of which tab the user lands on.
const _bootInitialLists = () => {
  try { renderLibrary(); } catch {}
  try { renderHub(); } catch {}
};
if (typeof requestAnimationFrame === "function") {
  requestAnimationFrame(() => requestAnimationFrame(_bootInitialLists));
} else {
  setTimeout(_bootInitialLists, 0);
}
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
 * the debounced autoplay can't restart the previous row mid-jump either.
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
    // Hub posts get special treatment: the post itself is the richer
    // "now playing" surface (cover art, full controls, comments, share),
    // so we jump back to the post in the feed instead of the player.
    if (miniSource?.type === "hub" && hubAudioPostId) {
      if ((location.hash || "") !== "#/hub") location.hash = "#/hub";
      setTimeout(() => {
        const row = document.querySelector(`[data-hub-row="${hubAudioPostId}"]`);
        if (!row) return;
        row.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 120);
      return;
    }
    // Everything else (Library tracks, generated result cards, vocal
    // takes, …) expands into the full-screen Now Playing modal — same
    // pattern as Apple Music's mini-player tap.
    if (playerEl && playerEl.src) {
      location.hash = "#/player";
    }
  });
}
window.addEventListener("scroll", () => {
  if ((document.body.getAttribute("data-route") || "") === "hub") {
    scheduleHubFocusUpdate();
    scheduleHubViewportAutoplay();
  }
  if (hubAudio) scheduleRenderHubNowPlaying();
}, { passive: true });
// `scrollend` fires once the page (or a programmatic smooth scroll) actually
// stops — much more reliable than waiting for `scroll` events to taper off.
// Supported on iOS Safari 16+, Chrome 114+, and Firefox 109+. Where it isn't
// supported the 280ms debounce above still covers us.
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
// Refresh Suno credits whenever the Profile route opens — keeps the
// number on the hero card in sync with what the backend actually has,
// without nagging the API on every route change.
window.addEventListener("hashchange", () => {
  const route = document.body.getAttribute("data-route") || "";
  if (route === "profile") void refreshSunoCredits();
  if (route === "profile" || route === "credits" || route === "sounds") void refreshMyCredits({ silent: true });
});

if (els.btnCreditsRedeem) {
  els.btnCreditsRedeem.addEventListener("click", () => {
    void redeemPromoCode(els.creditsRedeemInput?.value || "");
  });
}
if (els.creditsRedeemInput) {
  els.creditsRedeemInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      void redeemPromoCode(els.creditsRedeemInput.value || "");
    }
  });
  els.creditsRedeemInput.addEventListener("input", () => {
    if (els.creditsRedeemMsg && els.creditsRedeemMsg.style.display !== "none") {
      setCreditsRedeemMsg("", "");
    }
  });
}
if (els.soundTempo && els.soundTempoLabel) {
  const syncTempoLabel = () => {
    els.soundTempoLabel.textContent = `${els.soundTempo.value} BPM`;
  };
  els.soundTempo.addEventListener("input", syncTempoLabel);
  syncTempoLabel();
}
if (els.btnSoundGenerate) {
  els.btnSoundGenerate.addEventListener("click", async () => {
    const prompt = String(els.soundPrompt?.value || "").trim();
    if (!prompt) {
      setStatus("Describe the sound you want (up to 500 characters).");
      return;
    }
    const token = getSupabaseAuthToken();
    if (!token) {
      setStatus("Sign in with Google to generate sounds.");
      location.hash = "#/auth";
      return;
    }
    try {
      els.btnSoundGenerate.disabled = true;
      setLoading(true, {
        title: "Creating sound…",
        sub: `${formatCreditsAmount(SOUND_CREDIT_COST)} credits · Suno Sounds`,
      });
      const payload = {
        prompt,
        soundLoop: Boolean(els.soundLoop?.checked),
        grabLyrics: Boolean(els.soundGrabLyrics?.checked),
        soundKey: String(els.soundKeySelect?.value || "Any").trim() || "Any",
      };
      if (els.soundTempo) payload.soundTempo = Number(els.soundTempo.value);
      const r = await fetch(apiUrl("/api/suno/sounds"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });
      const d = await r.json().catch(() => ({}));
      if (r.status === 402 || d?.code === "insufficient_credits") {
        const need = Number(d?.needed ?? SOUND_CREDIT_COST);
        const have = Number(d?.balance || 0);
        setStatus(
          `Not enough credits (you have ${formatCreditsAmount(have)}, need ${formatCreditsAmount(need)}).`
        );
        setLoading(false);
        els.btnSoundGenerate.disabled = false;
        return;
      }
      if (r.status === 401) {
        setStatus("Sign in to generate sounds.");
        setLoading(false);
        els.btnSoundGenerate.disabled = false;
        return;
      }
      if (!r.ok) {
        setStatus(d?.error || "Sound request failed.");
        setLoading(false);
        els.btnSoundGenerate.disabled = false;
        return;
      }
      if (d?._credits && Number.isFinite(Number(d._credits.balance))) {
        setCreditsBalance(Number(d._credits.balance));
        creditsState.loaded = true;
      }
      soundTaskId = extractTaskIdLoose(d) || "";
      if (!soundTaskId) {
        setStatus("Sound task did not return an id — check Library shortly.");
        setLoading(false);
        els.btnSoundGenerate.disabled = false;
        return;
      }
      const fallbackTitle = shortenSoundTitle((prompt.split(/\r?\n/)[0] || "").trim() || "Sound");
      startSoundGenerationPolling({
        fallbackTitle,
        libraryMeta: {
          mode: "sound",
          soundPrompt: prompt,
          soundLoop: Boolean(els.soundLoop?.checked),
          soundTempo: els.soundTempo ? Number(els.soundTempo.value) : null,
          soundKey: String(els.soundKeySelect?.value || "Any"),
          grabLyrics: Boolean(els.soundGrabLyrics?.checked),
          model: "V5",
        },
      });
      setStatus("Sound is generating…");
    } catch (e) {
      setStatus(`Sound failed: ${e?.message || String(e)}`);
      setLoading(false);
      els.btnSoundGenerate.disabled = false;
    }
  });
}
// Pull the latest Library state from Supabase whenever the user opens
// the Library tab. Throttled inside the function so a rapid tab toggle
// doesn't hammer the API. localStorage stays the immediate source of
// truth for the first paint; this just merges new rows from other
// devices once they arrive.
window.addEventListener("hashchange", () => {
  const route = document.body.getAttribute("data-route") || "";
  if (route !== "library") return;
  // Paint the tab from memory/localStorage first; cloud reconcile hits
  // the network and merges — scheduling it for idle keeps the route swap
  // feeling instant on slower phones.
  const run = () => void reconcileLibraryFromCloud();
  if (typeof requestIdleCallback === "function") {
    requestIdleCallback(run, { timeout: 2500 });
  } else {
    setTimeout(run, 120);
  }
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
    // The mobile tab bar is hidden on /player (full-screen Now Playing),
    // so the back chevron is the user's only way out. If we have history
    // we honor it (preserves Library/Hub scroll position); otherwise we
    // land them somewhere safe instead of exiting the app.
    if (history.length > 1) {
      history.back();
    } else {
      location.hash = "#/library";
    }
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
    const trackTitle = String(currentPlayerTrackRef?.title || els.playerTitle?.textContent || "Listen on Nabadai").trim();
    if (!trackUrl) {
      showToast("Open a song first, then share.");
      return;
    }
    // Share is for sending to friends (WhatsApp, Messenger, IG…).
    // Hub publishing is a separate, deliberate action — never auto-publish
    // here. If the song is already on Hub, prefer that link (rich preview);
    // otherwise share the raw playable audio URL.
    const hubMatch = loadHubFeed().find((p) => {
      const sameUrl = trackUrl && String(p?.url || "").trim() === trackUrl;
      const sameTitle = trackTitle && String(p?.title || "").trim().toLowerCase() === trackTitle.toLowerCase();
      return sameUrl || sameTitle;
    });
    if (hubMatch) {
      await shareHubPost(hubMatch);
      return;
    }
    const ok = await shareHubLink({
      title: `${trackTitle} — Nabadai`,
      text: `Listen to “${trackTitle}” on Nabadai`,
      url: trackUrl,
    });
    if (ok) showShareToast("Sharing…");
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
  els.btnShareClipHub.addEventListener("click", async () => {
    if (!currentPlayerTrackRef?.url) {
      setStatus("Open a library song first, then publish a clip.");
      return;
    }
    const a = ensurePlayer();
    const range = clampClipRange(
      Number(els.clipStartSec?.value || 0),
      Number(els.clipEndSec?.value || 0),
      Number(a?.duration || 0)
    );
    if (range.endSec <= range.startSec) {
      showToast("Pick an end time after the start.");
      return;
    }
    const ok = await playerInlineConfirm({
      text: `Publish this ${range.endSec - range.startSec}s clip (${range.startSec}s → ${range.endSec}s) to Hub?`,
      confirmLabel: "Publish clip",
      cancelLabel: "Cancel",
      thumbUrl: currentPlayerTrackRef.artUrl || els.playerArt?.src || "",
    });
    if (!ok) return;
    const clipTrack = {
      ...currentPlayerTrackRef,
      title: `${currentPlayerTrackRef.title || "Song"} [${range.startSec}s-${range.endSec}s]`,
      meta: {
        ...(currentPlayerTrackRef.meta || {}),
        clip: range,
      },
    };
    try {
      shareToHub(clipTrack);
      if (els.trimSheet) els.trimSheet.style.display = "none";
      showShareToast(`Clip published (${range.startSec}s → ${range.endSec}s)`);
    } catch (e) {
      showToast("Couldn't publish the clip. Try again.");
    }
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
  els.btnShareFullHub.addEventListener("click", async () => {
    const url = String(currentPlayerTrackRef?.url || playerEl?.src || "").trim();
    if (!url) {
      showToast("No loaded song to publish.");
      return;
    }
    const title = String(currentPlayerTrackRef?.title || els.playerTitle?.textContent || "Shared song").trim();
    // Prevent accidental double-publish — Hub feed is keyed by url+title.
    const alreadyOnHub = loadHubFeed().some((p) => {
      const sameUrl = url && String(p?.url || "").trim() === url;
      const sameTitle = title && String(p?.title || "").trim().toLowerCase() === title.toLowerCase();
      return sameUrl || sameTitle;
    });
    if (alreadyOnHub) {
      showToast("Already on Hub — open the post to share it.");
      return;
    }
    const ok = await playerInlineConfirm({
      text: `Publish “${title}” to Hub? Anyone can listen and react.`,
      confirmLabel: "Publish",
      cancelLabel: "Cancel",
      thumbUrl: currentPlayerTrackRef?.artUrl || els.playerArt?.src || "",
    });
    if (!ok) return;
    const track = currentPlayerTrackRef || {
      id: `player_${Date.now()}`,
      title,
      url,
      artUrl: els.playerArt?.src || "",
      kind: /instrumental/i.test(title) ? "instrumental" : "full",
      meta: null,
    };
    try {
      shareToHub(track);
      showShareToast("Published to Hub");
    } catch (e) {
      showToast("Couldn't publish. Try again.");
    }
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
  els.playerCoverUpload.addEventListener("change", async () => {
    const f = els.playerCoverUpload?.files?.[0];
    if (!f || !currentPlayerTrackRef?.id) {
      try { els.playerCoverUpload.value = ""; } catch {}
      return;
    }
    let url = "";
    let thumb = "";
    try {
      setStatus("Processing cover…");
      url = await fileToCoverDataUrl(f);
      thumb = await buildCoverThumbDataUrl(url);
    } catch (e) {
      setStatus(`Cover failed: ${e?.message || String(e)}`);
      try { els.playerCoverUpload.value = ""; } catch {}
      return;
    }
    // Always reset the input so picking the same file twice still fires.
    try { els.playerCoverUpload.value = ""; } catch {}
    const ok = await playerInlineConfirm({
      text: "Use this as the new cover?",
      confirmLabel: "Save cover",
      cancelLabel: "Cancel",
      thumbUrl: thumb || url,
    });
    if (!ok) {
      setStatus("Cover unchanged.");
      return;
    }
    const newMeta = {
      ...(currentPlayerTrackRef.meta || {}),
      imageUrl: url,
      ...(thumb ? { imageThumb: thumb } : {}),
    };
    patchLibraryTrack(currentPlayerTrackRef.id, { artUrl: url, meta: newMeta });
    currentPlayerTrackRef = { ...currentPlayerTrackRef, artUrl: url, meta: newMeta };
    setPlayerMeta({
      title: els.playerTitle?.textContent || currentPlayerTrackRef.title || "Library song",
      subtitle: els.playerSubtitle?.textContent || "Library • Full song",
      artUrl: url,
    });
    flashPlayerCover();
    showShareToast("Cover updated");
    void syncHubCoverForTrack(currentPlayerTrackRef, url);
  });
}
if (els.playerSeek) {
  els.playerSeek.addEventListener("pointerdown", () => (playerSeekDragging = true));
  els.playerSeek.addEventListener("pointerup", () => {
    playerSeekDragging = false;
    if (!playerEl) return;
    const dur = getPlayerDuration();
    const max = Number(els.playerSeek.max || 1000);
    const v = Number(els.playerSeek.value || 0);
    if (dur > 0) playerEl.currentTime = (v / max) * dur;
  });
  els.playerSeek.addEventListener("input", () => {
    if (!playerSeekDragging || !playerEl) return;
    const dur = getPlayerDuration();
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
if (els.sunoPersonaId) {
  els.sunoPersonaId.addEventListener("change", () => {
    savePersonaSelection(String(els.sunoPersonaId.value || ""));
    updateProfilePersonaRow();
  });
}
if (els.btnCreatePersona) {
  els.btnCreatePersona.addEventListener("click", async () => {
    if (!sunoTaskId) {
      const msg = "Generate a song first, then come back and tap this.";
      setStatus(msg);
      showToast(msg, { icon: "♪", durationMs: 3200 });
      return;
    }
    try {
      els.btnCreatePersona.disabled = true;
      setLoading(true, { title: "Creating persona…", sub: "Building persona from your last generated song." });
      showToast("Creating persona from your last song…", { icon: "♪", durationMs: 2400 });
      const r = await fetch(apiUrl("/api/suno/persona"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskId: sunoTaskId }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        const det = d?.lastError || d?.details;
        const extra = det
          ? ` — ${typeof det === "string" ? det : JSON.stringify(det).slice(0, 200)}`
          : "";
        throw new Error((d?.error || "Persona creation failed") + extra);
      }
      const personaId = String(d?.personaId || "").trim();
      if (!personaId) throw new Error("Persona created but ID was missing.");
      addPersona(personaId, `${lastSunoTitle || "Generated"} persona`);
      if (els.sunoPersonaId) els.sunoPersonaId.value = personaId;
      const okMsg = "Persona saved and selected. It will be used on your next generations.";
      setStatus(okMsg);
      showToast("Persona saved & selected", { icon: "✓", durationMs: 3000 });
    } catch (e) {
      const errMsg = `Persona failed: ${e?.message || String(e)}`;
      setStatus(errMsg);
      showToast(errMsg, { icon: "!", durationMs: 4200 });
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
syncActiveProfileIdFromSession();
renderAuthStatus();
// If the user has a stored session, we're going to hydrate Library in
// the boot IIFE below. Set the in-flight flag synchronously *now* so
// the very first `renderLibrary()` (deferred on rAF or fired by the
// route handler) shows the loading state instead of the "Nothing here
// yet" CTA. Without this, the IIFE doesn't get to flip the flag until
// after the first paint, and the empty CTA flashes for a beat.
if (authSession?.user?.id) {
  _libraryHydrateInFlight = true;
}
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

    syncActiveProfileIdFromSession();
    // Fire-and-forget so the rest of boot (Hub refresh, route apply,
    // first paint) is never gated on the user_songs round-trip. The
    // hydrate function repaints Library by itself once the fetch
    // resolves. On a PWA cold start this turned a "Library is stuck"
    // wait into "Library populates a beat after the tab opens".
    void ensureUserLibraryHydrated();
    renderPersonaSelect();
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

// Create page mode tabs (UI scaffolding only — re-parents existing controls)
const createTabEls = {
  photo: document.getElementById("createTabPhoto"),
  hum: document.getElementById("createTabHum"),
  lyrics: document.getElementById("createTabLyrics"),
};
const createPanesWrap = document.querySelector(".createPanes");
function setActiveCreateTab(mode) {
  ["photo", "hum", "lyrics"].forEach((k) => {
    const el = createTabEls[k];
    if (!el) return;
    const active = k === mode;
    el.classList.toggle("isActive", active);
    el.setAttribute("aria-selected", active ? "true" : "false");
  });
  if (createPanesWrap) createPanesWrap.dataset.mode = mode;
  document.querySelectorAll(".createPane").forEach((p) => {
    p.hidden = p.dataset.mode !== mode;
  });
}
if (createTabEls.lyrics) {
  createTabEls.lyrics.addEventListener("click", () => {
    setActiveCreateTab("lyrics");
    setTimeout(() => {
      try { els.sunoPrompt?.focus({ preventScroll: true }); } catch {}
    }, 220);
  });
}
if (createTabEls.photo) {
  createTabEls.photo.addEventListener("click", () => {
    setActiveCreateTab("photo");
  });
}
if (createTabEls.hum) {
  createTabEls.hum.addEventListener("click", () => {
    setActiveCreateTab("hum");
  });
}
const createPhotoCtaBtn = document.getElementById("createPhotoCta");
if (createPhotoCtaBtn) {
  createPhotoCtaBtn.addEventListener("click", () => {
    const modal = document.getElementById("imageMoodModal");
    if (!modal) return;
    modal.style.display = "";
    modal.setAttribute("aria-hidden", "false");
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
