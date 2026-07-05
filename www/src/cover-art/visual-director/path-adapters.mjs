/**
 * Path-specific enrichments for Visual Director context.
 */
import {
  appendHumTrackSceneGuards,
  humTrackInstrumentStillPhrase,
} from "./hum-track-cover.mjs";

/** @typedef {import("./context.js").CoverDirectorContext} CoverDirectorContext */

const OCCASION_RE = [
  { re: /birthday|bday|happy birthday|sana helwa|عيد ميلاد/i, occasion: "birthday" },
  { re: /wedding|bridal|bride|groom|زفاف|عرس|عروس/i, occasion: "wedding" },
  { re: /christmas|xmas|noël|noel|holiday season|yuletide|بيت الميلاد/i, occasion: "christmas" },
  { re: /graduation|graduate|commencement|تخرج/i, occasion: "graduation" },
  { re: /prom|formal dance|senior year|promenade/i, occasion: "prom" },
  { re: /valentine|romantic|love song/i, occasion: "romance" },
];

function inferOccasion(ctx) {
  const blob = [ctx.occasionLabel, ctx.searchTemplateTitle, ctx.title, ctx.lyrics].filter(Boolean).join(" ");
  for (const row of OCCASION_RE) {
    if (row.re.test(blob)) return row.occasion;
  }
  return ctx.occasionLabel || null;
}

function inferEmotion(ctx) {
  const bucket = String(ctx.bucketKey || "default").toLowerCase();
  const map = {
    love: "intimate",
    party: "celebratory",
    happy: "uplifting",
    sad: "melancholic",
    chill: "calm",
    wedding: "elegant",
    hype: "intense",
    dark: "brooding",
    dreamy: "ethereal",
    epic: "grand",
    default: "balanced",
  };
  return map[bucket] || map.default;
}

/**
 * @param {CoverDirectorContext} ctx
 * @returns {CoverDirectorContext}
 */
export function enrichDirectorContext(ctx) {
  const occasion = inferOccasion(ctx);
  const next = { ...ctx, occasionLabel: occasion || ctx.occasionLabel };

  if (ctx.sourcePath === "hum_track" && ctx.instrumentLabel) {
    next.visualModeHint = "instrument_still_life";
    const still = humTrackInstrumentStillPhrase(ctx.instrumentLabel, ctx.instrumentId);
    next.storyScene = appendHumTrackSceneGuards(
      next.storyScene || `${still}, moody studio spill light, no writing`,
    );
  }

  if (ctx.sourcePath === "sound") {
    next.visualModeHint = ctx.energy > 0.7 ? "abstract" : "landscape";
  }

  if (ctx.sourcePath === "mashup") {
    next.visualModeHint = "abstract";
    const titles = (ctx.mashupOf || [])
      .map((m) => String(m?.title || "").trim())
      .filter(Boolean)
      .slice(0, 2);
    if (titles.length) {
      next.storyScene = next.storyScene
        || `layered luminous depth blending two musical moods, ${titles.join(" and ")}, symbolic not literal`;
    }
  }

  if (ctx.sourcePath === "instrumental") {
    next.visualModeHint = "abstract";
  }

  next.mood = next.mood || inferEmotion(next);
  return next;
}
