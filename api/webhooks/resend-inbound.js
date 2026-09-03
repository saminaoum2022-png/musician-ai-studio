/**
 * POST /api/webhooks/resend-inbound
 * Resend email.received webhook → store in support_inbound_messages.
 */
const { sendJson } = require("../_lib/credits-auth");
const { applyCors } = require("../_lib/cors");
const { readRawBody } = require("../_lib/stripe-billing");
const {
  ingestReceivedEmail,
  verifySvixWebhook,
  isResendInboundConfigured,
} = require("../_lib/resend-inbound");

module.exports = async function handler(req, res) {
  if (applyCors(req, res)) return;
  if (req.method !== "POST") return sendJson(res, 405, { error: "Method not allowed" });

  if (!isResendInboundConfigured()) {
    return sendJson(res, 503, { error: "Resend inbound not configured" });
  }

  const rawBody = await readRawBody(req);
  const secret = String(
    process.env.RESEND_INBOUND_WEBHOOK_SECRET || process.env.RESEND_WEBHOOK_SECRET || "",
  ).trim();

  if (secret) {
    const verified = verifySvixWebhook(rawBody, req.headers || {}, secret);
    if (!verified.ok) {
      return sendJson(res, 401, { error: verified.error || "Invalid webhook signature" });
    }
  }

  let event;
  try {
    event = JSON.parse(rawBody.toString("utf8"));
  } catch {
    return sendJson(res, 400, { error: "Invalid JSON body" });
  }

  const type = String(event?.type || "").trim();
  if (type !== "email.received") {
    return sendJson(res, 200, { ok: true, ignored: type || "unknown" });
  }

  const emailId = String(event?.data?.email_id || "").trim();
  if (!emailId) {
    return sendJson(res, 400, { error: "Missing email_id in webhook payload" });
  }

  try {
    const result = await ingestReceivedEmail(emailId);
    if (!result.ok) {
      return sendJson(res, result.status || 502, {
        error: result.error || "Could not ingest email",
      });
    }
    return sendJson(res, 200, {
      ok: true,
      emailId,
      inserted: Boolean(result.inserted),
      id: result.row?.id || null,
    });
  } catch (e) {
    return sendJson(res, 500, { error: e?.message || "Webhook processing failed" });
  }
};
