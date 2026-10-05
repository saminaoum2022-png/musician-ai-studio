/**
 * Melody Lock — admin-only lab UI (staging bake). Drop if we don't ship the feature.
 */
import { NABAD_MELODY_LOCK_PUBLIC_SHIPPED } from "./feature-flags.js";

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

const state = {
  melodyId: "",
  notes: [],
  tempoBpm: 0,
  inferredKey: "",
  lyriaPreview: "",
  taskId: "",
  pollTimer: 0,
  recording: false,
  lastRun: null,
  lastStatus: null,
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
        <p class="melodyLockSub">Hum → analyze → Lyria 30s clip → score. Ear-check is admin-only. Server needs <code>MELODY_LOCK_ENABLED=1</code>.</p>
      </header>

      <div class="melodyLockCard">
        <h2>1 · Capture</h2>
        <p class="melodyLockMuted">Record ~12s hum, or use fixture (no mic) when <code>MELODY_LOCK_USE_FIXTURE=1</code> on API.</p>
        <div class="melodyLockRow">
          <button type="button" class="primary" id="melodyLockBtnRecord" ${state.recording ? "disabled" : ""}>${state.recording ? "Recording…" : "Record hum"}</button>
          <button type="button" class="ghost" id="melodyLockBtnFixture">Analyze fixture</button>
        </div>
      </div>

      <div class="melodyLockCard">
        <h2>2 · Analyze result</h2>
        <p id="melodyLockAnalyzeMeta" class="melodyLockMeta">${state.melodyId ? `melodyId: <code>${escapeHtml(state.melodyId)}</code> · ${state.notes.length} notes · ${state.tempoBpm} BPM · ${escapeHtml(state.inferredKey || "—")}` : "Not analyzed yet."}</p>
        <div class="melodyLockNotes">${notesPreview || "—"}</div>
      </div>

      <div class="melodyLockCard">
        <h2>3 · Generate (Lyria clip ~30s)</h2>
        <label class="field"><span class="label">Style</span>
          <input id="melodyLockStyle" type="text" value="Arabic pop, warm, 104 BPM" />
        </label>
        <label class="field"><span class="label">Lyrics</span>
          <textarea id="melodyLockLyrics" rows="3">[Verse]
Test line
[Chorus]
Hook hook</textarea>
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
  root.querySelector("#melodyLockBtnFixture")?.addEventListener("click", () => void analyzeFixture());
  root.querySelector("#melodyLockBtnGenerate")?.addEventListener("click", () => void generateClip());
  root.querySelector("#melodyLockBtnRefreshRun")?.addEventListener("click", () => void refreshRun());
  root.querySelector("#melodyLockEarPass")?.addEventListener("click", () => void submitEar("pass"));
  root.querySelector("#melodyLockEarFail")?.addEventListener("click", () => void submitEar("fail"));
  root.querySelector("#melodyLockBtnPlay")?.addEventListener("click", () => {
    const url = state.lastStatus?.audioUrl;
    if (!url) return;
    try {
      const a = new Audio(url);
      void a.play();
    } catch {
      window.open(url, "_blank");
    }
  });
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

async function postAnalyze(body) {
  const r = await apiFetch("/api/music/melody-lock/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
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
}

async function recordAndAnalyze() {
  if (state.recording) return;
  state.recording = true;
  render();
  try {
    toast("Recording ~12s — hum your tune", { icon: "🎤", durationMs: 3200 });
    const audio = await recordHumSeconds(12);
    toast("Analyzing…", { icon: "⏳", durationMs: 2000 });
    const data = await postAnalyze({ sourceKind: "hum", audio });
    applyAnalyzeResult(data);
    toast(data.persisted === false ? "Analyzed (not saved — run Supabase SQL)" : "Melody analyzed", { icon: "✓" });
  } catch (e) {
    toast(e?.message || "Record/analyze failed", { icon: "!", durationMs: 5000 });
  } finally {
    state.recording = false;
    render();
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

async function generateClip() {
  if (!state.melodyId) return;
  const style = rootEl()?.querySelector("#melodyLockStyle")?.value?.trim() || "Arabic pop, warm";
  const prompt = rootEl()?.querySelector("#melodyLockLyrics")?.value?.trim() || "[Verse]\nTest\n[Chorus]\nHook";
  try {
    toast("Starting Lyria clip…", { icon: "♪", durationMs: 2500 });
    const r = await apiFetch("/api/music/generate?provider=lyria", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        adminLyriaClip: "1",
        duration: 30,
        title: "Melody Lock test",
        style,
        prompt,
        geminiProducer: "0",
        melodyLock: { melodyId: state.melodyId, preferClip: true },
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
      toast(status === "SUCCESS" ? "Clip ready — check score" : "Generation failed", {
        icon: status === "SUCCESS" ? "✓" : "!",
        durationMs: 4500,
      });
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
