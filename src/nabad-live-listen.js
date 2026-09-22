/**
 * Live Listen — one song, host-owned session.
 * Hidden until launch — staging bake: nabadLiveListenUi + admin.
 *
 * v1 rules (product, not edge cases):
 * - Host owns play, pause, seek. Guest follows volume + leave only.
 * - Late join at the host's current position.
 * - If the host has left / session expired: never autoplay. Offer play from 0:00.
 */

import { NABAD_LIVE_LISTEN_PUBLIC_SHIPPED } from "./feature-flags.js";

const TICK_MS = 2500;
const HEARTBEAT_MS = 6000;
const POLL_MS = 4000;
const JOIN_WAIT_MS = 12000;
const SEEK_COOLDOWN_MS = 4000;
/** Guest starts a bit behind. After that we let it play. */
const LAG_MS = 400;
/** Treat this as a host skip, not clock drift. */
const SEEK_JUMP_MS = 4000;

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

/** Host invite / Listen together — admin-only until public launch. */
export function nabadLiveListenEnabled() {
  try {
    if (!liveListenUiAvailable()) return false;
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
  const el = document.createElement("button");
  el.type = "button";
  el.id = "liveListenChip";
  el.className = "liveListenChip";
  el.hidden = true;
  el.addEventListener("click", () => {
    haptic();
    if (isLiveListenHost()) void confirmHostEnd();
    else if (isLiveListenGuest()) void confirmGuestLeave();
  });
  document.body.appendChild(el);
  _chipEl = el;
  return el;
}

export function syncLiveListenChrome() {
  const chip = ensureChip();
  const active = Boolean(_state?.role) && !_state?.solo;
  chip.hidden = !active;
  if (!active) {
    setBodyRole();
    syncShareChooserButton();
    return;
  }
  const name = partnerLabel(_state.session);
  const waiting = hostAwaitingGuest() || _state.session?.status === "pending";
  const live = _state.session?.status === "live" && !waiting;
  const kicker = _state.role === "host"
    ? (waiting ? `Waiting for @${name}` : (live ? `Live with @${name}` : "Live listen"))
    : `Live with @${name}`;
  chip.innerHTML = `<span class="liveListenChipDot" aria-hidden="true"></span><span class="liveListenChipLabel">${escapeHtml(kicker)}</span>`;
  chip.setAttribute("aria-label", _state.role === "host"
    ? (waiting ? "Cancel live listen invite" : "End live listen")
    : "Leave live listen");
  setBodyRole();
  syncShareChooserButton();
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

function openOverlay({ kicker, title, sub, art, actionsHtml, onAction }) {
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

/** Join / rare resync point — behind the host, never ahead. */
function targetMsFromTick(tick) {
  return Math.max(0, hostNowMs(tick) - LAG_MS);
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

function hostPositionJumped(tick) {
  const pos = hostNowMs(tick);
  if (!_lastHostAt) {
    noteHostClock(tick);
    return false;
  }
  const elapsed = Math.max(0, Date.now() - _lastHostAt);
  const playing = tick?.playing !== false && String(tick?.status || "live") === "live";
  const expected = _lastHostPosMs + (playing ? elapsed : 0);
  const jump = Math.abs(pos - expected);
  noteHostClock(tick);
  return jump >= SEEK_JUMP_MS;
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

async function applyGuestTick(tick, { force = false, allowSeek = true } = {}) {
  if (!isLiveListenGuest()) return;
  if (!sessionMatchesPlayer(_state?.session, tick?.audioUrl || _state?.session?.songUrl, tick?.songId || _state?.session?.songId)) {
    return;
  }
  const a = playerEl();
  if (!a) return;
  if (_seekInFlight && !force) return;
  const playing = tick?.playing !== false && String(tick?.status || "live") === "live";

  try {
    if (!playing) {
      resetGuestPlaybackRate();
      if (!a.paused) {
        _applyingRemote = true;
        try { a.pause(); } catch {}
        window.setTimeout(() => { _applyingRemote = false; }, 60);
      }
      return;
    }
    if (a.paused) {
      _applyingRemote = true;
      try { await a.play(); } catch {}
      window.setTimeout(() => { _applyingRemote = false; }, 60);
    }

    if (!allowSeek && !force) return;
    const skipped = force || hostPositionJumped(tick);
    if (!skipped) return;
    if (!force && Date.now() - _lastSeekAt < SEEK_COOLDOWN_MS) return;
    const hostSec = hostNowMs(tick) / 1000;
    const targetSec = targetMsFromTick(tick) / 1000;
    _seekInFlight = true;
    _lastSeekAt = Date.now();
    _applyingRemote = true;
    try { a.currentTime = Math.max(0, Math.min(targetSec, hostSec)); } catch {}
    resetGuestPlaybackRate();
    window.setTimeout(() => {
      _seekInFlight = false;
      _applyingRemote = false;
    }, 400);
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
    status: "live",
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
        _state.session = session;
        if (session.status !== "live") {
          await onHostLeft();
          return;
        }
        const prev = _state.session || {};
        _state.session = {
          ...prev,
          ...session,
          positionMs: prev.positionMs,
          hostSentAt: prev.hostSentAt,
        };
        await applyGuestTick(session, { allowSeek: false });
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

async function becomeHost(session, { awaitingGuest = true } = {}) {
  _state = { role: "host", session, awaitingGuest: awaitingGuest && session?.guestJoined !== true && session?.status !== "ended" };
  if (session?.status === "live" && session?.guestJoined === true) _state.awaitingGuest = false;
  if (session?.status === "pending" || session?.guestJoined === false) _state.awaitingGuest = true;
  await subscribeSession(session.id);
  startHostTimers();
  void broadcastTick();
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
  toast(`@${name} joined live listen`, { icon: "🎧", durationMs: 2800 });
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
  await subscribeSession(session.id);
  startGuestPoll();
  syncLiveListenChrome();
  haptic("success");
  playListenCue("joined");
  try {
    const mod = await bridge.loadRealtimeMod?.();
    await mod?.sendListenSessionBroadcast?.({
      sessionId: session.id,
      event: "ll_join",
      payload: { sessionId: session.id, status: "live" },
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
    });
  }
  const a = playerEl();
  await waitForCanPlay(a);
  const targetSec = Math.max(0, (Number(startAtMs) || 0) / 1000);
  _applyingRemote = true;
  try {
    if (a) {
      try { a.playbackRate = 1; } catch {}
    }
    if (a && targetSec > 0.25) {
      try { a.currentTime = targetSec; } catch {}
    }
    if (autoplay && a) {
      try { await a.play(); } catch {}
    } else if (a && !a.paused) {
      try { a.pause(); } catch {}
    }
  } finally {
    _lastSeekAt = Date.now();
    noteHostClock({ positionMs: Number(startAtMs) || 0, playing: autoplay });
    window.setTimeout(() => { _applyingRemote = false; }, 80);
  }
}

async function onHostLeft() {
  if (!isLiveListenGuest()) return;
  const session = _state.session;
  const name = partnerLabel(session);
  const a = playerEl();
  _applyingRemote = true;
  resetGuestPlaybackRate();
  try { a?.pause?.(); } catch {}
  window.setTimeout(() => { _applyingRemote = false; }, 40);
  stopTimers();
  openOverlay({
    kicker: "Live listen ended",
    title: session?.songTitle || "Song",
    sub: `${name} left — keep listening?`,
    art: session?.songCover,
    actionsHtml: `
      <button type="button" class="npPresenceBtn npPresenceBtn--ghost" data-ll-act="stop">Stop</button>
      <button type="button" class="npPresenceBtn npPresenceBtn--primary" data-ll-act="keep">Keep listening</button>`,
    onAction: (act) => {
      closeOverlay();
      if (act === "keep") {
        resetGuestPlaybackRate();
        _state = { role: "guest", session, solo: true };
        setBodyRole();
        syncLiveListenChrome();
        void playerEl()?.play?.().catch(() => {});
        void clearLocalSession();
        return;
      }
      void clearLocalSession();
    },
  });
}

async function confirmHostEnd() {
  const name = partnerLabel(_state?.session);
  const waiting = hostAwaitingGuest();
  openOverlay({
    kicker: waiting ? "Invite sent" : "Live listen",
    title: _state?.session?.songTitle || "Song",
    sub: waiting ? `Cancel invite to @${name}?` : `End live listen with @${name}?`,
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
    try { await api("post", { action: "end", sessionId: sid }); } catch {}
  }
  await clearLocalSession();
  toast("Live listen ended");
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

function showEndedFallback(session) {
  const title = String(session?.songTitle || "").trim() || "this song";
  const name = displayName(session?.host || {});
  openOverlay({
    kicker: "Live listen ended",
    title,
    sub: name ? `${name} is no longer live` : "The live moment has ended",
    art: session?.songCover,
    actionsHtml: `
      <button type="button" class="npPresenceBtn npPresenceBtn--ghost" data-ll-act="dismiss">Not now</button>
      <button type="button" class="npPresenceBtn npPresenceBtn--primary" data-ll-act="play"${session?.songUrl ? "" : " disabled"}>Play this song</button>`,
    onAction: (act) => {
      closeOverlay();
      if (act !== "play" || !session?.songUrl) return;
      try { bridge.primePlayerInGesture?.(); } catch {}
      void bridge.playUrlOnPlayer?.(session.songUrl, session.songTitle || "Song", session.songCover, {
        songId: session.songId,
        ownerUserId: session.songOwnerId,
        openPlayer: true,
      });
    },
  });
}

function showJoinPrompt(session) {
  const name = displayName(session?.host || {});
  const target = targetMsFromTick(session);
  const clock = formatTime(target / 1000);
  const title = String(session.songTitle || "").trim() || "Now Playing";
  haptic("impact");
  playListenCue("invite");
  openOverlay({
    kicker: "Live listen",
    title,
    sub: `Join ${name} at ${clock}?`,
    art: session.songCover,
    actionsHtml: `
      <button type="button" class="npPresenceBtn npPresenceBtn--ghost" data-ll-act="dismiss">Not now</button>
      <button type="button" class="npPresenceBtn npPresenceBtn--primary" data-ll-act="join">Join live</button>`,
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
          startAtMs: targetMsFromTick(next),
          autoplay: next.playing !== false,
        });
      } catch (e) {
        toast(String(e?.message || "Could not join"), { durationMs: 2800 });
        btn.textContent = "Join live";
        btn.disabled = false;
      } finally {
        _joinBusy = false;
      }
    },
  });
}

export async function handleLiveListenDeepLink(sessionId) {
  const sid = String(sessionId || "").trim();
  if (!sid || !nabadLiveListenGuestEnabled()) return;
  try {
    const data = await api("get", { sessionId: sid });
    const session = data?.session;
    if (!session) {
      toast("Live listen ended");
      return;
    }
    if (session.role === "host") {
      await becomeHost(session);
      return;
    }
    if (session.status !== "live" && session.status !== "pending") {
      showEndedFallback(session);
      return;
    }
    showJoinPrompt(session);
  } catch (e) {
    const msg = String(e?.message || "");
    if (/not found|ended|not in this session/i.test(msg)) {
      toast("Live listen ended");
      return;
    }
    toast(msg || "Could not open live listen", { durationMs: 2800 });
  }
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
      positionMs: currentPositionMs(),
      playing: isPlayerPlaying(),
      durationMs: currentDurationMs(),
      hideTitles,
      threadId: guest.threadId || "",
    });
    const session = data?.session;
    if (!session?.id) throw new Error("Could not start live listen");
    closeOverlay();
    await becomeHost(session);
    toast(`Waiting for @${handle} to join`, { icon: "🎧", durationMs: 2600 });
  } catch (e) {
    const raw = String(e?.message || "Could not start live listen");
    const msg = /not set up|table_missing/i.test(raw)
      ? "Database table missing — run listen_sessions.sql, then push staging"
      : /not found|404/i.test(raw)
        ? "Staging API doesn’t have Live Listen yet — push the staging branch"
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

export function onLiveListenPlayerEvent(type) {
  if (_applyingRemote) return;
  if (!isLiveListenHost()) return;
  if (type === "ended") {
    void endHostSession();
    return;
  }
  if (type === "play" || type === "pause") {
    void broadcastTick({ playing: type !== "pause" && isPlayerPlaying() });
    return;
  }
  if (type === "seeked") {
    const pos = currentPositionMs();
    const last = Number(_state?.session?.positionMs);
    if (Number.isFinite(last) && Math.abs(pos - last) < 1500) return;
    void broadcastTick({ playing: isPlayerPlaying() });
  }
}

export function interceptLiveListenSongChange(nextUrl, opts = {}) {
  if (!isLiveListenActive()) return false;
  if (opts?.liveListenJoin) return false;
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
