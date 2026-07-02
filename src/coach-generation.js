/**
 * Coach orb status while Suno generation runs — persistent pill, no overlay bar.
 * Blocks idle nudges and contextual hints until the run finishes or is cancelled.
 */

export const COACH_PILL_DEFAULT = "Need help? 🎵";
const COACH_READY_VISIBLE_MS = 9000;

let _generationLocked = false;
let _statusActive = false;
let _readyFlashTimer = null;
let _onArmHook = null;

export function configureCoachGeneration({ onArm } = {}) {
  _onArmHook = typeof onArm === "function" ? onArm : null;
}

function coachFabEl() {
  return document.getElementById("coachFab");
}

function coachPillEl() {
  return document.querySelector("#coachFab .coachFabPill");
}

function coachFabIsVisible() {
  const fab = coachFabEl();
  if (!fab) return false;
  const r = fab.getBoundingClientRect();
  return r.width > 0 && r.height > 0;
}

function setPillText(text) {
  const pill = coachPillEl();
  if (pill) pill.textContent = String(text || COACH_PILL_DEFAULT);
}

function showStatusPill(text, { generating = false } = {}) {
  if (!coachFabIsVisible()) return;
  const fab = coachFabEl();
  if (!fab) return;
  if (_readyFlashTimer) {
    clearTimeout(_readyFlashTimer);
    _readyFlashTimer = null;
  }
  setPillText(text);
  fab.classList.remove("coachFab--hint");
  fab.classList.add("coachFab--nudge");
  fab.classList.toggle("coachFab--generating", generating);
}

function resetCoachPill({ restoreDefault = true } = {}) {
  const fab = coachFabEl();
  if (fab) fab.classList.remove("coachFab--nudge", "coachFab--hint", "coachFab--generating");
  if (restoreDefault) setPillText(COACH_PILL_DEFAULT);
  _generationLocked = false;
  _statusActive = false;
}

export function isCoachGenerationLocked() {
  return _generationLocked;
}

export function isCoachStatusActive() {
  return _statusActive;
}

export function coachGeneratingPillText(variantCount = 2) {
  const n = Math.max(1, Number(variantCount) || 2);
  return n > 1 ? "Creating your songs…" : "Creating your song…";
}

export function coachReadyPillText(variantCount = 1) {
  const n = Math.max(1, Number(variantCount) || 1);
  return n > 1 ? "Your songs are ready ✓" : "Your song is ready ✓";
}

export function coachStillCreatingPillText() {
  return "Still creating — usually 1–2 min…";
}

/** Persistent pill for the whole backend run. */
export function beginCoachGenerationStatus({ variantCount = 2 } = {}) {
  try { _onArmHook?.(); } catch {}
  _generationLocked = true;
  _statusActive = true;
  showStatusPill(coachGeneratingPillText(variantCount), { generating: true });
}

/** Long poll — soften copy but keep the pill up. */
export function bumpCoachGenerationStillWorking() {
  if (!_generationLocked) return;
  showStatusPill(coachStillCreatingPillText(), { generating: true });
}

/** Success flash, then release. */
export function finishCoachGenerationReady({ variantCount = 1 } = {}) {
  _generationLocked = false;
  _statusActive = true;
  if (!coachFabIsVisible()) {
    resetCoachPill();
    return;
  }
  showStatusPill(coachReadyPillText(variantCount), { generating: false });
  const fab = coachFabEl();
  if (fab) fab.classList.remove("coachFab--generating");
  if (_readyFlashTimer) clearTimeout(_readyFlashTimer);
  _readyFlashTimer = setTimeout(() => {
    resetCoachPill({ restoreDefault: true });
    _readyFlashTimer = null;
  }, COACH_READY_VISIBLE_MS);
}

/** Failure, dismiss, or clear pending. */
export function cancelCoachGenerationStatus() {
  if (_readyFlashTimer) {
    clearTimeout(_readyFlashTimer);
    _readyFlashTimer = null;
  }
  resetCoachPill({ restoreDefault: true });
}

/** Boot / route restore when session still has a pending task. */
export function syncCoachGenerationStatusFromPending(pending) {
  if (!pending?.taskId) {
    if (_generationLocked) cancelCoachGenerationStatus();
    return;
  }
  beginCoachGenerationStatus({ variantCount: pending.variantCount });
}
