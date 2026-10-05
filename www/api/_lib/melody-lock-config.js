/**
 * Melody Lock feature gates (Phase 1 — analyze only).
 */
const { isAdminEmail } = require("./credits-auth");

function melodyLockEnabled() {
  return String(process.env.MELODY_LOCK_ENABLED || "0").trim() === "1";
}

function melodyLockAdminOnly() {
  const v = String(process.env.MELODY_LOCK_ADMIN_ONLY ?? "1").trim();
  return v === "1" || v.toLowerCase() === "true";
}

function melodyLockAccessAllowed(user) {
  if (!melodyLockEnabled()) return { ok: false, status: 503, error: "Melody Lock is not enabled on this server." };
  if (!user?.userId) return { ok: false, status: 401, error: "Sign in to use Melody Lock." };
  if (melodyLockAdminOnly() && !isAdminEmail(user.email)) {
    return { ok: false, status: 403, error: "Melody Lock is admin-only during Phase 1." };
  }
  return { ok: true };
}

const VALID_SOURCE_KINDS = new Set(["hum", "whistle", "sing"]);

function normalizeSourceKind(raw) {
  const k = String(raw || "hum").trim().toLowerCase();
  return VALID_SOURCE_KINDS.has(k) ? k : "hum";
}

module.exports = {
  melodyLockEnabled,
  melodyLockAdminOnly,
  melodyLockAccessAllowed,
  normalizeSourceKind,
  VALID_SOURCE_KINDS,
};
