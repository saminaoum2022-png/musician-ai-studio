import { generateArrangement, randomizeParams } from "./arrangement.js";
import { renderArrangementToWav } from "./render.js";
import { recordHumToMelody } from "./melody/extract.js";
import { mixStemsToWav } from "./studio/mixer.js";
import { encodeWav16 } from "./wav.js";

const els = {
  sunoPrompt: document.getElementById("sunoPrompt"),
  sunoStyle: document.getElementById("sunoStyle"),
  sunoMaqam: document.getElementById("sunoMaqam"),
  sunoTitle: document.getElementById("sunoTitle"),
  sunoModel: document.getElementById("sunoModel"),
  sunoVocalGender: document.getElementById("sunoVocalGender"),
  sunoCustomMode: document.getElementById("sunoCustomMode"),
  sunoInstrumental: document.getElementById("sunoInstrumental"),
  btnSunoGenerate: document.getElementById("btnSunoGenerate"),
  btnSunoRefresh: document.getElementById("btnSunoRefresh"),
  btnSunoStems: document.getElementById("btnSunoStems"),
  btnSunoMultiStems: document.getElementById("btnSunoMultiStems"),
  btnSunoCredits: document.getElementById("btnSunoCredits"),
  sunoCredits: document.getElementById("sunoCredits"),
  sunoCreditsNote: document.getElementById("sunoCreditsNote"),
  sunoOut: document.getElementById("sunoOut"),
  sunoStemsOut: document.getElementById("sunoStemsOut"),
  sunoFullLink: document.getElementById("sunoFullLink"),
  sunoVocalLink: document.getElementById("sunoVocalLink"),
  sunoInstLink: document.getElementById("sunoInstLink"),
  btnPlayFull: document.getElementById("btnPlayFull"),
  btnPlayVocals: document.getElementById("btnPlayVocals"),
  btnPlayInstrumental: document.getElementById("btnPlayInstrumental"),
  btnMixerLoad: document.getElementById("btnMixerLoad"),
  btnMixerPlay: document.getElementById("btnMixerPlay"),
  btnMixerStop: document.getElementById("btnMixerStop"),
  btnMixerExport: document.getElementById("btnMixerExport"),
  mixerDownloadLink: document.getElementById("mixerDownloadLink"),
  mixerList: document.getElementById("mixerList"),
  btnBetaTopup: document.getElementById("btnBetaTopup"),
  btnOpenBilling: document.getElementById("btnOpenBilling"),
  btnCreditsHistoryRefresh: document.getElementById("btnCreditsHistoryRefresh"),
  btnCreditsHistoryClear: document.getElementById("btnCreditsHistoryClear"),
  creditsHistoryOut: document.getElementById("creditsHistoryOut"),
  btnPlayerPlay: document.getElementById("btnPlayerPlay"),
  btnPlayerPause: document.getElementById("btnPlayerPause"),
  btnPlayerStop: document.getElementById("btnPlayerStop"),
  playerSeek: document.getElementById("playerSeek"),
  playerVol: document.getElementById("playerVol"),
  playerTime: document.getElementById("playerTime"),
  playerSource: document.getElementById("playerSource"),
  playerArt: document.getElementById("playerArt"),
  playerTitle: document.getElementById("playerTitle"),
  playerSubtitle: document.getElementById("playerSubtitle"),
  btnLoadFull: document.getElementById("btnLoadFull"),
  btnLoadVocals: document.getElementById("btnLoadVocals"),
  btnLoadInstrumental: document.getElementById("btnLoadInstrumental"),

  // Multitrack session (Vocal Room)
  btnSessionLoadSuno: document.getElementById("btnSessionLoadSuno"),
  sessionUploadStems: document.getElementById("sessionUploadStems"),
  btnSessionClear: document.getElementById("btnSessionClear"),
  sessionStatus: document.getElementById("sessionStatus"),
  btnSessionPlay: document.getElementById("btnSessionPlay"),
  btnSessionStop: document.getElementById("btnSessionStop"),
  btnSessionExport: document.getElementById("btnSessionExport"),
  sessionDownload: document.getElementById("sessionDownload"),
  sessionTracks: document.getElementById("sessionTracks"),

  vocalPreset: document.getElementById("vocalPreset"),
  vocalMonitor: document.getElementById("vocalMonitor"),
  btnVocalArm: document.getElementById("btnVocalArm"),
  btnVocalRec: document.getElementById("btnVocalRec"),
  btnVocalStop: document.getElementById("btnVocalStop"),
  vocalStatus: document.getElementById("vocalStatus"),
  vocalTakes: document.getElementById("vocalTakes"),

  style: document.getElementById("style"),
  bpm: document.getElementById("bpm"),
  bars: document.getElementById("bars"),
  keyCenter: document.getElementById("keyCenter"),
  scale: document.getElementById("scale"),
  meter: document.getElementById("meter"),
  lyrics: document.getElementById("lyrics"),
  useAi: document.getElementById("useAi"),
  btnNewTake: document.getElementById("btnNewTake"),
  btnHumStart: document.getElementById("btnHumStart"),
  btnHumStop: document.getElementById("btnHumStop"),
  btnHumClear: document.getElementById("btnHumClear"),
  melodyOut: document.getElementById("melodyOut"),

  instOud: document.getElementById("instOud"),
  instViolin: document.getElementById("instViolin"),
  instPiano: document.getElementById("instPiano"),
  instTabla: document.getElementById("instTabla"),

  btnGenerate: document.getElementById("btnGenerate"),
  btnRandomize: document.getElementById("btnRandomize"),
  btnRender: document.getElementById("btnRender"),
  btnPlay: document.getElementById("btnPlay"),
  downloadLink: document.getElementById("downloadLink"),
  btnVoice: document.getElementById("btnVoice"),
  btnVoicePlay: document.getElementById("btnVoicePlay"),
  voiceDownloadLink: document.getElementById("voiceDownloadLink"),

  arrangementOut: document.getElementById("arrangementOut"),
  progressBar: document.getElementById("progressBar"),
  status: document.getElementById("status"),
  globalLoading: document.getElementById("globalLoading"),
  loadingTitle: document.getElementById("loadingTitle"),
  loadingSub: document.getElementById("loadingSub"),

  btnEnterApp: document.getElementById("btnEnterApp"),
  btnStartHelp: document.getElementById("btnStartHelp"),
  startHelp: document.getElementById("startHelp"),
};

function applyRoute() {
  const hash = String(location.hash || "");
  const route = hash.startsWith("#/") ? hash.slice(2) : "generate";
  const wanted = route || "generate";
  document.body.classList.toggle("isStart", wanted === "start");

  document.querySelectorAll("[data-route]").forEach((el) => {
    el.style.display = el.getAttribute("data-route") === wanted ? "" : "none";
  });
  document.querySelectorAll("[data-route-link]").forEach((a) => {
    a.classList.toggle("active", a.getAttribute("data-route-link") === wanted);
  });
}

window.addEventListener("hashchange", applyRoute);
if (!location.hash) location.hash = "#/start";
applyRoute();

function normalizeMaqamValue(v) {
  return String(v || "")
    .replaceAll("_", " ")
    .replace(/\s+/g, " ")
    .trim();
}

function applyMaqamToStyleInput() {
  if (!els.sunoMaqam || !els.sunoStyle) return;
  const maqam = normalizeMaqamValue(els.sunoMaqam.value);
  const base = String(els.sunoStyle.value || "").trim();
  // Remove any previous "maqam:" tag to avoid duplicates.
  const cleaned = base
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((t) => !/^maqam\s*:/i.test(t))
    .join(", ");
  const next = maqam ? [cleaned, `Maqam: ${maqam}`].filter(Boolean).join(", ") : cleaned;
  els.sunoStyle.value = next;
}

function openBilling() {
  window.open("https://sunoapi.org/billing", "_blank", "noopener,noreferrer");
  setStatus("Opened billing. After topping up, come back and click “Refresh credits”.");
}

/** @type {import("./types.js").Arrangement | null} */
let currentArrangement = null;
/** @type {Blob | null} */
let currentWav = null;
/** @type {HTMLAudioElement | null} */
let audioEl = null;
/** @type {Blob | null} */
let currentVoice = null;
/** @type {HTMLAudioElement | null} */
let voiceEl = null;
/** @type {import("./melody/extract.js").Melody | null} */
let currentMelody = null;
/** @type {{ stop: () => void } | null} */
let humSession = null;
let variationSeed = String(Date.now());
let sunoTaskId = null;
let sunoAudioId = null;
let sunoStemsTaskId = null;
let sunoMultiStemsTaskId = null;
/** @type {Array<{ name:string, url:string, gain:number, pan?:number, muted?:boolean }>} */
let mixerStems = [];
/** @type {HTMLAudioElement[]} */
let mixerAudioEls = [];
let mixerIsPlaying = false;

// In-app player for Suno outputs
/** @type {HTMLAudioElement | null} */
let playerEl = null;
let playerLoadedLabel = "";
let playerSeekDragging = false;
let lastSunoFullUrl = "";
let lastSunoVocalUrl = "";
let lastSunoInstUrl = "";
let lastSunoArtUrl = "";
let lastSunoTitle = "";

// Vocal Room state
/** @type {AudioContext | null} */
let vocalCtx = null;
/** @type {MediaStream | null} */
let vocalMicStream = null;
/** @type {MediaRecorder | null} */
let vocalRecorder = null;
/** @type {MediaStreamAudioSourceNode | null} */
let vocalMicSource = null;
/** @type {MediaStreamAudioDestinationNode | null} */
let vocalRecordDest = null;
/** @type {GainNode | null} */
let vocalInputGainNode = null;
/** @type {GainNode | null} */
let vocalFxOutGainNode = null;
/** @type {Array<{ id:string, ts:number, preset:string, blob:Blob, url:string, label:string }>} */
let vocalTakes = [];
let vocalIsRecording = false;
/** @type {Blob | null} */
let lastVocalMixBlob = null;
let lastStudioMixBlob = null;
let lastStudioMixUrl = "";
let vocalSelectedTakeId = "";

// Multitrack session state (Vocal Room)
/**
 * @typedef {{ id:string, trackId:string, label:string, startSec:number, url?:string, blob?:Blob, sourceType:'url'|'blob', kind:'stem'|'vocal' }} SessionClip
 * @typedef {{ id:string, name:string, kind:'stem'|'vocal', gain:number, pan:number, muted:boolean, solo:boolean, clips:SessionClip[] }} SessionTrack
 */
/** @type {{ tracks: SessionTrack[] }} */
let session = { tracks: [] };
let sessionIsPlaying = false;
/** @type {AudioContext | null} */
let sessionCtx = null;
/** @type {AudioBuffer | null} */
let sessionBackingCache = null;
/** @type {Map<string, AudioBuffer>} */
const sessionBufferCache = new Map();
/** @type {Array<{ stop:() => void }>} */
let sessionPlayingNodes = [];
let sessionLastExportUrl = "";
const SESSION_VOCAL_TRACK_ID = "track_vocal";

function setVocalStatus(msg) {
  if (els.vocalStatus) els.vocalStatus.textContent = msg || "";
}

function setSessionStatus(msg) {
  if (els.sessionStatus) els.sessionStatus.textContent = msg || "";
}

function safeRevokeObjectUrl(url) {
  try {
    if (url) URL.revokeObjectURL(url);
  } catch {}
}

function setSessionDownloadUrl(url) {
  if (els.sessionDownload) {
    els.sessionDownload.href = url || "#";
    els.sessionDownload.classList.toggle("disabled", !url);
  }
}

function randomId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function ensureVocalTrack() {
  let t = session.tracks.find((x) => x.id === SESSION_VOCAL_TRACK_ID);
  if (!t) {
    t = {
      id: SESSION_VOCAL_TRACK_ID,
      name: "Vocal",
      kind: "vocal",
      gain: 1,
      pan: 0,
      muted: false,
      solo: false,
      clips: [],
    };
    session.tracks.unshift(t);
  }
  return t;
}

function clearSession() {
  for (const tr of session.tracks) {
    for (const c of tr.clips || []) {
      if (c.sourceType === "url" && c.url && c.url.startsWith("blob:")) safeRevokeObjectUrl(c.url);
    }
  }
  session = { tracks: [] };
  ensureVocalTrack();
  sessionBufferCache.clear();
  sessionPlayingNodes = [];
  sessionIsPlaying = false;
  if (sessionLastExportUrl) safeRevokeObjectUrl(sessionLastExportUrl);
  sessionLastExportUrl = "";
  setSessionDownloadUrl("");
  setSessionStatus("Session cleared.");
  renderSessionTracks();
  renderVocalTakes();
}

function getSessionAudibleTracks() {
  const anySolo = session.tracks.some((t) => t.solo);
  return session.tracks.filter((t) => {
    if (t.muted) return false;
    if (anySolo) return t.solo;
    return true;
  });
}

function updateSessionButtons() {
  const hasClips = session.tracks.some((t) => (t.clips || []).length > 0);
  if (els.btnSessionPlay) els.btnSessionPlay.disabled = !hasClips;
  if (els.btnSessionStop) els.btnSessionStop.disabled = !sessionIsPlaying;
  if (els.btnSessionExport) els.btnSessionExport.disabled = !hasClips;
}

function renderSessionTracks() {
  if (!els.sessionTracks) return;
  if (!session.tracks.length) ensureVocalTrack();

  const tracksHtml = session.tracks
    .map((t) => {
      const clip = (t.clips || [])[0] || null;
      const offset = clip ? clampNum(clip.startSec ?? 0, -10, 600) : 0;
      const clipLabel = clip ? clip.label : "—";
      const clipSrc = clip ? (clip.sourceType === "url" ? "url" : "blob") : "";

      return `
        <div class="trackRow">
          <div style="flex:1; min-width:240px">
            <div class="trackName">${t.name} ${t.kind === "vocal" ? '<span class="chip">Vocal</span>' : ""}</div>
            <div class="trackTiny">clip: ${clipLabel} ${clip ? `(${clipSrc})` : ""}</div>
          </div>

          <div class="trackCtl">
            <label class="trackTiny"><input type="checkbox" data-trk-mute="${t.id}" ${t.muted ? "checked" : ""}/> mute</label>
            <label class="trackTiny"><input type="checkbox" data-trk-solo="${t.id}" ${t.solo ? "checked" : ""}/> solo</label>
          </div>

          <div class="trackCtl">
            <span class="trackTiny">vol</span>
            <input type="range" min="0" max="2" step="0.01" value="${t.gain}" data-trk-gain="${t.id}" />
          </div>

          <div class="trackCtl">
            <span class="trackTiny">pan</span>
            <input type="range" min="-1" max="1" step="0.01" value="${t.pan}" data-trk-pan="${t.id}" />
          </div>

          <div class="trackCtl">
            <span class="trackTiny">offset(s)</span>
            <input type="number" step="0.01" value="${offset}" style="width:92px" data-clip-off="${t.id}" ${
              clip ? "" : "disabled"
            } />
          </div>

          <div class="trackCtl">
            ${t.id !== SESSION_VOCAL_TRACK_ID ? `<button class="ghost" data-trk-del="${t.id}">Remove</button>` : ""}
          </div>
        </div>
      `;
    })
    .join("");

  els.sessionTracks.innerHTML = tracksHtml || "No tracks yet.";

  els.sessionTracks.querySelectorAll("[data-trk-mute]").forEach((el) => {
    el.addEventListener("change", () => {
      const id = String(el.getAttribute("data-trk-mute") || "");
      const t = session.tracks.find((x) => x.id === id);
      if (!t) return;
      t.muted = Boolean(el.checked);
      renderSessionTracks();
      updateSessionButtons();
    });
  });
  els.sessionTracks.querySelectorAll("[data-trk-solo]").forEach((el) => {
    el.addEventListener("change", () => {
      const id = String(el.getAttribute("data-trk-solo") || "");
      const t = session.tracks.find((x) => x.id === id);
      if (!t) return;
      t.solo = Boolean(el.checked);
      renderSessionTracks();
      updateSessionButtons();
    });
  });
  els.sessionTracks.querySelectorAll("[data-trk-gain]").forEach((el) => {
    el.addEventListener("input", () => {
      const id = String(el.getAttribute("data-trk-gain") || "");
      const t = session.tracks.find((x) => x.id === id);
      if (!t) return;
      t.gain = clampNum(Number(el.value), 0, 2);
    });
  });
  els.sessionTracks.querySelectorAll("[data-trk-pan]").forEach((el) => {
    el.addEventListener("input", () => {
      const id = String(el.getAttribute("data-trk-pan") || "");
      const t = session.tracks.find((x) => x.id === id);
      if (!t) return;
      t.pan = clampNum(Number(el.value), -1, 1);
    });
  });
  els.sessionTracks.querySelectorAll("[data-clip-off]").forEach((el) => {
    el.addEventListener("change", () => {
      const trackId = String(el.getAttribute("data-clip-off") || "");
      const t = session.tracks.find((x) => x.id === trackId);
      if (!t) return;
      const c = (t.clips || [])[0];
      if (!c) return;
      c.startSec = clampNum(Number(el.value), -10, 600);
    });
  });
  els.sessionTracks.querySelectorAll("[data-trk-del]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = String(btn.getAttribute("data-trk-del") || "");
      const idx = session.tracks.findIndex((x) => x.id === id);
      if (idx < 0) return;
      const t = session.tracks[idx];
      for (const c of t.clips || []) {
        if (c.sourceType === "url" && c.url && c.url.startsWith("blob:")) safeRevokeObjectUrl(c.url);
      }
      session.tracks.splice(idx, 1);
      renderSessionTracks();
      updateSessionButtons();
    });
  });

  updateSessionButtons();
}

function addStemTrackFromUrl(name, url) {
  if (!url) return;
  const id = randomId("track");
  const clipId = randomId("clip");
  const t = /** @type {SessionTrack} */ ({
    id,
    name,
    kind: "stem",
    gain: 1,
    pan: 0,
    muted: false,
    solo: false,
    clips: [
      {
        id: clipId,
        trackId: id,
        label: name,
        startSec: 0,
        url,
        sourceType: "url",
        kind: "stem",
      },
    ],
  });
  session.tracks.push(t);
}

function addUploadedStemFile(file) {
  const url = URL.createObjectURL(file);
  addStemTrackFromUrl(file.name || "Uploaded", url);
}

function loadUploadedStemsIntoSession(files) {
  const vocal = ensureVocalTrack();
  // Keep Vocal track; remove existing stem tracks.
  session.tracks = [vocal];
  for (const f of files) addUploadedStemFile(f);
  renderSessionTracks();
}

function loadSunoMultiStemsIntoSession() {
  try {
    const raw = els.sunoStemsOut?.textContent || "";
    const obj = raw ? JSON.parse(raw) : null;
    const stems = stemsFromResponse(obj);
    if (!stems.length) {
      setSessionStatus("No multi-stems found yet. Generate multi-stems first.");
      return;
    }
    const vocal = ensureVocalTrack();
    session.tracks = [vocal];
    for (const s of stems) addStemTrackFromUrl(s.name, s.url);
    setSessionStatus(`Loaded ${stems.length} stem tracks.`);
    renderSessionTracks();
  } catch {
    setSessionStatus("Could not parse stems. Make sure multi-stems are SUCCESS and visible in Multi-stems panel.");
  }
}

function renderVocalTakes() {
  if (!els.vocalTakes) return;
  if (!vocalTakes.length) {
    els.vocalTakes.textContent = "No takes yet. Arm mic → Start recording.";
    if (els.btnVocalExport) els.btnVocalExport.disabled = true;
    return;
  }
  els.vocalTakes.innerHTML = vocalTakes
    .map((t, i) => {
      const dt = new Date(t.ts).toLocaleString();
      const selected = vocalSelectedTakeId ? t.id === vocalSelectedTakeId : i === 0;
      return `
        <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap; padding:10px; border:1px solid var(--border); border-radius:12px; margin-bottom:10px; background: rgba(10, 14, 22, 0.35);">
          <div style="flex:1; min-width:220px">
            <div style="font-weight:900">${t.label} ${selected ? '<span class="badge" style="margin-left:8px">Selected</span>' : ""}</div>
            <div class="small">${dt} • preset: ${t.preset}</div>
          </div>
          <button class="ghost" data-vtake-sel="${i}">Select</button>
          <button class="ghost" data-vtake-play="${i}">Play</button>
          <a class="ghost" href="${t.url}" download="vocal_take_${i + 1}.webm">Download take</a>
          <button class="ghost" data-vtake-del="${i}">Delete</button>
        </div>
      `;
    })
    .join("");

  els.vocalTakes.querySelectorAll("[data-vtake-sel]").forEach((b) => {
    b.addEventListener("click", () => {
      const i = Number(b.getAttribute("data-vtake-sel"));
      const t = vocalTakes[i];
      if (!t) return;
      vocalSelectedTakeId = t.id;
      renderVocalTakes();
      setVocalStatus(`Selected: ${t.label}`);
    });
  });
  els.vocalTakes.querySelectorAll("[data-vtake-play]").forEach((b) => {
    b.addEventListener("click", async () => {
      const i = Number(b.getAttribute("data-vtake-play"));
      const t = vocalTakes[i];
      if (!t) return;
      vocalSelectedTakeId = t.id;
      renderVocalTakes();
      await playOnPlayerPage(t.url, `Vocal take: ${t.label}`);
    });
  });
  els.vocalTakes.querySelectorAll("[data-vtake-del]").forEach((b) => {
    b.addEventListener("click", () => {
      const i = Number(b.getAttribute("data-vtake-del"));
      const t = vocalTakes[i];
      if (!t) return;
      safeRevokeObjectUrl(t.url);
      vocalTakes.splice(i, 1);
      if (vocalSelectedTakeId === t.id) vocalSelectedTakeId = "";
      renderVocalTakes();
    });
  });

  if (els.btnVocalExport) els.btnVocalExport.disabled = false;
}

function getVocalPreset() {
  return String(els.vocalPreset?.value || "clean");
}

function buildVocalFxChain(ctx, source, preset) {
  // Basic studio chain: HPF → (gate-ish) compressor → (tone) EQ → delay/reverb → output gain
  const inputGain = ctx.createGain();
  inputGain.gain.value = clampNum(Number(els.vocalVocalGain?.value ?? 1), 0, 1.5);

  const hpf = ctx.createBiquadFilter();
  hpf.type = "highpass";
  hpf.frequency.value = preset === "clean" ? 90 : 70;
  hpf.Q.value = 0.707;

  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = preset === "clean" ? -28 : -32;
  comp.knee.value = 24;
  comp.ratio.value = preset === "clean" ? 3.5 : 4.5;
  comp.attack.value = 0.006;
  comp.release.value = preset === "arabic_live" ? 0.22 : 0.18;

  const presence = ctx.createBiquadFilter();
  presence.type = "peaking";
  presence.frequency.value = 3500;
  presence.Q.value = 1.0;
  presence.gain.value = preset === "clean" ? 2.0 : 3.0;

  const sibilance = ctx.createBiquadFilter();
  sibilance.type = "highshelf";
  sibilance.frequency.value = 7800;
  sibilance.gain.value = preset === "studio_pop" ? 2.5 : 1.5;

  const dryGain = ctx.createGain();
  dryGain.gain.value = 1.0;

  const wetGain = ctx.createGain();
  wetGain.gain.value = preset === "clean" ? 0.12 : preset === "studio_pop" ? 0.18 : 0.28;

  const delay = ctx.createDelay(1.2);
  delay.delayTime.value = preset === "studio_pop" ? 0.16 : 0.12;
  const fb = ctx.createGain();
  fb.gain.value = preset === "arabic_live" ? 0.32 : 0.22;
  delay.connect(fb);
  fb.connect(delay);

  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 6500;
  lp.Q.value = 0.707;

  const outGain = ctx.createGain();
  outGain.gain.value = 1.0;

  // routing
  source.connect(inputGain);
  inputGain.connect(hpf);
  hpf.connect(comp);
  comp.connect(presence);
  presence.connect(sibilance);

  // dry
  sibilance.connect(dryGain);
  dryGain.connect(outGain);

  // wet (delay-ish)
  sibilance.connect(delay);
  delay.connect(lp);
  lp.connect(wetGain);
  wetGain.connect(outGain);

  return { out: outGain, inputGain, outGain };
}

async function armVocalMic() {
  if (vocalCtx && vocalMicStream && vocalMicSource && vocalRecordDest) return;

  setVocalStatus("Requesting microphone…");
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
    video: false,
  });

  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  const mic = ctx.createMediaStreamSource(stream);
  const dest = ctx.createMediaStreamDestination();

  const preset = getVocalPreset();
  const { out, inputGain } = buildVocalFxChain(ctx, mic, preset);

  // Always record the processed output.
  out.connect(dest);
  // Optional monitoring (hear yourself).
  if (els.vocalMonitor?.checked) out.connect(ctx.destination);

  vocalCtx = ctx;
  vocalMicStream = stream;
  vocalMicSource = mic;
  vocalRecordDest = dest;
  vocalInputGainNode = inputGain;
  vocalFxOutGainNode = out;

  setVocalStatus("Mic armed. Ready.");
  if (els.btnVocalRec) els.btnVocalRec.disabled = false;
  if (els.btnVocalStop) els.btnVocalStop.disabled = true;
}

function disarmVocalMic() {
  try {
    if (vocalRecorder && vocalRecorder.state !== "inactive") vocalRecorder.stop();
  } catch {}
  vocalRecorder = null;
  vocalIsRecording = false;

  try {
    if (vocalMicStream) vocalMicStream.getTracks().forEach((t) => t.stop());
  } catch {}
  vocalMicStream = null;

  try {
    vocalMicSource?.disconnect();
  } catch {}
  vocalMicSource = null;

  try {
    vocalInputGainNode?.disconnect();
  } catch {}
  vocalInputGainNode = null;

  try {
    vocalFxOutGainNode?.disconnect();
  } catch {}
  vocalFxOutGainNode = null;

  try {
    vocalRecordDest?.disconnect();
  } catch {}
  vocalRecordDest = null;

  try {
    vocalCtx?.close();
  } catch {}
  vocalCtx = null;

  if (els.btnVocalRec) els.btnVocalRec.disabled = true;
  if (els.btnVocalStop) els.btnVocalStop.disabled = true;
  setVocalStatus("Mic disarmed.");
}

async function startVocalRecording() {
  await armVocalMic();
  if (!vocalRecordDest) return;
  if (vocalIsRecording) return;

  const mimeCandidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/ogg;codecs=opus",
    "audio/ogg",
  ];
  const mimeType = mimeCandidates.find((m) => {
    try {
      return window.MediaRecorder && MediaRecorder.isTypeSupported(m);
    } catch {
      return false;
    }
  });

  const chunks = [];
  const rec = new MediaRecorder(vocalRecordDest.stream, mimeType ? { mimeType } : undefined);
  rec.addEventListener("dataavailable", (e) => {
    if (e.data && e.data.size > 0) chunks.push(e.data);
  });
  rec.addEventListener("stop", () => {
    const blob = new Blob(chunks, { type: rec.mimeType || "audio/webm" });
    const url = URL.createObjectURL(blob);
    const preset = getVocalPreset();
    const id = `${Date.now()}_${Math.random().toString(16).slice(2)}`;
    const label = `Take ${vocalTakes.length + 1}`;
    vocalTakes.unshift({ id, ts: Date.now(), preset, blob, url, label });
    // Add as a clip in the vocal track (multitrack session).
    const vt = ensureVocalTrack();
    vt.clips = [
      {
        id: randomId("clip"),
        trackId: vt.id,
        label,
        startSec: 0,
        blob,
        sourceType: "blob",
        kind: "vocal",
      },
    ];
    renderSessionTracks();
    updateSessionButtons();
    renderVocalTakes();
    setVocalStatus("Recorded take saved.");
  });

  vocalRecorder = rec;
  vocalIsRecording = true;
  rec.start(250); // timeslice
  setVocalStatus("Recording…");
  if (els.btnVocalRec) els.btnVocalRec.disabled = true;
  if (els.btnVocalStop) els.btnVocalStop.disabled = false;
}

function stopVocalRecording() {
  if (!vocalRecorder) return;
  try {
    vocalRecorder.stop();
  } catch {}
  vocalIsRecording = false;
  if (els.btnVocalRec) els.btnVocalRec.disabled = false;
  if (els.btnVocalStop) els.btnVocalStop.disabled = true;
  setVocalStatus("Stopping…");
}

async function decodeAudioFromArrayBuffer(ctx, buf) {
  // decodeAudioData may detach; use slice to avoid weirdness in some browsers
  const ab = buf.slice ? buf.slice(0) : buf;
  return await ctx.decodeAudioData(ab);
}

async function fetchArrayBuffer(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Fetch failed (${r.status})`);
  return await r.arrayBuffer();
}

async function getClipAudioBuffer(clip) {
  const key = clip.sourceType === "url" ? `url:${clip.url}` : `blob:${clip.id}`;
  const cached = sessionBufferCache.get(key);
  if (cached) return cached;

  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  try {
    let ab;
    if (clip.sourceType === "url") {
      if (!clip.url) throw new Error("Missing clip url");
      ab = await fetchArrayBuffer(clip.url);
    } else {
      if (!clip.blob) throw new Error("Missing clip blob");
      ab = await clip.blob.arrayBuffer();
    }
    const buf = await decodeAudioFromArrayBuffer(ctx, ab);
    sessionBufferCache.set(key, buf);
    return buf;
  } finally {
    ctx.close().catch(() => {});
  }
}

async function playSession() {
  if (sessionIsPlaying) return;
  const audibleTracks = getSessionAudibleTracks();
  const pairs = audibleTracks.flatMap((t) => (t.clips || []).map((c) => ({ t, c })));
  if (!pairs.length) {
    setSessionStatus("No clips to play.");
    return;
  }

  setSessionStatus("Decoding audio…");
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  sessionCtx = ctx;
  try {
    await ctx.resume();
  } catch {}

  // decode all clips first for reliable sync
  const decoded = await Promise.all(
    pairs.map(async ({ t, c }) => {
      const buf = await getClipAudioBuffer(c);
      return { t, c, buf };
    })
  );

  const startAt = ctx.currentTime + 0.12;
  sessionPlayingNodes = [];
  sessionIsPlaying = true;
  updateSessionButtons();
  setSessionStatus("Playing…");

  for (const { t, c, buf } of decoded) {
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const g = ctx.createGain();
    g.gain.value = clampNum(t.gain ?? 1, 0, 2);
    src.connect(g);

    let out = g;
    if (typeof ctx.createStereoPanner === "function") {
      const pn = ctx.createStereoPanner();
      pn.pan.value = clampNum(t.pan ?? 0, -1, 1);
      g.connect(pn);
      out = pn;
    }
    out.connect(ctx.destination);

    const when = startAt + (Number(c.startSec) || 0);
    src.start(Math.max(startAt, when));
    sessionPlayingNodes.push({
      stop: () => {
        try {
          src.stop();
        } catch {}
        try {
          src.disconnect();
        } catch {}
      },
    });
  }
}

function stopSession() {
  for (const n of sessionPlayingNodes) {
    try {
      n.stop();
    } catch {}
  }
  sessionPlayingNodes = [];
  sessionIsPlaying = false;
  updateSessionButtons();
  setSessionStatus("Stopped.");
  try {
    sessionCtx?.close();
  } catch {}
  sessionCtx = null;
}

function getSelectedVocalTake() {
  if (!vocalTakes.length) return null;
  if (!vocalSelectedTakeId) return vocalTakes[0] || null;
  return vocalTakes.find((t) => t.id === vocalSelectedTakeId) || vocalTakes[0] || null;
}

async function exportSessionMixWav() {
  const audibleTracks = getSessionAudibleTracks();
  const clips = audibleTracks.flatMap((t) => (t.clips || []).map((c) => ({ t, c })));
  if (!clips.length) throw new Error("No clips to export");

  setSessionStatus("Preparing export…");
  setLoading(true, { title: "Exporting session…", sub: "Rendering WAV offline in your browser." });

  const decoded = await Promise.all(
    clips.map(async ({ t, c }) => {
      const buf = await getClipAudioBuffer(c);
      return { t, c, buf };
    })
  );

  const sampleRate = 44100;
  const maxDur = decoded.reduce((m, x) => Math.max(m, (x.c.startSec || 0) + (x.buf.duration || 0)), 0);
  const frames = Math.max(1, Math.ceil(maxDur * sampleRate));
  const off = new OfflineAudioContext(2, frames, sampleRate);

  for (const { t, c, buf } of decoded) {
    const src = off.createBufferSource();
    src.buffer = buf;
    const g = off.createGain();
    g.gain.value = clampNum(t.gain ?? 1, 0, 2);
    src.connect(g);
    let out = g;
    if (typeof off.createStereoPanner === "function") {
      const pn = off.createStereoPanner();
      pn.pan.value = clampNum(t.pan ?? 0, -1, 1);
      g.connect(pn);
      out = pn;
    }
    out.connect(off.destination);
    src.start(Math.max(0, Number(c.startSec) || 0));
  }

  const rendered = await off.startRendering();
  const wavBlob = encodeWav16([rendered.getChannelData(0), rendered.getChannelData(1)], rendered.sampleRate);

  if (sessionLastExportUrl) safeRevokeObjectUrl(sessionLastExportUrl);
  const url = URL.createObjectURL(wavBlob);
  sessionLastExportUrl = url;
  setSessionDownloadUrl(url);
  setSessionStatus("Export complete. Download is ready.");
}

function ensurePlayer() {
  if (playerEl) return playerEl;
  playerEl = new Audio();
  playerEl.preload = "auto";
  playerEl.crossOrigin = "anonymous";
  playerEl.addEventListener("timeupdate", syncPlayerUI);
  playerEl.addEventListener("loadedmetadata", syncPlayerUI);
  playerEl.addEventListener("ended", () => {
    if (els.btnPlayerPlay) els.btnPlayerPlay.disabled = false;
    if (els.btnPlayerPause) els.btnPlayerPause.disabled = true;
  });
  return playerEl;
}

function placeholderCoverDataUrl() {
  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="800" height="800" viewBox="0 0 800 800">
  <defs>
    <radialGradient id="g1" cx="25%" cy="10%" r="85%">
      <stop offset="0%" stop-color="#7c5cff" stop-opacity="0.55"/>
      <stop offset="55%" stop-color="#0b0d12" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="g2" cx="85%" cy="15%" r="85%">
      <stop offset="0%" stop-color="#23d5ab" stop-opacity="0.40"/>
      <stop offset="60%" stop-color="#0b0d12" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#121722"/>
      <stop offset="100%" stop-color="#0f1420"/>
    </linearGradient>
  </defs>
  <rect width="800" height="800" fill="url(#bg)"/>
  <rect width="800" height="800" fill="url(#g1)"/>
  <rect width="800" height="800" fill="url(#g2)"/>
  <g opacity="0.9">
    <text x="50" y="735" fill="#e7edf7" font-family="ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial" font-size="40" font-weight="900">NabadAi Music</text>
  </g>
</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg.trim())}`;
}

function setPlayerMeta({ title, subtitle, artUrl } = {}) {
  if (els.playerTitle) els.playerTitle.textContent = title || "Now Playing";
  if (els.playerSubtitle) els.playerSubtitle.textContent = subtitle || "";
  if (els.playerArt) els.playerArt.src = artUrl || placeholderCoverDataUrl();
}

function setPlayerSource(url, label) {
  const a = ensurePlayer();
  a.pause();
  a.src = url;
  a.currentTime = 0;
  playerLoadedLabel = label || "";
  if (els.playerSource) els.playerSource.textContent = label ? `Loaded: ${label}` : "";
  if (els.btnPlayerPlay) els.btnPlayerPlay.disabled = false;
  if (els.btnPlayerPause) els.btnPlayerPause.disabled = true;
  if (els.btnPlayerStop) els.btnPlayerStop.disabled = false;
  syncPlayerUI();
}

async function playOnPlayerPage(url, label) {
  if (!url) return;
  setPlayerSource(url, label);
  setPlayerMeta({
    title: lastSunoTitle || "Generated song",
    subtitle: label ? `Suno • ${label}` : "Suno",
    artUrl: lastSunoArtUrl,
  });
  location.hash = "#/player";
  // Give the route a moment to render, then play.
  const a = ensurePlayer();
  try {
    await a.play();
    if (els.btnPlayerPlay) els.btnPlayerPlay.disabled = true;
    if (els.btnPlayerPause) els.btnPlayerPause.disabled = false;
  } catch {
    setStatus("Playback blocked by the browser. Press Play once in the Player tab.");
  }
}

function formatTime(sec) {
  const s = Math.max(0, Math.floor(sec || 0));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
}

function syncPlayerUI() {
  if (!playerEl) return;
  const dur = Number.isFinite(playerEl.duration) ? playerEl.duration : 0;
  const cur = Number.isFinite(playerEl.currentTime) ? playerEl.currentTime : 0;
  if (els.playerTime) els.playerTime.textContent = `${formatTime(cur)} / ${formatTime(dur)}`;
  if (els.playerSeek && !playerSeekDragging) {
    const max = Number(els.playerSeek.max || 1000);
    els.playerSeek.value = dur > 0 ? String(Math.round((cur / dur) * max)) : "0";
  }
}

function getParams() {
  return {
    style: els.style.value,
    bpm: clampInt(parseInt(els.bpm.value, 10) || 96, 60, 180),
    bars: clampInt(parseInt(els.bars.value, 10) || 32, 8, 128),
    keyCenter: els.keyCenter.value,
    scale: els.scale.value,
    meter: els.meter.value,
    lyrics: (els.lyrics?.value || "").trim(),
    variationSeed,
  };
}

function setParams(p) {
  els.style.value = p.style;
  els.bpm.value = String(p.bpm);
  els.bars.value = String(p.bars);
  els.keyCenter.value = p.keyCenter;
  els.scale.value = p.scale;
  els.meter.value = p.meter;
  if (els.lyrics) els.lyrics.value = p.lyrics || els.lyrics.value || "";
}

function getInstrumentFlags() {
  return {
    oud: els.instOud.checked,
    violin: els.instViolin.checked,
    piano: els.instPiano.checked,
    tabla: els.instTabla.checked,
  };
}

function setStatus(text) {
  els.status.textContent = text;
}

function setProgress(pct) {
  els.progressBar.style.width = `${Math.max(0, Math.min(100, pct))}%`;
}

let busyCount = 0;
function setLoading(on, { title, sub } = {}) {
  busyCount = Math.max(0, busyCount + (on ? 1 : -1));
  const show = busyCount > 0;
  if (els.globalLoading) els.globalLoading.style.display = show ? "" : "none";
  if (show) {
    if (els.loadingTitle && title) els.loadingTitle.textContent = title;
    if (els.loadingSub && sub) els.loadingSub.textContent = sub;
  }
}

function printArrangement(a) {
  els.arrangementOut.textContent = JSON.stringify(a, null, 2);
}

function printMelody(m) {
  if (!els.melodyOut) return;
  els.melodyOut.textContent = m ? JSON.stringify(m, null, 2) : "";
}

function printSuno(obj) {
  if (!els.sunoOut) return;
  els.sunoOut.textContent = obj ? JSON.stringify(obj, null, 2) : "";
}

function printSunoStems(obj) {
  if (!els.sunoStemsOut) return;
  els.sunoStemsOut.textContent = obj ? JSON.stringify(obj, null, 2) : "";
}

function renderMixerList() {
  if (!els.mixerList) return;
  if (!mixerStems.length) {
    els.mixerList.textContent = "No stems loaded yet.";
    return;
  }
  els.mixerList.innerHTML = mixerStems
    .map((s, idx) => {
      const muted = s.muted ? "checked" : "";
      const gain = typeof s.gain === "number" ? s.gain : 1;
      const safeName = escapeHtml(s.name);
      return `
        <div style="display:flex; gap:10px; align-items:center; padding:8px 0; border-bottom: 1px solid rgba(255,255,255,0.06)">
          <div style="min-width:140px; font-weight:800">${safeName}</div>
          <label style="display:flex; gap:8px; align-items:center; color: var(--muted); font-size:12px;">
            <input data-mute="${idx}" type="checkbox" ${muted}/> mute
          </label>
          <label style="display:flex; gap:8px; align-items:center; color: var(--muted); font-size:12px;">
            vol <input data-gain="${idx}" type="range" min="0" max="1.5" step="0.01" value="${gain}" />
            <span style="min-width:42px; text-align:right">${gain.toFixed(2)}</span>
          </label>
          <a class="ghost" style="padding:6px 10px" href="${s.url}" target="_blank" rel="noreferrer">open</a>
        </div>
      `;
    })
    .join("");

  els.mixerList.querySelectorAll("input[data-gain]").forEach((el) => {
    el.addEventListener("input", () => {
      const i = Number(el.getAttribute("data-gain"));
      mixerStems[i].gain = Number(el.value);
      applyMixerToAudio();
      renderMixerList();
    });
  });
  els.mixerList.querySelectorAll("input[data-mute]").forEach((el) => {
    el.addEventListener("change", () => {
      const i = Number(el.getAttribute("data-mute"));
      mixerStems[i].muted = Boolean(el.checked);
      applyMixerToAudio();
    });
  });
}

function escapeHtml(s) {
  return String(s || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function setLink(el, url) {
  if (!el) return;
  if (url) {
    el.href = url;
    el.classList.remove("disabled");
  } else {
    el.href = "#";
    el.classList.add("disabled");
  }
}

async function refreshSunoCredits() {
  if (!els.sunoCredits) return;
  try {
    if (els.btnSunoCredits) els.btnSunoCredits.disabled = true;
    if (els.sunoCreditsNote) els.sunoCreditsNote.textContent = " (updating…)";
    const r = await fetch("/api/suno/credits");
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data?.error || "credits failed");
    const credits = data?.data;
    els.sunoCredits.textContent = Number.isFinite(Number(credits)) ? String(credits) : "—";
    if (els.sunoCreditsNote) els.sunoCreditsNote.textContent = "";
    return Number.isFinite(Number(credits)) ? Number(credits) : null;
  } catch (e) {
    els.sunoCredits.textContent = "—";
    if (els.sunoCreditsNote) els.sunoCreditsNote.textContent = " (failed)";
    return null;
  } finally {
    if (els.btnSunoCredits) els.btnSunoCredits.disabled = false;
  }
}

const CREDITS_HISTORY_KEY = "mas:sunoCreditsHistory:v1";

function loadCreditsHistory() {
  try {
    const raw = localStorage.getItem(CREDITS_HISTORY_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function saveCreditsHistory(items) {
  try {
    localStorage.setItem(CREDITS_HISTORY_KEY, JSON.stringify(items.slice(0, 200)));
  } catch {
    // ignore
  }
}

function pushCreditsEvent(ev) {
  const items = loadCreditsHistory();
  items.unshift(ev);
  saveCreditsHistory(items);
  renderCreditsHistory();
}

function renderCreditsHistory() {
  if (!els.creditsHistoryOut) return;
  const items = loadCreditsHistory();
  if (!items.length) {
    els.creditsHistoryOut.textContent = "No history yet.";
    return;
  }
  els.creditsHistoryOut.textContent = items
    .slice(0, 50)
    .map((e) => {
      const dt = new Date(e.ts).toLocaleString();
      const delta =
        typeof e.delta === "number" ? (e.delta > 0 ? `+${e.delta}` : String(e.delta)) : "—";
      const before = e.before ?? "—";
      const after = e.after ?? "—";
      const extra = e.extra ? ` | ${e.extra}` : "";
      return `${dt} | ${e.action} | credits ${before} → ${after} (${delta})${extra}`;
    })
    .join("\n");
}

async function trackCreditsAround(action, fn, extra = "") {
  const before = await refreshSunoCredits();
  const t0 = Date.now();
  try {
    return await fn();
  } finally {
    const after = await refreshSunoCredits();
    const delta =
      typeof before === "number" && typeof after === "number" ? after - before : null;
    pushCreditsEvent({
      ts: Date.now(),
      action,
      before,
      after,
      delta,
      extra: extra || `took ${(Date.now() - t0) / 1000}s`,
    });
  }
}

/**
 * Replace the lead melody notes in an arrangement with detected hum melody.
 * Keeps chords/percussion/piano pad from the generator.
 * @param {import("./types.js").Arrangement} arrangement
 * @param {import("./melody/extract.js").Melody | null} melody
 */
function applyMelodyToArrangement(arrangement, melody) {
  if (!melody || !Array.isArray(melody.notes) || melody.notes.length === 0) return arrangement;

  const style = arrangement?.params?.style || "arabic-pop";
  const leadInstrument = style === "cinematic" ? "violin" : "oud";

  const beatsPerBar = arrangement.beatsPerBar;
  const totalBeats = arrangement.totalBeats;
  const maxBeats = Math.min(totalBeats, melodyMaxBeatsFromArrangement(arrangement));

  const carried = (arrangement.notes || []).filter((n) => n.instrument !== leadInstrument);
  // Softer hum lead vs chords/percussion so tabla/darbuka punches through (still synth-y until samples).
  const velScale = 0.42;
  const humNotes = melody.notes
    .map((n) => ({
      startBeat: Math.max(0, Math.min(maxBeats, n.startBeat)),
      durationBeats: Math.max(0.05, Math.min(n.durationBeats, Math.max(0, maxBeats - n.startBeat))),
      midi: n.midi,
      velocity: Math.max(0.1, Math.min(0.55, (n.velocity ?? 0.62) * velScale)),
      instrument: /** @type {any} */ (leadInstrument),
    }))
    .filter((n) => n.durationBeats > 0.05 && n.startBeat < maxBeats);

  return { ...arrangement, notes: [...carried, ...humNotes] };
}

function melodyMaxBeatsFromArrangement(arr) {
  // Keep a small tail so the hum doesn’t run into the render tail.
  return Math.max(1, arr.totalBeats - arr.beatsPerBar * 0.5);
}

function resetAudioOutputs() {
  currentWav = null;
  els.btnPlay.disabled = true;
  els.downloadLink.classList.add("disabled");
  els.downloadLink.href = "#";
  if (audioEl) {
    audioEl.pause();
    audioEl = null;
  }
}

function resetVoiceOutputs() {
  currentVoice = null;
  els.btnVoicePlay.disabled = true;
  els.voiceDownloadLink.classList.add("disabled");
  els.voiceDownloadLink.href = "#";
  if (voiceEl) {
    voiceEl.pause();
    voiceEl = null;
  }
}

async function generateArrangementMaybeAi(params) {
  const wantsAi = Boolean(els.useAi?.checked);
  if (!wantsAi) return generateArrangement(params);

  try {
    const r = await fetch("/api/compose", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ params }),
    });
    if (!r.ok) {
      const txt = await r.text().catch(() => "");
      throw new Error(`AI compose failed (${r.status}): ${txt.slice(0, 200)}`);
    }
    return await r.json();
  } catch (e) {
    // Fall back to the free local generator if AI quota/billing isn't enabled.
    console.warn("AI compose failed, falling back to local generator", e);
    setStatus("Server AI unavailable (quota/billing). Using free local generator instead.");
    return generateArrangement(params);
  }
}

els.btnGenerate.addEventListener("click", async () => {
  resetAudioOutputs();
  resetVoiceOutputs();
  const params = getParams();
  try {
    els.btnGenerate.disabled = true;
    els.btnRandomize.disabled = true;
    setStatus(els.useAi?.checked ? "Generating arrangement with AI…" : "Generating arrangement…");
    setProgress(10);
    currentArrangement = await generateArrangementMaybeAi(params);
    currentArrangement = applyMelodyToArrangement(currentArrangement, currentMelody);
    printArrangement(currentArrangement);
    setStatus("Arrangement generated. Render to WAV when ready.");
    setProgress(0);
  } catch (e) {
    console.error(e);
    setStatus(`Generate failed: ${e?.message || String(e)}`);
    setProgress(0);
  } finally {
    els.btnGenerate.disabled = false;
    els.btnRandomize.disabled = false;
  }
});

if (els.btnNewTake) {
  els.btnNewTake.addEventListener("click", () => {
    variationSeed = String(Date.now() + Math.random());
    setStatus("New take ready. Click Generate.");
    setProgress(0);
  });
}

els.btnRandomize.addEventListener("click", async () => {
  resetAudioOutputs();
  resetVoiceOutputs();
  variationSeed = String(Date.now() + Math.random());
  setParams(randomizeParams(getParams()));
  const params = getParams();
  try {
    els.btnGenerate.disabled = true;
    els.btnRandomize.disabled = true;
    setStatus(els.useAi?.checked ? "Randomized. Generating with AI…" : "Randomized. Generating…");
    setProgress(10);
    currentArrangement = await generateArrangementMaybeAi(params);
    currentArrangement = applyMelodyToArrangement(currentArrangement, currentMelody);
    printArrangement(currentArrangement);
    setStatus("Randomized + generated. Render to WAV when ready.");
    setProgress(0);
  } catch (e) {
    console.error(e);
    setStatus(`Randomize failed: ${e?.message || String(e)}`);
    setProgress(0);
  } finally {
    els.btnGenerate.disabled = false;
    els.btnRandomize.disabled = false;
  }
});

// Lyrics-first: as you type lyrics, the next Generate uses them.
// (We don’t auto-render audio to avoid heavy work on every keystroke.)
if (els.lyrics) {
  let t = null;
  els.lyrics.addEventListener("input", () => {
    if (t) clearTimeout(t);
    t = setTimeout(() => {
      const params = getParams();
      currentArrangement = generateArrangement(params);
      currentArrangement = applyMelodyToArrangement(currentArrangement, currentMelody);
      printArrangement(currentArrangement);
      setStatus("Updated arrangement from lyrics. Render to WAV when ready.");
      setProgress(0);
      resetAudioOutputs();
      resetVoiceOutputs();
    }, 250);
  });
}

els.btnRender.addEventListener("click", async () => {
  resetAudioOutputs();
  const params = getParams();
  const instrumentFlags = getInstrumentFlags();

  if (!currentArrangement) {
    currentArrangement = generateArrangement(params);
    printArrangement(currentArrangement);
  }

  const enabledCount = Object.values(instrumentFlags).filter(Boolean).length;
  if (enabledCount === 0) {
    setStatus("Select at least one instrument.");
    return;
  }

  try {
    els.btnRender.disabled = true;
    els.btnGenerate.disabled = true;
    els.btnRandomize.disabled = true;
    setProgress(1);
    setStatus("Rendering audio offline…");

    const { wavBlob, durationSec } = await renderArrangementToWav(currentArrangement, {
      instrumentFlags,
      onProgress: (p) => setProgress(5 + p * 95),
    });

    currentWav = wavBlob;
    const url = URL.createObjectURL(wavBlob);
    els.downloadLink.href = url;
    els.downloadLink.classList.remove("disabled");
    els.btnPlay.disabled = false;

    audioEl = new Audio(url);
    audioEl.preload = "auto";

    setStatus(`Rendered ${durationSec.toFixed(1)}s WAV. You can play or download.`);
    setProgress(100);
  } catch (e) {
    console.error(e);
    setStatus(`Render failed: ${e?.message || String(e)}`);
    setProgress(0);
  } finally {
    els.btnRender.disabled = false;
    els.btnGenerate.disabled = false;
    els.btnRandomize.disabled = false;
  }
});

els.btnPlay.addEventListener("click", async () => {
  if (!audioEl) return;
  try {
    await audioEl.play();
    setStatus("Playing…");
  } catch (e) {
    setStatus("Browser blocked autoplay. Click again or interact with the page.");
  }
});

els.btnVoice.addEventListener("click", async () => {
  resetVoiceOutputs();
  const params = getParams();
  const text = (params.lyrics || "").trim();
  if (!text) {
    setStatus("Type lyrics first, then Generate voice.");
    return;
  }
  try {
    els.btnVoice.disabled = true;
    setStatus("Generating voice…");
    setProgress(15);

    const r = await fetch("/api/voice", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, style: 0.35, stability: 0.5, similarity_boost: 0.75 }),
    });
    if (!r.ok) {
      if (r.status === 402) {
        throw new Error("Voice API requires a paid plan. Upgrade your voice provider plan, then redeploy on Vercel.");
      }
      const txt = await r.text().catch(() => "");
      throw new Error(`Voice failed (${r.status}): ${txt.slice(0, 200)}`);
    }
    const blob = await r.blob();
    currentVoice = blob;
    const url = URL.createObjectURL(blob);
    els.voiceDownloadLink.href = url;
    els.voiceDownloadLink.classList.remove("disabled");
    els.btnVoicePlay.disabled = false;
    voiceEl = new Audio(url);
    voiceEl.preload = "auto";
    setStatus("Voice generated. You can play or download.");
    setProgress(0);
  } catch (e) {
    console.error(e);
    setStatus(`Voice failed: ${e?.message || String(e)}`);
    setProgress(0);
  } finally {
    els.btnVoice.disabled = false;
  }
});

els.btnVoicePlay.addEventListener("click", async () => {
  if (!voiceEl) return;
  try {
    await voiceEl.play();
    setStatus("Playing voice…");
  } catch (e) {
    setStatus("Browser blocked autoplay. Click again or interact with the page.");
  }
});

// Suno full-song generation
if (els.btnSunoGenerate && els.btnSunoRefresh && els.btnSunoStems) {
  els.btnSunoGenerate.addEventListener("click", async () => {
    try {
      els.btnSunoGenerate.disabled = true;
      els.btnSunoRefresh.disabled = true;
      els.btnSunoStems.disabled = true;
      if (els.btnSunoMultiStems) els.btnSunoMultiStems.disabled = true;
      setStatus("Submitting Suno generation…");
      setProgress(5);
      setLoading(true, { title: "Generating song with AI…", sub: "This can take 30–120 seconds." });

      applyMaqamToStyleInput();
      const payload = {
        prompt: (els.sunoPrompt?.value || "").trim(),
        style: (els.sunoStyle?.value || "").trim(),
        title: (els.sunoTitle?.value || "").trim(),
        customMode: Boolean(els.sunoCustomMode?.checked),
        instrumental: Boolean(els.sunoInstrumental?.checked),
        model: els.sunoModel?.value || "V4_5ALL",
        vocalGender: els.sunoVocalGender?.value || undefined,
      };

      const data = await trackCreditsAround(
        "Suno: generate song",
        async () => {
          const r = await fetch("/api/suno/generate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
          const d = await r.json().catch(() => ({}));
          if (!r.ok) throw new Error(d?.error || "Suno generate failed");
          return d;
        },
        payload?.model ? `model=${payload.model}` : ""
      );

      sunoTaskId = data?.data?.taskId || data?.data?.task_id || data?.taskId || null;
      sunoAudioId = null;
      sunoStemsTaskId = null;
      sunoMultiStemsTaskId = null;
      printSuno(data);
      printSunoStems(null);

      setLink(els.sunoFullLink, null);
      setLink(els.sunoVocalLink, null);
      setLink(els.sunoInstLink, null);
      lastSunoFullUrl = "";
      lastSunoVocalUrl = "";
      lastSunoInstUrl = "";
      lastSunoArtUrl = "";
      lastSunoTitle = "";
      if (els.btnLoadFull) els.btnLoadFull.disabled = true;
      if (els.btnLoadVocals) els.btnLoadVocals.disabled = true;
      if (els.btnLoadInstrumental) els.btnLoadInstrumental.disabled = true;
      if (els.btnPlayFull) els.btnPlayFull.disabled = true;
      if (els.btnPlayVocals) els.btnPlayVocals.disabled = true;
      if (els.btnPlayInstrumental) els.btnPlayInstrumental.disabled = true;

      els.btnSunoRefresh.disabled = !sunoTaskId;
      setStatus(sunoTaskId ? `Suno task created. Refresh status in ~30-60s.` : "Suno task created.");
      setProgress(0);
    } catch (e) {
      console.error(e);
      setStatus(`Suno generate failed: ${e?.message || String(e)}`);
      setProgress(0);
    } finally {
      els.btnSunoGenerate.disabled = false;
      setLoading(false);
    }
  });

  els.btnSunoRefresh.addEventListener("click", async () => {
    if (!sunoTaskId) return;
    try {
      els.btnSunoRefresh.disabled = true;
      setStatus("Fetching Suno status…");
      setProgress(10);
      setLoading(true, { title: "Checking generation status…", sub: "Waiting for audio URLs…" });

      const r = await fetch(`/api/suno/status?taskId=${encodeURIComponent(sunoTaskId)}`);
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data?.error || "Suno status failed");

      const status = data?.data?.status || data?.status;
      const sunoData = data?.data?.response?.sunoData || data?.data?.response?.suno_data || [];
      const first = Array.isArray(sunoData) ? sunoData[0] : null;
      // API returns either camelCase or snake_case depending on endpoint
      const audioUrl = first?.audioUrl || first?.audio_url || null;
      const streamUrl = first?.streamAudioUrl || first?.stream_audio_url || null;
      const imageUrl = first?.imageUrl || first?.image_url || first?.coverUrl || first?.cover_url || null;
      const title = first?.title || first?.songTitle || first?.song_title || "";
      sunoAudioId = first?.id || null;

      printSuno({ status, taskId: sunoTaskId, first });
      const fullUrl = audioUrl || streamUrl || "";
      lastSunoFullUrl = fullUrl;
      lastSunoArtUrl = imageUrl || lastSunoArtUrl;
      lastSunoTitle = String(title || "").trim() || lastSunoTitle;
      setLink(els.sunoFullLink, fullUrl || null);
      if (els.btnLoadFull) els.btnLoadFull.disabled = !fullUrl;
      if (els.btnPlayFull) els.btnPlayFull.disabled = !fullUrl;
      els.btnSunoStems.disabled = !(status === "SUCCESS" && sunoAudioId);
      if (els.btnSunoMultiStems) els.btnSunoMultiStems.disabled = !(status === "SUCCESS" && sunoAudioId);
      setStatus(`Suno status: ${status || "unknown"}`);
      setProgress(0);
      void refreshSunoCredits();
    } catch (e) {
      console.error(e);
      setStatus(`Suno status failed: ${e?.message || String(e)}`);
      setProgress(0);
    } finally {
      els.btnSunoRefresh.disabled = false;
      setLoading(false);
    }
  });

  els.btnSunoStems.addEventListener("click", async () => {
    if (!sunoTaskId || !sunoAudioId) return;
    try {
      els.btnSunoStems.disabled = true;
      setStatus("Requesting stems (vocals + instrumental)…");
      setProgress(15);
      setLoading(true, { title: "Separating vocals…", sub: "Creating vocal + instrumental stems…" });

      const data = await trackCreditsAround(
        "Suno: separate vocals",
        async () => {
          const r = await fetch("/api/suno/stems", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ taskId: sunoTaskId, audioId: sunoAudioId, type: "separate_vocal" }),
          });
          const d = await r.json().catch(() => ({}));
          if (!r.ok) throw new Error(d?.error || "Stem request failed");
          return d;
        },
        `taskId=${sunoTaskId}`
      );
      printSunoStems(data);
      sunoStemsTaskId = data?.data?.taskId || data?.data?.task_id || data?.taskId || null;
      printSuno({ stemsTaskId: sunoStemsTaskId, requested: "separate_vocal" });
      setStatus("Stem task created. Refresh status in ~30-90s.");
      setProgress(0);
    } catch (e) {
      console.error(e);
      setStatus(`Stem request failed: ${e?.message || String(e)}`);
      setProgress(0);
    } finally {
      els.btnSunoStems.disabled = false;
      setLoading(false);
    }
  });

  if (els.btnSunoMultiStems) {
    els.btnSunoMultiStems.addEventListener("click", async () => {
      if (!sunoTaskId || !sunoAudioId) return;
      try {
        els.btnSunoMultiStems.disabled = true;
        setStatus("Requesting multi-stems (drums/bass/… )…");
        setProgress(18);
        setLoading(true, { title: "Extracting multi-stems…", sub: "Drums, bass, strings… This can take longer." });

        const data = await trackCreditsAround(
          "Suno: multi-stems",
          async () => {
            const r = await fetch("/api/suno/stems", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ taskId: sunoTaskId, audioId: sunoAudioId, type: "split_stem" }),
            });
            const d = await r.json().catch(() => ({}));
            if (!r.ok) throw new Error(d?.error || "Multi-stems request failed");
            return d;
          },
          `taskId=${sunoTaskId}`
        );
        printSunoStems(data);
        sunoMultiStemsTaskId = data?.data?.taskId || data?.data?.task_id || data?.taskId || null;
        printSunoStems({ ...data, _ui: { stemsTaskId: sunoMultiStemsTaskId, requested: "split_stem" } });
        setStatus("Multi-stems task created. Refresh status in ~60-180s.");
        setProgress(0);
      } catch (e) {
        console.error(e);
        setStatus(`Multi-stems request failed: ${e?.message || String(e)}`);
        setProgress(0);
      } finally {
        els.btnSunoMultiStems.disabled = false;
        setLoading(false);
      }
    });
  }
}

// If we have a stems task id, reusing Suno refresh also fetches stems status when available.
if (els.btnSunoRefresh) {
  els.btnSunoRefresh.addEventListener("click", async () => {
    if (!sunoStemsTaskId) return;
    try {
      const r = await fetch(`/api/suno/stems_status?taskId=${encodeURIComponent(sunoStemsTaskId)}`);
      const data = await r.json().catch(() => ({}));
      if (!r.ok) return;
      const flag = data?.data?.successFlag;
      const resp = data?.data?.response || {};
      if (flag === "SUCCESS") {
        lastSunoVocalUrl = resp.vocalUrl || "";
        lastSunoInstUrl = resp.instrumentalUrl || "";
        setLink(els.sunoVocalLink, lastSunoVocalUrl || null);
        setLink(els.sunoInstLink, lastSunoInstUrl || null);
        if (els.btnLoadVocals) els.btnLoadVocals.disabled = !lastSunoVocalUrl;
        if (els.btnLoadInstrumental) els.btnLoadInstrumental.disabled = !lastSunoInstUrl;
        if (els.btnPlayVocals) els.btnPlayVocals.disabled = !lastSunoVocalUrl;
        if (els.btnPlayInstrumental) els.btnPlayInstrumental.disabled = !lastSunoInstUrl;
        void refreshSunoCredits();
      }
    } catch {
      // ignore stems refresh errors
    }
  });
}

// Multi-stems polling: once SUCCESS, show URLs in the stems JSON panel.
if (els.btnSunoRefresh) {
  els.btnSunoRefresh.addEventListener("click", async () => {
    if (!sunoMultiStemsTaskId) return;
    try {
      const r = await fetch(`/api/suno/stems_status?taskId=${encodeURIComponent(sunoMultiStemsTaskId)}`);
      const data = await r.json().catch(() => ({}));
      if (!r.ok) return;
      const flag = data?.data?.successFlag;
      const resp = data?.data?.response || {};
      if (flag === "SUCCESS") {
        // resp contains drumsUrl, bassUrl, etc.
        printSunoStems(resp);
        // Enable studio load when we have at least 2 stems
        if (els.btnMixerLoad) els.btnMixerLoad.disabled = false;
        void refreshSunoCredits();
      }
    } catch {
      // ignore
    }
  });
}

if (els.btnSunoCredits) {
  els.btnSunoCredits.addEventListener("click", () => void refreshSunoCredits());
}

// In-app player controls
if (els.btnPlayerPlay) {
  els.btnPlayerPlay.addEventListener("click", async () => {
    const a = ensurePlayer();
    try {
      await a.play();
      els.btnPlayerPlay.disabled = true;
      if (els.btnPlayerPause) els.btnPlayerPause.disabled = false;
    } catch {
      setStatus("Playback blocked. Click again or interact with the page.");
    }
  });
}
if (els.btnPlayerPause) {
  els.btnPlayerPause.addEventListener("click", () => {
    if (!playerEl) return;
    playerEl.pause();
    if (els.btnPlayerPlay) els.btnPlayerPlay.disabled = false;
    els.btnPlayerPause.disabled = true;
  });
}
if (els.btnPlayerStop) {
  els.btnPlayerStop.addEventListener("click", () => {
    if (!playerEl) return;
    playerEl.pause();
    playerEl.currentTime = 0;
    if (els.btnPlayerPlay) els.btnPlayerPlay.disabled = false;
    if (els.btnPlayerPause) els.btnPlayerPause.disabled = true;
    syncPlayerUI();
  });
}
if (els.playerVol) {
  els.playerVol.addEventListener("input", () => {
    const a = ensurePlayer();
    a.volume = clampNum(Number(els.playerVol.value), 0, 1);
  });
}
if (els.playerSeek) {
  els.playerSeek.addEventListener("pointerdown", () => (playerSeekDragging = true));
  els.playerSeek.addEventListener("pointerup", () => {
    playerSeekDragging = false;
    if (!playerEl) return;
    const dur = Number.isFinite(playerEl.duration) ? playerEl.duration : 0;
    const max = Number(els.playerSeek.max || 1000);
    const v = Number(els.playerSeek.value || 0);
    if (dur > 0) playerEl.currentTime = (v / max) * dur;
  });
  els.playerSeek.addEventListener("input", () => {
    if (!playerSeekDragging || !playerEl) return;
    const dur = Number.isFinite(playerEl.duration) ? playerEl.duration : 0;
    const max = Number(els.playerSeek.max || 1000);
    const v = Number(els.playerSeek.value || 0);
    if (els.playerTime && dur > 0) els.playerTime.textContent = `${formatTime((v / max) * dur)} / ${formatTime(dur)}`;
  });
}
if (els.btnLoadFull) {
  els.btnLoadFull.addEventListener("click", () => {
    const url = lastSunoFullUrl || (els.sunoFullLink?.classList.contains("disabled") ? "" : els.sunoFullLink?.href);
    if (url && url !== "#") {
      setPlayerSource(url, "Full song");
      setPlayerMeta({ title: lastSunoTitle || "Generated song", subtitle: "Suno • Full song", artUrl: lastSunoArtUrl });
      location.hash = "#/player";
    }
  });
}
if (els.btnLoadVocals) {
  els.btnLoadVocals.addEventListener("click", () => {
    const url = lastSunoVocalUrl || (els.sunoVocalLink?.classList.contains("disabled") ? "" : els.sunoVocalLink?.href);
    if (url && url !== "#") {
      setPlayerSource(url, "Vocals");
      setPlayerMeta({ title: lastSunoTitle || "Generated song", subtitle: "Suno • Vocals", artUrl: lastSunoArtUrl });
      location.hash = "#/player";
    }
  });
}
if (els.btnLoadInstrumental) {
  els.btnLoadInstrumental.addEventListener("click", () => {
    const url = lastSunoInstUrl || (els.sunoInstLink?.classList.contains("disabled") ? "" : els.sunoInstLink?.href);
    if (url && url !== "#") {
      setPlayerSource(url, "Instrumental");
      setPlayerMeta({ title: lastSunoTitle || "Generated song", subtitle: "Suno • Instrumental", artUrl: lastSunoArtUrl });
      location.hash = "#/player";
    }
  });
}

if (els.btnPlayFull) {
  els.btnPlayFull.addEventListener("click", async () => {
    const url = lastSunoFullUrl || (els.sunoFullLink?.classList.contains("disabled") ? "" : els.sunoFullLink?.href);
    await playOnPlayerPage(url && url !== "#" ? url : "", "Full song");
  });
}
if (els.btnPlayVocals) {
  els.btnPlayVocals.addEventListener("click", async () => {
    const url = lastSunoVocalUrl || (els.sunoVocalLink?.classList.contains("disabled") ? "" : els.sunoVocalLink?.href);
    await playOnPlayerPage(url && url !== "#" ? url : "", "Vocals");
  });
}
if (els.btnPlayInstrumental) {
  els.btnPlayInstrumental.addEventListener("click", async () => {
    const url = lastSunoInstUrl || (els.sunoInstLink?.classList.contains("disabled") ? "" : els.sunoInstLink?.href);
    await playOnPlayerPage(url && url !== "#" ? url : "", "Instrumental");
  });
}

// Vocal Room + Multitrack session
if (els.btnSessionLoadSuno) {
  els.btnSessionLoadSuno.addEventListener("click", () => {
    loadSunoMultiStemsIntoSession();
  });
}
if (els.sessionUploadStems) {
  els.sessionUploadStems.addEventListener("change", () => {
    const files = Array.from(els.sessionUploadStems.files || []);
    if (!files.length) return;
    loadUploadedStemsIntoSession(files);
    setSessionStatus(`Loaded ${files.length} uploaded stem track(s).`);
    els.sessionUploadStems.value = "";
  });
}
if (els.btnSessionClear) {
  els.btnSessionClear.addEventListener("click", () => clearSession());
}
if (els.btnSessionPlay) {
  els.btnSessionPlay.addEventListener("click", async () => {
    try {
      await playSession();
    } catch (e) {
      setSessionStatus(`Play error: ${e?.message || String(e)}`);
    }
  });
}
if (els.btnSessionStop) {
  els.btnSessionStop.addEventListener("click", () => stopSession());
}
if (els.btnSessionExport) {
  els.btnSessionExport.addEventListener("click", async () => {
    try {
      els.btnSessionExport.disabled = true;
      await exportSessionMixWav();
    } catch (e) {
      setSessionStatus(`Export error: ${e?.message || String(e)}`);
    } finally {
      els.btnSessionExport.disabled = false;
      setLoading(false);
    }
  });
}

// Vocal Room (recording)
if (els.btnVocalArm) {
  els.btnVocalArm.addEventListener("click", async () => {
    try {
      await armVocalMic();
    } catch (e) {
      setVocalStatus(`Mic error: ${e?.message || String(e)}`);
    }
  });
}
if (els.btnVocalRec) {
  els.btnVocalRec.addEventListener("click", async () => {
    try {
      await startVocalRecording();
    } catch (e) {
      setVocalStatus(`Record error: ${e?.message || String(e)}`);
    }
  });
}
if (els.btnVocalStop) {
  els.btnVocalStop.addEventListener("click", () => stopVocalRecording());
}
if (els.vocalPreset) {
  els.vocalPreset.addEventListener("change", () => {
    // Re-arm to apply the new preset cleanly.
    if (vocalIsRecording) return;
    disarmVocalMic();
    setVocalStatus("Preset changed. Arm mic again.");
  });
}
if (els.vocalMonitor) {
  els.vocalMonitor.addEventListener("change", () => {
    if (vocalIsRecording) return;
    disarmVocalMic();
    setVocalStatus("Monitor setting changed. Arm mic again.");
  });
}

renderVocalTakes();
renderSessionTracks();

// Start / Splash screen
if (els.btnEnterApp) {
  els.btnEnterApp.addEventListener("click", () => {
    location.hash = "#/generate";
  });
}
if (els.btnStartHelp && els.startHelp) {
  els.btnStartHelp.addEventListener("click", () => {
    const show = els.startHelp.style.display === "none";
    els.startHelp.style.display = show ? "" : "none";
  });
}

if (els.btnCreditsHistoryRefresh) {
  els.btnCreditsHistoryRefresh.addEventListener("click", () => renderCreditsHistory());
}
if (els.btnCreditsHistoryClear) {
  els.btnCreditsHistoryClear.addEventListener("click", () => {
    saveCreditsHistory([]);
    renderCreditsHistory();
    setStatus("Cleared credits history.");
  });
}

if (els.sunoMaqam) {
  els.sunoMaqam.addEventListener("change", () => applyMaqamToStyleInput());
}

if (els.btnBetaTopup) {
  els.btnBetaTopup.addEventListener("click", () => openBilling());
}
if (els.btnOpenBilling) {
  els.btnOpenBilling.addEventListener("click", () => openBilling());
}

// Studio mixer
if (els.btnMixerLoad) {
  els.btnMixerLoad.addEventListener("click", () => {
    try {
      const raw = els.sunoStemsOut?.textContent || "";
      const obj = raw ? JSON.parse(raw) : null;
      const stems = stemsFromResponse(obj);
      mixerStems = stems.map((s) => ({ ...s, gain: 1, muted: false }));
      mixerAudioEls = stems.map((s) => {
        const a = new Audio(s.url);
        a.preload = "auto";
        a.crossOrigin = "anonymous";
        return a;
      });
      mixerIsPlaying = false;
      if (els.btnMixerStop) els.btnMixerStop.disabled = true;
      renderMixerList();
      applyMixerToAudio();
      if (els.btnMixerExport) els.btnMixerExport.disabled = mixerStems.length === 0;
      if (els.btnMixerPlay) els.btnMixerPlay.disabled = mixerStems.length === 0;
      setStatus(mixerStems.length ? "Stems loaded into studio." : "No stems found yet.");
    } catch (e) {
      setStatus("Could not load stems (make sure multi-stems are SUCCESS).");
    }
  });
}

function applyMixerToAudio() {
  for (let i = 0; i < mixerAudioEls.length; i++) {
    const a = mixerAudioEls[i];
    const s = mixerStems[i];
    if (!a || !s) continue;
    const muted = Boolean(s.muted);
    const vol = clampNum(s.gain ?? 1, 0, 1); // HTMLAudio volume is 0..1
    a.volume = muted ? 0 : vol;
  }
}

async function playMixer() {
  if (!mixerAudioEls.length) return;
  // Start all at the same time from the beginning.
  for (const a of mixerAudioEls) {
    try {
      a.pause();
      a.currentTime = 0;
    } catch {}
  }
  applyMixerToAudio();
  setStatus("Playing stems…");
  try {
    await Promise.all(mixerAudioEls.map((a) => a.play().catch(() => null)));
    mixerIsPlaying = true;
    if (els.btnMixerStop) els.btnMixerStop.disabled = false;
    if (els.btnMixerPlay) els.btnMixerPlay.textContent = "Restart";
  } catch (e) {
    setStatus("Playback blocked. Click again or interact with the page.");
  }
}

function stopMixer() {
  for (const a of mixerAudioEls) {
    try {
      a.pause();
      a.currentTime = 0;
    } catch {}
  }
  mixerIsPlaying = false;
  if (els.btnMixerStop) els.btnMixerStop.disabled = true;
  if (els.btnMixerPlay) els.btnMixerPlay.textContent = "Play mix";
  setStatus("Stopped.");
}

if (els.btnMixerPlay) {
  els.btnMixerPlay.addEventListener("click", async () => {
    if (!mixerAudioEls.length) return;
    await playMixer();
  });
}
if (els.btnMixerStop) {
  els.btnMixerStop.addEventListener("click", () => stopMixer());
}

if (els.btnMixerExport) {
  els.btnMixerExport.addEventListener("click", async () => {
    if (!mixerStems.length) return;
    try {
      els.btnMixerExport.disabled = true;
      setStatus("Exporting mix to WAV…");
      setProgress(25);
      setLoading(true, { title: "Exporting your mix…", sub: "Rendering WAV offline in your browser." });
      const wavBlob = await mixStemsToWav(mixerStems);
      lastStudioMixBlob = wavBlob;
      const url = URL.createObjectURL(wavBlob);
      lastStudioMixUrl = url;
      if (els.mixerDownloadLink) {
        els.mixerDownloadLink.href = url;
        els.mixerDownloadLink.classList.remove("disabled");
      }
      updateVocalRoomAvailability();
      setStatus("Mix exported. Download is ready.");
      setProgress(0);
    } catch (e) {
      console.error(e);
      setStatus(`Export failed: ${e?.message || String(e)}`);
      setProgress(0);
    } finally {
      els.btnMixerExport.disabled = false;
      setLoading(false);
    }
  });
}

function stemsFromResponse(resp) {
  if (!resp || typeof resp !== "object") return [];
  const map = {
    vocalUrl: "Vocals",
    backingVocalsUrl: "BackingVocals",
    instrumentalUrl: "Instrumental",
    drumsUrl: "Drums",
    bassUrl: "Bass",
    guitarUrl: "Guitar",
    keyboardUrl: "Keyboard",
    percussionUrl: "Percussion",
    stringsUrl: "Strings",
    synthUrl: "Synth",
    fxUrl: "FX",
    brassUrl: "Brass",
    woodwindsUrl: "Woodwinds",
  };
  const out = [];
  for (const [k, name] of Object.entries(map)) {
    const url = resp[k];
    if (typeof url === "string" && url.startsWith("http")) out.push({ name, url });
  }
  // Prefer keeping Instrumental out when multi stems exist (instrumentalUrl is null for split_stem anyway)
  return out;
}

function clampNum(n, min, max) {
  const x = Number.isFinite(Number(n)) ? Number(n) : min;
  return Math.max(min, Math.min(max, x));
}

// Initial credits fetch (best effort)
void refreshSunoCredits();
renderCreditsHistory();

// Hum → melody (MVP)
if (els.btnHumStart && els.btnHumStop && els.btnHumClear) {
  els.btnHumStart.addEventListener("click", async () => {
    if (humSession) return;
    resetAudioOutputs();
    resetVoiceOutputs();
    currentMelody = null;
    printMelody(null);

    try {
      els.btnHumStart.disabled = true;
      els.btnHumStop.disabled = false;
      els.btnHumClear.disabled = true;
      setStatus("Starting mic…");
      setProgress(2);

      // recordHumToMelody returns a session immediately; await only that (not mic init) so Generate never "freezes".
      humSession = recordHumToMelody({
        maxSeconds: 60,
        bpm: getParams().bpm,
        meter: getParams().meter,
        onMicReady: () => setStatus("Recording hum…"),
        onPartial: (m) => {
          currentMelody = m;
          printMelody(m);
        },
        onProgress: (p) => setProgress(2 + p * 40),
        onDone: (m) => {
          currentMelody = m;
          printMelody(m);
          if (currentArrangement) {
            currentArrangement = applyMelodyToArrangement(currentArrangement, currentMelody);
            printArrangement(currentArrangement);
          }
          humSession = null;
          els.btnHumStart.disabled = false;
          els.btnHumStop.disabled = true;
          els.btnHumClear.disabled = !currentMelody?.notes?.length;
          setStatus(
            m?.notes?.length
              ? "Hum recorded. Melody merged into arrangement."
              : "Mic denied or no pitch detected — hum louder / closer to the mic."
          );
          setProgress(0);
        },
      });
    } catch (e) {
      console.error(e);
      setStatus(`Hum record failed: ${e?.message || String(e)}`);
      setProgress(0);
      humSession = null;
      els.btnHumStart.disabled = false;
      els.btnHumStop.disabled = true;
      els.btnHumClear.disabled = !currentMelody?.notes?.length;
    }
  });

  els.btnHumStop.addEventListener("click", async () => {
    if (!humSession) return;
    try {
      humSession.stop();
    } finally {
      humSession = null;
      els.btnHumStart.disabled = false;
      els.btnHumStop.disabled = true;
      els.btnHumClear.disabled = !currentMelody;
      setProgress(0);
      if (currentMelody && currentArrangement) {
        currentArrangement = applyMelodyToArrangement(currentArrangement, currentMelody);
        printArrangement(currentArrangement);
      }
      setStatus(currentMelody ? "Hum stopped. Melody merged into arrangement." : "Hum stopped.");
    }
  });

  els.btnHumClear.addEventListener("click", () => {
    if (humSession) return;
    currentMelody = null;
    printMelody(null);
    els.btnHumClear.disabled = true;
    setStatus("Cleared melody.");
  });
}

// Initialize with a first arrangement
currentArrangement = generateArrangement(getParams());
currentArrangement = applyMelodyToArrangement(currentArrangement, currentMelody);
printArrangement(currentArrangement);
setStatus("Ready. Generate a new arrangement or render to WAV.");

function clampInt(n, min, max) {
  return Math.max(min, Math.min(max, Math.round(n)));
}

