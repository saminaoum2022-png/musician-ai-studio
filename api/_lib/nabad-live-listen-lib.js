/**
 * Live Listen — host-owned one-song session.
 * Staging-first: NABAD_LIVE_LISTEN_ENABLED=1 on Vercel Preview (default on).
 */

function envFlagEnabled(name, { defaultOn = false } = {}) {
  const v = String(process.env[name] || "").trim().toLowerCase();
  if (!v) return defaultOn;
  return v === "1" || v === "true" || v === "yes";
}

function nabadLiveListenEnabled() {
  const isPreview = String(process.env.VERCEL_ENV || "").trim().toLowerCase() === "preview";
  return envFlagEnabled("NABAD_LIVE_LISTEN_ENABLED", { defaultOn: isPreview });
}

module.exports = { nabadLiveListenEnabled };
