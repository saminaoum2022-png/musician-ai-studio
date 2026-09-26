/**
 * Custom SVG icons for the post interaction bar.
 */

/** Comment — speech bubble (interaction bar). */
export function feedActIconComment(klass = "followActActIco followActActIco--comment") {
  const cls = String(klass || "followActActIco followActActIco--comment").trim() || "followActActIco followActActIco--comment";
  return `<svg class="${cls}" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6.6 5.5 H17.4 C19.1 5.5 20.5 6.9 20.5 8.6 V12.4 C20.5 14.1 19.1 15.5 17.4 15.5 H10.6 L7.0 18.6 V15.5 H6.6 C4.9 15.5 3.5 14.1 3.5 12.4 V8.6 C3.5 6.9 4.9 5.5 6.6 5.5Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}

/** Like — outlined heart (interaction bar). Liked state filled via CSS (.isLiked). */
export function feedActIconLike(klass = "followActActIco followActActIco--like") {
  const cls = String(klass || "followActActIco followActActIco--like").trim() || "followActActIco followActActIco--like";
  return `<svg class="${cls}" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 20 C11.2 19.3 10.2 18.4 9.2 17.5 C6.4 15.1 4.5 13.1 4.5 9.9 C4.5 7.3 6.3 5.5 8.8 5.5 C10.2 5.5 11.3 6.1 12 7.2 C12.7 6.1 13.8 5.5 15.2 5.5 C17.7 5.5 19.5 7.3 19.5 9.9 C19.5 13.1 17.6 15.1 14.8 17.5 C13.8 18.4 12.8 19.3 12 20Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}

/** Plays — rounded play triangle (interaction bar). */
export function feedActIconPlays(klass = "followActActIco followActActIco--plays") {
  const cls = String(klass || "followActActIco followActActIco--plays").trim() || "followActActIco followActActIco--plays";
  return `<svg class="${cls}" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M8 6.7 C8 5.6 9.2 4.9 10.15 5.5 L17.25 10 C18.2 10.6 18.2 12 17.25 12.6 L10.15 17.1 C9.2 17.7 8 17 8 15.9 V6.7Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}

/** Gift — present outline (interaction bar). Tint via CSS when viewer already sent (.isGifted). */
export function feedActIconGift(klass = "followActActIco followActActIco--gift") {
  const cls = String(klass || "followActActIco followActActIco--gift").trim() || "followActActIco followActActIco--gift";
  return `<svg class="${cls}" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="5" y="10" width="14" height="9" rx="2.2" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><rect x="4" y="7.2" width="16" height="3" rx="1.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M12 7.2V19" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M12 7.2 C11.3 5.6 10.2 4.5 8.9 4.5 C7.9 4.5 7.2 5.2 7.2 6 C7.2 6.8 7.9 7.2 9.3 7.2H12" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M12 7.2 C12.7 5.6 13.8 4.5 15.1 4.5 C16.1 4.5 16.8 5.2 16.8 6 C16.8 6.8 16.1 7.2 14.7 7.2H12" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}

/** Repost — circular arrows (interaction bar). */
export function feedActIconRepost(klass = "followActActIco followActActIco--repost") {
  const cls = String(klass || "followActActIco followActActIco--repost").trim() || "followActActIco followActActIco--repost";
  return `<svg class="${cls}" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M17 2l3 3-3 3V7H10a3.5 3.5 0 0 0-3.5 3.5v.5H5v-.5A5.5 5.5 0 0 1 10 5h7V2Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M7 22l-3-3 3-3v2h7a3.5 3.5 0 0 0 3.5-3.5v-.5h1.5v.5A5.5 5.5 0 0 1 14 22H7v-1Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}

/** Share — connected nodes (interaction bar). */
export function feedActIconShare(klass = "followActActIco followActActIco--share") {
  const cls = String(klass || "followActActIco followActActIco--share").trim() || "followActActIco followActActIco--share";
  return `<svg class="${cls}" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="17.5" cy="6.5" r="2.25" stroke="currentColor" stroke-width="2"/><circle cx="6.5" cy="12" r="2.25" stroke="currentColor" stroke-width="2"/><circle cx="17.5" cy="17.5" r="2.25" stroke="currentColor" stroke-width="2"/><path d="M8.6 10.9 L15.4 7.6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M8.6 13.1 L15.4 16.4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`;
}

/** Shuffle — intertwined curves (player transport). */
export function feedActIconShuffle(klass = "playerAuxIco") {
  const cls = String(klass || "playerAuxIco").trim() || "playerAuxIco";
  return `<svg class="${cls}" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M18 4l3 3-3 3" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M18 20l3-3-3-3" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M3 7h3a5 5 0 0 1 5 5 5 5 0 0 0 5 5h5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M21 7h-5a5 5 0 0 0-5 5 5 5 0 0 1-5 5H3" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}

/** Analytics — simple bar chart (interaction bar, owner-only). */
export function feedActIconAnalytics(klass = "followActActIco followActActIco--analytics") {
  const cls = String(klass || "followActActIco followActActIco--analytics").trim() || "followActActIco followActActIco--analytics";
  return `<svg class="${cls}" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 19H19" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M7.5 16V11" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M12 16V7" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M16.5 16V9.5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`;
}

/* ---------------------------------------------------------------------
 * Post-row icons (Friends, profiles): one 24 grid, round caps, same optical size.
 * Stroke width and colour come from CSS so liked / gifted states can recolour them.
 * ------------------------------------------------------------------- */
function postIcon(klass, fallback, body) {
  const cls = String(klass || fallback).trim() || fallback;
  return `<svg class="${cls}" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" aria-hidden="true">${body}</svg>`;
}
export function postActIconLike(klass) {
  return postIcon(klass, "followActActIco followActActIco--like", '<path d="M12 20.2s-7.4-4.6-7.4-10.3A4.3 4.3 0 0 1 12 7.1a4.3 4.3 0 0 1 7.4 2.8c0 5.7-7.4 10.3-7.4 10.3z"/>');
}
export function postActIconComment(klass) {
  return postIcon(klass, "followActActIco followActActIco--comment", '<path d="M5 5.2h14a1.8 1.8 0 0 1 1.8 1.8v8.2a1.8 1.8 0 0 1-1.8 1.8h-7.2L7.4 20.6v-3.6H5a1.8 1.8 0 0 1-1.8-1.8V7A1.8 1.8 0 0 1 5 5.2z"/>');
}
export function postActIconRepost(klass) {
  return postIcon(klass, "followActActIco followActActIco--repost", '<path d="M16.5 3.5l3 3-3 3"/><path d="M4.5 11.5v-1.2A3.8 3.8 0 0 1 8.3 6.5h11.2"/><path d="M7.5 20.5l-3-3 3-3"/><path d="M19.5 12.5v1.2a3.8 3.8 0 0 1-3.8 3.8H4.5"/>');
}
export function postActIconGift(klass) {
  return postIcon(klass, "followActActIco followActActIco--gift", '<rect x="4" y="9.5" width="16" height="10.5" rx="2"/><path d="M12 9.5V20M4 14h16"/><path d="M12 9.5c-1.3-3.6-5-3.8-5-1.5 0 1.4 2.4 1.5 5 1.5zM12 9.5c1.3-3.6 5-3.8 5-1.5 0 1.4-2.4 1.5-5 1.5z"/>');
}
export function postActIconPlays(klass) {
  return postIcon(klass, "followActActIco followActActIco--plays", '<path d="M8.2 6.2v11.6a.8.8 0 0 0 1.2.7l9-5.8a.8.8 0 0 0 0-1.4l-9-5.8a.8.8 0 0 0-1.2.7z"/>');
}
export function postActIconAnalytics(klass) {
  return postIcon(klass, "followActActIco followActActIco--analytics", '<path d="M5 20h14"/><path d="M8 16.5v-5M12 16.5V7M16 16.5v-8"/>');
}
