/** Nabad song verification — single “creator” mark for real creative effort. */

export const NABAD_VERIFICATION = {
  CREATOR: "creator",
};

const VALID = new Set(Object.values(NABAD_VERIFICATION));

export const NABAD_VERIFY_MESSAGES = {
  [NABAD_VERIFICATION.CREATOR]:
    "Your melody reference and creative input — not a remix, mashup, or persona reuse.",
};

export const NABAD_VERIFY_LABELS = {
  [NABAD_VERIFICATION.CREATOR]: "Creator mark",
};

export function nabadVerificationFlatLabel(state) {
  return NABAD_VERIFY_LABELS[state] || "";
}

export function lyricsEditedAfterNabadDraft(userText, aiDraft) {
  const user = normalizeLyricsCompare(userText);
  const draft = normalizeLyricsCompare(aiDraft);
  if (!draft) return false;
  if (!user) return false;
  return user !== draft;
}

function aiLyricsDraftFromMeta(meta) {
  return String(meta?.generatedLyrics || meta?.nabadAiLyricsDraft || "").trim();
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

function usesReusedMetadata(meta) {
  return Boolean(
    meta.personaId ||
      meta.remixOf ||
      meta.remixOfHubPostId ||
      meta.mashupOf ||
      meta.searchTemplateId ||
      meta.vocalRefOrigin === "remix" ||
      String(meta.mode || "").toLowerCase().includes("remix") ||
      String(meta.mode || "").toLowerCase().includes("hub remix"),
  );
}

function hasOwnMelodyReference(meta) {
  if (meta.hasReference || meta.referenceMode) return true;
  const origin = String(meta.vocalRefOrigin || "").trim();
  if (origin === "record" || origin === "upload") return true;
  const mode = String(meta.mode || "").toLowerCase();
  if (mode.includes("reference") || mode.includes("melody")) return true;
  return false;
}

/** User did more than tap Generate on an empty AI-filled form. */
function userCreativeEffort(meta) {
  if (meta.lyricsEditedByUser) return true;

  const userLyrics = String(meta.lyricsInput || "").trim();
  if (userLyrics && !meta.lyricsGeneratedInNabad) return true;

  const origin = String(meta.vocalRefOrigin || "").trim();
  if (origin === "record") return true;

  if (origin === "upload" && userLyrics) return true;

  const aiDraft = aiLyricsDraftFromMeta(meta);
  if (userLyrics && aiDraft && normalizeLyricsCompare(userLyrics) !== normalizeLyricsCompare(aiDraft)) {
    return true;
  }

  return false;
}

/** Show the plain N pill only for original creative work with a melody reference. */
export function inferNabadVerification(track) {
  if (!track || typeof track !== "object") return null;
  if (!isNabadGeneratedTrack(track)) return null;

  const meta = track.meta || {};
  if (usesReusedMetadata(meta)) return null;
  if (!hasOwnMelodyReference(meta)) return null;
  if (!userCreativeEffort(meta)) return null;

  return NABAD_VERIFICATION.CREATOR;
}

export function resolveNabadVerification(track) {
  return inferNabadVerification(track);
}

export function stampNabadVerificationMeta(meta, trackCtx = {}) {
  const base = { ...(meta || {}) };
  const inferred = inferNabadVerification({ ...trackCtx, meta: base });
  if (!inferred) {
    if (!base.nabadVerification) return base;
    const next = { ...base };
    delete next.nabadVerification;
    return next;
  }
  return { ...base, nabadVerification: inferred };
}

export function nabadVerificationMessage(state) {
  return NABAD_VERIFY_MESSAGES[state] || "";
}

/** Small inline “N” pill — plain style only. */
export function nabadVerificationBadgeHtml(state, opts = {}) {
  if (!VALID.has(state)) return "";
  const msg = nabadVerificationMessage(state);
  const size = opts.size === "sm" ? " nabadVerifyBadge--sm" : "";
  return `<span role="button" tabindex="0" class="nabadVerifyBadge${size}" data-nabad-verify="${state}" aria-label="${msg}" title="${msg}"><span class="nabadVerifyBadgeN" aria-hidden="true">N</span></span>`;
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
