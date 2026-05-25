/**
 * Echo — ephemeral creator audio moments (24h).
 * Wired from app.js via initEcho(ctx).
 */
import { ECHO_TONE_DEFAULT, ECHO_TONE_IDS } from "./echo-tone.js";

const ECHO_BAR_COUNT = 48;
/** Match status voice — keeps clips small and upload fast */
const ECHO_MAX_MS = 30000;
const ECHO_STORAGE_MAX_BYTES = 2 * 1024 * 1024 - 4096;
const ECHO_REC_BITRATE = 56000;
const ECHO_MIN_RECORD_MS = 420;
const ECHO_HEARD_KEY = "nabad_echo_heard_v1";
const ECHO_CAPTION_MAX = 60;

const ECHO_BEAT_ASSET_BASE = "./assets/echo-beats/";
const ECHO_BEAT_DEFS = {
  none: { label: "None", variants: [] },
  lofi: { label: "Lo-fi", variants: ["lofi-a.mp3", "lofi-b.mp3"] },
  soul: { label: "Soul", variants: ["soul-a.mp3", "soul-b.mp3"] },
  eight08: { label: "808", variants: ["eight08-a.mp3", "eight08-b.mp3"] },
  piano: { label: "Piano", variants: ["piano-a.mp3", "piano-b.mp3"] },
  ambient: { label: "Ambient", variants: ["ambient-a.mp3", "ambient-b.mp3"] },
  oud: { label: "Oud", variants: ["oud-a.mp3", "oud-b.mp3"] },
};
const ECHO_BEAT_SPEED = { slowed: 0.85, normal: 1.0, fast: 1.15 };
/** Beat level baked into the uploaded mix (sits well below voice). */
const ECHO_BEAT_DUCK_LEVEL = 0.22;
/** Beat level played to the user's ears while recording (so they can perform to it). */
const ECHO_BEAT_MONITOR_LEVEL = 0.55;

let ctx = null;
let echoRecState = "idle";
let echoRecorder = null;
let echoStream = null;
let echoChunks = [];
let echoBlob = null;
let echoRawBlob = null;
let echoTone = ECHO_TONE_DEFAULT;
let echoEnhancePromise = null;
let echoDurationMs = 0;
let echoPeaks = [];
let echoUploadPromise = null;
let echoUploadedUrl = "";
let echoStartedAt = 0;
let echoComposeIdleRaf = 0;
let _echoSwipeX = 0;
let _echoPublishing = false;
let echoMicTouching = false;
let _echoHoldWanted = false;
let _echoHoldPointerId = null;
let _echoArmGen = 0;
let _echoDeletedOptIds = new Set();
let _echoSentFlashTimer = 0;
let _echoSfxCtx = null;
let _echoBeatId = "none";
let _echoBeatVariant = 0;
let _echoBeatSpeed = "normal";
let _echoBeatBufferCache = new Map();
let _echoBeatPreview = null;
let _echoBeatMixer = null;
/**
 * iOS Safari/WKWebView creates AudioContexts in "suspended" state and only
 * allows resume() to actually take effect when called synchronously inside a
 * user gesture. So we lazily create one shared context on the first chip tap
 * (which IS a gesture) and reuse it for preview + mixer — never close it.
 */
let _echoSharedAudioCtx = null;
const COMPOSE_ORBIT_BARS = 48;

function echoSfxCtx() {
  if (!_echoSfxCtx) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (Ctx) _echoSfxCtx = new Ctx();
  }
  return _echoSfxCtx;
}

function suspendEchoSfx() {
  try {
    if (_echoSfxCtx?.state === "running") void _echoSfxCtx.suspend();
  } catch {}
}

/** iOS: only play UI SFX after a real touch — avoids glitch on sheet open */
function playEchoSfxAfterGesture(kind) {
  if (!echoMicTouching && echoRecState === "idle") return;
  playEchoSfx(kind);
}

/** Soft emotional UI pulses — never harsh */
function playEchoSfx(kind) {
  const ctx = echoSfxCtx();
  if (!ctx) return;
  if (ctx.state === "suspended") void ctx.resume().catch(() => {});
  const t = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  osc.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);
  const tail = (dur) => {
    osc.start(t);
    osc.stop(t + dur);
  };
  if (kind === "open") {
    filter.frequency.value = 820;
    osc.type = "sine";
    osc.frequency.setValueAtTime(160, t);
    osc.frequency.exponentialRampToValueAtTime(340, t + 0.42);
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.038, t + 0.06);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.55);
    tail(0.56);
  } else if (kind === "touch") {
    filter.frequency.value = 1200;
    osc.type = "triangle";
    osc.frequency.setValueAtTime(240, t);
    osc.frequency.exponentialRampToValueAtTime(380, t + 0.12);
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.032, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
    tail(0.22);
  } else if (kind === "release") {
    filter.frequency.value = 680;
    osc.type = "sine";
    osc.frequency.setValueAtTime(320, t);
    osc.frequency.exponentialRampToValueAtTime(140, t + 0.35);
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.04, t + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.48);
    tail(0.5);
  } else if (kind === "lock") {
    filter.frequency.value = 950;
    osc.type = "sine";
    osc.frequency.setValueAtTime(420, t);
    osc.frequency.exponentialRampToValueAtTime(520, t + 0.1);
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.028, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
    tail(0.24);
  } else if (kind === "sent") {
    filter.frequency.value = 1100;
    osc.type = "sine";
    osc.frequency.setValueAtTime(392, t);
    osc.frequency.exponentialRampToValueAtTime(523, t + 0.14);
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.034, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.32);
    tail(0.34);
  }
}

function showEchoSentCelebration() {
  try {
    c().haptic("medium");
  } catch {}
  try {
    c().showToast("Echo sent", { icon: "✓", durationMs: 2600 });
  } catch {}
  playEchoSfx("sent");
  if (_echoSentFlashTimer) window.clearTimeout(_echoSentFlashTimer);
  document.body.classList.add("echoSentFlash");
  _echoSentFlashTimer = window.setTimeout(() => {
    _echoSentFlashTimer = 0;
    document.body.classList.remove("echoSentFlash");
  }, 1500);
}

function isOptimisticEchoId(id) {
  return /^opt-/i.test(String(id || ""));
}

function isServerEchoId(id) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(id || ""));
}

async function deleteEchoFromServer(echoId, uid) {
  const id = String(echoId || "");
  if (!isServerEchoId(id) || !uid) return false;
  try {
    const r = await c().supabaseRestWithAuth(
      `social_echoes?id=eq.${encodeURIComponent(id)}&user_id=eq.${encodeURIComponent(uid)}`,
      { method: "DELETE", prefer: "return=minimal" },
    );
    if (r?.ok) return true;
  } catch {}
  try {
    await c().socialApi("/api/social", {
      method: "POST",
      body: JSON.stringify({ action: "delete_echo", echoId: id }),
    });
    return true;
  } catch {
    return false;
  }
}

function idleOrbitPeaks() {
  const out = [];
  for (let i = 0; i < COMPOSE_ORBIT_BARS; i++) {
    out.push(0.2 + 0.14 * Math.sin(i * 0.38 + 0.4));
  }
  return normalizePeaks(out);
}

function peaksHtmlOrbit(peaks, extraClass = "") {
  const norm = normalizePeaks(peaks);
  const n = Math.max(norm.length, COMPOSE_ORBIT_BARS);
  return Array.from({ length: n }, (_, i) => {
    const h = norm[i % norm.length] ?? 0.28;
    const ht = Math.max(0.08, Math.min(1, Number(h) || 0.28));
    const deg = (i / n) * 360;
    const tint = i % 6 === 0 ? "echoBar--hi" : "";
    return `<span class="echoBar echoBar--orbit ${tint} ${extraClass}" style="--bar-h:${(ht * 100).toFixed(1)}%;--orbit-deg:${deg.toFixed(2)}deg;--bar-i:${i}"></span>`;
  }).join("");
}

function setComposeAtmosphere(voice = 0, pressure = 0) {
  const card = document.querySelector(".echoComposeCard");
  if (!card) return;
  const v = Math.max(0, Math.min(1, Number(voice) || 0));
  const p = Math.max(0, Math.min(1, Number(pressure) || 0));
  card.style.setProperty("--echo-voice", String(v));
  card.style.setProperty("--echo-aura", String(v * 0.82 + p * 0.18));
  card.style.setProperty("--echo-pressure", String(p));
}
let echoAutostopTimer = 0;
let echoTickRaf = 0;
let echoComposeTickRaf = 0;
let echoComposeLiveRaf = 0;

let _echoStories = [];
let _echoStoriesByUser = new Map();
let _echoById = new Map();
let _echoRailGen = 0;
let _echoViewerOpen = false;
let _echoDeck = [];
let _echoDeckIndex = 0;
let _echoSlideIndex = 0;
let _echoAudio = null;
let _echoViewerAudioEl = null;
let _echoViewerListenersBound = false;
let _echoCtx = null;
let _echoAnalyser = null;
let _echoSource = null;
let _echoRaf = 0;
let _echoProgressTimer = 0;
let _echoListenMarked = false;
let _echoReplyToId = "";
let _pendingEchoCompose = false;
let _echoComposeIgnoreInputUntil = 0;
let _echoRailCache = null;
let _echoRailCacheAt = 0;
const ECHO_RAIL_CACHE_MS = 45000;
const ECHO_RAIL_SNAPSHOT_KEY = "nabad_echo_rail_v1";

function hydrateEchoRailCacheFromStorage() {
  if (_echoRailCache) return;
  try {
    const raw = sessionStorage.getItem(ECHO_RAIL_SNAPSHOT_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (parsed?.at && Date.now() - parsed.at < ECHO_RAIL_CACHE_MS && Array.isArray(parsed.stories)) {
      _echoRailCache = parsed.stories;
      _echoRailCacheAt = parsed.at;
    }
  } catch {}
}

function persistEchoRailCache() {
  if (!_echoRailCache) return;
  try {
    sessionStorage.setItem(
      ECHO_RAIL_SNAPSHOT_KEY,
      JSON.stringify({ at: _echoRailCacheAt || Date.now(), stories: _echoRailCache }),
    );
  } catch {}
}

function c() {
  return ctx;
}

function escape(s) {
  return c().escapeHtml(String(s || ""));
}

function normalizePeaks(peaks) {
  const fn = c().statusVoiceNormalizePeaks;
  if (fn) return fn(peaks, ECHO_BAR_COUNT);
  const raw = Array.isArray(peaks) ? peaks : c().statusVoiceFallbackPeaks?.() || [];
  return raw.slice(0, ECHO_BAR_COUNT);
}

function peaksHtml(peaks, extraClass = "") {
  const norm = normalizePeaks(peaks);
  return norm
    .map((h, i) => {
      const ht = Math.max(0.1, Math.min(1, Number(h) || 0.3));
      const tint = i % 4 === 0 ? "echoBar--hi" : "";
      return `<span class="echoBar ${tint} ${extraClass}" style="--bar-h:${(ht * 100).toFixed(1)}%;--bar-i:${i}"></span>`;
    })
    .join("");
}

/** Direct public storage URL (fastest on device). */
function echoDirectPlayUrl(url) {
  const raw = String(url || "").trim();
  if (!raw) return "";
  return c().normalizeAudioUrlForPlayback?.(raw) || raw;
}

/** Proxied URL fallback when direct fetch fails. */
function echoProxyPlayUrl(url) {
  const raw = String(url || "").trim();
  if (!raw) return "";
  const proxy = c().toAudioProxyUrl?.(raw);
  return c().normalizeAudioUrlForPlayback?.(proxy || raw) || raw;
}

/** Prefer direct Supabase public audio; proxy only as fallback. */
function echoResolvePlayUrl(url) {
  const raw = String(url || "").trim();
  if (!raw) return "";
  if (/storage\/v1\/object\/public\/status_audio\//i.test(raw)) {
    return echoDirectPlayUrl(raw);
  }
  return echoProxyPlayUrl(raw);
}

function getEchoViewerAudio() {
  if (!_echoViewerAudioEl) {
    const audio = new Audio();
    audio.preload = "auto";
    audio.crossOrigin = "anonymous";
    audio.setAttribute("playsinline", "");
    audio.volume = 1;
    _echoViewerAudioEl = audio;
  }
  return _echoViewerAudioEl;
}

function preloadEchoAudio(url) {
  const playUrl = echoResolvePlayUrl(url);
  if (!playUrl) return;
  const audio = getEchoViewerAudio();
  if (audio.dataset.echoSrc === playUrl) return;
  audio.dataset.echoSrc = playUrl;
  audio.src = playUrl;
  try {
    audio.load();
  } catch {}
}

function bindEchoViewerAudioOnce() {
  if (_echoViewerListenersBound) return;
  _echoViewerListenersBound = true;
  const audio = getEchoViewerAudio();
  audio.addEventListener("play", () => {
    const sheet = document.getElementById("echoViewerSheet");
    const slide = currentEchoSlide();
    if (!sheet || !slide) return;
    sheet.classList.remove("isLoading", "needsEchoTap");
    sheet.classList.add("isPlaying");
    const tap = document.getElementById("btnEchoTapPlay");
    if (tap) tap.hidden = true;
    if (!isOwnEchoSlide(slide)) void markEchoListened(slide);
    if (!_echoRaf) _echoRaf = requestAnimationFrame(echoViewerTick);
    syncEchoViewerUi();
  });
  audio.addEventListener("timeupdate", () => updateEchoViewerProgress());
  audio.addEventListener("ended", () => {
    const sheet = document.getElementById("echoViewerSheet");
    const slide = currentEchoSlide();
    if (!sheet) return;
    sheet.classList.remove("isPlaying", "isLoading");
    sheet.classList.add("isDissolving");
    stopEchoPlayback();
    try {
      c().haptic("light");
    } catch {}
    window.setTimeout(() => {
      sheet.classList.remove("isDissolving");
      sheet.classList.add("isEnded");
      if (slide?.listenOnce && !isOwnEchoSlide(slide)) {
        sheet.classList.add("isLocked", "isGhost");
      }
      syncEchoViewerUi();
    }, 880);
  });
  audio.addEventListener("pause", () => {
    const sheet = document.getElementById("echoViewerSheet");
    if (!sheet?.classList.contains("isOpen") || audio.ended) return;
    if (!sheet.classList.contains("needsEchoTap")) {
      sheet.classList.remove("isPlaying");
      syncEchoViewerUi();
    }
  });
}

function paintEchoViewerWave(slide) {
  const wave = document.getElementById("echoViewerWave");
  if (!wave || !slide) return;
  const peaks = slide.waveformPeaks?.length ? slide.waveformPeaks : normalizePeaks([]);
  wave.innerHTML = peaksHtml(peaks);
}

function echoRelativeTime(iso) {
  const ts = new Date(iso || 0).getTime();
  if (!ts) return "Just now";
  const diff = Date.now() - ts;
  if (diff < 60_000) return "Just now";
  const min = Math.floor(diff / 60_000);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.floor(hr / 24)}d ago`;
}

function isOwnEchoSlide(slide) {
  const uid = String(c().getAuthSession()?.user?.id || "");
  return uid && String(slide?.userId || "") === uid;
}

function invalidateEchoRailCache() {
  _echoRailCache = null;
  _echoRailCacheAt = 0;
}

function updateEchoViewerProgress() {
  const timerTop = document.getElementById("echoViewerTimerTop");
  const centerTimer = document.getElementById("echoViewerCenterTimer");
  const progress = document.getElementById("echoViewerProgressFill");
  const thumb = document.getElementById("echoViewerScrubThumb");
  const slide = currentEchoSlide();
  if (!slide) return;

  const curSec = _echoAudio ? _echoAudio.currentTime || 0 : 0;
  const durSec = _echoAudio?.duration || slide.durationMs / 1000 || 0;
  const curFmt = c().formatMsAsVoiceTime(Math.floor(curSec * 1000));
  const durFmt = c().formatMsAsVoiceTime(Math.floor((durSec || 1) * 1000));
  const line = `${curFmt} · ${durFmt}`;

  if (timerTop) timerTop.textContent = line;
  if (centerTimer) centerTimer.textContent = `${curFmt} / ${durFmt}`;

  const pct = durSec > 0 ? Math.min(100, (curSec / durSec) * 100) : 0;
  if (progress) progress.style.width = `${pct}%`;
  if (thumb) thumb.style.left = `${pct}%`;
}

function renderEchoViewerDots() {
  const wrap = document.getElementById("echoViewerDots");
  const story = _echoDeck[_echoDeckIndex];
  const slides = story?.echoes || [];
  if (!wrap) return;
  if (slides.length <= 1) {
    wrap.hidden = true;
    wrap.innerHTML = "";
    return;
  }
  wrap.hidden = false;
  wrap.innerHTML = slides
    .map(
      (_, i) =>
        `<button type="button" class="echoViewerDot${i === _echoSlideIndex ? " isActive" : ""}" data-echo-dot="${i}" aria-label="Echo ${i + 1}"></button>`,
    )
    .join("");
}

function patchEchoInRail(echoId, patch) {
  const id = String(echoId || "");
  if (_echoDeletedOptIds.has(id)) return;
  const echo = _echoById.get(id);
  if (!echo) return;
  Object.assign(echo, patch);
  const uid = String(echo.userId || "");
  const story = _echoStoriesByUser.get(uid);
  mergeEchoIntoRail(echo, {
    username: story?.username || echo.username || "",
    avatar: story?.avatar || echo.avatar || "",
  });
}

function mergeEchoIntoRail(echo, prof) {
  const uid = String(echo.userId || "");
  if (!uid) return;
  if (_echoDeletedOptIds.has(String(echo.id || ""))) return;
  const story = _echoStoriesByUser.get(uid) || {
    userId: uid,
    username: prof?.username || echo.username || "",
    avatar: prof?.avatar || echo.avatar || "",
    echoes: [],
  };
  story.echoes = [echo, ...(story.echoes || []).filter((e) => String(e.id) !== String(echo.id))];
  const stories = [..._echoStories.filter((s) => String(s.userId) !== uid), story].sort((a, b) => {
    const ta = new Date(a.echoes?.[0]?.createdAt || 0).getTime();
    const tb = new Date(b.echoes?.[0]?.createdAt || 0).getTime();
    return tb - ta;
  });
  indexEchoStories(stories);
  _echoRailCache = stories;
  _echoRailCacheAt = Date.now();
  renderEchoRail(stories);
}

function loadHeardLocal() {
  try {
    const raw = localStorage.getItem(ECHO_HEARD_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    return new Set();
  }
}

function saveHeardLocal(id) {
  try {
    const set = loadHeardLocal();
    set.add(String(id));
    localStorage.setItem(ECHO_HEARD_KEY, JSON.stringify([...set].slice(-400)));
  } catch {}
}

function isEchoHeard(echo) {
  if (!echo) return false;
  if (echo.listened) return true;
  return loadHeardLocal().has(String(echo.id));
}

function mapEchoFromApi(e) {
  return {
    id: e.id,
    userId: e.userId,
    audioUrl: e.audioUrl,
    durationMs: Number(e.durationMs) || 0,
    waveformPeaks: e.waveformPeaks || [],
    body: String(e.body || "").trim(),
    listenOnce: Boolean(e.listenOnce),
    replyTo: e.replyTo || null,
    createdAt: e.createdAt,
    expiresAt: e.expiresAt,
    username: e.username || "",
    avatar: e.avatar || "",
    listened: Boolean(e.listened),
    reaction: String(e.reaction || ""),
    reactionCounts: e.reactionCounts || {},
  };
}

function indexEchoStories(stories) {
  _echoStories = Array.isArray(stories) ? stories : [];
  _echoStoriesByUser = new Map();
  _echoById = new Map();
  for (const story of _echoStories) {
    const uid = String(story.userId || "");
    if (!uid) continue;
    const slides = (story.echoes || []).map(mapEchoFromApi);
    slides.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
    _echoStoriesByUser.set(uid, { ...story, echoes: slides });
    slides.forEach((e) => _echoById.set(String(e.id), e));
  }
}

async function fetchEchoRailDirect() {
  const uid = c().getAuthSession()?.user?.id;
  if (!uid) return [];
  const fetchFollowing = c().fetchFollowingListForFeed || c().fetchFollowingListViaSupabase;
  const following = await fetchFollowing();
  if (following === null) throw new Error("no direct");
  const authorIds = [...new Set([uid, ...following.map((f) => f.userId).filter(Boolean)])];
  if (!authorIds.length) return [];
  const nowIso = new Date().toISOString();
  const inList = authorIds.map((id) => encodeURIComponent(id)).join(",");
  const cols =
    "id,user_id,audio_url,duration_ms,waveform_peaks,body,listen_once,reply_to,created_at,expires_at";
  const r = await c().supabaseRestWithAuth(
    `social_echoes?user_id=in.(${inList})&expires_at=gt.${encodeURIComponent(nowIso)}&select=${cols}&order=created_at.desc&limit=48`,
  );
  if (!r?.ok) throw new Error("fetch");
  const raw = await r.json().catch(() => []);
  if (!Array.isArray(raw)) return [];
  const profIds = [...new Set(raw.map((row) => String(row.user_id || "").trim()).filter(Boolean))];
  const profMap = await c().fetchProfilesByUserIdsMap(profIds);
  const echoIds = raw.map((row) => row.id).filter(Boolean);
  let listenedSet = new Set();
  const reactMap = new Map();
  if (echoIds.length) {
    const inEcho = echoIds.map((id) => encodeURIComponent(id)).join(",");
    const [lr, rr] = await Promise.all([
      c().supabaseRestWithAuth(
        `social_echo_listens?echo_id=in.(${inEcho})&user_id=eq.${encodeURIComponent(uid)}&select=echo_id`,
      ),
      c().supabaseRestWithAuth(
        `social_echo_reactions?echo_id=in.(${inEcho})&select=echo_id,reaction,user_id`,
      ),
    ]);
    if (lr?.ok) {
      const listens = await lr.json().catch(() => []);
      if (Array.isArray(listens)) listenedSet = new Set(listens.map((x) => x.echo_id));
    }
    if (rr?.ok) {
      const reacts = await rr.json().catch(() => []);
      if (Array.isArray(reacts)) {
        for (const row of reacts) {
          if (!reactMap.has(row.echo_id)) reactMap.set(row.echo_id, { counts: {}, mine: "" });
          const b = reactMap.get(row.echo_id);
          const k = String(row.reaction || "");
          b.counts[k] = (b.counts[k] || 0) + 1;
          if (row.user_id === uid) b.mine = k;
        }
      }
    }
  }
  const byUser = new Map();
  for (const row of raw) {
    const userId = String(row.user_id || "");
    if (!userId) continue;
    if (!byUser.has(userId)) byUser.set(userId, []);
    const prof = profMap.get(userId);
    const rx = reactMap.get(row.id) || { counts: {}, mine: "" };
    byUser.get(userId).push(
      mapEchoFromApi({
        id: row.id,
        userId,
        audioUrl: row.audio_url,
        durationMs: row.duration_ms,
        waveformPeaks: row.waveform_peaks,
        body: row.body,
        listenOnce: row.listen_once,
        replyTo: row.reply_to,
        createdAt: row.created_at,
        expiresAt: row.expires_at,
        username: prof?.username || "",
        avatar: prof?.avatar || "",
        listened: listenedSet.has(row.id),
        reaction: rx.mine,
        reactionCounts: rx.counts,
      }),
    );
  }
  return [...byUser.entries()]
    .sort((a, b) => {
      const ta = new Date(a[1][0]?.createdAt || 0).getTime();
      const tb = new Date(b[1][0]?.createdAt || 0).getTime();
      return tb - ta;
    })
    .map(([userId, echoes]) => {
      const prof = profMap.get(userId);
      return {
        userId,
        username: prof?.username || "",
        avatar: prof?.avatar || "",
        echoes,
      };
    });
}

async function fetchEchoRail() {
  const uid = c().getAuthSession()?.user?.id;
  if (!uid) return [];
  if (_echoRailCache && Date.now() - _echoRailCacheAt < ECHO_RAIL_CACHE_MS) {
    return _echoRailCache;
  }
  try {
    const stories = await fetchEchoRailDirect();
    _echoRailCache = stories;
    _echoRailCacheAt = Date.now();
    return stories;
  } catch {
    try {
      const data = await c().socialApi("/api/social?type=echo_rail&limit=48");
      const stories = Array.isArray(data?.echoes) ? data.echoes : [];
      _echoRailCache = stories;
      _echoRailCacheAt = Date.now();
      return stories;
    } catch {
      return _echoRailCache || [];
    }
  }
}

function echoTileShellHtml(story, { isOwn = false, addTile = false } = {}) {
  const uid = String(story.userId || "");
  const echoes = story.echoes || [];
  const latest = echoes[0];
  const avatar = c().normalizeProfileAvatarForImg(String(story.avatar || "").trim());
  const handle = String(story.username || "").replace(/^@/, "") || "you";
  const heardAll = echoes.length > 0 && echoes.every((e) => isEchoHeard(e));
  const active = echoes.some((e) => !isEchoHeard(e));
  const listenOnce = Boolean(latest?.listenOnce);
  const peaks = latest?.waveformPeaks || [];

  if (addTile && isOwn) {
    return `<button type="button" class="echoTile echoTile--add" data-echo-add="1" aria-label="Drop an Echo">
      <span class="echoTileShell echoTileShell--add">
        <span class="echoTileAddIcon" aria-hidden="true">+</span>
      </span>
      <span class="echoTileLabel">Your Echo</span>
    </button>`;
  }

  const imgInner = avatar
    ? `<img class="echoTileAvatar" src="${escape(avatar)}" alt="" width="72" height="72" decoding="async" />`
    : `<span class="echoTileAvatarFallback">${escape(handle.slice(0, 2).toUpperCase())}</span>`;

  return `<button type="button" class="echoTile${heardAll ? " isViewed" : ""}${active ? " isActive" : ""}" data-echo-user-id="${escape(uid)}" aria-label="${escape(handle)} Echo">
    <span class="echoTileShell${active ? " echoTileShell--pulse" : ""}">
      <span class="echoTileMedia">${imgInner}</span>
      <span class="echoTileWave" aria-hidden="true">${peaksHtml(peaks, "echoBar--tile")}</span>
      ${listenOnce ? '<span class="echoTileOnce" aria-hidden="true">1×</span>' : ""}
    </span>
    <span class="echoTileLabel">${escape(isOwn ? "You" : handle)}</span>
  </button>`;
}

function renderEchoRail(stories) {
  const rail = document.getElementById("friendsEchoRail");
  const scroll = document.getElementById("friendsEchoRailScroll");
  if (!rail || !scroll) return;
  const uid = String(c().getAuthSession()?.user?.id || "");
  const own = _echoStoriesByUser.get(uid) || { userId: uid, username: "", avatar: "", echoes: [] };
  const others = _echoStories.filter((s) => String(s.userId) !== uid);
  // Always show "+" to drop another Echo; when you have live echoes, also show your playable tile.
  const tiles = [echoTileShellHtml(own, { isOwn: true, addTile: true })];
  if ((own.echoes || []).length > 0) {
    tiles.push(echoTileShellHtml(own, { isOwn: true, addTile: false }));
  }
  tiles.push(...others.map((s) => echoTileShellHtml(s)));
  scroll.innerHTML = tiles.join("");
  rail.hidden = !uid;
}

export async function refreshEchoRail(opts = {}) {
  const gen = ++_echoRailGen;
  const uid = c().getAuthSession()?.user?.id;
  if (!uid) {
    const rail = document.getElementById("friendsEchoRail");
    if (rail) rail.hidden = true;
    return;
  }
  hydrateEchoRailCacheFromStorage();
  const cacheFresh = _echoRailCache && Date.now() - _echoRailCacheAt < ECHO_RAIL_CACHE_MS;
  if (opts.useCache && _echoRailCache) {
    indexEchoStories(_echoRailCache);
    renderEchoRail(_echoRailCache);
    if (cacheFresh && !opts.force) return;
  }
  const stories = await fetchEchoRail();
  if (gen !== _echoRailGen) return;
  _echoRailCache = stories;
  _echoRailCacheAt = Date.now();
  persistEchoRailCache();
  indexEchoStories(stories);
  renderEchoRail(stories);
}

function stopEchoPlayback() {
  if (_echoProgressTimer) {
    window.clearInterval(_echoProgressTimer);
    _echoProgressTimer = 0;
  }
  if (_echoRaf) {
    cancelAnimationFrame(_echoRaf);
    _echoRaf = 0;
  }
  const audio = _echoAudio || _echoViewerAudioEl;
  if (audio) {
    try {
      audio.pause();
    } catch {}
  }
  _echoAudio = null;
}

function currentEchoSlide() {
  const story = _echoDeck[_echoDeckIndex];
  return story?.echoes?.[_echoSlideIndex] || null;
}

function slideEchoWithMotion(dir) {
  const sheet = document.getElementById("echoViewerSheet");
  const story = _echoDeck[_echoDeckIndex];
  const max = (story?.echoes?.length || 1) - 1;
  const nextIdx = _echoSlideIndex + dir;
  if (nextIdx < 0) return;
  if (nextIdx > max) {
    closeEchoViewer();
    return;
  }
  if (sheet) sheet.classList.add(dir > 0 ? "isSwipeNext" : "isSwipePrev");
  try {
    c().haptic("light");
  } catch {}
  window.setTimeout(() => {
    _echoSlideIndex = nextIdx;
    playEchoSlide(currentEchoSlide());
    sheet?.classList.remove("isSwipeNext", "isSwipePrev");
  }, 200);
}

function syncEchoViewerUi() {
  const sheet = document.getElementById("echoViewerSheet");
  const who = document.getElementById("echoViewerWho");
  const when = document.getElementById("echoViewerWhen");
  const caption = document.getElementById("echoViewerCaption");
  const reactions = document.getElementById("echoViewerReactions");
  const replyRow = document.getElementById("echoViewerReplyRow");
  const onceBlock = document.getElementById("echoViewerOnceBlock");
  const deleteBtn = document.getElementById("btnEchoDelete");
  const avatarImg = document.getElementById("echoViewerAvatarImg");
  const avatarFb = document.getElementById("echoViewerAvatarFallback");
  const slide = currentEchoSlide();
  const story = _echoDeck[_echoDeckIndex];
  if (!slide || !sheet) return;

  const handle = String(slide.username || story?.username || "").replace(/^@/, "") || "Creator";
  if (who) who.textContent = `@${handle}`;
  if (when) when.textContent = echoRelativeTime(slide.createdAt);
  const av = c().normalizeProfileAvatarForImg(String(slide.avatar || story?.avatar || "").trim());
  if (avatarImg) {
    if (av) {
      avatarImg.src = av;
      avatarImg.hidden = false;
    } else avatarImg.hidden = true;
  }
  if (avatarFb) {
    avatarFb.textContent = handle.slice(0, 2).toUpperCase();
    avatarFb.hidden = Boolean(av);
  }
  paintEchoViewerWave(slide);
  renderEchoViewerDots();
  if (caption) {
    caption.textContent = slide.body || "";
    caption.hidden = !slide.body;
  }
  if (onceBlock) onceBlock.hidden = !slide.listenOnce;
  if (deleteBtn) deleteBtn.hidden = !isOwnEchoSlide(slide);
  const heard = isEchoHeard(slide) || _echoListenMarked;
  const showReact =
    !sheet.classList.contains("needsEchoTap") && (isOwnEchoSlide(slide) || heard || _echoListenMarked);
  if (reactions) reactions.hidden = !showReact;
  if (replyRow) replyRow.hidden = false;

  const status = document.getElementById("echoViewerStatus");
  const tapPlay = document.getElementById("btnEchoTapPlay");
  const audio = _echoAudio || getEchoViewerAudio();
  if (status) {
    if (sheet.classList.contains("isGhost") || sheet.classList.contains("isLocked")) status.textContent = "";
    else if (sheet.classList.contains("needsEchoTap")) status.textContent = "Tap";
    else if (sheet.classList.contains("isLoading")) status.textContent = "";
    else if (sheet.classList.contains("isDissolving")) status.textContent = "";
    else if (sheet.classList.contains("isEnded")) status.textContent = "";
    else if (sheet.classList.contains("isPlaying") || (audio && !audio.paused && !audio.ended)) {
      status.textContent = "";
    } else status.textContent = "";
  }
  if (tapPlay) {
    tapPlay.hidden = !sheet.classList.contains("needsEchoTap");
  }
  sheet.classList.toggle("hasCaption", Boolean(slide.body));

  updateEchoViewerProgress();
  document.querySelectorAll("[data-echo-react]").forEach((btn) => {
    btn.classList.toggle("isActive", btn.getAttribute("data-echo-react") === slide.reaction);
  });
}

function echoViewerTick() {
  const sheet = document.getElementById("echoViewerSheet");
  const mic = document.getElementById("echoViewerMicPulse");
  const wave = document.getElementById("echoViewerWave");
  if (!sheet?.classList.contains("isOpen") || !_echoAudio || !wave) {
    _echoRaf = 0;
    return;
  }
  if (_echoAudio.paused || _echoAudio.ended) {
    _echoRaf = 0;
    return;
  }
  const slide = currentEchoSlide();
  const base = normalizePeaks(slide?.waveformPeaks);
  const bars = wave.querySelectorAll(".echoBar");
  const t = _echoAudio.currentTime || 0;
  let sum = 0;
  bars.forEach((bar, i) => {
    const b = base[i] ?? base[i % Math.max(1, base.length)] ?? 0.3;
    const h = Math.min(1, b * (0.32 + 0.68 * Math.abs(Math.sin(t * 8.5 + i * 0.52))));
    bar.style.setProperty("--bar-h", `${(h * 100).toFixed(1)}%`);
    sum += h;
  });
  if (mic) mic.style.setProperty("--echo-mic", String(Math.min(1, sum / Math.max(1, bars.length * 0.72))));
  updateEchoViewerProgress();
  _echoRaf = requestAnimationFrame(echoViewerTick);
}

async function markEchoListened(slide) {
  if (!slide?.id || _echoListenMarked) return;
  _echoListenMarked = true;
  saveHeardLocal(slide.id);
  slide.listened = true;
  const uid = c().getAuthSession()?.user?.id;
  if (!uid) return;
  try {
    await c().supabaseRestWithAuth("social_echo_listens", {
      method: "POST",
      prefer: "return=minimal",
      body: JSON.stringify({ echo_id: slide.id, user_id: uid }),
    });
  } catch {
    try {
      await c().socialApi("/api/social", {
        method: "POST",
        body: JSON.stringify({ action: "echo_listen", echoId: slide.id }),
      });
    } catch {}
  }
}

function playEchoSlide(slide) {
  bindEchoViewerAudioOnce();
  const sheet = document.getElementById("echoViewerSheet");
  if (!slide?.audioUrl || !sheet) return;
  const listenOnce = Boolean(slide.listenOnce);
  const alreadyHeard = isEchoHeard(slide);
  if (listenOnce && alreadyHeard && !isOwnEchoSlide(slide)) {
    sheet.classList.remove("isPlaying", "isLoading", "needsEchoTap", "isDissolving");
    sheet.classList.add("isLocked", "isGhost");
    paintEchoViewerWave(slide);
    syncEchoViewerUi();
    return;
  }

  sheet.classList.remove("isLocked", "isGhost", "isEnded", "isDissolving", "needsEchoTap", "isPlaying");
  sheet.classList.add("isLoading");
  _echoListenMarked = false;
  paintEchoViewerWave(slide);
  syncEchoViewerUi();

  const directUrl = echoResolvePlayUrl(slide.audioUrl);
  const proxyUrl = echoProxyPlayUrl(slide.audioUrl);
  if (!directUrl) {
    try {
      c().showToast("Echo audio missing", { durationMs: 2600 });
    } catch {}
    return;
  }

  const audio = getEchoViewerAudio();
  _echoAudio = audio;

  const applyUrl = (url) => {
    if (audio.dataset.echoSrc !== url) {
      audio.dataset.echoSrc = url;
      audio.src = url;
      try {
        audio.load();
      } catch {}
    }
  };

  const attempt = (url) => {
    applyUrl(url);
    return audio.play();
  };

  const onPlaying = () => {
    if (_echoProgressTimer) window.clearInterval(_echoProgressTimer);
    _echoProgressTimer = window.setInterval(() => updateEchoViewerProgress(), 200);
    syncEchoViewerUi();
  };

  const showTapFallback = () => {
    sheet.classList.remove("isLoading", "isPlaying");
    sheet.classList.add("needsEchoTap");
    syncEchoViewerUi();
  };

  attempt(directUrl)
    .then(onPlaying)
    .catch(() => {
      if (proxyUrl && proxyUrl !== directUrl) {
        attempt(proxyUrl).then(onPlaying).catch(showTapFallback);
      } else {
        showTapFallback();
      }
    });
}

function buildDeckForUser(userId, slideIndex = 0) {
  const story = _echoStoriesByUser.get(String(userId || ""));
  if (!story?.echoes?.length) return;
  _echoDeck = [story];
  _echoDeckIndex = 0;
  _echoSlideIndex = Math.max(0, Math.min(slideIndex, story.echoes.length - 1));
}

export function openEchoViewer(userId, slideIndex = 0) {
  buildDeckForUser(userId, slideIndex);
  const slide = currentEchoSlide();
  if (!slide) return;
  const sheet = document.getElementById("echoViewerSheet");
  if (!sheet) return;
  sheet.hidden = false;
  sheet.setAttribute("aria-hidden", "false");
  sheet.classList.remove("isLocked", "isGhost", "isEnded", "isDissolving");
  sheet.classList.add("isOpen");
  _echoViewerOpen = true;
  document.body.classList.add("echoViewerOpen");
  syncEchoViewerUi();
  playEchoSlide(slide);
}

export function closeEchoViewer() {
  const sheet = document.getElementById("echoViewerSheet");
  stopEchoPlayback();
  if (!sheet) return;
  sheet.classList.remove("isOpen");
  document.body.classList.remove("echoViewerOpen");
  window.setTimeout(() => {
    sheet.hidden = true;
    sheet.setAttribute("aria-hidden", "true");
    sheet.classList.remove("isLocked", "isGhost", "isEnded", "isDissolving");
  }, 320);
  _echoViewerOpen = false;
}

async function deleteCurrentEcho() {
  const slide = currentEchoSlide();
  if (!slide?.id || !isOwnEchoSlide(slide)) return;
  const echoId = String(slide.id);
  const uid = String(c().getAuthSession()?.user?.id || "");
  const optimistic = isOptimisticEchoId(echoId);
  if (optimistic) _echoDeletedOptIds.add(echoId);
  closeEchoViewer();
  invalidateEchoRailCache();
  removeEchoFromRail(echoId);
  try {
    c().haptic("light");
  } catch {}
  if (optimistic) {
    try {
      c().showToast("Echo removed", { icon: "✓", durationMs: 2200 });
    } catch {}
    return;
  }
  const ok = await deleteEchoFromServer(echoId, uid);
  try {
    c().showToast(
      ok ? "Echo removed" : "Could not remove Echo — try again",
      { icon: ok ? "✓" : undefined, durationMs: ok ? 2200 : 2800 },
    );
  } catch {}
  if (!ok) void refreshEchoRail();
}

async function postEchoReaction(reaction) {
  const slide = currentEchoSlide();
  if (!slide?.id) return;
  try {
    c().haptic("light");
  } catch {}
  slide.reaction = reaction;
  syncEchoViewerUi();
  try {
    await c().socialApi("/api/social", {
      method: "POST",
      body: JSON.stringify({ action: "echo_react", echoId: slide.id, reaction }),
    });
  } catch {
    try {
      const uid = c().getAuthSession()?.user?.id;
      if (uid) {
        await c().supabaseRestWithAuth("social_echo_reactions", {
          method: "POST",
          prefer: "resolution=merge-duplicates",
          body: JSON.stringify({ echo_id: slide.id, user_id: uid, reaction }),
        });
      }
    } catch {}
  }
}

async function echoRequestMicStream() {
  /**
   * Prefer constraints that keep beat-bleed out of the mic when the user is
   * recording with a background loop playing through the device speaker.
   * Fall back to plain audio if the device rejects the constraints object.
   */
  try {
    return await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: { ideal: true },
        noiseSuppression: { ideal: true },
        autoGainControl: { ideal: true },
      },
      video: false,
    });
  } catch (e1) {
    try {
      return await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    } catch (e2) {
      throw new Error(e2?.message || e1?.message || "Microphone unavailable");
    }
  }
}

function echoBeatVariantUrl(beatId, variant) {
  const def = ECHO_BEAT_DEFS[beatId];
  if (!def || !def.variants?.length) return "";
  const idx = Math.max(0, Math.min(def.variants.length - 1, variant | 0));
  return ECHO_BEAT_ASSET_BASE + def.variants[idx];
}

/**
 * Get (or lazily create) the one shared AudioContext.
 * Safe to call out of gesture — won't start playing. Will be unlocked by
 * primeEchoSharedAudioCtx() which MUST be called inside a real gesture.
 */
function ensureEchoSharedAudioCtx() {
  if (_echoSharedAudioCtx && _echoSharedAudioCtx.state !== "closed") {
    return _echoSharedAudioCtx;
  }
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return null;
  try {
    _echoSharedAudioCtx = new Ctx();
  } catch {
    return null;
  }
  return _echoSharedAudioCtx;
}

/**
 * Unlock the shared AudioContext from inside a user-gesture handler. iOS
 * Safari needs resume() to be called synchronously in the same task as the
 * touch/click event — awaits afterward are fine, the context stays running.
 */
function primeEchoSharedAudioCtx() {
  const ctx = ensureEchoSharedAudioCtx();
  if (!ctx) return null;
  if (ctx.state === "suspended") {
    try {
      void ctx.resume().catch(() => {});
    } catch {}
  }
  return ctx;
}

async function loadEchoBeatBuffer(url) {
  if (!url) return null;
  if (_echoBeatBufferCache.has(url)) return _echoBeatBufferCache.get(url);
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error("beat fetch " + res.status);
    const ab = await res.arrayBuffer();
    const ctx = ensureEchoSharedAudioCtx();
    if (!ctx) return null;
    const buf = await new Promise((resolve, reject) => {
      try {
        ctx.decodeAudioData(ab.slice(0), resolve, reject);
      } catch (err) {
        reject(err);
      }
    });
    _echoBeatBufferCache.set(url, buf);
    return buf;
  } catch {
    return null;
  }
}

function stopEchoBeatPreview() {
  if (!_echoBeatPreview) return;
  const { src, gain } = _echoBeatPreview;
  const ctx = _echoSharedAudioCtx;
  _echoBeatPreview = null;
  if (ctx && ctx.state !== "closed") {
    try {
      const t = ctx.currentTime;
      gain.gain.cancelScheduledValues(t);
      gain.gain.setValueAtTime(gain.gain.value, t);
      gain.gain.linearRampToValueAtTime(0, t + 0.18);
    } catch {}
  }
  setTimeout(() => {
    try { src.stop(); } catch {}
    try { src.disconnect(); } catch {}
    try { gain.disconnect(); } catch {}
  }, 240);
}

async function startEchoBeatPreview() {
  stopEchoBeatPreview();
  if (_echoBeatId === "none") return;
  const beatAtRequest = _echoBeatId;
  const variantAtRequest = _echoBeatVariant;
  const url = echoBeatVariantUrl(beatAtRequest, variantAtRequest);
  const buf = await loadEchoBeatBuffer(url);
  if (!buf) return;
  if (_echoBeatId !== beatAtRequest || _echoBeatVariant !== variantAtRequest) return;
  if (echoRecState !== "idle") return;
  const ctx = ensureEchoSharedAudioCtx();
  if (!ctx || ctx.state === "closed") return;
  if (ctx.state === "suspended") {
    try { await ctx.resume(); } catch {}
  }
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.loop = true;
  src.playbackRate.value = ECHO_BEAT_SPEED[_echoBeatSpeed] || 1.0;
  const gain = ctx.createGain();
  gain.gain.value = 0;
  src.connect(gain);
  gain.connect(ctx.destination);
  try { src.start(0); } catch {}
  const t = ctx.currentTime;
  gain.gain.linearRampToValueAtTime(0.55, t + 0.25);
  _echoBeatPreview = { src, gain };
}

function updateEchoBeatPreviewSpeed() {
  if (!_echoBeatPreview) return;
  try {
    _echoBeatPreview.src.playbackRate.value = ECHO_BEAT_SPEED[_echoBeatSpeed] || 1.0;
  } catch {}
}

function stopEchoBeatMixer() {
  if (!_echoBeatMixer) return;
  const { src, beatGain, monitorGain, micSrcNode, micGainNode, destNode } = _echoBeatMixer;
  const ctx = _echoSharedAudioCtx;
  _echoBeatMixer = null;
  if (ctx && ctx.state !== "closed") {
    try {
      const t = ctx.currentTime;
      beatGain.gain.cancelScheduledValues(t);
      beatGain.gain.setValueAtTime(beatGain.gain.value, t);
      beatGain.gain.linearRampToValueAtTime(0, t + 0.4);
      monitorGain.gain.cancelScheduledValues(t);
      monitorGain.gain.setValueAtTime(monitorGain.gain.value, t);
      monitorGain.gain.linearRampToValueAtTime(0, t + 0.4);
    } catch {}
  }
  setTimeout(() => {
    try { src.stop(); } catch {}
    try { src.disconnect(); } catch {}
    try { beatGain.disconnect(); } catch {}
    try { monitorGain.disconnect(); } catch {}
    try { micGainNode?.disconnect(); } catch {}
    try { micSrcNode?.disconnect(); } catch {}
    try { destNode?.disconnect?.(); } catch {}
  }, 520);
}

async function buildEchoBeatMixer(micStream) {
  if (_echoBeatId === "none") return null;
  const url = echoBeatVariantUrl(_echoBeatId, _echoBeatVariant);
  const buf = await loadEchoBeatBuffer(url);
  if (!buf) return null;
  const ctx = ensureEchoSharedAudioCtx();
  if (!ctx || ctx.state === "closed") return null;
  if (ctx.state === "suspended") {
    try { await ctx.resume(); } catch {}
  }
  let micSrcNode;
  try {
    micSrcNode = ctx.createMediaStreamSource(micStream);
  } catch {
    return null;
  }
  const micGainNode = ctx.createGain();
  micGainNode.gain.value = 1.0;
  micSrcNode.connect(micGainNode);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.loop = true;
  src.playbackRate.value = ECHO_BEAT_SPEED[_echoBeatSpeed] || 1.0;
  const beatGain = ctx.createGain();
  beatGain.gain.value = 0;
  src.connect(beatGain);
  // Monitor path so the user hears the beat while recording (for performing).
  // The mic stream has echoCancellation on, so speaker bleed is suppressed.
  // The mix uploaded to friends comes from the clean buffer path, not the mic.
  const monitorGain = ctx.createGain();
  monitorGain.gain.value = 0;
  src.connect(monitorGain);
  monitorGain.connect(ctx.destination);
  const destNode = ctx.createMediaStreamDestination();
  micGainNode.connect(destNode);
  beatGain.connect(destNode);
  try { src.start(0); } catch {}
  const t = ctx.currentTime;
  beatGain.gain.linearRampToValueAtTime(ECHO_BEAT_DUCK_LEVEL, t + 0.22);
  monitorGain.gain.linearRampToValueAtTime(ECHO_BEAT_MONITOR_LEVEL, t + 0.22);
  return {
    src,
    beatGain,
    monitorGain,
    micSrcNode,
    micGainNode,
    destNode,
    stream: destNode.stream,
  };
}

function syncEchoBeatPickerUi() {
  const row = document.getElementById("echoComposeBeatRow");
  const speedRow = document.getElementById("echoComposeSpeedRow");
  if (row) {
    row.querySelectorAll(".echoBeatChip").forEach((chip) => {
      const id = chip.getAttribute("data-echo-beat");
      const active = id === _echoBeatId;
      chip.classList.toggle("is-active", active);
      chip.setAttribute("aria-pressed", active ? "true" : "false");
      chip.classList.toggle("is-variant-0", active && _echoBeatVariant === 0);
      chip.classList.toggle("is-variant-1", active && _echoBeatVariant === 1);
    });
  }
  if (speedRow) {
    speedRow.hidden = _echoBeatId === "none";
    speedRow.querySelectorAll(".echoSpeedChip").forEach((chip) => {
      const s = chip.getAttribute("data-echo-speed");
      const active = s === _echoBeatSpeed;
      chip.classList.toggle("is-active", active);
      chip.setAttribute("aria-pressed", active ? "true" : "false");
    });
  }
}

function handleEchoBeatChipTap(beatId) {
  const def = ECHO_BEAT_DEFS[beatId];
  if (!def) return;
  // CRITICAL: must happen synchronously inside the click handler so iOS
  // Safari/WKWebView accepts the resume() and lets us play audio later.
  primeEchoSharedAudioCtx();
  if (beatId === "none") {
    _echoBeatId = "none";
    _echoBeatVariant = 0;
    stopEchoBeatPreview();
  } else if (_echoBeatId === beatId && def.variants.length > 1) {
    _echoBeatVariant = (_echoBeatVariant + 1) % def.variants.length;
    try { c().haptic("light"); } catch {}
    void startEchoBeatPreview();
  } else {
    _echoBeatId = beatId;
    _echoBeatVariant = 0;
    try { c().haptic("light"); } catch {}
    void startEchoBeatPreview();
  }
  syncEchoBeatPickerUi();
}

function handleEchoSpeedChipTap(speed) {
  if (!ECHO_BEAT_SPEED[speed]) return;
  primeEchoSharedAudioCtx();
  _echoBeatSpeed = speed;
  updateEchoBeatPreviewSpeed();
  try { c().haptic("light"); } catch {}
  syncEchoBeatPickerUi();
}

function wireEchoBeatPickerOnce() {
  const row = document.getElementById("echoComposeBeatRow");
  const speedRow = document.getElementById("echoComposeSpeedRow");
  if (row && !row.dataset.echoBeatBound) {
    row.dataset.echoBeatBound = "1";
    row.addEventListener("click", (e) => {
      const chip = e.target.closest(".echoBeatChip");
      if (!chip) return;
      e.preventDefault();
      handleEchoBeatChipTap(String(chip.getAttribute("data-echo-beat") || "none"));
    });
  }
  if (speedRow && !speedRow.dataset.echoBeatBound) {
    speedRow.dataset.echoBeatBound = "1";
    speedRow.addEventListener("click", (e) => {
      const chip = e.target.closest(".echoSpeedChip");
      if (!chip) return;
      e.preventDefault();
      handleEchoSpeedChipTap(String(chip.getAttribute("data-echo-speed") || "normal"));
    });
  }
}

function formatRecordingTimer(ms) {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function stopEchoComposeTick() {
  if (echoComposeTickRaf) {
    cancelAnimationFrame(echoComposeTickRaf);
    echoComposeTickRaf = 0;
  }
}

function stopLiveEchoWaveform() {
  if (echoComposeLiveRaf) {
    cancelAnimationFrame(echoComposeLiveRaf);
    echoComposeLiveRaf = 0;
  }
  try {
    _echoSource?.disconnect();
  } catch {}
  _echoSource = null;
  _echoAnalyser = null;
  try {
    _echoCtx?.close();
  } catch {}
  _echoCtx = null;
  suspendEchoSfx();
}

function peaksFromAnalyser(analyser) {
  const bins = analyser.frequencyBinCount;
  const data = new Uint8Array(bins);
  analyser.getByteFrequencyData(data);
  const out = [];
  const step = Math.max(1, Math.floor(bins / ECHO_BAR_COUNT));
  for (let i = 0; i < ECHO_BAR_COUNT; i++) {
    let sum = 0;
    let n = 0;
    const start = i * step;
    const end = Math.min(bins, start + step);
    for (let j = start; j < end; j++) {
      sum += data[j];
      n++;
    }
    out.push(n ? sum / n / 255 : 0);
  }
  return c().statusVoiceNormalizePeaks?.(out, ECHO_BAR_COUNT) || out;
}

function updateComposeWaveBars(peaks, extraClass = "") {
  const wave = document.getElementById("echoComposeWave");
  if (!wave) return;
  const norm = normalizePeaks(peaks);
  let bars = wave.querySelectorAll(".echoBar--orbit");
  if (!bars.length) bars = wave.querySelectorAll(".echoBar");
  if (bars.length !== norm.length || !bars[0]?.classList.contains("echoBar--orbit")) {
    wave.innerHTML = peaksHtmlOrbit(norm, extraClass);
    return;
  }
  bars.forEach((bar, i) => {
    const ht = Math.max(0.08, Math.min(1, Number(norm[i]) || 0.28));
    bar.style.setProperty("--bar-h", `${(ht * 100).toFixed(1)}%`);
    bar.classList.toggle("echoBar--live", extraClass.includes("live"));
    bar.classList.toggle("echoBar--breathe", extraClass.includes("breathe"));
  });
}

function tickLiveEchoWaveform() {
  echoComposeLiveRaf = 0;
  if (echoRecState !== "recording" || !_echoAnalyser) return;
  echoPeaks = peaksFromAnalyser(_echoAnalyser);
  updateComposeWaveBars(echoPeaks, "echoBar--live");
  const mic = document.getElementById("echoComposeMicPulse");
  let voice = 0;
  if (echoPeaks.length) {
    let sum = 0;
    for (let i = 0; i < echoPeaks.length; i++) sum += echoPeaks[i];
    voice = Math.min(1, (sum / echoPeaks.length) * 1.5);
    if (mic) mic.style.setProperty("--echo-mic", String(voice));
  }
  const elapsed = Math.max(0, performance.now() - echoStartedAt);
  const pressure = Math.min(1, elapsed / 42000);
  setComposeAtmosphere(voice, pressure);
  echoComposeLiveRaf = requestAnimationFrame(tickLiveEchoWaveform);
}

function startLiveEchoWaveform(stream) {
  stopLiveEchoWaveform();
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx || !stream) return;
  try {
    _echoCtx = new Ctx();
    _echoSource = _echoCtx.createMediaStreamSource(stream);
    _echoAnalyser = _echoCtx.createAnalyser();
    _echoAnalyser.fftSize = 256;
    _echoAnalyser.smoothingTimeConstant = 0.78;
    _echoSource.connect(_echoAnalyser);
    echoComposeLiveRaf = requestAnimationFrame(tickLiveEchoWaveform);
  } catch {
    stopLiveEchoWaveform();
  }
}

function getEchoToneFromUi() {
  const picked = document.querySelector('input[name="echoTone"]:checked');
  const id = String(picked?.value || "").trim().toLowerCase();
  return ECHO_TONE_IDS.includes(id) ? id : ECHO_TONE_DEFAULT;
}

/** Instant path — raw mic upload, no offline polish (fast + reliable on iOS) */
function prepareEchoFromRawRecording() {
  if (!echoRawBlob?.size) return false;
  if (echoRawBlob.size > ECHO_STORAGE_MAX_BYTES) {
    try {
      c().showToast("Echo too large — keep it under 30 seconds.", { durationMs: 3400 });
    } catch {}
    return false;
  }
  echoBlob = echoRawBlob;
  echoTone = getEchoToneFromUi();
  if (echoPeaks.length < 8) {
    echoPeaks = c().statusVoiceFallbackPeaks?.() || normalizePeaks(idleOrbitPeaks());
  } else {
    echoPeaks = normalizePeaks([...echoPeaks]);
  }
  return true;
}

function removeEchoFromRail(echoId) {
  const id = String(echoId || "");
  const echo = _echoById.get(id);
  if (!echo) return;
  const uid = String(echo.userId || "");
  const story = _echoStoriesByUser.get(uid);
  if (!story) return;
  story.echoes = (story.echoes || []).filter((e) => String(e.id) !== id);
  _echoById.delete(id);
  const stories = [..._echoStories.filter((s) => String(s.userId) !== uid), story].filter(
    (s) => (s.echoes || []).length > 0,
  );
  indexEchoStories(stories);
  _echoRailCache = stories;
  _echoRailCacheAt = Date.now();
  renderEchoRail(stories);
}

function echoComposeTick() {
  echoComposeTickRaf = 0;
  if (echoRecState !== "recording") return;
  const timer = document.getElementById("echoComposeTimer");
  if (timer) timer.textContent = formatRecordingTimer(performance.now() - echoStartedAt);
  echoComposeTickRaf = requestAnimationFrame(echoComposeTick);
}

function paintIdleComposeWave() {
  const wave = document.getElementById("echoComposeWave");
  if (!wave) return;
  wave.innerHTML = peaksHtmlOrbit(idleOrbitPeaks(), "echoBar--breathe");
  setComposeAtmosphere(0, 0);
}

function startComposeIdleMotion() {
  stopComposeIdleMotion();
  const tick = () => {
    echoComposeIdleRaf = 0;
    const sheet = document.getElementById("echoComposeSheet");
    if (!sheet?.classList.contains("isOpen") || echoRecState !== "idle") return;
    const wave = document.getElementById("echoComposeWave");
    if (wave && !wave.querySelector(".echoBar--live")) {
      if (!wave.querySelector(".echoBar--breathe")) {
        wave.innerHTML = peaksHtml(normalizePeaks([]), "echoBar--breathe");
      }
    }
    echoComposeIdleRaf = requestAnimationFrame(tick);
  };
  echoComposeIdleRaf = requestAnimationFrame(tick);
}

function stopComposeIdleMotion() {
  if (echoComposeIdleRaf) {
    cancelAnimationFrame(echoComposeIdleRaf);
    echoComposeIdleRaf = 0;
  }
}

function syncEchoListenOnceToggle() {
  const once = document.getElementById("echoListenOnce");
  const btn = document.getElementById("btnEchoListenOnceToggle");
  if (!once || !btn) return;
  const on = Boolean(once.checked);
  btn.classList.toggle("isOn", on);
  btn.setAttribute("aria-pressed", on ? "true" : "false");
  btn.setAttribute("aria-label", on ? "Listen once on" : "Listen once off");
}

function resetEchoUploadState() {
  echoUploadPromise = null;
  echoUploadedUrl = "";
  echoEnhancePromise = null;
}

async function doUploadEchoBlob(blob) {
  const uploaded = await c().uploadStatusVoiceBlob(blob);
  const url = String(uploaded?.url || "").trim();
  if (!url) throw new Error("Voice upload failed");
  echoUploadedUrl = url;
  return uploaded;
}

async function uploadEchoBlobForRelease(blob) {
  if (!blob?.size) throw new Error("No recording to upload");
  if (echoUploadedUrl) return { url: echoUploadedUrl };
  if (echoUploadPromise) {
    try {
      const early = await echoUploadPromise;
      if (early?.url) return early;
    } catch {
      echoUploadPromise = null;
      echoUploadedUrl = "";
    }
  }
  return doUploadEchoBlob(blob);
}

function startEchoUploadEarly() {
  const blob = echoBlob;
  if (!blob?.size) return;
  echoUploadPromise = doUploadEchoBlob(blob).catch((err) => {
    echoUploadPromise = null;
    echoUploadedUrl = "";
    throw err;
  });
}

function resetEchoCompose() {
  stopEchoComposeTick();
  stopLiveEchoWaveform();
  stopComposeIdleMotion();
  stopEchoBeatPreview();
  stopEchoBeatMixer();
  echoMicTouching = false;
  _echoHoldWanted = false;
  _echoHoldPointerId = null;
  _echoArmGen += 1;
  echoRecState = "idle";
  echoChunks = [];
  echoDurationMs = 0;
  echoPeaks = [];
  echoTone = ECHO_TONE_DEFAULT;
  _echoBeatId = "none";
  _echoBeatVariant = 0;
  _echoBeatSpeed = "normal";
  syncEchoBeatPickerUi();
  resetEchoUploadState();
  echoBlob = null;
  echoRawBlob = null;
  if (echoAutostopTimer) {
    window.clearTimeout(echoAutostopTimer);
    echoAutostopTimer = 0;
  }
  if (echoTickRaf) {
    cancelAnimationFrame(echoTickRaf);
    echoTickRaf = 0;
  }
  try {
    echoStream?.getTracks?.().forEach((t) => t.stop());
  } catch {}
  echoStream = null;
  echoRecorder = null;
}

function syncEchoComposeUi() {
  const sheet = document.getElementById("echoComposeSheet");
  const wave = document.getElementById("echoComposeWave");
  const mic = document.getElementById("btnEchoRecord");
  const processing = echoRecState === "processing";
  const releasing = sheet?.classList.contains("isReleasing");
  const busy = processing || releasing;
  const recording = echoRecState === "recording";
  const arming = echoRecState === "arming";

  if (sheet) {
    sheet.classList.toggle("isTouching", echoMicTouching && !busy);
    sheet.classList.toggle("isRecording", recording || arming);
    sheet.classList.toggle("isProcessing", busy);
    sheet.classList.toggle("isReleasing", releasing);
  }

  const primary = document.getElementById("echoComposeStatusPrimary");
  const sub = document.getElementById("echoComposeStatusSub");
  if (primary) {
    if (releasing || processing) primary.textContent = "Sending…";
    else if (recording) primary.textContent = "Release to send";
    else if (arming) primary.textContent = "Starting mic…";
    else primary.textContent = "Hold";
  }
  if (sub) {
    if (recording && !busy) {
      sub.hidden = false;
      sub.textContent = "Recording";
    } else {
      sub.hidden = true;
      sub.textContent = "";
    }
  }
  const recHud = document.getElementById("echoComposeRecHud");
  const timer = document.getElementById("echoComposeTimer");
  const showRecHud = recording && !busy;
  if (recHud) {
    recHud.hidden = !showRecHud;
    recHud.setAttribute("aria-hidden", showRecHud ? "false" : "true");
  }
  if (timer) {
    const showTimer = recording || arming || busy;
    if (!recHud) {
      timer.hidden = !showTimer;
      timer.setAttribute("aria-hidden", showTimer ? "false" : "true");
    }
    if (recording && !busy) {
      timer.textContent = formatRecordingTimer(performance.now() - echoStartedAt);
    } else if (!recording) {
      timer.textContent = "00:00";
    }
  }
  if (!recording && !busy) setComposeAtmosphere(0, 0);

  if (mic) {
    mic.classList.toggle("isRecording", recording || arming);
    mic.classList.toggle("isBusy", busy);
    mic.setAttribute("aria-pressed", recording || arming ? "true" : "false");
    mic.setAttribute(
      "aria-label",
      busy ? "Processing Echo" : recording || arming ? "Release to send" : "Hold to record",
    );
  }
  if (wave) {
    if (recording) {
      updateComposeWaveBars(echoPeaks.length ? echoPeaks : normalizePeaks([]), "echoBar--live");
    } else if (busy) {
      stopComposeIdleMotion();
      if (echoPeaks.length) updateComposeWaveBars(echoPeaks, "echoBar--live");
    } else {
      paintIdleComposeWave();
      startComposeIdleMotion();
    }
  }
  syncEchoListenOnceToggle();
}

function dismissEchoComposeSheet() {
  const sheet = document.getElementById("echoComposeSheet");
  if (sheet) {
    sheet.classList.remove("isOpen", "isRecording", "isProcessing", "isReleasing", "isTouching");
    sheet.hidden = true;
    sheet.setAttribute("aria-hidden", "true");
  }
  document.body.classList.remove("echoComposeOpen");
  resetEchoCompose();
  _echoReplyToId = "";
}

function landOnFriendsAfterEcho() {
  try {
    if (String(location.hash || "") !== "#/friends") location.hash = "#/friends";
    c().enterFriendsRoute?.();
  } catch {}
}

async function startEchoRecording() {
  if (echoRecState === "recording" || echoRecState === "processing" || echoRecState === "arming") return;
  if (echoRawBlob || echoBlob) {
    echoBlob = null;
    echoRawBlob = null;
    echoPeaks = [];
    resetEchoUploadState();
  }
  const armGen = ++_echoArmGen;
  echoRecState = "arming";
  syncEchoComposeUi();
  let stream;
  try {
    stream = await echoRequestMicStream();
  } catch {
    if (armGen !== _echoArmGen) return;
    echoRecState = "idle";
    syncEchoComposeUi();
    try {
      c().showToast("Microphone permission needed.", { durationMs: 2800 });
    } catch {}
    return;
  }
  if (armGen !== _echoArmGen || echoRecState !== "arming" || !_echoHoldWanted) {
    try {
      stream.getTracks().forEach((t) => t.stop());
    } catch {}
    if (armGen === _echoArmGen && echoRecState === "arming") {
      echoRecState = "idle";
      syncEchoComposeUi();
    }
    return;
  }
  // Stop the in-compose preview before we wire the same beat into the
  // recording mixer — avoids double-playing the loop through speakers.
  stopEchoBeatPreview();
  let recStream = stream;
  if (_echoBeatId !== "none") {
    try {
      const mixer = await buildEchoBeatMixer(stream);
      if (mixer) {
        if (armGen !== _echoArmGen || echoRecState !== "arming" || !_echoHoldWanted) {
          // User released before the mixer finished arming — tear it down.
          _echoBeatMixer = mixer;
          stopEchoBeatMixer();
          try { stream.getTracks().forEach((t) => t.stop()); } catch {}
          if (armGen === _echoArmGen && echoRecState === "arming") {
            echoRecState = "idle";
            syncEchoComposeUi();
          }
          return;
        }
        _echoBeatMixer = mixer;
        recStream = mixer.stream;
      }
    } catch {}
  }
  const mimeType = c().pickRecorderMimeType?.() || "";
  let rec;
  try {
    const recOpts = mimeType
      ? { mimeType, audioBitsPerSecond: ECHO_REC_BITRATE }
      : { audioBitsPerSecond: ECHO_REC_BITRATE };
    rec = new MediaRecorder(recStream, recOpts);
  } catch {
    try {
      rec = mimeType ? new MediaRecorder(recStream, { mimeType }) : new MediaRecorder(recStream);
    } catch {
      rec = null;
    }
  }
  if (!rec) {
    stopEchoBeatMixer();
    try {
      c().showToast("Recording not supported here.", { durationMs: 2600 });
    } catch {}
    try {
      stream.getTracks().forEach((t) => t.stop());
    } catch {}
    echoRecState = "idle";
    syncEchoComposeUi();
    return;
  }
  echoStream = stream;
  echoRecorder = rec;
  echoChunks = [];
  echoRecState = "recording";
  echoStartedAt = performance.now();
  try {
    c().haptic("light");
  } catch {}
  rec.ondataavailable = (e) => {
    if (e.data?.size) echoChunks.push(e.data);
  };
  rec.onstop = () => {
    stopLiveEchoWaveform();
    stopEchoComposeTick();
    stopEchoBeatMixer();
    echoDurationMs = Math.min(ECHO_MAX_MS, performance.now() - echoStartedAt);
    const raw = new Blob(echoChunks, { type: rec.mimeType || "audio/webm" });
    echoRawBlob = raw.size ? raw : null;
    echoBlob = null;
    echoTone = getEchoToneFromUi();
    try {
      c().haptic("medium");
    } catch {}
    try {
      echoStream?.getTracks?.().forEach((t) => t.stop());
    } catch {}
    echoStream = null;
    if (!echoRawBlob) {
      echoRecState = "idle";
      syncEchoComposeUi();
      try {
        c().showToast("Hold a little longer, then release.", { durationMs: 2800 });
      } catch {}
      return;
    }
    echoMicTouching = false;
    echoRecState = "processing";
    syncEchoComposeUi();
    echoEnhancePromise = (async () => {
      try {
        if (!prepareEchoFromRawRecording()) {
          echoRecState = "idle";
          syncEchoComposeUi();
          return;
        }
        resetEchoUploadState();
        startEchoUploadEarly();
        await publishEcho({ auto: true, fromEnhance: true });
      } catch (e) {
        echoRecState = "idle";
        const sheet = document.getElementById("echoComposeSheet");
        if (sheet) sheet.classList.remove("isReleasing", "isProcessing");
        _echoPublishing = false;
        syncEchoComposeUi();
        try {
          c().showToast(String(e?.message || "Could not post Echo"), { durationMs: 3200 });
        } catch {}
      }
    })();
  };
  startLiveEchoWaveform(stream);
  try {
    rec.start();
  } catch {
    stopEchoBeatMixer();
    try {
      stream.getTracks().forEach((t) => t.stop());
    } catch {}
    echoRecState = "idle";
    syncEchoComposeUi();
    try {
      c().showToast("Could not start recording.", { durationMs: 2600 });
    } catch {}
    return;
  }
  syncEchoComposeUi();
  stopEchoComposeTick();
  echoComposeTickRaf = requestAnimationFrame(echoComposeTick);
  echoAutostopTimer = window.setTimeout(() => {
    if (echoRecState === "recording") stopEchoRecording();
  }, ECHO_MAX_MS);
}

function stopEchoRecording() {
  if (echoRecState !== "recording" || !echoRecorder) return;
  const elapsed = performance.now() - echoStartedAt;
  if (elapsed < ECHO_MIN_RECORD_MS) {
    window.setTimeout(() => {
      if (echoRecState === "recording") stopEchoRecording();
    }, ECHO_MIN_RECORD_MS - elapsed);
    return;
  }
  stopLiveEchoWaveform();
  if (echoAutostopTimer) {
    window.clearTimeout(echoAutostopTimer);
    echoAutostopTimer = 0;
  }
  try {
    echoRecorder.stop();
  } catch {
    echoRecState = "idle";
    syncEchoComposeUi();
  }
}

export function openEchoComposeSheet({ replyTo = "", haptic: wantHaptic = true } = {}) {
  _echoReplyToId = String(replyTo || "").trim();
  _echoComposeIgnoreInputUntil = performance.now() + 80;
  resetEchoCompose();
  const sheet = document.getElementById("echoComposeSheet");
  if (!sheet) return;
  const once = document.getElementById("echoListenOnce");
  if (once) once.checked = false;
  const cap = document.getElementById("echoComposeCaption");
  if (cap) cap.value = "";
  const naturalTone = document.querySelector('input[name="echoTone"][value="natural"]');
  if (naturalTone) naturalTone.checked = true;
  sheet.hidden = false;
  sheet.setAttribute("aria-hidden", "false");
  sheet.classList.remove("isRecording", "isReleasing", "isProcessing");
  sheet.classList.add("isOpen");
  document.body.classList.add("echoComposeOpen");
  paintIdleComposeWave();
  syncEchoComposeUi();
  syncEchoBeatPickerUi();
  if (wantHaptic) {
    try {
      c().haptic("light");
    } catch {}
  }
}

export function closeEchoComposeSheet(opts = {}) {
  const sheet = document.getElementById("echoComposeSheet");
  if (
    !opts.force &&
    (sheet?.classList.contains("isProcessing") || sheet?.classList.contains("isReleasing"))
  ) {
    return;
  }
  dismissEchoComposeSheet();
}

function ownEchoProfileFromRail(uid) {
  const story = _echoStoriesByUser.get(String(uid || ""));
  return story ? { username: story.username || "", avatar: story.avatar || "" } : null;
}

async function finishEchoPublishBackground({
  optimisticId,
  localUrl,
  peaks,
  caption,
  listenOnce,
  uid,
  prof,
  blob,
  rawFallback,
  durationMs,
  uploadPromise,
  uploadedUrl,
}) {
  const sendBlob = blob?.size ? blob : rawFallback?.size ? rawFallback : null;
  if (!sendBlob?.size) {
    removeEchoFromRail(optimisticId);
    try {
      c().showToast("No recording to upload — try holding the mic a little longer.", { durationMs: 3200 });
    } catch {}
    if (localUrl) {
      try {
        URL.revokeObjectURL(localUrl);
      } catch {}
    }
    return;
  }
  let uploadedOk = false;
  try {
    let remoteUrl = String(uploadedUrl || "").trim();
    if (!remoteUrl && uploadPromise) {
      try {
        const early = await uploadPromise;
        remoteUrl = String(early?.url || "").trim();
      } catch {}
    }
    if (!remoteUrl) {
      const uploaded = await c().uploadStatusVoiceBlob(sendBlob);
      remoteUrl = String(uploaded?.url || "").trim();
    }
    if (!remoteUrl) throw new Error("Voice upload failed");
    const wasDeleted = _echoDeletedOptIds.has(optimisticId);
    if (!wasDeleted) {
      patchEchoInRail(optimisticId, { audioUrl: remoteUrl });
    }
    const expiresAt = new Date(Date.now() + 86400000).toISOString();
    const rowBody = {
      user_id: uid,
      audio_url: remoteUrl,
      duration_ms: durationMs,
      waveform_peaks: peaks,
      body: caption || null,
      listen_once: listenOnce,
      reply_to: _echoReplyToId || null,
      expires_at: expiresAt,
    };
    let row = null;
    const r = await c().supabaseRestWithAuth("social_echoes", {
      method: "POST",
      prefer: "return=representation",
      body: JSON.stringify(rowBody),
    });
    if (r?.ok) {
      const data = await r.json().catch(() => []);
      row = Array.isArray(data) && data[0] ? data[0] : null;
    }
    let serverEchoId = "";
    if (!row) {
      const data = await c().socialApi("/api/social", {
        method: "POST",
        body: JSON.stringify({
          action: "post_echo",
          audioUrl: remoteUrl,
          durationMs,
          waveformPeaks: peaks,
          body: caption,
          listenOnce,
          replyTo: _echoReplyToId || null,
        }),
      });
      if (data?.echo) serverEchoId = String(data.echo.id || "");
    } else {
      serverEchoId = String(row.id || "");
    }
    if (wasDeleted) {
      _echoDeletedOptIds.delete(optimisticId);
      if (serverEchoId) await deleteEchoFromServer(serverEchoId, uid);
      removeEchoFromRail(optimisticId);
      if (serverEchoId) removeEchoFromRail(serverEchoId);
    } else if (serverEchoId) {
      patchEchoInRail(optimisticId, {
        id: serverEchoId,
        audioUrl: remoteUrl,
        waveformPeaks: peaks,
        body: caption,
        listenOnce,
        expiresAt,
      });
    }
    uploadedOk = true;
    resetEchoUploadState();
  } catch (e) {
    removeEchoFromRail(optimisticId);
    try {
      const msg = String(e?.message || "");
      const hint = /upload failed|413|payload|too large/i.test(msg)
        ? " Try a shorter Echo (under 30s)."
        : "";
      c().showToast((msg || "Could not post Echo") + hint, { durationMs: 3600 });
    } catch {}
  } finally {
    if (localUrl && uploadedOk) {
      try {
        URL.revokeObjectURL(localUrl);
      } catch {}
    }
    echoEnhancePromise = null;
  }
}

async function publishEcho(opts = {}) {
  if (_echoPublishing) return;
  if (echoEnhancePromise && !opts.fromEnhance) {
    try {
      await echoEnhancePromise;
    } catch {}
  }
  const publishBlob = echoBlob?.size ? echoBlob : echoRawBlob?.size ? echoRawBlob : null;
  if (!publishBlob?.size) return;
  _echoPublishing = true;
  const sheet = document.getElementById("echoComposeSheet");
  if (sheet) sheet.classList.add("isReleasing");
  syncEchoComposeUi();
  const onceEl = document.getElementById("echoListenOnce");
  const caption = String(document.getElementById("echoComposeCaption")?.value || "").trim().slice(0, ECHO_CAPTION_MAX);
  const listenOnce = Boolean(onceEl?.checked);
  const uid = c().getAuthSession()?.user?.id;
  if (!uid) {
    _echoPublishing = false;
    if (sheet) sheet.classList.remove("isReleasing");
    return;
  }
  const publishDurationMs = echoDurationMs;
  const publishRaw = echoRawBlob?.size ? echoRawBlob : null;
  const publishUploadPromise = echoUploadPromise;
  const publishUploadedUrl = echoUploadedUrl;
  const peaks =
    echoPeaks.length >= 8 ? [...echoPeaks] : c().statusVoiceFallbackPeaks?.() || normalizePeaks(idleOrbitPeaks());
  const expiresAt = new Date(Date.now() + 86400000).toISOString();
  const prof = ownEchoProfileFromRail(uid);
  const optimisticId = `opt-${Date.now()}`;
  let localUrl = "";
  try {
    localUrl = URL.createObjectURL(publishBlob);
  } catch {}
  mergeEchoIntoRail(
    mapEchoFromApi({
      id: optimisticId,
      userId: uid,
      audioUrl: localUrl || "",
      durationMs: publishDurationMs,
      waveformPeaks: peaks,
      body: caption,
      listenOnce,
      replyTo: _echoReplyToId || null,
      createdAt: new Date().toISOString(),
      expiresAt,
      username: prof?.username || "",
      avatar: prof?.avatar || "",
      listened: false,
      reaction: "",
      reactionCounts: {},
    }),
    prof,
  );
  dismissEchoComposeSheet();
  landOnFriendsAfterEcho();
  _echoPublishing = false;
  showEchoSentCelebration();
  void finishEchoPublishBackground({
    optimisticId,
    localUrl,
    peaks,
    caption,
    listenOnce,
    uid,
    prof,
    blob: publishBlob,
    rawFallback: publishRaw,
    durationMs: publishDurationMs,
    uploadPromise: publishUploadPromise,
    uploadedUrl: publishUploadedUrl,
  });
}

export function openEchoFromCreateChooser() {
  if (!c().getAuthSession()?.user?.id) {
    try {
      c().showToast("Sign in to drop an Echo", { durationMs: 2400 });
    } catch {}
    return;
  }
  openEchoComposeSheet({ haptic: false });
  _pendingEchoCompose = false;
  const onFriends = String(location.hash || "") === "#/friends";
  if (!onFriends) {
    try {
      location.hash = "#/friends";
    } catch {}
  } else {
    c().enterFriendsRoute?.();
  }
  window.requestAnimationFrame(() => {
    try {
      c().haptic("light");
    } catch {}
  });
}

export function onEnterFriendsRoute() {
  void refreshEchoRail({ useCache: true });
  const sheet = document.getElementById("echoComposeSheet");
  if (_pendingEchoCompose) {
    _pendingEchoCompose = false;
    if (!sheet?.classList.contains("isOpen")) openEchoComposeSheet();
  }
}

function wireEchoOnce() {
  if (document.documentElement.dataset.echoWired) return;
  document.documentElement.dataset.echoWired = "1";

  document.getElementById("friendsEchoRailScroll")?.addEventListener("click", (e) => {
    const add = e.target.closest("[data-echo-add]");
    if (add) {
      e.preventDefault();
      try {
        c().haptic("light");
      } catch {}
      if (!c().getAuthSession()?.user?.id) {
        try {
          c().showToast("Sign in to drop an Echo", { durationMs: 2400 });
        } catch {}
        return;
      }
      openEchoComposeSheet();
      return;
    }
    const tile = e.target.closest("[data-echo-user-id]");
    if (!tile || tile.closest("[data-echo-add]")) return;
    e.preventDefault();
    try {
      c().haptic("light");
    } catch {}
    const userId = tile.getAttribute("data-echo-user-id");
    const story = _echoStoriesByUser.get(String(userId || ""));
    const slide = story?.echoes?.[0];
    const audio = getEchoViewerAudio();
    try {
      c().primeAudioElementInGesture?.(audio);
    } catch {}
    if (slide?.audioUrl) preloadEchoAudio(slide.audioUrl);
    openEchoViewer(userId, 0);
  });

  document.getElementById("friendsEchoRailScroll")?.addEventListener(
    "pointerdown",
    (e) => {
      const tile = e.target.closest("[data-echo-user-id]");
      if (!tile || tile.closest("[data-echo-add]")) return;
      const uid = tile.getAttribute("data-echo-user-id");
      const story = _echoStoriesByUser.get(String(uid || ""));
      const slide = story?.echoes?.[0];
      if (slide?.audioUrl) preloadEchoAudio(slide.audioUrl);
    },
    { passive: true },
  );

  document.getElementById("btnEchoDelete")?.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    void deleteCurrentEcho();
  });

  document.getElementById("echoViewerDots")?.addEventListener("click", (e) => {
    const dot = e.target.closest("[data-echo-dot]");
    if (!dot) return;
    e.preventDefault();
    const idx = Number(dot.getAttribute("data-echo-dot"));
    if (!Number.isFinite(idx)) return;
    _echoSlideIndex = idx;
    playEchoSlide(currentEchoSlide());
  });

  const retryEchoPlay = () => {
    const sheet = document.getElementById("echoViewerSheet");
    const slide = currentEchoSlide();
    if (!sheet || !slide || !sheet.classList.contains("needsEchoTap")) return;
    const audio = _echoAudio || getEchoViewerAudio();
    sheet.classList.add("isLoading");
    sheet.classList.remove("needsEchoTap");
    syncEchoViewerUi();
    audio
      .play()
      .then(() => {
        if (_echoProgressTimer) window.clearInterval(_echoProgressTimer);
        _echoProgressTimer = window.setInterval(() => updateEchoViewerProgress(), 200);
      })
      .catch(() => {
        sheet.classList.add("needsEchoTap");
        syncEchoViewerUi();
      });
  };

  document.getElementById("btnEchoTapPlay")?.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    retryEchoPlay();
  });

  document.getElementById("echoViewerCore")?.addEventListener("click", (e) => {
    if (e.target.closest(".echoViewerClose, .echoViewerDelete, .echoReactBtn, #btnEchoReply, #btnEchoTapPlay")) {
      return;
    }
    const sheet = document.getElementById("echoViewerSheet");
    if (sheet?.classList.contains("needsEchoTap")) retryEchoPlay();
  });

  document.getElementById("echoViewerBackdrop")?.addEventListener("click", () => closeEchoViewer());
  document.getElementById("btnEchoViewerClose")?.addEventListener("click", () => closeEchoViewer());
  document.getElementById("echoViewerTapPrev")?.addEventListener("click", () => slideEchoWithMotion(-1));
  document.getElementById("echoViewerTapNext")?.addEventListener("click", () => slideEchoWithMotion(1));

  const viewerStage = document.getElementById("echoViewerStage");
  if (viewerStage && !viewerStage.dataset.echoSwipeWired) {
    viewerStage.dataset.echoSwipeWired = "1";
    viewerStage.addEventListener(
      "pointerdown",
      (e) => {
        if (e.target.closest("button, .echoViewerFooter, .echoViewerTop")) return;
        _echoSwipeX = e.clientX;
      },
      { passive: true },
    );
    viewerStage.addEventListener(
      "pointerup",
      (e) => {
        if (!_echoSwipeX) return;
        const dx = e.clientX - _echoSwipeX;
        _echoSwipeX = 0;
        if (Math.abs(dx) < 56) return;
        slideEchoWithMotion(dx < 0 ? 1 : -1);
      },
      { passive: true },
    );
  }

  document.querySelectorAll("[data-echo-react]").forEach((btn) => {
    btn.addEventListener("click", () => {
      void postEchoReaction(btn.getAttribute("data-echo-react"));
    });
  });
  document.getElementById("btnEchoReply")?.addEventListener("click", () => {
    const slide = currentEchoSlide();
    try {
      c().haptic("light");
    } catch {}
    closeEchoViewer();
    openEchoComposeSheet({ replyTo: slide?.id || "" });
  });

  document.getElementById("echoComposeBackdrop")?.addEventListener("click", () => closeEchoComposeSheet());
  document.getElementById("btnEchoComposeClose")?.addEventListener("click", () => closeEchoComposeSheet());
  document.getElementById("btnEchoListenOnceToggle")?.addEventListener("click", () => {
    const once = document.getElementById("echoListenOnce");
    if (!once) return;
    once.checked = !once.checked;
    syncEchoListenOnceToggle();
    if (once.checked) playEchoSfxAfterGesture("lock");
    try {
      c().haptic("light");
    } catch {}
  });
  wireEchoRecordHold();

  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (document.getElementById("echoComposeSheet")?.classList.contains("isOpen")) closeEchoComposeSheet();
    else if (document.getElementById("echoViewerSheet")?.classList.contains("isOpen")) closeEchoViewer();
  });
}

function wireEchoRecordHold() {
  const mic = document.getElementById("btnEchoRecord");
  if (!mic || mic.dataset.echoHoldWired) return;
  mic.dataset.echoHoldWired = "1";

  const endHold = (pointerId) => {
    if (_echoHoldPointerId === null || (pointerId !== undefined && pointerId !== _echoHoldPointerId)) {
      return;
    }
    _echoHoldPointerId = null;
    _echoHoldWanted = false;
    echoMicTouching = false;
    const sheet = document.getElementById("echoComposeSheet");
    sheet?.classList.remove("isTouching");
    if (echoRecState === "arming") {
      _echoArmGen += 1;
      echoRecState = "idle";
      try {
        echoStream?.getTracks?.().forEach((t) => t.stop());
      } catch {}
      echoStream = null;
      syncEchoComposeUi();
      return;
    }
    syncEchoComposeUi();
    if (echoRecState === "recording") stopEchoRecording();
  };

  if (!document.documentElement.dataset.echoHoldDocWired) {
    document.documentElement.dataset.echoHoldDocWired = "1";
    document.addEventListener(
      "pointerup",
      (e) => endHold(e.pointerId),
      true,
    );
    document.addEventListener(
      "pointercancel",
      (e) => endHold(e.pointerId),
      true,
    );
  }

  const startHold = (e) => {
    if (e.button !== undefined && e.button !== 0) return;
    const sheet = document.getElementById("echoComposeSheet");
    if (!sheet?.classList.contains("isOpen")) return;
    if (performance.now() < _echoComposeIgnoreInputUntil) return;
    if (echoRecState === "arming" || echoRecState === "processing" || sheet.classList.contains("isReleasing")) {
      return;
    }
    // Unlock the shared AudioContext synchronously here too, so the mixer
    // built later (after async getUserMedia) finds a running context even
    // when the user never previewed a beat first.
    if (_echoBeatId !== "none") primeEchoSharedAudioCtx();
    _echoHoldPointerId = e.pointerId;
    _echoHoldWanted = true;
    echoMicTouching = true;
    sheet.classList.add("isTouching");
    try {
      c().haptic("light");
    } catch {}
    if (echoRecState !== "recording") void startEchoRecording();
  };

  mic.addEventListener("pointerdown", startHold);

  mic.addEventListener("click", (e) => {
    e.preventDefault();
    if (echoRecState !== "recording" && echoRecState !== "processing") {
      try {
        c().haptic("light");
      } catch {}
    }
  });
}

export function initEcho(appCtx) {
  ctx = appCtx;
  wireEchoOnce();
  wireEchoBeatPickerOnce();
}
