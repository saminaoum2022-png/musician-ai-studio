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

// Final makeup gain after compression/EQ — kept moderate so the chain stays warm, not harsh.
const VOICE_MAKEUP = 1.95;

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
    /** Gentle vocal compression — evens level without squashing body. */
    create(ctx) {
      const input = ctx.createGain();
      const comp = ctx.createDynamicsCompressor();
      try {
        comp.threshold.value = -20;
        comp.knee.value = 10;
        comp.ratio.value = 2.5;
        comp.attack.value = 0.006;
        comp.release.value = 0.18;
      } catch {}
      const makeup = ctx.createGain();
      makeup.gain.value = 1.65;
      input.connect(comp).connect(makeup);
      return { input, output: makeup, update: () => {} };
    },
  },

  eq: {
    id: "eq",
    label: "EQ",
    isPlaceholder: false,
    /** Warm body + light presence — avoids the thin/crispy phone-mic top end. */
    create(ctx) {
      const input = ctx.createGain();
      const hp = ctx.createBiquadFilter();
      hp.type = "highpass";
      hp.frequency.value = 65;
      hp.Q.value = 0.65;
      const warmth = ctx.createBiquadFilter();
      warmth.type = "lowshelf";
      warmth.frequency.value = 220;
      warmth.gain.value = 2;
      const presence = ctx.createBiquadFilter();
      presence.type = "peaking";
      presence.frequency.value = 2800;
      presence.Q.value = 0.85;
      presence.gain.value = 1;
      const airCut = ctx.createBiquadFilter();
      airCut.type = "highshelf";
      airCut.frequency.value = 6500;
      airCut.gain.value = -1.5;
      input.connect(hp).connect(warmth).connect(presence).connect(airCut);
      return { input, output: airCut, update: () => {} };
    },
  },

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
      // Centre the mic across both ears (see _centerNode), then limit so the
      // hot makeup gain stays loud without clipping in the headphones.
      const center = this._centerNode(this.ctx);
      const limiter = this._makeLimiter(this.ctx);
      chain.output.connect(center.input);
      center.output.connect(monitorGain).connect(limiter).connect(this.ctx.destination);
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
    let alignSec = Math.max(0, this._guideCtxStart - this._recCtxStart);

    let buffer = null;
    try {
      const arr = await blob.arrayBuffer();
      if (arr.byteLength > 0) {
        buffer = await this.ctx.decodeAudioData(arr.slice(0));
        buffer = normalizeTakeBuffer(buffer, 0.76);
        const trimmed = trimBufferLeadIn(this.ctx, buffer, alignSec);
        buffer = trimmed.buffer;
        alignSec = trimmed.alignSec;
      }
    } catch {
      buffer = null; // decode failed — blob kept so a retry can recover
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

  /** Decode a take's blob into buffer if missing (e.g. after a partial stop failure). */
  async hydrateTakeBuffer(take) {
    if (!take || take.buffer || !take.blob?.size) return !!take?.buffer;
    await this.ensureReady();
    try {
      const arr = await take.blob.arrayBuffer();
      if (!arr.byteLength) return false;
      let buffer = await this.ctx.decodeAudioData(arr.slice(0));
      buffer = normalizeTakeBuffer(buffer, 0.76);
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
    const sr = t.buffer.sampleRate;
    const a = Math.max(0, Math.min(Number(startSec) || 0, t.buffer.duration));
    const b = Math.max(a + 0.05, Math.min(Number(endSec) || t.buffer.duration, t.buffer.duration));
    const sliced = sliceBuffer(this.ctx, t.buffer, a, b);
    if (!sliced) return false;
    t.alignSec = Math.max(0, (t.alignSec || 0) - a);
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
    if (b <= (t.alignSec || 0)) t.alignSec = Math.max(0, (t.alignSec || 0) - (b - a));
    else if (a < (t.alignSec || 0)) t.alignSec = a;
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
    t.buffer = partA;
    t.blob = bufferToWavBlob(partA);
    const newTake = {
      id: `take_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      blob: bufferToWavBlob(partB),
      buffer: partB,
      createdAt: Date.now(),
      nudgeMs: t.nudgeMs || 0,
      alignSec: (t.alignSec || 0) + at,
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
    musicGain.gain.value = solo === "voice" ? 0 : clamp01(params.musicVol ?? 0.8);
    guideSrc.connect(musicGain).connect(master);
    guideSrc.start(startAt, fromSec);
    this._nodes.push(guideSrc, musicGain);
    this._mix.musicGain = musicGain;

    // Voice (take) through the effect chain, centred across both ears.
    if (take && take.buffer && solo !== "music") {
      const voiceSrc = this.ctx.createBufferSource();
      voiceSrc.buffer = take.buffer;
      const chain = this._buildVoiceChain(this.ctx, { reverb: params.reverb });
      const voiceGain = this.ctx.createGain();
      voiceGain.gain.value = clamp01(params.voiceVol ?? 0.95) * VOICE_MAKEUP;
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
    const solo = params.solo || "";
    if (mix.musicGain) mix.musicGain.gain.value = solo === "voice" ? 0 : clamp01(params.musicVol ?? 0.8);
    if (mix.voiceGain) mix.voiceGain.gain.value = solo === "music" ? 0 : clamp01(params.voiceVol ?? 0.95) * VOICE_MAKEUP;
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
    const limiter = this._makeLimiter(off);
    master.connect(limiter).connect(off.destination);

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
      voiceGain.gain.value = clamp01(params.voiceVol ?? 0.95) * VOICE_MAKEUP;
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

    // Peak-normalise so every export lands at a consistent, loud level
    // (-0.3 dBFS) regardless of how quiet the raw take was. The limiter already
    // tamed transients, so this just maps the surviving peak up to the ceiling.
    let peak = 0;
    for (const ch of chans) {
      for (let i = 0; i < ch.length; i++) { const a = Math.abs(ch[i]); if (a > peak) peak = a; }
    }
    if (peak > 0) {
      const gain = Math.min(0.97 / peak, 8);
      if (Math.abs(gain - 1) > 0.01) {
        for (const ch of chans) for (let i = 0; i < ch.length; i++) ch[i] *= gain;
      }
    }

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

    // Same compression + EQ as the mix chain so monitoring matches export loudness.
    let tail = input;
    for (const id of ["compression", "eq"]) {
      const def = EFFECT_REGISTRY[id];
      if (!def?.create) continue;
      const node = def.create(ctx);
      tail.connect(node.input);
      tail = node.output;
      nodes.push(node.input, node.output);
    }

    const dry = ctx.createGain();
    dry.gain.value = 1;
    tail.connect(dry).connect(output);
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
      tail.connect(delay);
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
    const order = ["compression", "eq", "reverb"];
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

function normalizeTakeBuffer(buffer, targetPeak = 0.76) {
  if (!buffer) return buffer;
  const ch0 = buffer.getChannelData(0);
  let peak = 0;
  for (let i = 0; i < ch0.length; i++) peak = Math.max(peak, Math.abs(ch0[i]));
  if (peak < 0.008) return buffer;
  const g = Math.min(targetPeak / peak, 8);
  if (g <= 1.04) return buffer;
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

function bufferToWavBlob(buffer) {
  if (!buffer) return new Blob();
  const chans = buffer.numberOfChannels >= 2
    ? [buffer.getChannelData(0), buffer.getChannelData(1)]
    : [buffer.getChannelData(0), buffer.getChannelData(0)];
  return encodeWav16(chans, buffer.sampleRate);
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
