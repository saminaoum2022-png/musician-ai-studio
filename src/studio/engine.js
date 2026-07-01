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
import { ensureNativeRecordingSession, isNativeIosStudio } from "./native-mic-probe.js";

const LATENCY_STORAGE_KEY = "nabad.studio.latencyMs.v1";
const PCM_CAPTURE_WORKLET_URL = new URL("./pcm-capture-processor.js", import.meta.url);
const pcmWorkletLoaded = new WeakMap();

// AI guides are mastered loud; slight trim so Music % feels honest vs raw voice.
const GUIDE_MIX_TRIM = 0.88;
// Voice / Vocal gain sliders: 50% = previous 100% level (2× each); 100% = 3× each for headroom.
const VOCAL_SLIDER_CENTER = 0.5;
const VOCAL_SLIDER_CENTER_GAIN = 2;
const VOCAL_SLIDER_MAX_GAIN = 3;
// WKWebView mic capture runs quiet on iOS — one fixed boost at record start (not AGC).
const IOS_WEB_MIC_DEFAULT_GAIN = 2.0;
// Live headphones monitor only — extra voice boost vs the guide (not in the capture path).
const MONITOR_VOICE_BOOST = 2.5;
const GUIDE_DUCK_WHEN_MONITOR = 0.55;

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

  compression: {
    id: "compression",
    label: "Compression",
    isPlaceholder: false,
    create(ctx, params = {}) {
      return createParallelFx(ctx, params, (c, wetIn, wetOut) => {
        const comp = c.createDynamicsCompressor();
        try {
          comp.threshold.value = -20;
          comp.knee.value = 14;
          comp.ratio.value = 1.75;
          comp.attack.value = 0.014;
          comp.release.value = 0.3;
        } catch {}
        const makeup = c.createGain();
        makeup.gain.value = 1.25;
        wetIn.connect(comp).connect(makeup).connect(wetOut);
      });
    },
  },

  eq: {
    id: "eq",
    label: "EQ",
    isPlaceholder: false,
    create(ctx, params = {}) {
      return createParallelFx(ctx, params, (c, wetIn, wetOut) => {
        const hp = c.createBiquadFilter();
        hp.type = "highpass";
        hp.frequency.value = 65;
        hp.Q.value = 0.65;
        const warmth = c.createBiquadFilter();
        warmth.type = "lowshelf";
        warmth.frequency.value = 220;
        warmth.gain.value = 1.4;
        const presence = c.createBiquadFilter();
        presence.type = "peaking";
        presence.frequency.value = 2800;
        presence.Q.value = 0.85;
        presence.gain.value = 0.4;
        const airCut = c.createBiquadFilter();
        airCut.type = "highshelf";
        airCut.frequency.value = 6500;
        airCut.gain.value = -2.8;
        wetIn.connect(hp).connect(warmth).connect(presence).connect(airCut).connect(wetOut);
      });
    },
  },

  deesser: {
    id: "deesser",
    label: "De-esser",
    isPlaceholder: false,
    create(ctx, params = {}) {
      return createParallelFx(ctx, params, (c, wetIn, wetOut) => {
        const cut = c.createBiquadFilter();
        cut.type = "peaking";
        cut.frequency.value = 6200;
        cut.Q.value = 1.2;
        cut.gain.value = -4.5;
        wetIn.connect(cut).connect(wetOut);
      });
    },
  },

  preset: placeholderEffect("preset", "Vocal Preset"),
  harmony: placeholderEffect("harmony", "Harmony"),
};

/** Export finish presets — applied on Save only (master bus), not live mix preview. */
export const FINISH_PRESETS = {
  balanced: {
    id: "balanced",
    label: "Balanced",
    targetLufs: -16,
    glue: { threshold: -20, ratio: 1.5, attack: 0.018, release: 0.26, makeup: 1.01 },
    eq: { lowHz: 120, lowDb: 0.4, highHz: 8500, highDb: 0.2 },
  },
  warm: {
    id: "warm",
    label: "Warm",
    targetLufs: -16.5,
    glue: { threshold: -22, ratio: 1.4, attack: 0.02, release: 0.3, makeup: 1.0 },
    eq: { lowHz: 220, lowDb: 1.2, highHz: 9000, highDb: -1.4 },
  },
  bright: {
    id: "bright",
    label: "Bright",
    targetLufs: -15.5,
    glue: { threshold: -19, ratio: 1.5, attack: 0.015, release: 0.22, makeup: 1.01 },
    eq: { lowHz: 140, lowDb: -0.5, highHz: 7200, highDb: 0.9 },
  },
  punchy: {
    id: "punchy",
    label: "Punchy",
    targetLufs: -14.8,
    glue: { threshold: -17, ratio: 1.8, attack: 0.012, release: 0.2, makeup: 1.02 },
    eq: { lowHz: 95, lowDb: 0.9, highHz: 6800, highDb: 0.5 },
  },
};

export const FINISH_IDS = Object.keys(FINISH_PRESETS);

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
    this._pcmChunks = [];
    this._pcmNode = null;
    this._recLivePeakSyncedMax = 0;
    this._recCtxStart = 0;
    this._guideCtxStart = 0;
    this._raf = 0;
    this._playing = false;
    this._recording = false;
    this._undoStack = [];
  }

  _takePlayOffsetSec(take) {
    const comp = (this.latencyMs + (take.nudgeMs || 0)) / 1000;
    return Math.max(0, (take.alignSec || 0) + comp);
  }

  _resolveTake(params = {}) {
    const id = params.takeId || this.activeTakeId;
    return this.takes.find((t) => t.id === id) || this.getActiveTake();
  }

  _pushUndo() {
    this._undoStack.push(this._captureState());
    if (this._undoStack.length > 20) this._undoStack.shift();
  }

  canUndo() { return this._undoStack.length > 0; }

  undo() {
    const prev = this._undoStack.pop();
    if (!prev) return false;
    this._restoreState(prev);
    return true;
  }

  _captureState() {
    return {
      takes: this.takes.map((t) => ({
        id: t.id,
        blob: t.blob,
        buffer: cloneAudioBuffer(this.ctx, t.buffer),
        createdAt: t.createdAt,
        nudgeMs: t.nudgeMs,
        alignSec: t.alignSec,
      })),
      activeTakeId: this.activeTakeId,
    };
  }

  _restoreState(snap) {
    if (!snap) return;
    this.takes = snap.takes.map((t) => ({
      id: t.id,
      blob: t.blob,
      buffer: cloneAudioBuffer(this.ctx, t.buffer),
      createdAt: t.createdAt,
      nudgeMs: t.nudgeMs,
      alignSec: t.alignSec,
    }));
    this.activeTakeId = snap.activeTakeId || this.takes.at(-1)?.id || "";
  }

  clearTakes() {
    this.takes = [];
    this.activeTakeId = "";
    this._undoStack = [];
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

    // Mic capture. NS/EC off for studio; AGC only when debug A/B test requests it.
    const autoGainControl = cb.autoGainControl === true;
    this._inputLevelMode = autoGainControl ? "agc" : "raw";

    try { await ensureNativeRecordingSession(); } catch (e) {
      console.warn("[StudioEngine] ensureNativeRecordingSession", e);
    }

    this._recStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl,
        channelCount: 1,
      },
      video: false,
    });

    this._micTrackInfo = readMicTrackInfo(this._recStream);

    // Float32 PCM capture via AudioWorklet — same mic tap as the live meter, no AAC.
    this._pcmChunks = [];
    await ensurePcmCaptureWorklet(this.ctx);

    const micSrc = this.ctx.createMediaStreamSource(this._recStream);
    const micInputGain = this.ctx.createGain();
    const useIosBoost = cb.autoMicLevel !== false && !autoGainControl && isNativeIosStudio();
    const micGain = useIosBoost ? IOS_WEB_MIC_DEFAULT_GAIN : 1;
    micInputGain.gain.value = micGain;
    this._micInputGain = micInputGain;
    this._recordInputGain = micGain;
    this._calGainMode = useIosBoost ? "ios-default" : "none";

    micSrc.connect(micInputGain);

    const analyser = this.ctx.createAnalyser();
    analyser.fftSize = 2048;
    micInputGain.connect(analyser);

    const procIn = Math.min(2, Math.max(1, this._micTrackInfo?.settings?.channelCount || 1));
    const pcmNode = new AudioWorkletNode(this.ctx, "pcm-capture-processor", {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      channelCount: procIn,
      outputChannelCount: [1],
    });
    this._pcmNode = pcmNode;
    pcmNode.port.onmessage = (ev) => {
      if (!this._recording || ev.data?.type !== "pcm") return;
      const samples = ev.data.samples;
      if (samples?.length) this._pcmChunks.push(samples);
    };

    const pcmSilent = this.ctx.createGain();
    pcmSilent.gain.value = 0;
    micInputGain.connect(pcmNode);
    pcmNode.connect(pcmSilent);
    pcmSilent.connect(this.ctx.destination);

    const floatData = typeof analyser.getFloatTimeDomainData === "function"
      ? new Float32Array(analyser.fftSize)
      : null;
    const byteData = floatData ? null : new Uint8Array(analyser.fftSize);

    // Optional live monitoring ("hear yourself"): raw mic -> reverb -> output.
    // HEADPHONES ONLY — through a speaker this loops back into the mic and howls.
    // There's inherent WebView round-trip latency, so it reads as a soft echo.
    this._monitorChain = null;
    if (cb.monitor) {
      const monitorVoiceBoost = this.ctx.createGain();
      monitorVoiceBoost.gain.value = Number(cb.monitorVoiceBoost) || MONITOR_VOICE_BOOST;
      const monitorGain = this.ctx.createGain();
      monitorGain.gain.value = cb.monitorVol ?? 0.85;
      const chain = this._buildMonitorChain(this.ctx, {
        reverb: cb.monitorReverb ?? 0.25,
        echo: cb.monitorEcho ?? 0.18,
      });
      micInputGain.connect(monitorVoiceBoost).connect(chain.input);
      // Centre the mic across both ears (see _centerNode), then limit so the
      // hot makeup gain stays loud without clipping in the headphones.
      const center = this._centerNode(this.ctx);
      const limiter = this._makeLimiter(this.ctx);
      chain.output.connect(center.input);
      center.output.connect(monitorGain).connect(limiter).connect(this.ctx.destination);
      this._monitorChain = { ...chain, nodes: [...chain.nodes, monitorVoiceBoost, monitorGain, center.input, center.output, limiter] };
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
      const musicVol = clamp01(cb.musicVol ?? 0.75);
      guideGain.gain.value = cb.monitor ? musicVol * GUIDE_DUCK_WHEN_MONITOR : musicVol;
      guideSrc.connect(guideGain).connect(this.ctx.destination);
      guideSrc.start(startAt);
    }

    this._recLivePeakMax = 0;
    this._recLivePeakSyncedMax = 0;
    this._recCtxStart = this.ctx.currentTime;
    this._guideCtxStart = startAt;
    this._recording = true;
    this._nodes = [micSrc, micInputGain, analyser, pcmNode, pcmSilent, ...(guideSrc ? [guideSrc, guideGain] : []), ...(this._monitorChain?.nodes || [])];

    // Count-in ticks.
    if (typeof cb.onCountIn === "function") {
      const n = Math.round(countInSec);
      for (let i = 0; i < n; i++) {
        setTimeout(() => { if (this._recording) cb.onCountIn(n - i); }, i * 1000);
      }
      setTimeout(() => { if (this._recording) cb.onCountIn(0); }, n * 1000);
    }

    // Start capture (t=0 maps to _recCtxStart; PCM processor runs on AudioContext clock).
    if (guideSrc) {
      guideSrc.onended = () => {
        if (typeof cb.onEnded === "function") cb.onEnded();
      };
    }

    // rAF loop for level + position.
    const loop = () => {
      if (!this._recording) return;
      let peak = 0;
      if (floatData) {
        analyser.getFloatTimeDomainData(floatData);
        for (let i = 0; i < floatData.length; i++) {
          const v = Math.abs(floatData[i]);
          if (v > peak) peak = v;
        }
      } else {
        analyser.getByteTimeDomainData(byteData);
        for (let i = 0; i < byteData.length; i++) {
          const v = Math.abs(byteData[i] - 128) / 128;
          if (v > peak) peak = v;
        }
      }

      if (peak > this._recLivePeakMax) this._recLivePeakMax = peak;
      const pos = this.ctx.currentTime - this._guideCtxStart;
      if (pos >= 0 && peak > this._recLivePeakSyncedMax) this._recLivePeakSyncedMax = peak;
      if (typeof cb.onLevel === "function") cb.onLevel(peak);
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

    try { this._pcmNode?.port?.postMessage({ type: "stop" }); } catch {}

    const pcmChunks = this._pcmChunks.slice();
    const alignSecRaw = Math.max(0, this._guideCtxStart - this._recCtxStart);

    this._teardownNodes();
    this._stopStream();

    let alignSec = alignSecRaw;
    let buffer = mergePcmChunks(pcmChunks, this.ctx.sampleRate, this.ctx);
    const preTrimPeakDb = bufferPeakDb(buffer);

    if (buffer) {
      buffer = monoFromBuffer(this.ctx, buffer);
      const trimmed = trimBufferLeadIn(this.ctx, buffer, alignSec);
      buffer = trimmed.buffer;
      alignSec = trimmed.alignSec;
    }

    const take = {
      id: `take_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      blob: null,
      containerBlob: null,
      recorderMime: "audio/float32-pcm",
      captureMethod: "float32-pcm-worklet",
      liveMeterPeak: this._recLivePeakMax || 0,
      liveMeterPeakSynced: this._recLivePeakSyncedMax || 0,
      preTrimPeakDb,
      micTrackInfo: this._micTrackInfo || null,
      inputLevelMode: this._inputLevelMode || "raw",
      autoGainControlRequested: this._inputLevelMode === "agc",
      recordInputGain: this._recordInputGain || 1,
      calGainMode: this._calGainMode || "none",
      buffer,
      createdAt: Date.now(),
      nudgeMs: 0,
      alignSec,
    };
    if (buffer) {
      try { take.blob = bufferToWavBlob(buffer); } catch {}
    }
    this._pcmChunks = [];
    this.takes.push(take);
    this.activeTakeId = take.id;
    return take;
  }

  /* ---- takes ---- */

  /** Decode a take's blob into buffer if missing (e.g. after a partial stop failure). */
  async hydrateTakeBuffer(take, opts = {}) {
    if (!take || take.buffer || !take.blob?.size) return !!take?.buffer;
    await this.ensureReady();
    try {
      const arr = await take.blob.arrayBuffer();
      if (!arr.byteLength) return false;
      let buffer = await this.ctx.decodeAudioData(arr.slice(0));
      buffer = monoFromBuffer(this.ctx, buffer);
      if (opts.polish) buffer = finishTakeBuffer(buffer);
      take.buffer = buffer;
      return true;
    } catch {
      return false;
    }
  }

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

  /** Bucket peak envelope for waveform UI (0..1 per bucket). Optional startSec/endSec slice. */
  static computePeaks(buffer, buckets = 64, startSec = 0, endSec = null) {
    if (!buffer) return [];
    const ch = buffer.getChannelData(0);
    const sr = buffer.sampleRate;
    const i0 = Math.max(0, Math.floor((Number(startSec) || 0) * sr));
    const i1 = endSec != null
      ? Math.min(ch.length, Math.ceil(Number(endSec) * sr))
      : ch.length;
    const len = Math.max(0, i1 - i0);
    if (len < 1) return [];
    const n = Math.max(8, buckets);
    const block = Math.max(1, Math.floor(len / n));
    const peaks = [];
    for (let i = 0; i < n; i++) {
      const start = i0 + i * block;
      const end = Math.min(i1, start + block);
      let peak = 0;
      for (let j = start; j < end; j++) peak = Math.max(peak, Math.abs(ch[j]));
      peaks.push(peak);
    }
    const max = Math.max(0.001, ...peaks);
    return peaks.map((p) => p / max);
  }

  /** Buffer time (sec) where guide-timeline 0 maps when playing this take. */
  takePlayStartSec(take) {
    return take ? this._takeBufferOffset(take) : 0;
  }

  /** Vocal duration aligned to the guide (excludes count-in / pre-sync silence). */
  takeContentDuration(take) {
    if (!take?.buffer) return 0;
    return Math.max(0, take.buffer.duration - this._takeBufferOffset(take));
  }

  /**
   * Keep only [startSec, endSec] of the take's buffer (take-local timeline).
   * Adjusts alignSec if the kept region no longer starts at buffer 0.
   */
  trimTake(id, startSec, endSec) {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      try { this.ctx = new AC(); } catch { return false; }
    }
    const t = this.takes.find((x) => x.id === id);
    if (!t?.buffer) return false;
    const a = Math.max(0, Math.min(Number(startSec) || 0, t.buffer.duration));
    const b = Math.max(a + 0.05, Math.min(Number(endSec) || t.buffer.duration, t.buffer.duration));
    const sliced = sliceBuffer(this.ctx, t.buffer, a, b);
    if (!sliced) return false;
    this._pushUndo();
    const comp = (this.latencyMs + (t.nudgeMs || 0)) / 1000;
    const oldOff = this._takePlayOffsetSec(t);
    const newOff = Math.max(0, oldOff - a);
    t.alignSec = Math.max(0, newOff - comp);
    t.buffer = sliced;
    t.blob = bufferToWavBlob(sliced);
    return true;
  }

  /** Remove [startSec, endSec] from the take buffer (splice out). */
  deleteTakeRegion(id, startSec, endSec) {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      try { this.ctx = new AC(); } catch { return false; }
    }
    const t = this.takes.find((x) => x.id === id);
    if (!t?.buffer) return false;
    const a = Math.max(0, Math.min(Number(startSec) || 0, t.buffer.duration));
    const b = Math.max(a + 0.05, Math.min(Number(endSec) || t.buffer.duration, t.buffer.duration));
    const spliced = spliceBuffer(this.ctx, t.buffer, a, b);
    if (!spliced) return false;
    this._pushUndo();
    const comp = (this.latencyMs + (t.nudgeMs || 0)) / 1000;
    const oldOff = this._takePlayOffsetSec(t);
    let newOff = oldOff;
    if (b <= oldOff) newOff = Math.max(0, oldOff - (b - a));
    else if (a < oldOff) newOff = a;
    t.alignSec = Math.max(0, newOff - comp);
    t.buffer = spliced;
    t.blob = bufferToWavBlob(spliced);
    return true;
  }

  /** Split a take at take-local `atSec`; current take keeps the first part, adds a new take for the rest. */
  splitTake(id, atSec) {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      try { this.ctx = new AC(); } catch { return null; }
    }
    const t = this.takes.find((x) => x.id === id);
    if (!t?.buffer) return null;
    const at = clampNum(Number(atSec) || 0, 0.05, t.buffer.duration - 0.05);
    const partA = sliceBuffer(this.ctx, t.buffer, 0, at);
    const partB = sliceBuffer(this.ctx, t.buffer, at, t.buffer.duration);
    if (!partA || !partB) return null;
    this._pushUndo();
    const comp = (this.latencyMs + (t.nudgeMs || 0)) / 1000;
    const oldOff = this._takePlayOffsetSec(t);
    t.buffer = partA;
    t.blob = bufferToWavBlob(partA);
    t.alignSec = Math.max(0, oldOff - comp);
    const newTake = {
      id: `take_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      blob: bufferToWavBlob(partB),
      buffer: partB,
      createdAt: Date.now(),
      nudgeMs: t.nudgeMs || 0,
      alignSec: Math.max(0, oldOff - at - comp),
    };
    this.takes.push(newTake);
    return newTake;
  }

  /** Guide-time offset — same as takePlayStartSec (legacy alias for UI). */
  takeOffsetSec(take) {
    return this.takePlayStartSec(take);
  }

  /** Where (in seconds) to begin reading a take's buffer so it aligns to guide-0. */
  _takeBufferOffset(take) {
    return this._takePlayOffsetSec(take);
  }

  _voiceMixGain(params = {}, take = null) {
    return voiceOutputGain(params);
  }

  /** Raw buffer, or denoise blended by fxDenoise amount (0..1). */
  _getTakePlaybackBuffer(take, params = {}) {
    if (!take?.buffer) return null;
    const amt = fxAmount01(params.fxDenoise);
    if (amt <= 0.001) return take.buffer;
    const stepped = Math.round(amt * 100);
    const cacheKey = `${take.id}_${take.buffer.length}_dn${stepped}`;
    if (take._fxDenoiseBuf && take._fxCacheKey === cacheKey) return take._fxDenoiseBuf;
    const blended = blendDenoiseBuffer(this.ctx, take.buffer, amt);
    take._fxDenoiseBuf = blended;
    take._fxCacheKey = cacheKey;
    return blended;
  }

  /* ---- live mix preview ---- */

  /**
   * Play guide + active take through the mix graph.
   * params: { musicVol, voiceVol, reverb, fromSec, takeId, voiceClipStart, voiceClipEnd }
   */
  async playMix(params = {}, cb = {}) {
    await this.ensureReady();
    this.stopMix();
    if (!this.guideBuffer) return;
    const take = this._resolveTake(params);
    const solo = params.solo || ""; // "" | "voice" | "music"

    const master = this.ctx.createGain();
    const limiter = this._makeLimiter(this.ctx);
    master.connect(limiter).connect(this.ctx.destination);
    const startAt = this.ctx.currentTime + 0.08;
    const fromSec = Math.max(0, Number(params.fromSec) || 0);
    this._nodes = [master, limiter];

    // Live-adjustable handles so the Mix sliders change gains/reverb in real
    // time (no restart). Cleared on stopMix.
    this._mix = { musicGain: null, voiceGain: null, voiceChain: null };

    // Music (guide)
    const guideSrc = this.ctx.createBufferSource();
    guideSrc.buffer = this.guideBuffer;
    const musicGain = this.ctx.createGain();
    musicGain.gain.value = solo === "voice" ? 0 : musicOutputGain(params);
    guideSrc.connect(musicGain).connect(master);
    guideSrc.start(startAt, fromSec);
    this._nodes.push(guideSrc, musicGain);
    this._mix.musicGain = musicGain;

    // Voice (take) through the effect chain, centred across both ears.
    if (take && take.buffer && solo !== "music") {
      const clipStart = Math.max(0, Number(params.voiceClipStart) || 0);
      const clipEnd = params.voiceClipEnd != null ? Number(params.voiceClipEnd) : null;
      const voiceGuideStart = Math.max(fromSec, clipStart);
      const voiceGuideEnd = clipEnd != null ? clipEnd : (fromSec + this.takeContentDuration(take));
      const voiceDur = voiceGuideEnd - voiceGuideStart;
      if (voiceDur > 0.02) {
        const voiceSrc = this.ctx.createBufferSource();
        voiceSrc.buffer = this._getTakePlaybackBuffer(take, params);
        const chain = this._buildVoiceChain(this.ctx, params);
        const voiceGain = this.ctx.createGain();
        voiceGain.gain.value = this._voiceMixGain(params, take);
        const center = this._centerNode(this.ctx);
        voiceSrc.connect(chain.input);
        chain.output.connect(voiceGain).connect(center.input);
        center.output.connect(master);
        const off = this._takeBufferOffset(take) + voiceGuideStart;
        const voiceDelay = Math.max(0, voiceGuideStart - fromSec);
        voiceSrc.start(
          startAt + voiceDelay,
          Math.min(off, Math.max(0, take.buffer.duration - 0.01)),
          voiceDur,
        );
        this._nodes.push(voiceSrc, chain.input, chain.output, voiceGain, center.input, center.output);
        this._mix.voiceGain = voiceGain;
        this._mix.voiceChain = chain;
      }
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
    const solo = params.solo || "";
    if (mix.musicGain) mix.musicGain.gain.value = solo === "voice" ? 0 : musicOutputGain(params);
    if (mix.voiceGain) {
      const take = this._resolveTake(params);
      mix.voiceGain.gain.value = solo === "music" ? 0 : this._voiceMixGain(params, take);
    }
    if (mix.voiceChain?.update) mix.voiceChain.update(params);
  }

  stopMix() {
    this._playing = false;
    this._mix = null;
    cancelAnimationFrame(this._raf);
    this._teardownNodes();
  }

  /* ---- final render (the ONLY thing publish uploads) ---- */

  /**
   * Render guide + active take + mix + finish master to a stereo WAV Blob.
   * Finish (EQ, glue, LUFS) applies here only — live preview stays un-mastered.
   */
  async renderMix(params = {}) {
    if (!this.guideBuffer) throw new Error("no guide");
    const take = this._resolveTake(params);
    const sr = this.sampleRate;
    const durationSec = this.guideBuffer.duration + 0.5;
    const frames = Math.ceil(durationSec * sr);
    const off = new OfflineAudioContext(2, frames, sr);

    const mixBus = off.createGain();
    const finishId = FINISH_PRESETS[params.finish] ? params.finish : "balanced";
    const master = this._buildMasterChain(off, finishId);
    const limiter = this._makeLimiter(off);
    mixBus.connect(master.input);
    master.output.connect(limiter).connect(off.destination);

    const guideSrc = off.createBufferSource();
    guideSrc.buffer = this.guideBuffer;
    const musicGain = off.createGain();
    musicGain.gain.value = musicOutputGain(params);
    guideSrc.connect(musicGain).connect(mixBus);
    guideSrc.start(0);

    if (take && take.buffer) {
      const voiceSrc = off.createBufferSource();
      voiceSrc.buffer = this._getTakePlaybackBuffer(take, params);
      const { input, output } = this._buildVoiceChain(off, params);
      const voiceGain = off.createGain();
      voiceGain.gain.value = this._voiceMixGain(params, take);
      const center = this._centerNode(off);
      voiceSrc.connect(input);
      output.connect(voiceGain).connect(center.input);
      center.output.connect(mixBus);
      voiceSrc.start(0, Math.min(this._takeBufferOffset(take), Math.max(0, take.buffer.duration - 0.01)));
    }

    const rendered = await off.startRendering();
    const chans = rendered.numberOfChannels >= 2
      ? [rendered.getChannelData(0), rendered.getChannelData(1)]
      : [rendered.getChannelData(0), rendered.getChannelData(0)];

    const preset = FINISH_PRESETS[finishId];
    normalizeToLufs(chans, preset.targetLufs, rendered.sampleRate);
    applyPeakCeiling(chans, 0.91);

    const blob = encodeWav16(chans, rendered.sampleRate);
    return { blob, durationSec: rendered.duration, sampleRate: rendered.sampleRate, finish: finishId };
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
    input.connect(output);

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

  /**
   * A brick-wall-ish limiter on the master bus. The voice makeup gain pushes the
   * mix hot on purpose (so it reads loud); the limiter catches the peaks so it
   * never clips. ~3ms lookahead is fine even for the live monitor.
   */
  _makeLimiter(ctx) {
    const c = ctx.createDynamicsCompressor();
    try {
      c.threshold.value = -2.5;
      c.knee.value = 0;
      c.ratio.value = 20;
      c.attack.value = 0.003;
      c.release.value = 0.25;
    } catch {}
    return c;
  }

  _buildVoiceChain(ctx, params = {}) {
    const order = ["compression", "eq", "deesser", "reverb"];
    const passthrough = ctx.createGain();
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
    return { input: passthrough, output: tail, update };
  }

  /** Master finish chain — bus EQ + glue compression (export / save only). */
  _buildMasterChain(ctx, finishId = "balanced") {
    const preset = FINISH_PRESETS[finishId] || FINISH_PRESETS.balanced;
    const input = ctx.createGain();
    let tail = input;
    const eq = preset.eq;
    if (eq) {
      const low = ctx.createBiquadFilter();
      low.type = "lowshelf";
      low.frequency.value = eq.lowHz;
      low.gain.value = eq.lowDb;
      const high = ctx.createBiquadFilter();
      high.type = "highshelf";
      high.frequency.value = eq.highHz;
      high.gain.value = eq.highDb;
      tail.connect(low).connect(high);
      tail = high;
    }
    const g = preset.glue;
    const comp = ctx.createDynamicsCompressor();
    try {
      comp.threshold.value = g.threshold;
      comp.knee.value = 6;
      comp.ratio.value = g.ratio;
      comp.attack.value = g.attack;
      comp.release.value = g.release;
    } catch {}
    const makeup = ctx.createGain();
    makeup.gain.value = g.makeup;
    tail.connect(comp).connect(makeup);
    return { input, output: makeup, preset };
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
    this._pcmChunks = [];
    this._pcmNode = null;
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
  if (id === "reverb") return { amount: fxAmount01(params.reverb) };
  if (id === "compression") return { amount: fxAmount01(params.fxCompress) };
  if (id === "eq") return { amount: fxAmount01(params.fxEq) };
  if (id === "deesser") return { amount: fxAmount01(params.fxDeesser) };
  return params;
}

/** Dry/wet wrapper — amount 0 = bypass, 1 = full effect. */
function createParallelFx(ctx, params, buildWet) {
  const input = ctx.createGain();
  const output = ctx.createGain();
  const dry = ctx.createGain();
  const wetAmt = ctx.createGain();
  input.connect(dry).connect(output);
  const wetIn = ctx.createGain();
  const wetOut = ctx.createGain();
  input.connect(wetIn);
  buildWet(ctx, wetIn, wetOut);
  wetOut.connect(wetAmt).connect(output);
  const apply = (p = {}) => {
    const amt = clamp01(p.amount ?? params.amount ?? 0);
    wetAmt.gain.value = amt;
    dry.gain.value = 1 - amt;
  };
  apply(params);
  return { input, output, update: apply };
}

/** 0–100 (or legacy boolean) → 0..1. */
function fxAmount01(v) {
  if (v === true) return 1;
  if (v === false || v == null) return 0;
  if (typeof v === "number" && v <= 1 && v > 0 && !Number.isInteger(v)) return clamp01(v);
  return clamp01((Number(v) || 0) / 100);
}

function blendDenoiseBuffer(ctx, buffer, amount) {
  if (!buffer || amount <= 0.001) return buffer;
  const denoised = cloneAudioBuffer(ctx, buffer);
  if (!denoised) return buffer;
  denoiseAndGateBuffer(denoised);
  if (amount >= 0.999) return denoised;
  const out = cloneAudioBuffer(ctx, buffer);
  if (!out) return denoised;
  const a = clamp01(amount);
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const src = buffer.getChannelData(ch);
    const dn = denoised.getChannelData(ch);
    const dst = out.getChannelData(ch);
    for (let i = 0; i < dst.length; i++) dst[i] = src[i] * (1 - a) + dn[i] * a;
  }
  return out;
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

/** Snapshot mic track settings after getUserMedia (for debug / level audit). */
function readMicTrackInfo(stream) {
  const track = stream?.getAudioTracks?.()?.[0];
  if (!track) return null;
  let settings = {};
  let constraints = {};
  try { settings = { ...(track.getSettings?.() || {}) }; } catch {}
  try { constraints = { ...(track.getConstraints?.() || {}) }; } catch {}
  return {
    label: String(track.label || "").slice(0, 80),
    settings,
    constraints,
  };
}

/** Load the PCM capture AudioWorklet once per AudioContext. */
async function ensurePcmCaptureWorklet(ctx) {
  if (!ctx?.audioWorklet) throw new Error("AudioWorklet not supported");
  if (pcmWorkletLoaded.get(ctx)) return;
  await ctx.audioWorklet.addModule(PCM_CAPTURE_WORKLET_URL);
  pcmWorkletLoaded.set(ctx, true);
}

function mergePcmChunks(chunks, sampleRate, ctx) {
  if (!chunks?.length || !ctx) return null;
  const total = chunks.reduce((s, c) => s + c.length, 0);
  if (!total) return null;
  const buffer = ctx.createBuffer(1, total, sampleRate);
  const out = buffer.getChannelData(0);
  let off = 0;
  for (const c of chunks) {
    out.set(c, off);
    off += c.length;
  }
  return buffer;
}

function bufferPeakDb(buffer) {
  if (!buffer) return -Infinity;
  let peak = 0;
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const data = buffer.getChannelData(ch);
    for (let i = 0; i < data.length; i++) peak = Math.max(peak, Math.abs(data[i]));
  }
  if (peak <= 0) return -Infinity;
  return 20 * Math.log10(peak);
}

function bufferPeakLinear(buffer) {
  if (!buffer) return 0;
  let peak = 0;
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const data = buffer.getChannelData(ch);
    for (let i = 0; i < data.length; i++) peak = Math.max(peak, Math.abs(data[i]));
  }
  return peak;
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

function cloneAudioBuffer(ctx, buffer) {
  if (!buffer || !ctx) return buffer || null;
  const out = ctx.createBuffer(buffer.numberOfChannels, buffer.length, buffer.sampleRate);
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    out.getChannelData(ch).set(buffer.getChannelData(ch));
  }
  return out;
}

/** 50% = 2× each (prior 100% level); 100% = 3× each. Voice × Vocal gain multiply. */
function voiceOutputGain(params = {}) {
  const vol = vocalSliderGain(params.voiceVol);
  const gain = vocalSliderGain(params.vocalGain);
  return vol * gain;
}

function vocalSliderGain(pct01) {
  const x = Number.isFinite(pct01) ? pct01 : VOCAL_SLIDER_CENTER;
  if (x <= 0) return 0;
  if (x <= VOCAL_SLIDER_CENTER) {
    return (x / VOCAL_SLIDER_CENTER) * VOCAL_SLIDER_CENTER_GAIN;
  }
  return VOCAL_SLIDER_CENTER_GAIN
    + ((x - VOCAL_SLIDER_CENTER) / VOCAL_SLIDER_CENTER) * (VOCAL_SLIDER_MAX_GAIN - VOCAL_SLIDER_CENTER_GAIN);
}

/** Inverse of vocalSliderGain — for auto-level (pct 0–100). */
export function vocalGainMultiplier(pct01) {
  return vocalSliderGain(pct01);
}

export function vocalGainSliderPctFromMultiplier(mult) {
  const g = Math.max(0, Math.min(VOCAL_SLIDER_MAX_GAIN, Number(mult) || 0));
  if (g <= VOCAL_SLIDER_CENTER_GAIN) {
    return Math.round((g / VOCAL_SLIDER_CENTER_GAIN) * VOCAL_SLIDER_CENTER * 100);
  }
  const t = (g - VOCAL_SLIDER_CENTER_GAIN) / (VOCAL_SLIDER_MAX_GAIN - VOCAL_SLIDER_CENTER_GAIN);
  return Math.round((VOCAL_SLIDER_CENTER + t * VOCAL_SLIDER_CENTER) * 100);
}

function musicOutputGain(params = {}) {
  return clamp01(params.musicVol ?? 0.7) * GUIDE_MIX_TRIM;
}

function normalizeTakeBuffer(buffer, targetPeak = 0.68) {
  if (!buffer) return buffer;
  const ch0 = buffer.getChannelData(0);
  let peak = 0;
  for (let i = 0; i < ch0.length; i++) peak = Math.max(peak, Math.abs(ch0[i]));
  if (peak < 0.008) return buffer;
  let g = 1;
  if (peak > targetPeak) g = targetPeak / peak;
  else if (peak < targetPeak * 0.55) g = Math.min(targetPeak / peak, 1.45);
  else return buffer;
  const AC = window.AudioContext || window.webkitAudioContext;
  const tmp = new AC();
  const out = tmp.createBuffer(buffer.numberOfChannels, buffer.length, buffer.sampleRate);
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const src = buffer.getChannelData(ch);
    const dst = out.getChannelData(ch);
    for (let i = 0; i < src.length; i++) dst[i] = Math.max(-1, Math.min(1, src[i] * g));
  }
  try { tmp.close(); } catch {}
  return out;
}

function sliceBuffer(ctx, buffer, startSec, endSec) {
  if (!buffer || !ctx) return null;
  const sr = buffer.sampleRate;
  const a = Math.max(0, Math.floor(startSec * sr));
  const b = Math.min(buffer.length, Math.ceil(endSec * sr));
  if (b <= a + 1) return null;
  const len = b - a;
  const out = ctx.createBuffer(buffer.numberOfChannels, len, sr);
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const dst = out.getChannelData(ch);
    const src = buffer.getChannelData(ch);
    for (let i = 0; i < len; i++) dst[i] = src[a + i];
  }
  return out;
}

function spliceBuffer(ctx, buffer, startSec, endSec) {
  if (!buffer || !ctx) return null;
  const sr = buffer.sampleRate;
  const a = Math.max(0, Math.floor(startSec * sr));
  const b = Math.min(buffer.length, Math.ceil(endSec * sr));
  if (b <= a + 1) return buffer;
  const len = buffer.length - (b - a);
  const out = ctx.createBuffer(buffer.numberOfChannels, len, sr);
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const src = buffer.getChannelData(ch);
    const dst = out.getChannelData(ch);
    let j = 0;
    for (let i = 0; i < a; i++) dst[j++] = src[i];
    for (let i = b; i < src.length; i++) dst[j++] = src[i];
  }
  return out;
}

/** Adaptive expander gate — lookahead + hysteresis so sentence starts stay intact. */
function denoiseAndGateBuffer(buffer) {
  if (!buffer) return buffer;
  const ch0 = buffer.getChannelData(0);
  const sr = buffer.sampleRate;
  const nCh = buffer.numberOfChannels;
  const win = Math.max(1, Math.floor(0.025 * sr));
  const levels = [];
  for (let i = 0; i < ch0.length; i += win) {
    let p = 0;
    const end = Math.min(ch0.length, i + win);
    for (let j = i; j < end; j++) p = Math.max(p, Math.abs(ch0[j]));
    levels.push(p);
  }
  levels.sort((a, b) => a - b);
  const floor = levels[Math.floor(levels.length * 0.12)] || 0.004;
  const openTh = clampNum(floor * 1.55, 0.005, 0.02);
  const closeTh = openTh * 0.32;
  const minGain = 0.17;
  const look = Math.max(1, Math.floor(0.007 * sr));
  const envArr = new Float32Array(ch0.length);
  let env = 0;
  const peakAtk = Math.exp(-1 / (0.0006 * sr));
  const peakRel = Math.exp(-1 / (0.04 * sr));
  for (let i = 0; i < ch0.length; i++) {
    const lvl = Math.abs(ch0[i]);
    env = lvl > env ? lvl + peakAtk * (env - lvl) : lvl + peakRel * (env - lvl);
    envArr[i] = env;
  }
  const envCurve = new Float32Array(ch0.length);
  let gateGain = 1;
  let isOpen = false;
  const gainAtk = Math.exp(-1 / (0.0007 * sr));
  const gainRel = Math.exp(-1 / (0.22 * sr));
  for (let i = 0; i < ch0.length; i++) {
    let probe = envArr[i];
    for (let j = i + 1; j < Math.min(i + look, ch0.length); j++) probe = Math.max(probe, envArr[j]);
    if (isOpen) { if (probe < closeTh) isOpen = false; }
    else if (probe > openTh) isOpen = true;
    const target = isOpen ? 1 : minGain;
    gateGain = target > gateGain
      ? target + gainAtk * (gateGain - target)
      : target + gainRel * (gateGain - target);
    envCurve[i] = gateGain;
  }
  for (let ch = 0; ch < nCh; ch++) {
    const data = buffer.getChannelData(ch);
    for (let i = 0; i < data.length; i++) data[i] *= envCurve[i];
  }
  return buffer;
}

/** Gentle level rider — only pulls down hot phrases, never boosts quiet ones. */
function stabilizeLevelBuffer(buffer) {
  if (!buffer) return buffer;
  const ch0 = buffer.getChannelData(0);
  const sr = buffer.sampleRate;
  const nCh = buffer.numberOfChannels;
  const win = Math.max(1, Math.floor(0.045 * sr));
  const nWin = Math.ceil(ch0.length / win);
  const gains = new Float32Array(nWin);
  const target = 0.075;
  for (let w = 0; w < nWin; w++) {
    let sum = 0;
    const start = w * win;
    const end = Math.min(ch0.length, start + win);
    for (let i = start; i < end; i++) sum += ch0[i] * ch0[i];
    const rms = Math.sqrt(sum / Math.max(1, end - start));
    gains[w] = rms > target ? clampNum(target / rms, 0.78, 1.0) : 1;
  }
  for (let w = 1; w < nWin; w++) gains[w] = gains[w] * 0.28 + gains[w - 1] * 0.72;
  for (let ch = 0; ch < nCh; ch++) {
    const data = buffer.getChannelData(ch);
    for (let i = 0; i < data.length; i++) {
      const w = Math.min(nWin - 1, Math.floor(i / win));
      data[i] *= gains[w];
    }
  }
  return buffer;
}

/** Post-record polish: gate room noise, tame peaks, light normalize. */
function finishTakeBuffer(buffer) {
  if (!buffer) return buffer;
  denoiseAndGateBuffer(buffer);
  stabilizeLevelBuffer(buffer);
  return normalizeTakeBuffer(buffer, 0.68);
}

function bufferToWavBlob(buffer) {
  if (!buffer) return new Blob();
  const chans = [buffer.getChannelData(0)];
  if (buffer.numberOfChannels >= 2) chans.push(buffer.getChannelData(1));
  return encodeWav16(chans, buffer.sampleRate);
}

/**
 * iOS MediaRecorder AAC often decodes as stereo with the mic on L only.
 * Collapse to true mono without halving a single active channel.
 */
function monoFromBuffer(ctx, buffer) {
  if (!buffer || !ctx) return buffer;
  if (buffer.numberOfChannels === 1) return buffer;

  const L = buffer.getChannelData(0);
  const R = buffer.getChannelData(1);
  let sumL = 0;
  let sumR = 0;
  for (let i = 0; i < L.length; i++) {
    sumL += L[i] * L[i];
    sumR += R[i] * R[i];
  }
  const rmsL = Math.sqrt(sumL / L.length);
  const rmsR = Math.sqrt(sumR / R.length);

  const mono = ctx.createBuffer(1, buffer.length, buffer.sampleRate);
  const out = mono.getChannelData(0);
  if (rmsR < rmsL * 0.05) out.set(L);
  else if (rmsL < rmsR * 0.05) out.set(R);
  else {
    for (let i = 0; i < L.length; i++) out[i] = 0.5 * (L[i] + R[i]);
  }
  return mono;
}

/** Drop count-in silence from the front of a take so waveforms line up with the guide. */
function trimBufferLeadIn(ctx, buffer, alignSec) {
  const preRoll = 0.04;
  const leadTrim = Math.max(0, (Number(alignSec) || 0) - preRoll);
  if (leadTrim < 0.12 || !buffer || !ctx) return { buffer, alignSec: Number(alignSec) || 0 };
  const sliced = sliceBuffer(ctx, buffer, leadTrim, buffer.duration);
  if (!sliced) return { buffer, alignSec: Number(alignSec) || 0 };
  return { buffer: sliced, alignSec: Math.max(preRoll, (Number(alignSec) || 0) - leadTrim) };
}

/** Simplified integrated loudness (400 ms blocks, mono downmix). */
function measureIntegratedLufs(chans, sampleRate) {
  const L = chans[0];
  const R = chans[1] || chans[0];
  const block = Math.max(1, Math.floor(0.4 * sampleRate));
  let sum = 0;
  let count = 0;
  for (let off = 0; off + block <= L.length; off += block) {
    let ms = 0;
    for (let i = 0; i < block; i++) {
      const idx = off + i;
      const m = (L[idx] + R[idx]) * 0.5;
      ms += m * m;
    }
    ms /= block;
    if (ms > 1e-10) {
      sum += ms;
      count++;
    }
  }
  if (!count) return -70;
  return -0.691 + 10 * Math.log10(sum / count);
}

function normalizeToLufs(chans, targetLufs = -16, sampleRate = 44100) {
  const cur = measureIntegratedLufs(chans, sampleRate);
  if (!Number.isFinite(cur) || cur <= -60) return;
  const gain = clampNum(Math.pow(10, (targetLufs - cur) / 20), 0.4, 2.2);
  for (const ch of chans) for (let i = 0; i < ch.length; i++) ch[i] *= gain;
}

function applyPeakCeiling(chans, ceiling = 0.97) {
  let peak = 0;
  for (const ch of chans) {
    for (let i = 0; i < ch.length; i++) peak = Math.max(peak, Math.abs(ch[i]));
  }
  if (peak <= ceiling) return;
  const g = ceiling / peak;
  for (const ch of chans) for (let i = 0; i < ch.length; i++) ch[i] *= g;
}
