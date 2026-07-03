/** Linkify @username tokens in user-generated text. */

import { isPrimarilyArabic } from "./text-bidi.js";
import { USERNAME_MAX_LENGTH } from "./profile-limits.js";
import { isScreenshotMode, screenshotHandle } from "./screenshot-mode.js";

const MENTION_HANDLE_RE = new RegExp(
  `@([a-z0-9_](?:[a-z0-9_.]{0,${USERNAME_MAX_LENGTH - 2}}[a-z0-9_])?)`,
  "gi",
);

function linkifyMentions(text, escapeHtml) {
  const raw = String(text || "");
  if (!raw.includes("@")) return escapeHtml(raw);
  let out = "";
  let last = 0;
  const re = new RegExp(MENTION_HANDLE_RE.source, "gi");
  let m;
  while ((m = re.exec(raw)) !== null) {
    out += escapeHtml(raw.slice(last, m.index));
    const rawHandle = String(m[1] || "");
    const handle = isScreenshotMode() ? screenshotHandle(rawHandle) : rawHandle.toLowerCase();
    const href = `#/u/${encodeURIComponent(handle)}`;
    out += `<a class="userMention" href="${escapeHtml(href)}" data-route-link="user">@${escapeHtml(handle)}</a>`;
    last = m.index + m[0].length;
  }
  out += escapeHtml(raw.slice(last));
  return out;
}

export function userTextWithMentionsHtml(text, { tag = "span", className = "", escapeHtml = (s) => String(s) } = {}) {
  const raw = String(text || "");
  const rtl = isPrimarilyArabic(raw);
  const cls = [className, rtl ? "userTextBidi--rtl" : "", "userTextWithMentions"].filter(Boolean).join(" ");
  const classAttr = cls ? ` class="${cls}"` : "";
  const dirAttr = rtl ? ' dir="rtl"' : "";
  return `<${tag}${classAttr}${dirAttr}>${linkifyMentions(raw, escapeHtml)}</${tag}>`;
}
