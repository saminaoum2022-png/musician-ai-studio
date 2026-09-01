/**
 * Nabad Producer — guided full-song session UI (staging V1).
 */

import { NABAD_PRODUCER_CREDIT_COST } from "./pro-plan-config.js";

let bridge = {};
let mounted = false;
let session = null;
let messages = [];
let blueprint = null;
let pollTimer = null;
let chatBusy = false;
let generateBusy = false;

const WELCOME = {
  role: "coach",
  text: "I'm your Nabad Producer — we'll shape a full song step by step, then generate a Lyria Pro master. Pick a genre to start.",
};

export function nabadProducerEnabled() {
  return true;
}

export function configureNabadProducer(b) {
  bridge = b || {};
}

function emptySession() {
  return {
    genre: "",
    mood: "",
    tempo: "",
    bpm: null,
    vocalGender: "",
    clipVocalProfileId: "",
    instruments: "",
    lyrics: "",
    referenceText: "",
    referenceNote: "",
    title: "",
    instrumental: false,
    referenceSkipped: false,
    vocalCharacterDone: false,
  };
}

function rootEl() {
  return document.getElementById("nabadProducerRoot");
}

function escapeHtml(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function apiFetch(path, opts) {
  if (typeof bridge.apiFetch === "function") return bridge.apiFetch(path, opts);
  return fetch(path, opts);
}

function showToast(msg, opts) {
  try { bridge.showToast?.(msg, opts); } catch {}
}

async function producerChat({ message = "", actionId = "" } = {}) {
  const r = await apiFetch("/api/music/producer/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ session, message, actionId }),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    const err = data?.error || data?.code || `HTTP ${r.status}`;
    throw new Error(err);
  }
  return data;
}

async function producerGenerate() {
  const r = await apiFetch("/api/music/producer/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ session, blueprint }),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    const err = data?.error || data?.code || `HTTP ${r.status}`;
    throw new Error(err);
  }
  return data;
}

function musicStatusPath(taskId) {
  if (typeof bridge.musicStatusApiPath === "function") {
    return bridge.musicStatusApiPath(taskId);
  }
  return `/api/music/status?taskId=${encodeURIComponent(taskId)}`;
}

function renderProgress(stepIndex, stepTotal, step) {
  const pct = stepTotal ? Math.round((Math.max(0, stepIndex - 1) / stepTotal) * 100) : 0;
  return `
    <div class="nabadProducerProgress" aria-hidden="true">
      <div class="nabadProducerProgressTrack"><span style="width:${pct}%"></span></div>
      <p class="nabadProducerProgressLabel">Step ${stepIndex || 1} of ${stepTotal || 8}${step ? ` · ${escapeHtml(step)}` : ""}</p>
    </div>`;
}

function renderBlueprintCard(bp) {
  if (!bp) return "";
  return `
    <article class="nabadProducerBlueprint">
      <header class="nabadProducerBlueprintHead">
        <span class="nabadProducerBlueprintKicker">Production blueprint</span>
        <strong>Review before generating</strong>
      </header>
      ${bp.structured_lyrics ? `<section class="nabadProducerBlueprintBlock"><h4>Structured lyrics</h4><pre>${escapeHtml(bp.structured_lyrics)}</pre></section>` : ""}
      <section class="nabadProducerBlueprintBlock"><h4>Master style prompt</h4><pre>${escapeHtml(bp.master_style_prompt || "")}</pre></section>
    </article>`;
}

function renderAudioCard({ title, url }) {
  if (!url) return "";
  return `
    <article class="nabadProducerAudioCard">
      <header><strong>${escapeHtml(title || "Your song")}</strong></header>
      <audio controls playsinline preload="metadata" src="${escapeHtml(url)}" class="nabadProducerAudio"></audio>
    </article>`;
}

function renderMessages() {
  return messages.map((m) => {
    if (m.type === "blueprint") return renderBlueprintCard(m.blueprint);
    if (m.type === "audio") return renderAudioCard(m);
    const cls = m.role === "user" ? "nabadProducerBubble nabadProducerBubble--user" : "nabadProducerBubble nabadProducerBubble--coach";
    return `<div class="${cls}">${escapeHtml(m.text)}</div>`;
  }).join("");
}

function renderQuickReplies(replies) {
  if (!Array.isArray(replies) || !replies.length) return "";
  return `<div class="nabadProducerChips" role="toolbar" aria-label="Quick replies">
    ${replies.map((q) => `<button type="button" class="nabadProducerChip" data-producer-action="${escapeHtml(q.id)}">${escapeHtml(q.label)}</button>`).join("")}
  </div>`;
}

function renderShell() {
  const el = rootEl();
  if (!el) return;
  const stepIndex = el.dataset.stepIndex || "1";
  const stepTotal = el.dataset.stepTotal || "8";
  const step = el.dataset.step || "genre";
  const replies = JSON.parse(el.dataset.quickReplies || "[]");

  el.innerHTML = `
    <div class="nabadProducerShell">
      <header class="nabadProducerHead">
        <button type="button" class="nabadProducerBack btnGhost" id="nabadProducerBack" aria-label="Back">←</button>
        <div class="nabadProducerHeadCopy">
          <p class="nabadProducerKicker">Pro · ${NABAD_PRODUCER_CREDIT_COST} credits</p>
          <h1 class="nabadProducerTitle">Nabad Producer</h1>
        </div>
      </header>
      ${renderProgress(Number(stepIndex), Number(stepTotal), step)}
      <div class="nabadProducerChat" id="nabadProducerChat" role="log" aria-live="polite">
        ${renderMessages()}
      </div>
      <div class="nabadProducerComposerWrap">
        ${renderQuickReplies(replies)}
        <form class="nabadProducerComposer" id="nabadProducerComposer">
          <textarea id="nabadProducerInput" rows="1" placeholder="Type lyrics, reference, or a reply…" maxlength="4000"></textarea>
          <button type="submit" class="nabadProducerSend" id="nabadProducerSend" ${chatBusy || generateBusy ? "disabled" : ""}>Send</button>
        </form>
      </div>
    </div>`;

  el.querySelector("#nabadProducerBack")?.addEventListener("click", () => {
    try { location.hash = "#/challenges"; } catch {}
    bridge.scheduleApplyRoute?.();
  });

  el.querySelector("#nabadProducerComposer")?.addEventListener("submit", (e) => {
    e.preventDefault();
    const input = el.querySelector("#nabadProducerInput");
    const text = String(input?.value || "").trim();
    if (!text) return;
    void handleUserText(text);
    if (input) input.value = "";
  });

  el.querySelectorAll("[data-producer-action]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = String(btn.getAttribute("data-producer-action") || "").trim();
      if (!id) return;
      void handleAction(id);
    });
  });

  const chat = el.querySelector("#nabadProducerChat");
  if (chat) chat.scrollTop = chat.scrollHeight;
}

function updateUiState({ step, stepIndex, stepTotal, quickReplies }) {
  const el = rootEl();
  if (!el) return;
  if (step) el.dataset.step = step;
  if (stepIndex != null) el.dataset.stepIndex = String(stepIndex);
  if (stepTotal != null) el.dataset.stepTotal = String(stepTotal);
  if (quickReplies) el.dataset.quickReplies = JSON.stringify(quickReplies);
  renderShell();
}

function pushCoach(text) {
  messages.push({ role: "coach", text: String(text || "").trim() });
}

function pushUser(text) {
  messages.push({ role: "user", text: String(text || "").trim() });
}

async function applyChatResult(data) {
  session = data.session || session;
  if (data.reply) pushCoach(data.reply);
  if (data.referenceNote && session?.referenceText) {
    pushCoach(session.referenceNote);
  }
  if (data.blueprint) {
    blueprint = data.blueprint;
    messages.push({ type: "blueprint", blueprint: data.blueprint });
  }
  updateUiState({
    step: data.step,
    stepIndex: data.stepIndex,
    stepTotal: data.stepTotal,
    quickReplies: data.quickReplies || [],
  });
}

async function handleUserText(text) {
  if (chatBusy || generateBusy) return;
  pushUser(text);
  chatBusy = true;
  renderShell();
  try {
    const data = await producerChat({ message: text });
    await applyChatResult(data);
  } catch (e) {
    pushCoach(`Something went wrong: ${e?.message || e}. Try again.`);
    renderShell();
  } finally {
    chatBusy = false;
    renderShell();
  }
}

async function handleAction(actionId) {
  if (generateBusy) return;
  if (actionId === "blueprint_confirm") {
    await startGenerate();
    return;
  }
  if (chatBusy) return;

  const label = actionId.replace(/_/g, " ");
  if (!actionId.startsWith("blueprint_")) pushUser(label);

  chatBusy = true;
  renderShell();
  try {
    const data = await producerChat({ actionId });
    await applyChatResult(data);
  } catch (e) {
    pushCoach(`Something went wrong: ${e?.message || e}. Try again.`);
    renderShell();
  } finally {
    chatBusy = false;
    renderShell();
  }
}

function stopPoll() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

async function pollTask(taskId) {
  const path = musicStatusPath(taskId);
  const r = await apiFetch(path);
  const data = await r.json().catch(() => ({}));
  const status = String(data?.data?.status || data?.status || "").toUpperCase();
  const clips = data?.data?.response?.sunoData || data?.data?.response?.suno_data || [];
  const clip = Array.isArray(clips) ? clips[0] : null;
  const url = clip?.audioUrl || clip?.audio_url || "";
  if (status === "SUCCESS" && url) {
    stopPoll();
    generateBusy = false;
    messages.push({
      type: "audio",
      title: session?.title || session?.genre || "Nabad Producer",
      url: typeof bridge.normalizeAudioUrlForPlayback === "function"
        ? bridge.normalizeAudioUrlForPlayback(url)
        : url,
    });
    pushCoach("Your song is ready — play it below. You can find it in your library too.");
    updateUiState({ quickReplies: [] });
    showToast("Song ready", { icon: "🎵", durationMs: 2600 });
    return;
  }
  if (status === "FAILED" || status === "ERROR") {
    stopPoll();
    generateBusy = false;
    pushCoach("Generation failed — credits were refunded if applicable. Try again from the blueprint.");
    updateUiState({
      quickReplies: [
        { id: "blueprint_retry", label: "Retry blueprint" },
        { id: "blueprint_confirm", label: "Try generate again" },
      ],
    });
  }
}

async function startGenerate() {
  if (generateBusy) return;
  generateBusy = true;
  pushUser(`Generate song · ${NABAD_PRODUCER_CREDIT_COST} credits`);
  pushCoach("Generating your full song with Lyria Pro — this usually takes about a minute…");
  updateUiState({ quickReplies: [] });
  renderShell();
  try {
    const data = await producerGenerate();
    const taskId = data?.data?.taskId || "";
    if (!taskId) throw new Error("No task id returned");
    stopPoll();
    pollTimer = setInterval(() => { void pollTask(taskId); }, 3500);
    void pollTask(taskId);
  } catch (e) {
    generateBusy = false;
    pushCoach(`Could not start generation: ${e?.message || e}`);
    updateUiState({
      quickReplies: [
        { id: "blueprint_confirm", label: `Generate · ${NABAD_PRODUCER_CREDIT_COST} credits` },
      ],
    });
    renderShell();
  }
}

export function enterNabadProducerRoot() {
  if (mounted && rootEl()?.innerHTML) return;
  mounted = true;
  session = emptySession();
  messages = [WELCOME];
  blueprint = null;
  chatBusy = false;
  generateBusy = false;
  stopPoll();
  updateUiState({
    step: "genre",
    stepIndex: 1,
    stepTotal: 8,
    quickReplies: [
      { id: "genre_dabke", label: "Levantine Dabke" },
      { id: "genre_pop", label: "Arabic Pop" },
      { id: "genre_ballad", label: "Ballad / Slow" },
      { id: "genre_rap", label: "Arabic Rap / Trap" },
      { id: "genre_khaliji", label: "Khaliji" },
      { id: "genre_cinematic", label: "Cinematic" },
    ],
  });
}

export function leaveNabadProducerRoot() {
  mounted = false;
  stopPoll();
  chatBusy = false;
  generateBusy = false;
  const el = rootEl();
  if (el) el.innerHTML = "";
}

export function openNabadProducerFlow() {
  if (!bridge.authSession?.()?.user?.id) {
    bridge.setPostAuthReturnHash?.("#/nabad-producer");
    try { location.hash = "#/auth"; } catch {}
    bridge.scheduleApplyRoute?.();
    return;
  }
  void openNabadProducerFlowAsync();
}

async function openNabadProducerFlowAsync() {
  try {
    await bridge.refreshMyCredits?.({ silent: true });
  } catch {}
  if (typeof bridge.proFeatureAllowed === "function" ? !bridge.proFeatureAllowed() : !bridge.requireProFeature?.("Nabad Producer")) {
    if (typeof bridge.requireProFeature === "function") bridge.requireProFeature("Nabad Producer");
    return;
  }
  try { location.hash = "#/nabad-producer"; } catch {}
  bridge.scheduleApplyRoute?.();
}

export function syncNabadProducerHomeCard() {
  const show = nabadProducerEnabled();
  document.querySelectorAll('[data-home-card="producer"]').forEach((el) => {
    el.hidden = !show;
    el.setAttribute("aria-hidden", show ? "false" : "true");
  });
}
