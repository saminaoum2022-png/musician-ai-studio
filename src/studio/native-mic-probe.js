/**
 * Dev-only bridge to NativeMicProbePlugin (iOS AVAudioSession + AVAudioEngine probe).
 */

const PREP_SESSION_KEY = "nabad.studio.nativeSessionPrep.v1";

function plugin() {
  try {
    return window?.Capacitor?.Plugins?.NativeMicProbe || null;
  } catch {
    return null;
  }
}

export function isNativeMicProbeAvailable() {
  return !!plugin()?.getSessionInfo;
}

export function getNativeSessionPrepEnabled() {
  try { return localStorage.getItem(PREP_SESSION_KEY) === "1"; } catch { return false; }
}

export function setNativeSessionPrepEnabled(on) {
  try { localStorage.setItem(PREP_SESSION_KEY, on ? "1" : "0"); } catch {}
}

export async function fetchNativeSessionInfo() {
  const p = plugin();
  if (!p?.getSessionInfo) return null;
  return p.getSessionInfo();
}

export async function prepareNativeRecordingSession() {
  const p = plugin();
  if (!p?.prepareRecordingSession) throw new Error("NativeMicProbe not available");
  return p.prepareRecordingSession();
}

/** Record ~durationSec via AVAudioEngine input tap; returns peak/RMS + wavPath. */
export async function runNativeMicProbe(durationSec = 5) {
  const p = plugin();
  if (!p?.recordProbe) throw new Error("NativeMicProbe not available");
  return p.recordProbe({ durationSec, configureSession: true });
}

export function formatNativeSessionSummary(info) {
  if (!info) return "—";
  const cat = info.category || "?";
  const mode = info.mode || "?";
  const inPort = info.inputs?.[0]?.portName || "none";
  const inType = info.inputs?.[0]?.portType || "";
  const sr = info.sampleRate ? `${Math.round(info.sampleRate)} Hz` : "?";
  return `${cat} · ${mode} · in: ${inPort} (${inType}) · ${sr}`;
}

export function buildNativeVsWebCompareHtml(webAnalysis, nativeProbe) {
  if (!webAnalysis && !nativeProbe) return "";
  const fmtDb = (v) => (Number.isFinite(v) ? `${v.toFixed(1)} dB` : "—");
  const delta = (a, b) => (Number.isFinite(a) && Number.isFinite(b) ? b - a : null);
  const fmtD = (d) => (d == null ? "—" : `${d >= 0 ? "+" : ""}${d.toFixed(1)} dB`);

  const rows = [
    { label: "Peak dBFS", web: webAnalysis?.peakDbfs, native: nativeProbe?.peakDbfs },
    { label: "RMS", web: webAnalysis?.rmsDb, native: nativeProbe?.rmsDb },
    { label: "LUFS-I", web: webAnalysis?.lufsIntegrated, native: null },
    { label: "Noise floor", web: webAnalysis?.noiseFloorDb, native: null },
  ];

  const body = rows.map((r) => {
    const d = delta(r.web, r.native);
    return `<tr><td>${r.label}</td><td>${fmtDb(r.web)}</td><td>${fmtDb(r.native)}</td><td>${fmtD(d)}</td></tr>`;
  }).join("");

  return `
    <div class="studioAudioDebugCompare">
      <span class="studioAudioDebugVoiceTitle">Native AVAudioEngine vs Web AudioWorklet</span>
      <table class="studioAudioDebugCompareTable">
        <thead><tr><th>Metric</th><th>Web</th><th>Native</th><th>Δ native−web</th></tr></thead>
        <tbody>${body}</tbody>
      </table>
      <p class="studioAudioDebugCompareHint">Run native probe while singing at the same level. Large Δ confirms WKWebView/session issue, not analyzer math.</p>
    </div>`;
}
