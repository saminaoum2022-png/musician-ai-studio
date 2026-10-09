/**
 * International Studio Styles — locked recipes with optional Advanced slots.
 * Do not merge into Arabic LYRIA_STUDIO_STYLES. Placeholders must be filled
 * before anything reaches Lyria.
 */

export const INTERNATIONAL_SLOT_KEYS = Object.freeze(["LEAD", "RHYTHM", "MOOD", "BPM", "KEY"]);

/** @typedef {object} InternationalStudioStyle
 * @property {string} id
 * @property {string} name
 * @property {string} style_prompt
 * @property {string} vocal_male
 * @property {string} vocal_female
 * @property {"male"|"female"} default_vocal
 * @property {Record<string, { default: string, options: string[] }>} slots
 */

/** @type {InternationalStudioStyle[]} */
export const LYRIA_INTERNATIONAL_STYLES = [
  {
    id: "synthpop_80s",
    name: "80s Synthpop",
    style_prompt:
      "80s synthpop, dark atmospheric electronic pop, {VOCAL}, {RHYTHM}, warm pulsing analog bassline, {LEAD}, shimmering pads, soft airy harmonies only in the chorus, chorus lifts with one added layer and the vocal stays on top, {MOOD} mood, {BPM} BPM, {KEY}, clean spacious mobile-friendly mix",
    vocal_male: "warm clear male baritone lead vocal upfront with a cool restrained delivery",
    vocal_female: "crisp intimate female lead vocal upfront with a breathy controlled delivery",
    default_vocal: "female",
    slots: {
      LEAD: {
        default: "bright synth arpeggios",
        options: ["saxophone hook", "chorused electric guitar riff", "glassy bell synth melody"],
      },
      RHYTHM: {
        default: "punchy LinnDrum beat",
        options: ["gated reverb snare drums", "drum machine with handclaps", "slow half-time drum beat"],
      },
      MOOD: {
        default: "haunting night-drive",
        options: ["nostalgic", "romantic neon", "cold and mysterious", "euphoric"],
      },
      BPM: { default: "120", options: ["98", "110", "126"] },
      KEY: { default: "A minor", options: ["D minor", "F minor", "C major"] },
    },
  },
  {
    id: "indie_folk",
    name: "Indie Folk",
    style_prompt:
      "Indie folk, cinematic confessional singer-songwriter, {VOCAL}, warm fingerpicked acoustic guitar, {LEAD}, {RHYTHM}, organic wood timbre, cozy room acoustics, chorus opens up with one added layer and the vocal stays on top, {MOOD} mood, {BPM} BPM, {KEY}, clean spacious mobile-friendly mix",
    vocal_male: "soft breathy male baritone vocal upfront with an intimate warm delivery",
    vocal_female: "soft warm female alto vocal upfront with an intimate gentle delivery",
    default_vocal: "male",
    slots: {
      LEAD: {
        default: "subtle bowed cello",
        options: ["soft piano", "gentle violin", "harmonica", "mandolin"],
      },
      RHYTHM: {
        default: "very light percussion",
        options: ["soft brushed drums", "foot stomps and handclaps", "light shaker"],
      },
      MOOD: {
        default: "nostalgic raw with quiet intensity",
        options: ["hopeful", "heartbroken", "warm romantic", "bittersweet"],
      },
      BPM: { default: "85", options: ["72", "95", "108"] },
      KEY: { default: "D major", options: ["A minor", "G major", "E minor"] },
    },
  },
  {
    id: "contemporary_rnb",
    name: "Contemporary R&B",
    style_prompt:
      "Contemporary alternative R&B, {VOCAL}, {LEAD}, warm 808 bass, {RHYTHM}, airy vocal transitions, soft lo-fi atmosphere, chorus lifts with one added layer and the vocal stays on top, {MOOD} mood, {BPM} BPM, {KEY}, clean spacious mobile-friendly mix",
    vocal_male: "smooth male baritone lead vocal upfront with an intimate conversational delivery",
    vocal_female: "soulful female lead vocal upfront with an intimate conversational delivery",
    default_vocal: "female",
    slots: {
      LEAD: {
        default: "smooth electric piano",
        options: ["muted electric guitar", "warm synth pads", "Rhodes with vinyl crackle"],
      },
      RHYTHM: {
        default: "crisp rolling hi-hats",
        options: ["soft live drums", "half-time trap beat", "finger snaps and rimshots"],
      },
      MOOD: {
        default: "chill romantic late-night",
        options: ["sensual", "heartbroken", "confident", "dreamy"],
      },
      BPM: { default: "95", options: ["75", "88", "102"] },
      KEY: { default: "E-flat major", options: ["C minor", "A-flat major", "F minor"] },
    },
  },
  {
    id: "alt_rock",
    name: "Alternative Rock",
    style_prompt:
      "Alternative rock, 90s lo-fi slacker rock, {VOCAL}, {LEAD}, driving fuzzy bass, {RHYTHM}, short background chants only in the chorus and quieter than the lead, chorus lifts with one added layer and the vocal stays on top, raw garage mixtape saturation, {MOOD} mood, {BPM} BPM, {KEY}, clean spacious mobile-friendly mix",
    vocal_male: "bold confident male baritone lead vocal upfront with a relaxed gritty delivery",
    vocal_female: "cool confident female alto lead vocal upfront with a relaxed gritty delivery",
    default_vocal: "male",
    slots: {
      LEAD: {
        default: "warm overdriven electric guitars",
        options: ["clean jangly guitars", "heavy fuzz guitar riffs", "acoustic and electric guitars together"],
      },
      RHYTHM: {
        default: "punchy drums",
        options: ["loose garage drums", "fast punk beat", "half-time heavy groove"],
      },
      MOOD: {
        default: "rebellious triumphant upbeat",
        options: ["melancholic", "carefree summer", "angsty", "nostalgic"],
      },
      BPM: { default: "135", options: ["100", "120", "160"] },
      KEY: { default: "E minor", options: ["A minor", "D major", "G major"] },
    },
  },
  {
    id: "lofi_hiphop",
    name: "Lo-fi Hip-Hop",
    style_prompt:
      "Lo-fi hip-hop, {VOCAL}, {LEAD}, gentle muted bassline, {RHYTHM}, relaxed vinyl crackle, dusty tape warmth, chorus adds one soft layer and the vocal stays on top, {MOOD} mood, {BPM} BPM, {KEY}, clean spacious mobile-friendly mix",
    vocal_male: "smooth relaxed male baritone vocal upfront with a laid-back half-sung flow",
    vocal_female: "soft dreamy female vocal upfront with a laid-back airy delivery",
    default_vocal: "male",
    slots: {
      LEAD: {
        default: "warm jazz piano chords",
        options: ["mellow electric guitar", "Rhodes chords", "soft saxophone", "kalimba"],
      },
      RHYTHM: {
        default: "laid-back boom bap drum loop",
        options: ["swung lazy drums", "soft brushed drums", "light four-on-the-floor house beat"],
      },
      MOOD: {
        default: "nostalgic chillout",
        options: ["study focus", "rainy night", "sunny morning", "melancholic"],
      },
      BPM: { default: "80", options: ["70", "88", "95"] },
      KEY: { default: "F major", options: ["D minor", "A-flat major", "E minor"] },
    },
  },
  {
    id: "rnb_pop",
    name: "R&B Pop",
    style_prompt:
      "Modern R&B pop, dance-pop, {VOCAL}, punchy 808 sub bass, {RHYTHM}, {LEAD}, catchy bouncy melodic phrasing, chorus lifts with one added layer and the vocal stays on top, {MOOD} groove-driven mood, {BPM} BPM, {KEY}, clean spacious mobile-friendly mix",
    vocal_male: "smooth confident male baritone lead vocal upfront with warm falsetto touches only on chorus hooks",
    vocal_female: "sultry confident female lead vocal upfront with light airy touches only on chorus hooks",
    default_vocal: "male",
    slots: {
      LEAD: {
        default: "rhythmic synth plucks",
        options: ["funky guitar licks", "brass stabs", "marimba plucks", "bright piano"],
      },
      RHYTHM: {
        default: "crisp snare and organic finger snaps",
        options: ["afrobeats percussion", "four-on-the-floor kick", "claps and shakers"],
      },
      MOOD: {
        default: "seductive upbeat",
        options: ["summer feel-good", "flirty playful", "confident night-out", "romantic"],
      },
      BPM: { default: "100", options: ["92", "108", "118"] },
      KEY: { default: "G minor", options: ["C minor", "B-flat major", "A minor"] },
    },
  },
  {
    id: "latin_dance_pop",
    name: "Latin Dance-Pop",
    style_prompt:
      "Latin dance-pop, anthemic electro-pop, {VOCAL}, {LEAD}, rhythmic Spanish nylon guitar, warm punchy electronic sub-bass, {RHYTHM}, chorus lifts with one added layer and the vocal stays on top, {MOOD} mood, {BPM} BPM, {KEY}, polished clean spacious mobile-friendly mix",
    vocal_male: "warm confident male baritone lead vocal upfront with controlled high notes only on chorus hooks",
    vocal_female: "confident bright female lead vocal upfront with controlled powerful high notes only on chorus hooks",
    default_vocal: "female",
    slots: {
      LEAD: {
        default: "bright brass horn section with short stabs",
        options: ["accordion riff", "synth lead hook", "trumpet solo hook", "piano montuno"],
      },
      RHYTHM: {
        default: "timbales and a driving four-on-the-floor club beat",
        options: ["dembow reggaeton beat", "congas and bongos groove", "bachata bongo groove"],
      },
      MOOD: {
        default: "vibrant festive upbeat",
        options: ["sensual summer night", "romantic", "carnival party", "empowering"],
      },
      BPM: { default: "124", options: ["95", "110", "128"] },
      KEY: { default: "A minor", options: ["D minor", "F major", "E minor"] },
    },
  },
  {
    id: "kpop_dance",
    name: "K-pop Dance",
    style_prompt:
      "K-pop dance, electro-pop house, {VOCAL}, short sharp rap flow in the verses, background harmonies only in the chorus and quieter than the leads, tight punchy synth bassline, {RHYTHM}, {LEAD}, chorus lifts with one added layer and the vocal stays on top, {MOOD} high-energy mood, {BPM} BPM, {KEY}, polished clean spacious mobile-friendly mix",
    vocal_male: "smooth confident male vocal ensemble upfront with switching leads and a warm baritone anchor",
    vocal_female: "confident bright female vocal ensemble upfront with switching leads and controlled high notes on hooks",
    default_vocal: "female",
    slots: {
      LEAD: {
        default: "bright synth leads with polished brass synth accents",
        options: ["whistle hook", "electric guitar riff", "plucked synth hook", "string hook"],
      },
      RHYTHM: {
        default: "punchy electro-pop drums",
        options: ["trap hi-hats and 808s", "four-on-the-floor house beat", "breakbeat drums"],
      },
      MOOD: {
        default: "radiant triumphant",
        options: ["fierce confident", "cute playful", "dreamy", "dark mysterious"],
      },
      BPM: { default: "126", options: ["100", "118", "132"] },
      KEY: { default: "F minor", options: ["C minor", "A-flat major", "D minor"] },
    },
  },
  {
    id: "deep_house_garage",
    name: "Deep House Garage",
    style_prompt:
      "Deep house with UK garage swing, {VOCAL}, sparse minimal arrangement, {RHYTHM}, warm rolling sub bass, {LEAD} as the only lead, plenty of space between elements, chorus adds one soft layer and the vocal stays on top, {MOOD} mood, {BPM} BPM, {KEY}, clean spacious mobile-friendly mix",
    vocal_male: "smooth hypnotic male baritone vocal upfront with a velvet relaxed tone",
    vocal_female: "smooth sultry female vocal upfront with a velvet airy tone",
    default_vocal: "male",
    slots: {
      LEAD: {
        default: "one simple M1 organ chord riff",
        options: ["one soft Rhodes chord riff", "one plucked synth stab riff", "one warm pad"],
      },
      RHYTHM: {
        default: "swung shuffle garage drums",
        options: ["straight four-on-the-floor house drums", "2-step broken beat", "organic Afro percussion"],
      },
      MOOD: {
        default: "deep nocturnal club",
        options: ["sunset rooftop", "euphoric", "moody rainy night", "sensual"],
      },
      BPM: { default: "124", options: ["120", "128", "132"] },
      KEY: { default: "G minor", options: ["A minor", "F minor", "C minor"] },
    },
  },
  {
    id: "melodic_techno",
    name: "Melodic Techno",
    style_prompt:
      "Melodic techno, {VOCAL}, sparse hypnotic arrangement, deep punchy kick, {RHYTHM}, {LEAD} as the only lead, short vocal phrases with space around them, builds only in the breaks, drop adds one layer, {MOOD} mood, {BPM} BPM, {KEY}, clean spacious mobile-friendly mix",
    vocal_male: "deep calm authoritative male spoken-word vocal chops, short and upfront",
    vocal_female: "cool low female spoken-word vocal chops, short and upfront",
    default_vocal: "male",
    slots: {
      LEAD: {
        default: "one evolving arpeggio synth",
        options: ["one cinematic string motif", "one oud motif", "one piano motif"],
      },
      RHYTHM: {
        default: "dark rolling bassline",
        options: ["acid 303 bassline", "deep rumbling bass", "broken techno groove"],
      },
      MOOD: {
        default: "dark club",
        options: ["euphoric sunrise", "cinematic epic", "mysterious"],
      },
      BPM: { default: "128", options: ["122", "126", "132"] },
      KEY: { default: "A minor", options: ["F minor", "C minor", "E Phrygian"] },
    },
  },
];

const BY_ID = Object.freeze(
  Object.fromEntries(LYRIA_INTERNATIONAL_STYLES.map((s) => [s.id, s])),
);

const STOP = new Set([
  "a", "an", "the", "with", "and", "only", "as", "of", "on", "in", "one",
  "simple", "very", "short", "soft", "warm", "bright", "punchy", "crisp",
  "gentle", "smooth", "driving", "organic",
]);

const LABEL_ALIASES = Object.freeze({
  "saxophone hook": "Sax",
  "dembow reggaeton beat": "Reggaeton",
  "clean jangly guitars": "Jangly",
  "rainy night": "Rainy",
  "chorused electric guitar riff": "Chorus guitar",
  "glassy bell synth melody": "Bell synth",
  "gated reverb snare drums": "Gated snare",
  "drum machine with handclaps": "Claps",
  "slow half-time drum beat": "Half-time",
  "punchy linndrum beat": "LinnDrum",
  "haunting night-drive": "Night-drive",
  "romantic neon": "Neon",
  "cold and mysterious": "Cold",
  "subtle bowed cello": "Cello",
  "foot stomps and handclaps": "Stomps",
  "nostalgic raw with quiet intensity": "Raw",
  "smooth electric piano": "E-piano",
  "rhodes with vinyl crackle": "Rhodes",
  "crisp rolling hi-hats": "Hi-hats",
  "half-time trap beat": "Trap",
  "finger snaps and rimshots": "Snaps",
  "chill romantic late-night": "Late-night",
  "warm overdriven electric guitars": "Overdrive",
  "heavy fuzz guitar riffs": "Fuzz",
  "acoustic and electric guitars together": "Both guitars",
  "rebellious triumphant upbeat": "Rebellious",
  "warm jazz piano chords": "Jazz piano",
  "laid-back boom bap drum loop": "Boom bap",
  "light four-on-the-floor house beat": "House",
  "nostalgic chillout": "Chillout",
  "rhythmic synth plucks": "Plucks",
  "crisp snare and organic finger snaps": "Snaps",
  "four-on-the-floor kick": "4/4 kick",
  "seductive upbeat": "Seductive",
  "bright brass horn section with short stabs": "Brass",
  "timbales and a driving four-on-the-floor club beat": "Timbales",
  "vibrant festive upbeat": "Festive",
  "bright synth leads with polished brass synth accents": "Synth brass",
  "punchy electro-pop drums": "Electro drums",
  "radiant triumphant": "Radiant",
  "one simple m1 organ chord riff": "M1 organ",
  "swung shuffle garage drums": "Garage",
  "deep nocturnal club": "Nocturnal",
  "one evolving arpeggio synth": "Arp",
  "dark rolling bassline": "Rolling bass",
  "dark club": "Dark club",
  "e-flat major": "E♭ major",
  "a-flat major": "A♭ major",
  "b-flat major": "B♭ major",
  "e phrygian": "E Phrygian",
  "bright modern synth lead": "Synth",
  "soft oud": "Soft oud",
  "soft wahda rhythm in the verses with sparse darbuka and space between hits, switching to a driving maqsum on darbuka and riq in the chorus, baladi in the final chorus": "Wahda → Maqsum",
  "laid-back modern maqsum, deep 808 kick on the dum, light finger snap on the tak, lots of space; the chorus gets a fuller 808 sub and soft darbuka accents, still minimal and clean": "Modern Maqsum 808",
  "light malfuf rhythm with soft dums and no bass in the verses; the chorus drops into a modern baladi groove with a deep 808 sub dum, crisp clap tak and open space, sparse melody over a heavy low end": "Modern Baladi 808",
});

export function getInternationalStyle(id) {
  return BY_ID[String(id || "").trim()] || null;
}

export function listInternationalStyles() {
  return LYRIA_INTERNATIONAL_STYLES;
}

export function leftoverStylePlaceholders(text) {
  return String(text || "").match(/\{[A-Z][A-Z0-9_]*\}/g) || [];
}

export function internationalStyleUi(style) {
  if (!style) return null;
  return {
    id: style.id,
    label: style.name,
    defaultSinger: style.default_vocal === "female" ? "f" : "m",
    group: "international",
  };
}

export function defaultInternationalSlots(style) {
  const out = {};
  for (const key of INTERNATIONAL_SLOT_KEYS) {
    out[key] = String(style?.slots?.[key]?.default || "").trim();
  }
  return out;
}

export function allowedSlotValues(style, slot) {
  const spec = style?.slots?.[slot];
  if (!spec) return [];
  const out = [];
  const seen = new Set();
  const push = (v) => {
    const s = String(v || "").trim();
    if (!s || seen.has(s.toLowerCase())) return;
    seen.add(s.toLowerCase());
    out.push(s);
  };
  push(spec.default);
  for (const option of spec.options || []) push(option);
  return out;
}

export function resolveSlotValue(style, slot, picked) {
  const allowed = allowedSlotValues(style, slot);
  const want = String(picked || "").trim();
  if (want && allowed.some((v) => v.toLowerCase() === want.toLowerCase())) {
    return allowed.find((v) => v.toLowerCase() === want.toLowerCase()) || want;
  }
  return String(style?.slots?.[slot]?.default || "").trim();
}

export function shortSlotLabel(slot, value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (slot === "BPM" || slot === "KEY") {
    const alias = LABEL_ALIASES[raw.toLowerCase()];
    return alias || raw;
  }
  const alias = LABEL_ALIASES[raw.toLowerCase()];
  if (alias) return alias;
  const words = raw
    .replace(/[^a-zA-Z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((w) => w && !STOP.has(w.toLowerCase()));
  const pick = (words.length ? words.slice(0, 2) : raw.split(/\s+/).slice(0, 2))
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
  return pick.slice(0, 16) || raw.slice(0, 16);
}

export function resolveInternationalVocalText(style, vocalGender) {
  const g = String(vocalGender || "").trim().toLowerCase();
  if (g === "duo" || g === "duet") {
    return [style?.vocal_male, style?.vocal_female].filter(Boolean).join(" and ");
  }
  if (g === "m" || g === "male") return String(style?.vocal_male || "").trim();
  if (g === "f" || g === "female") return String(style?.vocal_female || "").trim();
  const fallback = String(style?.default_vocal || "male").toLowerCase() === "female"
    ? style?.vocal_female
    : style?.vocal_male;
  return String(fallback || "").trim();
}

/**
 * Fill {VOCAL}{LEAD}{RHYTHM}{MOOD}{BPM}{KEY}. Fail if any {…} remains.
 * @returns {{ ok: true, styleLine: string, bpm: number, key: string, vocal: string, slots: object } | { ok: false, error: string, leftover: string[], styleLine?: string }}
 */
export function fillInternationalStylePrompt({ style, vocalGender = "", slots = {} } = {}) {
  if (!style?.style_prompt) {
    return { ok: false, error: "missing_style", leftover: [] };
  }
  const vocal = resolveInternationalVocalText(style, vocalGender);
  const resolved = { VOCAL: vocal };
  for (const key of INTERNATIONAL_SLOT_KEYS) {
    resolved[key] = resolveSlotValue(style, key, slots[key]);
  }
  let line = String(style.style_prompt);
  for (const [key, val] of Object.entries(resolved)) {
    line = line.split(`{${key}}`).join(val);
  }
  const leftover = leftoverStylePlaceholders(line);
  if (leftover.length || leftoverStylePlaceholders(Object.values(resolved).join(" ")).length) {
    return {
      ok: false,
      error: `Style prompt still has unfilled slots: ${leftover.join(", ") || "{…}"}`,
      leftover,
      styleLine: line,
    };
  }
  if (!vocal) {
    return { ok: false, error: "Style prompt still has unfilled slots: {VOCAL}", leftover: ["{VOCAL}"] };
  }
  const bpm = Number(resolved.BPM);
  return {
    ok: true,
    styleLine: line,
    bpm: Number.isFinite(bpm) && bpm > 0 ? bpm : 0,
    key: resolved.KEY,
    vocal,
    slots: resolved,
  };
}
