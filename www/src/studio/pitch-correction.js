/**
 * Studio Pitch Correction — modular Auto-Tune-style preview (Review / Mix only).
 * Does not touch recording, mix DSP, or export chains.
 */

import { estimatePitchHz } from "../echo-pitch-stabilize.js";
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
    wet: 0.76,
    useScale: true,
    correctionStrength: 0.80,
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
    wet: 0.90,
    useScale: false,
    correctionStrength: 1,
    lockHoldMs: 12,
    formantPreserve: true,
  },
});

export const PITCH_PRESET_IDS = Object.freeze(["none", "natural", "balanced", "pop", "hardtune"]);
export const PITCH_PRESET_DEFAULT = "balanced";
/** Bump when pitch engine changes so cached renders are invalidated. */
const PITCH_ENGINE_VERSION = 4;

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

function yieldToUi() {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame === "function") requestAnimationFrame(() => resolve());
    else setTimeout(resolve, 0);
  });
}

function parseTrackKey(str) {
  const m = String(str || "").trim().match(/^([A-Ga-g])([#b]?)\s*(maj|major|min|minor|m)?$/i);
  if (!m) return null;
  let name = m[1].toUpperCase() + (m[2] || "");
  name = ENHARMONIC[name] || name;
  const idx = ROOT_NAMES.indexOf(name);
  if (idx < 0) return null;
  const minor = /min|minor|^m$/i.test(m[3] || "");
  return { root: idx, scale: minor ? "natural_minor" : "major", rootName: ROOT_NAMES[idx], confidence: 1 };
}

/** Detect key from voiced pitch-class histogram. */
export function detectMusicalKey(channel, sampleRate) {
  const chroma = new Float32Array(12);
  const win = Math.floor(sampleRate * 0.06);
  const hop = Math.floor(win * 0.5);
  let voiced = 0;
  for (let i = 0; i + win < channel.length; i += hop) {
    const hz = estimatePitchHz(channel.subarray(i, i + win), sampleRate);
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
  const winSize = Math.max(2048, Math.floor(sr * analysisWindowSec(preset)));
  const hop = Math.floor(winSize * 0.5);
  const nGrains = Math.max(1, Math.floor((mono.length - winSize) / hop));
  const f0s = new Float32Array(nGrains);
  const voiced = new Float32Array(nGrains);

  for (let g = 0; g < nGrains; g++) {
    const pos = g * hop;
    const slice = mono.subarray(pos, pos + winSize);
    const rms = voicedEnergy(slice);
    const hz = estimatePitchHz(slice, sr);
    if (hz > 80 && rms > 0.004) {
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
  let hits = 0;
  let total = 0;
  for (let j = Math.max(0, i - lockFrames + 1); j <= i; j++) {
    if (!voiced[j] || !Number.isFinite(expressionMidi[j])) continue;
    total += 1;
    if (Math.abs(expressionMidi[j] - quantNote) < 0.22) hits += 1;
  }
  return total >= Math.max(2, Math.floor(lockFrames * 0.7)) && hits / total >= 0.82;
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
    microCents[i] = 1200 * Math.log2(midiToFreq(rawMidi[i]) / midiToFreq(expr));
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

    if (Math.abs(microCents[i]) < MICRO_PITCH_FILTER.microIgnoreCents) score *= 0.12;
    if (vibrato[i]) score = 0;
    if (portamento[i]) score = 0;
    if (ornament[i]) score = Math.min(score, 0.08);

    const quant = Math.round(noteCenterMidi[i]);
    const stable = isStableQuantNote(noteCenterMidi, voiced, i, lockFrames, quant);
    if (!stable) score *= 0.18;

    const localCenterDev = Math.abs(noteCenterMidi[i] - expressionMidi[i]) * 100;
    if (localCenterDev > 28) score *= 0.25;

    correctable[i] = clamp(score, 0, 1);
  }

  return { expressionMidi, noteCenterMidi, correctable, microCents, vibrato, portamento, ornament };
}

/**
 * Note locking — stage 2. Uses filtered expression contour only.
 * Waits ~70 ms stability before first lock; avoids neighbour-note flicker.
 */
function buildLockedNotes(filter, preset, keyInfo, hop, sr) {
  const { expressionMidi, noteCenterMidi, correctable, voiced } = filter;
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
      if (isStableQuantNote(noteCenterMidi, voiced, i, lockFrames, quant) && avgCorr > 0.42) {
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

    if (candidateFrames >= switchFrames && stable && avgCorr > 0.48) {
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
  const { correctable, microCents, vibrato, portamento, ornament } = filter;
  const driftIgnore = Math.max(preset.pitchDriftIgnore, MICRO_PITCH_FILTER.microIgnoreCents);
  const flexOff = preset.flexTune <= 0.001;
  const flexCents = flexOff ? 0 : preset.flexTune * 42;
  const maxStep = retuneStepCents(preset, hop, sr);
  const vibPass = vibratoPassFactor(preset);
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

    if (correctable[i] < 0.22 || vibrato[i] || portamento[i] || ornament[i]) {
      corr = 0;
    } else if (Math.abs(microCents[i]) < MICRO_PITCH_FILTER.microIgnoreCents) {
      corr = 0;
    } else if (Math.abs(corr) < driftIgnore) {
      corr = 0;
    } else if (!flexOff && Math.abs(corr) < flexCents) {
      corr = 0;
    } else if (!flexOff) {
      const knee = flexCents + 10;
      if (Math.abs(corr) < knee) corr *= (Math.abs(corr) - flexCents) / 10;
    }

    if (vibPass > 0 && Number.isFinite(slowMidi[i])) {
      const slowHz = midiToFreq(slowMidi[i]);
      const vibratoCents = 1200 * Math.log2(raw / slowHz);
      if (Math.abs(vibratoCents) < driftIgnore * 1.15) {
        corr *= 1 - vibPass;
      }
    }

    corr *= preset.correctionStrength * correctable[i];
    if (preset.humanize > 0) corr *= 1 - preset.humanize * 0.72;

    corr = clamp(corr, -preset.maxCents, preset.maxCents);

    if (preset.noteTransition === "instant" && correctable[i] > 0.75) {
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
    if (Math.abs(corr) < 1.2) {
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

/** Render pitch-corrected vocal (offline). Returns mono AudioBuffer same length as input. */
export async function renderPitchCorrection(sourceBuffer, presetId, opts = {}) {
  const id = normalizePitchPresetId(presetId);
  const preset = PITCH_CORRECTION_PRESETS[id];
  if (!preset || id === "none") return sourceBuffer;
  if (!sourceBuffer?.numberOfChannels) throw new Error("no buffer");

  const sr = sourceBuffer.sampleRate;
  const ch0 = sourceBuffer.getChannelData(0);
  const ch1 = sourceBuffer.numberOfChannels > 1 ? sourceBuffer.getChannelData(1) : null;
  const mono = new Float32Array(ch0.length);
  for (let i = 0; i < ch0.length; i++) {
    mono[i] = ch1 ? (ch0[i] + ch1[i]) * 0.5 : ch0[i];
  }

  let keyInfo = opts.keyInfo;
  if (!keyInfo) {
    keyInfo = detectMusicalKey(mono, sr);
    const trackKey = parseTrackKey(opts.trackKey);
    if (trackKey) keyInfo = { ...trackKey, confidence: Math.max(keyInfo.confidence, 0.85) };
  }

  await yieldToUi();

  const { f0s, voiced, hop, winSize } = trackPitchFrames(mono, sr, preset);
  const voicedRatio = voiced.reduce((a, b) => a + b, 0) / Math.max(1, voiced.length);
  if (voicedRatio < 0.08) return sourceBuffer;

  await yieldToUi();

  const microFilter = applyMicroPitchFilter(f0s, voiced, hop, sr);
  const { lockedMidi, slowMidi } = buildLockedNotes(microFilter, preset, keyInfo, hop, sr);
  const cents = buildCorrectionCents(f0s, voiced, lockedMidi, slowMidi, microFilter, preset, hop, sr);
  const corrected = applyPitchShift(mono, sr, cents, hop, winSize, preset.wet);

  const AC = opts.audioContext?.constructor || window.AudioContext || window.webkitAudioContext;
  const ctx = opts.audioContext || new AC();
  const buf = ctx.createBuffer(1, corrected.length, sr);
  buf.getChannelData(0).set(corrected);
  return buf;
}

export function ensureTakePitchState(take) {
  if (!take) return null;
  if (!take.pitchCorrection) {
    take.pitchCorrection = {
      preset: PITCH_PRESET_DEFAULT,
      cache: {},
      rendering: null,
      keyInfo: null,
      engineVersion: PITCH_ENGINE_VERSION,
    };
  } else {
    take.pitchCorrection.preset = normalizePitchPresetId(take.pitchCorrection.preset);
    if (take.pitchCorrection.engineVersion !== PITCH_ENGINE_VERSION) {
      take.pitchCorrection.cache = {};
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
      if (!pc.keyInfo) {
        pc.keyInfo = detectMusicalKey(take.buffer.getChannelData(0), take.buffer.sampleRate);
        const trackKey = parseTrackKey(opts.trackKey);
        if (trackKey) pc.keyInfo = { ...trackKey, confidence: Math.max(pc.keyInfo.confidence, 0.85) };
      }
      const buf = await renderPitchCorrection(take.buffer, id, {
        audioContext: opts.audioContext,
        keyInfo: pc.keyInfo,
        trackKey: opts.trackKey,
      });
      pc.cache[id] = buf;
      return buf;
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
