import { generateArrangement, randomizeParams } from "./arrangement.js";
import { renderArrangementToWav } from "./render.js";
import { recordHumToMelody } from "./melody/extract.js";
import { mixStemsToWav } from "./studio/mixer.js";
import { encodeWav16 } from "./wav.js";
import { initMentor, resetMentorSession } from "./mentor.js";
import {
  clearLockScreenNowPlaying,
  initLockScreenNowPlaying,
  syncLockScreenNowPlaying,
} from "./lockScreenNowPlaying.js";

// Bumped on every deploy so we can verify, on-device, which JS version is live.
// Surfaces in the page footer (always visible) and Settings → Environment.
const APP_BUILD = "20260515userPublicDiscoverRows";

/** When false: no `hub_posts` traffic (saves Supabase egress), no Hub tab,
 *  `#/hub` redirects to Create, publish/share to Hub is disabled. */
const HUB_FEATURE_ENABLED = false;

(() => {
  const f = document.getElementById("footerBuild");
  if (f) f.textContent = `Build ${APP_BUILD}`;
})();

/** UUID allowlist from `/api/public-config` (env `NABAD_CERTIFIED_USER_IDS`)
 *  — interim gate for the Profile "Verified Nabad Creator" badge until
 *  `profiles.sound_certified` is live in Supabase. */
let _nabadCertifiedUserIds = new Set();

/** When true, `#/u/…` shows the verified check for every resolved profile (staging / admin preview).
 *  Set to `false` once `sound_certified` + `NABAD_CERTIFIED_USER_IDS` are enough on their own. */
const INTERIM_ALWAYS_SHOW_PUBLIC_PROFILE_VERIFIED = true;

/**
 * Capacitor only wires native plugins after JS calls registerPlugin().
 * Our app has no bundle step that imports @capacitor/browser — without this,
 * Plugins.Browser is missing and Google OAuth never opens on iOS.
 * Web stubs mirror the official plugins (safe no-ops / window.open).
 */
(() => {
  try {
    const cap = typeof window !== "undefined" ? window.Capacitor : null;
    if (!cap?.registerPlugin) return;
    if (!cap.Plugins?.Browser) {
      cap.registerPlugin("Browser", {
        web: () => ({
          async open(options) {
            const url = options?.url;
            if (url) window.open(url, options?.windowName || "_blank");
          },
          async close() {},
        }),
      });
    }
    if (!cap.Plugins?.App) {
      cap.registerPlugin("App", {
        web: () => ({
          async addListener() {
            return { remove: async () => {} };
          },
          async removeAllListeners() {},
        }),
      });
    }
    if (!cap.Plugins?.NowPlaying) {
      cap.registerPlugin("NowPlaying", {
        web: () => ({
          async update() {},
          async clear() {},
          async addListener() {
            return { remove: async () => {} };
          },
        }),
      });
    }
  } catch {
    /* Already registered elsewhere */
  }
})();

initLockScreenNowPlaying({
  getAudio: () => {
    const hub = hubAudio && !hubAudio.paused && !hubAudio.ended;
    const lib = playerEl && !playerEl.paused && !playerEl.ended;
    if (hub && !lib) return hubAudio;
    if (lib && !hub) return playerEl;
    if (hub && lib) {
      try {
        if ((hubAudio.currentTime || 0) >= (playerEl.currentTime || 0)) return hubAudio;
      } catch {}
      return playerEl;
    }
    return hubAudio || playerEl || null;
  },
  getMeta: () => hubNowMeta,
  getDuration: (audio) => {
    try {
      return getAudioDuration(audio);
    } catch {
      return Number(audio?.duration) || 0;
    }
  },
  onPlay: () => {
    const a = getMiniPlayerAudio() || hubAudio || playerEl;
    if (a) void a.play();
    try {
      renderHubNowPlaying();
    } catch {}
    syncLockScreenNowPlaying({ force: true });
  },
  onPause: () => {
    const a = getMiniPlayerAudio() || hubAudio || playerEl;
    if (a) a.pause();
    try {
      renderHubNowPlaying();
    } catch {}
    syncLockScreenNowPlaying({ force: true });
  },
  onToggle: () => {
    const a = getMiniPlayerAudio() || hubAudio || playerEl;
    if (!a) return;
    if (a.paused || a.ended) void a.play();
    else a.pause();
    try {
      renderHubNowPlaying();
    } catch {}
    syncLockScreenNowPlaying({ force: true });
  },
  onNext: () => {
    if (miniSource?.type === "discover_feed" && _discoveryFeedTracks?.length) {
      void playRandomDiscoveryFeedTrack(currentPlayerTrackRef?.url);
      return;
    }
    if (miniSource?.type === "public_profile_lib" && _userPublicFeedTracks?.length) {
      void playRandomUserPublicFeedTrack(currentPlayerTrackRef?.url);
    }
  },
});

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
  vocalRefActiveStrip: document.getElementById("vocalRefActiveStrip"),
  vocalRefActiveName: document.getElementById("vocalRefActiveName"),
  vocalRefActiveMeta: document.getElementById("vocalRefActiveMeta"),
  btnClearVocalRef: document.getElementById("btnClearVocalRef"),
  vocalRefHint: document.getElementById("vocalRefHint"),
  remixSourceBanner: document.getElementById("remixSourceBanner"),
  remixSourceCover: document.getElementById("remixSourceCover"),
  remixSourceTitle: document.getElementById("remixSourceTitle"),
  remixSourceSub: document.getElementById("remixSourceSub"),
  remixSourceCancel: document.getElementById("remixSourceCancel"),
  personaActiveBanner: document.getElementById("personaActiveBanner"),
  personaActiveBannerLabel: document.getElementById("personaActiveBannerLabel"),
  personaActiveBannerChange: document.getElementById("personaActiveBannerChange"),
  personaActiveBannerClear: document.getElementById("personaActiveBannerClear"),
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
  vocalRecorderModal: document.getElementById("vocalRecorderModal"),
  vocalRecorderBackdrop: document.getElementById("vocalRecorderBackdrop"),
  btnCloseVocalRecorder: document.getElementById("btnCloseVocalRecorder"),
  btnRecorderToggle: document.getElementById("btnRecorderToggle"),
  btnRecorderUse: document.getElementById("btnRecorderUse"),
  recorderStatus: document.getElementById("recorderStatus"),
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
  profilePersonaRow: document.getElementById("profilePersonaRow"),
  profilePersonaLabel: document.getElementById("profilePersonaLabel"),
  profilePersonaToggle: document.getElementById("profilePersonaToggle"),
  profilePersonaDetails: document.getElementById("profilePersonaDetails"),
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
  btnLoadingDismiss: document.getElementById("btnLoadingDismiss"),

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
  libraryRecoverBanner: document.getElementById("libraryRecoverBanner"),
  libraryRecoverHint: document.getElementById("libraryRecoverHint"),
  btnLibraryRecover: document.getElementById("btnLibraryRecover"),
  btnLibraryRecoverById: document.getElementById("btnLibraryRecoverById"),
  btnLibraryRecoverDismiss: document.getElementById("btnLibraryRecoverDismiss"),
  btnLibraryRecoverLink: document.getElementById("btnLibraryRecoverLink"),
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
  hubBrand: document.getElementById("hubBrand"),
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
  hubNowSubtitle: document.getElementById("hubNowSubtitle"),
  hubNowProgBar: document.getElementById("hubNowProgBar"),
  hubNowPlayPause: document.getElementById("hubNowPlayPause"),
  hubNowExpand: document.getElementById("hubNowExpand"),
  hubNowClose: document.getElementById("hubNowClose"),
  likeBurst: document.getElementById("likeBurst"),
  toast: document.getElementById("toast"),
  hubAddDemo: document.getElementById("hubAddDemo"),
  profilePreviewUsernameInput: document.getElementById("profilePreviewUsernameInput"),
  profileUsernamePrompt: document.getElementById("profileUsernamePrompt"),
  profilePreviewTimbreInput: document.getElementById("profilePreviewTimbreInput"),
  profilePreviewBioInput: document.getElementById("profilePreviewBioInput"),
  profileAvatarFile: document.getElementById("profileAvatarFile"),
  profileIsPublic: document.getElementById("profileIsPublic"),
  btnProfileSave: document.getElementById("btnProfileSave"),
  btnProfileEdit: document.getElementById("btnProfileEdit"),
  profileEditActions: document.getElementById("profileEditActions"),
  btnProfileCancel: document.getElementById("btnProfileCancel"),
  profileOwnStats: document.getElementById("profileOwnStats"),
  profileOwnSongCount: document.getElementById("profileOwnSongCount"),
  profileAura: document.getElementById("profileAura"),
  profileAuraAvatarWrap: document.getElementById("profileAuraAvatarWrap"),
  profileAuraStatSongs: document.getElementById("profileAuraStatSongs"),
  profileAuraStatLikes: document.getElementById("profileAuraStatLikes"),
  profileAuraSongsValue: document.getElementById("profileAuraSongsValue"),
  profileAuraLikesValue: document.getElementById("profileAuraLikesValue"),
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
  // Liquid pulse redesign nodes
  profileAuraTopRow: document.getElementById("profileAuraTopRow"),
  profileAuraNameRow: document.getElementById("profileAuraNameRow"),
  profileNabadCertBadge: document.getElementById("profileNabadCertBadge"),
  profileNabadCertCheck: document.getElementById("profileNabadCertCheck"),
  profileVoiceTimbreInline: document.getElementById("profileVoiceTimbreInline"),
  profileVoiceTimbreInlineLabel: document.getElementById("profileVoiceTimbreInlineLabel"),
  profileIdentityLine: document.getElementById("profileIdentityLine"),
  profileHeroBio: document.getElementById("profileHeroBio"),
  // Spotify-x-Nabad redesign nodes
  profileActionRow: document.getElementById("profileActionRow"),
  profileActionShare: document.getElementById("profileActionShare"),
  profileShareToast: document.getElementById("profileShareToast"),
  btnProfileShareIcon: document.getElementById("btnProfileShareIcon"),
  profileTopWeek: document.getElementById("profileTopWeek"),
  profileTopWeekList: document.getElementById("profileTopWeekList"),
  profileAboutCard: document.getElementById("profileAboutCard"),
  profileAboutText: document.getElementById("profileAboutText"),
  profileAboutMeta: document.getElementById("profileAboutMeta"),
  profileAuraStatsInline: document.getElementById("profileAuraStatsInline"),
  profileStatsPills: document.getElementById("profileStatsPills"),
  profileStatPillSongsValue: document.getElementById("profileStatPillSongsValue"),
  profileStatPillPublicValue: document.getElementById("profileStatPillPublicValue"),
  profileStatPillLikesValue: document.getElementById("profileStatPillLikesValue"),
  profileAuraStatLine: document.getElementById("profileAuraStatLine"),
  profilePersonaInlineChip: document.getElementById("profilePersonaInlineChip"),
  userPublicAvatar: document.getElementById("userPublicAvatar"),
  userPublicName: document.getElementById("userPublicName"),
  userPublicVerified: document.getElementById("userPublicVerified"),
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
  callingCardModal: document.getElementById("callingCardModal"),
  callingCardBackdrop: document.getElementById("callingCardBackdrop"),
  btnCloseCallingCard: document.getElementById("btnCloseCallingCard"),
  callingCardLead: document.getElementById("callingCardLead"),
  callingCardRingWrap: document.getElementById("callingCardRingWrap"),
  callingCardRingFill: document.getElementById("callingCardRingFill"),
  btnCallingCardToggle: document.getElementById("btnCallingCardToggle"),
  callingCardStatus: document.getElementById("callingCardStatus"),
  callingCardWaveBar: document.getElementById("callingCardWaveBar"),
  callingCardPreview: document.getElementById("callingCardPreview"),
  btnCallingCardSave: document.getElementById("btnCallingCardSave"),
  btnCallingCardDiscard: document.getElementById("btnCallingCardDiscard"),
  btnCallingCardDelete: document.getElementById("btnCallingCardDelete"),
  profileAuraVoiceChipSlot: document.getElementById("profileAuraVoiceChipSlot"),
  profilePreviewVoiceChipBtn: document.getElementById("profilePreviewVoiceChipBtn"),
  userPublicCallingCardAudio: document.getElementById("userPublicCallingCardAudio"),
  settingsCallingCardAutoplay: document.getElementById("settingsCallingCardAutoplay"),
  shareLiveModal: document.getElementById("shareLiveModal"),
  shareLiveBackdrop: document.getElementById("shareLiveBackdrop"),
  btnCloseShareLive: document.getElementById("btnCloseShareLive"),
  btnGoHub: document.getElementById("btnGoHub"),
  shareLiveText: document.getElementById("shareLiveText"),
  proofModal: document.getElementById("proofModal"),
  proofBackdrop: document.getElementById("proofBackdrop"),
  btnCloseProof: document.getElementById("btnCloseProof"),
  btnDownloadProof: document.getElementById("btnDownloadProof"),
  btnProofShareImg: document.getElementById("btnProofShareImg"),
  btnProofCopyFp: document.getElementById("btnProofCopyFp"),
  proofCertificateCapture: document.getElementById("proofCertificateCapture"),
  proofCertCoverImg: document.getElementById("proofCertCoverImg"),
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

/** iOS/Safari allow programmatic audio only after a user gesture. We
 * install a single capture-phase listener at boot that fires on the
 * very first tap *anywhere* in the app — including the Hub tab tap
 * itself — and runs `audio.play()` synchronously inside that gesture
 * with a tiny silent data URL. That's the only thing iOS reliably
 * accepts as an audio unlock. After that, scroll-driven autoplay can
 * start any post programmatically. The session flag is set after the
 * unlock succeeds so we don't re-arm the listener. */
const HUB_AUDIO_UNLOCK_KEY = "mas:hub:audioUnlock:v1";
// 0.05s of silence as a data URL — enough for iOS to satisfy "play()
// was called inside a gesture and produced sound" without the user
// hearing anything.
const HUB_AUDIO_SILENT_SRC =
  "data:audio/mp3;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU3LjgzLjEwMAAAAAAAAAAAAAAA//tQwAAAAAAAAAAAAAAAAAAAAAAASW5mbwAAAA8AAAACAAACcQCqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqv////////////////////////////////////////////////////////////////8AAAAATGF2YzU3LjEwAAAAAAAAAAAAAAAAJAAAAAAAAAAAAnFGn7hjAAAAAAAAAAAAAAAAAAAAAP/7kGQAD/AAAGkAAAAIAAANIAAAAQAAAaQAAAAgAAA0gAAABExBTUUzLjEwMFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVU=";
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

/** Prime a single <audio> element inside a user gesture so iOS will
 *  let us play() it later from a non-gesture context (e.g. after an
 *  async network fetch). We do this by calling play() with a silent
 *  muted data URL, then immediately pausing and clearing the src so
 *  the element is ready to receive a real source.
 *
 *  This is the only thing iOS Safari reliably accepts as an "audio
 *  unlock". It must happen synchronously inside the gesture handler.
 */
function primeAudioElementInGesture(a) {
  if (!a) return;
  try {
    a.muted = true;
    const prevSrc = a.src;
    a.src = HUB_AUDIO_SILENT_SRC;
    const p = a.play();
    const cleanup = () => {
      try { a.pause(); } catch {}
      try { a.muted = false; } catch {}
      try {
        if (a.src && a.src.startsWith("data:")) {
          a.removeAttribute("src");
          a.load();
        } else if (prevSrc) {
          a.src = prevSrc;
        }
      } catch {}
    };
    if (p && typeof p.then === "function") {
      p.then(cleanup).catch(() => { try { a.muted = false; } catch {} });
    } else {
      cleanup();
    }
  } catch {}
}

let _hubAudioUnlockArmed = false;
function installHubAudioUnlockOnce() {
  if (_hubAudioUnlockArmed) return;
  if (getHubAudioUnlocked()) return;
  _hubAudioUnlockArmed = true;
  const handler = () => {
    // Prime ALL audio elements that may need to autoplay later in
    // this session. iOS Safari unlocks autoplay per-element, not
    // per-document, so unlocking only the Hub element wasn't enough
    // for the calling card on guest profile visits — by the time we
    // finished fetching the card URL, the gesture was stale and
    // play() was rejected silently.
    //
    // The calling card is the most affected because its play() is
    // gated behind an async fetch. The Hub player is also primed
    // (was always primed). The Library player is intentionally NOT
    // primed here — it always plays from a direct user tap so the
    // gesture is never stale.
    primeAudioElementInGesture(ensureHubAudio());
    try {
      const cardAudio = els.userPublicCallingCardAudio;
      if (cardAudio) primeAudioElementInGesture(cardAudio);
    } catch {}
    setHubAudioUnlocked();
    updateHubAudioHint();
    document.removeEventListener("touchstart", handler, true);
    document.removeEventListener("click", handler, true);
  };
  document.addEventListener("touchstart", handler, { capture: true, passive: true, once: true });
  document.addEventListener("click", handler, { capture: true, once: true });
}
installHubAudioUnlockOnce();

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
// VISUAL focus is a separate path (`updateHubFocusedRow`) that runs on
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

/** Memoize the dominant tint we sample from each Hub post's cover so
 *  switching back to a previously-focused row is instant. The focused
 *  card's border/background/shadow read from CSS vars set per row
 *  (`--hub-cover-rgb`); we fall back to a neutral slate when we
 *  can't sample (CORS, decode error, fully grey cover). */
const _hubCoverColorCache = new Map();
function _hubColorIsGrey(r, g, b) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  return max - min < 24;
}
function sampleHubCoverColor(src) {
  if (!src) return Promise.resolve(null);
  if (_hubCoverColorCache.has(src)) {
    return Promise.resolve(_hubCoverColorCache.get(src));
  }
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.decoding = "async";
    img.referrerPolicy = "no-referrer";
    let done = false;
    const finish = (rgb) => {
      if (done) return;
      done = true;
      _hubCoverColorCache.set(src, rgb);
      resolve(rgb);
    };
    img.onload = () => {
      try {
        const w = 24, h = 24;
        const c = document.createElement("canvas");
        c.width = w; c.height = h;
        const ctx = c.getContext("2d", { willReadFrequently: true });
        if (!ctx) return finish(null);
        ctx.drawImage(img, 0, 0, w, h);
        const data = ctx.getImageData(0, 0, w, h).data;
        let r = 0, g = 0, b = 0, n = 0;
        for (let i = 0; i < data.length; i += 4) {
          const cr = data[i], cg = data[i + 1], cb = data[i + 2], ca = data[i + 3];
          if (ca < 200) continue;
          if (_hubColorIsGrey(cr, cg, cb)) continue;
          r += cr; g += cg; b += cb; n += 1;
        }
        if (!n) {
          for (let i = 0; i < data.length; i += 4) {
            r += data[i]; g += data[i + 1]; b += data[i + 2]; n += 1;
          }
        }
        if (!n) return finish(null);
        r = Math.round(r / n);
        g = Math.round(g / n);
        b = Math.round(b / n);
        const max = Math.max(r, g, b) || 1;
        if (max < 140) {
          const boost = 165 / max;
          r = Math.min(255, Math.round(r * boost));
          g = Math.min(255, Math.round(g * boost));
          b = Math.min(255, Math.round(b * boost));
        }
        finish([r, g, b]);
      } catch {
        finish(null);
      }
    };
    img.onerror = () => finish(null);
    img.src = src;
  });
}
function applyHubRowCoverTint(rowEl, src) {
  if (!rowEl || !src) return;
  rowEl.setAttribute("data-cover-tinted", "pending");
  sampleHubCoverColor(src).then((rgb) => {
    if (!rgb) {
      rowEl.removeAttribute("data-cover-tinted");
      rowEl.style.removeProperty("--hub-cover-rgb");
      return;
    }
    rowEl.style.setProperty("--hub-cover-rgb", `${rgb[0]}, ${rgb[1]}, ${rgb[2]}`);
    rowEl.setAttribute("data-cover-tinted", "ready");
  });
}

/** Soft glow / progress accents tied to artwork (not brand purple). */
function applyCoverGlowRgb(el, src) {
  if (!el) return;
  const s = String(src || "").trim();
  if (!s || s.startsWith("data:") || /nabadai-logo\.png/i.test(s)) {
    try {
      el.style.removeProperty("--cover-glow-rgb");
    } catch {}
    return;
  }
  sampleHubCoverColor(s).then((rgb) => {
    try {
      if (!el.isConnected) return;
      if (!rgb) {
        el.style.removeProperty("--cover-glow-rgb");
        return;
      }
      el.style.setProperty("--cover-glow-rgb", `${rgb[0]}, ${rgb[1]}, ${rgb[2]}`);
    } catch {}
  });
}

function updateHubFocusedRow() {
  // Legacy path retained for any code that still calls it (mostly the
  // global scroll listeners). The Hub reel layout drives focus from
  // an IntersectionObserver inside `wireHubReelObserver()`; if a reel
  // has already been marked active, leave it alone.
  if ((document.body.getAttribute("data-route") || "") !== "hub") return;
  if (!els.hubList) return;
  if (els.hubList.querySelector(".hubReel.isActive")) return;
  const centerId = getHubRowClosestToViewportCenter();
  if (centerId === hubFocusedPostId) return;
  hubFocusedPostId = centerId;
  const root = els.hubList;
  root.querySelectorAll(".hubRow").forEach((r) => {
    const isActive = centerId && r.getAttribute("data-hub-row") === centerId;
    r.classList.toggle("isActive", Boolean(isActive));
    if (isActive && !r.getAttribute("data-cover-tinted")) {
      const cover = r.querySelector(".hubCover");
      const src = cover ? cover.getAttribute("src") : "";
      if (src) applyHubRowCoverTint(r, src);
    }
  });
}

/* =================================================================
 *  Hub reel — vertical scroll-snap, one post per viewport.
 *
 *  An IntersectionObserver scoped to #hubList tells us which reel
 *  panel is currently snapped. That callback:
 *    1. Toggles .isActive
 *    2. Samples the cover color into --hub-cover-rgb (per panel)
 *    3. Pauses any previously playing post
 *    4. Auto-plays the newly active post — gated by the same
 *       audio-unlock + suppress + muted-post safeguards used by the
 *       legacy viewport-center system, so iOS WKWebView behavior
 *       and "user tapped pause" semantics are preserved.
 * ================================================================= */
let _hubReelObserver = null;
let _hubReelPrefetchObserver = null;
/** Hub reel scrolls `#hubList`, not `window` — bind once so autoplay,
 *  focus updates, and deferred rebuilds see real `scrollTop`. */
let _hubListScrollBound = false;

/** Promote a single reel from `data-src` to real `src` so iOS WebKit
 *  fetches the cover. Idempotent and cheap. Also fills the backdrop
 *  CSS var so the blurred backplate paints on the same fetch (browser
 *  cache dedup — one Supabase egress per post no matter how many
 *  visual layers reference it). */
function hydrateHubReelCover(reelEl) {
  if (!reelEl || reelEl.getAttribute("data-cover-hydrated") === "1") return;
  const img = reelEl.querySelector(".hubReelCover");
  if (!img) return;
  const ds = img.getAttribute("data-src");
  if (ds && !img.getAttribute("src")) img.setAttribute("src", ds);
  if (ds) img.removeAttribute("data-src");
  const backdrop = reelEl.querySelector(".hubReelBackdrop");
  if (backdrop && !backdrop.style.getPropertyValue("--reel-bg")) {
    const url = reelEl.getAttribute("data-cover-url") || ds || img.getAttribute("src") || "";
    if (url) backdrop.style.setProperty("--reel-bg", `url('${url}')`);
  }
  reelEl.setAttribute("data-cover-hydrated", "1");
}

function tryHubReelAutoplay(activeId) {
  if (!activeId) return;
  if ((document.body.getAttribute("data-route") || "") !== "hub") return;
  if (Date.now() < hubSuppressViewportAutoplayUntil) return;
  if (!getHubAudioUnlocked()) return;
  if (hubAutoplayMutedPostId && activeId !== hubAutoplayMutedPostId) {
    hubAutoplayMutedPostId = null;
  }
  if (activeId === hubAutoplayMutedPostId) return;
  const feed = loadHubFeed();
  const p = feed.find((x) => x.id === activeId);
  if (!p?.url) return;
  if (hubAudioPostId === activeId) return;
  void startHubPlayback(activeId);
}

function wireHubReelObserver() {
  if (!els.hubList) return;
  if (_hubReelObserver) {
    try { _hubReelObserver.disconnect(); } catch {}
    _hubReelObserver = null;
  }
  if (_hubReelPrefetchObserver) {
    try { _hubReelPrefetchObserver.disconnect(); } catch {}
    _hubReelPrefetchObserver = null;
  }
  const reels = els.hubList.querySelectorAll(".hubReel");
  if (!reels.length) return;
  // Hydrate the first reel up-front so the cover is on the wire
  // before the user has a chance to swipe.
  if (reels[0]) hydrateHubReelCover(reels[0]);

  // Active-panel observer — drives `.isActive` + autoplay.
  _hubReelObserver = new IntersectionObserver((entries) => {
    if ((document.body.getAttribute("data-route") || "") !== "hub") return;
    let best = null;
    let bestRatio = 0;
    for (const e of entries) {
      if (e.intersectionRatio > bestRatio) {
        bestRatio = e.intersectionRatio;
        best = e.target;
      }
    }
    if (!best || bestRatio < 0.6) return;
    const id = best.getAttribute("data-hub-row");
    if (!id) return;
    // Smart-pick bookkeeping: a panel held >=60% viewport for the dwell
    // window counts as "seen". Re-scheduled every focus change so a
    // user scrolling fast past a post never marks it watched — they
    // must linger. The timer is cancelled by `scheduleMarkHubPostSeen`
    // when the focused id changes.
    scheduleMarkHubPostSeen(id);
    if (hubFocusedPostId === id) return;
    hubFocusedPostId = id;
    els.hubList.querySelectorAll(".hubReel").forEach((r) => {
      r.classList.toggle("isActive", r === best);
    });
    if (hubAudioPostId && hubAudioPostId !== id && hubAudio && !hubAudio.paused) {
      try { hubAudio.pause(); } catch {}
    }
    if (!best.getAttribute("data-cover-tinted")) {
      const cover = best.querySelector(".hubReelCover, .hubCover");
      const src = cover ? cover.getAttribute("src") : "";
      if (src) applyHubRowCoverTint(best, src);
    }
    tryHubReelAutoplay(id);
  }, { root: els.hubList, threshold: [0.6, 0.85] });
  reels.forEach((r) => _hubReelObserver.observe(r));

  // Prefetch observer — hydrates the cover ~one reel ahead of the
  // user's scroll so the next swipe lands on a ready image instead
  // of a blank tile. Works around iOS WebKit's flaky native
  // loading="lazy" inside internal-scroll snap containers.
  // 100% rootMargin = one full reel of lookahead in each direction,
  // so we only fetch covers the user is likely to see in the next
  // swipe (keeps Supabase egress proportional to engagement).
  _hubReelPrefetchObserver = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (e.isIntersecting) hydrateHubReelCover(e.target);
    }
  }, { root: els.hubList, rootMargin: "100% 0px 100% 0px", threshold: 0 });
  reels.forEach((r) => _hubReelPrefetchObserver.observe(r));

  if (els.hubList && !_hubListScrollBound) {
    _hubListScrollBound = true;
    const onHubListScroll = () => {
      if ((document.body.getAttribute("data-route") || "") !== "hub") return;
      scheduleHubFocusUpdate();
      scheduleHubViewportAutoplay();
      if (_hubDeferredRebuild && (els.hubList.scrollTop || 0) < 80) {
        _hubDeferredRebuild = false;
        renderHub();
      }
    };
    els.hubList.addEventListener("scroll", onHubListScroll, { passive: true });
    try {
      els.hubList.addEventListener("scrollend", () => {
        if ((document.body.getAttribute("data-route") || "") !== "hub") return;
        updateHubFocusedRow();
        flushHubViewportAutoplay();
        if (_hubDeferredRebuild && (els.hubList.scrollTop || 0) < 80) {
          _hubDeferredRebuild = false;
          renderHub();
        }
      }, { passive: true });
    } catch {
      /* scrollend not supported — 280ms debounce in scheduleHubViewportAutoplay suffices */
    }
  }
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

/** Track the in-flight play() promise on the shared Hub audio element.
 *  On iOS WKWebView, calling pause()+src=... while the previous play()
 *  is still pending makes the next play() reject with AbortError. Awaiting
 *  the prior promise (with a short timeout) removes that race entirely and
 *  fixes the "every-other-post fails" pattern.
 */
let _hubInflightPlay = null;

async function awaitWithTimeout(promise, ms) {
  if (!promise) return;
  let to;
  try {
    await Promise.race([
      promise.catch(() => {}),
      new Promise((r) => { to = setTimeout(r, ms); }),
    ]);
  } finally {
    if (to) clearTimeout(to);
  }
}

async function hubAudioPlayWithRetry(audio) {
  // Let any previous play() settle (either resolve or reject) before kicking
  // a new one off — otherwise the browser cancels the new request.
  await awaitWithTimeout(_hubInflightPlay, 250);
  _hubInflightPlay = null;

  const tryOnce = async () => {
    try {
      const p = audio.play();
      _hubInflightPlay = p;
      await p;
      _hubInflightPlay = null;
      return true;
    } catch {
      _hubInflightPlay = null;
      return false;
    }
  };

  if (await tryOnce()) return true;

  await new Promise((r) => setTimeout(r, 200));
  if (await tryOnce()) return true;

  // `load()` rewinds to 0:00 — only when the element has no decodable data
  // yet (fixes AbortError on iOS without restarting mid-song).
  const needsLoad =
    Boolean(audio.error) ||
    (typeof audio.readyState === "number" && audio.readyState < 2);
  if (needsLoad) {
    try {
      audio.load();
    } catch {}
    await new Promise((r) => setTimeout(r, 160));
    if (await tryOnce()) return true;
  }

  await new Promise((r) => setTimeout(r, 360));
  return tryOnce();
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
  // Aura header ring breathes whenever any audio is playing.
  a.addEventListener("play", () => { try { setProfileAuraAudioState(true); } catch {} });
  a.addEventListener("pause", () => { try { setProfileAuraAudioState(isAnyAppAudioPlaying()); } catch {} });
  a.addEventListener("ended", () => {
    // Stale-event guard: the previous src's ended can fire AFTER a new
    // startHubPlayback has already taken over the element. Without this,
    // it would pause the freshly-loaded new track and auto-skip to the
    // following row — exactly the "every-other-post fails" pattern on iOS.
    const elSeq = Number(a.dataset?.hubSeq || 0);
    if (elSeq !== hubPlaybackSeq) return;
    const endedPostId = hubAudioPostId;
    stopHubPlayback();
    onHubTrackEnded(endedPostId);
    try { setProfileAuraAudioState(isAnyAppAudioPlaying()); } catch {}
  });
  a.addEventListener("timeupdate", () => {
    const elSeq = Number(a.dataset?.hubSeq || 0);
    if (elSeq !== hubPlaybackSeq) return;
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
    const dur = getAudioDuration(a);
    if (!prog || !dur) return;
    const pct = Math.max(0, Math.min(100, (a.currentTime / dur) * 100));
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
  // second startHubPlayback for the same id.
  if (hubAudioPostId === centerId) return;
  void startHubPlayback(centerId);
}

/** Hub audio is bound to the Hub view only — there is no persistent
 *  mini-player surface that follows Hub posts across routes. Leaving
 *  Hub fully stops Hub playback (state + audio) so nothing keeps
 *  streaming silently in the background. Returning to Hub starts
 *  fresh from the viewport-centered row via the autoplay path.
 *
 *  Library / generated tracks still use the global mini-player; only
 *  Hub-source playback is killed here (guard on `miniSource.type`). */
function pauseHubForRouteChange() {
  if (miniSource?.type !== "hub" && !hubAudioPostId) return;
  try { stopHubPlayback(); } catch {}
}

/** Kept as a stable export for older call sites. Hub no longer
 *  resumes across route changes (see pauseHubForRouteChange) so this
 *  is now a no-op; returning to Hub re-triggers autoplay from the
 *  viewport-centered row. */
async function resumeHubAfterRouteChange() {}

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
    // NEVER write textContent on [data-hub-play] — the reel layout
    // makes the play button the cover container, so textContent would
    // delete the cover <img> and overlay sprites. Reset visuals via
    // the .isPlaying / .isLoading class flags only.
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
  void clearLockScreenNowPlaying();
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
  // Before changing src on iOS, settle the previous play() promise so it
  // can't abort the new one. pause() is best-effort; the awaitWithTimeout
  // in hubAudioPlayWithRetry is the real guarantee.
  try {
    a.pause();
  } catch {}
  await awaitWithTimeout(_hubInflightPlay, 220);
  _hubInflightPlay = null;
  // Pause anything that's playing on the *other* audio element — the
  // global player handles Library + generated tracks via `playerEl`,
  // and without this Hub + Library would play on top of each other.
  try {
    if (typeof playerEl !== "undefined" && playerEl && !playerEl.paused) {
      playerEl.pause();
    }
  } catch {}

  hubAudioPostId = postId;
  hubAudioCurrentPost = p;
  miniSource = { type: "hub", id: postId };
  hubNowMeta = {
    title: p.title || "Hub song",
    art: p.artUrl || p.creatorAvatar || "./assets/nabadai-logo.png",
    subtitle: String(p.creator || "").trim() ? `@${String(p.creator).trim()}` : "Hub",
  };

  // Reset all per-row visuals and mark the new active row. NEVER write
  // textContent on [data-hub-play] — the reel layout makes the play
  // button the cover container, so textContent would wipe the cover
  // <img> + overlay sprites. State is driven by the `.isPlaying` class.
  const root = els.hubList;
  if (root) {
    root.querySelectorAll(".hubCoverWrap").forEach((w) => w.classList.remove("isPlaying"));
  }
  const playBtn =
    root?.querySelector?.(`[data-hub-play="${postId}"]`) ||
    document.querySelector(`[data-hub-play="${postId}"]`);
  const coverWrap = playBtn?.closest?.(".hubCoverWrap")
    || document.querySelector(`.hubCoverWrap[data-hub-cover="${postId}"]`);
  coverWrap?.classList.add("isPlaying");
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

  const targetSrc = normalizeAudioUrlForPlayback(hubPlaybackSrcForPost(postId, p));
  if (!targetSrc) {
    coverWrap?.classList.remove("isLoading");
    stopHubPlayback();
    return;
  }
  resetAudioDurationHintForUrl(targetSrc);
  await primeAudioDurationHint(targetSrc);
  try {
    const wantAbs = new URL(targetSrc, location.href).href;
    const haveAbs = String(a.src || "").trim();
    if (haveAbs !== wantAbs) a.src = targetSrc;
  } catch {
    if (a.src !== targetSrc) a.src = targetSrc;
  }
  // Stamp the playback sequence onto the element so listeners can ignore
  // stale ended/timeupdate events from the previous src. Must happen AFTER
  // src is set and BEFORE play(), so the new fire-and-forget play() races
  // any leftover events with the correct seq attached.
  try { a.dataset.hubSeq = String(mySeq); } catch {}
  try {
    a.currentTime = 0;
  } catch {}
  if (isCapacitorNativeAuth()) {
    try {
      a.load();
    } catch {}
  }

  let ok = await hubAudioPlayWithRetry(a);
  if (mySeq !== hubPlaybackSeq) {
    // A newer call already owns the shared audio element. Bail without
    // touching it — pausing here would stomp on the new owner's load.
    return;
  }
  // First play() sometimes fails on iOS WKWebView when reusing one Audio().
  // Never pass an already-proxied URL back through toAudioProxyUrl — that
  // double-wraps and breaks every other track. Unwrap to the leaf CDN,
  // rebuild one canonical proxy URL, then retry. If still failing, load()+play.
  if (!ok && typeof targetSrc === "string" && !/^blob:|^data:/i.test(targetSrc)) {
    const leaf = unwrapInnermostHttpAudioUrl(targetSrc);
    let rebuilt = "";
    if (leaf && /^https?:\/\//i.test(leaf) && !leaf.toLowerCase().includes("api/suno/audio")) {
      rebuilt = normalizeAudioUrlForPlayback(toAudioProxyUrl(leaf));
    }
    if (rebuilt && rebuilt !== targetSrc) {
      try {
        a.src = rebuilt;
        a.currentTime = 0;
        if (isCapacitorNativeAuth()) try { a.load(); } catch {}
      } catch {}
      ok = await hubAudioPlayWithRetry(a);
      if (mySeq !== hubPlaybackSeq) return;
    }
    if (!ok && isCapacitorNativeAuth()) {
      try {
        a.load();
        ok = await hubAudioPlayWithRetry(a);
      } catch {}
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
  syncLockScreenNowPlaying({ force: true });
}

function syncHubNowAuraFromCoverUrl(artUrl) {
  const aura = document.getElementById("hubNowAura");
  if (!aura) return;
  const u = String(artUrl || "").trim();
  if (!u || u.startsWith("data:")) {
    aura.style.backgroundImage = "none";
    return;
  }
  try {
    aura.style.backgroundImage = `url("${u.replace(/\\/g, "/").replace(/"/g, "%22")}")`;
  } catch {
    aura.style.backgroundImage = "none";
  }
}

function syncHubNowPlayPauseUi(audible) {
  const btn = document.getElementById("hubNowPlayPause");
  if (!btn) return;
  const playing = Boolean(audible);
  btn.classList.toggle("isPlaying", playing);
  const pPause = btn.querySelector(".hubNowPPIco--pause");
  const pPlay = btn.querySelector(".hubNowPPIco--play");
  if (pPause) pPause.hidden = !playing;
  if (pPlay) pPlay.hidden = playing;
  btn.setAttribute("aria-label", playing ? "Pause" : "Play");
}

/** Audio element backing the bottom mini player (Discover uses `playerEl`). */
function getMiniPlayerAudio() {
  const t = miniSource?.type;
  if (
    t === "discover_feed" ||
    t === "public_profile_lib" ||
    t === "library" ||
    t === "profile_hub"
  ) {
    return ensurePlayer();
  }
  return hubAudio || ensurePlayer();
}

function renderHubNowPlaying() {
  if (!els.hubNowPlaying) return;
  const route = document.body.getAttribute("data-route") || "";
  const hideHubSource = miniSource?.type === "hub";
  const hideOnHubVisible = route === "hub";
  const hideOnLibrary = route === "library" && miniSource?.type !== "library";
  const hideOnPlayer = route === "player";
  const hideOnGenerate = route === "generate" && miniSource?.type === "generateResult";

  const audio = getMiniPlayerAudio();
  const hasMeta = Boolean(hubNowMeta && String(hubNowMeta.title || "").trim());
  const hubSrc = Boolean(
    audio && (String(audio.src || "").trim() || String(audio.currentSrc || "").trim()),
  );
  let dur = 0;
  try {
    dur = audio ? getAudioDuration(audio) : 0;
  } catch {}
  const cur = audio && Number.isFinite(audio.currentTime) ? audio.currentTime : 0;
  const audible = Boolean(
    audio && !audio.paused && !audio.ended && hasMeta && hubSrc && (dur > 0 || cur > 0),
  );

  const showMini =
    hasMeta &&
    hubSrc &&
    !hideHubSource &&
    !hideOnHubVisible &&
    !hideOnLibrary &&
    !hideOnPlayer &&
    !hideOnGenerate;

  if (!showMini) {
    els.hubNowPlaying.classList.remove("isVisible", "isPlaying");
    try {
      els.hubNowPlaying.style.removeProperty("--cover-glow-rgb");
    } catch {}
    setTimeout(() => {
      if (els.hubNowPlaying && !els.hubNowPlaying.classList.contains("isVisible")) {
        els.hubNowPlaying.style.display = "none";
      }
    }, 220);
    return;
  }

  applyCoverGlowRgb(els.hubNowPlaying, hubNowMeta?.art || "");
  els.hubNowPlaying.style.display = "";
  requestAnimationFrame(() => {
    els.hubNowPlaying.classList.add("isVisible");
    if (audible) els.hubNowPlaying.classList.add("isPlaying");
    else els.hubNowPlaying.classList.remove("isPlaying");
  });

  if (els.hubNowArt) {
    if (!els.hubNowArt.dataset.hubAuraBound) {
      els.hubNowArt.dataset.hubAuraBound = "1";
      els.hubNowArt.addEventListener("load", () => {
        try {
          syncHubNowAuraFromCoverUrl(els.hubNowArt.currentSrc || els.hubNowArt.src || "");
        } catch {}
      });
    }
    const artSrc = hubNowMeta.art || "./assets/nabadai-logo.png";
    els.hubNowArt.src = artSrc;
    syncHubNowAuraFromCoverUrl(artSrc);
  }
  if (els.hubNowTitle) els.hubNowTitle.textContent = hubNowMeta.title || "Now playing";
  if (els.hubNowSubtitle) {
    const sub = String(hubNowMeta.subtitle || "").trim();
    els.hubNowSubtitle.textContent = sub;
  }

  if (els.hubNowProgBar && dur > 0) {
    const pct = Math.max(0, Math.min(100, (cur / dur) * 100));
    els.hubNowProgBar.style.width = `${pct}%`;
  } else if (els.hubNowProgBar) {
    els.hubNowProgBar.style.width = "0%";
  }

  syncHubNowPlayPauseUi(Boolean(audible));
  syncLockScreenNowPlaying();
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
/** Production API origin for native shells — relative `/api/*` has no server on-device. */
const DEFAULT_NATIVE_API_BASE = "https://musician-ai-studio.vercel.app";
const API_BASE = (() => {
  let b = String(window.__API_BASE__ || "").trim().replace(/\/$/, "");
  if (b) return b;
  try {
    if (window.Capacitor?.isNativePlatform?.()) {
      return DEFAULT_NATIVE_API_BASE.replace(/\/$/, "");
    }
  } catch {}
  return "";
})();
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
  // 6s timeout — without it, a stalled `/api/public-config` (cold native
  // start on flaky mobile data) hangs the entire boot IIFE, which in
  // turn leaves the profile header skeleton stuck on forever.
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 6000);
    let r;
    try {
      r = await fetch(apiUrl("/api/public-config"), { signal: ctrl.signal });
    } finally {
      clearTimeout(timer);
    }
    const d = await r.json().catch(() => ({}));
    let rawUrl = String(d?.supabaseUrl || "").trim();
    // Accept either project root URL or mistakenly pasted REST URL.
    rawUrl = rawUrl.replace(/\/+$/, "");
    rawUrl = rawUrl.replace(/\/rest\/v1$/i, "");
    rawUrl = rawUrl.replace(/\/auth\/v1$/i, "");
    SUPABASE_URL = rawUrl;
    SUPABASE_ANON_KEY = String(d?.supabaseAnonKey || "");
    const ids = Array.isArray(d?.nabadCertifiedUserIds) ? d.nabadCertifiedUserIds : [];
    _nabadCertifiedUserIds = new Set(
      ids.map((x) => String(x || "").trim()).filter(Boolean),
    );
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

/* ------------------------------------------------------------------
 *  Tap-active-tab to refresh
 *
 *  Twitter/Instagram pattern: when the user is already ON a route and
 *  taps that route's bottom-bar tab, scroll to top and re-run the
 *  same data-layer refresh the route would do. The first tap from any
 *  other route still just navigates — only when source === destination
 *  do we intercept and refresh. Create is intentionally not listed so
 *  a half-typed prompt is never re-fetched / wiped.
 *
 *  Visual: the active tab's icon does a single-revolution spin while
 *  the refresh runs (CSS `.isRefreshing` class on the tab anchor).
 * ----------------------------------------------------------------- */
/* Each action FIRES its refreshes and returns immediately. The spin
 * animation is a *visual* confirmation, not a network wait — Profile
 * in particular was painting the icon for 20+ seconds whenever the
 * cellular round-trip to /auth/v1/user dragged, which read as the
 * app hanging. The actual data continues loading in the background;
 * the UI updates reactively as each promise resolves.
 *
 * Profile intentionally drops refreshAuthStateFromSupabase() — that
 * call only re-validates the JWT and the user object barely ever
 * changes between taps. Keeping credits + my-hub-posts gives the
 * user the two values that actually move (balance + new shares).  */
const TAB_REFRESH_ACTIONS = {
  ...(HUB_FEATURE_ENABLED
    ? {
      hub() {
        void Promise.resolve(refreshHubFromSupabase()).catch((e) => console.warn("[tabRefresh/hub]", e));
      },
    }
    : {}),
  discover() {
    try {
      if (_discoveryActiveSegment === "ideas") {
        const input = document.getElementById("searchInput");
        runSearchQuery(String(input?.value || ""));
      } else {
        void refreshDiscoverFeed();
      }
    } catch (e) { console.warn("[tabRefresh/discover]", e); }
  },
  mentor() {
    resetMentorSession();
  },
  profile() {
    void Promise.resolve(refreshMyCredits({ silent: true })).catch(() => {});
    void Promise.resolve(refreshMyHubPostsFast({ force: true })).catch(() => {});
  },
  library() {
    void Promise.resolve(reconcileLibraryFromCloud({ force: true }))
      .catch((e) => console.warn("[tabRefresh/library]", e));
  },
};

let _tabRefreshSpinTimer = 0;

function triggerTabRefresh(route) {
  const fn = TAB_REFRESH_ACTIONS[route];
  if (!fn) return;
  try { fn(); } catch (e) { console.warn("[tabRefresh]", e); }
  try { window.scrollTo({ top: 0, behavior: "smooth" }); } catch {}
  // Fixed visual: a single, satisfying rotation regardless of network.
  // 900ms ≈ one rotation of the CSS animation, plus a tiny breath.
  const tabEl = document.querySelector(`.mobileTabbar a[data-route-link="${route}"]`);
  if (!tabEl) return;
  tabEl.classList.add("isRefreshing");
  if (_tabRefreshSpinTimer) clearTimeout(_tabRefreshSpinTimer);
  _tabRefreshSpinTimer = setTimeout(() => {
    tabEl.classList.remove("isRefreshing");
    _tabRefreshSpinTimer = 0;
  }, 900);
}

function attachTabRefresh() {
  const tabs = document.querySelectorAll(".mobileTabbar a[data-route-link]");
  tabs.forEach((a) => {
    a.addEventListener("click", (e) => {
      const route = a.getAttribute("data-route-link") || "";
      if (!TAB_REFRESH_ACTIONS[route]) return;
      const current = document.body.getAttribute("data-route") || "";
      if (route !== current) return;
      // Already on this route → treat the tap as a refresh trigger.
      // Stop the link navigation so the hashchange handler doesn't
      // also fire (which would re-render the route from scratch and
      // cause a double-flash on top of our scoped refresh).
      e.preventDefault();
      e.stopPropagation();
      void triggerTabRefresh(route);
    });
  });
}

var authSession = null;
var generationReadyNotice = false;
/** Search → Make it mine; merged into `lastGenerationMeta` on Generate (declared early for `applyRoute`). */
let pendingSearchRemixMeta = null;

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
  let route = rawRoute.split(/[?#&]/)[0].trim();
  if (route === "search") {
    try {
      const h = String(location.hash || "");
      if (/\/search\b/i.test(h)) {
        history.replaceState(null, "", h.replace(/#\/?search\b/i, "#/discover"));
      }
    } catch {}
    route = "discover";
  }
  // Public profile route: `#/u/USERNAME`. Treat as the dedicated `user`
  // route so it gets its own section + nav state. Username is preserved
  // separately so the renderer can pick it up after the route swap.
  let pendingPublicUsername = "";
  if (/^u\//.test(route)) {
    pendingPublicUsername = decodeURIComponent(route.slice(2)).trim();
  }
  const allowedRoutes = new Set([
    "intro", "start", "auth", "generate", "library",
    ...(HUB_FEATURE_ENABLED ? ["hub"] : []),
    "settings", "profile", "player", "discover", "mentor", "vocal", "stems", "advanced", "user", "credits", "sounds",
  ]);
  const normalized = pendingPublicUsername ? "user" : (route === "start" ? "intro" : route);
  let wanted = allowedRoutes.has(normalized) ? normalized : "generate";
  if (!HUB_FEATURE_ENABLED && normalized === "hub") {
    wanted = "generate";
    try {
      const h = String(location.hash || "");
      if (/\/hub\b/.test(h)) history.replaceState(null, "", "#/generate");
    } catch {}
  }
  // Public profile is intentionally readable without auth so share-link
  // visitors don't hit a wall before discovering the rest of the product.
  const protectedRoutes = new Set(["generate", "library", "profile", "player", "vocal", "stems", "advanced", "credits", "sounds"]);
  const isLoggedIn = Boolean(authSession?.user?.id);
  if (!isLoggedIn && protectedRoutes.has(wanted)) wanted = "auth";
  const prevRoute = document.body.getAttribute("data-route") || "";
  if (prevRoute === "discover" && wanted !== "discover") {
    try { onLeaveSearchRoute(); } catch {}
  }
  document.body.classList.toggle("isIntro", wanted === "intro");
  document.body.classList.toggle("isAuth", wanted === "auth");
  document.body.setAttribute("data-route", wanted);
  if (prevRoute === "generate" && wanted !== "generate") {
    pendingSearchRemixMeta = null;
  }
  if (els.brandSecondary) {
    els.brandSecondary.textContent = wanted === "hub" ? "Hub" : "Music";
  }

  document.querySelectorAll("[data-route]").forEach((el) => {
    el.style.display = el.getAttribute("data-route") === wanted ? "" : "none";
  });
  try {
    const profileChrome = document.getElementById("profileAuraHeaderChromeRoot");
    if (profileChrome) {
      profileChrome.setAttribute("aria-hidden", wanted === "profile" ? "false" : "true");
    }
  } catch {}
  document.querySelectorAll("[data-route-link]").forEach((a) => {
    a.classList.toggle("active", a.getAttribute("data-route-link") === wanted);
  });
  const main = document.querySelector("main.grid");
  if (main) {
    main.classList.remove("routeSwap");
    requestAnimationFrame(() => main.classList.add("routeSwap"));
  }
  // Hub audio is bound to the Hub view only. Any route swap away from
  // Hub fully stops Hub playback so nothing keeps streaming silently
  // and no mini-player surfaces a Hub post outside the feed. Library/
  // generated tracks (other miniSource types) are unaffected.
  if (prevRoute === "hub" && wanted !== "hub") {
    try { pauseHubForRouteChange(); } catch {}
  }
  if (wanted === "hub") {
    markAllHubSeen();
    renderHubDots();
    renderHubUpdatedAt();
    updateHubAudioHint();
    try { renderHub(); } catch {}
    requestAnimationFrame(() => updateHubFocusedRow());
    // Smart-pick on tab entry was reverted (see hubTabLink click handler).
    // Clearing the flag here keeps it harmless in case anything else
    // sets it; the actual scroll behavior stays at "land on top".
    _hubPendingSmartScroll = false;
    // (No Hub resume: leaving Hub now fully stops Hub audio, so there
    //  is nothing to pick back up. Autoplay below re-engages from the
    //  viewport-centered row on entry.)
    // Kick autoplay on entry — but never override an already-active
    // pick. The Hub-tab click handler may have synchronously started
    // playback inside the gesture (the only way iOS reliably unlocks
    // audio); blindly flushing here would yank that choice away.
    setTimeout(() => {
      if (!hubAudioPostId) flushHubViewportAutoplay();
    }, 0);
    setTimeout(() => {
      if (!hubAudioPostId) flushHubViewportAutoplay();
    }, 240);
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
    // Pull the user's own Hub posts in parallel with credits so the
    // "songs / likes" section doesn't blank-out until the full Hub
    // feed arrives. Cheap query, scoped to one user.
    void refreshMyHubPostsFast();
    renderPersonaSelect();
    renderProfileCallingCardHint();
    if (authSession?.user?.id && shouldShowProfileHeaderSkeleton()) {
      setProfileHeaderLoading(true);
      // Active retry: if the boot-time cloud profile load missed (slow
      // network, fetch threw, race with auth), the route handler used
      // to just arm the shimmer and rely on the boot IIFE having
      // already run. That's how the "always loading + @guest" bug
      // happened. Kick a fresh fetch now, with the same timeout, and
      // dismiss the shimmer either way.
      void (async () => {
        try {
          const cloud = await supabaseLoadProfile();
          if (cloud && authSession?.user?.id) {
            const looksFilled = (v) => v !== "" && v != null;
            const localFilled = Object.fromEntries(
              Object.entries(activeProfile).filter(([k, v]) => {
                if (k === "username" && isPlaceholderUsername(v)) return false;
                return looksFilled(v);
              }),
            );
            const nextProfile = {
              ...cloud,
              ...localFilled,
              id: String(authSession.user.id),
              email: localFilled.email || cloud.email || authSession.user.email || "",
            };
            saveProfile(nextProfile);
            renderProfilePreviewFromInputs();
            renderProfileHubShared();
          }
        } catch {}
        try { setProfileHeaderLoading(false); } catch {}
      })();
    }
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
  if (wanted === "discover") {
    bindDiscoverySegmentControls();
    try {
      sessionStorage.setItem(DISCOVERY_SEGMENT_KEY, "discover");
    } catch {}
    syncDiscoveryUiToSegment("discover");
    try {
      onLeaveSearchRoute();
    } catch {}
    void refreshDiscoverFeed();
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
  try {
    updatePlayerSecondaryChrome();
  } catch {}
}

function updateBrandPulse() {
  if (!els.brandTitle) return;
  const isGenerating = Boolean(els.btnSunoGenerate?.disabled);
  const isPlaying = Boolean(playerEl && !playerEl.paused && !playerEl.ended);
  els.brandTitle.classList.toggle("isGenerating", isGenerating);
  els.brandTitle.classList.toggle("isPlaying", isPlaying);
}

// Hoisted so it's reachable from `resetCreateDraft` (which lives at top level).
// Previously this was defined as a `const` inside the big
// `if (els.btnSunoGenerate && els.btnSunoStems)` block, which made the call
// from `resetCreateDraft` throw a ReferenceError — leaving `body.generateLocked`
// stuck on after a successful generation, which in turn made the Lyrics/Hum/Photo
// tabs and every other button under `[data-route="generate"]` un-tappable until
// the app was force-closed.
function setGenerateFieldsLocked(locked) {
  const refFile = (typeof getVocalReferenceFile === "function") ? getVocalReferenceFile() : null;
  const lockPreviewAllowed = !locked && Boolean(refFile);
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
  if (els.btnClearVocalRef) els.btnClearVocalRef.disabled = locked;
  if (els.btnPreviewVocalRef) els.btnPreviewVocalRef.disabled = locked ? true : !lockPreviewAllowed;
  if (els.btnVocalRefStop) els.btnVocalRefStop.disabled = true;
  if (els.btnOpenAdvancedSheet) els.btnOpenAdvancedSheet.disabled = locked;
  if (els.btnGenerateOrb) els.btnGenerateOrb.disabled = locked;
  document.body.classList.toggle("generateLocked", Boolean(locked));
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
  // Defensive: clear UI-locking body classes BEFORE any later step can throw.
  // `body.generateLocked` makes every button under [data-route="generate"]
  // un-tappable (including the Lyrics/Hum/Photo tabs), so it MUST come off
  // even if something below this line errors out.
  try { document.body.classList.remove("generateLocked"); } catch {}
  try { document.body.classList.remove("isBusy"); } catch {}
  // Clear vocal reference completely — previously we wiped the file input + blob
  // but left `currentVocalRefFile`, so an old upload could survive "New song"
  // and the next Generate silently reused it.
  try {
    clearVocalReferenceSelection({ preserveRemixBanner: false });
  } catch {}
  if (els.sunoPrompt) els.sunoPrompt.value = "";
  if (els.sunoStyle) els.sunoStyle.value = "";
  if (els.sunoTitle) els.sunoTitle.value = "";
  pendingSearchRemixMeta = null;
  if (els.sunoArtworkStyle) els.sunoArtworkStyle.value = "";
  if (els.sunoReferenceMode) els.sunoReferenceMode.value = "none";
  if (els.vocalInstrumentalOnly) els.vocalInstrumentalOnly.value = "0";
  try { resetAdvancedOptionsToDefaults(); } catch {}
  if (els.vocalModeFull) els.vocalModeFull.classList.add("active");
  if (els.vocalModeInstrumental) els.vocalModeInstrumental.classList.remove("active");
  if (els.sunoReferenceHint) {
    els.sunoReferenceHint.style.display = "none";
    els.sunoReferenceHint.textContent = "";
    els.sunoReferenceHint.classList.remove("isCritical");
  }
  if (els.btnSunoGenerate) {
    els.btnSunoGenerate.textContent = "Generate song";
    els.btnSunoGenerate.disabled = false;
    els.btnSunoGenerate.dataset.mode = "generate";
  }
  if (els.resultCard) els.resultCard.style.display = "none";
  if (els.resultCard2) els.resultCard2.style.display = "none";
  // Stop every poll loop that could re-lock the UI mid-reset.
  try {
    if (generatePollTimer) {
      clearInterval(generatePollTimer);
      generatePollTimer = null;
    }
  } catch {}
  try {
    if (typeof stemsPollTimer !== "undefined" && stemsPollTimer) {
      clearInterval(stemsPollTimer);
      stemsPollTimer = null;
    }
  } catch {}
  try {
    if (typeof multiStemsPollTimer !== "undefined" && multiStemsPollTimer) {
      clearInterval(multiStemsPollTimer);
      multiStemsPollTimer = null;
    }
  } catch {}
  try {
    if (typeof stopSoundGenerationPolling === "function") stopSoundGenerationPolling();
  } catch {}
  try { savePendingBackendTask(""); } catch {}
  pendingGeneratedCoverDataUrl = "";
  pendingBackendTaskId = "";
  imageMoodAppliedForNextGen = false;
  imageMoodData = null;
  imageMoodCoverDataUrl = "";
  sunoTaskId = null;
  sunoAudioId = null;
  lastSunoAudioId2 = "";
  try {
    if (lastSunoCachedUrl) safeRevokeObjectUrl(lastSunoCachedUrl);
    if (lastSunoCachedUrl2) safeRevokeObjectUrl(lastSunoCachedUrl2);
  } catch {}
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
  try { updateListenRefButton(); } catch {}
  if (playerEl) {
    try {
      playerEl.pause();
      playerEl.currentTime = 0;
    } catch {}
  }
  if (els.btnSunoStems) els.btnSunoStems.disabled = true;
  if (els.btnSunoMultiStems) els.btnSunoMultiStems.disabled = true;
  try { renderReferenceHints(); } catch {}
  try { setGenerateFieldsLocked(false); } catch {}
  // Always make sure these stuck classes are gone, even if the call above
  // throws for any reason.
  try { document.body.classList.remove("generateLocked"); } catch {}
  try { setLoading(false); } catch {}
  // Land the user back on the Lyrics tab (the natural starting view) so the
  // "start new song" gesture feels like a real fresh page.
  try {
    if (typeof setActiveCreateTab === "function") setActiveCreateTab("lyrics");
  } catch {}
  // Scroll the create page to the top so the user sees the inputs / tabs,
  // not the (now hidden) stale result card position.
  try {
    const top = document.querySelector('[data-route="generate"]');
    if (top && typeof top.scrollIntoView === "function") {
      top.scrollIntoView({ block: "start", behavior: "smooth" });
    } else {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  } catch {}
  try { setStatus("New draft started."); } catch {}
  try { syncGenerateOrbVisibility(); } catch {}
  try {
    if (typeof showToast === "function") {
      showToast("New song started", { icon: "✓", durationMs: 2000 });
    }
  } catch {}
}

window.addEventListener("hashchange", applyRoute);
if (!location.hash) location.hash = "#/intro";
applyRoute();
try {
  bindDiscoverySegmentControls();
} catch {}
try {
  wireTrackOptionsSheetOnce();
} catch {}
syncLibraryTabDotFromStorage();

/* ============================================================
 * Search page — magazine of remixable occasion shelves.
 *   In-code `SEARCH_TEMPLATE_FALLBACK` always ships; Supabase `search_templates`
 *   rows (same `id`) overlay titles, media URLs, lyrics, etc. when present.
 * ============================================================ */
const SEARCH_TEMPLATE_FALLBACK = [
  {
    id: "bday-jazz",
    shelf: "birthday",
    occasion: "Birthday · Jazz lounge",
    title: "Happy Birthday Jazz",
    sub: "A warm jazz-club birthday number — we'll sing their name in the chorus.",
    chip: "Birthday",
    style: "Jazz, smooth piano, brushed drums, upright bass, warm vocal, 90 bpm",
    lyrics: "Happy birthday [name], the room is yours tonight\nLights down low, the band plays bright\nHere's to the years and all the highs to come\n[name], take the floor — this song's your one",
    keywords: ["birthday", "bday", "anniversaire", "عيد ميلاد", "happy birthday", "jazz"],
  },
  {
    id: "bday-trap",
    shelf: "birthday",
    occasion: "Birthday · Trap hype",
    title: "Birthday Trap",
    sub: "Loud, modern, and hype — for the squad night out.",
    chip: "Birthday",
    style: "Trap, 808s, hi-hats, hype vocal, 145 bpm",
    lyrics: "[name] in the building, light it up\nCake on the table, drinks on the cup\nIt's your night, it's your year\n[name], [name], everybody cheer",
    keywords: ["birthday", "bday", "hype", "trap", "party"],
  },
  {
    id: "bday-arabic",
    shelf: "birthday",
    occasion: "Birthday · Arabic dabke",
    title: "Sana Helwa Dabke",
    sub: "Dabke groove, oud + darbuka, ready to bring the family to their feet.",
    chip: "Birthday",
    style: "Dabke, oud, darbuka, mijwiz, arabic vocal, 105 bpm",
    lyrics: "سنة حلوة يا [name]\nسنة حلوة يا حبيبنا\nالليلة عيدك يا [name]\nيا قمر بليلتنا",
    keywords: ["birthday", "عيد ميلاد", "arabic", "dabke", "sana helwa"],
  },
  {
    id: "mom-warm",
    shelf: "family",
    occasion: "For mom · Acoustic",
    title: "Mama's Song",
    sub: "A gentle acoustic letter to mom — fingerpicked guitar, soft strings.",
    chip: "Family",
    style: "Acoustic ballad, fingerpicked guitar, soft strings, warm male vocal, 72 bpm",
    lyrics: "Mama, [name], you were always there\nWith your hand on my heart and your love in the air\nEvery road I walked, every dream I chased\nI saw your smile and I knew my place",
    keywords: ["mom", "mother", "mama", "family", "maman", "أمي"],
  },
  {
    id: "dad-rock",
    shelf: "family",
    occasion: "For dad · Indie rock",
    title: "Old Man's Anthem",
    sub: "Indie rock tribute — drive, guitar, gratitude.",
    chip: "Family",
    style: "Indie rock, driving drums, electric guitar, anthemic vocal, 118 bpm",
    lyrics: "Dad, [name], you taught me how to stand\nHow to face the world with a steady hand\nThis one's for you, the road you laid down\nFor every step from here to home",
    keywords: ["dad", "father", "papa", "family", "أبي"],
  },
  {
    id: "anniv-soul",
    shelf: "anniversary",
    occasion: "Anniversary · Soul",
    title: "All Our Years",
    sub: "Soulful, slow burn, retro horns — say it without saying it.",
    chip: "Anniversary",
    style: "Neo-soul, Rhodes, horns, female lead vocal, 78 bpm",
    lyrics: "[name], all our years rolled into one\nFrom the first night, our song's never done\nEvery hand I held was always yours\nThis is for us, for all of ours",
    keywords: ["anniversary", "love", "amour", "couple"],
  },
  {
    id: "wed-entrance",
    shelf: "wedding",
    occasion: "Wedding · Entrance",
    title: "Walking In",
    sub: "Cinematic strings build into a triumphant entrance.",
    chip: "Wedding",
    style: "Cinematic strings, drums, anthemic, instrumental opening then vocal, 92 bpm",
    lyrics: "Here we come, [name] and [name]\nHand in hand into the light\nEvery eye on the road we paved\nThis is our forever night",
    keywords: ["wedding", "mariage", "زفاف", "entrance"],
  },
  {
    id: "wed-firstdance",
    shelf: "wedding",
    occasion: "Wedding · First dance",
    title: "First Dance",
    sub: "Soft piano, intimate vocal — your first song.",
    chip: "Wedding",
    style: "Piano ballad, intimate vocal, light strings, 65 bpm",
    lyrics: "[name], take my hand and stay\nThe lights are low, we found our way\nNothing else but this moment now\nForever starts with how we vow",
    keywords: ["wedding", "first dance", "couple"],
  },
  {
    id: "gym-hype",
    shelf: "hype",
    occasion: "Workout · Drill",
    title: "Last Set",
    sub: "Hard drums, low end, push-through energy.",
    chip: "Hype",
    style: "UK drill, sliding 808s, dark synths, aggressive vocal, 144 bpm",
    lyrics: "[name], one more rep, no flinch\nEvery rep a step, every step an inch\nLast set, last breath, all in\nWalk out heavy, walk out a king",
    keywords: ["gym", "workout", "hype", "drill", "pump"],
  },
  {
    id: "gym-rock",
    shelf: "hype",
    occasion: "Workout · Arena rock",
    title: "Run It",
    sub: "Stadium rock — distorted guitars, four-on-the-floor.",
    chip: "Hype",
    style: "Arena rock, distorted guitars, four-on-the-floor drums, anthemic vocal, 128 bpm",
    lyrics: "[name], on the line tonight\nFeel the burn, ride the light\nWe don't stop till the bell\nWe run it, we run it well",
    keywords: ["gym", "workout", "rock", "running"],
  },
  {
    id: "heart-piano",
    shelf: "heart",
    occasion: "Heartbreak · Piano",
    title: "Empty Rooms",
    sub: "Slow piano, raw vocal — for when the room is too quiet.",
    chip: "From the heart",
    style: "Piano ballad, sparse arrangement, raw emotional vocal, 60 bpm",
    lyrics: "[name], I left the light on for you\nThe room still holds the things we drew\nI'm sorry, I'm tired, I'm here\nThis song's the only way to be near",
    keywords: ["heartbreak", "sad", "missing you", "breakup"],
  },
  {
    id: "heart-grat",
    shelf: "heart",
    occasion: "Gratitude · Acoustic",
    title: "Thank You",
    sub: "Acoustic letter of thanks — gentle and simple.",
    chip: "From the heart",
    style: "Acoustic, light percussion, warm vocal, 84 bpm",
    lyrics: "[name], I never said it loud enough\nThank you for every soft and every rough\nThis song's a hand across the room\nA quiet thank you, from me to you",
    keywords: ["thank you", "gratitude", "friend"],
  },
];

const SEARCH_SHELVES = [
  { id: "birthday",   title: "Birthdays that hit",       hint: "Remix with a name" },
  { id: "family",     title: "For your people",          hint: "Mom, dad, anyone" },
  { id: "anniversary",title: "Anniversaries",            hint: "Say it in song" },
  { id: "wedding",    title: "Wedding moments",          hint: "Entrance · first dance" },
  { id: "hype",       title: "Hype it up",               hint: "Gym · pre-game · party" },
  { id: "heart",      title: "From the heart",           hint: "Heartbreak · gratitude" },
];

/** Non-null when Supabase returned ≥1 active row; merged over `SEARCH_TEMPLATE_FALLBACK` by `id`. */
let searchTemplatesRemote = null;
let _searchPeopleFetchGen = 0;

async function supabaseSelectSearchTemplates() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return null;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 10_000);
  try {
    const sel =
      "id,shelf,occasion,title,sub,chip,style,lyrics,keywords,cover_url,preview_url,sort_order,active";
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/search_templates?select=${encodeURIComponent(sel)}&active=eq.true&order=shelf.asc,sort_order.asc,id.asc`,
      {
        headers: { apikey: SUPABASE_ANON_KEY },
        signal: ctrl.signal,
      },
    );
    if (!r.ok) return null;
    const arr = await r.json().catch(() => null);
    return Array.isArray(arr) ? arr : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function mapSearchTemplateRowFromDb(r) {
  let keywords = [];
  if (Array.isArray(r?.keywords)) keywords = r.keywords.map((x) => String(x));
  else if (typeof r?.keywords === "string" && r.keywords) {
    try {
      const p = JSON.parse(r.keywords);
      if (Array.isArray(p)) keywords = p.map((x) => String(x));
    } catch {
      keywords = r.keywords.split(/[\s,]+/).filter(Boolean);
    }
  }
  return {
    id: String(r.id || ""),
    shelf: String(r.shelf || ""),
    occasion: String(r.occasion || ""),
    title: String(r.title || ""),
    sub: String(r.sub || ""),
    chip: String(r.chip || ""),
    style: String(r.style || ""),
    lyrics: String(r.lyrics || ""),
    keywords,
    coverUrl: String(r.cover_url || "").trim(),
    previewUrl: String(r.preview_url || "").trim(),
    sortOrder: Number(r.sort_order) || 0,
  };
}

async function refreshSearchTemplates() {
  const raw = await supabaseSelectSearchTemplates();
  if (Array.isArray(raw) && raw.length) {
    searchTemplatesRemote = raw.map(mapSearchTemplateRowFromDb).filter((t) => t.id && t.shelf);
  } else {
    searchTemplatesRemote = null;
  }
}

function getSearchTemplates() {
  const fb = SEARCH_TEMPLATE_FALLBACK;
  if (!searchTemplatesRemote?.length) return fb.slice();
  const byId = new Map(fb.map((t) => [t.id, { ...t }]));
  for (const o of searchTemplatesRemote) {
    if (!o.id) continue;
    const cur = byId.get(o.id) || {
      id: o.id,
      shelf: o.shelf,
      occasion: o.occasion,
      title: o.title,
      sub: o.sub,
      chip: o.chip,
      style: o.style,
      lyrics: o.lyrics,
      keywords: o.keywords || [],
    };
    byId.set(o.id, {
      ...cur,
      ...o,
      keywords: o.keywords && o.keywords.length ? o.keywords : cur.keywords || [],
    });
  }
  const shelfRank = (shelf) => {
    const i = SEARCH_SHELVES.findIndex((s) => s.id === shelf);
    return i >= 0 ? i : 99;
  };
  return Array.from(byId.values()).sort((a, b) => {
    const sr = shelfRank(a.shelf) - shelfRank(b.shelf);
    if (sr !== 0) return sr;
    const o = (a.sortOrder || 0) - (b.sortOrder || 0);
    if (o !== 0) return o;
    return String(a.id).localeCompare(String(b.id));
  });
}

function escapePostgrestIlikeToken(qNorm) {
  const t = String(qNorm || "")
    .trim()
    .toLowerCase()
    .replace(/,/g, " ")
    .replace(/\s+/g, " ")
    .slice(0, 36);
  if (t.length < 2) return "";
  return t.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_").replace(/\*/g, "");
}

async function supabaseSearchPublicProfiles(qNorm) {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return [];
  const token = escapePostgrestIlikeToken(qNorm);
  if (!token) return [];
  const wild = `*${token}*`;
  const orRaw = `(username.ilike.${wild},bio.ilike.${wild})`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const url = `${SUPABASE_URL}/rest/v1/profiles?is_public=eq.true&or=${encodeURIComponent(orRaw)}&select=username,avatar,user_id&limit=14`;
    const r = await fetch(url, {
      headers: { apikey: SUPABASE_ANON_KEY },
      signal: ctrl.signal,
    });
    if (!r.ok) return [];
    const rows = await r.json().catch(() => []);
    if (!Array.isArray(rows)) return [];
    return rows
      .map((row) => ({
        handle: String(row.username || "").trim(),
        avatar: String(row.avatar || "").trim() || "./assets/nabadai-logo.png",
        userId: String(row.user_id || "").trim(),
      }))
      .filter((u) => u.handle && !isPlaceholderUsername(u.handle));
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

const SEARCH_HINT_EXAMPLES = [
  "birthday for sara",
  "wedding entrance",
  "samy_foun",
  "song for mom",
  "hype gym track",
  "anniversary in arabic",
  "thank you, friend",
  "heartbreak piano",
];

let _searchHintIdx = 0;
let _searchHintTimer = null;
let _searchPosterIdToTemplate = new Map();
let _searchActiveTemplate = null;
let _searchInited = false;
const DISCOVERY_SEGMENT_KEY = "mas:discoverySegment:v1";
let _discoverySegmentBound = false;
/** `discover` (community placeholder) or `ideas` (templates + search). */
let _discoveryActiveSegment = "discover";

function startSearchHintRotator() {
  const hintEl = document.getElementById("searchInputHint");
  const inputEl = document.getElementById("searchInput");
  if (!hintEl || !inputEl) return;
  stopSearchHintRotator();
  const rotate = () => {
    if (inputEl.value) return;
    hintEl.classList.add("swapping");
    setTimeout(() => {
      _searchHintIdx = (_searchHintIdx + 1) % SEARCH_HINT_EXAMPLES.length;
      hintEl.textContent = SEARCH_HINT_EXAMPLES[_searchHintIdx];
      hintEl.classList.remove("swapping");
    }, 220);
  };
  hintEl.textContent = SEARCH_HINT_EXAMPLES[_searchHintIdx];
  _searchHintTimer = setInterval(rotate, 2600);
}
function stopSearchHintRotator() {
  if (_searchHintTimer) { clearInterval(_searchHintTimer); _searchHintTimer = null; }
}

function searchTemplateMatchesQuery(tpl, qNorm) {
  if (!qNorm) return true;
  const haystack = [
    tpl.id, tpl.shelf, tpl.occasion, tpl.title, tpl.sub, tpl.chip,
    tpl.coverUrl, tpl.previewUrl,
    ...(tpl.keywords || []),
  ].join(" ").toLowerCase();
  return haystack.includes(qNorm);
}

function searchShelfMatchesQuery(shelfId, qNorm) {
  if (!qNorm) return true;
  return getSearchTemplates().some((t) => t.shelf === shelfId && searchTemplateMatchesQuery(t, qNorm));
}

function renderSearchPosterHTML(tpl) {
  const occ = String(tpl.occasion || "").split("·")[0]?.trim() || tpl.chip || "";
  const sub = String(tpl.occasion || "").split("·").slice(1).join("·").trim();
  const cover = String(tpl.coverUrl || "").trim();
  const artInner = cover
    ? `<img class="searchPosterArt" src="${escapeHtml(cover)}" alt="" loading="lazy" decoding="async" />`
    : `<div class="searchPosterArt" data-placeholder="1" aria-hidden="true"></div>`;
  return `
    <button class="searchPoster" type="button" data-search-poster="${tpl.id}" aria-label="${escapeHtml(tpl.title)}">
      ${artInner}
      <div class="searchPosterVignette" aria-hidden="true"></div>
      <span class="searchPosterChip">${escapeHtml(tpl.chip || occ)}</span>
      <div class="searchPosterText">
        <div class="searchPosterTitle">${escapeHtml(tpl.title)}</div>
        ${sub ? `<div class="searchPosterSub">${escapeHtml(sub)}</div>` : ""}
        <div class="searchPosterCta">Make it yours</div>
      </div>
    </button>
  `;
}

function renderSearchShelves(query) {
  const root = document.getElementById("searchShelves");
  const emptyEl = document.getElementById("searchEmpty");
  if (!root) return;
  const qNorm = String(query || "").trim().toLowerCase();
  _searchPosterIdToTemplate = new Map();

  // Build shelf-by-shelf so the matching one floats to the top when there's a query.
  const shelves = SEARCH_SHELVES.map((shelf) => {
    const templates = getSearchTemplates().filter((t) => t.shelf === shelf.id);
    const matched = qNorm
      ? templates.filter((t) => searchTemplateMatchesQuery(t, qNorm))
      : templates;
    return { shelf, templates, matched, hasMatch: matched.length > 0 };
  });

  let anyMatch = false;
  let html = "";
  // Matching shelves first.
  shelves
    .filter((s) => qNorm ? s.hasMatch : true)
    .sort((a, b) => {
      if (!qNorm) return 0;
      return Number(b.hasMatch) - Number(a.hasMatch);
    })
    .forEach(({ shelf, templates, matched }) => {
      const toShow = qNorm ? matched : templates;
      if (!toShow.length) return;
      anyMatch = true;
      toShow.forEach((t) => _searchPosterIdToTemplate.set(t.id, t));
      html += `
        <section class="searchShelf" data-search-shelf="${shelf.id}">
          <header class="searchShelfHead">
            <h3 class="searchShelfTitle">${escapeHtml(shelf.title)}</h3>
          </header>
          <div class="searchShelfRow">
            ${toShow.map(renderSearchPosterHTML).join("")}
          </div>
        </section>
      `;
    });

  root.innerHTML = html;
  if (emptyEl) emptyEl.hidden = anyMatch || !qNorm;

  root.querySelectorAll("[data-search-poster]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-search-poster");
      const tpl = _searchPosterIdToTemplate.get(id);
      if (tpl) openSearchRemixSheet(tpl);
    });
  });
}

function bindSearchPeopleRowClickHandlers(rowEl) {
  if (!rowEl) return;
  rowEl.querySelectorAll("[data-search-user]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const handle = decodeURIComponent(btn.getAttribute("data-search-user") || "");
      if (handle) location.hash = `#/u/${encodeURIComponent(handle)}`;
    });
  });
}

function renderSearchPeople(query) {
  const stripEl = document.getElementById("searchPeopleStrip");
  const rowEl = document.getElementById("searchPeopleRow");
  if (!stripEl || !rowEl) return;
  const qNorm = String(query || "").trim().toLowerCase();
  if (!qNorm) {
    stripEl.hidden = true;
    rowEl.innerHTML = "";
    return;
  }
  const seq = ++_searchPeopleFetchGen;
  let posts = [];
  try { posts = loadHubFeed() || []; } catch { posts = []; }
  const seen = new Set();
  const hubPeople = [];
  for (const p of posts) {
    const handle = String(p?.creator || "").trim();
    if (!handle || isPlaceholderUsername(handle)) continue;
    const key = handle.toLowerCase();
    if (seen.has(key)) continue;
    if (!key.includes(qNorm)) continue;
    seen.add(key);
    hubPeople.push({
      handle,
      avatar: String(p?.creatorAvatar || "./assets/nabadai-logo.png"),
    });
    if (hubPeople.length >= 12) break;
  }
  const paint = (people) => {
    if (!people.length) {
      stripEl.hidden = true;
      rowEl.innerHTML = "";
      return;
    }
    stripEl.hidden = false;
    rowEl.innerHTML = people.map((u) => `
    <button class="searchPersonCard" type="button" data-search-user="${encodeURIComponent(u.handle)}">
      <img class="searchPersonAvatar" src="${escapeHtml(u.avatar)}" alt="" loading="lazy" />
      <div class="searchPersonName">@${escapeHtml(u.handle)}</div>
    </button>
  `).join("");
    bindSearchPeopleRowClickHandlers(rowEl);
  };
  paint(hubPeople);
  void (async () => {
    const cloud = await supabaseSearchPublicProfiles(qNorm);
    if (seq !== _searchPeopleFetchGen) return;
    const input = document.getElementById("searchInput");
    if (String(input?.value || "").trim().toLowerCase() !== qNorm) return;
    const merged = [...hubPeople];
    const seen2 = new Set(merged.map((h) => h.handle.toLowerCase()));
    for (const c of cloud) {
      const k = c.handle.toLowerCase();
      if (seen2.has(k)) continue;
      seen2.add(k);
      merged.push({ handle: c.handle, avatar: c.avatar });
      if (merged.length >= 12) break;
    }
    paint(merged);
  })();
}

function runSearchQuery(query) {
  renderSearchPeople(query);
  renderSearchShelves(query);
}

function openSearchRemixSheet(tpl) {
  const sheet = document.getElementById("searchRemixSheet");
  if (!sheet || !tpl) return;
  _searchActiveTemplate = tpl;
  const occ = document.getElementById("searchRemixOccasion");
  const title = document.getElementById("searchRemixTitle");
  const sub = document.getElementById("searchRemixSub");
  const nameInput = document.getElementById("searchRemixName");
  const cta = document.getElementById("searchRemixCta");
  const coverImg = document.getElementById("searchRemixCover");
  const previewBtn = document.getElementById("searchRemixPreviewBtn");
  const audio = document.getElementById("searchRemixPreviewAudio");
  const coverUrl = String(tpl.coverUrl || "").trim();
  const previewUrl = String(tpl.previewUrl || "").trim();
  if (coverImg) {
    if (coverUrl) {
      coverImg.hidden = false;
      coverImg.src = coverUrl;
    } else {
      try { coverImg.removeAttribute("src"); } catch {}
      coverImg.hidden = true;
    }
  }
  if (audio) {
    try { audio.pause(); } catch {}
    try { audio.currentTime = 0; } catch {}
    if (previewUrl) {
      audio.src = previewUrl;
    } else {
      try { audio.removeAttribute("src"); } catch {}
    }
  }
  if (previewBtn) {
    previewBtn.hidden = !previewUrl;
    previewBtn.disabled = !previewUrl;
    previewBtn.classList.remove("isPlaying");
  }
  if (occ) occ.textContent = tpl.occasion;
  if (title) title.textContent = tpl.title;
  if (sub) sub.textContent = tpl.sub;
  if (nameInput) {
    nameInput.value = "";
    nameInput.placeholder = "Sara";
    setTimeout(() => nameInput.focus(), 80);
  }
  if (cta) cta.disabled = false;
  sheet.hidden = false;
  requestAnimationFrame(() => sheet.classList.add("isOpen"));
}

function closeSearchRemixSheet() {
  const sheet = document.getElementById("searchRemixSheet");
  if (!sheet) return;
  sheet.classList.remove("isOpen");
  setTimeout(() => { sheet.hidden = true; }, 240);
  const audio = document.getElementById("searchRemixPreviewAudio");
  if (audio) {
    try { audio.pause(); } catch {}
    try { audio.currentTime = 0; } catch {}
  }
  const playBtn = document.getElementById("searchRemixPreviewBtn");
  if (playBtn) {
    playBtn.classList.remove("isPlaying");
    playBtn.hidden = false;
    playBtn.disabled = false;
  }
  _searchActiveTemplate = null;
}

function applyRemixTemplateToCreate(tpl, name) {
  if (!tpl) return;
  const cleanName = String(name || "").trim() || "you";
  const lyrics = String(tpl.lyrics || "").replaceAll("[name]", cleanName);
  const titleWithName = `${tpl.title} — for ${cleanName}`;
  if (els.sunoPrompt) els.sunoPrompt.value = lyrics;
  if (els.sunoStyle) els.sunoStyle.value = String(tpl.style || "");
  if (els.sunoTitle) els.sunoTitle.value = titleWithName;
  pendingSearchRemixMeta = {
    searchTemplateId: String(tpl.id || "").trim(),
    searchTemplateTitle: String(tpl.title || "").trim(),
    searchRemixPersonalizedFor: cleanName,
  };
  try { setStatus?.(`Loaded ${tpl.title} — tap Generate when ready.`); } catch {}
}

function initSearchPageOnce() {
  if (_searchInited) return;
  _searchInited = true;
  const input = document.getElementById("searchInput");
  const bar = input?.closest(".searchBar");
  const clearBtn = document.getElementById("searchInputClear");
  if (input) {
    input.addEventListener("input", () => {
      const v = input.value;
      if (bar) bar.classList.toggle("hasValue", Boolean(v));
      if (clearBtn) clearBtn.hidden = !v;
      runSearchQuery(v);
    });
    input.addEventListener("focus", stopSearchHintRotator);
    input.addEventListener("blur", () => { if (!input.value) startSearchHintRotator(); });
  }
  if (clearBtn) {
    clearBtn.addEventListener("click", () => {
      if (!input) return;
      input.value = "";
      if (bar) bar.classList.remove("hasValue");
      clearBtn.hidden = true;
      runSearchQuery("");
      input.focus();
    });
  }
  const sheet = document.getElementById("searchRemixSheet");
  if (sheet) {
    sheet.addEventListener("click", (e) => {
      const t = e.target;
      if (t && t instanceof HTMLElement && t.matches('[data-action="close-remix"]')) {
        closeSearchRemixSheet();
      }
    });
  }
  const cta = document.getElementById("searchRemixCta");
  if (cta) {
    cta.addEventListener("click", () => {
      const tpl = _searchActiveTemplate;
      const nameInput = document.getElementById("searchRemixName");
      const name = nameInput?.value || "";
      if (!tpl) return;
      applyRemixTemplateToCreate(tpl, name);
      closeSearchRemixSheet();
      location.hash = "#/generate";
      try { syncGenerateOrbVisibility?.(); } catch {}
    });
  }
  const previewBtn = document.getElementById("searchRemixPreviewBtn");
  const previewAudio = document.getElementById("searchRemixPreviewAudio");
  if (previewBtn && previewAudio) {
    previewAudio.addEventListener("ended", () => {
      previewBtn.classList.remove("isPlaying");
    });
    previewBtn.addEventListener("click", () => {
      const tpl = _searchActiveTemplate;
      const url = String(tpl?.previewUrl || "").trim();
      const audio = document.getElementById("searchRemixPreviewAudio");
      const btn = document.getElementById("searchRemixPreviewBtn");
      if (!url || !audio || !btn) {
        const cta = document.getElementById("searchRemixCta");
        if (!cta) return;
        cta.animate(
          [
            { transform: "translateX(0)" },
            { transform: "translateX(-3px)" },
            { transform: "translateX(3px)" },
            { transform: "translateX(0)" },
          ],
          { duration: 220, easing: "ease-out" },
        );
        return;
      }
      if (audio.paused) {
        void audio.play().then(() => btn.classList.add("isPlaying")).catch(() => {
          try {
            showToast("Could not play preview.", { icon: "♪", durationMs: 2800 });
          } catch {}
        });
      } else {
        try { audio.pause(); } catch {}
        btn.classList.remove("isPlaying");
      }
    });
  }
  runSearchQuery("");
}

function onEnterSearchRoute() {
  initSearchPageOnce();
  startSearchHintRotator();
  void refreshSearchTemplates().then(() => {
    const input = document.getElementById("searchInput");
    runSearchQuery(input?.value || "");
  });
}
function onLeaveSearchRoute() {
  stopSearchHintRotator();
  closeSearchRemixSheet();
}

function syncDiscoveryUiToSegment(seg) {
  const next = seg === "discover" ? "discover" : "ideas";
  _discoveryActiveSegment = next;
  document.querySelectorAll("[data-discovery-segment]").forEach((btn) => {
    const isSel = btn.getAttribute("data-discovery-segment") === next;
    btn.classList.toggle("isActive", isSel);
    btn.setAttribute("aria-selected", isSel ? "true" : "false");
  });
  document.querySelectorAll("[data-discovery-pane]").forEach((pane) => {
    const p = pane.getAttribute("data-discovery-pane");
    const show = p === next;
    if (show) pane.removeAttribute("hidden");
    else pane.setAttribute("hidden", "");
  });
}

function bindDiscoverySegmentControls() {
  wireUserPublicFeedRowsOnce();
  if (_discoverySegmentBound) return;
  _discoverySegmentBound = true;
  document.querySelectorAll("[data-discovery-segment]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const s = btn.getAttribute("data-discovery-segment");
      if (s !== "discover" && s !== "ideas") return;
      try { sessionStorage.setItem(DISCOVERY_SEGMENT_KEY, s); } catch {}
      const prev = _discoveryActiveSegment;
      syncDiscoveryUiToSegment(s);
      if (s === "ideas" && prev !== "ideas") {
        try { onEnterSearchRoute(); } catch {}
      } else if (s === "discover" && prev !== "discover") {
        try { onLeaveSearchRoute(); } catch {}
        void refreshDiscoverFeed();
      }
    });
  });
  const rfb = document.getElementById("discoveryRefreshBtn");
  if (rfb && !rfb.dataset.boundDiscoveryRefresh) {
    rfb.dataset.boundDiscoveryRefresh = "1";
    rfb.addEventListener("click", () => {
      haptic("light");
      rfb.classList.add("isRefreshing");
      void refreshDiscoverFeed().finally(() => {
        try { rfb.classList.remove("isRefreshing"); } catch {}
      });
    });
  }
  const dPane = document.getElementById("discoveryPaneDiscover");
  if (dPane && !dPane.dataset.boundDiscoverPane) {
    dPane.dataset.boundDiscoverPane = "1";
    wireTrackOptionsSheetOnce();
    dPane.addEventListener("click", (e) => {
      const menuBtn = e.target.closest("[data-discovery-open-sheet]");
      if (menuBtn && dPane.contains(menuBtn)) {
        e.preventDefault();
        e.stopPropagation();
        haptic("light");
        openDiscoverTrackSheetFromEl(menuBtn);
        return;
      }
      const inline = e.target.closest("[data-discovery-inline-play]");
      if (inline && dPane.contains(inline)) {
        const u = inline.getAttribute("data-user-lib-url");
        const title = decodeDiscoverDataAttr(inline, "data-user-lib-title") || "Song";
        const art = decodeDiscoverDataAttr(inline, "data-user-lib-art") || "";
        const by = decodeDiscoverDataAttr(inline, "data-discovery-by") || "";
        if (!u) return;
        let raw = "";
        try {
          raw = decodeURIComponent(u);
        } catch {
          raw = u;
        }
        haptic("light");
        if (toggleDiscoverFeedPlaybackIfSameUrl(raw)) return;
        void playLibraryUrlOnPlayer(raw, title, art, { discoverFeed: true, openPlayer: false, discoverBy: by });
        return;
      }
      const pl = e.target.closest("[data-user-lib-play]");
      if (!pl || !dPane.contains(pl)) return;
      const u = pl.getAttribute("data-user-lib-url");
      const title = decodeDiscoverDataAttr(pl, "data-user-lib-title") || "Song";
      const art = decodeDiscoverDataAttr(pl, "data-user-lib-art") || "";
      const by = decodeDiscoverDataAttr(pl, "data-discovery-by") || "";
      if (!u) return;
      let raw = "";
      try {
        raw = decodeURIComponent(u);
      } catch {
        raw = u;
      }
      haptic("light");
      if (toggleDiscoverFeedPlaybackIfSameUrl(raw)) return;
      void playLibraryUrlOnPlayer(raw, title, art, { discoverFeed: true, openPlayer: false, discoverBy: by });
    });
  }
}

function wireUserPublicFeedRowsOnce() {
  const host = document.getElementById("userPublicSongs");
  if (!host || host.dataset.boundUserPublicFeed) return;
  host.dataset.boundUserPublicFeed = "1";
  wireTrackOptionsSheetOnce();
  host.addEventListener("click", (e) => {
    const menuBtn = e.target.closest("[data-discovery-open-sheet]");
    if (menuBtn && host.contains(menuBtn)) {
      e.preventDefault();
      e.stopPropagation();
      haptic("light");
      openDiscoverTrackSheetFromEl(menuBtn);
      return;
    }
    const inline = e.target.closest("[data-discovery-inline-play]");
    if (inline && host.contains(inline)) {
      const u = inline.getAttribute("data-user-lib-url");
      const title = decodeDiscoverDataAttr(inline, "data-user-lib-title") || "Song";
      const art = decodeDiscoverDataAttr(inline, "data-user-lib-art") || "";
      if (!u) return;
      let raw = "";
      try {
        raw = decodeURIComponent(u);
      } catch {
        raw = u;
      }
      haptic("light");
      if (togglePublicProfileLibPlaybackIfSameUrl(raw)) return;
      void playLibraryUrlOnPlayer(raw, title, art, { openPlayer: false });
      return;
    }
    const pl = e.target.closest("[data-user-lib-play]");
    if (!pl || !host.contains(pl)) return;
    const u = pl.getAttribute("data-user-lib-url");
    const title = decodeDiscoverDataAttr(pl, "data-user-lib-title") || "Song";
    const art = decodeDiscoverDataAttr(pl, "data-user-lib-art") || "";
    if (!u) return;
    let raw = "";
    try {
      raw = decodeURIComponent(u);
    } catch {
      raw = u;
    }
    haptic("light");
    if (togglePublicProfileLibPlaybackIfSameUrl(raw)) return;
    void playLibraryUrlOnPlayer(raw, title, art, { openPlayer: false });
  });
}

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
/** Incremented on each new mic session so a late `MediaRecorder.onstop` from a superseded recording cannot overwrite state (WKWebView race). */
let vocalRecordSessionId = 0;
let vocalRefPreviewUrl = "";
let lastVocalRefFingerprint = "";

async function computeBytesFingerprint(input) {
  try {
    let buf = null;
    if (input instanceof ArrayBuffer) buf = input;
    else if (input && typeof input.arrayBuffer === "function") buf = await input.arrayBuffer();
    else if (input instanceof Uint8Array) buf = input.buffer.slice(input.byteOffset, input.byteOffset + input.byteLength);
    if (!buf) return "";
    const subtle = (window.crypto || {}).subtle;
    if (!subtle) return "";
    const digest = await subtle.digest("SHA-256", buf);
    const bytes = new Uint8Array(digest);
    let hex = "";
    for (let i = 0; i < bytes.length; i++) {
      hex += bytes[i].toString(16).padStart(2, "0");
    }
    return hex;
  } catch {
    return "";
  }
}
let imageMoodData = null;
let imageMoodCoverDataUrl = "";
let pendingGeneratedCoverDataUrl = "";
let pendingBackendTaskId = "";
const PENDING_TASK_KEY = "mas:pending_backend_task_v1";
const RECOVERY_TASK_KEY = "mas:gen_task_recovery_v1";
/** Suno keeps finished files ~15 days per their docs — don't offer recovery after that. */
const RECOVERY_MAX_AGE_MS = 15 * 24 * 60 * 60 * 1000;
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
/** @type {null | "upload" | "record" | "remix"} */
var vocalRefOrigin = null;

function refreshVocalReferenceUi() {
  const f = getVocalReferenceFile();
  const strip = els.vocalRefActiveStrip;
  const nameEl = els.vocalRefActiveName;
  const metaEl = els.vocalRefActiveMeta;
  const emptyHint = els.sunoVocalUploadName;
  if (!f || !f.size) {
    if (strip) strip.hidden = true;
    if (nameEl) nameEl.textContent = "";
    if (metaEl) metaEl.textContent = "";
    if (emptyHint) {
      emptyHint.style.display = "";
      emptyHint.textContent = "No vocal reference attached.";
    }
  } else {
    if (strip) strip.hidden = false;
    if (emptyHint) emptyHint.style.display = "none";
    if (nameEl) nameEl.textContent = f.name || "audio";
    const kb = Math.max(1, Math.round(f.size / 1024));
    let originLabel = "Attached";
    if (vocalRefOrigin === "upload") originLabel = "Uploaded file";
    else if (vocalRefOrigin === "record") originLabel = "Recorded take";
    else if (vocalRefOrigin === "remix") originLabel = "Hub remix source";
    if (metaEl) metaEl.textContent = `${originLabel} · ~${kb} KB`;
  }
  updateVocalRefPreviewState();
  renderReferenceHints();
  // Keep the persona banner copy in sync with whether a reference is
  // attached — that's the only way the warning state can be triggered.
  try { renderActivePersonaBanner(); } catch {}
}

function setVocalRefFile(file, label, origin) {
  const prevFile = currentVocalRefFile;
  currentVocalRefFile = file || null;
  vocalRefBlob = null;
  if (!file) {
    vocalRefOrigin = null;
  } else if (origin) {
    vocalRefOrigin = origin;
  }
  if (els.sunoVocalUploadName && !file) {
    els.sunoVocalUploadName.textContent = "No vocal reference attached.";
  }
  // ROOT CAUSE FIX for "Suno used an OLD voice on my new recording":
  //   Suno's upload-cover (Full Song) re-sings the new melody using the
  //   `personaId` we send. A previously created persona was being silently
  //   restored from localStorage on every load and silently included in
  //   the request — so even after recording a brand-new vocal, the OUTPUT
  //   was sung in the old persona's voice. Fresh reference = fresh intent;
  //   clear the active persona so the new audio's analysis drives the
  //   voice. User can re-pick a persona from Advanced if they want to.
  //
  // Same logic for a fresh upload — "here's new audio" implies "use this,
  // not an older saved voice". Remix origin keeps the persona because it
  // intentionally remixes an existing arrangement.
  if (file && (origin === "record" || origin === "upload")) {
    try { clearActiveVoicePersona({ silent: prevFile !== file }); } catch {}
  }
  refreshVocalReferenceUi();
  // Hum is ALWAYS "AI re-sings on new arrangement" (Suno upload-cover) now.
  // We never auto-switch to Add Instrumental — that path kept the user's
  // raw hum in the final mix and confused the UX. If lyrics are empty at
  // submit time, the Generate flow calls Gemini to draft them so Suno's
  // upload-cover endpoint has non-empty lyrics to sing.
  if (els.vocalInstrumentalOnly) els.vocalInstrumentalOnly.value = "0";
}

/** Centralised "stop using any saved voice persona". Called when the user
 *  records a fresh vocal so an old persona can't silently re-sing it.
 *  Also exposed via the persona banner's × button. */
function clearActiveVoicePersona(opts = {}) {
  let hadActive = false;
  try {
    const prev = (loadPersonaSelection() || "").trim();
    const dom = String(els.sunoPersonaId?.value || "").trim();
    hadActive = Boolean(prev || dom);
    if (els.sunoPersonaId) els.sunoPersonaId.value = "";
    savePersonaSelection("");
  } catch {}
  try { renderPersonaSelect(); } catch {}
  try { renderActivePersonaBanner(); } catch {}
  if (hadActive && !opts.silent) {
    try {
      showToast("Voice persona cleared — your new recording's voice will drive the next song.", {
        icon: "♪",
        durationMs: 4200,
      });
    } catch {}
  }
}

function getVocalReferenceFile() {
  // Prefer the promoted File (record/upload/remix) over a raw blob. A stray
  // `vocalRefBlob` from a failed promote or race must NOT override the
  // current attachment — that was a source of "always the old vocal".
  if (currentVocalRefFile && currentVocalRefFile.size > 0) return currentVocalRefFile;
  if (vocalRefBlob && vocalRefBlob.size > 0) {
    const name = vocalReferenceFilenameForMime(vocalRefBlob.type);
    return new File([vocalRefBlob], name, {
      type: vocalRefBlob.type || "audio/webm",
    });
  }
  return null;
}

/**
 * Pick the exact File bytes we send to `/api/suno/stems`.
 *
 * iOS Safari sometimes keeps an old `File` on the hidden `<input type=file>`
 * even after we assigned `input.value = ""` following a mic recording. That
 * lets the DOM disagree with `currentVocalRefFile` at submit time — Suno
 * receives yesterday's upload instead of today's hum. Recording-origin and
 * remix-origin references must ignore the DOM entirely; picker uploads use
 * `files[0]` as ground truth.
 */
function resolveVocalReferenceForSubmit() {
  try {
    const input = els.sunoVocalUpload;
    const domFile = input?.files?.[0] || null;

    if (vocalRefOrigin === "record" && currentVocalRefFile) {
      try {
        if (input) input.value = "";
      } catch {}
      return currentVocalRefFile;
    }

    if (vocalRefOrigin === "remix" && currentVocalRefFile) {
      return currentVocalRefFile;
    }

    if (domFile && vocalRefOrigin === "upload") {
      if (currentVocalRefFile !== domFile) {
        setVocalRefFile(domFile, `Voice reference attached: ${domFile.name}`, "upload");
      }
      return domFile;
    }

    return getVocalReferenceFile();
  } catch {
    return getVocalReferenceFile();
  }
}

function clearVocalReferenceSelection(opts = {}) {
  const preserveRemixBanner = opts.preserveRemixBanner === true;
  currentVocalRefFile = null;
  vocalRefBlob = null;
  vocalRefOrigin = null;
  vocalRefChunks = [];
  // Wipe any cached fingerprint so the next recording starts fresh in the UI.
  lastVocalRefFingerprint = "";
  // The previous Suno temporary-upload URL must not survive into the next
  // generation. If a stale URL ever leaked back through, Suno would re-use
  // the OLD audio for the new request — which is exactly the "old vocal
  // stuck" symptom users report on iOS WKWebView.
  lastSunoReferenceUrl = "";
  if (els.sunoVocalUpload) els.sunoVocalUpload.value = "";
  clearVocalRefPreviewUrl();
  refreshVocalReferenceUi();
  if (!preserveRemixBanner) clearRemixSource({ keepRefFile: true });
}

/**
 * If the hidden file input lost its selection but JS still holds a File
 * (or the opposite), fix the mismatch. Cold-load safety only — bfcache is
 * handled in `pageshow`.
 */
function syncVocalReferenceFromDom() {
  try {
    const domFile = els.sunoVocalUpload?.files?.[0];
    // Mic/remix clips never sit on the hidden file input — only picker uploads do.
    // Clearing JS state whenever `files` is empty would wipe a fresh recording.
    if (!domFile && currentVocalRefFile && vocalRefOrigin === "upload") {
      currentVocalRefFile = null;
      vocalRefOrigin = null;
      vocalRefBlob = null;
      refreshVocalReferenceUi();
      return;
    }
    if (domFile && !currentVocalRefFile && !vocalRefBlob) {
      setVocalRefFile(domFile, `Voice reference attached: ${domFile.name}`, "upload");
    }
  } catch {}
}

/**
 * Hub Remix state. When set, the Generate flow uploads this audio as the
 * melody reference and routes through Suno's upload-cover endpoint, so the
 * new lyrics are sung over the same arrangement instead of a brand-new song.
 */
var currentRemixSource = null;

function setRemixSource(src) {
  const u = src && String(src.originalUrl || src.url || "").trim();
  currentRemixSource = u ? { ...src } : null;
  renderRemixSourceBanner();
}

function clearRemixSource({ keepRefFile = false } = {}) {
  if (!currentRemixSource) {
    renderRemixSourceBanner();
    return;
  }
  currentRemixSource = null;
  renderRemixSourceBanner();
  if (!keepRefFile) {
    try { clearVocalReferenceSelection({ preserveRemixBanner: true }); } catch {}
  }
}

function renderRemixSourceBanner() {
  if (!els.remixSourceBanner) return;
  if (!currentRemixSource) {
    els.remixSourceBanner.hidden = true;
    if (els.remixSourceCover) els.remixSourceCover.style.backgroundImage = "";
    return;
  }
  els.remixSourceBanner.hidden = false;
  const title = String(currentRemixSource.title || "Track").trim() || "Track";
  const creator = String(currentRemixSource.creator || "").trim();
  if (els.remixSourceTitle) {
    els.remixSourceTitle.textContent = creator ? `${title} · @${creator}` : title;
  }
  if (els.remixSourceSub) {
    els.remixSourceSub.textContent = "Your new lyrics will be sung over this melody.";
  }
  if (els.remixSourceCover) {
    const cover = String(currentRemixSource.coverUrl || "").trim();
    els.remixSourceCover.style.backgroundImage = cover ? `url("${cover.replace(/"/g, '\\"')}")` : "";
  }
}

/** Fetch any audio URL and return its Blob. Tries the same-origin proxy
 *  first (handles CORS-locked CDNs reliably); on network or upstream
 *  failure, falls back to the raw URL when it's already same-origin or
 *  obviously CORS-permissive. Adds a 25s timeout so we don't hang
 *  forever on a stuck connection.
 *
 *  Returns the Blob on success. Throws an Error with a useful message
 *  describing where the failure happened. */
async function fetchAudioForRemix(rawUrl) {
  const original = String(rawUrl || "").trim();
  if (!original || original === "#") {
    throw new Error("This post has no audio URL");
  }
  // blob: URLs (a freshly-shared local placeholder) — fetch directly,
  // they live in the current document context.
  if (original.startsWith("blob:") || original.startsWith("data:")) {
    const r = await fetch(original);
    if (!r.ok) throw new Error(`Local source unreachable (${r.status})`);
    return r.blob();
  }

  const proxyOnce = async (target) => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 25000);
    try {
      const r = await fetch(target, {
        method: "GET",
        cache: "no-store",
        signal: ctrl.signal,
        credentials: "omit",
      });
      if (!r.ok) {
        let detail = "";
        try {
          const ct = r.headers.get("content-type") || "";
          if (ct.includes("application/json")) {
            const j = await r.json();
            detail = j?.error || j?.message || JSON.stringify(j).slice(0, 140);
          } else {
            detail = (await r.text()).slice(0, 140);
          }
        } catch {}
        const msg = detail ? `${r.status} — ${detail}` : `HTTP ${r.status}`;
        const err = new Error(msg);
        err._httpStatus = r.status;
        throw err;
      }
      const blob = await r.blob();
      if (!blob || blob.size < 1024) throw new Error("Source audio is empty");
      return blob;
    } finally {
      clearTimeout(timer);
    }
  };

  // Pick a sensible first attempt. If `original` is ALREADY a
  // `/api/suno/audio?url=…` wrapper, hit it directly (don't double-wrap)
  // so the server doesn't try to URL-parse a relative path. Otherwise,
  // wrap into the proxy.
  let firstUrl;
  if (original.includes("/api/suno/audio?")) {
    firstUrl = hubAbsoluteUrl(original);
  } else if (/^https?:\/\//i.test(original)) {
    firstUrl = hubAbsoluteUrl(toAudioProxyUrl(original));
  } else {
    firstUrl = hubAbsoluteUrl(original);
  }

  try {
    return await proxyOnce(firstUrl);
  } catch (eFirst) {
    console.warn("[remix] proxy fetch failed", { firstUrl, err: eFirst });
    // Last-ditch: try the raw CDN URL directly. Will only work if the
    // CDN sets permissive CORS, but it's a free retry — we already
    // know the proxy didn't deliver. This commonly rescues iOS Safari
    // when the serverless function timed out on a slow backend.
    if (/^https?:\/\//i.test(original) && original !== firstUrl) {
      try {
        return await proxyOnce(original);
      } catch (eSecond) {
        console.warn("[remix] direct fetch failed", { original, err: eSecond });
        // Surface the most informative error.
        const reason =
          eFirst?.message && eFirst.message !== "Failed to fetch"
            ? eFirst.message
            : eSecond?.message || "Network error";
        throw new Error(reason);
      }
    }
    throw eFirst;
  }
}

async function startHubRemix(post) {
  if (!post || !post.url) {
    showToast("Cannot remix: this post has no audio.", { icon: "!", durationMs: 3200 });
    return;
  }
  // Hub list rows ship a minimal `meta` (egress saver). When the user
  // actually opens Remix we need the heavy keys (lyricsInput, styleInput,
  // dialect, etc.) — fetch them on demand for this single post.
  if (post.id && (!post.meta || (!post.meta.lyricsInput && !post.meta.styleInput))) {
    try {
      const fullMeta = await hubFetchPostMetaFull(post.id);
      if (fullMeta && typeof fullMeta === "object") {
        post = { ...post, meta: { ...(post.meta || {}), ...fullMeta } };
      }
    } catch {}
  }
  try {
    setStatus("Loading remix source…");
    showToast("Loading remix source…", { icon: "♪", durationMs: 1600 });
    const blob = await fetchAudioForRemix(post.url);
    const mime = blob.type && blob.type !== "application/octet-stream" ? blob.type : "audio/mpeg";
    const ext = mime.includes("mpeg") ? "mp3" : (mime.split("/")[1] || "mp3").split(";")[0];
    const safeBase = String(post.title || "remix-source")
      .replace(/[^a-z0-9_-]+/gi, "-")
      .slice(0, 48) || "remix-source";
    const file = new File([blob], `${safeBase}.${ext}`, { type: mime });
    setVocalRefFile(file, `Remix source: ${post.title || "Track"}`, "remix");
    if (els.vocalInstrumentalOnly) els.vocalInstrumentalOnly.value = "0";
    if (els.vocalModeFull) els.vocalModeFull.classList.add("active");
    if (els.vocalModeInstrumental) els.vocalModeInstrumental.classList.remove("active");
    setRemixSource({
      id: post.id,
      title: post.title || "",
      creator: post.creator || "",
      coverUrl: post.artUrl || "",
      originalUrl: post.url || "",
      meta: post.meta || null,
    });
    if (els.sunoPrompt) els.sunoPrompt.value = String(post?.meta?.lyricsInput || "").trim();
    if (els.sunoStyle) els.sunoStyle.value = String(post?.meta?.styleInput || "").trim();
    if (els.sunoTitle) els.sunoTitle.value = `${post.title || "Track"} Remix`;
    location.hash = "#/generate";
    setStatus(`Remix ready: ${post.title || "Track"} — adjust lyrics and tap Generate.`);
    try { syncGenerateOrbVisibility(); } catch {}
  } catch (e) {
    console.error("[hub remix] failed", e);
    const baseMsg = String(e?.message || "error");
    // Translate the obscure native fetch errors into something the user
    // can act on. "Failed to fetch" is what every browser throws when
    // the network request never lands — usually means the proxy
    // timed out, the device is offline, or a service worker blocked it.
    const friendly = /failed to fetch|networkerror|load failed/i.test(baseMsg)
      ? "Network blocked the source — check your connection or try again."
      : baseMsg;
    showToast(`Could not load remix source: ${friendly}`, { icon: "!", durationMs: 3600 });
    setStatus("Remix could not be loaded.");
  }
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
/** Stub: called after Studio stem WAV export. The old "My voice + band"
 *  Vocal Room hook was removed with `voicePlusBand.js`; export still
 *  updates `mixerDownloadLink` directly. Kept so Export Mix never throws.
 */
function updateVocalRoomAvailability() {}
function openVocalRecorderModal() {
  if (!els.vocalRecorderModal) return;
  els.vocalRecorderModal.style.display = "";
  setRecorderToggleRecordingUi(Boolean(vocalRefRecorder && vocalRefRecorder.state === "recording"));
}
function closeVocalRecorderModal() {
  if (!els.vocalRecorderModal) return;
  els.vocalRecorderModal.style.display = "none";
  setRecorderToggleRecordingUi(false);
}
function setVocalRecorderStatusAll(text) {
  if (els.recorderStatus) els.recorderStatus.textContent = text;
}
function setRecorderToggleRecordingUi(active) {
  if (els.btnRecorderToggle) els.btnRecorderToggle.classList.toggle("isRecording", Boolean(active));
}
async function toggleVocalReferenceRecorderFromUi() {
  const isRecording = Boolean(vocalRefRecorder && vocalRefRecorder.state === "recording");
  if (!isRecording) {
    try {
      await startVocalReferenceRecording();
    } catch (e) {
      const msg = e?.message || String(e);
      setStatus(`Microphone access failed: ${msg}`);
      try {
        showToast(`Microphone: ${msg}`, { durationMs: 5500, icon: "⚠" });
      } catch {}
      return;
    }
    setRecorderToggleRecordingUi(true);
    setVocalRecorderStatusAll("Recording… tap to stop");
  } else {
    stopVocalReferenceRecording();
    setRecorderToggleRecordingUi(false);
    setVocalRecorderStatusAll("Recorded. Tap Use recording.");
  }
}
/** WKWebView / Safari record AAC in MP4 containers — not WebM. Prefer mp4 on
 *  iOS and Capacitor so MediaRecorder actually emits bytes; WebM-first breaks
 *  mic capture there (empty blobs / silent failure). */
function isSafariLikeRecorderEnv() {
  try {
    if (window?.Capacitor?.isNativePlatform?.()) return true;
    const ua = navigator.userAgent || "";
    if (/iPhone|iPad|iPod/i.test(ua)) return true;
    if (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1) return true;
    return /^((?!chrome|android).)*safari/i.test(ua);
  } catch {
    return false;
  }
}

function vocalReferenceFilenameForMime(mime) {
  const t = String(mime || "").toLowerCase();
  if (t.includes("mp4") || t.includes("aac") || t.includes("mpeg")) return "vocal-reference.m4a";
  if (t.includes("webm")) return "vocal-reference.webm";
  if (t.includes("ogg")) return "vocal-reference.ogg";
  return "vocal-reference.m4a";
}

function pickRecorderMimeType() {
  const safariLike = isSafariLikeRecorderEnv();
  const mp4First = [
    "audio/mp4",
    "audio/mp4;codecs=mp4a.40.2",
    "audio/webm;codecs=opus",
    "audio/webm",
  ];
  const webFirst = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
    "audio/mp4;codecs=mp4a.40.2",
  ];
  const candidates = safariLike ? mp4First : webFirst;
  for (const m of candidates) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported?.(m)) return m;
  }
  return "";
}

async function startVocalReferenceRecording() {
  vocalRecordSessionId += 1;
  const recordSession = vocalRecordSessionId;
  const hadExisting = Boolean(getVocalReferenceFile());
  // Invalidate any in-flight onstop from a previous recorder instance before
  // we touch shared state (prevents "new hum overwrote by old onstop").
  try {
    if (vocalRefRecorder && vocalRefRecorder.state !== "inactive") {
      vocalRefRecorder.stop();
    }
  } catch {}
  // Mic capture supersedes any prior upload. Clear JS state + the hidden
  // file input *before* capture starts so WebKit can't glue an obsolete
  // File object back onto the input while we're recording.
  try {
    if (els.sunoVocalUpload) els.sunoVocalUpload.value = "";
  } catch {}
  currentVocalRefFile = null;
  vocalRefBlob = null;
  vocalRefOrigin = null;
  vocalRefChunks = [];
  // Any previously cached Suno temporary upload URL must not survive a
  // fresh recording. Otherwise the *next* generate could (in theory)
  // see the stale URL and ask Suno to reuse the old audio.
  lastSunoReferenceUrl = "";
  lastVocalRefFingerprint = "";
  refreshVocalReferenceUi();

  const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
  const mimeType = pickRecorderMimeType();
  const rec = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
  const effectiveMime = () => (rec.mimeType || mimeType || "audio/webm");
  const chunks = [];
  rec.ondataavailable = (e) => {
    if (e.data && e.data.size) chunks.push(e.data);
  };
  rec.onstop = async () => {
    if (recordSession !== vocalRecordSessionId) return;
    vocalRefChunks = chunks.slice();
    const blobType = effectiveMime();
    const blob = new Blob(chunks, { type: blobType });
    vocalRefBlob = blob;
    let promoted = false;
    if (blob && blob.size > 0) {
      const name = vocalReferenceFilenameForMime(blobType);
      const recordedFile = new File([blob], name, {
        type: blob.type || blobType,
      });
      if (els.sunoVocalUpload) {
        try { els.sunoVocalUpload.value = ""; } catch {}
      }
      setVocalRefFile(recordedFile, "Voice reference recorded and attached.", "record");
      promoted = true;
      // Byte fingerprint diagnostic. If this is the SAME hex as a previous
      // recording, the recorder is silently returning cached bytes — that's
      // a MediaRecorder/WebKit bug, not a sticky JS variable. Surfacing it
      // to the user (and console) gives us a definitive verdict.
      try {
        const fp = await computeBytesFingerprint(blob);
        lastVocalRefFingerprint = fp;
        try {
          console.info("[voice] recording fingerprint", { size: blob.size, mime: blobType, fp });
        } catch {}
        try {
          showToast(`Recorded ${Math.max(1, Math.round(blob.size / 1024))} KB · #${fp.slice(0, 8)}`, {
            icon: "♪",
            durationMs: 5200,
          });
        } catch {}
      } catch {}
    } else {
      try {
        showToast("Recording was empty. Check the microphone in Settings, then try again.", {
          durationMs: 5000,
          icon: "⚠",
        });
      } catch {}
      renderReferenceHints();
      updateVocalRefPreviewState();
    }
    if (els.btnRecorderUse) {
      els.btnRecorderUse.disabled = !(promoted || getVocalReferenceFile());
    }
    setVocalRecorderStatusAll(
      promoted
        ? "Recording ready. Tap Use recording or close."
        : "Recording empty. Try again."
    );
  };
  vocalRefStream = stream;
  vocalRefRecorder = rec;
  const safariLike = isSafariLikeRecorderEnv();
  try {
    // iOS WKWebView often delivers zero-size blobs unless we use a timeslice.
    if (safariLike) rec.start(250);
    else rec.start();
  } catch (e) {
    try {
      rec.start();
    } catch (e2) {
      try {
        stream.getTracks().forEach((t) => t.stop());
      } catch {}
      vocalRefRecorder = null;
      vocalRefStream = null;
      throw e2 || e;
    }
  }
  if (hadExisting) {
    try {
      showToast("Replacing attached audio with this recording.", { durationMs: 3800, icon: "↻" });
    } catch {}
  }
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

/* ----------------------------------------------------------------------
 *  Calling card (welcome voice note)
 *
 *  Long-press on your own avatar opens a record sheet. We capture up to
 *  8 seconds of audio via MediaRecorder, upload the resulting blob to
 *  Supabase Storage at `calling_cards/<uid>/card.<ext>`, then persist
 *  the public URL to `profiles.calling_card_url`.
 *
 *  When ANY user opens a public profile (`#/u/handle`) for the FIRST
 *  TIME EVER on this device, the creator's calling card autoplays once
 *  at 60% volume. After that first play, the chip stays tap-to-play —
 *  for that profile and every future profile visit. Owners viewing
 *  their own profile never autoplay; they see a hint to record (if
 *  they haven't yet) or the card as a tap-to-play chip.
 *
 *  Performance shape:
 *  - Audio is preload="none" so we never download until tap/play call.
 *  - We don't block route render on the calling-card lookup; it's an
 *    out-of-band query that updates the chip when it resolves.
 *  - Settings has a global "Auto-play voice notes" toggle which lets
 *    users opt out entirely.
 * -------------------------------------------------------------------- */

const CALLING_CARD_MAX_MS = 8000;
const CALLING_CARD_MAX_BYTES = 200 * 1024;
const CALLING_CARD_PLAYBACK_VOL = 0.6;
const CALLING_CARD_AUTOPLAY_KEY = "nabadai.callingCard.autoplayedOnce.v1";
const CALLING_CARD_AUTOPLAY_PREF_KEY = "nabadai.callingCard.autoplayEnabled.v1";

let callingCardRecState = "idle"; // idle | recording | ready | uploading | playing
let callingCardStream = null;
let callingCardRecorder = null;
let callingCardChunks = [];
let callingCardBlob = null;
let callingCardBlobUrl = "";
let callingCardStartedAt = 0;
let callingCardTickRaf = 0;
let callingCardAutostopTimer = 0;

function isCallingCardAutoplayEnabled() {
  try {
    const v = localStorage.getItem(CALLING_CARD_AUTOPLAY_PREF_KEY);
    return v === null ? true : v === "1";
  } catch { return true; }
}
function setCallingCardAutoplayEnabled(on) {
  try { localStorage.setItem(CALLING_CARD_AUTOPLAY_PREF_KEY, on ? "1" : "0"); } catch {}
}
function hasAutoplayedCallingCardOnce() {
  try { return localStorage.getItem(CALLING_CARD_AUTOPLAY_KEY) === "1"; } catch { return false; }
}
function markAutoplayedCallingCardOnce() {
  try { localStorage.setItem(CALLING_CARD_AUTOPLAY_KEY, "1"); } catch {}
}

function pickCallingCardMimeType() {
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4;codecs=mp4a.40.2",
    "audio/mp4",
  ];
  for (const m of candidates) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported?.(m)) return m;
  }
  return "";
}
function callingCardExtensionFromMime(mime) {
  const m = String(mime || "").toLowerCase();
  if (m.includes("mp4")) return "m4a";
  if (m.includes("mpeg")) return "mp3";
  return "webm";
}

function setCallingCardRingProgress(ratio) {
  const fill = els.callingCardRingFill;
  if (!fill) return;
  const r = 54;
  const circumference = 2 * Math.PI * r; // ≈ 339.292
  const clamped = Math.max(0, Math.min(1, Number(ratio) || 0));
  fill.style.strokeDashoffset = String(circumference * (1 - clamped));
}
function setCallingCardState(state) {
  callingCardRecState = state;
  const wrap = els.callingCardRingWrap;
  if (wrap) wrap.dataset.state = state;
  const wave = els.callingCardWaveBar;
  if (wave) wave.classList.toggle("isActive", state === "recording" || state === "playing");
}
function resetCallingCardSheet({ keepBlob = false } = {}) {
  if (callingCardAutostopTimer) {
    try { clearTimeout(callingCardAutostopTimer); } catch {}
    callingCardAutostopTimer = 0;
  }
  if (callingCardTickRaf) {
    try { cancelAnimationFrame(callingCardTickRaf); } catch {}
    callingCardTickRaf = 0;
  }
  setCallingCardRingProgress(0);
  setCallingCardState("idle");
  if (els.callingCardStatus) {
    els.callingCardStatus.textContent = "Tap to start. We’ll stop at 8s.";
  }
  if (!keepBlob) {
    callingCardBlob = null;
    if (callingCardBlobUrl) {
      try { URL.revokeObjectURL(callingCardBlobUrl); } catch {}
      callingCardBlobUrl = "";
    }
    callingCardChunks = [];
    if (els.btnCallingCardSave) els.btnCallingCardSave.disabled = true;
    if (els.btnCallingCardDiscard) els.btnCallingCardDiscard.disabled = true;
  }
  if (els.callingCardPreview) {
    try { els.callingCardPreview.pause(); } catch {}
    els.callingCardPreview.removeAttribute("src");
    try { els.callingCardPreview.load(); } catch {}
  }
}
function openCallingCardModal() {
  if (!els.callingCardModal) return;
  if (!authSession?.user?.id) {
    showToast("Sign in to record a calling card.");
    location.hash = "#/auth";
    return;
  }
  resetCallingCardSheet({ keepBlob: false });
  // Show "remove current" only if we already have a card.
  if (els.btnCallingCardDelete) {
    const has = Boolean(activeProfile?.callingCardUrl);
    els.btnCallingCardDelete.style.display = has ? "" : "none";
  }
  els.callingCardModal.style.display = "";
  els.callingCardModal.setAttribute("aria-hidden", "false");
  // Pause Hub if playing — clean recording, no bleed.
  pauseHubForRouteChange();
}
function closeCallingCardModal() {
  if (!els.callingCardModal) return;
  // If recording is in flight, stop the stream cleanly first.
  if (callingCardRecState === "recording") {
    try { stopCallingCardRecording(); } catch {}
  }
  resetCallingCardSheet();
  els.callingCardModal.style.display = "none";
  els.callingCardModal.setAttribute("aria-hidden", "true");
}

async function startCallingCardRecording() {
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
  } catch (e) {
    showToast("Microphone permission needed.");
    return;
  }
  const mimeType = pickCallingCardMimeType();
  let rec;
  try {
    rec = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
  } catch (e) {
    try { stream.getTracks().forEach((t) => t.stop()); } catch {}
    showToast("Recorder not supported on this device.");
    return;
  }
  callingCardChunks = [];
  rec.ondataavailable = (e) => {
    if (e.data && e.data.size) callingCardChunks.push(e.data);
  };
  rec.onstop = () => {
    try { stream.getTracks().forEach((t) => t.stop()); } catch {}
    callingCardStream = null;
    callingCardRecorder = null;
    if (callingCardTickRaf) {
      try { cancelAnimationFrame(callingCardTickRaf); } catch {}
      callingCardTickRaf = 0;
    }
    if (callingCardAutostopTimer) {
      try { clearTimeout(callingCardAutostopTimer); } catch {}
      callingCardAutostopTimer = 0;
    }
    const blob = new Blob(callingCardChunks, { type: rec.mimeType || mimeType || "audio/webm" });
    if (!blob.size) {
      setCallingCardState("idle");
      if (els.callingCardStatus) els.callingCardStatus.textContent = "Recording empty. Try again.";
      return;
    }
    if (blob.size > CALLING_CARD_MAX_BYTES) {
      setCallingCardState("idle");
      if (els.callingCardStatus) {
        els.callingCardStatus.textContent = "Recording too large. Try a shorter take.";
      }
      return;
    }
    callingCardBlob = blob;
    if (callingCardBlobUrl) {
      try { URL.revokeObjectURL(callingCardBlobUrl); } catch {}
    }
    callingCardBlobUrl = URL.createObjectURL(blob);
    if (els.callingCardPreview) {
      els.callingCardPreview.src = callingCardBlobUrl;
      try { els.callingCardPreview.load(); } catch {}
    }
    setCallingCardState("ready");
    setCallingCardRingProgress(1);
    if (els.callingCardStatus) {
      els.callingCardStatus.textContent = "Tap ▶ to preview, or Save.";
    }
    if (els.btnCallingCardSave) els.btnCallingCardSave.disabled = false;
    if (els.btnCallingCardDiscard) els.btnCallingCardDiscard.disabled = false;
  };
  callingCardStream = stream;
  callingCardRecorder = rec;
  try {
    rec.start();
  } catch (e) {
    try { stream.getTracks().forEach((t) => t.stop()); } catch {}
    showToast("Couldn’t start recording.");
    return;
  }
  callingCardStartedAt = performance.now();
  setCallingCardState("recording");
  if (els.callingCardStatus) els.callingCardStatus.textContent = "Recording… speak now.";
  // Animate the progress ring 0→1 across CALLING_CARD_MAX_MS.
  const tick = () => {
    if (callingCardRecState !== "recording") return;
    const elapsed = performance.now() - callingCardStartedAt;
    const r = Math.min(1, elapsed / CALLING_CARD_MAX_MS);
    setCallingCardRingProgress(r);
    if (r < 1) callingCardTickRaf = requestAnimationFrame(tick);
  };
  callingCardTickRaf = requestAnimationFrame(tick);
  callingCardAutostopTimer = setTimeout(() => {
    if (callingCardRecState === "recording") stopCallingCardRecording();
  }, CALLING_CARD_MAX_MS + 50);
}
function stopCallingCardRecording() {
  try {
    if (callingCardRecorder && callingCardRecorder.state !== "inactive") {
      callingCardRecorder.stop();
    }
  } catch {}
}

async function previewOrPauseCallingCard() {
  const audio = els.callingCardPreview;
  if (!audio) return;
  if (audio.paused) {
    audio.volume = 1.0;
    try { await audio.play(); setCallingCardState("playing"); } catch {}
    audio.onended = () => {
      setCallingCardState("ready");
    };
  } else {
    try { audio.pause(); } catch {}
    setCallingCardState("ready");
  }
}

function callingCardStorageKey(uid, ext) {
  return `${uid}/card.${ext}`;
}
async function uploadCallingCardBlob(blob) {
  const token = getSupabaseAuthToken();
  const uid = authSession?.user?.id;
  if (!token || !uid) throw new Error("Login required");
  if (!SUPABASE_URL) throw new Error("Supabase not configured");
  const ext = callingCardExtensionFromMime(blob.type);
  const key = callingCardStorageKey(uid, ext);
  const r = await fetch(`${SUPABASE_URL}/storage/v1/object/calling_cards/${key}`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${token}`,
      "Content-Type": blob.type || "audio/webm",
      "x-upsert": "true",
      "Cache-Control": "max-age=3600",
    },
    body: blob,
  });
  if (!r.ok) {
    const t = await r.text().catch(() => "");
    throw new Error(`Upload failed (${r.status}): ${t.slice(0, 140)}`);
  }
  // Public URL pattern for public buckets. Append a cache-buster from
  // the upload timestamp so listeners pull the new version even when
  // the path didn't change.
  const ts = Date.now();
  return {
    url: `${SUPABASE_URL}/storage/v1/object/public/calling_cards/${key}?v=${ts}`,
    updatedAt: ts,
    storageKey: key,
  };
}
async function deleteCallingCardObject(storageKey) {
  const token = getSupabaseAuthToken();
  if (!token || !SUPABASE_URL || !storageKey) return;
  await fetch(`${SUPABASE_URL}/storage/v1/object/calling_cards/${storageKey}`, {
    method: "DELETE",
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${token}`,
    },
  }).catch(() => {});
}

async function saveCallingCard() {
  if (!callingCardBlob) return;
  if (!authSession?.user?.id) {
    showToast("Sign in to save your calling card.");
    return;
  }
  if (els.btnCallingCardSave) els.btnCallingCardSave.disabled = true;
  if (els.btnCallingCardDiscard) els.btnCallingCardDiscard.disabled = true;
  setCallingCardState("uploading");
  if (els.callingCardStatus) els.callingCardStatus.textContent = "Uploading…";
  let result;
  try {
    result = await uploadCallingCardBlob(callingCardBlob);
  } catch (e) {
    setCallingCardState("ready");
    if (els.btnCallingCardSave) els.btnCallingCardSave.disabled = false;
    if (els.btnCallingCardDiscard) els.btnCallingCardDiscard.disabled = false;
    if (els.callingCardStatus) els.callingCardStatus.textContent = String(e?.message || e || "Upload failed.");
    showToast("Couldn’t upload calling card.");
    return;
  }
  // Persist on the profile row so visitors can read it back.
  activeProfile.callingCardUrl = result.url;
  activeProfile.callingCardUpdatedAt = result.updatedAt;
  try { localStorage.setItem(PROFILE_KEY, JSON.stringify(activeProfile)); } catch {}
  try { await supabaseUpsertProfile(activeProfile); } catch (e) {
    showToast("Saved on this device. Cloud sync failed.");
  }
  showToast("Calling card saved.", { icon: "✓" });
  renderProfileCallingCardHint();
  closeCallingCardModal();
}

async function discardCallingCardDraft() {
  resetCallingCardSheet({ keepBlob: false });
}
async function deleteExistingCallingCard() {
  if (!activeProfile?.callingCardUrl) return;
  if (!authSession?.user?.id) return;
  try {
    // Best-effort path extraction. The URL pattern is
    // `${SUPABASE_URL}/storage/v1/object/public/calling_cards/<uid>/card.<ext>?v=...`
    const u = new URL(activeProfile.callingCardUrl);
    const idx = u.pathname.indexOf("/calling_cards/");
    if (idx >= 0) {
      const storageKey = u.pathname.slice(idx + "/calling_cards/".length);
      await deleteCallingCardObject(storageKey);
    }
  } catch {}
  activeProfile.callingCardUrl = "";
  activeProfile.callingCardUpdatedAt = 0;
  try { localStorage.setItem(PROFILE_KEY, JSON.stringify(activeProfile)); } catch {}
  try { await supabaseUpsertProfile(activeProfile); } catch {}
  showToast("Calling card removed.");
  renderProfileCallingCardHint();
  closeCallingCardModal();
}

/** Forward to the unified voice chip renderer. The floating mic-badge
 *  has been retired — its job (signaling "you haven't recorded yet")
 *  is now handled by the voice chip in `record` mode, which doubles as
 *  the call-to-action and the play button once a card exists. */
function renderProfileCallingCardHint() {
  renderProfileAuraVoiceChip();
}

/** Audio element used to preview the OWN profile's calling card from
 *  the voice chip. Distinct from the recorder's preview (which plays a
 *  draft blob) and from the public profile's audio (which plays a
 *  visited creator's card). */
let _ownProfileCardAudio = null;
function _ownProfileCardAudioInstance() {
  if (_ownProfileCardAudio) return _ownProfileCardAudio;
  const a = new Audio();
  a.preload = "none";
  a.playsInline = true;
  _ownProfileCardAudio = a;
  return a;
}

/** Render the unified voice chip on the user's OWN profile.
 *
 *  Behavior matrix:
 *    - Edit mode             → show the timbre <select> (so you can pick).
 *    - View, has card        → button "▶ Voice · X" (tap to play preview).
 *    - View, no card, signed in → button "+ Add voice note · X" (tap → recorder).
 *    - View, no card, signed out → button hidden (nothing to do).
 *    - No timbre, no card    → button still useful as the recorder CTA.
 */
function renderProfileAuraVoiceChip() {
  const slot = els.profileAuraVoiceChipSlot;
  const select = els.profilePreviewTimbreInput;
  const btn = els.profilePreviewVoiceChipBtn;
  if (!slot || !select || !btn) return;
  const editing = Boolean(profileEditing);
  // The playable voice-note chip is retired. In edit mode we still
  // show the timbre <select> so users can pick their voice range
  // (it surfaces next to the @handle in view mode). In view mode
  // the whole slot collapses — timbre is read from #profileVoiceTimbreInline.
  btn.style.display = "none";
  if (editing) {
    select.style.display = "";
    slot.style.display = "";
  } else {
    select.style.display = "none";
    slot.style.display = "none";
  }
}

/** Toggle play/pause for the OWN-profile calling card preview. Wires
 *  up the chip's data-state events so the waveform animates. */
async function toggleOwnCallingCardPreview() {
  const btn = els.profilePreviewVoiceChipBtn;
  const url = activeProfile?.callingCardUrl;
  if (!btn || !url) return;
  const audio = _ownProfileCardAudioInstance();
  if (audio.src !== url) {
    audio.src = url;
    try { audio.load(); } catch {}
  }
  if (audio.paused) {
    audio.volume = CALLING_CARD_PLAYBACK_VOL;
    try {
      await audio.play();
      btn.dataset.state = "playing";
      btn.setAttribute("aria-label", "Pause voice note");
    } catch {}
    audio.onended = () => {
      btn.dataset.state = "idle";
      btn.setAttribute("aria-label", "Play your voice note");
    };
    audio.onpause = () => {
      if (btn.dataset.state === "playing") {
        btn.dataset.state = "idle";
        btn.setAttribute("aria-label", "Play your voice note");
      }
    };
  } else {
    try { audio.pause(); } catch {}
    btn.dataset.state = "idle";
    btn.setAttribute("aria-label", "Play your voice note");
  }
}

/** Lookup another user's calling card by their public username. We use
 *  the anon key on a public-readable view of `profiles`. If RLS blocks
 *  the read we fail silently — the profile just won't show a chip. */
async function fetchCallingCardForUsername(username) {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return null;
  const handle = String(username || "").replace(/^@/, "").trim();
  if (!handle) return null;
  try {
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/profiles?username=eq.${encodeURIComponent(handle)}&select=calling_card_url,calling_card_updated_at&limit=1`,
      { headers: { apikey: SUPABASE_ANON_KEY } }
    );
    if (!r.ok) return null;
    const arr = await r.json().catch(() => []);
    if (!Array.isArray(arr) || !arr.length) return null;
    const row = arr[0];
    if (!row?.calling_card_url) return null;
    return {
      url: row.calling_card_url,
      updatedAt: row.calling_card_updated_at
        ? Date.parse(row.calling_card_updated_at) || 0
        : 0,
    };
  } catch {
    return null;
  }
}

/** Update the unified voice chip on the public profile to reflect
 *  whether the creator has a calling card, and apply the autoplay-once
 *  rule. The chip is the SAME element that displays "Voice · X" — it
 *  just gains a play affordance + audio when a card exists.
 *
 *    - Owner viewing their own #/u/handle: never autoplay (we already
 *      have the dedicated own-profile chip on /profile for that).
 *    - First profile visit ever (any creator) AND not opted out:
 *      autoplay once at 60% volume.
 *    - All subsequent visits: tap-to-play.
 */
async function refreshUserPublicCallingCard(_rawUsername) {
  // Voice-note / calling card feature retired across the app. We keep
  // this function so older callers don't crash, but it now just makes
  // sure any leftover chip + audio element stays silent and hidden.
  const chip = els.userPublicVoice;
  const audio = els.userPublicCallingCardAudio;
  if (chip) {
    chip.dataset.state = "idle";
    chip.dataset.hasCard = "false";
    chip.style.display = "none";
  }
  if (audio) {
    try { audio.pause(); } catch {}
    try { audio.removeAttribute("src"); audio.load(); } catch {}
  }
}

/** iOS Safari still fires selection UI on some long-press paths even when
 *  CSS says user-select:none. Belt-and-braces: kill selectstart /
 *  contextmenu / dragstart at capture phase on modal roots that are
 *  interactive shells (recording, not reading). */
function installModalNoSelectGuards(root) {
  if (!root || root.dataset.noSelectGuards === "1") return;
  root.dataset.noSelectGuards = "1";
  const stop = (ev) => {
    ev.preventDefault();
  };
  root.addEventListener("selectstart", stop, { capture: true });
  root.addEventListener("contextmenu", stop, { capture: true });
  root.addEventListener("dragstart", stop, { capture: true });
}

/** Long-press helper. Fires `cb()` after `holdMs` if the pointer
 *  hasn't moved or lifted. Cancels cleanly on movement, leave, lift,
 *  or scroll. Returns a teardown function in case we ever need it. */
function attachLongPress(el, cb, holdMs = 600) {
  if (!el || typeof cb !== "function") return () => {};
  let timer = 0;
  let startX = 0;
  let startY = 0;
  let active = false;
  const cancel = () => {
    if (timer) { clearTimeout(timer); timer = 0; }
    active = false;
  };
  const onDown = (ev) => {
    cancel();
    active = true;
    const t = ev.touches?.[0] || ev;
    startX = t.clientX || 0;
    startY = t.clientY || 0;
    timer = setTimeout(() => {
      if (!active) return;
      try { cb(ev); } catch {}
      cancel();
    }, holdMs);
  };
  const onMove = (ev) => {
    if (!active) return;
    const t = ev.touches?.[0] || ev;
    const dx = (t.clientX || 0) - startX;
    const dy = (t.clientY || 0) - startY;
    if (Math.hypot(dx, dy) > 10) cancel();
  };
  el.addEventListener("touchstart", onDown, { passive: true });
  el.addEventListener("touchmove", onMove, { passive: true });
  el.addEventListener("touchend", cancel, { passive: true });
  el.addEventListener("touchcancel", cancel, { passive: true });
  el.addEventListener("mousedown", onDown);
  el.addEventListener("mousemove", onMove);
  el.addEventListener("mouseup", cancel);
  el.addEventListener("mouseleave", cancel);
  return () => {
    cancel();
    el.removeEventListener("touchstart", onDown);
    el.removeEventListener("touchmove", onMove);
    el.removeEventListener("touchend", cancel);
    el.removeEventListener("touchcancel", cancel);
    el.removeEventListener("mousedown", onDown);
    el.removeEventListener("mousemove", onMove);
    el.removeEventListener("mouseup", cancel);
    el.removeEventListener("mouseleave", cancel);
  };
}

/** Walk nested Suno/Capacitor JSON for `taskId` / `task_id` strings.
 *  NOTE: `deepFindFirstStringByKeys(..., ["taskId"])` only returns values that
 *  start with `http` — so it never found task IDs. This helper is for IDs only.
 */
function deepFindTaskIdString(obj, depth = 0) {
  if (!obj || typeof obj !== "object" || depth > 16) return "";
  for (const [k, v] of Object.entries(obj)) {
    const kl = String(k).toLowerCase();
    if ((kl === "taskid" || kl === "task_id") && typeof v === "string" && v.trim()) {
      return v.trim();
    }
  }
  for (const [, v] of Object.entries(obj)) {
    if (!v || typeof v !== "object") continue;
    if (Array.isArray(v)) {
      for (const item of v) {
        const hit = deepFindTaskIdString(item, depth + 1);
        if (hit) return hit;
      }
    } else {
      const hit = deepFindTaskIdString(v, depth + 1);
      if (hit) return hit;
    }
  }
  return "";
}

function extractTaskIdLoose(data) {
  const direct =
    data?.data?.taskId ||
    data?.data?.task_id ||
    data?.taskId ||
    data?.task_id ||
    data?.data?.response?.taskId ||
    data?.data?.response?.task_id ||
    data?.response?.taskId ||
    data?.response?.task_id ||
    null;
  if (direct) return String(direct);
  const nested = deepFindTaskIdString(data);
  if (nested) return nested;
  return null;
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
/** Metadata-probed duration for the current `src` — stabilizes sliders on streamed audio. */
const audioDurationHint = { url: "", sec: 0 };
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
/** Persisted expand/collapse state for the persona card on Profile.
 *  We keep it compact by default so the card doesn't dominate the
 *  page, and remember the user's choice across sessions. */
const PROFILE_PERSONA_EXPANDED_KEY = "nabadai.profile.personaExpanded.v1";
function isProfilePersonaExpanded() {
  try { return localStorage.getItem(PROFILE_PERSONA_EXPANDED_KEY) === "1"; }
  catch { return false; }
}
function setProfilePersonaExpanded(on) {
  try { localStorage.setItem(PROFILE_PERSONA_EXPANDED_KEY, on ? "1" : "0"); } catch {}
  applyProfilePersonaExpandedUi(on);
}
function applyProfilePersonaExpandedUi(on) {
  const row = els.profilePersonaRow;
  const btn = els.profilePersonaToggle;
  const body = els.profilePersonaDetails;
  if (!row || !btn || !body) return;
  row.dataset.expanded = on ? "true" : "false";
  btn.setAttribute("aria-expanded", on ? "true" : "false");
  if (on) body.removeAttribute("hidden");
  else body.setAttribute("hidden", "");
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
  els.profilePersonaRow.style.display = "";
  const hint = document.getElementById("profilePersonaHint");
  if (id && hit) {
    els.profilePersonaLabel.textContent = hit.label || id.slice(0, 12) + "…";
    if (hint) hint.style.display = "none";
  } else {
    els.profilePersonaLabel.textContent = "No persona selected";
    if (hint) hint.style.display = "";
  }
  applyProfilePersonaExpandedUi(isProfilePersonaExpanded());
  renderActivePersonaBanner();
}

/**
 * Optional "Persona · …" line under the hero in **edit** mode when a
 * Suno persona is selected. Voice timbre is not mirrored here (hero
 * `<select>` + inline timbre next to the handle in view mode).
 */
function updateProfilePersonaInlineChip() {
  const el = els.profilePersonaInlineChip;
  if (!el) return;
  let id = "";
  try {
    id =
      String(els.sunoPersonaId?.value || "").trim()
      || (() => {
        try {
          return loadPersonaSelection().trim();
        } catch {
          return "";
        }
      })();
  } catch {}
  if (id) {
    let label = "";
    try {
      const list = loadPersonas();
      const hit = list.find((x) => String(x.personaId) === id);
      label = String(hit?.label || "").trim();
    } catch {}
    el.textContent = label ? `Persona · ${label}` : `Persona · ${id.slice(0, 10)}…`;
    el.style.display = "";
    return;
  }
  // Voice timbre: hero `<select>` while editing; next to @handle in view mode.
  // Do not mirror "Voice · …" here (duplicate).
  el.textContent = "";
  el.style.display = "none";
}

/**
 * Persona-active banner on the Create page.
 *
 * Mirrors the Remix banner pattern: when a persona is the current
 * selection (either coming from Profile via "Open Create" or chosen
 * directly inside Advanced options), surface it at the top of the
 * Create page so the user can:
 *   - see *which* voice is going into the next song,
 *   - jump straight into Advanced options to swap it (Change), or
 *   - clear it back to default voice (×).
 *
 * The banner is rendered on every persona-state change AND on route
 * change to "generate" so that returning to Create after selecting a
 * persona elsewhere shows the right state immediately.
 */
function renderActivePersonaBanner() {
  try {
    if (!els.personaActiveBanner || !els.personaActiveBannerLabel) return;
    const idFromSelect = String(els.sunoPersonaId?.value || "").trim();
    const idSaved = (() => {
      try { return loadPersonaSelection().trim(); } catch { return ""; }
    })();
    const id = idFromSelect || idSaved;
    if (!id) {
      els.personaActiveBanner.hidden = true;
      return;
    }
    const list = loadPersonas();
    const hit = list.find((x) => String(x.personaId) === id);
    if (!hit) {
      els.personaActiveBanner.hidden = true;
      return;
    }
    const label = String(hit.label || id.slice(0, 12) + "…").trim() || "Persona";
    els.personaActiveBannerLabel.textContent = label;
    // When a vocal reference is attached, escalate the banner copy so the
    // user can't miss that the persona will OVERRIDE the new recording's
    // voice. The persona-singing-over-new-recording surprise was the #1
    // reason for "Suno used the wrong voice" reports.
    try {
      const refAttached = Boolean(getVocalReferenceFile());
      const subEl = els.personaActiveBanner.querySelector(".remixSourceBannerSub");
      if (subEl) {
        subEl.textContent = refAttached
          ? "Heads up: this persona will replace your new recording's voice. Tap × to use the recording's voice instead."
          : "Your next song will use this voice. Tap Change to swap or clear it.";
      }
      els.personaActiveBanner.classList.toggle("personaActiveBanner--warn", refAttached);
    } catch {}
    els.personaActiveBanner.hidden = false;
  } finally {
    try { updateProfilePersonaInlineChip(); } catch {}
  }
}
const AUTH_SESSION_KEY = "mas:supabase:session:v1";
const AUTH_PKCE_KEY = "mas:supabase:pkce:v1";
let activeProfile = { id: "guest", username: "guest", email: "", soundCertified: false };
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

/** Resize an uploaded avatar in-browser before we keep it. Older code
 *  stored the raw camera/library photo as a multi-MB base64 string,
 *  which then bloated the profile JSON in localStorage and made boot
 *  slow because `loadProfile()` had to parse that on every open.
 *  320 px square at JPEG q=0.82 is plenty for a 96 px avatar. */
async function compressAvatarFile(file, { maxSize = 320, quality = 0.82 } = {}) {
  if (!file) return "";
  if (typeof createImageBitmap !== "function" || typeof OffscreenCanvas === "undefined") {
    return await new Promise((res, rej) => {
      const fr = new FileReader();
      fr.onload = () => res(String(fr.result || ""));
      fr.onerror = () => rej(fr.error || new Error("read_failed"));
      fr.readAsDataURL(file);
    });
  }
  try {
    const bmp = await createImageBitmap(file);
    const ratio = Math.min(1, maxSize / Math.max(bmp.width, bmp.height));
    const w = Math.max(1, Math.round(bmp.width * ratio));
    const h = Math.max(1, Math.round(bmp.height * ratio));
    const canvas = new OffscreenCanvas(w, h);
    const ctx = canvas.getContext("2d");
    ctx.drawImage(bmp, 0, 0, w, h);
    const blob = await canvas.convertToBlob({ type: "image/jpeg", quality });
    return await new Promise((res, rej) => {
      const fr = new FileReader();
      fr.onload = () => res(String(fr.result || ""));
      fr.onerror = () => rej(fr.error || new Error("read_failed"));
      fr.readAsDataURL(blob);
    });
  } catch {
    return await new Promise((res, rej) => {
      const fr = new FileReader();
      fr.onload = () => res(String(fr.result || ""));
      fr.onerror = () => rej(fr.error || new Error("read_failed"));
      fr.readAsDataURL(file);
    });
  }
}

let _profileCloudSyncTimer = null;
let _profileCloudSyncInFlight = false;
/** Push the current `activeProfile` to Supabase. Debounced so quick
 *  successive edits (e.g. typing a username + adding a photo) collapse
 *  into one upsert. Failures are silent — local copy stays correct
 *  and the next save will reconcile. */
function scheduleProfileCloudSync({ delayMs = 600 } = {}) {
  if (_profileCloudSyncTimer) clearTimeout(_profileCloudSyncTimer);
  _profileCloudSyncTimer = setTimeout(async () => {
    _profileCloudSyncTimer = null;
    if (_profileCloudSyncInFlight) {
      scheduleProfileCloudSync({ delayMs: 800 });
      return;
    }
    if (!authSession?.user?.id) return;
    _profileCloudSyncInFlight = true;
    try {
      await supabaseUpsertProfile(activeProfile);
    } catch (e) {
      console.warn("[profile] cloud sync failed (will retry on next save)", e);
    } finally {
      _profileCloudSyncInFlight = false;
    }
  }, Math.max(50, delayMs));
}

/** Build an anonymous default username for a Supabase auth user.
 *  We deliberately DO NOT use the email handle here — a name like
 *  `samy.naoum` on Hub would leak part of the user's real email to
 *  the public, which we'd rather avoid. Instead we mint a stable,
 *  anonymous handle (`user_<6char>`) derived from the user id so the
 *  same person gets the same default on every device until they
 *  pick their own. The Profile page nudges them to personalize it. */
function deriveUsernameFromAuth(user) {
  if (!user) return "";
  const seed = String(user?.id || "").replace(/-/g, "").slice(0, 6).toLowerCase();
  // Fallback to a random tail if the auth user has no id (shouldn't
  // happen with Supabase but cheap insurance against an empty handle
  // sneaking into the cloud row).
  const tail = seed && /^[a-z0-9]{4,}$/.test(seed)
    ? seed
    : Math.random().toString(36).slice(2, 8);
  return `user_${tail}`;
}

/** Returns true when the username looks like the default we minted
 *  in `deriveUsernameFromAuth`. The Profile page uses this to show
 *  a soft "Choose your username" banner until the user picks one. */
function isAutoGeneratedUsername(name) {
  return /^user_[a-z0-9]{4,8}$/.test(String(name || "").trim());
}

/** A "placeholder" username is one we never want to PROMOTE over a
 *  user-picked one, regardless of where it lives:
 *    - empty / null / undefined
 *    - "guest" (the unauthenticated sentinel)
 *    - "user_xxxxxx" (anonymous default from deriveUsernameFromAuth)
 *
 *  When merging local + cloud profile state at boot, treating these
 *  as "filled" causes the long-running username-keeps-resetting bug:
 *  if local was reset to the default (fresh install, cleared cache,
 *  multi-device first open) and cloud already had the user's chosen
 *  handle, the local placeholder would win the merge and then get
 *  pushed back to cloud, wiping the real handle.
 *
 *  Use this everywhere we have to choose between a fresh value and
 *  a stale one. */
function isPlaceholderUsername(name) {
  const n = String(name || "").trim().toLowerCase();
  if (!n) return true;
  if (n === "guest") return true;
  return isAutoGeneratedUsername(n);
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
/** Last time we hit Supabase for the Hub feed. Used to throttle every
 *  trigger (interval, focus, visibilitychange, route enter, tab nav)
 *  so a user rapidly switching apps can't force back-to-back fetches.
 *  Egress saver. */
let _hubLastFetchAtMs = 0;
/** Last time we did a FULL hub feed fetch (no `created_at>` filter).
 *  Subsequent fetches within HUB_FULL_REFETCH_MS request only rows
 *  newer than `_hubKnownNewestIsoTs` — that's typically zero or one
 *  row instead of 30, cutting the per-poll payload dramatically. */
let _hubLastFullFetchAtMs = 0;
/** Max `created_at` we've already ingested, as an ISO string. Used
 *  by the incremental fetch path. */
let _hubKnownNewestIsoTs = "";
/** Minimum gap between Hub fetches, regardless of trigger. iOS fires
 *  `focus` + `visibilitychange` together when the app returns from
 *  background; without this, every tab-back paid for two full pulls. */
const HUB_MIN_FETCH_GAP_MS = 25_000;
/** How often to do a FULL feed refetch (catches like/react count
 *  updates from other users, deleted posts, etc.). Between full
 *  refetches we run incremental "what's new since X" queries. */
const HUB_FULL_REFETCH_MS = 10 * 60_000;

/** localStorage key for the post-level "seen" set — distinct from the
 *  legacy `hubSeen` map (which tracks per-category timestamps for the
 *  notification dot on Latest/Arabic/etc.). This drives the Hub tab's
 *  smart-pick: tap Hub → land on the first post you haven't actually
 *  watched yet. */
const HUB_SEEN_POSTS_KEY = "nabad.hubSeenPostIds.v1";
/** Cap so the seen-set can't grow without bound. 500 ≈ 10x the feed
 *  size; older IDs roll off so deleted-from-cloud posts don't pin
 *  storage forever. */
const HUB_SEEN_POSTS_MAX = 500;
/** Dwell time (ms) a panel must hold >=60% viewport before we mark it
 *  seen. Stops a fast flick-through from marking everything as
 *  "watched" and immediately defeating the smart-pick. */
const HUB_SEEN_DWELL_MS = 1000;
let _hubSeenSet = null;
let _hubSeenMarkTimer = null;
let _hubSeenMarkPendingId = "";
/** Set when the user enters Hub from another tab and wants the
 *  smart-pick scroll to fire AFTER the route has rendered.
 *  Consumed (and cleared) by `applyRoute`'s hub branch. */
let _hubPendingSmartScroll = false;

function loadHubSeenPostSet() {
  if (_hubSeenSet) return _hubSeenSet;
  try {
    const raw = localStorage.getItem(HUB_SEEN_POSTS_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    _hubSeenSet = new Set(Array.isArray(arr) ? arr.map(String) : []);
  } catch {
    _hubSeenSet = new Set();
  }
  return _hubSeenSet;
}
function saveHubSeenPostSet() {
  if (!_hubSeenSet) return;
  try {
    // Keep newest-tail by insertion order — Set preserves insertion
    // order in JS, so slicing the array tail gives us the most
    // recently marked IDs.
    let arr = Array.from(_hubSeenSet);
    if (arr.length > HUB_SEEN_POSTS_MAX) {
      arr = arr.slice(arr.length - HUB_SEEN_POSTS_MAX);
      _hubSeenSet = new Set(arr);
    }
    localStorage.setItem(HUB_SEEN_POSTS_KEY, JSON.stringify(arr));
  } catch {}
}
function isHubPostSeen(id) {
  return loadHubSeenPostSet().has(String(id || ""));
}
function markHubPostSeen(id) {
  const sid = String(id || "");
  if (!sid) return;
  const set = loadHubSeenPostSet();
  if (set.has(sid)) {
    // Re-insert so it sits at the tail (treated as "freshly seen")
    // and the eviction policy keeps it around longer.
    set.delete(sid);
  }
  set.add(sid);
  saveHubSeenPostSet();
}
function scheduleMarkHubPostSeen(id) {
  const sid = String(id || "");
  if (!sid) return;
  if (_hubSeenMarkPendingId === sid) return;
  if (_hubSeenMarkTimer) {
    clearTimeout(_hubSeenMarkTimer);
    _hubSeenMarkTimer = null;
  }
  _hubSeenMarkPendingId = sid;
  _hubSeenMarkTimer = setTimeout(() => {
    markHubPostSeen(sid);
    _hubSeenMarkTimer = null;
    _hubSeenMarkPendingId = "";
  }, HUB_SEEN_DWELL_MS);
}
/** First post in `items` (already in display order) that hasn't been
 *  marked seen yet. Returns "" when everything is seen — caller should
 *  fall back to scroll-to-top. */
function getFirstUnseenHubPostId(items) {
  const set = loadHubSeenPostSet();
  for (const p of items || []) {
    const id = String(p?.id || "");
    if (id && !set.has(id)) return id;
  }
  return "";
}
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
// Egress saver: do NOT select the full `meta` JSONB on the broad list.
// Each row's `meta` carries finalPrompt / lyricsInput / styleSent (often
// thousands of chars per row) — multiplied by 30 rows × every fetch this
// was ~95% of the Hub feed payload. Only project the keys the renderer
// and ownership checks actually need; heavy keys (lyricsInput, styleInput,
// taskId, audioId, etc.) are fetched on-demand from `hubFetchPostMetaFull`
// when the user opens Remix on a specific post.
/** Public Hub feed list — **no `proof` projection**. Proof / fingerprint
 *  UI is owner-only (Profile → releases menu + lazy `proof` fetch).
 *  We still project light `meta` keys for playback/remix. Never fetch
 *  the full `meta` JSONB on list queries (lyricsInput, styleInput, …).
 *  `song_url` stays on the row so first play does not need a second
 *  round-trip. */
const HUB_SELECT_COLUMNS_FEED = [
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
  "meta_clip:meta->clip",
  "meta_creator_user_id:meta->>creatorUserId",
  "meta_template_title:meta->>searchTemplateTitle",
  "meta_profile_visibility:meta->>profileVisibility",
].join(",");

/** Profile “my Hub posts” fetch — includes scalar `proof` paths so the
 *  owner cache has chips/modal data without an extra round-trip per row. */
const HUB_SELECT_COLUMNS = [
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
  "proof_model:proof->>model",
  "proof_mode:proof->>mode",
  "proof_hash:proof->>promptHash",
  "meta_clip:meta->clip",
  "meta_creator_user_id:meta->>creatorUserId",
  "meta_template_title:meta->>searchTemplateTitle",
  "meta_profile_visibility:meta->>profileVisibility",
].join(",");

/** Same as `HUB_SELECT_COLUMNS_FEED` but without JSON-path fragments. Used when
 *  PostgREST/Postgres returns 5xx on the lean projection (some deployments
 *  reject nested `select=` aliases until extensions/views match). */
const HUB_SELECT_COLUMNS_LEAN = [
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
].join(",");

/** If PostgREST rejects `meta->>` / `meta->` projections but `proof->>`
 *  still works, use this for `supabaseSelectMyHubPosts` fallback only. */
const HUB_SELECT_COLUMNS_LEAN_OWNER = `${HUB_SELECT_COLUMNS_LEAN},proof_model:proof->>model,proof_mode:proof->>mode,proof_hash:proof->>promptHash`;

/** Reconstruct the minimal `meta` shape the Hub renderer + playback expect
 *  from the projected JSON keys returned by PostgREST. Keys not selected
 *  on the list view (e.g. `lyricsInput`) are intentionally omitted. */
function reconstructHubRowMeta(row) {
  const meta = {};
  if (row && row.meta_clip != null) meta.clip = row.meta_clip;
  const creatorUserId = String((row && row.meta_creator_user_id) || "").trim();
  if (creatorUserId) meta.creatorUserId = creatorUserId;
  const tplTitle = String((row && row.meta_template_title) || "").trim();
  if (tplTitle) meta.searchTemplateTitle = tplTitle;
  const profVis = String((row && row.meta_profile_visibility) || "").trim().toLowerCase();
  if (profVis === "private" || profVis === "public") meta.profileVisibility = profVis;
  return Object.keys(meta).length ? meta : null;
}

/** Rebuild the minimal `proof` shape from the three projected keys.
 *  Keeps the renderer + proof modal happy without us paying egress
 *  for the entire `proof` JSONB column on every list fetch (and the
 *  full thing can drift in size as we add fields server-side). */
function reconstructHubRowProof(row) {
  if (!row) return null;
  const model = String(row.proof_model || "").trim();
  const mode = String(row.proof_mode || "").trim();
  const hash = String(row.proof_hash || "").trim();
  if (!model && !mode && !hash) return null;
  const proof = {};
  if (model) proof.model = model;
  if (mode) proof.mode = mode;
  if (hash) proof.promptHash = hash;
  return proof;
}

/** Map a PostgREST `hub_posts` row into the in-memory Hub post shape. */
function mapHubRestRowToPost(r, { includeProof = false } = {}) {
  return {
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
    proof: includeProof ? reconstructHubRowProof(r) : null,
    meta: reconstructHubRowMeta(r),
  };
}

/** After a public feed sync, keep any `proof` we already had for the same
 *  id so Profile → Proof still works without re-fetching `my` rows. */
function mergeHubProofFromPrevPost(post, prevFeed) {
  const prevRow = prevFeed.find((x) => String(x.id) === String(post.id));
  let next = post;

  if (!(next.proof?.model || next.proof?.mode || next.proof?.promptHash)) {
    if (
      prevRow?.proof &&
      (prevRow.proof.model || prevRow.proof.mode || prevRow.proof.promptHash)
    ) {
      next = { ...next, proof: prevRow.proof };
    }
  }

  const prevVis = String(prevRow?.meta?.profileVisibility || "").trim().toLowerCase();
  const curVis = String(next.meta?.profileVisibility || "").trim().toLowerCase();
  // Lean feed projections omit visibility — keep a prior "private" stamp
  // so Profile badges don't flash back to Public on every Hub poll.
  if (prevVis === "private" && !curVis) {
    next = {
      ...next,
      meta: { ...(next.meta || {}), profileVisibility: "private" },
    };
  }
  return next;
}

/** On-demand fetch of a single Hub post's full `meta` (only when the user
 *  actually needs it — e.g. opens Remix or owner-only actions). One row,
 *  one column. Cheap. */
async function hubFetchPostMetaFull(postId) {
  if (!HUB_FEATURE_ENABLED) return null;
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return null;
  const id = String(postId || "").trim();
  if (!id) return null;
  try {
    const headers = { apikey: SUPABASE_ANON_KEY };
    const tok = getSupabaseAuthToken();
    if (tok) headers.Authorization = `Bearer ${tok}`;
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/hub_posts?id=eq.${encodeURIComponent(id)}&select=meta&limit=1`,
      { headers },
    );
    if (!r.ok) return null;
    const arr = await r.json().catch(() => []);
    const row = Array.isArray(arr) ? arr[0] : null;
    return row?.meta || null;
  } catch {
    return null;
  }
}

/** On-demand fetch of a single Hub post's `proof` JSONB (owner flows). */
async function hubFetchPostProofFull(postId) {
  if (!HUB_FEATURE_ENABLED) return null;
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return null;
  const id = String(postId || "").trim();
  if (!id) return null;
  try {
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/hub_posts?id=eq.${encodeURIComponent(id)}&select=proof&limit=1`,
      { headers: { apikey: SUPABASE_ANON_KEY } },
    );
    if (!r.ok) return null;
    const arr = await r.json().catch(() => []);
    const row = Array.isArray(arr) ? arr[0] : null;
    return row?.proof || null;
  } catch {
    return null;
  }
}

/** Originally a client-side `or=()` guard that skipped rows whose
 *  `cover_url` or `creator_avatar` was a base64 `data:` URL — a quick
 *  fix when the Hub list response ballooned to ~33 MB on legacy data.
 *  Reality bit back: lots of users had `data:` *avatars* from an old
 *  upload flow, so the guard hid every post by those creators (~3 rows
 *  ever made it through; newer posts were invisible). The correct
 *  defense is the SQL cleanup in `supabase/hub_posts_strip_data_urls.sql`
 *  (one-shot UPDATE to null the bad fields + CHECK constraint to prevent
 *  future inserts). Until that runs, accept the occasional larger
 *  response over hiding real content. Kept as an empty string so the
 *  call-sites can stay unchanged. */
const HUB_POSTS_JSON_LIST_DATA_GUARD = "";

async function supabaseSelectHub({ sinceIsoTs = "" } = {}) {
  if (!HUB_FEATURE_ENABLED) return null;
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return null;
  const ctrl = new AbortController();
  // Cellular reality check: on real-world 3G/Edge, DNS + TLS handshake
  // to a cold Supabase region can take 8-12s on its own. 20s left genuine
  // slow-network users hitting the AbortError path. 30s is still well
  // under iOS's 60s URLSession default and matches what users tolerate
  // before assuming the app is frozen.
  const timer = setTimeout(() => ctrl.abort(), 30000);
  // Incremental fetch path: when caller passes `sinceIsoTs` we only
  // request rows newer than that timestamp. Most polls return 0 rows
  // = a few hundred bytes total instead of multi-KB. Full refresh runs
  // every HUB_FULL_REFETCH_MS to catch like/react updates.
  const sinceFilter = sinceIsoTs
    ? `&created_at=gt.${encodeURIComponent(sinceIsoTs)}`
    : "";
  // 30 rows: enough for a full reel session on Latest without the old
  // "Load more" cap (reel shows every cached post). Incremental polls
  // still return 0 rows most of the time — egress stays low.
  //
  // **Cost guard**: skip rows whose `cover_url` or `creator_avatar` is a
  // base64 `data:` URL. Legacy rows could carry ~500 KB–1.5 MB cover
  // strings inline; 30 of those = ~30 MB per feed fetch. PostgREST
  // pattern: `or=(col.is.null,col.not.like.data:*)` keeps rows with
  // missing/HTTP covers and drops the inline-blob ones. Once
  // `supabase/hub_posts_strip_data_urls.sql` runs the bad rows are
  // permanently null'd and the filter becomes a no-op.
  const hubListUrl = (selectCols) =>
    `${SUPABASE_URL}/rest/v1/hub_posts?select=${encodeURIComponent(selectCols)}&order=created_at.desc&limit=30${sinceFilter}${HUB_POSTS_JSON_LIST_DATA_GUARD}`;
  let r = await fetch(hubListUrl(HUB_SELECT_COLUMNS_FEED), {
    headers: {
      apikey: SUPABASE_ANON_KEY,
    },
    signal: ctrl.signal,
  });
  if (!r.ok) {
    const r2 = await fetch(hubListUrl(HUB_SELECT_COLUMNS_LEAN), {
      headers: { apikey: SUPABASE_ANON_KEY },
      signal: ctrl.signal,
    });
    if (r2.ok) {
      r = r2;
    } else {
      clearTimeout(timer);
      const txt = await r.text().catch(() => "");
      throw new Error(`supabase select failed (${r.status}) ${String(txt).slice(0, 100)}`);
    }
  }
  clearTimeout(timer);
  return await r.json().catch(() => []);
}

/** Targeted fetch of the signed-in user's own Hub posts.
 *  Used on login + on Profile entry so the Profile's "songs / likes"
 *  section can populate without waiting for the full Hub feed to
 *  arrive (which fetches 30 latest globally and is the slowest call
 *  in the boot sequence). Filters on meta->>creatorUserId for the
 *  reliable id-based match, with a creator_username fallback for
 *  legacy posts written before we started stamping the user id into
 *  meta. */
async function supabaseSelectMyHubPosts({ uid, username } = {}) {
  if (!HUB_FEATURE_ENABLED) return null;
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return null;
  if (!uid && !username) return null;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  // PostgREST **standalone** filters use `column=eq.value` (one `=` between
  // the column token and `eq…`). The `or=(a.eq.x,b.eq.y)` form is only for
  // logical groups; embedding `meta->>….eq.uuid` without `or=` was invalid
  // and could yield 5xx from PostgREST. We run up to two requests in parallel
  // (meta user id + username) and merge — same rows dedupe by `id`.
  // CRITICAL: never match by `username === "guest"`.
  const pullMerged = async (selectCols) => {
    const reqs = [];
    if (uid) {
      const q = `${encodeURIComponent("meta->>creatorUserId")}=eq.${encodeURIComponent(uid)}`;
      reqs.push(
        fetch(
          `${SUPABASE_URL}/rest/v1/hub_posts?select=${encodeURIComponent(selectCols)}&${q}${HUB_POSTS_JSON_LIST_DATA_GUARD}&order=created_at.desc&limit=15`,
          { headers: { apikey: SUPABASE_ANON_KEY }, signal: ctrl.signal },
        ),
      );
    }
    if (username && username !== "guest") {
      reqs.push(
        fetch(
          `${SUPABASE_URL}/rest/v1/hub_posts?select=${encodeURIComponent(
            selectCols,
          )}&creator_username=eq.${encodeURIComponent(username)}${HUB_POSTS_JSON_LIST_DATA_GUARD}&order=created_at.desc&limit=15`,
          { headers: { apikey: SUPABASE_ANON_KEY }, signal: ctrl.signal },
        ),
      );
    }
    const responses = await Promise.all(reqs);
    const anyOk = responses.some((r) => r.ok);
    const rowsById = new Map();
    for (const r of responses) {
      if (!r.ok) continue;
      const arr = await r.json().catch(() => []);
      if (!Array.isArray(arr)) continue;
      for (const row of arr) {
        if (row && row.id != null) rowsById.set(String(row.id), row);
      }
    }
    const merged = Array.from(rowsById.values()).sort(
      (a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0),
    );
    return { rows: merged.slice(0, 15), anyOk };
  };
  try {
    let { rows, anyOk } = await pullMerged(HUB_SELECT_COLUMNS);
    if (!anyOk) ({ rows, anyOk } = await pullMerged(HUB_SELECT_COLUMNS_LEAN_OWNER));
    if (!anyOk) ({ rows, anyOk } = await pullMerged(HUB_SELECT_COLUMNS_LEAN));
    clearTimeout(timer);
    if (!anyOk) return null;
    return rows;
  } catch {
    clearTimeout(timer);
    return null;
  }
}

/** Merge user's own Hub rows into the local cache and re-render
 *  Profile + the global Hub if it's already painted. Idempotent so
 *  it can run alongside the periodic Hub refresh without conflict. */
function ingestMyHubPostsRows(rows) {
  if (!Array.isArray(rows) || !rows.length) return;
  const mapped = rows.map((r) => mapHubRestRowToPost(r, { includeProof: true }));
  const prev = loadHubFeed();
  const byId = new Map();
  prev.forEach((p) => byId.set(String(p.id), p));
  // Mine wins on conflict — they're freshly fetched.
  mapped.forEach((p) => byId.set(String(p.id), p));
  const merged = Array.from(byId.values()).sort((a, b) => Number(b.ts || 0) - Number(a.ts || 0)).slice(0, 300);
  saveHubFeed(merged);
  renderProfileHubShared();
}

let _myHubPostsLastFetchMs = 0;
let _myHubPostsInFlight = null;
/** Distinguishes "user has no Hub posts" from "we haven't asked yet".
 *  Profile hero / top-week / all-releases would otherwise hide
 *  themselves on a fresh load (no items) AND show "No songs on Hub
 *  yet" — same UI as a brand-new account, which is what made Profile
 *  feel late-loading. Once true, the empty state is genuine and the
 *  skeletons stop. Reset on logout. */
let _myHubPostsFirstLoadDone = false;
async function refreshMyHubPostsFast({ force = false } = {}) {
  if (!HUB_FEATURE_ENABLED) {
    _myHubPostsFirstLoadDone = true;
    try { renderProfileHubShared(); } catch {}
    return;
  }
  try {
    const uid = String(authSession?.user?.id || "");
    const username = String(activeProfile?.username || "");
    if (!uid && !username) return;
    const now = Date.now();
    if (!force && now - _myHubPostsLastFetchMs < 8000) return;
    if (_myHubPostsInFlight) return _myHubPostsInFlight;
    _myHubPostsInFlight = (async () => {
      try {
        const rows = await supabaseSelectMyHubPosts({ uid, username });
        _myHubPostsLastFetchMs = Date.now();
        if (rows && rows.length) ingestMyHubPostsRows(rows);
      } finally {
        _myHubPostsInFlight = null;
        _myHubPostsFirstLoadDone = true;
        // Paint once more so the skeletons swap to either real rows or
        // the genuine empty state, even when the caller forgot to
        // re-render after awaiting us (most call-sites are fire-and-forget).
        try { renderProfileHubShared(); } catch {}
      }
    })();
    return _myHubPostsInFlight;
  } catch {
    _myHubPostsInFlight = null;
    _myHubPostsFirstLoadDone = true;
  }
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
  try {
    if ((document.body.getAttribute("data-route") || "") === "library") renderLibrary();
    renderProfileHubShared();
  } catch {}
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

/** Live Suno API remaining credits (same pool as `SUNO_API_KEY`). Shown on
 *  the Profile pill + Credits hero when `creditsState.isAdmin` is true,
 *  because admin generations skip the per-user Supabase ledger. */
let sunoCreditsLive = null;

function formatCreditsAmount(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return "0";
  const clamped = Math.max(0, x);
  const s = clamped.toFixed(4).replace(/\.?0+$/, "");
  return s || "0";
}

function paintCreditsDisplays() {
  const admin = Boolean(creditsState.isAdmin);
  let disp = "0";
  let aria = "";
  if (admin) {
    if (sunoCreditsLive != null && Number.isFinite(sunoCreditsLive)) {
      disp = formatCreditsAmount(sunoCreditsLive);
      aria = `Suno balance ${disp} credits`;
    } else {
      disp = "—";
      aria = "Suno balance loading or unavailable";
    }
  } else {
    const v = Number.isFinite(Number(creditsState.balance)) ? Math.max(0, Number(creditsState.balance)) : 0;
    disp = formatCreditsAmount(v);
    aria = `App credits balance ${disp}`;
  }
  if (els.profileCreditsBalance) els.profileCreditsBalance.textContent = disp;
  if (els.creditsBalanceBig) els.creditsBalanceBig.textContent = disp;
  if (els.profileCreditsLink) {
    els.profileCreditsLink.classList.toggle("isAdmin", admin);
    els.profileCreditsLink.setAttribute("aria-label", `${aria}. Tap to manage credits.`);
  }
}

function setCreditsBalance(n) {
  const raw = Number(n);
  const v = Number.isFinite(raw) ? Math.max(0, raw) : 0;
  creditsState.balance = v;
  paintCreditsDisplays();
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
    creditsState.isAdmin = false;
    sunoCreditsLive = null;
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
    if (!creditsState.isAdmin) sunoCreditsLive = null;
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
    if (creditsState.isAdmin) await refreshAdminCreditsView();
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
    if (Number.isFinite(Number(d.masterSuno))) {
      sunoCreditsLive = Number(d.masterSuno);
    } else {
      sunoCreditsLive = null;
    }
    paintCreditsDisplays();
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
  // 8s timeout — without it, a slow auth/user lookup leaves the boot
  // IIFE hanging, which keeps the profile header in its loading state
  // and the username stuck on the local placeholder.
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  let r;
  try {
    r = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${token}`,
      },
      signal: ctrl.signal,
    });
  } catch (e) {
    clearTimeout(timer);
    lastAuthDebug = `user fetch aborted: ${String(e?.message || e || "timeout").slice(0, 80)}`;
    return null;
  }
  clearTimeout(timer);
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
  const isAuthed = Boolean(email);
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
  // Hide the Credits pill entirely when logged-out. A "0 credits" badge
  // on a guest profile is meaningless and was where the previous user's
  // balance kept leaking through (e.g. "326" after Logout). The pill
  // is only relevant to the signed-in account that owns the balance.
  if (els.profileCreditsLink) {
    els.profileCreditsLink.style.display = isAuthed ? "" : "none";
    els.profileCreditsLink.setAttribute("aria-hidden", isAuthed ? "false" : "true");
  }
  // Same idea for the Share button — a logged-out user has no
  // profile worth sharing yet, and the @guest URL leaks the
  // placeholder handle. We tolerate both the legacy big-pill button
  // (kept for safety while older HTML cached on devices) and the new
  // toolbar icon.
  if (els.profileActionShare) {
    els.profileActionShare.style.display = isAuthed ? "" : "none";
  }
  if (els.btnProfileShareIcon) {
    els.btnProfileShareIcon.style.display = isAuthed ? "" : "none";
    els.btnProfileShareIcon.setAttribute("aria-hidden", isAuthed ? "false" : "true");
  }
  document.body.setAttribute("data-logged-in", isAuthed ? "true" : "false");
}
function resetProfileUiToGuest() {
  activeProfile = {
    id: "guest",
    username: "guest",
    email: "",
    voiceTimbre: "",
    bio: "",
    avatar: "",
    genres: "",
    links: {},
    isPublic: true,
    callingCardUrl: "",
    callingCardUpdatedAt: 0,
    soundCertified: false,
  };
  resetProfileReleasesPagination();
  try { localStorage.setItem(PROFILE_KEY, JSON.stringify(activeProfile)); } catch {}
  if (els.profilePreviewUsernameInput) els.profilePreviewUsernameInput.value = "@guest";
  if (els.profilePreviewTimbreInput) els.profilePreviewTimbreInput.value = "";
  if (els.profilePreviewBioInput) els.profilePreviewBioInput.value = "";
  if (els.profileIsPublic) els.profileIsPublic.checked = true;
  if (els.profileAvatarFile) els.profileAvatarFile.value = "";
  _libraryHydrateInFlight = false;
  _libraryHydrateCompleted = false;
  _lastUserSongInsertFailure = "";
  _lastLibraryPersistError = "";
  _lastLibraryPersistedCount = 0;
  invalidateLibraryMemCache();
  // Reset Profile-Hub first-load gate so a fresh sign-in re-shows the
  // skeletons until the new account's posts have been fetched.
  _myHubPostsFirstLoadDone = false;
  _myHubPostsLastFetchMs = 0;
  // Wipe every personal balance/badge so a logged-out screen never
  // leaks the previous account's state. Without this, the Profile
  // credits pill kept showing the last balance (e.g. 326) after Logout
  // because `paintCreditsDisplays()` only re-fires when something else
  // changes credits. We also drop the admin Suno mirror and the
  // separate Credits page balance display so flipping tabs doesn't
  // bring the number back. The pill itself is hidden via the
  // [data-logged-in] flag on <body> so a "0 credits" tag doesn't
  // appear for guests — `renderAuthStatus()` flips that flag.
  creditsState.balance = 0;
  creditsState.ledger = [];
  creditsState.isAdmin = false;
  creditsState.loaded = false;
  creditsState.lastError = "";
  sunoCreditsLive = null;
  paintCreditsDisplays();
  try { renderCreditsLedger(); } catch {}
  if (els.creditsAdminCard) els.creditsAdminCard.style.display = "none";
  if (els.creditsHeroEmail) {
    els.creditsHeroEmail.textContent = "";
    els.creditsHeroEmail.style.display = "none";
  }
  if (typeof setProfileHeaderLoading === "function") setProfileHeaderLoading(false);
  renderProfilePreviewFromInputs();
  renderProfileHubShared();
  setProfileEditing(false);
  renderLibrary();
  renderAuthStatus();
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
async function exchangeOAuthCodeForSession(code) {
  if (!code) return false;
  const verifier = localStorage.getItem(AUTH_PKCE_KEY) || "";
  if (!verifier) {
    lastAuthDebug = "missing pkce verifier";
    return false;
  }
  try {
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
    setStatus("Logged in via Google.");
    return true;
  } catch (e) {
    lastAuthDebug = `code flow error: ${e?.message || String(e)}`;
    return false;
  }
}
async function maybeHandleAuthCodeFromQuery() {
  try {
    const sp = new URLSearchParams(window.location.search || "");
    const code = sp.get("code");
    if (!code) return false;
    const ok = await exchangeOAuthCodeForSession(code);
    if (!ok) return false;
    window.history.replaceState({}, document.title, window.location.pathname + "#/profile");
    applyRoute();
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
const OAUTH_NATIVE_REDIRECT = "com.nabadai.music://auth-callback";
function isCapacitorNativeAuth() {
  return Boolean(window?.Capacitor?.isNativePlatform?.());
}

/** Base64 body only (no data: prefix) for Capacitor Filesystem.writeFile on native. */
function blobToBase64Payload(blob) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onloadend = () => {
      const s = String(fr.result || "");
      const i = s.indexOf(",");
      resolve(i >= 0 ? s.slice(i + 1) : s);
    };
    fr.onerror = () => reject(fr.error || new Error("read failed"));
    fr.readAsDataURL(blob);
  });
}

function shareSheetCanceledError(err) {
  if (!err) return false;
  if (err.name === "AbortError") return true;
  const m = String(err.message || err || "").toLowerCase();
  return m.includes("share canceled") || m.includes("cancelled") || m.includes("canceled");
}

/** iOS WKWebView: Web Share with File[] often fails; write to cache then native Share (file://). */
let _capVideoExportModPromise = null;
async function shareVideoBlobThroughCapacitorNative(blob, { filename, title, shareText } = {}) {
  if (!_capVideoExportModPromise) {
    const core = "8.3.1";
    const fsUrl = `https://esm.sh/@capacitor/filesystem@8.1.2?deps=@capacitor/core@${core}`;
    const shUrl = `https://esm.sh/@capacitor/share@8.0.1?deps=@capacitor/core@${core}`;
    _capVideoExportModPromise = Promise.all([
      import(/* webpackIgnore: true */ fsUrl),
      import(/* webpackIgnore: true */ shUrl),
    ]);
  }
  const [fsMod, shMod] = await _capVideoExportModPromise;
  const { Filesystem, Directory } = fsMod;
  const { Share } = shMod;
  const name = String(filename || "song.mp4")
    .replace(/[^\w.\- ]+/g, "_")
    .replace(/\s+/g, " ")
    .slice(0, 80);
  const rel = `NabadAi/exports/${Date.now()}-${name || "song.mp4"}`;
  const data = await blobToBase64Payload(blob);
  await Filesystem.writeFile({
    path: rel,
    data,
    directory: Directory.Cache,
    recursive: true,
  });
  const { uri } = await Filesystem.getUri({
    path: rel,
    directory: Directory.Cache,
  });
  if (!uri || !String(uri).trim().toLowerCase().startsWith("file")) {
    throw new Error("Could not build a local file to share");
  }
  await Share.share({
    title: String(title || "Nabadai").slice(0, 100),
    text: String(shareText || "Save to Photos (Save Video) or Files").slice(0, 200),
    files: [uri],
  });
}

/** Web `File` MIME guess for Library / player blob delivery (not used on native path). */
function guessFileMimeFromFilename(filename, isVideo) {
  if (isVideo) return "video/mp4";
  const n = String(filename || "").toLowerCase();
  if (n.endsWith(".mp3")) return "audio/mpeg";
  if (n.endsWith(".m4a")) return "audio/mp4";
  if (n.endsWith(".wav")) return "audio/wav";
  if (n.endsWith(".webm")) return "audio/webm";
  return "application/octet-stream";
}

/**
 * Save a blob on device: native → Capacitor Filesystem + Share; web → Web Share or `<a download>`.
 * Used by the player “download video” control and Library ⋯ audio / video actions.
 */
async function deliverDownloadBlobToDevice(blob, { filename, title, isVideo } = {}) {
  const safeName = String(filename || (isVideo ? "clip.mp4" : "audio.mp3")).trim();
  const trackTitle = String(title || "Nabadai").trim();
  const tryAnchorDownload = () => {
    const blobUrl = URL.createObjectURL(blob);
    try {
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = safeName;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } finally {
      setTimeout(() => URL.revokeObjectURL(blobUrl), 4000);
    }
  };
  const nativeShareText = isVideo
    ? "Save to Photos (Save Video) or Files"
    : "Save this audio to Files, Music, or another app.";
  const hintToast = isVideo
    ? "Choose “Save Video” for Photos or “Save to Files”."
    : "Choose “Save to Files” or another app from the share sheet.";

  if (isCapacitorNativeAuth()) {
    try {
      await shareVideoBlobThroughCapacitorNative(blob, {
        filename: safeName,
        title: trackTitle,
        shareText: nativeShareText,
      });
      showToast(hintToast, { durationMs: 4800 });
    } catch (nativeErr) {
      if (shareSheetCanceledError(nativeErr)) {
        showToast("Cancelled.", { durationMs: 1600 });
      } else {
        console.warn("[deliverDownloadBlob] native share", nativeErr);
        const mime = guessFileMimeFromFilename(safeName, isVideo);
        const file = new File([blob], safeName, { type: mime });
        try {
          if (
            typeof navigator.share === "function" &&
            (typeof navigator.canShare !== "function" || navigator.canShare({ files: [file] }))
          ) {
            await navigator.share({
              files: [file],
              title: trackTitle,
              text: nativeShareText,
            });
            showToast(hintToast, { durationMs: 4800 });
          } else {
            showToast(
              `Could not open share: ${String(nativeErr?.message || nativeErr).slice(0, 72)}`,
              { durationMs: 4800 },
            );
          }
        } catch (webShareErr) {
          if (shareSheetCanceledError(webShareErr)) {
            showToast("Cancelled.", { durationMs: 1600 });
          } else {
            showToast(
              `Could not save: ${String(webShareErr?.message || webShareErr || nativeErr).slice(0, 72)}`,
              { durationMs: 4800 },
            );
          }
        }
      }
    }
  } else {
    const mime = guessFileMimeFromFilename(safeName, isVideo);
    const file = new File([blob], safeName, { type: mime });
    const canFileShare =
      typeof navigator !== "undefined" &&
      typeof navigator.share === "function" &&
      typeof navigator.canShare === "function" &&
      navigator.canShare({ files: [file] });
    if (canFileShare) {
      try {
        await navigator.share({
          files: [file],
          title: trackTitle,
          text: isVideo ? `“${trackTitle}” — save to Photos or Files` : `“${trackTitle}” — save this audio`,
        });
        showToast(hintToast, { durationMs: 4800 });
      } catch (shareErr) {
        if (shareSheetCanceledError(shareErr)) {
          showToast("Cancelled.", { durationMs: 1600 });
        } else {
          tryAnchorDownload();
          showToast("Saved — check your Downloads folder.", { durationMs: 2800 });
        }
      }
    } else {
      tryAnchorDownload();
      showToast(
        isVideo ? "Video saved — check your Downloads folder." : "Audio saved — check your Downloads folder.",
        { durationMs: 2800 },
      );
    }
  }
}
function getCapacitorBrowserPlugin() {
  return window?.Capacitor?.Plugins?.Browser || null;
}
function getCapacitorAppPlugin() {
  return window?.Capacitor?.Plugins?.App || null;
}
async function supabaseGoogleLoginUrl() {
  const verifier = randomVerifier(64);
  localStorage.setItem(AUTH_PKCE_KEY, verifier);
  const challenge = await sha256Base64Url(verifier);
  const redirectTarget = isCapacitorNativeAuth()
    ? OAUTH_NATIVE_REDIRECT
    : `${window.location.origin}${window.location.pathname}`;
  const redirectTo = encodeURIComponent(redirectTarget);
  return `${SUPABASE_URL}/auth/v1/authorize?provider=google&response_type=code&scope=email%20profile&code_challenge=${encodeURIComponent(challenge)}&code_challenge_method=S256&redirect_to=${redirectTo}`;
}
async function supabaseUpsertProfile(profile) {
  const token = getSupabaseAuthToken();
  if (!token) throw new Error("Login required");
  // Guard against pushing a placeholder handle ("guest" or
  // "user_xxxxxx") over a real one in the cloud. If the in-memory
  // profile is in a transient placeholder state (e.g. mid-merge,
  // mid-reset, debounced sync racing a fresh login), peek at the
  // existing cloud row first and keep its username. This is the
  // last line of defense for the "username keeps resetting" bug —
  // if anything sneaks through the boot merge, this stops it from
  // becoming permanent on the server.
  let outgoingUsername = profile.username || "";
  if (isPlaceholderUsername(outgoingUsername) && authSession?.user?.id) {
    try {
      const existing = await supabaseLoadProfile();
      if (existing && existing.username && !isPlaceholderUsername(existing.username)) {
        outgoingUsername = existing.username;
      }
    } catch {}
  }
  if (!outgoingUsername) outgoingUsername = "guest";
  const payload = {
    user_id: authSession?.user?.id,
    username: outgoingUsername,
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
    calling_card_url: profile.callingCardUrl || null,
    calling_card_updated_at: profile.callingCardUpdatedAt
      ? new Date(profile.callingCardUpdatedAt).toISOString()
      : null,
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
  // 8s timeout — same reasoning as supabaseFetchUser: a hung profile
  // fetch was the root cause of the "stuck loading + @guest" report.
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  let r;
  try {
    r = await fetch(`${SUPABASE_URL}/rest/v1/profiles?user_id=eq.${uid}&select=*`, {
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${token}`,
      },
      signal: ctrl.signal,
    });
  } catch {
    clearTimeout(timer);
    return null;
  }
  clearTimeout(timer);
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
    callingCardUrl: p.calling_card_url || "",
    callingCardUpdatedAt: p.calling_card_updated_at
      ? Date.parse(p.calling_card_updated_at) || 0
      : 0,
    soundCertified: p.sound_certified === true || p.sound_certified === "t" || p.sound_certified === "true",
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
  // Slim list: render-only columns. `meta` stays out (legacy rows could
  // carry base64 cover blobs in `meta.imageUrl`). `art_url` is included
  // again — without it, cloud rows arrive cover-less and the merge wipes
  // out the local CDN URL the user actually sees in Library. We pair the
  // select with a PostgREST guard that *skips rows whose `art_url`
  // happens to be a legacy `data:` URL*, same trick we use on `hub_posts`
  // for cover_url / creator_avatar. The cheap `art_url is null` branch
  // covers freshly inserted rows where we deliberately wrote null.
  const cols = "id,created_at,title,song_url,task_id,audio_id,kind,art_url,public_on_profile";
  const artUrlGuard = `&or=${encodeURIComponent("(art_url.is.null,art_url.not.like.data:*)")}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 12000);
  let r;
  try {
    r = await fetch(`${SUPABASE_URL}/rest/v1/user_songs?user_id=eq.${uid}&select=${cols}&order=created_at.desc&limit=500${artUrlGuard}`, {
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
  return rows.map((s) => {
    const cid = String(s.id || "").trim();
    return {
      id: cid || `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      cloudSongId: cid,
      ts: new Date(s.created_at || Date.now()).getTime(),
      title: s.title || "Generated song",
      artUrl: s.art_url || "",
      url: s.song_url || "",
      taskId: s.task_id || "",
      audioId: s.audio_id || "",
      kind: s.kind || "full",
      meta: null,
      publicOnProfile: Boolean(
        s.public_on_profile === true || s.public_on_profile === "t" || s.public_on_profile === "true",
      ),
    };
  });
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
    public_on_profile: Boolean(track.publicOnProfile),
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
/** True when `v` looks like a Postgres `uuid` text form (REST `id=eq.` filters). */
function isPostgresUuidString(v) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(v || "").trim());
}

/** Patch an existing `user_songs` row keyed by (user_id, song_url, kind).
 *  Used when a track changes locally — currently just custom-cover
 *  uploads from the Player. Fire-and-forget; failures fall back to
 *  localStorage being authoritative until the next reconcile.
 */
async function supabasePatchUserSong(track, patch) {
  const token = getSupabaseAuthToken();
  if (!token || !authSession?.user?.id) return { ok: false, reason: "no_auth" };
  const uid = encodeURIComponent(authSession.user.id);
  const songUrl = String(track?.url || "").trim();
  const url = encodeURIComponent(songUrl);
  const kind = encodeURIComponent(String(track?.kind || "full"));
  const rowRef =
    String(track?.cloudSongId || "").trim() ||
    (isPostgresUuidString(track?.id) ? String(track.id).trim() : "");
  let filter;
  if (rowRef && isPostgresUuidString(rowRef)) {
    filter = `user_id=eq.${uid}&id=eq.${encodeURIComponent(rowRef)}`;
  } else if (songUrl) {
    filter = `user_id=eq.${uid}&song_url=eq.${url}&kind=eq.${kind}`;
  } else {
    return { ok: false, reason: "no_row_ref", details: "missing cloudSongId and song_url" };
  }
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
  if (typeof patch?.publicOnProfile === "boolean") {
    body.public_on_profile = patch.publicOnProfile;
  }
  if (typeof patch?.songUrl === "string" && patch.songUrl.trim()) {
    body.song_url = patch.songUrl.trim();
  }
  if (Object.keys(body).length === 0) return { ok: false, reason: "noop" };
  const r = await fetch(`${SUPABASE_URL}/rest/v1/user_songs?${filter}`, {
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
    return { ok: false, reason: `http_${r.status}`, details: String(txt).slice(0, 280) };
  }
  return { ok: true };
}

async function supabaseDeleteUserSong(track) {
  const token = getSupabaseAuthToken();
  if (!token || !authSession?.user?.id) return;
  const uid = encodeURIComponent(authSession.user.id);
  const songUrl = String(track?.url || "").trim();
  const encUrl = encodeURIComponent(songUrl);
  const kind = encodeURIComponent(String(track?.kind || "full"));
  const rowRef =
    String(track?.cloudSongId || "").trim() ||
    (isPostgresUuidString(track?.id) ? String(track.id).trim() : "");
  let filter;
  if (rowRef && isPostgresUuidString(rowRef)) {
    filter = `user_id=eq.${uid}&id=eq.${encodeURIComponent(rowRef)}`;
  } else if (songUrl) {
    filter = `user_id=eq.${uid}&song_url=eq.${encUrl}&kind=eq.${kind}`;
  } else {
    return;
  }
  await fetch(`${SUPABASE_URL}/rest/v1/user_songs?${filter}`, {
    method: "DELETE",
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${token}`,
      Prefer: "return=minimal",
    },
  }).catch(() => null);
}

/** Escape `LIKE`/`ILIKE` wildcards so `username=ilike…` is an exact handle match (underscore is special in SQL). */
function escapeUsernameForIlikeExact(handle) {
  return String(handle || "")
    .trim()
    .replace(/\\/g, "\\\\")
    .replace(/%/g, "\\%")
    .replace(/_/g, "\\_");
}

/** Public `profiles` row by handle — anon when `profiles_select_public_directory` exists. */
async function fetchPublicProfileRowByUsername(username) {
  const handle = String(username || "").replace(/^@/, "").trim();
  if (!handle || !SUPABASE_URL || !SUPABASE_ANON_KEY) return null;
  const headers = { apikey: SUPABASE_ANON_KEY, Accept: "application/json" };
  const base = `${SUPABASE_URL}/rest/v1/profiles`;
  const selFull = "user_id,username,avatar,bio,voice_timbre,sound_certified";
  const selCore = "user_id,username,avatar,bio,voice_timbre";
  const eq = `username=eq.${encodeURIComponent(handle)}`;
  const il = `username=ilike.${encodeURIComponent(escapeUsernameForIlikeExact(handle))}`;
  const tryOne = async (filter, selectList) => {
    try {
      const r = await fetch(`${base}?${filter}&select=${selectList}&limit=1`, {
        headers,
        cache: "no-store",
      });
      if (!r.ok) return null;
      const arr = await r.json().catch(() => []);
      return Array.isArray(arr) && arr[0] ? arr[0] : null;
    } catch {
      return null;
    }
  };
  // `sound_certified` breaks the whole request if the column is not migrated yet — fall back to `selCore`.
  // `eq` is case-sensitive — try escaped `ilike` second so `@Samy_CEO` still resolves.
  return (
    (await tryOne(eq, selFull)) ||
    (await tryOne(eq, selCore)) ||
    (await tryOne(il, selFull)) ||
    (await tryOne(il, selCore))
  );
}

/** Library songs the owner marked `public_on_profile` (separate RLS policy). */
async function supabaseFetchPublicLibraryForUserId(userId) {
  const uid = String(userId || "").trim();
  if (!uid || !SUPABASE_URL || !SUPABASE_ANON_KEY) return [];
  const enc = encodeURIComponent(uid);
  const cols = "id,created_at,title,song_url,task_id,audio_id,kind,art_url";
  const artUrlGuard = `&or=${encodeURIComponent("(art_url.is.null,art_url.not.like.data:*)")}`;
  try {
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/user_songs?user_id=eq.${enc}&public_on_profile=eq.true&select=${cols}&order=created_at.desc&limit=80${artUrlGuard}`,
      { headers: { apikey: SUPABASE_ANON_KEY }, cache: "no-store" },
    );
    if (!r.ok) return [];
    const arr = await r.json().catch(() => []);
    if (!Array.isArray(arr)) return [];
    return arr.map((s) => ({
      id: String(s.id || ""),
      ts: new Date(s.created_at || Date.now()).getTime(),
      title: s.title || "Generated song",
      artUrl: s.art_url || "",
      url: s.song_url || "",
      taskId: s.task_id || "",
      audioId: s.audio_id || "",
      kind: s.kind || "full",
      meta: null,
      publicOnProfile: true,
    }));
  } catch {
    return [];
  }
}

/** Recent `user_songs` rows anyone marked public (RLS: `public_on_profile` select). */
async function supabaseFetchDiscoveryPublicSongs(limit) {
  const lim = Math.max(1, Math.min(80, Number(limit) || 48));
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return [];
  const cols = "id,created_at,title,song_url,task_id,audio_id,kind,art_url,user_id";
  const artUrlGuard = `&or=${encodeURIComponent("(art_url.is.null,art_url.not.like.data:*)")}`;
  try {
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/user_songs?public_on_profile=eq.true&select=${cols}&order=created_at.desc&limit=${lim}${artUrlGuard}`,
      { headers: { apikey: SUPABASE_ANON_KEY, Accept: "application/json" }, cache: "no-store" },
    );
    if (!r.ok) {
      const det = await r.text().catch(() => "");
      console.warn("[discovery/user_songs]", r.status, det.slice(0, 280));
      return [];
    }
    const arr = await r.json().catch(() => []);
    if (!Array.isArray(arr)) return [];
    return arr.map((s) => ({
      id: String(s.id || ""),
      ts: new Date(s.created_at || Date.now()).getTime(),
      title: s.title || "Generated song",
      artUrl: String(s.art_url || "").trim(),
      url: String(s.song_url || "").trim(),
      taskId: String(s.task_id || ""),
      audioId: String(s.audio_id || ""),
      kind: s.kind || "full",
      userId: String(s.user_id || "").trim(),
    }));
  } catch (e) {
    console.warn("[discovery/user_songs]", e);
    return [];
  }
}

async function fetchProfilesByUserIdsMap(userIds) {
  const ids = [...new Set((userIds || []).map((x) => String(x || "").trim()).filter(Boolean))];
  if (!ids.length || !SUPABASE_URL || !SUPABASE_ANON_KEY) return new Map();
  const inClause = ids.map((id) => encodeURIComponent(id)).join(",");
  try {
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/profiles?user_id=in.(${inClause})&select=user_id,username,avatar`,
      { headers: { apikey: SUPABASE_ANON_KEY, Accept: "application/json" }, cache: "no-store" },
    );
    if (!r.ok) return new Map();
    const arr = await r.json().catch(() => []);
    const m = new Map();
    for (const row of Array.isArray(arr) ? arr : []) {
      const uid = String(row?.user_id || "").trim();
      if (uid) m.set(uid, row);
    }
    return m;
  } catch {
    return new Map();
  }
}

function discoveryEmptyIllustrationSvg() {
  return `<svg class="discoveryEmptySvg" viewBox="0 0 120 120" aria-hidden="true">
  <circle cx="60" cy="60" r="52" fill="none" stroke="rgba(124,92,255,0.45)" stroke-width="2.2"/>
  <circle cx="60" cy="60" r="34" fill="rgba(255,255,255,0.045)" stroke="rgba(255,255,255,0.11)" stroke-width="1.2"/>
  <circle cx="60" cy="60" r="9" fill="rgba(232,238,247,0.88)"/>
  <path fill="rgba(56,189,248,0.28)" d="M26 44c9-11 24-17 39-15 3 0 6 2 5 6l-4 15c-1 3-5 4-8 3-11-3-21 2-28 11-2 3-7 3-9-1l-9-13c-2-3 0-8 4-9zm68 32c-9 11-24 17-39 15-3 0-6-2-5-6l4-15c1-3 5-4 8-3 11 3 21-2 28-11 2-3 7-3 9 1l9 13c2 3 0 8-4 9z"/>
</svg>`;
}

function dismissDiscoverFeedPlayback() {
  if (miniSource?.type !== "discover_feed") return;
  try {
    if (playerEl) {
      playerEl.pause();
      playerEl.currentTime = 0;
      try {
        playerEl.removeAttribute("src");
        playerEl.load();
      } catch {}
    }
  } catch {}
  miniSource = null;
  currentPlayerTrackRef = null;
  try {
    syncPlayerUI();
  } catch {}
  try {
    syncPlayerToggleUI();
  } catch {}
  try {
    updateBrandPulse();
  } catch {}
  try {
    renderHubNowPlaying();
  } catch {}
}

function decodeDiscoveryUserLibUrl(el) {
  const raw = el?.getAttribute?.("data-user-lib-url") || "";
  if (!raw) return "";
  try {
    return decodeURIComponent(raw);
  } catch {
    return String(raw);
  }
}

function decodeDiscoverDataAttr(el, attrName) {
  const raw = el?.getAttribute?.(attrName);
  if (raw == null || raw === "") return "";
  try {
    return decodeURIComponent(raw);
  } catch {
    return String(raw);
  }
}

/** Build a share URL for a Discover row (creator profile when we know the handle). */
function discoverSharePageUrl(ctx) {
  const pathBase = `${location.origin.replace(/\/$/, "")}${location.pathname.replace(/\/$/, "")}`;
  const handle = String(ctx?.handle || "").trim();
  if (handle) return `${pathBase}#/u/${encodeURIComponent(handle)}`;
  return `${pathBase}#/discover`;
}

/** Read `data-dp-*` from a Discover ⋯ control into sheet + action context. */
function readDiscoverSheetPayload(el) {
  if (!el?.getAttribute) return null;
  const encUrl = el.getAttribute("data-dp-url");
  if (encUrl == null || encUrl === "") return null;
  let url = "";
  try {
    url = decodeURIComponent(encUrl);
  } catch {
    url = String(encUrl);
  }
  url = String(url || "").trim();
  if (!url) return null;
  const title = decodeDiscoverDataAttr(el, "data-dp-title") || "Song";
  const art = decodeDiscoverDataAttr(el, "data-dp-art") || "";
  const by = decodeDiscoverDataAttr(el, "data-dp-by") || "";
  const handle = String(decodeDiscoverDataAttr(el, "data-dp-handle") || "").trim();
  return { url, title, art, by, handle };
}

let _trackSheetCtx = null;

function formatLibrarySheetSubtitle(t) {
  if (!t) return "Library";
  const dateLabel = formatLibraryDate(t.ts);
  const bits = [];
  if (dateLabel) bits.push(dateLabel);
  if (t.kind === "instrumental") bits.push("Instrumental");
  if (t.kind === "sound") bits.push("Sound");
  bits.push(t.publicOnProfile ? "Public" : "Private");
  return bits.join(" · ") || "Library";
}

function renderTrackSheetDiscover(ctx) {
  const q = document.getElementById("trackSheetQuickMount");
  const l = document.getElementById("trackSheetListMount");
  if (!q || !l) return;
  q.innerHTML = `
    <button type="button" class="discoverTrackSheetQuickBtn discoverTrackSheetQuickBtn--accent" data-track-sheet-action="remix">Remix</button>
    <button type="button" class="discoverTrackSheetQuickBtn" data-track-sheet-action="player">Player</button>
    <button type="button" class="discoverTrackSheetQuickBtn" data-track-sheet-action="share">Share</button>
  `;
  const hideProfileRow = Boolean(ctx.hideDiscoverProfile) || !String(ctx.handle || "").trim();
  const shuffleLabel = ctx.usePublicProfileShuffle
    ? "Play another from this profile"
    : "Play another from Discover";
  l.innerHTML = `
    <button type="button" class="discoverTrackSheetRow" data-track-sheet-action="profile" id="discoverSheetRowProfile"${hideProfileRow ? " hidden" : ""}>View profile</button>
    <button type="button" class="discoverTrackSheetRow" data-track-sheet-action="copy">Copy link</button>
    <button type="button" class="discoverTrackSheetRow" data-track-sheet-action="shuffle">${escapeHtml(shuffleLabel)}</button>
    <button type="button" class="discoverTrackSheetRow discoverTrackSheetRow--danger" data-track-sheet-action="report">Report</button>
  `;
}

function renderTrackSheetLibrary(track) {
  const q = document.getElementById("trackSheetQuickMount");
  const l = document.getElementById("trackSheetListMount");
  if (!q || !l) return;
  const kind = String(track?.kind || "full");
  const isInstrumental = kind === "instrumental";
  const isSound = kind === "sound";
  const remixEligible = !isSound && Boolean(track?.url && String(track.url).trim());
  const personaEligible = !isInstrumental && !isSound && Boolean(track?.taskId) && Boolean(track?.audioId);
  const profilePublic = Boolean(track.publicOnProfile);
  const pubTo = profilePublic ? "private" : "public";
  const pubLabel = profilePublic ? "Hide from public profile" : "Show on public profile";
  const quickRemix = remixEligible
    ? `<button type="button" class="discoverTrackSheetQuickBtn discoverTrackSheetQuickBtn--accent" data-track-sheet-action="library_remix">Remix</button>`
    : "";
  q.innerHTML = `
    ${quickRemix}
    <button type="button" class="discoverTrackSheetQuickBtn" data-track-sheet-action="library_player">Player</button>
    <button type="button" class="discoverTrackSheetQuickBtn" data-track-sheet-action="library_share">Share</button>
  `;
  l.innerHTML = `
    <button type="button" class="discoverTrackSheetRow" data-track-sheet-action="library_dl_audio">Download audio</button>
    <button type="button" class="discoverTrackSheetRow" data-track-sheet-action="library_dl_video">Download video</button>
    ${HUB_FEATURE_ENABLED ? `<button type="button" class="discoverTrackSheetRow" data-track-sheet-action="library_share_hub">Share to Hub</button>` : ""}
    ${personaEligible ? `<button type="button" class="discoverTrackSheetRow" data-track-sheet-action="library_persona">Save voice as persona</button>` : ""}
    <button type="button" class="discoverTrackSheetRow" data-track-sheet-action="library_pubprof" data-track-sheet-pub-to="${pubTo}">${escapeHtml(pubLabel)}</button>
    <button type="button" class="discoverTrackSheetRow" data-track-sheet-action="library_details">Song details</button>
    ${isInstrumental ? "" : `<button type="button" class="discoverTrackSheetRow" data-track-sheet-action="library_inst">Get instrumental</button>`}
    <button type="button" class="discoverTrackSheetRow discoverTrackSheetRow--danger" data-track-sheet-action="library_del">Delete</button>
  `;
}

function renderTrackSheetProfileLib(t) {
  const q = document.getElementById("trackSheetQuickMount");
  const l = document.getElementById("trackSheetListMount");
  if (!q || !l) return;
  const kind = String(t?.kind || "full");
  const isSound = kind === "sound";
  const remixEligible = !isSound && Boolean(t?.url && String(t.url).trim());
  const quickRemix = remixEligible
    ? `<button type="button" class="discoverTrackSheetQuickBtn discoverTrackSheetQuickBtn--accent" data-track-sheet-action="profile_lib_remix">Remix</button>`
    : "";
  q.innerHTML = `
    ${quickRemix}
    <button type="button" class="discoverTrackSheetQuickBtn" data-track-sheet-action="profile_lib_player">Player</button>
    <button type="button" class="discoverTrackSheetQuickBtn" data-track-sheet-action="profile_lib_share">Share</button>
  `;
  l.innerHTML = `
    <button type="button" class="discoverTrackSheetRow discoverTrackSheetRow--danger" data-track-sheet-action="profile_lib_hide">Hide from public profile</button>
  `;
}

function renderTrackSheetProfileHub(p) {
  const q = document.getElementById("trackSheetQuickMount");
  const l = document.getElementById("trackSheetListMount");
  if (!q || !l) return;
  const sid = String(p.id);
  const profilePublic = Boolean(p.publicOnProfile);
  const pathBase = `${location.origin.replace(/\/$/, "")}${location.pathname.replace(/\/$/, "")}`;
  const shareUrl = HUB_FEATURE_ENABLED ? `${pathBase}#/hub?post=${encodeURIComponent(sid)}` : `${pathBase}#/profile`;
  q.innerHTML = `
    <button type="button" class="discoverTrackSheetQuickBtn" data-track-sheet-action="profile_hub_player">Player</button>
    <button type="button" class="discoverTrackSheetQuickBtn" data-track-sheet-action="profile_hub_share" data-track-sheet-share-url="${escapeHtml(shareUrl)}">Share</button>
  `;
  l.innerHTML = `
    <button type="button" class="discoverTrackSheetRow" data-track-sheet-action="profile_hub_vis" data-track-sheet-pub-to="${profilePublic ? "private" : "public"}">${profilePublic ? "Hide from public profile" : "Show on public profile"}</button>
    <button type="button" class="discoverTrackSheetRow" data-track-sheet-action="profile_hub_proof">Proof of creation</button>
    <button type="button" class="discoverTrackSheetRow discoverTrackSheetRow--danger" data-track-sheet-action="profile_hub_unpublish">Unpublish from Hub</button>
  `;
}

function openTrackSheetShell(payload) {
  const sheet = document.getElementById("discoverTrackSheet");
  const artEl = document.getElementById("discoverTrackSheetArt");
  const tEl = document.getElementById("discoverTrackSheetTitle");
  const sEl = document.getElementById("discoverTrackSheetSub");
  if (artEl) {
    artEl.src = payload.artUrl || "./assets/nabadai-logo.png";
    artEl.alt = "";
  }
  if (tEl) tEl.textContent = payload.title || "Song";
  if (sEl) sEl.textContent = payload.sub || "";
  if (!sheet) return;
  sheet.hidden = false;
  sheet.setAttribute("aria-hidden", "false");
  requestAnimationFrame(() => sheet.classList.add("isOpen"));
  try {
    document.body.style.overflow = "hidden";
  } catch {}
}

function closeTrackOptionsSheet() {
  const sheet = document.getElementById("discoverTrackSheet");
  if (!sheet) return;
  sheet.classList.remove("isOpen");
  _trackSheetCtx = null;
  try {
    document.body.style.overflow = "";
  } catch {}
  window.setTimeout(() => {
    sheet.hidden = true;
    sheet.setAttribute("aria-hidden", "true");
    const q = document.getElementById("trackSheetQuickMount");
    const l = document.getElementById("trackSheetListMount");
    if (q) q.innerHTML = "";
    if (l) l.innerHTML = "";
  }, 260);
}

function openDiscoverTrackSheetFromEl(el) {
  const base = readDiscoverSheetPayload(el);
  if (!base) return;
  const hideDiscoverProfile = el.getAttribute("data-dp-hide-profile") === "1";
  const usePublicProfileShuffle = el.getAttribute("data-dp-use-public-shuffle") === "1";
  const ctx = { ...base, hideDiscoverProfile, usePublicProfileShuffle };
  _trackSheetCtx = { mode: "discover", ...ctx };
  renderTrackSheetDiscover(ctx);
  openTrackSheetShell({
    title: base.title || "Song",
    sub: base.by || "Discover",
    artUrl: base.art || "./assets/nabadai-logo.png",
  });
}

function openLibraryTrackOptionsFromMenuButton(id) {
  const t = loadLibrary().find((x) => String(x.id) === String(id));
  if (!t) return;
  _trackSheetCtx = { mode: "library", libraryId: t.id };
  renderTrackSheetLibrary(t);
  const art =
    String((t.meta && (t.meta.imageThumb || t.meta.imageUrl)) || t.artUrl || "").trim() ||
    "./assets/nabadai-logo.png";
  openTrackSheetShell({
    title: String(t.title || "").trim() || "Song",
    sub: formatLibrarySheetSubtitle(t),
    artUrl: art,
  });
}

function openProfilePublicTrackSheet(id) {
  const t = loadLibrary().find((x) => String(x.id) === String(id));
  if (!t) return;
  _trackSheetCtx = { mode: "profile_lib", libraryId: t.id };
  renderTrackSheetProfileLib(t);
  const art =
    String((t.meta && (t.meta.imageThumb || t.meta.imageUrl)) || t.artUrl || "").trim() ||
    "./assets/nabadai-logo.png";
  openTrackSheetShell({
    title: String(t.title || "").trim() || "Song",
    sub: "On your public profile",
    artUrl: art,
  });
}

function openProfileHubPostSheet(sid) {
  const p = loadHubFeed().find((x) => String(x.id) === String(sid));
  if (!p) return;
  _trackSheetCtx = { mode: "profile_hub", hubPostId: sid, hubTitle: p.title || "Song" };
  renderTrackSheetProfileHub(p);
  const art = String(p.artUrl || "./assets/nabadai-logo.png").trim();
  openTrackSheetShell({
    title: p.title || "Song",
    sub: "On your Hub",
    artUrl: art,
  });
}

async function playLibraryListRowById(id, opts) {
  let t = loadLibrary().find((x) => x.id === id);
  if (!t?.url) return;
  try {
    stopHubPlayback();
  } catch {}
  const rawForPlay = unwrapInnermostHttpAudioUrl(t.url);
  let playSource = normalizeAudioUrlForPlayback(toAudioProxyUrl(rawForPlay) || rawForPlay);
  const refreshed = await tryRefreshLibraryTrackAudioFromSuno(t);
  if (refreshed?.url) {
    const freshInner = String(refreshed.url).trim();
    const newProx = normalizeAudioUrlForPlayback(toAudioProxyUrl(freshInner) || freshInner);
    if (freshInner !== rawForPlay) {
      const updated = patchLibraryRowWithRefreshedUrl(id, newProx, freshInner, t);
      if (updated) t = updated;
    }
    playSource = newProx;
  }
  currentPlayerTrackRef = t;
  const meta = {
    title: t.title || "Library song",
    subtitle: "Library · Full song",
    artUrl: (t.meta && t.meta.imageUrl) || t.artUrl || placeholderCoverDataUrl(),
  };
  setPlayerMeta(meta);
  miniSource = { type: "library", id };
  libraryNowPlayingId = id;
  renderLibrary();
  const openPlayer = opts?.openPlayer === true;
  if (openPlayer) {
    await playOnPlayerPage(playSource, "Full song", meta);
  } else {
    await playInline(playSource, "Full song", { type: "library", id });
  }
}

async function startLibraryRemixForLibraryTrack(t) {
  if (!t?.url || !String(t.url).trim()) {
    showToast("This song has no audio to remix.", { icon: "!", durationMs: 3200 });
    return;
  }
  if (!authSession?.user?.id) {
    showToast("Sign in to remix a library song.", { icon: "!", durationMs: 3800 });
    try {
      location.hash = "#/auth";
    } catch {}
    return;
  }
  let track = t;
  try {
    const refreshed = await tryRefreshLibraryTrackAudioFromSuno(t);
    if (refreshed?.url) track = { ...t, ...refreshed };
  } catch {}
  const rawInner = unwrapInnermostHttpAudioUrl(track.url);
  if (!String(rawInner || "").trim()) {
    showToast("Could not resolve audio for remix.", { icon: "!", durationMs: 3400 });
    return;
  }
  const remixUrl =
    normalizeAudioUrlForPlayback(toAudioProxyUrl(rawInner) || rawInner) || rawInner;
  const art =
    String((track.meta && (track.meta.imageThumb || track.meta.imageUrl)) || track.artUrl || "").trim() ||
    "./assets/nabadai-logo.png";
  const handle = String(activeProfile?.username || "").trim();
  await startHubRemix({
    url: remixUrl,
    title: track.title || "Library song",
    creator: handle,
    artUrl: art,
    meta: {
      lyricsInput: String(track?.meta?.lyricsInput || track?.meta?.finalPrompt || "").trim(),
      styleInput: String(track?.meta?.styleInput || track?.meta?.styleSent || "").trim(),
    },
  });
}

async function runLibraryInstrumentalForTrack(t) {
  if (!t?.taskId || !t?.audioId) {
    setStatus("This song is missing generation ids for instrumental request.");
    return;
  }
  try {
    setStatus("Getting instrumental for selected song…");
    setLoading(true, { title: "Getting your instrumental version…", sub: "Processing selected library song." });
    const stemsTok = getSupabaseAuthToken();
    const r = await fetch(apiUrl("/api/suno/stems"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(stemsTok ? { Authorization: `Bearer ${stemsTok}` } : {}),
      },
      body: JSON.stringify({ taskId: t.taskId, audioId: t.audioId, type: "separate_vocal" }),
    });
    const d = await r.json().catch(() => ({}));
    if (r.status === 402 || d?.code === "insufficient_credits") {
      const need = Number(d?.needed ?? 2);
      const have = Number(d?.balance || 0);
      throw new Error(
        `Not enough credits to extract vocals (you have ${have}, need ${need}). Open Profile → Credits to redeem a code.`
      );
    }
    if (!r.ok) throw new Error(d?.error || "Instrumental request failed");
    try {
      if (typeof refreshMyCredits === "function") void refreshMyCredits({ silent: true });
    } catch {}
    sunoStemsTaskId = d?.data?.taskId || d?.data?.task_id || d?.taskId || null;
    if (!sunoStemsTaskId) throw new Error("Missing stems task id");
    setStatus("Instrumental requested from library song. Processing now…");
    void pollLibraryStemsUntilDone(sunoStemsTaskId, "inst", {
      sourceTitle: t.title,
      sourceArtUrl: t.artUrl || (t.meta && t.meta.imageUrl) || "",
    });
  } catch (err) {
    setStatus(`Library instrumental failed: ${err?.message || String(err)}`);
    setLoading(false);
  }
}

function runTrackSheetAction(action, sourceEl) {
  const ctx = _trackSheetCtx;
  if (!ctx || !action) return;
  const shut = () => closeTrackOptionsSheet();

  if (ctx.mode === "discover") {
    if (action === "remix") {
      if (!authSession?.user?.id) {
        showToast("Sign in to remix songs from Discover.", { icon: "!", durationMs: 3800 });
        shut();
        try {
          location.hash = "#/auth";
        } catch {}
        return;
      }
      shut();
      void startHubRemix({
        url: ctx.url,
        title: ctx.title,
        creator: ctx.handle || "",
        artUrl: ctx.art,
        meta: { lyricsInput: "", styleInput: "" },
      });
      return;
    }
    if (action === "player") {
      shut();
      const fromPublicU = Boolean(ctx.usePublicProfileShuffle);
      void playLibraryUrlOnPlayer(ctx.url, ctx.title, ctx.art, {
        discoverFeed: !fromPublicU,
        openPlayer: true,
        discoverBy: fromPublicU ? "" : ctx.by,
      });
      return;
    }
    if (action === "share") {
      shut();
      window.setTimeout(() => {
        void shareHubLink({
          title: ctx.title ? `${ctx.title} — NabadAi` : "NabadAi Music",
          text: ctx.by ? `${ctx.title} · ${ctx.by}` : ctx.title || "Discover on NabadAi",
          url: discoverSharePageUrl(ctx),
        });
      }, 220);
      return;
    }
    if (action === "profile") {
      if (!ctx.handle) return;
      shut();
      try {
        location.hash = `#/u/${encodeURIComponent(ctx.handle)}`;
      } catch {}
      return;
    }
    if (action === "copy") {
      shut();
      const url = discoverSharePageUrl(ctx);
      if (navigator.clipboard?.writeText) {
        navigator.clipboard
          .writeText(url)
          .then(() => showToast("Link copied", { icon: "✓" }))
          .catch(() => showToast("Could not copy", { icon: "!" }));
      } else {
        showToast("Could not copy", { icon: "!" });
      }
      return;
    }
    if (action === "shuffle") {
      shut();
      if (ctx.usePublicProfileShuffle) {
        void playRandomUserPublicFeedTrack(ctx.url);
        return;
      }
      void playRandomDiscoveryFeedTrack(ctx.url);
      return;
    }
    if (action === "report") {
      shut();
      const note = window.prompt("What should we know? (optional)", "");
      showToast("Thanks — we review reports as soon as we can.", { icon: "✓", durationMs: 3400 });
      if (note && String(note).trim()) {
        console.info("[discover/report]", {
          title: ctx.title,
          by: ctx.by,
          handle: ctx.handle,
          note: String(note).trim(),
        });
      }
      return;
    }
    return;
  }

  if (ctx.mode === "library") {
    const t = loadLibrary().find((x) => String(x.id) === String(ctx.libraryId));
    if (!t) return;
    if (action === "library_remix") {
      shut();
      void startLibraryRemixForLibraryTrack(t);
      return;
    }
    if (action === "library_player") {
      shut();
      void playLibraryListRowById(t.id, { openPlayer: true });
      return;
    }
    if (action === "library_share") {
      shut();
      const handle = String(activeProfile?.username || "").trim();
      const pathBase = `${location.origin.replace(/\/$/, "")}${location.pathname.replace(/\/$/, "")}`;
      const url =
        t.publicOnProfile && handle
          ? `${pathBase}#/u/${encodeURIComponent(handle)}`
          : `${pathBase}#/library`;
      void shareHubLink({
        title: t.title ? `${t.title} — NabadAi` : "NabadAi Music",
        text: t.title || "From my library",
        url,
      });
      return;
    }
    if (action === "library_dl_audio") {
      shut();
      void (async () => {
        try {
          setStatus("Preparing audio download…");
          await downloadLibraryAudioTrack(t);
          setStatus("Audio download is ready.");
        } catch (err) {
          setStatus(`Audio download failed: ${err?.message || String(err)}`);
        }
      })();
      return;
    }
    if (action === "library_dl_video") {
      shut();
      void (async () => {
        try {
          setStatus("Preparing video download…");
          await downloadLibraryVideoTrack(t);
          setStatus("Video download is ready.");
        } catch (err) {
          setStatus(`Video download failed: ${err?.message || String(err)}`);
        }
      })();
      return;
    }
    if (action === "library_share_hub") {
      shut();
      if (!HUB_FEATURE_ENABLED) {
        showToast?.("Hub sharing is paused.", { durationMs: 3200 });
        return;
      }
      shareToHub(t);
      openShareLiveModal(t.title || "Your song");
      setStatus("Shared to Hub.");
      return;
    }
    if (action === "library_persona") {
      shut();
      void createPersonaForSong({
        taskId: t.taskId,
        audioId: t.audioId,
        audioUrl: t.url,
        title: t.title,
        style: t?.meta?.style,
        voiceProfile: t?.meta?.voiceProfile,
        dialect: t?.meta?.dialect,
        timbre: activeProfile?.voiceTimbre,
        source: "library",
      });
      return;
    }
    if (action === "library_pubprof") {
      const to = String(sourceEl?.getAttribute?.("data-track-sheet-pub-to") || "").toLowerCase();
      shut();
      if (to === "public" || to === "private") {
        void setLibraryTrackPublicOnProfile(t.id, to === "public");
      }
      return;
    }
    if (action === "library_details") {
      shut();
      openSongDetailsModal({
        title: t.title,
        createdAt: new Date(t.ts).toLocaleString(),
        taskId: t.taskId || "",
        audioId: t.audioId || "",
        kind: t.kind || "",
        ...(t.meta || {}),
      });
      return;
    }
    if (action === "library_inst") {
      shut();
      void runLibraryInstrumentalForTrack(t);
      return;
    }
    if (action === "library_del") {
      const title = String(t?.title || "this song").trim() || "this song";
      const sharedToHub =
        HUB_FEATURE_ENABLED &&
        loadHubFeed().some(
          (p) =>
            String(p?.url || "").trim() === String(t?.url || "").trim() &&
            String(p?.creator || "").trim() === String(activeProfile.username || "guest").trim(),
        );
      const hubHint = sharedToHub
        ? "\n\nThis song is also on Hub. It will stay public — manage your Hub posts in Profile → Songs on Hub."
        : "";
      const ok = window.confirm(`Remove "${title}" from your Library?${hubHint}`);
      if (!ok) return;
      shut();
      removeFromLibrary(t.id);
      setStatus("Song removed from Library.");
      return;
    }
    return;
  }

  if (ctx.mode === "profile_lib") {
    const t = loadLibrary().find((x) => String(x.id) === String(ctx.libraryId));
    if (!t) return;
    if (action === "profile_lib_player") {
      shut();
      void playLibraryListRowById(t.id, { openPlayer: true });
      return;
    }
    if (action === "profile_lib_remix") {
      shut();
      void startLibraryRemixForLibraryTrack(t);
      return;
    }
    if (action === "profile_lib_share") {
      shut();
      const handle = String(activeProfile?.username || "").trim();
      const pathBase = `${location.origin.replace(/\/$/, "")}${location.pathname.replace(/\/$/, "")}`;
      const url = handle ? `${pathBase}#/u/${encodeURIComponent(handle)}` : `${pathBase}#/library`;
      void shareHubLink({
        title: t.title ? `${t.title} — NabadAi` : "NabadAi Music",
        text: t.title || "From my profile",
        url,
      });
      return;
    }
    if (action === "profile_lib_hide") {
      shut();
      void setLibraryTrackPublicOnProfile(t.id, false);
      return;
    }
    return;
  }

  if (ctx.mode === "profile_hub") {
    const sid = String(ctx.hubPostId || "");
    if (action === "profile_hub_player") {
      shut();
      void playHubPostFromProfile(sid, { openPlayer: true });
      return;
    }
    if (action === "profile_hub_share") {
      shut();
      const u = String(sourceEl?.getAttribute?.("data-track-sheet-share-url") || "").trim();
      void shareHubLink({
        title: ctx.hubTitle ? `${ctx.hubTitle} — NabadAi` : "NabadAi Music",
        text: ctx.hubTitle || "Hub song",
        url: u || `${location.origin}${location.pathname}`.replace(/\/$/, ""),
      });
      return;
    }
    if (action === "profile_hub_vis") {
      const to = String(sourceEl?.getAttribute?.("data-track-sheet-pub-to") || "").toLowerCase();
      shut();
      if (to !== "public" && to !== "private") return;
      const wantPublic = to === "public";
      void (async () => {
        const result = await setHubPostProfileVisibility(sid, wantPublic);
        if (result?.ok) {
          showToast(wantPublic ? "Now visible on your public profile." : "Hidden from your public profile.");
        } else {
          showToast(String(result?.reason || "Could not update."), { durationMs: 4200 });
        }
      })();
      return;
    }
    if (action === "profile_hub_proof") {
      shut();
      void (async () => {
        let post = loadHubFeed().find((x) => String(x.id) === sid);
        if (!post) return;
        if (!post.proof?.model && !post.proof?.mode && !post.proof?.promptHash) {
          const proof = await hubFetchPostProofFull(sid);
          if (proof) post = { ...post, proof };
        }
        openProofModal(post);
      })();
      return;
    }
    if (action === "profile_hub_unpublish") {
      const post = loadHubFeed().find((x) => String(x.id) === sid);
      const title = String(post?.title || "this post").trim() || "this post";
      const ok = window.confirm(
        `Unpublish "${title}" from Hub?\n\nThis takes the post off the public feed. Your Library copy stays on this device.`,
      );
      if (!ok) return;
      shut();
      void (async () => {
        const result = await unpublishHubPostById(sid);
        if (result?.ok) {
          setStatus("Unpublished from Hub.");
          showToast("Removed from Hub ✓");
        } else {
          const reason = result?.reason || "Try again.";
          setStatus(`Could not unpublish: ${reason}`);
          showToast(reason, { durationMs: 4500 });
        }
      })();
      return;
    }
  }
}

function wireTrackOptionsSheetOnce() {
  const sheet = document.getElementById("discoverTrackSheet");
  if (!sheet || sheet.dataset.wiredTrackSheet) return;
  sheet.dataset.wiredTrackSheet = "1";
  sheet.addEventListener("click", (e) => {
    const t = e.target;
    if (t && t.closest && t.closest("[data-track-sheet-dismiss]")) {
      e.preventDefault();
      closeTrackOptionsSheet();
      return;
    }
    const act = t && t.closest && t.closest("[data-track-sheet-action]");
    if (act) {
      e.preventDefault();
      const action = act.getAttribute("data-track-sheet-action");
      if (action) runTrackSheetAction(action, act);
    }
  });
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (!sheet.classList.contains("isOpen")) return;
    closeTrackOptionsSheet();
  });
}


/** Same contract as Library rows: `active` when this feed URL is loaded from Discover;
 *  `audible` when audio is actively playing (EQ + pause badge). */
function getDiscoveryPlaybackUiForUrl(trackUrl) {
  const u = String(trackUrl || "").trim();
  if (!u) return { active: false, audible: false };
  if (miniSource?.type !== "discover_feed") return { active: false, audible: false };
  const cur = String(currentPlayerTrackRef?.url || "").trim();
  if (!cur || cur !== u) return { active: false, audible: false };
  const a = ensurePlayer();
  if (!a) return { active: true, audible: false };
  const dur = getPlayerDuration();
  const ct = Number.isFinite(a.currentTime) ? a.currentTime : 0;
  const audible = Boolean(!a.paused && !a.ended && (dur > 0 || ct > 0));
  return { active: true, audible };
}

/** Public `#/u/…` song rows: same UI contract as Discover, keyed off `public_profile_lib`. */
function getPublicProfileLibPlaybackUiForUrl(trackUrl) {
  const u = String(trackUrl || "").trim();
  if (!u) return { active: false, audible: false };
  if (miniSource?.type !== "public_profile_lib") return { active: false, audible: false };
  const cur = String(currentPlayerTrackRef?.url || "").trim();
  if (!cur || cur !== u) return { active: false, audible: false };
  const a = ensurePlayer();
  if (!a) return { active: true, audible: false };
  const dur = getPlayerDuration();
  const ct = Number.isFinite(a.currentTime) ? a.currentTime : 0;
  const audible = Boolean(!a.paused && !a.ended && (dur > 0 || ct > 0));
  return { active: true, audible };
}

/** When Discover is already playing this URL, toggle pause/play (thumb + spotlight). */
function toggleDiscoverFeedPlaybackIfSameUrl(rawUrl) {
  const raw = String(rawUrl || "").trim();
  if (miniSource?.type !== "discover_feed") return false;
  const cur = String(currentPlayerTrackRef?.url || "").trim();
  if (!raw || !cur || raw !== cur) return false;
  const a = ensurePlayer();
  const dur = getPlayerDuration();
  const ct = Number.isFinite(a.currentTime) ? a.currentTime : 0;
  const audible = Boolean(!a.paused && !a.ended && (dur > 0 || ct > 0));
  if (audible) {
    try {
      a.pause();
    } catch {}
  } else {
    try {
      void a.play();
    } catch {}
  }
  try {
    syncPlayerUI();
  } catch {}
  return true;
}

function togglePublicProfileLibPlaybackIfSameUrl(rawUrl) {
  const raw = String(rawUrl || "").trim();
  if (miniSource?.type !== "public_profile_lib") return false;
  const cur = String(currentPlayerTrackRef?.url || "").trim();
  if (!raw || !cur || raw !== cur) return false;
  const a = ensurePlayer();
  const dur = getPlayerDuration();
  const ct = Number.isFinite(a.currentTime) ? a.currentTime : 0;
  const audible = Boolean(!a.paused && !a.ended && (dur > 0 || ct > 0));
  if (audible) {
    try {
      a.pause();
    } catch {}
  } else {
    try {
      void a.play();
    } catch {}
  }
  try {
    syncPlayerUI();
  } catch {}
  return true;
}

function syncDiscoveryPlayingHighlights() {
  const root = document.getElementById("discoveryPaneDiscover");
  if (!root) return;

  const resetDiscoveryHost = (host) => {
    host.classList.remove("discoveryRowPlaying", "discoveryRowActive");
    try {
      host.style.removeProperty("--cover-glow-rgb");
    } catch {}
    const badge = host.querySelector(".discoveryRowArtBadge, .discoverySpotCardArtBadge");
    if (badge) badge.textContent = "▶";
    if (host.classList.contains("discoveryRow")) {
      const artBtn = host.querySelector("[data-discovery-inline-play]");
      if (artBtn) {
        const name = String(artBtn.getAttribute("data-user-lib-title") || "").trim() || "Song";
        artBtn.setAttribute("aria-label", `Play ${name}`);
      }
    } else if (host.classList.contains("discoverySpotCard")) {
      const name = String(host.getAttribute("data-user-lib-title") || "").trim() || "Song";
      host.setAttribute("aria-label", `Play ${name}`);
    }
  };

  root.querySelectorAll(".discoveryRow").forEach(resetDiscoveryHost);
  root.querySelectorAll(".discoverySpotCard").forEach(resetDiscoveryHost);

  const curRef = String(currentPlayerTrackRef?.url || "").trim();
  if (miniSource?.type !== "discover_feed" || !curRef) return;

  const paintHost = (host, urlEl) => {
    if (!urlEl) return;
    const trackUrl = decodeDiscoveryUserLibUrl(urlEl);
    const { active, audible } = getDiscoveryPlaybackUiForUrl(trackUrl);
    if (!active) return;
    host.classList.toggle("discoveryRowPlaying", audible);
    host.classList.toggle("discoveryRowActive", active && !audible);
    const badge = host.querySelector(".discoveryRowArtBadge, .discoverySpotCardArtBadge");
    if (badge) badge.textContent = audible ? "❚❚" : "▶";
    if (host.classList.contains("discoveryRow")) {
      const artBtn = host.querySelector("[data-discovery-inline-play]");
      if (artBtn) {
        const name = String(artBtn.getAttribute("data-user-lib-title") || "").trim() || "Song";
        artBtn.setAttribute("aria-label", audible ? `Pause ${name}` : `Play ${name}`);
      }
    } else if (host.classList.contains("discoverySpotCard")) {
      const name = String(host.getAttribute("data-user-lib-title") || "").trim() || "Song";
      host.setAttribute("aria-label", audible ? `Pause ${name}` : `Play ${name}`);
    }
    const artHint =
      String(decodeDiscoverDataAttr(host, "data-user-lib-art") || "").trim() ||
      String(decodeDiscoverDataAttr(urlEl, "data-user-lib-art") || "").trim() ||
      String(host.querySelector?.(".discoverySpotCardArt img, .discoveryRowArt img")?.getAttribute?.("src") || "").trim();
    if (active) applyCoverGlowRgb(host, artHint);
  };

  root.querySelectorAll(".discoveryRow").forEach((row) => {
    const artBtn = row.querySelector("[data-discovery-inline-play]");
    paintHost(row, artBtn);
  });
  root.querySelectorAll(".discoverySpotCard").forEach((card) => {
    paintHost(card, card);
  });
}

function syncUserPublicFeedPlayingHighlights() {
  const root = document.getElementById("userPublicSongs");
  if (!root) return;

  const resetDiscoveryHost = (host) => {
    host.classList.remove("discoveryRowPlaying", "discoveryRowActive");
    try {
      host.style.removeProperty("--cover-glow-rgb");
    } catch {}
    const badge = host.querySelector(".discoveryRowArtBadge");
    if (badge) badge.textContent = "▶";
    const artBtn = host.querySelector("[data-discovery-inline-play]");
    if (artBtn) {
      const name = String(artBtn.getAttribute("data-user-lib-title") || "").trim() || "Song";
      let dec = name;
      try {
        dec = decodeURIComponent(name);
      } catch {}
      artBtn.setAttribute("aria-label", `Play ${dec}`);
    }
  };

  root.querySelectorAll(".discoveryRow").forEach(resetDiscoveryHost);

  const curRef = String(currentPlayerTrackRef?.url || "").trim();
  if (miniSource?.type !== "public_profile_lib" || !curRef) return;

  root.querySelectorAll(".discoveryRow").forEach((row) => {
    const artBtn = row.querySelector("[data-discovery-inline-play]");
    if (!artBtn) return;
    const trackUrl = decodeDiscoveryUserLibUrl(artBtn);
    const { active, audible } = getPublicProfileLibPlaybackUiForUrl(trackUrl);
    if (!active) return;
    row.classList.toggle("discoveryRowPlaying", audible);
    row.classList.toggle("discoveryRowActive", active && !audible);
    const badge = row.querySelector(".discoveryRowArtBadge");
    if (badge) badge.textContent = audible ? "❚❚" : "▶";
    if (artBtn) {
      const name = decodeDiscoverDataAttr(artBtn, "data-user-lib-title") || "Song";
      artBtn.setAttribute("aria-label", audible ? `Pause ${name}` : `Play ${name}`);
    }
    const artHint =
      String(decodeDiscoverDataAttr(artBtn, "data-user-lib-art") || "").trim() ||
      String(row.querySelector?.(".discoveryRowArt img")?.getAttribute?.("src") || "").trim();
    if (active) applyCoverGlowRgb(row, artHint);
  });
}

let _discoveryFeedGen = 0;
/** Playable Discover feed rows (spotlight + list) for shuffle-next on the mini player. */
let _discoveryFeedTracks = [];
/** Songs listed on `#/u/…` (Library public list or Hub-derived profile) for sheet shuffle. */
let _userPublicFeedTracks = [];

function discoveryTrackPlaybackMeta(t, profMap) {
  const art = String(t.artUrl || "").trim();
  const artSafe = art && !art.startsWith("data:") ? art : "./assets/nabadai-logo.png";
  const prof = t.userId ? profMap.get(t.userId) : null;
  const handle = String(prof?.username || "").trim();
  const byLine = handle ? `@${handle}` : "Creator";
  return {
    url: String(t.url || "").trim(),
    title: String(t.title || "Untitled"),
    artUrl: artSafe,
    byLine,
  };
}

/** Mini player “next” — pick another random song from the current Discover feed. */
async function playRandomDiscoveryFeedTrack(excludeUrl) {
  const pool = _discoveryFeedTracks.filter((t) => t.url && t.url !== String(excludeUrl || "").trim());
  const pickFrom = pool.length ? pool : _discoveryFeedTracks;
  if (!pickFrom.length) return;
  const pick = pickFrom[Math.floor(Math.random() * pickFrom.length)];
  haptic("light");
  await playLibraryUrlOnPlayer(pick.url, pick.title, pick.artUrl, {
    discoverFeed: true,
    openPlayer: false,
    discoverBy: pick.byLine,
  });
}

/** Mini player “next” / sheet shuffle — pick another random song from the current `#/u/…` list. */
async function playRandomUserPublicFeedTrack(excludeUrl) {
  const pool = _userPublicFeedTracks.filter((t) => t.url && t.url !== String(excludeUrl || "").trim());
  const pickFrom = pool.length ? pool : _userPublicFeedTracks;
  if (!pickFrom.length) return;
  const pick = pickFrom[Math.floor(Math.random() * pickFrom.length)];
  haptic("light");
  await playLibraryUrlOnPlayer(pick.url, pick.title, pick.artUrl, {
    openPlayer: false,
  });
}

/** Discover-style row for `#/u/…` public song lists (⋯ opens Discover sheet; no View profile). */
function userPublicDiscoveryRowHtml(t, idx, pub) {
  const art = String(t.artUrl || "").trim();
  const artSafe = art && !art.startsWith("data:") ? art : "./assets/nabadai-logo.png";
  const rawTitle = String(t.title || "Untitled");
  const safeTitle = escapeHtml(rawTitle);
  const encUrl = encodeURIComponent(String(t.url || ""));
  const encTitle = encodeURIComponent(rawTitle);
  const byLine = String(pub.byLine || "Creator");
  const encBy = encodeURIComponent(byLine);
  const encArt = encodeURIComponent(artSafe);
  const rawHandle = String(pub.rawHandle || "").trim().replace(/^@/, "");
  const encHandle = rawHandle ? encodeURIComponent(rawHandle) : "";
  const extra = pub.extraMeta ? ` · ${escapeHtml(String(pub.extraMeta))}` : "";
  const metaInner = `${escapeHtml(byLine)} · ${escapeHtml(relativeTime(t.ts))}${extra}`;
  const side = `<button type="button" class="discoveryRowSide" data-discovery-open-sheet="1" data-dp-hide-profile="1" data-dp-use-public-shuffle="1" data-dp-url="${encUrl}" data-dp-title="${encTitle}" data-dp-art="${encArt}" data-dp-by="${encBy}" data-dp-handle="${encHandle}" aria-label="Options for ${safeTitle}">⋯</button>`;
  return `
      <div class="discoveryRow userPublicFeedRow" style="--i:${idx}">
        <button type="button" class="discoveryRowArtBtn" data-discovery-inline-play="1" data-user-lib-url="${encUrl}" data-user-lib-title="${encTitle}" data-user-lib-art="${encArt}" data-discovery-by="${encBy}" aria-label="Play ${safeTitle}">
          <span class="discoveryRowArt">
            <img src="${escapeHtml(artSafe)}" alt="" loading="lazy" decoding="async" />
            <span class="discoveryRowArtGlow" aria-hidden="true"></span>
            <span class="discoveryRowArtBadge" aria-hidden="true">▶</span>
          </span>
        </button>
        <button type="button" class="discoveryRowMain" data-user-lib-play="1" data-user-lib-url="${encUrl}" data-user-lib-title="${encTitle}" data-user-lib-art="${encArt}" data-discovery-by="${encBy}" aria-label="Play ${safeTitle}">
          <span class="discoveryRowMid">
            <span class="discoveryRowTitle">${safeTitle}</span>
            <span class="discoveryRowMeta">${metaInner}</span>
          </span>
          <span class="discoveryRowEq" aria-hidden="true"><span></span><span></span><span></span></span>
        </button>
        ${side}
      </div>`;
}

/** Spotlight carousel covers: mark loaded so CSS can fade in flush fill (no letterbox flash). */
function wireDiscoverySpotCardImages(root) {
  const scope = root && root.querySelectorAll ? root : document;
  scope.querySelectorAll(".discoverySpotCardArt img").forEach((img) => {
    const mark = () => {
      img.classList.add("isLoaded");
    };
    if (img.complete && img.naturalWidth > 0) mark();
    else {
      img.addEventListener("load", mark, { once: true });
      img.addEventListener("error", mark, { once: true });
    }
  });
}

function discoveryTrackRowHtml(t, profMap, idx) {
  const art = String(t.artUrl || "").trim();
  const artSafe = art && !art.startsWith("data:") ? art : "./assets/nabadai-logo.png";
  const prof = t.userId ? profMap.get(t.userId) : null;
  const handle = String(prof?.username || "").trim();
  const byLine = handle ? `@${handle}` : "Creator";
  const rawTitle = String(t.title || "Untitled");
  const safeTitle = escapeHtml(rawTitle);
  const encUrl = encodeURIComponent(String(t.url || ""));
  const encTitle = encodeURIComponent(rawTitle);
  const encBy = encodeURIComponent(byLine);
  const encArt = encodeURIComponent(artSafe);
  const encHandle = handle ? encodeURIComponent(handle) : "";
  const side = `<button type="button" class="discoveryRowSide" data-discovery-open-sheet="1" data-dp-url="${encUrl}" data-dp-title="${encTitle}" data-dp-art="${encArt}" data-dp-by="${encBy}" data-dp-handle="${encHandle}" aria-label="Options for ${safeTitle}">⋯</button>`;
  return `
      <div class="discoveryRow" style="--i:${idx}">
        <button type="button" class="discoveryRowArtBtn" data-discovery-inline-play="1" data-user-lib-url="${encUrl}" data-user-lib-title="${encTitle}" data-user-lib-art="${encArt}" data-discovery-by="${encBy}" aria-label="Play ${safeTitle}">
          <span class="discoveryRowArt">
            <img src="${escapeHtml(artSafe)}" alt="" loading="lazy" decoding="async" />
            <span class="discoveryRowArtGlow" aria-hidden="true"></span>
            <span class="discoveryRowArtBadge" aria-hidden="true">▶</span>
          </span>
        </button>
        <button type="button" class="discoveryRowMain" data-user-lib-play="1" data-user-lib-url="${encUrl}" data-user-lib-title="${encTitle}" data-user-lib-art="${encArt}" data-discovery-by="${encBy}" aria-label="Play ${safeTitle}">
          <span class="discoveryRowMid">
            <span class="discoveryRowTitle">${safeTitle}</span>
            <span class="discoveryRowMeta">${escapeHtml(byLine)} · ${escapeHtml(relativeTime(t.ts))}</span>
          </span>
          <span class="discoveryRowEq" aria-hidden="true"><span></span><span></span><span></span></span>
        </button>
        ${side}
      </div>`;
}

function discoverySpotCardHtml(t, profMap, idx) {
  const art = String(t.artUrl || "").trim();
  const artSafe = art && !art.startsWith("data:") ? art : "./assets/nabadai-logo.png";
  const prof = t.userId ? profMap.get(t.userId) : null;
  const handle = String(prof?.username || "").trim();
  const byLine = handle ? `@${handle}` : "Creator";
  const rawTitle = String(t.title || "Untitled");
  const safeTitle = escapeHtml(rawTitle);
  const encUrl = encodeURIComponent(String(t.url || ""));
  const encTitle = encodeURIComponent(rawTitle);
  const encBy = encodeURIComponent(byLine);
  const encArt = encodeURIComponent(artSafe);
  const spotIdx = Number(idx) || 0;
  const imgLoad = spotIdx < 3 ? "eager" : "lazy";
  const imgPriority = spotIdx === 0 ? ' fetchpriority="high"' : "";
  const encHandle = handle ? encodeURIComponent(handle) : "";
  return `
      <div class="discoverySpotCardWrap" style="--i:${spotIdx}">
        <button type="button" class="discoverySpotCard" data-user-lib-play="1" data-user-lib-url="${encUrl}" data-user-lib-title="${encTitle}" data-user-lib-art="${encArt}" data-discovery-by="${encBy}" aria-label="Play ${safeTitle}">
        <span class="discoverySpotCardArt"><img src="${escapeHtml(artSafe)}" alt="" loading="${imgLoad}"${imgPriority} decoding="async" /></span>
        <span class="discoverySpotCardShade" aria-hidden="true"></span>
        <span class="discoverySpotCardArtBadge" aria-hidden="true">▶</span>
        <span class="discoverySpotCardText">
          <span class="discoverySpotCardTextRow">
            <span class="discoverySpotCardTextCol">
              <span class="discoverySpotCardTitle">${safeTitle}</span>
              <span class="discoverySpotCardBy">${escapeHtml(byLine)}</span>
            </span>
            <span class="discoverySpotCardEq" aria-hidden="true"><span></span><span></span><span></span></span>
          </span>
        </span>
        </button>
        <span class="discoverySpotMenuOuter">
          <button type="button" class="discoverySpotMenuBtn" data-discovery-open-sheet="1" data-dp-url="${encUrl}" data-dp-title="${encTitle}" data-dp-art="${encArt}" data-dp-by="${encBy}" data-dp-handle="${encHandle}" aria-label="Song options for ${safeTitle}">⋯</button>
        </span>
      </div>`;
}

async function refreshDiscoverFeed() {
  const gen = ++_discoveryFeedGen;
  const statusEl = document.getElementById("discoveryFeedStatus");
  const listEl = document.getElementById("discoveryFeedList");
  const spotlightWrap = document.getElementById("discoverySpotlightWrap");
  const rail = document.getElementById("discoverySpotlightRail");
  if (!statusEl || !listEl) return;
  if (spotlightWrap) spotlightWrap.hidden = false;
  if (rail) {
    rail.innerHTML = Array.from({ length: 4 }, () => `
      <div class="discoverySkeletonSpotCard" aria-hidden="true">
        <div class="discoverySkeletonSpotFill"></div>
        <div class="discoverySkeletonSpotFooter">
          <div class="discoverySkeletonLine"></div>
          <div class="discoverySkeletonLine short"></div>
        </div>
      </div>`).join("");
  }
  listEl.classList.add("isDiscoveryLoading");
  listEl.hidden = false;
  listEl.innerHTML = `<div class="discoverySkeletonMoreLabel" aria-hidden="true"></div><div class="discoverySkeletonStack">${Array.from({ length: 4 }, () => `
    <div class="discoverySkeletonRow" aria-hidden="true">
      <div class="discoverySkeletonArt"></div>
      <div class="discoverySkeletonMid">
        <div class="discoverySkeletonLine"></div>
        <div class="discoverySkeletonLine short"></div>
      </div>
    </div>`).join("")}</div>`;
  statusEl.textContent = "";
  statusEl.hidden = true;

  const rows = await supabaseFetchDiscoveryPublicSongs(48);
  if (gen !== _discoveryFeedGen) return;
  const playable = rows.filter((t) => String(t.url || "").trim());
  const profMap = await fetchProfilesByUserIdsMap(playable.map((t) => t.userId));
  if (gen !== _discoveryFeedGen) return;
  listEl.classList.remove("isDiscoveryLoading");

  if (!playable.length) {
    _discoveryFeedTracks = [];
    listEl.hidden = true;
    listEl.innerHTML = "";
    if (spotlightWrap) spotlightWrap.hidden = true;
    if (rail) rail.innerHTML = "";
    statusEl.hidden = false;
    const ill = discoveryEmptyIllustrationSvg();
    if (rows.length) {
      statusEl.innerHTML = `
        <div class="discoveryEmptyWrap discoveryEmptyWrapMuted">
          <div class="discoveryEmptyArt">${ill}</div>
          <p class="discoveryEmptyTitle">Almost there</p>
          <p class="discoveryEmptyText">We see public rows, but none have a playable audio URL yet. Try again after they finish saving.</p>
        </div>`;
    } else {
      statusEl.innerHTML = `
        <div class="discoveryEmptyWrap">
          <div class="discoveryEmptyArt">${ill}</div>
          <p class="discoveryEmptyTitle">The feed is quiet</p>
          <p class="discoveryEmptyText">When creators mark songs <strong>Public on profile</strong> in Library and they sync to the cloud, they show up here — newest first.</p>
        </div>`;
    }
    try {
      syncDiscoveryPlayingHighlights();
    } catch {}
    return;
  }

  statusEl.hidden = true;
  statusEl.textContent = "";
  const spot = playable.slice(0, 5);
  const rest = playable.slice(5);
  _discoveryFeedTracks = playable.map((t) => discoveryTrackPlaybackMeta(t, profMap));

  if (rail && spotlightWrap) {
    rail.innerHTML = spot.map((t, i) => discoverySpotCardHtml(t, profMap, i)).join("");
    spotlightWrap.hidden = spot.length === 0;
    try {
      wireDiscoverySpotCardImages(rail);
    } catch {}
  }

  if (rest.length) {
    listEl.hidden = false;
    const more = rest
      .map((t, j) => discoveryTrackRowHtml(t, profMap, j + spot.length))
      .join("");
    listEl.innerHTML = `<div class="discoveryMoreHead" role="presentation">More in the feed</div>${more}`;
  } else {
    listEl.innerHTML = "";
    listEl.hidden = true;
  }
  try {
    syncDiscoveryPlayingHighlights();
  } catch {}
}

async function setLibraryTrackPublicOnProfile(trackId, wantPublic) {
  const id = String(trackId || "").trim();
  if (!authSession?.user?.id) {
    showToast("Sign in to change visibility.");
    return { ok: false };
  }
  const items = loadLibrary();
  const idx = items.findIndex((x) => String(x.id) === id);
  if (idx < 0) return { ok: false };
  const track = items[idx];
  const next = { ...track, publicOnProfile: Boolean(wantPublic) };
  const nextItems = [...items];
  nextItems[idx] = next;
  saveLibrary(nextItems);
  try {
    renderLibrary();
  } catch {}
  try {
    renderProfileHubShared();
  } catch {}
  if (!String(track.url || "").trim()) {
    showToast("This track has no audio URL yet — try again after it finishes saving.");
    return { ok: false };
  }
  const patch = await supabasePatchUserSong(track, { publicOnProfile: next.publicOnProfile });
  if (patch && patch.ok === false && patch.reason && patch.reason !== "noop") {
    const det = String(patch.details || "").trim();
    let msg = "Saved on this device — cloud update failed.";
    if (/public_on_profile|42703|column/i.test(det)) {
      msg =
        "Database missing public_on_profile. In Supabase SQL Editor run: supabase/user_songs_public_on_profile.sql";
    } else if (det) {
      msg = `${msg} ${det.slice(0, 140)}`;
    } else {
      msg = `${msg} Check connection.`;
    }
    showToast(msg, { durationMs: 6200 });
    return { ok: false };
  }
  showToast(
    next.publicOnProfile ? "Visible on your public profile link." : "Hidden from your public profile link.",
  );
  if (next.publicOnProfile) {
    try {
      if (
        String(document.body.getAttribute("data-route") || "") === "discover" &&
        _discoveryActiveSegment === "discover"
      ) {
        void refreshDiscoverFeed();
      }
    } catch {}
  }
  return { ok: true };
}

async function playLibraryUrlOnPlayer(rawUrl, title, artUrl, opts) {
  const raw = String(rawUrl || "").trim();
  if (!raw) return;
  const fromDiscover = Boolean(opts && opts.discoverFeed);
  let openPlayer = true;
  if (opts?.openPlayer === false) openPlayer = false;
  else if (opts?.openPlayer === true) openPlayer = true;
  const byLine = fromDiscover ? String(opts?.discoverBy || "").trim() : "";
  try {
    stopHubPlayback();
  } catch {}
  const prox = toAudioProxyUrl(raw) || raw;
  currentPlayerTrackRef = {
    id: `public_${String(title || "").slice(0, 24)}`,
    url: raw,
    title: title || "Song",
    artUrl: artUrl || "",
    byLine,
    meta: {},
  };
  miniSource = fromDiscover ? { type: "discover_feed", url: raw } : { type: "public_profile_lib", url: raw };
  libraryNowPlayingId = null;
  try {
    renderLibrary();
  } catch {}
  const meta = {
    title: title || "Song",
    subtitle: fromDiscover ? byLine || "Discover feed" : "Public profile",
    artUrl: artUrl || placeholderCoverDataUrl(),
  };
  if (!openPlayer) {
    setPlayerMeta(meta);
    const inlineSource = fromDiscover
      ? { type: "discover_feed", url: raw }
      : { type: "public_profile_lib", url: raw };
    await playInline(prox, title || "Song", inlineSource);
  } else {
    await playOnPlayerPage(prox, title || "Song", meta);
  }
}

async function renderUserProfilePublicLibraryAsync(username) {
  const handle = String(username || "").replace(/^@/, "").trim();
  syncUserPublicVerifiedBadge(null);
  const prof = await fetchPublicProfileRowByUsername(handle);
  if (!prof?.user_id) {
    if (els.userPublicName) els.userPublicName.textContent = handle ? `@${handle}` : "@?";
    if (els.userPublicAvatar) {
      els.userPublicAvatar.src = "./assets/nabadai-logo.png";
      els.userPublicAvatar.alt = "Profile";
    }
    if (els.userPublicVoice) els.userPublicVoice.style.display = "none";
    if (els.userPublicBio) {
      els.userPublicBio.textContent = "";
      els.userPublicBio.style.display = "none";
    }
    if (els.userPublicStats) els.userPublicStats.style.display = "none";
    if (els.userPublicSongsCount) els.userPublicSongsCount.textContent = "";
    if (els.userPublicSongs) els.userPublicSongs.innerHTML = "";
    _userPublicFeedTracks = [];
    if (els.userPublicEmpty) {
      els.userPublicEmpty.textContent = handle
        ? `No one with @${handle} yet — check the spelling, or they have not set a username.`
        : "User not found.";
      els.userPublicEmpty.style.display = "";
    }
    syncUserPublicVerifiedBadge(null);
    return;
  }
  const displayName = String(prof.username || handle || "user").trim();
  if (els.userPublicName) els.userPublicName.textContent = `@${displayName}`;
  if (els.userPublicAvatar) {
    const av = normalizeProfileAvatarForImg(String(prof.avatar || "").trim());
    els.userPublicAvatar.onerror = () => {
      try {
        const logo = "./assets/nabadai-logo.png";
        const cur = String(els.userPublicAvatar.src || "");
        if (!cur.includes("nabadai-logo.png")) els.userPublicAvatar.src = logo;
      } catch {}
    };
    els.userPublicAvatar.src = av || "./assets/nabadai-logo.png";
    els.userPublicAvatar.alt = `${displayName} avatar`;
  }
  if (els.userPublicVoice) {
    const chip = els.userPublicVoice;
    const labelEl = chip.querySelector(".profileAuraVoiceChipText");
    const voice = String(prof.voice_timbre || "").trim();
    const pretty = voice
      ? voice.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
      : "";
    if (labelEl) labelEl.textContent = pretty ? `Voice · ${pretty}` : "Voice";
    chip.style.display = pretty ? "" : "none";
    chip.dataset.state = "idle";
  }
  if (els.userPublicBio) {
    const bio = String(prof.bio || "").trim();
    if (bio && !/^add a short bio/i.test(bio)) {
      els.userPublicBio.textContent = bio;
      els.userPublicBio.style.display = "";
    } else {
      els.userPublicBio.textContent = "";
      els.userPublicBio.style.display = "none";
    }
  }
  const songs = await supabaseFetchPublicLibraryForUserId(prof.user_id);
  if (els.userPublicStats) {
    if (songs.length) {
      els.userPublicStats.innerHTML = `
        <span><strong>${songs.length}</strong> public song${songs.length === 1 ? "" : "s"}</span>
      `;
      els.userPublicStats.style.display = "";
    } else {
      els.userPublicStats.style.display = "none";
    }
  }
  if (els.userPublicSongsCount) {
    els.userPublicSongsCount.textContent = songs.length ? String(songs.length) : "";
  }
  if (!songs.length) {
    if (els.userPublicSongs) els.userPublicSongs.innerHTML = "";
    _userPublicFeedTracks = [];
    if (els.userPublicEmpty) {
      els.userPublicEmpty.textContent = `No public Library songs from @${displayName} yet — they can mark songs Public in Library (⋯ menu).`;
      els.userPublicEmpty.style.display = "";
    }
    syncUserPublicVerifiedBadge(prof);
    return;
  }
  if (els.userPublicEmpty) els.userPublicEmpty.style.display = "none";
  if (els.userPublicSongs) {
    const slice = songs.slice(0, 60);
    const byLine = `@${displayName}`;
    const pubCtx = { byLine, rawHandle: displayName };
    els.userPublicSongs.innerHTML = slice
      .map((t, i) =>
        userPublicDiscoveryRowHtml(
          {
            url: t.url,
            title: t.title,
            artUrl: t.artUrl,
            ts: t.ts,
          },
          i,
          pubCtx,
        ),
      )
      .join("");
    _userPublicFeedTracks = slice.map((t) => {
      const art = String(t.artUrl || "").trim();
      const artSafe = art && !art.startsWith("data:") ? art : "./assets/nabadai-logo.png";
      return {
        url: String(t.url || "").trim(),
        title: String(t.title || "Untitled"),
        artUrl: artSafe,
        byLine,
      };
    });
    try {
      syncUserPublicFeedPlayingHighlights();
    } catch {}
  }
  syncUserPublicVerifiedBadge(prof);
}

async function supabaseInsertHub(post) {
  if (!HUB_FEATURE_ENABLED) return null;
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return null;
  // Never store base64 `data:` URLs in hub_posts. They are the single
  // biggest egress cost on the Hub list endpoint (a 500 KB inline cover
  // multiplied by 30 rows = ~15 MB per feed fetch). If the local copy
  // is a data URL, drop it — the renderer falls back to the generic
  // placeholder cover, and Phase C will upload covers to Supabase
  // Storage and persist the resulting HTTP URL here.
  const sanitizeNonDataUrl = (s) => {
    const v = String(s == null ? "" : s).trim();
    return v && !v.startsWith("data:") ? v : null;
  };
  const payload = {
    title: post.title,
    song_url: post.url,
    cover_url: sanitizeNonDataUrl(post.artUrl),
    creator_username: post.creator,
    creator_avatar: sanitizeNonDataUrl(post.creatorAvatar),
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
  if (!HUB_FEATURE_ENABLED) return null;
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return null;
  const headers = {
    apikey: SUPABASE_ANON_KEY,
    "Content-Type": "application/json",
    Prefer: "return=representation",
  };
  const tok = getSupabaseAuthToken();
  if (tok) headers.Authorization = `Bearer ${tok}`;
  const r = await fetch(`${SUPABASE_URL}/rest/v1/hub_posts?id=eq.${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify(patch),
  });
  if (!r.ok) throw new Error("supabase update failed");
  return await r.json().catch(() => []);
}
async function supabaseDeleteHub(id) {
  if (!HUB_FEATURE_ENABLED) return null;
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !id) return null;
  const token = getSupabaseAuthToken();
  const headers = {
    apikey: SUPABASE_ANON_KEY,
    Prefer: "return=minimal",
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  const r = await fetch(`${SUPABASE_URL}/rest/v1/hub_posts?id=eq.${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers,
  });
  if (!r.ok) throw new Error("supabase delete failed");
  return await r.json().catch(() => []);
}

/** Supabase/Postgres UUID v4 (matches hub_posts.id after cloud insert). */
function isHubCloudUuid(id) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(id || ""));
}

/** Removed in 20260510hubpub. Library deletion no longer cascades to
 *  Hub — Library is private, Hub is public, and a private action
 *  shouldn't surprise-edit the public feed. To take a song off Hub
 *  the user goes to Profile → Songs on Hub → ⋯ → Unpublish from Hub.
 *  See `unpublishHubPostById` for the canonical unpublish path. */
function loadHubFeed() {
  return Array.isArray(hubFeedMemory) ? hubFeedMemory : [];
}
function saveHubFeed(items) {
  hubFeedMemory = Array.isArray(items) ? items : [];
}
function openShareLiveModal(title) {
  if (!els.shareLiveModal) return;
  if (els.shareLiveText) {
    if (!HUB_FEATURE_ENABLED) {
      els.shareLiveText.textContent = title
        ? `“${title}” — saved locally.`
        : "Your song was saved locally.";
    } else {
      els.shareLiveText.textContent = title
        ? `“${title}” is now live on Hub.`
        : "Your song is now live on Hub.";
    }
  }
  els.shareLiveModal.style.display = "";
}
function closeShareLiveModal() {
  if (!els.shareLiveModal) return;
  els.shareLiveModal.style.display = "none";
}
/** Decide whether the signed-in user is the creator of this post.
 *  Strict: we ONLY trust `meta.creatorUserId === uid`. Username
 *  fallbacks were what caused old `@guest` posts to leak attribution
 *  into other accounts — see the cloud profile migration. */
function isProofPostOwner(post) {
  if (!post) return false;
  const uid = String(authSession?.user?.id || "").trim();
  if (!uid) return false;
  const owner = String(post?.meta?.creatorUserId || "").trim();
  return Boolean(owner) && owner === uid;
}

/** Translate the raw `meta` we stored at share-time into human
 *  "what's me, what's the model" rows. We deliberately stay
 *  conservative — only show a row when we have data; never invent
 *  attribution we can't back up. */
function buildProofComposition(post) {
  const meta = post?.meta || {};
  const mode = String(meta.mode || post?.kind || "").toLowerCase();
  const lyricsInput = String(meta.lyricsInput || "").trim();
  const finalPrompt = String(meta.finalPrompt || "").trim();
  const personaName = String(meta.personaLabel || meta.personaName || "").trim();

  let lyrics = "";
  if (mode.includes("instrumental") || mode === "sound") {
    lyrics = "Instrumental — no lyrics";
  } else if (mode === "hum" || meta.humMelody) {
    lyrics = "Hummed melody by creator";
  } else if (lyricsInput && finalPrompt && lyricsInput !== finalPrompt) {
    lyrics = "User-written, AI-assisted";
  } else if (lyricsInput) {
    lyrics = "User-written";
  } else if (finalPrompt) {
    lyrics = "AI-assisted from a prompt";
  }

  let inspiration = "";
  if (mode === "photo" || meta.imageUrl || meta.photoMode) {
    inspiration = "From a user photo";
  } else if (mode === "hum") {
    inspiration = "From a hummed melody";
  }

  const styleTagsRaw = meta.styleTags || meta.styleInput || meta.style || "";
  let style = "";
  if (Array.isArray(styleTagsRaw) && styleTagsRaw.length) {
    style = styleTagsRaw.slice(0, 5).join(", ");
  } else if (typeof styleTagsRaw === "string" && styleTagsRaw.trim()) {
    style = styleTagsRaw
      .split(/[,;]+/)
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 5)
      .join(", ");
  }
  if (style.length > 80) style = style.slice(0, 78).trim() + "…";

  return {
    lyrics,
    inspiration,
    persona: personaName,
    style,
  };
}

/** Tag the engine row with friendly NabadAi-first wording. We hide
 *  the raw Suno model code (e.g. `chirp-v3-5`) behind a neutral
 *  label so the certificate reads as a NabadAi product, not a
 *  passthrough. The exact model is still in `meta.proof.model` if
 *  someone needs it for support. */
function buildProofEngineLabel(post) {
  const raw = String(post?.proof?.model || LATEST_SUNO_MODEL || "").trim();
  if (!raw) return "NabadAi";
  const upper = raw.toUpperCase();
  if (/^V?\d/.test(upper) || upper.startsWith("CHIRP")) {
    return `NabadAi · ${upper.replace(/^CHIRP-/, "Chirp ")}`;
  }
  return `NabadAi · ${raw}`;
}

function openProofModal(post) {
  if (!els.proofModal || !els.proofCertificateCapture) return;
  currentProofPost = post || null;
  const p = post || {};
  const ts = p?.ts ? new Date(p.ts) : new Date();
  const localTs = ts.toLocaleString();
  const utcTs = ts.toISOString();
  const isOwner = isProofPostOwner(p);

  const setTxt = (id, text) => {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  };
  const setRow = (rowId, text) => {
    const row = document.getElementById(rowId);
    if (!row) return;
    if (text) {
      row.hidden = false;
    } else {
      row.hidden = true;
    }
  };

  setTxt("proofValTitle", String(p.title || "Untitled").trim() || "Untitled");
  setTxt("proofValCreator", `@${String(p.creator || "guest").replace(/^@/, "")}`);
  setTxt("proofValLocal", localTs);
  setTxt("proofValUtc", `UTC · ${utcTs}`);

  // Composition block — always derived, but hidden in the public
  // stub view so non-owners don't get bombarded with metadata.
  const comp = buildProofComposition(p);
  setTxt("proofValLyrics", comp.lyrics);
  setRow("proofRowLyrics", comp.lyrics);
  setTxt("proofValInspiration", comp.inspiration);
  setRow("proofRowInspiration", comp.inspiration);
  setTxt("proofValPersona", comp.persona);
  setRow("proofRowPersona", comp.persona);
  setTxt("proofValStyle", comp.style);
  setRow("proofRowStyle", comp.style);
  const compositionWrap = document.getElementById("proofCertCompositionWrap");
  const anyComposition = Boolean(comp.lyrics || comp.inspiration || comp.persona || comp.style);
  if (compositionWrap) compositionWrap.hidden = !(isOwner && anyComposition);

  // Technical / fingerprint — owner-only, collapsed by default so a
  // screenshot for IG looks clean unless the creator opens it.
  setTxt("proofValEngine", buildProofEngineLabel(p));
  setTxt("proofValMode", String(p?.proof?.mode || p?.kind || "full"));
  const fp = String(p?.proof?.promptHash || "").trim();
  setTxt("proofValFingerprint", fp ? `#${fp}` : "—");
  const techWrap = document.getElementById("proofCertTechWrap");
  if (techWrap) {
    techWrap.hidden = !isOwner;
    techWrap.open = false;
  }

  // Owner-only action bar.
  const actions = document.getElementById("proofCertActions");
  if (actions) actions.hidden = !isOwner;

  // Toolbar / lead / tagline copy switches between the public stub
  // ("Created with NabadAi") and the creator's full record
  // ("Proof of creation"). The capture card itself reuses the same
  // tagline so a screenshot reads consistently with what's on
  // screen.
  const toolbarTitleEl = document.getElementById("proofCertToolbarTitle");
  const taglineEl = document.getElementById("proofCertTagline");
  const leadEl = document.getElementById("proofCertLead");
  const sheet = els.proofModal.querySelector(".proofCertSheet");
  if (sheet) sheet.setAttribute("data-proof-mode", isOwner ? "owner" : "public");
  if (isOwner) {
    if (toolbarTitleEl) toolbarTitleEl.textContent = "Proof of creation";
    if (taglineEl) taglineEl.textContent = "Verified creation record";
    if (leadEl) {
      leadEl.textContent = "A verified record of how this track was created in NabadAi. Share the image or open Technical details for the fingerprint.";
    }
  } else {
    if (toolbarTitleEl) toolbarTitleEl.textContent = "Created with NabadAi";
    if (taglineEl) taglineEl.textContent = "Created with NabadAi";
    if (leadEl) {
      leadEl.textContent = "This track was created on NabadAi. Only the creator can view full creation details.";
    }
  }

  const img = els.proofCertCoverImg;
  if (img) {
    const art = String(p.artUrl || "").trim();
    const fallback = "./assets/nabadai-logo.png";
    img.onload = null;
    img.onerror = () => {
      img.removeAttribute("crossorigin");
      img.onerror = null;
      img.src = fallback;
    };
    img.alt = String(p.title || "Cover art").slice(0, 120);
    img.removeAttribute("crossorigin");
    if (/^https?:\/\//i.test(art)) {
      img.crossOrigin = "anonymous";
    }
    img.src = art || fallback;
  }

  const buildEl = document.getElementById("proofCertBuildLine");
  if (buildEl) {
    buildEl.textContent = isOwner
      ? `Verified by NabadAi · Build ${APP_BUILD}`
      : "Created with NabadAi";
  }
  els.proofModal.style.display = "";
}
function closeProofModal() {
  if (!els.proofModal) return;
  els.proofModal.style.display = "none";
}

function proofFingerprintText(post) {
  const fp = String(post?.proof?.promptHash || "").trim();
  return fp ? `#${fp}` : "";
}

function slugProofFilename(title) {
  const s = String(title || "song")
    .trim()
    .slice(0, 48)
    .replace(/[^\w\u0600-\u06FF-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return s || "song";
}

async function shareProofCertificateImage() {
  const cap = els.proofCertificateCapture;
  if (!cap || !currentProofPost) return;
  if (!isProofPostOwner(currentProofPost)) {
    showToast?.("Only the creator can share the certificate.", { durationMs: 3200 });
    return;
  }
  try {
    setStatus?.("Preparing image…");
    const url = "https://esm.sh/html-to-image@1.11.11";
    const mod = await import(/* webpackIgnore: true */ url);
    const toPng = mod.toPng;
    if (typeof toPng !== "function") throw new Error("toPng unavailable");
    const dataUrl = await toPng(cap, {
      pixelRatio: 3,
      backgroundColor: "#12151e",
      cacheBust: true,
    });
    const base = slugProofFilename(currentProofPost.title);
    const idShort = String(currentProofPost.id || "").replace(/\W/g, "").slice(0, 10);
    const fname = `nabadai-proof-${base}${idShort ? `-${idShort}` : ""}.png`;
    const blob = await (await fetch(dataUrl)).blob();
    const file = new File([blob], fname, { type: "image/png" });
    if (navigator.share && navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: "NabadAi proof of creation" });
      showToast?.("Ready to share.");
    } else {
      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = fname;
      document.body.appendChild(a);
      a.click();
      a.remove();
      showToast?.("Image saved — check Downloads or Photos.");
    }
    setStatus?.("");
  } catch (e) {
    console.warn(e);
    setStatus?.("");
    showToast?.("Could not create the image. Try Print / PDF or take a screenshot.", { durationMs: 4200 });
  }
}

function copyProofFingerprint() {
  if (!isProofPostOwner(currentProofPost)) {
    showToast?.("Only the creator can copy the fingerprint.", { durationMs: 3200 });
    return;
  }
  const line = proofFingerprintText(currentProofPost);
  if (!line) {
    showToast?.("No fingerprint stored for this post.", { durationMs: 2800 });
    return;
  }
  const ok = () => showToast?.("Fingerprint copied.");
  const fallback = () => {
    try {
      const ta = document.createElement("textarea");
      ta.value = line;
      ta.style.position = "fixed";
      ta.style.left = "-9999px";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      ok();
    } catch {
      showToast?.("Could not copy — select the fingerprint manually.", { durationMs: 3200 });
    }
  };
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(line).then(ok).catch(fallback);
  } else {
    fallback();
  }
}
function shareToHub(track) {
  if (!HUB_FEATURE_ENABLED) {
    setStatus?.("Public Hub is paused.");
    showToast?.("Sharing to Hub isn’t available right now.", { durationMs: 3500 });
    return;
  }
  const feed = loadHubFeed();
  const creator = String(activeProfile.username || "guest");
  const creatorUserId = String(authSession?.user?.id || "");
  // Defensive guards. These two cases were the source of the "her
  // shared songs don't play" bug: a freshly-generated track with an
  // empty `url` was being inserted, and a signed-in user with the
  // legacy `username: "guest"` was attributing posts to the
  // unauthenticated sentinel.
  const initialUrl = String(track?.url || "").trim();
  if (!initialUrl) {
    setStatus?.("Song isn't ready to share yet — wait for the track to finish loading.");
    showToast?.("Song still loading — try again in a moment.", { durationMs: 3500 });
    return;
  }
  if (creatorUserId && (!creator || creator === "guest")) {
    setStatus?.("Set a username before sharing to Hub.");
    showToast?.("Pick a username in Profile first.", { durationMs: 3500 });
    return;
  }
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
  const url = initialUrl;
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
      profileVisibility: "public",
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
// 24 was too aggressive for the reel layout — each panel pulls a cover
// image, so 24 reels = 24 Supabase egress hits on first paint. With
// scroll-snap we only ever see ONE panel at a time, so 6 is enough to
// fill the immediate buffer and the rest stream in as the user swipes.
const HUB_PAGE_SIZE = 6;
/** Reels rendered with `loading="eager"` so iOS WebKit doesn't fall
 *  asleep on `loading="lazy"` inside an internal-scroll snap
 *  container (a real Safari/iOS quirk — lazy images can stay
 *  unfetched even after the user snaps to them). Beyond this index
 *  the `<img>` ships with `data-src` and is hydrated by an
 *  IntersectionObserver tied to the reel scroller. */
/** Cellular saver: only the very first reel renders its cover eagerly.
 *  Every other cover defers until the IntersectionObserver one-swipe-ahead
 *  prefetcher promotes it. On 3G this drops cold-start image traffic from
 *  ~500 KB-1 MB to ~200-400 KB, which is the difference between "Hub
 *  appears in 5s" and "Hub appears in 15s". */
const HUB_EAGER_REEL_COUNT = 1;
let hubVisibleCount = HUB_PAGE_SIZE;
let _hubLastRenderedFilter = null;
// Tracks what's currently painted into the Hub list so the periodic
// background refresh can decide whether a real DOM rebuild is necessary.
// Without this every poll wiped innerHTML and looked like a screen flash.
let _hubLastRenderedSig = "";
let _hubDeferredRebuild = false;

function computeHubVisibleSig(items) {
  const top = (items || []).slice(0, hubVisibleCount || HUB_PAGE_SIZE);
  return top.map((p) => {
    const r = p?.reacts || {};
    return [
      String(p?.id || ""),
      Number(p?.likes || 0),
      Number(r?.melody || 0),
      Number(r?.lyrics || 0),
    ].join(":");
  }).join("|");
}

function computeHubVisibleIds(items) {
  return (items || [])
    .slice(0, hubVisibleCount || HUB_PAGE_SIZE)
    .map((p) => String(p?.id || ""))
    .join("|");
}

// Update like/react counts inside the existing rendered rows without
// blowing away innerHTML. Keeps the playing row's audio hookup intact,
// keeps the user's scroll position pinned, no flicker.
function applyHubInPlaceCountUpdates(items) {
  if (!els.hubList) return;
  (items || []).slice(0, hubVisibleCount || HUB_PAGE_SIZE).forEach((p) => {
    const id = String(p?.id || "");
    if (!id) return;
    const row = els.hubList.querySelector(`[data-hub-row="${id}"]`);
    if (!row) return;
    const likeBtn = row.querySelector(`[data-hub-like="${id}"]`);
    if (likeBtn) {
      const likes = Number(p.likes || 0);
      const c = likeBtn.querySelector(".hubLikeCount");
      if (c) c.textContent = String(likes);
      likeBtn.setAttribute("data-count", String(likes));
    }
    const r = p?.reacts || {};
    ["melody", "lyrics"].forEach((key) => {
      const btn = row.querySelector(`[data-hub-react="${id}:${key}"]`);
      if (!btn) return;
      const c = btn.querySelector(".hubReactCount");
      if (c) c.textContent = String(Number(r[key] || 0));
    });
  });
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
    // Three distinct empty states:
    //   - "Still loading" (sync in-flight, or first sync hasn't
    //     resolved yet and we don't have an error)        → skeleton
    //   - "Network failed multiple times" on slow mobile  → retry CTA
    //   - "Cloud is genuinely empty"                       → empty CTA
    const stillLoading = hubSyncInFlight || (!hubLastSyncOk && !hubLastSyncError);
    const sawFailure = !hubLastSyncOk && hubLastSyncError && hubRetryCount >= 2;
    if (sawFailure) {
      els.hubList.innerHTML = `
        <div class="emptyState hubErrorState" aria-live="polite">
          <div class="emptyStateIcon" aria-hidden="true">⚠︎</div>
          <p class="emptyStateTitle">Can't load the Hub</p>
          <p class="emptyStateHint">Check your connection and try again. On slow mobile data this can take a few seconds.</p>
          <button type="button" id="hubRetryBtn" class="emptyStateCta">Try again</button>
        </div>
      `;
      const btn = document.getElementById("hubRetryBtn");
      if (btn) {
        btn.addEventListener("click", () => {
          hubRetryCount = 0;
          hubLastSyncError = "";
          btn.disabled = true;
          btn.textContent = "Loading…";
          void refreshHubFromSupabase();
        }, { once: true });
      }
      _hubLastRenderedSig = "";
      renderHubUpdatedAt();
      updateHubAudioHint();
      return;
    }
    if (stillLoading) {
      // Reel-style skeleton: a single full-screen panel that mirrors
      // the production layout (centered cover, right rail dots,
      // bottom title bar) so the swap to real data is invisible.
      // The hint text only fades in after 2.5s (CSS animation) so
      // fast connections never see it; slow-cellular users get a
      // "this is working, not stuck" signal instead of a blank screen.
      els.hubList.innerHTML = `
        <article class="hubReelSkeleton" aria-live="polite" aria-busy="true" aria-label="Loading Hub feed">
          <div class="hubReelSkelCover" aria-hidden="true"></div>
          <div class="hubReelSkelRail" aria-hidden="true">
            <span class="hubReelSkelDot"></span>
            <span class="hubReelSkelDot"></span>
            <span class="hubReelSkelDot"></span>
            <span class="hubReelSkelDot"></span>
            <span class="hubReelSkelDot"></span>
          </div>
          <div class="hubReelSkelMeta" aria-hidden="true">
            <span class="hubReelSkelLineSm"></span>
            <span class="hubReelSkelLineLg"></span>
          </div>
          <div class="hubReelSkelHint" role="status" aria-live="polite">
            <span class="hubReelSkelHintBars" aria-hidden="true"><i></i><i></i><i></i></span>
            <span class="hubReelSkelHintText">Tuning in…</span>
          </div>
        </article>
      `;
    } else {
      els.hubList.innerHTML = `
        <div class="emptyState">
          <div class="emptyStateIcon" aria-hidden="true">♫</div>
          <p class="emptyStateTitle">The Hub is quiet</p>
          <p class="emptyStateHint">Songs you publish from your Library will land here. Be the first to share something today.</p>
          <a href="#/library" class="emptyStateCta" data-route-link="library">Open Library</a>
        </div>
      `;
    }
    // Reset sig so when posts arrive, the skip-if-unchanged branch
    // can't falsely match against an old sig from a previous render.
    _hubLastRenderedSig = "";
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
  // Latest-only UX (Trending hidden): show every post we have cached in
  // the reel — the old 6-at-a-time + "Load more" cap made the feed look
  // artificially short (12-15 posts max) even when localStorage held more.
  if (hubFilter === "latest") {
    hubVisibleCount = totalCount;
  }
  const visibleItems = items.slice(0, Math.min(hubVisibleCount, totalCount));
  const hasMore = totalCount > visibleItems.length;
  els.hubList.innerHTML = visibleItems.map((p, i) => {
    // Strategy:
    //   - First HUB_EAGER_REEL_COUNT panels render with the real
    //     `src` and `loading="eager"` so the very first cover lands
    //     instantly.
    //   - Later panels ship with `data-src` only; a single
    //     IntersectionObserver (wired in `wireHubReelObserver`)
    //     promotes them to `src` as soon as they're within ~one reel
    //     of the viewport. This sidesteps iOS WebKit's broken
    //     `loading="lazy"` behavior inside internal-scroll snap
    //     containers (covers can stay unfetched even after the user
    //     snaps to them) and keeps Supabase egress proportional to
    //     what the user actually views.
    const isEager = i < HUB_EAGER_REEL_COUNT;
    const coverSrc = hubCoverImgSrc(
      p.artUrl || p.creatorAvatar || "./assets/nabadai-logo.png",
    );
    const imgSrcAttr = isEager
      ? `src="${escapeHtml(coverSrc)}" loading="eager" fetchpriority="high"`
      : `data-src="${escapeHtml(coverSrc)}" loading="lazy" decoding="async"`;
    const backdropStyle = isEager
      ? `--reel-bg: url('${escapeHtml(coverSrc)}');`
      : ``;
    const avatarSrc = p.creatorAvatar || "./assets/nabadai-logo.png";
    const safeTitle = escapeHtml(p.title);
    const likes = Number(p.likes || 0);
    return `
    <article class="trackRow hubRow hubReel" data-hub-row="${p.id}" data-cover-url="${escapeHtml(coverSrc)}" style="--hub-cover-tint: url('${escapeHtml(coverSrc)}');">
      <div class="hubReelBackdrop" aria-hidden="true" style="${backdropStyle}">
        <span class="hubReelBackdropVeil" aria-hidden="true"></span>
      </div>
      <div class="hubReelStage">
        <button class="hubCoverWrap hubReelCoverBtn" type="button" data-hub-cover="${p.id}" data-hub-play="${p.id}" aria-label="Play ${safeTitle}">
          <img class="hubCover hubReelCover" ${imgSrcAttr} alt="cover" decoding="async" />
          <span class="hubReelCoverGlow" aria-hidden="true"></span>
          <span class="hubEq" aria-hidden="true"><i></i><i></i><i></i></span>
          <span class="hubReelCoverGlyph" aria-hidden="true">▶</span>
          <span class="hubPlayProgress hubReelProgress"><span id="hubProg_${p.id}" style="width:0%"></span></span>
        </button>
      </div>
      <aside class="hubReelRail" aria-label="Post actions">
        <button type="button" class="hubReelAvatarBtn" data-hub-user="${p.id}" aria-label="Open @${escapeHtml(p.creator)}'s profile">
          <img class="hubAvatar hubReelAvatarImg" src="${escapeHtml(avatarSrc)}" alt="" loading="lazy" decoding="async" />
        </button>
        <button class="hubLike hubReelRailBtn hubReelLikeBtn" data-hub-like="${p.id}" data-count="${likes}" aria-label="Like">
          <span class="hubLikeHeart" aria-hidden="true">♥</span>
          <span class="hubLikeCount">${likes}</span>
        </button>
        <button class="hubReact hubShare hubReelRailBtn hubReelShareBtn" data-hub-share="${p.id}" aria-label="Share this song">
          <span class="hubReactIcon" aria-hidden="true">➤</span>
          <span class="hubReactLabel">Share</span>
        </button>
        <button class="hubReelRailBtn hubReelRemixBtn" data-hub-remix="${p.id}" aria-label="Remix this song">
          <span class="hubReelRemixIcon" aria-hidden="true">↻</span>
          <span class="hubReelRemixLabel">Remix</span>
        </button>
        <button class="hubReelRailBtn hubReelMoreBtn" data-hub-more="${p.id}" aria-label="More options">
          <span aria-hidden="true">⋯</span>
        </button>
      </aside>
      <footer class="hubReelMeta">
        <div class="hubReelCreatorRow">
          <span class="hubCreator hubReelCreator" data-hub-user="${p.id}">@${escapeHtml(p.creator)}</span>
          <span class="hubMetaDot">·</span>
          <span class="hubTimeAgo">${escapeHtml(relativeTime(p.ts))}</span>
        </div>
        <h3 class="hubReelTitle">${safeTitle}</h3>
        ${p.remixOf ? `<div class="hubRemixOf hubReelRemixLine">Remix of: ${escapeHtml(p.remixOf)}</div>` : ""}
        ${p?.meta?.searchTemplateTitle ? `<div class="hubSearchTemplateLine hubReelTemplateLine">From Search · ${escapeHtml(String(p.meta.searchTemplateTitle))}</div>` : ""}
      </footer>
      <div class="libMenu hubMoreMenu hubReelMoreMenu" id="hubMore_${p.id}" style="display:none">
        <button class="ghost" data-hub-copy-link="${p.id}">Copy link</button>
        <button class="ghost" data-hub-persona="${p.id}">Save voice as persona</button>
      </div>
    </article>
  `;
  }).join("") + (hasMore ? `
    <div class="hubLoadMoreWrap hubReelLoadMoreWrap" data-hub-loadmore-sentinel>
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
      // Short suppression so a snap-induced scroll right after the tap
      // can't immediately switch to a different centered post. Kept
      // brief (400ms) so scroll-driven autoplay recovers fast if the
      // play() is rejected for any reason.
      suppressHubViewportAutoplayFor(400);
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
  els.hubList.querySelectorAll("[data-hub-remix]").forEach((b) => b.addEventListener("click", async (e) => {
    e.stopPropagation();
    const id = b.getAttribute("data-hub-remix");
    const p = loadHubFeed().find((x) => x.id === id);
    if (!p) return;
    document.getElementById(`hubMore_${id}`)?.style.setProperty("display", "none");
    await startHubRemix(p);
  }));
  els.hubList.querySelectorAll("[data-hub-persona]").forEach((b) => b.addEventListener("click", async (e) => {
    e.stopPropagation();
    const id = b.getAttribute("data-hub-persona");
    const p = loadHubFeed().find((x) => x.id === id);
    if (!p) return;
    document.getElementById(`hubMore_${id}`)?.style.setProperty("display", "none");
    await createPersonaFromHubPost(p);
  }));
  els.hubList.querySelectorAll("[data-hub-copy-link]").forEach((b) => b.addEventListener("click", async (e) => {
    e.stopPropagation();
    const id = b.getAttribute("data-hub-copy-link");
    document.getElementById(`hubMore_${id}`)?.style.setProperty("display", "none");
    const url = buildHubShareUrl(id);
    if (!url) return;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
        showToast("Link copied", { icon: "✓", durationMs: 1800 });
      } else {
        showToast(url, { durationMs: 3000 });
      }
    } catch {
      showToast("Could not copy link", { durationMs: 2200 });
    }
  }));
  els.hubList.querySelectorAll("[data-hub-user]").forEach((u) => u.addEventListener("click", (e) => {
    e.stopPropagation();
    const id = u.getAttribute("data-hub-user");
    const p = loadHubFeed().find((x) => x.id === id);
    const username = String(p?.creator || "").trim();
    if (!username) return;
    location.hash = `#/u/${encodeURIComponent(username)}`;
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
    const wrap = els.hubList.querySelector(`.hubCoverWrap[data-hub-cover="${hubAudioPostId}"]`)
      || els.hubList.querySelector(`[data-hub-play="${hubAudioPostId}"]`)?.closest?.(".hubCoverWrap");
    wrap?.classList.add("isPlaying");
  }
  // Reset cached focused id so the reel observer can re-fire against
  // the freshly mounted panels (otherwise an id == previous id check
  // would skip toggling on the new elements).
  hubFocusedPostId = null;
  requestAnimationFrame(() => {
    // Reel observer is the source of truth on the new layout.
    // updateHubFocusedRow is kept as a no-op fallback (it bails when a
    // reel already owns focus) for legacy code paths.
    wireHubReelObserver();
    updateHubFocusedRow();
  });
  preloadInitialHubTracks();
  updateHubAudioHint();
  _hubLastRenderedSig = computeHubVisibleSig(items);
  _hubDeferredRebuild = false;
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
      await refreshHubFromSupabase({ force: true });
    } catch {
      setStatus("Post removed locally. Cloud delete failed.");
    }
  });
}
async function refreshHubFromSupabase({ force = false } = {}) {
  if (!HUB_FEATURE_ENABLED) return;
  if (hubSyncInFlight) return;
  const route = document.body.getAttribute("data-route") || "";
  // Do not hit PostgREST for the global feed while the user is on
  // Generate/Library/Profile — they still saw multi‑MB `hub_posts`
  // transfers from stray callers + the duplicate hashchange listener.
  // Public creator pages (`user`) need the same merge feed as deep links.
  if (route !== "hub" && route !== "user") return;
  // Throttle: every trigger (interval, window focus, visibilitychange,
  // route enter, like/share tap) funnels here. Without this, iOS firing
  // focus + visibilitychange together = two consecutive full fetches.
  // `force: true` (only used by pull-to-refresh and explicit user
  // gestures) bypasses the throttle.
  const now = Date.now();
  if (!force && now - _hubLastFetchAtMs < HUB_MIN_FETCH_GAP_MS) return;
  hubSyncInFlight = true;
  _hubLastFetchAtMs = now;
  // Decide between full and incremental. Full runs:
  //   - First fetch (never had one)
  //   - Every HUB_FULL_REFETCH_MS to catch external like/react/delete
  //     changes that incremental "what's new" can't see.
  //   - When the caller explicitly forces it (pull-to-refresh).
  const needFull = force
    || !_hubLastFullFetchAtMs
    || (now - _hubLastFullFetchAtMs > HUB_FULL_REFETCH_MS);
  const sinceIsoTs = needFull ? "" : _hubKnownNewestIsoTs;
  try {
    const rows = await supabaseSelectHub({ sinceIsoTs });
    if (!rows || !Array.isArray(rows)) return;
    if (needFull) _hubLastFullFetchAtMs = now;
    // Track the newest ISO timestamp we've seen so the next
    // incremental fetch can ask for "rows newer than this".
    for (const r of rows) {
      const iso = String(r?.created_at || "");
      if (iso && (!_hubKnownNewestIsoTs || iso > _hubKnownNewestIsoTs)) {
        _hubKnownNewestIsoTs = iso;
      }
    }
    hubLastSyncOk = true;
    hubLastSyncError = "";
    hubLastSyncRows = rows.length;
    hubRetryCount = 0;
    const prev = loadHubFeed();
    const mapped = rows.map((r) => mapHubRestRowToPost(r, { includeProof: false }));
    // Incremental responses can legitimately be empty (no new rows
    // since last poll) — that's the happy path, not a fetch failure.
    // Don't wipe the feed and don't re-render; just bail.
    if (!mapped.length && !needFull) {
      renderHubUpdatedAt();
      return;
    }
    // Never wipe feed on empty cloud response (full fetch + empty
    // result is still treated as transient — keep what we have).
    if (!mapped.length && prev.length) {
      renderHub();
      renderHubDots();
      return;
    }
    // Merge strategy depends on full vs incremental.
    //
    // FULL: cloud is the source of truth for the visible window.
    //   We absorb prev local-only placeholders (cloud insert still
    //   in flight) and otherwise let cloud rows win — that's how
    //   like/react count changes from other users propagate, and
    //   how deleted-on-cloud rows disappear locally.
    //
    // INCREMENTAL: cloud only returned rows newer than what we've
    //   seen. We MUST keep every prev row; we're just adding new
    //   ones on top. If we used the FULL merge here we'd lose the
    //   entire backlog (cloudById wouldn't have those ids, so the
    //   prev rows would be dropped on the sig-match step).
    const sigOf = (p) =>
      `${String(p?.url || "").trim()}|${String(p?.kind || "full")}|${String(p?.creator || "")}|${String(p?.title || "").trim().toLowerCase()}`;
    const byId = new Map();
    if (needFull) {
      const cloudById = new Map();
      const cloudBySig = new Map();
      mapped.forEach((raw) => {
        const p = mergeHubProofFromPrevPost(raw, prev);
        cloudById.set(String(p.id), p);
        cloudBySig.set(sigOf(p), p);
      });
      prev.forEach((p) => {
        if (cloudById.has(String(p.id))) return;
        if (cloudBySig.has(sigOf(p))) return;
        byId.set(String(p.id), p);
      });
      mapped.forEach((raw) => {
        const p = mergeHubProofFromPrevPost(raw, prev);
        byId.set(String(p.id), p);
      });
    } else {
      // Incremental: keep prev (full backlog), overlay new rows on top.
      prev.forEach((p) => byId.set(String(p.id), p));
      mapped.forEach((raw) => {
        const p = mergeHubProofFromPrevPost(raw, prev);
        byId.set(String(p.id), p);
      });
    }
    const merged = Array.from(byId.values()).sort((a, b) => Number(b.ts || 0) - Number(a.ts || 0)).slice(0, 300);
    saveHubFeed(merged);
    lastHubUpdateAt = merged.length ? Math.max(...merged.map((x) => Number(x.ts || 0))) : 0;

    // Avoid the visible "page refresh" flash: only do a real rebuild when
    // it's actually warranted. Three cases:
    //   1) Nothing changed in the visible window → just update the
    //      "Updated: …" timestamp and the unseen dot. No DOM churn.
    //   2) Same posts in same order, only counts changed → update the
    //      like/react number text in place.
    //   3) New post(s) appeared or order changed → only blow away
    //      innerHTML when the user is NOT actively viewing Hub or is
    //      already at the top. Otherwise defer; the next route change
    //      or scroll-to-top will redraw.
    const onHub = (document.body.getAttribute("data-route") || "") === "hub";
    const items = (() => {
      let arr = merged;
      if (hubFilter === "trending") {
        const now = Date.now();
        arr = [...arr].sort((a, b) => {
          const sa = hubTrendingScore(a, now);
          const sb = hubTrendingScore(b, now);
          if (sb !== sa) return sb - sa;
          return Number(b.ts || 0) - Number(a.ts || 0);
        });
      }
      return arr;
    })();
    const newSig = computeHubVisibleSig(items);
    const newIds = computeHubVisibleIds(items);
    const oldIds = (_hubLastRenderedSig || "")
      .split("|")
      .map((s) => s.split(":")[0])
      .join("|");
    const renderedAlready = els.hubList && els.hubList.querySelector("[data-hub-row]");

    if (renderedAlready && newSig === _hubLastRenderedSig) {
      // No-op render: nothing visible changed.
      renderHubUpdatedAt();
      renderHubDots();
      renderProfileHubShared();
    } else if (renderedAlready && newIds === oldIds && oldIds.length > 0) {
      applyHubInPlaceCountUpdates(items);
      _hubLastRenderedSig = newSig;
      renderHubUpdatedAt();
      renderHubDots();
      renderProfileHubShared();
    } else {
      const hubListTop = onHub && els.hubList
        ? (els.hubList.scrollTop || 0)
        : (window.scrollY || document.documentElement.scrollTop || 0);
      const atTop = hubListTop < 80;
      if (renderedAlready && onHub && !atTop) {
        // Defer: rebuilding right now would yank the page under the
        // user's finger. We'll rebuild on next scroll-to-top, route
        // change, or pull-down refresh.
        _hubDeferredRebuild = true;
        renderHubUpdatedAt();
        renderHubDots();
        renderProfileHubShared();
      } else {
        renderHub();
        renderHubDots();
        renderProfileHubShared();
      }
    }
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
        const routeR = document.body.getAttribute("data-route") || "";
        if (routeR !== "hub" && routeR !== "user") return;
        if (hubSyncInFlight) return;
        hubSyncInFlight = true;
        const rows = await supabaseSelectHub();
        if (!rows || !Array.isArray(rows)) return;
        const prevRetry = loadHubFeed();
        const mapped = rows
          .map((r) => mapHubRestRowToPost(r, { includeProof: false }))
          .map((raw) => mergeHubProofFromPrevPost(raw, prevRetry));
        if (!mapped.length) return;
        hubLastSyncOk = true;
        hubLastSyncError = "";
        hubLastSyncRows = rows.length;
        hubRetryCount = 0;
        saveHubFeed(mapped);
        lastHubUpdateAt = Math.max(...mapped.map((x) => Number(x.ts || 0)));
        // Same skip-if-unchanged logic as the main path so the retry
        // doesn't flash either.
        const newSig = computeHubVisibleSig(mapped);
        const newIds = computeHubVisibleIds(mapped);
        const oldIds = (_hubLastRenderedSig || "")
          .split("|").map((s) => s.split(":")[0]).join("|");
        const renderedAlready = els.hubList && els.hubList.querySelector("[data-hub-row]");
        if (renderedAlready && newSig === _hubLastRenderedSig) {
          renderHubUpdatedAt();
          renderHubDots();
          renderProfileHubShared();
        } else if (renderedAlready && newIds === oldIds && oldIds.length > 0) {
          applyHubInPlaceCountUpdates(mapped);
          _hubLastRenderedSig = newSig;
          renderHubUpdatedAt();
          renderHubDots();
          renderProfileHubShared();
        } else {
          const onHub = (document.body.getAttribute("data-route") || "") === "hub";
          const hubListTop = onHub && els.hubList
            ? (els.hubList.scrollTop || 0)
            : (window.scrollY || document.documentElement.scrollTop || 0);
          const atTop = hubListTop < 80;
          if (renderedAlready && onHub && !atTop) {
            _hubDeferredRebuild = true;
            renderHubUpdatedAt();
            renderHubDots();
            renderProfileHubShared();
          } else {
            renderHub();
            renderHubDots();
            renderProfileHubShared();
          }
        }
      } catch {} finally {
        hubSyncInFlight = false;
      }
    }, backoff);
  } finally {
    hubSyncInFlight = false;
  }
}
function startHubLiveSync() {
  if (!HUB_FEATURE_ENABLED) return;
  if (hubSyncTimer) clearInterval(hubSyncTimer);
  // Egress saver v2: 60s/120s was still firing ~1,000 PostgREST hits
  // per active session per day. Pushed to 5min on both desktop and
  // mobile — combined with the incremental fetch path (only rows
  // created since the last poll, usually zero), each poll now costs
  // ~300 bytes instead of ~30 KB. Like/react updates from other
  // users land on the next full refetch (HUB_FULL_REFETCH_MS = 10min).
  const interval = 5 * 60_000;
  hubSyncTimer = setInterval(() => {
    const route = document.body.getAttribute("data-route") || "";
    if (route !== "hub") return;
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

/**
 * One shared persona-creation helper used by every entry point in the app
 * (Result card, Library row, Hub more-menu, Advanced Options). Each caller
 * passes whatever it knows; we build a sensible name + description from the
 * available metadata and call /api/suno/persona.
 *
 * Required: taskId + audioId. Returns the new personaId on success.
 *
 * Optional `audioUrl`: when provided, we probe the file duration in the
 * browser and send vocalStart/vocalEnd that satisfy Suno's rule that the
 * analysis window must be **10–30 seconds long** and fit **inside** the
 * actual audio. Without this, Suno's defaults (0–30s) break for any song
 * shorter than 30 seconds — their API returns "Current music failed to
 * generate persona" even on brand-new v5 tracks.
 */

function audioUrlsEquivalent(a, b) {
  const sa = String(a || "").trim();
  const sb = String(b || "").trim();
  if (!sa || !sb) return false;
  if (sa === sb) return true;
  try {
    return new URL(sa, location.href).href === new URL(sb, location.href).href;
  } catch {
    return sa.endsWith(sb) || sb.endsWith(sa);
  }
}

function getActiveAudioSrc(a) {
  if (!a) return "";
  return String(a.currentSrc || a.src || "").trim();
}

/** Suno full songs are ~2–4 min; cap rejects WebKit bogus values (e.g. after 1e10 seek). */
const AUDIO_DURATION_SANE_MAX_SEC = 600;

function normalizeAudioDurationSec(raw) {
  const d = Number(raw);
  if (!Number.isFinite(d) || d <= 0 || d > AUDIO_DURATION_SANE_MAX_SEC) return 0;
  return d;
}

/** Read duration from a media element — never use `buffered` (download progress ≠ song length). */
function readAudioElementDurationSec(a) {
  if (!a) return 0;
  const cur = Number.isFinite(a.currentTime) ? a.currentTime : 0;
  const fromDur = normalizeAudioDurationSec(a.duration);
  if (fromDur > 0) return fromDur;
  try {
    const sk = a.seekable;
    if (sk && sk.length) {
      const end = normalizeAudioDurationSec(sk.end(sk.length - 1));
      // On progressive streams seekable end can lag; ignore if we're already past it.
      if (end > 0 && (cur < 1 || end >= cur + 0.5)) return end;
    }
  } catch {}
  return 0;
}

/** Parse total byte length from a Range probe (`Content-Range: bytes 0-1/12345`). */
function parseTotalBytesFromContentRange(header) {
  const m = /\/(\d+)\s*$/i.exec(String(header || "").trim());
  if (!m) return 0;
  const n = Number(m[1]);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** Rough MP3 length from file size (Suno MP3s are typically 128–192 kbps CBR/VBR). */
function estimateMp3DurationFromByteLength(bytes) {
  const n = Number(bytes);
  if (!Number.isFinite(n) || n < 4096) return 0;
  const bytesPerSec = 20000; // ~160 kbps — slightly conservative for VBR
  return normalizeAudioDurationSec(n / bytesPerSec);
}

async function fetchAudioByteLength(url) {
  const u = String(url || "").trim();
  if (!u || u.startsWith("blob:") || u.startsWith("data:")) return 0;
  try {
    const r = await fetch(u, { method: "GET", headers: { Range: "bytes=0-1" }, cache: "no-store" });
    const cr = parseTotalBytesFromContentRange(r.headers.get("content-range"));
    if (cr > 0) return cr;
    const cl = Number(r.headers.get("content-length") || 0);
    if (Number.isFinite(cl) && cl > 4096) return cl;
  } catch {}
  return 0;
}

function resetAudioDurationHintForUrl(url) {
  audioDurationHint.url = String(url || "").trim();
  audioDurationHint.sec = 0;
}

/** Only grow — ignore partial-buffer readings shorter than current playback. */
function applyAudioDurationHint(sec) {
  const d = normalizeAudioDurationSec(sec);
  if (d <= 0) return;
  const cur = playerEl && Number.isFinite(playerEl.currentTime) ? playerEl.currentTime : 0;
  if (cur > 1 && d < cur - 0.5) return;
  if (d > audioDurationHint.sec) audioDurationHint.sec = d;
}

function refreshAudioDurationHintFromElement(a) {
  if (!a || !audioDurationHint.url) return;
  const src = getActiveAudioSrc(a);
  if (!src || !audioUrlsEquivalent(src, audioDurationHint.url)) return;
  applyAudioDurationHint(readAudioElementDurationSec(a));
}

function getAudioDuration(a) {
  if (!a) return 0;
  refreshAudioDurationHintFromElement(a);
  let dur = readAudioElementDurationSec(a);
  const src = getActiveAudioSrc(a);
  const hinted = normalizeAudioDurationSec(audioDurationHint.sec);
  if (src && audioDurationHint.url && audioUrlsEquivalent(src, audioDurationHint.url) && hinted > 0) {
    dur = Math.max(dur, hinted);
  }
  const cur = Number.isFinite(a.currentTime) ? a.currentTime : 0;
  if (cur > 0.5 && dur > 0 && cur > dur - 0.25) {
    dur = Math.max(dur, cur);
  }
  return dur;
}

async function primeAudioDurationHint(rawUrl) {
  const url = String(rawUrl || "").trim();
  if (!url) return;
  if (!audioUrlsEquivalent(url, audioDurationHint.url)) {
    resetAudioDurationHintForUrl(url);
  }
  const probed = await measureAudioDurationSec(url);
  if (audioUrlsEquivalent(url, audioDurationHint.url)) {
    applyAudioDurationHint(probed);
    try {
      syncPlayerUI();
    } catch {}
    try {
      renderHubNowPlaying();
    } catch {}
  }
}

async function waitForAudioCanPlay(a, timeoutMs = 12000) {
  if (!a) return false;
  if (a.readyState >= 3) return true;
  if (a.readyState >= 2) return true;
  if (readAudioElementDurationSec(a) > 0) return true;
  return new Promise((resolve) => {
    let settled = false;
    const finish = (ok) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      a.removeEventListener("canplay", onEv);
      a.removeEventListener("loadedmetadata", onEv);
      a.removeEventListener("durationchange", onEv);
      a.removeEventListener("error", onErr);
      resolve(ok);
    };
    const onEv = () => {
      if (a.readyState >= 2 || readAudioElementDurationSec(a) > 0) finish(true);
    };
    const onErr = () => finish(false);
    const timer = setTimeout(() => finish(a.readyState >= 2), timeoutMs);
    a.addEventListener("canplay", onEv);
    a.addEventListener("loadedmetadata", onEv);
    a.addEventListener("durationchange", onEv);
    a.addEventListener("error", onErr, { once: true });
  });
}

async function measureAudioDurationSec(rawUrl) {
  const s = String(rawUrl || "").trim();
  if (!s || s === "#") return null;
  const url = hubAbsoluteUrl(s);

  // Best: full file size from proxy (Content-Range / Content-Length) → real length.
  try {
    const bytes = await fetchAudioByteLength(url);
    const fromSize = estimateMp3DurationFromByteLength(bytes);
    if (fromSize > 0) return fromSize;
  } catch {}

  // Fast path: same src already decoded on the shared player element.
  try {
    if (
      playerEl &&
      audioUrlsEquivalent(getActiveAudioSrc(playerEl), url)
    ) {
      const d = readAudioElementDurationSec(playerEl);
      if (d > 0) return d;
    }
  } catch {}

  return new Promise((resolve) => {
    const a = new Audio();
    let settled = false;
    let best = 0;
    const finish = (v) => {
      if (settled) return;
      settled = true;
      try {
        a.removeAttribute("src");
        a.load();
      } catch {}
      const out = normalizeAudioDurationSec(v) || (best > 0 ? best : null);
      resolve(out);
    };
    const consider = () => {
      const d = readAudioElementDurationSec(a);
      if (d > best) best = d;
    };
    const timer = setTimeout(() => finish(best > 0 ? best : null), 18000);
    a.addEventListener("durationchange", consider);
    a.addEventListener("loadedmetadata", consider);
    a.addEventListener("progress", consider);
    a.addEventListener(
      "error",
      () => {
        clearTimeout(timer);
        finish(null);
      },
      { once: true }
    );
    try {
      a.preload = "auto";
      a.src = url;
    } catch {
      clearTimeout(timer);
      finish(null);
    }
  });
}

/** Suno's persona endpoint requires the analysis segment to be 10–30s
 *  and to lie strictly inside the file. We leave a small tail margin so
 *  that small floating-point differences between our duration reading
 *  and Suno's don't push vocalEnd past EOF.
 *
 *  Returns null if the file is too short (<10.6s) — caller will fall
 *  back to omitting vocalStart/vocalEnd, which lets Suno auto-pick. */
function buildPersonaVocalWindowFromDuration(durationSec) {
  const d = Number(durationSec);
  if (!Number.isFinite(d) || d <= 0) return null;
  const round2 = (x) => Math.round(x * 100) / 100;
  const TAIL_MARGIN = 0.5;
  if (d >= 30 + TAIL_MARGIN) {
    return { vocalStart: 0, vocalEnd: 30 };
  }
  if (d >= 10 + TAIL_MARGIN) {
    return { vocalStart: 0, vocalEnd: round2(d - TAIL_MARGIN) };
  }
  // Below the minimum-with-margin window. Don't send a window at all
  // and let Suno's auto-pick run; it occasionally succeeds even on
  // ~10s files because their internal probe is more lenient.
  return null;
}

async function createPersonaForSong({
  taskId,
  audioId,
  audioUrl,
  title,
  style,
  voiceProfile,
  dialect,
  timbre,
  creator,
  source, // "result" | "library" | "hub" | "options"
} = {}) {
  const tId = String(taskId || "").trim();
  const aId = String(audioId || "").trim();
  if (!tId || !aId) {
    const msg = "This song is missing the voice signature. Generate a new song or try a newer one.";
    setStatus(msg);
    showToast(msg, { icon: "!", durationMs: 3600 });
    return null;
  }

  const songTitle = String(title || "").trim();
  const styleStr = String(style || "").trim();
  const personaName = creator
    ? `@${String(creator).trim()} · ${songTitle || "voice"}`.slice(0, 60)
    : (songTitle ? `${songTitle} voice` : `My voice ${new Date().toLocaleDateString()}`).slice(0, 60);
  const descParts = [
    creator ? `Captured from @${creator}'s post "${songTitle || "song"}".`
            : (songTitle ? `Captured from "${songTitle}".` : ""),
    styleStr ? `Style: ${styleStr}.` : "",
    voiceProfile ? `Voice: ${voiceProfile}.` : "",
    dialect ? `Dialect: ${dialect}.` : "",
    timbre ? `Timbre: ${timbre}.` : "",
  ].filter(Boolean);
  const personaDescription = (descParts.join(" ") || "A reusable vocal style captured from a previous generation.").slice(0, 580);
  const personaStyle = styleStr.split(/[,|]/)[0]?.trim().slice(0, 60) || "";

  try {
    setLoading(true, {
      title: "Saving voice as persona…",
      sub: creator
        ? `Capturing @${creator}'s vocal style.`
        : (songTitle ? `Capturing the voice from "${songTitle}".` : "Capturing the vocal style."),
    });
    showToast("Saving voice as persona…", { icon: "♪", durationMs: 2400 });

    let vocalPayload = {};
    let probeDurSec = null;
    const probeUrl = String(audioUrl || "").trim();
    if (probeUrl) {
      probeDurSec = await measureAudioDurationSec(probeUrl);
      const win = buildPersonaVocalWindowFromDuration(probeDurSec);
      if (win) {
        vocalPayload = { vocalStart: win.vocalStart, vocalEnd: win.vocalEnd };
      }
    }
    try {
      console.info("[persona] request", {
        taskId: tId,
        audioId: aId,
        probeDurSec,
        vocalPayload,
      });
    } catch {}

    const personaAuthToken = getSupabaseAuthToken();
    const r = await fetch(apiUrl("/api/suno/persona"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(personaAuthToken ? { Authorization: `Bearer ${personaAuthToken}` } : {}),
      },
      body: JSON.stringify({
        taskId: tId,
        audioId: aId,
        name: personaName,
        description: personaDescription,
        ...(personaStyle ? { style: personaStyle } : {}),
        ...vocalPayload,
      }),
    });
    const d = await r.json().catch(() => ({}));
    if (r.status === 402 || d?.code === "insufficient_credits") {
      const need = Number(d?.needed ?? 5);
      const have = Number(d?.balance || 0);
      throw new Error(
        `Not enough credits to save a persona (you have ${have}, need ${need}). Open Profile → Credits to redeem a code.`
      );
    }
    if (!r.ok) {
      try {
        console.warn("[persona] failed", { status: r.status, response: d });
      } catch {}
      // Build the friendliest error possible. Prefer Suno's own
      // upstream `msg` (already merged into d.error by our serverless
      // proxy), then fall back to status/details.
      const baseMsg = d?.error || "Persona creation failed";
      const probeNote = probeDurSec
        ? ` [measured ${Math.round(probeDurSec)}s${
            vocalPayload.vocalStart != null
              ? `, sent ${vocalPayload.vocalStart}–${vocalPayload.vocalEnd}s`
              : ", auto-window"
          }]`
        : "";
      let hint = "";
      if (/failed to generate persona|Current music failed/i.test(baseMsg)) {
        if (probeDurSec && probeDurSec < 11) {
          hint =
            " — Suno needs about 10+ seconds of analyzable audio. This track is too short.";
        } else {
          hint =
            " — Suno couldn’t analyze this track’s vocals. Try a different song with clearer singing for at least 10s.";
        }
      } else if (/internal error|code 500|Suno hit/i.test(baseMsg)) {
        hint = " — Wait a minute and retry, or try another track.";
      }
      throw new Error(`${baseMsg}${hint}${probeNote}`);
    }
    // After a successful save, sync the displayed credit balance so
    // the user sees the deduction immediately.
    try {
      if (typeof refreshMyCredits === "function") void refreshMyCredits({ silent: true });
    } catch {}
    const personaId = String(d?.personaId || "").trim();
    if (!personaId) throw new Error("Persona created but ID was missing.");

    addPersona(personaId, personaName);
    if (els.sunoPersonaId) els.sunoPersonaId.value = personaId;
    try { savePersonaSelection(personaId); } catch {}
    try { renderPersonaSelect(); } catch {}
    try { updateProfilePersonaRow(); } catch {}
    const okMsg = "Persona saved & selected for your next generations.";
    setStatus(okMsg);
    showToast(creator ? `Voice saved: @${creator}` : "Persona saved & selected", { icon: "✓", durationMs: 3200 });
    return personaId;
  } catch (e) {
    const errMsg = `Couldn't save voice: ${e?.message || String(e)}`;
    setStatus(errMsg);
    showToast(errMsg, { icon: "!", durationMs: 4400 });
    return null;
  } finally {
    setLoading(false);
  }
}

async function createPersonaFromHubPost(post) {
  // Hub list rows ship a minimal `meta` to save egress. The voice
  // signature lives in the heavy keys (taskId / audioId) — fetch them
  // on demand for this single post.
  if (post && post.id && (!post.meta || (!post.meta.taskId && !post.meta.audioId))) {
    try {
      const fullMeta = await hubFetchPostMetaFull(post.id);
      if (fullMeta && typeof fullMeta === "object") {
        post = { ...post, meta: { ...(post.meta || {}), ...fullMeta } };
      }
    } catch {}
  }
  const taskId = String(post?.meta?.taskId || "").trim();
  const audioId = String(post?.meta?.audioId || "").trim();
  const creator = String(post?.creator || "artist").trim() || "artist";
  const title = String(post?.title || "song").trim() || "song";
  if (!taskId || !audioId) {
    const msg = "This post is older and doesn't carry a voice signature. Try a newer post.";
    setStatus(msg);
    showToast(msg, { icon: "!", durationMs: 3600 });
    return;
  }
  const ok = window.confirm(
    `Save @${creator}'s voice from "${title}" as a persona you can reuse?`
  );
  if (!ok) return;
  await createPersonaForSong({
    taskId,
    audioId,
    audioUrl: post?.url,
    title,
    style: post?.meta?.style || post?.style,
    dialect: post?.meta?.dialect,
    creator,
    source: "hub",
  });
}

let profileEditing = false;

function setProfileEditing(on) {
  profileEditing = Boolean(on);
  if (els.profilePreviewUsernameInput) els.profilePreviewUsernameInput.disabled = !profileEditing;
  if (els.profilePreviewTimbreInput) els.profilePreviewTimbreInput.disabled = !profileEditing;
  if (els.profilePreviewBioInput) els.profilePreviewBioInput.disabled = !profileEditing;
  if (els.btnProfileEdit) els.btnProfileEdit.style.display = profileEditing ? "none" : "";
  if (els.profileEditActions) {
    els.profileEditActions.style.display = profileEditing ? "flex" : "none";
    els.profileEditActions.setAttribute("aria-hidden", profileEditing ? "false" : "true");
  }
  const hint = document.getElementById("profileAvatarEditHint");
  if (hint) hint.style.display = profileEditing ? "" : "none";
  // Toggle the editing class on the hero — the CSS uses it to swap the
  // About card vs the bio textarea, hide the shuffle play, etc.
  if (els.profileAura) {
    els.profileAura.classList.toggle("profileAuraEditing", profileEditing);
  }
  // Hide the chrome while editing — it overlaps form fields and
  // confuses the touch targets on small screens. The hero identity
  // line + bio quote are hidden via CSS off the editing class; we
  // still need to manually hide the music sections below so they
  // don't repaint stale data right under the form.
  const sections = [
    els.profileActionRow,
    els.profileTopWeek,
  ];
  sections.forEach((node) => {
    if (!node) return;
    if (profileEditing) {
      node.dataset._profileWasHidden = node.hidden ? "1" : "0";
      node.hidden = true;
    } else {
      if (node.dataset._profileWasHidden === "0") node.hidden = false;
      delete node.dataset._profileWasHidden;
    }
  });
  renderProfileUsernamePrompt();
  renderProfileCallingCardHint();
  // Refresh the identity line so it picks up edits when we leave edit mode.
  if (!profileEditing) {
    try { renderProfileIdentityLine(); } catch {}
  }
  try { renderProfileNabadCertBadge(); } catch {}
  try { renderProfileVoiceTimbreInline(); } catch {}
}

/** Show the soft "pick a username" banner when the current user is
 *  signed in and still has the auto-minted `user_xxxxxx` handle.
 *  Hidden while editing (so the input field is the only call to
 *  action) and hidden once they save anything that isn't auto. */
function renderProfileUsernamePrompt() {
  const el = els.profileUsernamePrompt;
  if (!el) return;
  const signedIn = Boolean(authSession?.user?.id);
  const isAuto = isAutoGeneratedUsername(activeProfile?.username);
  const shouldShow = signedIn && isAuto && !profileEditing;
  el.style.display = shouldShow ? "" : "none";
}

function restoreProfileInputsFromActive() {
  if (els.profilePreviewUsernameInput) els.profilePreviewUsernameInput.value = activeProfile.username ? `@${activeProfile.username}` : "@guest";
  if (els.profilePreviewTimbreInput) els.profilePreviewTimbreInput.value = activeProfile.voiceTimbre || "";
  if (els.profilePreviewBioInput) {
    // Strip the legacy "Add a short bio…" placeholder that older
    // versions stored as a real value. The placeholder attribute now
    // handles the empty-state copy, so we should only carry real bios.
    const rawBio = String(activeProfile.bio || "").trim();
    const cleaned = /^add a short bio/i.test(rawBio) ? "" : activeProfile.bio || "";
    els.profilePreviewBioInput.value = cleaned;
  }
  renderProfilePreviewFromInputs();
  renderProfileAuraVoiceChip();
}

function renderProfileOwnStats() {
  const hubItems = HUB_FEATURE_ENABLED ? getProfileOwnerHubItems() : [];
  const lib = loadLibrary();
  const pubLib = lib.filter((t) => Boolean(t.publicOnProfile));
  const pubLibCount = pubLib.length;
  const totalLikes = HUB_FEATURE_ENABLED ? hubItems.reduce((sum, p) => sum + Number(p.likes || 0), 0) : 0;
  // Hub off: second pill = Public (eye icon in HTML); third = Likes (0 until discovery feed).
  const songCountForPills = HUB_FEATURE_ENABLED ? hubItems.length : lib.length;
  const hubLikesOnly = HUB_FEATURE_ENABLED ? totalLikes : 0;
  const songCountForOwnHeader = HUB_FEATURE_ENABLED ? hubItems.length : lib.length;

  if (els.profileOwnSongCount) {
    if (HUB_FEATURE_ENABLED) {
      if (hubItems.length) {
        els.profileOwnSongCount.textContent = `${hubItems.length} ${hubItems.length === 1 ? "song" : "songs"}`;
        els.profileOwnSongCount.hidden = false;
      } else {
        els.profileOwnSongCount.textContent = "";
        els.profileOwnSongCount.hidden = true;
      }
    } else if (lib.length) {
      els.profileOwnSongCount.textContent = `${pubLibCount} public · ${lib.length} saved`;
      els.profileOwnSongCount.hidden = false;
    } else {
      els.profileOwnSongCount.textContent = "";
      els.profileOwnSongCount.hidden = true;
    }
  }
  if (els.profileOwnStats) {
    if (HUB_FEATURE_ENABLED) {
      if (hubItems.length) {
        els.profileOwnStats.innerHTML = `
        <span><strong>${hubItems.length}</strong> song${hubItems.length === 1 ? "" : "s"}</span>
        <span aria-hidden="true">·</span>
        <span><strong>${totalLikes}</strong> like${totalLikes === 1 ? "" : "s"}</span>
      `;
      } else {
        els.profileOwnStats.innerHTML = "";
      }
    } else if (lib.length) {
      els.profileOwnStats.innerHTML = `
        <span><strong>${pubLibCount}</strong> public on profile link</span>
        <span aria-hidden="true">·</span>
        <span><strong>${lib.length}</strong> saved</span>
      `;
    } else {
      els.profileOwnStats.innerHTML = "";
    }
  }
  if (els.profileAuraSongsValue) els.profileAuraSongsValue.textContent = String(songCountForPills);
  if (els.profileAuraLikesValue) els.profileAuraLikesValue.textContent = String(hubLikesOnly);
  if (els.profileAuraStatSongs) els.profileAuraStatSongs.dataset.show = songCountForPills > 0 ? "true" : "false";
  if (els.profileAuraStatLikes) {
    els.profileAuraStatLikes.dataset.show = hubLikesOnly > 0 ? "true" : "false";
  }

  if (els.profileStatsPills) {
    els.profileStatsPills.classList.toggle("profileStatsPills--hubOn", HUB_FEATURE_ENABLED);
    els.profileStatsPills.hidden = HUB_FEATURE_ENABLED ? hubItems.length === 0 : lib.length === 0;
  }
  if (els.profileStatPillSongsValue) {
    els.profileStatPillSongsValue.textContent = formatStatCount(songCountForPills);
  }
  if (els.profileStatPillPublicValue) {
    els.profileStatPillPublicValue.textContent = formatStatCount(pubLibCount);
  }
  if (els.profileStatPillLikesValue) {
    els.profileStatPillLikesValue.textContent = formatStatCount(hubLikesOnly);
  }

  const lineEl = els.profileAuraStatLine;
  if (lineEl) {
    if (HUB_FEATURE_ENABLED) {
      const bits = [];
      if (hubItems.length) bits.push(`<strong>${hubItems.length}</strong> song${hubItems.length === 1 ? "" : "s"}`);
      if (totalLikes > 0) bits.push(`<strong>${totalLikes}</strong> like${totalLikes === 1 ? "" : "s"}`);
      lineEl.innerHTML =
        bits.length > 0 ? bits.join('<span class="profileAuraStatsSepDot" aria-hidden="true"> · </span>') : "No releases yet";
    } else if (pubLibCount) {
      lineEl.innerHTML = `<strong>${pubLibCount}</strong> public on your profile link`;
    } else if (lib.length) {
      lineEl.textContent = "No Library songs marked public yet — use ⋯ on each row in Library.";
    } else {
      lineEl.textContent = "No saves yet";
    }
  }

  const libUrl = lib.filter((t) => String(t?.url || "").trim());
  const pubPulse = libUrl.filter((t) => Boolean(t.publicOnProfile));
  const pulseItems = HUB_FEATURE_ENABLED ? hubItems : (pubPulse.length ? pubPulse : libUrl).slice(0, 24);
  syncProfileAuraPulseFromLatest(pulseItems);
}

/** Compact stat formatter: 0..999 raw, 1.2k, 14.3k, 1.1M. Keeps the
 *  pills from blowing out on very-liked profiles. */
function formatStatCount(n) {
  const v = Number(n) || 0;
  if (v < 1000) return String(v);
  if (v < 10000) return `${(v / 1000).toFixed(1).replace(/\.0$/, "")}k`;
  if (v < 1000000) return `${Math.round(v / 1000)}k`;
  return `${(v / 1000000).toFixed(1).replace(/\.0$/, "")}M`;
}

/* -----------------------------------------------------------------
 *  Aura header helpers
 *
 *  - applyProfileAuraAvatarTint: paints the active avatar onto an
 *    offscreen canvas to extract a dominant color, then writes it
 *    into `--aura-tint` so the page glows in the user's own palette.
 *    Falls back to the brand purple when sampling can't run.
 *
 *  - setProfileAuraAudioState: toggles `data-audio-state="playing"`
 *    on the Aura header, which makes the gradient ring breathe.
 *    Wired up below to global `play`/`pause` events on Hub + Library
 *    audio so the ring lights up whenever any audio plays.
 * ----------------------------------------------------------------- */
let _auraTintLastSrc = "";
function applyProfileAuraAvatarTint(srcOverride) {
  const aura = els.profileAura;
  if (!aura) return;
  const src = String(srcOverride || activeProfile?.avatar || "").trim();
  if (!src || src === "./assets/nabadai-logo.png") {
    aura.style.setProperty("--aura-tint", "rgba(124, 92, 255, 0.55)");
    aura.style.setProperty("--aura-tint-soft", "rgba(35, 213, 171, 0.18)");
    aura.style.setProperty("--aura-tint-solid", "rgb(168, 152, 255)");
    _auraTintLastSrc = src;
    return;
  }
  if (src === _auraTintLastSrc) return;
  _auraTintLastSrc = src;
  try {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const c = document.createElement("canvas");
        c.width = 24;
        c.height = 24;
        const ctx = c.getContext("2d", { willReadFrequently: true });
        if (!ctx) return;
        ctx.drawImage(img, 0, 0, 24, 24);
        const data = ctx.getImageData(0, 0, 24, 24).data;
        let r = 0, g = 0, b = 0, n = 0;
        for (let i = 0; i < data.length; i += 4) {
          const a = data[i + 3];
          if (a < 32) continue;
          r += data[i];
          g += data[i + 1];
          b += data[i + 2];
          n++;
        }
        if (!n) return;
        r = Math.round(r / n);
        g = Math.round(g / n);
        b = Math.round(b / n);
        // Boost vibrancy by pushing each channel away from gray slightly,
        // then clamp. Avoids flat brown-ish averages that read as muddy.
        const punch = (v) => Math.max(0, Math.min(255, Math.round(128 + (v - 128) * 1.55)));
        const rr = punch(r), gg = punch(g), bb = punch(b);
        aura.style.setProperty("--aura-tint", `rgba(${rr}, ${gg}, ${bb}, 0.62)`);
        aura.style.setProperty("--aura-tint-soft", `rgba(${rr}, ${gg}, ${bb}, 0.22)`);
        // Solid form for the live dot + pulse stroke (no alpha) — they
        // sit against dark backgrounds and need to read at small size.
        aura.style.setProperty("--aura-tint-solid", `rgb(${rr}, ${gg}, ${bb})`);
      } catch {}
    };
    img.onerror = () => {
      aura.style.setProperty("--aura-tint", "rgba(124, 92, 255, 0.55)");
      aura.style.setProperty("--aura-tint-soft", "rgba(35, 213, 171, 0.18)");
      aura.style.setProperty("--aura-tint-solid", "rgb(168, 152, 255)");
    };
    img.src = src;
  } catch {}
}

/** Voice timbre → page tint (Twist 1). When unset, falls back to avatar sampling. */
function timbreToAuraCss(timbreRaw) {
  const t = String(timbreRaw || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
  const map = {
    bass: [88, 118, 235],
    baritone: [118, 152, 255],
    tenor: [255, 200, 118],
    alto: [255, 138, 188],
    mezzo_soprano: [228, 152, 255],
    soprano: [168, 218, 255],
  };
  const rgb = map[t];
  if (!rgb) return null;
  const [r, g, b] = rgb;
  return {
    tint: `rgba(${r}, ${g}, ${b}, 0.52)`,
    soft: `rgba(${r}, ${g}, ${b}, 0.22)`,
  };
}

function applyProfileAuraVisualTint() {
  const aura = els.profileAura;
  if (!aura) return;
  // New priority (matches the "header is the music" direction):
  //   1) latest cover art — the strongest signal of what you make
  //   2) avatar — your face
  //   3) voice timbre — taxonomy fallback
  //   4) brand purple — last resort
  const latestArt = (() => {
    try {
      const items = getProfileOwnerHubItems();
      const top = items?.[0];
      const url = String(top?.artUrl || top?.creatorAvatar || "").trim();
      if (!url || url === "./assets/nabadai-logo.png") return "";
      return url;
    } catch { return ""; }
  })();
  if (latestArt) {
    applyProfileAuraAvatarTint(latestArt);
    return;
  }
  if (activeProfile?.avatar) {
    applyProfileAuraAvatarTint(activeProfile.avatar);
    return;
  }
  const timbre = String(
    activeProfile?.voiceTimbre || els.profilePreviewTimbreInput?.value || ""
  ).trim();
  const fromTimbre = timbreToAuraCss(timbre);
  if (fromTimbre) {
    aura.style.setProperty("--aura-tint", fromTimbre.tint);
    aura.style.setProperty("--aura-tint-soft", fromTimbre.soft);
    _auraTintLastSrc = "";
    return;
  }
  aura.style.setProperty("--aura-tint", "rgba(124, 92, 255, 0.55)");
  aura.style.setProperty("--aura-tint-soft", "rgba(124, 92, 255, 0.18)");
}

/** Rough BPM guess from Hub post meta — drives aura ring cadence (Twist 1). */
function estimateBpmFromHubPost(p) {
  if (!p) return 88;
  try {
    const m = p.meta || {};
    const n = Number(m.bpm);
    if (Number.isFinite(n) && n >= 48 && n <= 200) return Math.round(n);
    const g = String(m.groovePace || "").toLowerCase();
    if (g === "slow") return 72;
    if (g === "energetic" || g === "fast") return 118;
    if (g === "balanced") return 92;
    const id = String(p.id || p.title || "");
    let h = 0;
    for (let i = 0; i < id.length; i++) h = ((h << 5) - h + id.charCodeAt(i)) | 0;
    return 68 + (Math.abs(h) % 38);
  } catch {
    return 88;
  }
}

function syncProfileAuraPulseFromLatest(items) {
  const aura = els.profileAura;
  if (!aura) return;
  const latest = Array.isArray(items) && items.length ? items[0] : null;
  const bpm = latest ? estimateBpmFromHubPost(latest) : 88;
  aura.style.setProperty("--aura-bpm", String(bpm));
}

function getProfileOwnerHubItems() {
  if (!HUB_FEATURE_ENABLED) return [];
  const creator = String(activeProfile.username || "guest");
  const uid = String(authSession?.user?.id || "");
  return loadHubFeed()
    .filter((p) => {
      if (uid) return String(p?.meta?.creatorUserId || "") === uid;
      if (!creator || creator === "guest") return false;
      return String(p?.creator || "") === creator;
    })
    .sort((a, b) => Number(b.ts || 0) - Number(a.ts || 0));
}

/** True when the signed-in user's Hub posts haven't finished their
 *  first fetch this session AND we have nothing in the local cache to
 *  show yet. Used by the three Profile sections to paint shimmer
 *  skeletons instead of blank cards or premature "no songs" CTA. */
function shouldShowProfileHubSkeleton(items) {
  if (!authSession?.user?.id) return false;
  if (items && items.length) return false;
  if (_myHubPostsFirstLoadDone) return false;
  return true;
}

/** Latest-release hero card removed from Profile UI. */
function renderProfileHero(_items) {}

function renderProfileHeartbeat(items) {
  const svg = els.profileHeartbeatSvg;
  const peaks = els.profileHeartbeatPeaks;
  if (!svg || !peaks) return;
  if (!items?.length) {
    peaks.innerHTML = "";
    svg.innerHTML = "";
    return;
  }
  const chron = [...items].sort((a, b) => Number(a.ts || 0) - Number(b.ts || 0));
  const n = chron.length;
  const maxL = Math.max(1, ...chron.map((p) => Number(p.likes || 0)));
  // Calmer fingerprint: thinner line, gentler peaks, viewBox height 36.
  let d = "M 4 28";
  chron.forEach((p, i) => {
    const x = n === 1 ? 160 : 12 + (i / Math.max(n - 1, 1)) * 296;
    const likes = Number(p.likes || 0);
    const h = 6 + (likes / maxL) * 16;
    const y = 28 - h;
    d += ` L ${Math.max(4, x - 4)} 28 L ${x} ${y} L ${Math.min(316, x + 4)} 28`;
  });
  d += " L 316 28";
  svg.innerHTML = `<path d="${d}" fill="none" stroke="currentColor" stroke-width="0.9" stroke-linecap="round" stroke-linejoin="round" opacity="0.78"/>`;
  // Only render peak dots for the 8 most recent releases — premium UI
  // = restraint. Older peaks are still visible on the line but not
  // clickable; tapping the line links to the full list below.
  const recent = chron.slice(-8);
  peaks.innerHTML = recent
    .map((p) => {
      const i = chron.indexOf(p);
      const leftPct = n === 1 ? 50 : (i / Math.max(n - 1, 1)) * 100;
      const sid = escapeHtml(String(p.id));
      const tl = escapeHtml(String(p.title || "Song").slice(0, 80));
      return `<button type="button" class="profileHeartbeatPeak" style="left:${leftPct}%" data-profile-heart-play="${sid}" aria-label="Play ${tl}"></button>`;
    })
    .join("");
  peaks.querySelectorAll("[data-profile-heart-play]").forEach((b) => {
    b.addEventListener("click", () => {
      const sid = b.getAttribute("data-profile-heart-play");
      if (sid) void playHubPostFromProfile(sid);
    });
  });
}

function setProfileAuraAudioState(playing) {
  const aura = els.profileAura;
  if (!aura) return;
  aura.setAttribute("data-audio-state", playing ? "playing" : "idle");
}

/* =================================================================
 *  Liquid heartbeat fingerprint
 *
 *  Draws a unique-per-user heartbeat curve into the SVG that sits
 *  next to the avatar. The curve is composed from:
 *    1. A deterministic hash of the user's handle/id, so two users
 *       with the same release count still get distinct shapes.
 *    2. The user's actual release timeline — more releases =
 *       more peaks; popular releases = taller peaks.
 *  The animation (stroke-dashoffset flow + blob morph) is purely
 *  CSS-driven; this only writes a `d` attribute.
 * ================================================================= */
function _hashSeed32(str) {
  let h = 2166136261 >>> 0;
  const s = String(str || "guest");
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}
function _mulberry32(seed) {
  let t = seed >>> 0;
  return function () {
    t = (t + 0x6D2B79F5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

/* The "liquid heartbeat" sonic-fingerprint visual was retired — it
 * felt off the app aesthetic and didn't help users understand their
 * stats. Kept as a no-op so existing call sites don't blow up; the
 * DOM nodes were also removed from index.html. */
function renderProfileLiquidPulse(_items) {
  /* no-op (heartbeat retired) */
}

/* Profile header shimmer — covers the avatar + username while the cold
 * boot is fetching the cloud profile. Without this, users on slow
 * mobile data see the placeholder logo + "@guest" for several seconds
 * before the real data lands. Toggled when the signed-in handle is
 * still a placeholder; cleared after the boot-time cloud merge paints. */
function setProfileHeaderLoading(on) {
  const top = document.getElementById("profileAuraTopRow");
  const row = document.getElementById("profileAuraNameRow");
  const flag = on ? "true" : "false";
  if (top) top.setAttribute("data-loading", flag);
  if (row) row.setAttribute("data-loading", flag);
}

/** Signed-in but the visible handle is still the unauthenticated
 *  sentinel or not set yet. We intentionally do NOT treat auto-generated
 *  `user_xxxxx` as "loading" — once boot assigns that, the header may
 *  show it; the bad flash is specifically @guest + default logo while
 *  session is valid. A cached avatar alone must NOT skip this. */
function shouldShowProfileHeaderSkeleton() {
  if (!authSession?.user?.id) return false;
  const u = String(activeProfile?.username || "").trim().toLowerCase();
  if (!u) return true;
  return u === "guest";
}

/* =================================================================
 *  Single identity line — persona when set (quiet text next to the
 *  @handle). Voice timbre shows in #profileVoiceTimbreInline.
 * ================================================================= */
function renderProfileIdentityLine() {
  const el = els.profileIdentityLine;
  if (!el) return;
  // Persona only; timbre is inline next to the username in view mode.
  const personaLabel = (() => {
    try {
      const lbl = document.getElementById("profilePersonaLabel")?.textContent?.trim();
      if (!lbl || lbl === "—") return "";
      if (/no persona/i.test(lbl)) return "";
      return lbl;
    } catch { return ""; }
  })();
  if (!personaLabel) {
    el.hidden = true;
    el.innerHTML = "";
    return;
  }
  el.hidden = false;
  el.innerHTML = escapeHtml(personaLabel);
}

/* =================================================================
 *  Bio quote — sits directly under the identity line in the hero.
 *  Visible only in view-mode (CSS handles edit-mode hiding) and
 *  only when there's a real bio (not the legacy placeholder string).
 * ================================================================= */
function renderProfileHeroBio() {
  const wrap = els.profileHeroBio;
  const text = els.profileAboutText;
  if (!wrap || !text) return;
  const raw = String(activeProfile?.bio || "").trim();
  const cleaned = /^add a short bio/i.test(raw) ? "" : raw;
  if (!cleaned) {
    wrap.hidden = true;
    text.textContent = "";
    return;
  }
  wrap.hidden = false;
  text.textContent = cleaned;
}

/* =================================================================
 *  Spotify-x-Nabad — render helpers
 *
 *  All called from renderProfileHubShared() with the freshly fetched
 *  list of own Hub posts (newest-first). Each helper hides its
 *  section when there's nothing to show so the page collapses cleanly
 *  for a brand-new account.
 * ================================================================= */

// renderProfileShufflePlay was retired with the green floating button.
// The sticky ribbon at the top of the page now owns the shuffle action.

function renderProfileActionRow(_items) {
  const row = els.profileActionRow;
  if (!row) return;
  // Share is always meaningful — even an empty profile is shareable.
  row.hidden = false;
}

function renderProfileTopWeek(items) {
  const sec = els.profileTopWeek;
  const list = els.profileTopWeekList;
  if (!sec || !list) return;
  // Top 3 only — like a magazine cover. Cards laid out horizontally,
  // scrollable on small screens.
  const ranked = (items || [])
    .slice()
    .sort((a, b) => Number(b.likes || 0) - Number(a.likes || 0))
    .filter((p, _, arr) => Number(p.likes || 0) > 0 || arr.length <= 3)
    .slice(0, 3);
  if (!ranked.length) {
    if (shouldShowProfileHubSkeleton(items)) {
      sec.hidden = false;
      sec.setAttribute("data-skeleton", "true");
      list.innerHTML = `
        <div class="profileTopWeekItem profileTopWeekSkel" aria-hidden="true">
          <span class="profileTopWeekArt profileTopWeekSkelArt"></span>
          <span class="profileTopWeekInfo">
            <span class="profileSkelLine profileSkelLineTitle"></span>
            <span class="profileSkelLine profileSkelLineSub"></span>
          </span>
        </div>
        <div class="profileTopWeekItem profileTopWeekSkel" style="--profSkelDelay:0.12s" aria-hidden="true">
          <span class="profileTopWeekArt profileTopWeekSkelArt"></span>
          <span class="profileTopWeekInfo">
            <span class="profileSkelLine profileSkelLineTitle"></span>
            <span class="profileSkelLine profileSkelLineSub"></span>
          </span>
        </div>
        <div class="profileTopWeekItem profileTopWeekSkel" style="--profSkelDelay:0.24s" aria-hidden="true">
          <span class="profileTopWeekArt profileTopWeekSkelArt"></span>
          <span class="profileTopWeekInfo">
            <span class="profileSkelLine profileSkelLineTitle"></span>
            <span class="profileSkelLine profileSkelLineSub"></span>
          </span>
        </div>
      `;
    } else {
      sec.hidden = true;
      sec.removeAttribute("data-skeleton");
      list.innerHTML = "";
    }
    return;
  }
  sec.hidden = false;
  sec.removeAttribute("data-skeleton");
  list.innerHTML = ranked
    .map((p, i) => {
      const sid = escapeHtml(String(p.id));
      const tl = escapeHtml(String(p.title || "Untitled"));
      const art = escapeHtml(String(p.artUrl || p.creatorAvatar || "./assets/nabadai-logo.png"));
      const likes = Number(p.likes || 0);
      const rel = typeof relativeTime === "function" ? relativeTime(p.ts) : "";
      const subBits = [];
      if (rel) subBits.push(`<span>${escapeHtml(rel)}</span>`);
      if (likes > 0) {
        subBits.push(`
          <span class="profileTopWeekLikes" aria-label="${likes} likes">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>
            ${likes}
          </span>`);
      }
      return `
        <button type="button" class="profileTopWeekItem" role="listitem" data-top-week-play="${sid}" aria-label="Play ${tl}">
          <span class="profileTopWeekArt">
            <img src="${art}" alt="" />
            <span class="profileTopWeekRank">${i + 1}</span>
          </span>
          <span class="profileTopWeekInfo">
            <span class="profileTopWeekTitle">${tl}</span>
            <span class="profileTopWeekSub">${subBits.join('<span aria-hidden="true">·</span>')}</span>
          </span>
        </button>
      `;
    })
    .join("");
  list.querySelectorAll("[data-top-week-play]").forEach((b) => {
    b.addEventListener("click", () => {
      const sid = b.getAttribute("data-top-week-play");
      if (sid) void playHubPostFromProfile(sid);
    });
  });
}

// Voice note playback + recording: header voice chip only (see
// renderProfileAuraVoiceChip, toggleOwnCallingCardPreview, calling card modal).

function renderProfileAboutCard() { /* no-op — see renderProfileSignatureCard */ }

/** True when this account should show the "Verified Nabad Creator"
 *  pill under the avatar. Gated — never shown by default. Sources:
 *    1) `activeProfile.soundCertified` from Supabase `profiles.sound_certified`
 *       (after you run the migration + set rows server-side).
 *    2) Optional env allowlist `NABAD_CERTIFIED_USER_IDS` exposed via
 *       `/api/public-config` as `nabadCertifiedUserIds` (comma-separated
 *       auth UUIDs) for staging / early partners only. */
function isNabadSoundCertified() {
  if (!authSession?.user?.id) return false;
  if (INTERIM_ALWAYS_SHOW_PUBLIC_PROFILE_VERIFIED) return true;
  const uid = String(authSession.user.id);
  if (Boolean(activeProfile?.soundCertified)) return true;
  try {
    if (_nabadCertifiedUserIds && _nabadCertifiedUserIds.has(uid)) return true;
  } catch {}
  return false;
}

/** Whether the public `#/u/…` header should show the verified checkmark for this `profiles` row. */
function isPublicProfileVerifiedForDisplay(prof) {
  if (!prof || !String(prof.user_id || "").trim()) return false;
  if (INTERIM_ALWAYS_SHOW_PUBLIC_PROFILE_VERIFIED) return true;
  const sc = prof.sound_certified;
  if (sc === true || sc === "t" || sc === "true") return true;
  const uid = String(prof.user_id || "").trim();
  try {
    if (_nabadCertifiedUserIds && _nabadCertifiedUserIds.has(uid)) return true;
  } catch {}
  return false;
}

function syncUserPublicVerifiedBadge(prof) {
  const el = els.userPublicVerified;
  if (!el) return;
  const show = isPublicProfileVerifiedForDisplay(prof);
  el.hidden = !show;
  el.setAttribute("aria-hidden", show ? "false" : "true");
}

function renderProfileNabadCertBadge() {
  const check = els.profileNabadCertCheck;
  const legacy = els.profileNabadCertBadge;
  const show = isNabadSoundCertified() && !profileEditing;
  if (check) {
    check.hidden = !show;
    check.setAttribute("aria-hidden", show ? "false" : "true");
  }
  if (legacy) legacy.hidden = true;
}


/** Pretty label for `profiles.voice_timbre` slug (e.g. mezzo_soprano → Mezzo Soprano). */
function formatVoiceTimbreLabel(raw) {
  const slug = String(raw || "").trim().toLowerCase();
  if (!slug) return "";
  return slug.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/** View-mode timbre next to the @handle (hidden while editing or unset). */
function renderProfileVoiceTimbreInline() {
  const wrap = els.profileVoiceTimbreInline;
  const labelEl = els.profileVoiceTimbreInlineLabel;
  if (!wrap || !labelEl) return;
  const signedIn = Boolean(authSession?.user?.id);
  if (!signedIn || profileEditing) {
    wrap.hidden = true;
    labelEl.textContent = "";
    wrap.setAttribute("aria-hidden", "true");
    return;
  }
  const pretty = formatVoiceTimbreLabel(activeProfile?.voiceTimbre);
  if (!pretty) {
    wrap.hidden = true;
    labelEl.textContent = "";
    wrap.setAttribute("aria-hidden", "true");
    return;
  }
  wrap.hidden = false;
  labelEl.textContent = pretty;
  wrap.setAttribute("aria-hidden", "false");
}

function renderProfilePreviewFromInputs() {
  // Don't trim / overwrite live input values while the user is typing —
  // earlier behavior killed trailing spaces, lost mid-word spaces, and
  // (worst) replaced an empty bio with the placeholder string as a
  // real value, which made the field look "stuck" on the prompt text.
  // We just measure for layout and keep mirrors in sync.

  if (els.profilePreviewGenderIcon) els.profilePreviewGenderIcon.style.display = "none";
  if (els.profilePreviewBioInput) {
    els.profilePreviewBioInput.style.height = "auto";
    const h = Math.max(48, Math.min(160, els.profilePreviewBioInput.scrollHeight || 48));
    els.profilePreviewBioInput.style.height = `${h}px`;
  }
  if (els.profilePreviewGenres) {
    els.profilePreviewGenres.textContent = "";
    els.profilePreviewGenres.style.display = "none";
  }
  if (els.profilePreviewAvatar) {
    const raw = String(activeProfile.avatar || "").trim();
    const isReal = raw && !/nabadai-logo\.png(?:$|\?)/.test(raw);
    if (isReal) {
      els.profilePreviewAvatar.src = raw;
      els.profilePreviewAvatar.removeAttribute("data-empty");
    } else {
      els.profilePreviewAvatar.removeAttribute("src");
      els.profilePreviewAvatar.setAttribute("data-empty", "true");
    }
  }
  applyProfileAuraVisualTint();
  renderProfileOwnStats();
  renderProfileUsernamePrompt();
  updateProfilePersonaInlineChip();
  renderProfileIdentityLine();
  // Keep the hero bio + liquid pulse in sync with live input changes —
  // but only outside edit mode, where they're actually visible.
  if (!profileEditing) {
    try { renderProfileHeroBio(); } catch {}
    try {
      const items = getProfileOwnerHubItems().slice(0, 30);
      renderProfileLiquidPulse(items);
    } catch {}
  }
  // Email never appears in the hero — it lives in the Account block
  // below (next to Logout). Keep the inline node hidden + empty.
  if (els.authLoggedInEmailInline) {
    els.authLoggedInEmailInline.textContent = "";
    els.authLoggedInEmailInline.style.display = "none";
  }
  renderProfileNabadCertBadge();
  try { renderProfileVoiceTimbreInline(); } catch {}
}

/** `meta.profileVisibility === "private"` hides the release on `#/u/…`;
 *  anything else (missing / "public") counts as public — matches legacy
 *  rows that pre-date this flag. */
function isHubPostVisibleOnPublicProfile(post) {
  const v = String(post?.meta?.profileVisibility || "").trim().toLowerCase();
  return v !== "private";
}

/** Public-facing profile aggregated from this user's Hub posts. We use the
 * Hub feed as the source of truth (no separate "users" table yet) — this
 * keeps the route purely client-side and means a creator's bio / voice /
 * avatar reflects whatever was in their most recent post's meta. */
function renderUserProfile(rawUsername) {
  const username = String(rawUsername || "").replace(/^@/, "").trim();
  _userPublicFeedTracks = [];
  if (!els.userPublicName) return;
  syncUserPublicVerifiedBadge(null);
  // Resolve the creator's calling card out of band — don't block render.
  // This populates the chip + may autoplay once per device.
  void refreshUserPublicCallingCard(username);
  if (!HUB_FEATURE_ENABLED) {
    if (els.userPublicSongs) {
      els.userPublicSongs.innerHTML = `<p class="hint" style="padding:12px 0">Loading…</p>`;
    }
    if (els.userPublicEmpty) els.userPublicEmpty.style.display = "none";
    void renderUserProfilePublicLibraryAsync(username);
    return;
  }
  const feed = loadHubFeed();
  // Compare case-insensitively but render the username with the casing
  // from the actual posts so it looks like the creator's chosen handle.
  const matches = feed.filter((p) =>
    String(p?.creator || "").toLowerCase() === username.toLowerCase());
  matches.sort((a, b) => Number(b.ts || 0) - Number(a.ts || 0));
  const publicMatches = matches.filter(isHubPostVisibleOnPublicProfile);
  const latestPublic = publicMatches[0] || null;
  const latestAny = matches[0] || null;
  const displayName = latestAny?.creator || username || "user";

  if (els.userPublicName) els.userPublicName.textContent = `@${displayName}`;
  if (els.userPublicAvatar) {
    const av =
      (latestPublic && (latestPublic.artUrl || latestPublic.creatorAvatar)) ||
      latestAny?.creatorAvatar ||
      "./assets/nabadai-logo.png";
    els.userPublicAvatar.src = av;
    els.userPublicAvatar.alt = `${displayName} avatar`;
  }
  if (els.userPublicVoice) {
    const chip = els.userPublicVoice;
    const labelEl = chip.querySelector(".profileAuraVoiceChipText");
    const voice = String(latestPublic?.meta?.voiceTimbre || "").trim();
    const pretty = voice
      ? voice.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
      : "";
    if (labelEl) {
      labelEl.textContent = pretty ? `Voice · ${pretty}` : "Voice note";
    }
    // Visibility: show the chip when we have a voice timbre OR we're
    // about to discover a calling card. refreshUserPublicCallingCard
    // will flip data-has-card / data-state and (if needed) keep it
    // visible. If neither voice nor card materialize, we hide below.
    chip.style.display = pretty ? "" : "none";
    chip.dataset.state = "idle";
  }
  if (els.userPublicBio) {
    const bio = String(latestPublic?.meta?.bio || "").trim();
    if (bio) {
      els.userPublicBio.textContent = bio;
      els.userPublicBio.style.display = "";
    } else {
      els.userPublicBio.textContent = "";
      els.userPublicBio.style.display = "none";
    }
  }

  const totalLikes = publicMatches.reduce((sum, p) => sum + Number(p.likes || 0), 0);
  if (els.userPublicStats) {
    if (publicMatches.length) {
      els.userPublicStats.innerHTML = `
        <span><strong>${publicMatches.length}</strong> song${publicMatches.length === 1 ? "" : "s"}</span>
        <span aria-hidden="true">·</span>
        <span><strong>${totalLikes}</strong> like${totalLikes === 1 ? "" : "s"}</span>
      `;
      els.userPublicStats.style.display = "";
    } else {
      els.userPublicStats.style.display = "none";
    }
  }
  if (els.userPublicSongsCount) {
    els.userPublicSongsCount.textContent = publicMatches.length ? String(publicMatches.length) : "";
  }

  if (!publicMatches.length) {
    if (els.userPublicSongs) els.userPublicSongs.innerHTML = "";
    _userPublicFeedTracks = [];
    if (els.userPublicEmpty) {
      const hasPrivateOnly = matches.length > 0 && !publicMatches.length;
      els.userPublicEmpty.textContent = username
        ? hasPrivateOnly
          ? `No public songs from @${displayName} yet — their releases may be set to private.`
          : `No public songs from @${displayName} yet.`
        : "User not found.";
      els.userPublicEmpty.style.display = "";
    }
    void fetchPublicProfileRowByUsername(username).then((p) => {
      try {
        syncUserPublicVerifiedBadge(p);
      } catch {}
    });
    return;
  }
  if (els.userPublicEmpty) els.userPublicEmpty.style.display = "none";

  if (els.userPublicSongs) {
    const slice = publicMatches.slice(0, 60).filter((p) => String(p?.url || "").trim());
    const byLine = `@${displayName}`;
    const pubBase = { byLine, rawHandle: displayName };
    els.userPublicSongs.innerHTML = slice
      .map((p, i) =>
        userPublicDiscoveryRowHtml(
          {
            url: p.url,
            title: p.title,
            artUrl: p.artUrl || p.creatorAvatar,
            ts: p.ts,
          },
          i,
          {
            ...pubBase,
            extraMeta: `❤ ${Number(p.likes || 0)}`,
          },
        ),
      )
      .join("");
    _userPublicFeedTracks = slice.map((p) => {
      const art = String(p.artUrl || p.creatorAvatar || "").trim();
      const artSafe = art && !art.startsWith("data:") ? art : "./assets/nabadai-logo.png";
      return {
        url: String(p.url || "").trim(),
        title: String(p.title || "Untitled"),
        artUrl: artSafe,
        byLine,
      };
    });
    try {
      syncUserPublicFeedPlayingHighlights();
    } catch {}
  }
  void fetchPublicProfileRowByUsername(username).then((p) => {
    try {
      syncUserPublicVerifiedBadge(p);
    } catch {}
  });
}

/** Take a song off Hub. Routes through the server-side
 *  /api/hub/unpublish endpoint which uses the service role to delete
 *  the row after verifying the caller is the post's creator. This
 *  bypasses any client-side RLS quirks (some legacy rows track owner
 *  via `meta->>creatorUserId`, others only via `creator_username`),
 *  so deletes are reliable.
 *
 *  The local feed is updated optimistically for snappy UI; if the
 *  server delete fails we roll back and surface the reason. */
async function unpublishHubPostById(id) {
  const hid = String(id || "").trim();
  if (!hid) return { ok: false, reason: "Missing post id" };
  if (!HUB_FEATURE_ENABLED) return { ok: false, reason: "Hub is paused" };
  const feed = loadHubFeed();
  const post = feed.find((x) => String(x.id) === hid);
  if (!isHubCloudUuid(hid)) {
    // Local-only placeholder (cloud insert hasn't finished). Just drop it.
    saveHubFeed(feed.filter((x) => String(x.id) !== hid));
    try {
      if ((document.body.getAttribute("data-route") || "") === "hub") renderHub();
      renderHubDots();
      renderProfileHubShared();
    } catch {}
    return { ok: true };
  }

  saveHubFeed(feed.filter((x) => String(x.id) !== hid));
  try {
    if ((document.body.getAttribute("data-route") || "") === "hub") renderHub();
    renderHubDots();
    renderProfileHubShared();
  } catch {}

  let serverOk = false;
  let serverReason = "";
  try {
    const token = getSupabaseAuthToken();
    if (!token) {
      serverReason = "Sign in to manage your Hub posts.";
    } else {
      const r = await fetch(apiUrl("/api/hub/unpublish"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ id: hid }),
      });
      const data = await r.json().catch(() => ({}));
      if (r.ok && data?.ok) {
        serverOk = true;
      } else if (r.status === 401) {
        serverReason = "Sign in expired — sign in again and retry.";
      } else if (r.status === 403) {
        serverReason = "You can only unpublish your own posts.";
      } else if (r.status === 404) {
        // Already gone on the server — treat as success so the UI
        // doesn't restore a row that no longer exists in the cloud.
        serverOk = true;
      } else {
        serverReason = String(data?.error || `Unpublish failed (${r.status}).`);
      }
    }
  } catch (e) {
    serverReason = e?.message || "Network error";
  }

  if (!serverOk) {
    // Roll back: put the post back so the next periodic refresh
    // doesn't quietly reintroduce it (which is exactly what the user
    // saw — disappear, then reappear).
    if (post) {
      const restored = loadHubFeed();
      if (!restored.some((x) => String(x.id) === hid)) {
        restored.push(post);
        restored.sort((a, b) => Number(b.ts || 0) - Number(a.ts || 0));
        saveHubFeed(restored);
        try {
          if ((document.body.getAttribute("data-route") || "") === "hub") renderHub();
          renderHubDots();
          renderProfileHubShared();
        } catch {}
      }
    }
    return { ok: false, reason: serverReason };
  }
  return { ok: true };
}

/** Toggle whether a Hub release appears on the creator's public profile
 *  (`#/u/username`). Does not remove the post from the Hub feed — use
 *  Unpublish for that. Requires full `meta` from the cloud so we never
 *  PATCH a partial object that would wipe server-side keys. */
async function setHubPostProfileVisibility(postId, wantPublic) {
  const hid = String(postId || "").trim();
  if (!HUB_FEATURE_ENABLED || !hid) return { ok: false, reason: "Hub is paused." };
  const token = getSupabaseAuthToken();
  if (!token) return { ok: false, reason: "Sign in to change visibility." };
  const feed = loadHubFeed();
  const local = feed.find((x) => String(x.id) === hid);
  if (!local) return { ok: false, reason: "Song not found." };

  let cloudMeta = null;
  try {
    cloudMeta = await hubFetchPostMetaFull(hid);
  } catch {}
  if (!cloudMeta || typeof cloudMeta !== "object") {
    return {
      ok: false,
      reason: "Could not load this song's cloud metadata. Try again in a moment.",
    };
  }
  const mergedMeta = {
    ...cloudMeta,
    ...(typeof local.meta === "object" && local.meta ? local.meta : {}),
  };
  mergedMeta.profileVisibility = wantPublic ? "public" : "private";

  try {
    await supabasePatchHub(hid, { meta: mergedMeta });
  } catch (e) {
    return { ok: false, reason: e?.message || "Update failed." };
  }

  const next = feed.map((p) =>
    String(p.id) === hid
      ? { ...p, meta: { ...(p.meta || {}), profileVisibility: mergedMeta.profileVisibility } }
      : p,
  );
  saveHubFeed(next);
  try {
    renderProfileHubShared();
  } catch {}
  try {
    if ((document.body.getAttribute("data-route") || "") === "hub") renderHub();
  } catch {}
  return { ok: true };
}

/** Profile → "Songs on Hub" rows: tap plays in mini player; sheet
 *  "Player" opens full Player. CDN-first URL + proxy fallback. */
async function playHubPostFromProfile(postId, opts) {
  const pid = String(postId || "").trim();
  if (!pid) return;
  const p = loadHubFeed().find((x) => String(x.id) === pid);
  if (!p?.url) return;
  closeTrackOptionsSheet();
  try {
    stopHubPlayback();
  } catch {}

  const rawUrl = String(p.url || "").trim();
  let src = hubPlaybackSrcForPost(pid, p);
  if (!src) return;
  const wantFullPlayer = opts?.openPlayer === true;

  currentPlayerTrackRef = {
    id: pid,
    url: rawUrl,
    title: p.title || "Hub song",
    artUrl: p.artUrl || p.creatorAvatar || "",
    meta: p.meta || {},
  };
  miniSource = { type: "profile_hub", postId: pid };
  libraryNowPlayingId = null;

  const meta = {
    title: p.title || "Hub song",
    subtitle: `Hub • @${String(p.creator || "").trim() || "creator"}`,
    artUrl: p.artUrl || p.creatorAvatar || placeholderCoverDataUrl(),
  };

  const applyClipStart = () => {
    const a = ensurePlayer();
    if (p?.meta?.clip && Number.isFinite(Number(p.meta.clip.startSec))) {
      try {
        a.currentTime = Math.max(0, Number(p.meta.clip.startSec));
      } catch {}
    }
  };

  const runFull = async (urlToUse) => {
    setPlayerSource(urlToUse, "Hub");
    setPlayerMeta(meta);
    location.hash = "#/player";
    const a = ensurePlayer();
    await a.play();
    applyClipStart();
    if (els.btnPlayerPlay) els.btnPlayerPlay.disabled = true;
    if (els.btnPlayerPause) els.btnPlayerPause.disabled = false;
  };

  const runMini = async (urlToUse) => {
    setPlayerMeta(meta);
    await playInline(urlToUse, p.title || "Hub song", { type: "profile_hub", postId: pid });
    applyClipStart();
    if (els.btnPlayerPlay) els.btnPlayerPlay.disabled = true;
    if (els.btnPlayerPause) els.btnPlayerPause.disabled = false;
  };

  try {
    if (wantFullPlayer) await runFull(src);
    else await runMini(src);
  } catch (e) {
    const direct = String(src || "");
    if (/^https?:\/\//i.test(direct)) {
      const prox = toAudioProxyUrl(rawUrl);
      if (prox && prox !== direct) {
        try {
          if (wantFullPlayer) await runFull(prox);
          else await runMini(prox);
          return;
        } catch {}
      }
    }
    setStatus(`Playback failed (${e?.name || "error"}). Try again in a moment.`);
  }
}

/** Pagination state for "All releases" on the Profile page. Renders
 *  the first PROFILE_RELEASES_PAGE_SIZE rows; the user reveals more
 *  via the Load more button. Resets whenever the underlying item set
 *  changes (re-login, share, unpublish). */
const PROFILE_RELEASES_PAGE_SIZE = 10;
let _profileReleasesShown = PROFILE_RELEASES_PAGE_SIZE;
function resetProfileReleasesPagination() {
  _profileReleasesShown = PROFILE_RELEASES_PAGE_SIZE;
}

/** Profile → songs on your public link (Hub off): **public Library rows only**.
 *  All saves (public + private) stay on `#/library`; use ⋯ there to toggle visibility. */
function renderProfileLibraryPublicOnLinkSection() {
  if (!els.profileHubSharedList) return;
  const withUrl = loadLibrary().filter((t) => String(t?.url || "").trim());
  const allLib = withUrl.filter((t) => Boolean(t.publicOnProfile));
  allLib.sort((a, b) => Number(b.ts || 0) - Number(a.ts || 0));
  if (_profileReleasesShown < PROFILE_RELEASES_PAGE_SIZE) {
    _profileReleasesShown = PROFILE_RELEASES_PAGE_SIZE;
  }
  if (allLib.length && _profileReleasesShown > allLib.length) {
    _profileReleasesShown = allLib.length;
  }
  const shownCount = Math.min(_profileReleasesShown, allLib.length);
  const rows = allLib.slice(0, shownCount);
  renderProfileOwnStats();
  renderProfileLiquidPulse(rows);
  renderProfileIdentityLine();
  try { renderProfileVoiceTimbreInline(); } catch {}
  renderProfileHeroBio();
  renderProfileHero(rows);
  renderProfileActionRow(rows);
  renderProfileTopWeek(rows);
  try {
    applyProfileAuraVisualTint();
  } catch {}
  const countEl = document.getElementById("profileOwnSongCount");
  if (countEl) {
    const totalSaved = withUrl.length;
    const pubN = allLib.length;
    if (totalSaved) {
      countEl.textContent = pubN
        ? `${pubN} public · ${totalSaved} in library`
        : `0 public · ${totalSaved} in library`;
      countEl.hidden = false;
    } else {
      countEl.textContent = "";
      countEl.hidden = true;
    }
  }
  if (!withUrl.length) {
    els.profileHubSharedList.innerHTML = `
      <div class="emptyState">
        <div class="emptyStateIcon" aria-hidden="true">♪</div>
        <p class="emptyStateTitle">Nothing in Library yet</p>
        <p class="emptyStateHint">Generated songs land in Library. Use ⋯ on a row, then <strong>Show on public profile</strong>.</p>
        <a href="#/library" class="emptyStateCta" data-route-link="library">Open Library</a>
      </div>`;
    return;
  }
  if (!allLib.length) {
    els.profileHubSharedList.innerHTML = `
      <div class="emptyState">
        <div class="emptyStateIcon" aria-hidden="true">◎</div>
        <p class="emptyStateTitle">No public songs on your profile yet</p>
        <p class="emptyStateHint">Your saves stay private until you choose <strong>Show on public profile</strong> from ⋯ on each row in Library.</p>
        <a href="#/library" class="emptyStateCta" data-route-link="library">Open Library</a>
      </div>`;
    return;
  }
  const remaining = Math.max(0, allLib.length - shownCount);
  const loadMoreHtml =
    remaining > 0
      ? `<div class="profileReleasesLoadMoreRow"><button type="button" id="profileReleasesLoadMore" class="profileReleasesLoadMore" aria-label="Load more">Load more<span class="profileReleasesLoadMoreCount">${remaining}</span></button></div>`
      : "";
  const esc = escapeHtml;
  els.profileHubSharedList.innerHTML = `
    <ul class="libraryRows" role="list">
      ${rows
        .map((t) => {
          const safeTitle = esc(String(t.title || "Untitled"));
          const art = String(
            (t.meta && (t.meta.imageThumb || t.meta.imageUrl)) || t.artUrl || "./assets/nabadai-logo.png",
          );
          const dateLabel = formatLibraryDate(t.ts);
          const subBits = [];
          if (dateLabel) subBits.push(`<span class="libRowDot">${esc(dateLabel)}</span>`);
          const tid = esc(String(t.id));
          return `
          <li class="libRow" data-profile-lib-row="${tid}">
            <button class="libRowMain" type="button" data-profile-lib-play="${tid}" aria-label="Play ${safeTitle}">
              <span class="libRowArt">
                <img src="${esc(art)}" alt="" />
                <span class="libRowArtBadge" aria-hidden="true">▶</span>
              </span>
              <span class="libRowInfo">
                <span class="libRowTitle">${safeTitle}</span>
                <span class="libRowSub">${subBits.join("")}</span>
              </span>
              <span class="libRowEq" aria-hidden="true"><span></span><span></span><span></span></span>
            </button>
            <div class="libRowActions">
              ${libRowProfileVisChipHtml(true)}
              <button class="libRowMore" type="button" data-profile-lib-menu="${tid}" aria-label="More for ${safeTitle}">⋯</button>
            </div>
          </li>`;
        })
        .join("")}
    </ul>
    ${loadMoreHtml}
  `;
  const loadMoreBtn = document.getElementById("profileReleasesLoadMore");
  if (loadMoreBtn) {
    loadMoreBtn.addEventListener(
      "click",
      () => {
        _profileReleasesShown += PROFILE_RELEASES_PAGE_SIZE;
        renderProfileHubShared();
      },
      { once: true },
    );
  }
  els.profileHubSharedList.querySelectorAll("[data-profile-lib-play]").forEach((b) => {
    b.addEventListener("click", () => {
      const id = b.getAttribute("data-profile-lib-play");
      const tr = loadLibrary().find((x) => String(x.id) === id);
      if (!tr?.url) return;
      closeTrackOptionsSheet();
      void playLibraryListRowById(id, { openPlayer: false });
    });
  });
  els.profileHubSharedList.querySelectorAll("[data-profile-lib-menu]").forEach((b) => {
    b.addEventListener("click", (e) => {
      e.stopPropagation();
      const id = b.getAttribute("data-profile-lib-menu");
      if (!id) return;
      haptic("light");
      openProfilePublicTrackSheet(id);
    });
  });
  try {
    syncProfileHubSharedRowsFromPlayer();
  } catch {}
}

function renderProfileHubShared() {
  if (!els.profileHubSharedList) return;
  if (!HUB_FEATURE_ENABLED) {
    renderProfileLibraryPublicOnLinkSection();
    return;
  }
  const allItems = getProfileOwnerHubItems();
  if (_profileReleasesShown < PROFILE_RELEASES_PAGE_SIZE) {
    _profileReleasesShown = PROFILE_RELEASES_PAGE_SIZE;
  }
  if (allItems.length && _profileReleasesShown > allItems.length) {
    _profileReleasesShown = allItems.length;
  }
  const shownCount = Math.min(_profileReleasesShown, allItems.length);
  const items = allItems.slice(0, shownCount);
  renderProfileOwnStats();
  // Liquid pulse + identity line + hero bio fire first so the hero is
  // painted before the scrollable music sections.
  renderProfileLiquidPulse(items);
  renderProfileIdentityLine();
  try { renderProfileVoiceTimbreInline(); } catch {}
  renderProfileHeroBio();
  renderProfileHero(items);
  renderProfileActionRow(items);
  renderProfileTopWeek(items);
  // After the hero paints, sample the latest cover art so the header
  // tint matches the music. This is the "page IS the music" thread —
  // the pulse stroke + live dot + share button all inherit this color.
  try { applyProfileAuraVisualTint(); } catch {}
  const countEl = document.getElementById("profileOwnSongCount");
  if (countEl) {
    if (allItems.length) {
      countEl.textContent = `${allItems.length} ${allItems.length === 1 ? "song" : "songs"}`;
      countEl.hidden = false;
    } else {
      countEl.textContent = "";
      countEl.hidden = true;
    }
  }
  if (!allItems.length) {
    if (shouldShowProfileHubSkeleton(items)) {
      const skelRows = [0, 1, 2, 3].map((i) => `
        <li class="libRow libRowSkeleton" style="--libSkelDelay:${(i * 0.08).toFixed(2)}s" aria-hidden="true">
          <button type="button" class="libRowMain" disabled tabindex="-1">
            <span class="libRowArt"><span class="libSkelBlock libSkelArt"></span></span>
            <span class="libRowInfo">
              <span class="libSkelBlock libSkelTitleLine"></span>
              <span class="libSkelBlock libSkelSubLine"></span>
            </span>
          </button>
          <div class="libRowActions">
            <span class="libSkelVis libSkelBlock" aria-hidden="true"></span>
            <span class="libRowMore libSkelMore" aria-hidden="true"></span>
          </div>
        </li>
      `).join("");
      els.profileHubSharedList.innerHTML = `
        <ul class="libraryRows libraryRowsSkeleton" aria-busy="true" aria-label="Loading your releases">
          ${skelRows}
        </ul>
      `;
      return;
    }
    els.profileHubSharedList.innerHTML = !HUB_FEATURE_ENABLED
      ? `
      <div class="emptyState">
        <div class="emptyStateIcon" aria-hidden="true">⏸</div>
        <p class="emptyStateTitle">Public Hub is paused</p>
        <p class="emptyStateHint">We turned off the public feed to save data costs. Your Library and creations are unchanged — sharing here may return later.</p>
        <a href="#/library" class="emptyStateCta" data-route-link="library">Open Library</a>
      </div>
    `
      : `
      <div class="emptyState">
        <div class="emptyStateIcon" aria-hidden="true">♪</div>
        <p class="emptyStateTitle">No songs on Hub yet</p>
        <p class="emptyStateHint">Share a track from your Library or Player and it'll show up here for everyone who lands on your profile.</p>
        <a href="#/library" class="emptyStateCta" data-route-link="library">Open Library</a>
      </div>
    `;
    return;
  }
  const remaining = Math.max(0, allItems.length - shownCount);
  const loadMoreHtml = remaining > 0
    ? `<div class="profileReleasesLoadMoreRow"><button type="button" id="profileReleasesLoadMore" class="profileReleasesLoadMore" aria-label="Load more releases">Load more<span class="profileReleasesLoadMoreCount">${remaining}</span></button></div>`
    : "";
  // Reuse the Library row markup so the visual language stays consistent
  // (cover · title · meta · ▶ badge on hover) and add a ⋯ menu with
  // "Unpublish from Hub" — Profile is the publishing dashboard.
  els.profileHubSharedList.innerHTML = `
    <ul class="libraryRows" role="list">
      ${items.map((p) => {
        const safeTitle = escapeHtml(String(p.title || "Untitled"));
        const art = String(p.artUrl || p.creatorAvatar || "./assets/nabadai-logo.png");
        const dateLabel = relativeTime(p.ts);
        const likes = Number(p.likes || 0);
        const profilePublic = isHubPostVisibleOnPublicProfile(p);
        const subBits = [];
        if (dateLabel) subBits.push(`<span class="libRowDot">${escapeHtml(dateLabel)}</span>`);
        if (likes > 0) {
          subBits.push(`
            <span class="libRowChip libRowChipLikes profileHubLikeChip" aria-hidden="true">
              <svg class="profileHubLikeHeartSvg" viewBox="0 0 24 24" width="14" height="14" focusable="false" aria-hidden="true">
                <path fill="currentColor" d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
              </svg>
              <span class="profileHubLikeCount">${likes}</span>
            </span>`);
        }
        const sid = escapeHtml(String(p.id));
        return `
          <li class="libRow" data-profile-hub-row="${sid}">
            <button class="libRowMain" type="button" data-profile-hub-play="${sid}" aria-label="Play ${safeTitle}">
              <span class="libRowArt">
                <img src="${escapeHtml(art)}" alt="" />
                <span class="libRowArtBadge" aria-hidden="true">▶</span>
              </span>
              <span class="libRowInfo">
                <span class="libRowTitle">${safeTitle}</span>
                <span class="libRowSub">${subBits.join("")}</span>
              </span>
              <span class="libRowEq" aria-hidden="true"><span></span><span></span><span></span></span>
            </button>
            <div class="libRowActions">
              ${libRowProfileVisChipHtml(profilePublic)}
              <button class="libRowMore" type="button" data-profile-hub-menu="${sid}" aria-label="More options for ${safeTitle}">⋯</button>
            </div>
          </li>
        `;
      }).join("")}
    </ul>
    ${loadMoreHtml}
  `;
  const loadMoreBtn = document.getElementById("profileReleasesLoadMore");
  if (loadMoreBtn) {
    loadMoreBtn.addEventListener("click", () => {
      _profileReleasesShown += PROFILE_RELEASES_PAGE_SIZE;
      renderProfileHubShared();
    }, { once: true });
  }
  els.profileHubSharedList.querySelectorAll("[data-profile-hub-play]").forEach((b) => {
    b.addEventListener("click", () => {
      const sid = b.getAttribute("data-profile-hub-play");
      if (!sid) return;
      void playHubPostFromProfile(sid);
    });
  });
  els.profileHubSharedList.querySelectorAll("[data-profile-hub-menu]").forEach((b) => {
    b.addEventListener("click", (e) => {
      e.stopPropagation();
      const sid = b.getAttribute("data-profile-hub-menu");
      if (!sid) return;
      haptic("light");
      openProfileHubPostSheet(sid);
    });
  });
  try {
    syncProfileHubSharedRowsFromPlayer();
  } catch {}
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
  const cloudStableKeys = new Set(cloudSongs.map(libraryTrackStableKey));

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
  const localOnly = merged.filter((row) => {
    if (cloudSigs.has(sigOf(row))) return false;
    if (cloudStableKeys.has(libraryTrackStableKey(row))) return false;
    return true;
  });
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
    // Do not replace a full merged list with a shorter/partial cloud
    // snapshot (RLS hiccup, transient HTTP empty body, etc.) — union by
    // signature so local-only rows stay until the server confirms them.
    const mergedFinal = [];
    const seenFinal = new Set();
    const addFinal = (row) => {
      const s = sigOf(row);
      if (seenFinal.has(s)) return;
      seenFinal.add(s);
      mergedFinal.push(row);
    };
    if (Array.isArray(cloudAfter)) cloudAfter.forEach(addFinal);
    merged.forEach(addFinal);
    mergedFinal.sort((a, b) => Number(b?.ts || 0) - Number(a?.ts || 0));
    saveLibraryFor(uid, mergedFinal);
    saveLibrary(mergedFinal);
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
    const cloudStableKeys = new Set(cloud.map(libraryTrackStableKey));

    const merged = [];
    const seen = new Set();
    const seenStable = new Set(cloud.map(libraryTrackStableKey));
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
          cloudSongId: String(c.id || c.cloudSongId || "").trim(),
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
      const stable = libraryTrackStableKey(t);
      if (cloudSigs.has(sig) || cloudStableKeys.has(stable) || seen.has(sig) || seenStable.has(stable)) {
        continue;
      }
      seen.add(sig);
      seenStable.add(stable);
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
  const taskId = String(track.taskId || "").trim();
  const kind = String(track.kind || "full").trim();
  const duplicate = items.find((x) => {
    const xTaskId = String(x.taskId || "").trim();
    const xUrl = String(x.url || "").trim();
    const xAudioId = String(x.audioId || "").trim();
    const xKind = String(x.kind || "full").trim();
    if (url && xUrl === url) return true;
    if (audioId && xAudioId === audioId && xKind === kind) return true;
    // taskId-only match is reserved for the poll/recover path where the
    // audioId hasn't materialized yet on either side. Suno returns two
    // variants (V1 + V2) sharing one taskId but with distinct audioIds /
    // urls — those must stay as two rows in the Library.
    if (taskId && xTaskId === taskId && !audioId && !xAudioId && xKind === kind) return true;
    return false;
  });
  // Returning the matched entry on duplicate lets callers find the
  // row they want to patch even when the same generation was
  // re-resolved (poll + recover).
  if (duplicate) return duplicate;
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
    publicOnProfile: false,
  };
  items.unshift(newTrack);
  saveLibrary(items);
  renderLibrary();
  void (async () => {
    const ins = await supabaseInsertUserSong(newTrack);
    if (!ins?.ok) {
      setStatus(`Could not save copy to the cloud (${ins.reason}). Song is still saved on this device. ${_lastUserSongInsertFailure || ""}`.slice(0, 280));
      try { renderLibrary(); } catch {}
    }
  })();
  return newTrack;
}
function removeFromLibrary(id) {
  const prev = loadLibrary();
  const removed = prev.find((x) => x.id === id);
  const items = prev.filter((x) => x.id !== id);
  saveLibrary(items);
  renderLibrary();
  if (removed) {
    void supabaseDeleteUserSong(removed);
    // Library is the user's PRIVATE inventory; Hub is PUBLIC. Deleting
    // here only takes the song off this account's Library — any Hub
    // post stays live so the public feed isn't surprise-edited by a
    // private action. To take a song off Hub the user goes to Profile
    // → Songs on Hub → ⋯ → Unpublish from Hub.
  }
}
function parseFilenameFromContentDisposition(cd) {
  const s = String(cd || "").trim();
  if (!s) return "";
  const star = /filename\*\s*=\s*UTF-8''([^;\s]+)/i.exec(s);
  if (star) {
    try {
      return decodeURIComponent(star[1].replace(/\+/g, " "));
    } catch {
      return star[1];
    }
  }
  const q = /filename\s*=\s*"((?:\\.|[^"\\])*)"/i.exec(s);
  if (q) return q[1].replace(/\\"/g, '"');
  const u = /filename\s*=\s*([^;\s]+)/i.exec(s);
  if (!u) return "";
  return u[1].replace(/^"(.*)"$/, "$1");
}

function extensionFromAudioContentType(ct) {
  const c = String(ct || "").toLowerCase().split(";")[0].trim();
  if (c === "audio/mpeg" || c === "audio/mp3") return "mp3";
  if (c === "audio/mp4" || c === "audio/x-m4a") return "m4a";
  if (c === "audio/wav" || c === "audio/x-wav") return "wav";
  if (c === "audio/webm") return "webm";
  return "";
}

/** Fetch the same playable URL as Library playback, then share / save the bytes (native + web). */
async function downloadLibraryAudioTrack(track) {
  const isHttpUrl = (u) => /^https?:\/\//i.test(String(u || "").trim());
  let t = track;
  if (!t?.url) throw new Error("Missing audio URL");

  const rawForPlay = unwrapInnermostHttpAudioUrl(t.url);
  let fetchUrl = normalizeAudioUrlForPlayback(toAudioProxyUrl(rawForPlay) || rawForPlay);
  const refreshed = await tryRefreshLibraryTrackAudioFromSuno(t);
  if (refreshed?.url) {
    const freshInner = String(refreshed.url).trim();
    const newProx = normalizeAudioUrlForPlayback(toAudioProxyUrl(freshInner) || freshInner);
    if (freshInner !== rawForPlay) {
      const updated = patchLibraryRowWithRefreshedUrl(String(t.id), newProx, freshInner, t);
      if (updated) t = updated;
    }
    fetchUrl = newProx;
  }

  if (!isHttpUrl(fetchUrl)) throw new Error("This song isn't downloadable from this device.");

  const trackTitle = String(t?.title || "song").trim() || "song";
  const baseSlug = trackTitle.replace(/[\\/:*?"<>|]/g, "").trim() || "song";

  const r = await fetch(fetchUrl, { method: "GET", cache: "no-store" });
  if (!r.ok) {
    let detail = "";
    try {
      detail = (await r.json())?.error || "";
    } catch {
      try {
        detail = (await r.text()).slice(0, 160);
      } catch {}
    }
    throw new Error(detail ? String(detail).slice(0, 120) : `HTTP ${r.status}`);
  }
  const blob = await r.blob();
  const cdName = parseFilenameFromContentDisposition(r.headers.get("content-disposition"));
  const safeCd =
    cdName &&
    !cdName.includes("/") &&
    !cdName.includes("\\") &&
    cdName.length < 200 &&
    /\.[a-z0-9]{2,5}$/i.test(cdName)
      ? cdName
      : "";
  const fromCt = extensionFromAudioContentType(r.headers.get("content-type"));
  const ext = fromCt ? `.${fromCt}` : ".mp3";
  const filename = safeCd || `${baseSlug}${ext}`;
  await deliverDownloadBlobToDevice(blob, { filename, title: trackTitle, isVideo: false });
}

/** Server-side render (same as player) — canvas `MediaRecorder` fails on iOS WKWebView. */
async function downloadLibraryVideoTrack(track) {
  const isHttpUrl = (u) => /^https?:\/\//i.test(String(u || "").trim());
  let t = track;
  if (!t?.url) throw new Error("Missing audio URL");

  const rawForPlay = unwrapInnermostHttpAudioUrl(t.url);
  let trackUrl = normalizeAudioUrlForPlayback(toAudioProxyUrl(rawForPlay) || rawForPlay);
  const refreshed = await tryRefreshLibraryTrackAudioFromSuno(t);
  if (refreshed?.url) {
    const freshInner = String(refreshed.url).trim();
    const newProx = normalizeAudioUrlForPlayback(toAudioProxyUrl(freshInner) || freshInner);
    if (freshInner !== rawForPlay) {
      const updated = patchLibraryRowWithRefreshedUrl(String(t.id), newProx, freshInner, t);
      if (updated) t = updated;
    }
    trackUrl = newProx;
  }

  const resolvePlaybackUrl = (url) => {
    const n = normalizeAudioUrlForPlayback(String(url || "").trim());
    return isHttpUrl(n) ? n : "";
  };
  const audioUrl = resolvePlaybackUrl(trackUrl);
  if (!audioUrl) throw new Error("This song isn't downloadable. Try opening it from Library again.");

  const trackTitle = String(t?.title || "song").trim() || "song";
  const artCandidates = [t?.meta && t.meta.imageUrl, t?.artUrl];
  const imageUrl = (artCandidates.find((s) => isHttpUrl(s)) || "").trim();

  const endpoint = apiUrl("/api/render-video");
  const r = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      audioUrl,
      ...(imageUrl ? { imageUrl } : {}),
      title: trackTitle,
    }),
  });
  if (!r.ok) {
    let detail = "";
    try {
      detail = (await r.json())?.error || "";
    } catch {}
    throw new Error(detail || `HTTP ${r.status}`);
  }
  const blob = await r.blob();
  const filename = `${trackTitle.replace(/[\\/:*?"<>|]/g, "").trim() || "song"}.mp4`;
  await deliverDownloadBlobToDevice(blob, { filename, title: trackTitle, isVideo: true });
}
async function pollLibraryStemsUntilDone(taskId, kind, opts = {}) {
  const sourceTitle = String(opts.sourceTitle || "").trim();
  const sourceArtUrl = String(opts.sourceArtUrl || "").trim();
  let tries = 0;
  const maxTries = kind === "multi" ? 80 : 60;
  const delayMs = kind === "multi" ? 5000 : 4500;
  while (tries < maxTries) {
    tries += 1;
    await new Promise((r) => setTimeout(r, delayMs));
    try {
      const r = await fetch(apiUrl(`/api/suno/stems_status?taskId=${encodeURIComponent(taskId)}`));
      const data = await r.json().catch(() => ({}));
      if (!r.ok) continue;
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
      const success = String(flag).toUpperCase() === "SUCCESS" || doneByUrls;
      if (!success) {
        if (String(flag).toUpperCase() === "FAILED") {
          const reason =
            data?.data?.message ||
            data?.message ||
            data?.error ||
            `${kind === "multi" ? "Multi-stems" : "Instrumental"} failed.`;
          setStatus(reason);
          setLoading(false);
          return;
        }
        continue;
      }
      if (kind === "multi") {
        printSunoStems(resp);
        if (els.btnMixerLoad) els.btnMixerLoad.disabled = false;
        setStatus("Multi-stems are ready. Load stems into mixer.");
      } else {
        lastSunoVocalUrl = vocalUrl || "";
        lastSunoInstUrl = instrumentalUrl || "";
        lastSunoInstProxyUrl = lastSunoInstUrl ? toAudioProxyUrl(lastSunoInstUrl) : "";
        setLink(els.sunoVocalLink, lastSunoVocalUrl || null);
        setLink(els.sunoInstLink, lastSunoInstProxyUrl || lastSunoInstUrl || null);
        if (els.btnLoadInstrumental) els.btnLoadInstrumental.disabled = !lastSunoInstUrl;
        if (els.btnPlayInstrumental) els.btnPlayInstrumental.disabled = !lastSunoInstUrl;
        setStatus("Instrumental version is ready.");
        const titleBase = sourceTitle || lastSunoTitle || "Generated song";
        const artBase = sourceArtUrl || lastSunoArtUrl || "";
        if (lastSunoInstUrl) {
          addToLibrary({
            title: `${titleBase} • Instrumental`,
            artUrl: artBase,
            url: lastSunoInstProxyUrl || lastSunoInstUrl,
            kind: "instrumental",
          });
        }
      }
      setLoading(false);
      return;
    } catch {}
  }
  setStatus(`${kind === "multi" ? "Multi-stems" : "Instrumental"} is delayed. Please try again.`);
  setLoading(false);
}

/** Globe / lock chip for profile link visibility on library-style rows. */
function libRowProfileVisChipHtml(isPublic) {
  const pub = Boolean(isPublic);
  const cls = pub ? "public" : "private";
  const label = pub ? "Public on your profile link" : "Private — not on profile link";
  const safeLabel = escapeHtml(label);
  const globe =
    '<svg class="libRowVisIco" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="currentColor" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.94-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.45 2.1 1.17 2.83l-1.17 1.1zm6.9.75c-.64-.98-1.02-2.15-1.02-3.43v-3h-2v-2h2V9c0-.46.06-.9.17-1.32L13 5.35V5c0-1.1-.45-2.1-1.17-2.83l1.41-1.41C16.59 3.06 19 7.12 19 12c0 1.79-.44 3.48-1.22 4.97l-1.88-1.29z"/></svg>';
  const lock =
    '<svg class="libRowVisIco" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="currentColor" d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z"/></svg>';
  return `<span class="libRowChip libRowChipProfileVis libRowChipProfileVis--${cls}" role="img" title="${safeLabel}" aria-label="${safeLabel}">${pub ? globe : lock}</span>`;
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

    const menuBtn = target.closest("[data-lib-menu]");
    if (menuBtn && els.libraryList.contains(menuBtn)) {
      e.stopPropagation();
      haptic("light");
      const id = menuBtn.getAttribute("data-lib-menu");
      if (id) openLibraryTrackOptionsFromMenuButton(id);
      return;
    }

    const play = target.closest("[data-lib-play]") || target.closest("[data-lib-row]");
    if (play && els.libraryList.contains(play)) {
      if (target.closest("[data-lib-menu]")) return;
      const id = play.getAttribute("data-lib-play") || play.getAttribute("data-lib-row");
      if (!id) return;
      await playLibraryListRowById(id);
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
 *  quota blocked writes. Disabled in v1 — songs are always synced from
 *  the cloud, so a localStorage cache miss is invisible to the user
 *  and the banner only added confusion. The diagnostic page still has
 *  the underlying free-space tool when we need it. */
function syncLibraryStorageBanner() {
  const b = els.libraryStorageBanner;
  const alt = els.btnLibraryFreeSpaceAlt;
  if (b) b.hidden = true;
  if (alt) alt.hidden = true;
}

/** Shimmer rows that mirror `.libRow` while cloud library hydrate runs
 *  on an empty local cache — replaces the old text-only "Loading…" box. */
function getLibraryHydratingSkeletonHtml() {
  const rowCount = 5;
  const rows = [];
  for (let i = 0; i < rowCount; i++) {
    const delay = `${(i * 0.08).toFixed(2)}s`;
    rows.push(`
      <li class="libRow libRowSkeleton" style="--libSkelDelay:${delay}" aria-hidden="true">
        <button type="button" class="libRowMain" disabled tabindex="-1">
          <span class="libRowArt"><span class="libSkelBlock libSkelArt"></span></span>
          <span class="libRowInfo">
            <span class="libSkelBlock libSkelTitleLine"></span>
            <span class="libSkelBlock libSkelSubLine"></span>
          </span>
        </button>
        <div class="libRowActions">
          <span class="libSkelVis libSkelBlock" aria-hidden="true"></span>
          <span class="libRowMore libSkelMore" aria-hidden="true"></span>
        </div>
      </li>
    `);
  }
  return `
    <div class="librarySkeletonWrap">
      <ul class="libraryRows libraryRowsSkeleton" aria-busy="true" aria-label="Loading library">
        ${rows.join("")}
      </ul>
      <p class="librarySkeletonHint">Pulling your songs from the cloud.</p>
    </div>
  `;
}

/** Library row chrome: the mini player can have this track loaded
 *  (`active`) while paused (`audible` false). Only the EQ + strong
 *  "now playing" treatment should run while audio is actually playing. */
function getLibraryRowPlaybackUiForTrack(trackId) {
  const idStr = String(trackId || "");
  if (miniSource?.type !== "library" || String(miniSource.id || "") !== idStr) {
    return { active: false, audible: false };
  }
  const a = playerEl;
  if (!a) return { active: true, audible: false };
  const dur = getPlayerDuration();
  const cur = Number.isFinite(a.currentTime) ? a.currentTime : 0;
  const audible = !a.paused && !a.ended && (dur > 0 || cur > 0);
  return { active: true, audible };
}

/** Profile → Hub release row matches `miniSource.type === "profile_hub"`. */
function getProfileHubRowPlaybackUi(postId) {
  const sid = String(postId || "");
  if (miniSource?.type !== "profile_hub" || String(miniSource.postId || "") !== sid) {
    return { active: false, audible: false };
  }
  const a = playerEl;
  if (!a) return { active: true, audible: false };
  const dur = getPlayerDuration();
  const cur = Number.isFinite(a.currentTime) ? a.currentTime : 0;
  const audible = !a.paused && !a.ended && (dur > 0 || cur > 0);
  return { active: true, audible };
}

function applyLibRowNowPlayingChrome(row, active, audible) {
  row.classList.toggle("libRowPlaying", audible);
  row.classList.toggle("libRowActive", active && !audible);
  if (audible || active) {
    const img = row.querySelector(".libRowArt img");
    applyCoverGlowRgb(row, img?.getAttribute?.("src") || "");
  } else {
    try {
      row.style.removeProperty("--cover-glow-rgb");
    } catch {}
  }
  const badge = row.querySelector(".libRowArtBadge");
  if (badge) badge.textContent = audible ? "❚❚" : "▶";
  const mainBtn =
    row.querySelector("[data-lib-play]") ||
    row.querySelector("[data-profile-lib-play]") ||
    row.querySelector("[data-profile-hub-play]");
  const titleEl = row.querySelector(".libRowTitle");
  const name = titleEl ? String(titleEl.textContent || "").trim() || "song" : "song";
  if (mainBtn) {
    mainBtn.setAttribute("aria-label", audible ? `Pause ${name}` : `Play ${name}`);
  }
}

function syncLibraryRowsFromPlayer() {
  const route = document.body.getAttribute("data-route") || "";
  if (route !== "library" || !els.libraryList) return;
  const rows = els.libraryList.querySelectorAll(".libRow[data-lib-row]");
  if (!rows.length) return;
  rows.forEach((row) => {
    const id = row.getAttribute("data-lib-row");
    const { active, audible } = getLibraryRowPlaybackUiForTrack(id);
    applyLibRowNowPlayingChrome(row, active, audible);
  });
}

/** Profile releases list reuses `.libRow`; drive EQ / glow / cover badge from `playerEl`. */
function syncProfileHubSharedRowsFromPlayer() {
  const route = document.body.getAttribute("data-route") || "";
  if (route !== "profile" || !els.profileHubSharedList) return;
  els.profileHubSharedList.querySelectorAll(".libRow[data-profile-lib-row]").forEach((row) => {
    const id = row.getAttribute("data-profile-lib-row");
    const { active, audible } = getLibraryRowPlaybackUiForTrack(id);
    applyLibRowNowPlayingChrome(row, active, audible);
  });
  els.profileHubSharedList.querySelectorAll(".libRow[data-profile-hub-row]").forEach((row) => {
    const sid = row.getAttribute("data-profile-hub-row");
    const { active, audible } = getProfileHubRowPlaybackUi(sid);
    applyLibRowNowPlayingChrome(row, active, audible);
  });
}

function renderLibrary() {
  if (!els.libraryList) return;
  try {
    updateLibraryRecoverBanner();
  } catch {}
  // Bind delegated clicks once the list container exists — including empty /
  // loading states — otherwise the first time the user sees rows, none of the
  // ⋯ actions (bottom sheet) fire.
  bindLibraryDelegatedListeners();
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
      els.libraryList.innerHTML = getLibraryHydratingSkeletonHtml();
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
        const { active: libActive, audible: libAudible } = getLibraryRowPlaybackUiForTrack(t.id);
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
        const profilePublic = Boolean(t.publicOnProfile);
        const isFirst = i === 0;
        const loadingAttr = isFirst
          ? `loading="eager" fetchpriority="high"`
          : `loading="lazy" fetchpriority="low"`;
        return `
          <li class="libRow ${libAudible ? "libRowPlaying" : ""}${libActive && !libAudible ? " libRowActive" : ""}" data-lib-row="${t.id}">
            <button class="libRowMain" type="button" data-lib-play="${t.id}" aria-label="${libAudible ? "Pause" : "Play"} ${safeTitle}">
              <span class="libRowArt">
                <img src="${escapeHtml(art)}" alt="" width="56" height="56" decoding="async" ${loadingAttr} />
                <span class="libRowArtBadge" aria-hidden="true">${libAudible ? "❚❚" : "▶"}</span>
              </span>
              <span class="libRowInfo">
                <span class="libRowTitle">${safeTitle}</span>
                <span class="libRowSub">${subBits.join("")}</span>
              </span>
              <span class="libRowEq" aria-hidden="true"><span></span><span></span><span></span></span>
            </button>
            <div class="libRowActions">
              ${libRowProfileVisChipHtml(profilePublic)}
              <button class="libRowMore" type="button" data-lib-menu="${t.id}" aria-label="More options for ${safeTitle}">⋯</button>
            </div>
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
  // means each `renderLibrary()` is just `innerHTML` + the load-more
  // setup above — no per-row `addEventListener` calls. Delegation is
  // attached once at the top of this function via `bindLibraryDelegatedListeners`.
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
if (els.btnLibraryRecover) {
  els.btnLibraryRecover.addEventListener("click", async () => {
    const rec = loadRecoverableGenerationTask();
    const tid = rec?.taskId || "";
    if (!tid) {
      showToast("No saved task on this device. Use “Enter task ID…”.", { icon: "!", durationMs: 3600 });
      return;
    }
    try {
      els.btnLibraryRecover.disabled = true;
      await recoverSongFromTaskId(tid);
    } catch (e) {
      showToast(e?.message || String(e), { icon: "!", durationMs: 6000 });
    } finally {
      els.btnLibraryRecover.disabled = false;
    }
  });
}
if (els.btnLibraryRecoverById) {
  els.btnLibraryRecoverById.addEventListener("click", async () => {
    const raw = window.prompt(
      "Paste the Suno task ID (from your API/Suno log, or the long id from the app debug output):",
      loadRecoverableGenerationTask()?.taskId || ""
    );
    const tid = String(raw || "").trim();
    if (!tid) return;
    try {
      els.btnLibraryRecoverById.disabled = true;
      saveRecoverableGenerationTask(tid, "manual");
      updateLibraryRecoverBanner();
      await recoverSongFromTaskId(tid);
    } catch (e) {
      showToast(e?.message || String(e), { icon: "!", durationMs: 6000 });
    } finally {
      els.btnLibraryRecoverById.disabled = false;
    }
  });
}
if (els.btnLibraryRecoverDismiss) {
  els.btnLibraryRecoverDismiss.addEventListener("click", () => {
    clearRecoverableGenerationTask();
    updateLibraryRecoverBanner();
    showToast("Tip: you can still recover later with “Enter task ID…” if you keep the task id.", {
      icon: "♪",
      durationMs: 4000,
    });
  });
}
// Always-visible header link → reuses the same prompt-by-id path as
// the banner. Available even when no task was captured locally (e.g.
// dismissed before this feature shipped, or recovering on a fresh
// install / different device).
if (els.btnLibraryRecoverLink) {
  els.btnLibraryRecoverLink.addEventListener("click", async () => {
    const seed = loadRecoverableGenerationTask()?.taskId || "";
    const raw = window.prompt(
      "Paste the Suno task ID (from your Suno log or Vercel logs):",
      seed
    );
    const tid = String(raw || "").trim();
    if (!tid) return;
    try {
      els.btnLibraryRecoverLink.disabled = true;
      saveRecoverableGenerationTask(tid, "manual");
      updateLibraryRecoverBanner();
      await recoverSongFromTaskId(tid);
    } catch (e) {
      showToast(e?.message || String(e), { icon: "!", durationMs: 6000 });
    } finally {
      els.btnLibraryRecoverLink.disabled = false;
    }
  });
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
  playerEl.addEventListener("play", () => {
    syncPlayerUI();
    syncLockScreenNowPlaying({ force: true });
  });
  playerEl.addEventListener("pause", () => {
    syncPlayerUI();
    syncLockScreenNowPlaying({ force: true });
  });
  playerEl.addEventListener("play", () => { try { setProfileAuraAudioState(true); } catch {} });
  playerEl.addEventListener("pause", () => { try { setProfileAuraAudioState(isAnyAppAudioPlaying()); } catch {} });
  playerEl.addEventListener("ended", () => {
    if (els.btnPlayerPlay) els.btnPlayerPlay.disabled = false;
    if (els.btnPlayerPause) els.btnPlayerPause.disabled = true;
    try { setProfileAuraAudioState(isAnyAppAudioPlaying()); } catch {}
    try {
      syncPlayerUI();
    } catch {}
  });
  return playerEl;
}

/** True when either Hub or Library audio is currently playing. The
 *  Aura ring uses this on `pause`/`ended` to decide whether to keep
 *  breathing (the *other* source is still playing) or stop. */
function isAnyAppAudioPlaying() {
  const hub = hubAudio && !hubAudio.paused && !hubAudio.ended && hubAudio.currentTime > 0;
  const lib = playerEl && !playerEl.paused && !playerEl.ended && playerEl.currentTime > 0;
  return Boolean(hub || lib);
}

/** Best-effort track duration for the in-app player (see `getAudioDuration`). */
function getPlayerDuration() {
  return getAudioDuration(playerEl);
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
  if (artWrap) {
    artWrap.classList.toggle("isEmpty", !hasTrack);
    applyCoverGlowRgb(artWrap, hasTrack ? artUrl : "");
  }
  if (els.playerArt) els.playerArt.classList.toggle("isPlaceholder", !hasTrack);
  hubNowMeta = {
    title: title || "Now playing",
    art: artUrl || placeholderCoverDataUrl(),
    subtitle: subtitle || "",
  };
  renderHubNowPlaying();
  syncLockScreenNowPlaying({ force: true });
}

// Most recent http(s) URL handed to the player. Used by Download Video
// and Share so they don't depend on which entry point loaded the song
// (Library sets `currentPlayerTrackRef`, but Generate result cards and
// other paths don't).
let lastPlayerHttpUrl = "";

/** Discover / another user's public Library: listen-only — no cover edit,
 *  trim-to-clip, or Hub publish (those flows assume you own the row). */
function playerSourceIsExternalListenOnly() {
  const ms = String(miniSource?.type || "");
  if (ms === "discover_feed" || ms === "public_profile_lib" || ms === "profile_hub") return true;
  const id = String(currentPlayerTrackRef?.id || "");
  if (id.startsWith("public_")) return true;
  return false;
}

function updatePlayerSecondaryChrome() {
  const ro = playerSourceIsExternalListenOnly();
  const row = document.querySelector(".playerSecondaryRow");
  if (row) {
    row.hidden = ro;
    row.classList.toggle("isListenOnlyHidden", ro);
  }
  const card = document.querySelector(".playerCard");
  if (card) card.dataset.readOnlyListen = ro ? "1" : "0";
  if (ro && els.trimSheet) els.trimSheet.style.display = "none";
}

function setPlayerSource(url, label) {
  const a = ensurePlayer();
  a.pause();
  // Heal legacy library URLs (relative `/api/...`) into absolute URLs so the
  // native shell can fetch them. No-op on web.
  const playUrl = normalizeAudioUrlForPlayback(url);
  if (typeof playUrl === "string" && /^https?:\/\//i.test(playUrl)) {
    lastPlayerHttpUrl = playUrl;
  }
  // Only same-origin or blob URLs need crossOrigin for WebAudio/spectrum; forcing
  // "anonymous" on arbitrary Suno CDN URLs breaks playback when ACAO is absent.
  try {
    const u = String(playUrl || "");
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
  resetAudioDurationHintForUrl(playUrl);
  a.src = playUrl;
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
  updatePlayerSecondaryChrome();
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
  // Use apiUrl() so native (Capacitor) gets an absolute URL pointing at the
  // deployed API. Relative `/api/...` resolves to `capacitor://localhost/api/...`
  // on iOS — which nothing serves — and silently breaks all audio playback.
  return apiUrl(`/api/suno/audio?url=${encodeURIComponent(url)}`);
}

/** Normalize an audio URL so it's playable on every surface.
 *
 *  Library entries persisted before the absolute-URL fix saved
 *  `/api/suno/audio?url=…` (relative). On the iOS WebView that resolves
 *  to `capacitor://localhost/api/…` and silently fails. Hub posts from
 *  Supabase can also store relative proxy URLs. Run every audio.src
 *  assignment through this helper so old data heals automatically.
 */
function normalizeAudioUrlForPlayback(url) {
  const s = String(url || "").trim();
  if (!s) return "";
  if (s.startsWith("blob:") || s.startsWith("data:")) return s;
  if (s.startsWith("/api/")) return apiUrl(s);
  // Older entries may have saved the relative proxy without a leading slash.
  if (/^api\/suno\/audio\?/.test(s)) return apiUrl(`/${s}`);
  return s;
}

/** Peel nested `/api/suno/audio?url=` wrappers (never legitimately nested —
 *  only happens when a buggy fallback double-encoded our proxy URL).
 *  Returns the innermost http(s) leaf suitable for `toAudioProxyUrl`.
 */
function unwrapInnermostHttpAudioUrl(url) {
  let cur = String(url || "").trim();
  if (!cur) return "";
  const originBase =
    API_BASE ||
    (typeof location !== "undefined" && location.origin ? location.origin : "") ||
    "https://musician-ai-studio.vercel.app";
  for (let i = 0; i < 8; i++) {
    if (!cur.toLowerCase().includes("api/suno/audio")) break;
    try {
      const u = /^https?:\/\//i.test(cur) ? new URL(cur) : new URL(cur, originBase);
      const inner = u.searchParams.get("url");
      if (!inner) break;
      cur = inner.includes("%") ? decodeURIComponent(inner) : inner;
    } catch {
      break;
    }
  }
  return cur;
}

/** Canonical audio URL for Library ↔ cloud dedupe. Local rows often
 *  persist `…/api/suno/audio?url=…` (playback proxy) while PostgREST
 *  returns raw Suno CDN URLs — string equality on `url` then fails,
 *  reconcile thinks every row is "local-only", and we POST in a loop
 *  → 23505 / 409 spam + multi‑GB egress. */
function libraryTrackCanonicalUrl(url) {
  return unwrapInnermostHttpAudioUrl(String(url || "").trim()).trim();
}

/** Stable identity: canonical URL + kind (matches DB unique intent). */
function libraryTrackStableKey(t) {
  const kind = String(t?.kind || "full").trim();
  return `${libraryTrackCanonicalUrl(t?.url)}|${kind}`;
}

/** `profiles.avatar` may be `data:`, full `https:`, or a path-only
 *  `/storage/v1/...` that must be resolved against `SUPABASE_URL` for
 *  `<img src>` on web and Capacitor. Public `#/u/…` must accept data URLs:
 *  in-browser avatar picks are saved as compressed JPEG data URLs today.
 */
function normalizeProfileAvatarForImg(url) {
  const s = String(url || "").trim();
  if (!s) return "";
  if (s.startsWith("data:") || s.startsWith("blob:")) return s;
  if (s.startsWith("./") || /^\.?\/assets\//i.test(s)) return s;
  if (/^https?:\/\//i.test(s)) return s;
  if (/^\/\//.test(s)) return `https:${s}`;
  const base = String(SUPABASE_URL || "").replace(/\/+$/, "");
  if (!base) return s;
  if (s.startsWith("/storage/") || /^storage\/v1\//i.test(s)) {
    const path = s.startsWith("/") ? s : `/${s}`;
    return `${base}${path}`;
  }
  return s;
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

/** Hub reel `<img>` sources must use the real Storage object URL.
 *  `toCoverThumbUrl()` rewrites to `/storage/v1/render/image/…`, which
 *  only works when Supabase Image Transform is enabled for the project;
 *  otherwise the CDN errors and covers never paint (blur backdrop still
 *  looks like a muddy plate from a failed decode). Library tiles can
 *  keep using thumbs where transforms are known-good. */
function hubCoverImgSrc(url) {
  const s = String(url || "").trim();
  return s || "./assets/nabadai-logo.png";
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
  // Skip the blob cache on native (Capacitor) WKWebView. iOS WebKit has a
  // long-standing bug where `<audio>.src = "blob:..."` silently fails to
  // play roughly every other time — and since `scheduleHubPreloadNext`
  // preloads exactly one row ahead, that produced a textbook alternating
  // "plays / stops / plays / stops" pattern as the user scrolled the feed.
  // The proxy URL is just as fast on cellular (Vercel caches it) and plays
  // reliably, so we always go through the proxy on native.
  if (!isCapacitorNativeAuth()) {
    const cached = hubAudioBlobByPostId.get(postId);
    if (cached) return cached;
  }
  // Use the direct CDN URL when possible to avoid streaming the file through
  // our /api/suno/audio proxy (where every byte counts twice on Vercel
  // bandwidth). The HTML5 <audio> element happily plays cross-origin URLs
  // without a CORS preflight; if direct play fails we fall back to the
  // proxy URL inside startHubPlayback.
  //
  // EXCEPTION: native (Capacitor) WKWebView is finicky about Suno's CDN —
  // some posts stream, others stall silently. Routing every native play
  // through our proxy is consistent and reliable (and we already enforce
  // CORS on the endpoint). Bandwidth cost is acceptable for a small native
  // user base; reliability beats penny-pinching on Vercel egress.
  const raw = String(p?.url || "").trim();
  if (isCapacitorNativeAuth()) {
    if (!raw) return "";
    if (raw.startsWith("blob:") || raw.startsWith("data:")) return raw;
    if (raw.includes("/api/suno/audio")) return raw;
    return toAudioProxyUrl(raw);
  }
  return preferDirectAudioUrl(raw);
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
  // On native, hubPlaybackSrcForPost intentionally ignores cached blob URLs
  // (WKWebView fails on every other blob playback), so preloading them is
  // wasted cellular bytes. The proxy URL stream is fast enough on its own.
  if (isCapacitorNativeAuth()) return;
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

  // Long messages (e.g. upstream Suno error bodies) need extra room
  // and reading time. Anything past ~70 chars gets the multi-line
  // card style and a longer auto-dismiss.
  const isLong = text.length > 70 || /\n/.test(text);
  el.classList.toggle("isLong", isLong);

  el.classList.add("show");
  if (toastDismissTimer) {
    try { clearTimeout(toastDismissTimer); } catch {}
  }
  // Default windows: 2.2s for short, 7s for long. Caller can still
  // override via durationMs but we cap at 12s so the UI never stays
  // stuck behind a forgotten toast.
  const baseDefault = isLong ? 7000 : 2200;
  const ms = Math.max(1200, Math.min(12000, Number(opts?.durationMs) || baseDefault));
  toastDismissTimer = setTimeout(() => {
    el.classList.remove("show");
    el.classList.remove("isLong");
    toastDismissTimer = null;
  }, ms);

  // Tap-to-dismiss for long toasts so the user can clear them on
  // their own schedule once they've finished reading. We rebind
  // each call so the latest text is what's dismissed cleanly.
  el.onclick = () => {
    if (toastDismissTimer) {
      try { clearTimeout(toastDismissTimer); } catch {}
      toastDismissTimer = null;
    }
    el.classList.remove("show");
    el.classList.remove("isLong");
  };
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
  // Same reason as preloadNextHubTrack: blob playback is unreliable on iOS
  // WKWebView, so the cached blob is never read on native — making the
  // preload pure wasted bandwidth there.
  if (isCapacitorNativeAuth()) return;
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
  const a = ensurePlayer();
  const playUrl = normalizeAudioUrlForPlayback(url);
  await primeAudioDurationHint(playUrl);
  await waitForAudioCanPlay(a, 12000);
  try {
    const ok = await hubAudioPlayWithRetry(a);
    if (!ok) throw new Error("play_failed");
    if (els.btnPlayerPlay) els.btnPlayerPlay.disabled = true;
    if (els.btnPlayerPause) els.btnPlayerPause.disabled = false;
  } catch (e) {
    setStatus(`In-app playback failed (${e?.name || "error"}). Tap Open Direct.`);
    try {
      showToast("Playback failed — link may be expired. Try Open Direct or Recover.", {
        icon: "♪",
        durationMs: 4200,
      });
    } catch {}
  }
}

async function playInline(url, label, source) {
  if (!url) return;
  miniSource = source || { type: "player" };
  setPlayerSource(url, label);
  const a = ensurePlayer();
  const playUrl = normalizeAudioUrlForPlayback(url);
  await primeAudioDurationHint(playUrl);
  await waitForAudioCanPlay(a, 12000);
  try {
    const ok = await hubAudioPlayWithRetry(a);
    if (!ok) throw new Error("play_failed");
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
  const dur = getPlayerDuration();
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
  try {
    syncDiscoveryPlayingHighlights();
  } catch {}
  try {
    syncUserPublicFeedPlayingHighlights();
  } catch {}
  try {
    syncLibraryRowsFromPlayer();
  } catch {}
  try {
    syncProfileHubSharedRowsFromPlayer();
  } catch {}
  syncLockScreenNowPlaying();
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

/** Login / OAuth feedback: status strip is often off-screen on `#/auth`; mirror to toast. */
function notifyLoginFeedback(text) {
  const t = String(text || "").trim();
  if (!t) return;
  try {
    if (els.status) els.status.textContent = t;
  } catch {}
  try {
    showToast(t, { durationMs: Math.min(12000, 5200 + t.length * 40) });
  } catch {}
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
function setLoading(on, { title, sub, dismissible } = {}) {
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
  // Dismiss button is sticky once shown — any pending-task UI calls
  // setLoading repeatedly, and we don't want it to flicker. We hide it
  // only when loading itself goes away.
  if (els.btnLoadingDismiss) {
    if (!show) {
      els.btnLoadingDismiss.hidden = true;
    } else if (dismissible === true) {
      els.btnLoadingDismiss.hidden = false;
    }
  }
}

/**
 * Manually clear a stuck "Processing in backend" state. The user can
 * tap the × on the loading bar; we wipe the persisted task id, stop
 * any running poll timer, drop the spinner, and reset the Generate
 * button so they can start fresh. The Suno task itself may still be
 * running on Suno's side — that's fine, the callback path will deposit
 * the song into the library when it lands.
 */
function dismissPendingBackendTask({ silent = false, skipRecoverSave = false } = {}) {
  if (!skipRecoverSave) {
    try {
      const tid = String(sunoTaskId || loadPendingBackendTask() || "").trim();
      if (tid) {
        const hint = String(els.sunoTitle?.value || lastSunoTitle || "").trim();
        saveRecoverableGenerationTask(tid, hint);
      }
    } catch {}
  }
  try {
    if (generatePollTimer) {
      clearInterval(generatePollTimer);
      generatePollTimer = null;
    }
  } catch {}
  try { savePendingBackendTask(""); } catch {}
  try { sunoTaskId = ""; } catch {}
  try {
    if (els.btnSunoGenerate) {
      els.btnSunoGenerate.textContent = "Generate song";
      els.btnSunoGenerate.disabled = false;
      els.btnSunoGenerate.dataset.mode = "generate";
    }
  } catch {}
  try { setGenerateFieldsLocked(false); } catch {}
  // Force the loading bar off regardless of busyCount; this is a hard
  // reset for a stuck overlay so we don't want to be subtle here.
  try {
    busyCount = 0;
    if (els.globalLoading) els.globalLoading.style.display = "none";
    document.body.classList.remove("isBusy");
    if (els.btnLoadingDismiss) els.btnLoadingDismiss.hidden = true;
  } catch {}
  if (!silent) {
    try { setStatus("Cleared. You can start a new generation."); } catch {}
    try {
      showToast(
        "Spinner cleared. Open Library → Recover my song if Suno already finished that generation.",
        { icon: "✓", durationMs: 4500 }
      );
    } catch {}
  }
  try {
    updateLibraryRecoverBanner();
  } catch {}
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

function saveRecoverableGenerationTask(taskId, titleHint) {
  const t = String(taskId || "").trim();
  if (!t) return;
  try {
    localStorage.setItem(
      RECOVERY_TASK_KEY,
      JSON.stringify({
        taskId: t,
        savedAt: Date.now(),
        titleHint: String(titleHint || "").trim().slice(0, 120),
      })
    );
  } catch {}
}

function loadRecoverableGenerationTask() {
  try {
    const raw = localStorage.getItem(RECOVERY_TASK_KEY);
    if (!raw) return null;
    const o = JSON.parse(raw);
    if (!o?.taskId) return null;
    const savedAt = Number(o.savedAt || 0);
    if (!savedAt || Date.now() - savedAt > RECOVERY_MAX_AGE_MS) {
      localStorage.removeItem(RECOVERY_TASK_KEY);
      return null;
    }
    return {
      taskId: String(o.taskId),
      savedAt,
      titleHint: String(o.titleHint || ""),
    };
  } catch {
    return null;
  }
}

function clearRecoverableGenerationTask() {
  try {
    localStorage.removeItem(RECOVERY_TASK_KEY);
  } catch {}
}

/** Shared parser for GET /api/suno/status bodies (same shape generate polling uses). */
function parseSunoGenerationRecordInfo(data) {
  const status = String(data?.data?.status || data?.status || "").toUpperCase();
  const genData = data?.data?.response?.sunoData || data?.data?.response?.suno_data || [];
  const arr = Array.isArray(genData) ? genData : [];
  const pick = (first) => {
    if (!first) return null;
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
      "";
    const title = first?.title || first?.songTitle || first?.song_title || "";
    const audioId =
      first?.id ||
      first?.audioId ||
      first?.audio_id ||
      first?.songId ||
      first?.song_id ||
      "";
    return {
      audioUrl: String(audioUrl || "").trim(),
      imageUrl,
      title: String(title || "").trim(),
      audioId: String(audioId || "").trim(),
    };
  };
  const first = pick(arr[0]);
  const second = pick(arr[1]);
  const hasAudio = Boolean((first && first.audioUrl) || (second && second.audioUrl));
  return { status, first, second, hasAudio };
}

/** If `t` has a Suno `taskId`, re-fetch record-info and return a current
 *  `audioUrl` when status is still SUCCESS. Heals expired CDN links for
 *  older Library rows before playback.
 */
async function tryRefreshLibraryTrackAudioFromSuno(t) {
  const tid = String(t?.taskId || "").trim();
  if (!tid) return null;
  try {
    const r = await fetch(apiUrl(`/api/suno/status?taskId=${encodeURIComponent(tid)}`), {
      cache: "no-store",
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) return null;
    const st = String(data?.data?.status || data?.status || "").toUpperCase();
    if (st !== "SUCCESS") return null;
    const wantAid = String(t?.audioId || "").trim();
    const genData = data?.data?.response?.sunoData || data?.data?.response?.suno_data || [];
    const arr = Array.isArray(genData) ? genData : [];
    const pickClipUrl = (clip) => {
      if (!clip || typeof clip !== "object") return "";
      return String(
        clip.sourceAudioUrl ||
          clip.source_audio_url ||
          clip.sourceStreamAudioUrl ||
          clip.source_stream_audio_url ||
          clip.audioUrl ||
          clip.audio_url ||
          clip.streamAudioUrl ||
          clip.stream_audio_url ||
          "",
      ).trim();
    };
    let fresh = "";
    if (arr.length) {
      if (wantAid) {
        for (const clip of arr) {
          const cid = String(
            clip?.id || clip?.audioId || clip?.audio_id || clip?.songId || clip?.song_id || "",
          ).trim();
          if (cid && cid === wantAid) {
            fresh = pickClipUrl(clip);
            break;
          }
        }
      }
      if (!fresh) fresh = pickClipUrl(arr[0]);
    }
    if (!fresh) {
      const parsed = parseSunoGenerationRecordInfo(data);
      fresh = parsed.first?.audioUrl || parsed.second?.audioUrl || "";
    }
    if (!fresh) return null;
    return { url: fresh };
  } catch {
    return null;
  }
}

/** Persist a refreshed remote URL on the Library row and PATCH cloud `song_url`. */
function patchLibraryRowWithRefreshedUrl(trackId, proxiedUrlForLibrary, rawRemoteUrl, prevTrack) {
  const items = loadLibrary();
  const idx = items.findIndex((x) => String(x.id) === String(trackId));
  if (idx < 0) return null;
  const nextUrl = String(proxiedUrlForLibrary || "").trim();
  if (!nextUrl) return null;
  const row = { ...items[idx], url: nextUrl };
  const next = [...items];
  next[idx] = row;
  try {
    saveLibrary(next);
  } catch {
    return null;
  }
  try {
    renderLibrary();
  } catch {}
  const forCloud = String(rawRemoteUrl || "").trim();
  if (forCloud) {
    void supabasePatchUserSong(prevTrack, { songUrl: forCloud });
  }
  return row;
}

/**
 * Poll Suno once for a completed generation and add tracks to Library.
 * Safe to call after the user dismissed a stuck spinner — the audio may
 * already exist server-side.
 */
async function recoverSongFromTaskId(taskId, { silent = false } = {}) {
  const tid = String(taskId || "").trim();
  if (!tid) throw new Error("Missing task ID.");

  const r = await fetch(apiUrl(`/api/suno/status?taskId=${encodeURIComponent(tid)}`));
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data?.error || "Could not check Suno status.");

  const parsed = parseSunoGenerationRecordInfo(data);
  const st = parsed.status;

  if (st === "FAILED") {
    throw new Error("That generation failed on Suno's side.");
  }

  if (st !== "SUCCESS" || !parsed.hasAudio) {
    if (!silent) {
      showToast(
        "Suno is still processing this task — wait a bit and tap Recover again.",
        { icon: "♪", durationMs: 4200 }
      );
    }
    return false;
  }

  const metaBase =
    lastGenerationMeta && typeof lastGenerationMeta === "object"
      ? { ...lastGenerationMeta }
      : {};
  metaBase.recoveredFromTaskId = tid;
  metaBase.recoveredAt = Date.now();

  if (parsed.first?.audioUrl) {
    const prox = toAudioProxyUrl(parsed.first.audioUrl);
    addToLibrary({
      title: parsed.first.title || "Recovered song",
      artUrl: parsed.first.imageUrl || "",
      url: prox || parsed.first.audioUrl,
      taskId: tid,
      audioId: parsed.first.audioId || "",
      kind: "full",
      meta: metaBase,
    });
  }
  if (parsed.second?.audioUrl) {
    const prox2 = toAudioProxyUrl(parsed.second.audioUrl);
    addToLibrary({
      title: parsed.second.title || "Recovered song B",
      artUrl: parsed.second.imageUrl || "",
      url: prox2 || parsed.second.audioUrl,
      taskId: tid,
      audioId: parsed.second.audioId || "",
      kind: "full",
      meta: metaBase,
    });
  }

  clearRecoverableGenerationTask();
  updateLibraryRecoverBanner();
  if (!silent) {
    showToast("Song added to your Library.", { icon: "✓", durationMs: 3200 });
    try {
      setStatus("Recovered from Suno — check Library.");
    } catch {}
  }
  return true;
}

function updateLibraryRecoverBanner() {
  const wrap = els.libraryRecoverBanner;
  if (!wrap) return;
  const rec = loadRecoverableGenerationTask();
  const hint = els.libraryRecoverHint;
  if (!rec?.taskId) {
    wrap.hidden = true;
    return;
  }
  const lib = loadLibrary();
  const already = lib.some((x) => String(x.taskId || "").trim() === rec.taskId);
  if (already) {
    clearRecoverableGenerationTask();
    wrap.hidden = true;
    return;
  }
  wrap.hidden = false;
  if (hint) {
    const th = rec.titleHint;
    hint.textContent = th
      ? `Saved task · ${th.length > 52 ? `${th.slice(0, 52)}…` : th}`
      : `Task ID ends with …${rec.taskId.slice(-8)}`;
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
  try {
    if (els.btnSunoCredits) els.btnSunoCredits.disabled = true;
    setSunoCreditsNote("updating…");
    const r = await fetch(apiUrl("/api/suno/credits"));
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data?.error || "credits failed");
    const credits = data?.data;
    const num = Number.isFinite(Number(credits)) ? Number(credits) : null;
    sunoCreditsLive = num;
    if (els.sunoCredits) els.sunoCredits.textContent = num != null ? String(num) : "—";
    paintCreditsDisplays();
    setSunoCreditsNote("");
    return num;
  } catch (e) {
    if (creditsState.isAdmin) sunoCreditsLive = null;
    if (els.sunoCredits) els.sunoCredits.textContent = "—";
    paintCreditsDisplays();
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
      if (f) {
        setVocalRefFile(f, `Voice reference attached: ${f.name}`, "upload");
        try { clearRemixSource({ keepRefFile: true }); } catch {}
      } else {
        try {
          clearVocalReferenceSelection({ preserveRemixBanner: true });
        } catch {}
      }
    });
  }
  if (els.btnClearVocalRef) {
    els.btnClearVocalRef.addEventListener("click", () => {
      try {
        clearVocalReferenceSelection({ preserveRemixBanner: true });
      } catch {}
      try {
        showToast("Melody guide cleared.", { durationMs: 2400, icon: "✓" });
      } catch {}
    });
  }
  if (els.remixSourceCancel) {
    els.remixSourceCancel.addEventListener("click", () => {
      try { clearRemixSource({ keepRefFile: false }); } catch {}
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
  // Hum tab is hard-wired to "AI re-sings on a new arrangement" (Suno
  // upload-cover). The Add Instrumental pill was removed — it kept the
  // user's raw hum in the final mix and was confused with the deprecated
  // "voice + band" feature. vocalInstrumentalOnly stays at 0 always.
  if (els.vocalInstrumentalOnly) els.vocalInstrumentalOnly.value = "0";

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
    els.btnRecorderToggle.addEventListener("click", () => void toggleVocalReferenceRecorderFromUi());
  }
  if (els.btnRecorderUse) {
    els.btnRecorderUse.addEventListener("click", () => {
      // The recording is already promoted to currentVocalRefFile in
      // MediaRecorder.onstop. If a stale blob is still around, promote it now
      // as a safety net. Either way, just close the modal.
      if (vocalRefBlob && !currentVocalRefFile) {
        const nm = vocalReferenceFilenameForMime(vocalRefBlob.type);
        const recordedFile = new File(
          [vocalRefBlob],
          nm,
          { type: vocalRefBlob.type || "audio/webm" }
        );
        if (els.sunoVocalUpload) els.sunoVocalUpload.value = "";
        setVocalRefFile(recordedFile, "Voice reference recorded and attached.", "record");
      }
      if (!getVocalReferenceFile()) return;
      closeVocalRecorderModal();
    });
  }

  installModalNoSelectGuards(els.vocalRecorderModal);
  installModalNoSelectGuards(els.callingCardModal);

  // Calling card recorder ----------------------------------------------
  if (els.btnCloseCallingCard) {
    els.btnCloseCallingCard.addEventListener("click", closeCallingCardModal);
  }
  if (els.callingCardBackdrop) {
    els.callingCardBackdrop.addEventListener("click", closeCallingCardModal);
  }
  if (els.btnCallingCardToggle) {
    els.btnCallingCardToggle.addEventListener("click", async () => {
      if (callingCardRecState === "idle") {
        await startCallingCardRecording();
      } else if (callingCardRecState === "recording") {
        stopCallingCardRecording();
      } else if (callingCardRecState === "ready" || callingCardRecState === "playing") {
        await previewOrPauseCallingCard();
      }
    });
  }
  if (els.btnCallingCardSave) {
    els.btnCallingCardSave.addEventListener("click", () => void saveCallingCard());
  }
  if (els.btnCallingCardDiscard) {
    els.btnCallingCardDiscard.addEventListener("click", () => void discardCallingCardDraft());
  }
  if (els.btnCallingCardDelete) {
    els.btnCallingCardDelete.addEventListener("click", () => {
      if (confirm("Remove your calling card? Visitors won’t hear it anymore.")) {
        void deleteExistingCallingCard();
      }
    });
  }
  // Voice note / calling card UI retired. We still suppress iOS's
  // image quick-look on the avatar so a long-press doesn't pop the
  // "Save Image" sheet, but the long-press no longer opens a recorder.
  const avatarWrap = document.getElementById("profileAuraAvatarWrap");
  if (avatarWrap) {
    avatarWrap.addEventListener("contextmenu", (ev) => ev.preventDefault());
  }
  if (els.profilePreviewAvatar) {
    els.profilePreviewAvatar.addEventListener(
      "contextmenu",
      (ev) => ev.preventDefault()
    );
    // Make the <img> not a drag source on desktop browsers.
    els.profilePreviewAvatar.addEventListener(
      "dragstart",
      (ev) => ev.preventDefault()
    );
  }

  // Profile persona card — collapsed by default; tap header to
  // expand the multi-line hint + Open Create CTA. Choice persists
  // across sessions via localStorage.
  if (els.profilePersonaToggle) {
    els.profilePersonaToggle.addEventListener("click", () => {
      const next = !(els.profilePersonaRow?.dataset.expanded === "true");
      setProfilePersonaExpanded(next);
    });
  }

  // Voice-note chip (own + public profiles) — retired. Click handlers
  // are intentionally not wired. The DOM nodes remain hidden via CSS
  // / renderProfileAuraVoiceChip so storage code keeps working.
  // Settings auto-play preference toggle.
  if (els.settingsCallingCardAutoplay) {
    try {
      els.settingsCallingCardAutoplay.checked = isCallingCardAutoplayEnabled();
    } catch {}
    els.settingsCallingCardAutoplay.addEventListener("change", () => {
      setCallingCardAutoplayEnabled(Boolean(els.settingsCallingCardAutoplay.checked));
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

  /**
   * Translate a Suno failure payload into a clear, user-friendly message.
   * Suno reports content-policy rejections (e.g. humming a copyrighted melody)
   * via a few different fields depending on the endpoint and stage:
   *   - successFlag: "SENSITIVE_WORD_ERROR" | "CREATE_TASK_FAILED" | "GENERATE_AUDIO_FAILED" | "CALLBACK_EXCEPTION"
   *   - errorCode  : 400 | 451 | 429 | 413 | 500
   *   - errorMessage / msg / message: free-form text, sometimes contains "copyright" / "fingerprint" / "sensitive"
   *
   * Returns { kind, headline, detail }.
   *   kind = "copyright" | "sensitive" | "tooLong" | "credits" | "transient" | "generic" | null
   */
  function interpretSunoFailure(raw) {
    if (!raw) return { kind: null, headline: "", detail: "" };
    const flag = String(raw.successFlag || raw.flag || "").toUpperCase();
    const code = Number(raw.errorCode || raw.code || 0);
    const msg = String(raw.errorMessage || raw.msg || raw.message || raw.error || "").trim();
    const m = msg.toLowerCase();
    const looksCopyright =
      m.includes("copyright")
      || m.includes("infringe")
      || m.includes("fingerprint")
      || m.includes("rights holder")
      || m.includes("protected song")
      || m.includes("commercial track")
      || m.includes("known song");
    const looksSensitive =
      flag === "SENSITIVE_WORD_ERROR"
      || code === 451
      || m.includes("sensitive")
      || m.includes("policy")
      || m.includes("prohibited")
      || m.includes("explicit content");
    if (looksCopyright) {
      return {
        kind: "copyright",
        headline: "Suno's filter flagged this take — tap Generate again",
        detail:
          "This is almost always a false positive. Suno caches every audio "
          + "upload for ~14 days, and when you record + retry the same melody "
          + "it sometimes matches its own cached fingerprint and rejects it as "
          + "\"copyrighted\".\n\n"
          + "Fix:\n"
          + "• Tap Generate again — we apply a small random pitch/tempo nudge "
          + "to every upload, so the next try sends a fresh fingerprint Suno "
          + "hasn't seen.\n"
          + "• If it keeps failing, re-record (don't reuse the same take) and "
          + "vary the phrasing slightly."
          + (msg ? `\n\nSuno raw: ${msg}` : ""),
      };
    }
    if (looksSensitive) {
      return {
        kind: "sensitive",
        headline: "Couldn't generate — content policy",
        detail:
          "Suno's content policy blocked this request. Please adjust the lyrics, style tags, or vocal reference and try again."
          + (msg ? `\n\nSuno: ${msg}` : ""),
      };
    }
    // 531 with "extending lyrics" almost always means upload-cover ran with
    // empty/missing lyrics — same symptom if user left Full song selected
    // for a hum-only take. Not an instrumental/add-instrumental failure.
    const looksEmptyLyrics531 =
      code === 531
      || (m.includes("extending lyrics") && (m.includes("empty") || m.includes("too short")));
    if (looksEmptyLyrics531) {
      return {
        kind: "needsLyricsOrInstrumental",
        headline: "Wrong mode for hum-only — add lyrics or use Add Instrumental",
        detail:
          "Suno rejected this because Full song mode needs lyrics in the Lyrics box. "
          + "For a melody-only recording, tap Add Instrumental on the Hum tab (no lyrics needed)."
          + (msg ? `\n\nSuno: ${msg}` : ""),
      };
    }
    if (code === 413 || m.includes("too long")) {
      return {
        kind: "tooLong",
        headline: "Couldn't generate — too long",
        detail: "Lyrics or style tags exceeded Suno's length limit. Shorten them and try again."
          + (msg ? `\n\nSuno: ${msg}` : ""),
      };
    }
    if (code === 429 || flag === "INSUFFICIENT_CREDITS" || m.includes("insufficient credit")) {
      return {
        kind: "credits",
        headline: "Couldn't generate — insufficient credits",
        detail: "Your Suno-side budget ran out. Top up credits and try again."
          + (msg ? `\n\nSuno: ${msg}` : ""),
      };
    }
    if (
      flag === "CALLBACK_EXCEPTION"
      || flag === "GENERATE_AUDIO_FAILED"
      || flag === "CREATE_TASK_FAILED"
      || (code >= 500 && code < 600)
    ) {
      return {
        kind: "transient",
        headline: "Generation failed on Suno's side",
        detail: "Suno couldn't complete the task. This is usually a temporary upstream issue — please try again."
          + (msg ? `\n\nSuno: ${msg}` : ""),
      };
    }
    if (flag || msg || code) {
      return {
        kind: "generic",
        headline: "Generation failed",
        detail: msg || `Suno returned ${flag || `code ${code}`}.`,
      };
    }
    return { kind: null, headline: "", detail: "" };
  }

  const fetchGenerationStatus = async () => {
    if (!sunoTaskId) return null;
    const r = await fetch(apiUrl(`/api/suno/status?taskId=${encodeURIComponent(sunoTaskId)}`));
    const data = await r.json().catch(() => ({}));
    // The Suno proxy returns 200 with the full body when Suno itself
    // responded — even when that body contains a failure. Only treat
    // proxy-level transport errors as throwing failures here. Surfacing
    // upstream "failed but no FAILED status" payloads is the job of
    // `interpretSunoFailure` further down.
    if (!r.ok) throw new Error(data?.error || "Status failed");
    const inner = data?.data || data || {};
    const status = String(inner.status || data?.status || "").toUpperCase();
    const successFlag = String(inner.successFlag || data?.successFlag || "").toUpperCase();
    const errorCode = inner.errorCode || data?.errorCode || data?.code || null;
    const errorMessage = String(
      inner.errorMessage
      || data?.errorMessage
      || inner.msg
      || data?.msg
      || ""
    ).trim();
    const genData = inner.response?.sunoData || inner.response?.suno_data || data?.data?.response?.sunoData || data?.data?.response?.suno_data || [];
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
    return {
      status,
      hasAudio: Boolean(lastSunoFullUrl || audioUrl),
      successFlag,
      errorCode,
      errorMessage,
    };
  };

  const handleGenerationFailure = (failureInfo, rawState) => {
    if (generatePollTimer) {
      clearInterval(generatePollTimer);
      generatePollTimer = null;
    }
    setGenerateBtn("Generate song", false, "generate");
    savePendingBackendTask("");
    // Keep the vocal reference intact on failure so the user can retry
    // immediately instead of having to re-record. We only clear it on a
    // *successful* generation (already wired in the SUCCESS branch above).
    setGenerateFieldsLocked(false);
    setLoading(false);
    setProgress(0);
    const info = failureInfo || { kind: "generic", headline: "Generation failed", detail: "" };
    // Dump everything Suno told us into the console so we (and the user)
    // can grab it for debugging. Includes successFlag, errorCode, raw
    // errorMessage, and the taskId so it pairs with Vercel logs.
    try {
      console.warn("[generate] failure", {
        kind: info.kind,
        headline: info.headline,
        detail: info.detail,
        taskId: sunoTaskId || null,
        successFlag: rawState?.successFlag || null,
        errorCode: rawState?.errorCode || null,
        errorMessage: rawState?.errorMessage || null,
      });
    } catch {}
    const fullDetail = [info.headline, info.detail].filter(Boolean).join("\n\n");
    setStatus(`${info.headline}${info.detail ? `: ${info.detail.split("\n")[0]}` : ""}`);
    // Build a toast that surfaces the RAW Suno error too. The friendly
    // interpretation is great when our classifier matches, but when it
    // doesn't (e.g. Suno's underpainting/add-instrumental rejects with a
    // brand-new code we haven't seen) we want the user to see the actual
    // server message so we can debug without a screenshot of the Suno
    // dashboard.
    let toastBody = fullDetail || info.headline || "Generation failed";
    try {
      const rawBits = [];
      if (rawState?.successFlag) rawBits.push(`flag: ${rawState.successFlag}`);
      if (rawState?.errorCode) rawBits.push(`code: ${rawState.errorCode}`);
      if (rawState?.errorMessage) rawBits.push(`msg: ${rawState.errorMessage}`);
      if (sunoTaskId) rawBits.push(`task: ${String(sunoTaskId).slice(0, 12)}…`);
      const rawLine = rawBits.join(" · ");
      if (rawLine && !toastBody.includes(rawLine)) {
        toastBody = `${toastBody}\n\nRaw: ${rawLine}`;
      }
    } catch {}
    try {
      const icon =
        info.kind === "copyright" || info.kind === "sensitive" || info.kind === "needsLyricsOrInstrumental"
          ? "!"
          : "✗";
      showToast(toastBody, {
        icon,
        durationMs: 14000,
      });
    } catch {}
  };

  const startGeneratePolling = () => {
    if (generatePollTimer) clearInterval(generatePollTimer);
    let tries = 0;
    let consecutiveFetchErrors = 0;
    const maxTries = 160; // ~12 minutes at 4.5s interval
    generatePollTimer = setInterval(async () => {
      tries += 1;
      try {
        const state = await fetchGenerationStatus();
        consecutiveFetchErrors = 0;
        if (!state) return;
        // Check for explicit upstream failure flags before status — Suno
        // sometimes keeps `status: PENDING` while signalling rejection via
        // successFlag / errorMessage (esp. for copyright fingerprinting on
        // hummed/uploaded references).
        const failure = interpretSunoFailure(state);
        const failedByFlag =
          failure.kind === "copyright"
          || failure.kind === "sensitive"
          || (failure.kind === "transient" && !!state.errorMessage)
          || (failure.kind && state.successFlag && state.successFlag !== "SUCCESS" && state.successFlag !== "PENDING" && state.successFlag !== "TEXT_SUCCESS" && state.successFlag !== "FIRST_SUCCESS");
        if (failedByFlag && !state.hasAudio) {
          handleGenerationFailure(failure, state);
          return;
        }
        if (state.status === "SUCCESS" && state.hasAudio) {
          clearInterval(generatePollTimer);
          generatePollTimer = null;
          setGenerateBtn("Regenerate", false, "generate");
          showResultCard(true);
          const variantAEntry = addToLibrary({
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
          try {
            const rec = loadRecoverableGenerationTask();
            if (rec?.taskId && String(sunoTaskId || "") === rec.taskId) {
              clearRecoverableGenerationTask();
            }
          } catch {}
          try {
            updateLibraryRecoverBanner();
          } catch {}
          markGenerationReadyNotice();
          // Avoid stale vocal reference leaking into the next generation.
          clearVocalReferenceSelection();
          setGenerateFieldsLocked(false);
          return;
        }
        if (state.status === "FAILED") {
          // FAILED status: try to surface a specific reason. If Suno gave
          // us enough fields to classify (copyright, content, etc.) the
          // toast is detailed; otherwise we fall back to a generic message.
          handleGenerationFailure(
            failure.kind ? failure : { kind: "generic", headline: "Generation failed. Please try again.", detail: state.errorMessage || "" },
            state
          );
          return;
        }
        if (tries >= maxTries) {
          clearInterval(generatePollTimer);
          generatePollTimer = null;
          setGenerateBtn("Check status", false, "resume");
          setStatus("Still processing in backend. Tap Check status.");
          setGenerateFieldsLocked(false);
          setLoading(true, {
            title: "Processing in backend...",
            sub: "You can keep using the app. Tap Check status anytime, or × to clear.",
            dismissible: true,
          });
        }
      } catch (err) {
        consecutiveFetchErrors += 1;
        // Quietly retry transient network blips, but bail with a clear
        // message if the status endpoint has been failing for ~45s — the
        // old code swallowed every error so the spinner stayed forever.
        if (consecutiveFetchErrors >= 10) {
          handleGenerationFailure({
            kind: "transient",
            headline: "Lost connection while checking generation status",
            detail: "We couldn't reach the backend. Tap Generate to try again, or check your network.",
          });
        }
      }
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
        const r = await fetch(apiUrl(`/api/suno/stems_status?taskId=${encodeURIComponent(sunoStemsTaskId)}`));
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
        const r = await fetch(apiUrl(`/api/suno/stems_status?taskId=${encodeURIComponent(sunoMultiStemsTaskId)}`));
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
      setLoading(true, {
        title: "Processing in backend...",
        sub: "Checking latest status...",
        dismissible: true,
      });
      setGenerateBtn("Checking...", true, "resume");
      startGeneratePolling();
      return;
    }
    const promptText = String(els.sunoPrompt?.value || "").trim();
    const vocalRefFile = resolveVocalReferenceForSubmit();
    const hasUploadedReference = Boolean(vocalRefFile);
    // Hum tab is always "AI re-sings on a new arrangement". The
    // add-instrumental ("voice + band") path is gone; Suno upload-cover
    // is the only reference route. If lyrics are empty, Gemini drafts
    // them below before submit so upload-cover never fails with 531.
    const referenceMode = hasUploadedReference ? "vocal_full" : "none";
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
      const referenceInstrumentalOnly = false;
      const hubRemixLocked = Boolean(currentRemixSource?.id);
      const modeLabel = hasReference
        ? hubRemixLocked
          ? "Hub remix (melody / arrangement locked)"
          : "Reference: AI re-sings on new arrangement"
        : "Normal";
      // `engine` reflects who actually wrote the lyrics for this run.
      // Resolved AFTER the Gemini call below so the metadata log is
      // honest. Default is "suno_only" — user wrote the lyrics and we
      // sent them straight to Suno without touching them. Flipped to
      // "gemini_drafted" only when /api/lyrics returned text that we
      // ended up sending to Suno.
      let engine = "suno_only";
      let engineLabel = "Suno";
      setGenerateBtn("Generating…", true, "generate");
      setGenerateFieldsLocked(true);
      showResultCard(false);
      els.btnSunoStems.disabled = true;
      if (els.btnSunoMultiStems) els.btnSunoMultiStems.disabled = true;
      setProgress(5);
      setLoading(true, {
        title: "Processing in backend...",
        sub: "This can take 30–120 seconds.",
        dismissible: true,
      });

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
      // Auto-draft lyrics with Gemini when the user hasn't typed any.
      // Hum-tab requires non-empty lyrics: Suno's upload-cover endpoint
      // returns 531 ("extending lyrics empty") otherwise. Same path works
      // for no-reference generations — Gemini drafts lyrics from style.
      if (!finalPrompt) {
        try {
          setStatus("Preparing prompt with Gemini… (Engine: Gemini assisted + Suno render)");
          const rr = await fetch(apiUrl("/api/lyrics"), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ seed: userPrompt, style: userStyle, mode: "arrange", dialect, dialectHint }),
          });
          const dd = await rr.json().catch(() => ({}));
          if (rr.ok && dd?.lyrics) {
            finalPrompt = sanitizeLyricsPrompt(dd.lyrics);
            engine = "gemini_drafted";
            engineLabel = "Suno + Gemini lyrics draft";
          }
        } catch {}
      }
      setStatus(`Submitting generation… (Mode: ${modeLabel} | Engine: ${engineLabel})`);

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

      const personaIdSel = (els.sunoPersonaId?.value || "").trim();
      // Voice personas only work on V5 (Suno docs). The server will also
      // coerce this defensively; we set it here so the client knows
      // which engine label to display and to keep request → response in
      // sync if a future build exposes a personaModel toggle.
      const personaModelSel = personaIdSel ? "voice_persona" : "";
      const modelForRequest = personaIdSel && personaModelSel === "voice_persona"
        ? "V5"
        : LATEST_SUNO_MODEL;
      if (personaIdSel && modelForRequest !== LATEST_SUNO_MODEL) {
        try {
          showToast(
            "Using V5 for this song so your voice persona can sing it. (Voice personas don't work on V5.5 yet.)",
            { icon: "♪", durationMs: 4200 }
          );
        } catch {}
      }
      const payload = {
        prompt: finalPrompt,
        style: hasReference ? String(userStyle || "").trim() : `${userStyle}${userStyle ? " | " : ""}${timingClause}, ${styleExtras}${artworkStyle ? `, cover art: ${artworkStyle}` : ""}`,
        songKey: mapSolfegeToLetterKey((els.sunoSongKey?.value || "").trim()),
        title: (els.sunoTitle?.value || "").trim(),
        customMode: true,
        instrumental: imageOnlyInstrumental,
        model: modelForRequest,
        personaId: personaIdSel || undefined,
        personaModel: personaModelSel || undefined,
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
      const remixMeta =
        pendingSearchRemixMeta && typeof pendingSearchRemixMeta === "object"
          ? { ...pendingSearchRemixMeta }
          : {};
      pendingSearchRemixMeta = null;
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
        remixOfHubPostId: currentRemixSource?.id || null,
        ...remixMeta,
      };
      if (imageOnlyInstrumental) {
        setStatus("Image-inspired mode with no lyrics detected: generating instrumental.");
      }
      const data = await trackCreditsAround(
        hasReference ? "Suno: upload reference song" : "Suno: generate song",
        async () => {
          if (hasReference) {
            const fd = new FormData();
            const sendFile = resolveVocalReferenceForSubmit();
            if (!sendFile || !sendFile.size) {
              throw new Error(
                "Lost the vocal reference before upload. Tap '+ Audio' or Record again, then Generate."
              );
            }
            // Fingerprint the EXACT bytes we're about to send. We stamp the
            // FormData so the server can echo it back into its logs, and we
            // show the short prefix to the user in the status strip. If two
            // consecutive generations show the SAME fingerprint, we know the
            // recorder handed us cached bytes (not a sticky JS variable).
            const sendFp = await computeBytesFingerprint(sendFile);
            try {
              console.info("[voice] upload fingerprint", {
                size: sendFile.size,
                type: sendFile.type,
                name: sendFile.name,
                fp: sendFp,
                origin: vocalRefOrigin,
                referenceInstrumentalOnly,
              });
            } catch {}
            if (sendFp) {
              const fpShort = sendFp.slice(0, 8);
              const kb = Math.max(1, Math.round(sendFile.size / 1024));
              setStatus(`Uploading voice clip · #${fpShort} (${kb} KB)`);
              // Toast it too — status text gets overwritten by the polling
              // loop within ~1s, so the toast is the only thing the user
              // can actually catch. This is the "did my new bytes leave
              // the phone?" proof point we asked for last round.
              try {
                showToast(`Uploading ${kb} KB · #${fpShort}`, {
                  icon: "↑",
                  durationMs: 5200,
                });
              } catch {}
            }
            fd.append("action", "add_instrumental");
            // Hum tab always routes through Suno upload-cover (AI re-sings on
            // a new arrangement, follows the melody contour of the upload).
            // Hub remix uses song_remix; everything else is vocal_full.
            const stemRefMode = hubRemixLocked ? "song_remix" : "vocal_full";
            fd.append("referenceMode", stemRefMode);
            const uploadBaseName = sendFile?.name || "vocal-reference.webm";
            const uniqueUploadName = `ref-${Date.now()}-${uploadBaseName.replace(/^.*[/\\]/, "")}`;
            fd.append("file", sendFile, uniqueUploadName);
            fd.append("fileName", uniqueUploadName);
            fd.append("fileType", sendFile?.type || "audio/webm");
            if (sendFp) fd.append("clientFingerprint", sendFp);
            fd.append("style", String(userStyle || "").trim());
            if (finalPrompt) fd.append("prompt", String(finalPrompt));
            fd.append(
              "title",
              String((els.sunoTitle?.value || "").trim() || "Reference full song")
            );
            fd.append("model", LATEST_SUNO_MODEL);
            if (payload?.vocalGender) fd.append("vocalGender", String(payload.vocalGender));
            if (payload?.voiceTimbre) fd.append("voiceTimbre", String(payload.voiceTimbre));
            if (payload?.songKey) fd.append("songKey", String(payload.songKey));
            if (timing) fd.append("timing", String(timing));
            if (dialect) fd.append("dialect", String(dialect));
            if (dialectHint) fd.append("dialectHint", String(dialectHint));
            if (payload?.personaId) fd.append("personaId", String(payload.personaId));
            const stemsTok = getSupabaseAuthToken();
            const rr = await fetch(apiUrl("/api/suno/stems"), {
              method: "POST",
              headers: stemsTok ? { Authorization: `Bearer ${stemsTok}` } : undefined,
              body: fd,
            });
            const dd = await rr.json().catch(() => ({}));
            if (rr.status === 402 || dd?.code === "insufficient_credits") {
              const need = Number(dd?.needed ?? 10);
              const have = Number(dd?.balance || 0);
              throw new Error(
                `Not enough credits for this generation (you have ${have}, need ${need}). Open Profile → Credits to redeem a code.`
              );
            }
            if (!rr.ok) {
              const more = dd?.detailMessage || dd?.details?.message || dd?.details?.error || "";
              const upstreamPayload = dd?.details && typeof dd.details === "object" ? dd.details : dd;
              const intent = interpretSunoFailure({
                ...upstreamPayload,
                errorMessage: upstreamPayload?.msg || upstreamPayload?.message || upstreamPayload?.error || more,
              });
              if (intent.kind === "copyright" || intent.kind === "sensitive") {
                const e = new Error(intent.detail);
                e._friendly = intent;
                throw e;
              }
              throw new Error(`${dd?.error || "Reference upload failed"}${more ? `: ${more}` : ""}`);
            }
            if (typeof dd?.code !== "undefined" && Number(dd.code) !== 200) {
              const bodyErr = dd?.msg || dd?.message || dd?.error || "Reference upload failed";
              const intent = interpretSunoFailure(dd);
              if (intent.kind === "copyright" || intent.kind === "sensitive") {
                const e = new Error(intent.detail);
                e._friendly = intent;
                throw e;
              }
              throw new Error(`Suno rejected reference upload: ${bodyErr}`);
            }
            if (dd?.data && typeof dd.data?.code !== "undefined" && Number(dd.data.code) !== 200) {
              const nestedErr = dd?.data?.msg || dd?.data?.message || dd?.data?.error || "Reference upload failed";
              const intent = interpretSunoFailure(dd.data);
              if (intent.kind === "copyright" || intent.kind === "sensitive") {
                const e = new Error(intent.detail);
                e._friendly = intent;
                throw e;
              }
              throw new Error(`Suno rejected reference upload: ${nestedErr}`);
            }
            try {
              if (typeof refreshMyCredits === "function") void refreshMyCredits({ silent: true });
            } catch {}
            // Clear local vocal reference only after Suno accepted the upload —
            // otherwise a failed network/upstream run leaves the user with no
            // attachment for an immediate retry (and looked like "stopped").
            try {
              clearVocalReferenceSelection();
            } catch {}
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
      if (sunoTaskId) {
        saveRecoverableGenerationTask(sunoTaskId, String(els.sunoTitle?.value || "").trim());
      }
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
        try {
          console.warn("[generate] no taskId in response", data);
        } catch {}
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
        try {
          showToast(
            `No task id from Suno — generation did not start.${providerMsg ? ` ${providerMsg}` : ""}`,
            { icon: "⚠", durationMs: 9000 }
          );
        } catch {}
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
      const friendly = e?._friendly;
      if (friendly) {
        setStatus(`${friendly.headline}: ${(friendly.detail || "").split("\n")[0]}`);
        try {
          showToast(
            [friendly.headline, friendly.detail].filter(Boolean).join("\n\n"),
            {
              icon: "!",
              durationMs: friendly.kind === "copyright" || friendly.kind === "sensitive" ? 12000 : 8000,
            }
          );
        } catch {}
      } else {
        setStatus(`Generation failed: ${e?.message || String(e)}`);
        try {
          showToast(String(e?.message || e || "Generation failed"), { icon: "✗", durationMs: 8000 });
        } catch {}
      }
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

  // "Save voice as persona" — placed in the result card's more-menu so the
  // user sees it the moment a song finishes, not buried in Advanced Options.
  const btnResultPersona = document.getElementById("btnResultPersona");
  const btnResultPersona2 = document.getElementById("btnResultPersona2");
  if (btnResultPersona) {
    btnResultPersona.addEventListener("click", async (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      haptic("light");
      if (!sunoTaskId || !sunoAudioId) {
        showToast("Wait until your song fully finishes, then try again.", { icon: "!", durationMs: 3600 });
        return;
      }
      try {
        btnResultPersona.disabled = true;
        await createPersonaForSong({
          taskId: sunoTaskId,
          audioId: sunoAudioId,
          audioUrl: lastSunoProxyUrl || lastSunoFullUrl,
          title: lastSunoTitle,
          style: els.sunoStyle?.value || lastGenerationMeta?.style,
          voiceProfile: els.sunoVoiceProfile?.value || lastGenerationMeta?.voiceProfile,
          dialect: els.sunoDialect?.value || lastGenerationMeta?.dialect,
          timbre: activeProfile?.voiceTimbre,
          source: "result",
        });
      } finally {
        btnResultPersona.disabled = false;
      }
    });
  }
  if (btnResultPersona2) {
    btnResultPersona2.addEventListener("click", async (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      haptic("light");
      if (!sunoTaskId || !lastSunoAudioId2) {
        showToast("Wait until version B fully finishes, then try again.", { icon: "!", durationMs: 3600 });
        return;
      }
      try {
        btnResultPersona2.disabled = true;
        await createPersonaForSong({
          taskId: sunoTaskId,
          audioId: lastSunoAudioId2,
          audioUrl: lastSunoProxyUrl2 || lastSunoFullUrl2,
          title: lastSunoTitle2 || lastSunoTitle,
          style: els.sunoStyle?.value || lastGenerationMeta?.style,
          voiceProfile: els.sunoVoiceProfile?.value || lastGenerationMeta?.voiceProfile,
          dialect: els.sunoDialect?.value || lastGenerationMeta?.dialect,
          timbre: activeProfile?.voiceTimbre,
          source: "result",
        });
      } finally {
        btnResultPersona2.disabled = false;
      }
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
  // Previously this only set the UI to "Tap Check status" and waited
  // for a manual click — meaning a user who closed the app mid-poll
  // came back to a perpetual "Processing..." screen. Now we kick off
  // polling immediately AND show a dismiss button so the user can
  // bail out if it actually completed long ago and just got stuck.
  const bootPendingTask = loadPendingBackendTask();
  if (bootPendingTask && !generatePollTimer) {
    sunoTaskId = bootPendingTask;
    setGenerateBtn("Checking…", true, "resume");
    setStatus("Pending backend task found. Reconnecting…");
    setLoading(true, {
      title: "Reconnecting to your last song…",
      sub: "If this lingers, tap × to clear and try again.",
      dismissible: true,
    });
    try { startGeneratePolling(); } catch {}
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
          const stemsTok = getSupabaseAuthToken();
          const r = await fetch(apiUrl("/api/suno/stems"), {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...(stemsTok ? { Authorization: `Bearer ${stemsTok}` } : {}),
            },
            body: JSON.stringify({ taskId: sunoTaskId, audioId: sunoAudioId, type: "separate_vocal" }),
          });
          const d = await r.json().catch(() => ({}));
          if (r.status === 402 || d?.code === "insufficient_credits") {
            const need = Number(d?.needed ?? 2);
            const have = Number(d?.balance || 0);
            throw new Error(
              `Not enough credits to extract vocals (you have ${have}, need ${need}). Open Profile → Credits to redeem a code.`
            );
          }
          if (!r.ok) throw new Error(d?.error || "Stem request failed");
          try {
            if (typeof refreshMyCredits === "function") void refreshMyCredits({ silent: true });
          } catch {}
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
            const stemsTok = getSupabaseAuthToken();
            const r = await fetch(apiUrl("/api/suno/stems"), {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                ...(stemsTok ? { Authorization: `Bearer ${stemsTok}` } : {}),
              },
              body: JSON.stringify({ taskId: sunoTaskId, audioId: sunoAudioId, type: "split_stem" }),
            });
            const d = await r.json().catch(() => ({}));
            if (r.status === 402 || d?.code === "insufficient_credits") {
              const need = Number(d?.needed ?? 2);
              const have = Number(d?.balance || 0);
              throw new Error(
                `Not enough credits to split stems (you have ${have}, need ${need}). Open Profile → Credits to redeem a code.`
              );
            }
            try {
              if (typeof refreshMyCredits === "function") void refreshMyCredits({ silent: true });
            } catch {}
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
try {
  syncVocalReferenceFromDom();
} catch {}
window.addEventListener("pageshow", (ev) => {
  // iOS PWA bfcache restore can resurrect stale File objects + input state.
  if (!ev.persisted) return;
  try {
    clearVocalReferenceSelection({ preserveRemixBanner: false });
  } catch {}
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

// Double-tap-to-confirm "Start a new song" reset. window.confirm() is
// unreliable inside an iOS PWA (and was getting users stuck with a
// half-reset page), so we use a toast + visual-armed pattern: first
// tap arms, second tap within 3s actually resets.
//
// Wired to two surfaces:
//  - The brand title (shown only on Hub / Intro / Auth — historical UX).
//  - The "↺ New" pill on the Generate page (the primary surface now that
//    the title is hidden everywhere else; replaces the old double-click
//    title gesture that disappeared with the header collapse).
let _newSongResetArmedAt = 0;
const NEW_SONG_ARM_WINDOW_MS = 3000;
const _btnNewSong = document.getElementById("btnNewSong");
function armNewSongReset(srcEl) {
  _newSongResetArmedAt = Date.now();
  try { srcEl?.classList?.add?.("isArmed"); } catch {}
  try {
    if (typeof showToast === "function") {
      showToast("Tap again to start a new song", { icon: "↺", durationMs: 2800 });
    }
  } catch {}
  // Auto-disarm after the window so the button doesn't stay red forever.
  setTimeout(() => {
    if (Date.now() - _newSongResetArmedAt >= NEW_SONG_ARM_WINDOW_MS) {
      _newSongResetArmedAt = 0;
      try { srcEl?.classList?.remove?.("isArmed"); } catch {}
    }
  }, NEW_SONG_ARM_WINDOW_MS + 50);
}
function performNewSongReset(srcEl) {
  _newSongResetArmedAt = 0;
  try { srcEl?.classList?.remove?.("isArmed"); } catch {}
  try { resetCreateDraft(); } catch (err) {
    console.error(err);
    // Last-resort safety net: even if the reset throws, never leave the
    // page locked. Strip the locking class and re-enable the generate btn.
    try { document.body.classList.remove("generateLocked"); } catch {}
    try { document.body.classList.remove("isBusy"); } catch {}
    if (els.btnSunoGenerate) {
      els.btnSunoGenerate.disabled = false;
      els.btnSunoGenerate.textContent = "Generate song";
    }
  }
}
if (_btnNewSong) {
  _btnNewSong.addEventListener("click", () => {
    try { haptic?.("light"); } catch {}
    performNewSongReset(_btnNewSong);
    try {
      if (typeof showToast === "function") {
        showToast("Started a fresh draft", { icon: "↺", durationMs: 1800 });
      }
    } catch {}
  });
}
if (els.brandTitle) {
  els.brandTitle.addEventListener("click", () => {
    const route = document.body.getAttribute("data-route") || "";
    if (route !== "generate") {
      location.hash = "#/generate";
      return;
    }
    const isArmed =
      _newSongResetArmedAt &&
      Date.now() - _newSongResetArmedAt <= NEW_SONG_ARM_WINDOW_MS;
    if (!isArmed) {
      armNewSongReset(_btnNewSong);
      return;
    }
    try {
      performNewSongReset(_btnNewSong);
    } catch (err) {
      console.error(err);
      try { document.body.classList.remove("generateLocked"); } catch {}
      try { document.body.classList.remove("isBusy"); } catch {}
      if (els.btnSunoGenerate) {
        els.btnSunoGenerate.disabled = false;
        els.btnSunoGenerate.textContent = "Generate song";
      }
    }
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
  // Egress saver: only do the boot Hub fetch when the user actually
  // landed on (or will land on) the Hub. Otherwise wait until they tap
  // the tab — `applyRoute` already triggers `refreshHubFromSupabase`
  // on entry to `#/hub`.
  const route0 = document.body.getAttribute("data-route") || "";
  if (route0 === "hub") {
    await refreshHubFromSupabase();
  }
  startHubLiveSync();
})();
window.addEventListener("focus", () => {
  if ((document.body.getAttribute("data-route") || "") !== "hub") return;
  void refreshHubFromSupabase();
});
document.addEventListener("visibilitychange", () => {
  if (document.hidden) return;
  if ((document.body.getAttribute("data-route") || "") !== "hub") return;
  void refreshHubFromSupabase();
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
/** Hub wordmark = scroll to top. Replaces the old Latest pill on the
 *  reel route. We still mark the Latest category seen so the unseen
 *  dot clears immediately on tap (same UX as visiting the tab). */
if (els.hubBrand) {
  els.hubBrand.addEventListener("click", () => {
    try { markHubCategorySeen("latest"); } catch {}
    try { renderHubDots(); } catch {}
    scrollHubFeedToTop();
  });
}
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
/** Smart-pick scroll for the Hub tab tap. Lands the user on the first
 *  post they haven't watched yet (60% viewport for >=1s = "watched").
 *  Falls back to top when:
 *    - The feed is empty (nothing to pick).
 *    - The user has seen every visible post (caught up).
 *    - The first unseen *is* the top — `scrollIntoView` from row 0 to
 *      row 0 would be a no-op; the explicit top-jump animates nicely.
 *  Why centralize this: applyRoute (Hub entry from another tab) and
 *  the Hub tab single-tap handler both need the same logic. */
function scrollHubFeedToUnseenOrTop() {
  if (!els.hubList) {
    scrollHubFeedToTop();
    return;
  }
  const items = loadHubFeed();
  if (!items.length) {
    scrollHubFeedToTop();
    return;
  }
  const unseenId = getFirstUnseenHubPostId(items);
  if (!unseenId || String(items[0]?.id || "") === unseenId) {
    scrollHubFeedToTop();
    return;
  }
  const sel = `[data-hub-row="${(window.CSS && CSS.escape) ? CSS.escape(unseenId) : unseenId.replace(/"/g, '\\"')}"]`;
  const el = els.hubList.querySelector(sel);
  if (!el) {
    scrollHubFeedToTop();
    return;
  }
  // Tell the autoplay observer to back off briefly so the snap animation
  // can land without a mid-scroll play()/pause() flicker on the rows
  // we're sweeping past.
  try { suppressHubViewportAutoplayFor(1800); } catch {}
  // scrollIntoView walks every scrollable ancestor; works whether the
  // hubList itself is scrollable or the window is (CSS varies by route).
  try {
    el.scrollIntoView({ behavior: "smooth", block: "start" });
  } catch {
    el.scrollIntoView();
  }
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
  suppressHubViewportAutoplayFor(8000);

  hubJumpUserGestureHandler = () => {
    endHubJumpGuard();
  };
  try {
    window.addEventListener("touchstart", hubJumpUserGestureHandler, { once: true, passive: true });
    window.addEventListener("pointerdown", hubJumpUserGestureHandler, { once: true, passive: true });
    window.addEventListener("wheel", hubJumpUserGestureHandler, { once: true, passive: true });
    window.addEventListener("keydown", hubJumpUserGestureHandler, { once: true, passive: true });
  } catch {}

  const onHubRoute = (document.body.getAttribute("data-route") || "") === "hub";
  const listRoot = onHubRoute && els.hubList ? els.hubList : null;

  // Hub reel scrolls `#hubList`, not `window` — `window.scrollY` stays ~0
  // so the old path never moved the feed. Animate `listRoot.scrollTop`.
  if (listRoot) {
    const start = listRoot.scrollTop || 0;
    let reducedMotion = false;
    try {
      reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    } catch {}
    if (start <= 2 || reducedMotion) {
      listRoot.scrollTop = 0;
      return;
    }
    const animDurationMs = 320;
    const t0 = performance.now();
    const easeOutCubic = (u) => 1 - (1 - u) ** 3;
    const tick = (now) => {
      const elapsed = now - t0;
      const u = Math.min(1, elapsed / animDurationMs);
      const y = Math.round(start * (1 - easeOutCubic(u)));
      listRoot.scrollTop = y;
      if (u < 1) {
        hubJumpToTopRaf = requestAnimationFrame(tick);
      } else {
        hubJumpToTopRaf = 0;
        listRoot.scrollTop = 0;
      }
    };
    hubJumpToTopRaf = requestAnimationFrame(tick);
    return;
  }

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
    // Tab tap from elsewhere → just navigate. Audio unlock is handled
    // by the global one-shot listener (`installHubAudioUnlockOnce`),
    // which fires on this same gesture before anything async runs;
    // applyRoute("hub") then uses scroll-driven autoplay to start the
    // first centered post — same code path Latest and Trending share.
    //
    // Smart-pick (jump-to-first-unseen) was reverted in 20260514hubSmartPickOff
    // — once a post was seen it stayed seen across sessions, so the tap
    // could land 3 posts deep with unseen content above. Helpers
    // (`scrollHubFeedToUnseenOrTop`, seen-set tracking) are still
    // defined but dormant; revisit when we have a smarter ruleset
    // (e.g. session-scoped or like-based).
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
        await refreshHubFromSupabase({ force: true });
        setStatus("Hub refreshed.");
        requestAnimationFrame(() => scrollHubFeedToTop());
      }
      hubTapCount = 0;
    }, 250);
  });
}
if (els.hubNowClose) {
  els.hubNowClose.addEventListener("click", (e) => {
    try {
      e.stopPropagation();
    } catch {}
    const mutedId = hubAudioPostId;
    stopHubPlayback();
    if (mutedId) hubAutoplayMutedPostId = mutedId;
  });
}
if (els.hubNowPlayPause && !els.hubNowPlayPause.dataset.boundHubPp) {
  els.hubNowPlayPause.dataset.boundHubPp = "1";
  els.hubNowPlayPause.addEventListener("click", (e) => {
    try {
      e.preventDefault();
      e.stopPropagation();
    } catch {}
    const a = getMiniPlayerAudio();
    if (!a) return;
    haptic("light");
    try {
      if (a.paused || a.ended) void a.play();
      else a.pause();
    } catch {}
    try {
      syncPlayerUI();
    } catch {}
    try {
      renderHubNowPlaying();
    } catch {}
  });
}
if (els.hubNowExpand && !els.hubNowExpand.dataset.boundHubExp) {
  els.hubNowExpand.dataset.boundHubExp = "1";
  els.hubNowExpand.addEventListener("click", (e) => {
    try {
      e.preventDefault();
      e.stopPropagation();
    } catch {}
    haptic("light");
    if (miniSource?.type === "discover_feed" && _discoveryFeedTracks.length) {
      void playRandomDiscoveryFeedTrack(currentPlayerTrackRef?.url);
      return;
    }
    if (miniSource?.type === "public_profile_lib" && _userPublicFeedTracks.length) {
      void playRandomUserPublicFeedTrack(currentPlayerTrackRef?.url);
      return;
    }
    try {
      location.hash = "#/player";
    } catch {}
  });
}
if (els.hubNowPlaying) {
  els.hubNowPlaying.addEventListener("click", (e) => {
    if (e.target?.closest?.(".hubNowIconBtn")) return;
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
  const route = document.body.getAttribute("data-route") || "";
  // Hub reel scrolls inside `#hubList` — `window` does not move. All Hub
  // scroll-driven updates are on `hubList` (see `wireHubReelObserver`).
  if (route === "hub") {
    if (hubAudio) scheduleRenderHubNowPlaying();
    return;
  }
  if (hubAudio) scheduleRenderHubNowPlaying();
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
// Hub sync on `#/hub` / `#/u/…` is driven by `applyRoute` only — a
// duplicate hashchange listener used to double-call `refreshHubFromSupabase`.

// Refresh credits when Profile / Credits / Sounds open. `refreshMyCredits`
// pulls the Supabase ledger; for admin users it also triggers
// `refreshAdminCreditsView`, which seeds `sunoCreditsLive` for the pill.
window.addEventListener("hashchange", () => {
  const route = document.body.getAttribute("data-route") || "";
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
  location.hash = HUB_FEATURE_ENABLED ? "#/hub" : "#/generate";
});
if (els.proofBackdrop) els.proofBackdrop.addEventListener("click", closeProofModal);
if (els.btnCloseProof) els.btnCloseProof.addEventListener("click", closeProofModal);
if (els.btnDownloadProof) {
  els.btnDownloadProof.addEventListener("click", () => {
    if (!currentProofPost) return;
    if (!isProofPostOwner(currentProofPost)) {
      // Defensive: the button is hidden for non-owners but a manual
      // click via DevTools would otherwise still print. Stay
      // consistent with the gating model.
      showToast?.("Only the creator can print the full record.", { durationMs: 3200 });
      return;
    }
    const ts = currentProofPost?.ts ? new Date(currentProofPost.ts) : new Date();
    const fp = proofFingerprintText(currentProofPost) || "—";
    const comp = buildProofComposition(currentProofPost);
    const engine = buildProofEngineLabel(currentProofPost);
    const mode = String(currentProofPost?.proof?.mode || currentProofPost?.kind || "full");
    const compRow = (label, value) => value
      ? `<p style="margin:10px 0"><strong style="color:rgba(232,238,247,0.46);font-size:11px;text-transform:uppercase;letter-spacing:0.08em;">${escapeHtml(label)}</strong><br/><span style="font-size:14px;">${escapeHtml(value)}</span></p>`
      : "";
    const html = `
      <!DOCTYPE html>
      <html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
      <title>NabadAi — Proof of creation</title></head>
      <body style="margin:0;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;background:#12151e;color:#e7edf7;padding:28px 18px;line-height:1.45;">
        <div style="max-width:520px;margin:0 auto;border:1px solid rgba(124,92,255,0.32);border-radius:18px;padding:26px 22px;background:linear-gradient(180deg,rgba(18,28,44,0.92),rgba(8,12,20,0.96));box-shadow:0 22px 52px rgba(0,0,0,0.48);">
          <h1 style="margin:0 0 4px;font-size:26px;font-weight:900;letter-spacing:-0.03em;background:linear-gradient(135deg,rgba(124,92,255,0.98),rgba(35,213,171,0.92));-webkit-background-clip:text;background-clip:text;color:transparent;">NabadAi</h1>
          <p style="margin:0 0 18px;font-size:11px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:rgba(231,237,247,0.52);">Proof of creation</p>
          <p style="margin:0 0 16px;color:rgba(232,238,247,0.72);font-size:14px;">This record confirms this musical work was created on NabadAi with the metadata below.</p>
          ${compRow("Track", currentProofPost.title || "Untitled")}
          ${compRow("Creator", "@" + String(currentProofPost.creator || "guest").replace(/^@/, ""))}
          <p style="margin:10px 0"><strong style="color:rgba(232,238,247,0.46);font-size:11px;text-transform:uppercase;letter-spacing:0.08em;">Recorded</strong><br/><span style="font-size:14px;">${escapeHtml(ts.toLocaleString())}</span><br/><span style="font-size:12px;color:rgba(232,238,247,0.45);">UTC ${escapeHtml(ts.toISOString())}</span></p>
          ${comp.lyrics || comp.inspiration || comp.persona || comp.style
            ? `<h2 style="margin:18px 0 6px;font-size:13px;font-weight:800;letter-spacing:0.08em;text-transform:uppercase;color:rgba(232,238,247,0.62);">Composition</h2>
               ${compRow("Lyrics", comp.lyrics)}
               ${compRow("Inspiration", comp.inspiration)}
               ${compRow("Persona", comp.persona)}
               ${compRow("Style", comp.style)}`
            : ""}
          <h2 style="margin:18px 0 6px;font-size:13px;font-weight:800;letter-spacing:0.08em;text-transform:uppercase;color:rgba(232,238,247,0.62);">Technical</h2>
          ${compRow("Engine", engine)}
          ${compRow("Mode", mode)}
          <p style="margin:14px 0 0;padding:12px 14px;border-radius:10px;background:rgba(0,0,0,0.42);border:1px solid rgba(255,255,255,0.08);font-size:12px;word-break:break-all;"><strong style="display:block;margin-bottom:6px;color:rgba(232,238,247,0.46);font-size:11px;text-transform:uppercase;letter-spacing:0.08em;">Fingerprint</strong>${escapeHtml(fp)}</p>
          <p style="margin:18px 0 0;font-size:11px;text-align:center;color:rgba(232,238,247,0.42);">Verified by NabadAi · Build ${escapeHtml(APP_BUILD)}</p>
        </div>
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
if (els.btnProofShareImg) els.btnProofShareImg.addEventListener("click", () => void shareProofCertificateImage());
if (els.btnProofCopyFp) els.btnProofCopyFp.addEventListener("click", copyProofFingerprint);

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
      location.hash = HUB_FEATURE_ENABLED ? "#/hub" : "#/generate";
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
    const resolvePlaybackUrl = (s) => {
      const t = String(s || "").trim();
      if (!t) return "";
      const n = normalizeAudioUrlForPlayback(t);
      return isHttpUrl(n) ? n : "";
    };
    // Prefer the URL last handed to the audio element (normalized proxy on
    // native) so Discover / public Library and Library-relative `/api/…`
    // rows all resolve the same way as playback.
    const candidates = [
      lastPlayerHttpUrl,
      currentPlayerTrackRef?.url,
      currentPlayerTrackRef?.audioUrl,
      currentPlayerTrackRef?.song_url,
      lastSunoFullUrl,
      lastSunoProxyUrl,
      lastSunoFullUrl2,
      lastSunoProxyUrl2,
      playerEl?.src,
    ];
    const trackUrl = candidates.map(resolvePlaybackUrl).find(Boolean) || "";
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
      els.playerArt?.src,
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
      const endpoint = apiUrl("/api/render-video");
      const r = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          audioUrl: trackUrl,
          ...(trackArt && isHttpUrl(trackArt) ? { imageUrl: trackArt } : {}),
          title: trackTitle,
        }),
      });
      if (!r.ok) {
        let detail = "";
        try { detail = (await r.json())?.error || ""; } catch {}
        throw new Error(detail || `HTTP ${r.status}`);
      }
      const blob = await r.blob();
      const filename = `${trackTitle.replace(/[\\/:*?"<>|]/g, "").trim() || "song"}.mp4`;
      await deliverDownloadBlobToDevice(blob, { filename, title: trackTitle, isVideo: true });
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
    if (!HUB_FEATURE_ENABLED) {
      showToast("Hub sharing is paused.", { durationMs: 3200 });
      return;
    }
    if (!currentPlayerTrackRef?.url) {
      setStatus("Open a library song first, then publish a clip.");
      return;
    }
    const a = ensurePlayer();
    const range = clampClipRange(
      Number(els.clipStartSec?.value || 0),
      Number(els.clipEndSec?.value || 0),
      getPlayerDuration()
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
    if (playerSourceIsExternalListenOnly()) return;
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
    if (!HUB_FEATURE_ENABLED) {
      showToast("Hub sharing is paused.", { durationMs: 3200 });
      return;
    }
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
    if (playerSourceIsExternalListenOnly()) return;
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
    renderActivePersonaBanner();
  });
}
if (els.personaActiveBannerChange && els.advancedSheet) {
  els.personaActiveBannerChange.addEventListener("click", () => {
    // Same opening behavior as the main "Open advanced options" button.
    els.advancedSheet.open = true;
    if (els.fineTuneDetails) els.fineTuneDetails.open = true;
    els.advancedSheet.scrollTop = 0;
    if (els.sunoPersonaId) {
      try {
        // Bring the persona dropdown directly into view + focus so the
        // user can swap voices in one tap, instead of hunting for it.
        els.sunoPersonaId.scrollIntoView({ block: "center", behavior: "smooth" });
      } catch {
        try { els.sunoPersonaId.scrollIntoView(); } catch {}
      }
      setTimeout(() => {
        try { els.sunoPersonaId.focus(); } catch {}
      }, 180);
    }
  });
}
if (els.personaActiveBannerClear) {
  els.personaActiveBannerClear.addEventListener("click", () => {
    if (els.sunoPersonaId) els.sunoPersonaId.value = "";
    savePersonaSelection("");
    updateProfilePersonaRow();
    renderActivePersonaBanner();
    try {
      showToast("Voice persona cleared. Default voice will be used.", { icon: "✓", durationMs: 2200 });
    } catch {}
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
    if (!sunoAudioId) {
      const msg = "Wait until your song fully finishes, then try again.";
      setStatus(msg);
      showToast(msg, { icon: "!", durationMs: 3600 });
      return;
    }
    try {
      els.btnCreatePersona.disabled = true;
      await createPersonaForSong({
        taskId: sunoTaskId,
        audioId: sunoAudioId,
        audioUrl: lastSunoProxyUrl || lastSunoFullUrl,
        title: lastSunoTitle,
        style: els.sunoStyle?.value || lastGenerationMeta?.style,
        voiceProfile: els.sunoVoiceProfile?.value || lastGenerationMeta?.voiceProfile,
        dialect: els.sunoDialect?.value || lastGenerationMeta?.dialect,
        timbre: activeProfile?.voiceTimbre,
        source: "options",
      });
    } finally {
      els.btnCreatePersona.disabled = false;
    }
  });
}
if (els.btnProfileSave) {
  els.btnProfileSave.addEventListener("click", async () => {
    const usernameRaw = String(els.profilePreviewUsernameInput?.value || "").trim().toLowerCase();
    const cleaned = usernameRaw.replace(/[^a-z0-9_.]/g, "").slice(0, 32);
    // If the user's input is empty / unusable, never fall back to
    // "guest". Prefer the handle they previously picked; only mint a
    // new anonymous one when there's nothing real to keep. This is
    // the "username sometimes goes by itself" bug — Save was the
    // last hop where a transient empty input could erase a real
    // handle.
    let username;
    if (cleaned) {
      username = cleaned;
    } else if (!isPlaceholderUsername(activeProfile.username)) {
      username = activeProfile.username;
    } else if (authSession?.user) {
      username = deriveUsernameFromAuth(authSession.user) || "guest";
    } else {
      username = "guest";
    }
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
if (els.profileUsernamePrompt) {
  // Tap the soft prompt → enter edit mode and select the username
  // text so they can just start typing their handle of choice.
  els.profileUsernamePrompt.addEventListener("click", () => {
    setProfileEditing(true);
    const input = els.profilePreviewUsernameInput;
    if (input) {
      input.focus();
      try { input.select(); } catch {}
    }
    setStatus("Pick a username, then tap Save.");
  });
}
if (els.btnProfileCancel) {
  els.btnProfileCancel.addEventListener("click", () => {
    restoreProfileInputsFromActive();
    setProfileEditing(false);
    setStatus("Edits cancelled.");
  });
}
function resetGoogleAuthButton() {
  if (els.btnAuthGoogle) {
    els.btnAuthGoogle.disabled = false;
    els.btnAuthGoogle.textContent = "Continue with Google";
  }
}
async function handleNativeAuthDeepLink(url) {
  try {
    const raw = String(url || "");
    if (!raw) return false;
    const lower = raw.toLowerCase();
    if (!lower.startsWith("com.nabadai.music://")) return false;
    let code = "";
    try {
      const u = new URL(raw);
      code = u.searchParams.get("code") || "";
    } catch {
      const q = raw.split("?")[1] || "";
      code = new URLSearchParams(q).get("code") || "";
    }
    if (!code) {
      setStatus(`Google login failed: no code in callback`);
      resetGoogleAuthButton();
      return false;
    }
    setStatus("Finishing Google login…");
    const ok = await exchangeOAuthCodeForSession(code);
    try { await getCapacitorBrowserPlugin()?.close?.(); } catch {}
    if (ok) {
      location.hash = "#/profile";
      applyRoute();
    } else {
      setStatus(`Google login failed: ${lastAuthDebug || "exchange error"}`);
    }
    resetGoogleAuthButton();
    return ok;
  } catch (e) {
    setStatus(`Login callback error: ${e?.message || String(e)}`);
    resetGoogleAuthButton();
    return false;
  }
}
if (isCapacitorNativeAuth()) {
  const CapApp = getCapacitorAppPlugin();
  if (CapApp?.addListener) {
    try {
      CapApp.addListener("appUrlOpen", (event) => {
        void handleNativeAuthDeepLink(event?.url);
      });
    } catch {}
  }
}
async function runGoogleOAuthLogin() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    await loadPublicConfig();
  }
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    notifyLoginFeedback(
      "Could not load login settings from the server. Check Wi‑Fi or open the web app once, then try again."
    );
    resetGoogleAuthButton();
    return;
  }
  try {
    if (els.btnAuthGoogle) {
      els.btnAuthGoogle.disabled = true;
      els.btnAuthGoogle.textContent = "Opening Google…";
    }
    notifyLoginFeedback("Opening Google login…");
    const url = await supabaseGoogleLoginUrl();
    if (!url) throw new Error("Could not create Google auth URL");
    const Browser = getCapacitorBrowserPlugin();
    if (isCapacitorNativeAuth() && Browser?.open) {
      await Browser.open({ url, presentationStyle: "fullscreen" });
      // Button is reset by the appUrlOpen handler once the deep link returns.
    } else if (isCapacitorNativeAuth() && !Browser?.open) {
      notifyLoginFeedback(
        "Could not open the sign-in browser. Product → Clean Build Folder in Xcode, then Run again."
      );
      resetGoogleAuthButton();
    } else {
      window.location.assign(url);
      setTimeout(resetGoogleAuthButton, 3500);
    }
  } catch (e) {
    resetGoogleAuthButton();
    notifyLoginFeedback(`Google login failed to start: ${e?.message || String(e)}`);
  }
}
if (els.btnAuthGoogle) {
  els.btnAuthGoogle.addEventListener("click", () => void runGoogleOAuthLogin());
}
if (els.btnAuthGateGoogle) {
  els.btnAuthGateGoogle.addEventListener("click", () => void runGoogleOAuthLogin());
}
if (els.btnAuthGateGuest) {
  els.btnAuthGateGuest.addEventListener("click", () => {
    location.hash = HUB_FEATURE_ENABLED ? "#/hub" : "#/generate";
    setStatus("Guest mode enabled. Login anytime from Profile.");
  });
}
if (els.btnAuthLogout) {
  els.btnAuthLogout.addEventListener("click", () => {
    saveAuthSession(null);
    resetProfileUiToGuest();
    setProfileEditing(false);
    // A pending generation belongs to the previous user — wipe it so a
    // fresh login on the same device doesn't inherit a stuck spinner.
    try { dismissPendingBackendTask({ silent: true, skipRecoverSave: true }); } catch {}
    try {
      clearRecoverableGenerationTask();
      updateLibraryRecoverBanner();
    } catch {}
    if (els.btnAuthGoogle) {
      els.btnAuthGoogle.disabled = false;
      els.btnAuthGoogle.textContent = "Continue with Google";
    }
    setStatus("Logged out.");
  });
}
if (els.btnLoadingDismiss) {
  els.btnLoadingDismiss.addEventListener("click", () => {
    dismissPendingBackendTask();
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
      soundCertified: false,
    };
    saveProfile(activeProfile);
    resetProfileUiToGuest();
    setStatus("Local profile data deleted.");
  });
}
if (els.profileAvatarFile) {
  els.profileAvatarFile.addEventListener("change", async () => {
    const f = els.profileAvatarFile?.files?.[0];
    if (!f) return;
    try {
      const dataUrl = await compressAvatarFile(f, { maxSize: 320, quality: 0.82 });
      if (!dataUrl) throw new Error("Could not read photo");
      activeProfile.avatar = dataUrl;
      // Persist to localStorage IMMEDIATELY so a PWA close doesn't
      // throw away the photo just because the user navigated away
      // before tapping Save. Previous behavior: only the in-memory
      // copy was updated, which is why "I put a photo, came back,
      // it's gone" was reproducible after a hard restart.
      saveProfile(activeProfile);
      renderProfilePreviewFromInputs();
      // Optimistic toast — UI already updated. Cloud sync happens
      // inline below so a reload re-fetches the same photo from
      // Supabase (the prior debounced path could be dropped if the
      // app was closed before the 600ms timer fired).
      showToast("Photo saved", { icon: "✓", durationMs: 1400 });
      // Cancel any pending debounced sync — we're about to flush.
      if (_profileCloudSyncTimer) {
        clearTimeout(_profileCloudSyncTimer);
        _profileCloudSyncTimer = null;
      }
      if (authSession?.user?.id) {
        try {
          await supabaseUpsertProfile(activeProfile);
        } catch (e) {
          console.warn("[avatar] cloud sync failed; will retry on next Save", e);
          showToast("Photo saved locally — cloud will retry on Save", { durationMs: 3200 });
          void scheduleProfileCloudSync({ delayMs: 2000 });
        }
      }
    } catch (e) {
      console.error("[avatar] failed to read photo", e);
      showToast(`Could not load photo: ${e?.message || "error"}`, { icon: "!", durationMs: 3200 });
    } finally {
      try { if (els.profileAvatarFile) els.profileAvatarFile.value = ""; } catch {}
    }
  });
}
/** Avatar file picker — must fire from a user gesture. The <img> alone
 *  is a bad hit target when `data-empty` hides it (Na placeholder); the
 *  whole wrap + "Photo" pill must open the picker in edit mode. */
function triggerProfileAvatarFilePicker() {
  if (!profileEditing || !els.profileAvatarFile) return;
  try {
    els.profileAvatarFile.click();
  } catch (e) {
    console.error("[avatar] file picker failed", e);
  }
}
if (els.profileAuraAvatarWrap && els.profileAvatarFile) {
  els.profileAuraAvatarWrap.addEventListener("click", (e) => {
    if (!profileEditing) return;
    const t = e.target;
    if (!(t instanceof Element)) return;
    if (t.closest("a, button, input, select, textarea")) return;
    triggerProfileAvatarFilePicker();
  });
}

// --- Spotify-x-Nabad: share pill with toast feedback. Uses the native
//     share sheet when available (Capacitor WKWebView on iOS exposes
//     navigator.share); falls back to clipboard with execCommand as a
//     last resort. Always surfaces a tiny toast under the pill.
function _profileShareUrl() {
  const handle = String(activeProfile?.username || "").replace(/^@/, "").trim();
  // Prefer the deployed Vercel host for a real link; fall back to
  // origin when running on http(s). In the iOS app origin can be
  // `capacitor://localhost` which isn't shareable, so we hardcode the
  // public host in that case.
  const origin = (location.origin || "").replace(/\/$/, "");
  const isWebOrigin = /^https?:\/\//i.test(origin);
  const base = isWebOrigin ? origin : "https://nabad-ai.vercel.app";
  if (!handle || handle === "guest") return base;
  return `${base}/#/u/${encodeURIComponent(handle)}`;
}
function _profileShowShareToast(message) {
  // The old in-section toast pill was removed with the wide share row;
  // fall back to the global toast so confirmation still surfaces.
  const toast = els.profileShareToast;
  if (toast) {
    toast.textContent = message;
    toast.hidden = false;
    clearTimeout(_profileShowShareToast._t);
    _profileShowShareToast._t = setTimeout(() => { toast.hidden = true; }, 1800);
    return;
  }
  try { showToast(message, { durationMs: 1800 }); } catch {}
}
async function _profileCopyLink() {
  const url = _profileShareUrl();
  if (!url) return false;
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(url);
      return true;
    }
  } catch {}
  try {
    const ta = document.createElement("textarea");
    ta.value = url;
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return Boolean(ok);
  } catch {}
  return false;
}
async function _profileShare() {
  const url = _profileShareUrl();
  const handle = String(activeProfile?.username || "").replace(/^@/, "").trim();
  const title = handle ? `@${handle} on Nabad` : "My Nabad profile";
  if (navigator.share && url) {
    try {
      await navigator.share({ title, text: title, url });
      _profileShowShareToast("Shared!");
      return;
    } catch (e) {
      // User dismissed the sheet — silently fall through to copy.
      if (String(e?.name || "") === "AbortError") return;
    }
  }
  const ok = await _profileCopyLink();
  _profileShowShareToast(ok ? "Link copied" : "Couldn't share");
}
if (els.profileActionShare) {
  els.profileActionShare.addEventListener("click", () => void _profileShare());
}
if (els.btnProfileShareIcon) {
  els.btnProfileShareIcon.addEventListener("click", () => void _profileShare());
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
// `applyRoute()` already ran once at module load (before this block). At
// that moment `authSession` was still null, so protected routes mis-routed
// and `renderLibrary()` never saw a signed-in session — Library rows had
// no Public/Private chip and the ⋯ menu omitted "Show on public profile".
// Re-run routing after localStorage hydration so Library paints correctly.
try {
  applyRoute();
} catch (e) {
  console.warn("[boot] applyRoute after loadAuthSession", e);
}
// Light the profile header shimmer NOW if we already know a sign-in
// is on its way and the handle is still the boot placeholder ("guest").
// This avoids the "M logo + @guest" flash on cold opens with slow mobile
// data. The boot IIFE flips it off as soon as it has merged the
// cloud profile (or determined the user is genuinely signed-out).
if (authSession?.user?.id && shouldShowProfileHeaderSkeleton()) {
  setProfileHeaderLoading(true);
}
// Absolute safety net: under no circumstance keep the shimmer on past
// 10s. The "always loading, @guest" report came from one of the boot
// fetches hanging with no timeout; even with timeouts in place, any
// unexpected exception inside the IIFE must not leave the header stuck.
// This is a fire-and-forget defense in depth.
setTimeout(() => {
  try { setProfileHeaderLoading(false); } catch {}
}, 10000);
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
  // try/finally guarantees the profile header shimmer is dismissed no
  // matter what fails inside the boot chain. Pre-fix, an unhandled
  // throw or a hung fetch would leave it stuck on with @guest visible.
  try {
  await loadPublicConfig();
  const usedCodeFlow = await maybeHandleAuthCodeFromQuery();
  const usedTokenFlow = !usedCodeFlow && maybeHandleMagicLinkFromHash();
  await refreshAuthStateFromSupabase();
  try {
    if ((document.body.getAttribute("data-route") || "") === "library") renderLibrary();
  } catch {}
  if (usedCodeFlow || usedTokenFlow) window.location.hash = "#/generate";

  // Always hydrate from cloud when a valid session exists (not only callback flows).
  if (authSession?.user?.id) {
    const cloud = await supabaseLoadProfile();
    let nextProfile;
    if (cloud) {
      // Local-first merge. Cloud is the fallback for fields the user
      // hasn't filled on this device yet (e.g. fresh install). For any
      // overlapping field, local wins so an unsaved avatar pick or a
      // recent edit doesn't get clobbered by a stale cloud value (this
      // was the "I put a photo then came back and don't see it"
      // report). Anything richer in local automatically promotes back
      // to cloud through the debounced sync below.
      //
      // EXCEPTION: `username`. Placeholder local values ("guest" or
      // "user_xxxxxx") must NEVER override a real cloud username. That
      // bug bit us on every fresh install / cleared cache / new device:
      // local would still be "guest", merge would keep "guest", the
      // post-merge migration would derive a new "user_xxxxxx", and we'd
      // ship that back to cloud — silently overwriting the user's
      // chosen handle. Only let local win for username when it's
      // actually user-customized.
      const looksFilled = (v) => v !== "" && v != null;
      const localFilled = Object.fromEntries(
        Object.entries(activeProfile).filter(([k, v]) => {
          if (k === "username" && isPlaceholderUsername(v)) return false;
          return looksFilled(v);
        }),
      );
      nextProfile = {
        ...cloud,
        ...localFilled,
        id: String(authSession.user.id),
        email: localFilled.email || cloud.email || authSession.user.email || "",
      };
    } else {
      // First sign-in for this user. Don't fall back to the boot-time
      // `username: "guest"` default — that's the unauthenticated
      // sentinel and any post they share would inherit/leak across
      // accounts (this is the bug just reported: a new user signed in
      // on another device got @guest and "inherited" old demo posts).
      nextProfile = {
        ...activeProfile,
        id: String(authSession.user.id),
        email: authSession.user.email || activeProfile.email || "",
        username: deriveUsernameFromAuth(authSession.user),
      };
    }
    // Migration safety net: only mint an anonymous handle when there
    // is genuinely nothing usable. We must NEVER overwrite an existing
    // user-picked handle here — that was the regression where signing
    // in on a new device or after clearing cache silently rolled the
    // username back to "user_xxxxxx".
    if (!nextProfile.username || nextProfile.username === "guest") {
      nextProfile = { ...nextProfile, username: deriveUsernameFromAuth(authSession.user) };
    }
    saveProfile(nextProfile);
    // Real profile is in memory now — drop the header shimmer before
    // we paint, so the avatar/handle don't fade in twice.
    setProfileHeaderLoading(false);
    // Push back to cloud only when the merge introduced changes that
    // need to land on the server (new username, new avatar/bio that
    // were only in local). Fire-and-forget via the debounced sync so
    // boot stays snappy on slow networks.
    const cloudIsStale = !cloud
      || cloud.username !== nextProfile.username
      || cloud.avatar !== nextProfile.avatar
      || cloud.bio !== nextProfile.bio
      || cloud.voice_timbre !== nextProfile.voiceTimbre;
    if (cloudIsStale) scheduleProfileCloudSync({ delayMs: 400 });

    if (els.profilePreviewUsernameInput) els.profilePreviewUsernameInput.value = activeProfile.username ? `@${activeProfile.username}` : "@guest";
    if (els.profilePreviewTimbreInput) els.profilePreviewTimbreInput.value = activeProfile.voiceTimbre || "";
    if (els.profilePreviewBioInput) els.profilePreviewBioInput.value = activeProfile.bio || "";
    if (els.profileIsPublic) els.profileIsPublic.checked = activeProfile.isPublic !== false;
    renderProfilePreviewFromInputs();
    renderProfileHubShared();

    syncActiveProfileIdFromSession();
    // Defer Library hydration to idle so the first Generate paint wins the
    // network pipe. Own Hub releases load when the user opens Profile
    // (`applyRoute` → `refreshMyHubPostsFast`) — not here — so staying on
    // Generate never downloads multi‑MB `hub_posts` rows in the background.
    const startDeferredQueries = () => {
      void ensureUserLibraryHydrated();
    };
    if (typeof requestIdleCallback === "function") {
      requestIdleCallback(startDeferredQueries, { timeout: 800 });
    } else {
      setTimeout(startDeferredQueries, 250);
    }
    renderPersonaSelect();
  } else {
    // Never leak previous user visuals when session is not valid.
    resetProfileUiToGuest();
    setProfileHeaderLoading(false);
    if ((location.hash || "") === "#/intro") location.hash = "#/auth";
  }
  } finally {
    // Defense in depth — the success paths above already dismiss the
    // shimmer, but a thrown error anywhere in the chain would otherwise
    // skip them and leave the profile header stuck. This finally
    // guarantees a single dismissal.
    try { setProfileHeaderLoading(false); } catch {}
  }
})();
if (els.profilePreviewUsernameInput) els.profilePreviewUsernameInput.value = activeProfile.username ? `@${activeProfile.username}` : "@guest";
if (els.profilePreviewTimbreInput) els.profilePreviewTimbreInput.value = activeProfile.voiceTimbre || "";
if (els.profilePreviewBioInput) els.profilePreviewBioInput.value = activeProfile.bio || "";
if (els.profileIsPublic) els.profileIsPublic.checked = activeProfile.isPublic !== false;
renderProfilePreviewFromInputs();
renderProfileHubShared();
setProfileEditing(false);

// Tap-active-tab to refresh (Hub / Search / Profile / Library). The
// listener is attached once at boot and reads `body[data-route]` at
// click time, so it stays correct across hash changes without needing
// a rebind.
try { attachTabRefresh(); } catch (e) { console.warn("[tabRefresh] init", e); }
try { initMentor(); } catch (e) { console.warn("[mentor] init", e); }

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
