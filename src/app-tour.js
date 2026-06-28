/**
 * Retired.
 *
 * This module used to run a post-signup tour/guide. It was removed because it
 * duplicated the pre-auth onboarding carousel. Self-serve help now lives in the
 * in-app Help & FAQ overlay (Settings → Support).
 *
 * These no-op exports are kept so the existing lazy imports and wiring in
 * app.js stay harmless without needing changes there.
 */

export const HOME_TOUR_VERSION = "";
export const MINI_TOUR_VERSION = "";

export function initAppTour() {}
export function scheduleHomeTourIfNeeded() {}
export function schedulePersonaTourIfNeeded() {}
export function notifyAppRouteChanged() {}
export function replayHomeTour() {}
export function replayPersonaTour() {}
export function openHomeTour() {}
export function isHomeTourComplete() {
  return true;
}
export function markHomeTourComplete() {}
export function resetHomeTour() {}
