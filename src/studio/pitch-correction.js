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

/**
 * Lock target notes with hysteresis — never flip every frame.
 * Uses a slow pitch contour for detection; raw f0 only for micro-correction.
 */
function buildLockedNotes(f0s, voiced, preset, keyInfo, hop, sr) {
  const n = f0s.length;
  const lockedMidi = new Float32Array(n);
  const slowMidi = new Float32Array(n);
  const radius = preset.tracking === "high" ? 2 : preset.tracking === "medium-high" ? 3 : 4;
  const switchFrames = noteSwitchFrames(preset, hop, sr);
  const switchMarginSemis = preset.noteTransition === "instant" ? 0.45 : preset.noteTransition === "fast" ? 0.65 : 0.85;

  let locked = NaN;
  let candidate = NaN;
  let candidateFrames = 0;

  for (let i = 0; i < n; i++) {
    if (!voiced[i] || f0s[i] < 80) {
      lockedMidi[i] = Number.isFinite(locked) ? locked : NaN;
      slowMidi[i] = lockedMidi[i];
      candidateFrames = 0;
      continue;
    }

    const localMidis = [];
    for (let j = Math.max(0, i - radius); j <= Math.min(n - 1, i + radius); j++) {
      if (voiced[j] && f0s[j] > 80) localMidis.push(hzToMidi(f0s[j]));
    }
    const slow = medianOf(localMidis) || hzToMidi(f0s[i]);
    slowMidi[i] = slow;
    const quant = quantizeMidi(slow, preset, keyInfo);

    if (!Number.isFinite(locked)) {
      locked = quant;
      lockedMidi[i] = locked;
      continue;
    }

    if (quant === locked) {
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

    if (candidateFrames >= switchFrames) {
      locked = candidate;
      candidateFrames = 0;
    }
    lockedMidi[i] = locked;
  }

  return { lockedMidi, slowMidi };
}

function vibratoPassFactor(preset) {
  if (preset.vibratoPreserve === "off" || preset.humanize <= 0) return 0;
  if (preset.vibratoPreserve === "slight") return 0.35 + preset.humanize * 0.15;
  return 0.55 + preset.humanize * 0.35;
}

function buildCorrectionCents(f0s, voiced, lockedMidi, slowMidi, preset, hop, sr) {
  const cents = new Float32Array(f0s.length);
  const driftIgnore = preset.pitchDriftIgnore;
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

    if (Math.abs(corr) < driftIgnore) {
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

    corr *= preset.correctionStrength;
    if (preset.humanize > 0) corr *= 1 - preset.humanize * 0.72;

    corr = clamp(corr, -preset.maxCents, preset.maxCents);

    if (preset.noteTransition === "instant") {
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

  const { lockedMidi, slowMidi } = buildLockedNotes(f0s, voiced, preset, keyInfo, hop, sr);
  const cents = buildCorrectionCents(f0s, voiced, lockedMidi, slowMidi, preset, hop, sr);
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
    };
  } else {
    take.pitchCorrection.preset = normalizePitchPresetId(take.pitchCorrection.preset);
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
