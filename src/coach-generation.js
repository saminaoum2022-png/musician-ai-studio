/**
 * Coach orb status — generation, music video, instrumental, and ready flashes.
 * Blocks idle nudges and contextual hints while a status pill is active.
 */

import {
  getCoachOrbMode,
  surfaceCoachOrb,
  syncCoachOrbShellForMode,
  unsurfaceCoachOrbIfIdle,
} from "./coach-orb-prefs.js";
import { peekPendingPushTask } from "./push-notifications.js";

export const COACH_PILL_DEFAULT = "Need help? 🎵";
const COACH_READY_VISIBLE_MS = 9000;
const COACH_PRIORITY_READY_MS = 8000;

let _generationLocked = false;
let _statusActive = false;
let _priorityActive = false;
let _pillVisible = false;
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

function refreshOrbShell() {
  syncCoachOrbShellForMode({
    statusActive: _statusActive || _generationLocked,
    priorityActive: _priorityActive,
    pillVisible: _pillVisible,
    mode: getCoachOrbMode(),
  });
}

function setPillText(text) {
  const pill = coachPillEl();
  if (pill) pill.textContent = String(text || COACH_PILL_DEFAULT);
}

function showStatusPill(text, { generating = false, priority = false } = {}) {
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
  _pillVisible = true;
  surfaceCoachOrb({ priority: priority || generating });
  refreshOrbShell();
}

function resetCoachPill({ restoreDefault = true } = {}) {
  const fab = coachFabEl();
  if (fab) fab.classList.remove("coachFab--nudge", "coachFab--hint", "coachFab--generating");
  if (restoreDefault) setPillText(COACH_PILL_DEFAULT);
  _generationLocked = false;
  _statusActive = false;
  _priorityActive = false;
  _pillVisible = false;
  refreshOrbShell();
  unsurfaceCoachOrbIfIdle();
}

export function isCoachGenerationLocked() {
  return _generationLocked;
}

export function isCoachStatusActive() {
  return _statusActive || _priorityActive;
}

export function isCoachPriorityActive() {
  return _priorityActive;
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

export function coachMusicVideoPillText(title) {
  const t = String(title || "Your song").trim() || "Your song";
  return `Music video · ${t.slice(0, 28)}${t.length > 28 ? "…" : ""}`;
}

export function coachInstrumentalPillText(title) {
  const t = String(title || "Your song").trim() || "Your song";
  return `Instrumental · ${t.slice(0, 28)}${t.length > 28 ? "…" : ""}`;
}

export function coachSoundPillText(title) {
  const t = String(title || "Your sound").trim() || "Your sound";
  return `Creating sound · ${t.slice(0, 28)}${t.length > 28 ? "…" : ""}`;
}

export function coachHumTrackGeneratingPillText(instrumentLabel) {
  const l = String(instrumentLabel || "instrument").trim() || "instrument";
  return `Hum Track · ${l}…`;
}

export function coachPhotoMoodPillText(variantCount = 2) {
  const n = Math.max(1, Number(variantCount) || 2);
  return n > 1 ? "Photo Mood · creating songs…" : "Photo Mood · creating song…";
}

/** Persistent pill for the whole backend run. */
export function beginCoachGenerationStatus({ variantCount = 2, pillText = "" } = {}) {
  try { _onArmHook?.(); } catch {}
  _generationLocked = true;
  _statusActive = true;
  const text = String(pillText || "").trim() || coachGeneratingPillText(variantCount);
  showStatusPill(text, { generating: true, priority: true });
}

/** Long poll — soften copy but keep the pill up. */
export function bumpCoachGenerationStillWorking() {
  if (!_generationLocked) return;
  showStatusPill(coachStillCreatingPillText(), { generating: true, priority: true });
}

/** Success flash, then release. */
export function finishCoachGenerationReady({ variantCount = 1 } = {}) {
  _generationLocked = false;
  _statusActive = true;
  showStatusPill(coachReadyPillText(variantCount), { generating: false, priority: true });
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

/** Music video or instrumental extraction — orb replaces the old banner cards. */
export function beginCoachPriorityStatus(text, { generating = true } = {}) {
  try { _onArmHook?.(); } catch {}
  _priorityActive = true;
  _statusActive = true;
  showStatusPill(text, { generating, priority: true });
}

export function updateCoachPriorityStatus(text, { generating = true } = {}) {
  if (!_priorityActive && !_statusActive) return;
  showStatusPill(text, { generating, priority: true });
}

export function finishCoachPriorityStatus(text, { success = true } = {}) {
  _priorityActive = false;
  _statusActive = true;
  showStatusPill(text, { generating: false, priority: true });
  const fab = coachFabEl();
  if (fab) fab.classList.remove("coachFab--generating");
  if (_readyFlashTimer) clearTimeout(_readyFlashTimer);
  _readyFlashTimer = setTimeout(() => {
    resetCoachPill({ restoreDefault: true });
    _readyFlashTimer = null;
  }, success ? COACH_PRIORITY_READY_MS : 5000);
}

export function cancelCoachPriorityStatus() {
  if (_readyFlashTimer) {
    clearTimeout(_readyFlashTimer);
    _readyFlashTimer = null;
  }
  resetCoachPill({ restoreDefault: true });
}

function pushRecoverPendingForTask(pending) {
  const push = peekPendingPushTask();
  if (!push?.taskId || !pending) return false;
  const pushId = String(push.taskId).trim();
  if (!pushId) return false;
  const ids = [pending.taskId, pending.videoTaskId]
    .map((x) => String(x || "").trim())
    .filter(Boolean);
  return ids.includes(pushId);
}

/** Boot / route restore when session still has a pending song-style task. */
export function syncCoachGenerationStatusFromPending(pending) {
  if (!pending?.taskId) {
    if (_generationLocked) cancelCoachGenerationStatus();
    return;
  }
  if (pushRecoverPendingForTask(pending)) return;
  let pillText = "";
  if (pending.source === "hum_track") {
    pillText = coachHumTrackGeneratingPillText(
      pending.title?.replace(/^Hum Track ·\s*/i, "") || pending.instrumentId || "instrument",
    );
  } else if (pending.source === "photo") {
    pillText = coachPhotoMoodPillText(pending.variantCount);
  }
  beginCoachGenerationStatus({ variantCount: pending.variantCount, pillText });
}

/** Boot / route restore for Sounds, instrumental, music video jobs. */
export function syncCoachPriorityStatusFromPending(pending) {
  if (!pending?.kind) {
    if (_priorityActive) cancelCoachPriorityStatus();
    return;
  }
  if (pushRecoverPendingForTask(pending)) return;
  const title = String(pending.title || "").trim() || "Your creation";
  if (pending.kind === "sound") {
    beginCoachPriorityStatus(coachSoundPillText(title), { generating: true });
    return;
  }
  if (pending.kind === "instrumental") {
    beginCoachPriorityStatus(coachInstrumentalPillText(title), { generating: true });
    return;
  }
  if (pending.kind === "music_video") {
    beginCoachPriorityStatus(coachMusicVideoPillText(title), { generating: true });
  }
}

/** Called from idle nudges / contextual hints in app.js */
export function notifyCoachOrbPillShown({ contextual = false, priority = false } = {}) {
  const fab = coachFabEl();
  if (!fab) return;
  _pillVisible = true;
  fab.classList.toggle("coachFab--hint", Boolean(contextual));
  fab.classList.add("coachFab--nudge");
  surfaceCoachOrb({ priority });
  refreshOrbShell();
}

export function notifyCoachOrbPillHidden() {
  if (_statusActive || _generationLocked || _priorityActive) return;
  _pillVisible = false;
  refreshOrbShell();
}

export function syncCoachOrbAfterRouteChange() {
  if (_statusActive || _generationLocked || _priorityActive || _pillVisible) {
    refreshOrbShell();
    return;
  }
  unsurfaceCoachOrbIfIdle();
  refreshOrbShell();
}

/** Legacy helper — generation module used to bail when orb wasn't visible. */
export { coachFabIsVisible };
