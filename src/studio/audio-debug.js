/**
 * Nabad Studio — internal audio debug (developer-only).
 * Read-only analysis of raw takes. No DSP, no mutation.
 */

const DEBUG_KEY = "nabad.studio.audioDebug.v1";

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
 * @param {AudioBuffer} buffer
 * @param {{ takeIndex?: number, latencyMs?: number }} opts
 */
export function analyzeRawTake(buffer, opts = {}) {
  if (!buffer) return null;
  const ch0 = buffer.getChannelData(0);
  const ch1 = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : ch0;
  const sr = buffer.sampleRate;
  const n = ch0.length;

  let peak = 0;
  let clipCount = 0;
  for (let i = 0; i < n; i++) {
    const a = Math.max(Math.abs(ch0[i]), Math.abs(ch1[i]));
    if (a >= 0.999) clipCount += 1;
    if (a > peak) peak = a;
  }

  let sumSq = 0;
  for (let i = 0; i < n; i++) {
    const m = (ch0[i] + ch1[i]) * 0.5;
    sumSq += m * m;
  }
  const rms = n ? Math.sqrt(sumSq / n) : 0;

  const peakDb = ampToDb(peak);
  const rmsDb = ampToDb(rms);
  const lufsI = measureIntegratedLufs([ch0, ch1], sr);
  const lufsS = measureShortTermLufs([ch0, ch1], sr);
  const noiseFloorDb = estimateNoiseFloorDb(ch0, ch1, sr);
  const dynamicRangeDb = Number.isFinite(peakDb) && Number.isFinite(noiseFloorDb)
    ? peakDb - noiseFloorDb
    : 0;

  const metrics = {
    takeIndex: opts.takeIndex ?? 1,
    durationSec: buffer.duration,
    peakDbfs: peakDb,
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
  };

  return { ...metrics, diagnostics: buildDiagnostics(metrics) };
}

function buildDiagnostics(m) {
  const lines = [];
  const peak = m.peakDbfs;
  const lufs = m.lufsIntegrated;
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
    if (lufs < -28) lines.push({ level: "warn", text: "Vocal recorded too quietly" });
    else if (lufs < -22) lines.push({ level: "ok", text: "Vocal is slightly quiet" });
    else if (lufs <= -12) lines.push({ level: "ok", text: "Healthy recording level" });
    else lines.push({ level: "warn", text: "Input level very hot" });
  }

  if (Number.isFinite(peak) && peak < -30) {
    lines.push({ level: "warn", text: "Very low input level" });
  }

  if (Number.isFinite(noise)) {
    if (noise > -42) lines.push({ level: "warn", text: "Background noise detected" });
    else if (noise > -50) lines.push({ level: "ok", text: "Background noise: Moderate" });
    else lines.push({ level: "ok", text: "Background noise: Low" });
  }

  if (clips === 0 && Number.isFinite(lufs) && lufs >= -22 && lufs <= -12
      && Number.isFinite(noise) && noise <= -50) {
    lines.push({ level: "ok", text: "Recording is clean" });
  }

  return lines;
}

function ampToDb(a) {
  if (!Number.isFinite(a) || a <= 0) return -Infinity;
  return 20 * Math.log10(a);
}

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
    if (ms > 1e-10) { sum += ms; count += 1; }
  }
  if (!count) return -70;
  return -0.691 + 10 * Math.log10(sum / count);
}

/** Max 3 s block loudness (short-term). */
function measureShortTermLufs(chans, sampleRate) {
  const L = chans[0];
  const R = chans[1] || chans[0];
  const block = Math.max(1, Math.floor(3 * sampleRate));
  let best = -70;
  for (let off = 0; off + block <= L.length; off += Math.floor(0.4 * sampleRate)) {
    let ms = 0;
    for (let i = 0; i < block; i++) {
      const idx = off + i;
      const m = (L[idx] + R[idx]) * 0.5;
      ms += m * m;
    }
    ms /= block;
    if (ms <= 1e-10) continue;
    const lufs = -0.691 + 10 * Math.log10(ms);
    if (lufs > best) best = lufs;
  }
  return best;
}

function estimateNoiseFloorDb(ch0, ch1, sr) {
  const win = Math.max(1, Math.floor(0.05 * sr));
  const rmsLevels = [];
  for (let off = 0; off + win <= ch0.length; off += win) {
    let sum = 0;
    for (let i = 0; i < win; i++) {
      const m = (ch0[off + i] + ch1[off + i]) * 0.5;
      sum += m * m;
    }
    rmsLevels.push(Math.sqrt(sum / win));
  }
  if (!rmsLevels.length) return -70;
  rmsLevels.sort((a, b) => a - b);
  const idx = Math.floor(rmsLevels.length * 0.08);
  return ampToDb(rmsLevels[idx] || rmsLevels[0]);
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
