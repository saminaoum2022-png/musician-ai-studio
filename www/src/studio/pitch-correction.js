/**
 * Studio Pitch Correction — modular Auto-Tune-style preview (Review only).
 * Does not touch recording, mix DSP, or export chains.
 */

import { estimatePitchHz } from "../echo-pitch-stabilize.js";
import { scaleIntervals, midiToFreq } from "../theory.js";

const ROOT_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const ENHARMONIC = Object.freeze({
  DB: "C#", EB: "D#", GB: "F#", AB: "G#", BB: "A#", CB: "B", FB: "E",
  Db: "C#", Eb: "D#", Gb: "F#", Ab: "G#", Bb: "A#", Cb: "B", Fb: "E",
});

/** @typedef {{ id: string, label: string, retuneMs: number, humanize: number, flexTune: number, formantPreserve: boolean, correctionStrength: number, maxCents: number, wet: number, useScale: boolean }} PitchPreset */

/** @type {Record<string, PitchPreset>} */
export const PITCH_CORRECTION_PRESETS = Object.freeze({
  none: {
    id: "none",
    label: "Original",
    retuneMs: 0,
    humanize: 1,
    flexTune: 1,
    formantPreserve: true,
    correctionStrength: 0,
    maxCents: 0,
    wet: 0,
    useScale: false,
  },
  natural: {
    id: "natural",
    label: "Natural",
    retuneMs: 25,
    humanize: 0.75,
    flexTune: 0.50,
    formantPreserve: true,
    correctionStrength: 0.62,
    maxCents: 42,
    wet: 0.58,
    useScale: true,
  },
  pop: {
    id: "pop",
    label: "Pop",
    retuneMs: 12,
    humanize: 0.45,
    flexTune: 0.35,
    formantPreserve: true,
    correctionStrength: 0.78,
    maxCents: 78,
    wet: 0.72,
    useScale: true,
  },
  trap: {
    id: "trap",
    label: "Trap",
    retuneMs: 3,
    humanize: 0.12,
    flexTune: 0.15,
    formantPreserve: true,
    correctionStrength: 0.94,
    maxCents: 140,
    wet: 0.86,
    useScale: false,
  },
  studio: {
    id: "studio",
    label: "Studio",
    retuneMs: 18,
    humanize: 0.58,
    flexTune: 0.42,
    formantPreserve: true,
    correctionStrength: 0.70,
    maxCents: 58,
    wet: 0.66,
    useScale: true,
  },
});

export const PITCH_PRESET_IDS = Object.freeze(["none", "natural", "pop", "trap", "studio"]);
export const PITCH_PRESET_DEFAULT = "none";

function hannWindow(size) {
  const w = new Float32Array(size);
  for (let i = 0; i < size; i++) {
    w[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / Math.max(1, size - 1)));
  }
  return w;
}

function medianOf(arr) {
  const a = arr.filter((x) => x > 0).sort((x, y) => x - y);
  if (!a.length) return 0;
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
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
    const midi = 69 + 12 * Math.log2(hz / 440);
    const pc = ((Math.round(midi) % 12) + 12) % 12;
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

function targetHzForFrame(hz, preset, keyInfo) {
  const midi = 69 + 12 * Math.log2(hz / 440);
  const useScale = preset.useScale && (keyInfo?.confidence ?? 0) > 0.38;
  const targetMidi = useScale ? quantizeToScaleMidi(midi, keyInfo) : Math.round(midi);
  return midiToFreq(targetMidi);
}

function smoothF0Track(f0s, maxCentsStep) {
  const out = f0s.slice();
  const globalMed = medianOf(f0s);
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < out.length; i++) {
      if (out[i] < 80) continue;
      const local = medianOf(f0s.slice(Math.max(0, i - 2), Math.min(f0s.length, i + 3))) || globalMed;
      if (!local) continue;
      const cents = 1200 * Math.log2(local / out[i]);
      const clamped = clamp(cents, -maxCentsStep, maxCentsStep);
      out[i] = out[i] * 2 ** (clamped / 1200);
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

function trackPitchFrames(mono, sr, winSize, hop) {
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
  const smoothStep = clamp(1200 / Math.max(8, 25), 8, 35);
  const smoothed = smoothF0Track(Array.from(f0s), smoothStep);
  for (let i = 0; i < nGrains; i++) {
    if (voiced[i]) f0s[i] = smoothed[i];
  }
  return { f0s, voiced, nGrains };
}

function buildCorrectionCents(f0s, voiced, preset, keyInfo, hop, sr) {
  const cents = new Float32Array(f0s.length);
  const flexCents = preset.flexTune * 38;
  let prev = 0;
  const maxStep = 1200 / Math.max(4, preset.retuneMs) * (hop / sr * 1000);

  for (let i = 0; i < f0s.length; i++) {
    if (!voiced[i] || f0s[i] < 80) {
      cents[i] = prev * 0.85;
      prev = cents[i];
      continue;
    }
    const raw = f0s[i];
    const target = targetHzForFrame(raw, preset, keyInfo);
    let corr = 1200 * Math.log2(target / raw);

    if (Math.abs(corr) < flexCents) {
      corr = 0;
    } else {
      const knee = flexCents + 12;
      if (Math.abs(corr) < knee) {
        corr *= (Math.abs(corr) - flexCents) / 12;
      }
    }

    corr *= preset.correctionStrength;
    corr *= 1 - preset.humanize * 0.8;
    corr = clamp(corr, -preset.maxCents, preset.maxCents);

    if (prev !== 0) corr = clamp(corr, prev - maxStep, prev + maxStep);
    cents[i] = corr;
    prev = corr;
  }

  for (let pass = 0; pass < 2; pass++) {
    for (let i = 1; i < cents.length; i++) {
      cents[i] = cents[i] * 0.55 + cents[i - 1] * 0.45;
    }
    for (let i = cents.length - 2; i >= 0; i--) {
      cents[i] = cents[i] * 0.55 + cents[i + 1] * 0.45;
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
  const r = clamp(ratio, 0.92, 1.08);
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
    if (Math.abs(corr) < 1.5) {
      overlapAdd(wetSig, norm, grain, pos, win);
      continue;
    }
    const ratio = 2 ** (corr / 1200);
    const shifted = resampleGrain(grain, ratio);
    overlapAdd(wetSig, norm, shifted, pos, win);
  }

  const out = mono.slice();
  for (let i = 0; i < out.length; i++) {
    const w = norm[i] > 1e-6 ? wetSig[i] / norm[i] : mono[i];
    out[i] = mono[i] * (1 - wet) + w * wet;
  }
  return out;
}

/**
 * Render pitch-corrected vocal (offline). Returns mono AudioBuffer same length as input.
 */
export async function renderPitchCorrection(sourceBuffer, presetId, opts = {}) {
  const preset = PITCH_CORRECTION_PRESETS[presetId];
  if (!preset || presetId === "none") return sourceBuffer;
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

  const winSize = Math.max(2048, Math.floor(sr * 0.045));
  const hop = Math.floor(winSize * 0.5);
  const { f0s, voiced } = trackPitchFrames(mono, sr, winSize, hop);
  const voicedRatio = voiced.reduce((a, b) => a + b, 0) / Math.max(1, voiced.length);
  if (voicedRatio < 0.08) return sourceBuffer;

  await yieldToUi();

  const cents = buildCorrectionCents(f0s, voiced, preset, keyInfo, hop, sr);
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
  }
  return take.pitchCorrection;
}

export function getPitchCachedBuffer(take, presetId) {
  const pc = take?.pitchCorrection;
  if (!pc) return null;
  if (presetId === "none") return take.buffer || null;
  return pc.cache?.[presetId] || null;
}

export function invalidatePitchCache(take) {
  if (!take?.pitchCorrection) return;
  take.pitchCorrection.cache = {};
  take.pitchCorrection.keyInfo = null;
}

export async function ensurePitchPresetRendered(take, presetId, opts = {}) {
  const pc = ensureTakePitchState(take);
  if (!take?.buffer || !pc) return null;
  if (presetId === "none") {
    pc.cache.none = take.buffer;
    return take.buffer;
  }
  if (pc.cache[presetId]) return pc.cache[presetId];
  if (pc.rendering === presetId) {
    await pc.renderingPromise;
    return pc.cache[presetId] || null;
  }
  pc.rendering = presetId;
  pc.renderingPromise = (async () => {
    try {
      await yieldToUi();
      if (!pc.keyInfo) {
        pc.keyInfo = detectMusicalKey(take.buffer.getChannelData(0), take.buffer.sampleRate);
        const trackKey = parseTrackKey(opts.trackKey);
        if (trackKey) pc.keyInfo = { ...trackKey, confidence: Math.max(pc.keyInfo.confidence, 0.85) };
      }
      const buf = await renderPitchCorrection(take.buffer, presetId, {
        audioContext: opts.audioContext,
        keyInfo: pc.keyInfo,
        trackKey: opts.trackKey,
      });
      pc.cache[presetId] = buf;
      return buf;
    } finally {
      pc.rendering = null;
      pc.renderingPromise = null;
    }
  })();
  return pc.renderingPromise;
}

export function pitchPresetLabel(id) {
  return PITCH_CORRECTION_PRESETS[id]?.label || id;
}

export function isPitchPresetInstant(presetId) {
  return presetId === "none";
}
