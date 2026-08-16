/**
 * Story-aware Pollinations prompts — derived from title, lyrics, style, mood.
 * User never writes these. Same song id + same story → same seed + same scene.
 */

/** Bump when cover prompt policy changes — busts Gemini scene cache on the server. */
export const COVER_PROMPT_POLICY_VERSION = 15;
/** Pollinations flux reliably returns ~768×768 square — request square, crop to 9:16 (avoids vertical stretch). */
export const POLLINATIONS_COVER_WIDTH = 1024;
export const POLLINATIONS_COVER_HEIGHT = 1024;

/** Square canvas keeps object proportions natural; we vertical-crop to 9:16 for the reel. */
const OBJECT_COMPOSE_FRAME =
  "square still life album art composition, medium-sized props at natural scale occupying roughly 25-35% of frame, camera pulled back with wide breathing room, atmospheric background and generous margins for vertical reel crop, objects grouped on rule of thirds not dead center, not macro close-up, not oversized hero prop filling frame, natural proportions, no vertical stretch, no elongated props, no people";

/** Native 9:16 Gemini — hero centered with safe margins so nothing clips in the reel editor. */
const GEMINI_REEL_COMPOSE_FRAME =
  "vertical 9:16 portrait album cover photograph, single hero subject centered in frame, generous safe margins on all four edges, subject scaled to fit fully inside the vertical reel viewport, nothing cropped off at frame edges, balanced centered composition, subject occupies roughly 40-55% of frame height, ample breathing room above and below, no elements touching or crossing the frame boundary";

/** Music-leaning Gemini reel frame — environment still centered and fully in view. */
const GEMINI_REEL_ENV_FRAME =
  "vertical 9:16 portrait cinematic album cover, environment and focal subject centered with safe margins, full scene visible inside the vertical reel frame, no clipping at top or bottom edges, balanced centered composition, no people unless explicitly requested in the art direction";

/** @deprecated alias — use OBJECT_COMPOSE_FRAME */
const STILL_LIFE_COMPOSE_FRAME = OBJECT_COMPOSE_FRAME;

/** Music-leaning frame — avoids plain square blocks when the theme is vague or user-directed. */
const MUSIC_COVER_FRAME =
  "vertical cinematic album art, full-frame immersive environment, atmospheric depth, premium music artwork aesthetic, natural proportions, no vertical stretch, no plain solid blocks, no people";

const MONOCHROME_PALETTE =
  "high contrast black and white monochrome photography, silver grey tones, dramatic shadows, no color tint";

const MUSIC_FALLBACK_SCENES = [
  "abstract audio waveform and sound aura in deep teal and violet, luminous morphing energy, premium music artwork, no people",
  "glowing equalizer bars and soft sonic ripples in teal-violet gradient, cinematic music visualization, no people",
  "premium podcast studio microphone on moody desk with teal-violet bokeh lights, atmospheric music cover, no people",
  "floating sound waves and aurora glow in nabad teal and violet colors, abstract music atmosphere, no people",
  "vintage condenser microphone silhouette against soft gradient aura, cinematic music studio mood, no people",
  "rhythmic light pulses and audio spectrum bloom in deep void, elegant music-inspired abstract art, no people",
];

/** Appended to every cover prompt — Flux cannot render humans reliably. */
const NO_HUMANS_GUARD =
  "absolutely no people, no humans, no faces, no hands, no fingers, no bodies, no silhouettes, no portraits, no anatomy, objects and environments only";

/** Strip human-trigger words from any scene phrase (Gemini, user artwork, story). */
const HUMAN_TRIGGER_RE =
  /\b(person|people|human|humans|man|woman|men|women|girl|boy|child|children|baby|couple|crowd|dancer|dancers|performer|performers|musician|musicians|face|faces|facial|portrait|portraits|silhouette|silhouettes|figure|figures|body|bodies|hand|hands|finger|fingers|arm|arms|leg|legs|head|heads|eye|eyes|mouth|mouths|bride|groom|athlete|model|selfie|headshot|head-and-shoulders|waist-up|full-body|close-up|closeup)\b/gi;

/** Keep in sync with hum-track-cover.mjs — no imports here (server loads this via dynamic import). */
const HUM_TRACK_SCENE_GUARD =
  "empty musician studio nook, warm wood table, window sunlight with long shadows, dried botanicals, no instruments visible, no people, no human figures, no faces, no hands, no fingers, no musician, no performer, no body parts";

const NO_TEXT_LEAD =
  "pure photograph with absolutely zero text letters or words visible anywhere, visual scene only, ";

const SAFETY_PREFIX =
  "typography-free pure visual art, textless image, no written language anywhere, ";

const SAFETY_SUFFIX =
  "absolutely no text, no words, no letters, no numbers, no captions, no subtitles, no typography, no writing, no logo text, no song name, no watermark, no readable signage, no speech bubbles, no banners, no posters, no book pages, no diplomas, no certificates, no newspapers, no people, no human figures, fine art photography quality";

const HUM_TRACK_SAFETY_SUFFIX =
  "absolutely no text, no words, no letters, no numbers, no captions, no subtitles, no typography, no writing, no logo text, no song name, no watermark, no readable signage, no people, no faces, no hands, no human figures, fine art photography quality";

const GEMINI_USER_SAFETY_SUFFIX =
  "absolutely no text, no words, no letters, no numbers, no captions, no subtitles, no typography, no writing, no logo text, no song name, no watermark, no readable signage, no speech bubbles, no banners, no posters, fine art photography quality";

const NO_TEXT_REINFORCE =
  "completely wordless photograph, zero readable characters in the entire frame, blank signs, empty screens, no labels";

const NEGATIVE_TEXT_PROMPT =
  "plain solid square block, flat color rectangle, empty geometric block, meaningless placeholder shape, solid teal square, featureless box, blank panel, low detail abstract block, text, words, letters, numbers, typography, font, writing, caption, subtitle, watermark, logo, album cover title, song title, track title, artist name, band name, signage, billboard, poster text, newspaper, book, magazine, speech bubble, label, stamp, signature, handwritten, calligraphy, cursive, script font, decorative lettering, word art, letter shapes, holiday lettering, christmas text, greeting card text, festive banner, neon sign with words, arabic text, english text, quotes, meme text, ui overlay, readable characters, sentences, lyrics on screen, cd cover text, record label, tracklist, credits block, diploma text, certificate text, graffiti letters, title card, greeting card, banner text, embroidered text, carved letters, glowing words, light text, 3d text, people, person, human, humans, humanoid, man, woman, child, baby, crowd, dancer, performer, musician, face, faces, portrait, portraits, silhouette, silhouettes, body, bodies, hand, hands, finger, fingers, arm, arms, leg, legs, head, heads, eye, eyes, mouth, mouths, teeth, nose, ear, skin, anatomy, bad anatomy, deformed anatomy, extra fingers, missing fingers, six fingers, duplicate limbs, floating limbs, mutated hands, broken hands, multiple mouths, crossed eyes, lazy eye, crooked eyes, disfigured face, cropped face, duplicate subject, floating objects, blurry, low quality, jpeg artifacts, oversaturated, distorted perspective, elongated face, stretched portrait, vertically stretched body, squashed proportions, wrong aspect ratio, fisheye portrait, close-up portrait, beauty portrait, fashion portrait, headshot, detailed facial features, recognizable face, portrait photography, full body portrait, tall thin figure, unnaturally long neck, stretched silhouette, selfie, model, fashion model, vertically stretched object, elongated object, stretched props, unnaturally tall object, macro close-up, extreme close-up, oversized object filling entire frame, giant prop dominating frame, object too large, fills frame edge to edge, cropped too tight, tight crop on single prop, low resolution zoom, object touching all four edges";

const STYLE_CORE =
  "premium cinematic visual art, elegant composition, rich color grading, high-end editorial look, moody dark tones with luminous accents, deep teal and violet palette when appropriate, physically plausible lighting, atmospheric depth, immersive environment, balanced vertical composition, professional music-inspired photography, minimal visual noise, high image coherence, clean perspective, symbolic objects only, no human subjects";

const HUM_TRACK_STYLE_CORE =
  "premium cinematic visual art, elegant composition, rich color grading, moody dark tones with luminous accents, deep teal and violet palette, photoreal studio nook still life, props only, warm wood surfaces, window sunlight with long shadows, dried botanical accents, balanced composition, professional studio photography, minimal visual noise, high image coherence, clean perspective, no instruments visible, no human subjects";

const USER_STYLE_CORE =
  "cinematic lighting, rich color grading, high-end editorial look";

const MOOD_PALETTES = {
  love: "rose gold warm glow, soft magenta lighting, warm coral highlights, violet dusk atmospheric haze",
  party: "electric teal, cool cyan lighting, vivid violet, soft purple atmospheric glow, gold sparkle, neon bloom",
  happy: "bright teal, cool cyan lighting, sunny amber warmth, soft white bloom",
  sad: "deep indigo, muted blue atmospheric haze, muted violet, cold teal whisper",
  chill: "deep teal, cool cyan lighting, soft cyan mist, muted violet atmospheric glow",
  wedding: "champagne gold warm glow, ivory soft light, soft violet atmospheric haze",
  hype: "aggressive teal, cool cyan rim light, sharp violet, soft purple atmospheric glow, high contrast",
  dark: "near-black void, deep purple atmospheric haze, toxic teal trace glow",
  dreamy: "lavender soft glow, teal mist, pearlescent white light",
  epic: "royal violet, soft purple atmospheric glow, teal beam, bright gold crest light",
  default: "deep void black, deep teal, cool cyan lighting, rich violet, soft purple atmospheric glow, rose-gold accent warm glow",
};

/** Story themes — chosen from title + lyrics + style, highest match wins. */
const STORY_THEMES = [
  {
    id: "winter_festive",
    re: /christmas|xmas|noël|noel|holiday season|winter lights|yuletide|santa|snowman|بيت الميلاد|عيد/i,
    scene:
      "cozy winter evening atmosphere, evergreen tree with warm golden lights and glowing star, soft snowfall bokeh, home warmth mood, no people, no writing",
    visualMode: "landscape",
    bucket: "happy",
  },
  {
    id: "prom_formal",
    re: /prom|prom night|homecoming|formal dance|school dance|senior year|senior night|university ball|college ball|graduation ball|graduation night|debs|matric|leaving cert|bal de promo|soirée de promo|حفل التخرج|حفل تخرج|سهرة تخرج|بروف|promenade/i,
    scene:
      "elegant ballroom still life, crystal chandelier bokeh, formal table setting with candles and sequin fabric, festive celebration mood, no people",
    visualMode: "still_life",
    bucket: "party",
  },
  {
    id: "graduation",
    re: /graduation|graduate|diploma|commencement|cap and gown|mortarboard|تخرج/i,
    scene:
      "graduation still life, mortarboard cap and rolled diploma on dark velvet, golden tassel detail, confetti scatter, proud celebratory mood, no people",
    visualMode: "still_life",
    bucket: "happy",
  },
  {
    id: "wedding",
    re: /wedding|bridal|bride|groom|marriage|ceremony|first dance|dabke entrance|زفاف|عرس|عروس/i,
    scene:
      "wedding still life, diamond solitaire rings on ivory satin, soft floral bouquet and champagne gold bokeh, elegant ceremony mood, no people",
    visualMode: "still_life",
    bucket: "wedding",
  },
  {
    id: "club_night",
    re: /club|nightclub|dj|afterparty|turn up|night out|rave|discoteca|ملهى|نادي/i,
    scene:
      "nightclub still life, neon lights and disco ball reflections, cocktail glass bokeh on bar counter, high energy mood, no people",
    visualMode: "still_life",
    bucket: "party",
  },
  {
    id: "concert_stage",
    re: /concert|festival|live show|on stage|stadium|arena|tour|headliner|حفلة|مسرح/i,
    scene:
      "empty concert stage still life, dramatic spotlights and microphone stand on dark stage, epic scale, no people",
    visualMode: "still_life",
    bucket: "hype",
  },
  {
    id: "heartbreak",
    re: /heartbreak|broken heart|goodbye|farewell|miss you|without you|left me|tears|lonely|alone|empty|goodnight|وداع|فراق|وحيد|بكي|دمع/i,
    scene:
      "melancholic still life, wilted rose and rain-streaked window glass, empty teacup on windowsill, quiet emotional weight, no people",
    visualMode: "still_life",
    bucket: "sad",
  },
  {
    id: "romance",
    re: /love you|my love|romantic|romance|darling|valentine|kiss|together forever|habibi|habibti|حبيب|حبيبي|حبيبتي|عشق|حب|قلبي/i,
    scene:
      "romantic still life, intertwined gold rings and soft candlelight on dark surface, rose petals scatter, tender warmth, no people",
    visualMode: "still_life",
    bucket: "love",
  },
  {
    id: "family_home",
    re: /mother|father|mom|dad|family|home|childhood|house|village|grandma|grandpa|أم|أبي|بيت|عائلة|أهل/i,
    scene:
      "warm nostalgic home atmosphere, cozy house with glowing windows at twilight, gentle emotional mood, no people required",
    visualMode: "landscape",
    bucket: "dreamy",
  },
  {
    id: "city_street",
    re: /city|street|downtown|urban|skyline|neighborhood|block|metro|subway|taxi|مدينة|شارع|حي/i,
    scene:
      "cinematic urban night atmosphere, city skyline or wet street reflections, moody premium noir lighting",
    visualMode: "landscape",
    bucket: "dark",
  },
  {
    id: "ocean_beach",
    re: /ocean|sea|beach|waves|shore|coast|sailing|boat|ship|بحر|شاطئ|موج/i,
    scene:
      "coastal atmosphere, ocean horizon with cinematic sky glow, emotional spacious mood",
    visualMode: "landscape",
    bucket: "chill",
  },
  {
    id: "mountains",
    re: /mountain|peak|summit|alps|valley|hill|cliff|canyon|desert|جبل|جبال|صحر/i,
    scene:
      "grand mountain landscape at dusk, dramatic peaks and god rays, epic cinematic scale, no people",
    visualMode: "landscape",
    bucket: "epic",
  },
  {
    id: "rain_storm",
    re: /rain|storm|thunder|lightning|flood|wind|hurricane|مطر|عاصف/i,
    scene:
      "stormy atmospheric mood, rain-swept darkness with single luminous accent, cinematic tension",
    visualMode: "landscape",
    bucket: "dark",
  },
  {
    id: "nature_calm",
    re: /forest|meadow|garden path|flower field|riverbank|lakeside|waterfall|orchard|wildflower|غابة|حديقة|زهرة|نهر|غروب/i,
    scene:
      "serene organic still life, botanical props and soft window light on a surface, calm natural mood, no people",
    visualMode: "still_life",
    bucket: "chill",
  },
  {
    id: "workout_power",
    re: /workout|gym|training|run|running|champion|victory|win|power|beast mode|anthem|كأس|بطل|قوة/i,
    scene:
      "athletic still life, kettlebell and running shoes on gym floor, dramatic backlight streaks, kinetic energy mood, no people",
    visualMode: "still_life",
    bucket: "hype",
  },
  {
    id: "celebration",
    re: /party|celebration|birthday|cheers|toast|dance|dancing|fiesta|celebrate|احتفال|رقص|عيد/i,
    scene:
      "celebration still life, confetti burst and champagne flute bokeh, warm festive lights, joyful mood, no people",
    visualMode: "still_life",
    bucket: "party",
  },
  {
    id: "dreamy_ethereal",
    re: /dream|dreamy|ethereal|float|cosmic|space|galaxy|nebula|magic|fantasy|حلم|فضاء/i,
    scene:
      "surreal dreamlike abstract atmosphere, soft fog and pearlescent light, weightless magical mood, no figures",
    visualMode: "abstract",
    bucket: "dreamy",
  },
];

const ABSTRACT_FALLBACKS = MUSIC_FALLBACK_SCENES;

const COMPOSITIONS = [
  "centered single focal subject with strong negative space",
  "symmetrical balanced composition with clear focal point",
  "rule of thirds framing with one dominant subject",
  "centered subject with clean horizon and balanced weight",
  "symmetric composition with single clear focal subject",
  "rule of thirds with subject placed on vertical third",
];

const OBJECT_COMPOSITIONS = [
  "medium-scale props on a surface with generous negative space, object presence about 30% of frame, safe margins for vertical crop",
  "modest-sized symbolic objects on rule-of-thirds placement, wide environmental context, pulled-back camera distance",
  "editorial still life with small-to-medium props, natural viewing distance, atmospheric background clearly visible",
  "grouped objects at moderate scale in lower or upper third, ample empty space around edges for reel framing",
];

const GEMINI_REEL_COMPOSITIONS = [
  "hero subject dead-center with equal negative space on left and right, scaled to fit entirely inside the 9:16 frame",
  "centered focal subject with wide safe margins above and below, nothing clipped at the top or bottom of the reel",
  "symmetrical centered composition, subject fully visible inside vertical portrait safe zone, moderate scale not edge-to-edge",
  "single dominant subject centered on the vertical midline, generous padding on all sides for reel crop safety",
];

const CONCRETE_OBJECT_RE =
  /\b(balloon|balloons|cake|cupcake|heart|hearts|ring|rings|flower|flowers|rose|roses|candle|candles|gift|gifts|present|presents|moon|sun|clock|book|key|keys|cup|glass|wine|champagne|confetti|diamond|gem|jewel|umbrella|chair|table|lamp|lantern|snowflake|snowman|pumpkin|cross|anchor|camera|phone|shell|feather|butterfly|bear|teddy|toy|box|treasure|coin|medal|trophy|graduation|mortarboard|diploma|wedding|bouquet|chandelier|microphone|guitar|piano|violin|drum|instrument|cookie|cookies|donut|doughnut|ice cream|pizza|fruit|apple|orange|lemon|cherry|cherries|pearl|pearl necklace|necklace|bracelet|watch|shoe|shoes|hat|scarf|envelope|letter|envelope|flag|firework|fireworks|sparkler|sparklers|velvet|satin|ribbon|ribbons|bow|bows|fries|french fries|burger|hamburger|taco|tacos|sushi|ramen|noodles|pasta|sandwich|steak|salad|coffee|espresso|latte|tea|cocktail|beer|food|meal|snack|breakfast|brunch|dinner|lunch|dessert|pastry|bread|toast|cheese|wine glass|milkshake|smoothie|cupcake|croissant)\b/i;

const SCENE_ENVIRONMENT_RE =
  /\b(old\s+house|abandoned|ruins?|castle|cottages?|cabin|barn|farm|village|mansion|building|buildings|architecture|architectural|house|houses|home|homes|homestead|hut|shack|palace|tower|temple|church|cathedral|mosque|lighthouse|skyline|cityscape|city|street|alley|road|highway|bridge|forest|woods|jungle|desert|beach|coast|ocean|sea|lake|river|waterfall|mountain|mountains|hill|hills|valley|meadow|field|garden|park|sunset|sunrise|twilight|landscape|environment|horizon|countryside|rural|urban|industrial|warehouse|factory|suburb|neighborhood|neighbourhood|rooftop|balcony|porch|path|trail|canyon|cliff|island|harbor|harbour|port|market|square|plaza|downtown|skyscraper|apartment|condo|hotel|motel|inn|shop|storefront|cafe|restaurant|bar|pub|library|museum|school|university|campus|stadium|arena|theater|theatre|cinema|station|airport|runway|dock|pier|marina|grove|orchard|vineyard|winery|cemetery|graveyard|monument|statue|fountain|dam|tunnel|subway|metro|train|railway|railroad|platform|tree|trees|car|cars|boat|boats|plane|planes|bicycle|bike|door|doors|window|windows)\b/i;

/** Mood / occasion regen hints (birthday, love, …) → symbolic still life, not landscape haze. */
const REGEN_MOOD_HINTS = [
  {
    id: "celebration",
    re: /\b(birthday|bday|happy birthday|party|celebration|celebrate|fiesta|cheers|toast|confetti|festive|anniversary|new year|graduation|prom|عيد ميلاد|احتفال)\b/i,
    scene:
      "celebration still life, colorful balloons and soft candle glow on a festive surface, confetti scatter and champagne flute bokeh, warm joyful party mood, no people",
    bucket: "party",
  },
  {
    id: "romance",
    re: /\b(love|romantic|romance|valentine|darling|heartfelt|passion|habibi|habibti|حب|عشق|قلبي)\b/i,
    scene:
      "romantic still life, intertwined gold rings and soft candlelight on dark surface, rose petals scatter, tender warmth, no people",
    bucket: "love",
  },
  {
    id: "heartbreak",
    re: /\b(heartbreak|broken heart|goodbye|farewell|miss you|lonely|alone|sad|melancholy|tears|وداع|وحيد)\b/i,
    scene:
      "melancholic still life, wilted rose and rain-streaked window glass, empty teacup on windowsill, quiet emotional weight, no people",
    bucket: "sad",
  },
  {
    id: "wedding",
    re: /\b(wedding|bridal|bride|groom|engagement|marriage|زفاف|عرس|عروس)\b/i,
    scene:
      "wedding still life, diamond solitaire rings on ivory satin, soft floral bouquet and champagne gold bokeh, elegant ceremony mood, no people",
    bucket: "wedding",
  },
  {
    id: "christmas",
    re: /\b(christmas|xmas|noël|noel|holiday season|yuletide|بيت الميلاد)\b/i,
    scene:
      "cozy winter still life, miniature evergreen tree with warm golden lights and glowing star, soft snowfall bokeh, festive warmth, no people",
    bucket: "happy",
  },
  {
    id: "hype",
    re: /\b(hype|energy|power|beast|anthem|champion|victory|workout|gym|training)\b/i,
    scene:
      "athletic still life, kettlebell and running shoes on gym floor, dramatic backlight streaks, kinetic energy mood, no people",
    bucket: "hype",
  },
  {
    id: "chill",
    re: /\b(chill|calm|peace|peaceful|relax|ambient|lofi|lo-fi|serene|zen)\b/i,
    scene:
      "serene organic still life, botanical props and soft window light on a surface, calm natural mood, no people",
    bucket: "chill",
  },
  {
    id: "dark",
    re: /\b(dark|noir|gothic|sinister|brooding|moody|midnight)\b/i,
    scene:
      "moody still life, single flickering candle on dark velvet, deep shadows and teal-violet rim light, cinematic tension, no people",
    bucket: "dark",
  },
];

const WILDLIFE_ARTWORK_RE =
  /\b(bird|birds|songbird|eagle|owl|hawk|parrot|crow|raven|dove|sparrow|robin|flamingo|peacock|swan|duck|hummingbird|penguin|butterfly|butterflies|dragonfly|fish|koi|whale|dolphin|seal|turtle|horse|wolf|lion|tiger|deer|fox|rabbit|bunny|squirrel|animal|animals|wildlife)\b/i;

function isPetPropHint(text) {
  return /\b(dog|puppy|cat|kitten|pet)\b/i.test(String(text || ""));
}

export function isWildlifeArtworkHint(text) {
  const s = String(text || "");
  if (isPetPropHint(s)) return false;
  return WILDLIFE_ARTWORK_RE.test(s);
}

/** Any explicit regen hint from the user — block song story bleed, not always still life. */
export function isUserDirectedRegenHint(text) {
  return String(text || "").trim().length >= 2;
}

export function isSceneEnvironmentHint(text) {
  return SCENE_ENVIRONMENT_RE.test(String(text || ""));
}

export function resolveRegenMoodFromHint(text) {
  const s = String(text || "").trim();
  if (s.length < 2) return null;
  let best = null;
  let bestScore = 0;
  for (const row of REGEN_MOOD_HINTS) {
    const m = s.match(row.re);
    if (!m) continue;
    let score = m[0].length;
    if (s.length <= m[0].length + 6) score += 12;
    if (score > bestScore) {
      bestScore = score;
      best = row;
    }
  }
  return best;
}

export function isOccasionMoodRegenHint(text) {
  return Boolean(resolveRegenMoodFromHint(text));
}

export function shouldUseLiteralSubjectMode(hint, { userArtworkOverride = "" } = {}) {
  const prepared = String(userArtworkOverride || hint || "").trim();
  if (prepared.length < 2 || isSceneEnvironmentHint(prepared)) return false;
  if (isOccasionMoodRegenHint(prepared) || isWildlifeArtworkHint(prepared)) return true;
  return isConcreteObjectArtworkHint(prepared) || isFoodArtworkHint(prepared);
}

export function shouldUseConcreteSubjectDna(hint, opts = {}) {
  return shouldUseLiteralSubjectMode(hint, opts) || isWildlifeArtworkHint(String(opts.userArtworkOverride || hint || "").trim());
}

function isFoodArtworkHint(text) {
  return /\b(fries|french fries|burger|hamburger|taco|tacos|sushi|ramen|noodles|pizza|pasta|sandwich|steak|salad|coffee|espresso|latte|tea|cocktail|beer|food|meal|snack|breakfast|brunch|dinner|lunch|dessert|pastry|bread|toast|cheese|milkshake|smoothie|croissant|fried chicken|chicken wings|hot dog|nachos|burrito|dim sum|dumpling|dumplings)\b/i.test(String(text || ""));
}

function clamp(n, lo, hi) {
  return Math.min(hi, Math.max(lo, n));
}

export function fnv1a(str) {
  let h = 2166136261;
  const s = String(str || "");
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function parseTempo(input) {
  if (typeof input === "number" && Number.isFinite(input)) return clamp(Math.round(input), 40, 200);
  const m = String(input || "").match(/(\d{2,3})\s*bpm/i);
  return m ? clamp(parseInt(m[1], 10), 40, 200) : null;
}

function parseEnergy(input) {
  if (typeof input === "number" && Number.isFinite(input)) return clamp(input, 0, 1);
  const s = String(input || "").toLowerCase();
  if (/low|soft|gentle|calm|slow/.test(s)) return 0.28;
  if (/high|intense|hype|hard|aggressive/.test(s)) return 0.88;
  if (/mid|medium|moderate/.test(s)) return 0.55;
  return 0.5;
}

function parseBrightness(input) {
  if (typeof input === "number" && Number.isFinite(input)) return clamp(input, 0, 1);
  const s = String(input || "").toLowerCase();
  if (/dark|moody|dim|noir|midnight/.test(s)) return 0.25;
  if (/bright|neon|vivid|luminous|glow/.test(s)) return 0.82;
  return 0.5;
}

function inferSonicProfile(text) {
  const s = String(text || "").toLowerCase();
  const elec = /electronic|edm|synth|techno|house|trap|808|digital|hyperpop|drill/.test(s);
  const acou = /acoustic|nylon|fingerpick|unplugged|organic|live room|piano|strings|oud|guitar/.test(s);
  if (elec && !acou) return "electronic";
  if (acou && !elec) return "acoustic";
  return "balanced";
}

/** Full story text used for theme + seed (title weighs heavily). */
export function buildStoryBlob(input) {
  const title = String(input?.title || "").trim();
  const mood = String(input?.mood || "").trim();
  const genre = String(input?.genre || input?.style || "").trim();
  const style = String(input?.style || "").trim();
  const styleSent = String(input?.styleSent || "").trim();
  const lyrics = String(input?.lyrics || input?.lyricsInput || "").trim();
  const finalPrompt = String(input?.finalPrompt || "").trim();
  const lyricsExcerpt = lyrics.replace(/\[[^\]]*\]/g, " ").replace(/\s+/g, " ").trim().slice(0, 600);
  return [title, title, mood, genre, style, styleSent, finalPrompt, lyricsExcerpt].filter(Boolean).join(" ");
}

function scoreTheme(theme, blob) {
  const m = blob.match(theme.re);
  if (!m) return 0;
  let score = 1;
  const hit = m[0] || "";
  const idx = blob.toLowerCase().indexOf(hit.toLowerCase());
  if (idx >= 0 && idx < 160) score += 2;
  return score;
}

/** Broad landscape themes need a title-area hit — weak lyric matches caused generic hills/mountains. */
function themeQualifies(theme, storyScore) {
  if (!theme || storyScore <= 0) return false;
  if (theme.id === "nature_calm" && storyScore < 3) return false;
  if (theme.id === "family_home" && storyScore < 2) return false;
  if (theme.id === "mountains" && storyScore < 2) return false;
  return true;
}

export function resolveStoryTheme(input) {
  const blob = buildStoryBlob(input);
  let best = null;
  let bestScore = 0;
  for (const theme of STORY_THEMES) {
    const score = scoreTheme(theme, blob);
    if (score > bestScore) {
      bestScore = score;
      best = theme;
    }
  }
  if (best && !themeQualifies(best, bestScore)) {
    return { theme: null, blob, storyScore: 0 };
  }
  return { theme: best, blob, storyScore: bestScore };
}

export function classifyVisualBucket(input) {
  const blob = buildStoryBlob(input);
  const energy = parseEnergy(input?.energy);
  const { theme } = resolveStoryTheme(input);
  if (theme) return theme.bucket;

  const lower = blob.toLowerCase();
  if (/dark|noir|gothic|sinister|brooding|evil|shadow|drill|trap/.test(lower)) return "dark";
  if (/sad|melanchol|lonely|tears/.test(lower)) return "sad";
  if (/happy|joy|uplift|cheerful|smile/.test(lower)) return "happy";
  if (/love|romantic|heart|passion/.test(lower)) return "love";
  if (/epic|cinematic|orchestral|heroic|grand|anthemic/.test(lower)) return "epic";
  if (/chill|lofi|lo-fi|calm|relax|ambient|peaceful/.test(lower)) return "chill";
  if (energy > 0.78) return "party";
  if (energy < 0.32) return "chill";
  return "default";
}

function pickFrom(list, seedKey, salt) {
  if (!list?.length) return "";
  return list[fnv1a(`${seedKey}:${salt}`) % list.length];
}

function isMonochromeArtworkHint(text) {
  return /\b(black\s*(and|&)\s*white|b&w|monochrome|grayscale|greyscale)\b/i.test(String(text || ""));
}

function isSkyOrSpaceHint(text) {
  return /\b(star|stars|starry|night sky|galaxy|cosmos|space|nebula|milky way|aurora|constellation)\b/i.test(String(text || ""));
}

export function isConcreteObjectArtworkHint(text) {
  return CONCRETE_OBJECT_RE.test(String(text || ""));
}

export function compositionPhraseForCover(songId, artworkText = "", visualMode = "", { geminiReel = false } = {}) {
  const mode = String(visualMode || "").toLowerCase();
  if (geminiReel) {
    return GEMINI_REEL_COMPOSITIONS[fnv1a(`${songId}:gemini-reel`) % GEMINI_REEL_COMPOSITIONS.length];
  }
  if (isSceneEnvironmentHint(artworkText)) {
    return COMPOSITIONS[fnv1a(`${songId}:scene-comp`) % COMPOSITIONS.length];
  }
  if (
    isOccasionMoodRegenHint(artworkText) ||
    isConcreteObjectArtworkHint(artworkText) ||
    isFoodArtworkHint(artworkText) ||
    mode === "still_life"
  ) {
    const key =
      isConcreteObjectArtworkHint(artworkText) || isFoodArtworkHint(artworkText) || isOccasionMoodRegenHint(artworkText)
        ? "obj-comp"
        : "still-comp";
    return OBJECT_COMPOSITIONS[fnv1a(`${songId}:${key}`) % OBJECT_COMPOSITIONS.length];
  }
  return COMPOSITIONS[fnv1a(`${songId}:composition`) % COMPOSITIONS.length];
}

function enrichUserArtworkHint(raw) {
  let s = String(raw || "").trim();
  if (!s) return s;
  const moodTheme = resolveRegenMoodFromHint(s);
  const hasSceneSubject = isSceneEnvironmentHint(s);
  const hasObjectSubject = !hasSceneSubject && (isConcreteObjectArtworkHint(s) || isFoodArtworkHint(s) || Boolean(moodTheme));
  if (moodTheme && !/still life|focal subject|no people|balloons|rings|candle|confetti|rose petals/i.test(s)) {
    s = `${s}, ${moodTheme.scene}`;
  }
  if (hasSceneSubject && !/cinematic|architectural|environment|focal subject|atmospheric|wide composition|no people/i.test(s)) {
    s = `${s}, cinematic architectural environment photograph, the requested place or building clearly visible as the focal subject, atmospheric depth, wide environmental composition, no people`;
  }
  if (!hasObjectSubject && !hasSceneSubject) {
    if (/\bstar\s*sky\b/i.test(s)) {
      s = s.replace(/\bstar\s*sky\b/gi, "night sky filled with stars and soft cosmic glow");
    } else if (/\bstarry\b/i.test(s) && !/night sky/i.test(s)) {
      s = `${s}, night sky filled with stars`;
    }
  }
  if (/\bhearts?\b/i.test(s) && !/heart-shaped|heart shape|still life/i.test(s)) {
    s = `${s}, decorative heart-shaped prop as the clear focal subject`;
  }
  if (/\b(flowers?|roses?|bouquet|wildflowers?|bloom|blooms)\b/i.test(s) && !/botanical|still life|focal subject|recognizable/i.test(s)) {
    s = `${s}, beautiful botanical still life with clear recognizable flowers as the focal subject`;
  }
  if (isFoodArtworkHint(s) && !/still life|focal subject|recognizable|food photography/i.test(s)) {
    s = `${s}, appetizing food still life photograph with the requested food clearly visible and recognizable as the main subject`;
  }
  if (isWildlifeArtworkHint(s) && !/wildlife|perched|in flight|focal subject|clearly visible|no people/i.test(s)) {
    s = `${s}, photorealistic wildlife nature photograph, the requested bird or animal clearly visible as the single main focal subject, sharp natural detail, no people`;
  }
  if (/\b(dog|puppy|cat|pet)\b/i.test(s) && !/still life|leash|bowl|collar|paw print/i.test(s)) {
    s = `${s}, cozy pet leash and water bowl still life, warm soft light, no animals, no people`;
  }
  if (/\b(microphone|mic|podcast|equalizer|waveform|sound wave|audio)\b/i.test(s) && !/music|studio/i.test(s)) {
    s = `${s}, premium music studio atmosphere`;
  }
  if (hasObjectSubject && !/medium.?sized|modest scale|pulled back|negative space|30%|one-third|not close-up|not oversized|focal subject/i.test(s)) {
    s = `${s}, medium-sized still life props with generous negative space, not close-up, not oversized`;
  }
  return s.replace(/\s+/g, " ").trim().slice(0, 280);
}

function composeFrameForArtwork(userArtwork, { literalSubject = false, wildlifeSubject = false, geminiReel = false } = {}) {
  if (geminiReel) {
    if (wildlifeSubject || isWildlifeArtworkHint(userArtwork)) {
      return `${GEMINI_REEL_COMPOSE_FRAME}, natural environment, single wildlife subject as clear centered focal point`;
    }
    if (isSceneEnvironmentHint(userArtwork) || isSkyOrSpaceHint(userArtwork) || /landscape|ocean|mountain|city|skyline|environment|horizon/i.test(userArtwork)) {
      return GEMINI_REEL_ENV_FRAME;
    }
    return GEMINI_REEL_COMPOSE_FRAME;
  }
  if (wildlifeSubject || isWildlifeArtworkHint(userArtwork)) {
    return "vertical cinematic album art, natural environment, single wildlife subject as clear focal point, atmospheric depth, no people";
  }
  if (
    literalSubject ||
    isOccasionMoodRegenHint(userArtwork) ||
    ((isConcreteObjectArtworkHint(userArtwork) || isFoodArtworkHint(userArtwork)) && !isSceneEnvironmentHint(userArtwork))
  ) {
    return OBJECT_COMPOSE_FRAME;
  }
  if (isSceneEnvironmentHint(userArtwork) || isSkyOrSpaceHint(userArtwork) || /landscape|ocean|mountain|city|skyline|environment|horizon/i.test(userArtwork)) {
    return "vertical cinematic album art, wide atmospheric environment, immersive environmental depth, architectural or landscape focal subject, no people";
  }
  return MUSIC_COVER_FRAME;
}

function paletteForUserArtwork(userArtwork, bucketKey) {
  if (isMonochromeArtworkHint(userArtwork)) return MONOCHROME_PALETTE;
  if (isSkyOrSpaceHint(userArtwork)) {
    return "deep midnight blue, soft starlight silver, subtle violet atmospheric haze";
  }
  return moodPaletteForBucket(bucketKey);
}

function prepareDirectUserArtworkHint(raw, { allowHumans = false } = {}) {
  let s = toVisualOnlyPrompt(String(raw || "").trim(), { title: "" });
  s = enrichUserArtworkHint(s);
  if (!allowHumans) s = enforceNoHumansScene(s);
  return s.replace(/\s+/g, " ").trim().slice(0, 280);
}

export { prepareDirectUserArtworkHint };

/** @deprecated Prefer buildAbstractCoverPrompt with userArtworkOverride + Visual Director. */
export function buildUserRegenCoverPrompt(hint, { songId = "", regenSalt = "", coverInput = null } = {}) {
  const userArtwork = prepareDirectUserArtworkHint(hint);
  if (!userArtwork) return null;
  if (coverInput && typeof coverInput === "object") {
    const built = buildAbstractCoverPrompt(
      { ...coverInput, artworkHint: userArtwork, artworkStyle: userArtwork },
      { regenSalt, userArtworkOverride: userArtwork },
    );
    if (built?.prompt) return built;
  }
  const seed = buildCoverSeed({ songId }, "user_regen", "default", userArtwork, regenSalt);
  const frame = shouldUseLiteralSubjectMode(hint, { userArtworkOverride: userArtwork })
    ? OBJECT_COMPOSE_FRAME
    : isSceneEnvironmentHint(userArtwork)
      ? "vertical cinematic album art, wide atmospheric environment, immersive environmental depth, architectural or landscape focal subject, no people"
      : MUSIC_COVER_FRAME;
  const prompt = [
    `album art photograph, ${userArtwork} as the single clear focal subject filling the visual idea`,
    frame,
    userArtwork,
    compositionPhraseForCover(songId, userArtwork, "user_directed"),
    NO_HUMANS_GUARD,
    "cinematic lighting, rich color grading, no text, no words, no letters, no typography, no people",
  ]
    .filter(Boolean)
    .join(", ");
  return {
    prompt,
    seed,
    bucket: "default",
    visualMode: "user_directed",
    storyTheme: "user_regen",
    artworkSource: "user_artwork",
    params: { songId, userArtwork, userArtworkRaw: String(hint || "").trim() },
  };
}

function moodBucketFallback(bucketKey, energy) {
  const palette = MOOD_PALETTES[bucketKey] || MOOD_PALETTES.default;
  if (bucketKey === "party" || bucketKey === "hype") {
    return {
      scene: pickFrom(MUSIC_FALLBACK_SCENES, bucketKey, "party-music"),
      visualMode: "abstract",
      palette,
    };
  }
  if (bucketKey === "love") {
    return {
      scene: "romantic still life, roses and soft golden candlelight on dark surface, no people",
      visualMode: "still_life",
      palette,
    };
  }
  if (bucketKey === "sad") {
    return {
      scene: "melancholic still life, single wilted flower and moody rain-lit window, no people",
      visualMode: "still_life",
      palette,
    };
  }
  if (bucketKey === "wedding") {
    return {
      scene: "wedding still life, diamond rings on satin with soft floral glow, no people",
      visualMode: "still_life",
      palette,
    };
  }
  if (energy > 0.7) {
    return {
      scene: pickFrom(MUSIC_FALLBACK_SCENES, bucketKey, "energy-music"),
      visualMode: "abstract",
      palette,
    };
  }
  return {
    scene: pickFrom(MUSIC_FALLBACK_SCENES, bucketKey, "abstract-fallback"),
    visualMode: "abstract",
    palette,
  };
}

function userRegenAvoidTags(userArtwork) {
  const hint = String(userArtwork || "").trim();
  const landscapeBlock =
    "mountain, mountains, hill, hills, mountain range, alps, peak, peaks, generic landscape, scenic vista, wide landscape, nature panorama, ocean horizon, empty haze, fog only, abstract atmosphere only";
  const stillLifeBlock =
    "table still life, props on table, random objects on surface, food on table, macro close-up, unrelated still life, generic props, kitchen counter scene";
  if (!hint) {
    return `${landscapeBlock}, ${stillLifeBlock}`;
  }
  if (/\b(mountain|mountains|peak|peaks|alps|hill|hills|beach|ocean|city|skyline)\b/i.test(hint)) {
    return stillLifeBlock;
  }
  if (isSceneEnvironmentHint(hint)) {
    return stillLifeBlock;
  }
  if (isOccasionMoodRegenHint(hint) || isFoodArtworkHint(hint) || isConcreteObjectArtworkHint(hint) || isWildlifeArtworkHint(hint)) {
    return landscapeBlock;
  }
  return landscapeBlock;
}

function landscapeAntiMountainAvoid(storyThemeId, userArtwork = "") {
  const id = String(storyThemeId || "").trim();
  if (id === "user_regen") {
    return userRegenAvoidTags(userArtwork);
  }
  if (id === "mountains" || id === "ocean_beach" || id === "city_street" || id === "rain_storm") {
    return "";
  }
  return "mountain, mountains, hill, hills, mountain range, alps, peak, peaks, generic landscape";
}

function buildSceneFromStory(input) {
  const energy = parseEnergy(input?.energy);
  const { theme, blob, storyScore } = resolveStoryTheme(input);
  const bucketKey = theme?.bucket || classifyVisualBucket(input);
  const palette = MOOD_PALETTES[bucketKey] || MOOD_PALETTES.default;

  if (theme && storyScore > 0) {
    return {
      scene: `${theme.scene}, ${palette}`,
      visualMode: theme.visualMode,
      storyTheme: theme.id,
      bucketKey,
    };
  }

  const fallback = moodBucketFallback(bucketKey, energy);
  return {
    scene: `${fallback.scene}, ${fallback.palette}`,
    visualMode: fallback.visualMode,
    storyTheme: "mood_fallback",
    bucketKey,
  };
}

function sonicPhrase(profile) {
  if (profile === "electronic") return "glassy sheen, subtle neon sparkle";
  if (profile === "acoustic") return "organic warmth, natural soft light";
  return "polished cinematic finish";
}

function tempoPhrase(tempo) {
  if (tempo == null) return "";
  if (tempo < 75) return "very slow contemplative pacing";
  if (tempo < 100) return "gentle unhurried mood";
  if (tempo < 125) return "moderate rhythmic energy";
  return "lively bright kinetic mood";
}

function brightnessPhrase(brightness) {
  if (brightness < 0.35) return "mostly dark with restrained highlights";
  if (brightness > 0.7) return "brighter highlights against deep shadows";
  return "balanced contrast";
}

const STORY_MOOD_PHRASES = {
  winter_festive: "cozy winter festive atmosphere",
  prom_formal: "formal dance celebration atmosphere",
  graduation: "proud graduation celebration atmosphere",
  wedding: "elegant wedding ceremony atmosphere",
  club_night: "nightlife dance celebration atmosphere",
  concert_stage: "live concert performance atmosphere",
  heartbreak: "lonely heartbreak atmosphere",
  romance: "intimate romantic atmosphere",
  family_home: "warm nostalgic home atmosphere",
  city_street: "urban cinematic night atmosphere",
  ocean_beach: "coastal emotional atmosphere",
  mountains: "epic mountain landscape atmosphere",
  rain_storm: "stormy melancholic atmosphere",
  nature_calm: "serene natural landscape atmosphere",
  workout_power: "intense athletic power atmosphere",
  celebration: "joyful party celebration atmosphere",
  dreamy_ethereal: "dreamy surreal atmosphere",
  mood_fallback: "premium emotional music atmosphere",
};

function storyMoodPhrase(storyTheme) {
  return STORY_MOOD_PHRASES[storyTheme] || STORY_MOOD_PHRASES.mood_fallback;
}

function bucketMoodPhrase(bucketKey) {
  const map = {
    love: "romantic emotional tone",
    party: "festive energetic tone",
    happy: "uplifting joyful tone",
    sad: "melancholic emotional tone",
    chill: "calm peaceful tone",
    wedding: "elegant ceremonial tone",
    hype: "intense powerful tone",
    dark: "moody noir tone",
    dreamy: "ethereal dreamy tone",
    epic: "grand cinematic tone",
    default: "balanced premium tone",
  };
  return map[bucketKey] || map.default;
}

const TEXT_REQUEST_RE =
  /\b(with|include|show|add|display|featuring)\s+(the\s+)?(song\s+|album\s+)?(title|name|text|words|letters|typography|caption|subtitle|lyrics|label|watermark|logo\s+text?)\b/gi;
const TYPOGRAPHY_RE =
  /\b(album cover with text|text overlay|title on cover|song title on|artist name on cover|readable text on|written words on|watermark text|logo text on)\b/gi;

const COVER_ART_INLINE_RE =
  /(?:cover art|cover look|artwork|visual mood|visual style)\s*[:：]\s*([^|;]+)/i;

/** Words/models often render as on-image typography — swap for pure visual descriptions. */
const TEXT_TRIGGER_REPLACEMENTS = [
  ["christmas glow", "warm evergreen tree with golden lights and star glow"],
  ["christmas tree", "evergreen tree with warm golden lights and star topper"],
  ["christmas", "evergreen tree with warm golden lights and star"],
  ["xmas", "evergreen tree with warm golden lights"],
  ["birthday", "celebration balloons and soft candle glow still life"],
  ["happy birthday", "celebration balloons and soft candle glow"],
  ["new year", "midnight fireworks and sparkling lights"],
  ["congratulations", "confetti burst and golden celebration light"],
  ["merry", "festive warm light"],
  ["holiday", "festive winter season atmosphere"],
  ["greeting card", "blank textured paper surface"],
  ["signature version", ""],
  ["signature", ""],
  ["hum track", "musician studio nook still life with props, no instruments visible"],
  ["album cover art", "cinematic still life"],
  ["album cover", "cinematic still life"],
  ["portrait", "symbolic object still life"],
  ["silhouette", "symbolic object still life"],
  ["couple", "intertwined rings still life"],
  ["person", "symbolic object"],
  ["people", "symbolic objects"],
];

function stripTitleTokens(text, title) {
  let s = String(text || "");
  const tokens = String(title || "")
    .split(/[\s\-–—|:,]+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 3 && !/^(the|and|for|with|song|mix|version|edit|remix)$/i.test(t));
  for (const tok of tokens) {
    const esc = tok.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    s = s.replace(new RegExp(`\\b${esc}\\b`, "gi"), " ");
  }
  return s.replace(/\s+/g, " ").trim();
}

/** Convert labels/titles/holiday words into visual-only language for the image model. */
export function toVisualOnlyPrompt(raw, { title = "" } = {}) {
  let s = String(raw || "").trim();
  if (!s) return "";
  const sorted = [...TEXT_TRIGGER_REPLACEMENTS].sort((a, b) => b[0].length - a[0].length);
  for (const [from, to] of sorted) {
    const esc = from.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    s = s.replace(new RegExp(esc, "gi"), to);
  }
  s = s.replace(/["'""''][^"'""'']*["'""'']/g, " ");
  s = stripTitleTokens(s, title);
  return s.replace(/\s+/g, " ").trim();
}

function extractArtworkFromStyleBlob(...blobs) {
  for (const raw of blobs) {
    const m = String(raw || "").match(COVER_ART_INLINE_RE);
    const hit = String(m?.[1] || "").trim();
    if (hit) return hit;
  }
  return "";
}

/** User Artwork field (Create), Image Mood hint, or inline "cover art:" in style. */
export function resolveUserArtworkPrompt(input) {
  const direct = String(input?.artworkStyle || input?.artworkHint || "").trim();
  if (direct) return direct;
  return extractArtworkFromStyleBlob(input?.styleSent, input?.style, input?.styleInput);
}

/** Strip text-on-image requests; never pass raw song title into the visual prompt. */
export function sanitizeArtworkPrompt(raw, { title = "" } = {}) {
  let s = toVisualOnlyPrompt(raw, { title });
  if (!s) return "";
  s = s.replace(/\bcover art\b/gi, "cinematic scene");
  s = s.replace(/\balbum cover\b/gi, "cinematic scene");
  s = s.replace(TYPOGRAPHY_RE, " ");
  s = s.replace(TEXT_REQUEST_RE, " ");
  s = s.replace(HUMAN_TRIGGER_RE, " ");
  return s.replace(/\s+/g, " ").trim().slice(0, 280);
}

function parseAvoidTagsList(raw) {
  return String(raw || "")
    .split(/[,;|]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 24);
}

export function buildCoverNegativePrompt(avoidTags, { storyTheme = "", userArtwork = "" } = {}) {
  const extra = parseAvoidTagsList(avoidTags);
  const antiMountain = landscapeAntiMountainAvoid(storyTheme, userArtwork);
  if (antiMountain) extra.push(...parseAvoidTagsList(antiMountain));
  if (!extra.length) return NEGATIVE_TEXT_PROMPT;
  return `${NEGATIVE_TEXT_PROMPT}, ${extra.join(", ")}`;
}

export function moodPaletteForBucket(bucketKey) {
  return MOOD_PALETTES[bucketKey] || MOOD_PALETTES.default;
}

function buildCoverSeed(input, storyTheme, bucketKey, userArtwork, regenSalt = "") {
  const songId = String(input?.songId || input?.id || "").trim();
  if (userArtwork) {
    let seed = fnv1a(`${songId}|user:${userArtwork}|${userArtwork.length}`) % 2147483646;
    if (regenSalt) {
      seed = fnv1a(`${seed}|regen:${regenSalt}`) % 2147483646;
    }
    return seed;
  }
  const storyBlob = buildStoryBlob(input);
  let seed = fnv1a(`${songId}|${storyTheme}|${bucketKey}|${storyBlob}`) % 2147483646;
  if (regenSalt) {
    seed = fnv1a(`${seed}|regen:${regenSalt}`) % 2147483646;
  }
  return seed;
}

/** Strip human language from scenes; never generate people in cover art. */
export function enforceNoHumansScene(scene) {
  let s = String(scene || "").trim();
  if (!s) return s;
  s = s.replace(HUMAN_TRIGGER_RE, " ");
  return s.replace(/\s+/g, " ").replace(/,\s*,/g, ",").trim();
}

/**
 * @param {object} input
 * @param {{ sceneOverride?: string, artworkSourceOverride?: string, geminiModel?: string, directorSceneHint?: string, nabadIdentityPhrases?: string, visualDirection?: object, regenSalt?: string, userArtworkOverride?: string, forceMusicFallback?: boolean }} [options]
 * @returns {{ prompt: string, seed: number, bucket: string, visualMode: string, storyTheme: string, artworkSource: string, params: object }}
 */
export function buildAbstractCoverPrompt(input, options = {}) {
  const songId = String(input?.songId || input?.id || input?.title || "nabad-song").trim();
  const title = String(input?.title || "").trim();
  const genre = String(input?.genre || input?.style || "").trim().slice(0, 120);
  const mood = String(input?.mood || "").trim().slice(0, 80);
  const styleBlob = `${input?.style || ""} ${input?.styleSent || ""}`;
  const tempo = parseTempo(input?.tempo ?? styleBlob);
  const energy = parseEnergy(input?.energy);
  const brightness = parseBrightness(input?.brightness);
  const sonicProfile = String(input?.sonicProfile || inferSonicProfile(`${genre} ${styleBlob}`));
  const geminiImage = options.imageProvider === "gemini" || Boolean(options.geminiImage);
  const allowHumans = geminiImage;
  const userArtworkOverride = String(options.userArtworkOverride || "").trim().slice(0, 280);
  const userDirectedRegen = isUserDirectedRegenHint(userArtworkOverride);
  const forceMusicFallback = Boolean(options.forceMusicFallback && !userArtworkOverride);
  const userArtworkRaw = userArtworkOverride || (forceMusicFallback ? "" : resolveUserArtworkPrompt(input));
  const regenMood = userDirectedRegen ? resolveRegenMoodFromHint(userArtworkOverride || userArtworkRaw) : null;
  let userArtwork = userArtworkOverride
    ? prepareDirectUserArtworkHint(userArtworkRaw, { allowHumans })
    : sanitizeArtworkPrompt(enrichUserArtworkHint(userArtworkRaw), { title });
  const sceneOverrideRaw = sanitizeArtworkPrompt(String(options.sceneOverride || "").trim(), { title });
  let sceneOverride = sceneOverrideRaw && userArtwork
    ? sanitizeArtworkPrompt(`${userArtwork}, ${sceneOverrideRaw}`, { title })
    : sceneOverrideRaw;

  const { scene, visualMode, storyTheme, bucketKey: storyBucketKey } = buildSceneFromStory(input);
  const bucketKey = regenMood?.bucket || storyBucketKey;
  const directorSceneHintRaw = sanitizeArtworkPrompt(String(options.directorSceneHint || "").trim(), { title });
  const directorSceneHint = allowHumans ? directorSceneHintRaw : enforceNoHumansScene(directorSceneHintRaw);
  const nabadIdentityPhrases = sanitizeArtworkPrompt(String(options.nabadIdentityPhrases || "").trim(), { title });
  const storyScene = toVisualOnlyPrompt(scene, { title });
  const preferStoryScene = storyTheme !== "mood_fallback" && Boolean(storyScene);
  let visualScene = forceMusicFallback
    ? pickFrom(MUSIC_FALLBACK_SCENES, songId, String(options.regenSalt || "regen-auto"))
    : preferStoryScene
      ? storyScene
      : !sceneOverride && !userArtwork && directorSceneHint
        ? directorSceneHint
        : storyScene;
  if (!allowHumans) {
    sceneOverride = sceneOverride ? enforceNoHumansScene(sceneOverride) : "";
    visualScene = enforceNoHumansScene(visualScene);
    userArtwork = userArtwork ? enforceNoHumansScene(userArtwork) : "";
  }
  const palette = moodPaletteForBucket(bucketKey);
  const composition = compositionPhraseForCover(
    songId,
    userArtwork || userArtworkRaw || sceneOverride || visualScene,
    sceneOverride || userArtwork || userDirectedRegen ? "user_directed" : visualMode,
    { geminiReel: geminiImage && Boolean(userArtwork || userArtworkOverride) },
  );
  const effectiveStoryTheme = userDirectedRegen ? "user_regen" : storyTheme;
  const seed = buildCoverSeed(input, effectiveStoryTheme, bucketKey, userArtwork, String(options.regenSalt || "").trim());
  const artworkSource = forceMusicFallback
    ? "regen_music_auto"
    : sceneOverride
      ? String(options.artworkSourceOverride || "gemini_scene")
      : userArtwork
        ? "user_artwork"
        : directorSceneHint
          ? "visual_director"
          : "auto_story";

  const isHumTrack = Boolean(input?.humTrack);
  const styleCore = isHumTrack ? HUM_TRACK_STYLE_CORE : STYLE_CORE;
  const safetySuffix = isHumTrack ? HUM_TRACK_SAFETY_SUFFIX : SAFETY_SUFFIX;
  const humGuard = isHumTrack ? HUM_TRACK_SCENE_GUARD : "";
  const humansGuard = allowHumans ? "" : NO_HUMANS_GUARD;
  const geminiReelFrame = geminiImage && Boolean(userArtwork || userArtworkOverride);
  const effectiveSafetySuffix =
    allowHumans && (userArtwork || userArtworkOverride) ? GEMINI_USER_SAFETY_SUFFIX : safetySuffix;

  let parts;
  if (sceneOverride) {
    parts = userArtwork
      ? [
          NO_TEXT_LEAD,
          composeFrameForArtwork(userArtwork, {
            literalSubject: shouldUseLiteralSubjectMode(userArtworkOverride || userArtwork),
            geminiReel: geminiReelFrame,
          }),
          sceneOverride,
          nabadIdentityPhrases,
          paletteForUserArtwork(userArtwork, bucketKey),
          NO_TEXT_REINFORCE,
          SAFETY_PREFIX + USER_STYLE_CORE,
          composition,
          NO_TEXT_REINFORCE,
          humansGuard,
          effectiveSafetySuffix,
        ]
      : [
          NO_TEXT_LEAD,
          MUSIC_COVER_FRAME,
          SAFETY_PREFIX + styleCore,
          sceneOverride,
          nabadIdentityPhrases,
          humGuard,
          palette,
          composition,
          storyMoodPhrase(storyTheme),
          bucketMoodPhrase(bucketKey),
          tempoPhrase(tempo),
          brightnessPhrase(brightness),
          sonicPhrase(sonicProfile),
          NO_TEXT_REINFORCE,
          humansGuard,
          effectiveSafetySuffix,
        ];
  } else if (userArtwork) {
    const userPalette = paletteForUserArtwork(userArtwork, bucketKey);
    const useLiteralSubject = shouldUseLiteralSubjectMode(userArtworkOverride || userArtworkRaw) && !isWildlifeArtworkHint(userArtworkOverride || userArtworkRaw);
    const useWildlifeLead = isWildlifeArtworkHint(userArtworkOverride || userArtworkRaw);
    const useSceneLead = !useLiteralSubject && !useWildlifeLead && isSceneEnvironmentHint(userArtwork);
    const useMoodLead = !useLiteralSubject && !useSceneLead && !useWildlifeLead && regenMood;
    const literalLead = useLiteralSubject
      ? `photorealistic editorial still life photograph, ${userArtwork}, clearly visible and recognizable`
      : useWildlifeLead
        ? `photorealistic wildlife nature photograph, ${userArtwork}, the requested bird or animal clearly visible as the single main focal subject`
        : useSceneLead
          ? `photorealistic cinematic environment photograph, ${userArtwork}, the requested place or architecture clearly visible as the focal subject`
          : useMoodLead
            ? `photorealistic symbolic still life photograph expressing ${userArtworkOverride || userArtworkRaw}, ${userArtwork}, clear recognizable props as focal subject`
            : "";
    parts = [
      NO_TEXT_LEAD,
      literalLead,
      composeFrameForArtwork(userArtwork, {
        literalSubject: useLiteralSubject,
        wildlifeSubject: useWildlifeLead,
        geminiReel: geminiReelFrame,
      }),
      userArtwork,
      nabadIdentityPhrases,
      userPalette,
      sonicPhrase(sonicProfile),
      NO_TEXT_REINFORCE,
      SAFETY_PREFIX + USER_STYLE_CORE,
      composition,
      NO_TEXT_REINFORCE,
      humansGuard,
      effectiveSafetySuffix,
    ];
  } else {
    const autoFrame =
      visualMode === "still_life"
        ? OBJECT_COMPOSE_FRAME
        : visualMode === "abstract"
          ? MUSIC_COVER_FRAME
          : MUSIC_COVER_FRAME;
    parts = [
      NO_TEXT_LEAD,
      autoFrame,
      humansGuard,
      SAFETY_PREFIX + styleCore,
      visualScene,
      nabadIdentityPhrases,
      humGuard,
      sonicPhrase(sonicProfile),
      palette,
      composition,
      ...(forceMusicFallback ? [] : [storyMoodPhrase(storyTheme), bucketMoodPhrase(bucketKey)]),
      tempoPhrase(tempo),
      brightnessPhrase(brightness),
      NO_TEXT_REINFORCE,
      humansGuard,
      effectiveSafetySuffix,
    ];
  }

  return {
    prompt: parts.filter(Boolean).join(", "),
    seed,
    bucket: bucketKey,
    visualMode: sceneOverride || userArtwork || userDirectedRegen ? "user_directed" : visualMode,
    storyTheme: effectiveStoryTheme,
    artworkSource,
    params: {
      songId,
      title,
      genre,
      mood,
      tempo,
      energy,
      brightness,
      sonicProfile,
      bucket: bucketKey,
      brandPalette: palette,
      visualMode: sceneOverride || userArtwork || userDirectedRegen ? "user_directed" : visualMode,
      storyTheme: effectiveStoryTheme,
      artworkSource,
      userArtwork: userArtwork || undefined,
      userArtworkRaw: userArtworkRaw || undefined,
      geminiScene: sceneOverride || undefined,
      geminiModel: options.geminiModel || undefined,
      directorSceneHint: directorSceneHint || undefined,
      nabadIdentityPhrases: nabadIdentityPhrases || undefined,
      visualDirection: options.visualDirection || undefined,
      coverWidth: geminiImage ? 720 : POLLINATIONS_COVER_WIDTH,
      coverHeight: geminiImage ? 1280 : POLLINATIONS_COVER_HEIGHT,
      coverAspect: "9:16",
      coverSourceAspect: geminiImage ? "9:16" : "1:1",
      imageProvider: geminiImage ? "gemini" : "pollinations",
      landscapeAntiMountainAvoid: landscapeAntiMountainAvoid(effectiveStoryTheme, userArtwork),
    },
  };
}

export function buildPollinationsUrl(
  prompt,
  seed,
  { width = POLLINATIONS_COVER_WIDTH, height = POLLINATIONS_COVER_HEIGHT, avoidTags = "", storyTheme = "", userArtwork = "" } = {},
) {
  const encoded = encodeURIComponent(prompt);
  const negative = encodeURIComponent(buildCoverNegativePrompt(avoidTags, { storyTheme, userArtwork }));
  return `https://image.pollinations.ai/prompt/${encoded}?width=${width}&height=${height}&seed=${seed}&model=flux&nologo=true&enhance=false&private=true&negative_prompt=${negative}`;
}
