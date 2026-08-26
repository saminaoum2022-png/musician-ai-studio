/**
 * Pro-only features on web/desktop (browser) — native iOS/Android apps unchanged.
 */
const { fetchProSubscriptionForUser } = require("./pro-subscription");

function isWebClientRequest(req) {
  const shell = String(
    req.headers?.["x-nabad-client-shell"] ||
      req.headers?.["X-Nabad-Client-Shell"] ||
      "",
  )
    .trim()
    .toLowerCase();
  return shell === "web";
}

async function requireProForWebApi(req, userId) {
  if (!isWebClientRequest(req)) return { ok: true };
  return requireProSubscription(userId);
}

async function requireProSubscription(userId) {
  const pro = await fetchProSubscriptionForUser(userId);
  if (pro?.active) return { ok: true };
  return {
    ok: false,
    status: 403,
    error: "NabadAi Pro is required for this feature.",
    code: "pro_required",
  };
}

module.exports = {
  isWebClientRequest,
  requireProForWebApi,
  requireProSubscription,
};
