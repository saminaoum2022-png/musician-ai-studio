/**
 * Monthly Pro grandfather allowlist — keep 1,200 credits/renewal (1,000 + 200 bonus)
 * for accounts that subscribed under the old monthly allotment.
 *
 * Prefer UUIDs here (or MONTHLY_LEGACY_1200_USER_IDS env). Anyone not listed still
 * qualifies via created_at cutoff in billing-config (active monthlies before the
 * 1,000-credit plan shipped). New monthly INITIAL_PURCHASE always gets 1,000.
 *
 * After a legacy user fully expires and re-subscribes, created_at is refreshed so
 * they move to the new 1,000 plan.
 */

/** @type {readonly string[]} */
const MONTHLY_LEGACY_1200_USER_IDS = Object.freeze([
  // Add explicit user UUIDs here when known. Env var also merges in at runtime.
]);

module.exports = {
  MONTHLY_LEGACY_1200_USER_IDS,
};
