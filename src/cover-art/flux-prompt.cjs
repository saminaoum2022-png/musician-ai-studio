"use strict";
/**
 * Cloudflare Flux Schnell cover prompts — written from scratch, Flux-only.
 * (Pollinations keeps using ./prompt.js untouched.)
 *
 * Why separate: Flux Schnell has no negative prompt and reads every word literally, so
 * "no people" / "no candles" / "no text" put people, candles and text in the picture.
 * Rules for this file:
 *   1. Positive wording only. Never mention what we don't want.
 *   2. Short: one subject, one light/colour line, one composition line (~400-550 chars).
 *   3. One source of truth for the scene, in priority order:
 *        user's own artwork hint > occasion > Visual Director / Gemini scene > mood/genre table.
 *   4. Plain CommonJS so the server can `require` it with no ESM loading questions.
 */

const NEGATION_CLAUSE_RE = /^\s*(?:absolutely\s+|completely\s+|strictly\s+)?(?:no|not|without|avoid|never|zero|nothing|don'?t)\b/i;

const HUMAN_RE =
  /\b(person|people|human|humans|man|woman|men|women|girl|boy|child|children|baby|couple|crowd|dancer|dancers|performer|performers|musician|musicians|singer|face|faces|facial|portrait|portraits|silhouette|silhouettes|figure|figures|body|bodies|hand|hands|finger|fingers|arm|arms|leg|legs|head|heads|eye|eyes|mouth|mouths|bride|groom|athlete|model|selfie|headshot|close-up|closeup)\b/i;

const CANDLE_RE = /\bcandle(?:light|s|stick|sticks)?\b/gi;

/** Split on commas / sentence breaks and drop every "no … / without … / avoid …" clause. */
function positiveOnly(text, { allowCandles = false } = {}) {
  const clauses = String(text || "")
    .split(/[,;.\n]+/)
    .map((c) => c.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .filter((c) => !NEGATION_CLAUSE_RE.test(c))
    .filter((c) => allowCandles || !/\bwax\b/i.test(c));
  let out = clauses.join(", ");
  if (!allowCandles) out = out.replace(CANDLE_RE, "warm string-light bokeh");
  return out;
}

/** Drop whole clauses that mention a person or body part (for AI-written scenes, never the user's own words). */
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

/** Explicit occasions beat everything except the user's own words. */
const OCCASIONS = [
  [/\b(?:birthday|bday|sana helwa)|عيد ميلاد/i,
    "floating teal and violet balloons, scattered confetti and a small wrapped gift on a dark glossy surface, soft string-light bokeh"],
  [/\b(?:wedding|bridal|bride|groom|engagement)|زفاف|عرس|عروس|خطوبة/i,
    "two diamond rings resting on ivory satin beside soft white flowers"],
  [/\b(?:christmas|xmas|noel|noël|holiday season)/i,
    "a small evergreen tree with warm golden lights and a glowing star"],
  [/\beid\b|ramadan|عيد الفطر|عيد الأضحى|رمضان/i,
    "an ornate brass lantern glowing beside a crescent moon ornament on a dark patterned carpet"],
  [/\b(?:anniversary|valentine|romantic|love song)/i,
    "intertwined gold rings and rose petals on dark silk"],
  [/new year/i,
    "golden fireworks bursting over dark still water, reflected lights"],
  [/\b(?:graduation|graduate|congrat|prom)|تخرج|مبروك/i,
    "a graduation cap and a rolled scroll tied with ribbon, golden confetti in the air"],
  [/\bmom\b|\bmother'?s?\b|عيد الأم|ماما/i,
    "a bouquet of soft pink roses in a glass vase on dark linen"],
  [/\b(?:sorry|apology)|اعتذار/i,
    "a single white flower and a folded paper note on dark wood"],
  [/\b(?:thank you|thanks|gratitude)|شكر/i,
    "a small bouquet tied with ribbon on dark linen"],
  [/\b(?:miss you|missing you|long distance)|اشتق/i,
    "a paper plane resting by a rain-streaked window, distant city glow"],
];

/** Fallback when the song has no hint, occasion or scene: mood / genre decides, seed picks the variant. */
const MOOD_SCENES = [
  [/\b(?:sad|melanchol|heartbreak|lonely|sorrow|blues)|حزين|فراق/i, [
    "a rain-streaked window with blurred city lights and a single wilted flower on the sill",
    "an empty chair beside a fogged window at blue hour",
  ]],
  [/\b(?:romantic|love|tender|romance)|حب|غرام/i, [
    "rose petals and a pair of gold rings on dark silk",
    "two glass goblets catching soft rose-gold light on dark velvet",
  ]],
  [/\b(?:arabic|tarab|oud|khaleeji|shaabi|sha3bi|mahraganat|dabke)|عربي|طرب|شعبي|دبكة/i, [
    "an ornate brass lantern on a dark patterned carpet, glowing arabesque light",
    "a carved brass tray with small tea glasses and drifting steam on dark wood",
  ]],
  [/\b(?:dance|club|edm|party|upbeat|house|techno|electro|pop|energetic|festive)/i, [
    "a glossy vinyl record on a dark reflective floor with sweeping neon light beams and soft bokeh",
    "a mirror ball throwing teal and violet light across a dark room",
  ]],
  [/\b(?:chill|lofi|lo-fi|calm|relax|ambient|acoustic|sleep|soft|peace)/i, [
    "a ceramic cup beside a small green plant on a window ledge at blue hour",
    "smooth stones stacked beside still water, soft mist",
  ]],
  [/\b(?:rock|metal|drill|trap|hip ?hop|rap|dark|aggressive|angry)/i, [
    "cracked dark glass with a teal-violet rim light and drifting smoke",
    "a chrome chain coiled on wet black asphalt, neon reflections",
  ]],
];

const DEFAULT_SCENES = [
  "a glossy vinyl record resting on dark velvet with a teal rim light",
  "a crystal prism splitting teal and violet light on a dark surface",
  "glass orbs floating in violet mist above a reflective black floor",
  "an empty theatre stage with a single spotlight and drifting haze",
];

function pickBySeed(list, seed) {
  const n = Math.abs(Math.floor(Number(seed) || 0));
  return list[n % list.length];
}

/** Generic filler scenes from the keyword director — treated as "nothing matched". */
const GENERIC_SCENE_RE = /^\s*(?:abstract sonic pulse|premium abstract living light|layered luminous depth)/i;

function occasionScene(ctx) {
  const blob = [ctx.occasionLabel, ctx.searchTemplateTitle, ctx.title].filter(Boolean).join(" ");
  if (!blob.trim()) return "";
  for (const [re, scene] of OCCASIONS) {
    if (re.test(blob)) return scene;
  }
  return "";
}

/** True when nothing explicit (user hint / occasion) decides the scene, so an AI scene writer should read the song. */
function needsSceneWriter(ctx = {}) {
  if (String(ctx.userArtwork || "").trim()) return false;
  if (occasionScene(ctx)) return false;
  return true;
}

function resolveSubject(ctx) {
  const userArt = String(ctx.userArtwork || "").trim();
  const allowCandles = /\bcandle|birthday cake/i.test(userArt);
  if (userArt) {
    const cleaned = positiveOnly(userArt, { allowCandles });
    if (cleaned) return { text: clampAtComma(cleaned, 260), source: "user", people: HUMAN_RE.test(cleaned) };
  }

  const occ = occasionScene(ctx);
  if (occ) return { text: occ, source: "occasion", people: false };

  const ai = stripHumans(positiveOnly(String(ctx.aiScene || "")));
  if (ai.length >= 12) return { text: clampAtComma(ai, 240), source: "ai_scene", people: false };

  const sceneRaw = String(ctx.scene || "").trim();
  if (sceneRaw && !GENERIC_SCENE_RE.test(sceneRaw)) {
    const cleaned = stripHumans(positiveOnly(sceneRaw));
    if (cleaned.length >= 12) return { text: clampAtComma(cleaned, 240), source: "scene", people: false };
  }

  const moodBlob = [ctx.mood, ctx.genre, ctx.style].filter(Boolean).join(" ");
  for (const [re, scenes] of MOOD_SCENES) {
    if (re.test(moodBlob)) return { text: pickBySeed(scenes, ctx.seed), source: "mood", people: false };
  }
  return { text: pickBySeed(DEFAULT_SCENES, ctx.seed), source: "default", people: false };
}

const LIGHT_LINE =
  "Dark, moody atmosphere with deep black shadows, lit by teal and violet glow and a faint rose-gold highlight.";
const FRAME_LINE =
  "Vertical 9:16 album cover, subject centred with wide margins, shallow depth of field, photorealistic, cinematic lighting.";
const QUIET_LINE = "A quiet, wordless scene of objects and atmosphere only.";
const WORDLESS_LINE = "A wordless image.";

/**
 * @param {{userArtwork?:string, scene?:string, occasionLabel?:string, searchTemplateTitle?:string,
 *          title?:string, mood?:string, genre?:string, style?:string, seed?:number}} ctx
 * @returns {{prompt:string, source:string}}
 */
function buildFluxScratchPrompt(ctx = {}) {
  const subject = resolveSubject(ctx);
  const lead = /photograph|photo\b/i.test(subject.text) ? "" : "Cinematic photograph: ";
  const prompt = [
    `${lead}${subject.text}.`,
    LIGHT_LINE,
    FRAME_LINE,
    subject.people ? WORDLESS_LINE : QUIET_LINE,
  ].join(" ").replace(/\s+/g, " ").trim();
  return { prompt, source: subject.source };
}

module.exports = { buildFluxScratchPrompt, needsSceneWriter, positiveOnly, stripHumans };
