/**
 * GET   /api/admin/support-inbox — list or fetch one message
 * PATCH /api/admin/support-inbox — mark read / unread
 * POST  /api/admin/support-inbox — sync recent mail from Resend API
 *
 * Owner / Admin + Support only.
 */

const { sendJson, setCors, readJsonBody } = require("../_lib/credits-auth");
const {
  verifyAdmin,
  adminForbidden,
  adminUnauthorized,
} = require("../_lib/admin-auth");
const {
  isResendInboundConfigured,
  listReceivedEmails,
  ingestReceivedEmail,
  mapDbRow,
} = require("../_lib/resend-inbound");

const SUPABASE_URL = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

async function serviceFetch(path, { method = "GET", body, prefer } = {}) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return { ok: false, data: null, headers: null };
  const headers = {
    apikey: SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
  };
  if (body != null) headers["Content-Type"] = "application/json";
  if (prefer) headers.Prefer = prefer;
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
      method,
      headers,
      body: body != null ? JSON.stringify(body) : undefined,
    });
    const data = await r.json().catch(() => null);
    return { ok: r.ok, data, status: r.status, headers: r.headers };
  } catch {
    return { ok: false, data: null, headers: null };
  }
}

async function fetchMessageById(id) {
  const mid = String(id || "").trim();
  if (!mid) return null;
  const res = await serviceFetch(
    `support_inbound_messages?select=*&id=eq.${encodeURIComponent(mid)}&limit=1`,
  );
  const row = Array.isArray(res.data) && res.data[0] ? res.data[0] : null;
  return mapDbRow(row);
}

async function listMessages({ limit = 50, offset = 0, unreadOnly = false, q = "" } = {}) {
  const lim = Math.min(Math.max(Number(limit) || 50, 1), 100);
  const off = Math.max(Number(offset) || 0, 0);
  const params = [
    "select=id,resend_email_id,from_email,from_name,to_emails,subject,received_at,is_read,matched_user_id,attachments",
    "order=received_at.desc",
    `limit=${lim}`,
    `offset=${off}`,
  ];
  if (unreadOnly) params.push("is_read=eq.false");
  const term = String(q || "").trim().toLowerCase();
  if (term) {
    const enc = encodeURIComponent(term);
    params.push(`or=(from_email.ilike.*${enc}*,subject.ilike.*${enc}*)`);
  }
  const res = await serviceFetch(`support_inbound_messages?${params.join("&")}`);
  const rows = Array.isArray(res.data) ? res.data : [];
  return rows.map(mapDbRow).filter(Boolean);
}

async function countUnread() {
  const res = await serviceFetch(
    "support_inbound_messages?select=id&is_read=eq.false",
    { prefer: "count=exact" },
  );
  const range = res.headers?.get ? res.headers.get("content-range") : "";
  const m = String(range || "").match(/\/(\d+)$/);
  if (m) return Number(m[1]) || 0;
  return Array.isArray(res.data) ? res.data.length : 0;
}

async function fetchSentById(id) {
  const mid = String(id || "").trim();
  if (!mid) return null;
  const res = await serviceFetch(
    `support_email_log?select=id,template_id,recipient_email,subject,sent_by_email,sent_by_user_id,user_id,created_at&id=eq.${encodeURIComponent(mid)}&limit=1`,
  );
  const row = Array.isArray(res.data) && res.data[0] ? res.data[0] : null;
  if (!row) return null;
  return {
    id: row.id,
    templateId: row.template_id,
    toEmail: row.recipient_email,
    subject: row.subject,
    sentByEmail: row.sent_by_email,
    userId: row.user_id,
    sentAt: row.created_at,
  };
}

async function listSentMessages({ limit = 50, offset = 0, q = "" } = {}) {
  const lim = Math.min(Math.max(Number(limit) || 50, 1), 100);
  const off = Math.max(Number(offset) || 0, 0);
  const params = [
    "select=id,template_id,recipient_email,subject,sent_by_email,user_id,created_at",
    "order=created_at.desc",
    `limit=${lim}`,
    `offset=${off}`,
  ];
  const term = String(q || "").trim().toLowerCase();
  if (term) {
    const enc = encodeURIComponent(term);
    params.push(`or=(recipient_email.ilike.*${enc}*,subject.ilike.*${enc}*)`);
  }
  const res = await serviceFetch(`support_email_log?${params.join("&")}`);
  const rows = Array.isArray(res.data) ? res.data : [];
  return rows.map((row) => ({
    id: row.id,
    templateId: row.template_id,
    toEmail: row.recipient_email,
    subject: row.subject,
    sentByEmail: row.sent_by_email,
    userId: row.user_id,
    sentAt: row.created_at,
  }));
}

async function markRead(id, isRead) {
  const mid = String(id || "").trim();
  if (!mid) return null;
  const res = await serviceFetch(
    `support_inbound_messages?id=eq.${encodeURIComponent(mid)}`,
    {
      method: "PATCH",
      body: { is_read: Boolean(isRead) },
      prefer: "return=representation",
    },
  );
  const row = Array.isArray(res.data) && res.data[0] ? res.data[0] : null;
  return mapDbRow(row);
}

async function syncFromResend({ limit = 30 } = {}) {
  const lim = Math.min(Math.max(Number(limit) || 30, 1), 100);
  const listed = await listReceivedEmails({ limit: lim });
  if (!listed.ok) {
    return { ok: false, error: listed.error || "Could not list received emails" };
  }
  const items = Array.isArray(listed.data?.data) ? listed.data.data : [];
  let ingested = 0;
  let skipped = 0;
  const errors = [];
  for (const item of items) {
    const emailId = String(item?.id || "").trim();
    if (!emailId) continue;
    const result = await ingestReceivedEmail(emailId);
    if (!result.ok) {
      errors.push({ emailId, error: result.error });
      continue;
    }
    if (result.inserted) ingested += 1;
    else skipped += 1;
  }
  return {
    ok: true,
    scanned: items.length,
    ingested,
    skipped,
    errors: errors.slice(0, 5),
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
    const { verifyUser } = require("../_lib/credits-auth");
    const user = await verifyUser(req);
    if (!user) return adminUnauthorized(res);
    return adminForbidden(res, "Support inbox requires Owner / Admin or Support role.");
  }

  try {
    if (req.method === "GET") {
      const url = new URL(req.url || "", "http://localhost");
      const folder = String(url.searchParams.get("folder") || "inbox").trim().toLowerCase();
      const id = String(url.searchParams.get("id") || "").trim();
      const markReadFlag = url.searchParams.get("markRead") === "1";

      if (folder === "sent") {
        if (id) {
          const sent = await fetchSentById(id);
          if (!sent) return sendJson(res, 404, { error: "Message not found" });
          return sendJson(res, 200, { ok: true, sent });
        }
        const limit = Number(url.searchParams.get("limit") || 50);
        const offset = Number(url.searchParams.get("offset") || 0);
        const q = String(url.searchParams.get("q") || "").trim();
        const sentMessages = await listSentMessages({ limit, offset, q });
        return sendJson(res, 200, { ok: true, sentMessages });
      }

      if (id) {
        const message = await fetchMessageById(id);
        if (!message) return sendJson(res, 404, { error: "Message not found" });
        if (markReadFlag && !message.isRead) {
          const updated = await markRead(id, true);
          return sendJson(res, 200, {
            ok: true,
            message: updated || message,
            resendInboundConfigured: isResendInboundConfigured(),
          });
        }
        return sendJson(res, 200, {
          ok: true,
          message,
          resendInboundConfigured: isResendInboundConfigured(),
        });
      }

      const limit = Number(url.searchParams.get("limit") || 50);
      const offset = Number(url.searchParams.get("offset") || 0);
      const unreadOnly = url.searchParams.get("unreadOnly") === "1";
      const q = String(url.searchParams.get("q") || "").trim();
      const [messages, unreadCount] = await Promise.all([
        listMessages({ limit, offset, unreadOnly, q }),
        countUnread(),
      ]);

      return sendJson(res, 200, {
        ok: true,
        messages,
        unreadCount,
        resendInboundConfigured: isResendInboundConfigured(),
      });
    }

    if (req.method === "PATCH") {
      const body = await readJsonBody(req);
      const id = String(body?.id || "").trim();
      if (!id) return sendJson(res, 400, { error: "id required" });
      const isRead = body?.isRead != null ? Boolean(body.isRead) : true;
      const message = await markRead(id, isRead);
      if (!message) return sendJson(res, 404, { error: "Message not found" });
      return sendJson(res, 200, { ok: true, message });
    }

    if (req.method === "POST") {
      const body = await readJsonBody(req);
      const action = String(body?.action || "sync").trim().toLowerCase();
      if (action !== "sync") {
        return sendJson(res, 400, { error: "Unknown action" });
      }
      if (!isResendInboundConfigured()) {
        return sendJson(res, 503, {
          error: "Resend inbound not configured. Set RESEND_API_KEY and run support_inbound_messages SQL.",
          code: "resend_inbound_not_configured",
        });
      }
      const result = await syncFromResend({ limit: body?.limit });
      if (!result.ok) {
        return sendJson(res, 502, { error: result.error || "Sync failed" });
      }
      const unreadCount = await countUnread();
      return sendJson(res, 200, { ok: true, ...result, unreadCount });
    }

    res.setHeader("Allow", "GET, POST, PATCH, OPTIONS");
    return sendJson(res, 405, { error: "Method not allowed" });
  } catch (e) {
    return sendJson(res, 500, { error: e?.message || String(e) });
  }
};
