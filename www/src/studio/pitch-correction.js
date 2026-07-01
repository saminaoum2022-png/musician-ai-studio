/**
 * Studio Pitch Correction — modular Auto-Tune-style preview (Review only).
 * Does not touch recording, mix DSP, or export chains.
 */

import { estimatePitchHz } from "../echo-pitch-stabilize.js";
import { scaleIntervals, midiToFreq } from "../theory.js";

const ROOT_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

/** @typedef {{ id: string, label: string, retuneMs: number, humanize: number, flexTune: number, formantPreserve: boolean, correctionStrength: number }} PitchPreset */

/** @type {Record<string, PitchPreset>} */
export const PITCH_CORRECTION_PRESETS = Object.freeze({
  natural: {
    id: "natural",
    label: "Natural",
    retuneMs: 25,
    humanize: 0.75,
    flexTune: 0.50,
    formantPreserve: true,
    correctionStrength: 0.58,
  },
  pop: {
    id: "pop",
    label: "Pop",
    retuneMs: 12,
    humanize: 0.45,
    flexTune: 0.35,
    formantPreserve: true,
    correctionStrength: 0.78,
  },
  trap: {
    id: "trap",
    label: "Trap",
    retuneMs: 3,
    humanize: 0.12,
    flexTune: 0.15,
    formantPreserve: true,
    correctionStrength: 0.96,
  },
  studio: {
    id: "studio",
    label: "Studio",
    retuneMs: 18,
    humanize: 0.58,
    flexTune: 0.42,
    formantPreserve: true,
    correctionStrength: 0.70,
  },
});

export const PITCH_PRESET_IDS = Object.freeze(["natural", "pop", "trap", "studio"]);
export const PITCH_PRESET_DEFAULT = "natural";

function hannWindow(size) {
  const w = new Float32Array(size);
  for (let i = 0; i < size; i++) {
    w[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / Math.max(1, size - 1)));
  }
  return w;
}

function resampleLinear(input, ratio) {
  const r = Math.max(0.5, Math.min(2, ratio));
  const outLen = Math.max(8, Math.floor(input.length / r));
  const out = new Float32Array(outLen);
  for (let j = 0; j < outLen; j++) {
    const src = j * r;
    const i0 = Math.floor(src);
    const i1 = Math.min(input.length - 1, i0 + 1);
    const t = src - i0;
    out[j] = input[i0] * (1 - t) + input[i1] * t;
  }
  return out;
}

function formantAwareShift(grain, ratio, preserve) {
  const shifted = resampleLinear(grain, ratio);
  if (!preserve || Math.abs(ratio - 1) < 0.004) return shifted;
  const comp = resampleLinear(shifted, Math.pow(1 / ratio, 0.55));
  const n = Math.min(shifted.length, comp.length);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = shifted[i] * 0.72 + comp[i] * 0.28;
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

/** Detect key from voiced pitch-class histogram. */
export function detectMusicalKey(channel, sampleRate) {
  const chroma = new Float32Array(12);
  const win = Math.floor(sampleRate * 0.06);
  const hop = Math.floor(win * 0.5);
  let voiced = 0;
  for (let i = 0; i + win < channel.length; i += hop) {
    const hz = estimatePitchHz(channel.subarray(i, i + win), sampleRate);
    if (hz < 65) continue;
    voiced += 1;
    const midi = 69 + 12 * Math.log2(hz / 440);
    const pc = ((Math.round(midi) % 12) + 12) % 12;
    chroma[pc] += 1;
  }
  if (voiced < 4) return { root: 0, scale: "major", rootName: "C", confidence: 0 };

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

function buildTargetContour(f0s, preset, keyInfo, hop, sampleRate) {
  const targets = new Float32Array(f0s.length);
  let prev = 0;
  const centsPerFrame = 1200 / Math.max(1, preset.retuneMs) * (hop / sampleRate * 1000);

  for (let i = 0; i < f0s.length; i++) {
    const raw = f0s[i];
    if (raw < 65) {
      targets[i] = prev || 0;
      continue;
    }
    const rawMidi = 69 + 12 * Math.log2(raw / 440);
    const scaleMidi = quantizeToScaleMidi(rawMidi, keyInfo);
    let target = midiToFreq(scaleMidi);

    const distCents = Math.abs(1200 * Math.log2(target / raw));
    const flexCents = (1 - preset.flexTune) * 90;
    let amt = preset.correctionStrength;
    if (distCents < flexCents) amt *= distCents / Math.max(1, flexCents);
    amt *= 1 - preset.humanize * 0.85;
    target = raw + (target - raw) * Math.max(0, Math.min(1, amt));

    if (prev > 65) {
      const delta = 1200 * Math.log2(target / prev);
      const clamped = Math.max(-centsPerFrame, Math.min(centsPerFrame, delta));
      target = prev * 2 ** (clamped / 1200);
    }
    targets[i] = target;
    prev = target;
  }
  return targets;
}

/**
 * Render pitch-corrected vocal (offline). Returns mono AudioBuffer same length as input.
 * @param {AudioBuffer} sourceBuffer
 * @param {string} presetId
 * @param {{ audioContext?: AudioContext, keyInfo?: object, trackKey?: string }} opts
 */
export async function renderPitchCorrection(sourceBuffer, presetId, opts = {}) {
  const preset = PITCH_CORRECTION_PRESETS[presetId] || PITCH_CORRECTION_PRESETS.natural;
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
    if (opts.trackKey) {
      const m = String(opts.trackKey).match(/^([A-G](?:#|b)?)\s*(major|minor|m)?/i);
      if (m) {
        const name = m[1].replace("b", "b").toUpperCase();
        const idx = ROOT_NAMES.indexOf(name.replace("B", "A#").replace("DB", "C#").replace("EB", "D#").replace("GB", "F#").replace("AB", "G#").replace("BB", "A#"));
        if (idx >= 0) {
          keyInfo = { root: idx, scale: /minor|m/i.test(m[2] || "") ? "natural_minor" : "major", rootName: ROOT_NAMES[idx] };
        }
      }
    }
  }

  const winSize = Math.max(1024, Math.floor(sr * 0.07));
  const hop = Math.floor(winSize * 0.25);
  const win = hannWindow(winSize);
  const nGrains = Math.max(1, Math.floor((mono.length - winSize) / hop));

  const f0s = [];
  for (let g = 0; g < nGrains; g++) {
    const pos = g * hop;
    f0s.push(estimatePitchHz(mono.subarray(pos, pos + winSize), sr));
  }

  const targets = buildTargetContour(f0s, preset, keyInfo, hop, sr);
  const out = new Float32Array(mono.length);
  const norm = new Float32Array(mono.length);

  for (let g = 0; g < nGrains; g++) {
    const pos = g * hop;
    if (pos + winSize > mono.length) break;
    const grain = mono.subarray(pos, pos + winSize);
    const raw = f0s[g];
    const tgt = targets[g];
    let ratio = 1;
    if (raw > 65 && tgt > 65) ratio = tgt / raw;
    ratio = Math.max(0.82, Math.min(1.22, ratio));
    const shifted = formantAwareShift(grain, ratio, preset.formantPreserve);
    overlapAdd(out, norm, shifted, pos, win);
  }

  for (let i = 0; i < out.length; i++) {
    if (norm[i] > 1e-6) out[i] /= norm[i];
    else out[i] = mono[i];
  }

  const AC = opts.audioContext?.constructor || window.AudioContext || window.webkitAudioContext;
  const ctx = opts.audioContext || new AC();
  const buf = ctx.createBuffer(1, out.length, sr);
  buf.getChannelData(0).set(out);
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
  return pc?.cache?.[presetId] || null;
}

export function invalidatePitchCache(take) {
  if (!take?.pitchCorrection) return;
  take.pitchCorrection.cache = {};
  take.pitchCorrection.keyInfo = null;
}

export async function ensurePitchPresetRendered(take, presetId, opts = {}) {
  const pc = ensureTakePitchState(take);
  if (!take?.buffer || !pc) return null;
  if (pc.cache[presetId]) return pc.cache[presetId];
  if (pc.rendering === presetId) {
    await pc.renderingPromise;
    return pc.cache[presetId] || null;
  }
  pc.rendering = presetId;
  pc.renderingPromise = (async () => {
    try {
      if (!pc.keyInfo) pc.keyInfo = detectMusicalKey(take.buffer.getChannelData(0), take.buffer.sampleRate);
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
