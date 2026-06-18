/** Guided creation flows for templates & challenges — not the full Create studio. */

export const FLOW_DURATION_TIERS = {
  teaser: { maxSec: 45, label: "under 45 seconds", sections: "hook + one short chorus only" },
  short: { maxSec: 75, label: "under 75 seconds", sections: "short verse + chorus, no long bridge" },
  clip: { maxSec: 120, label: "under 2 minutes", sections: "compact song form, no extended outro" },
};

const FLOW_TYPE_BY_ID = {
  "voice-note-flip": "hum",
  "three-word-hook": "prompt",
  "hook-rush": "prompt",
  "tiktok-teaser": "prompt",
  "dabke-drop": "prompt",
  "sad-to-dance-challenge": "prompt",
  "arabic-trend-byte": "prompt",
  "roast-song": "prompt",
  "wrong-genre-party": "prompt",
  "last-photo-song": "photo",
};

const FLOW_DURATION_BY_ID = {
  "tiktok-teaser": "teaser",
  "hook-rush": "teaser",
  "three-word-hook": "teaser",
  "arabic-trend-byte": "teaser",
  "voice-note-flip": "short",
  "last-photo-song": "short",
};

const DIALECT_OPTIONS = [
  { value: "", label: "Auto" },
  { value: "Levantine Arabic", label: "Levantine" },
  { value: "Egyptian Arabic", label: "Egyptian" },
  { value: "Gulf Arabic", label: "Gulf" },
  { value: "Iraqi Arabic", label: "Iraqi" },
  { value: "Maghrebi Arabic", label: "Maghrebi" },
  { value: "Modern Standard Arabic", label: "MSA" },
];

let _deps = null;
let _activeFlowId = "";
let _flowState = null;
let _bound = false;

function escapeHtml(s) {
  return _deps?.escapeHtml?.(s) ?? String(s ?? "");
}

function haptic(kind) {
  try { _deps?.haptic?.(kind); } catch {}
}

function showToast(msg, opts) {
  try { _deps?.showToast?.(msg, opts); } catch {}
}

export function flowDurationTierForId(flowId) {
  return FLOW_DURATION_BY_ID[String(flowId || "")] || "clip";
}

export function flowTypeForId(flowId) {
  return FLOW_TYPE_BY_ID[String(flowId || "")] || "prompt";
}

export function flowDurationStyleClause(tierKey) {
  const tier = FLOW_DURATION_TIERS[tierKey] || FLOW_DURATION_TIERS.clip;
  return [
    `Short clip ${tier.label}`,
    tier.sections,
    "No full-length song",
    "No 4-minute arrangement",
    "End quickly after the hook lands",
  ].join(", ");
}

export function resolveFlowDefinition(flowId, challengeIdeas = []) {
  const id = String(flowId || "").trim();
  if (!id) return null;
  const challenge = (Array.isArray(challengeIdeas) ? challengeIdeas : []).find((row) => String(row.id) === id);
  if (!challenge && id !== "last-photo-song") return null;
  const base = challenge || {
    id: "last-photo-song",
    title: "Last Photo Song",
    style: "Photo-inspired pop, emotional snapshot, warm textures, intimate vocal, 98 bpm",
    prompt: "Turn the feeling of your latest photo into a short personal hook.",
    lyrics: "[Verse]\nThis moment in a frame\nA little light, a little name\n\n[Chorus]\nHold it close, let it sing\nOne small photo, everything",
    tags: ["Photo", "Personal", "Mood"],
  };
  const type = flowTypeForId(id);
  const durationTier = flowDurationTierForId(id);
  const starterLyrics = String(base.lyrics || base.prompt || "").trim();
  const starterPrompt = String(base.prompt || starterLyrics).trim();
  return {
    ...base,
    flowType: type,
    durationTier,
    durationClause: flowDurationStyleClause(durationTier),
    starterLyrics,
    starterPrompt,
    blurb: type === "hum"
      ? "Hum or say a tiny hook — we'll turn it into a short clip."
      : type === "photo"
        ? "Pick any photo (we suggest your latest). We'll read the mood and shape a short clip."
        : String(base.prompt || "Make this starter yours, then generate a short clip."),
  };
}

function defaultFlowState(def) {
  return {
    step: def.flowType === "prompt" ? "customize" : "capture",
    lyrics: "",
    usedStarter: true,
    personName: "",
    singerGender: "",
    arabicAddress: "",
    dialect: "",
    dialectHint: "",
    vocalReady: false,
    photoPreviewUrl: "",
    photoAnalyzed: false,
    imageMood: null,
    resultTrackId: "",
    resultTitle: "",
    resultUrl: "",
    generating: false,
  };
}

function flowChipRow(name, options, activeValue, dataAttr) {
  return `
    <div class="flowChipRow" role="group" aria-label="${escapeHtml(name)}">
      ${options.map((opt) => {
        const on = String(activeValue || "") === String(opt.value || "");
        return `<button type="button" class="flowChip${on ? " isActive" : ""}" data-${dataAttr}="${escapeHtml(opt.value)}" aria-pressed="${on ? "true" : "false"}">${escapeHtml(opt.label)}</button>`;
      }).join("")}
    </div>`;
}

function renderFlowMount(def, state) {
  const mount = document.getElementById("creationFlowMount");
  if (!mount || !def) return;

  if (state.step === "done") {
    mount.innerHTML = `
      <div class="flowDoneCard">
        <p class="flowDoneKicker">Your clip is ready</p>
        <h3 class="flowDoneTitle">${escapeHtml(state.resultTitle || def.title)}</h3>
        <p class="flowDoneSub">Tagged for the ${escapeHtml(def.title)} challenge. Share it or open the full studio to keep editing.</p>
        <div class="flowDoneActions">
          <button type="button" class="primary flowDonePlay" id="flowBtnListen"${state.resultTrackId ? "" : " disabled"}>Listen</button>
          <button type="button" class="ghost" id="flowBtnStudio">Open in studio</button>
          <button type="button" class="ghost" id="flowBtnDiscover">Back to Discover</button>
        </div>
      </div>`;
    return;
  }

  const captureBlock = state.step === "capture" ? renderCaptureStep(def, state) : "";
  const customizeBlock = state.step === "customize" ? renderCustomizeStep(def, state) : "";

  mount.innerHTML = `
    <div class="flowHero">
      <p class="flowKicker">Guided challenge</p>
      <h2 class="flowTitle">${escapeHtml(def.title)}</h2>
      <p class="flowLead">${escapeHtml(def.blurb)}</p>
      <p class="flowDurationBadge">${escapeHtml(FLOW_DURATION_TIERS[def.durationTier]?.label || "Short clip")} · not a full song</p>
    </div>
    ${captureBlock}
    ${customizeBlock}
  `;
}

function renderCaptureStep(def, state) {
  if (def.flowType === "hum") {
    return `
      <section class="flowStepCard">
        <h3 class="flowStepTitle">Step 1 · Your voice hook</h3>
        <p class="flowStepLead">Hum, whistle, or say one line. Keep it under 15 seconds.</p>
        <button type="button" class="primary flowRecordBtn" id="flowBtnRecord">${state.vocalReady ? "Re-record hook" : "Record hook"}</button>
        <p class="flowStepStatus" id="flowCaptureStatus">${state.vocalReady ? "Hook captured — continue to make it yours." : "Tap record when you're ready."}</p>
        <button type="button" class="primary flowNextBtn" id="flowBtnContinue" ${state.vocalReady ? "" : "disabled"}>Continue</button>
      </section>`;
  }
  if (def.flowType === "photo") {
    return `
      <section class="flowStepCard">
        <h3 class="flowStepTitle">Step 1 · Your photo</h3>
        <p class="flowStepLead">We suggest your latest photo — swap it anytime.</p>
        <div class="flowPhotoPreviewWrap${state.photoPreviewUrl ? " hasPhoto" : ""}">
          ${state.photoPreviewUrl ? `<img class="flowPhotoPreview" src="${escapeHtml(state.photoPreviewUrl)}" alt="Selected photo" />` : `<div class="flowPhotoEmpty">No photo yet</div>`}
        </div>
        <div class="flowPhotoActions">
          <label class="ghost flowPhotoPick">
            <span>${state.photoPreviewUrl ? "Choose different photo" : "Choose photo"}</span>
            <input type="file" id="flowPhotoInput" accept="image/*" hidden />
          </label>
          <button type="button" class="primary" id="flowBtnAnalyzePhoto" ${state.photoPreviewUrl ? "" : "disabled"}>${state.photoAnalyzed ? "Re-analyze mood" : "Read photo mood"}</button>
        </div>
        <div class="flowMoodReadout" id="flowMoodReadout">${state.imageMood ? renderMoodSummary(state.imageMood) : "<p class=\"flowMoodEmpty\">Analyze your photo to continue.</p>"}</div>
        <button type="button" class="primary flowNextBtn" id="flowBtnContinue" ${state.photoAnalyzed ? "" : "disabled"}>Continue</button>
      </section>`;
  }
  return "";
}

function renderMoodSummary(mood) {
  if (!mood || typeof mood !== "object") return "";
  const tags = Array.isArray(mood.tags) ? mood.tags.filter(Boolean).slice(0, 5) : [];
  const concept = String(mood.concept || mood.lyricSeed || "").trim();
  return `
    <p class="flowMoodConcept">${escapeHtml(concept || "Mood ready.")}</p>
    ${tags.length ? `<div class="flowMoodTags">${tags.map((t) => `<span>${escapeHtml(t)}</span>`).join("")}</div>` : ""}`;
}

function renderCustomizeStep(def, state) {
  const singerOpts = [
    { value: "", label: "Auto voice" },
    { value: "m", label: "Male" },
    { value: "f", label: "Female" },
  ];
  const addressOpts = [
    { value: "", label: "Auto" },
    { value: "male", label: "To a man" },
    { value: "female", label: "To a woman" },
    { value: "group", label: "To a group" },
  ];
  return `
    <section class="flowStepCard">
      <h3 class="flowStepTitle">${def.flowType === "prompt" ? "Make it yours" : "Step 2 · Make it yours"}</h3>
      <p class="flowStepLead">This is a starter suggestion — edit it so your clip feels personal.</p>
      <div class="flowStarterCard">
        <span class="flowStarterBadge">Starter suggestion · not final lyrics</span>
        <textarea id="flowLyricsInput" class="flowLyricsInput" rows="6" maxlength="1200" placeholder="Write or edit your hook…"></textarea>
      </div>
      <label class="flowField">
        <span class="flowFieldLabel">Dedicated to <small>(optional)</small></span>
        <input id="flowPersonName" type="text" maxlength="36" autocomplete="off" placeholder="Their name…" value="${escapeHtml(state.personName)}" />
      </label>
      <div class="flowField">
        <span class="flowFieldLabel">Singer voice</span>
        ${flowChipRow("Singer voice", singerOpts, state.singerGender, "flow-singer")}
      </div>
      <div class="flowField">
        <span class="flowFieldLabel">Lyrics talk to</span>
        ${flowChipRow("Arabic address", addressOpts, state.arabicAddress, "flow-address")}
      </div>
      <div class="flowField">
        <span class="flowFieldLabel">Dialect</span>
        ${flowChipRow("Dialect", DIALECT_OPTIONS, state.dialect, "flow-dialect")}
      </div>
      <button type="button" class="primary flowGenerateBtn" id="flowBtnGenerate">Generate short clip · 12 credits</button>
      <button type="button" class="ghost flowBackBtn" id="flowBtnBackCustomize"${def.flowType === "prompt" ? ' hidden' : ""}>Back</button>
    </section>`;
}

function bindFlowMountEvents(def, state) {
  const mount = document.getElementById("creationFlowMount");
  if (!mount) return;

  const lyricsEl = mount.querySelector("#flowLyricsInput");
  if (lyricsEl) {
    const seed = state.lyrics || (state.usedStarter ? def.starterLyrics : "");
    lyricsEl.value = seed;
  }

  mount.querySelector("#flowBtnRecord")?.addEventListener("click", () => {
    haptic("light");
    void openFlowRecorder(def, state);
  });

  mount.querySelector("#flowBtnContinue")?.addEventListener("click", () => {
    haptic("light");
    state.step = "customize";
    if (!state.lyrics && state.usedStarter) state.lyrics = def.starterLyrics;
    renderFlowMount(def, state);
    bindFlowMountEvents(def, state);
  });

  mount.querySelector("#flowBtnBackCustomize")?.addEventListener("click", () => {
    haptic("light");
    state.step = "capture";
    renderFlowMount(def, state);
    bindFlowMountEvents(def, state);
  });

  mount.querySelector("#flowPhotoInput")?.addEventListener("change", (ev) => {
    const file = ev.target?.files?.[0];
    if (!file) return;
    void handleFlowPhotoSelected(file, def, state);
  });

  mount.querySelector("#flowBtnAnalyzePhoto")?.addEventListener("click", () => {
    haptic("light");
    void analyzeFlowPhoto(def, state);
  });

  mount.querySelectorAll("[data-flow-singer]").forEach((btn) => {
    btn.addEventListener("click", () => {
      readCustomizeFields(state);
      state.singerGender = String(btn.getAttribute("data-flow-singer") || "");
      renderFlowMount(def, state);
      bindFlowMountEvents(def, state);
    });
  });
  mount.querySelectorAll("[data-flow-address]").forEach((btn) => {
    btn.addEventListener("click", () => {
      readCustomizeFields(state);
      state.arabicAddress = String(btn.getAttribute("data-flow-address") || "");
      renderFlowMount(def, state);
      bindFlowMountEvents(def, state);
    });
  });
  mount.querySelectorAll("[data-flow-dialect]").forEach((btn) => {
    btn.addEventListener("click", () => {
      readCustomizeFields(state);
      state.dialect = String(btn.getAttribute("data-flow-dialect") || "");
      renderFlowMount(def, state);
      bindFlowMountEvents(def, state);
    });
  });

  mount.querySelector("#flowBtnGenerate")?.addEventListener("click", () => {
    haptic("impact");
    void submitFlowGeneration(def, state);
  });

  mount.querySelector("#flowBtnListen")?.addEventListener("click", () => {
    haptic("light");
    if (state.resultTrackId) _deps?.openTrack?.(state.resultTrackId);
    else if (state.resultUrl) _deps?.playUrl?.(state.resultUrl, state.resultTitle);
  });
  mount.querySelector("#flowBtnStudio")?.addEventListener("click", () => {
    haptic("light");
    _deps?.openInStudio?.(_activeFlowId, state);
  });
  mount.querySelector("#flowBtnDiscover")?.addEventListener("click", () => {
    haptic("light");
    try { location.hash = "#/discover"; } catch {}
  });
}

async function openFlowRecorder(def, state) {
  try {
    await _deps?.openFlowVoiceRecorder?.({
      title: "Hum your hook",
      onReady: () => {
        state.vocalReady = true;
        const status = document.getElementById("flowCaptureStatus");
        if (status) status.textContent = "Hook captured — continue to make it yours.";
        const cont = document.getElementById("flowBtnContinue");
        if (cont) cont.disabled = false;
        const rec = document.getElementById("flowBtnRecord");
        if (rec) rec.textContent = "Re-record hook";
      },
    });
  } catch (e) {
    showToast(e?.message || "Could not open recorder", { icon: "!", durationMs: 3200 });
  }
}

async function handleFlowPhotoSelected(file, def, state) {
  try {
    if (state.photoPreviewUrl) URL.revokeObjectURL(state.photoPreviewUrl);
  } catch {}
  state.photoFile = file;
  state.photoAnalyzed = false;
  state.imageMood = null;
  state.photoPreviewUrl = URL.createObjectURL(file);
  renderFlowMount(def, state);
  bindFlowMountEvents(def, state);
}

async function analyzeFlowPhoto(def, state) {
  const file = state.photoFile;
  if (!file) return;
  const btn = document.getElementById("flowBtnAnalyzePhoto");
  if (btn) btn.disabled = true;
  try {
    let dataUrl = await _deps.fileToDataUrl(file);
    dataUrl = await _deps.downscaleImageDataUrl(dataUrl, 1600, 0.82);
    if (dataUrl.length > 1_800_000) dataUrl = await _deps.downscaleImageDataUrl(dataUrl, 1280, 0.72);
    const r = await fetch(_deps.apiUrl("/api/image-mood"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image: dataUrl }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d?.error || "Image analysis failed");
    state.imageMood = d || null;
    state.photoAnalyzed = true;
    if (!state.lyrics && d?.lyricSeed) state.lyrics = String(d.lyricSeed).trim();
    renderFlowMount(def, state);
    bindFlowMountEvents(def, state);
  } catch (e) {
    showToast(e?.message || "Photo analysis failed", { icon: "!", durationMs: 3600 });
    if (btn) btn.disabled = false;
  }
}

function readCustomizeFields(state) {
  state.lyrics = String(document.getElementById("flowLyricsInput")?.value || "").trim();
  state.personName = String(document.getElementById("flowPersonName")?.value || "").trim();
  state.usedStarter = false;
}

async function submitFlowGeneration(def, state) {
  if (state.generating) return;
  readCustomizeFields(state);
  if (!state.lyrics && def.flowType !== "hum") {
    showToast("Add or edit your hook before generating.", { icon: "✍", durationMs: 2600 });
    return;
  }
  if (def.flowType === "hum" && !state.vocalReady && !_deps?.hasVocalReference?.()) {
    showToast("Record your hook first.", { icon: "🎙", durationMs: 2600 });
    return;
  }
  if (!_deps?.isSignedIn?.()) {
    _deps?.stashFlowPending?.(_activeFlowId);
    showToast("Sign in to generate from this challenge", { icon: "♪", durationMs: 2600 });
    try { location.hash = "#/auth"; } catch {}
    return;
  }
  state.generating = true;
  const btn = document.getElementById("flowBtnGenerate");
  if (btn) {
    btn.disabled = true;
    btn.textContent = "Generating…";
  }
  try {
    await _deps.prepareAndGenerateFromFlow({
      def,
      state,
      onSuccess: (result) => {
        state.generating = false;
        state.step = "done";
        state.resultTrackId = String(result?.trackId || "").trim();
        state.resultTitle = String(result?.title || def.title).trim();
        state.resultUrl = String(result?.url || "").trim();
        renderFlowMount(def, state);
        bindFlowMountEvents(def, state);
        showToast("Your clip is ready — tap Listen", { icon: "♪", durationMs: 3200 });
      },
      onFailure: (msg) => {
        state.generating = false;
        if (btn) {
          btn.disabled = false;
          btn.textContent = "Generate short clip · 12 credits";
        }
        showToast(msg || "Generation failed", { icon: "!", durationMs: 4200 });
      },
    });
  } catch (e) {
    state.generating = false;
    if (btn) {
      btn.disabled = false;
      btn.textContent = "Generate short clip · 12 credits";
    }
    showToast(e?.message || "Generation failed", { icon: "!", durationMs: 4200 });
  }
}

export function renderCreationFlow(flowId) {
  const def = resolveFlowDefinition(flowId, _deps?.challengeIdeas);
  const page = document.getElementById("creationFlowPage");
  if (!page) return;
  if (!def) {
    const mount = document.getElementById("creationFlowMount");
    if (mount) {
      mount.innerHTML = `<div class="flowEmpty"><p>Challenge not found.</p><button type="button" class="primary" id="flowBtnDiscover">Back to Discover</button></div>`;
      mount.querySelector("#flowBtnDiscover")?.addEventListener("click", () => {
        try { location.hash = "#/discover"; } catch {}
      });
    }
    return;
  }
  _activeFlowId = def.id;
  _flowState = defaultFlowState(def);
  renderFlowMount(def, _flowState);
  bindFlowMountEvents(def, _flowState);
}

export function openCreationFlow(flowId) {
  const id = String(flowId || "").trim();
  if (!id) return;
  if (!_deps?.isSignedIn?.()) {
    _deps?.stashFlowPending?.(id);
    showToast("Sign in to try this challenge", { icon: "♪", durationMs: 2600 });
    try { location.hash = "#/auth"; } catch {}
    _deps?.scheduleApplyRoute?.();
    return;
  }
  haptic("light");
  try { location.hash = `#/flow/${encodeURIComponent(id)}`; } catch {}
  _deps?.scheduleApplyRoute?.();
}

export function initCreationFlow(deps) {
  _deps = deps;
  if (_bound) return;
  _bound = true;
  const back = document.getElementById("btnFlowBack");
  back?.addEventListener("click", () => {
    haptic("light");
    try { history.back(); } catch {
      try { location.hash = "#/discover"; } catch {}
    }
  });
}

export function getActiveFlowId() {
  return _activeFlowId;
}
