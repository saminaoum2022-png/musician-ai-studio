"use strict";

const DAYLIGHT_RE =
  /\b(daylight|day\s*time|daytime|in\s+day|in\s+the\s+day|during\s+the\s+day|sun\s*light|sunlit|sun\s+lit|sunny|bright\s+day|morning\s+light|afternoon\s+sun|midday|broad\s+daylight)\b/i;

const NIGHT_RE =
  /\b(at\s+night|nighttime|night\s*time|midnight|noir|after\s+dark|in\s+the\s+dark|nocturnal|evening\s+only|after\s+sunset)\b/i;

function userHintRequestsDaylight(text) {
  return DAYLIGHT_RE.test(String(text || ""));
}

function userHintRequestsNight(text) {
  return NIGHT_RE.test(String(text || ""));
}

/** Expand shorthand user hints so image models read “day” literally, not as night-tree cliché. */
function augmentArtworkHintForLighting(raw) {
  let s = String(raw || "").replace(/\s+/g, " ").trim();
  if (!s || userHintRequestsNight(s)) return s;
  if (!userHintRequestsDaylight(s)) return s;

  s = s.replace(/\bin day\b/gi, "in bright daylight");
  if (!/bright daylight|sunlit|sunlight|daytime scene|natural sunlight/i.test(s)) {
    s = `${s}, bright natural daylight, sunlit scene`;
  }
  if (/\b(christmas|xmas|holiday)\b.*\b(tree|evergreen)\b|\b(tree|evergreen)\b.*\b(christmas|xmas|holiday)\b/i.test(s)) {
    if (!/outdoor|blue sky|winter daylight|snow in sunlight/i.test(s)) {
      s = `${s}, decorated evergreen tree outdoors in bright winter daylight, blue sky, sunlight on branches, not a dark night background`;
    }
  }
  return s.slice(0, 280);
}

const USER_DAYLIGHT_PALETTE =
  "natural daylight, warm sunlit highlights, clear sky tones, soft teal-violet grade accents only, no void black background, not underexposed";

const FLUX_DAYLIGHT_LIGHT_LINE =
  "Bright daytime photograph, natural sunlight, clear sky or bright window light, lifted midtones, readable festive colors, soft shadows, subtle teal-violet grade accent only, not a dark night scene";

module.exports = {
  userHintRequestsDaylight,
  userHintRequestsNight,
  augmentArtworkHintForLighting,
  USER_DAYLIGHT_PALETTE,
  FLUX_DAYLIGHT_LIGHT_LINE,
};
