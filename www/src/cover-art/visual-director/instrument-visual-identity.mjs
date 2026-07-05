/**
 * Hum Track instrument visual language — direct rendering vs instrument-inspired worlds.
 * Used only when sourcePath === "hum_track".
 */

/** @typedef {"direct"|"identity"} InstrumentRenderMode */

/**
 * @typedef {Object} InstrumentVisualProfile
 * @property {string} id
 * @property {string} label
 * @property {InstrumentRenderMode} renderMode
 * @property {string} palette
 * @property {string} lighting
 * @property {string} textures
 * @property {string} atmosphere
 * @property {string[]} symbolicElements
 * @property {string} motionLanguage
 * @property {string} directScene
 * @property {string} identityScene
 * @property {string[]} avoidConcepts
 */

/** @type {Record<string, InstrumentVisualProfile>} */
export const INSTRUMENT_VISUAL_PROFILES = {
  piano: {
    id: "piano",
    label: "Piano",
    renderMode: "direct",
    palette: "deep ebony keys, ivory highlights, violet-teal studio spill",
    lighting: "moody purple studio key light with soft rim on black lacquer",
    textures: "polished lacquer, matte felt, cool metal pedals",
    atmosphere: "intimate recital hall hush, premium restraint",
    symbolicElements: ["single spotlight cone", "floating dust motes in beam"],
    motionLanguage: "still grandeur with faint key-side reflections",
    directScene:
      "grand piano keys close-up, moody purple studio lighting, single instrument still life, no people, no writing",
    identityScene:
      "grand piano keys close-up, moody purple studio lighting, single instrument still life, no people, no writing",
    avoidConcepts: ["full band", "orchestra", "microphone performance"],
  },
  microphone: {
    id: "microphone",
    label: "Microphone",
    renderMode: "direct",
    palette: "chrome mesh, matte black body, warm amber booth glow",
    lighting: "single overhead vocal booth lamp with soft falloff",
    textures: "brushed metal grille, foam windscreen, cable coil",
    atmosphere: "empty recording booth intimacy",
    symbolicElements: ["soft pop filter halo", "muted sound-dampening panels"],
    motionLanguage: "quiet standby energy before a take",
    directScene:
      "studio condenser microphone on stand, warm amber booth lighting, sleek audio gear still life, no people, no writing",
    identityScene:
      "studio condenser microphone on stand, warm amber booth lighting, sleek audio gear still life, no people, no writing",
    avoidConcepts: ["singer face", "concert crowd", "readable lyrics"],
  },
  headphones: {
    id: "headphones",
    label: "Headphones",
    renderMode: "direct",
    palette: "matte black cups, subtle teal edge light, soft cyan reflection",
    lighting: "desk lamp glow with clean product-photography falloff",
    textures: "leather pads, braided cable, brushed aluminum yoke",
    atmosphere: "late-night listening session calm",
    symbolicElements: ["faint waveform glow in background bokeh"],
    motionLanguage: "paused listening stillness",
    directScene:
      "premium headphones on dark desk, teal accent edge light, minimal studio still life, no people, no writing",
    identityScene:
      "premium headphones on dark desk, teal accent edge light, minimal studio still life, no people, no writing",
    avoidConcepts: ["person wearing headphones", "ui screens", "readable text"],
  },
  vinyl: {
    id: "vinyl",
    label: "Vinyl",
    renderMode: "direct",
    palette: "gloss black disc, warm amber lamp, deep violet shadows",
    lighting: "low warm turntable lamp with circular highlight on grooves",
    textures: "vinyl grooves, matte label blank, tonearm metal",
    atmosphere: "analog warmth and nostalgic quiet",
    symbolicElements: ["soft circular groove shimmer", "warm dust in light beam"],
    motionLanguage: "slow rotation implied by groove streak blur",
    directScene:
      "vinyl record on turntable, warm amber lamp, analog hi-fi still life, no people, no writing",
    identityScene:
      "vinyl record on turntable, warm amber lamp, analog hi-fi still life, no people, no writing",
    avoidConcepts: ["readable label text", "band photo cover art"],
  },
  speakers: {
    id: "speakers",
    label: "Speakers",
    renderMode: "direct",
    palette: "matte charcoal cabinets, cyan rim light, violet ambient haze",
    lighting: "studio monitor glow with controlled bass-port shadow",
    textures: "woven driver cone, rubber surround, cabinet grain",
    atmosphere: "powerful but empty playback room",
    symbolicElements: ["subtle air ripple from sound pressure"],
    motionLanguage: "low-frequency pulse in light haze",
    directScene:
      "studio monitor speakers in dark room, cyan rim light, premium audio still life, no people, no writing",
    identityScene:
      "studio monitor speakers in dark room, cyan rim light, premium audio still life, no people, no writing",
    avoidConcepts: ["concert PA stack", "crowd", "brand logos"],
  },
  acoustic_guitar: {
    id: "acoustic_guitar",
    label: "Acoustic Guitar",
    renderMode: "direct",
    palette: "warm honey wood, amber spotlight, soft teal shadow fill",
    lighting: "single warm spotlight on soundhole with gentle falloff",
    textures: "spruce top grain, rosette inlay, nylon string sheen",
    atmosphere: "handcrafted workshop warmth",
    symbolicElements: ["wood shavings bokeh", "soft string vibration blur"],
    motionLanguage: "gentle fingerpick energy in light streaks",
    directScene:
      "acoustic guitar body and soundhole, warm wood grain, soft spotlight, handcrafted instrument still life, no people, no writing",
    identityScene:
      "acoustic guitar body and soundhole, warm wood grain, soft spotlight, handcrafted instrument still life, no people, no writing",
    avoidConcepts: ["full band", "electric guitar", "microphone"],
  },
  electric_guitar: {
    id: "electric_guitar",
    label: "Electric Guitar",
    renderMode: "direct",
    palette: "sunburst lacquer, purple accent light, cool cyan edge glow",
    lighting: "modern studio silhouette with sharp violet rim",
    textures: "gloss finish, chrome hardware, coiled cable",
    atmosphere: "clean modern session energy",
    symbolicElements: ["faint amp glow bokeh", "pickguard reflection streak"],
    motionLanguage: "cool poised tension before a riff",
    directScene:
      "electric guitar silhouette, clean modern studio, purple accent lighting, sleek instrument still life, no people, no writing",
    identityScene:
      "electric guitar silhouette, clean modern studio, purple accent lighting, sleek instrument still life, no people, no writing",
    avoidConcepts: ["rock concert crowd", "readable amp settings"],
  },
  synth: {
    id: "synth",
    label: "Synth",
    renderMode: "direct",
    palette: "retro knobs, neon purple glow, cyan LED accents",
    lighting: "moody electronic studio with colored underglow",
    textures: "matte keys, brushed aluminum panel, soft button caps",
    atmosphere: "analog-digital hybrid night session",
    symbolicElements: ["soft oscillator wave bokeh", "grid of tiny LED points"],
    motionLanguage: "slow LFO pulse in neon bloom",
    directScene:
      "retro synthesizer knobs and keys, neon purple glow, electronic instrument still life, no people, no writing",
    identityScene:
      "retro synthesizer knobs and keys, neon purple glow, electronic instrument still life, no people, no writing",
    avoidConcepts: ["dj booth crowd", "readable screen text"],
  },
  flute: {
    id: "flute",
    label: "Flute",
    renderMode: "direct",
    palette: "silver tube gleam, airy cyan bokeh, soft pearl highlights",
    lighting: "high-key softbox with delicate specular streaks",
    textures: "polished silver, pad shadows, clean metal keys",
    atmosphere: "light airy breath and open space",
    symbolicElements: ["soft breath mist ribbon", "floating light particles"],
    motionLanguage: "ascending airy drift in bokeh",
    directScene:
      "silver flute gleaming, soft bokeh background, airy minimal instrument still life, no people, no writing",
    identityScene:
      "silver flute gleaming, soft bokeh background, airy minimal instrument still life, no people, no writing",
    avoidConcepts: ["orchestra section", "marching band"],
  },
  violin: {
    id: "violin",
    label: "Violin",
    renderMode: "identity",
    palette: "amber varnish glow, deep burgundy velvet, warm gold rim light",
    lighting: "dramatic single-source chiaroscuro with soft falloff",
    textures: "silk velvet, rosin dust motes, warm wood warmth without fine detail",
    atmosphere: "intimate classical reverence and longing",
    symbolicElements: ["curved bow-stroke light arcs", "rosin dust in golden beam", "f-holes suggested as shadow shapes"],
    motionLanguage: "elegant legato curves flowing through light",
    directScene:
      "violin and bow on velvet, warm dramatic lighting, classical instrument portrait, no people, no writing",
    identityScene:
      "golden bow-stroke arcs over burgundy velvet darkness, rosin dust in warm spotlight, f-hole shadows implied not literal, classical longing atmosphere, no instrument close-up, no people, no writing",
    avoidConcepts: [
      "literal violin close-up",
      "misshapen violin body",
      "broken bow geometry",
      "orchestra section",
    ],
  },
  cello: {
    id: "cello",
    label: "Cello",
    renderMode: "identity",
    palette: "deep amber wood warmth, mahogany shadows, soft gold crest light",
    lighting: "low dramatic side light with long vertical falloff",
    textures: "velvet backdrop, rosin haze, resonant hollow darkness",
    atmosphere: "solemn depth and wide emotional resonance",
    symbolicElements: ["long vertical resonance lines", "endpin shadow on floor", "low cello hum as light pulse"],
    motionLanguage: "slow deep sway in luminous vertical strokes",
    directScene:
      "solo cello in soft focus, rich amber concert lighting, strings portrait, no people, no writing",
    identityScene:
      "towering amber resonance columns in dark concert void, endpin shadow on floor, deep emotional swell of light not a literal cello, no people, no writing",
    avoidConcepts: ["literal cello body", "misshapen strings", "orchestra pit"],
  },
  strings: {
    id: "strings",
    label: "Strings",
    renderMode: "identity",
    palette: "rich amber concert glow, deep umber shadows, soft violet haze",
    lighting: "warm concert spill with long graceful falloff",
    textures: "velvet curtain blur, rosin mist, polished floor reflection",
    atmosphere: "chamber reverence and emotional breadth",
    symbolicElements: ["parallel string lines as light filaments", "bow arc trails", "stage dust in spotlight"],
    motionLanguage: "sweeping legato ribbons through amber air",
    directScene:
      "solo cello or violin in soft focus, rich amber concert lighting, strings instrument portrait, no people, no writing",
    identityScene:
      "parallel amber light filaments and bow-arc ribbons in concert darkness, chamber reverence without literal instruments, no people, no writing",
    avoidConcepts: ["literal violin or cello close-up", "orchestra ensemble", "misshapen bow"],
  },
  ukulele: {
    id: "ukulele",
    label: "Ukulele",
    renderMode: "identity",
    palette: "sunlit honey wood, soft coral warmth, breezy cyan fill",
    lighting: "bright window light with gentle tropical softness",
    textures: "handcrafted wood grain blur, woven fiber hint, sand-warm bokeh",
    atmosphere: "carefree island breeze and small-scale joy",
    symbolicElements: ["palm shadow patterns", "sun flare on water bokeh", "tiny four-string rhythm dots"],
    motionLanguage: "playful bounce in warm light speckles",
    directScene:
      "ukulele close-up, warm handcrafted wood, sunny soft tones, cheerful instrument still life, no people, no writing",
    identityScene:
      "sunlit honey wood tones and breezy coral glow, palm-shadow patterns and water bokeh, tiny rhythmic light dots suggesting ukulele joy without literal instrument, no people, no writing",
    avoidConcepts: ["literal ukulele close-up", "misshapen tiny guitar body", "tropical text signage"],
  },
  oud: {
    id: "oud",
    label: "Oud",
    renderMode: "identity",
    palette: "warm amber lacquer, desert dusk rose, deep teal shadow",
    lighting: "low warm lantern glow with carved-wood shadow play",
    textures: "inlaid mother-of-pearl suggestion, aged wood patina, silk cushion blur",
    atmosphere: "Levantine night majlis and maqam longing",
    symbolicElements: ["pear-shaped silhouette as shadow", "calligraphy-free geometric inlay glow", "incense smoke ribbon"],
    motionLanguage: "ornamented melodic curves drifting through warm haze",
    directScene:
      "oud body with warm inlaid patterns, lantern glow, Middle Eastern instrument still life, no people, no writing",
    identityScene:
      "pear-shaped amber shadow and geometric inlay glow in majlis darkness, incense ribbon and maqam longing atmosphere, no literal oud close-up, no people, no writing",
    avoidConcepts: ["literal oud close-up", "misshapen pear body", "readable arabic calligraphy"],
  },
  qanun: {
    id: "qanun",
    label: "Qanun",
    renderMode: "identity",
    palette: "gold trapezoid shimmer, ivory string lines, teal-violet ambient haze",
    lighting: "angled spotlight catching parallel string glints",
    textures: "silk backdrop, fine string filaments as light, lacquer sheen blur",
    atmosphere: "courtly resonance and precise ornament",
    symbolicElements: ["parallel golden string lines", "trapezoid shadow outline", "microtonal sparkle points"],
    motionLanguage: "rapid shimmer cascades along string lines",
    directScene:
      "qanun string plane glinting, gold and ivory tones, classical instrument still life, no people, no writing",
    identityScene:
      "parallel golden string filaments in trapezoid shadow outline, microtonal sparkle in teal haze, courtly resonance without literal qanun, no people, no writing",
    avoidConcepts: ["literal qanun close-up", "misshapen trapezoid", "readable text"],
  },
  ney: {
    id: "ney",
    label: "Ney",
    renderMode: "identity",
    palette: "reed amber, desert cyan sky fade, soft sand warmth",
    lighting: "backlit rim on hollow tube silhouette",
    textures: "matte reed grain, breath haze, open sky gradient",
    atmosphere: "Sufi breath, desert openness, spiritual stillness",
    symbolicElements: ["breath spiral ribbon", "horizon line glow", "single hollow shadow tube"],
    motionLanguage: "slow breath spiral rising into open sky",
    directScene:
      "ney flute silhouette against soft sky gradient, reed warmth, spiritual minimal still life, no people, no writing",
    identityScene:
      "breath spiral ribbon rising from hollow shadow tube into desert cyan sky, Sufi stillness without literal ney, no people, no writing",
    avoidConcepts: ["literal ney close-up", "misshapen reed tube", "religious text"],
  },
  mandolin: {
    id: "mandolin",
    label: "Mandolin",
    renderMode: "identity",
    palette: "sunburst amber, folk green shadow, warm porch-light gold",
    lighting: "warm porch lamp with folk intimacy",
    textures: "varnish glow, paired string shimmer, worn wood warmth blur",
    atmosphere: "folk porch gathering memory without figures",
    symbolicElements: ["paired string glint pairs", "porch light cone", "rolling hill bokeh"],
    motionLanguage: "bright tremolo sparkle in paired light dots",
    directScene:
      "mandolin sunburst body in warm porch light, folk instrument still life, no people, no writing",
    identityScene:
      "paired string glint pairs in sunburst amber porch-light cone, folk hill bokeh, tremolo sparkle without literal mandolin, no people, no writing",
    avoidConcepts: ["literal mandolin close-up", "misshapen double strings", "readable signage"],
  },
};

const LABEL_TO_ID = Object.fromEntries(
  Object.values(INSTRUMENT_VISUAL_PROFILES).map((p) => [p.label.toLowerCase(), p.id]),
);

const ALIAS_TO_ID = {
  acoustic: "acoustic_guitar",
  electric: "electric_guitar",
  synth_lead: "synth",
  strings_melody: "strings",
};

/**
 * @param {string} instrumentId
 * @param {string} instrumentLabel
 * @returns {string}
 */
export function normalizeHumInstrumentId(instrumentId, instrumentLabel = "") {
  const raw = String(instrumentId || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "");
  if (raw && INSTRUMENT_VISUAL_PROFILES[raw]) return raw;
  if (raw && ALIAS_TO_ID[raw]) return ALIAS_TO_ID[raw];

  const label = String(instrumentLabel || "").trim().toLowerCase();
  if (label && LABEL_TO_ID[label]) return LABEL_TO_ID[label];
  if (/piano/.test(label)) return "piano";
  if (/acoustic/.test(label)) return "acoustic_guitar";
  if (/electric/.test(label)) return "electric_guitar";
  if (/violin/.test(label)) return "violin";
  if (/cello/.test(label)) return "cello";
  if (/string/.test(label)) return "strings";
  if (/ukulele/.test(label)) return "ukulele";
  if (/flute/.test(label)) return "flute";
  if (/synth/.test(label)) return "synth";
  if (/oud/.test(label)) return "oud";
  if (/qanun/.test(label)) return "qanun";
  if (/ney/.test(label)) return "ney";
  if (/mandolin/.test(label)) return "mandolin";
  if (/microphone|mic\b/.test(label)) return "microphone";
  if (/headphone/.test(label)) return "headphones";
  if (/vinyl|turntable/.test(label)) return "vinyl";
  if (/speaker|monitor/.test(label)) return "speakers";

  return raw || "unknown";
}

/**
 * @param {string} instrumentId
 * @param {string} instrumentLabel
 * @returns {InstrumentVisualProfile|null}
 */
export function resolveHumInstrumentVisual(instrumentId, instrumentLabel = "") {
  const id = normalizeHumInstrumentId(instrumentId, instrumentLabel);
  return INSTRUMENT_VISUAL_PROFILES[id] || null;
}

/**
 * @param {InstrumentVisualProfile} profile
 * @returns {string}
 */
export function instrumentSceneForProfile(profile) {
  if (!profile) return "";
  return profile.renderMode === "direct" ? profile.directScene : profile.identityScene;
}

/**
 * @param {InstrumentVisualProfile} profile
 * @returns {string}
 */
export function instrumentSettingForProfile(profile) {
  if (!profile) return "";
  return [profile.atmosphere, profile.textures].filter(Boolean).join(", ").slice(0, 120);
}

/**
 * @param {InstrumentVisualProfile} profile
 * @returns {string}
 */
export function instrumentLightingForProfile(profile) {
  return String(profile?.lighting || "").slice(0, 100);
}

/**
 * @param {InstrumentVisualProfile} profile
 * @returns {string}
 */
export function instrumentPaletteForProfile(profile) {
  return String(profile?.palette || "").slice(0, 120);
}

/**
 * @param {InstrumentVisualProfile} profile
 * @returns {string}
 */
export function instrumentMainSubjectForProfile(profile) {
  if (!profile) return "";
  const scene = instrumentSceneForProfile(profile);
  if (profile.renderMode === "identity") {
    return [scene, profile.motionLanguage].filter(Boolean).join(", ").slice(0, 120);
  }
  return scene.slice(0, 120);
}
