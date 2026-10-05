/**
 * Melody Lock — admin-only lab UI (staging bake). Drop if we don't ship the feature.
 */
import { NABAD_MELODY_LOCK_PUBLIC_SHIPPED } from "./feature-flags.js";
import { recordHumToMelody } from "./melody/extract.js";
import { playMelodyPreview } from "./melody/preview.js";
import { resolveLyriaDisplayTitle } from "./lyria-display-title.js";

let bridge = {};

export function configureMelodyLockAdmin(b) {
  bridge = b || {};
}

function clientMelodyLockUiBaked() {
  try {
    return Boolean(window.__NABAD_CLIENT_ENV__?.nabadMelodyLockUi);
  } catch {
    return false;
  }
}

export function melodyLockAdminEnabled() {
  try {
    if (NABAD_MELODY_LOCK_PUBLIC_SHIPPED) {
      return Boolean(bridge.isAdmin?.());
    }
    return Boolean(clientMelodyLockUiBaked() && bridge.isAdmin?.());
  } catch {
    return false;
  }
}

function rootEl() {
  return document.getElementById("melodyLockRoot");
}

function apiFetch(path, opts = {}) {
  const headers = { ...(opts?.headers || {}) };
  const token = bridge.getAuthToken?.() || "";
  if (token && !headers.Authorization) headers.Authorization = `Bearer ${token}`;
  if (typeof bridge.apiFetch === "function") return bridge.apiFetch(path, { ...opts, headers });
  return fetch(path, { ...opts, headers });
}

function toast(msg, opts) {
  try {
    bridge.showToast?.(msg, opts);
  } catch {}
}

function escapeHtml(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function defaultStyleValue() {
  const bpm = state.tempoBpm > 0 ? state.tempoBpm : 96;
  return `dry monophonic synth lead, ${bpm} BPM, no pads`;
}

const state = {
  melodyId: "",
  notes: [],
  tempoBpm: 0,
  inferredKey: "",
  lyriaPreview: "",
  analyzeProvider: "",
  taskId: "",
  pollTimer: 0,
  recording: false,
  lastRun: null,
  lastStatus: null,
  /** @type {30 | 60} */
  targetSeconds: 60,
};

function render() {
  const root = rootEl();
  if (!root) return;
  if (!melodyLockAdminEnabled()) {
    root.innerHTML = `<p class="melodyLockMuted">Melody Lock lab is off on this build.</p>`;
    return;
  }

  const notesPreview = (state.notes || [])
    .slice(0, 12)
    .map((n) => `midi ${n.midi} @ beat ${n.startBeat}`)
    .join("<br/>");

  root.innerHTML = `
    <div class="melodyLockLab">
      <header class="melodyLockLabHead">
        <button type="button" class="ghost melodyLockBack" id="melodyLockBack">← Settings</button>
        <h1 class="melodyLockTitle">Melody Lock <span class="melodyLockBadge">Admin · staging</span></h1>
        <p class="melodyLockSub">Hum → analyze → <strong>Lyria 3.5</strong> (short song cap) → score. Admin-only R&amp;D — not public product yet.</p>
      </header>

      <div class="melodyLockCard melodyLockExpect">
        <h2>What to expect (honest)</h2>
        <p class="melodyLockMuted">Your hum becomes a <strong>note timeline in the prompt</strong>, not audio Lyria listens to. We ask Lyria to use that contour as the <strong>main hook in every verse and chorus</strong> (same intervals, not note-perfect cloning).</p>
        <p class="melodyLockMuted">It often feels like a <strong>new pop tune inspired by</strong> your hum — tempo/key closer, melody frequently drifts. Ear-check decides pass/fail. Real “lock my hum” needs a provider with <strong>audio/MIDI conditioning</strong> (e.g. Mureka) — future branch.</p>
      </div>

      <div class="melodyLockCard">
        <h2>1 · Capture</h2>
        <p class="melodyLockMuted">Record ~12s hum — pitch → notes on device, sent as <code>clientMelody</code>. After analyze you should see <strong>analyze: client_pitch</strong> (not fixture).</p>
        ${state.analyzeProvider === "fixture" ? '<p class="melodyLockWarn">⚠ Fixture tune — not your hum. Turn off <code>MELODY_LOCK_USE_FIXTURE</code> on staging and record again.</p>' : ""}
        <div class="melodyLockRow">
          <button type="button" class="primary" id="melodyLockBtnRecord" ${state.recording ? "disabled" : ""}>${state.recording ? "Recording…" : "Record hum"}</button>
          <button type="button" class="ghost" id="melodyLockBtnFixture">Analyze fixture</button>
        </div>
      </div>

      <div class="melodyLockCard">
        <h2>2 · Analyze result</h2>
        <p id="melodyLockAnalyzeMeta" class="melodyLockMeta">${state.melodyId ? `melodyId: <code>${escapeHtml(state.melodyId)}</code> · ${state.notes.length} notes · ${state.tempoBpm} BPM · ${escapeHtml(state.inferredKey || "—")}${state.analyzeProvider ? ` · analyze: ${escapeHtml(state.analyzeProvider)}` : ""}` : "Not analyzed yet."}</p>
        <div class="melodyLockNotes">${notesPreview || "—"}</div>
        <p class="melodyLockMuted">Before Lyria: tap <strong>Play captured tune</strong>. If that beep melody is wrong, Lyria will be too (hum slower, one note at a time). If it matches your hum but Lyria doesn’t, that’s Lyria text-lock limits.</p>
        <div class="melodyLockRow">
          <button type="button" class="primary" id="melodyLockBtnPreviewCapture" ${state.notes?.length >= 2 ? "" : "disabled"}>Play captured tune</button>
        </div>
      </div>

      <div class="melodyLockCard">
        <h2>3 · Generate (Lyria 3.5)</h2>
        <fieldset class="melodyLockDurationPick">
          <legend class="label">Length cap (3.5 engine — not clip model)</legend>
          <label class="melodyLockRadio"><input type="radio" name="melodyLockDuration" value="30" ${state.targetSeconds === 30 ? "checked" : ""} /> 30 seconds</label>
          <label class="melodyLockRadio"><input type="radio" name="melodyLockDuration" value="60" ${state.targetSeconds === 60 ? "checked" : ""} /> 60 seconds</label>
        </fieldset>
        <label class="field"><span class="label">Song title</span>
          <input id="melodyLockTitle" type="text" placeholder="Blank = first 2 words of lyrics" value="" />
        </label>
        <label class="field"><span class="label">Style (secondary — melody grid wins)</span>
          <input id="melodyLockStyle" type="text" value="${escapeHtml(defaultStyleValue())}" />
        </label>
        <label class="field melodyLockCheck">
          <input id="melodyLockInstrumental" type="checkbox" checked />
          <span>Instrumental clip (recommended — vocals often hide the tune)</span>
        </label>
        <label class="field"><span class="label">Lyrics (ignored when instrumental)</span>
          <textarea id="melodyLockLyrics" rows="3">[Verse]
La la la
[Chorus]
La la la la</textarea>
        </label>
        <button type="button" class="primary" id="melodyLockBtnGenerate" ${state.melodyId ? "" : "disabled"}>Generate with Melody Lock</button>
        <p id="melodyLockTaskMeta" class="melodyLockMeta">${state.taskId ? `taskId: <code>${escapeHtml(state.taskId)}</code>` : ""}</p>
      </div>

      <div class="melodyLockCard">
        <h2>4 · Score &amp; ear</h2>
        <pre id="melodyLockScoreOut" class="melodyLockPre">${formatScoreBlock()}</pre>
        <div class="melodyLockRow">
          <button type="button" class="ghost" id="melodyLockBtnRefreshRun" ${state.taskId ? "" : "disabled"}>Refresh run</button>
          <button type="button" class="primary" id="melodyLockEarPass" ${state.taskId ? "" : "disabled"}>Ear: pass</button>
          <button type="button" class="ghost" id="melodyLockEarFail" ${state.taskId ? "" : "disabled"}>Ear: fail</button>
        </div>
        <button type="button" class="ghost" id="melodyLockBtnPlay" ${state.lastStatus?.audioUrl ? "" : "hidden"}>Play last clip</button>
      </div>
    </div>
  `;

  root.querySelector("#melodyLockBack")?.addEventListener("click", () => {
    try {
      location.hash = "#/settings";
    } catch {}
    bridge.scheduleApplyRoute?.();
  });
  root.querySelector("#melodyLockBtnRecord")?.addEventListener("click", () => void recordAndAnalyze());
  root.querySelector("#melodyLockBtnPreviewCapture")?.addEventListener("click", () => void previewCapturedTune());
  root.querySelector("#melodyLockBtnFixture")?.addEventListener("click", () => void analyzeFixture());
  root.querySelectorAll('input[name="melodyLockDuration"]').forEach((el) => {
    el.addEventListener("change", () => {
      const v = Number(el.value);
      state.targetSeconds = v === 30 ? 30 : 60;
    });
  });
  root.querySelector("#melodyLockBtnGenerate")?.addEventListener("click", () => void generateWithLyria35());
  root.querySelector("#melodyLockBtnRefreshRun")?.addEventListener("click", () => void refreshRun());
  root.querySelector("#melodyLockEarPass")?.addEventListener("click", () => void submitEar("pass"));
  root.querySelector("#melodyLockEarFail")?.addEventListener("click", () => void submitEar("fail"));
  root.querySelector("#melodyLockBtnPlay")?.addEventListener("click", () => void playLastClip());
}

function resolveClipPlaybackUrl(raw) {
  const s = String(raw || "").trim();
  if (!s) return "";
  if (typeof bridge.resolvePlaybackUrl === "function") {
    return bridge.resolvePlaybackUrl(s) || "";
  }
  if (typeof bridge.normalizeAudioUrlForPlayback === "function") {
    let u = s;
    if (typeof bridge.toAudioProxyUrl === "function") {
      u = bridge.toAudioProxyUrl(u) || u;
    }
    return bridge.normalizeAudioUrlForPlayback(u) || u;
  }
  return s;
}

async function playLastClip() {
  const raw = state.lastStatus?.audioUrl;
  const url = resolveClipPlaybackUrl(raw);
  if (!url) {
    toast("No playable URL on this clip yet.", { icon: "!", durationMs: 3500 });
    return;
  }
  try {
    if (typeof bridge.playInline === "function") {
      await bridge.playInline(url, "Melody Lock clip", {
        type: "melody_lock",
        taskId: state.taskId,
      });
      toast("Playing — check volume and the silent switch.", { icon: "♪", durationMs: 3500 });
      return;
    }
    const a = new Audio(url);
    a.volume = 1;
    await a.play();
  } catch (e) {
    toast(e?.message || "Playback failed on this device.", { icon: "!", durationMs: 5000 });
  }
}

function formatScoreBlock() {
  const ml = state.lastStatus?._melodyLock;
  const run = state.lastRun;
  if (!ml && !run) return "Generate a clip, then refresh run.";
  const lines = [];
  if (ml) {
    lines.push(`similarity: ${ml.melodySimilarity}`);
    lines.push(`score pass: ${ml.melodyScorePass}`);
    lines.push(`ear: ${ml.melodyEarPass}`);
    lines.push(`attempt: ${ml.melodyLockAttempt}`);
    lines.push(String(ml.melodyLockMessage || ""));
  }
  if (run) {
    lines.push("— run record —");
    lines.push(JSON.stringify(run, null, 2));
  }
  return escapeHtml(lines.join("\n"));
}

async function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result || ""));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

async function recordHumSeconds(sec = 12) {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const mime = MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "audio/mp4";
  const mr = new MediaRecorder(stream, { mimeType: mime });
  const chunks = [];
  mr.ondataavailable = (e) => {
    if (e.data?.size) chunks.push(e.data);
  };
  return new Promise((resolve, reject) => {
    mr.onerror = () => reject(mr.error || new Error("record_failed"));
    mr.onstop = async () => {
      try {
        for (const tr of stream.getTracks()) tr.stop();
        const blob = new Blob(chunks, { type: mime });
        resolve(await blobToDataUrl(blob));
      } catch (e) {
        reject(e);
      }
    };
    mr.start(200);
    setTimeout(() => {
      try {
        mr.stop();
      } catch (e) {
        reject(e);
      }
    }, sec * 1000);
  });
}

async function postAnalyze(payload) {
  const r = await apiFetch("/api/music/melody-lock/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data?.error || `Analyze failed (${r.status})`);
  return data;
}

function applyAnalyzeResult(data) {
  state.melodyId = String(data.melodyId || data.id || "").trim();
  state.notes = data.notes || data.melody?.notes || [];
  state.tempoBpm = Number(data.tempoBpm || data.inferredBpm || data.melody?.tempoBpm) || 0;
  state.inferredKey = String(data.inferredKey || data.melody?.inferredKey || "").trim();
  state.lyriaPreview = String(data.lyriaPromptPreview || "").trim();
  state.analyzeProvider = String(data.analyzeProvider || "").trim();
}

async function recordAndAnalyze() {
  if (state.recording) return;
  state.recording = true;
  render();
  try {
    toast("Recording ~12s — hum one clear tune", { icon: "🎤", durationMs: 3200 });
    /** @type {import("./melody/postprocess.js").Melody | null} */
    let captured = null;
    const session = await recordHumToMelody({
      maxSeconds: 12,
      bpm: 96,
      meter: "4/4",
      captureProfile: "hum",
      autoTempo: true,
      onDone: (m) => {
        captured = m;
      },
      onMicDenied: (err) => {
        throw err || new Error("Microphone permission denied.");
      },
    });
    await new Promise((resolve) => {
      setTimeout(() => {
        try {
          session.stop();
        } catch {}
        resolve();
      }, 12200);
    });
    await new Promise((r) => setTimeout(r, 250));
    if (!captured?.notes?.length) {
      throw new Error("No pitch detected — hum louder, closer to the mic, one note at a time.");
    }
    toast("Analyzing your contour…", { icon: "⏳", durationMs: 2000 });
    const data = await postAnalyze({ sourceKind: "hum", clientMelody: captured, audio: "" });
    applyAnalyzeResult(data);
    const prov = state.analyzeProvider || "unknown";
    toast(
      data.persisted === false
        ? `Notes from ${prov} (not saved — run Supabase SQL)`
        : `Melody analyzed (${prov})`,
      { icon: "✓" },
    );
  } catch (e) {
    toast(e?.message || "Record/analyze failed", { icon: "!", durationMs: 5000 });
  } finally {
    state.recording = false;
    render();
  }
}

async function previewCapturedTune() {
  if (!state.notes?.length) {
    toast("Record and analyze first.", { icon: "!", durationMs: 3000 });
    return;
  }
  try {
    toast("Playing captured notes…", { icon: "♪", durationMs: 2200 });
    await playMelodyPreview({
      tempoBpm: state.tempoBpm || 96,
      notes: state.notes,
    });
  } catch (e) {
    toast(e?.message || "Preview failed", { icon: "!", durationMs: 4500 });
  }
}

async function analyzeFixture() {
  try {
    toast("Fixture analyze…", { icon: "🧪", durationMs: 1800 });
    const data = await postAnalyze({ sourceKind: "hum", audio: "" });
    applyAnalyzeResult(data);
    toast("Fixture melody ready", { icon: "✓" });
  } catch (e) {
    toast(e?.message || "Fixture analyze failed", { icon: "!", durationMs: 5000 });
  }
  render();
}

async function generateWithLyria35() {
  if (!state.melodyId) return;
  if (state.analyzeProvider === "fixture") {
    toast("Fixture melody — record your hum first (client_pitch).", { icon: "!", durationMs: 5500 });
    return;
  }
  const duration =
    Number(rootEl()?.querySelector('input[name="melodyLockDuration"]:checked')?.value) ||
    state.targetSeconds ||
    60;
  state.targetSeconds = duration === 30 ? 30 : 60;
  const style = rootEl()?.querySelector("#melodyLockStyle")?.value?.trim() || defaultStyleValue();
  const prompt = rootEl()?.querySelector("#melodyLockLyrics")?.value?.trim() || "[Verse]\nLa la la\n[Chorus]\nLa la la la";
  const instrumental = Boolean(rootEl()?.querySelector("#melodyLockInstrumental")?.checked);
  const titleInput = rootEl()?.querySelector("#melodyLockTitle")?.value?.trim() || "";
  const title = resolveLyriaDisplayTitle({
    title: titleInput,
    lyrics: prompt,
    style,
    clip: duration <= 45,
    instrumental,
  });
  try {
    toast(`Starting Lyria 3.5 (~${duration}s cap)…`, { icon: "♪", durationMs: 2500 });
    const r = await apiFetch("/api/music/generate?provider=lyria", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        lyriaModel: "lyria-3.5",
        duration,
        title,
        style,
        prompt,
        instrumental: instrumental ? "1" : "0",
        geminiProducer: "0",
        melodyLock: { melodyId: state.melodyId },
      }),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data?.error || `Generate failed (${r.status})`);
    state.taskId = String(data?.data?.taskId || "").trim();
    state.lastRun = null;
    state.lastStatus = null;
    startPoll();
    toast(`Generating… ${state.taskId}`, { icon: "⏳", durationMs: 4000 });
  } catch (e) {
    toast(e?.message || "Generate failed", { icon: "!", durationMs: 5500 });
  }
  render();
}

function stopPoll() {
  if (state.pollTimer) clearInterval(state.pollTimer);
  state.pollTimer = 0;
}

function startPoll() {
  stopPoll();
  if (!state.taskId) return;
  void tickPoll();
  state.pollTimer = setInterval(() => void tickPoll(), 3500);
}

async function tickPoll() {
  if (!state.taskId) return;
  try {
    const path =
      typeof bridge.musicStatusPath === "function"
        ? bridge.musicStatusPath(state.taskId)
        : `/api/music/status?taskId=${encodeURIComponent(state.taskId)}`;
    const r = await apiFetch(path);
    const data = await r.json().catch(() => ({}));
    if (!r.ok) return;
    const status = String(data?.data?.status || "").toUpperCase();
    const clip = data?.data?.response?.sunoData?.[0] || data?.data?.response?.suno_data?.[0];
    const audioUrl = clip?.audioUrl || clip?.audio_url || "";
    if (data._melodyLock) state.lastStatus = { ...data._melodyLock, audioUrl };
    else if (audioUrl) state.lastStatus = { ...(state.lastStatus || {}), audioUrl };

    if (status === "SUCCESS" || status === "FAILED") {
      stopPoll();
      await refreshRun();
      const errMsg = String(data?.data?.errorMessage || data?.error || "").trim();
      if (status === "FAILED" && errMsg) {
        state.lastStatus = { ...(state.lastStatus || {}), errorMessage: errMsg };
      }
      toast(
        status === "SUCCESS"
          ? "Clip ready — check score"
          : errMsg.slice(0, 120) || "Generation failed",
        {
          icon: status === "SUCCESS" ? "✓" : "!",
          durationMs: 5500,
        },
      );
    }
    render();
  } catch {
    /* retry */
  }
}

async function refreshRun() {
  if (!state.taskId) return;
  try {
    const r = await apiFetch(`/api/music/melody-lock/run?taskId=${encodeURIComponent(state.taskId)}`);
    const data = await r.json().catch(() => ({}));
    if (r.ok && data.run) state.lastRun = data.run;
  } catch {}
  render();
}

async function submitEar(verdict) {
  if (!state.taskId) return;
  try {
    const r = await apiFetch("/api/music/melody-lock/ear-check", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ taskId: state.taskId, verdict }),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data?.error || "Ear check failed");
    state.lastRun = data.run || state.lastRun;
    toast(verdict === "pass" ? "Ear: pass saved" : "Ear: fail saved", { icon: "👂" });
  } catch (e) {
    toast(e?.message || "Ear check failed", { icon: "!" });
  }
  render();
}

export function enterMelodyLockLab() {
  if (!melodyLockAdminEnabled()) {
    toast("Melody Lock lab is admin + staging only.", { icon: "🔒", durationMs: 3200 });
    try {
      location.hash = "#/settings";
    } catch {}
    bridge.scheduleApplyRoute?.();
    return;
  }
  render();
}

export function syncMelodyLockSettingsRow() {
  const show = melodyLockAdminEnabled();
  const row = document.getElementById("settingsMelodyLockRow");
  if (row) {
    row.hidden = !show;
    row.style.display = show ? "" : "none";
  }
}

export function openMelodyLockFromSettings() {
  if (!melodyLockAdminEnabled()) {
    toast("Admin + staging build only.", { icon: "🔒" });
    return;
  }
  try {
    location.hash = "#/melody-lock";
  } catch {}
  bridge.scheduleApplyRoute?.();
}
