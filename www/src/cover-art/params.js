/**
 * Derive Pollinations cover-art params from a library track / generation meta.
 */
import { classifyVisualBucket, resolveUserArtworkPrompt } from "./prompt.js";

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

export function coverArtParamsFromTrack(track) {
  const meta = track?.meta && typeof track.meta === "object" ? track.meta : {};
  const styleBlob = `${meta.styleInput || ""} ${meta.styleSent || ""}`;
  const lyrics = String(meta.lyricsInput || meta.finalPrompt || meta.prompt || "").trim();
  const artworkResolved = resolveUserArtworkPrompt({
    artworkStyle: meta?.artworkStyle,
    artworkHint: meta?.artworkHint,
    styleSent: meta?.styleSent,
    style: meta?.styleInput,
    styleInput: meta?.styleInput,
  });
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
    artworkHint: String(meta?.artworkHint || "").trim(),
    avoidTagsInput: String(meta?.avoidTagsInput || "").trim(),
  };
}

/** Only tracks explicitly marked at add-time get Pollinations — never backfill old library rows. */
export function shouldUseAbstractCover(track) {
  const meta = track?.meta && typeof track.meta === "object" ? track.meta : {};
  if (!meta.pollinationsCoverPending) return false;
  if (meta.photoMode || meta.imageOnlyInstrumental) return false;
  if (meta.coverGenAttempted) return false;
  if (String(meta?.coverSource || "") === "pollinations" && meta?.nabadAbstractCover) return false;
  if (String(track?.artUrl || meta?.imageUrl || "").startsWith("data:") && meta?.nabadAbstractCover) {
    return false;
  }
  return true;
}

export function isPollinationsCoverEligible(meta) {
  const m = meta && typeof meta === "object" ? meta : {};
  if (m.photoMode || m.imageOnlyInstrumental) return false;
  if (String(m?.coverSource || "") === "pollinations" && m?.nabadAbstractCover) return false;
  return true;
}

export { MOOD_TAG_MAP };
