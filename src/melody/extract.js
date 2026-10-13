import { pitchPointsToMelody } from "./postprocess.js";

/**
 * Decode a recorded hum and turn it into quantized melody notes.
 * @param {Blob|File} blob
 * @returns {Promise<import("./postprocess.js").Melody>}
 */
export async function extractMelodyFromBlob(blob) {
  if (!blob || !blob.size) return { tempoBpm: 96, meter: "4/4", notes: [] };
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) return { tempoBpm: 96, meter: "4/4", notes: [] };
  const ac = new AudioCtx();
  try {
    const audio = await ac.decodeAudioData((await blob.arrayBuffer()).slice(0));
    return extractMelodyFromAudioBuffer(audio);
  } catch {
    return { tempoBpm: 96, meter: "4/4", notes: [] };
  } finally {
    try { await ac.close(); } catch {}
  }
}

export function extractMelodyFromAudioBuffer(audioBuffer, opts = {}) {
  const sampleRate = Number(audioBuffer?.sampleRate) || 44100;
  const channel = audioBuffer?.getChannelData?.(0);
  if (!channel?.length) return { tempoBpm: 96, meter: "4/4", notes: [] };
  const hop = 1024;
  const win = 2048;
  const points = [];
  const buf = new Float32Array(win);
  const maxSamples = Math.min(channel.length, Math.floor(sampleRate * 45));
  for (let i = 0; i + win <= maxSamples; i += hop) {
    buf.set(channel.subarray(i, i + win));
    const rms = calcRms(buf);
    const f0 = rms > 0.008 ? autoCorrelatePitch(new Float32Array(buf), sampleRate) : 0;
    if (f0) points.push({ tSec: i / sampleRate, f0Hz: f0 });
  }
  return pitchPointsToMelody(points, {
    bpm: opts.bpm || 96,
    meter: "4/4",
    maxSeconds: Math.min(45, Number(audioBuffer.duration) || 45),
    autoTempo: true,
  });
}

/**
 * @typedef {{ tSec:number, f0Hz:number }} PitchPoint
 * @typedef {import("./postprocess.js").Melody} Melody
 *
 * @typedef {{
 *   maxSeconds: number,
 *   bpm: number,
 *   meter: import("../types.js").Meter,
 *   onProgress?: (p:number)=>void,
 *   onPartial?: (m:Melody)=>void,
 *   onDone?: (m:Melody)=>void,
 *   onMicReady?: ()=>void,
 *   onMicDenied?: (err:unknown)=>void
 * }} RecordOpts
 */

/**
 * Record mic audio and convert hum to a quantized melody.
 * Returns a Promise that resolves **synchronously** (microtask) with `{ stop }` so the UI is never blocked
 * while the browser shows the mic permission dialog.
 *
 * @param {RecordOpts} opts
 * @returns {Promise<{ stop: () => void }>}
 */
export function recordHumToMelody(opts) {
  const maxSeconds = clampNum(opts.maxSeconds, 1, 120, 60);
  const bpm = clampNum(opts.bpm, 40, 220, 96);
  const meter = opts.meter === "6/8" ? "6/8" : "4/4";

  /** @type {PitchPoint[]} */
  const points = [];

  /** @type {Promise<{ stop: () => void }>} */
  let resolveSession;
  const sessionPromise = new Promise((resolve) => {
    resolveSession = resolve;
  });

  let stopped = false;
  let raf = 0;
  let lastPartial = 0;
  let startT = 0;

  /** @type {MediaStream | null} */
  let stream = null;
  /** @type {AudioContext | null} */
  let ctx = null;
  /** @type {Float32Array} */
  let timeData = new Float32Array(2048);
  /** @type {AnalyserNode | null} */
  let analyser = null;

  const stop = () => {
    if (stopped) return;
    stopped = true;
    try {
      cancelAnimationFrame(raf);
    } catch {}
    try {
      if (stream) for (const tr of stream.getTracks()) tr.stop();
    } catch {}
    try {
      if (ctx) ctx.close();
    } catch {}

    const melody = pitchPointsToMelody(points, {
      bpm,
      meter,
      maxSeconds,
      autoTempo: opts.autoTempo !== false,
    });
    if (opts.onDone) opts.onDone(melody);
  };

  const tick = () => {
    if (stopped) return;
    if (!ctx || !analyser) {
      raf = requestAnimationFrame(tick);
      return;
    }

    const t = ctx.currentTime - startT;
    if (t >= maxSeconds) {
      stop();
      return;
    }

    analyser.getFloatTimeDomainData(timeData);
    const rms = calcRms(timeData);
    const f0 = rms > 0.008 ? autoCorrelatePitch(new Float32Array(timeData), ctx.sampleRate) : 0;
    if (f0 && Number.isFinite(f0)) {
      points.push({ tSec: t, f0Hz: f0 });
    }

    if (opts.onProgress) opts.onProgress(Math.max(0, Math.min(1, t / maxSeconds)));

    if (opts.onPartial && t - lastPartial >= 0.5 && points.length > 20) {
      lastPartial = t;
      try {
        const partial = pitchPointsToMelody(points, { bpm, meter, maxSeconds });
        opts.onPartial(partial);
      } catch {
        // ignore partial errors
      }
    }

    raf = requestAnimationFrame(tick);
  };

  void (async () => {
    try {
      const humCapture = opts.captureProfile === "hum";
      stream = await navigator.mediaDevices.getUserMedia({
        audio: humCapture
          ? {
              echoCancellation: false,
              noiseSuppression: false,
              autoGainControl: false,
            }
          : {
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true,
            },
        video: false,
      });

      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      ctx = new AudioCtx();
      startT = ctx.currentTime;

      const source = ctx.createMediaStreamSource(stream);

      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 1800;

      analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0.0;

      source.connect(lp);
      lp.connect(analyser);

      timeData = new Float32Array(analyser.fftSize);

      if (opts.onMicReady) opts.onMicReady();

      raf = requestAnimationFrame(tick);
    } catch (err) {
      if (opts.onMicDenied) opts.onMicDenied(err);
      if (opts.onDone) {
        opts.onDone({ tempoBpm: bpm, meter, notes: [] });
      }
    }
  })();

  resolveSession({ stop });

  return sessionPromise;
}

function calcRms(buf) {
  let s = 0;
  for (let i = 0; i < buf.length; i++) s += buf[i] * buf[i];
  return Math.sqrt(s / buf.length);
}

/**
 * @param {Float32Array} buf
 * @param {number} sampleRate
 * @returns {number} f0Hz or 0
 */
function autoCorrelatePitch(buf, sampleRate) {
  let mean = 0;
  for (let i = 0; i < buf.length; i++) mean += buf[i];
  mean /= buf.length;
  const x = buf;
  for (let i = 0; i < x.length; i++) x[i] = x[i] - mean;

  const minHz = 80;
  const maxHz = 600;
  const minLag = Math.floor(sampleRate / maxHz);
  const maxLag = Math.floor(sampleRate / minHz);

  let bestLag = 0;
  let best = 0;
  for (let lag = minLag; lag <= maxLag; lag++) {
    let sum = 0;
    for (let i = 0; i < x.length - lag; i++) {
      sum += x[i] * x[i + lag];
    }
    if (sum > best) {
      best = sum;
      bestLag = lag;
    }
  }
  if (!bestLag) return 0;

  const y0 = corrAtLag(x, bestLag - 1);
  const y1 = corrAtLag(x, bestLag);
  const y2 = corrAtLag(x, bestLag + 1);
  const denom = 2 * (2 * y1 - y0 - y2);
  const shift = denom !== 0 ? (y0 - y2) / denom : 0;
  const lagAdj = bestLag + shift;

  const f0 = sampleRate / lagAdj;
  if (!Number.isFinite(f0) || f0 < minHz || f0 > maxHz) return 0;
  return f0;
}

function corrAtLag(x, lag) {
  if (lag <= 0) return 0;
  let sum = 0;
  for (let i = 0; i < x.length - lag; i++) sum += x[i] * x[i + lag];
  return sum;
}

function clampNum(n, min, max, fallback) {
  const x = Number.isFinite(Number(n)) ? Number(n) : fallback;
  return Math.max(min, Math.min(max, x));
}
