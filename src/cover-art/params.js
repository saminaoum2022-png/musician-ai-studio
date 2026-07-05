/**
 * Derive Pollinations cover-art params from a library track / generation meta.
 */
import { classifyVisualBucket, resolveUserArtworkPrompt } from "./prompt.js";
import { humTrackAvoidTags } from "./visual-director/hum-track-cover.mjs";

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
    hint: "celebration balloons and soft candle glow, festive party atmosphere, no people, no writing",
  },
  {
    re: /wedding|bridal|bride|groom|زفاف|عرس|عروس/i,
    hint: "elegant wedding ceremony lights, dancing silhouettes, floral glow, no faces, no writing",
  },
  {
    re: /christmas|xmas|noël|noel|holiday season|yuletide|بيت الميلاد/i,
    hint: "evergreen tree with warm golden lights and star glow, cozy winter atmosphere, no writing",
  },
  {
    re: /anniversary|romantic|valentine|love song/i,
    hint: "intimate romantic atmosphere, couple silhouettes under glowing sky, no faces, no writing",
  },
  {
    re: /prom|graduation|congrats|congratulations|new year|mom day|for mom/i,
    hint: "celebration lights and confetti atmosphere, festive silhouettes, no writing",
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

export function coverArtParamsFromTrack(track) {
  const meta = track?.meta && typeof track.meta === "object" ? track.meta : {};
  const styleBlob = `${meta.styleInput || ""} ${meta.styleSent || ""}`;
  const lyrics = String(
    meta.lyricsInput || meta.finalPrompt || meta.prompt || meta.soundPrompt || "",
  ).trim();
  const artworkHint = resolveArtworkHint(meta);
  const artworkResolved = resolveUserArtworkPrompt({
    artworkStyle: meta?.artworkStyle,
    artworkHint,
    styleSent: meta?.styleSent,
    style: meta?.styleInput,
    styleInput: meta?.styleInput,
  });
  const humTrack = Boolean(meta.humTrack);
  const avoidBase = String(meta?.avoidTagsInput || "").trim();
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
    avoidTagsInput: humTrack ? humTrackAvoidTags(avoidBase) : avoidBase,
    humTrack,
    instrument: String(meta.instrument || "").trim(),
    instrumentLabel: String(meta.instrumentLabel || "").trim(),
    skipGeminiScene: humTrack,
    searchTemplateTitle: String(meta.searchTemplateTitle || "").trim(),
    occasionLabel: String(meta?.challenge?.occasion || "").trim(),
  };
}

/** Only tracks explicitly marked at add-time get Pollinations — never backfill old library rows. */
export function shouldUseAbstractCover(track) {
  const meta = track?.meta && typeof track.meta === "object" ? track.meta : {};
  if (!meta.pollinationsCoverPending) return false;
  if (meta.photoMode || meta.imageOnlyInstrumental) return false;
  if (String(meta?.coverSource || "") === "pollinations" && meta?.nabadAbstractCover) return false;
  if (String(track?.artUrl || meta?.imageUrl || "").startsWith("data:") && meta?.nabadAbstractCover) {
    return false;
  }
  if (meta.coverGenAttempted && !isDefaultSongCoverUrl(track?.artUrl || meta?.imageUrl)) return false;
  return true;
}

export function isPollinationsCoverEligible(meta) {
  const m = meta && typeof meta === "object" ? meta : {};
  if (m.photoMode || m.imageOnlyInstrumental) return false;
  if (String(m?.coverSource || "") === "pollinations" && m?.nabadAbstractCover) return false;
  return true;
}

export { MOOD_TAG_MAP };
