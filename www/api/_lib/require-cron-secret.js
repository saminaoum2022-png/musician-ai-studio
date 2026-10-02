/**
 * Require Authorization: Bearer <CRON_SECRET> for maintenance/cron endpoints.
 */

function requireCronSecret(req) {
  const secret = String(process.env.CRON_SECRET || "").trim();
  if (!secret) {
    return { ok: false, status: 503, error: "CRON_SECRET not configured" };
  }
  const auth = String(req.headers.authorization || req.headers.Authorization || "").trim();
  if (auth !== `Bearer ${secret}`) {
    return { ok: false, status: 401, error: "unauthorized" };
  }
  return { ok: true };
}

module.exports = { requireCronSecret };
