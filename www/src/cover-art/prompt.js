/**
 * Mood-rich Pollinations prompts — creative freedom with light safety rails.
 * User never writes these; app derives from song metadata.
 */

const SAFETY_SUFFIX =
  "absolutely no text, no words, no letters, no numbers, no sentences, no captions, no subtitles, no typography, no writing of any kind, no logo, no album title, no watermark, no readable signage, no speech bubbles, silhouettes only without facial details, premium music cover art quality";

const NO_TEXT_REINFORCE =
  "image must be completely wordless, zero readable characters anywhere in the frame";

const STYLE_CORE =
  "premium luxury music cover art, cinematic atmosphere, elegant composition, rich color grading, high-end editorial look, moody dark tones with luminous accents, nabad teal and violet palette when appropriate";

/** Base mood buckets — may blend with silhouettes or landscapes per song seed */
const MOOD_BUCKETS = {
  love: {
    id: "love",
    palette: "rose gold, soft magenta, warm coral, violet dusk, deep romantic shadows",
    scene: "intimate romantic atmosphere, tender emotional warmth, soft backlight haze",
    motion: "slow affectionate glow",
    figures: [
      "romantic couple silhouette against a glowing sunset sky, no visible faces",
      "elegant woman silhouette backlit by rose and violet light",
      "man silhouette in soft golden haze, mysterious and emotional",
      "two silhouettes close together under a wide luminous sky",
    ],
    landscapes: [
      "city skyline silhouette at golden hour, romantic mood",
      "calm sea horizon with warm pink and violet sky",
    ],
  },
  party: {
    id: "party",
    palette: "electric teal, vivid violet, gold sparkle, neon bloom, deep night",
    scene: "festive celebration energy, vibrant nightlife atmosphere",
    motion: "high-energy pulsing lights",
    figures: [
      "dancing crowd silhouettes under colorful club lights, no faces",
      "single dancer silhouette mid-movement, dynamic and free",
      "group of people partying as dark silhouettes with bokeh lights",
      "silhouettes dancing at a wedding celebration",
    ],
    landscapes: [
      "lit city rooftops at night, festive urban atmosphere",
      "open-air party venue lights glowing in darkness",
    ],
  },
  happy: {
    id: "happy",
    palette: "bright teal, sunny amber, soft white bloom, cheerful sky tones",
    scene: "uplifting joyful atmosphere, optimistic radiant mood",
    motion: "light airy brightness",
    figures: [
      "happy person silhouette arms raised against bright sky",
      "friends silhouettes laughing together at sunset, no faces",
    ],
    landscapes: [
      "sunlit hills and open sky, warm and hopeful",
      "bright coastal view with sparkling water",
    ],
  },
  sad: {
    id: "sad",
    palette: "deep indigo, muted violet, cold teal whisper, faint silver",
    scene: "lonely melancholic atmosphere, quiet emotional weight",
    motion: "very slow fading light",
    figures: [
      "solitary figure silhouette staring into the distance",
      "person sitting alone silhouette by a window glow, no face details",
      "woman or man silhouette in rain-lit moody darkness",
    ],
    landscapes: [
      "empty rainy street at night, cinematic melancholy",
      "foggy lonely horizon, minimal and emotional",
    ],
  },
  chill: {
    id: "chill",
    palette: "nabad teal, soft cyan, muted violet mist, deep calm blues",
    scene: "peaceful calm atmosphere, breathable stillness",
    motion: "gentle slow drift",
    figures: [
      "relaxed figure silhouette watching the horizon",
      "person meditating silhouette on a hill at dusk",
    ],
    landscapes: [
      "misty mountains over a still lake at blue hour",
      "soft aurora sky over quiet peaks",
      "minimal ocean horizon, serene and spacious",
    ],
  },
  wedding: {
    id: "wedding",
    palette: "champagne gold, ivory glow, soft violet, teal accent",
    scene: "elegant celebration, graceful premium ceremony mood",
    motion: "majestic slow radiant swell",
    figures: [
      "bride and groom silhouettes at sunset, no faces",
      "couple silhouettes dancing, wedding romance",
      "elegant wedding party silhouettes with golden backlight",
    ],
    landscapes: [
      "beautiful wedding venue exterior at twilight, warm lights",
      "garden ceremony arch silhouette at golden hour",
    ],
  },
  hype: {
    id: "hype",
    palette: "aggressive teal, sharp violet, white hot core, high contrast",
    scene: "intense power and drive, kinetic energy",
    motion: "dynamic tight pulse",
    figures: [
      "athlete silhouette in powerful stance, backlit",
      "performer silhouette on stage with dramatic lights, no face",
      "crowd silhouettes with hands up at a concert",
    ],
    landscapes: [
      "stadium lights glowing in darkness, epic scale",
      "urban nightscape with sharp neon energy",
    ],
  },
  dark: {
    id: "dark",
    palette: "near-black void, deep purple, toxic teal trace",
    scene: "mysterious noir mood, smoldering tension",
    motion: "subtle ominous shimmer",
    figures: [
      "lone hooded silhouette in fog, no face visible",
      "dark figure silhouette against a single light source",
    ],
    landscapes: [
      "noir city alley at night, wet reflections",
      "stormy mountains under black clouds",
    ],
  },
  dreamy: {
    id: "dreamy",
    palette: "lavender, teal mist, pearlescent white, soft pastels",
    scene: "surreal dreamlike atmosphere, soft magic realism",
    motion: "weightless floating mood",
    figures: [
      "dreamy figure silhouette walking through mist",
      "woman or man silhouette in soft fog, ethereal",
    ],
    landscapes: [
      "cozy houses on a hill at twilight, warm window lights",
      "small village nestled in mountains with mist",
      "fantasy-like rolling hills under a giant moonlit sky",
    ],
  },
  epic: {
    id: "epic",
    palette: "royal violet, teal beam, bright gold crest, cinematic white bloom",
    scene: "grand heroic scale, monumental cinematic mood",
    motion: "wide powerful bloom",
    figures: [
      "hero silhouette on a cliff edge facing vast landscape",
      "lone warrior silhouette against enormous sky",
    ],
    landscapes: [
      "cinematic mountain range at dusk, dramatic peaks and god rays",
      "vast desert canyon with epic scale and golden light",
      "snow-capped mountains under a storm-lit sky",
    ],
  },
  default: {
    id: "default",
    palette: "deep void black, nabad teal, nabad violet, rose-gold accent",
    scene: "balanced premium atmospheric mood",
    motion: "calm internal breathing",
    figures: [
      "subtle human silhouette in abstract light, no face",
      "elegant silhouette against gradient sky",
    ],
    landscapes: [
      "soft mountain horizon silhouette at twilight",
      "minimal city skyline at night with teal and violet lights",
      "abstract living light with distant hills",
    ],
  },
};

const ABSTRACT_EXTRAS = [
  "translucent light gradients and glass diffusion layered over the scene",
  "soft aurora-like glow woven through the atmosphere",
  "premium abstract light particles in the air",
  "living light material accents, cinematic bloom",
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

export function classifyVisualBucket({ mood, genre, title, style, styleSent, energy }) {
  const blob = `${mood} ${genre} ${title} ${style} ${styleSent}`.toLowerCase();

  if (/wedding|bridal|marriage|dabke|entrance|ceremony|first dance/.test(blob)) return "wedding";
  if (/party|club|dance|dancing|celebration|festival|hype|turn up|night out/.test(blob)) return "party";
  if (/love|romantic|romance|heart|habibi|darling|valentine|intimate|passion/.test(blob)) return "love";
  if (/sad|melanchol|heartbreak|lonely|tears|miss you|goodbye|mourning|empty/.test(blob)) return "sad";
  if (/happy|joy|uplift|cheerful|feel good|sunshine|smile|blessed/.test(blob)) return "happy";
  if (/workout|gym|drill|trap|arena|stadium|hype|power|beast|anthem/.test(blob)) return "hype";
  if (/dark|noir|gothic|sinister|brooding|evil|shadow/.test(blob)) return "dark";
  if (/dream|ethereal|ambient|sleep|float|cosmic|space|nebula|village|home/.test(blob)) return "dreamy";
  if (/epic|cinematic|orchestral|trailer|heroic|grand|massive|anthemic|mountain/.test(blob)) return "epic";
  if (/chill|lofi|lo-fi|calm|soft|relax|meditat|breathe|peace|nature/.test(blob)) return "chill";
  if (/folk|country|acoustic|desert|mountain|city|urban|street/.test(blob)) return "dreamy";

  if (energy > 0.78) return "party";
  if (energy < 0.32) return "chill";
  return "default";
}

function pickFrom(list, songId, salt) {
  if (!list?.length) return "";
  return list[fnv1a(`${songId}:${salt}`) % list.length];
}

/** Roll visual treatment: abstract blend, silhouette figure, or landscape */
function pickVisualScene(bucket, songId, bucketKey) {
  const roll = fnv1a(`${songId}:${bucketKey}:visual-mode`) % 100;

  // Mood-led bias — love/wedding lean figures, epic/chill lean landscapes
  let mode = "blend";
  if (roll < 34) mode = "figure";
  else if (roll < 64) mode = "landscape";
  else mode = "blend";

  if (bucketKey === "love" || bucketKey === "wedding") {
    if (roll < 55) mode = "figure";
    else if (roll < 80) mode = "landscape";
  }
  if (bucketKey === "epic" || bucketKey === "chill" || bucketKey === "dreamy") {
    if (roll < 50) mode = "landscape";
    else if (roll < 75) mode = "figure";
  }
  if (bucketKey === "party" || bucketKey === "hype") {
    if (roll < 50) mode = "figure";
  }

  const parts = [bucket.scene, bucket.palette, bucket.motion];

  if (mode === "figure" || mode === "blend") {
    const fig = pickFrom(bucket.figures, songId, "figure");
    if (fig) parts.push(fig);
  }
  if (mode === "landscape" || mode === "blend") {
    const land = pickFrom(bucket.landscapes, songId, "landscape");
    if (land) parts.push(land);
  }
  if (mode === "blend") {
    parts.push(pickFrom(ABSTRACT_EXTRAS, songId, "abstract"));
  }

  return { scene: parts.filter(Boolean).join(", "), visualMode: mode };
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

function pickComposition(songId) {
  return COMPOSITIONS[fnv1a(`${songId}:composition`) % COMPOSITIONS.length];
}

/**
 * @param {object} input
 * @returns {{ prompt: string, seed: number, bucket: string, visualMode: string, params: object }}
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

  const bucketKey = classifyVisualBucket({
    mood,
    genre,
    title,
    style: input?.style,
    styleSent: input?.styleSent,
    energy,
  });
  const bucket = MOOD_BUCKETS[bucketKey] || MOOD_BUCKETS.default;
  const { scene, visualMode } = pickVisualScene(bucket, songId, bucketKey);
  const composition = pickComposition(songId);

  const parts = [
    STYLE_CORE,
    scene,
    composition,
    tempoPhrase(tempo),
    brightnessPhrase(brightness),
    sonicPhrase(sonicProfile),
    genre ? `inspired by the feeling of ${genre} music` : "",
    title ? `never write or display "${title.slice(0, 50)}" or any other words or sentences` : "",
    NO_TEXT_REINFORCE,
    SAFETY_SUFFIX,
  ].filter(Boolean);

  const prompt = parts.join(", ");
  const seed = fnv1a(`${songId}:${bucketKey}:nabad-cover`) % 2147483646;

  return {
    prompt,
    seed,
    bucket: bucketKey,
    visualMode,
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
      visualMode,
    },
  };
}

export function buildPollinationsUrl(prompt, seed, { width = 1024, height = 1024 } = {}) {
  const encoded = encodeURIComponent(prompt);
  return `https://image.pollinations.ai/prompt/${encoded}?width=${width}&height=${height}&seed=${seed}&nologo=true&enhance=false&private=true`;
}
