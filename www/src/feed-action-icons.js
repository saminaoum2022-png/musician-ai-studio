/**
 * Custom SVG icons for the post interaction bar.
 */

/** Comment — speech bubble with ellipsis (interaction bar). */
export function feedActIconComment(klass = "followActActIco followActActIco--comment") {
  const cls = String(klass || "followActActIco followActActIco--comment").trim() || "followActActIco followActActIco--comment";
  return `<svg class="${cls}" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M20 11.35c0 4.04-3.62 7.32-8.08 7.32-1.45 0-2.82-.35-4-.97L4.1 19.25l1.24-3.55C4.4 14.48 3.84 12.98 3.84 11.35c0-4.04 3.62-7.32 8.08-7.32S20 7.31 20 11.35Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M8.7 11.45h.01M12 11.45h.01M15.3 11.45h.01" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}

/** Like — outlined heart (interaction bar). */
export function feedActIconLike(klass = "followActActIco followActActIco--like") {
  const cls = String(klass || "followActActIco followActActIco--like").trim() || "followActActIco followActActIco--like";
  return `<svg class="${cls}" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 20.2C9.4 17.9 5 14.2 4.05 10.35C3.35 7.5 5.2 4.8 8.05 4.8C9.75 4.8 11.05 5.65 12 7.05C12.95 5.65 14.25 4.8 15.95 4.8C18.8 4.8 20.65 7.5 19.95 10.35C19 14.2 14.6 17.9 12 20.2Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}

/** Plays — rounded play triangle (interaction bar). */
export function feedActIconPlays(klass = "followActActIco followActActIco--plays") {
  const cls = String(klass || "followActActIco followActActIco--plays").trim() || "followActActIco followActActIco--plays";
  return `<svg class="${cls}" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M7.5 5.6C7.5 4.55 8.65 3.9 9.55 4.45L18.05 9.85C18.9 10.4 18.9 11.6 18.05 12.15L9.55 17.55C8.65 18.1 7.5 17.45 7.5 16.4V5.6Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}

/** Gift — minimal present (interaction bar). Bow loops ~12% smaller for mobile legibility. */
export function feedActIconGift(klass = "followActActIco followActActIco--gift") {
  const cls = String(klass || "followActActIco followActActIco--gift").trim() || "followActActIco followActActIco--gift";
  return `<svg class="${cls}" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6.5 9.5H17.5C18.3 9.5 19 10.2 19 11V17.2C19 18.75 17.75 20 16.2 20H7.8C6.25 20 5 18.75 5 17.2V11C5 10.2 5.7 9.5 6.5 9.5Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M4.8 7.2H19.2" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M12 7.2C11.12 6.02 10.24 5.31 9.36 5.31C8.62 5.31 8.02 5.72 8.02 6.02C8.02 6.34 8.63 7.2 9.74 7.2H12Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M12 7.2C12.88 6.02 13.76 5.31 14.64 5.31C15.3 5.31 15.98 5.72 15.98 6.02C15.98 6.34 15.37 7.2 14.26 7.2H12Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}

/** Analytics — filled bar chart (interaction bar, owner-only). */
export function feedActIconAnalytics(klass = "followActActIco followActActIco--analytics") {
  const cls = String(klass || "followActActIco followActActIco--analytics").trim() || "followActActIco followActActIco--analytics";
  return `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 13h3v7H4zM10.5 8h3v12h-3zM17 4h3v16h-3z"/></svg>`;
}
