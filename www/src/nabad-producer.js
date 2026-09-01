/**
 * Nabad Producer — guided full-song session UI (staging V1).
 */

import { NABAD_PRODUCER_CREDIT_COST } from "./pro-plan-config.js";

let bridge = {};
let mounted = false;
let session = null;
let messages = [];
let blueprint = null;
let chatBusy = false;
let generateBusy = false;
let activeGenerateTaskId = "";
let producerKeyboardWired = false;
let producerStageResizeWired = false;
let producerViewportBaseBottom = 0;
let producerStickToBottom = true;

const TEXT_STEPS = new Set(["lyrics", "reference"]);

const WELCOME = {
  role: "coach",
  text: "Welcome to the producer booth. We'll lock genre, mood, vocal, and lyrics — then I'll build your Lyria Pro blueprint. Tap a genre to start.",
};

/** Staging trial — admin-only until explicitly shipped. */
export function nabadProducerEnabled() {
  try {
    return Boolean(typeof bridge.isAdmin === "function" && bridge.isAdmin());
  } catch {
    return false;
  }
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

function apiFetch(path, opts = {}) {
  const headers = { ...(opts?.headers || {}) };
  const token = typeof bridge.getAuthToken === "function" ? bridge.getAuthToken() : "";
  if (token && !headers.Authorization && !headers.authorization) {
    headers.Authorization = `Bearer ${token}`;
  }
  const nextOpts = { ...opts, headers };
  if (typeof bridge.apiFetch === "function") return bridge.apiFetch(path, nextOpts);
  return fetch(path, nextOpts);
}

function showToast(msg, opts) {
  try { bridge.showToast?.(msg, opts); } catch {}
}

function inProducerRoute() {
  return String(document.body.getAttribute("data-route") || "") === "nabad-producer";
}

function getNativeKeyboardPlugin() {
  if (typeof bridge.getNativeKeyboardPlugin === "function") return bridge.getNativeKeyboardPlugin();
  return window.Capacitor?.Plugins?.Keyboard || null;
}

function setNativeKeyboardScroll(disabled) {
  if (typeof bridge.setNativeKeyboardScroll === "function") {
    bridge.setNativeKeyboardScroll(disabled);
    return;
  }
  const Keyboard = getNativeKeyboardPlugin();
  if (!Keyboard?.setScroll) return;
  try { Keyboard.setScroll({ isDisabled: Boolean(disabled) }); } catch {}
}

function measureProducerVisibleBottom() {
  const vv = window.visualViewport;
  const vvHeight = Math.max(0, Math.round(vv?.height || window.innerHeight || 0));
  const vvTop = Math.max(0, Math.round(vv?.offsetTop || 0));
  return Math.max(0, vvHeight + vvTop);
}

function rememberProducerViewportBase() {
  const current = measureProducerVisibleBottom();
  if (current > producerViewportBaseBottom) producerViewportBaseBottom = current;
}

function isProducerComposerFocused() {
  const input = document.getElementById("nabadProducerInput");
  return Boolean(input && document.activeElement === input);
}

function measureProducerKeyboardInset() {
  const vv = window.visualViewport;
  if (!vv) return 0;
  const vvHeight = Math.max(0, Math.round(vv.height || 0));
  const vvTop = Math.max(0, Math.round(vv.offsetTop || 0));
  const rawInset = Math.max(0, Math.round(window.innerHeight - vvHeight - vvTop));
  if (rawInset > 6) return rawInset;
  if (!isProducerComposerFocused()) return 0;
  const currentBottom = Math.max(0, Math.round(vvHeight + vvTop));
  const collapsedBy = Math.max(0, producerViewportBaseBottom - currentBottom);
  return collapsedBy > 40 ? collapsedBy : 0;
}

function shouldAutoScrollProducerStage() {
  const stage = document.getElementById("nabadProducerStage");
  if (!stage) return true;
  const dist = stage.scrollHeight - stage.scrollTop - stage.clientHeight;
  return dist < 120;
}

function scrollProducerStageToBottom({ force = false } = {}) {
  const stage = document.getElementById("nabadProducerStage");
  if (!stage) return;
  if (!force && !producerStickToBottom && !shouldAutoScrollProducerStage()) return;
  try {
    stage.scrollTop = stage.scrollHeight;
  } catch {}
}

function scheduleProducerScrollToBottom({ force = false } = {}) {
  if (force) producerStickToBottom = true;
  scrollProducerStageToBottom({ force });
  window.requestAnimationFrame(() => {
    updateProducerDockReserve();
    scrollProducerStageToBottom({ force });
    window.requestAnimationFrame(() => scrollProducerStageToBottom({ force }));
  });
}

function wireProducerStageScrollOnce() {
  if (producerStageResizeWired) return;
  producerStageResizeWired = true;
  const stage = document.getElementById("nabadProducerStage");
  stage?.addEventListener("scroll", () => {
    if (!inProducerRoute()) return;
    producerStickToBottom = shouldAutoScrollProducerStage();
  }, { passive: true });
  if (typeof ResizeObserver !== "function") return;
  const ro = new ResizeObserver(() => {
    if (!inProducerRoute()) return;
    const prevDock = Number.parseFloat(
      getComputedStyle(document.documentElement).getPropertyValue("--nabad-producer-dock-h") || "0",
    );
    updateProducerDockReserve();
    const nextDock = Number.parseFloat(
      getComputedStyle(document.documentElement).getPropertyValue("--nabad-producer-dock-h") || "0",
    );
    if (
      producerStickToBottom
      || Math.abs(nextDock - prevDock) > 1
      || document.body.classList.contains("nabadProducerKeyboardOpen")
    ) {
      scheduleProducerScrollToBottom({ force: producerStickToBottom });
    }
  });
  const observe = () => {
    const chat = document.getElementById("nabadProducerChat");
    const dock = document.querySelector(".nabadProducerDock");
    if (chat) ro.observe(chat);
    if (dock) ro.observe(dock);
  };
  observe();
  wireProducerStageScrollOnce._ro = ro;
  wireProducerStageScrollOnce._observe = observe;
}

function updateProducerDockReserve() {
  const dock = document.querySelector(".nabadProducerDock");
  if (!dock) return;
  const h = Math.ceil(dock.getBoundingClientRect().height);
  if (h <= 0) return;
  try {
    document.documentElement.style.setProperty("--nabad-producer-dock-h", `${h}px`);
  } catch {}
}

function clearProducerKeyboardInset() {
  document.body.classList.remove("nabadProducerKeyboardOpen");
  try {
    document.documentElement.style.setProperty("--nabad-producer-keyboard-inset", "0px");
  } catch {}
  setNativeKeyboardScroll(false);
}

function applyProducerKeyboardInset(rawInset) {
  const inset = Math.max(0, Math.round(Number(rawInset) || 0));
  const open = inset > 0;
  document.body.classList.toggle("nabadProducerKeyboardOpen", open);
  try {
    document.documentElement.style.setProperty("--nabad-producer-keyboard-inset", `${inset}px`);
  } catch {}
  updateProducerDockReserve();
  if (open) scheduleProducerScrollToBottom({ force: true });
}

function syncProducerKeyboardInset() {
  if (!inProducerRoute() || !isProducerComposerFocused()) return;
  applyProducerKeyboardInset(measureProducerKeyboardInset());
}

function wireProducerKeyboardOnce() {
  if (producerKeyboardWired) return;
  producerKeyboardWired = true;
  const Keyboard = getNativeKeyboardPlugin();
  const inProducer = () => inProducerRoute();
  if (Keyboard?.addListener) {
    Keyboard.addListener("keyboardWillShow", (info) => {
      if (!inProducer()) return;
      applyProducerKeyboardInset(info?.keyboardHeight);
    });
    Keyboard.addListener("keyboardDidShow", (info) => {
      if (!inProducer()) return;
      applyProducerKeyboardInset(info?.keyboardHeight);
    });
    Keyboard.addListener("keyboardWillHide", () => {
      if (!inProducer()) return;
      clearProducerKeyboardInset();
    });
  }
  if (window.visualViewport) {
    window.visualViewport.addEventListener("resize", syncProducerKeyboardInset);
    window.visualViewport.addEventListener("scroll", syncProducerKeyboardInset);
  }
  window.addEventListener("orientationchange", () => {
    producerViewportBaseBottom = 0;
    rememberProducerViewportBase();
  });
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
    const hint = r.status === 404
      ? " (Producer API missing — staging build must use the staging API, not nabadai.com)"
      : "";
    throw new Error(`${err}${hint}`);
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
    const hint = r.status === 404
      ? " (Producer API missing — staging build must use the staging API, not nabadai.com)"
      : "";
    throw new Error(`${err}${hint}`);
  }
  return data;
}


function composerPlaceholder(step) {
  if (step === "lyrics") return "Paste or write your lyrics…";
  if (step === "reference") return "Describe a reference track or skip…";
  return "Reply to your producer…";
}

function actionLabel(actionId) {
  const el = rootEl();
  const replies = JSON.parse(el?.dataset?.quickReplies || "[]");
  const hit = replies.find((q) => q.id === actionId);
  return hit?.label || String(actionId || "").replace(/_/g, " ");
}
function renderChoiceTrail() {
  if (!session) return "";
  const picks = [];
  if (session.genre) picks.push(session.genre);
  if (session.mood) picks.push(session.mood);
  if (session.tempo) picks.push(session.tempo);
  if (session.instrumental) picks.push("Instrumental");
  else if (session.vocalGender) picks.push(session.vocalGender === "f" ? "Female vocal" : session.vocalGender === "duo" ? "Duo vocal" : "Male vocal");
  if (session.instruments) picks.push(session.instruments);
  if (!picks.length) return "";
  return `<div class="nabadProducerTrail" aria-label="Locked choices">
    ${picks.slice(-4).map((m) => `<span class="nabadProducerTrailPill">${escapeHtml(m)}</span>`).join("")}
  </div>`;
}

function renderSessionDeck() {
  const bars = [0.35, 0.62, 0.48, 0.78, 0.41, 0.55, 0.68, 0.38];
  return `<div class="nabadProducerDeck" aria-hidden="true">
    ${bars.map((h, i) => `<span class="nabadProducerDeckBar" style="--h:${h};--d:${i * 0.12}s"></span>`).join("")}
  </div>`;
}

function renderProgress(stepIndex, stepTotal, step) {
  const pct = stepTotal ? Math.round((Math.max(0, stepIndex - 1) / stepTotal) * 100) : 0;
  const stepLabel = String(step || "start").replace(/_/g, " ");
  return `
    <div class="nabadProducerProgress" aria-hidden="true">
      ${renderSessionDeck()}
      <div class="nabadProducerProgressTrack"><span style="width:${pct}%"></span></div>
      <p class="nabadProducerProgressLabel"><span class="nabadProducerStepPill">Step ${stepIndex || 1}/${stepTotal || 8}</span> ${escapeHtml(stepLabel)}</p>
    </div>`;
}

function producerMarkSvg() {
  return `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true">
    <path d="M4 18V6"/><path d="M12 20V4"/><path d="M20 16V8"/>
    <circle cx="4" cy="18" r="2" fill="currentColor" stroke="none"/>
    <circle cx="12" cy="4" r="2" fill="currentColor" stroke="none"/>
    <circle cx="20" cy="16" r="2" fill="currentColor" stroke="none"/>
  </svg>`;
}

function renderCoachBubble(text) {
  return `<div class="nabadProducerBubble nabadProducerBubble--coach">
    <span class="nabadProducerAvatar">${producerMarkSvg()}</span>
    <div class="nabadProducerBubbleBody">${escapeHtml(text)}</div>
  </div>`;
}

function renderUserBubble(text) {
  return `<div class="nabadProducerBubble nabadProducerBubble--user"><div class="nabadProducerBubbleBody">${escapeHtml(text)}</div></div>`;
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

function renderGeneratingBanner() {
  if (!generateBusy) return "";
  return `<div class="nabadProducerGeneratingBanner" role="status">
    <span class="nabadProducerGeneratingPulse" aria-hidden="true"></span>
    <span>Lyria Pro is composing your song — usually about a minute. You can leave; it will land in Library.</span>
  </div>`;
}

function renderMessages() {
  return messages.map((m) => {
    if (m.type === "blueprint") return renderBlueprintCard(m.blueprint);
    if (m.type === "audio") return renderAudioCard(m);
    if (m.role === "user") return renderUserBubble(m.text);
    return renderCoachBubble(m.text);
  }).join("");
}

function renderThinkingBubble() {
  return `<div class="nabadProducerBubble nabadProducerBubble--coach nabadProducerBubble--thinking">
    <span class="nabadProducerAvatar">${producerMarkSvg()}</span>
    <div class="nabadProducerBubbleBody"><span class="nabadProducerThinkingDots" aria-label="Producer is thinking">•••</span></div>
  </div>`;
}

function renderQuickReplies(replies) {
  if (!Array.isArray(replies) || !replies.length) return "";
  return `<div class="nabadProducerChips" role="toolbar" aria-label="Quick replies">
    ${replies.map((q) => `<button type="button" class="nabadProducerChip" data-producer-action="${escapeHtml(q.id)}">${escapeHtml(q.label)}</button>`).join("")}
  </div>`;
}

function renderDock(step, replies) {
  if (generateBusy) return "";
  const chips = renderQuickReplies(replies);
  if (step === "blueprint") {
    return chips ? `<footer class="nabadProducerDock">${chips}</footer>` : "";
  }
  return `<footer class="nabadProducerDock">
    ${chips}
    <form class="nabadProducerComposer" id="nabadProducerComposer">
      <textarea id="nabadProducerInput" rows="${TEXT_STEPS.has(step) ? 2 : 1}" placeholder="${escapeHtml(composerPlaceholder(step))}" maxlength="4000"></textarea>
      <button type="submit" class="nabadProducerSend" id="nabadProducerSend" ${chatBusy ? "disabled" : ""} aria-label="Send">↑</button>
    </form>
  </footer>`;
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
      <header class="nabadProducerHero">
        <div class="nabadProducerAura" aria-hidden="true"></div>
        <div class="nabadProducerHeroInner">
          <div class="nabadProducerHead">
            <button type="button" class="nabadBackBtn nabadProducerBack" id="nabadProducerBack" aria-label="Back to Create">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6 9 12l6 6"/></svg>
            </button>
            <span class="nabadProducerHeadMark">${producerMarkSvg()}</span>
            <div class="nabadProducerHeadCopy">
              <span class="nabadProducerBadge">Producer session · Lyria Pro</span>
              <h1 class="nabadProducerTitle">Nabad Producer</h1>
              <p class="nabadProducerSub">${NABAD_PRODUCER_CREDIT_COST} credits · full song master</p>
            </div>
          </div>
          ${renderProgress(Number(stepIndex), Number(stepTotal), step)}
        </div>
      </header>
      <div class="nabadProducerStage" id="nabadProducerStage" role="log" aria-live="polite">
        ${renderChoiceTrail()}
        ${renderGeneratingBanner()}
        <div class="nabadProducerChat" id="nabadProducerChat">
          ${renderMessages()}${chatBusy || generateBusy ? renderThinkingBubble() : ""}
          <div class="nabadProducerScrollAnchor" id="nabadProducerScrollAnchor" aria-hidden="true"></div>
        </div>
      </div>
      ${renderDock(step, replies)}
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

  const input = el.querySelector("#nabadProducerInput");
  input?.addEventListener("focus", () => {
    rememberProducerViewportBase();
    window.requestAnimationFrame(() => {
      syncProducerKeyboardInset();
      scheduleProducerScrollToBottom({ force: true });
    });
  });
  input?.addEventListener("blur", () => {
    window.setTimeout(() => {
      if (!isProducerComposerFocused()) clearProducerKeyboardInset();
    }, 80);
  });

  el.querySelectorAll("[data-producer-action]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = String(btn.getAttribute("data-producer-action") || "").trim();
      if (!id) return;
      void handleAction(id);
    });
  });

  wireProducerStageScrollOnce();
  wireProducerStageScrollOnce._observe?.();
  updateProducerDockReserve();
  scheduleProducerScrollToBottom({ force: producerStickToBottom || chatBusy || generateBusy });
}

function updateUiState({ step, stepIndex, stepTotal, quickReplies }) {
  const el = rootEl();
  if (!el) return;
  if (step) el.dataset.step = step;
  if (stepIndex != null) el.dataset.stepIndex = String(stepIndex);
  if (stepTotal != null) el.dataset.stepTotal = String(stepTotal);
  if (quickReplies != null) el.dataset.quickReplies = JSON.stringify(quickReplies);
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
    quickReplies: Array.isArray(data.quickReplies) ? data.quickReplies : [],
  });
}

async function handleUserText(text) {
  if (chatBusy || generateBusy) return;
  producerStickToBottom = true;
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

  const label = actionLabel(actionId);
  if (!actionId.startsWith("blueprint_")) pushUser(label);

  producerStickToBottom = true;
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

export function handleProducerGenerationReady({ url, title, taskId } = {}) {
  const tid = String(taskId || activeGenerateTaskId || "").trim();
  if (tid && activeGenerateTaskId && tid !== activeGenerateTaskId) return;
  generateBusy = false;
  activeGenerateTaskId = "";
  if (!mounted) return;
  const playbackUrl = String(url || "").trim();
  const songTitle = String(title || session?.title || session?.genre || "Nabad Producer").trim();
  const already = messages.some((m) => m.type === "audio" && String(m.taskId || "") === tid);
  if (!already && playbackUrl) {
    messages.push({ type: "audio", title: songTitle, url: playbackUrl, taskId: tid });
  }
  pushCoach("Your song is ready — play it below. It's saved to your Library.");
  updateUiState({ quickReplies: [] });
}

export function handleProducerGenerationFailed({ taskId, message } = {}) {
  const tid = String(taskId || activeGenerateTaskId || "").trim();
  if (tid && activeGenerateTaskId && tid !== activeGenerateTaskId) return;
  generateBusy = false;
  activeGenerateTaskId = "";
  if (!mounted) return;
  pushCoach(
    message || "Generation failed — credits were refunded if applicable. Try again from the blueprint.",
  );
  updateUiState({
    quickReplies: [
      { id: "blueprint_retry", label: "Retry blueprint" },
      { id: "blueprint_confirm", label: "Try generate again" },
    ],
  });
  renderShell();
}

async function startGenerate() {
  if (generateBusy) return;
  generateBusy = true;
  pushUser(`Generate song · ${NABAD_PRODUCER_CREDIT_COST} credits`);
  pushCoach("Starting Lyria Pro — your song will appear in Library when it's ready. You can leave this session anytime.");
  updateUiState({ quickReplies: [] });
  renderShell();
  try {
    const data = await producerGenerate();
    const taskId = String(data?.data?.taskId || "").trim();
    if (!taskId) throw new Error("No task id returned");
    activeGenerateTaskId = taskId;
    const songTitle = String(session?.title || session?.genre || "Nabad Producer").trim();
    if (typeof bridge.startProducerGenerationPolling === "function") {
      bridge.startProducerGenerationPolling({ taskId, title: songTitle, session: { ...session } });
    } else {
      throw new Error("Generation handoff unavailable — update the app and try again.");
    }
    try { bridge.openProfileSongsWhileGenerating?.(); } catch {}
  } catch (e) {
    generateBusy = false;
    activeGenerateTaskId = "";
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
  wireProducerKeyboardOnce();
  producerStickToBottom = true;
  rememberProducerViewportBase();
  if (mounted && rootEl()?.innerHTML) return;
  mounted = true;
  session = emptySession();
  messages = [WELCOME];
  blueprint = null;
  chatBusy = false;
  generateBusy = false;
  activeGenerateTaskId = "";
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
  chatBusy = false;
  generateBusy = false;
  clearProducerKeyboardInset();
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
  const go = () => {
    try { bridge.showProducerRoute?.(); } catch {}
    try { enterNabadProducerRoot(); } catch {}
    try { location.hash = "#/nabad-producer"; } catch {}
    bridge.scheduleApplyRoute?.();
  };
  if (nabadProducerEnabled()) {
    go();
    return;
  }
  if (typeof bridge.creditsLoaded === "function" && !bridge.creditsLoaded()) {
    void Promise.resolve(bridge.refreshCredits?.({ silent: true })).then(() => {
      if (nabadProducerEnabled()) go();
      else showToast("Nabad Producer is admin-only right now.", { icon: "!", durationMs: 3200 });
    });
    return;
  }
  showToast("Nabad Producer is admin-only right now.", { icon: "!", durationMs: 3200 });
}

export function syncNabadProducerHomeCard() {
  const show = nabadProducerEnabled();
  document.querySelectorAll('[data-home-card="producer"]').forEach((el) => {
    el.hidden = !show;
    el.setAttribute("aria-hidden", show ? "false" : "true");
  });
}
