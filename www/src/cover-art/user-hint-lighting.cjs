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

const TIGHT_COMPOSE_RE =
  /\b(close[\s-]?up|closeup|macro|extreme close|tight crop|tight shot|tight framing|zoomed in|fill(?:ing)?\s+(?:the\s+)?frame|subject fills|hero fills|full[\s-]?frame subject|detail shot|micro shot)\b/i;

function userHintRequestsTightComposition(text) {
  return TIGHT_COMPOSE_RE.test(String(text || ""));
}

function appendWideCompositionHint(raw) {
  let s = String(raw || "").replace(/\s+/g, " ").trim();
  if (!s || userHintRequestsTightComposition(s)) return s;
  if (/medium wide|wide shot|medium shot|pulled back|modest scale|one quarter|25.?35/i.test(s)) return s;
  return `${s}, medium wide shot, camera pulled back, modest subject scale, generous environment visible`.slice(0, 280);
}

/** Default player cover — medium/wide so 9:16 crop keeps the scene readable. */
const FLUX_WIDE_FRAME_LINE =
  "Vertical 9:16 album cover, medium wide shot, camera pulled back, main subject at modest scale about one quarter to one third of frame height, generous sky and ground breathing room, full environment visible, sharp clear detail, natural depth of field";

const FLUX_TIGHT_FRAME_LINE =
  "Vertical 9:16 album cover, tighter close composition as directed, subject larger in frame, cinematic detail";

module.exports = {
  userHintRequestsDaylight,
  userHintRequestsNight,
  userHintRequestsTightComposition,
  augmentArtworkHintForLighting,
  appendWideCompositionHint,
  USER_DAYLIGHT_PALETTE,
  FLUX_DAYLIGHT_LIGHT_LINE,
  FLUX_WIDE_FRAME_LINE,
  FLUX_TIGHT_FRAME_LINE,
};
