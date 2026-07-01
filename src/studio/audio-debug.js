/**
 * Nabad Studio — internal audio debug (developer-only).
 * Read-only analysis of raw takes. No DSP, no mutation.
 *
 * Loudness: ITU-R BS.1770-4 K-weighting + EBU R128 block gating.
 * Peak/RMS/clipping: unweighted sample values on the raw buffer.
 */

const DEBUG_KEY = "nabad.studio.audioDebug.v1";

const BLOCK_MS = 400;
const HOP_MS = 100;
const SHORT_TERM_MS = 3000;
const ABS_GATE_LUFS = -70;
const REL_GATE_LU = 10;

export function isStudioAudioDebug() {
  try { return localStorage.getItem(DEBUG_KEY) === "1"; } catch { return false; }
}

export function setStudioAudioDebug(on) {
  try { localStorage.setItem(DEBUG_KEY, on ? "1" : "0"); } catch {}
}

/** Hidden dev gesture: 7 taps on Studio lobby title enables debug. */
export function bindAudioDebugEnableGesture(el, showToast) {
  if (!el) return;
  let taps = 0;
  let timer = 0;
  el.addEventListener("click", () => {
    taps += 1;
    clearTimeout(timer);
    timer = setTimeout(() => { taps = 0; }, 2200);
    if (taps >= 7) {
      taps = 0;
      setStudioAudioDebug(true);
      showToast?.("Audio debug mode on (dev only)");
    }
  });
}

/**
 * Analyze a raw AudioBuffer (read-only — never modifies input).
 * Uses BS.1770 K-weighting for LUFS; sample peak for dBFS.
 * @param {AudioBuffer} buffer — post count-in trim, pre any FX
 * @param {{ takeIndex?: number, latencyMs?: number }} opts
 */
export async function analyzeRawTake(buffer, opts = {}) {
  if (!buffer) return null;

  const ch0 = buffer.getChannelData(0);
  const ch1 = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : ch0;
  const sr = buffer.sampleRate;
  const n = ch0.length;

  const { peak, clipCount } = measureSamplePeak(ch0, ch1);
  const peakDbfs = ampToDb(peak);

  const [kL, kR] = await kWeightStereo(buffer);

  const blocks = buildLoudnessBlocks(kL, kR, sr);
  const lufsI = integratedLoudnessGated(blocks);
  const lufsS = maxShortTermLoudness(kL, kR, sr);
  const rmsDb = activeRmsDb(kL, kR, blocks);
  const noiseFloorDb = estimateNoiseFloorDb(blocks);
  const dynamicRangeDb = Number.isFinite(peakDbfs) && Number.isFinite(noiseFloorDb)
    ? peakDbfs - noiseFloorDb
    : 0;

  const metrics = {
    takeIndex: opts.takeIndex ?? 1,
    durationSec: buffer.duration,
    peakDbfs,
    lufsIntegrated: lufsI,
    lufsShortTerm: lufsS,
    rmsDb,
    noiseFloorDb,
    dynamicRangeDb,
    clippingSamples: clipCount,
    sampleRate: sr,
    bitDepthLabel: "32-bit Float",
    inputGainPct: 100,
    latencyMs: Number(opts.latencyMs) || 0,
    analysisNote: "Raw buffer after count-in trim · BS.1770-4 K-weight · EBU R128 gating",
  };

  return { ...metrics, diagnostics: buildDiagnostics(metrics) };
}

/* ---- Sample peak (unweighted dBFS) ---- */

function measureSamplePeak(ch0, ch1) {
  let peak = 0;
  let clipCount = 0;
  for (let i = 0; i < ch0.length; i++) {
    const a = Math.max(Math.abs(ch0[i]), Math.abs(ch1[i]));
    if (a >= 0.999) clipCount += 1;
    if (a > peak) peak = a;
  }
  return { peak, clipCount };
}

/* ---- BS.1770 K-weighting via OfflineAudioContext (read-only copy) ---- */

async function kWeightStereo(buffer) {
  const sr = buffer.sampleRate;
  const len = buffer.length;
  const AC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  if (!AC) return [buffer.getChannelData(0).slice(), (buffer.numberOfChannels > 1
    ? buffer.getChannelData(1) : buffer.getChannelData(0)).slice()];

  async function weightChannel(chIndex) {
    const off = new AC(1, len, sr);
    const mono = off.createBuffer(1, len, sr);
    mono.copyToChannel(buffer.getChannelData(chIndex), 0);
    const src = off.createBufferSource();
    src.buffer = mono;

    const shelf = off.createBiquadFilter();
    shelf.type = "highshelf";
    shelf.frequency.value = 1681.974;
    shelf.gain.value = 4.0;
    shelf.Q.value = 0.707;

    const hp = off.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 38.135;
    hp.Q.value = 0.5003;

    src.connect(shelf).connect(hp).connect(off.destination);
    src.start(0);
    const rendered = await off.startRendering();
    return rendered.getChannelData(0).slice();
  }

  const kL = await weightChannel(0);
  const kR = buffer.numberOfChannels > 1 ? await weightChannel(1) : kL;
  return [kL, kR];
}

/* ---- 400 ms overlapping blocks (75% overlap = 100 ms hop) ---- */

function buildLoudnessBlocks(kL, kR, sr) {
  const block = Math.max(1, Math.round((BLOCK_MS / 1000) * sr));
  const hop = Math.max(1, Math.round((HOP_MS / 1000) * sr));
  const blocks = [];
  for (let off = 0; off + block <= kL.length; off += hop) {
    let sum = 0;
    for (let i = 0; i < block; i++) {
      const l = kL[off + i];
      const r = kR[off + i];
      sum += 0.5 * (l * l + r * r);
    }
    const ms = sum / block;
    if (ms <= 1e-20) continue;
    const L = -0.691 + 10 * Math.log10(ms);
    blocks.push({ ms, L, off, block });
  }
  return blocks;
}

/** EBU R128 integrated loudness — absolute + relative gating. */
function integratedLoudnessGated(blocks) {
  if (!blocks.length) return -70;

  let gated = blocks.filter((b) => b.L > ABS_GATE_LUFS);
  if (!gated.length) return -70;

  let meanMs = gated.reduce((s, b) => s + b.ms, 0) / gated.length;
  let J = -0.691 + 10 * Math.log10(meanMs);

  const relTh = J - REL_GATE_LU;
  gated = gated.filter((b) => b.L > relTh);
  if (!gated.length) return J;

  meanMs = gated.reduce((s, b) => s + b.ms, 0) / gated.length;
  return -0.691 + 10 * Math.log10(meanMs);
}

/** EBU R128 short-term — 3 s window, 100 ms hop, absolute gate only; report max (loudest phrase). */
function maxShortTermLoudness(kL, kR, sr) {
  const win = Math.max(1, Math.round((SHORT_TERM_MS / 1000) * sr));
  const hop = Math.max(1, Math.round((HOP_MS / 1000) * sr));
  let best = -70;

  for (let off = 0; off + win <= kL.length; off += hop) {
    let sum = 0;
    for (let i = 0; i < win; i++) {
      const l = kL[off + i];
      const r = kR[off + i];
      sum += 0.5 * (l * l + r * r);
    }
    const ms = sum / win;
    if (ms <= 1e-20) continue;
    const L = -0.691 + 10 * Math.log10(ms);
    if (L > ABS_GATE_LUFS && L > best) best = L;
  }
  return best;
}

/** RMS of K-weighted samples in blocks that pass the relative loudness gate. */
function activeRmsDb(kL, kR, blocks) {
  if (!blocks.length) return -70;

  let gated = blocks.filter((b) => b.L > ABS_GATE_LUFS);
  if (!gated.length) return -70;

  let meanMs = gated.reduce((s, b) => s + b.ms, 0) / gated.length;
  const J = -0.691 + 10 * Math.log10(meanMs);
  const relTh = J - REL_GATE_LU;
  gated = gated.filter((b) => b.L > relTh);
  if (!gated.length) return ampToDb(Math.sqrt(meanMs));

  let sum = 0;
  let count = 0;
  for (const b of gated) {
    for (let i = 0; i < b.block; i++) {
      const idx = b.off + i;
      if (idx >= kL.length) break;
      sum += 0.5 * (kL[idx] * kL[idx] + kR[idx] * kR[idx]);
      count += 1;
    }
  }
  if (!count) return -70;
  return ampToDb(Math.sqrt(sum / count));
}

/** 10th-percentile K-weighted RMS of 400 ms blocks (quietest passages). */
function estimateNoiseFloorDb(blocks) {
  if (!blocks.length) return -70;
  const sorted = [...blocks].sort((a, b) => a.ms - b.ms);
  const idx = Math.floor(sorted.length * 0.10);
  const ms = sorted[Math.min(idx, sorted.length - 1)].ms;
  return ampToDb(Math.sqrt(ms));
}

function buildDiagnostics(m) {
  const lines = [];
  const peak = m.peakDbfs;
  const lufs = m.lufsIntegrated;
  const lufsS = m.lufsShortTerm;
  const noise = m.noiseFloorDb;
  const clips = m.clippingSamples;

  if (clips > 0) {
    lines.push({ level: "warn", text: "Mic clipping detected" });
  } else if (Number.isFinite(peak) && peak > -1) {
    lines.push({ level: "warn", text: "Peaks very hot — clipping risk" });
  } else {
    lines.push({ level: "ok", text: "No clipping detected" });
  }

  if (Number.isFinite(lufs)) {
    if (lufs < -24) lines.push({ level: "warn", text: "Vocal recorded too quietly" });
    else if (lufs < -18) lines.push({ level: "ok", text: "Vocal is slightly quiet" });
    else if (lufs <= -10) lines.push({ level: "ok", text: "Healthy recording level" });
    else lines.push({ level: "warn", text: "Input level very hot" });
  }

  if (Number.isFinite(lufsS) && lufsS < -22 && Number.isFinite(lufs) && lufs < -20) {
    lines.push({ level: "warn", text: "Very low input level" });
  } else if (Number.isFinite(peak) && peak < -28) {
    lines.push({ level: "warn", text: "Peak level very low" });
  }

  if (Number.isFinite(noise)) {
    if (noise > -45) lines.push({ level: "warn", text: "Background noise detected" });
    else if (noise > -55) lines.push({ level: "ok", text: "Background noise: Moderate" });
    else lines.push({ level: "ok", text: "Background noise: Low" });
  }

  if (clips === 0 && Number.isFinite(lufs) && lufs >= -18 && lufs <= -10
      && Number.isFinite(noise) && noise <= -55) {
    lines.push({ level: "ok", text: "Recording is clean" });
  }

  return lines;
}

function ampToDb(a) {
  if (!Number.isFinite(a) || a <= 0) return -Infinity;
  return 20 * Math.log10(a);
}

export function formatDb(v, digits = 1) {
  if (!Number.isFinite(v)) return "—";
  return `${v.toFixed(digits)} dB`;
}

export function formatDbfs(v, digits = 1) {
  if (!Number.isFinite(v)) return "—";
  return `${v.toFixed(digits)} dBFS`;
}

export function formatLufs(v, suffix = "", digits = 1) {
  if (!Number.isFinite(v)) return "—";
  return `${v.toFixed(digits)} LUFS${suffix}`;
}
