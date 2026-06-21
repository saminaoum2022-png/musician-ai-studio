/** Nabad song verification — lightweight “N” quality mark on tracks. */

export const NABAD_VERIFICATION = {
  VERIFIED: "verified",
  CO_CREATED: "co_created",
  CREATED_WITH: "created_with",
};

const VALID = new Set(Object.values(NABAD_VERIFICATION));

export const NABAD_VERIFY_MESSAGES = {
  [NABAD_VERIFICATION.VERIFIED]: "Created and verified within Nabad AI",
  [NABAD_VERIFICATION.CO_CREATED]: "Co-created by the creator and Nabad AI",
  [NABAD_VERIFICATION.CREATED_WITH]: "Created using Nabad AI",
};

export const NABAD_VERIFY_LABELS = {
  [NABAD_VERIFICATION.VERIFIED]: "Verified by Nabad",
  [NABAD_VERIFICATION.CO_CREATED]: "Creator + Nabad",
  [NABAD_VERIFICATION.CREATED_WITH]: "Created with Nabad",
};

export function nabadVerificationFlatLabel(state) {
  return NABAD_VERIFY_LABELS[state] || "";
}

function normalizeLyricsCompare(text) {
  return String(text || "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function isNabadGeneratedTrack(track) {
  const meta = track?.meta || {};
  const taskId = String(track?.taskId || meta.taskId || "").trim();
  const audioId = String(track?.audioId || meta.audioId || "").trim();
  const url = String(track?.url || "").trim();
  if (taskId || audioId) return true;
  if (meta.engine || meta.mode) return true;
  if (url && /\/api\//.test(url)) return true;
  if (meta.demo) return false;
  return false;
}

/** Infer verification tier from track metadata (retroactive + new). */
export function inferNabadVerification(track) {
  if (!track || typeof track !== "object") return null;
  const meta = track.meta || {};
  if (VALID.has(meta.nabadVerification)) return meta.nabadVerification;
  if (!isNabadGeneratedTrack(track)) return null;

  const mode = String(meta.mode || "").toLowerCase();
  const kind = String(track.kind || "full").toLowerCase();
  const lyricsInput = String(meta.lyricsInput || "").trim();
  const finalPrompt = String(meta.finalPrompt || meta.prompt || "").trim();

  const externalContent = Boolean(
    meta.externalLyrics ||
      meta.importedLyrics ||
      meta.lyricsSource === "external" ||
      meta.lyricsSource === "import" ||
      meta.searchTemplateId ||
      meta.remixOfHubPostId ||
      meta.remixOf ||
      meta.mashupOf ||
      meta.referenceMode ||
      meta.hasReference ||
      meta.referenceInstrumentalOnly ||
      meta.vocalRefOrigin ||
      mode === "upload" ||
      mode === "import",
  );

  if (externalContent) return NABAD_VERIFICATION.CREATED_WITH;

  const lyricsEdited = Boolean(
    meta.lyricsEditedByUser ||
      (lyricsInput &&
        finalPrompt &&
        normalizeLyricsCompare(lyricsInput) !== normalizeLyricsCompare(finalPrompt)),
  );
  if (lyricsEdited) return NABAD_VERIFICATION.CO_CREATED;

  if (
    kind === "instrumental" ||
    kind === "sound" ||
    mode.includes("instrumental") ||
    mode === "sound" ||
    mode === "hum" ||
    mode === "photo" ||
    mode === "challenge"
  ) {
    return NABAD_VERIFICATION.VERIFIED;
  }

  if (meta.lyricsGeneratedInNabad && !lyricsEdited) {
    return NABAD_VERIFICATION.VERIFIED;
  }

  if (lyricsInput || finalPrompt || meta.styleInput || meta.styleSent) {
    return NABAD_VERIFICATION.VERIFIED;
  }

  return NABAD_VERIFICATION.CREATED_WITH;
}

export function resolveNabadVerification(track) {
  const stored = track?.meta?.nabadVerification;
  if (VALID.has(stored)) return stored;
  return inferNabadVerification(track);
}

export function stampNabadVerificationMeta(meta, trackCtx = {}) {
  const base = { ...(meta || {}) };
  if (VALID.has(base.nabadVerification)) return base;
  const inferred = inferNabadVerification({ ...trackCtx, meta: base });
  if (!inferred) return base;
  return { ...base, nabadVerification: inferred };
}

export function nabadVerificationMessage(state) {
  return NABAD_VERIFY_MESSAGES[state] || "";
}

/** Small inline “N” pill — `<span role="button">` so it can live inside row/card `<button>`s without breaking layout. */
export function nabadVerificationBadgeHtml(state, opts = {}) {
  if (!VALID.has(state)) return "";
  const msg = nabadVerificationMessage(state);
  const cls =
    state === NABAD_VERIFICATION.VERIFIED
      ? "nabadVerifyBadge--verified"
      : state === NABAD_VERIFICATION.CO_CREATED
        ? "nabadVerifyBadge--coCreated"
        : "nabadVerifyBadge--createdWith";
  const size = opts.size === "sm" ? " nabadVerifyBadge--sm" : "";
  return `<span role="button" tabindex="0" class="nabadVerifyBadge ${cls}${size}" data-nabad-verify="${state}" aria-label="${msg}" title="${msg}"><span class="nabadVerifyBadgeN" aria-hidden="true">N</span></span>`;
}

export function nabadVerificationBadgeForTrack(track, opts = {}) {
  const state = resolveNabadVerification(track);
  return state ? nabadVerificationBadgeHtml(state, opts) : "";
}

let popoverEl = null;
let popoverTextEl = null;
let popoverBound = false;

function ensurePopover() {
  if (popoverEl) return;
  popoverEl = document.getElementById("nabadVerifyPopover");
  popoverTextEl = document.getElementById("nabadVerifyPopoverText");
}

function hideNabadVerifyPopover() {
  ensurePopover();
  if (!popoverEl) return;
  popoverEl.hidden = true;
  popoverEl.style.display = "none";
}

function showNabadVerifyPopover(anchor, state) {
  ensurePopover();
  if (!popoverEl || !popoverTextEl || !anchor) return;
  const msg = nabadVerificationMessage(state);
  if (!msg) return;
  popoverTextEl.textContent = msg;
  popoverEl.hidden = false;
  popoverEl.style.display = "";
  const rect = anchor.getBoundingClientRect();
  const pad = 8;
  popoverEl.style.position = "fixed";
  popoverEl.style.transform = "translateX(-50%)";
  let top = rect.bottom + pad;
  let left = rect.left + rect.width / 2;
  popoverEl.style.top = `${top}px`;
  popoverEl.style.left = `${left}px`;
  requestAnimationFrame(() => {
    if (!popoverEl) return;
    const pr = popoverEl.getBoundingClientRect();
    const vw = window.innerWidth;
    if (pr.right > vw - pad) {
      left -= pr.right - vw + pad;
    }
    if (pr.left < pad) {
      left += pad - pr.left;
    }
    if (pr.bottom > window.innerHeight - pad) {
      top = rect.top - pr.height - pad;
    }
    popoverEl.style.top = `${top}px`;
    popoverEl.style.left = `${left}px`;
  });
}

/** Delegated tap handler for `[data-nabad-verify]` badges. */
export function initNabadVerificationUi() {
  if (popoverBound) return;
  popoverBound = true;
  document.addEventListener(
    "click",
    (e) => {
      const btn = e.target.closest("[data-nabad-verify]");
      if (!btn) return;
      e.preventDefault();
      e.stopPropagation();
      const state = btn.getAttribute("data-nabad-verify");
      if (popoverEl && !popoverEl.hidden && popoverEl.dataset.anchorId === btn.dataset.nabadVerifyId) {
        hideNabadVerifyPopover();
        return;
      }
      if (!btn.dataset.nabadVerifyId) {
        btn.dataset.nabadVerifyId = `nv_${Math.random().toString(36).slice(2, 9)}`;
      }
      if (popoverEl) popoverEl.dataset.anchorId = btn.dataset.nabadVerifyId;
      showNabadVerifyPopover(btn, state);
    },
    true,
  );
  document.addEventListener(
    "keydown",
    (e) => {
      const btn = e.target.closest("[data-nabad-verify]");
      if (btn && (e.key === "Enter" || e.key === " ")) {
        e.preventDefault();
        e.stopPropagation();
        btn.click();
        return;
      }
      if (e.key === "Escape") hideNabadVerifyPopover();
    },
    true,
  );
  document.addEventListener(
    "click",
    (e) => {
      if (e.target.closest("[data-nabad-verify]") || e.target.closest("#nabadVerifyPopover")) return;
      hideNabadVerifyPopover();
    },
    true,
  );
}
