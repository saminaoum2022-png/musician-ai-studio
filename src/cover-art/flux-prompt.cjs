"use strict";

const {
  userHintRequestsDaylight,
  userHintRequestsNight,
  augmentArtworkHintForLighting,
  FLUX_FRAME_LINE,
} = require("./user-hint-lighting.cjs");

/**
 * Cloudflare Flux Schnell — minimal scratch prompts (Pollinations still uses ./prompt.js).
 *
 * Flux has no negative prompt and reads negations literally — positive wording only, keep it short.
 * Scene priority: user artwork hint > occasion > Gemini one-liner (aiScene) > mood/genre table > default pool.
 * Visual Director / long client prompts are NOT fed here (they skew dark/night and overload the model).
 */

const NEGATION_CLAUSE_RE = /^\s*(?:absolutely\s+|completely\s+|strictly\s+)?(?:no|not|without|avoid|never|zero|nothing|don'?t)\b/i;

const HUMAN_RE =
  /\b(person|people|human|humans|man|woman|men|women|girl|boy|child|children|baby|couple|crowd|dancer|dancers|performer|performers|musician|musicians|singer|face|faces|facial|portrait|portraits|silhouette|silhouettes|figure|figures|body|bodies|hand|hands|finger|fingers|arm|arms|leg|legs|head|heads|eye|eyes|mouth|mouths|bride|groom|athlete|model|selfie|headshot|close-up|closeup)\b/i;

const CANDLE_RE = /\bcandle(?:light|s|stick|sticks)?\b/gi;

const NIGHT_SCENE_RE =
  /\b(at night|midnight|nocturnal|void black|deep black|after dark|urban night|dark studio void|underexposed|pitch black)\b/i;

function positiveOnly(text, { allowCandles = false } = {}) {
  const clauses = String(text || "")
    .split(/[,;.\n]+/)
    .map((c) => c.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .filter((c) => !NEGATION_CLAUSE_RE.test(c))
    .filter((c) => allowCandles || !/\bwax\b/i.test(c));
  let out = clauses.join(", ");
  if (!allowCandles) out = out.replace(CANDLE_RE, "soft bokeh light");
  return out;
}

function stripHumans(text) {
  return String(text || "")
    .split(",")
    .map((c) => c.trim())
    .filter((c) => c && !HUMAN_RE.test(c))
    .join(", ");
}

function clampAtComma(text, max) {
  const s = String(text || "").trim();
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  const i = cut.lastIndexOf(",");
  return (i > max * 0.5 ? cut.slice(0, i) : cut).trim();
}

const OCCASIONS = [
  [/\b(?:birthday|bday|sana helwa)|عيد ميلاد/i,
    "colorful balloons and confetti on a bright festive table, daylight party mood"],
  [/\b(?:wedding|bridal|bride|groom|engagement)|زفاف|عرس|عروس|خطوبة/i,
    "two diamond rings on ivory satin with soft white flowers, gentle window light"],
  [/\b(?:christmas|xmas|noel|noël|holiday season)/i,
    "decorated evergreen tree outdoors in winter daylight, blue sky, sunlight on branches"],
  [/\beid\b|ramadan|عيد الفطر|عيد الأضحى|رمضان/i,
    "ornate brass lantern beside a crescent ornament on patterned fabric, warm glowing light"],
  [/\b(?:anniversary|valentine|romantic|love song)/i,
    "intertwined gold rings and rose petals on cream silk, rose-gold daylight"],
  [/new year/i,
    "golden fireworks over calm water at dusk, reflected lights, clear sky gradient"],
  [/\b(?:graduation|graduate|congrat|prom)|تخرج|مبروك/i,
    "graduation cap and rolled scroll with ribbon on a wooden desk, sunny window light"],
  [/\bmom\b|\bmother'?s?\b|عيد الأم|ماما/i,
    "soft pink roses in a glass vase on linen, bright natural light"],
  [/\b(?:sorry|apology)|اعتذار/i,
    "a single white flower and folded paper note on light wood, soft daylight"],
  [/\b(?:thank you|thanks|gratitude)|شكر/i,
    "small bouquet tied with ribbon on a sunlit table"],
  [/\b(?:miss you|missing you|long distance)|اشتق/i,
    "paper plane by a rain-streaked window, soft grey daylight, distant city view"],
];

const MOOD_SCENES = [
  [/\b(?:sad|melanchol|heartbreak|lonely|sorrow|blues)|حزين|فراق/i, [
    "rain-streaked window with soft overcast daylight and a flower on the sill",
    "empty chair beside a bright window, quiet emotional still life",
  ]],
  [/\b(?:romantic|love|tender|romance)|حب|غرام/i, [
    "rose petals and gold rings on cream silk in warm afternoon light",
    "two glass goblets catching soft rose-gold sunlight on linen",
  ]],
  [/\b(?:arabic|tarab|oud|khaleeji|shaabi|sha3bi|mahraganat|dabke)|عربي|طرب|شعبي|دبكة/i, [
    "ornate brass lantern on patterned fabric, warm arabesque light, sunlit still life",
    "carved brass tray with tea glasses and steam on a sunlit wooden table",
  ]],
  [/\b(?:dance|club|edm|party|upbeat|house|techno|electro|pop|energetic|festive)/i, [
    "glossy vinyl record on a reflective floor with teal-violet light beams and festive bokeh",
    "mirror ball throwing colorful light across a bright party room",
  ]],
  [/\b(?:chill|lofi|lo-fi|calm|relax|ambient|acoustic|sleep|soft|peace)/i, [
    "ceramic cup beside a small green plant on a sunlit window ledge",
    "smooth stones beside still water with soft mist and gentle daylight",
  ]],
  [/\b(?:rock|metal|drill|trap|hip ?hop|rap|dark|aggressive|angry)/i, [
    "cracked glass with teal-violet rim light on wet pavement at dusk, neon reflections",
    "chrome chain on asphalt with vivid neon reflections, motivated street lighting",
  ]],
];

const DEFAULT_SCENES = [
  "glossy vinyl record on a sunlit wooden desk with soft teal accent light",
  "crystal prism splitting light on a bright matte surface, gentle daylight fill",
  "fresh flowers and glassware on a sunlit table, airy premium album mood",
  "minimal studio still life with glass catching cyan light beams, clear exposure",
  "coastal cliff path at golden hour, pearlescent sky and calm ocean haze",
  "serene botanical still life, soft window light on dried flowers",
];

function pickBySeed(list, seed) {
  const n = Math.abs(Math.floor(Number(seed) || 0));
  return list[n % list.length];
}

function occasionScene(ctx) {
  const blob = [ctx.occasionLabel, ctx.searchTemplateTitle, ctx.title].filter(Boolean).join(" ");
  if (!blob.trim()) return "";
  for (const [re, scene] of OCCASIONS) {
    if (re.test(blob)) return scene;
  }
  return "";
}

function needsSceneWriter(ctx = {}) {
  if (String(ctx.userArtwork || "").trim()) return false;
  if (occasionScene(ctx)) return false;
  return true;
}

function resolveSubject(ctx) {
  const userArtRaw = String(ctx.userArtwork || "").trim();
  const userArt = augmentArtworkHintForLighting(userArtRaw);
  const allowCandles = /\bcandle|birthday cake/i.test(userArt);
  if (userArt) {
    const cleaned = positiveOnly(userArt, { allowCandles });
    if (cleaned) return { text: clampAtComma(cleaned, 280), source: "user", people: HUMAN_RE.test(cleaned) };
  }

  const occ = occasionScene(ctx);
  if (occ) return { text: occ, source: "occasion", people: false };

  const ai = stripHumans(positiveOnly(String(ctx.aiScene || "")));
  if (ai.length >= 12 && !NIGHT_SCENE_RE.test(ai)) {
    return { text: clampAtComma(ai, 260), source: "ai_scene", people: false };
  }

  const moodBlob = [ctx.mood, ctx.genre, ctx.style].filter(Boolean).join(" ");
  for (const [re, scenes] of MOOD_SCENES) {
    if (re.test(moodBlob)) return { text: pickBySeed(scenes, ctx.seed), source: "mood", people: false };
  }
  return { text: pickBySeed(DEFAULT_SCENES, ctx.seed), source: "default", people: false };
}

const DEFAULT_LIGHT =
  "Photorealistic photograph, natural lighting matched to the scene, clear readable exposure, soft teal-violet color grade";
const DAYLIGHT_LIGHT =
  "Bright daytime photograph, natural sunlight, clear sky or bright window light, lifted midtones, soft teal-violet accent grade";
const NIGHT_LIGHT =
  "Night photograph with motivated practical lights, readable midtones, soft teal-violet grade";

/**
 * @param {{userArtwork?:string, aiScene?:string, occasionLabel?:string, searchTemplateTitle?:string,
 *          title?:string, mood?:string, genre?:string, style?:string, seed?:number}} ctx
 * @returns {{prompt:string, source:string}}
 */
function buildFluxScratchPrompt(ctx = {}) {
  const subject = resolveSubject(ctx);
  const lead = /photograph|photo\b/i.test(subject.text) ? "" : "Photograph: ";
  const userArtForLight = String(ctx.userArtwork || "").trim();
  let lightLine = DEFAULT_LIGHT;
  if (userHintRequestsDaylight(userArtForLight)) lightLine = DAYLIGHT_LIGHT;
  else if (userHintRequestsNight(userArtForLight)) lightLine = NIGHT_LIGHT;

  const prompt = [`${lead}${subject.text}.`, `${FLUX_FRAME_LINE}.`, lightLine]
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
  return { prompt, source: subject.source };
}

module.exports = { buildFluxScratchPrompt, needsSceneWriter, positiveOnly, stripHumans };
