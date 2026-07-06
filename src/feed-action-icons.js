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

/** Gift — minimal present (interaction bar). */
export function feedActIconGift(klass = "followActActIco followActActIco--gift") {
  const cls = String(klass || "followActActIco followActActIco--gift").trim() || "followActActIco followActActIco--gift";
  return `<svg class="${cls}" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6.4 9.3H17.6C18.35 9.3 18.9 9.85 18.9 10.6V18.2C18.9 19.2 18.1 20 17.1 20H6.9C5.9 20 5.1 19.2 5.1 18.2V10.6C5.1 9.85 5.65 9.3 6.4 9.3Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M5 7.2H19V10H5V7.2Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M12 7.2C10.9 5.4 9.85 4.4 8.75 4.4C7.75 4.4 7.1 5.05 7.1 5.9C7.1 6.75 7.85 7.2 8.9 7.2H12Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M12 7.2C13.1 5.4 14.15 4.4 15.25 4.4C16.25 4.4 16.9 5.05 16.9 5.9C16.9 6.75 16.15 7.2 15.1 7.2H12Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}

/** Analytics — filled bar chart (interaction bar, owner-only). */
export function feedActIconAnalytics(klass = "followActActIco followActActIco--analytics") {
  const cls = String(klass || "followActActIco followActActIco--analytics").trim() || "followActActIco followActActIco--analytics";
  return `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 13h3v7H4zM10.5 8h3v12h-3zM17 4h3v16h-3z"/></svg>`;
}
