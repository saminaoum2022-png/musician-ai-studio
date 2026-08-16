/**
 * Derive Pollinations cover-art params from a library track / generation meta.
 */
import { classifyVisualBucket, resolveUserArtworkPrompt } from "./prompt.js";
import { humTrackAvoidTags } from "./visual-director/hum-track-cover.mjs";
import { isDefaultSongCoverUrl } from "./placeholders.js";

const MOOD_TAG_MAP = {
  chill: "Chill",
  hype: "Hype",
  romantic: "Romantic",
  dark: "Dark",
  dreamy: "Dreamy",
  emotional: "Emotional",
};

function parseTempoFromText(text) {
  const m = String(text || "").match(/(\d{2,3})\s*bpm/i);
  return m ? parseInt(m[1], 10) : null;
}

function inferEnergy(meta) {
  const groove = String(meta?.groovePace || "").toLowerCase();
  const beat = String(meta?.beatStability || "").toLowerCase();
  const style = `${meta?.styleInput || ""} ${meta?.styleSent || ""}`.toLowerCase();
  if (/high|fast|driving|aggressive|hype|drill|party/.test(`${groove} ${beat} ${style}`)) return 0.85;
  if (/low|slow|gentle|soft|ballad|ambient|calm/.test(`${groove} ${beat} ${style}`)) return 0.32;
  return 0.55;
}

function inferMood(meta, title) {
  const explicit = String(meta?.mood || meta?.moodPreset || "").trim();
  if (explicit) return explicit;
  const style = `${meta?.styleInput || ""} ${meta?.styleSent || ""}`;
  const bucket = classifyVisualBucket({
    mood: "",
    genre: style,
    title: title || "",
    style: meta?.styleInput,
    styleSent: meta?.styleSent,
    energy: inferEnergy(meta),
    lyrics: String(meta?.lyricsInput || meta?.finalPrompt || "").trim(),
  });
  const labels = {
    love: "Romantic",
    party: "Party",
    happy: "Happy",
    sad: "Melancholic",
    chill: "Chill",
    wedding: "Wedding",
    hype: "Hype",
    dark: "Dark",
    dreamy: "Dreamy",
    epic: "Epic",
    default: "Balanced",
  };
  return labels[bucket] || "Balanced";
}

function inferGenre(meta) {
  const style = String(meta?.styleInput || meta?.styleSent || meta?.style || "").trim();
  if (style) {
    return style.split(/[,;|]/)[0].trim().slice(0, 100);
  }
  return "Abstract";
}

function inferBrightness(meta) {
  const style = `${meta?.styleInput || ""} ${meta?.styleSent || ""}`.toLowerCase();
  if (/dark|moody|noir|drill|trap|night/.test(style)) return 0.3;
  if (/bright|neon|pop|synth|edm|glossy|viral/.test(style)) return 0.78;
  return 0.5;
}

function inferSonicProfile(meta) {
  const style = `${meta?.styleInput || ""} ${meta?.styleSent || ""}`.toLowerCase();
  const elec = /electronic|edm|synth|techno|house|trap|808|digital/.test(style);
  const acou = /acoustic|piano|nylon|fingerpick|unplugged|oud|guitar|strings|live room/.test(style);
  if (elec && !acou) return "electronic";
  if (acou && !elec) return "acoustic";
  return "balanced";
}

const OCCASION_COVER_HINTS = [
  {
    re: /birthday|bday|happy birthday|sana helwa|عيد ميلاد/i,
    hint: "celebration still life, balloons and soft candle glow on dark surface, festive party atmosphere, no people, no writing",
  },
  {
    re: /wedding|bridal|bride|groom|زفاف|عرس|عروس/i,
    hint: "wedding still life, diamond solitaire rings on ivory satin, soft floral glow, no people, no writing",
  },
  {
    re: /christmas|xmas|noël|noel|holiday season|yuletide|بيت الميلاد/i,
    hint: "evergreen tree with warm golden lights and star glow, cozy winter atmosphere, no people, no writing",
  },
  {
    re: /anniversary|romantic|valentine|love song/i,
    hint: "romantic still life, intertwined gold rings and rose petals with soft candlelight, no people, no writing",
  },
  {
    re: /prom|graduation|congrats|congratulations|new year|mom day|for mom/i,
    hint: "celebration still life, confetti and golden lights on dark surface, no people, no writing",
  },
];

function occasionArtworkHintFromMeta(meta) {
  const blob = [
    meta?.challenge?.occasion,
    meta?.challenge?.title,
    meta?.searchTemplateTitle,
  ]
    .filter(Boolean)
    .join(" ");
  if (!blob.trim()) return "";
  for (const row of OCCASION_COVER_HINTS) {
    if (row.re.test(blob)) return row.hint;
  }
  return "";
}

function resolveArtworkHint(meta) {
  const parts = [
    String(meta?.artworkHint || "").trim(),
    String(meta?.artworkStyle || "").trim(),
    occasionArtworkHintFromMeta(meta),
  ].filter(Boolean);
  return parts.join(", ").slice(0, 280);
}

export function coverArtParamsFromTrack(track, opts = {}) {
  const meta = track?.meta && typeof track.meta === "object" ? track.meta : {};
  const hintOverride = String(opts.artworkHintOverride ?? opts.artworkHint ?? "").trim().slice(0, 280);
  const regenAutoMusic = Boolean(opts.regenAutoMusic);
  const styleBlob = `${meta.styleInput || ""} ${meta.styleSent || ""}`;
  const lyrics = String(
    meta.lyricsInput || meta.finalPrompt || meta.prompt || meta.soundPrompt || "",
  ).trim();
  const humTrack = Boolean(meta.humTrack);
  const avoidBase = String(meta?.avoidTagsInput || "").trim();
  const artworkHint = humTrack
    ? ""
    : hintOverride || (regenAutoMusic ? "" : resolveArtworkHint(meta));
  const artworkResolved = humTrack
    ? ""
    : hintOverride
      || (regenAutoMusic
        ? ""
        : resolveUserArtworkPrompt({
          artworkStyle: meta?.artworkStyle,
          artworkHint,
          styleSent: meta?.styleSent,
          style: meta?.styleInput,
          styleInput: meta?.styleInput,
        }));
  return {
    songId: String(track?.id || meta?.taskId || track?.taskId || "").trim(),
    title: String(track?.title || "Untitled").trim(),
    genre: inferGenre(meta),
    mood: inferMood(meta, track?.title),
    tempo: parseTempoFromText(styleBlob),
    energy: inferEnergy(meta),
    brightness: inferBrightness(meta),
    sonicProfile: inferSonicProfile(meta),
    style: String(meta?.styleInput || "").trim(),
    styleInput: String(meta?.styleInput || "").trim(),
    styleSent: String(meta?.styleSent || "").trim(),
    lyrics,
    lyricsInput: lyrics,
    finalPrompt: String(meta.finalPrompt || "").trim(),
    artworkStyle: artworkResolved,
    artworkHint,
    regenArtworkHint: hintOverride || undefined,
    regenAutoMusic,
    avoidTagsInput: humTrack ? humTrackAvoidTags(avoidBase) : avoidBase,
    humTrack,
    instrument: String(meta.instrument || "").trim(),
    instrumentLabel: String(meta.instrumentLabel || "").trim(),
    skipGeminiScene: humTrack,
    searchTemplateTitle: String(meta.searchTemplateTitle || "").trim(),
    occasionLabel: String(meta?.challenge?.occasion || "").trim(),
  };
}

/** JSON/meta flags — treat only real booleans and "true" strings as on (not "false"). */
export function metaFlagIsTrue(val) {
  if (val === true) return true;
  if (val === false || val == null) return false;
  const s = String(val).trim().toLowerCase();
  return s === "true" || s === "1" || s === "yes";
}

/** User attached a real photo for cover — never replace with Pollinations. */
export function hasUserPhotoCoverMeta(meta) {
  const m = meta && typeof meta === "object" ? meta : {};
  if (metaFlagIsTrue(m.photoMode) || metaFlagIsTrue(m.customCoverOnly) || metaFlagIsTrue(m.photoCoverOnly)) return true;
  const img = String(m.imageUrl || m.imageThumb || "").trim();
  return img.startsWith("data:") && !m.nabadAbstractCover && String(m.coverSource || "") !== "pollinations";
}

/** Only tracks explicitly marked at add-time get Pollinations — never backfill old library rows. */
export function shouldUseAbstractCover(track) {
  const meta = track?.meta && typeof track.meta === "object" ? track.meta : {};
  if (hasUserPhotoCoverMeta(meta)) return false;
  if (!meta.pollinationsCoverPending) return false;
  if (meta.photoMode || meta.imageOnlyInstrumental) return false;
  if (String(meta?.coverSource || "") === "pollinations" && meta?.nabadAbstractCover) return false;
  if (String(track?.artUrl || meta?.imageUrl || "").startsWith("data:") && meta?.nabadAbstractCover) {
    return false;
  }
  if (meta.coverGenAttempted && !isDefaultSongCoverUrl(track?.artUrl || meta?.imageUrl)) return false;
  return true;
}

/** Default cover path for new standard songs — Suno upstream + Nabad brand grade. */
export function isSunoCoverEligible(meta) {
  const m = meta && typeof meta === "object" ? meta : {};
  if (hasUserPhotoCoverMeta(m)) return false;
  if (m.humTrack) return false;
  if (m.photoMode || m.imageOnlyInstrumental) return false;
  if (String(m?.coverSource || "") === "pollinations" && m?.nabadAbstractCover) return false;
  return true;
}

export function shouldProcessSunoCover(track) {
  const meta = track?.meta && typeof track.meta === "object" ? track.meta : {};
  if (hasUserPhotoCoverMeta(meta)) return false;
  if (meta.humTrack) return false;
  if (meta.photoMode || meta.imageOnlyInstrumental) return false;
  if (!meta.sunoCoverPending) return false;
  if (meta.coverGenAttempted && String(track?.artUrl || meta?.imageUrl || "").startsWith("data:")) {
    return false;
  }
  const url = String(meta.sourceImageUrl || track?.artUrl || "").trim();
  return /^https?:\/\//i.test(url);
}

/** Legacy Pollinations backfill — rows still marked pending from before Suno-default switch. */
export function isPollinationsCoverEligible(meta) {
  const m = meta && typeof meta === "object" ? meta : {};
  if (hasUserPhotoCoverMeta(m)) return false;
  if (m.photoMode || m.imageOnlyInstrumental) return false;
  if (String(m?.coverSource || "") === "pollinations" && m?.nabadAbstractCover) return false;
  return true;
}

/** User may tap regen — Pollinations abstract covers and Photo Mood photo covers. */
export function canRegeneratePollinationsCover(track) {
  const meta = track?.meta && typeof track.meta === "object" ? track.meta : {};
  if (meta.photoMode || meta.imageOnlyInstrumental) return false;
  return String(meta?.coverSource || "") === "pollinations" && Boolean(meta?.nabadAbstractCover);
}

/** Player cover magic-wand — Pollinations abstract, Suno-branded, or Photo Mood photo. */
export function canRegenerateTrackCover(track) {
  if (canRegeneratePollinationsCover(track)) return true;
  const meta = track?.meta && typeof track.meta === "object" ? track.meta : {};
  if (Boolean(meta.photoMode)) return true;
  return String(meta?.coverSource || "") === "suno" && Boolean(meta?.coverNabadMark);
}

export { MOOD_TAG_MAP };
