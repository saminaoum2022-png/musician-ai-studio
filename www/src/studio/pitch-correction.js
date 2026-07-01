/**
 * Studio Pitch Correction — modular Auto-Tune-style preview (Review / Mix only).
 * Does not touch recording, mix DSP, or export chains.
 */

import { scaleIntervals, midiToFreq } from "../theory.js";

const ROOT_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const ENHARMONIC = Object.freeze({
  DB: "C#", EB: "D#", GB: "F#", AB: "G#", BB: "A#", CB: "B", FB: "E",
  Db: "C#", Eb: "D#", Gb: "F#", Ab: "G#", Bb: "A#", Cb: "B", Fb: "E",
});

/** Map legacy preset ids from earlier builds. */
const LEGACY_PRESET_MAP = Object.freeze({
  trap: "hardtune",
  studio: "balanced",
});

/** @typedef {'medium'|'medium-high'|'high'} PitchTracking */
/** @typedef {'slow'|'medium'|'fast'|'instant'} NoteTransition */
/** @typedef {'on'|'slight'|'off'} VibratoPreserve */

/**
 * @typedef {object} PitchPreset
 * @property {string} id
 * @property {string} label
 * @property {number} retuneMs
 * @property {number} humanize 0–1
 * @property {number} flexTune 0–1 (0 = off)
 * @property {PitchTracking} tracking
 * @property {NoteTransition} noteTransition
 * @property {VibratoPreserve} vibratoPreserve
 * @property {number} pitchDriftIgnore cents
 * @property {number} maxCents
 * @property {number} wet
 * @property {boolean} useScale
 * @property {number} correctionStrength
 * @property {number} lockHoldMs
 * @property {boolean} formantPreserve
 */

/** @type {Record<string, PitchPreset>} */
export const PITCH_CORRECTION_PRESETS = Object.freeze({
  none: {
    id: "none",
    label: "Original",
    retuneMs: 0,
    humanize: 1,
    flexTune: 1,
    tracking: "medium",
    noteTransition: "slow",
    vibratoPreserve: "on",
    pitchDriftIgnore: 99,
    maxCents: 0,
    wet: 0,
    useScale: false,
    correctionStrength: 0,
    lockHoldMs: 0,
    formantPreserve: true,
  },
  natural: {
    id: "natural",
    label: "Natural",
    retuneMs: 55,
    humanize: 0.90,
    flexTune: 0.60,
    tracking: "medium",
    noteTransition: "slow",
    vibratoPreserve: "on",
    pitchDriftIgnore: 25,
    maxCents: 38,
    wet: 0.50,
    useScale: true,
    correctionStrength: 0.45,
    lockHoldMs: 95,
    formantPreserve: true,
  },
  balanced: {
    id: "balanced",
    label: "Balanced",
    retuneMs: 35,
    humanize: 0.65,
    flexTune: 0.35,
    tracking: "medium",
    noteTransition: "medium",
    vibratoPreserve: "on",
    pitchDriftIgnore: 18,
    maxCents: 58,
    wet: 0.64,
    useScale: true,
    correctionStrength: 0.66,
    lockHoldMs: 68,
    formantPreserve: true,
  },
  pop: {
    id: "pop",
    label: "Pop",
    retuneMs: 20,
    humanize: 0.35,
    flexTune: 0.15,
    tracking: "medium-high",
    noteTransition: "fast",
    vibratoPreserve: "slight",
    pitchDriftIgnore: 10,
    maxCents: 82,
    wet: 0.82,
    useScale: true,
    correctionStrength: 0.84,
    lockHoldMs: 42,
    formantPreserve: true,
  },
  hardtune: {
    id: "hardtune",
    label: "Hard Tune",
    retuneMs: 5,
    humanize: 0,
    flexTune: 0,
    tracking: "high",
    noteTransition: "instant",
    vibratoPreserve: "off",
    pitchDriftIgnore: 0,
    maxCents: 180,
    wet: 0.96,
    useScale: false,
    correctionStrength: 1,
    lockHoldMs: 12,
    formantPreserve: true,
  },
});

export const PITCH_PRESET_IDS = Object.freeze(["none", "natural", "balanced", "pop", "hardtune"]);
export const PITCH_PRESET_DEFAULT = "balanced";
/** Bump when pitch engine changes so cached renders are invalidated. */
const PITCH_ENGINE_VERSION = 9;

export function normalizePitchPresetId(id) {
  if (!id) return PITCH_PRESET_DEFAULT;
  if (PITCH_CORRECTION_PRESETS[id]) return id;
  return LEGACY_PRESET_MAP[id] || PITCH_PRESET_DEFAULT;
}

function hannWindow(size) {
  const w = new Float32Array(size);
  for (let i = 0; i < size; i++) {
    w[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / Math.max(1, size - 1)));
  }
  return w;
}

function medianOf(arr) {
  const a = arr.filter((x) => Number.isFinite(x) && x > 0).sort((x, y) => x - y);
  if (!a.length) return 0;
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

function hzToMidi(hz) {
  return 69 + 12 * Math.log2(hz / 440);
}

function getPitchRenderContext(sampleRate, opts = {}) {
  const live = opts.audioContext;
  if (live && live.state !== "closed" && typeof live.createBuffer === "function") {
    return live;
  }
  const Offline = typeof OfflineAudioContext !== "undefined"
    ? OfflineAudioContext
    : (typeof webkitOfflineAudioContext !== "undefined" ? webkitOfflineAudioContext : null);
  if (Offline) {
    return new Offline(1, Math.max(1, Math.ceil(sampleRate * 0.25)), sampleRate);
  }
  if (live) return live;
  const Live = typeof AudioContext !== "undefined"
    ? AudioContext
    : (typeof webkitAudioContext !== "undefined" ? webkitAudioContext : null);
  if (Live) return new Live();
  throw new Error("no audio context");
}

function createMonoBufferFromFloat32(corrected, sr, opts = {}) {
  const len = corrected.length;
  const ctx = getPitchRenderContext(sr, opts);
  const ctxSr = ctx.sampleRate || sr;
  let buf;
  try {
    buf = ctx.createBuffer(1, len, ctxSr === sr ? sr : ctxSr);
  } catch {
    const Offline = typeof OfflineAudioContext !== "undefined"
      ? OfflineAudioContext
      : (typeof webkitOfflineAudioContext !== "undefined" ? webkitOfflineAudioContext : null);
    if (!Offline) throw new Error("createBuffer failed");
    const off = new Offline(1, len, sr);
    buf = off.createBuffer(1, len, sr);
  }
  const ch = buf.getChannelData(0);
  if (ctxSr === sr) {
    ch.set(corrected);
  } else {
    const ratio = sr / ctxSr;
    for (let i = 0; i < ch.length; i++) {
      const src = i * ratio;
      const i0 = Math.floor(src);
      const i1 = Math.min(len - 1, i0 + 1);
      const t = src - i0;
      ch[i] = corrected[i0] * (1 - t) + corrected[i1] * t;
    }
  }
  return buf;
}

function yieldToUi() {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame === "function") requestAnimationFrame(() => resolve());
    else setTimeout(resolve, 0);
  });
}

function parseTrackKey(str) {
  const raw = String(str || "").trim();
  if (!raw) return null;
  let m = raw.match(/^([A-Ga-g][#b♭]?)(?:\s*|-)?(maj|major|min|minor|m)?$/i);
  if (!m) m = raw.match(/^([A-Ga-g])\s*(#|b|♭)?\s*(maj|major|min|minor|m)?$/i);
  if (!m) return null;
  let name = m[1].toUpperCase() + (m[2] || "").replace("♭", "b");
  name = ENHARMONIC[name] || name;
  const idx = ROOT_NAMES.indexOf(name);
  if (idx < 0) return null;
  const minorToken = m[3] || "";
  const minor = /min|minor|^m$/i.test(minorToken) || /^m$/i.test(raw.slice(name.length));
  return { root: idx, scale: minor ? "natural_minor" : "major", rootName: ROOT_NAMES[idx], confidence: 1 };
}

/** Studio pitch tracker — relaxed vs echo-pitch-stabilize for quiet iOS vocals. */
function estimatePitchForStudio(samples, sampleRate, minHz = 65, maxHz = 560) {
  const n = samples.length;
  if (n < 256) return 0;
  const minLag = Math.floor(sampleRate / maxHz);
  const maxLag = Math.min(Math.floor(sampleRate / minHz), n - 2);
  let bestLag = 0;
  let bestCorr = 0;
  for (let lag = minLag; lag <= maxLag; lag++) {
    let sum = 0;
    let e0 = 0;
    let e1 = 0;
    const lim = n - lag;
    for (let i = 0; i < lim; i++) {
      const a = samples[i];
      const b = samples[i + lag];
      sum += a * b;
      e0 += a * a;
      e1 += b * b;
    }
    const corr = sum / (Math.sqrt(e0 * e1) + 1e-9);
    if (corr > bestCorr) {
      bestCorr = corr;
      bestLag = lag;
    }
  }
  if (bestCorr < 0.18 || !bestLag) return 0;
  return sampleRate / bestLag;
}

function toMonoFloat32(ch0, ch1) {
  const mono = new Float32Array(ch0.length);
  for (let i = 0; i < ch0.length; i++) {
    mono[i] = ch1 ? (ch0[i] + ch1[i]) * 0.5 : ch0[i];
  }
  return mono;
}

/** Peak-normalize a copy for pitch tracking only — never use for audible output. */
function peakNormalizeCopyForAnalysis(mono, targetPeak = 0.85) {
  let peak = 0;
  for (let i = 0; i < mono.length; i++) peak = Math.max(peak, Math.abs(mono[i]));
  if (peak <= 1e-6 || peak >= targetPeak) return mono.slice();
  const out = mono.slice();
  const gain = targetPeak / peak;
  for (let i = 0; i < out.length; i++) out[i] *= gain;
  return out;
}

/** Keep corrected vocal at the same peak level as the raw take (A/B-safe). */
function matchPeakToReference(corrected, referenceMono) {
  let refPeak = 0;
  let outPeak = 0;
  for (let i = 0; i < referenceMono.length; i++) refPeak = Math.max(refPeak, Math.abs(referenceMono[i]));
  for (let i = 0; i < corrected.length; i++) outPeak = Math.max(outPeak, Math.abs(corrected[i]));
  if (refPeak <= 1e-6 || outPeak <= 1e-6) return corrected;
  const gain = refPeak / outPeak;
  if (gain > 0.97 && gain < 1.03) return corrected;
  const out = corrected.slice();
  const g = clamp(gain, 0.25, 4);
  for (let i = 0; i < out.length; i++) out[i] *= g;
  return out;
}

function prepareMonoForPitchAnalysis(ch0, ch1) {
  return peakNormalizeCopyForAnalysis(toMonoFloat32(ch0, ch1));
}

function resolveKeyInfo(mono, sr, opts = {}) {
  const trackKey = parseTrackKey(opts.trackKey);
  let keyInfo = opts.keyInfo || detectMusicalKey(mono, sr);
  if (trackKey) {
    keyInfo = { ...trackKey, confidence: Math.max(keyInfo?.confidence ?? 0, 0.88) };
  } else if (keyInfo && !keyInfo.rootName) {
    keyInfo.rootName = ROOT_NAMES[keyInfo.root ?? 0];
  }
  return keyInfo;
}

/** Detect key from voiced pitch-class histogram. */
export function detectMusicalKey(channel, sampleRate) {
  const chroma = new Float32Array(12);
  const win = Math.floor(sampleRate * 0.06);
  const hop = Math.floor(win * 0.5);
  let voiced = 0;
  for (let i = 0; i + win < channel.length; i += hop) {
    const hz = estimatePitchForStudio(channel.subarray(i, i + win), sampleRate);
    if (hz < 80) continue;
    voiced += 1;
    const pc = ((Math.round(hzToMidi(hz)) % 12) + 12) % 12;
    chroma[pc] += 1;
  }
  if (voiced < 6) return { root: 0, scale: "major", rootName: "C", confidence: 0 };

  let best = { root: 0, scale: "major", score: -1 };
  for (let root = 0; root < 12; root++) {
    for (const scale of ["major", "natural_minor"]) {
      const intervals = scaleIntervals(scale);
      let score = 0;
      for (const iv of intervals) score += chroma[(root + iv) % 12];
      if (score > best.score) best = { root, scale, score };
    }
  }
  return {
    root: best.root,
    scale: best.scale,
    rootName: ROOT_NAMES[best.root],
    confidence: best.score / Math.max(1, voiced),
  };
}

function quantizeToScaleMidi(midi, keyInfo) {
  const root = keyInfo?.root ?? 0;
  const intervals = scaleIntervals(keyInfo?.scale || "major");
  const rel = ((midi - root) % 12 + 12) % 12;
  let bestIv = intervals[0];
  let bestDist = 99;
  for (const iv of intervals) {
    const d = Math.abs(rel - iv);
    const wrap = Math.min(d, 12 - d);
    if (wrap < bestDist) { bestDist = wrap; bestIv = iv; }
  }
  const octave = Math.floor((midi - root) / 12);
  return root + octave * 12 + bestIv;
}

function quantizeMidi(midi, preset, keyInfo) {
  const useScale = preset.useScale && (keyInfo?.confidence ?? 0) > 0.38;
  return useScale ? quantizeToScaleMidi(midi, keyInfo) : Math.round(midi);
}

function analysisWindowSec(preset) {
  if (preset.tracking === "high") return 0.040;
  if (preset.tracking === "medium-high") return 0.048;
  return 0.055;
}

function trackingSmoothCents(preset) {
  if (preset.tracking === "high") return 22;
  if (preset.tracking === "medium-high") return 16;
  return 11;
}

function retuneStepCents(preset, hop, sr) {
  const frameMs = (hop / sr) * 1000;
  return (1200 / Math.max(4, preset.retuneMs)) * frameMs;
}

function noteSwitchFrames(preset, hop, sr) {
  const ms = preset.lockHoldMs;
  return Math.max(2, Math.round((ms / 1000) * sr / hop));
}

function smoothF0Track(f0s, maxCentsStep, passes = 3) {
  const out = f0s.slice();
  const globalMed = medianOf(f0s);
  for (let pass = 0; pass < passes; pass++) {
    for (let i = 0; i < out.length; i++) {
      if (out[i] < 80) continue;
      const local = medianOf(f0s.slice(Math.max(0, i - 3), Math.min(f0s.length, i + 4))) || globalMed;
      if (!local) continue;
      const cents = 1200 * Math.log2(local / out[i]);
      out[i] = out[i] * 2 ** (clamp(cents, -maxCentsStep, maxCentsStep) / 1200);
    }
    for (let i = 1; i < out.length; i++) {
      if (out[i] < 80 || out[i - 1] < 80) continue;
      const cents = 1200 * Math.log2(out[i] / out[i - 1]);
      if (Math.abs(cents) > maxCentsStep) {
        out[i] = out[i - 1] * 2 ** ((Math.sign(cents) * maxCentsStep) / 1200);
      }
    }
  }
  return out;
}

function voicedEnergy(samples) {
  let sum = 0;
  for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i];
  return Math.sqrt(sum / Math.max(1, samples.length));
}

function trackPitchFrames(mono, sr, preset) {
  if (!mono?.length || mono.length < 1024) {
    return { f0s: new Float32Array(0), voiced: new Float32Array(0), hop: 512, winSize: 2048, nGrains: 0 };
  }
  const winSize = Math.max(2048, Math.floor(sr * analysisWindowSec(preset)));
  const hop = Math.floor(winSize * 0.5);
  if (mono.length < winSize + hop) {
    return { f0s: new Float32Array(0), voiced: new Float32Array(0), hop, winSize, nGrains: 0 };
  }
  const nGrains = Math.max(1, Math.floor((mono.length - winSize) / hop));
  const f0s = new Float32Array(nGrains);
  const voiced = new Float32Array(nGrains);

  for (let g = 0; g < nGrains; g++) {
    const pos = g * hop;
    const slice = mono.subarray(pos, pos + winSize);
    const rms = voicedEnergy(slice);
    const hz = estimatePitchForStudio(slice, sr);
    if (hz > 65 && rms > 0.0006) {
      f0s[g] = hz;
      voiced[g] = 1;
    }
  }

  const smoothed = smoothF0Track(Array.from(f0s), trackingSmoothCents(preset), preset.tracking === "high" ? 2 : 3);
  for (let i = 0; i < nGrains; i++) {
    if (voiced[i]) f0s[i] = smoothed[i];
  }
  return { f0s, voiced, hop, winSize, nGrains };
}

/** Shared Micro Pitch Filter — runs before Auto-Tune for every preset. */
const MICRO_PITCH_FILTER = Object.freeze({
  microIgnoreCents: 25,
  lockStabilityMs: 70,
  expressionLpMs: 95,
  noteCenterMs: 115,
  vibratoRateMinHz: 3.5,
  vibratoRateMaxHz: 9,
  vibratoDepthMinCents: 18,
  vibratoDepthMaxCents: 95,
  portamentoMinMs: 35,
  portamentoMaxCents: 180,
  ornamentMaxMs: 130,
  slideRateCentsPerMs: 6,
});

/** @typedef {object} MicroPitchFilterResult
 * @property {Float32Array} expressionMidi slow contour for note detection
 * @property {Float32Array} noteCenterMidi very slow center for lock decisions
 * @property {Float32Array} correctable 0–1 mask (1 = sustained, safe to correct)
 * @property {Float32Array} microCents deviation from expression contour
 * @property {Uint8Array} vibrato expressive vibrato detected
 * @property {Uint8Array} portamento slide between notes
 * @property {Uint8Array} ornament short bends / melisma
 */

function framesForMs(ms, hop, sr) {
  return Math.max(2, Math.round((ms / 1000) * sr / hop));
}

function averageInWindow(arr, i, radius) {
  let sum = 0;
  let count = 0;
  for (let j = Math.max(0, i - radius); j <= Math.min(arr.length - 1, i + radius); j++) {
    sum += arr[j];
    count += 1;
  }
  return count ? sum / count : 0;
}

function isStableQuantNote(expressionMidi, voiced, i, lockFrames, quantNote) {
  if (lockFrames < 1 || !Number.isFinite(quantNote)) return false;
  let hits = 0;
  let total = 0;
  for (let j = Math.max(0, i - lockFrames + 1); j <= i; j++) {
    if (!voiced[j] || !Number.isFinite(expressionMidi[j])) continue;
    total += 1;
    if (Math.abs(expressionMidi[j] - quantNote) < 0.22) hits += 1;
  }
  if (total < Math.max(2, Math.floor(lockFrames * 0.7))) return false;
  return hits / total >= 0.82;
}

/** Detect periodic micro-oscillation (natural vibrato). */
function detectVibratoMask(microCents, voiced, hop, sr) {
  const n = microCents.length;
  const mask = new Uint8Array(n);
  const winFrames = framesForMs(85, hop, sr);
  const frameMs = (hop / sr) * 1000;

  for (let i = winFrames; i < n; i++) {
    if (!voiced[i]) continue;
    let crossings = 0;
    let prev = 0;
    let hadPrev = false;
    let peak = 0;
    let trough = 0;
    let active = 0;
    for (let j = i - winFrames; j <= i; j++) {
      if (!voiced[j]) continue;
      const v = microCents[j];
      active += 1;
      peak = Math.max(peak, v);
      trough = Math.min(trough, v);
      if (hadPrev && Math.sign(v) !== Math.sign(prev) && Math.abs(v) > 6 && Math.abs(prev) > 6) {
        crossings += 1;
      }
      prev = v;
      hadPrev = true;
    }
    if (active < winFrames * 0.55) continue;
    const depth = peak - trough;
    const rateHz = crossings / (winFrames * frameMs / 1000) * 0.5;
    if (
      rateHz >= MICRO_PITCH_FILTER.vibratoRateMinHz
      && rateHz <= MICRO_PITCH_FILTER.vibratoRateMaxHz
      && depth >= MICRO_PITCH_FILTER.vibratoDepthMinCents
      && depth <= MICRO_PITCH_FILTER.vibratoDepthMaxCents
    ) {
      mask[i] = 1;
    }
  }
  return mask;
}

/** Detect sustained pitch slides (portamento) — do not treat as new notes. */
function detectPortamentoMask(expressionMidi, voiced, hop, sr) {
  const n = expressionMidi.length;
  const mask = new Uint8Array(n);
  const minFrames = framesForMs(MICRO_PITCH_FILTER.portamentoMinMs, hop, sr);

  for (let i = minFrames; i < n; i++) {
    if (!voiced[i] || !Number.isFinite(expressionMidi[i])) continue;
    let dir = 0;
    let consistent = 0;
    let totalCents = 0;
    let prev = expressionMidi[i - 1];
    if (!Number.isFinite(prev)) continue;

    for (let j = i - minFrames + 1; j <= i; j++) {
      if (!voiced[j] || !Number.isFinite(expressionMidi[j]) || !Number.isFinite(expressionMidi[j - 1])) continue;
      const stepCents = 1200 * Math.log2(midiToFreq(expressionMidi[j]) / midiToFreq(expressionMidi[j - 1]));
      const stepDir = Math.sign(stepCents);
      if (Math.abs(stepCents) < 2) continue;
      if (dir === 0) dir = stepDir;
      if (stepDir === dir) {
        consistent += 1;
        totalCents += Math.abs(stepCents);
      }
    }
    const frameMs = (hop / sr) * 1000;
    const durMs = minFrames * frameMs;
    const rate = totalCents / Math.max(1, durMs);
    if (
      consistent >= minFrames * 0.55
      && totalCents >= MICRO_PITCH_FILTER.microIgnoreCents
      && totalCents <= MICRO_PITCH_FILTER.portamentoMaxCents
      && rate >= MICRO_PITCH_FILTER.slideRateCentsPerMs * 0.45
      && rate <= MICRO_PITCH_FILTER.slideRateCentsPerMs * 4.5
    ) {
      mask[i] = 1;
    }
  }
  return mask;
}

/** Short expressive bends / ornament (incl. Arabic melisma) — transient, not a new target. */
function detectOrnamentMask(microCents, expressionMidi, voiced, hop, sr) {
  const n = microCents.length;
  const mask = new Uint8Array(n);
  const maxFrames = framesForMs(MICRO_PITCH_FILTER.ornamentMaxMs, hop, sr);

  for (let i = 2; i < n; i++) {
    if (!voiced[i]) continue;
    let peakAbs = 0;
    let active = 0;
    for (let j = Math.max(0, i - maxFrames); j <= i; j++) {
      if (!voiced[j]) continue;
      active += 1;
      peakAbs = Math.max(peakAbs, Math.abs(microCents[j]));
    }
    if (active < 2) continue;
    const returning = Math.abs(microCents[i]) < MICRO_PITCH_FILTER.microIgnoreCents * 0.85;
    const bent = peakAbs >= MICRO_PITCH_FILTER.microIgnoreCents * 1.1
      && peakAbs <= MICRO_PITCH_FILTER.portamentoMaxCents * 0.75;
    const centerStable = Number.isFinite(expressionMidi[i])
      && isStableQuantNote(expressionMidi, voiced, i, Math.min(maxFrames, 3), Math.round(expressionMidi[i]));
    if (bent && (returning || centerStable)) mask[i] = 1;
  }
  return mask;
}

/**
 * Micro Pitch Filter (Expression Protection) — stage 1, before Auto-Tune.
 * Stabilises pitch detection and marks expressive regions as non-correctable.
 * @returns {MicroPitchFilterResult}
 */
function applyMicroPitchFilter(f0s, voiced, hop, sr) {
  const n = f0s.length;
  const rawMidi = new Float32Array(n);
  const expressionMidi = new Float32Array(n);
  const noteCenterMidi = new Float32Array(n);
  const correctable = new Float32Array(n);
  const microCents = new Float32Array(n);

  for (let i = 0; i < n; i++) {
    rawMidi[i] = voiced[i] && f0s[i] > 80 ? hzToMidi(f0s[i]) : NaN;
  }

  const lpRadius = framesForMs(MICRO_PITCH_FILTER.expressionLpMs, hop, sr);
  const centerRadius = framesForMs(MICRO_PITCH_FILTER.noteCenterMs, hop, sr);

  for (let i = 0; i < n; i++) {
    if (!Number.isFinite(rawMidi[i])) {
      expressionMidi[i] = NaN;
      noteCenterMidi[i] = NaN;
      microCents[i] = 0;
      correctable[i] = 0;
      continue;
    }

    const lpVals = [];
    const centerVals = [];
    for (let j = Math.max(0, i - lpRadius); j <= Math.min(n - 1, i + lpRadius); j++) {
      if (Number.isFinite(rawMidi[j])) lpVals.push(rawMidi[j]);
    }
    for (let j = Math.max(0, i - centerRadius); j <= Math.min(n - 1, i + centerRadius); j++) {
      if (Number.isFinite(rawMidi[j])) centerVals.push(rawMidi[j]);
    }

    const expr = medianOf(lpVals) || rawMidi[i];
    const center = medianOf(centerVals) || expr;
    expressionMidi[i] = expr;
    noteCenterMidi[i] = center;
    const exprHz = midiToFreq(expr);
    const rawHz = midiToFreq(rawMidi[i]);
    microCents[i] = exprHz > 0 && rawHz > 0 ? 1200 * Math.log2(rawHz / exprHz) : 0;
  }

  const vibrato = detectVibratoMask(microCents, voiced, hop, sr);
  const portamento = detectPortamentoMask(expressionMidi, voiced, hop, sr);
  const ornament = detectOrnamentMask(microCents, expressionMidi, voiced, hop, sr);
  const lockFrames = framesForMs(MICRO_PITCH_FILTER.lockStabilityMs, hop, sr);

  for (let i = 0; i < n; i++) {
    if (!voiced[i] || !Number.isFinite(expressionMidi[i])) {
      correctable[i] = 0;
      continue;
    }

    let score = 1;

    const quant = Math.round(noteCenterMidi[i]);
    const stable = isStableQuantNote(noteCenterMidi, voiced, i, lockFrames, quant);

    if (vibrato[i] || portamento[i]) score = 0;
    else if (ornament[i]) score = Math.min(score, 0.15);
    else if (!stable) score *= 0.25;
    else if (Math.abs(microCents[i]) < MICRO_PITCH_FILTER.microIgnoreCents) score *= 0.72;

    const localCenterDev = Math.abs(noteCenterMidi[i] - expressionMidi[i]) * 100;
    if (localCenterDev > 28) score *= 0.35;

    correctable[i] = clamp(score, 0, 1);
  }

  return { expressionMidi, noteCenterMidi, correctable, microCents, vibrato, portamento, ornament };
}

/**
 * Note locking — stage 2. Uses filtered expression contour only.
 * Waits ~70 ms stability before first lock; avoids neighbour-note flicker.
 */
function buildLockedNotes(filter, voiced, preset, keyInfo, hop, sr) {
  const { expressionMidi, noteCenterMidi, correctable } = filter;
  const n = expressionMidi.length;
  const lockedMidi = new Float32Array(n);
  const lockFrames = framesForMs(MICRO_PITCH_FILTER.lockStabilityMs, hop, sr);
  const switchFrames = Math.max(lockFrames, noteSwitchFrames(preset, hop, sr));
  const switchMarginSemis = preset.id === "hardtune" ? 0.48 : preset.noteTransition === "fast" ? 0.68 : 0.82;

  let locked = NaN;
  let candidate = NaN;
  let candidateFrames = 0;

  for (let i = 0; i < n; i++) {
    if (!voiced[i] || !Number.isFinite(noteCenterMidi[i])) {
      lockedMidi[i] = Number.isFinite(locked) ? locked : NaN;
      candidateFrames = 0;
      continue;
    }

    const quant = quantizeMidi(noteCenterMidi[i], preset, keyInfo);

    if (!Number.isFinite(locked)) {
      const avgCorr = averageInWindow(correctable, i, lockFrames);
      if (isStableQuantNote(noteCenterMidi, voiced, i, lockFrames, quant) && avgCorr > 0.28) {
        locked = quant;
      }
      lockedMidi[i] = locked;
      continue;
    }

    if (quantizeMidi(noteCenterMidi[i], preset, keyInfo) === locked) {
      candidateFrames = 0;
      lockedMidi[i] = locked;
      continue;
    }

    const jump = Math.abs(quant - locked);
    if (jump < switchMarginSemis) {
      lockedMidi[i] = locked;
      continue;
    }

    if (candidate === quant) candidateFrames += 1;
    else { candidate = quant; candidateFrames = 1; }

    const avgCorr = averageInWindow(correctable, i, lockFrames);
    const stable = isStableQuantNote(noteCenterMidi, voiced, i, lockFrames, quant);

    if (candidateFrames >= switchFrames && stable && avgCorr > 0.32) {
      locked = candidate;
      candidateFrames = 0;
    }
    lockedMidi[i] = locked;
  }

  return { lockedMidi, slowMidi: expressionMidi };
}

function vibratoPassFactor(preset) {
  if (preset.vibratoPreserve === "off" || preset.humanize <= 0) return 0;
  if (preset.vibratoPreserve === "slight") return 0.35 + preset.humanize * 0.15;
  return 0.55 + preset.humanize * 0.35;
}

function buildCorrectionCents(f0s, voiced, lockedMidi, slowMidi, filter, preset, hop, sr) {
  const cents = new Float32Array(f0s.length);
  const { correctable, vibrato, portamento, ornament } = filter;
  const driftIgnore = preset.id === "hardtune" ? 2 : preset.pitchDriftIgnore;
  const flexOff = preset.flexTune <= 0.001;
  const flexCents = flexOff ? 0 : preset.flexTune * 42;
  const maxStep = retuneStepCents(preset, hop, sr);
  const vibPass = vibratoPassFactor(preset);
  const minCorrectable = preset.id === "hardtune" ? 0.08 : 0.18;
  let prevCorr = 0;

  for (let i = 0; i < f0s.length; i++) {
    if (!voiced[i] || f0s[i] < 80 || !Number.isFinite(lockedMidi[i])) {
      prevCorr *= 0.88;
      cents[i] = prevCorr;
      continue;
    }

    const raw = f0s[i];
    const targetHz = midiToFreq(lockedMidi[i]);
    let corr = 1200 * Math.log2(targetHz / raw);
    const expressProtected = vibrato[i] || portamento[i] || ornament[i];

    if (expressProtected) {
      corr = 0;
    } else if (correctable[i] < minCorrectable) {
      corr = 0;
    } else if (Math.abs(corr) < driftIgnore) {
      corr = 0;
    } else if (!flexOff && Math.abs(corr) < flexCents) {
      corr = 0;
    } else if (!flexOff) {
      const knee = flexCents + 10;
      if (Math.abs(corr) < knee) corr *= (Math.abs(corr) - flexCents) / 10;
    }

    if (vibPass > 0 && Number.isFinite(slowMidi[i]) && preset.id !== "hardtune") {
      const slowHz = midiToFreq(slowMidi[i]);
      const vibratoCents = 1200 * Math.log2(raw / slowHz);
      if (Math.abs(vibratoCents) < driftIgnore * 1.15) {
        corr *= 1 - vibPass;
      }
    }

    corr *= preset.correctionStrength * Math.max(minCorrectable, correctable[i]);
    if (preset.humanize > 0) corr *= 1 - preset.humanize * 0.72;

    corr = clamp(corr, -preset.maxCents, preset.maxCents);

    if (preset.noteTransition === "instant" && (correctable[i] > 0.5 || preset.id === "hardtune")) {
      prevCorr = corr;
    } else {
      corr = clamp(corr, prevCorr - maxStep, prevCorr + maxStep);
      prevCorr = corr;
    }
    cents[i] = corr;
  }

  const smoothPasses = preset.noteTransition === "slow" ? 3 : preset.noteTransition === "medium" ? 2 : 1;
  const mix = preset.noteTransition === "slow" ? 0.62 : preset.noteTransition === "medium" ? 0.52 : 0.42;
  for (let pass = 0; pass < smoothPasses; pass++) {
    for (let i = 1; i < cents.length; i++) {
      cents[i] = cents[i] * (1 - mix) + cents[i - 1] * mix;
    }
    for (let i = cents.length - 2; i >= 0; i--) {
      cents[i] = cents[i] * (1 - mix) + cents[i + 1] * mix;
    }
  }
  return cents;
}

function interpolateCentsAtSample(cents, hop, sampleIdx) {
  const f = sampleIdx / hop;
  const i0 = Math.floor(f);
  const i1 = Math.min(cents.length - 1, i0 + 1);
  const t = f - i0;
  return cents[i0] * (1 - t) + cents[i1] * t;
}

function resampleGrain(grain, ratio) {
  const r = clamp(ratio, 0.94, 1.06);
  const outLen = Math.max(8, Math.floor(grain.length / r));
  const out = new Float32Array(outLen);
  for (let j = 0; j < outLen; j++) {
    const src = j * r;
    const i0 = Math.floor(src);
    const i1 = Math.min(grain.length - 1, i0 + 1);
    const t = src - i0;
    out[j] = grain[i0] * (1 - t) + grain[i1] * t;
  }
  return out;
}

function overlapAdd(out, norm, grain, start, win) {
  for (let j = 0; j < grain.length; j++) {
    const idx = start + j;
    if (idx < 0 || idx >= out.length) continue;
    const w = j < win.length ? win[j] : win[win.length - 1];
    out[idx] += grain[j] * w;
    norm[idx] += w;
  }
}

function applyPitchShift(mono, sr, cents, hop, winSize, wet) {
  const win = hannWindow(winSize);
  const nGrains = Math.max(1, Math.floor((mono.length - winSize) / hop));
  const wetSig = new Float32Array(mono.length);
  const norm = new Float32Array(mono.length);

  for (let g = 0; g < nGrains; g++) {
    const pos = g * hop;
    if (pos + winSize > mono.length) break;
    const grain = mono.subarray(pos, pos + winSize);
    const corr = interpolateCentsAtSample(cents, hop, pos + winSize * 0.5);
    if (Math.abs(corr) < 0.6) {
      overlapAdd(wetSig, norm, grain, pos, win);
      continue;
    }
    const ratio = 2 ** (corr / 1200);
    overlapAdd(wetSig, norm, resampleGrain(grain, ratio), pos, win);
  }

  const out = mono.slice();
  for (let i = 0; i < out.length; i++) {
    const w = norm[i] > 1e-6 ? wetSig[i] / norm[i] : mono[i];
    out[i] = mono[i] * (1 - wet) + w * wet;
  }
  return out;
}

function summarizeCorrectionCents(cents, voiced) {
  let sum = 0;
  let count = 0;
  let peak = 0;
  for (let i = 0; i < cents.length; i++) {
    if (!voiced[i]) continue;
    const a = Math.abs(cents[i]);
    if (a < 0.4) continue;
    sum += a;
    count += 1;
    peak = Math.max(peak, a);
  }
  return { avgCents: count ? sum / count : 0, peakCents: peak, activeFrames: count };
}

function measureBufferDiff(a, b) {
  if (!a || !b) return 0;
  if (a === b) return 0;
  try {
    const ca = a.getChannelData(0);
    const cb = b.getChannelData(0);
    const n = Math.min(ca.length, cb.length);
    if (!n) return 0;
    let sum = 0;
    let samples = 0;
    for (let i = 0; i < n; i += 8) {
      const d = ca[i] - cb[i];
      sum += d * d;
      samples += 1;
    }
    return Math.sqrt(sum / Math.max(1, samples));
  } catch {
    return 0;
  }
}

export function formatPitchKeyLabel(keyInfo) {
  if (!keyInfo?.rootName) return "";
  const scale = keyInfo.scale === "natural_minor" ? " minor" : " major";
  return `${keyInfo.rootName}${scale}`;
}

function buildRenderMeta(sourceBuffer, outputBuffer, cents, voiced, keyInfo, preset, voicedRatio = 0) {
  const { avgCents, peakCents, activeFrames } = summarizeCorrectionCents(cents, voiced);
  const rmsDiff = measureBufferDiff(sourceBuffer, outputBuffer);
  const noPitchDetected = voicedRatio < 0.04;
  const onPitch = !noPitchDetected && peakCents < 4 && rmsDiff < 0.0009;
  const audible = !noPitchDetected && (peakCents >= 5 || rmsDiff >= 0.0012);
  return {
    presetId: preset.id,
    keyLabel: formatPitchKeyLabel(keyInfo),
    avgCents: Math.round(avgCents * 10) / 10,
    peakCents: Math.round(peakCents * 10) / 10,
    activeFrames,
    voicedRatio: Math.round(voicedRatio * 1000) / 1000,
    rmsDiff,
    audible,
    onPitch,
    noPitchDetected,
    passthrough: noPitchDetected || onPitch,
  };
}

export function getPitchRenderMeta(take, presetId) {
  const id = normalizePitchPresetId(presetId);
  return take?.pitchCorrection?.meta?.[id] || null;
}

export function describePitchRenderMeta(meta, presetId) {
  const id = normalizePitchPresetId(presetId);
  if (id === "none") return "No pitch correction — raw vocal.";
  const label = pitchPresetLabel(id);
  if (!meta) return `${label} — tap to render.`;
  if (meta.noPitchDetected) {
    return `${label} · Pitch not detected — sounds like Original. Try singing louder on the note, or tap Hard Tune after re-recording.`;
  }
  if (meta.error) {
    return `${label} · Couldn't process — using Original.`;
  }
  if (meta.passthrough && meta.onPitch) {
    return `${label} · Key ${meta.keyLabel || "—"} · Already on pitch — sounds like Original. Hard Tune is the strongest preset.`;
  }
  const strength = meta.peakCents >= 35 ? "Strong" : meta.peakCents >= 12 ? "Moderate" : "Light";
  return `${label} · Key ${meta.keyLabel || "—"} · ${strength} correction (avg ${meta.avgCents}¢, peak ${meta.peakCents}¢). Tap Original while playing to A/B.`;
}

/** Render pitch-corrected vocal (offline). Returns { buffer, meta }. */
export async function renderPitchCorrection(sourceBuffer, presetId, opts = {}) {
  const id = normalizePitchPresetId(presetId);
  const preset = PITCH_CORRECTION_PRESETS[id];
  if (!preset || id === "none") {
    return { buffer: sourceBuffer, meta: { passthrough: true, onPitch: true, keyLabel: "" } };
  }
  if (!sourceBuffer?.numberOfChannels || !sourceBuffer.length) {
    return { buffer: sourceBuffer, meta: { passthrough: true, onPitch: true, keyLabel: "" } };
  }

  try {
    const sr = sourceBuffer.sampleRate || 44100;
    const ch0 = sourceBuffer.getChannelData(0);
    const ch1 = sourceBuffer.numberOfChannels > 1 ? sourceBuffer.getChannelData(1) : null;
    const monoRaw = toMonoFloat32(ch0, ch1);
    const monoAnalysis = peakNormalizeCopyForAnalysis(monoRaw);
    const keyInfo = resolveKeyInfo(monoAnalysis, sr, opts);

    await yieldToUi();

    const { f0s, voiced, hop, winSize, nGrains } = trackPitchFrames(monoAnalysis, sr, preset);
    const voicedRatio = nGrains
      ? voiced.reduce((a, b) => a + b, 0) / Math.max(1, voiced.length)
      : 0;

    if (!nGrains || voicedRatio < 0.04) {
      return {
        buffer: sourceBuffer,
        meta: buildRenderMeta(sourceBuffer, sourceBuffer, new Float32Array(0), voiced, keyInfo, preset, voicedRatio),
      };
    }

    await yieldToUi();

    const microFilter = applyMicroPitchFilter(f0s, voiced, hop, sr);
    const { lockedMidi, slowMidi } = buildLockedNotes(microFilter, voiced, preset, keyInfo, hop, sr);
    const cents = buildCorrectionCents(f0s, voiced, lockedMidi, slowMidi, microFilter, preset, hop, sr);
    const corrected = applyPitchShift(monoRaw, sr, cents, hop, winSize, preset.wet);
    const levelMatched = matchPeakToReference(corrected, monoRaw);

    const buf = createMonoBufferFromFloat32(levelMatched, sr, opts);
    const meta = buildRenderMeta(sourceBuffer, buf, cents, voiced, keyInfo, preset, voicedRatio);
    return { buffer: buf, meta };
  } catch (err) {
    console.warn("[pitch-correction] render failed:", err);
    return { buffer: sourceBuffer, meta: { passthrough: true, onPitch: false, noPitchDetected: false, error: true, keyLabel: "" } };
  }
}

export function ensureTakePitchState(take) {
  if (!take) return null;
  if (!take.pitchCorrection) {
    take.pitchCorrection = {
      preset: PITCH_PRESET_DEFAULT,
      cache: {},
      meta: {},
      rendering: null,
      keyInfo: null,
      engineVersion: PITCH_ENGINE_VERSION,
    };
  } else {
    take.pitchCorrection.preset = normalizePitchPresetId(take.pitchCorrection.preset);
    if (!take.pitchCorrection.meta) take.pitchCorrection.meta = {};
    if (take.pitchCorrection.engineVersion !== PITCH_ENGINE_VERSION) {
      take.pitchCorrection.cache = {};
      take.pitchCorrection.meta = {};
      take.pitchCorrection.engineVersion = PITCH_ENGINE_VERSION;
    }
  }
  return take.pitchCorrection;
}

export function getPitchCachedBuffer(take, presetId) {
  const pc = take?.pitchCorrection;
  if (!pc) return null;
  const id = normalizePitchPresetId(presetId);
  if (id === "none") return take.buffer || null;
  return pc.cache?.[id] || null;
}

export function invalidatePitchCache(take) {
  if (!take?.pitchCorrection) return;
  take.pitchCorrection.cache = {};
  take.pitchCorrection.meta = {};
  take.pitchCorrection.keyInfo = null;
}

export async function ensurePitchPresetRendered(take, presetId, opts = {}) {
  const pc = ensureTakePitchState(take);
  if (!take?.buffer || !pc) return null;
  const id = normalizePitchPresetId(presetId);
  if (id === "none") {
    pc.cache.none = take.buffer;
    return take.buffer;
  }
  if (pc.cache[id]) return pc.cache[id];
  if (pc.rendering === id) {
    await pc.renderingPromise;
    return pc.cache[id] || null;
  }
  pc.rendering = id;
  pc.renderingPromise = (async () => {
    try {
      await yieldToUi();
      if (!take.buffer?.numberOfChannels) return take.buffer || null;
      if (!pc.keyInfo) {
        const ch = take.buffer.getChannelData(0);
        const ch1 = take.buffer.numberOfChannels > 1 ? take.buffer.getChannelData(1) : null;
        const monoAnalysis = peakNormalizeCopyForAnalysis(toMonoFloat32(ch, ch1));
        pc.keyInfo = resolveKeyInfo(monoAnalysis, take.buffer.sampleRate, { trackKey: opts.trackKey });
      }
      const result = await renderPitchCorrection(take.buffer, id, {
        audioContext: opts.audioContext,
        keyInfo: pc.keyInfo,
        trackKey: opts.trackKey,
      });
      const buf = result?.buffer || null;
      if (buf) {
        pc.cache[id] = buf;
        if (result?.meta) pc.meta[id] = result.meta;
      }
      return buf;
    } catch (err) {
      console.warn("[pitch-correction] preset render failed:", id, err);
      return null;
    } finally {
      pc.rendering = null;
      pc.renderingPromise = null;
    }
  })();
  return pc.renderingPromise;
}

export function pitchPresetLabel(id) {
  return PITCH_CORRECTION_PRESETS[normalizePitchPresetId(id)]?.label || id;
}

export function isPitchPresetInstant(presetId) {
  return normalizePitchPresetId(presetId) === "none";
}
