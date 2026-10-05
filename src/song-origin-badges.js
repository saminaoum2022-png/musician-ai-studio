/**
 * Small SVG badges for how a library draft was made (icons only — no labels in the row).
 */

const ORIGIN_ORDER = [
  "remix",
  "mashup",
  "photo",
  "vibe",
  "hum",
  "lyrics",
  "spark",
  "instrumental",
];

const ORIGIN_LABELS = {
  remix: "Remix",
  mashup: "Mashup",
  photo: "Photo Mood",
  vibe: "Vibe read",
  hum: "Hum",
  lyrics: "Lyrics",
  spark: "Spark",
  instrumental: "Instrumental",
};

/** Inner SVG markup per origin (24×24 viewBox). */
const ORIGIN_SVG_INNER = {
  photo:
    '<path fill="currentColor" d="M5 4.5A2.5 2.5 0 0 0 2.5 7v10a2.5 2.5 0 0 0 2.5 2.5h14a2.5 2.5 0 0 0 2.5-2.5V7A2.5 2.5 0 0 0 19 4.5H5Zm0 1.5h14c.55 0 1 .45 1 1v7.2l-3.33-3.32a1.8 1.8 0 0 0-2.54 0L10 15.01l-1.63-1.63a1.8 1.8 0 0 0-2.54 0L4 15.21V7c0-.55.45-1 1-1Zm12.5 2.2a1.7 1.7 0 1 0 0 3.4 1.7 1.7 0 0 0 0-3.4ZM7.1 14.44a.3.3 0 0 1 .43 0L10 16.9l5.19-5.18a.3.3 0 0 1 .42 0L20 16.1V17c0 .55-.45 1-1 1H5c-.55 0-1-.45-1-1v-.26l3.1-2.3Z"/>',
  vibe:
    '<path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" d="M4 14v4M8 10v8M12 6v12M16 10v8M20 14v4"/>',
  hum:
    '<path fill="none" stroke="currentColor" stroke-width="1.85" stroke-linecap="round" stroke-linejoin="round" d="M7.85 5 19.35 2.75M7.85 5v10.35M19.35 2.75v10.6"/><circle cx="4.35" cy="18.1" r="3.35" fill="none" stroke="currentColor" stroke-width="1.85"/><circle cx="15.85" cy="16.1" r="3.35" fill="none" stroke="currentColor" stroke-width="1.85"/>',
  lyrics:
    '<path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M12 20h9M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4 12.5-12.5Z"/>',
  spark:
    '<path fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M18.4 5.6l-2.8 2.8M8.4 15.6l-2.8 2.8"/>',
  remix:
    '<path fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" d="M7 7h3.4c1.6 0 3 .8 3.8 2.1l1.1 1.8M7 17h3.4c1.6 0 3-.8 3.8-2.1l1.1-1.8M17 6l3 3-3 3M17 12l3 3-3 3M4 7h3M4 17h3"/>',
  mashup:
    '<circle cx="8" cy="12" r="4.5" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="16" cy="12" r="4.5" fill="none" stroke="currentColor" stroke-width="1.8"/><path fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" d="M12 8v8"/>',
  instrumental:
    '<path fill="none" stroke="currentColor" stroke-width="1.85" stroke-linecap="round" stroke-linejoin="round" d="M9 18V5l12-2v13"/><path fill="none" stroke="currentColor" stroke-width="1.85" stroke-linecap="round" d="M4 5l16 16"/>',
};

function challengeSparkKind(challenge) {
  if (!challenge || typeof challenge !== "object") return false;
  const type = String(challenge.type || "").trim().toLowerCase();
  const variant = String(challenge.variant || "").trim().toLowerCase();
  const id = String(challenge.id || "").trim().toLowerCase();
  if (type === "spark" || variant === "spark") return true;
  if (String(challenge.campaign || "").trim() || type === "campaign") return false;
  if (variant === "occasion" || type === "occasion" || id.startsWith("occasion:")) return false;
  return Boolean(id);
}

/**
 * @returns {string[]} ordered origin keys for a library track
 */
export function collectSongOriginKeys(track) {
  if (!track) return [];
  const meta = track?.meta && typeof track.meta === "object" ? track.meta : {};
  const kind = String(track?.kind || "").toLowerCase();
  const mode = String(meta.mode || "").toLowerCase();
  const keys = [];
  const push = (k) => {
    if (k && ORIGIN_SVG_INNER[k] && !keys.includes(k)) keys.push(k);
  };

  if (meta.mashupOf && typeof meta.mashupOf === "object") push("mashup");
  else if (String(meta.engine || "").toLowerCase() === "mashup") push("mashup");
  else if (meta.remixOf && typeof meta.remixOf === "object") push("remix");
  else if (meta.remixOfHubPostId) push("remix");

  if (meta.photoMode === true || String(meta.photoMode || "").toLowerCase() === "true" || mode.includes("photo")) {
    push("photo");
  }
  if (meta.vibeReadApplied === true || String(meta.vibeReadApplied || "").toLowerCase() === "true") {
    push("vibe");
  }

  const humTrack = meta.humTrack === true || String(meta.humTrack || "").toLowerCase() === "true";
  const humMode = mode === "hum" || Boolean(meta.humMelody);
  const refOrigin = String(meta.vocalRefOrigin || "").toLowerCase();
  const humRef =
    Boolean(meta.hasReference) &&
    refOrigin &&
    refOrigin !== "remix" &&
    refOrigin !== "upload" &&
    !mode.includes("remix");
  if (humTrack || humMode || humRef) push("hum");

  const instrumentalKind = kind === "instrumental" || kind === "sound";
  const instrumentalMeta =
    meta.instrumentalSelected === true ||
    meta.imageOnlyInstrumental === true ||
    meta.referenceInstrumentalOnly === true ||
    mode.includes("instrumental");
  if (instrumentalMeta || (instrumentalKind && !humTrack)) push("instrumental");

  const ideaOnly =
    Boolean(String(meta.ideaInput || "").trim()) &&
    (meta.customMode === false || String(meta.customMode || "").toLowerCase() === "false");
  const lyricsMode =
    meta.customMode === true ||
    String(meta.customMode || "").toLowerCase() === "true" ||
    meta.lyricsGeneratedInNabad === true ||
    meta.lyricsEditedByUser === true;
  const lyricsText = String(meta.lyricsInput || "").trim();
  if (
    !instrumentalKind &&
    kind !== "sound" &&
    !meta.imageOnlyInstrumental &&
    !ideaOnly &&
    (lyricsMode || lyricsText)
  ) {
    push("lyrics");
  }

  if (
    challengeSparkKind(meta.challenge) ||
    meta.templateSparkFull ||
    meta.templateSparkClip
  ) {
    push("spark");
  }

  return ORIGIN_ORDER.filter((k) => keys.includes(k));
}

export function songOriginIconHtml(key, { size = 14, className = "songOriginBadgeIco" } = {}) {
  const inner = ORIGIN_SVG_INNER[key];
  if (!inner) return "";
  return `<svg class="${className}" width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${inner}</svg>`;
}

export function songOriginBadgesHtml(
  track,
  { size = 14, wrapClass = "songOriginBadges", inline = false } = {},
) {
  const keys = collectSongOriginKeys(track);
  if (!keys.length) return "";
  const label = keys.map((k) => ORIGIN_LABELS[k] || k).join(", ");
  const icons = keys
    .map((k) => {
      if (inline) {
        return songOriginIconHtml(k, {
          size,
          className: `songOriginInlineIco songOriginInlineIco--${k}`,
        });
      }
      return `<span class="songOriginBadge songOriginBadge--${k}">${songOriginIconHtml(k, { size })}</span>`;
    })
    .join("");
  return `<span class="${wrapClass}" role="img" aria-label="Made with: ${label}">${icons}</span>`;
}

export function songOriginBadgesAboutHtml(track) {
  const keys = collectSongOriginKeys(track);
  if (!keys.length) return "";
  const chips = keys
    .map(
      (k) =>
        `<span class="songOriginAboutChip songOriginAboutChip--${k}">${songOriginIconHtml(k, { size: 16, className: "songOriginAboutIco" })}<span class="songOriginAboutLabel">${ORIGIN_LABELS[k] || k}</span></span>`,
    )
    .join("");
  return `<div class="songOriginAboutRow" aria-label="How this song was made">${chips}</div>`;
}
