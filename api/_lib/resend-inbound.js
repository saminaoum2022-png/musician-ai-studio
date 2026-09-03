/**
 * Resend inbound (receiving) — webhook verify, fetch content, Supabase upsert.
 */

const crypto = require("crypto");

const RESEND_API_KEY = String(process.env.RESEND_API_KEY || "").trim();
const SUPABASE_URL = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const SUPPORT_INBOUND_FORWARD_TO = String(process.env.SUPPORT_INBOUND_FORWARD_TO || "").trim();
const SUPPORT_EMAIL_FROM = String(
  process.env.SUPPORT_EMAIL_FROM || "NabadAi Support <support@nabadai.com>",
).trim();

function isResendInboundConfigured() {
  return Boolean(RESEND_API_KEY && SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY);
}

function parseEmailAddress(raw) {
  const s = String(raw || "").trim();
  if (!s) return { email: "", name: "" };
  const angle = s.match(/^(.+?)\s*<([^>]+)>$/);
  if (angle) {
    return { name: angle[1].trim().replace(/^["']|["']$/g, ""), email: angle[2].trim().toLowerCase() };
  }
  return { email: s.toLowerCase(), name: "" };
}

function normalizeStringArray(val) {
  if (!Array.isArray(val)) return [];
  return val.map((v) => String(v || "").trim()).filter(Boolean);
}

async function resendApiRequest(path, { method = "GET", body } = {}) {
  if (!RESEND_API_KEY) return { ok: false, error: "resend_not_configured", status: 503 };
  try {
    const r = await fetch(`https://api.resend.com${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        Accept: "application/json",
        ...(body != null ? { "Content-Type": "application/json" } : {}),
      },
      body: body != null ? JSON.stringify(body) : undefined,
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      return {
        ok: false,
        error: data?.message || data?.error || `Resend failed (${r.status})`,
        status: r.status,
        data,
      };
    }
    return { ok: true, data };
  } catch (e) {
    return { ok: false, error: e?.message || "resend_request_failed", status: 502 };
  }
}

async function resendApiGet(path) {
  return resendApiRequest(path);
}

async function fetchReceivedEmail(emailId) {
  const id = String(emailId || "").trim();
  if (!id) return { ok: false, error: "email_id_required" };
  return resendApiGet(`/emails/receiving/${encodeURIComponent(id)}`);
}

async function listReceivedEmails({ limit = 20, after = "", before = "" } = {}) {
  const qs = new URLSearchParams();
  const lim = Math.min(Math.max(Number(limit) || 20, 1), 100);
  qs.set("limit", String(lim));
  if (after) qs.set("after", String(after).trim());
  if (before) qs.set("before", String(before).trim());
  return resendApiGet(`/emails/receiving?${qs}`);
}

async function serviceFetch(path, { method = "GET", body, prefer } = {}) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return { ok: false, data: null };
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
    return { ok: r.ok, data, status: r.status };
  } catch {
    return { ok: false, data: null };
  }
}

function headerValue(headers, name) {
  if (!headers || typeof headers !== "object") return "";
  const key = Object.keys(headers).find((k) => k.toLowerCase() === String(name).toLowerCase());
  return key ? String(headers[key] || "").trim() : "";
}

function mapInboundRow(email, { matchedUserId = null } = {}) {
  const fromParsed = parseEmailAddress(email?.from);
  const headers = email?.headers && typeof email.headers === "object" ? email.headers : null;
  const inReplyTo = headerValue(headers, "in-reply-to") || headerValue(headers, "In-Reply-To");
  const receivedAt = email?.created_at || new Date().toISOString();
  return {
    resend_email_id: String(email?.id || "").trim(),
    message_id: String(email?.message_id || "").trim() || null,
    in_reply_to: inReplyTo || null,
    from_email: fromParsed.email || String(email?.from || "").trim().toLowerCase(),
    from_name: fromParsed.name || null,
    to_emails: normalizeStringArray(email?.to),
    cc_emails: normalizeStringArray(email?.cc),
    subject: String(email?.subject || "").trim(),
    text_body: email?.text != null ? String(email.text) : null,
    html_body: email?.html != null ? String(email.html) : null,
    headers,
    attachments: Array.isArray(email?.attachments) ? email.attachments : [],
    received_at: receivedAt,
    matched_user_id: matchedUserId || null,
  };
}

async function resolveUserIdByEmail(email) {
  const normalized = String(email || "").trim().toLowerCase();
  if (!normalized || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return null;
  let page = 1;
  const perPage = 200;
  for (let guard = 0; guard < 20; guard += 1) {
    try {
      const r = await fetch(
        `${SUPABASE_URL}/auth/v1/admin/users?page=${page}&per_page=${perPage}`,
        {
          headers: {
            apikey: SUPABASE_SERVICE_ROLE_KEY,
            Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          },
        },
      );
      if (!r.ok) return null;
      const payload = await r.json().catch(() => ({}));
      const users = Array.isArray(payload?.users) ? payload.users : [];
      const hit = users.find((u) => String(u?.email || "").trim().toLowerCase() === normalized);
      if (hit?.id) return hit.id;
      if (users.length < perPage) break;
      page += 1;
    } catch {
      return null;
    }
  }
  return null;
}

async function upsertInboundMessage(row) {
  const resendId = String(row?.resend_email_id || "").trim();
  if (!resendId) return { ok: false, error: "missing_resend_email_id" };

  const existing = await serviceFetch(
    `support_inbound_messages?select=id,is_read&resend_email_id=eq.${encodeURIComponent(resendId)}&limit=1`,
  );
  const prev = Array.isArray(existing.data) && existing.data[0] ? existing.data[0] : null;

  if (prev?.id) {
    const patch = { ...row };
    delete patch.is_read;
    const res = await serviceFetch(
      `support_inbound_messages?id=eq.${encodeURIComponent(prev.id)}`,
      { method: "PATCH", body: patch, prefer: "return=representation" },
    );
    const updated = Array.isArray(res.data) && res.data[0] ? res.data[0] : null;
    return { ok: res.ok, row: updated, inserted: false };
  }

  const res = await serviceFetch("support_inbound_messages", {
    method: "POST",
    body: row,
    prefer: "return=representation",
  });
  const inserted = Array.isArray(res.data) && res.data[0] ? res.data[0] : null;
  return { ok: res.ok, row: inserted, inserted: true };
}

function inboundForwardTargets() {
  return SUPPORT_INBOUND_FORWARD_TO
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

/** Passthrough copy to Gmail (or other inbox) after Resend receives mail. */
async function forwardInboundCopy(email) {
  const targets = inboundForwardTargets();
  if (!targets.length || !email) return { ok: true, skipped: true, reason: "forward_not_configured" };

  const fromParsed = parseEmailAddress(email?.from);
  const replyTo = fromParsed.email || String(email?.from || "").trim();
  const subject = String(email?.subject || "").trim() || "(no subject)";
  const text = email?.text != null
    ? String(email.text)
    : String(email?.html || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  const html = email?.html != null ? String(email.html) : undefined;

  const payload = {
    from: SUPPORT_EMAIL_FROM,
    to: targets,
    reply_to: replyTo || undefined,
    subject,
    text: text || `Support message from ${replyTo || "unknown sender"}`,
    ...(html ? { html } : {}),
  };

  const sent = await resendApiRequest("/emails", { method: "POST", body: payload });
  if (!sent.ok) {
    return { ok: false, error: sent.error || "forward_failed", status: sent.status };
  }
  return { ok: true, skipped: false, messageId: sent.data?.id || null, targets };
}

async function ingestReceivedEmail(emailId, { forwardCopy = true } = {}) {
  const fetched = await fetchReceivedEmail(emailId);
  if (!fetched.ok) return fetched;
  const email = fetched.data;
  const fromParsed = parseEmailAddress(email?.from);
  const matchedUserId = fromParsed.email ? await resolveUserIdByEmail(fromParsed.email) : null;
  const row = mapInboundRow(email, { matchedUserId });
  const saved = await upsertInboundMessage(row);
  if (!saved.ok) {
    return { ok: false, error: "db_upsert_failed", details: saved };
  }

  let forward = { ok: true, skipped: true, reason: "duplicate" };
  if (forwardCopy && saved.inserted) {
    forward = await forwardInboundCopy(email);
  }

  return {
    ok: true,
    row: saved.row,
    inserted: saved.inserted,
    forward,
  };
}

/**
 * Svix-style webhook verification (Resend uses Svix headers).
 */
function verifySvixWebhook(rawBody, headers, secret) {
  const whSecret = String(secret || "").trim();
  if (!whSecret) return { ok: false, error: "webhook_secret_not_configured" };

  const svixId = String(headers?.["svix-id"] || headers?.["Svix-Id"] || "").trim();
  const svixTimestamp = String(headers?.["svix-timestamp"] || headers?.["Svix-Timestamp"] || "").trim();
  const svixSignature = String(headers?.["svix-signature"] || headers?.["Svix-Signature"] || "").trim();
  if (!svixId || !svixTimestamp || !svixSignature) {
    return { ok: false, error: "missing_svix_headers" };
  }

  const ts = Number(svixTimestamp);
  if (!Number.isFinite(ts)) return { ok: false, error: "invalid_svix_timestamp" };
  const ageSec = Math.abs(Math.floor(Date.now() / 1000) - ts);
  if (ageSec > 300) return { ok: false, error: "svix_timestamp_too_old" };

  const payload = Buffer.isBuffer(rawBody) ? rawBody.toString("utf8") : String(rawBody || "");
  const signedContent = `${svixId}.${svixTimestamp}.${payload}`;
  const secretPart = whSecret.startsWith("whsec_") ? whSecret.slice(6) : whSecret;
  let secretBytes;
  try {
    secretBytes = Buffer.from(secretPart, "base64");
  } catch {
    return { ok: false, error: "invalid_webhook_secret" };
  }

  const expected = crypto.createHmac("sha256", secretBytes).update(signedContent).digest("base64");
  const parts = svixSignature.split(" ");
  for (const part of parts) {
    const [version, sig] = part.split(",");
    if (version !== "v1" || !sig) continue;
    try {
      const a = Buffer.from(sig);
      const b = Buffer.from(expected);
      if (a.length === b.length && crypto.timingSafeEqual(a, b)) {
        return { ok: true };
      }
    } catch {
      /* try next */
    }
  }
  return { ok: false, error: "invalid_signature" };
}

function mapDbRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    resendEmailId: row.resend_email_id,
    messageId: row.message_id,
    inReplyTo: row.in_reply_to,
    fromEmail: row.from_email,
    fromName: row.from_name,
    toEmails: row.to_emails || [],
    ccEmails: row.cc_emails || [],
    subject: row.subject,
    textBody: row.text_body,
    htmlBody: row.html_body,
    headers: row.headers,
    attachments: row.attachments || [],
    receivedAt: row.received_at,
    isRead: Boolean(row.is_read),
    matchedUserId: row.matched_user_id,
    createdAt: row.created_at,
  };
}

module.exports = {
  isResendInboundConfigured,
  inboundForwardTargets,
  parseEmailAddress,
  fetchReceivedEmail,
  listReceivedEmails,
  ingestReceivedEmail,
  forwardInboundCopy,
  upsertInboundMessage,
  mapInboundRow,
  mapDbRow,
  verifySvixWebhook,
  resolveUserIdByEmail,
};
