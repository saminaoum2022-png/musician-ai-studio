/**
 * GET  /api/admin/support-email?userId=&templateId=  — preview template
 * POST /api/admin/support-email — send manual Pro lifecycle email (Resend)
 *
 * Owner / Admin + Support only.
 */

const { verifyUser, sendJson, setCors, readJsonBody } = require("../_lib/credits-auth");
const {
  verifyAdmin,
  adminForbidden,
  adminUnauthorized,
} = require("../_lib/admin-auth");
const {
  SUPPORT_TEMPLATES,
  templateMeta,
  buildSupportEmailPreview,
  suggestSupportEmailTemplate,
} = require("../_lib/support-email");
const { isResendConfigured, sendSupportEmail } = require("../_lib/resend-mail");
const { fetchProSubscriptionForUser } = require("../_lib/pro-subscription");

const SUPABASE_URL = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

async function serviceFetch(path) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return { ok: false, data: [] };
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      },
    });
    const data = await r.json().catch(() => []);
    return { ok: r.ok, data, status: r.status };
  } catch {
    return { ok: false, data: [] };
  }
}

async function serviceInsert(table, row) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return { ok: false };
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify(row),
    });
    const data = await r.json().catch(() => null);
    return { ok: r.ok, data, status: r.status };
  } catch {
    return { ok: false, data: null };
  }
}

async function fetchAuthEmail(userId) {
  const uid = String(userId || "").trim();
  if (!uid || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return "";
  try {
    const r = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${encodeURIComponent(uid)}`, {
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      },
    });
    if (!r.ok) return "";
    const data = await r.json().catch(() => ({}));
    return String(data?.email || "").trim().toLowerCase();
  } catch {
    return "";
  }
}

async function fetchSupportEmailLogs(userId, limit = 20) {
  const uid = String(userId || "").trim();
  if (!uid) return [];
  const res = await serviceFetch(
    `support_email_log?select=id,template_id,recipient_email,subject,sent_by_email,created_at&user_id=eq.${encodeURIComponent(uid)}&order=created_at.desc&limit=${limit}`,
  );
  return (Array.isArray(res.data) ? res.data : []).map((row) => ({
    id: row.id,
    templateId: row.template_id,
    recipientEmail: row.recipient_email,
    subject: row.subject,
    sentByEmail: row.sent_by_email,
    sentAt: row.created_at,
  }));
}

async function fetchBillingEventsBrief(userId, limit = 30) {
  const uid = String(userId || "").trim();
  if (!uid) return [];
  const res = await serviceFetch(
    `billing_events?select=event_type,created_at,plan_id&user_id=eq.${encodeURIComponent(uid)}&order=created_at.desc&limit=${limit}`,
  );
  return (Array.isArray(res.data) ? res.data : []).map((row) => ({
    eventType: row.event_type,
    createdAt: row.created_at,
    planId: row.plan_id,
  }));
}

function mapSubscriptionRow(row) {
  if (!row) return null;
  return {
    planId: row.plan_id,
    status: row.status,
    provider: row.provider,
    currentPeriodEnd: row.current_period_end,
    cancelAtPeriodEnd: Boolean(row.cancel_at_period_end),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    providerSubscriptionId: row.provider_subscription_id,
  };
}

async function loadUserEmailContext(userId) {
  const uid = String(userId || "").trim();
  if (!uid) return null;

  const [subRes, email, emailLogs, billingEvents] = await Promise.all([
    serviceFetch(
      `pro_subscriptions?select=plan_id,status,provider,current_period_end,cancel_at_period_end,created_at,updated_at,provider_subscription_id&user_id=eq.${encodeURIComponent(uid)}&limit=1`,
    ),
    fetchAuthEmail(uid),
    fetchSupportEmailLogs(uid),
    fetchBillingEventsBrief(uid),
  ]);

  const subRow = Array.isArray(subRes.data) && subRes.data[0] ? subRes.data[0] : null;
  const subscription = mapSubscriptionRow(subRow);
  const suggestedTemplateId = subscription
    ? suggestSupportEmailTemplate({ subscription, emailLogs, billingEvents })
    : null;

  return {
    userId: uid,
    email,
    subscription,
    emailLogs,
    billingEvents,
    suggestedTemplateId,
    resendConfigured: isResendConfigured(),
  };
}

module.exports = async function handler(req, res) {
  setCors(res, req);
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    return res.end();
  }

  const admin = await verifyAdmin(req, { requireSendSupportEmail: true });
  if (!admin) {
    const user = await verifyUser(req);
    if (!user) return adminUnauthorized(res);
    return adminForbidden(res, "Support email requires Owner / Admin or Support role.");
  }

  try {
    if (req.method === "GET") {
      const url = new URL(req.url || "", "http://localhost");
      const userId = String(url.searchParams.get("userId") || "").trim();
      const templateId = String(url.searchParams.get("templateId") || "").trim();
      if (!userId) {
        return sendJson(res, 400, { error: "userId required" });
      }

      const ctx = await loadUserEmailContext(userId);
      if (!ctx?.email) {
        return sendJson(res, 404, { error: "User email not found" });
      }
      if (!ctx.subscription) {
        return sendJson(res, 404, { error: "No Pro subscription on file for this user." });
      }

      const pickId = templateId || ctx.suggestedTemplateId || SUPPORT_TEMPLATES[0]?.id;
      const preview = buildSupportEmailPreview({
        templateId: pickId,
        subscription: ctx.subscription,
        billingEvents: ctx.billingEvents,
      });
      if (!preview) {
        return sendJson(res, 400, { error: "Unknown template" });
      }

      return sendJson(res, 200, {
        ok: true,
        userId: ctx.userId,
        email: ctx.email,
        subscription: ctx.subscription,
        suggestedTemplateId: ctx.suggestedTemplateId,
        emailLogs: ctx.emailLogs,
        templates: SUPPORT_TEMPLATES,
        resendConfigured: ctx.resendConfigured,
        preview,
      });
    }

    if (req.method === "POST") {
      const body = await readJsonBody(req);
      const userId = String(body?.userId || "").trim();
      const templateId = String(body?.templateId || "").trim();
      const subject = String(body?.subject || "").trim();
      const text = String(body?.text || body?.bodyText || "").trim();
      const html = String(body?.html || body?.bodyHtml || "").trim();

      if (!userId || !templateId || !subject || !text) {
        return sendJson(res, 400, {
          error: "userId, templateId, subject, and text are required",
        });
      }
      if (!templateMeta(templateId)) {
        return sendJson(res, 400, { error: "Unknown templateId" });
      }
      if (!isResendConfigured()) {
        return sendJson(res, 503, {
          error: "Resend is not configured. Set RESEND_API_KEY and verify support@ domain.",
          code: "resend_not_configured",
        });
      }

      const ctx = await loadUserEmailContext(userId);
      if (!ctx?.email) {
        return sendJson(res, 404, { error: "User email not found" });
      }

      const sendResult = await sendSupportEmail({
        to: ctx.email,
        subject,
        text,
        html: html || undefined,
      });
      if (!sendResult.ok) {
        return sendJson(res, sendResult.status || 502, {
          error: sendResult.error || "Could not send email",
          code: sendResult.code || "send_failed",
        });
      }

      const logRes = await serviceInsert("support_email_log", {
        user_id: userId,
        template_id: templateId,
        recipient_email: ctx.email,
        subject,
        sent_by_user_id: admin.userId,
        sent_by_email: admin.email,
        provider_message_id: sendResult.id || null,
      });

      return sendJson(res, 200, {
        ok: true,
        messageId: sendResult.id || null,
        recipient: ctx.email,
        templateId,
        logged: Boolean(logRes.ok),
      });
    }

    res.setHeader("Allow", "GET, POST, OPTIONS");
    return sendJson(res, 405, { error: "Method not allowed" });
  } catch (e) {
    return sendJson(res, 500, { error: e?.message || String(e) });
  }
};
