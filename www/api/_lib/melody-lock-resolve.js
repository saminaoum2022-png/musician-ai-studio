/**
 * Resolve melodyLock on POST /api/music/generate (Lyria only).
 */
const { melodyLockEnabled, melodyLockAdminOnly, normalizeSourceKind } = require("./melody-lock-config");
const { isAdminEmail } = require("./credits-auth");
const { getMelodyLockSource } = require("./melody-lock-store");
const { resolveLyriaPromptV2Enabled } = require("./lyria-prompt-v2");

function parseMelodyLockBody(body) {
  const raw = body?.melodyLock ?? body?.melody_lock ?? null;
  if (!raw) return null;
  if (typeof raw === "string") return { melodyId: raw.trim() };
  if (typeof raw === "object") {
    return {
      melodyId: String(raw.melodyId || raw.id || "").trim(),
      preferClip: raw.preferClip === true || String(raw.preferClip || "") === "1",
    };
  }
  return null;
}

async function resolveMelodyLockForGenerate({ user, body, isAdmin, clip = false }) {
  const parsed = parseMelodyLockBody(body);
  if (!parsed?.melodyId) return null;

  if (!melodyLockEnabled()) {
    return { error: "Melody Lock is not enabled on this server.", status: 503, code: "melody_lock_disabled" };
  }
  if (melodyLockAdminOnly() && !isAdmin && !isAdminEmail(user?.email)) {
    return { error: "Melody Lock generate is admin-only during Phase 2.", status: 403, code: "melody_lock_admin_only" };
  }
  if (!resolveLyriaPromptV2Enabled(body, isAdmin)) {
    return {
      error: "Melody Lock requires Lyria Prompt v2 — enable LYRIA_PROMPT_V2 or use admin.",
      status: 400,
      code: "melody_lock_requires_v2",
    };
  }

  const loaded = await getMelodyLockSource(parsed.melodyId, user.userId);
  if (!loaded.ok) {
    return {
      error: loaded.error || "Melody not found.",
      status: loaded.status || 404,
      code: "melody_lock_not_found",
    };
  }

  const row = loaded.row;
  const melody = row.melody_json || {};
  if (!Array.isArray(melody.notes) || melody.notes.length < 2) {
    return { error: "Melody has too few notes — re-analyze your hum.", status: 400, code: "melody_lock_empty" };
  }

  return {
    melodyId: row.id,
    sourceKind: normalizeSourceKind(row.source_kind),
    melody: {
      ...melody,
      tempoBpm: melody.tempoBpm || row.inferred_bpm || 96,
      inferredKey: melody.inferredKey || row.inferred_key || "",
    },
    preferClip: parsed.preferClip || clip,
  };
}

module.exports = {
  parseMelodyLockBody,
  resolveMelodyLockForGenerate,
};
