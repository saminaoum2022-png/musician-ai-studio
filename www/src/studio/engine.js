/**
 * NabadAi Studio — audio engine (V1)
 * ----------------------------------
 * A small, self-contained Web Audio engine for the "record your voice over an
 * AI-generated instrumental" experience. It is intentionally NOT a DAW: one
 * backing track (the "AI Guide"), one (or a few) vocal takes, a tiny mix, and a
 * final render. No DOM, no styling — the UI layer drives it through callbacks.
 *
 * Design goals (from the V1 spec):
 *  - Local-first: takes never leave the device. The engine only ever produces a
 *    final rendered Blob; uploading is the UI/publish layer's job.
 *  - Modular effects: V1 ships Reverb only, but every future effect (noise
 *    removal, compression, EQ, presets, harmony) has a real slot in EFFECT_REGISTRY
 *    so adding one later is "fill in create()" — not a re-architecture.
 *  - Sync: recording plays the guide while capturing the mic against the same
 *    AudioContext clock, and stores the measured offset so takes line up. A
 *    per-device latency offset (+ per-take manual nudge) corrects round-trip lag.
 *
 * iOS/WebView notes: AudioContext must be created/resumed from a user gesture;
 * call ensureReady() from a tap handler before recording or playback.
 */

import { encodeWav16 } from "../wav.js";

const LATENCY_STORAGE_KEY = "nabad.studio.latencyMs.v1";

// Raw mic capture (AGC off) is quiet, so we apply a fixed makeup gain to the
// voice so it sits up front against the music without the user maxing sliders.
const VOICE_MAKEUP = 2.6;

/* -------------------------------------------------------------------------- */
/* Modular effect registry                                                     */
/*                                                                             */
/* Each effect is a factory: create(ctx, params) -> { input, output, update }. */
/* `input`/`output` are AudioNodes; the engine wires effects in series. V1     */
/* implements `reverb`; the rest are declared placeholders (isPlaceholder:true) */
/* and are skipped at build time until their create() is filled in.            */
/* -------------------------------------------------------------------------- */

export const EFFECT_REGISTRY = {
  reverb: {
    id: "reverb",
    label: "Reverb",
    isPlaceholder: false,
    /**
     * Wet/dry convolution reverb with a synthesized impulse response, so we
     * don't need to ship an IR asset. `amount` is 0..1 (wet mix).
     */
    create(ctx, params = {}) {
      const input = ctx.createGain();
      const output = ctx.createGain();
      const dry = ctx.createGain();
      const wet = ctx.createGain();
      const convolver = ctx.createConvolver();
      convolver.buffer = makeImpulseResponse(ctx, 2.2, 2.6);

      input.connect(dry);
      dry.connect(output);
      input.connect(convolver);
      convolver.connect(wet);
      wet.connect(output);

      const apply = (p = {}) => {
        const amount = clamp01(Number(p.amount ?? params.amount ?? 0));
        wet.gain.value = amount;
        dry.gain.value = 1 - amount * 0.35; // keep body as wetness rises
      };
      apply(params);
      return { input, output, update: apply };
    },
  },

  // ---- Placeholders: architecture only, intentionally not implemented in V1 ----
  noiseRemoval: placeholderEffect("noiseRemoval", "Noise Removal"),
  compression: placeholderEffect("compression", "Compression"),
  eq: placeholderEffect("eq", "EQ"),
  preset: placeholderEffect("preset", "Vocal Preset"),
  harmony: placeholderEffect("harmony", "Harmony"),
};

function placeholderEffect(id, label) {
  return { id, label, isPlaceholder: true, create: null };
}

/* -------------------------------------------------------------------------- */
/* Engine                                                                      */
/* -------------------------------------------------------------------------- */

export class StudioEngine {
  constructor(opts = {}) {
    this.ctx = null;
    this.guideBuffer = null;
    this.guideUrl = "";
    this.takes = []; // { id, blob, buffer, createdAt, nudgeMs, alignSec }
    this.activeTakeId = "";

    // Per-device round-trip latency correction (ms). Calibrated once; persists.
    this.latencyMs = readStoredLatency(opts.latencyMs);

    // Active playback/record node bookkeeping for clean teardown.
    this._nodes = [];
    this._recorder = null;
    this._recStream = null;
    this._recChunks = [];
    this._recCtxStart = 0;
    this._guideCtxStart = 0;
    this._raf = 0;
    this._playing = false;
    this._recording = false;
  }

  /* ---- lifecycle ---- */

  /** Create + resume the AudioContext. MUST be called from a user gesture on iOS. */
  async ensureReady() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      // "interactive" asks the platform for the smallest safe output buffer,
      // which keeps the live "hear myself" monitor as tight as the hardware
      // allows (the rest of the round-trip lag is the OS/WebView, not us).
      try { this.ctx = new AC({ latencyHint: "interactive" }); }
      catch { this.ctx = new AC(); }
    }
    if (this.ctx.state === "suspended") {
      try { await this.ctx.resume(); } catch {}
    }
    return this.ctx;
  }

  get sampleRate() {
    return this.ctx ? this.ctx.sampleRate : 44100;
  }

  get isRecording() { return this._recording; }
  get isPlaying() { return this._playing; }

  /* ---- guide (AI instrumental) ---- */

  /** Fetch + decode the backing instrumental. Returns its duration in seconds. */
  async loadGuide(url) {
    await this.ensureReady();
    const res = await fetch(url, { cache: "force-cache" });
    if (!res.ok) throw new Error(`guide fetch ${res.status}`);
    const arr = await res.arrayBuffer();
    this.guideBuffer = await this.ctx.decodeAudioData(arr.slice(0));
    this.guideUrl = url;
    return this.guideBuffer.duration;
  }

  get guideDuration() {
    return this.guideBuffer ? this.guideBuffer.duration : 0;
  }

  /* ---- latency calibration ---- */

  getLatencyMs() { return this.latencyMs; }

  setLatencyMs(ms) {
    this.latencyMs = clampNum(Number(ms) || 0, -300, 600);
    try { localStorage.setItem(LATENCY_STORAGE_KEY, String(this.latencyMs)); } catch {}
    return this.latencyMs;
  }

  /**
   * Rough first-guess latency from the AudioContext's own reported latencies.
   * Real tuning happens via the manual nudge + (future) tap-test calibration.
   */
  estimateLatencyMs() {
    const base = (this.ctx?.baseLatency || 0) + (this.ctx?.outputLatency || 0);
    return Math.round(base * 1000) + 90; // + typical mic capture lag
  }

  /* ---- recording (guide plays while mic captures, in sync) ---- */

  /**
   * @param {object} cb
   *   cb.countInSec   - seconds of count-in before capture-relevant audio (default 3)
   *   cb.onCountIn(n) - called with 3,2,1,0 during count-in
   *   cb.onLevel(v)   - 0..1 mic level, ~60fps, for the live waveform/meter
   *   cb.onTick(sec)  - guide playback position during the take
   *   cb.onEnded()    - guide reached its end
   */
  async startRecording(cb = {}) {
    if (this._recording) return;
    await this.ensureReady();
    // Quick Take records the voice alone (no backing). Otherwise a guide is required.
    const noGuide = !!cb.noGuide || !this.guideBuffer;
    if (!noGuide && !this.guideBuffer) throw new Error("no guide loaded");

    // Mic capture. For a STUDIO we want the raw voice: browser noiseSuppression
    // gates/ducks quiet passages (the "cut-offs" users hear) and echoCancellation
    // pumps the level when it hears the backing — both hurt a sung take. We turn
    // them off for clean audio. This assumes headphones when monitoring (no
    // speaker bleed); we advise that in the UI.
    this._recStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
        channelCount: 1,
      },
      video: false,
    });

    const mime = pickRecorderMime();
    this._recChunks = [];
    this._recorder = mime
      ? new MediaRecorder(this._recStream, { mimeType: mime })
      : new MediaRecorder(this._recStream);
    this._recorder.ondataavailable = (e) => { if (e.data && e.data.size) this._recChunks.push(e.data); };

    // Live level metering off the mic (analyser is never routed to output).
    const micSrc = this.ctx.createMediaStreamSource(this._recStream);
    const analyser = this.ctx.createAnalyser();
    analyser.fftSize = 1024;
    micSrc.connect(analyser);
    const data = new Uint8Array(analyser.fftSize);

    // Optional live monitoring ("hear yourself"): mic -> reverb + echo -> output.
    // HEADPHONES ONLY — through a speaker this loops back into the mic and howls.
    // There's inherent WebView round-trip latency, so it reads as a soft echo.
    this._monitorChain = null;
    if (cb.monitor) {
      const monitorGain = this.ctx.createGain();
      monitorGain.gain.value = (cb.monitorVol ?? 0.95) * VOICE_MAKEUP;
      const chain = this._buildMonitorChain(this.ctx, {
        reverb: cb.monitorReverb ?? 0.25,
        echo: cb.monitorEcho ?? 0.18,
      });
      micSrc.connect(chain.input);
      // Centre the mic across both ears (see _centerNode) before monitoring.
      const center = this._centerNode(this.ctx);
      chain.output.connect(center.input);
      center.output.connect(monitorGain).connect(this.ctx.destination);
      this._monitorChain = chain;
    }

    // Schedule the guide to start after the count-in, on the same clock.
    const countInSec = Number.isFinite(cb.countInSec) ? cb.countInSec : 3;
    const startAt = this.ctx.currentTime + Math.max(0.1, countInSec);
    let guideSrc = null;
    let guideGain = null;
    if (!noGuide) {
      guideSrc = this.ctx.createBufferSource();
      guideSrc.buffer = this.guideBuffer;
      guideGain = this.ctx.createGain();
      guideSrc.connect(guideGain).connect(this.ctx.destination);
      guideSrc.start(startAt);
    }

    this._recCtxStart = this.ctx.currentTime;
    this._guideCtxStart = startAt;
    this._recording = true;
    this._nodes = [micSrc, analyser, ...(guideSrc ? [guideSrc, guideGain] : []), ...(this._monitorChain?.nodes || [])];

    // Count-in ticks.
    if (typeof cb.onCountIn === "function") {
      const n = Math.round(countInSec);
      for (let i = 0; i < n; i++) {
        setTimeout(() => { if (this._recording) cb.onCountIn(n - i); }, i * 1000);
      }
      setTimeout(() => { if (this._recording) cb.onCountIn(0); }, n * 1000);
    }

    // Start the recorder now (its t=0 maps to _recCtxStart). Timeslice helps iOS.
    this._recorder.start(250);

    if (guideSrc) {
      guideSrc.onended = () => {
        if (typeof cb.onEnded === "function") cb.onEnded();
      };
    }

    // rAF loop for level + position.
    const loop = () => {
      if (!this._recording) return;
      analyser.getByteTimeDomainData(data);
      let peak = 0;
      for (let i = 0; i < data.length; i++) {
        const v = Math.abs(data[i] - 128) / 128;
        if (v > peak) peak = v;
      }
      if (typeof cb.onLevel === "function") cb.onLevel(peak);
      const pos = this.ctx.currentTime - this._guideCtxStart;
      if (pos >= 0 && typeof cb.onTick === "function") cb.onTick(pos);
      this._raf = requestAnimationFrame(loop);
    };
    this._raf = requestAnimationFrame(loop);
  }

  /** Stop capture, decode the take, store it, and return it. */
  async stopRecording() {
    if (!this._recording) return null;
    this._recording = false;
    cancelAnimationFrame(this._raf);

    const rec = this._recorder;
    const blob = await new Promise((resolve) => {
      rec.onstop = () => resolve(new Blob(this._recChunks, { type: rec.mimeType || "audio/webm" }));
      try { rec.stop(); } catch { resolve(new Blob(this._recChunks)); }
    });

    this._teardownNodes();
    this._stopStream();

    // The recording's t=0 == _recCtxStart; the guide's t=0 == _guideCtxStart.
    // So guide-time 0 sits `alignSec` into the recording.
    const alignSec = Math.max(0, this._guideCtxStart - this._recCtxStart);

    let buffer = null;
    try {
      const arr = await blob.arrayBuffer();
      buffer = await this.ctx.decodeAudioData(arr.slice(0));
    } catch {
      buffer = null; // some iOS blobs decode lazily; mix path will retry
    }

    const take = {
      id: `take_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      blob,
      buffer,
      createdAt: Date.now(),
      nudgeMs: 0,
      alignSec,
    };
    this.takes.push(take);
    this.activeTakeId = take.id;
    return take;
  }

  /* ---- takes ---- */

  getTakes() { return this.takes.slice(); }
  getActiveTake() { return this.takes.find((t) => t.id === this.activeTakeId) || null; }
  setActiveTake(id) { if (this.takes.some((t) => t.id === id)) this.activeTakeId = id; }
  removeTake(id) {
    this.takes = this.takes.filter((t) => t.id !== id);
    if (this.activeTakeId === id) this.activeTakeId = this.takes.at(-1)?.id || "";
  }
  /** Manual sync nudge for a take, in ms (+ = voice later). */
  setTakeNudgeMs(id, ms) {
    const t = this.takes.find((x) => x.id === id);
    if (t) t.nudgeMs = clampNum(Number(ms) || 0, -500, 500);
  }

  /** Where (in seconds) to begin reading a take's buffer so it aligns to guide-0. */
  _takeBufferOffset(take) {
    const comp = (this.latencyMs + (take.nudgeMs || 0)) / 1000;
    return Math.max(0, (take.alignSec || 0) + comp);
  }

  /* ---- live mix preview ---- */

  /**
   * Play guide + active take through the mix graph.
   * params: { musicVol 0..1, voiceVol 0..1, reverb 0..1, fromSec }
   */
  async playMix(params = {}, cb = {}) {
    await this.ensureReady();
    this.stopMix();
    if (!this.guideBuffer) return;
    const take = this.getActiveTake();

    const master = this.ctx.createGain();
    master.connect(this.ctx.destination);
    const startAt = this.ctx.currentTime + 0.08;
    const fromSec = Math.max(0, Number(params.fromSec) || 0);
    this._nodes = [master];

    // Live-adjustable handles so the Mix sliders change gains/reverb in real
    // time (no restart). Cleared on stopMix.
    this._mix = { musicGain: null, voiceGain: null, voiceChain: null };

    // Music (guide)
    const guideSrc = this.ctx.createBufferSource();
    guideSrc.buffer = this.guideBuffer;
    const musicGain = this.ctx.createGain();
    musicGain.gain.value = clamp01(params.musicVol ?? 0.8);
    guideSrc.connect(musicGain).connect(master);
    guideSrc.start(startAt, fromSec);
    this._nodes.push(guideSrc, musicGain);
    this._mix.musicGain = musicGain;

    // Voice (take) through the effect chain, centred across both ears.
    if (take && take.buffer) {
      const voiceSrc = this.ctx.createBufferSource();
      voiceSrc.buffer = take.buffer;
      const chain = this._buildVoiceChain(this.ctx, { reverb: params.reverb });
      const voiceGain = this.ctx.createGain();
      voiceGain.gain.value = clamp01(params.voiceVol ?? 0.9) * VOICE_MAKEUP;
      const center = this._centerNode(this.ctx);
      voiceSrc.connect(chain.input);
      chain.output.connect(voiceGain).connect(center.input);
      center.output.connect(master);
      const off = this._takeBufferOffset(take) + fromSec;
      voiceSrc.start(startAt, Math.min(off, Math.max(0, take.buffer.duration - 0.01)));
      this._nodes.push(voiceSrc, chain.input, chain.output, voiceGain, center.input, center.output);
      this._mix.voiceGain = voiceGain;
      this._mix.voiceChain = chain;
    }

    this._playing = true;
    guideSrc.onended = () => { this._playing = false; if (typeof cb.onEnded === "function") cb.onEnded(); };

    if (typeof cb.onTick === "function") {
      const t0 = startAt;
      const loop = () => {
        if (!this._playing) return;
        cb.onTick(Math.max(0, this.ctx.currentTime - t0 + fromSec));
        this._raf = requestAnimationFrame(loop);
      };
      this._raf = requestAnimationFrame(loop);
    }
  }

  /** Adjust the live mix gains/reverb without restarting playback. */
  updateMix(params = {}) {
    const mix = this._mix;
    if (!mix) return;
    if (mix.musicGain) mix.musicGain.gain.value = clamp01(params.musicVol ?? 0.8);
    if (mix.voiceGain) mix.voiceGain.gain.value = clamp01(params.voiceVol ?? 0.9) * VOICE_MAKEUP;
    if (mix.voiceChain?.update) mix.voiceChain.update({ reverb: params.reverb });
  }

  stopMix() {
    this._playing = false;
    this._mix = null;
    cancelAnimationFrame(this._raf);
    this._teardownNodes();
  }

  /* ---- final render (the ONLY thing publish uploads) ---- */

  /**
   * Render guide + active take + effects to a stereo WAV Blob via an
   * OfflineAudioContext, so the export matches the live preview exactly.
   * Returns { blob, durationSec, sampleRate }.
   */
  async renderMix(params = {}) {
    if (!this.guideBuffer) throw new Error("no guide");
    const take = this.getActiveTake();
    const sr = this.sampleRate;
    const durationSec = this.guideBuffer.duration + 0.5;
    const frames = Math.ceil(durationSec * sr);
    const off = new OfflineAudioContext(2, frames, sr);

    const master = off.createGain();
    master.connect(off.destination);

    const guideSrc = off.createBufferSource();
    guideSrc.buffer = this.guideBuffer;
    const musicGain = off.createGain();
    musicGain.gain.value = clamp01(params.musicVol ?? 0.8);
    guideSrc.connect(musicGain).connect(master);
    guideSrc.start(0);

    if (take && take.buffer) {
      const voiceSrc = off.createBufferSource();
      voiceSrc.buffer = take.buffer;
      const { input, output } = this._buildVoiceChain(off, { reverb: params.reverb });
      const voiceGain = off.createGain();
      voiceGain.gain.value = clamp01(params.voiceVol ?? 0.9) * VOICE_MAKEUP;
      const center = this._centerNode(off);
      voiceSrc.connect(input);
      output.connect(voiceGain).connect(center.input);
      center.output.connect(master);
      voiceSrc.start(0, Math.min(this._takeBufferOffset(take), Math.max(0, take.buffer.duration - 0.01)));
    }

    const rendered = await off.startRendering();
    const chans = rendered.numberOfChannels >= 2
      ? [rendered.getChannelData(0), rendered.getChannelData(1)]
      : [rendered.getChannelData(0), rendered.getChannelData(0)];
    const blob = encodeWav16(chans, rendered.sampleRate);
    return { blob, durationSec: rendered.duration, sampleRate: rendered.sampleRate };
  }

  /**
   * Live-monitor chain: dry voice + a reverb send + a feedback echo, summed to
   * one output. Separate from the mix/render chain on purpose — monitoring is a
   * "feel" path (latency-tolerant, headphones), not part of the exported file.
   */
  _buildMonitorChain(ctx, p = {}) {
    const input = ctx.createGain();
    const output = ctx.createGain();
    const nodes = [input, output];

    const dry = ctx.createGain();
    dry.gain.value = 1;
    input.connect(dry).connect(output);
    nodes.push(dry);

    const reverb = clamp01(p.reverb ?? 0);
    if (reverb > 0) {
      const conv = ctx.createConvolver();
      conv.buffer = makeImpulseResponse(ctx, 1.8, 2.4);
      const wet = ctx.createGain();
      wet.gain.value = reverb;
      input.connect(conv).connect(wet).connect(output);
      nodes.push(conv, wet);
    }

    const echo = clamp01(p.echo ?? 0);
    if (echo > 0) {
      const delay = ctx.createDelay(1.0);
      delay.delayTime.value = 0.26;
      const fb = ctx.createGain();
      fb.gain.value = Math.min(0.55, 0.2 + echo * 0.5);
      const echoOut = ctx.createGain();
      echoOut.gain.value = echo;
      input.connect(delay);
      delay.connect(fb).connect(delay); // feedback loop
      delay.connect(echoOut).connect(output);
      nodes.push(delay, fb, echoOut);
    }

    return { input, output, nodes };
  }

  /* ---- effect chain assembly (modular) ---- */

  /**
   * Build the vocal effect chain from the registry. V1 wires only the active,
   * non-placeholder effects (currently reverb). Returns chain { input, output }.
   * Future effects slot in here in series with zero call-site changes elsewhere.
   */
  /**
   * Force a centred stereo signal. The iOS mic often arrives as a left-only
   * buffer (1 channel, or 2 channels with a silent right), and a StereoPanner
   * passes stereo through untouched — leaving it in one ear. Splitting and
   * copying channel 0 into BOTH outputs guarantees full-level, centred audio
   * regardless of the source layout.
   */
  _centerNode(ctx) {
    const splitter = ctx.createChannelSplitter(2);
    const merger = ctx.createChannelMerger(2);
    splitter.connect(merger, 0, 0);
    splitter.connect(merger, 0, 1);
    return { input: splitter, output: merger };
  }

  _buildVoiceChain(ctx, params = {}) {
    const order = ["noiseRemoval", "compression", "eq", "preset", "harmony", "reverb"];
    const passthrough = ctx.createGain();
    const head = passthrough;
    let tail = passthrough;
    const updaters = [];

    for (const id of order) {
      const def = EFFECT_REGISTRY[id];
      if (!def || def.isPlaceholder || typeof def.create !== "function") continue;
      const node = def.create(ctx, effectParamsFor(id, params));
      tail.connect(node.input);
      tail = node.output;
      if (typeof node.update === "function") updaters.push((p) => node.update(effectParamsFor(id, p)));
    }
    const update = (p) => { for (const u of updaters) u(p); };
    return { input: head, output: tail, update };
  }

  /* ---- teardown ---- */

  _teardownNodes() {
    for (const n of this._nodes) {
      try { n.stop?.(); } catch {}
      try { n.disconnect?.(); } catch {}
    }
    this._nodes = [];
  }

  _stopStream() {
    try { this._recStream?.getTracks().forEach((t) => t.stop()); } catch {}
    this._recStream = null;
    this._recorder = null;
    this._recChunks = [];
  }

  /** Full cleanup when leaving the Studio. */
  dispose() {
    this._recording = false;
    this._playing = false;
    cancelAnimationFrame(this._raf);
    this._teardownNodes();
    this._stopStream();
    try { this.ctx?.close?.(); } catch {}
    this.ctx = null;
  }
}

/* -------------------------------------------------------------------------- */
/* helpers                                                                     */
/* -------------------------------------------------------------------------- */

function effectParamsFor(id, params) {
  if (id === "reverb") return { amount: params.reverb ?? 0 };
  return params;
}

/** Decaying-noise impulse response so we don't ship an IR file. */
function makeImpulseResponse(ctx, seconds = 2.2, decay = 2.6) {
  const rate = ctx.sampleRate;
  const len = Math.max(1, Math.floor(seconds * rate));
  const impulse = ctx.createBuffer(2, len, rate);
  for (let ch = 0; ch < 2; ch++) {
    const data = impulse.getChannelData(ch);
    for (let i = 0; i < len; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
  }
  return impulse;
}

function pickRecorderMime() {
  const ua = navigator.userAgent || "";
  const safariLike = /iPad|iPhone|iPod/.test(ua) || (/Safari/.test(ua) && !/Chrome|CriOS|Android/.test(ua));
  const order = safariLike
    ? ["audio/mp4", "audio/mp4;codecs=mp4a.40.2", "audio/webm;codecs=opus", "audio/webm"]
    : ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];
  for (const m of order) {
    try { if (window.MediaRecorder?.isTypeSupported?.(m)) return m; } catch {}
  }
  return "";
}

function readStoredLatency(fallback) {
  try {
    const v = Number(localStorage.getItem(LATENCY_STORAGE_KEY));
    if (Number.isFinite(v)) return v;
  } catch {}
  return Number.isFinite(fallback) ? fallback : 120;
}

function clamp01(x) { return Math.max(0, Math.min(1, Number(x) || 0)); }
function clampNum(x, lo, hi) { return Math.max(lo, Math.min(hi, x)); }
