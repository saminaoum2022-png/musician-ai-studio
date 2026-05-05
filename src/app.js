import { generateArrangement, randomizeParams } from "./arrangement.js";
import { renderArrangementToWav } from "./render.js";
import { recordHumToMelody } from "./melody/extract.js";
import { mixStemsToWav } from "./studio/mixer.js";
import { encodeWav16 } from "./wav.js";

const els = {
  sunoPrompt: document.getElementById("sunoPrompt"),
  sunoStyle: document.getElementById("sunoStyle"),
  sunoMaqam: document.getElementById("sunoMaqam"),
  sunoTitle: document.getElementById("sunoTitle"),
  sunoTiming: document.getElementById("sunoTiming"),
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
  sunoVocalUpload: document.getElementById("sunoVocalUpload"),
  sunoVocalUploadName: document.getElementById("sunoVocalUploadName"),
  sunoReferenceMode: document.getElementById("sunoReferenceMode"),
  btnVocalRefRec: document.getElementById("btnVocalRefRec"),
  btnVocalRefStop: document.getElementById("btnVocalRefStop"),
  btnSunoGenerate: document.getElementById("btnSunoGenerate"),
  btnGenerateOrb: document.getElementById("btnGenerateOrb"),
  btnLyricsMagic: document.getElementById("btnLyricsMagic"),
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
  hubUpdatedAt: document.getElementById("hubUpdatedAt"),
  hubFilterLatest: document.getElementById("hubFilterLatest"),
  hubFilterArabic: document.getElementById("hubFilterArabic"),
  hubFilterInstrumental: document.getElementById("hubFilterInstrumental"),
  hubFilterRemix: document.getElementById("hubFilterRemix"),
  hubFilterSelect: document.getElementById("hubFilterSelect"),
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
  hubAddDemo: document.getElementById("hubAddDemo"),
  profileUsername: document.getElementById("profileUsername"),
  profileEmail: document.getElementById("profileEmail"),
  profileGender: document.getElementById("profileGender"),
  profileVoiceTimbre: document.getElementById("profileVoiceTimbre"),
  profileBio: document.getElementById("profileBio"),
  profileAvatar: document.getElementById("profileAvatar"),
  profileAvatarFile: document.getElementById("profileAvatarFile"),
  profileGenres: document.getElementById("profileGenres"),
  profileInstagram: document.getElementById("profileInstagram"),
  profileYouTube: document.getElementById("profileYouTube"),
  profileTikTok: document.getElementById("profileTikTok"),
  profileIsPublic: document.getElementById("profileIsPublic"),
  btnProfileSave: document.getElementById("btnProfileSave"),
  profileSavedMsg: document.getElementById("profileSavedMsg"),
  profilePreviewAvatar: document.getElementById("profilePreviewAvatar"),
  profilePreviewUsername: document.getElementById("profilePreviewUsername"),
  profilePreviewGenderIcon: document.getElementById("profilePreviewGenderIcon"),
  profilePreviewTimbre: document.getElementById("profilePreviewTimbre"),
  profilePreviewVisibility: document.getElementById("profilePreviewVisibility"),
  profilePreviewBio: document.getElementById("profilePreviewBio"),
  profilePreviewGenres: document.getElementById("profilePreviewGenres"),
  profilePreviewLinks: document.getElementById("profilePreviewLinks"),
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
let currentProofPost = null;
let hubAudio = null;
let hubAudioPostId = null;
let hubNowMeta = null;
function renderHubNowPlaying() {
  if (!els.hubNowPlaying) return;
  const active = Boolean(hubAudio && hubNowMeta);
  els.hubNowPlaying.style.display = active ? "" : "none";
  if (!active) return;
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
  els.envBadge.textContent = `Environment: ${mode} • ${target}`;
}
async function loadPublicConfig() {
  try {
    const r = await fetch(apiUrl("/api/public-config"));
    const d = await r.json().catch(() => ({}));
    SUPABASE_URL = String(d?.supabaseUrl || "");
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

function applyRoute() {
  const hash = String(location.hash || "");
  const route = hash.startsWith("#/") ? hash.slice(2) : "generate";
  const wanted = route === "start" ? "intro" : route || "home";
  document.body.classList.toggle("isIntro", wanted === "intro");
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
  }
  syncGenerateOrbVisibility();
}

function updateBrandPulse() {
  if (!els.brandTitle) return;
  const isGenerating = Boolean(els.btnSunoGenerate?.disabled);
  const isPlaying = Boolean(playerEl && !playerEl.paused && !playerEl.ended);
  els.brandTitle.classList.toggle("isGenerating", isGenerating);
  els.brandTitle.classList.toggle("isPlaying", isPlaying);
}

function resetCreateDraft() {
  if (els.sunoPrompt) els.sunoPrompt.value = "";
  if (els.sunoStyle) els.sunoStyle.value = "";
  if (els.sunoTitle) els.sunoTitle.value = "";
  if (els.sunoReferenceMode) els.sunoReferenceMode.value = "none";
  if (els.sunoVocalUpload) els.sunoVocalUpload.value = "";
  vocalRefBlob = null;
  if (els.sunoVocalUploadName) els.sunoVocalUploadName.textContent = "No vocal reference attached.";
  if (els.resultCard) els.resultCard.style.display = "none";
  if (els.resultCard2) els.resultCard2.style.display = "none";
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

function getVocalReferenceFile() {
  if (vocalRefBlob) {
    return new File([vocalRefBlob], "vocal-reference.webm", { type: vocalRefBlob.type || "audio/webm" });
  }
  const f = els.sunoVocalUpload?.files?.[0];
  return f || null;
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
let lastGenerationMeta = null;
const PROFILE_KEY = "mas:profile:v1";
const PROFILE_PERSONAS_KEY = "mas:personas:v1";
let activeProfile = { id: "guest", username: "guest", email: "" };
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
  const r = await fetch(`${SUPABASE_URL}/rest/v1/hub_posts?select=*&order=created_at.desc`, {
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    },
  });
  if (!r.ok) throw new Error("supabase select failed");
  return await r.json().catch(() => []);
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
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
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
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
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
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      Prefer: "return=representation",
    },
  });
  if (!r.ok) throw new Error("supabase delete failed");
  return await r.json().catch(() => []);
}
function loadHubFeed() {
  try {
    const raw = localStorage.getItem(hubFeedKey());
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}
function saveHubFeed(items) {
  try {
    localStorage.setItem(hubFeedKey(), JSON.stringify(items || []));
  } catch {}
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
    meta: track.meta || null,
  });
  saveHubFeed(feed.slice(0, 200));
  void supabaseInsertHub(feed[0]).catch(() => {});
  renderHub();
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
function renderHub() {
  if (!els.hubList) return;
  let items = loadHubFeed();
  if (hubFilter === "arabic") items = items.filter((x) => /arab|خليج|مقام|oud|darbuka|hijaz/i.test(JSON.stringify(x.meta || {}) + " " + (x.title || "")));
  if (hubFilter === "instrumental") items = items.filter((x) => String(x.kind || "").includes("instrumental"));
  if (hubFilter === "remix") items = items.filter((x) => /remix/i.test(String(x.title || "")));
  if (!items.length) {
    els.hubList.textContent = "No posts yet. Share songs from Library to Hub.";
    renderHubUpdatedAt();
    return;
  }
  els.hubList.innerHTML = items.map((p) => `
    <div class="trackRow hubRow" data-hub-row="${p.id}">
      <div class="hubCoverWrap" data-hub-cover="${p.id}">
        <img class="hubCover" src="${escapeHtml(p.artUrl || p.creatorAvatar || "./assets/nabadai-logo.png")}" alt="cover" />
        <button class="hubPlayOverlay" data-hub-play="${p.id}" aria-label="Play">▶</button>
        <div class="hubPlayProgress"><span id="hubProg_${p.id}" style="width:0%"></span></div>
        <button class="hubMoreCorner" data-hub-more="${p.id}" aria-label="More">⋯</button>
      </div>
      <div style="flex:1;min-width:0">
        <div class="hubMetaTop">
          <img src="${escapeHtml(p.creatorAvatar || "./assets/nabadai-logo.png")}" alt="avatar" style="width:26px;height:26px;border-radius:999px;object-fit:cover;border:1px solid rgba(255,255,255,0.14)" />
          <div class="trackTiny">@${escapeHtml(p.creator)}</div>
          <span class="hubProofChip">Proof ${escapeHtml(String(p?.proof?.model || LATEST_SUNO_MODEL))} · #${escapeHtml(String(p?.proof?.promptHash || ""))}</span>
        </div>
        <div class="trackName">${escapeHtml(p.title)}</div>
        <div class="trackTiny">${new Date(p.ts).toLocaleString()}</div>
        ${p.remixOf ? `<div class="trackTiny">Remix of: ${escapeHtml(p.remixOf)}</div>` : ""}
      </div>
      <div class="hubActionRow">
        <button class="ghost hubLikeBtn" data-hub-like="${p.id}">❤ ${Number(p.likes || 0)}</button>
        <button class="ghost hubReactIcon" title="Melody strong" data-hub-react="${p.id}:melody">
          <span class="hubSvg">♪</span><span>${Number(p?.reacts?.melody || 0)}</span>
        </button>
        <button class="ghost hubReactIcon" title="Lyrics strong" data-hub-react="${p.id}:lyrics">
          <span class="hubSvg">✎</span><span>${Number(p?.reacts?.lyrics || 0)}</span>
        </button>
        <button class="ghost hubReactIcon" title="Mix clean" data-hub-react="${p.id}:mix">
          <span class="hubSvg">◌</span><span>${Number(p?.reacts?.mix || 0)}</span>
        </button>
        <button class="ghost hubReactIcon" title="Needs groove" data-hub-react="${p.id}:groove">
          <span class="hubSvg">≈</span><span>${Number(p?.reacts?.groove || 0)}</span>
        </button>
      </div>
      <div class="libMenu hubMoreMenu" id="hubMore_${p.id}" style="display:none">
        <button class="ghost" data-hub-remix="${p.id}">Remix</button>
        <button class="ghost" data-hub-del="${p.id}">Remove</button>
      </div>
    </div>
  `).join("");
  renderHubDots();
  renderHubUpdatedAt();
  const stopHubAudio = () => {
    try { if (hubAudio) hubAudio.pause(); } catch {}
    hubAudio = null;
    hubAudioPostId = null;
    hubNowMeta = null;
    els.hubList.querySelectorAll("[data-hub-play]").forEach((btn) => { btn.textContent = "▶"; });
    els.hubList.querySelectorAll(".hubPlayProgress > span").forEach((bar) => { bar.style.width = "0%"; });
    els.hubList.querySelectorAll(".hubCoverWrap").forEach((w) => w.classList.remove("isPlaying"));
    if (els.hubNowProgBar) els.hubNowProgBar.style.width = "0%";
    renderHubNowPlaying();
  };
  els.hubList.querySelectorAll("[data-hub-play]").forEach((b) => b.addEventListener("click", async (e) => {
    e.stopPropagation();
    const id = b.getAttribute("data-hub-play");
    const p = loadHubFeed().find((x) => x.id === id);
    if (!p?.url) return;
    if (hubAudio && hubAudioPostId === id) {
      stopHubAudio();
      return;
    }
    stopHubAudio();
    try {
      hubAudio = new Audio(p.url);
      hubAudioPostId = id;
      hubNowMeta = { title: p.title || "Hub song", art: p.artUrl || p.creatorAvatar || "./assets/nabadai-logo.png" };
      b.textContent = "■";
      b.closest(".hubCoverWrap")?.classList.add("isPlaying");
      hubAudio.addEventListener("ended", stopHubAudio);
      hubAudio.addEventListener("timeupdate", () => {
        const prog = document.getElementById(`hubProg_${id}`);
        if (!prog || !hubAudio?.duration) return;
        const pct = Math.max(0, Math.min(100, (hubAudio.currentTime / hubAudio.duration) * 100));
        prog.style.width = `${pct}%`;
        if (els.hubNowProgBar) els.hubNowProgBar.style.width = `${pct}%`;
      });
      await hubAudio.play();
      renderHubNowPlaying();
    } catch {
      stopHubAudio();
      setStatus("Playback failed.");
    }
  }));
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
    renderHub();
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
    renderHub();
    const labels = {
      melody: "Melody strong",
      lyrics: "Lyrics strong",
      mix: "Mix clean",
      groove: "Needs groove",
    };
    setStatus(`${labels[key] || "Reaction"} +1`);
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
  try {
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
    saveHubFeed(mapped);
    lastHubUpdateAt = mapped.length ? Math.max(...mapped.map((x) => Number(x.ts || 0))) : 0;
    renderHub();
    renderHubDots();
  } catch {}
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

function renderProfilePreviewFromInputs() {
  const usernameRaw = String(els.profileUsername?.value || "").trim().toLowerCase();
  const username = usernameRaw ? `@${usernameRaw.replace(/^@/, "")}` : "@guest";
  const gender = String(els.profileGender?.value || "").trim();
  const voiceTimbre = String(els.profileVoiceTimbre?.value || "").trim();
  const bio = String(els.profileBio?.value || "").trim() || "Add a short bio to introduce your music style.";
  const avatar = String(els.profileAvatar?.value || "").trim();
  const genres = String(els.profileGenres?.value || "").trim();
  const isPublic = Boolean(els.profileIsPublic?.checked);
  const instagram = String(els.profileInstagram?.value || "").trim();
  const youtube = String(els.profileYouTube?.value || "").trim();
  const tiktok = String(els.profileTikTok?.value || "").trim();

  if (els.profilePreviewUsername) els.profilePreviewUsername.textContent = username;
  if (els.profilePreviewGenderIcon) {
    els.profilePreviewGenderIcon.classList.remove("male", "female");
    if (gender === "male") {
      els.profilePreviewGenderIcon.style.display = "";
      els.profilePreviewGenderIcon.textContent = "";
      els.profilePreviewGenderIcon.classList.add("male");
    } else if (gender === "female") {
      els.profilePreviewGenderIcon.style.display = "";
      els.profilePreviewGenderIcon.textContent = "";
      els.profilePreviewGenderIcon.classList.add("female");
    } else {
      els.profilePreviewGenderIcon.style.display = "none";
      els.profilePreviewGenderIcon.textContent = "";
    }
  }
  if (els.profilePreviewTimbre) {
    const labelMap = {
      bass: "Bass",
      baritone: "Baritone",
      tenor: "Tenor",
      alto: "Alto",
      mezzo_soprano: "Mezzo-Soprano",
      soprano: "Soprano",
    };
    els.profilePreviewTimbre.textContent = `Voice: ${labelMap[voiceTimbre] || "Not set"}`;
  }
  if (els.profilePreviewVisibility) els.profilePreviewVisibility.textContent = isPublic ? "Public" : "Private";
  if (els.profilePreviewBio) els.profilePreviewBio.textContent = bio;
  if (els.profilePreviewGenres) els.profilePreviewGenres.textContent = genres ? `Genres: ${genres}` : "";
  if (els.profilePreviewAvatar) {
    els.profilePreviewAvatar.src = avatar || "./assets/nabadai-logo.png";
  }
  if (els.profilePreviewLinks) {
    const links = [
      { label: "Instagram", url: instagram },
      { label: "YouTube", url: youtube },
      { label: "TikTok", url: tiktok },
    ].filter((x) => x.url);
    els.profilePreviewLinks.innerHTML = "";
    for (const l of links) {
      const a = document.createElement("a");
      a.className = "ghost";
      a.href = l.url;
      a.target = "_blank";
      a.rel = "noreferrer";
      a.textContent = l.label;
      els.profilePreviewLinks.appendChild(a);
    }
  }
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
function saveLibrary(items) {
  try {
    localStorage.setItem(profileLibraryKey(), JSON.stringify(items || []));
  } catch {}
}
function addToLibrary(track) {
  const items = loadLibrary();
  items.unshift({
    id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    ts: Date.now(),
    title: track.title || "Generated song",
    artUrl: track.artUrl || "",
    url: track.url || "",
    taskId: track.taskId || "",
    audioId: track.audioId || "",
    kind: track.kind || "full",
    meta: track.meta || null,
  });
  saveLibrary(items.slice(0, 100));
  renderLibrary();
}
function removeFromLibrary(id) {
  const items = loadLibrary().filter((x) => x.id !== id);
  saveLibrary(items);
  renderLibrary();
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
  els.libraryList.innerHTML = items
    .map(
      (t) => `
      <div class="trackRow libRow" data-lib-row="${t.id}">
        <div style="flex:1; min-width:0;">
          <div class="trackName">${escapeHtml(t.title)}</div>
          <div class="trackTiny">${new Date(t.ts).toLocaleString()}</div>
        </div>
        <button class="ghost libMenuBtn" data-lib-menu="${t.id}" aria-label="Song options">⋯</button>
        <div class="libMenu" id="libMenu_${t.id}" style="display:none">
          <a class="ghost" href="${t.url}" target="_blank" rel="noreferrer">Download</a>
          <button class="ghost" data-lib-share="${t.id}">Share to Hub</button>
          <button class="ghost" data-lib-details="${t.id}">Song details</button>
          ${t.kind === "instrumental" ? "" : `<button class="ghost" data-lib-inst="${t.id}">Get instrumental</button>`}
          ${t.kind === "instrumental" ? "" : `<button class="ghost" data-lib-stems="${t.id}">Get stems</button>`}
          <button class="ghost" data-lib-del="${t.id}">Delete</button>
        </div>
      </div>`
    )
    .join("");
  els.libraryList.querySelectorAll("[data-lib-row]").forEach((row) => {
    row.addEventListener("click", async (e) => {
      const tgt = e.target;
      if (tgt && (tgt.closest("[data-lib-menu]") || tgt.closest(".libMenu"))) return;
      const id = row.getAttribute("data-lib-row");
      const t = loadLibrary().find((x) => x.id === id);
      if (!t?.url) return;
      await playOnPlayerPage(t.url, "Full song");
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
  playerEl.crossOrigin = "anonymous";
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
  if (els.playerTitle) els.playerTitle.textContent = title || "Now Playing";
  if (els.playerSubtitle) els.playerSubtitle.textContent = subtitle || "";
  if (els.playerArt) els.playerArt.src = artUrl || placeholderCoverDataUrl();
}

function setPlayerSource(url, label) {
  const a = ensurePlayer();
  a.pause();
  a.src = url;
  a.currentTime = 0;
  playerLoadedLabel = label || "";
  if (els.playerSource) els.playerSource.textContent = label ? `Loaded: ${label}` : "";
  if (els.btnPlayerPlay) els.btnPlayerPlay.disabled = false;
  if (els.btnPlayerPause) els.btnPlayerPause.disabled = true;
  if (els.btnPlayerStop) els.btnPlayerStop.disabled = false;
  syncPlayerUI();
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

async function playOnPlayerPage(url, label) {
  if (!url) return;
  setPlayerSource(url, label);
  setPlayerMeta({
    title: lastSunoTitle || "Generated song",
    subtitle: label ? `Generated • ${label}` : "Generated",
    artUrl: lastSunoArtUrl,
  });
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
  if (els.playerTime) els.playerTime.textContent = `${formatTime(cur)} / ${formatTime(dur)}`;
  if (els.playerSeek && !playerSeekDragging) {
    const max = Number(els.playerSeek.max || 1000);
    els.playerSeek.value = dur > 0 ? String(Math.round((cur / dur) * max)) : "0";
  }
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
  if (els.globalLoading) els.globalLoading.style.display = show ? "" : "none";
  document.body.classList.toggle("isBusy", show);
  if (show) {
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
      vocalRefBlob = null;
      clearVocalRefPreviewUrl();
      if (els.sunoVocalUploadName) {
        els.sunoVocalUploadName.textContent = f ? `Voice reference attached: ${f.name}` : "No vocal reference attached.";
      }
      updateVocalRefPreviewState();
    });
  }
  if (els.btnVocalRefRec && els.btnVocalRefStop) {
    els.btnVocalRefRec.addEventListener("click", async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        const mimeType = pickRecorderMimeType();
        const rec = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
        const chunks = [];
        rec.ondataavailable = (e) => {
          if (e.data && e.data.size) chunks.push(e.data);
        };
        rec.onstop = () => {
          vocalRefChunks = chunks.slice();
          vocalRefBlob = new Blob(chunks, { type: rec.mimeType || "audio/webm;codecs=opus" });
          if (els.sunoVocalUploadName) {
            els.sunoVocalUploadName.textContent = "Voice reference recorded and attached.";
          }
          updateVocalRefPreviewState();
          if (els.btnRecorderUse) els.btnRecorderUse.disabled = !vocalRefBlob;
          if (els.recorderStatus) els.recorderStatus.textContent = "Recording ready";
        };
        vocalRefStream = stream;
        vocalRefRecorder = rec;
        rec.start();
        els.btnVocalRefRec.disabled = true;
        els.btnVocalRefStop.disabled = false;
        setStatus("Recording voice reference…");
      } catch (e) {
        setStatus(`Microphone access failed: ${e?.message || String(e)}`);
      }
    });
    els.btnVocalRefStop.addEventListener("click", () => {
      try {
        if (vocalRefRecorder && vocalRefRecorder.state !== "inactive") vocalRefRecorder.stop();
      } catch {}
      try {
        if (vocalRefStream) vocalRefStream.getTracks().forEach((t) => t.stop());
      } catch {}
      vocalRefRecorder = null;
      vocalRefStream = null;
      els.btnVocalRefRec.disabled = false;
      els.btnVocalRefStop.disabled = true;
      setStatus("Voice reference ready.");
    });
  }
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
        els.sunoVocalUpload?.click();
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
  if (els.btnCloseVocalRecorder) {
    els.btnCloseVocalRecorder.addEventListener("click", closeVocalRecorderModal);
  }
  if (els.vocalRecorderBackdrop) {
    els.vocalRecorderBackdrop.addEventListener("click", closeVocalRecorderModal);
  }
  if (els.btnRecorderToggle) {
    els.btnRecorderToggle.addEventListener("click", () => {
      const isRecording = Boolean(vocalRefRecorder && vocalRefRecorder.state === "recording");
      if (!isRecording) {
        els.btnVocalRefRec?.click();
        if (els.btnRecorderToggle) els.btnRecorderToggle.classList.add("isRecording");
        if (els.recorderStatus) els.recorderStatus.textContent = "Recording… tap again to stop";
      } else {
        els.btnVocalRefStop?.click();
        if (els.btnRecorderToggle) els.btnRecorderToggle.classList.remove("isRecording");
        if (els.recorderStatus) els.recorderStatus.textContent = "Recorded. Tap Use recording.";
      }
    });
  }
  if (els.btnRecorderUse) {
    els.btnRecorderUse.addEventListener("click", () => {
      if (!vocalRefBlob) return;
      if (els.sunoVocalUploadName) els.sunoVocalUploadName.textContent = "Voice reference recorded and attached.";
      updateVocalRefPreviewState();
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
      els.resultArt.src = lastSunoArtUrl || "";
      els.resultArt.style.display = lastSunoArtUrl ? "" : "none";
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
      els.resultArt2.src = lastSunoArtUrl2 || lastSunoArtUrl || "";
      els.resultArt2.style.display = (lastSunoArtUrl2 || lastSunoArtUrl) ? "" : "none";
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
    const audioUrl = first?.audioUrl || first?.audio_url || first?.streamAudioUrl || first?.stream_audio_url || "";
    const imageUrl = first?.imageUrl || first?.image_url || first?.coverUrl || first?.cover_url || null;
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
      lastSunoTitle = String(title || "").trim() || lastSunoTitle;
      setLink(els.sunoFullLink, lastSunoProxyUrl || audioUrl);
      await cacheGeneratedAudio(lastSunoProxyUrl || audioUrl);
      if (els.btnLoadFull) els.btnLoadFull.disabled = false;
    }
    const audioUrl2 = second?.audioUrl || second?.audio_url || second?.streamAudioUrl || second?.stream_audio_url || "";
    const imageUrl2 = second?.imageUrl || second?.image_url || second?.coverUrl || second?.cover_url || null;
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
      lastSunoTitle2 = String(title2 || "").trim() || "Generated song B";
      await cacheGeneratedAudio2(lastSunoProxyUrl2 || audioUrl2);
    }
    return { status, hasAudio: Boolean(lastSunoFullUrl || audioUrl) };
  };

  const startGeneratePolling = () => {
    if (generatePollTimer) clearInterval(generatePollTimer);
    let tries = 0;
    const maxTries = 80; // ~6 minutes at 4.5s interval
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
          els.btnSunoStems.disabled = !(sunoAudioId);
          if (els.btnSunoMultiStems) els.btnSunoMultiStems.disabled = !(sunoAudioId);
          setStatus("Song is ready. Press Play full.");
          setGenerateFieldsLocked(false);
          setLoading(false);
          return;
        }
        if (state.status === "FAILED") {
          clearInterval(generatePollTimer);
          generatePollTimer = null;
          setGenerateBtn("Generate song", false, "generate");
          setStatus("Generation failed. Please try again.");
          setGenerateFieldsLocked(false);
          setLoading(false);
        }
        if (tries >= maxTries) {
          clearInterval(generatePollTimer);
          generatePollTimer = null;
          setGenerateBtn("Generate song", false, "generate");
          setStatus("Generation is taking longer than expected. Please try again.");
          setGenerateFieldsLocked(false);
          setLoading(false);
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

  const HIDDEN_NEGATIVE_PROMPT =
    "Avoid off-beat phrasing, clipped words, unstable groove, and spoken meta text. Respect user line breaks and phrase boundaries.";
  const HIDDEN_PROSODY_GUARDRAILS =
    "Follow-prompt behavior: keep user structure and mood first; preserve sentence cuts as singable phrases; use expressive timing when style implies romantic/ballad; avoid forcing fast percussion unless requested.";

  els.btnSunoGenerate.addEventListener("click", async () => {
    haptic("impact");
    const promptText = String(els.sunoPrompt?.value || "").trim();
    const vocalRefFile = getVocalReferenceFile();
    let referenceMode = String(els.sunoReferenceMode?.value || "none");
    const hasUploadedReference = Boolean(vocalRefFile);
    if (hasUploadedReference && referenceMode === "none") referenceMode = "vocal_full";
    const hasReference = referenceMode !== "none";
    if (hasReference && !vocalRefFile) {
      window.alert("Please upload or record audio reference first.");
      return;
    }
    if (!promptText && !vocalRefFile) {
      window.alert("Please write lyrics first before generating.");
      return;
    }
    try {
      const engine = "gemini_assisted";
      const modeLabel = hasReference ? `Reference: ${referenceMode}` : "Normal";
      const engineLabel = "Suno + Gemini lyrics assist";
      setGenerateBtn("Generating…", true, "generate");
      setGenerateFieldsLocked(true);
      showResultCard(false);
      els.btnSunoStems.disabled = true;
      if (els.btnSunoMultiStems) els.btnSunoMultiStems.disabled = true;
      setStatus(`Submitting generation… (Mode: ${modeLabel} | Engine: ${engineLabel})`);
      setProgress(5);
      setLoading(true, { title: "Generating song with AI…", sub: "This can take 30–120 seconds." });

      applyMaqamToStyleInput();
      const userPrompt = (els.sunoPrompt?.value || "").trim();
      const userStyle = (els.sunoStyle?.value || "").trim();
      const dialect = String(els.sunoDialect?.value || "").trim();
      const dialectHint = String(els.sunoDialectHint?.value || "").trim();
      const timing = String(els.sunoTiming?.value || "").trim();
      const timingClause = timing
        ? `Timing lock: ${timing}. Keep this timing stable across all sections and vocal entries.`
        : "Timing lock: keep stable tempo and aligned vocal phrasing throughout the song.";
      let finalPrompt = userPrompt;
      if (!hasReference) {
        try {
          setStatus("Preparing prompt with Gemini… (Engine: Gemini assisted + Suno render)");
          const rr = await fetch(apiUrl("/api/lyrics"), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ seed: userPrompt, style: userStyle, mode: "arrange", dialect, dialectHint }),
          });
          const dd = await rr.json().catch(() => ({}));
          if (rr.ok && dd?.lyrics) finalPrompt = String(dd.lyrics).trim();
        } catch {}
      }
      const payload = {
        prompt: `${finalPrompt}\n\n[Internal rhythm/prosody rules]\n${timingClause}\n${HIDDEN_PROSODY_GUARDRAILS}\n${HIDDEN_NEGATIVE_PROMPT}`,
        style: `${userStyle}${userStyle ? " | " : ""}${dialect ? `Dialect: ${dialect}, ` : ""}${dialectHint ? `Hint: ${dialectHint}, ` : ""}${timing ? `${timing}, ` : ""}`,
        songKey: mapSolfegeToLetterKey((els.sunoSongKey?.value || "").trim()),
        title: (els.sunoTitle?.value || "").trim(),
        customMode: true,
        instrumental: false,
        model: LATEST_SUNO_MODEL,
        personaId: (els.sunoPersonaId?.value || "").trim() || undefined,
      };
      const vp = String(els.sunoVoiceProfile?.value || "").trim();
      if (vp.includes("|")) {
        const [gender, timbre] = vp.split("|");
        payload.vocalGender = gender || undefined;
        payload.voiceTimbre = timbre || undefined;
      }
      lastGenerationMeta = {
        engine,
        mode: modeLabel,
        lyricsInput: userPrompt,
        finalPrompt,
        styleInput: userStyle,
        styleSent: payload.style,
        dialect,
        dialectHint,
        timing,
        songKey: (els.sunoSongKey?.value || "").trim(),
        maqam: (els.sunoMaqam?.value || "").trim(),
        voiceProfile: (els.sunoVoiceProfile?.value || "").trim(),
        model: payload.model,
      };
      const data = await trackCreditsAround(
        hasReference ? `Suno: generate from ${referenceMode} reference` : "Suno: generate song",
        async () => {
          let r;
          if (hasReference && vocalRefFile) {
            const fd = new FormData();
            fd.set("action", "add_instrumental");
            fd.set("referenceMode", referenceMode);
            fd.set("file", vocalRefFile, vocalRefFile.name || "vocal-reference.webm");
            fd.set("fileName", vocalRefFile.name || "vocal-reference.webm");
            fd.set("fileType", vocalRefFile.type || "audio/webm");
            fd.set("style", payload.style || "");
            fd.set("prompt", finalPrompt || "");
            fd.set("title", payload.title || "");
            fd.set("model", payload.model || "V4_5ALL");
            fd.set("vocalGender", payload.vocalGender || "");
            fd.set("voiceTimbre", payload.voiceTimbre || "");
            fd.set("songKey", payload.songKey || "");
            fd.set("timing", timing || "");
            fd.set("dialect", dialect || "");
            fd.set("dialectHint", dialectHint || "");
            fd.set("personaId", payload.personaId || "");
            r = await fetch(apiUrl("/api/suno/stems"), {
              method: "POST",
              body: fd,
            });
            const refErr = await r.clone().json().catch(() => ({}));
            if (!r.ok) {
              const reason = refErr?.error || refErr?.details?.error || "Reference generation failed";
              throw new Error(reason);
            }
          } else {
            r = await fetch(apiUrl("/api/suno/generate"), {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payload),
            });
          }
          const d = await r.json().catch(() => ({}));
          if (!r.ok) {
            const more = d?.detailMessage || d?.details?.message || d?.details?.error || "";
            throw new Error(`${d?.error || "Suno generate failed"}${more ? `: ${more}` : ""}`);
          }
          return d;
        },
        payload?.model ? `model=${payload.model}` : ""
      );

      sunoTaskId = extractTaskIdLoose(data);
      sunoAudioId = null;
      sunoStemsTaskId = null;
      sunoMultiStemsTaskId = null;
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
          setGenerateBtn("Regenerate", false, "regenerate");
          setGenerateFieldsLocked(false);
          setLoading(false);
          setProgress(100);
          showResultCard(true);
          void refreshSunoCredits();
          return;
        }
        setStatus(
          `Generation failed to start: provider returned no task id.`
        );
        setGenerateBtn("Generate song", false, "generate");
        setGenerateFieldsLocked(false);
        setLoading(false);
        setProgress(0);
        return;
      }
      setStatus(
        hasReference
          ? `Generating from your audio reference… (Mode: ${referenceMode} | Engine: ${engineLabel})`
          : `Generating… we will update automatically. (Mode: Normal | Engine: ${engineLabel})`
      );
      setGenerateBtn("Generating…", true, "generate");
      startGeneratePolling();
      setProgress(0);
    } catch (e) {
      console.error(e);
      setStatus(`Generation failed: ${e?.message || String(e)}`);
      setGenerateBtn("Generate song", false, "generate");
      setGenerateFieldsLocked(false);
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
      await playOnPlayerPage(url && url !== "#" ? url : "", "Full song");
    });
  }
  if (els.btnResultPlay2) {
    els.btnResultPlay2.addEventListener("click", async () => {
      haptic("light");
      const url = lastSunoCachedUrl2 || lastSunoProxyUrl2 || lastSunoFullUrl2;
      await playOnPlayerPage(url && url !== "#" ? url : "", "Full song B");
    });
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
  const hasInput = Boolean(String(els.sunoPrompt?.value || "").trim() || String(els.sunoStyle?.value || "").trim());
  const generating = Boolean(els.btnSunoGenerate?.disabled);
  const hasResult = (els.resultCard?.style.display || "none") !== "none";
  const visible = route === "generate" && hasInput && !generating && !hasResult;
  els.btnGenerateOrb.style.display = visible ? "inline-flex" : "none";
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
renderLibrary();
renderHub();
void (async () => {
  await loadPublicConfig();
  await refreshHubFromSupabase();
})();
if (els.hubFilterLatest) els.hubFilterLatest.addEventListener("click", () => { hubFilter = "latest"; markHubCategorySeen("latest"); renderHub(); });
if (els.hubFilterSelect) {
  els.hubFilterSelect.value = "latest";
  els.hubFilterSelect.addEventListener("change", () => {
    hubFilter = String(els.hubFilterSelect?.value || "latest");
    markHubCategorySeen(hubFilter);
    renderHub();
  });
}
if (els.hubAddDemo) {
  els.hubAddDemo.addEventListener("click", async () => {
    const p = makeDemoHubPost();
    const feed = loadHubFeed();
    feed.unshift(p);
    saveHubFeed(feed.slice(0, 200));
    lastHubUpdateAt = feed.length ? Math.max(...feed.map((x) => Number(x.ts || 0))) : Number(p.ts || 0);
    try {
      await supabaseInsertHub(p);
      setStatus("Demo post added to Hub.");
      await refreshHubFromSupabase();
    } catch {
      setStatus("Demo post added locally (Supabase sync failed).");
      renderHub();
    }
    // Force one more pull so iPhone view reflects latest cloud state immediately.
    setTimeout(() => { void refreshHubFromSupabase(); }, 350);
  });
}
if (els.hubTabLink) {
  let hubTapAt = 0;
  let hubTapCount = 0;
  let hubSingleTimer = null;
  els.hubTabLink.addEventListener("click", (e) => {
    const onHub = (document.body.getAttribute("data-route") || "") === "hub";
    if (!onHub) return;
    e.preventDefault();
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
      } else {
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
      hubTapCount = 0;
    }, 250);
  });
}
if (els.hubNowClose) {
  els.hubNowClose.addEventListener("click", () => {
    try { if (hubAudio) hubAudio.pause(); } catch {}
    hubAudio = null;
    hubAudioPostId = null;
    hubNowMeta = null;
    if (els.hubNowProgBar) els.hubNowProgBar.style.width = "0%";
    renderHubNowPlaying();
    document.querySelectorAll("[data-hub-play]").forEach((btn) => { btn.textContent = "▶"; });
    document.querySelectorAll(".hubPlayProgress > span").forEach((bar) => { bar.style.width = "0%"; });
    document.querySelectorAll(".hubCoverWrap").forEach((w) => w.classList.remove("isPlaying"));
  });
}
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
if (els.btnPlayerBack) {
  els.btnPlayerBack.addEventListener("click", () => {
    history.back();
  });
}
if (els.playerVol) {
  els.playerVol.addEventListener("input", () => {
    const a = ensurePlayer();
    a.volume = clampNum(Number(els.playerVol.value), 0, 1);
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

if (els.btnBetaTopup) {
  els.btnBetaTopup.addEventListener("click", () => openBilling());
}
if (els.btnOpenBilling) {
  els.btnOpenBilling.addEventListener("click", () => openBilling());
}
if (els.btnOpenAdvancedSheet && els.advancedSheet) {
  els.btnOpenAdvancedSheet.addEventListener("click", () => {
    els.advancedSheet.open = true;
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
  els.btnProfileSave.addEventListener("click", () => {
    const usernameRaw = String(els.profileUsername?.value || "").trim().toLowerCase();
    const username = usernameRaw.replace(/[^a-z0-9_.]/g, "").slice(0, 32) || "guest";
    const email = String(els.profileEmail?.value || "").trim().toLowerCase();
    const gender = String(els.profileGender?.value || "").trim();
    const voiceTimbre = String(els.profileVoiceTimbre?.value || "").trim();
    const bio = String(els.profileBio?.value || "").trim().slice(0, 280);
    const avatar = String(els.profileAvatar?.value || "").trim();
    const genres = String(els.profileGenres?.value || "").trim();
    const instagram = String(els.profileInstagram?.value || "").trim();
    const youtube = String(els.profileYouTube?.value || "").trim();
    const tiktok = String(els.profileTikTok?.value || "").trim();
    const isPublic = Boolean(els.profileIsPublic?.checked);
    const id = email || `user:${username}`;
    saveProfile({
      id,
      username,
      email,
      gender,
      voiceTimbre,
      bio,
      avatar,
      genres,
      links: { instagram, youtube, tiktok },
      isPublic,
    });
  renderLibrary();
  renderPersonaSelect();
    setStatus(`Profile saved: @${username}`);
    if (els.profileSavedMsg) {
      els.profileSavedMsg.style.display = "";
      const publicLabel = isPublic ? "Public" : "Private";
      els.profileSavedMsg.textContent = `Saved as @${username}${email ? ` (${email})` : ""} • ${publicLabel}`;
      setTimeout(() => {
        if (els.profileSavedMsg) els.profileSavedMsg.style.display = "none";
      }, 2200);
    }
    renderProfilePreviewFromInputs();
  });
}
if (els.profileAvatarFile) {
  els.profileAvatarFile.addEventListener("change", () => {
    const f = els.profileAvatarFile?.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (els.profileAvatar) els.profileAvatar.value = String(reader.result || "");
      renderProfilePreviewFromInputs();
    };
    reader.readAsDataURL(f);
  });
}
[
  els.profileUsername,
  els.profileEmail,
  els.profileGender,
  els.profileVoiceTimbre,
  els.profileBio,
  els.profileAvatar,
  els.profileGenres,
  els.profileInstagram,
  els.profileYouTube,
  els.profileTikTok,
  els.profileIsPublic,
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
if (els.profileUsername) els.profileUsername.value = activeProfile.username || "";
if (els.profileEmail) els.profileEmail.value = activeProfile.email || "";
if (els.profileGender) els.profileGender.value = activeProfile.gender || "";
if (els.profileVoiceTimbre) els.profileVoiceTimbre.value = activeProfile.voiceTimbre || "";
if (els.profileBio) els.profileBio.value = activeProfile.bio || "";
if (els.profileAvatar) els.profileAvatar.value = activeProfile.avatar || "";
if (els.profileGenres) els.profileGenres.value = activeProfile.genres || "";
if (els.profileInstagram) els.profileInstagram.value = activeProfile.links?.instagram || "";
if (els.profileYouTube) els.profileYouTube.value = activeProfile.links?.youtube || "";
if (els.profileTikTok) els.profileTikTok.value = activeProfile.links?.tiktok || "";
if (els.profileIsPublic) els.profileIsPublic.checked = activeProfile.isPublic !== false;
renderProfilePreviewFromInputs();

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
