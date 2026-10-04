/**
 * Branded HTML + plain-text wrapper for support / account emails sent from the admin dashboard.
 * Table layout, inline CSS, dark header (logo stays readable), light/dark body for Gmail / Apple Mail / Outlook.
 * Transactional only: no marketing / unsubscribe handling here.
 */

const SITE_ORIGIN = String(process.env.EMAIL_ASSET_ORIGIN || "https://www.nabadai.com").replace(/\/$/, "");
const LOGO_URL = `${SITE_ORIGIN}/assets/email/nabad-email-logo.png`;
const SUPPORT_ADDRESS = "support@nabadai.com";
const NAME_FALLBACK = "music maker";

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Replace {{name}} (any spacing / case). A missing or email-like name falls back to "music maker". */
function cleanDisplayName(raw) {
  const n = String(raw ?? "").trim();
  if (!n || n.includes("@")) return NAME_FALLBACK;
  return n.slice(0, 40);
}

function fillName(str, name) {
  const who = cleanDisplayName(name);
  return String(str ?? "").replace(/\{\{\s*name\s*\}\}/gi, who);
}

function safeHttpUrl(raw) {
  const s = String(raw ?? "").trim();
  if (!/^https?:\/\//i.test(s)) return "";
  try {
    const u = new URL(s);
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : "";
  } catch {
    return "";
  }
}

function linkifyEscaped(escaped) {
  return escaped.replace(/(https?:\/\/[^\s<]+[^\s<.,;:!?)\]])/g, (url) => {
    const href = safeHttpUrl(url.replace(/&amp;/g, "&"));
    if (!href) return url;
    return `<a href="${escapeHtml(href)}" style="color:#7c5cff;text-decoration:underline;">${url}</a>`;
  });
}

function paragraphsHtml(text) {
  const blocks = String(text || "")
    .replace(/\r\n/g, "\n")
    .split(/\n{2,}/)
    .map((b) => b.trim())
    .filter(Boolean);
  return blocks
    .map((b) => {
      const inner = linkifyEscaped(escapeHtml(b)).replace(/\n/g, "<br>");
      return `<p class="nbText" style="margin:0 0 16px 0;font-size:16px;line-height:1.6;color:#1b2030;">${inner}</p>`;
    })
    .join("");
}

function ctaHtml(label, url) {
  const href = safeHttpUrl(url);
  const text = String(label || "").trim().slice(0, 60);
  if (!href || !text) return "";
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 22px 0;">
  <tr>
    <td align="center" bgcolor="#7c5cff" style="border-radius:12px;background-color:#7c5cff;background-image:linear-gradient(148deg,#23d5ab 0%,#2ec4b8 34%,#6b78e8 72%,#7c5cff 100%);">
      <a href="${escapeHtml(href)}" target="_blank" style="display:inline-block;padding:14px 28px;font-family:Arial,Helvetica,sans-serif;font-size:16px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:12px;">${escapeHtml(text)}</a>
    </td>
  </tr>
</table>`;
}

/**
 * @param {{ subject: string, text: string, ctaLabel?: string, ctaUrl?: string }} opts
 * @returns {{ html: string, text: string }}
 */
function renderBrandedEmail(opts) {
  const subject = String(opts?.subject || "").trim();
  const bodyText = String(opts?.text || "").trim();
  const ctaLabel = String(opts?.ctaLabel || "").trim();
  const ctaUrl = safeHttpUrl(opts?.ctaUrl);
  const hasCta = Boolean(ctaLabel && ctaUrl);

  const preheader = bodyText.replace(/\s+/g, " ").slice(0, 110);

  const html = `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>${escapeHtml(subject)}</title>
<style>
  body, table, td, a { -webkit-text-size-adjust:100%; -ms-text-size-adjust:100%; }
  img { border:0; outline:none; text-decoration:none; -ms-interpolation-mode:bicubic; }
  @media only screen and (max-width:620px) {
    .nbWrap { width:100% !important; }
    .nbPad { padding-left:20px !important; padding-right:20px !important; }
    .nbTitle { font-size:22px !important; }
  }
  @media (prefers-color-scheme: dark) {
    .nbOuter { background-color:#05070d !important; }
    .nbCard { background-color:#11151f !important; }
    .nbTitle { color:#f2f5fb !important; }
    .nbText { color:#e3e8f3 !important; }
    .nbMuted { color:#9aa3b8 !important; }
    .nbFooter { background-color:#0b0e16 !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background-color:#eef0f6;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${escapeHtml(preheader)}</div>
<table role="presentation" class="nbOuter" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#eef0f6" style="background-color:#eef0f6;">
  <tr>
    <td align="center" style="padding:24px 12px;">
      <table role="presentation" class="nbWrap" width="560" cellpadding="0" cellspacing="0" border="0" style="width:560px;max-width:560px;">
        <tr>
          <td align="center" bgcolor="#05070d" style="background-color:#05070d;padding:26px 24px;border-radius:16px 16px 0 0;">
            <img src="${LOGO_URL}" width="170" alt="NabadAi" style="display:block;width:170px;max-width:100%;height:auto;margin:0 auto;">
          </td>
        </tr>
        <tr>
          <td class="nbCard nbPad" bgcolor="#ffffff" style="background-color:#ffffff;padding:30px 32px 14px 32px;font-family:Arial,Helvetica,sans-serif;">
            <h1 class="nbTitle" style="margin:0 0 18px 0;font-size:24px;line-height:1.3;color:#10131d;font-family:Arial,Helvetica,sans-serif;">${escapeHtml(subject)}</h1>
            ${paragraphsHtml(bodyText)}
            ${hasCta ? ctaHtml(ctaLabel, ctaUrl) : ""}
          </td>
        </tr>
        <tr>
          <td class="nbFooter nbPad" bgcolor="#f6f7fb" style="background-color:#f6f7fb;padding:20px 32px 24px 32px;border-radius:0 0 16px 16px;font-family:Arial,Helvetica,sans-serif;">
            <p class="nbMuted" style="margin:0 0 6px 0;font-size:13px;line-height:1.5;color:#5d667c;"><strong>Nabad AI Music</strong> &middot; Dubai, UAE</p>
            <p class="nbMuted" style="margin:0 0 6px 0;font-size:13px;line-height:1.5;color:#5d667c;">Questions? Reply to this email or write to <a href="mailto:${SUPPORT_ADDRESS}" style="color:#7c5cff;text-decoration:underline;">${SUPPORT_ADDRESS}</a></p>
            <p class="nbMuted" style="margin:0;font-size:12px;line-height:1.5;color:#8a93a8;">You are receiving this message because you have a NabadAi account.</p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;

  const textParts = [subject, "", bodyText];
  if (hasCta) textParts.push("", `${ctaLabel}: ${ctaUrl}`);
  textParts.push(
    "",
    "--",
    "Nabad AI Music · Dubai, UAE",
    `Questions? Reply to this email or write to ${SUPPORT_ADDRESS}`,
    "You are receiving this message because you have a NabadAi account.",
  );

  return { html, text: textParts.join("\n") };
}

module.exports = {
  renderBrandedEmail,
  fillName,
  cleanDisplayName,
  safeHttpUrl,
  LOGO_URL,
};
