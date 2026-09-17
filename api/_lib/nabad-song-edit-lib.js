/**
 * Nabad Edit — admin-only ElevenLabs song inpaint.
 * Staging-first: NABAD_SONG_EDIT_ENABLED=1 on Vercel Preview (default on).
 */

function envFlagEnabled(name, { defaultOn = false } = {}) {
  const v = String(process.env[name] || "").trim().toLowerCase();
  if (!v) return defaultOn;
  return v === "1" || v === "true" || v === "yes";
}

function nabadSongEditEnabled() {
  const isPreview = String(process.env.VERCEL_ENV || "").trim().toLowerCase() === "preview";
  return envFlagEnabled("NABAD_SONG_EDIT_ENABLED", { defaultOn: isPreview });
}

module.exports = { nabadSongEditEnabled };
