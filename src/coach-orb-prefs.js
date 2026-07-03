/**
 * NabadAI Orb visibility preference — always on, smart (surface when useful),
 * or hidden (only critical job status: generating, ready, MV, instrumental).
 */

export const COACH_ORB_MODE_KEY = "nabad.coach.orbMode.v1";
export const COACH_ORB_MODES = Object.freeze(["always", "smart", "hidden"]);

const MODE_LABELS = {
  always: "Always on",
  smart: "Smart",
  hidden: "Status only",
};

const MODE_SUBS = {
  always: "Orb stays visible on main tabs",
  smart: "Appears for tips and when something is happening",
  hidden: "Only shows while a song, video, or instrumental is processing",
};

export function normalizeCoachOrbMode(mode) {
  const m = String(mode || "").trim().toLowerCase();
  return COACH_ORB_MODES.includes(m) ? m : "always";
}

export function getCoachOrbMode() {
  try {
    return normalizeCoachOrbMode(localStorage.getItem(COACH_ORB_MODE_KEY));
  } catch {
    return "always";
  }
}

export function setCoachOrbMode(mode) {
  const next = normalizeCoachOrbMode(mode);
  try {
    localStorage.setItem(COACH_ORB_MODE_KEY, next);
  } catch {}
  applyCoachOrbModeToBody(next);
  return next;
}

export function applyCoachOrbModeToBody(mode = getCoachOrbMode()) {
  const next = normalizeCoachOrbMode(mode);
  document.body.dataset.coachOrbMode = next;
  return next;
}

export function coachOrbModeLabel(mode = getCoachOrbMode()) {
  return MODE_LABELS[normalizeCoachOrbMode(mode)] || MODE_LABELS.always;
}

export function coachOrbModeSub(mode = getCoachOrbMode()) {
  return MODE_SUBS[normalizeCoachOrbMode(mode)] || MODE_SUBS.always;
}

export function coachOrbAllowsIdleNudges(mode = getCoachOrbMode()) {
  const m = normalizeCoachOrbMode(mode);
  return m === "always" || m === "smart";
}

export function coachOrbAllowsContextHints(mode = getCoachOrbMode()) {
  return coachOrbAllowsIdleNudges(mode);
}

/** Show the floating orb shell (smart / hidden modes). */
export function surfaceCoachOrb({ priority = false } = {}) {
  const fab = document.getElementById("coachFab");
  if (!fab) return;
  fab.classList.add("coachFab--surfaced");
  fab.classList.toggle("coachFab--priority", Boolean(priority));
}

/** Hide the orb when nothing needs it (smart / hidden modes). */
export function unsurfaceCoachOrbIfIdle({ keepPriority = false } = {}) {
  const fab = document.getElementById("coachFab");
  if (!fab) return;
  if (keepPriority && fab.classList.contains("coachFab--priority")) return;
  fab.classList.remove("coachFab--surfaced", "coachFab--priority");
}

export function syncCoachOrbShellForMode({
  statusActive = false,
  priorityActive = false,
  pillVisible = false,
  mode = getCoachOrbMode(),
} = {}) {
  const m = normalizeCoachOrbMode(mode);
  if (m === "always") {
    unsurfaceCoachOrbIfIdle();
    return;
  }
  if (priorityActive || statusActive || pillVisible) {
    surfaceCoachOrb({ priority: priorityActive || statusActive });
    return;
  }
  if (m === "hidden") {
    unsurfaceCoachOrbIfIdle();
    return;
  }
  // smart: hide when idle
  unsurfaceCoachOrbIfIdle();
}
