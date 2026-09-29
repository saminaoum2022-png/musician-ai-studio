/**
 * Monthly Pro grandfather allowlist — keep 1,200 credits/renewal (1,000 + 200 bonus)
 * for accounts that subscribed under the old monthly allotment.
 *
 * These three were active monthly before the 1,000-credit plan (2026-09-29).
 * Env MONTHLY_LEGACY_1200_USER_IDS can add more UUIDs (comma-separated).
 *
 * After a legacy user fully expires and re-subscribes, created_at is refreshed so
 * they move to the new 1,000 plan (INITIAL_PURCHASE ignores this list).
 */

/** @type {readonly string[]} */
const MONTHLY_LEGACY_1200_USER_IDS = Object.freeze([
  "4775022b-cb9c-40cc-ba5a-1690ec81ebd6", // nada.alshamsi@hotmail.com
  "6bcbc85f-d826-4f20-8442-819611efce05", // yy1711316@gmail.com
  "d36cd022-3183-4096-a2eb-83e65392e686", // gresha0@gmail.com
]);

module.exports = {
  MONTHLY_LEGACY_1200_USER_IDS,
};
