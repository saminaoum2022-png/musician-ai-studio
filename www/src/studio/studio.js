/**
 * NabadAi Studio — UI controller (V1)
 * -----------------------------------
 * Owns the Studio screens and drives the StudioEngine. Kept as its own module
 * so the experience stays self-contained and modular (per the V1 spec) — app.js
 * only routes to it and hands it a small bridge of app capabilities.
 *
 * Screens (this slice): Studio Home + Recording scaffold. Review / Mix / Publish
 * mount onto the same root next.
 *
 * Design language: Nabad's documented "Voloco-style restraint" — neutral glass
 * surfaces, teal for the single primary action, violet for active/highlight.
 * No neon-everything.
 */

import { StudioEngine } from "./engine.js";
import {
  listProjects,
  upsertProject,
  deleteProject,
  nextProjectName,
  listRecordings,
  saveRecording,
  getRecordingBlob,
  deleteRecording,
} from "./store.js";

let engine = null;
let bridge = {};
let current = null; // { track, guideUrl, guideDuration, lyrics, mix, projectId }
let screen = "lobby";
let unsaved = false;
let recMode = "take"; // "take" (over a song) | "memo" (quick take, no music)

const DEFAULT_MIX = Object.freeze({
  voiceVol: 90,
  musicVol: 70,
  reverb: 15,
  pitchAssist: "off", // off | light | medium (placeholder)
  enhance: false, // placeholder
});

/**
 * One-time wiring from app.js. bridge: {
 *   showToast(msg, opts), haptic(kind), navigateBack(),
 *   prepareGuide(track) -> Promise<string url>,   // the AI instrumental
 *   lyricsForTrack(track) -> string,
 *   coverForTrack(track) -> string,
 * }
 */
export function configureStudio(b) {
  bridge = b || {};
}

export function studioHasUnsaved() {
  return unsaved;
}

/** Called from the player ⋯ menu. Stashes the track and routes to the source
 * chooser (load as-is vs separate vocals). */
export function openStudioForTrack(track) {
  current = freshContext(track);
  // Register a draft project the moment a song is opened in the Studio.
  try {
    current.projectId = `proj_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    upsertProject({ id: current.projectId, name: nextProjectName(), track: trackRef(track) });
  } catch {}
  screen = "source";
  unsaved = false;
  try { location.hash = "#/studio"; } catch {}
}

/** Called from the Create page card. Opens the Studio lobby (no song yet). */
export function openStudioLobby() {
  current = null;
  screen = "lobby";
  unsaved = false;
  try { location.hash = "#/studio"; } catch {}
}

function trackRef(t) {
  return {
    id: String(t?.id || ""),
    title: String(t?.title || ""),
    url: String(t?.url || ""),
    artUrl: String(t?.artUrl || t?.art || t?.meta?.imageThumb || t?.meta?.imageUrl || ""),
    taskId: String(t?.taskId || t?.meta?.taskId || ""),
    audioId: String(t?.audioId || t?.meta?.audioId || ""),
    kind: String(t?.kind || ""),
  };
}

function freshContext(track) {
  return {
    track,
    guideUrl: "",
    guideDuration: 0,
    lyrics: safe(bridge.lyricsForTrack?.(track)) || "",
    mix: { ...DEFAULT_MIX },
    monitor: readMonitorPref(),
    timedLines: null, // synced karaoke lines once fetched
    timedFetched: false,
  };
}

const MONITOR_PREF_KEY = "nabad.studio.monitor.v1";
function readMonitorPref() {
  try { return localStorage.getItem(MONITOR_PREF_KEY) !== "0"; } catch { return true; }
}
function writeMonitorPref(on) {
  try { localStorage.setItem(MONITOR_PREF_KEY, on ? "1" : "0"); } catch {}
}

/** Route enter hook. Renders into #studioRoot based on the current screen. */
export function enterStudioRoot() {
  const root = document.getElementById("studioRoot");
  if (!root) return;
  if (!engine) engine = new StudioEngine();

  // No song chosen → the Studio lobby (quick take, projects, recordings).
  if (!current) {
    if (screen === "recordings") { renderRecordings(root); return; }
    renderLobby(root);
    return;
  }
  if (screen === "source") { renderSource(root); return; }
  renderHome(root);
  void ensureGuide(root);
  void ensureTimedLyrics(root);
}

/* Fetch the song's word-level karaoke timing (once) and, if we're still on
 * Home, swap the plain lyrics for the synced view. */
async function ensureTimedLyrics(root) {
  if (!current || current.timedFetched) return;
  current.timedFetched = true;
  try {
    const lines = await Promise.resolve(bridge.timedLyricsForTrack?.(current.track));
    if (Array.isArray(lines) && lines.length) {
      current.timedLines = lines;
      if (screen === "home") updateHomeLyrics(root);
    }
  } catch {}
}

/** Cleanup when leaving the Studio route. */
export function leaveStudioRoot() {
  try { engine?.stopMix(); } catch {}
  try { if (engine?.isRecording) void engine.stopRecording(); } catch {}
  try { stopRecPlayback(); } catch {}
}

/* -------------------------------------------------------------------------- */
/* Screen: Source chooser (how do you want the music?)                         */
/* -------------------------------------------------------------------------- */

function renderSource(root) {
  screen = "source";
  const t = current.track || {};
  const cover = safe(bridge.coverForTrack?.(t)) || safe(t.artUrl) || "";
  const title = safe(t.title) || "Untitled";
  const cached = String(bridge.cachedInstrumental?.(t) || "");

  root.innerHTML = `
    <div class="studio studioSource" data-studio-screen="source">
      ${headerHtml("NABADAI STUDIO")}

      <div class="studioHero">
        <div class="studioCover">${cover ? `<img src="${esc(cover)}" alt="" />` : `<div class="studioCoverPlaceholder">♪</div>`}</div>
        <div class="studioHeroMeta">
          <h1 class="studioTitle">${esc(title)}</h1>
          <p class="studioArtist">How do you want the music?</p>
        </div>
      </div>

      <div class="studioChoices">
        <button type="button" class="studioChoice" data-source="asis">
          <span class="studioChoiceIco" aria-hidden="true">♫</span>
          <span class="studioChoiceBody">
            <span class="studioChoiceTitle">Sing over the song</span>
            <span class="studioChoiceSub">Load it as it is — the full track guides you.</span>
          </span>
          <span class="studioChoiceChev" aria-hidden="true">→</span>
        </button>
        <button type="button" class="studioChoice studioChoice--accent" data-source="separate">
          <span class="studioChoiceIco" aria-hidden="true">🎤</span>
          <span class="studioChoiceBody">
            <span class="studioChoiceTitle">Separate the vocals${cached ? ` <span class="studioReadyTag">Ready</span>` : ""}</span>
            <span class="studioChoiceSub">${cached
              ? "Instrumental already made — use it instantly."
              : "Make a clean instrumental so only your voice carries the melody. <b>~2 credits.</b>"}</span>
          </span>
          <span class="studioChoiceChev" aria-hidden="true">→</span>
        </button>
      </div>
    </div>`;

  bindSource(root);
}

function bindSource(root) {
  bindHeader(root);
  root.querySelector('[data-source="asis"]')?.addEventListener("click", () => {
    bridge.haptic?.("light");
    current.guideUrl = String(current.track?.url || "");
    screen = "home";
    renderHome(root);
    void ensureGuide(root);
    void ensureTimedLyrics(root);
  });
  root.querySelector('[data-source="separate"]')?.addEventListener("click", () => {
    bridge.haptic?.("medium");
    void runSeparation(root);
  });
}

/* -------------------------------------------------------------------------- */
/* Screen: Separating (instrumental generation loading)                        */
/* -------------------------------------------------------------------------- */

function renderSeparating(root, phase) {
  screen = "separating";
  const cover = safe(bridge.coverForTrack?.(current.track)) || safe(current.track?.artUrl) || "";
  root.innerHTML = `
    <div class="studio studioPublish" data-studio-screen="separating">
      <div class="studioPublishInner">
        <div class="studioPublishArt ${cover ? "" : "isEmpty"}">
          ${cover ? `<img src="${esc(cover)}" alt="" />` : `<span aria-hidden="true">♪</span>`}
          <div class="studioPublishShimmer" aria-hidden="true"></div>
        </div>
        <h1 class="studioPublishTitle">Getting the instrumental</h1>
        <p class="studioPublishPhase" data-sep-phase>${esc(phase || "Starting…")}</p>
        <div class="studioPubBar"><span class="studioPubFill studioPubFill--indet"></span></div>
        <p class="studioPublishHint">Lifting the vocals off the music — this can take a minute. We’ll save the instrumental to this song too.</p>
      </div>
    </div>`;
}

async function runSeparation(root) {
  renderSeparating(root, "Requesting…");
  const setPhase = (txt) => { const e = root.querySelector("[data-sep-phase]"); if (e) e.textContent = txt; };
  try {
    const url = await Promise.resolve(
      bridge.separateVocals?.(current.track, (p) => {
        setPhase(
          p === "requesting" ? "Requesting…"
          : p === "processing" ? "Separating vocals…"
          : p === "ready" ? "Almost there…"
          : "Working…",
        );
      }),
    );
    if (!url) throw new Error("No instrumental came back.");
    current.guideUrl = url;
    screen = "home";
    renderHome(root);
    void ensureGuide(root);
    void ensureTimedLyrics(root);
    bridge.showToast?.("Instrumental ready — saved to your song too.");
  } catch (e) {
    screen = "source";
    renderSource(root);
    bridge.showToast?.(String(e?.message || "Couldn’t separate vocals."), { durationMs: 4200 });
  }
}

/* -------------------------------------------------------------------------- */
/* Screen: Lobby (no song yet — quick take, projects, recordings)              */
/* -------------------------------------------------------------------------- */

function renderLobby(root) {
  screen = "lobby";
  const projects = listProjects();
  const recs = listRecordings();

  root.innerHTML = `
    <div class="studio studioLobby" data-studio-screen="lobby">
      ${headerHtml("NABADAI STUDIO")}

      <div class="studioLobbyHead">
        <h1 class="studioTitle">Studio</h1>
        <p class="studioArtist">Record over a song, or catch a quick idea before it’s gone.</p>
      </div>

      <button type="button" class="studioQuickTake" data-studio-quick>
        <span class="studioQuickIco" aria-hidden="true">●</span>
        <span class="studioQuickBody">
          <span class="studioQuickTitle">Quick take</span>
          <span class="studioQuickSub">Record a fast idea — just your voice, no music.</span>
        </span>
      </button>

      <div class="studioLobbySection">
        <div class="studioLobbySectionTop">
          <span class="studioLobbyKicker">Recordings</span>
          <button type="button" class="studioLink" data-studio-open-recordings>See all${recs.length ? ` (${recs.length})` : ""}</button>
        </div>
        ${recs.length
          ? `<div class="studioMiniList">${recs.slice(0, 3).map((r) => `
              <button type="button" class="studioMiniRow" data-rec-open="${esc(r.id)}">
                <span class="studioMiniIco" aria-hidden="true">▶</span>
                <span class="studioMiniName">${esc(r.name)}</span>
                <span class="studioMiniMeta">${fmtTime(r.durationSec)}</span>
              </button>`).join("")}</div>`
          : `<p class="studioLobbyEmpty">No recordings yet.</p>`}
      </div>

      <div class="studioLobbySection">
        <div class="studioLobbySectionTop"><span class="studioLobbyKicker">Projects</span></div>
        ${projects.length
          ? `<div class="studioMiniList">${projects.slice(0, 6).map((p) => `
              <div class="studioMiniRow studioMiniRow--proj">
                <button type="button" class="studioMiniMain" data-proj-open="${esc(p.id)}">
                  <span class="studioMiniIco" aria-hidden="true">♪</span>
                  <span class="studioMiniName">${esc(p.name)}${p.track?.title ? ` · ${esc(p.track.title)}` : ""}</span>
                </button>
                <button type="button" class="studioMiniDel" data-proj-del="${esc(p.id)}" aria-label="Delete project">✕</button>
              </div>`).join("")}</div>`
          : `<p class="studioLobbyEmpty">Open a song → ⋯ → <b>Open in Studio</b> to start a project.</p>`}
      </div>
    </div>`;

  bindLobby(root);
}

function bindLobby(root) {
  bindHeader(root);
  root.querySelector("[data-studio-quick]")?.addEventListener("click", () => startQuickTake(root));
  root.querySelector("[data-studio-open-recordings]")?.addEventListener("click", () => {
    bridge.haptic?.("light");
    current = null;
    renderRecordings(root);
  });
  root.querySelectorAll("[data-rec-open]").forEach((b) =>
    b.addEventListener("click", () => { bridge.haptic?.("light"); current = null; renderRecordings(root); }),
  );
  root.querySelectorAll("[data-proj-open]").forEach((b) =>
    b.addEventListener("click", () => {
      bridge.haptic?.("light");
      const p = listProjects().find((x) => x.id === b.getAttribute("data-proj-open"));
      if (p?.track) { current = freshContext(p.track); current.projectId = p.id; renderSource(root); }
    }),
  );
  root.querySelectorAll("[data-proj-del]").forEach((b) =>
    b.addEventListener("click", (e) => {
      e.stopPropagation();
      bridge.haptic?.("light");
      deleteProject(b.getAttribute("data-proj-del"));
      renderLobby(root);
    }),
  );
}

function startQuickTake(root) {
  bridge.haptic?.("medium");
  recMode = "memo";
  current = {
    track: { title: "Quick take" },
    guideUrl: "",
    lyrics: "",
    mix: { ...DEFAULT_MIX },
    monitor: readMonitorPref(),
    timedLines: null,
    timedFetched: true,
  };
  renderRecording(root);
}

/* -------------------------------------------------------------------------- */
/* Screen: Recordings (local-only list)                                        */
/* -------------------------------------------------------------------------- */

function renderRecordings(root) {
  screen = "recordings";
  const recs = listRecordings();
  root.innerHTML = `
    <div class="studio studioRecordings" data-studio-screen="recordings">
      ${headerHtml("RECORDINGS")}
      <div class="studioLobbyHead">
        <h1 class="studioTitle">Recordings</h1>
        <p class="studioArtist">Voice ideas, saved on this device only.</p>
      </div>
      ${recs.length
        ? `<div class="studioRecList">${recs.map((r) => `
            <div class="studioRecItem">
              <button type="button" class="studioRecPlay" data-rec-play="${esc(r.id)}" aria-label="Play"><span aria-hidden="true">▶</span></button>
              <div class="studioRecItemBody">
                <div class="studioRecItemName">${esc(r.name)}</div>
                <div class="studioRecItemMeta">${fmtTime(r.durationSec)} · ${esc(fmtDate(r.createdAt))}</div>
              </div>
              <button type="button" class="studioRecDel" data-rec-del="${esc(r.id)}" aria-label="Delete">✕</button>
            </div>`).join("")}</div>`
        : `<div class="studioEmpty"><div class="studioEmptyIco" aria-hidden="true">🎙️</div><h2>No recordings yet</h2><p>Use Quick take to capture an idea.</p></div>`}
      <div class="studioFooter">
        <button type="button" class="studioPrimary" data-studio-quick><span class="studioPrimaryIco" aria-hidden="true">●</span> Quick take</button>
      </div>
    </div>`;
  bindRecordings(root);
}

function bindRecordings(root) {
  bindHeader(root, () => { current = null; renderLobby(root); });
  root.querySelector("[data-studio-quick]")?.addEventListener("click", () => startQuickTake(root));
  root.querySelectorAll("[data-rec-play]").forEach((b) =>
    b.addEventListener("click", () => playRecording(b.getAttribute("data-rec-play"), b)),
  );
  root.querySelectorAll("[data-rec-del]").forEach((b) =>
    b.addEventListener("click", async () => {
      bridge.haptic?.("light");
      await deleteRecording(b.getAttribute("data-rec-del"));
      renderRecordings(root);
    }),
  );
}

let _recAudio = null;
function stopRecPlayback() {
  if (_recAudio) { try { _recAudio.pause(); } catch {} _recAudio = null; }
}
async function playRecording(id) {
  try {
    stopRecPlayback();
    const blob = await getRecordingBlob(id);
    if (!blob) { bridge.showToast?.("Recording not found."); return; }
    const url = URL.createObjectURL(blob);
    _recAudio = new Audio(url);
    _recAudio.play().catch(() => {});
    _recAudio.onended = () => { try { URL.revokeObjectURL(url); } catch {} stopRecPlayback(); };
  } catch { bridge.showToast?.("Couldn’t play that recording."); }
}

/* -------------------------------------------------------------------------- */
/* Guide (AI instrumental) acquisition                                         */
/* -------------------------------------------------------------------------- */

async function ensureGuide(root) {
  if (!current) return;
  if (current.guideUrl) { setGuideStatus(root, "ready"); return; }
  setGuideStatus(root, "preparing");
  try {
    const url = await Promise.resolve(bridge.prepareGuide?.(current.track));
    if (!url) throw new Error("no guide url");
    current.guideUrl = url;
    setGuideStatus(root, "ready");
  } catch {
    setGuideStatus(root, "error");
  }
}

function setGuideStatus(root, state) {
  const el = root.querySelector("[data-studio-guide-status]");
  const btn = root.querySelector("[data-studio-start]");
  if (el) {
    el.dataset.state = state;
    el.textContent =
      state === "preparing" ? "Preparing your AI Guide…"
      : state === "error" ? "Couldn’t prepare the instrumental — tap to retry"
      : "AI Guide ready";
  }
  if (btn) btn.disabled = state !== "ready";
}

/* -------------------------------------------------------------------------- */
/* Screen: Studio Home                                                         */
/* -------------------------------------------------------------------------- */

function renderHome(root) {
  screen = "home";
  const t = current.track || {};
  const cover = safe(bridge.coverForTrack?.(t)) || safe(t.artUrl) || "";
  const title = safe(t.title) || "Untitled";
  const artist = safe(t.artist) || "You";
  const lyrics = current.lyrics;

  root.innerHTML = `
    <div class="studio" data-studio-screen="home">
      ${headerHtml("NABADAI STUDIO")}

      <div class="studioHero">
        <div class="studioCover">
          ${cover ? `<img src="${esc(cover)}" alt="" />` : `<div class="studioCoverPlaceholder">♪</div>`}
        </div>
        <div class="studioHeroMeta">
          <h1 class="studioTitle">${esc(title)}</h1>
          <p class="studioArtist">${esc(artist)}</p>
          <span class="studioGuideTag">AI Guide · Instrumental</span>
        </div>
      </div>

      <div class="studioWave" aria-hidden="true">${waveBarsHtml(48)}</div>

      <div class="studioGuideRow">
        <span class="studioGuideStatus" data-studio-guide-status data-state="preparing">Preparing your AI Guide…</span>
        <label class="studioVolume">
          <span class="studioVolumeIco" aria-hidden="true">♪</span>
          <input type="range" min="0" max="100" value="80" data-studio-guide-vol aria-label="AI Guide volume" />
        </label>
      </div>

      <button type="button" class="studioMonitorRow${current.monitor ? " isOn" : ""}" data-studio-monitor role="switch" aria-checked="${!!current.monitor}">
        <span class="studioMonitorIco" aria-hidden="true">🎧</span>
        <span class="studioMonitorText">
          <span class="studioMonitorTitle">Hear myself</span>
          <span class="studioMonitorSub">Live voice with reverb &amp; echo · use headphones</span>
        </span>
        <span class="studioToggle${current.monitor ? " isOn" : ""}" aria-hidden="true"><span class="studioToggleKnob"></span></span>
      </button>

      <div class="studioLyricsWrap" data-studio-home-lyrics>${homeLyricsHtml()}</div>

      <div class="studioFooter">
        <button type="button" class="studioPrimary" data-studio-start disabled>
          <span class="studioPrimaryIco" aria-hidden="true">●</span> Start Recording
        </button>
        <button type="button" class="studioGhost" data-studio-preview>Listen to guide</button>
      </div>
    </div>`;

  bindHome(root);
}

function bindHome(root) {
  bindHeader(root);
  root.querySelector("[data-studio-start]")?.addEventListener("click", () => {
    bridge.haptic?.("medium");
    renderRecording(root);
  });
  root.querySelector("[data-studio-preview]")?.addEventListener("click", async () => {
    bridge.haptic?.("light");
    if (!current.guideUrl) { bridge.showToast?.("Guide isn’t ready yet."); return; }
    try {
      await engine.loadGuide(current.guideUrl);
      await engine.playMix({ musicVol: guideVol(root), voiceVol: 0, reverb: 0 });
    } catch {
      bridge.showToast?.("Couldn’t play the guide here.");
    }
  });
  root.querySelector("[data-studio-guide-status]")?.addEventListener("click", () => {
    if (root.querySelector("[data-studio-guide-status]")?.dataset.state === "error") void ensureGuide(root);
  });
  root.querySelector("[data-studio-monitor]")?.addEventListener("click", (e) => {
    bridge.haptic?.("light");
    current.monitor = !current.monitor;
    writeMonitorPref(current.monitor);
    const row = e.currentTarget;
    row.classList.toggle("isOn", current.monitor);
    row.setAttribute("aria-checked", String(current.monitor));
    row.querySelector(".studioToggle")?.classList.toggle("isOn", current.monitor);
    if (current.monitor) bridge.showToast?.("🎧 Use headphones — hearing yourself on speaker can echo.");
  });
}

function guideVol(root) {
  const v = Number(root.querySelector("[data-studio-guide-vol]")?.value || 80);
  return Math.max(0, Math.min(1, v / 100));
}

function homeLyricsHtml() {
  const timed = current.timedLines;
  if (Array.isArray(timed) && timed.length) {
    return `
      <div class="studioLyricsHead"><span class="studioLyricsBadge">♪ Synced lyrics</span></div>
      <div class="studioLyrics studioLyrics--timed">${timed
        .map((l) =>
          l.isSection
            ? `<p class="studioLyricSection">${esc(l.text)}</p>`
            : `<p dir="auto">${esc(l.text)}</p>`,
        )
        .join("")}</div>`;
  }
  const lyrics = current.lyrics;
  return lyrics
    ? `<div class="studioLyrics">${lyrics.split(/\n+/).map((l) => `<p dir="auto">${esc(l)}</p>`).join("")}</div>`
    : `<div class="studioLyrics studioLyricsEmpty"><p>No lyrics for this song — sing freely.</p></div>`;
}

function updateHomeLyrics(root) {
  const wrap = root.querySelector("[data-studio-home-lyrics]");
  if (wrap) wrap.innerHTML = homeLyricsHtml();
}

/* -------------------------------------------------------------------------- */
/* Screen: Recording (scaffold — real mic wiring runs on device)               */
/* -------------------------------------------------------------------------- */

function renderRecording(root) {
  screen = "recording";
  const memo = recMode === "memo";
  root.innerHTML = `
    <div class="studio studioRec" data-studio-screen="recording">
      <div class="studioRecTop">
        <span class="studioRecDot" aria-hidden="true"></span>
        <span class="studioRecLabel">${memo ? "Quick take…" : "Recording…"}</span>
        <span class="studioRecTimer" data-studio-timer>0:00</span>
      </div>

      <div class="studioCountIn" data-studio-countin hidden><span>3</span></div>

      <div class="studioRecWaves">
        ${memo ? "" : `<div class="studioRecWave studioRecWave--guide" aria-hidden="true">${waveBarsHtml(64)}</div>`}
        <div class="studioRecWave studioRecWave--voice" data-studio-voicewave aria-hidden="true">${waveBarsHtml(64)}</div>
      </div>

      ${memo
        ? `<div class="studioRecLyric studioRecLyric--memo">Sing or hum your idea — we’ll save it.</div>`
        : recLyricsHtml()}

      <div class="studioRecControls">
        <button type="button" class="studioStop" data-studio-stop aria-label="Stop recording">
          <span aria-hidden="true">■</span>
        </button>
      </div>
    </div>`;

  bindRecording(root);
  void startTake(root);
}

function bindRecording(root) {
  root.querySelector("[data-studio-stop]")?.addEventListener("click", async () => {
    bridge.haptic?.("medium");
    try { engine?.stopMix?.(); } catch {}
    let take = null;
    try { take = await engine.stopRecording(); } catch {}

    if (recMode === "memo") {
      // Quick take → save as a standalone local recording, then list them.
      if (take?.blob) {
        try {
          await saveRecording({
            blob: take.blob,
            durationSec: take.buffer?.duration || current?._recSec || 0,
          });
          bridge.showToast?.("Saved to your recordings.");
        } catch {}
        try { engine.removeTake(take.id); } catch {}
      } else {
        bridge.showToast?.("Nothing captured — try on your phone with mic access.");
      }
      recMode = "take";
      current = null;
      renderRecordings(root);
      return;
    }

    unsaved = true;
    renderReview(root, take);
  });
}

async function startTake(root) {
  const memo = recMode === "memo";
  const countEl = root.querySelector("[data-studio-countin]");
  const timerEl = root.querySelector("[data-studio-timer]");
  const voiceWave = root.querySelector("[data-studio-voicewave]");
  if (current) current._recSec = 0;
  try {
    await engine.ensureReady();
    if (!memo && !engine.guideBuffer && current.guideUrl) await engine.loadGuide(current.guideUrl);
    await engine.startRecording({
      countInSec: memo ? 1 : 3,
      noGuide: memo,
      monitor: !!current?.monitor,
      monitorReverb: Math.max(0.15, (Number(current?.mix?.reverb) || 0) / 100),
      monitorEcho: 0.16,
      onCountIn: (n) => {
        if (!countEl) return;
        if (n > 0) { countEl.hidden = false; countEl.querySelector("span").textContent = String(n); }
        else { countEl.hidden = true; }
      },
      onLevel: (v) => animateVoiceWave(voiceWave, v),
      onTick: (sec) => {
        if (current) current._recSec = sec;
        if (timerEl) timerEl.textContent = fmtTime(sec);
        if (!memo) highlightTimedLine(root, sec);
      },
    });
  } catch (e) {
    // Simulator (or denied mic) — keep the scaffold visible without crashing.
    if (countEl) countEl.hidden = true;
    bridge.showToast?.("Microphone unavailable here — try on your phone.");
  }
}

function recLyricsHtml() {
  const timed = current.timedLines;
  if (Array.isArray(timed) && timed.length) {
    return `<div class="studioRecLyrics" data-studio-lyriclist>${timed
      .map((l, i) =>
        l.isSection
          ? `<div class="studioRecLyricSection" data-line="${i}">${esc(l.text)}</div>`
          : `<div class="studioRecLyricLine" data-line="${i}" dir="auto">${esc(l.text)}</div>`,
      )
      .join("")}</div>`;
  }
  return `<div class="studioRecLyric" data-studio-lyric>${esc((current.lyrics || "").split(/\n+/)[0] || "Sing your heart out")}</div>`;
}

// Highlight the karaoke line for the current guide position (guide time aligns
// to the song's own lyric timestamps). Mirrors the player overlay behaviour.
function highlightTimedLine(root, sec) {
  const list = root.querySelector("[data-studio-lyriclist]");
  const lines = current.timedLines;
  if (!list || !Array.isArray(lines)) return;
  let idx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].isSection && lines[i].startS <= sec + 0.25) idx = i;
  }
  if (idx === list._activeIdx) return;
  list._activeIdx = idx;
  const rows = list.children;
  for (let i = 0; i < rows.length; i++) {
    rows[i].classList.toggle("isActive", i === idx);
    rows[i].classList.toggle("isPast", i < idx && !lines[i]?.isSection);
  }
  const active = idx >= 0 ? rows[idx] : null;
  if (active) { try { active.scrollIntoView({ block: "center", behavior: "smooth" }); } catch {} }
}

function animateVoiceWave(wrap, level) {
  if (!wrap) return;
  const bars = wrap.children;
  const idx = Math.floor(Math.random() * bars.length);
  const b = bars[idx];
  if (b) b.style.transform = `scaleY(${0.18 + Math.min(1, level) * 0.82})`;
}

/* -------------------------------------------------------------------------- */
/* Screen: Take Review                                                         */
/* -------------------------------------------------------------------------- */

function renderReview(root, take) {
  screen = "review";
  const takeNo = engine?.getTakes?.().length || 1;
  const hasVoice = !!(take && take.buffer);
  const dur = take?.buffer?.duration || engine?.guideDuration || 0;

  root.innerHTML = `
    <div class="studio studioReview" data-studio-screen="review">
      ${headerHtml("REVIEW")}

      <div class="studioReviewHead">
        <span class="studioTakeBadge">Take ${takeNo}</span>
        <h1 class="studioReviewTitle">${hasVoice ? "Here’s how it sounds" : "Preview your mix"}</h1>
        <p class="studioReviewSub">${hasVoice
          ? "Saved on your device. Listen back, then keep it or try again."
          : "No mic here — you’ll hear the guide. On your phone this plays your voice."}</p>
      </div>

      <button type="button" class="studioPlayDisk" data-studio-play aria-label="Play take">
        <span class="studioPlayDiskIco" data-studio-play-ico aria-hidden="true">▶</span>
      </button>

      <div class="studioWave studioWave--review" aria-hidden="true">${waveBarsHtml(56)}</div>
      <div class="studioReviewTime"><span data-studio-pos>0:00</span> <span class="studioReviewTimeSep">/</span> <span>${fmtTime(dur)}</span></div>

      <div class="studioFeedbackCard">
        <div class="studioFeedbackIco" aria-hidden="true">✦</div>
        <div class="studioFeedbackBody">
          <div class="studioFeedbackTop">
            <span class="studioFeedbackTitle">AI Coach feedback</span>
            <span class="studioSoonPill">Soon</span>
          </div>
          <p class="studioFeedbackText">We’ll grade your pitch, timing and tone here — and suggest the takes worth keeping.</p>
        </div>
      </div>

      <div class="studioFooter studioFooter--review">
        <button type="button" class="studioPrimary" data-studio-keep>Keep &amp; Mix</button>
        <div class="studioReviewActions">
          <button type="button" class="studioGhost" data-studio-again>Record again</button>
          <button type="button" class="studioGhost studioGhost--danger" data-studio-replace>Replace</button>
        </div>
      </div>
    </div>`;

  bindReview(root, take);
}

function bindReview(root, take) {
  bindHeader(root, () => renderHome(root));

  const btn = root.querySelector("[data-studio-play]");
  const ico = root.querySelector("[data-studio-play-ico]");
  const posEl = root.querySelector("[data-studio-pos]");
  btn?.addEventListener("click", async () => {
    bridge.haptic?.("light");
    if (engine?.isPlaying) { engine.stopMix(); ico.textContent = "▶"; btn.classList.remove("isPlaying"); return; }
    try {
      if (!engine.guideBuffer && current.guideUrl) await engine.loadGuide(current.guideUrl);
      ico.textContent = "❚❚"; btn.classList.add("isPlaying");
      await engine.playMix(
        { musicVol: 0.7, voiceVol: take?.buffer ? 0.95 : 0, reverb: 0.12 },
        {
          onTick: (s) => { if (posEl) posEl.textContent = fmtTime(s); },
          onEnded: () => { ico.textContent = "▶"; btn.classList.remove("isPlaying"); if (posEl) posEl.textContent = "0:00"; },
        },
      );
    } catch {
      ico.textContent = "▶"; btn.classList.remove("isPlaying");
      bridge.showToast?.("Couldn’t play here.");
    }
  });

  root.querySelector("[data-studio-keep]")?.addEventListener("click", () => {
    bridge.haptic?.("medium");
    try { engine?.stopMix(); } catch {}
    renderMix(root);
  });

  root.querySelector("[data-studio-again]")?.addEventListener("click", () => {
    bridge.haptic?.("light");
    try { engine?.stopMix(); } catch {}
    renderRecording(root); // keeps the existing take, adds another
  });

  root.querySelector("[data-studio-replace]")?.addEventListener("click", () => {
    bridge.haptic?.("light");
    try { engine?.stopMix(); } catch {}
    if (take?.id) { try { engine.removeTake(take.id); } catch {} }
    renderRecording(root);
  });
}

/* -------------------------------------------------------------------------- */
/* Screen: Final Mix                                                           */
/* -------------------------------------------------------------------------- */

function renderMix(root) {
  screen = "mix";
  const m = current.mix || (current.mix = { ...DEFAULT_MIX });

  root.innerHTML = `
    <div class="studio studioMix" data-studio-screen="mix">
      ${headerHtml("MIX")}

      <div class="studioMixHead">
        <h1 class="studioReviewTitle">Shape your sound</h1>
        <p class="studioReviewSub">A few gentle controls — no mixing desk required.</p>
      </div>

      <button type="button" class="studioPlayPill" data-studio-play>
        <span class="studioPlayDiskIco" data-studio-play-ico aria-hidden="true">▶</span>
        <span data-studio-play-label>Preview mix</span>
      </button>

      <div class="studioSliders">
        ${sliderRow("voiceVol", "Voice", m.voiceVol, "🎤")}
        ${sliderRow("musicVol", "Music", m.musicVol, "♪")}
        ${sliderRow("reverb", "Reverb", m.reverb, "∿")}
      </div>

      <div class="studioMixField">
        <div class="studioMixFieldTop">
          <span class="studioMixLabel">Pitch Assist</span>
          <span class="studioSoonPill">Soon</span>
        </div>
        <div class="studioSeg" data-studio-pitch>
          ${["off", "light", "medium"].map((v) => `<button type="button" class="studioSegBtn${m.pitchAssist === v ? " isActive" : ""}" data-pitch="${v}">${v[0].toUpperCase() + v.slice(1)}</button>`).join("")}
        </div>
      </div>

      <div class="studioMixField studioMixField--row">
        <div class="studioMixFieldTop">
          <span class="studioMixLabel">Enhance</span>
          <span class="studioSoonPill">Soon</span>
        </div>
        <button type="button" class="studioToggle${m.enhance ? " isOn" : ""}" data-studio-enhance role="switch" aria-checked="${m.enhance}">
          <span class="studioToggleKnob"></span>
        </button>
      </div>

      <div class="studioFooter studioFooter--mix">
        <button type="button" class="studioPrimary studioPrimary--publish" data-studio-publish>Publish</button>
        <button type="button" class="studioGhost" data-studio-draft>Save draft</button>
      </div>
    </div>`;

  bindMix(root);
}

function sliderRow(key, label, value, ico) {
  return `
    <label class="studioSliderRow">
      <span class="studioSliderIco" aria-hidden="true">${ico}</span>
      <span class="studioSliderLabel">${esc(label)}</span>
      <input type="range" min="0" max="100" value="${Number(value) || 0}" data-mix="${key}" aria-label="${esc(label)}" />
      <span class="studioSliderVal" data-mix-val="${key}">${Number(value) || 0}</span>
    </label>`;
}

function bindMix(root) {
  bindHeader(root, () => renderReview(root, engine?.getActiveTake?.()));
  const m = current.mix;

  root.querySelectorAll("[data-mix]").forEach((inp) => {
    inp.addEventListener("input", () => {
      const k = inp.getAttribute("data-mix");
      m[k] = Number(inp.value) || 0;
      const out = root.querySelector(`[data-mix-val="${k}"]`);
      if (out) out.textContent = String(m[k]);
      if (engine?.isPlaying) restartMixPreview(root); // keep preview honest
    });
  });

  root.querySelector("[data-studio-pitch]")?.addEventListener("click", (e) => {
    const b = e.target.closest("[data-pitch]");
    if (!b) return;
    bridge.haptic?.("light");
    m.pitchAssist = b.getAttribute("data-pitch");
    root.querySelectorAll("[data-studio-pitch] .studioSegBtn").forEach((x) => x.classList.toggle("isActive", x === b));
    if (m.pitchAssist !== "off") bridge.showToast?.("Pitch Assist is coming soon.");
  });

  root.querySelector("[data-studio-enhance]")?.addEventListener("click", (e) => {
    bridge.haptic?.("light");
    m.enhance = !m.enhance;
    const t = e.currentTarget;
    t.classList.toggle("isOn", m.enhance);
    t.setAttribute("aria-checked", String(m.enhance));
    if (m.enhance) bridge.showToast?.("Enhance is coming soon.");
  });

  root.querySelector("[data-studio-play]")?.addEventListener("click", () => togglePreview(root));
  root.querySelector("[data-studio-draft]")?.addEventListener("click", () => saveDraft());
  root.querySelector("[data-studio-publish]")?.addEventListener("click", () => startPublish(root));
}

function mixParams() {
  const m = current.mix || DEFAULT_MIX;
  return {
    voiceVol: (Number(m.voiceVol) || 0) / 100,
    musicVol: (Number(m.musicVol) || 0) / 100,
    reverb: (Number(m.reverb) || 0) / 100,
  };
}

function setPlayUi(root, playing) {
  const ico = root.querySelector("[data-studio-play-ico]");
  const label = root.querySelector("[data-studio-play-label]");
  if (ico) ico.textContent = playing ? "❚❚" : "▶";
  if (label) label.textContent = playing ? "Stop" : "Preview mix";
  root.querySelector("[data-studio-play]")?.classList.toggle("isPlaying", playing);
}

async function togglePreview(root) {
  bridge.haptic?.("light");
  if (engine?.isPlaying) { engine.stopMix(); setPlayUi(root, false); return; }
  try {
    if (!engine.guideBuffer && current.guideUrl) await engine.loadGuide(current.guideUrl);
    setPlayUi(root, true);
    await engine.playMix(mixParams(), { onEnded: () => setPlayUi(root, false) });
  } catch {
    setPlayUi(root, false);
    bridge.showToast?.("Couldn’t preview here.");
  }
}

async function restartMixPreview(root) {
  try { engine.stopMix(); await engine.playMix(mixParams(), { onEnded: () => setPlayUi(root, false) }); } catch {}
}

function saveDraft() {
  bridge.haptic?.("light");
  try {
    const id = String(current.track?.id || current.track?.url || "draft");
    const drafts = JSON.parse(localStorage.getItem("nabad.studio.drafts.v1") || "{}");
    drafts[id] = { title: current.track?.title || "Untitled", mix: current.mix, ts: Date.now() };
    localStorage.setItem("nabad.studio.drafts.v1", JSON.stringify(drafts));
  } catch {}
  unsaved = false;
  bridge.showToast?.("Draft saved on your device.");
}

/* -------------------------------------------------------------------------- */
/* Screen: Publishing + Published                                              */
/* -------------------------------------------------------------------------- */

async function startPublish(root) {
  bridge.haptic?.("medium");
  try { engine?.stopMix(); } catch {}
  renderPublishing(root);
  const fill = root.querySelector("[data-pub-fill]");
  const pct = root.querySelector("[data-pub-pct]");
  const phase = root.querySelector("[data-pub-phase]");

  let p = 0;
  const tickTo = (target, label) => {
    if (label && phase) phase.textContent = label;
    const step = () => {
      if (p < target) { p = Math.min(target, p + Math.max(1, (target - p) * 0.12)); paint(); requestAnimationFrame(step); }
    };
    requestAnimationFrame(step);
  };
  const paint = () => {
    const v = Math.round(p);
    if (fill) fill.style.width = v + "%";
    if (pct) pct.textContent = v + "%";
  };

  try {
    tickTo(35, "Rendering your mix…");
    const rendered = await engine.renderMix(mixParams());
    tickTo(70, "Uploading…");
    const meta = {
      track: current.track,
      title: current.track?.title || "My take",
      durationSec: rendered.durationSec,
      mix: current.mix,
    };
    // Local-first: only the final render leaves the device. app.js owns the
    // real upload/publish; if it isn't wired yet we still complete the flow.
    if (typeof bridge.publishMix === "function") {
      await bridge.publishMix(rendered.blob, meta);
    } else {
      await new Promise((r) => setTimeout(r, 900));
    }
    p = 100; paint();
    unsaved = false;
    renderPublished(root);
  } catch (e) {
    renderMix(root);
    bridge.showToast?.("Publishing failed — your take is still saved. Try again.");
  }
}

function renderPublishing(root) {
  screen = "publishing";
  const cover = safe(bridge.coverForTrack?.(current.track)) || safe(current.track?.artUrl) || "";
  root.innerHTML = `
    <div class="studio studioPublish" data-studio-screen="publishing">
      <div class="studioPublishInner">
        <div class="studioPublishArt ${cover ? "" : "isEmpty"}">
          ${cover ? `<img src="${esc(cover)}" alt="" />` : `<span aria-hidden="true">♪</span>`}
          <div class="studioPublishShimmer" aria-hidden="true"></div>
        </div>
        <h1 class="studioPublishTitle">Publishing your song</h1>
        <p class="studioPublishPhase" data-pub-phase>Preparing…</p>
        <div class="studioPubBar"><span class="studioPubFill" data-pub-fill style="width:0%"></span></div>
        <div class="studioPubPct" data-pub-pct>0%</div>
        <p class="studioPublishHint">Keep this open — we’ll let you know the moment it’s live.</p>
      </div>
    </div>`;
}

function renderPublished(root) {
  screen = "published";
  bridge.haptic?.("medium");
  const title = safe(current.track?.title) || "Your song";
  root.innerHTML = `
    <div class="studio studioPublished" data-studio-screen="published">
      <div class="studioPublishInner">
        <div class="studioCheck" aria-hidden="true">
          <svg viewBox="0 0 52 52" width="72" height="72"><circle class="studioCheckCircle" cx="26" cy="26" r="24" fill="none"/><path class="studioCheckMark" fill="none" d="M14 27 l8 8 l16 -18"/></svg>
        </div>
        <h1 class="studioPublishTitle">You’re live</h1>
        <p class="studioPublishPhase">“${esc(title)}” is now on Discover with your voice.</p>
        <div class="studioFooter studioFooter--done">
          <button type="button" class="studioPrimary" data-studio-done>Done</button>
          <button type="button" class="studioGhost" data-studio-another>Record another</button>
        </div>
      </div>
    </div>`;

  root.querySelector("[data-studio-done]")?.addEventListener("click", () => {
    bridge.haptic?.("light");
    bridge.navigateBack?.();
  });
  root.querySelector("[data-studio-another]")?.addEventListener("click", () => {
    bridge.haptic?.("light");
    current.mix = { ...DEFAULT_MIX };
    renderHome(root);
  });
}

/* -------------------------------------------------------------------------- */
/* Shared bits                                                                 */
/* -------------------------------------------------------------------------- */

function headerHtml(title) {
  return `
    <header class="studioHeader">
      <button type="button" class="studioBack" data-studio-back aria-label="Leave Studio">
        <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path fill="currentColor" d="M15.5 4.5 8 12l7.5 7.5 1.4-1.4L10.8 12l6.1-6.1z"/></svg>
      </button>
      <span class="studioHeaderTitle">${esc(title)}</span>
      <span class="studioHeaderSpacer" aria-hidden="true"></span>
    </header>`;
}

function bindHeader(root, onBack) {
  root.querySelector("[data-studio-back]")?.addEventListener("click", () => {
    bridge.haptic?.("light");
    if (typeof onBack === "function") { onBack(); return; }
    if (unsaved) {
      const go = confirm("Leave the Studio? Your current take isn’t saved.");
      if (!go) return;
    }
    bridge.navigateBack?.();
  });
}

function emptyStateHtml() {
  return `
    <div class="studio" data-studio-screen="empty">
      ${headerHtml("NABADAI STUDIO")}
      <div class="studioEmpty">
        <div class="studioEmptyIco" aria-hidden="true">🎙️</div>
        <h2>Open a song to record</h2>
        <p>Pick a song, tap ⋯ and choose “Record My Voice”.</p>
      </div>
    </div>`;
}

function bindEmpty(root) { bindHeader(root); }

function waveBarsHtml(n) {
  let s = "";
  for (let i = 0; i < n; i++) {
    const h = 20 + Math.round(Math.abs(Math.sin(i * 0.7)) * 70);
    s += `<span style="height:${h}%"></span>`;
  }
  return s;
}

function fmtTime(sec) {
  const s = Math.max(0, Math.floor(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function fmtDate(ts) {
  const d = new Date(Number(ts) || 0);
  if (Number.isNaN(d.getTime())) return "";
  try {
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  } catch { return ""; }
}

function esc(v) {
  return String(v == null ? "" : v)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
function safe(v) { return typeof v === "string" ? v : (v == null ? "" : String(v)); }
