/** Simple stroke icons for Hum Track instruments (viewBox 0 0 24 24). */
export const HUM_TRACK_ICON_PATHS = {
  piano:
    '<path d="M4 19h16"/><path d="M6 19V9h2v10"/><path d="M10 19V7h2v12"/><path d="M14 19V9h2v10"/><path d="M18 19V11h2v8"/>',
  acoustic_guitar:
    '<path d="M12 4l2 2"/><circle cx="12" cy="14" r="5"/><path d="M9.5 14.5c.8 1.2 2.2 2 3.5 2s2.7-.8 3.5-2"/><path d="M10 11.5h4"/>',
  electric_guitar:
    '<path d="M12 3v4"/><rect x="10.5" y="7" width="3" height="2" rx=".5"/><circle cx="12" cy="15" r="5"/><path d="M9.5 15.5c.8 1.1 2.1 1.8 3.5 1.8s2.7-.7 3.5-1.8"/>',
  violin:
    '<path d="M12 3c-1.2 2.2-2 4.4-2 6.5 0 2.8 2.2 5 5 5h2"/><path d="M12 3c1.2 2.2 2 4.4 2 6.5 0 2.8-2.2 5-5 5H7"/><path d="M8 19.5c1 .8 2.2 1.2 4 1.2s3-.4 4-1.2"/>',
  flute:
    '<path d="M10 3h4"/><path d="M11 3v18"/><path d="M13 3v18"/><path d="M9 7h6"/><path d="M9 11h6"/><path d="M9 15h6"/>',
  ukulele:
    '<circle cx="12" cy="15" r="4.5"/><path d="M12 4v5"/><path d="M10.5 6.5h3"/>',
  synth:
    '<path d="M4 16V8"/><path d="M8 16V5"/><path d="M12 16V9"/><path d="M16 16V6"/><path d="M20 16V10"/><path d="M3 19h18"/>',
  strings:
    '<path d="M7 19V5"/><path d="M12 19V5"/><path d="M17 19V5"/><path d="M5 8c2.5-1 4.5-1 7-1s4.5 0 7 1"/><path d="M5 14c2.5 1 4.5 1 7 1s4.5 0 7-1"/>',
};

/** Home card: beamed eighth notes (stroke, matches Quick Starts row). */
export const HUM_TRACK_CARD_ICON =
  '<path d="M7.85 5 19.35 2.75"/><path d="M7.85 5v10.35"/><path d="M19.35 2.75v10.6"/><circle cx="4.35" cy="18.1" r="3.35"/><circle cx="15.85" cy="16.1" r="3.35"/>';

export function humTrackIconMarkup(id, { className = "" } = {}) {
  const paths = HUM_TRACK_ICON_PATHS[id] || HUM_TRACK_ICON_PATHS.piano;
  const cls = className ? ` class="${className}"` : "";
  return `<svg${cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${paths}</svg>`;
}
