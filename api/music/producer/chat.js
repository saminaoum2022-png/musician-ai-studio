/**
 * POST /api/music/producer/chat
 * Body: { session?, message?, actionId? }
 */
const { verifyUser, sendJson, readJsonBody } = require("../../_lib/credits-auth");
const { applyCors } = require("../../_lib/cors");
const { fetchProSubscriptionForUser } = require("../../_lib/pro-subscription");
const { userIsAdmin } = require("../../_lib/admin-auth");
const {
  nabadProducerEnabled,
  producerChatTurn,
  emptySession,
} = require("../../_lib/nabad-producer-lib");

async function requireProducerAccess(user) {
  if (!nabadProducerEnabled()) {
    return {
      ok: false,
      status: 403,
      error: "Nabad Producer is not enabled on this server.",
      code: "nabad_producer_disabled",
    };
  }
  if (await userIsAdmin(user)) {
    return { ok: true, isAdmin: true };
  }
  const pro = await fetchProSubscriptionForUser(user.userId);
  if (!pro?.active) {
    return {
      ok: false,
      status: 403,
      error: "NabadAi Pro is required for Nabad Producer.",
      code: "pro_required",
    };
  }
  return { ok: true, isAdmin: false };
}

module.exports = async function handler(req, res) {
  applyCors(req, res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return sendJson(res, 405, { error: "Method not allowed" });

  const user = await verifyUser(req);
  if (!user?.userId) return sendJson(res, 401, { error: "Unauthorized" });

  const access = await requireProducerAccess(user);
  if (!access.ok) {
    return sendJson(res, access.status, {
      error: access.error,
      code: access.code,
    });
  }

  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || "";
  if (!apiKey) return sendJson(res, 500, { error: "Missing GEMINI_API_KEY on server" });

  try {
    const body = await readJsonBody(req);
    const result = await producerChatTurn({
      apiKey,
      session: body?.session || emptySession(),
      message: String(body?.message || ""),
      actionId: String(body?.actionId || ""),
    });

    if (!result.ok) {
      return sendJson(res, 502, result);
    }

    return sendJson(res, 200, { ok: true, ...result });
  } catch (e) {
    return sendJson(res, 500, { error: e?.message || String(e) });
  }
};
