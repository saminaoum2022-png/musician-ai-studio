/**
 * Natural Pitch Stabilization — emotionally musical drift glue, not robotic autotune.
 */

export function estimatePitchHz(samples, sampleRate, minHz = 72, maxHz = 520) {
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
  if (bestCorr < 0.32 || !bestLag) return 0;
  return sampleRate / bestLag;
}

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

/** Slow pitch contour — notes feel like they float and lock gently */
function smoothF0Track(f0s, maxCentsPerStep = 5) {
  const out = f0s.slice();
  const globalMed = medianOf(f0s);
  for (let pass = 0; pass < 3; pass++) {
    for (let i = 0; i < out.length; i++) {
      if (out[i] < 60) continue;
      const start = Math.max(0, i - 3);
      const end = Math.min(f0s.length, i + 4);
      let local = medianOf(f0s.slice(start, end));
      if (!local) local = globalMed;
      if (!local) continue;
      const cents = 1200 * Math.log2(local / out[i]);
      const clamped = Math.max(-maxCentsPerStep, Math.min(maxCentsPerStep, cents));
      out[i] = out[i] * 2 ** (clamped / 1200);
    }
    for (let i = 1; i < out.length; i++) {
      if (out[i] < 60 || out[i - 1] < 60) continue;
      const cents = 1200 * Math.log2(out[i] / out[i - 1]);
      if (Math.abs(cents) > maxCentsPerStep) {
        const clamped = Math.sign(cents) * maxCentsPerStep;
        out[i] = out[i - 1] * 2 ** (clamped / 1200);
      }
    }
  }
  return out;
}

/** Barely nudge toward nearest note — only for sustained hum (not speech) */
function gentleMusicalCenter(hz, pull = 0.22) {
  if (hz < 65 || pull <= 0) return hz;
  const midi = 69 + 12 * Math.log2(hz / 440);
  const nearest = Math.round(midi);
  const target = 440 * 2 ** ((nearest - 69) / 12);
  const cents = 1200 * Math.log2(target / hz);
  const snap = pull > 0.55 ? 50 : 18;
  const clamped = Math.max(-snap, Math.min(snap, cents));
  return hz * 2 ** ((clamped * pull) / 1200);
}

function resampleGrain(grain, ratio) {
  const outLen = Math.max(8, Math.floor(grain.length / ratio));
  const out = new Float32Array(outLen);
  for (let j = 0; j < outLen; j++) {
    const src = j * ratio;
    const i0 = Math.floor(src);
    const i1 = Math.min(grain.length - 1, i0 + 1);
    const t = src - i0;
    out[j] = grain[i0] * (1 - t) + grain[i1] * t;
  }
  return out;
}

function overlapAddPitchShift(channel, sampleRate, ratios, hop, winSize, ratioClamp = 0.07) {
  const win = hannWindow(winSize);
  const out = new Float32Array(channel.length);
  const norm = new Float32Array(channel.length);
  const nGrains = ratios.length;
  const clamp = Math.max(0.05, Math.min(0.18, ratioClamp));

  for (let g = 0; g < nGrains; g++) {
    const pos = g * hop;
    if (pos + winSize > channel.length) break;
    const grain = channel.subarray(pos, pos + winSize);
    const ratio = Math.max(1 - clamp, Math.min(1 + clamp, ratios[g] || 1));
    const shifted = resampleGrain(grain, ratio);
    const start = pos;
    for (let j = 0; j < shifted.length && start + j < out.length; j++) {
      const w = j < win.length ? win[j] : win[win.length - 1];
      out[start + j] += shifted[j] * w;
      norm[start + j] += w;
    }
  }

  for (let i = 0; i < out.length; i++) {
    if (norm[i] > 1e-6) channel[i] = out[i] / norm[i];
  }
}

function smoothMicroCracks(channel, strength = 0.45) {
  if (strength <= 0) return;
  const tmp = channel.slice();
  for (let i = 2; i < channel.length - 2; i++) {
    const b = tmp[i];
    const med =
      [tmp[i - 2], tmp[i - 1], tmp[i], tmp[i + 1], tmp[i + 2]].sort((a, c) => a - c)[2];
    if (Math.abs(b - med) > 0.015) {
      channel[i] = b * (1 - strength) + med * strength;
    }
  }
}

/**
 * @param {AudioBuffer} buffer
 * @param {object} opts
 */
export function applyNaturalPitchStabilization(buffer, opts = {}) {
  if (!buffer?.numberOfChannels) return buffer;
  const robotic = Boolean(opts.robotic);
  const humming = Boolean(opts.humming);
  const notePull = Math.max(0, Math.min(0.95, Number(opts.notePull) ?? (robotic ? 0.8 : 0.22)));
  const strength = robotic
    ? Math.max(0, Math.min(0.58, Number(opts.strength) ?? 0))
    : Math.max(0, Math.min(0.15, Number(opts.strength) ?? 0));
  if (strength <= 0.05) return buffer;
  if (!robotic && !humming) return buffer;

  const ch = buffer.getChannelData(0);
  const sr = buffer.sampleRate;
  const winSize = Math.floor(sr * (robotic ? 0.055 : 0.07));
  const hop = Math.floor(winSize * 0.5);
  const maxCents = robotic
    ? Math.min(55, Number(opts.maxCents) || 48)
    : Math.min(14, Number(opts.maxCents) || 12);
  const nGrains = Math.max(1, Math.floor((ch.length - winSize) / hop));

  const f0s = [];
  for (let g = 0; g < nGrains; g++) {
    const pos = g * hop;
    f0s.push(estimatePitchHz(ch.subarray(pos, pos + winSize), sr));
  }

  const voiced = f0s.filter((f) => f > 60).length / Math.max(1, f0s.length);
  if (voiced < (robotic ? 0.04 : 0.1)) return buffer;

  let smoothed = smoothF0Track(f0s, robotic ? 16 : 4);
  if (robotic) {
    smoothed = smoothed.map((f) => (f > 60 ? gentleMusicalCenter(f, notePull) : f));
  }

  const blend = robotic ? Math.min(1, strength * 1.2) : strength;
  const ratios = f0s.map((f, i) => {
    if (f < 60 || smoothed[i] < 60) return 1;
    let target = smoothed[i];
    if (robotic && target > 60) target = gentleMusicalCenter(target, notePull);
    let cents = 1200 * Math.log2(target / f);
    cents = Math.max(-maxCents, Math.min(maxCents, cents));
    const ratio = 2 ** (cents / 1200);
    return 1 + (ratio - 1) * blend;
  });

  const dry = ch.slice();
  overlapAddPitchShift(ch, sr, ratios, hop, winSize, robotic ? 0.16 : 0.07);

  const wetMix = robotic ? Math.min(0.92, strength + 0.12) : strength;
  for (let i = 0; i < ch.length; i++) {
    ch[i] = dry[i] * (1 - wetMix) + ch[i] * wetMix;
  }

  smoothMicroCracks(ch, strength * (robotic ? 0.35 : humming ? 0.65 : 0.4));
  return buffer;
}

export function isLikelyHumOrSingBuffer(buffer) {
  const ch = buffer.getChannelData(0);
  if (ch.length < 2048) return false;
  let crossings = 0;
  let absSum = 0;
  for (let i = 1; i < ch.length; i++) {
    if ((ch[i] >= 0) !== (ch[i - 1] >= 0)) crossings++;
    absSum += Math.abs(ch[i]);
  }
  const zcr = crossings / ch.length;
  const avg = absSum / ch.length;
  return zcr < 0.11 && avg > 0.012;
}
