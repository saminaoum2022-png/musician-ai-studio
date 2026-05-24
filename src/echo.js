/**
 * Echo — ephemeral creator audio moments (24h).
 * Wired from app.js via initEcho(ctx).
 */
import { applyEchoTone, echoToneHint, ECHO_TONE_DEFAULT, ECHO_TONE_IDS } from "./echo-tone.js";

const ECHO_BAR_COUNT = 48;
const ECHO_MAX_MS = 60000;
const ECHO_MAX_BYTES = 768 * 1024;
const ECHO_HEARD_KEY = "nabad_echo_heard_v1";
const ECHO_CAPTION_MAX = 60;

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
      return `<span class="echoBar ${tint} ${extraClass}" style="--bar-h:${(ht * 100).toFixed(1)}%"></span>`;
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
    sheet.classList.add("isEnded");
    if (slide?.listenOnce && !isOwnEchoSlide(slide)) sheet.classList.add("isLocked");
    stopEchoPlayback();
    syncEchoViewerUi();
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

function mergeEchoIntoRail(echo, prof) {
  const uid = String(echo.userId || "");
  if (!uid) return;
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
  const following = await c().fetchFollowingListViaSupabase();
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
  const cacheFresh = _echoRailCache && Date.now() - _echoRailCacheAt < ECHO_RAIL_CACHE_MS;
  if (opts.useCache && _echoRailCache) {
    indexEchoStories(_echoRailCache);
    renderEchoRail(_echoRailCache);
    if (cacheFresh && !opts.force) return;
  }
  const stories = await fetchEchoRail();
  if (gen !== _echoRailGen) return;
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

function syncEchoViewerUi() {
  const sheet = document.getElementById("echoViewerSheet");
  const who = document.getElementById("echoViewerWho");
  const when = document.getElementById("echoViewerWhen");
  const caption = document.getElementById("echoViewerCaption");
  const reactions = document.getElementById("echoViewerReactions");
  const reactTip = document.getElementById("echoViewerReactTip");
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
  const ended = sheet.classList.contains("isEnded");
  const showReact = heard || ended;
  if (reactions) reactions.hidden = !showReact;
  if (reactTip) reactTip.hidden = !showReact;

  const status = document.getElementById("echoViewerStatus");
  const tapPlay = document.getElementById("btnEchoTapPlay");
  const audio = _echoAudio || getEchoViewerAudio();
  if (status) {
    if (sheet.classList.contains("isLocked")) status.textContent = "Already heard";
    else if (sheet.classList.contains("needsEchoTap")) status.textContent = "Tap to listen";
    else if (sheet.classList.contains("isLoading")) status.textContent = "Starting…";
    else if (sheet.classList.contains("isEnded")) status.textContent = "Finished";
    else if (sheet.classList.contains("isPlaying") || (audio && !audio.paused && !audio.ended)) {
      status.textContent = "Playing";
    } else status.textContent = "Listen";
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
    sheet.classList.remove("isPlaying", "isLoading", "needsEchoTap");
    sheet.classList.add("isLocked");
    paintEchoViewerWave(slide);
    syncEchoViewerUi();
    return;
  }

  sheet.classList.remove("isLocked", "isEnded", "needsEchoTap", "isPlaying");
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
  sheet.classList.remove("isLocked", "isEnded");
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
    sheet.classList.remove("isLocked", "isEnded");
  }, 280);
  _echoViewerOpen = false;
  void refreshEchoRail({ useCache: true });
}

async function deleteCurrentEcho() {
  const slide = currentEchoSlide();
  if (!slide?.id || !isOwnEchoSlide(slide)) return;
  const echoId = String(slide.id);
  closeEchoViewer();
  invalidateEchoRailCache();
  const uid = String(c().getAuthSession()?.user?.id || "");
  const story = _echoStoriesByUser.get(uid);
  if (story) {
    story.echoes = (story.echoes || []).filter((e) => String(e.id) !== echoId);
    indexEchoStories([..._echoStoriesByUser.values()].filter((s) => (s.echoes || []).length > 0));
    renderEchoRail();
  }
  try {
    c().haptic("light");
  } catch {}
  let ok = false;
  try {
    const r = await c().supabaseRestWithAuth(
      `social_echoes?id=eq.${encodeURIComponent(echoId)}&user_id=eq.${encodeURIComponent(uid)}`,
      { method: "DELETE", prefer: "return=minimal" },
    );
    ok = r?.ok;
  } catch {}
  if (!ok) {
    try {
      await c().socialApi("/api/social", {
        method: "POST",
        body: JSON.stringify({ action: "delete_echo", echoId }),
      });
    } catch {}
  }
  try {
    c().showToast("Echo removed", { icon: "✓", durationMs: 2200 });
  } catch {}
  void refreshEchoRail();
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

function tickLiveEchoWaveform() {
  echoComposeLiveRaf = 0;
  if (echoRecState !== "recording" || !_echoAnalyser) return;
  echoPeaks = peaksFromAnalyser(_echoAnalyser);
  const wave = document.getElementById("echoComposeWave");
  if (wave) wave.innerHTML = peaksHtml(echoPeaks, "echoBar--live");
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

function syncEchoToneUi() {
  const wrap = document.getElementById("echoTonePicker");
  const hint = document.getElementById("echoToneHint");
  if (!wrap) return;
  const hasBlob = Boolean(echoRawBlob?.size);
  const processing = echoRecState === "processing";
  wrap.hidden = !hasBlob || processing;
  wrap.querySelectorAll(".echoToneChip").forEach((chip) => {
    const input = chip.querySelector('input[name="echoTone"]');
    chip.classList.toggle("isActive", input?.checked);
  });
  if (hint && hasBlob && !processing) {
    hint.textContent = echoToneHint(getEchoToneFromUi());
    hint.hidden = false;
  } else if (hint) hint.hidden = true;
}

async function applyEchoToneToCapture(tone) {
  if (!echoRawBlob?.size) return;
  echoTone = tone;
  echoRecState = "processing";
  syncEchoComposeUi();
  try {
    echoBlob = await applyEchoTone(echoRawBlob, echoTone, { pickMime: c().pickRecorderMimeType });
  } catch {
    echoBlob = echoRawBlob;
  }
  echoRecState = "idle";
  resetEchoUploadState();
  echoPeaks = await c().computeStatusWaveformPeaks(echoBlob, ECHO_BAR_COUNT);
  startEchoUploadEarly();
  syncEchoComposeUi();
}

function scheduleEchoToneRework(tone) {
  if (!echoRawBlob?.size || echoRecState === "recording") return;
  void (async () => {
    if (echoEnhancePromise) {
      try {
        await echoEnhancePromise;
      } catch {}
    }
    if (getEchoToneFromUi() !== tone) return;
    echoEnhancePromise = applyEchoToneToCapture(tone);
    try {
      await echoEnhancePromise;
    } catch {}
  })();
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
  wave.innerHTML = peaksHtml(normalizePeaks([]));
}

function syncEchoCaptionCount() {
  const cap = document.getElementById("echoComposeCaption");
  const count = document.getElementById("echoComposeCaptionCount");
  if (!cap || !count) return;
  count.textContent = `${cap.value.length}/${ECHO_CAPTION_MAX}`;
}

function openEchoListenOnceInfo() {
  const sheet = document.getElementById("echoListenOnceInfoSheet");
  if (!sheet) return;
  sheet.hidden = false;
  sheet.setAttribute("aria-hidden", "false");
  requestAnimationFrame(() => sheet.classList.add("isOpen"));
}

function closeEchoListenOnceInfo() {
  const sheet = document.getElementById("echoListenOnceInfoSheet");
  if (!sheet) return;
  sheet.classList.remove("isOpen");
  window.setTimeout(() => {
    sheet.hidden = true;
    sheet.setAttribute("aria-hidden", "true");
  }, 260);
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
  if (!echoBlob?.size) return;
  echoUploadPromise = doUploadEchoBlob(echoBlob).catch((err) => {
    echoUploadPromise = null;
    echoUploadedUrl = "";
    throw err;
  });
}

function resetEchoCompose() {
  stopEchoComposeTick();
  stopLiveEchoWaveform();
  echoRecState = "idle";
  echoChunks = [];
  echoDurationMs = 0;
  echoPeaks = [];
  echoTone = ECHO_TONE_DEFAULT;
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
  const publish = document.getElementById("btnEchoPublish");
  const mic = document.getElementById("btnEchoRecord");
  const noPreview = document.getElementById("echoComposeNoPreview");
  const processing = echoRecState === "processing";
  const hasBlob = Boolean(echoBlob?.size) && !processing;
  const recording = echoRecState === "recording";

  if (sheet) {
    sheet.classList.toggle("isRecording", recording);
    sheet.classList.toggle("isProcessing", processing);
    sheet.classList.toggle("hasEchoReady", hasBlob && !recording);
  }

  const hud = document.getElementById("echoComposeRecHud");
  if (hud) {
    const showHud = recording && echoRecState === "recording";
    hud.hidden = !showHud;
    if (!showHud) hud.setAttribute("hidden", "");
    else hud.removeAttribute("hidden");
  }

  const timer = document.getElementById("echoComposeTimer");
  if (timer && recording) timer.textContent = formatRecordingTimer(performance.now() - echoStartedAt);

  const primary = document.getElementById("echoComposeStatusPrimary");
  const sub = document.getElementById("echoComposeStatusSub");
  const tip = document.getElementById("echoComposeTip");

  if (primary) {
    primary.hidden = recording;
    if (!recording) {
      if (processing) primary.textContent = "Making your voice shine…";
      else primary.textContent = hasBlob ? "Echo captured" : "Hold to record";
    }
  }
  if (sub) {
    if (recording) {
      sub.hidden = false;
      sub.textContent = "Let go when you're done";
    } else if (processing) {
      sub.hidden = false;
      sub.textContent = "Warmth, smooth levels, less harsh edge";
    } else {
      sub.hidden = false;
      sub.textContent = hasBlob
        ? `${c().formatMsAsVoiceTime(echoDurationMs)} · ready to release`
        : "Capture the moment — no need to perfect it";
    }
  }
  if (tip) tip.hidden = !recording;
  if (noPreview) noPreview.hidden = !hasBlob || recording || processing;

  if (mic) {
    mic.classList.toggle("isRecording", recording);
    mic.setAttribute("aria-pressed", recording ? "true" : "false");
    mic.setAttribute(
      "aria-label",
      recording ? "Release to stop recording" : hasBlob ? "Hold to record again" : "Hold to record Echo",
    );
  }
  if (publish) publish.disabled = !hasBlob || recording || processing;
  syncEchoToneUi();
  if (wave) {
    if (recording || hasBlob) {
      wave.innerHTML = peaksHtml(echoPeaks.length || recording ? echoPeaks : normalizePeaks([]), recording ? "echoBar--live" : "");
    } else if (!wave.querySelector(".echoBar")) {
      paintIdleComposeWave();
    }
  }
  syncEchoCaptionCount();
}

async function startEchoRecording() {
  if (echoRecState === "recording" || echoRecState === "processing") return;
  if (echoRawBlob || echoBlob) {
    echoBlob = null;
    echoRawBlob = null;
    echoPeaks = [];
    resetEchoUploadState();
  }
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
  } catch {
    try {
      c().showToast("Microphone permission needed.", { durationMs: 2800 });
    } catch {}
    return;
  }
  const mimeType = c().pickRecorderMimeType?.() || "";
  let rec;
  try {
    rec = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
  } catch {
    try {
      c().showToast("Recording not supported here.", { durationMs: 2600 });
    } catch {}
    stream.getTracks().forEach((t) => t.stop());
    return;
  }
  echoStream = stream;
  echoRecorder = rec;
  echoChunks = [];
  echoRecState = "recording";
  echoStartedAt = performance.now();
  rec.ondataavailable = (e) => {
    if (e.data?.size) echoChunks.push(e.data);
  };
  rec.onstop = () => {
    stopLiveEchoWaveform();
    stopEchoComposeTick();
    echoDurationMs = Math.min(ECHO_MAX_MS, performance.now() - echoStartedAt);
    const raw = new Blob(echoChunks, { type: rec.mimeType || "audio/webm" });
    echoRawBlob = raw.size ? raw : null;
    echoBlob = null;
    echoTone = getEchoToneFromUi();
    try {
      echoStream?.getTracks?.().forEach((t) => t.stop());
    } catch {}
    echoStream = null;
    if (!echoRawBlob) {
      echoRecState = "idle";
      syncEchoComposeUi();
      return;
    }
    echoEnhancePromise = applyEchoToneToCapture(echoTone);
  };
  startLiveEchoWaveform(stream);
  rec.start(200);
  syncEchoComposeUi();
  stopEchoComposeTick();
  echoComposeTickRaf = requestAnimationFrame(echoComposeTick);
  echoAutostopTimer = window.setTimeout(() => {
    if (echoRecState === "recording") stopEchoRecording();
  }, ECHO_MAX_MS);
}

function stopEchoRecording() {
  if (echoRecState !== "recording" || !echoRecorder) return;
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

export function openEchoComposeSheet({ replyTo = "" } = {}) {
  _echoReplyToId = String(replyTo || "").trim();
  _echoComposeIgnoreInputUntil = performance.now() + 450;
  resetEchoCompose();
  const sheet = document.getElementById("echoComposeSheet");
  if (!sheet) return;
  const once = document.getElementById("echoListenOnce");
  if (once) once.checked = false;
  const cap = document.getElementById("echoComposeCaption");
  if (cap) cap.value = "";
  const softTone = document.querySelector('input[name="echoTone"][value="soft"]');
  if (softTone) softTone.checked = true;
  const hud = document.getElementById("echoComposeRecHud");
  if (hud) {
    hud.hidden = true;
    hud.setAttribute("hidden", "");
  }
  sheet.hidden = false;
  sheet.setAttribute("aria-hidden", "false");
  sheet.classList.remove("isRecording", "hasEchoReady");
  sheet.classList.add("isOpen");
  document.body.classList.add("echoComposeOpen");
  paintIdleComposeWave();
  syncEchoComposeUi();
}

export function closeEchoComposeSheet() {
  closeEchoListenOnceInfo();
  resetEchoCompose();
  const sheet = document.getElementById("echoComposeSheet");
  if (!sheet) return;
  sheet.classList.remove("isOpen");
  document.body.classList.remove("echoComposeOpen");
  window.setTimeout(() => {
    sheet.hidden = true;
    sheet.setAttribute("aria-hidden", "true");
  }, 240);
  _echoReplyToId = "";
}

function ownEchoProfileFromRail(uid) {
  const story = _echoStoriesByUser.get(String(uid || ""));
  return story ? { username: story.username || "", avatar: story.avatar || "" } : null;
}

async function publishEcho() {
  if (echoEnhancePromise) {
    try {
      await echoEnhancePromise;
    } catch {}
  }
  if (!echoBlob?.size) return;
  const publish = document.getElementById("btnEchoPublish");
  const onceEl = document.getElementById("echoListenOnce");
  const caption = String(document.getElementById("echoComposeCaption")?.value || "").trim().slice(0, ECHO_CAPTION_MAX);
  const listenOnce = Boolean(onceEl?.checked);
  const uid = c().getAuthSession()?.user?.id;
  if (!uid) return;
  if (publish) {
    publish.disabled = true;
    publish.textContent = "Releasing…";
  }
  const peaksP = echoPeaks.length
    ? Promise.resolve(echoPeaks)
    : c().computeStatusWaveformPeaks(echoBlob, ECHO_BAR_COUNT);
  try {
    const [peaks, uploaded] = await Promise.all([peaksP, uploadEchoBlobForRelease(echoBlob)]);
    if (!uploaded?.url) throw new Error("Voice upload failed");
    const expiresAt = new Date(Date.now() + 86400000).toISOString();
    const prof = ownEchoProfileFromRail(uid);
    const optimisticId = `opt-${Date.now()}`;
    mergeEchoIntoRail(
      mapEchoFromApi({
        id: optimisticId,
        userId: uid,
        audioUrl: uploaded.url,
        durationMs: echoDurationMs,
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
    closeEchoComposeSheet();
    try {
      c().showToast("Echo is live — tap your tile anytime to hear it", { icon: "✓", durationMs: 3200 });
    } catch {}
    const rowBody = {
      user_id: uid,
      audio_url: uploaded.url,
      duration_ms: echoDurationMs,
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
    if (!row) {
      const data = await c().socialApi("/api/social", {
        method: "POST",
        body: JSON.stringify({
          action: "post_echo",
          audioUrl: uploaded.url,
          durationMs: echoDurationMs,
          waveformPeaks: peaks,
          body: caption,
          listenOnce,
          replyTo: _echoReplyToId || null,
        }),
      });
      if (data?.echo) {
        mergeEchoIntoRail(data.echo, { username: data.echo.username, avatar: data.echo.avatar });
      }
    } else {
      mergeEchoIntoRail(
        mapEchoFromApi({
          id: row.id,
          userId: uid,
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
          listened: false,
          reaction: "",
          reactionCounts: {},
        }),
        prof,
      );
    }
    resetEchoUploadState();
  } catch (e) {
    try {
      const msg = String(e?.message || "");
      const hint = /upload failed|413|payload/i.test(msg)
        ? " Voice clip may be too large — try a shorter Echo."
        : "";
      c().showToast((msg || "Could not post Echo") + hint, { durationMs: 3600 });
    } catch {}
  } finally {
    if (publish) {
      publish.disabled = false;
      publish.innerHTML = '<span class="echoComposePublishSpark" aria-hidden="true">✦</span> Release Echo';
    }
  }
}

export function openEchoFromCreateChooser() {
  _pendingEchoCompose = true;
  const onFriends = String(location.hash || "") === "#/friends";
  if (!onFriends) {
    try {
      location.hash = "#/friends";
    } catch {}
  } else {
    c().enterFriendsRoute?.();
    window.setTimeout(() => {
      if (_pendingEchoCompose) {
        _pendingEchoCompose = false;
        openEchoComposeSheet();
      }
    }, 120);
  }
}

export function onEnterFriendsRoute() {
  void refreshEchoRail({ useCache: true });
  if (_pendingEchoCompose) {
    _pendingEchoCompose = false;
    window.setTimeout(() => openEchoComposeSheet(), 160);
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
  document.getElementById("echoViewerTapPrev")?.addEventListener("click", () => {
    if (_echoSlideIndex > 0) {
      _echoSlideIndex -= 1;
      playEchoSlide(currentEchoSlide());
    }
  });
  document.getElementById("echoViewerTapNext")?.addEventListener("click", () => {
    const story = _echoDeck[_echoDeckIndex];
    if (_echoSlideIndex < (story?.echoes?.length || 1) - 1) {
      _echoSlideIndex += 1;
      playEchoSlide(currentEchoSlide());
    } else {
      closeEchoViewer();
    }
  });

  document.querySelectorAll("[data-echo-react]").forEach((btn) => {
    btn.addEventListener("click", () => {
      void postEchoReaction(btn.getAttribute("data-echo-react"));
    });
  });
  document.getElementById("btnEchoReply")?.addEventListener("click", () => {
    const slide = currentEchoSlide();
    closeEchoViewer();
    openEchoComposeSheet({ replyTo: slide?.id || "" });
  });

  document.getElementById("echoComposeBackdrop")?.addEventListener("click", () => closeEchoComposeSheet());
  document.getElementById("btnEchoComposeClose")?.addEventListener("click", () => closeEchoComposeSheet());
  wireEchoRecordHold();
  document.getElementById("echoComposeCaption")?.addEventListener("input", () => syncEchoCaptionCount());
  document.getElementById("echoTonePicker")?.addEventListener("change", (e) => {
    const input = e.target.closest('input[name="echoTone"]');
    if (!input) return;
    scheduleEchoToneRework(String(input.value || ECHO_TONE_DEFAULT));
  });
  document.getElementById("btnEchoListenOnceInfo")?.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    openEchoListenOnceInfo();
  });
  document.getElementById("btnEchoListenOnceInfoOk")?.addEventListener("click", () => closeEchoListenOnceInfo());
  document.getElementById("echoListenOnceInfoBackdrop")?.addEventListener("click", () => closeEchoListenOnceInfo());
  document.getElementById("btnEchoPublish")?.addEventListener("click", () => void publishEcho());

  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (document.getElementById("echoListenOnceInfoSheet")?.classList.contains("isOpen")) closeEchoListenOnceInfo();
    else if (document.getElementById("echoComposeSheet")?.classList.contains("isOpen")) closeEchoComposeSheet();
    else if (document.getElementById("echoViewerSheet")?.classList.contains("isOpen")) closeEchoViewer();
  });
}

function wireEchoRecordHold() {
  const mic = document.getElementById("btnEchoRecord");
  if (!mic || mic.dataset.echoHoldWired) return;
  mic.dataset.echoHoldWired = "1";

  let holdActive = false;

  const startHold = (e) => {
    if (e.button !== undefined && e.button !== 0) return;
    const sheet = document.getElementById("echoComposeSheet");
    if (!sheet?.classList.contains("isOpen")) return;
    if (performance.now() < _echoComposeIgnoreInputUntil) return;
    holdActive = true;
    try {
      mic.setPointerCapture(e.pointerId);
    } catch {}
    if (echoRecState === "recording") return;
    void startEchoRecording();
  };

  const endHold = () => {
    if (!holdActive) return;
    holdActive = false;
    if (echoRecState === "recording") stopEchoRecording();
  };

  mic.addEventListener("pointerdown", startHold);
  mic.addEventListener("pointerup", endHold);
  mic.addEventListener("pointercancel", endHold);
  mic.addEventListener("lostpointercapture", endHold);

  mic.addEventListener("click", (e) => {
    e.preventDefault();
    if (echoRecState !== "recording" && !echoBlob) {
      try {
        c().showToast("Hold the mic to record", { durationMs: 2200 });
      } catch {}
    }
  });
}

export function initEcho(appCtx) {
  ctx = appCtx;
  wireEchoOnce();
}
