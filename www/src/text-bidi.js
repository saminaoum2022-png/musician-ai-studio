/** Detect RTL user text (primarily Arabic) and apply direction + alignment. */

const ARABIC_SCRIPT_RE =
  /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;
const LATIN_LETTER_RE = /[A-Za-z\u00C0-\u024F\u1E00-\u1EFF]/;
const BIDI_CONTROL_RE = /[\u200E\u200F\u202A-\u202E\u2066-\u2069\u061C]/g;

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

/** Strip invisible bidi marks that often break pasted Arabic on iOS. */
export function stripBidiControlChars(text) {
  return String(text || "").replace(BIDI_CONTROL_RE, "");
}

/** Normalize clipboard lyrics before insert. */
export function normalizePastedUserText(text) {
  return stripBidiControlChars(text)
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n");
}

/** Create lyrics field: dominant-script dir + per-line plaintext rendering in CSS. */
export function applyLyricsInputBidi(el) {
  if (!el) return;
  const raw = String(el.value || "");
  if (!raw.trim()) {
    el.dir = "auto";
    el.removeAttribute("data-text-dir");
    return;
  }
  const rtl = isPrimarilyArabic(raw);
  el.dir = rtl ? "rtl" : "ltr";
  el.dataset.textDir = rtl ? "rtl" : "ltr";
}

export function insertTextAtInputSelection(el, text) {
  if (!el) return;
  const insert = String(text || "");
  const start = typeof el.selectionStart === "number" ? el.selectionStart : el.value.length;
  const end = typeof el.selectionEnd === "number" ? el.selectionEnd : el.value.length;
  const before = String(el.value || "").slice(0, start);
  const after = String(el.value || "").slice(end);
  el.value = before + insert + after;
  const pos = start + insert.length;
  try { el.setSelectionRange(pos, pos); } catch {}
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
  const raw = String(el.value || "");
  if (!raw.trim()) {
    el.dir = "auto";
    el.removeAttribute("data-text-dir");
    el.classList.remove("userTextBidi--rtl");
    return;
  }
  const rtl = isPrimarilyArabic(raw);
  el.dir = rtl ? "rtl" : "ltr";
  el.dataset.textDir = rtl ? "rtl" : "ltr";
  el.classList.toggle("userTextBidi--rtl", rtl);
}
