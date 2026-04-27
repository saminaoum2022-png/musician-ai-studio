import { generateArrangement, randomizeParams } from "./arrangement.js";
import { renderArrangementToWav } from "./render.js";

const els = {
  style: document.getElementById("style"),
  bpm: document.getElementById("bpm"),
  bars: document.getElementById("bars"),
  keyCenter: document.getElementById("keyCenter"),
  scale: document.getElementById("scale"),
  meter: document.getElementById("meter"),
  lyrics: document.getElementById("lyrics"),

  instOud: document.getElementById("instOud"),
  instViolin: document.getElementById("instViolin"),
  instPiano: document.getElementById("instPiano"),
  instTabla: document.getElementById("instTabla"),

  btnGenerate: document.getElementById("btnGenerate"),
  btnRandomize: document.getElementById("btnRandomize"),
  btnRender: document.getElementById("btnRender"),
  btnPlay: document.getElementById("btnPlay"),
  downloadLink: document.getElementById("downloadLink"),

  arrangementOut: document.getElementById("arrangementOut"),
  progressBar: document.getElementById("progressBar"),
  status: document.getElementById("status"),
};

/** @type {import("./types.js").Arrangement | null} */
let currentArrangement = null;
/** @type {Blob | null} */
let currentWav = null;
/** @type {HTMLAudioElement | null} */
let audioEl = null;

function getParams() {
  return {
    style: els.style.value,
    bpm: clampInt(parseInt(els.bpm.value, 10) || 96, 60, 180),
    bars: clampInt(parseInt(els.bars.value, 10) || 32, 8, 128),
    keyCenter: els.keyCenter.value,
    scale: els.scale.value,
    meter: els.meter.value,
    lyrics: (els.lyrics?.value || "").trim(),
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

function printArrangement(a) {
  els.arrangementOut.textContent = JSON.stringify(a, null, 2);
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

els.btnGenerate.addEventListener("click", () => {
  resetAudioOutputs();
  const params = getParams();
  currentArrangement = generateArrangement(params);
  printArrangement(currentArrangement);
  setStatus("Arrangement generated. Render to WAV when ready.");
  setProgress(0);
});

els.btnRandomize.addEventListener("click", () => {
  resetAudioOutputs();
  setParams(randomizeParams(getParams()));
  const params = getParams();
  currentArrangement = generateArrangement(params);
  printArrangement(currentArrangement);
  setStatus("Randomized + generated. Render to WAV when ready.");
  setProgress(0);
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
      printArrangement(currentArrangement);
      setStatus("Updated arrangement from lyrics. Render to WAV when ready.");
      setProgress(0);
      resetAudioOutputs();
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

// Initialize with a first arrangement
currentArrangement = generateArrangement(getParams());
printArrangement(currentArrangement);
setStatus("Ready. Generate a new arrangement or render to WAV.");

function clampInt(n, min, max) {
  return Math.max(min, Math.min(max, Math.round(n)));
}

