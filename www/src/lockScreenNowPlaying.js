/** Lock screen / Control Center metadata for in-app HTML5 audio. */

const DEFAULT_ORIGIN = "https://nabadai.com";

let _handlers = null;
let _nativeListener = null;
let _lastKey = "";
let _throttleTimer = 0;
let _mediaSessionReady = false;

function isNativeIos() {
  try {
    return Boolean(window.Capacitor?.isNativePlatform?.() && window.Capacitor?.getPlatform?.() === "ios");
  } catch {
    return false;
  }
}

function getNowPlayingPlugin() {
  try {
    return window.Capacitor?.Plugins?.NowPlaying || null;
  } catch {
    return null;
  }
}

function ensureNowPlayingPluginRegistered() {
  try {
    const cap = window.Capacitor;
    if (!cap?.registerPlugin || cap.Plugins?.NowPlaying) return;
    cap.registerPlugin("NowPlaying", {
      web: () => ({
        async update() {},
        async clear() {},
        async addListener() {
          return { remove: async () => {} };
        },
      }),
    });
  } catch {
    /* noop */
  }
}

/** Absolute https URL — required for iOS lock screen artwork. */
export function absoluteArtworkUrl(url) {
  const u = String(url || "").trim();
  if (!u || u.startsWith("data:")) return "";
  try {
    if (/^https?:\/\//i.test(u)) return u;
    if (u.startsWith("//")) return `https:${u}`;
    const base =
      typeof location !== "undefined" && location.href
        ? location.href
        : `${DEFAULT_ORIGIN}/`;
    return new URL(u, base).href;
  } catch {
    return "";
  }
}

/** iOS Safari/WKWebView: first artwork entry ≤128px; native bridge loads the URL separately. */
function webArtworkEntries(artUrl) {
  const src = absoluteArtworkUrl(artUrl);
  if (!src) return [];
  return [
    { src, sizes: "96x96", type: "image/png" },
    { src, sizes: "128x128", type: "image/png" },
  ];
}

function installMediaSessionHandlers() {
  if (_mediaSessionReady || typeof navigator === "undefined" || !("mediaSession" in navigator)) return;
  _mediaSessionReady = true;
  const run = (fn) => {
    try {
      fn();
    } catch {
      /* noop */
    }
  };
  navigator.mediaSession.setActionHandler("play", () => {
    run(() => _handlers?.onPlay?.());
  });
  navigator.mediaSession.setActionHandler("pause", () => {
    run(() => _handlers?.onPause?.());
  });
  navigator.mediaSession.setActionHandler("nexttrack", () => {
    run(() => _handlers?.onNext?.());
  });
}

function installNativeRemoteListener() {
  if (!isNativeIos() || _nativeListener) return;
  ensureNowPlayingPluginRegistered();
  const plugin = getNowPlayingPlugin();
  if (!plugin?.addListener) return;
  try {
    _nativeListener = plugin.addListener("remoteAction", (ev) => {
      const action = String(ev?.action || "").toLowerCase();
      if (action === "play") _handlers?.onPlay?.();
      else if (action === "pause") _handlers?.onPause?.();
      else if (action === "toggle") _handlers?.onToggle?.();
      else if (action === "next") _handlers?.onNext?.();
    });
  } catch {
    /* noop */
  }
}

export function initLockScreenNowPlaying(handlers = {}) {
  _handlers = handlers;
  ensureNowPlayingPluginRegistered();
  installMediaSessionHandlers();
  installNativeRemoteListener();
}

export async function clearLockScreenNowPlaying() {
  _lastKey = "";
  if (_throttleTimer) {
    clearTimeout(_throttleTimer);
    _throttleTimer = 0;
  }
  try {
    if ("mediaSession" in navigator) {
      navigator.mediaSession.metadata = null;
      navigator.mediaSession.playbackState = "none";
    }
  } catch {
    /* noop */
  }
  if (isNativeIos()) {
    try {
      await getNowPlayingPlugin()?.clear?.();
    } catch {
      /* noop */
    }
  }
}

function buildPayload() {
  const audio = _handlers?.getAudio?.();
  const meta = _handlers?.getMeta?.();
  const title = String(meta?.title || "").trim();
  if (!audio || !title) return null;

  const src = String(audio.src || audio.currentSrc || "").trim();
  if (!src) return null;

  const cur = Number.isFinite(audio.currentTime) ? audio.currentTime : 0;
  const durFn = _handlers?.getDuration;
  const dur = typeof durFn === "function" ? Number(durFn(audio) || 0) : Number(audio.duration || 0);
  const playing = Boolean(!audio.paused && !audio.ended && (dur > 0 || cur > 0));
  if (!playing && cur <= 0) return null;

  const artist = String(meta?.subtitle || "").trim() || "NabadAi Music";
  const artworkUrl = absoluteArtworkUrl(meta?.art || meta?.artUrl || "");

  return {
    title,
    artist,
    artworkUrl,
    duration: dur > 0 ? dur : 0,
    position: cur,
    playbackRate: playing ? 1 : 0,
    isPlaying: playing,
  };
}

async function pushPayload(payload) {
  if (!payload) {
    await clearLockScreenNowPlaying();
    return;
  }

  const key = [
    payload.title,
    payload.artist,
    payload.artworkUrl,
    payload.isPlaying ? "1" : "0",
    Math.floor(payload.position),
    Math.floor(payload.duration),
  ].join("|");
  if (key === _lastKey) return;
  _lastKey = key;

  try {
    if ("mediaSession" in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: payload.title,
        artist: payload.artist,
        album: "NabadAi Music",
        artwork: webArtworkEntries(payload.artworkUrl),
      });
      navigator.mediaSession.playbackState = payload.isPlaying ? "playing" : "paused";
      if (typeof navigator.mediaSession.setPositionState === "function" && payload.duration > 0) {
        navigator.mediaSession.setPositionState({
          duration: payload.duration,
          position: payload.position,
          playbackRate: payload.isPlaying ? 1 : 0,
        });
      }
    }
  } catch {
    /* noop */
  }

  if (isNativeIos()) {
    try {
      await getNowPlayingPlugin()?.update?.(payload);
    } catch {
      /* noop */
    }
  }
}

/** Throttled sync — call from timeupdate / renderHubNowPlaying. */
export function syncLockScreenNowPlaying({ force = false } = {}) {
  if (!_handlers) return;
  const payload = buildPayload();
  if (!payload) {
    if (_lastKey) void clearLockScreenNowPlaying();
    return;
  }
  if (force) {
    _lastKey = "";
    void pushPayload(payload);
    return;
  }
  // iOS WKWebView: frequent native Now Playing updates re-touch AVAudioSession
  // and can pause inline HTML5 audio — sync less aggressively on native.
  const throttleMs = isNativeIos() ? 2500 : 400;
  if (_throttleTimer) return;
  _throttleTimer = window.setTimeout(() => {
    _throttleTimer = 0;
    void pushPayload(buildPayload());
  }, throttleMs);
}
