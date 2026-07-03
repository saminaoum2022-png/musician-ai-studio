/** Detect RTL user text (primarily Arabic) and apply direction + alignment. */

const ARABIC_SCRIPT_RE =
  /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;
const LATIN_LETTER_RE = /[A-Za-z\u00C0-\u024F\u1E00-\u1EFF]/;

/** True when Arabic script letters outnumber Latin letters (emojis/punct ignored). */
export function isPrimarilyArabic(text) {
  const s = String(text || "");
  let arabic = 0;
  let latin = 0;
  for (const ch of s) {
    if (ARABIC_SCRIPT_RE.test(ch)) arabic += 1;
    else if (LATIN_LETTER_RE.test(ch)) latin += 1;
  }
  if (arabic === 0) return false;
  return arabic >= latin;
}

export function userTextHtml(text, { tag = "span", className = "", escapeHtml = (s) => String(s) } = {}) {
  const raw = String(text || "");
  const rtl = isPrimarilyArabic(raw);
  const cls = [className, rtl ? "userTextBidi--rtl" : ""].filter(Boolean).join(" ");
  const classAttr = cls ? ` class="${cls}"` : "";
  const dirAttr = rtl ? ' dir="rtl"' : "";
  return `<${tag}${classAttr}${dirAttr}>${escapeHtml(raw)}</${tag}>`;
}

export function applyUserTextBidi(el, text) {
  if (!el) return;
  const raw = String(text || "");
  el.textContent = raw;
  const rtl = isPrimarilyArabic(raw);
  el.dir = rtl ? "rtl" : "";
  el.classList.toggle("userTextBidi--rtl", rtl);
}

export function applyUserTextInputDir(el) {
  if (!el) return;
  const rtl = isPrimarilyArabic(el.value);
  el.dir = rtl ? "rtl" : "";
  el.classList.toggle("userTextBidi--rtl", rtl);
}
