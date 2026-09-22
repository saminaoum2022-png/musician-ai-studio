/**
 * Live Listen — one song, host-owned session.
 * Hidden until launch — staging bake: nabadLiveListenUi + admin.
 *
 * v1 rules (product, not edge cases):
 * - Host owns play, pause, seek. Guest follows volume + leave only.
 * - Start together: invite resets the invited song to 0:00 and holds it.
 *   The host may listen to something else while waiting. When the guest
 *   accepts, the host drops that and both play the invited song from 0:00.
 *   If they never accept, the host taps the chip and cancels.
 * - After that, guest follows host play / pause / rewind only. A couple
 *   of seconds of drift is fine. Buffering must not seek the guest.
 * - Guest follows host play / pause / rewind as events — not a clock chase.
 * - If the host has left / session expired: never autoplay. Offer play from 0:00.
 */

import { NABAD_LIVE_LISTEN_PUBLIC_SHIPPED } from "./feature-flags.js";

const TICK_MS = 2500;
const HEARTBEAT_MS = 6000;
const POLL_MS = 4000;
const JOIN_WAIT_MS = 12000;
const SEEK_COOLDOWN_MS = 800;
/** Host skip / rewind / scrub — guest follows this jump. */
const SEEK_FOLLOW_MS = 400;

let bridge = {};

/** @type {null | { role: 'host'|'guest', session: object, solo?: boolean, awaitingGuest?: boolean }} */
let _state = null;
let _applyingRemote = false;
let _tickTimer = 0;
let _heartbeatTimer = 0;
let _pollTimer = 0;
let _chipEl = null;
let _overlayEl = null;
let _inviteBusy = false;
let _joinBusy = false;
let _lastTickSentAt = 0;
let _invitePollTimer = 0;
let _lastSeekAt = 0;
let _seekInFlight = false;
let _cueCtx = null;
let _lastHostPosMs = 0;
let _lastHostAt = 0;
let _lastAppliedHostSentAt = 0;
let _guestStarted = false;
/** User scrub / skip only. Audio `seeked` from buffering must not move the guest. */
let _hostScrubUntil = 0;
let _suppressHostEventsUntil = 0;
let _hostWantsPlaying = false;
let _hostAtEnd = false;
let _guestEndShown = false;
let _listenOpenToken = 0;
let _hostEndSheetOpen = false;
const _seenInviteIds = new Set();

function clientLiveListenUiBaked() {
  try {
    return Boolean(window.__NABAD_CLIENT_ENV__?.nabadLiveListenUi);
  } catch {
    return false;
  }
}

function isStagingPreviewHost() {
  try {
    const env = String(window.__NABAD_CLIENT_ENV__?.environment || "").toLowerCase();
    if (env === "staging") return true;
  } catch {}
  try {
    const host = String(location.hostname || "").toLowerCase();
    return host.endsWith(".vercel.app") && host.includes("-git-staging-");
  } catch {
    return false;
  }
}

/** Staging iOS bake, Vercel staging preview, or public launch. */
function liveListenUiAvailable() {
  if (NABAD_LIVE_LISTEN_PUBLIC_SHIPPED) return true;
  return clientLiveListenUiBaked() || isStagingPreviewHost();
}

/** Host invite / Listen together. Public launch: any signed-in user. Hidden: admin only. */
export function nabadLiveListenEnabled() {
  try {
    if (!liveListenUiAvailable()) return false;
    if (NABAD_LIVE_LISTEN_PUBLIC_SHIPPED) return true;
    return Boolean(typeof bridge.isAdmin === "function" && bridge.isAdmin());
  } catch {
    return false;
  }
}

/** Invited guest can see Join on staging web even if that account is not admin. */
export function nabadLiveListenGuestEnabled() {
  try {
    return liveListenUiAvailable();
  } catch {
    return false;
  }
}

export function configureNabadLiveListen(b) {
  bridge = b || {};
}

export function liveListenRole() {
  return _state?.role || null;
}

export function isLiveListenGuest() {
  return _state?.role === "guest" && !_state?.solo;
}

export function isLiveListenHost() {
  return _state?.role === "host";
}

export function isLiveListenActive() {
  return Boolean(_state?.role) && !_state?.solo;
}

export function isLiveListenTransportLocked() {
  return isLiveListenGuest();
}

function hostAwaitingGuest() {
  return isLiveListenHost() && Boolean(_state?.awaitingGuest);
}

function escapeHtml(s) {
  if (typeof bridge.escapeHtml === "function") return bridge.escapeHtml(s);
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatTime(sec) {
  if (typeof bridge.formatTime === "function") return bridge.formatTime(sec);
  const n = Math.max(0, Math.floor(Number(sec) || 0));
  const m = Math.floor(n / 60);
  const s = n % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function displayName(user) {
  const raw = String(user?.displayName || user?.username || "").replace(/^@/, "").trim();
  return raw || "friend";
}

function avatarHtml(user, cls) {
  if (typeof bridge.messagesAvatarHtml === "function") {
    return bridge.messagesAvatarHtml(user?.avatar, user?.username || user?.displayName, cls);
  }
  const src = String(user?.avatar || "").trim();
  if (src) return `<img class="${cls}" src="${escapeHtml(src)}" alt="" />`;
  const letter = displayName(user).slice(0, 1).toUpperCase() || "?";
  return `<span class="${cls} liveListenAvatarPh">${escapeHtml(letter)}</span>`;
}

function toast(msg, opts) {
  try { bridge.showToast?.(msg, opts); } catch {}
}

function haptic(kind = "light") {
  try { bridge.haptic?.(kind); } catch {}
}

function playListenCue(kind = "invite") {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    if (!_cueCtx) _cueCtx = new Ctx();
    const ctx = _cueCtx;
    if (ctx.state === "suspended") void ctx.resume();
    const now = ctx.currentTime;
    const notes = kind === "joined" ? [523.25, 659.25, 783.99] : [392, 523.25];
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      const start = now + i * 0.08;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.06, start + 0.018);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.16);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.18);
    });
  } catch {}
}

function normalizeListenUrl(url) {
  const s = String(url || "").trim();
  if (!s) return "";
  try {
    const u = new URL(s);
    return `${u.origin}${u.pathname}`.replace(/\/+$/, "");
  } catch {
    return s.split("?")[0].replace(/\/+$/, "");
  }
}

function sessionMatchesPlayer(session, nextUrl, nextSongId) {
  const sid = String(session?.songId || "").trim();
  const nid = String(nextSongId || "").trim();
  if (sid && nid && sid === nid) return true;
  const locked = normalizeListenUrl(session?.songUrl);
  const incoming = normalizeListenUrl(nextUrl);
  if (locked && incoming && locked === incoming) return true;
  const a = playerEl();
  const src = normalizeListenUrl(a?.currentSrc || a?.src);
  if (locked && src && locked === src) return true;
  return false;
}

function playerEl() {
  return typeof bridge.ensurePlayer === "function" ? bridge.ensurePlayer() : null;
}

function currentPositionMs() {
  const a = playerEl();
  const sec = a && Number.isFinite(a.currentTime) ? a.currentTime : 0;
  return Math.max(0, Math.round(sec * 1000));
}

function currentDurationMs() {
  if (typeof bridge.getPlayerDuration === "function") {
    const sec = Number(bridge.getPlayerDuration()) || 0;
    if (sec > 0 && Number.isFinite(sec)) return Math.round(sec * 1000);
  }
  const a = playerEl();
  const d = a && Number.isFinite(a.duration) ? a.duration : 0;
  return d > 0 ? Math.round(d * 1000) : 0;
}

function isPlayerPlaying() {
  const a = playerEl();
  try {
    return Boolean(a && !a.paused && !a.ended);
  } catch {
    return false;
  }
}

function setBodyRole() {
  try {
    document.body.classList.toggle("liveListenHost", isLiveListenHost());
    document.body.classList.toggle("liveListenGuest", isLiveListenGuest());
    document.body.classList.toggle("liveListenActive", Boolean(_state?.role));
  } catch {}
}

async function api(actionOrGet, body) {
  if (typeof bridge.messagesApi !== "function") throw new Error("Not ready");
  if (actionOrGet === "get") {
    if (body?.incoming) {
      return bridge.messagesApi("/api/music/listen-session?incoming=1", { timeoutMs: 8000 });
    }
    const id = encodeURIComponent(String(body?.sessionId || ""));
    return bridge.messagesApi(`/api/music/listen-session?sessionId=${id}`, { timeoutMs: 10000 });
  }
  return bridge.messagesApi("/api/music/listen-session", {
    method: "POST",
    timeoutMs: 12000,
    body: JSON.stringify(body),
  });
}

function partnerLabel(session) {
  if (!_state) return "friend";
  const other = _state.role === "host" ? session?.guest : session?.host;
  return displayName(other || {});
}

function syncShareChooserButton() {
  const btn = document.getElementById("shareChooserListenTogether");
  if (!btn) return;
  const show = nabadLiveListenEnabled() && Boolean(bridge.getTrackRef?.()?.url) && !isLiveListenGuest();
  btn.hidden = !show;
  btn.style.display = show ? "" : "none";
}

function ensureChip() {
  if (_chipEl && document.body.contains(_chipEl)) return _chipEl;
  const row = document.createElement("div");
  row.id = "liveListenChipRow";
  row.className = "liveListenChipRow";
  row.hidden = true;
  const el = document.createElement("button");
  el.type = "button";
  el.id = "liveListenChip";
  el.className = "liveListenChip";
  el.addEventListener("click", () => {
    haptic();
    if (!isLiveListenHost()) return;
    if (_hostAtEnd) showHostSongEnded();
    else void confirmHostEnd();
  });
  const leave = document.createElement("button");
  leave.type = "button";
  leave.id = "liveListenChipLeave";
  leave.className = "liveListenChipLeave";
  leave.textContent = "Leave";
  leave.hidden = true;
  leave.addEventListener("click", () => {
    haptic();
    void confirmGuestLeave();
  });
  row.append(el, leave);
  document.body.appendChild(row);
  _chipEl = el;
  return el;
}

export function syncLiveListenChrome() {
  const chip = ensureChip();
  const row = document.getElementById("liveListenChipRow");
  const leave = document.getElementById("liveListenChipLeave");
  const active = Boolean(_state?.role) && !_state?.solo;
  const guest = active && isLiveListenGuest();
  if (row) row.hidden = !active;
  if (leave) leave.hidden = !guest;
  if (!active) {
    setBodyRole();
    syncGuestPlayerBar(false, "");
    syncShareChooserButton();
    try { bridge.refreshPresence?.(); } catch {}
    return;
  }
  const name = partnerLabel(_state.session);
  const waiting = hostAwaitingGuest() || _state.session?.status === "pending";
  const live = _state.session?.status === "live" && !waiting;
  const kicker = _state.role === "host"
    ? (waiting ? `At the start · waiting for @${name}` : (live ? `Live with @${name}` : "Live listen"))
    : `Listening with @${name}`;
  chip.innerHTML = `<span class="liveListenChipDot" aria-hidden="true"></span><span class="liveListenChipLabel">${escapeHtml(kicker)}</span>`;
  chip.classList.toggle("is-status", guest);
  chip.setAttribute("aria-label", _state.role === "host"
    ? (waiting ? "Cancel live listen invite" : "End live listen")
    : `Listening with @${name}`);
  setBodyRole();
  syncGuestPlayerBar(false, "");
  syncShareChooserButton();
  try { bridge.refreshPresence?.(); } catch {}
}

function syncGuestPlayerBar(guest, name) {
  const bar = document.getElementById("liveListenGuestBar");
  if (!bar) return;
  wireGuestPlayerBarOnce(bar);
  bar.hidden = !guest;
  const text = bar.querySelector("[data-ll-guest-status]");
  if (text && guest) text.textContent = `Listening with @${name}`;
}

function wireGuestPlayerBarOnce(bar) {
  if (bar.dataset.wired === "1") return;
  bar.dataset.wired = "1";
  bar.querySelector("#liveListenGuestLeave")?.addEventListener("click", () => {
    haptic();
    void confirmGuestLeave();
  });
}

function closeOverlay() {
  const el = _overlayEl || document.getElementById("liveListenOverlay");
  if (!el) return;
  el.classList.remove("is-open");
  window.setTimeout(() => {
    try { el.remove(); } catch {}
    if (_overlayEl === el) _overlayEl = null;
  }, 220);
}

function setOverlayStatus(text) {
  const el = _overlayEl?.querySelector(".npPresenceArtist");
  if (el) el.textContent = String(text || "");
}

function openOverlay({ kicker, title, sub, art, actionsHtml, onAction, onDismiss }) {
  closeOverlay();
  const overlay = document.createElement("div");
  overlay.id = "liveListenOverlay";
  overlay.className = "npPresenceOverlay liveListenOverlay";
  const cover = String(art || "").trim();
  const coverHtml = cover
    ? `<img class="npPresenceArt" src="${escapeHtml(cover)}" alt="" />`
    : `<span class="npPresenceArt npPresenceArt--ph" aria-hidden="true">♪</span>`;
  overlay.innerHTML = `
    <div class="npPresenceSheet" role="dialog" aria-modal="true" aria-label="${escapeHtml(kicker || "Live listen")}">
      <div class="npPresenceGrab" aria-hidden="true"></div>
      <div class="npPresenceTop">
        ${coverHtml}
        <div class="npPresenceMeta">
          <span class="npPresenceKicker">${escapeHtml(kicker || "Live listen")}</span>
          <strong class="npPresenceTitle">${escapeHtml(title || "Song")}</strong>
          <span class="npPresenceArtist">${escapeHtml(sub || "")}</span>
        </div>
      </div>
      <div class="npPresenceActions">${actionsHtml}</div>
    </div>`;
  document.body.appendChild(overlay);
  _overlayEl = overlay;
  requestAnimationFrame(() => overlay.classList.add("is-open"));
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) {
      closeOverlay();
      try { onDismiss?.(); } catch {}
      return;
    }
    const btn = e.target.closest("[data-ll-act]");
    if (!btn || btn.disabled) return;
    const act = btn.getAttribute("data-ll-act");
    try { onAction?.(act, btn); } catch {}
  });
}

function hostNowMs(tick) {
  return Math.max(0, Number(tick?.positionMs) || 0);
}

function tickReason(tick) {
  const r = String(tick?.reason || "clock").toLowerCase();
  if (r === "seek" || r === "start" || r === "transport" || r === "ended") return r;
  return "clock";
}

function applyRemoteFlag(ms = 280) {
  _applyingRemote = true;
  window.setTimeout(() => { _applyingRemote = false; }, ms);
}

function resetGuestPlaybackRate() {
  const a = playerEl();
  if (!a) return;
  try {
    if (a.playbackRate !== 1) a.playbackRate = 1;
  } catch {}
}

function noteHostClock(tick) {
  _lastHostPosMs = hostNowMs(tick);
  _lastHostAt = Date.now();
}

async function waitForCanPlay(a, timeoutMs = JOIN_WAIT_MS) {
  if (!a) return false;
  if (a.readyState >= 3) return true;
  return new Promise((resolve) => {
    let done = false;
    const finish = (ok) => {
      if (done) return;
      done = true;
      a.removeEventListener("canplay", onOk);
      a.removeEventListener("canplaythrough", onOk);
      a.removeEventListener("error", onErr);
      window.clearTimeout(timer);
      resolve(ok);
    };
    const onOk = () => finish(true);
    const onErr = () => finish(false);
    const timer = window.setTimeout(() => finish(a.readyState >= 2), timeoutMs);
    a.addEventListener("canplay", onOk);
    a.addEventListener("canplaythrough", onOk);
    a.addEventListener("error", onErr);
  });
}

async function waitForSeeked(a, timeoutMs = 1800) {
  if (!a) return false;
  return new Promise((resolve) => {
    let done = false;
    const finish = (ok) => {
      if (done) return;
      done = true;
      a.removeEventListener("seeked", onOk);
      window.clearTimeout(timer);
      resolve(ok);
    };
    const onOk = () => finish(true);
    const timer = window.setTimeout(() => finish(a.readyState >= 2), timeoutMs);
    a.addEventListener("seeked", onOk);
  });
}

async function seekGuestToHost(tick, { force = false } = {}) {
  const a = playerEl();
  if (!a) return;
  const targetSec = hostNowMs(tick) / 1000;
  const cur = Number.isFinite(a.currentTime) ? a.currentTime : 0;
  if (!force && !a.ended && Math.abs(cur - targetSec) < 0.2) return;
  _seekInFlight = true;
  applyRemoteFlag(450);
  try {
    a.currentTime = Math.max(0, targetSec);
    await waitForSeeked(a);
  } catch {}
  resetGuestPlaybackRate();
  _lastSeekAt = Date.now();
  window.setTimeout(() => { _seekInFlight = false; }, 250);
}

async function playGuestFromStart(a) {
  if (!a) return;
  applyRemoteFlag(900);
  const started = await tryPlayGuestFromZero(a);
  if (started) return;
  await tryPlayGuestFromZero(a);
}

async function tryPlayGuestFromZero(a) {
  if (!a) return false;
  try { a.pause(); } catch {}
  try { a.currentTime = 0; } catch {}
  await waitForSeeked(a, 1200);
  if (a.ended || (Number.isFinite(a.currentTime) && a.currentTime > 0.35)) {
    try { a.currentTime = 0; } catch {}
    await waitForSeeked(a, 800);
  }
  try {
    await a.play();
    return !a.paused && !a.ended;
  } catch {
    return false;
  }
}

function armGuestEndHold(a) {
  if (!a || a.dataset.llEndHold === "1") return;
  a.dataset.llEndHold = "1";
  a.addEventListener("timeupdate", () => {
    if (!isLiveListenGuest() || a.paused) return;
    const dur = Number(a.duration);
    if (!Number.isFinite(dur) || dur < 1) return;
    if (a.currentTime < dur - 0.35) return;
    holdGuestBeforeEnd(a);
  });
}

function holdGuestBeforeEnd(a) {
  if (!a) return;
  const dur = Number(a.duration);
  applyRemoteFlag(500);
  if (Number.isFinite(dur) && dur > 0.6) {
    const hold = Math.max(0, dur - 0.3);
    if (!Number.isFinite(a.currentTime) || a.ended || a.currentTime > hold) {
      try { a.currentTime = hold; } catch {}
    }
  }
  try { a.pause(); } catch {}
}

/**
 * Guest follows host transport events (play / pause / rewind / start).
 * Periodic clock ticks and DB polls must not toggle playback or seek —
 * that is what made pause fight play, and yanked the guest every few seconds.
 */
async function applyGuestTick(tick, { force = false } = {}) {
  if (!isLiveListenGuest()) return;
  if (!sessionMatchesPlayer(_state?.session, tick?.audioUrl || _state?.session?.songUrl, tick?.songId || _state?.session?.songId)) {
    return;
  }
  const a = playerEl();
  if (!a) return;

  const sentAt = Number(tick?.hostSentAt) || 0;
  const reason = tickReason(tick);
  if (!force && reason === "clock") return;
  if (_seekInFlight && !force && reason !== "start" && reason !== "ended") return;
  if (sentAt && sentAt < _lastAppliedHostSentAt) return;
  if (sentAt) _lastAppliedHostSentAt = sentAt;

  const playing = tick?.playing === true && String(tick?.status || "live") === "live";
  if (reason === "start" || reason === "ended") {
    if (reason === "start") {
      await seekGuestToHost({ ...tick, positionMs: 0 }, { force: true });
      noteHostClock({ positionMs: 0, playing: true });
      _guestStarted = true;
      await playGuestFromStart(a);
      return;
    }
    const endMs = Math.max(0, Number(tick?.positionMs) || 0);
    const holdMs = endMs > 500 ? endMs - 300 : 0;
    await seekGuestToHost({ ...tick, positionMs: holdMs }, { force: true });
    noteHostClock({ positionMs: holdMs, playing: false });
    holdGuestBeforeEnd(a);
    return;
  }
  const shouldSeek = force || reason === "seek";

  if (shouldSeek) {
    await seekGuestToHost(tick);
    noteHostClock(tick);
    if (reason === "start") _guestStarted = true;
  } else {
    noteHostClock(tick);
  }

  if (reason === "seek") return;

  try {
    if (!playing) {
      resetGuestPlaybackRate();
      if (!a.paused) {
        applyRemoteFlag(280);
        try { a.pause(); } catch {}
      }
      return;
    }
    if (a.paused) {
      applyRemoteFlag(280);
      try { await a.play(); } catch {}
    }
  } catch {
    _applyingRemote = false;
  }
}

function tickPayload() {
  const session = _state?.session;
  if (!session) return null;
  return {
    sessionId: session.id,
    songId: session.songId || "",
    audioUrl: session.songUrl || "",
    playing: isPlayerPlaying(),
    positionMs: currentPositionMs(),
    hostSentAt: Date.now(),
    status: hostAwaitingGuest() ? "pending" : "live",
    reason: "clock",
  };
}

async function broadcastTick(extra = {}) {
  if (!isLiveListenHost() || !_state?.session?.id) return;
  const payload = { ...tickPayload(), ...extra };
  if (!payload) return;
  _lastTickSentAt = Date.now();
  if (_state.session) _state.session.positionMs = payload.positionMs;
  try {
    const mod = await bridge.loadRealtimeMod?.();
    await mod?.sendListenSessionBroadcast?.({
      sessionId: _state.session.id,
      event: "ll_tick",
      payload,
    });
  } catch {}
}

async function persistHeartbeat() {
  if (!isLiveListenHost() || !_state?.session?.id) return;
  try {
    const data = await api("post", {
      action: "heartbeat",
      sessionId: _state.session.id,
      positionMs: currentPositionMs(),
      playing: isPlayerPlaying(),
      hostSentAt: Date.now(),
      durationMs: currentDurationMs(),
    });
    if (data?.session) {
      applyHostSessionUpdate(data.session);
    }
  } catch {}
}

async function subscribeSession(sessionId) {
  const sid = String(sessionId || "").trim();
  if (!sid) return;
  try {
    const mod = await bridge.loadRealtimeMod?.();
    await mod?.subscribeListenSession?.({
      supabaseUrl: bridge.getSupabaseUrl?.() || "",
      supabaseAnonKey: bridge.getSupabaseAnonKey?.() || "",
      accessToken: bridge.getAuthToken?.() || "",
      sessionId: sid,
      onTick: (payload) => {
        if (!isLiveListenGuest()) return;
        const next = { ...(_state?.session || {}), ...payload, id: sid };
        if (_state) _state.session = next;
        void applyGuestTick(next);
      },
      onEnd: () => {
        if (isLiveListenGuest()) void onHostLeft();
        else if (isLiveListenHost()) {
          toast("They left live listen");
          void clearLocalSession();
        }
      },
      onJoin: () => {
        if (isLiveListenHost()) markGuestAccepted();
      },
    });
  } catch (e) {
    console.warn("[live-listen] realtime", e);
  }
}

function stopTimers() {
  if (_tickTimer) window.clearInterval(_tickTimer);
  if (_heartbeatTimer) window.clearInterval(_heartbeatTimer);
  if (_pollTimer) window.clearInterval(_pollTimer);
  _tickTimer = 0;
  _heartbeatTimer = 0;
  _pollTimer = 0;
}

function startHostTimers() {
  stopTimers();
  _tickTimer = window.setInterval(() => { void broadcastTick(); }, TICK_MS);
  _heartbeatTimer = window.setInterval(() => { void persistHeartbeat(); }, HEARTBEAT_MS);
}

function startGuestPoll() {
  stopTimers();
  _pollTimer = window.setInterval(() => {
    if (!isLiveListenGuest() || !_state?.session?.id) return;
    void (async () => {
      try {
        const data = await api("get", { sessionId: _state.session.id });
        const session = data?.session;
        if (!session) return;
        if (session.status !== "live" && session.status !== "pending") {
          await onHostLeft();
          return;
        }
        const prev = _state.session || {};
        _state.session = {
          ...prev,
          ...session,
          playing: prev.playing,
          positionMs: prev.positionMs,
          hostSentAt: prev.hostSentAt,
        };
        syncLiveListenChrome();
      } catch {}
    })();
  }, POLL_MS);
}

async function clearLocalSession({ keepRealtime = false } = {}) {
  stopTimers();
  resetGuestPlaybackRate();
  _lastHostPosMs = 0;
  _lastHostAt = 0;
  _lastAppliedHostSentAt = 0;
  _guestStarted = false;
  _hostAtEnd = false;
  _hostEndSheetOpen = false;
  _guestEndShown = false;
  _hostScrubUntil = 0;
  _suppressHostEventsUntil = 0;
  _hostWantsPlaying = false;
  if (!keepRealtime) {
    try {
      const mod = await bridge.loadRealtimeMod?.();
      await mod?.stopListenSessionRealtime?.();
    } catch {}
  }
  _state = null;
  _applyingRemote = false;
  setBodyRole();
  syncLiveListenChrome();
}

async function holdHostAtStart() {
  const a = playerEl();
  applyRemoteFlag(700);
  try { a?.pause?.(); } catch {}
  if (a && Number.isFinite(a.currentTime) && a.currentTime > 0.05) {
    try { a.currentTime = 0; } catch {}
    await waitForSeeked(a, 1500);
  }
  if (_state?.session) _state.session.positionMs = 0;
}

async function loadInvitedSongOnHost(session) {
  const url = String(session?.songUrl || "").trim();
  if (!url) return;
  const a0 = playerEl();
  const already = sessionMatchesPlayer(session, a0?.currentSrc || a0?.src, session.songId);
  _suppressHostEventsUntil = Date.now() + 2500;
  applyRemoteFlag(2200);
  if (!already && typeof bridge.playUrlOnPlayer === "function") {
    await bridge.playUrlOnPlayer(url, session.songTitle || "Song", session.songCover || "", {
      songId: session.songId || "",
      ownerUserId: session.songOwnerId || "",
      openPlayer: true,
      liveListenJoin: true,
      forceReload: true,
    });
  }
  const a = playerEl();
  try { a?.pause?.(); } catch {}
  await waitForCanPlay(a);
  if (a && Number.isFinite(a.currentTime) && a.currentTime > 0.05) {
    try { a.currentTime = 0; } catch {}
    await waitForSeeked(a, 1500);
  }
  try { await a?.play?.(); } catch {}
}

async function startTogetherAsHost({ replay = false } = {}) {
  if (!isLiveListenHost() || !_state?.session) return;
  _hostAtEnd = false;
  _hostEndSheetOpen = false;
  _hostWantsPlaying = true;
  _suppressHostEventsUntil = Date.now() + 2000;
  await loadInvitedSongOnHost(_state.session);
  if (!_hostWantsPlaying) {
    try { playerEl()?.pause?.(); } catch {}
    void broadcastTick({ playing: false, positionMs: 0, reason: "transport" });
    return;
  }
  if (_state?.session) _state.session.positionMs = 0;
  void broadcastTick({ playing: true, positionMs: 0, reason: "start" });
  if (replay) {
    window.setTimeout(() => {
      if (!isLiveListenHost() || _hostAtEnd || !_hostWantsPlaying) return;
      void broadcastTick({ playing: true, positionMs: 0, reason: "start" });
    }, 700);
  }
  void persistHeartbeat();
}

async function becomeHost(session, { awaitingGuest = true } = {}) {
  _state = { role: "host", session, awaitingGuest: awaitingGuest && session?.guestJoined !== true && session?.status !== "ended" };
  if (session?.status === "live" && session?.guestJoined === true) _state.awaitingGuest = false;
  if (session?.status === "pending" || session?.guestJoined === false) _state.awaitingGuest = true;
  if (_state.awaitingGuest) await holdHostAtStart();
  await subscribeSession(session.id);
  startHostTimers();
  void broadcastTick({ playing: false, reason: "clock" });
  void persistHeartbeat();
  void sendInviteToGuest(session);
  syncLiveListenChrome();
}

function markGuestAccepted() {
  if (!isLiveListenHost() || !_state) return;
  const wasWaiting = _state.awaitingGuest || _state.session?.status === "pending";
  _state.awaitingGuest = false;
  _state.session = { ..._state.session, status: "live", guestJoined: true };
  syncLiveListenChrome();
  if (!wasWaiting) return;
  haptic("success");
  playListenCue("joined");
  const name = partnerLabel(_state.session);
  toast(`@${name} joined — starting together`, { icon: "🎧", durationMs: 2800 });
  void startTogetherAsHost();
}

function applyHostSessionUpdate(session) {
  if (!isLiveListenHost() || !session) return;
  if (session.status === "ended") {
    void clearLocalSession();
    toast("Live listen ended");
    return;
  }
  const joined = session.guestJoined === true;
  const stillWaiting = session.guestJoined === false || session.status === "pending";
  _state.session = { ..._state.session, ...session };
  if (joined) markGuestAccepted();
  else if (stillWaiting) _state.awaitingGuest = true;
  syncLiveListenChrome();
}

async function sendInviteToGuest(session) {
  const guestId = String(session?.guestUserId || "").trim();
  if (!guestId) return;
  try {
    const mod = await bridge.loadRealtimeMod?.();
    await mod?.sendListenInviteBroadcast?.({
      supabaseUrl: bridge.getSupabaseUrl?.() || "",
      supabaseAnonKey: bridge.getSupabaseAnonKey?.() || "",
      accessToken: bridge.getAuthToken?.() || "",
      guestUserId: guestId,
      payload: session,
    });
  } catch (e) {
    console.warn("[live-listen] invite broadcast", e);
  }
}

function offerIncomingSession(session) {
  const sid = String(session?.id || "").trim();
  if (!sid || !nabadLiveListenGuestEnabled()) return;
  if (session.status && session.status !== "live" && session.status !== "pending") return;
  if (_state?.role === "host") return;
  if (_state?.role === "guest" && String(_state.session?.id || "") === sid) return;
  if (_seenInviteIds.has(sid)) return;
  const overlay = document.getElementById("liveListenOverlay");
  if (overlay?.classList.contains("is-open")) return;
  _seenInviteIds.add(sid);
  showJoinPrompt(session);
}

async function pollIncomingInvites() {
  if (!nabadLiveListenGuestEnabled() || isLiveListenHost() || isLiveListenGuest()) return;
  try {
    const data = await api("get", { incoming: true });
    const sessions = Array.isArray(data?.sessions) ? data.sessions : [];
    const next = sessions.find((s) => s?.id && (s.status === "live" || s.status === "pending"));
    if (next) offerIncomingSession(next);
  } catch {}
}

export function startLiveListenGuestInbox() {
  if (!nabadLiveListenGuestEnabled()) return;
  if (_invitePollTimer) window.clearInterval(_invitePollTimer);
  _invitePollTimer = window.setInterval(() => { void pollIncomingInvites(); }, 4000);
  void pollIncomingInvites();
  void (async () => {
    try {
      const mod = await bridge.loadRealtimeMod?.();
      await mod?.subscribeListenInvites?.({
        supabaseUrl: bridge.getSupabaseUrl?.() || "",
        supabaseAnonKey: bridge.getSupabaseAnonKey?.() || "",
        accessToken: bridge.getAuthToken?.() || "",
        userId: bridge.getUserId?.() || "",
        onInvite: (payload) => {
          const session = payload?.id ? payload : payload?.session;
          if (session) offerIncomingSession(session);
        },
      });
    } catch (e) {
      console.warn("[live-listen] invite inbox", e);
    }
  })();
}

async function becomeGuest(session) {
  _state = { role: "guest", session: { ...session, status: "live", guestJoined: true }, solo: false };
  _seekInFlight = true;
  _guestStarted = false;
  await subscribeSession(session.id);
  startGuestPoll();
  syncLiveListenChrome();
  haptic("success");
  playListenCue("joined");
}

async function announceGuestJoined() {
  const sid = _state?.session?.id;
  if (!sid) return;
  try {
    const mod = await bridge.loadRealtimeMod?.();
    await mod?.sendListenSessionBroadcast?.({
      sessionId: sid,
      event: "ll_join",
      payload: { sessionId: sid, status: "live" },
    });
  } catch {}
}

async function loadSessionAudio(session, { startAtMs, autoplay }) {
  const url = String(session?.songUrl || "").trim();
  if (!url) throw new Error("Missing song");
  const title = String(session.songTitle || "").trim() || "Now Playing";
  const art = String(session.songCover || "").trim();
  const songId = String(session.songId || "").trim();
  const ownerUserId = String(session.songOwnerId || "").trim();
  try { bridge.primePlayerInGesture?.(); } catch {}
  if (typeof bridge.playUrlOnPlayer === "function") {
    await bridge.playUrlOnPlayer(url, title, art, {
      songId,
      ownerUserId,
      openPlayer: true,
      liveListenJoin: true,
      liveListenHold: autoplay !== true,
    });
  }
  const a = playerEl();
  _seekInFlight = true;
  applyRemoteFlag(800);
  try { a?.pause?.(); } catch {}
  await waitForCanPlay(a);
  const targetSec = Math.max(0, (Number(startAtMs) || 0) / 1000);
  try {
    if (a) {
      try { a.playbackRate = 1; } catch {}
    }
    if (a && Number.isFinite(targetSec) && Math.abs((a.currentTime || 0) - targetSec) > 0.15) {
      try { a.currentTime = targetSec; } catch {}
      await waitForSeeked(a);
    }
    if (autoplay && a) {
      try { await a.play(); } catch {}
    } else if (a && !a.paused) {
      try { a.pause(); } catch {}
    }
  } finally {
    _lastSeekAt = Date.now();
    _seekInFlight = false;
    noteHostClock({ positionMs: Number(startAtMs) || 0, playing: false });
    window.setTimeout(() => { _applyingRemote = false; }, 280);
  }
  if (isLiveListenGuest()) armGuestEndHold(playerEl());
}

function finishGuestAfterHostLeft() {
  const a = playerEl();
  applyRemoteFlag(800);
  try { a?.pause?.(); } catch {}
  try { bridge.exitPlayer?.(); } catch {}
  void clearLocalSession();
}

async function onHostLeft() {
  if (!isLiveListenGuest() || _guestEndShown) return;
  _guestEndShown = true;
  const session = _state.session;
  const name = partnerLabel(session);
  const a = playerEl();
  _applyingRemote = true;
  resetGuestPlaybackRate();
  try { a?.pause?.(); } catch {}
  window.setTimeout(() => { _applyingRemote = false; }, 40);
  stopTimers();
  const finish = () => { finishGuestAfterHostLeft(); };
  openOverlay({
    kicker: "Host left",
    title: session?.songTitle || "Listen together",
    sub: name ? `@${name} left. This listen has ended.` : "The host left. This listen has ended.",
    art: session?.songCover,
    actionsHtml: `
      <button type="button" class="npPresenceBtn npPresenceBtn--primary" data-ll-act="ok">OK</button>`,
    onAction: () => {
      closeOverlay();
      finish();
    },
    onDismiss: finish,
  });
}

function showHostSongEnded() {
  if (!isLiveListenHost() || !_hostAtEnd || _hostEndSheetOpen) return;
  _hostEndSheetOpen = true;
  const name = partnerLabel(_state?.session);
  openOverlay({
    kicker: "Song finished",
    title: _state?.session?.songTitle || "Song",
    sub: name ? `Play it again with @${name}, or end the listen.` : "Play it again, or end the listen.",
    art: _state?.session?.songCover,
    actionsHtml: `
      <button type="button" class="npPresenceBtn npPresenceBtn--ghost" data-ll-act="done">Done</button>
      <button type="button" class="npPresenceBtn npPresenceBtn--primary" data-ll-act="replay">Play again</button>`,
    onAction: (act) => {
      _hostEndSheetOpen = false;
      closeOverlay();
      if (act === "replay") {
        _hostAtEnd = false;
        void startTogetherAsHost({ replay: true });
        return;
      }
      if (act === "done") {
        _hostAtEnd = false;
        void endHostSession();
      }
    },
    onDismiss: () => { _hostEndSheetOpen = false; },
  });
}

async function confirmHostEnd() {
  const name = partnerLabel(_state?.session);
  const waiting = hostAwaitingGuest();
  openOverlay({
    kicker: waiting ? "Invite sent" : "Live listen",
    title: _state?.session?.songTitle || "Song",
    sub: waiting
      ? `The song stays at the start until @${name} joins. Cancel if you want to play it yourself.`
      : `End live listen with @${name}?`,
    art: _state?.session?.songCover,
    actionsHtml: `
      <button type="button" class="npPresenceBtn npPresenceBtn--ghost" data-ll-act="cancel">${waiting ? "Keep waiting" : "Keep going"}</button>
      <button type="button" class="npPresenceBtn npPresenceBtn--primary" data-ll-act="end">${waiting ? "Cancel invite" : "End"}</button>`,
    onAction: (act) => {
      closeOverlay();
      if (act === "end") void endHostSession();
    },
  });
}

async function confirmGuestLeave() {
  openOverlay({
    kicker: "Live listen",
    title: _state?.session?.songTitle || "Song",
    sub: "Leave this live listen?",
    art: _state?.session?.songCover,
    actionsHtml: `
      <button type="button" class="npPresenceBtn npPresenceBtn--ghost" data-ll-act="cancel">Stay</button>
      <button type="button" class="npPresenceBtn npPresenceBtn--primary" data-ll-act="leave">Leave</button>`,
    onAction: (act) => {
      closeOverlay();
      if (act === "leave") void leaveGuestSession();
    },
  });
}

async function endHostSession() {
  const wasWaiting = hostAwaitingGuest();
  const sid = _state?.session?.id;
  closeOverlay();
  _hostAtEnd = false;
  _hostEndSheetOpen = false;
  if (sid) {
    try {
      const mod = await bridge.loadRealtimeMod?.();
      await mod?.sendListenSessionBroadcast?.({
        sessionId: sid,
        event: "ll_end",
        payload: { sessionId: sid, status: "ended" },
      });
    } catch {}
    try { await api("post", { action: "end", sessionId: sid }); } catch {}
  }
  await clearLocalSession();
  toast(wasWaiting ? "Invite canceled — press play whenever you want" : "Live listen ended");
}

export async function endLiveListenBecauseHostClosedPlayer() {
  if (!isLiveListenHost()) return;
  const a = playerEl();
  applyRemoteFlag(800);
  try { a?.pause?.(); } catch {}
  await endHostSession();
}

async function leaveGuestSession() {
  const sid = _state?.session?.id;
  if (sid) {
    try {
      const mod = await bridge.loadRealtimeMod?.();
      await mod?.sendListenSessionBroadcast?.({
        sessionId: sid,
        event: "ll_end",
        payload: { sessionId: sid, status: "ended" },
      });
    } catch {}
    try { await api("post", { action: "leave", sessionId: sid }); } catch {}
  }
  const a = playerEl();
  _applyingRemote = true;
  resetGuestPlaybackRate();
  try { a?.pause?.(); } catch {}
  window.setTimeout(() => { _applyingRemote = false; }, 40);
  await clearLocalSession();
}

function expiredListenCopy(session) {
  const title = String(session?.songTitle || "").trim() || "Listen together";
  const name = displayName(session?.host || {});
  const named = name && name !== "friend";
  return {
    kicker: "Invite expired",
    title,
    sub: named ? `This listen with ${name} has ended.` : "This listen together has ended.",
  };
}

function revealExpiredListen(session) {
  const copy = expiredListenCopy(session);
  const root = _overlayEl;
  if (root?.classList.contains("is-open")) {
    const kicker = root.querySelector(".npPresenceKicker");
    const title = root.querySelector(".npPresenceTitle");
    const sub = root.querySelector(".npPresenceArtist");
    if (kicker) kicker.textContent = copy.kicker;
    if (title) title.textContent = copy.title;
    if (sub) sub.textContent = copy.sub;
    return;
  }
  showEndedFallback(session);
}

function showEndedFallback(session) {
  const copy = expiredListenCopy(session);
  openOverlay({
    kicker: copy.kicker,
    title: copy.title,
    sub: copy.sub,
    art: session?.songCover,
    actionsHtml: `
      <button type="button" class="npPresenceBtn npPresenceBtn--primary" data-ll-act="dismiss">OK</button>`,
    onAction: () => closeOverlay(),
  });
}

function showJoinPrompt(session) {
  const name = displayName(session?.host || {});
  const title = String(session.songTitle || "").trim() || "Now Playing";
  haptic("impact");
  playListenCue("invite");
  openOverlay({
    kicker: "Live listen",
    title,
    sub: `Start from the beginning with ${name}`,
    art: session.songCover,
    actionsHtml: `
      <button type="button" class="npPresenceBtn npPresenceBtn--ghost" data-ll-act="dismiss">Not now</button>
      <button type="button" class="npPresenceBtn npPresenceBtn--primary" data-ll-act="join">Start together</button>`,
    onAction: async (act, btn) => {
      if (act !== "join") {
        closeOverlay();
        return;
      }
      if (_joinBusy) return;
      _joinBusy = true;
      btn.textContent = "Starting together…";
      btn.disabled = true;
      try { bridge.primePlayerInGesture?.(); } catch {}
      haptic();
      try {
        const data = await api("post", { action: "join", sessionId: session.id });
        const next = data?.session || session;
        if (!data?.live && next.status !== "live") {
          closeOverlay();
          showEndedFallback(next);
          return;
        }
        closeOverlay();
        await becomeGuest(next);
        await loadSessionAudio(next, {
          startAtMs: 0,
          autoplay: false,
        });
        await announceGuestJoined();
      } catch (e) {
        toast(String(e?.message || "Could not join"), { durationMs: 2800 });
        btn.textContent = "Start together";
        btn.disabled = false;
      } finally {
        _joinBusy = false;
      }
    },
  });
}

function notificationPreviewSession(n) {
  const meta = n?.metadata || {};
  return {
    id: String(n?.entity_id || meta.session_id || "").trim(),
    songTitle: String(meta.song_title || "").trim(),
    songCover: String(meta.song_cover || meta.song_art_url || "").trim(),
    host: {
      username: String(meta.actor_username || "").replace(/^@/, "").trim(),
      displayName: String(meta.actor_display_name || meta.actor_username || "").replace(/^@/, "").trim(),
    },
  };
}

function showListenSheetPreview(preview) {
  const name = displayName(preview?.host || {});
  const token = _listenOpenToken;
  openOverlay({
    kicker: "Listen together",
    title: preview?.songTitle || "Listen together",
    sub: name && name !== "friend" ? `With ${name}` : "",
    art: preview?.songCover,
    actionsHtml: `
      <button type="button" class="npPresenceBtn npPresenceBtn--primary" data-ll-act="dismiss">OK</button>`,
    onAction: () => {
      if (token === _listenOpenToken) _listenOpenToken += 1;
      closeOverlay();
    },
    onDismiss: () => {
      if (token === _listenOpenToken) _listenOpenToken += 1;
    },
  });
}

export function openLiveListenFromNotification(n) {
  const preview = notificationPreviewSession(n);
  void handleLiveListenDeepLink(preview.id, preview);
}

export async function handleLiveListenDeepLink(sessionId, preview = null) {
  const sid = String(sessionId || preview?.id || "").trim();
  if (!sid || !nabadLiveListenGuestEnabled()) {
    if (preview) showEndedFallback(preview);
    return;
  }
  const token = ++_listenOpenToken;
  if (preview) showListenSheetPreview(preview);
  try {
    const data = await api("get", { sessionId: sid });
    if (token !== _listenOpenToken) return;
    const session = data?.session;
    if (!session) {
      revealExpiredListen(preview);
      return;
    }
    if (session.role === "host") {
      closeOverlay();
      await becomeHost(session);
      return;
    }
    if (session.status !== "live" && session.status !== "pending") {
      revealExpiredListen(session.songTitle ? session : { ...preview, ...session });
      return;
    }
    showJoinPrompt(session);
  } catch (e) {
    if (token !== _listenOpenToken) return;
    const msg = String(e?.message || "");
    if (/not found|ended|not in this session/i.test(msg)) {
      revealExpiredListen(preview);
      return;
    }
    toast(msg || "Could not open live listen", { durationMs: 2800 });
  }
}

async function ensureHostTrackLoaded(track) {
  const url = String(track?.url || "").trim();
  if (!url || typeof bridge.playUrlOnPlayer !== "function") return;
  const current = bridge.getTrackRef?.();
  if (sessionMatchesPlayer(
    { songUrl: url, songId: String(track?.songId || "") },
    current?.url,
    current?.songId,
  )) return;
  try { bridge.primePlayerInGesture?.(); } catch {}
  await bridge.playUrlOnPlayer(url, track.title || "Song", track.artUrl || track.art || "", {
    songId: track.songId || "",
    ownerUserId: track.ownerUserId || "",
    openPlayer: true,
    liveListenJoin: true,
    liveListenHold: true,
    forceReload: true,
  });
}

async function createSessionForGuest(guest, track, rowBtn) {
  if (_inviteBusy) return;
  const url = String(track?.url || "").trim();
  const handle = displayName(guest);
  if (!guest?.userId || !url) {
    setOverlayStatus("Open a song first, then invite.");
    toast("Open a song first, then invite.");
    return;
  }
  _inviteBusy = true;
  if (rowBtn) {
    rowBtn.disabled = true;
    const sub = rowBtn.querySelector(".messagesShareRowBody span");
    if (sub) sub.textContent = "Inviting…";
  }
  setOverlayStatus(`Inviting @${handle}…`);
  try {
    await ensureHostTrackLoaded(track);
    await holdHostAtStart();
    let shareUrl = url;
    try {
      if (typeof bridge.resolveShareableAudioUrl === "function") {
        shareUrl = await bridge.resolveShareableAudioUrl(track) || url;
      }
    } catch {}
    const hideTitles = Boolean(bridge.presenceHideTitles?.());
    const data = await api("post", {
      action: "create",
      guestUserId: guest.userId,
      songId: track.songId || "",
      songTitle: hideTitles ? "" : (track.title || ""),
      songCover: track.artUrl || track.art || "",
      songUrl: shareUrl,
      songOwnerId: track.ownerUserId || "",
      positionMs: 0,
      playing: false,
      durationMs: currentDurationMs(),
      hideTitles,
      threadId: guest.threadId || "",
    });
    const session = data?.session;
    if (!session?.id) throw new Error("Could not start live listen");
    closeOverlay();
    await becomeHost(session);
    toast(`Back to the start. Plays when @${handle} joins — tap the chip to cancel.`, { icon: "🎧", durationMs: 3400 });
  } catch (e) {
    const raw = String(e?.message || "Could not start live listen");
    const msg = /not set up|table_missing/i.test(raw)
      ? "Database table missing — run listen_sessions.sql, then push staging"
      : /not found|404/i.test(raw)
        ? "Live Listen isn’t available right now. Try again in a minute."
        : raw;
    setOverlayStatus(msg);
    toast(msg, { durationMs: 4200 });
    if (rowBtn) {
      rowBtn.disabled = false;
      const sub = rowBtn.querySelector(".messagesShareRowBody span");
      if (sub) sub.textContent = "Listen together";
    }
  } finally {
    _inviteBusy = false;
  }
}

function renderInviteList(friends, track) {
  const rows = (friends || []).map((f, idx) => {
    const handle = escapeHtml(displayName(f));
    return `
      <button type="button" class="messagesShareRow" data-ll-act="invite" data-ll-friend="${idx}">
        ${avatarHtml(f, "messagesShareRowArt")}
        <span class="messagesShareRowBody">
          <strong>@${handle}</strong>
          <span>Listen together</span>
        </span>
      </button>`;
  }).join("");
  openOverlay({
    kicker: "Listen together",
    title: track?.title || "Song",
    sub: "Pick a mutual fan",
    art: track?.artUrl || track?.art,
    actionsHtml: `<div class="liveListenInviteList">${rows || `<div class="messagesShareEmpty">Become mutual fans with someone first.</div>`}</div>`,
    onAction: (act, btn) => {
      if (act !== "invite") return;
      const friend = friends[Number(btn.getAttribute("data-ll-friend"))];
      if (friend) void createSessionForGuest(friend, track, btn);
    },
  });
}

export async function openLiveListenInviteFromChat() {
  if (!nabadLiveListenEnabled()) return;
  const partner = bridge.getChatPartner?.();
  const presence = bridge.getChatPartnerPresence?.();
  if (!partner?.userId) {
    toast("Open a chat first.");
    return;
  }
  const track = {
    url: String(presence?.songUrl || "").trim(),
    title: presence?.songTitle || "Now Playing",
    artUrl: presence?.songCover || "",
    songId: presence?.songId || "",
    ownerUserId: presence?.songOwnerId || "",
  };
  if (!track.url) {
    toast("They're not playing a song right now.");
    return;
  }
  try { bridge.primePlayerInGesture?.(); } catch {}
  const selfTrack = bridge.getTrackRef?.();
  const selfUrl = String(selfTrack?.url || "").trim();
  if (!selfUrl || selfUrl !== track.url) {
    try {
      await bridge.playUrlOnPlayer?.(track.url, track.title, track.artUrl, {
        songId: track.songId,
        ownerUserId: track.ownerUserId,
        openPlayer: false,
        liveListenJoin: true,
      });
    } catch {}
  }
  await createSessionForGuest({
    userId: partner.userId,
    username: partner.username || partner.displayName,
    displayName: partner.displayName || partner.username,
    avatar: partner.avatarUrl || partner.avatar,
    threadId: partner.threadId || "",
  }, bridge.getTrackRef?.() || track);
}

export async function openLiveListenInviteFromPlayer() {
  if (!nabadLiveListenEnabled()) return;
  const track = bridge.getTrackRef?.();
  if (!track?.url) {
    toast("Play a song first, then invite.");
    return;
  }
  let friends = [];
  try {
    friends = await bridge.fetchMutualFriendsForShare?.() || [];
  } catch {
    friends = [];
  }
  renderInviteList(friends, track);
}

export async function openLiveListenInviteForTrack(track) {
  if (!nabadLiveListenEnabled()) return;
  if (!String(bridge.getUserId?.() || "").trim()) {
    toast("Sign in to listen together.");
    return;
  }
  const url = String(track?.url || "").trim();
  if (!url) {
    toast("This song has no audio yet.");
    return;
  }
  let friends = [];
  try {
    friends = await bridge.fetchMutualFriendsForShare?.() || [];
  } catch {
    friends = [];
  }
  renderInviteList(friends, track);
}

export function decorateNowPlayingPresenceActions(overlay, presence) {
  if (!nabadLiveListenEnabled() || !overlay) return;
  const actions = overlay.querySelector(".npPresenceActions");
  if (!actions || actions.querySelector("[data-np-act='listen']")) return;
  const url = String(presence?.songUrl || "").trim();
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "npPresenceBtn npPresenceBtn--primary";
  btn.setAttribute("data-np-act", "listen");
  btn.textContent = "Listen together";
  if (!url) btn.disabled = true;
  actions.appendChild(btn);
}

export function noteLiveListenHostScrub() {
  if (!isLiveListenHost() || hostAwaitingGuest()) return;
  _hostScrubUntil = Date.now() + 2000;
}

export function noteLiveListenHostTransport(wantPlaying) {
  if (!isLiveListenHost() || hostAwaitingGuest()) return;
  _hostWantsPlaying = Boolean(wantPlaying);
}

export function onLiveListenPlayerEvent(type) {
  if (isLiveListenGuest()) {
    if (type === "ended") holdGuestBeforeEnd(playerEl());
    return;
  }
  if (!isLiveListenHost()) return;
  if (type === "pause") {
    if (_applyingRemote || hostAwaitingGuest()) return;
    _hostWantsPlaying = false;
    void broadcastTick({ playing: false, positionMs: currentPositionMs(), reason: "transport" });
    return;
  }
  if (type === "ended") {
    if (hostAwaitingGuest() || Date.now() < _suppressHostEventsUntil) return;
    const ended = playerEl();
    if (!sessionMatchesPlayer(_state?.session, ended?.currentSrc || ended?.src, _state?.session?.songId)) return;
    _hostAtEnd = true;
    _hostWantsPlaying = false;
    void broadcastTick({ playing: false, positionMs: currentDurationMs(), reason: "ended" });
    showHostSongEnded();
    return;
  }
  if (_applyingRemote) return;
  if (hostAwaitingGuest()) {
    const a = playerEl();
    const onInvited = sessionMatchesPlayer(_state.session, a?.currentSrc || a?.src, _state.session?.songId);
    if (!onInvited) return;
    applyRemoteFlag(500);
    try { a?.pause?.(); } catch {}
    if (a && Number.isFinite(a.currentTime) && a.currentTime > 0.15) {
      try { a.currentTime = 0; } catch {}
    }
    if (_state?.session) _state.session.positionMs = 0;
    if (type === "play") {
      toast("It starts when they join. Tap the chip to cancel.", { durationMs: 2200 });
    }
    return;
  }
  if (type === "play") {
    if (_hostAtEnd) {
      _hostAtEnd = false;
      _hostEndSheetOpen = false;
      closeOverlay();
      void startTogetherAsHost({ replay: true });
      return;
    }
    if (!_hostWantsPlaying) {
      applyRemoteFlag(250);
      try { playerEl()?.pause?.(); } catch {}
      void broadcastTick({ playing: false, positionMs: currentPositionMs(), reason: "transport" });
      return;
    }
    if (Date.now() < _suppressHostEventsUntil) return;
    void broadcastTick({ playing: true, positionMs: currentPositionMs(), reason: "transport" });
    return;
  }
  if (type === "seeked") {
    if (Date.now() < _suppressHostEventsUntil) return;
    if (Date.now() > _hostScrubUntil) return;
    const pos = currentPositionMs();
    const last = Number(_state?.session?.positionMs);
    if (Number.isFinite(last) && Math.abs(pos - last) < SEEK_FOLLOW_MS) return;
    _hostScrubUntil = 0;
    void broadcastTick({
      playing: _hostWantsPlaying && isPlayerPlaying(),
      positionMs: pos,
      reason: "seek",
    });
  }
}

export function interceptLiveListenSongChange(nextUrl, opts = {}) {
  if (!isLiveListenActive()) return false;
  if (opts?.liveListenJoin) return false;
  if (hostAwaitingGuest()) return false;
  const next = String(nextUrl || "").trim();
  const songId = String(opts?.songId || opts?.playSource?.songId || "").trim();
  if (sessionMatchesPlayer(_state?.session, next, songId)) return false;
  haptic("impact");
  toast("Stay on this song until you leave live listen", { durationMs: 2400 });
  return true;
}

export function interceptLiveListenTransport() {
  if (!isLiveListenTransportLocked()) return false;
  toast("Following the host — you can leave from the live chip", { durationMs: 2200 });
  return true;
}
