/**
 * Live Listen — host-owned one-song session.
 * On for Vercel production and preview unless NABAD_LIVE_LISTEN_ENABLED is explicitly off.
 */

function envFlagEnabled(name, { defaultOn = false } = {}) {
  const v = String(process.env[name] || "").trim().toLowerCase();
  if (!v) return defaultOn;
  return v === "1" || v === "true" || v === "yes";
}

function nabadLiveListenEnabled() {
  const vercelEnv = String(process.env.VERCEL_ENV || "").trim().toLowerCase();
  const defaultOn = vercelEnv === "preview" || vercelEnv === "production";
  return envFlagEnabled("NABAD_LIVE_LISTEN_ENABLED", { defaultOn });
}

module.exports = { nabadLiveListenEnabled };
