/**
 * Story-aware Pollinations prompts — derived from title, lyrics, style, mood.
 * User never writes these. Same song id + same story → same seed + same scene.
 */

const SAFETY_PREFIX =
  "typography-free pure visual art, textless image, no written language anywhere, ";

const SAFETY_SUFFIX =
  "absolutely no text, no words, no letters, no numbers, no captions, no subtitles, no typography, no writing, no logo text, no song name, no watermark, no readable signage, no speech bubbles, no banners, no posters, no book pages, no diplomas, no certificates, no newspapers, silhouettes only without facial details, fine art photography quality";

const NO_TEXT_REINFORCE =
  "completely wordless photograph, zero readable characters in the entire frame, blank signs, empty screens, no labels";

const NEGATIVE_TEXT_PROMPT =
  "text, words, letters, numbers, typography, font, writing, caption, subtitle, watermark, logo, album cover title, song title, track title, artist name, band name, signage, billboard, poster text, newspaper, book, magazine, speech bubble, label, stamp, signature, handwritten, calligraphy, arabic text, english text, quotes, meme text, ui overlay, readable characters, sentences, lyrics on screen, cd cover text, record label, tracklist, credits block, diploma text, certificate text, neon sign with words, graffiti letters, title card";

const STYLE_CORE =
  "premium cinematic visual art, elegant composition, rich color grading, high-end editorial look, moody dark tones with luminous accents, deep teal and violet palette when appropriate";

const USER_STYLE_CORE =
  "cinematic lighting, rich color grading, high-end editorial look";

const MOOD_PALETTES = {
  love: "rose gold, soft magenta, warm coral, violet dusk",
  party: "electric teal, vivid violet, gold sparkle, neon bloom",
  happy: "bright teal, sunny amber, soft white bloom",
  sad: "deep indigo, muted violet, cold teal whisper",
  chill: "deep teal, soft cyan, muted violet mist",
  wedding: "champagne gold, ivory glow, soft violet",
  hype: "aggressive teal, sharp violet, high contrast",
  dark: "near-black void, deep purple, toxic teal trace",
  dreamy: "lavender, teal mist, pearlescent white",
  epic: "royal violet, teal beam, bright gold crest",
  default: "deep void black, deep teal, rich violet, rose-gold accent",
};

/** Story themes — chosen from title + lyrics + style, highest match wins. */
const STORY_THEMES = [
  {
    id: "prom_formal",
    re: /prom|prom night|homecoming|formal dance|school dance|senior year|senior night|university ball|college ball|graduation ball|graduation night|debs|matric|leaving cert|bal de promo|soirée de promo|حفل التخرج|حفل تخرج|سهرة تخرج|بروف|promenade/i,
    scene:
      "elegant formal school prom or university ball atmosphere, decorated ballroom with chandeliers and soft golden lights, young people dancing as silhouettes in formal wear, festive celebration mood, no visible faces",
    visualMode: "figure",
    bucket: "party",
  },
  {
    id: "graduation",
    re: /graduation|graduate|diploma|commencement|cap and gown|mortarboard|تخرج/i,
    scene:
      "graduation celebration atmosphere, graduate silhouettes with caps thrown in the air, campus or hall lights at dusk, proud joyful mood, no faces",
    visualMode: "figure",
    bucket: "happy",
  },
  {
    id: "wedding",
    re: /wedding|bridal|bride|groom|marriage|ceremony|first dance|dabke entrance|زفاف|عرس|عروس/i,
    scene:
      "elegant wedding celebration atmosphere, bride and groom silhouettes dancing or standing together, warm golden ceremony lights, graceful premium mood, no faces",
    visualMode: "figure",
    bucket: "wedding",
  },
  {
    id: "club_night",
    re: /club|nightclub|dj|afterparty|turn up|night out|rave|discoteca|ملهى|نادي/i,
    scene:
      "vibrant nightclub atmosphere, dancing crowd silhouettes under colorful lights and bokeh, high energy celebration, no faces",
    visualMode: "figure",
    bucket: "party",
  },
  {
    id: "concert_stage",
    re: /concert|festival|live show|on stage|stadium|arena|tour|headliner|حفلة|مسرح/i,
    scene:
      "live concert atmosphere, performer and crowd silhouettes on stage with dramatic spotlights, epic scale, no faces",
    visualMode: "figure",
    bucket: "hype",
  },
  {
    id: "heartbreak",
    re: /heartbreak|broken heart|goodbye|farewell|miss you|without you|left me|tears|lonely|alone|empty|goodnight|وداع|فراق|وحيد|بكي|دمع/i,
    scene:
      "lonely melancholic atmosphere, solitary person silhouette by a rain-lit window or empty street, quiet emotional weight, no face",
    visualMode: "figure",
    bucket: "sad",
  },
  {
    id: "romance",
    re: /love you|my love|romantic|romance|darling|valentine|kiss|together forever|habibi|habibti|حبيب|حبيبي|حبيبتي|عشق|حب|قلبي/i,
    scene:
      "intimate romantic atmosphere, couple silhouettes close together under a glowing sky, tender warmth, no visible faces",
    visualMode: "figure",
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
    re: /forest|garden|flower|meadow|field|tree|river|lake|sunset|sunrise|moon|stars|sky|nature|green|spring|autumn|fall|winter|snow|rose|orchard|غابة|حديقة|زهرة|نهر|غروب|فجر|قمر|نجوم/i,
    scene:
      "natural landscape atmosphere matching the song mood, soft organic light, serene cinematic framing, no people",
    visualMode: "landscape",
    bucket: "chill",
  },
  {
    id: "workout_power",
    re: /workout|gym|training|run|running|champion|victory|win|power|beast mode|anthem|كأس|بطل|قوة/i,
    scene:
      "intense powerful atmosphere, athlete or crowd silhouettes in dramatic backlight, kinetic energy, no faces",
    visualMode: "figure",
    bucket: "hype",
  },
  {
    id: "celebration",
    re: /party|celebration|birthday|cheers|toast|dance|dancing|fiesta|celebrate|احتفال|رقص|عيد/i,
    scene:
      "joyful celebration atmosphere, people dancing as silhouettes with warm festive lights, no faces",
    visualMode: "figure",
    bucket: "party",
  },
  {
    id: "dreamy_ethereal",
    re: /dream|dreamy|ethereal|float|cosmic|space|galaxy|nebula|magic|fantasy|حلم|فضاء/i,
    scene:
      "surreal dreamlike atmosphere, soft fog and pearlescent light, weightless magical mood, abstract human form optional as distant silhouette only",
    visualMode: "abstract",
    bucket: "dreamy",
  },
];

const ABSTRACT_FALLBACKS = [
  "premium abstract living light gradients, glass diffusion, cinematic bloom, no people",
  "atmospheric color field with soft aurora glow and elegant negative space, no figures",
  "luxury abstract light sculpture mood, teal and violet luminous accents, no human subjects",
];

const COMPOSITIONS = [
  "centered subject with strong negative space",
  "wide cinematic framing",
  "subject small against vast sky",
  "low horizon with towering sky glow",
  "symmetric balanced composition",
  "diagonal dramatic perspective",
];

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

function moodBucketFallback(bucketKey, energy) {
  const palette = MOOD_PALETTES[bucketKey] || MOOD_PALETTES.default;
  if (bucketKey === "party" || bucketKey === "hype") {
    return {
      scene: "festive high-energy atmosphere, dancing silhouettes under colorful lights, no faces",
      visualMode: "figure",
      palette,
    };
  }
  if (bucketKey === "love") {
    return {
      scene: "romantic atmosphere, couple silhouettes under glowing sky, no visible faces",
      visualMode: "figure",
      palette,
    };
  }
  if (bucketKey === "sad") {
    return {
      scene: "melancholic atmosphere, lone silhouette in moody darkness, no face",
      visualMode: "figure",
      palette,
    };
  }
  if (energy > 0.7) {
    return {
      scene: "dynamic celebratory light atmosphere, abstract motion and sparkle, no human subjects",
      visualMode: "abstract",
      palette,
    };
  }
  return {
    scene: pickFrom(ABSTRACT_FALLBACKS, bucketKey, "abstract-fallback"),
    visualMode: "abstract",
    palette,
  };
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
  let s = String(raw || "").trim();
  if (!s) return "";
  s = s.replace(/\bcover art\b/gi, "cinematic scene");
  s = s.replace(/\balbum cover\b/gi, "cinematic scene");
  s = s.replace(TYPOGRAPHY_RE, " ");
  s = s.replace(TEXT_REQUEST_RE, " ");
  const t = String(title || "").trim();
  if (t.length >= 3) {
    const esc = t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    s = s.replace(new RegExp(esc, "gi"), " ");
  }
  return s.replace(/\s+/g, " ").trim().slice(0, 280);
}

function parseAvoidTagsList(raw) {
  return String(raw || "")
    .split(/[,;|]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 24);
}

export function buildCoverNegativePrompt(avoidTags) {
  const extra = parseAvoidTagsList(avoidTags);
  if (!extra.length) return NEGATIVE_TEXT_PROMPT;
  return `${NEGATIVE_TEXT_PROMPT}, ${extra.join(", ")}`;
}

function buildCoverSeed(input, storyTheme, bucketKey, userArtwork) {
  const songId = String(input?.songId || input?.id || "").trim();
  if (userArtwork) {
    return fnv1a(`${songId}|user:${userArtwork}|${userArtwork.length}`) % 2147483646;
  }
  const storyBlob = buildStoryBlob(input);
  return fnv1a(`${songId}|${storyTheme}|${bucketKey}|${storyBlob}`) % 2147483646;
}

/**
 * @param {object} input
 * @returns {{ prompt: string, seed: number, bucket: string, visualMode: string, storyTheme: string, artworkSource: string, params: object }}
 */
export function buildAbstractCoverPrompt(input) {
  const songId = String(input?.songId || input?.id || input?.title || "nabad-song").trim();
  const title = String(input?.title || "").trim();
  const genre = String(input?.genre || input?.style || "").trim().slice(0, 120);
  const mood = String(input?.mood || "").trim().slice(0, 80);
  const styleBlob = `${input?.style || ""} ${input?.styleSent || ""}`;
  const tempo = parseTempo(input?.tempo ?? styleBlob);
  const energy = parseEnergy(input?.energy);
  const brightness = parseBrightness(input?.brightness);
  const sonicProfile = String(input?.sonicProfile || inferSonicProfile(`${genre} ${styleBlob}`));
  const userArtworkRaw = resolveUserArtworkPrompt(input);
  const userArtwork = sanitizeArtworkPrompt(userArtworkRaw, { title });

  const { scene, visualMode, storyTheme, bucketKey } = buildSceneFromStory(input);
  const composition = COMPOSITIONS[fnv1a(`${songId}:composition`) % COMPOSITIONS.length];
  const seed = buildCoverSeed(input, storyTheme, bucketKey, userArtwork);
  const artworkSource = userArtwork ? "user_artwork" : "auto_story";

  const parts = userArtwork
    ? [
        userArtwork,
        SAFETY_PREFIX + USER_STYLE_CORE,
        composition,
        NO_TEXT_REINFORCE,
        SAFETY_SUFFIX,
      ]
    : [
        SAFETY_PREFIX + STYLE_CORE,
        scene,
        composition,
        storyMoodPhrase(storyTheme),
        bucketMoodPhrase(bucketKey),
        tempoPhrase(tempo),
        brightnessPhrase(brightness),
        sonicPhrase(sonicProfile),
        NO_TEXT_REINFORCE,
        SAFETY_SUFFIX,
      ];

  return {
    prompt: parts.filter(Boolean).join(", "),
    seed,
    bucket: bucketKey,
    visualMode: userArtwork ? "user_directed" : visualMode,
    storyTheme,
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
      visualMode: userArtwork ? "user_directed" : visualMode,
      storyTheme,
      artworkSource,
      userArtwork: userArtwork || undefined,
      userArtworkRaw: userArtworkRaw || undefined,
    },
  };
}

export function buildPollinationsUrl(prompt, seed, { width = 1024, height = 1024, avoidTags = "" } = {}) {
  const encoded = encodeURIComponent(prompt);
  const negative = encodeURIComponent(buildCoverNegativePrompt(avoidTags));
  return `https://image.pollinations.ai/prompt/${encoded}?width=${width}&height=${height}&seed=${seed}&nologo=true&enhance=false&private=true&negative_prompt=${negative}`;
}
