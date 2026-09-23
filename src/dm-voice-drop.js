/**
 * DM Voice Drop — record in the composer glass pill, send the same capsule into chat.
 */

import {
  isNativeIosStudio,
  isNativeVoiceDropRecordingAvailable,
  startNativeVoiceDropRecording,
  stopNativeVoiceDropRecording,
  cancelNativeVoiceDropRecording,
} from "./studio/native-mic-probe.js";

export const DM_VOICE_MARKER = "voice";
export const DM_VOICE_MAX_MS = 30000;
export const DM_VOICE_MAX_BYTES = 512 * 1024;
export const DM_VOICE_BLOOM_BARS = 12;
export const DM_VOICE_ARC_BARS = 9;
export const DM_VOICE_WAVE_BARS = 24;

let _deps = {};
let _recState = "idle";
let _recorder = null;
let _stream = null;
let _chunks = [];
let _blob = null;
let _blobUrl = "";
let _durationMs = 0;
let _peaks = [];
let _startedAt = 0;
let _tickRaf = 0;
let _autostopTimer = 0;
let _composeCtx = null;
let _composeAnalyser = null;
let _playingAudio = null;
let _playingId = "";
let _playingRaf = 0;
const _voicePlayBlobCache = new Map();
const _voiceAudioCache = new Map();
const VOICE_AUDIO_CACHE_MAX = 8;
let _nativeRec = false;
let _sendInFlight = false;
let _composerSendLock = false;
let _sendRequested = false;
let _startPromise = null;
let _finishPromise = null;
let _stopResolvers = [];

function d() {
  return _deps;
}

function extFromMime(mime) {
  const m = String(mime || "").toLowerCase();
  if (m.includes("mp4") || m.includes("m4a") || m.includes("aac")) return "m4a";
  if (m.includes("mpeg") || m.includes("mp3")) return "mp3";
  if (m.includes("ogg")) return "ogg";
  if (m.includes("wav")) return "wav";
  return "webm";
}

function contentTypeForBlob(blob) {
  const raw = String(blob?.type || "").toLowerCase().trim();
  if (raw.includes("mp4") || raw.includes("m4a") || raw.includes("aac")) return "audio/mp4";
  if (raw.includes("mpeg") || raw.includes("mp3")) return "audio/mpeg";
  if (raw.includes("ogg")) return "audio/ogg";
  if (raw.includes("wav")) return "audio/wav";
  if (raw.includes("webm")) return "audio/webm";
  return "audio/mp4";
}

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

function fallbackPeaks(count) {
  return Array.from({ length: count }, (_, i) => {
    const t = i / Math.max(1, count - 1);
    const w = Math.abs(Math.sin(t * 6.4 + 0.5) * Math.cos(t * 3.1));
    return Math.round((0.12 + 0.88 * w) * 100) / 100;
  });
}

export function normalizeVoicePeaks(peaks, count = DM_VOICE_ARC_BARS) {
  let src = Array.isArray(peaks) && peaks.length
    ? peaks.map((n) => Math.max(0, Math.min(1, Number(n) || 0)))
    : fallbackPeaks(count);
  if (src.length !== count) {
    const out = [];
    for (let i = 0; i < count; i++) {
      const pos = (i / Math.max(1, count - 1)) * (src.length - 1);
      const lo = Math.floor(pos);
      const hi = Math.min(src.length - 1, lo + 1);
      const frac = pos - lo;
      out.push(src[lo] * (1 - frac) + src[hi] * frac);
    }
    src = out;
  }
  const max = Math.max(...src, 0.001);
  const min = Math.min(...src);
  const span = Math.max(0.001, max - min);
  return src.map((p) => {
    const n = (p - min) / span;
    return Math.round((0.08 + Math.pow(n, 0.55) * 0.92) * 100) / 100;
  });
}

async function computePeaksFromBlob(blob, barCount = 52) {
  try {
    const ctx = new AudioContext();
    const buf = await blob.arrayBuffer();
    const audio = await ctx.decodeAudioData(buf.slice(0));
    const ch = audio.getChannelData(0);
    const buckets = Math.max(8, barCount);
    const block = Math.max(1, Math.floor(ch.length / buckets));
    const peaks = [];
    for (let i = 0; i < buckets; i++) {
      let max = 0;
      const start = i * block;
      const end = Math.min(ch.length, start + block);
      for (let j = start; j < end; j++) max = Math.max(max, Math.abs(ch[j]));
      peaks.push(max);
    }
    try { await ctx.close(); } catch {}
    return normalizeVoicePeaks(peaks, DM_VOICE_ARC_BARS);
  } catch {
    return fallbackPeaks(DM_VOICE_ARC_BARS);
  }
}

function liveWaveHeights() {
  if (_nativeRec && _recState === "recording") {
    const t = performance.now() / 180;
    const raw = Array.from({ length: DM_VOICE_WAVE_BARS }, (_, i) => {
      const w = 0.28 + Math.abs(Math.sin(t + i * 0.55)) * 0.62;
      return w;
    });
    return normalizeVoicePeaks(raw, DM_VOICE_WAVE_BARS);
  }
  if (!_composeAnalyser || _recState !== "recording") {
    return normalizeVoicePeaks(_peaks, DM_VOICE_WAVE_BARS);
  }
  const data = new Uint8Array(_composeAnalyser.frequencyBinCount);
  _composeAnalyser.getByteFrequencyData(data);
  const step = Math.max(1, Math.floor(data.length / DM_VOICE_WAVE_BARS));
  const raw = [];
  for (let i = 0; i < DM_VOICE_WAVE_BARS; i++) {
    let sum = 0;
    const base = i * step;
    for (let j = 0; j < step; j++) sum += data[base + j] || 0;
    raw.push(sum / step / 255);
  }
  return normalizeVoicePeaks(raw, DM_VOICE_WAVE_BARS);
}

function renderComposerWave({ live = false } = {}) {
  const wave = document.getElementById("messagesVoiceComposerWave");
  if (!wave) return;
  const heights = live ? liveWaveHeights() : normalizeVoicePeaks(_peaks, DM_VOICE_WAVE_BARS);
  const bars = wave.querySelectorAll(".messagesVoiceDropBar");
  if (bars.length !== heights.length) {
    wave.innerHTML = heights.map((h, i) => {
      const ht = Math.max(0.28, Math.min(1, Number(h) || 0.4));
      return `<span class="messagesVoiceDropBar" style="--h:${ht.toFixed(3)}" data-bar="${i}"></span>`;
    }).join("");
    return;
  }
  bars.forEach((bar, i) => {
    const ht = Math.max(0.28, Math.min(1, Number(heights[i]) || 0.4));
    bar.style.setProperty("--h", ht.toFixed(3));
  });
}

function notifyVoiceStopped() {
  const fns = _stopResolvers.splice(0, _stopResolvers.length);
  fns.forEach((fn) => {
    try { fn(); } catch {}
  });
}

export function isComposerVoiceActive() {
  return _recState === "starting" || _recState === "recording" || _recState === "ready";
}

function syncVoiceDropUi() {
  const recording = _recState === "recording" || _recState === "starting";
  const hasBlob = Boolean(_blob?.size) && !recording;
  const active = recording || hasBlob || _recState === "ready";
  const dock = document.getElementById("messagesVoiceComposer");
  const pill = document.getElementById("messagesVoiceComposerPill");
  const play = document.getElementById("messagesVoiceComposerPlay");
  const durEl = document.getElementById("messagesVoiceComposerDur");
  document.body.classList.toggle("messagesVoiceComposing", active);
  if (dock) dock.hidden = !active;
  if (pill) {
    pill.classList.toggle("is-recording", recording);
    pill.classList.toggle("is-ready", hasBlob);
    const url = String(_blobUrl || "");
    if (url) pill.setAttribute("data-voice-url", url);
    else pill.removeAttribute("data-voice-url");
  }
  if (play) {
    play.setAttribute("aria-label", recording ? "Stop recording" : "Preview voice");
  }
  if (durEl) {
    const ms = recording ? Math.max(0, performance.now() - _startedAt) : _durationMs;
    durEl.textContent = formatDurationSec(ms / 1000);
  }
  renderComposerWave({ live: recording });
  try { d().syncMessagesThreadComposerReady?.(); } catch {}
  try { d().updateMessagesComposerReserve?.(); } catch {}
}

function tickComposerRecordingUi() {
  const durEl = document.getElementById("messagesVoiceComposerDur");
  if (durEl) {
    durEl.textContent = formatDurationSec(Math.max(0, performance.now() - _startedAt) / 1000);
  }
  renderComposerWave({ live: true });
}

function stopVisualizer() {
  if (_tickRaf) {
    try { cancelAnimationFrame(_tickRaf); } catch {}
    _tickRaf = 0;
  }
  try { _composeAnalyser?.disconnect?.(); } catch {}
  _composeAnalyser = null;
  try { _composeCtx?.close?.(); } catch {}
  _composeCtx = null;
}

async function attachAnalyser(stream) {
  stopVisualizer();
  try {
    _composeCtx = new AudioContext();
    const source = _composeCtx.createMediaStreamSource(stream);
    _composeAnalyser = _composeCtx.createAnalyser();
    _composeAnalyser.fftSize = 256;
    source.connect(_composeAnalyser);
  } catch {}
}

function capacitorLocalUrl(path) {
  const raw = String(path || "").trim();
  if (!raw) return "";
  try {
    const cap = window.Capacitor;
    if (cap?.convertFileSrc) {
      const filePath = raw.replace(/^file:\/\//, "");
      return cap.convertFileSrc(filePath);
    }
  } catch {}
  return raw;
}

function base64ToBlob(b64, contentType = "audio/mp4") {
  const raw = String(b64 || "").trim();
  if (!raw) return null;
  const bin = atob(raw);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: contentType });
}

async function blobFromNativeVoiceResult(result) {
  const ct = String(result?.contentType || "audio/mp4").trim() || "audio/mp4";
  const b64 = String(result?.audioBase64 || "").trim();
  if (b64) {
    const blob = base64ToBlob(b64, ct);
    if (blob?.size) return blob;
  }
  const playUrl = capacitorLocalUrl(result?.wavPath);
  if (!playUrl) return null;
  const resp = await fetch(playUrl);
  if (!resp.ok) return null;
  return resp.blob();
}

function resetRecording() {
  _sendRequested = false;
  _startPromise = null;
  _finishPromise = null;
  if (_nativeRec) {
    void cancelNativeVoiceDropRecording().catch(() => {});
    _nativeRec = false;
  }
  if (_recState === "recording") {
    try { _recorder?.stop?.(); } catch {}
  }
  if (_autostopTimer) {
    clearTimeout(_autostopTimer);
    _autostopTimer = 0;
  }
  stopVisualizer();
  try { _stream?.getTracks?.().forEach((t) => t.stop()); } catch {}
  _stream = null;
  _recorder = null;
  _chunks = [];
  _blob = null;
  _durationMs = 0;
  _peaks = [];
  _recState = "idle";
  if (_blobUrl) {
    try { URL.revokeObjectURL(_blobUrl); } catch {}
    _blobUrl = "";
  }
  syncVoiceDropUi();
  notifyVoiceStopped();
}

export function buildDmVoicePayload({ url, key, durationSec, peaks } = {}) {
  const sec = Math.max(1, Math.min(120, Math.round(Number(durationSec) || 0)));
  const p = normalizeVoicePeaks(peaks, DM_VOICE_ARC_BARS).map((n) => Math.round(n * 100) / 100);
  const storageKey = String(key || "").trim();
  const directUrl = String(url || "").trim();
  const payload = {
    nabad_dm: DM_VOICE_MARKER,
    d: sec,
    p,
  };
  if (storageKey) payload.k = storageKey;
  if (directUrl) payload.u = directUrl;
  return JSON.stringify(payload);
}

function voiceDropKeyFromUrl(url) {
  const m = String(url || "").match(/\/dm_voice\/([^?]+)/i);
  if (!m) return "";
  try {
    return decodeURIComponent(m[1]);
  } catch {
    return m[1];
  }
}

export function cacheVoiceDropPlayUrl(key, playUrl) {
  const k = String(key || "").trim();
  const u = String(playUrl || "").trim();
  if (!k || !u) return;
  _voicePlayBlobCache.set(k, u);
}

function isLocalVoicePlayUrl(url) {
  const u = String(url || "").trim();
  return u.startsWith("blob:") || u.startsWith("data:");
}

function isDirectVoiceStorageUrl(url) {
  return /\/storage\/v1\/object\/public\/dm_voice\//i.test(String(url || ""));
}

function cachedVoicePlayUrl(...keys) {
  for (const raw of keys) {
    const k = String(raw || "").trim();
    if (k && _voicePlayBlobCache.has(k)) return _voicePlayBlobCache.get(k);
  }
  return "";
}

function publicVoiceDropPlayUrl(url, key) {
  const cached = cachedVoicePlayUrl(key, url, voiceDropKeyFromUrl(url));
  if (cached) return cached;
  let pubUrl = String(url || "").trim();
  const k = String(key || "").trim() || voiceDropKeyFromUrl(pubUrl);
  if ((!pubUrl || !/^https?:\/\//i.test(pubUrl)) && k) {
    const base = String(d().SUPABASE_URL || "").replace(/\/$/, "");
    if (!base) return "";
    const enc = k.split("/").map((s) => encodeURIComponent(s)).join("/");
    pubUrl = `${base}/storage/v1/object/public/dm_voice/${enc}`;
  }
  if (!pubUrl) return "";
  if (isLocalVoicePlayUrl(pubUrl)) return pubUrl;
  if (!/^https?:\/\//i.test(pubUrl)) return "";
  // Public dm_voice files play directly — the Suno audio proxy adds ~2s before
  // first audio. Proxy only as a fallback for non-storage URLs.
  if (isDirectVoiceStorageUrl(pubUrl)) {
    return d().normalizeAudioUrlForPlayback?.(pubUrl) || pubUrl;
  }
  const proxied = d().toAudioProxyUrl?.(pubUrl) || pubUrl;
  return d().normalizeAudioUrlForPlayback?.(proxied) || proxied;
}

function loadVoiceDropPlayUrl(url, key) {
  const cacheKey = String(key || "").trim() || voiceDropKeyFromUrl(url) || url;
  const cached = cachedVoicePlayUrl(cacheKey, url, key);
  if (cached) return cached;
  return publicVoiceDropPlayUrl(url, key) || "";
}

function createVoiceDropAudio(playUrl) {
  const audio = new Audio();
  audio.preload = "auto";
  try { audio.setAttribute("playsinline", ""); } catch {}
  if (!isLocalVoicePlayUrl(playUrl)) {
    try { audio.crossOrigin = "anonymous"; } catch {}
  }
  audio.src = playUrl;
  try { audio.load(); } catch {}
  return audio;
}

function getOrCreateVoiceDropAudio(playUrl) {
  const u = String(playUrl || "").trim();
  if (!u) return null;
  let audio = _voiceAudioCache.get(u);
  if (audio) return audio;
  audio = createVoiceDropAudio(u);
  _voiceAudioCache.set(u, audio);
  while (_voiceAudioCache.size > VOICE_AUDIO_CACHE_MAX) {
    const first = _voiceAudioCache.keys().next().value;
    if (!first || first === u) break;
    const old = _voiceAudioCache.get(first);
    if (old && old === _playingAudio) break;
    try {
      old?.pause?.();
      old?.removeAttribute?.("src");
      old?.load?.();
    } catch {}
    _voiceAudioCache.delete(first);
  }
  return audio;
}

export function preloadVoiceDropAudio(url, key) {
  const playUrl = loadVoiceDropPlayUrl(url, key);
  if (!playUrl) return;
  getOrCreateVoiceDropAudio(playUrl);
}

function minBytesForVoiceDrop(durationMs, blobSize = 0) {
  const sec = Math.max(1, Math.round(Number(durationMs) / 1000) || 1);
  return Math.min(DM_VOICE_MAX_BYTES, Math.max(800, sec * 400));
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Could not read recording"));
    reader.readAsDataURL(blob);
  });
}

export async function uploadDmVoiceBlob(blob, { durationMs = 0 } = {}) {
  const minBytes = minBytesForVoiceDrop(durationMs, blob?.size || 0);
  if (!blob?.size || blob.size < minBytes) {
    throw new Error(`Recording too short (${blob?.size || 0} bytes) — try again.`);
  }
  const dataUrl = await blobToDataUrl(blob);
  const data = await d().messagesApi("/api/messages", {
    method: "POST",
    timeoutMs: 90000,
    body: JSON.stringify({
      action: "upload_voice_drop",
      contentType: contentTypeForBlob(blob),
      dataBase64: dataUrl,
    }),
  });
  if (!data?.ok || !data?.url) {
    throw new Error(String(data?.error || "Voice upload failed"));
  }
  const storedBytes = Number(data.bytes) || 0;
  if (storedBytes < 800) {
    throw new Error(`Upload corrupted (${storedBytes} bytes) — try again.`);
  }
  return { url: String(data.url), key: String(data.key || ""), bytes: storedBytes };
}

function stopPreviewPlayback() {
  if (_playingRaf) {
    try { cancelAnimationFrame(_playingRaf); } catch {}
    _playingRaf = 0;
  }
  if (_playingAudio) {
    try { _playingAudio.pause(); } catch {}
    _playingAudio = null;
  }
  _playingId = "";
  document.querySelectorAll(".messagesVoiceDrop.is-playing").forEach((el) => el.classList.remove("is-playing"));
}

async function togglePreviewPlayback() {
  if (!_blobUrl) return;
  if (_playingId === "preview" && _playingAudio && !_playingAudio.paused) {
    stopPreviewPlayback();
    return;
  }
  stopPreviewPlayback();
  const audio = createVoiceDropAudio(_blobUrl);
  _playingAudio = audio;
  _playingId = "preview";
  const pill = document.getElementById("messagesVoiceComposerPill");
  pill?.classList.add("is-playing");
  audio.onended = () => {
    pill?.classList.remove("is-playing");
    stopPreviewPlayback();
  };
  try {
    await audio.play();
  } catch {}
}

async function finishNativeRecording() {
  if (_finishPromise) return _finishPromise;
  if (_recState !== "recording" || !_nativeRec) {
    notifyVoiceStopped();
    return;
  }
  _finishPromise = (async () => {
    if (_autostopTimer) {
      clearTimeout(_autostopTimer);
      _autostopTimer = 0;
    }
    stopVisualizer();
    try {
      const result = await stopNativeVoiceDropRecording();
      const blob = await blobFromNativeVoiceResult(result);
      if (!blob?.size) throw new Error("Native recording missing audio data");
      const elapsedMs = Math.max(400, Math.round(performance.now() - _startedAt));
      const nativeMs = Math.round(Number(result?.durationSec || 0) * 1000);
      const nativeLooksRight = nativeMs >= 400 && Math.abs(nativeMs - elapsedMs) <= 1500;
      const recordedMs = Math.min(DM_VOICE_MAX_MS, nativeLooksRight ? nativeMs : elapsedMs);
      const minBytes = minBytesForVoiceDrop(recordedMs, blob.size);
      if (!blob.size || blob.size < Math.min(400, minBytes)) {
        throw new Error(`Recording too short (${blob.size || 0} bytes) — try again.`);
      }
      if (blob.size > DM_VOICE_MAX_BYTES) {
        throw new Error("Drop too large — keep it under 30s.");
      }
      _blob = blob;
      _durationMs = recordedMs;
      if (_blobUrl) {
        try { URL.revokeObjectURL(_blobUrl); } catch {}
      }
      _blobUrl = URL.createObjectURL(blob);
      _recState = "ready";
      _nativeRec = false;
      syncVoiceDropUi();
      notifyVoiceStopped();
      void computePeaksFromBlob(blob).then((peaks) => {
        _peaks = peaks;
        syncVoiceDropUi();
      });
      try { d().haptic?.("success"); } catch {}
      if (_sendRequested) {
        _sendRequested = false;
        await sendVoiceDrop();
      }
    } catch (e) {
      _recState = "idle";
      _nativeRec = false;
      _sendRequested = false;
      syncVoiceDropUi();
      notifyVoiceStopped();
      d().showToast?.(String(e?.message || "Recording failed — try again."), { durationMs: 3200 });
    }
  })();
  try {
    await _finishPromise;
  } finally {
    _finishPromise = null;
  }
}

async function startRecording() {
  if (_startPromise) return _startPromise;
  if (_recState === "recording" || _recState === "ready") return;
  stopPreviewPlayback();
  _startedAt = performance.now();
  _recState = "starting";
  syncVoiceDropUi();
  try { d().haptic?.("medium"); } catch {}

  const run = (async () => {
    if (isNativeVoiceDropRecordingAvailable()) {
      await startNativeVoiceDropRecording();
      if (_recState !== "starting") {
        void cancelNativeVoiceDropRecording().catch(() => {});
        return;
      }
      _nativeRec = true;
      _startedAt = performance.now();
      _recState = "recording";
      syncVoiceDropUi();
      const tick = () => {
        if (_recState !== "recording") return;
        tickComposerRecordingUi();
        if (performance.now() - _startedAt < DM_VOICE_MAX_MS) {
          _tickRaf = requestAnimationFrame(tick);
        }
      };
      _tickRaf = requestAnimationFrame(tick);
      _autostopTimer = setTimeout(() => {
        if (_recState === "recording") void finishNativeRecording();
      }, DM_VOICE_MAX_MS + 40);
      return;
    }

    // Native Capacitor iOS uses AVAudioRecorder above. Web (including iPhone
    // Safari / PWA) must use MediaRecorder — do not send people to Xcode.
    if (isNativeIosStudio()) {
      throw new Error("Voice needs the latest app build — reinstall from Xcode.");
    }

    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    } catch {
      throw new Error("Microphone permission needed.");
    }
    if (_recState !== "starting") {
      try { stream.getTracks().forEach((t) => t.stop()); } catch {}
      return;
    }
    const pickMime = d().pickRecorderMimeType || (() => "");
    const mimeType = pickMime();
    let rec;
    try {
      rec = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
    } catch {
      try { stream.getTracks().forEach((t) => t.stop()); } catch {}
      throw new Error("Recorder not supported on this device.");
    }
    _chunks = [];
    rec.ondataavailable = (e) => {
      if (e.data?.size) _chunks.push(e.data);
    };
    rec.onstop = () => {
      try { stream.getTracks().forEach((t) => t.stop()); } catch {}
      _stream = null;
      _recorder = null;
      stopVisualizer();
      if (_autostopTimer) {
        clearTimeout(_autostopTimer);
        _autostopTimer = 0;
      }
      const blob = new Blob(_chunks, { type: rec.mimeType || mimeType || "audio/webm" });
      const recordedMs = Math.min(DM_VOICE_MAX_MS, Math.max(400, Math.round(performance.now() - _startedAt)));
      const minBytes = minBytesForVoiceDrop(recordedMs, blob.size);
      if (!blob.size || blob.size < Math.min(400, minBytes)) {
        _recState = "idle";
        syncVoiceDropUi();
        notifyVoiceStopped();
        d().showToast?.("Empty drop — try again.", { durationMs: 2400 });
        return;
      }
      if (blob.size > DM_VOICE_MAX_BYTES) {
        _recState = "idle";
        syncVoiceDropUi();
        notifyVoiceStopped();
        d().showToast?.("Drop too large — keep it under 30s.", { durationMs: 2800 });
        return;
      }
      _blob = blob;
      _durationMs = recordedMs;
      _blobUrl = URL.createObjectURL(blob);
      _recState = "ready";
      syncVoiceDropUi();
      notifyVoiceStopped();
      void computePeaksFromBlob(blob).then((peaks) => {
        _peaks = peaks;
        syncVoiceDropUi();
      });
      try { d().haptic?.("success"); } catch {}
      if (_sendRequested) {
        _sendRequested = false;
        void sendVoiceDrop();
      }
    };
    _stream = stream;
    _recorder = rec;
    void attachAnalyser(stream);
    const safariLike = isSafariLikeRecorderEnv();
    try {
      if (safariLike) rec.start(250);
      else rec.start();
    } catch {
      try {
        rec.start();
      } catch {
        try { stream.getTracks().forEach((t) => t.stop()); } catch {}
        throw new Error("Could not start recording.");
      }
    }
    _startedAt = performance.now();
    _recState = "recording";
    syncVoiceDropUi();
    const tick = () => {
      if (_recState !== "recording") return;
      tickComposerRecordingUi();
      if (performance.now() - _startedAt < DM_VOICE_MAX_MS) {
        _tickRaf = requestAnimationFrame(tick);
      }
    };
    _tickRaf = requestAnimationFrame(tick);
    _autostopTimer = setTimeout(() => {
      if (_recState === "recording") stopRecording();
    }, DM_VOICE_MAX_MS + 40);
  })();

  _startPromise = run;
  try {
    await run;
  } catch (e) {
    _nativeRec = false;
    _recState = "idle";
    _sendRequested = false;
    syncVoiceDropUi();
    d().showToast?.(String(e?.message || "Could not start recording."), { durationMs: 3200 });
  } finally {
    if (_startPromise === run) _startPromise = null;
  }
}

function stopRecording() {
  if (_startPromise && _recState === "starting") {
    void _startPromise.then(() => stopRecording()).catch(() => {});
    return;
  }
  if (_nativeRec) {
    void finishNativeRecording();
    return;
  }
  if (_recState !== "recording" || !_recorder) return;
  try {
    if (typeof _recorder.requestData === "function") _recorder.requestData();
  } catch {}
  try { _recorder.stop(); } catch {}
}

function waveBarsHtml(peaks) {
  const heights = normalizeVoicePeaks(peaks, DM_VOICE_WAVE_BARS);
  return heights.map((h, i) => {
    const ht = Math.max(0.28, Math.min(1, Number(h) || 0.4));
    return `<span class="messagesVoiceDropBar" style="--h:${ht.toFixed(3)}" data-bar="${i}"></span>`;
  }).join("");
}

export function messagesVoiceDropBubbleHtml(parsed, { mine = false, msgId = "" } = {}) {
  const url = escapeAttr(parsed?.url || "");
  const storageKey = escapeAttr(parsed?.storageKey || voiceDropKeyFromUrl(parsed?.url) || "");
  const dur = Math.max(0, Number(parsed?.durationSec) || 0);
  const durLabel = formatDurationSec(dur);
  const peaksJson = escapeAttr(JSON.stringify(normalizeVoicePeaks(parsed?.peaks, DM_VOICE_WAVE_BARS)));
  const id = escapeAttr(String(msgId || ""));
  return `
    <div class="messagesVoiceDropBlock${mine ? " is-mine" : ""}">
      <div class="messagesVoiceDropRow">
        <div class="messagesVoiceDrop${mine ? " is-mine" : ""}" data-voice-drop="${id}" data-voice-url="${url}" data-voice-key="${storageKey}" data-voice-peaks="${peaksJson}" data-voice-dur="${dur}">
          <button type="button" class="messagesVoiceDropPlay" aria-label="Play voice drop">
            <span class="messagesVoiceDropPlayDisc" aria-hidden="true">
              <svg class="messagesVoiceDropPlayIco messagesVoiceDropPlayIco--play" viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M9 7.5v9l7.5-4.5z"/></svg>
              <svg class="messagesVoiceDropPlayIco messagesVoiceDropPlayIco--pause" viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M7 6h3v12H7zm7 0h3v12h-3z"/></svg>
            </span>
          </button>
          <div class="messagesVoiceDropWave" aria-hidden="true">${waveBarsHtml(parsed?.peaks)}</div>
          <span class="messagesVoiceDropDur">${durLabel}</span>
        </div>
        <button type="button" class="messagesVoiceClipSpark" data-voice-clip-open="${id}" aria-label="Remix this voice drop" aria-expanded="false">
          <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path fill="currentColor" d="M12 2.4l1.4 5.2L18.6 9 13.4 10.4 12 15.6l-1.4-5.2L5.4 9l5.2-1.4zM18.2 14.2l.8 2.8 2.8.8-2.8.8-.8 2.8-.8-2.8-2.8-.8 2.8-.8z"/></svg>
        </button>
      </div>
      <div class="messagesVoiceClipDock" data-voice-clip-dock="${id}" hidden>
        <p class="messagesVoiceClipLead">Same as <b>Hum</b>. Turn this drop into a song.</p>
        <div class="messagesVoiceClipChips" role="group" aria-label="Remix mood">
          <button type="button" class="messagesVoiceClipChip is-on" data-voice-clip-mood="soft">Soft</button>
          <button type="button" class="messagesVoiceClipChip" data-voice-clip-mood="night">Night</button>
          <button type="button" class="messagesVoiceClipChip" data-voice-clip-mood="arabic">Arabic</button>
        </div>
        <button type="button" class="messagesVoiceClipGo" data-voice-clip-go="${id}">Remix · 12 credits</button>
      </div>
    </div>`;
}

function escapeAttr(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;");
}

export function formatDurationSec(sec) {
  const s = Math.max(0, Math.floor(Number(sec) || 0));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
}

export function formatDmVoiceInboxPreview(parsed) {
  const dur = formatDurationSec(parsed?.durationSec || 0);
  return `Voice drop · ${dur}`;
}

function animatePlayingBars(card) {
  if (!card?.classList.contains("is-playing")) return;
  const bars = card.querySelectorAll(".messagesVoiceDropBar");
  bars.forEach((bar, i) => {
    const jitter = 0.55 + Math.abs(Math.sin(performance.now() / 180 + i * 0.9)) * 0.45;
    bar.style.setProperty("--h", String(jitter));
  });
  _playingRaf = requestAnimationFrame(() => animatePlayingBars(card));
}

export async function toggleVoiceDropPlayback(card) {
  if (!card) return;
  const url = String(card.getAttribute("data-voice-url") || "").trim();
  const key = String(card.getAttribute("data-voice-key") || "").trim();
  if (!url && !key) return;
  const id = String(card.getAttribute("data-voice-drop") || key || url);
  if (_playingId === id && _playingAudio && !_playingAudio.paused) {
    stopPreviewPlayback();
    return;
  }
  stopPreviewPlayback();
  const playUrl = loadVoiceDropPlayUrl(url, key);
  if (!playUrl) {
    d().showToast?.("Voice drop file missing.", { durationMs: 2600 });
    return;
  }
  const audio = getOrCreateVoiceDropAudio(playUrl);
  if (!audio) return;
  _playingAudio = audio;
  _playingId = id;
  card.classList.add("is-playing");
  audio.onended = () => {
    card.classList.remove("is-playing");
    stopPreviewPlayback();
  };
  audio.onerror = () => {
    card.classList.remove("is-playing");
    stopPreviewPlayback();
    d().showToast?.("Could not play voice drop.", { durationMs: 2400 });
  };
  try {
    audio.currentTime = 0;
  } catch {}
  try {
    await audio.play();
    animatePlayingBars(card);
  } catch {
    card.classList.remove("is-playing");
    stopPreviewPlayback();
  }
}

export function startComposerVoiceDrop() {
  if (_recState === "starting" || _recState === "recording" || _recState === "ready") return;
  try { d().cancelMessagesComposerAutofocus?.(); } catch {}
  try { document.getElementById("messagesComposerInput")?.blur(); } catch {}
  d().closeMessagesComposerSheet?.();
  void startRecording();
}

/** Intentionally a no-op. Preparing playAndRecord on thread enter interrupts
 *  the mini-player. Native session is configured when the user taps record. */
export function warmupComposerVoice() {}

export function openDmVoiceDropSheet() {
  startComposerVoiceDrop();
}

export function closeDmVoiceDropSheet({ skipReset = false } = {}) {
  stopPreviewPlayback();
  if (!skipReset) resetRecording();
  document.body.classList.remove("messagesVoiceComposing");
  const dock = document.getElementById("messagesVoiceComposer");
  if (dock) dock.hidden = true;
  try { d().syncMessagesThreadComposerReady?.(); } catch {}
  try { d().updateMessagesComposerReserve?.(); } catch {}
}

export function discardComposerVoiceDrop() {
  closeDmVoiceDropSheet({ skipReset: false });
}

async function stopRecordingAndWait() {
  if (_recState !== "recording" && _recState !== "starting") return;
  if (_startPromise) {
    try { await _startPromise; } catch { return; }
  }
  if (_recState !== "recording") return;
  const waited = new Promise((resolve) => {
    _stopResolvers.push(resolve);
  });
  stopRecording();
  await Promise.race([
    waited,
    new Promise((resolve) => window.setTimeout(resolve, 8000)),
  ]);
}

export async function sendComposerVoiceDrop() {
  _sendRequested = true;
  if (_startPromise) {
    try { await _startPromise; } catch {
      _sendRequested = false;
      return;
    }
  }
  if (_recState === "recording" || _recState === "starting") {
    await stopRecordingAndWait();
  }
  if (_recState !== "ready") return;
  if (!_blob?.size || _composerSendLock) return;
  _sendRequested = false;
  await sendVoiceDrop();
}

function clearVoiceDropAfterSend(localPlayUrl) {
  if (_nativeRec) {
    void cancelNativeVoiceDropRecording().catch(() => {});
    _nativeRec = false;
  }
  if (_autostopTimer) {
    clearTimeout(_autostopTimer);
    _autostopTimer = 0;
  }
  stopVisualizer();
  try { _stream?.getTracks?.().forEach((t) => t.stop()); } catch {}
  _stream = null;
  _recorder = null;
  _chunks = [];
  _blob = null;
  _durationMs = 0;
  _peaks = [];
  _recState = "idle";
  // Keep the object URL — in-thread playback uses it so play starts instantly.
  _blobUrl = "";
  syncVoiceDropUi();
  if (localPlayUrl) preloadVoiceDropAudio(localPlayUrl, "");
}

async function sendVoiceDropInBackground({ clientMessageId, threadId, blob, durationMs, peaks, localPlayUrl = "" }) {
  const cid = String(clientMessageId || "").trim();
  try {
    const { url, key } = await uploadDmVoiceBlob(blob, { durationMs });
    if (localPlayUrl) {
      cacheVoiceDropPlayUrl(cid, localPlayUrl);
      cacheVoiceDropPlayUrl(key, localPlayUrl);
      cacheVoiceDropPlayUrl(url, localPlayUrl);
    }
    const body = buildDmVoicePayload({
      url,
      key,
      durationSec: Math.round(durationMs / 1000),
      peaks,
    });
    if (body.length > 2000) {
      throw new Error("Voice drop metadata too large.");
    }
    const data = await d().messagesApi("/api/messages", {
      method: "POST",
      timeoutMs: 30000,
      body: JSON.stringify({
        action: "send_message",
        threadId,
        body,
        clientMessageId: cid,
      }),
    });
    if (!data?.ok) {
      throw new Error(String(data?.error || "Send failed"));
    }
    const msg = data?.message;
    if (msg) {
      d().confirmOptimisticThreadMessage?.(cid, { ...msg, client_message_id: cid });
    } else {
      d().updateOptimisticMessageStatus?.(cid, "sent");
      await d().pollNewThreadMessages?.(threadId);
    }
    await d().refreshMessagesUnreadBadge?.({ force: true });
  } catch (e) {
    d().markOptimisticThreadMessageFailed?.(cid, e);
  } finally {
    _sendInFlight = false;
  }
}

async function sendVoiceDrop() {
  const threadId = String(d().getThreadId?.() || "").trim();
  const sendBtn = document.getElementById("messagesComposerSend");
  if (_composerSendLock) return;
  if (!threadId) {
    d().showToast?.("Open a chat first.", { durationMs: 2600 });
    return;
  }
  if (!_blob?.size || _blob.size < 400) {
    d().showToast?.("Record a little longer, then send.", { durationMs: 2800 });
    return;
  }
  _composerSendLock = true;
  try {
    const blob = _blob;
    const durationMs = _durationMs;
    const peaks = Array.isArray(_peaks) ? [..._peaks] : [];
    const localPlayUrl = _blobUrl;
    const clientMessageId = String(d().newClientMessageId?.() || `cm_${Date.now()}`);
    const viewerId = String(d().getViewerId?.() || d().getAuthSession?.()?.user?.id || "");
    const optimisticBody = buildDmVoicePayload({
      url: localPlayUrl,
      durationSec: Math.round(durationMs / 1000),
      peaks,
    });
    const optimistic = {
      id: `pending:${clientMessageId}`,
      client_message_id: clientMessageId,
      sender_id: viewerId,
      body: optimisticBody,
      created_at: new Date().toISOString(),
      sendStatus: "sending",
      localPlayUrl,
    };

    _sendInFlight = true;
    sendBtn?.setAttribute("aria-busy", "true");

    cacheVoiceDropPlayUrl(clientMessageId, localPlayUrl);
    cacheVoiceDropPlayUrl(localPlayUrl, localPlayUrl);
    preloadVoiceDropAudio(localPlayUrl, clientMessageId);

    d().feedbackMessagesComposerSend?.();
    d().addOptimisticThreadMessage?.(optimistic);
    d().patchInboxFromOutgoingMessage?.({
      threadId,
      body: optimisticBody,
      createdAt: optimistic.created_at,
    });

    clearVoiceDropAfterSend(localPlayUrl);
    closeDmVoiceDropSheet({ skipReset: true });
    d().closeMessagesComposerSheet?.();

    void sendVoiceDropInBackground({
      clientMessageId,
      threadId,
      blob,
      durationMs,
      peaks,
      localPlayUrl,
    });
  } finally {
    sendBtn?.removeAttribute("aria-busy");
    _composerSendLock = false;
  }
}

export function initDmVoiceDrop(deps = {}) {
  _deps = { ...deps };
  if (document.documentElement.dataset.dmVoiceDropWired) return;
  document.documentElement.dataset.dmVoiceDropWired = "1";
}

function closeAllVoiceClipDocks() {
  document.querySelectorAll(".messagesVoiceClipDock").forEach((el) => {
    el.hidden = true;
  });
  document.querySelectorAll(".messagesVoiceClipSpark").forEach((el) => {
    el.classList.remove("is-on");
    el.setAttribute("aria-expanded", "false");
  });
}

function revealVoiceClipDockAboveComposer(dock) {
  const mount = document.getElementById("messagesThreadMount");
  if (!mount || !dock) return;
  const pin = () => {
    const composer = document.querySelector(".messagesComposer");
    const composerTop = composer?.getBoundingClientRect?.().top;
    const dockRect = dock.getBoundingClientRect();
    const gap = 14;
    const limit = Number.isFinite(composerTop)
      ? composerTop - gap
      : dockRect.bottom;
    const overflow = dockRect.bottom - limit;
    if (overflow > 1) mount.scrollTop += overflow;
  };
  requestAnimationFrame(() => requestAnimationFrame(pin));
  window.setTimeout(pin, 80);
}

export function handleVoiceDropBubbleClick(target) {
  const composer = target?.closest?.("#messagesVoiceComposerPill");
  if (composer) {
    if (_recState === "recording" || _recState === "starting") stopRecording();
    else if (_recState === "ready" && _blobUrl) void togglePreviewPlayback();
    try { d().haptic?.("light"); } catch {}
    return true;
  }
  const spark = target?.closest?.("[data-voice-clip-open]");
  if (spark) {
    const id = String(spark.getAttribute("data-voice-clip-open") || "");
    const dock = document.querySelector(`[data-voice-clip-dock="${id}"]`);
    const open = Boolean(dock && dock.hidden);
    closeAllVoiceClipDocks();
    if (dock && open) {
      dock.hidden = false;
      spark.classList.add("is-on");
      spark.setAttribute("aria-expanded", "true");
      revealVoiceClipDockAboveComposer(dock);
    }
    try { d().haptic?.("light"); } catch {}
    return true;
  }
  const chip = target?.closest?.("[data-voice-clip-mood]");
  if (chip) {
    const dock = chip.closest(".messagesVoiceClipDock");
    dock?.querySelectorAll("[data-voice-clip-mood]").forEach((el) => el.classList.toggle("is-on", el === chip));
    try { d().haptic?.("light"); } catch {}
    return true;
  }
  const go = target?.closest?.("[data-voice-clip-go]");
  if (go) {
    const dock = go.closest(".messagesVoiceClipDock");
    const wrap = go.closest(".messagesVoiceDropBlock");
    const card = wrap?.querySelector?.(".messagesVoiceDrop");
    const mood = String(dock?.querySelector?.("[data-voice-clip-mood].is-on")?.getAttribute("data-voice-clip-mood") || "soft");
    void d().startVoiceDropClipFromChat?.({
      msgId: String(go.getAttribute("data-voice-clip-go") || card?.getAttribute("data-voice-drop") || ""),
      audioUrl: String(card?.getAttribute("data-voice-url") || ""),
      storageKey: String(card?.getAttribute("data-voice-key") || ""),
      mood,
      goBtn: go,
      dock,
    });
    try { d().haptic?.("medium"); } catch {}
    return true;
  }
  const card = target?.closest?.(".messagesVoiceDrop");
  if (!card) return false;
  void toggleVoiceDropPlayback(card);
  try { d().haptic?.("light"); } catch {}
  return true;
}
