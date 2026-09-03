/**
 * Outbound mail via Resend (support@nabadai.com).
 */

const RESEND_API_KEY = String(process.env.RESEND_API_KEY || "").trim();
const SUPPORT_EMAIL_FROM = String(
  process.env.SUPPORT_EMAIL_FROM || "NabadAi Support <support@nabadai.com>",
).trim();
const SUPPORT_EMAIL_REPLY_TO = String(
  process.env.SUPPORT_EMAIL_REPLY_TO || "support@nabadai.com",
).trim();

function isResendConfigured() {
  return Boolean(RESEND_API_KEY && SUPPORT_EMAIL_FROM);
}

/**
 * @param {{ to: string, subject: string, text: string, html?: string }} opts
 */
async function sendSupportEmail(opts) {
  const to = String(opts?.to || "").trim().toLowerCase();
  const subject = String(opts?.subject || "").trim();
  const text = String(opts?.text || "").trim();
  const html = String(opts?.html || "").trim();
  if (!isResendConfigured()) {
    return { ok: false, error: "resend_not_configured", code: "resend_not_configured" };
  }
  if (!to || !subject || !text) {
    return { ok: false, error: "invalid_email_payload", code: "invalid_payload" };
  }

  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: SUPPORT_EMAIL_FROM,
        to: [to],
        reply_to: SUPPORT_EMAIL_REPLY_TO,
        subject,
        text,
        ...(html ? { html } : {}),
      }),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      return {
        ok: false,
        error: data?.message || data?.error || `Resend failed (${r.status})`,
        code: "resend_failed",
        status: r.status,
      };
    }
    return { ok: true, id: data?.id || null };
  } catch (e) {
    return { ok: false, error: e?.message || "resend_request_failed", code: "resend_failed" };
  }
}

module.exports = {
  isResendConfigured,
  sendSupportEmail,
  SUPPORT_EMAIL_FROM,
  SUPPORT_EMAIL_REPLY_TO,
};
