/**
 * DM Voice Drop — radial "sound bloom" recorder + arc-spectrum playback bubbles.
 * Not a WhatsApp/IG waveform bar; Nabad-native voice drops for musician DMs.
 */

export const DM_VOICE_MARKER = "voice";
export const DM_VOICE_MAX_MS = 30000;
export const DM_VOICE_MAX_BYTES = 512 * 1024;
export const DM_VOICE_BLOOM_BARS = 12;
export const DM_VOICE_ARC_BARS = 9;

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

function liveBloomHeights() {
  if (!_composeAnalyser || _recState !== "recording") {
    return normalizeVoicePeaks(_peaks, DM_VOICE_BLOOM_BARS);
  }
  const data = new Uint8Array(_composeAnalyser.frequencyBinCount);
  _composeAnalyser.getByteFrequencyData(data);
  const step = Math.max(1, Math.floor(data.length / DM_VOICE_BLOOM_BARS));
  const raw = [];
  for (let i = 0; i < DM_VOICE_BLOOM_BARS; i++) {
    let sum = 0;
    const base = i * step;
    for (let j = 0; j < step; j++) sum += data[base + j] || 0;
    raw.push(sum / step / 255);
  }
  return normalizeVoicePeaks(raw, DM_VOICE_BLOOM_BARS);
}

function renderBloom({ live = false } = {}) {
  const mount = document.getElementById("voiceDropBloom");
  if (!mount) return;
  const heights = live ? liveBloomHeights() : normalizeVoicePeaks(_peaks, DM_VOICE_BLOOM_BARS);
  mount.classList.toggle("is-live", live);
  mount.innerHTML = heights.map((h, i) => {
    const ht = Math.max(0.15, Math.min(1, Number(h) || 0.25));
    return `<span class="voiceDropBloomBar" style="--i:${i};--h:${ht.toFixed(3)}"></span>`;
  }).join("");
}

function syncProgressRing() {
  const ring = document.getElementById("voiceDropProgressRing");
  if (!ring) return;
  const pct = _recState === "recording"
    ? Math.min(1, (performance.now() - _startedAt) / DM_VOICE_MAX_MS)
    : _durationMs > 0
      ? Math.min(1, _durationMs / DM_VOICE_MAX_MS)
      : 0;
  const circumference = 2 * Math.PI * 52;
  ring.style.strokeDasharray = `${circumference}`;
  ring.style.strokeDashoffset = `${circumference * (1 - pct)}`;
}

function syncVoiceDropUi() {
  const sheet = document.getElementById("messagesVoiceDropSheet");
  const status = document.getElementById("voiceDropStatus");
  const actions = document.getElementById("voiceDropActions");
  const orb = document.getElementById("voiceDropOrb");
  const hasBlob = Boolean(_blob?.size);
  const recording = _recState === "recording";
  if (sheet) sheet.classList.toggle("is-recording", recording);
  if (sheet) sheet.classList.toggle("is-ready", hasBlob && !recording);
  if (orb) {
    orb.classList.toggle("is-recording", recording);
    orb.classList.toggle("is-ready", hasBlob && !recording);
    orb.setAttribute("aria-label", recording ? "Stop recording" : hasBlob ? "Play preview" : "Start voice drop");
  }
  if (status) {
    const fmt = d().formatMsAsVoiceTime || ((ms) => `${Math.floor(ms / 60000)}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, "0")}`);
    if (recording) {
      status.textContent = `Capturing… ${fmt(performance.now() - _startedAt)} · ${fmt(DM_VOICE_MAX_MS)}`;
    } else if (hasBlob) {
      status.textContent = `Drop ready · ${fmt(_durationMs)}`;
    } else {
      status.textContent = "Tap the orb to capture your drop";
    }
  }
  if (actions) actions.hidden = !hasBlob || recording;
  renderBloom({ live: recording });
  syncProgressRing();
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

function resetRecording() {
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

function resolveVoiceDropPlayUrl(stored) {
  let url = String(stored || "").trim();
  if (!url) return "";
  if (url.startsWith("blob:") || url.startsWith("data:")) return url;
  if (!/^https?:\/\//i.test(url)) {
    const base = String(d().SUPABASE_URL || "").replace(/\/$/, "");
    if (base) {
      const enc = url.split("/").map((s) => encodeURIComponent(s)).join("/");
      url = `${base}/storage/v1/object/public/dm_voice/${enc}`;
    }
  }
  const proxied = d().toAudioProxyUrl?.(url) || url;
  return d().normalizeAudioUrlForPlayback?.(proxied) || proxied || url;
}

function createVoiceDropAudio(playUrl) {
  const audio = new Audio(playUrl);
  audio.preload = "auto";
  audio.crossOrigin = "anonymous";
  try { audio.setAttribute("playsinline", ""); } catch {}
  return audio;
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Could not read recording"));
    reader.readAsDataURL(blob);
  });
}

export async function uploadDmVoiceBlob(blob) {
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
  return { url: String(data.url), key: String(data.key || "") };
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
  const orb = document.getElementById("voiceDropOrb");
  orb?.classList.add("is-playing");
  audio.onended = () => {
    orb?.classList.remove("is-playing");
    stopPreviewPlayback();
  };
  try {
    await audio.play();
  } catch {}
}

async function startRecording() {
  if (_recState === "recording") return;
  stopPreviewPlayback();
  resetRecording();
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
  } catch {
    d().showToast?.("Microphone permission needed.", { durationMs: 2800 });
    return;
  }
  const pickMime = d().pickRecorderMimeType || (() => "");
  const mimeType = pickMime();
  let rec;
  try {
    rec = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
  } catch {
    try { stream.getTracks().forEach((t) => t.stop()); } catch {}
    d().showToast?.("Recorder not supported on this device.", { durationMs: 2800 });
    return;
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
    if (!blob.size) {
      _recState = "idle";
      syncVoiceDropUi();
      d().showToast?.("Empty drop — try again.", { durationMs: 2400 });
      return;
    }
    if (blob.size > DM_VOICE_MAX_BYTES) {
      _recState = "idle";
      syncVoiceDropUi();
      d().showToast?.("Drop too large — keep it under 30s.", { durationMs: 2800 });
      return;
    }
    _blob = blob;
    _durationMs = Math.min(DM_VOICE_MAX_MS, Math.max(400, Math.round(performance.now() - _startedAt)));
    _blobUrl = URL.createObjectURL(blob);
    _recState = "ready";
    syncVoiceDropUi();
    void computePeaksFromBlob(blob).then((peaks) => {
      _peaks = peaks;
      syncVoiceDropUi();
    });
    try { d().haptic?.("success"); } catch {}
  };
  _stream = stream;
  _recorder = rec;
  void attachAnalyser(stream);
  try {
    rec.start();
  } catch {
    try { stream.getTracks().forEach((t) => t.stop()); } catch {}
    d().showToast?.("Could not start recording.", { durationMs: 2600 });
    return;
  }
  _startedAt = performance.now();
  _recState = "recording";
  syncVoiceDropUi();
  try { d().haptic?.("medium"); } catch {}
  const tick = () => {
    if (_recState !== "recording") return;
    renderBloom({ live: true });
    syncVoiceDropUi();
    if (performance.now() - _startedAt < DM_VOICE_MAX_MS) {
      _tickRaf = requestAnimationFrame(tick);
    }
  };
  _tickRaf = requestAnimationFrame(tick);
  _autostopTimer = setTimeout(() => {
    if (_recState === "recording") stopRecording();
  }, DM_VOICE_MAX_MS + 40);
}

function stopRecording() {
  if (_recState !== "recording" || !_recorder) return;
  try { _recorder.stop(); } catch {}
}

function arcBarsHtml(peaks, { playing = false } = {}) {
  const heights = normalizeVoicePeaks(peaks, DM_VOICE_ARC_BARS);
  return heights.map((h, i) => {
    const ht = Math.max(0.12, Math.min(1, Number(h) || 0.2));
    const rot = -36 + i * 9;
    return `<span class="messagesVoiceDropBar" style="--rot:${rot}deg;--h:${ht.toFixed(3)}" data-bar="${i}"></span>`;
  }).join("");
}

export function messagesVoiceDropBubbleHtml(parsed, { mine = false, msgId = "" } = {}) {
  const url = escapeAttr(parsed?.url || "");
  const dur = Math.max(0, Number(parsed?.durationSec) || 0);
  const durLabel = formatDurationSec(dur);
  const peaksJson = escapeAttr(JSON.stringify(normalizeVoicePeaks(parsed?.peaks, DM_VOICE_ARC_BARS)));
  const id = escapeAttr(String(msgId || ""));
  return `
    <div class="messagesVoiceDrop${mine ? " is-mine" : ""}" data-voice-drop="${id}" data-voice-url="${url}" data-voice-peaks="${peaksJson}" data-voice-dur="${dur}">
      <button type="button" class="messagesVoiceDropPlay" aria-label="Play voice drop">
        <span class="messagesVoiceDropPlayHex" aria-hidden="true">
          <svg class="messagesVoiceDropPlayIco messagesVoiceDropPlayIco--play" viewBox="0 0 24 24" width="18" height="18"><path fill="currentColor" d="M9 7.5v9l7.5-4.5z"/></svg>
          <svg class="messagesVoiceDropPlayIco messagesVoiceDropPlayIco--pause" viewBox="0 0 24 24" width="18" height="18"><path fill="currentColor" d="M7 6h3v12H7zm7 0h3v12h-3z"/></svg>
        </span>
      </button>
      <div class="messagesVoiceDropArc" aria-hidden="true">${arcBarsHtml(parsed?.peaks)}</div>
      <div class="messagesVoiceDropMeta">
        <span class="messagesVoiceDropLabel">Voice drop</span>
        <span class="messagesVoiceDropDur">${durLabel}</span>
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
  if (!url) return;
  const id = String(card.getAttribute("data-voice-drop") || url);
  if (_playingId === id && _playingAudio && !_playingAudio.paused) {
    stopPreviewPlayback();
    return;
  }
  stopPreviewPlayback();
  const playUrl = resolveVoiceDropPlayUrl(url);
  if (!playUrl) {
    d().showToast?.("Voice drop file missing.", { durationMs: 2600 });
    return;
  }
  const audio = createVoiceDropAudio(playUrl);
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
    await audio.play();
    animatePlayingBars(card);
  } catch {
    card.classList.remove("is-playing");
    stopPreviewPlayback();
  }
}

export function openDmVoiceDropSheet() {
  const sheet = document.getElementById("messagesVoiceDropSheet");
  if (!sheet) return;
  resetRecording();
  sheet.hidden = false;
  sheet.setAttribute("aria-hidden", "false");
  document.body.classList.add("messagesVoiceDropOpen");
  syncVoiceDropUi();
}

export function closeDmVoiceDropSheet() {
  stopPreviewPlayback();
  resetRecording();
  const sheet = document.getElementById("messagesVoiceDropSheet");
  if (!sheet) return;
  sheet.hidden = true;
  sheet.setAttribute("aria-hidden", "true");
  document.body.classList.remove("messagesVoiceDropOpen");
}

async function sendVoiceDrop() {
  const threadId = String(d().getThreadId?.() || "").trim();
  const sendBtn = document.getElementById("voiceDropSend");
  if (!threadId) {
    d().showToast?.("Open a chat first.", { durationMs: 2600 });
    return;
  }
  if (!_blob?.size) {
    d().showToast?.("Record a voice drop first.", { durationMs: 2600 });
    return;
  }
  if (sendBtn?.getAttribute("aria-busy") === "true") return;
  sendBtn?.setAttribute("aria-busy", "true");
  if (sendBtn) sendBtn.textContent = "Sending…";
  try {
    const { url, key } = await uploadDmVoiceBlob(_blob);
    const body = buildDmVoicePayload({
      url,
      key,
      durationSec: Math.round(_durationMs / 1000),
      peaks: _peaks,
    });
    if (body.length > 2000) {
      throw new Error("Voice drop metadata too large.");
    }
    d().feedbackMessagesComposerSend?.();
    const data = await d().messagesApi("/api/messages", {
      method: "POST",
      timeoutMs: 30000,
      body: JSON.stringify({ action: "send_message", threadId, body }),
    });
    if (!data?.ok) {
      throw new Error(String(data?.error || "Send failed"));
    }
    const msg = data?.message;
    closeDmVoiceDropSheet();
    d().closeMessagesComposerSheet?.();
    if (msg) {
      d().appendThreadMessages?.([msg]);
    } else {
      await d().pollNewThreadMessages?.(threadId);
    }
    d().patchInboxFromOutgoingMessage?.({
      threadId,
      body,
      createdAt: msg?.created_at || new Date().toISOString(),
      messageId: msg?.id || "",
    });
    try { d().haptic?.("success"); } catch {}
    await d().refreshMessagesUnreadBadge?.({ force: true });
  } catch (e) {
    d().showToast?.(String(e?.message || "Could not send voice drop"), { durationMs: 3200 });
  } finally {
    sendBtn?.removeAttribute("aria-busy");
    if (sendBtn) sendBtn.textContent = "Send drop";
  }
}

export function initDmVoiceDrop(deps = {}) {
  _deps = { ...deps };
  if (document.documentElement.dataset.dmVoiceDropWired) return;
  document.documentElement.dataset.dmVoiceDropWired = "1";

  document.getElementById("messagesVoiceDropClose")?.addEventListener("click", closeDmVoiceDropSheet);
  document.getElementById("messagesVoiceDropBackdrop")?.addEventListener("click", closeDmVoiceDropSheet);
  document.getElementById("voiceDropDiscard")?.addEventListener("click", () => {
    try { d().haptic?.("light"); } catch {}
    resetRecording();
  });
  document.getElementById("voiceDropSend")?.addEventListener("click", () => void sendVoiceDrop());
  document.getElementById("voiceDropOrb")?.addEventListener("click", () => {
    if (_recState === "recording") stopRecording();
    else if (_recState === "ready" && _blobUrl) void togglePreviewPlayback();
    else void startRecording();
  });
}

export function handleVoiceDropBubbleClick(target) {
  const playBtn = target?.closest?.(".messagesVoiceDropPlay");
  const card = target?.closest?.(".messagesVoiceDrop");
  if (!playBtn || !card) return false;
  void toggleVoiceDropPlayback(card);
  try { d().haptic?.("light"); } catch {}
  return true;
}
