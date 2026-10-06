/**
 * Full Lyria "Studio style" sound prompts (Flow / AI Studio lab).
 * Selecting one replaces Style / Tags — user adds Idea + singer/dialect chips only.
 */

/** @typedef {object} LyriaStudioStyle
 * @property {string} id
 * @property {string} label
 * @property {string} [subtitle]
 * @property {string} styleLine
 * @property {"m"|"f"|""} [defaultSinger]
 * @property {string} [dialectKey] lebanese | egyptian | iraqi | gulf | moroccan | …
 * @property {string} [ideaPlaceholder]
 */

/** @type {LyriaStudioStyle[]} */
export const LYRIA_STUDIO_STYLES = [
  {
    id: "levantine-pop-fusion",
    label: "Levantine pop fusion",
    subtitle: "110 BPM · oud · synth",
    defaultSinger: "m",
    dialectKey: "lebanese",
    styleLine:
      "Arabic Pop, Levantine acoustic folk, retro synth-pop fusion, warm acoustic oud solo, resonant nay flute, punchy electronic kick, dynamic bassline, crisp riq percussion, emotional raspy male vocals, Levantine vocal ornamentation, atmospheric dusk mood, minor key, 110 BPM, balanced acoustic and electronic production",
  },
  {
    id: "levantine-folk-dabke",
    label: "Levantine folk",
    subtitle: "122 BPM · dabke revival",
    defaultSinger: "m",
    dialectKey: "lebanese",
    styleLine:
      "Levantine folk, Dabke revival, energetic acoustic folk, lead male vocal with bright ringing tone and group male backing vocals, acoustic oud, driving darbuka, rhythmic riq, piercing mijwiz, syncopated handclaps, buoyant acoustic bass, fast driving tempo, 122 BPM, Bayati mode feel, proud, triumphant, energetic, celebratory",
  },
  {
    id: "traditional-dabke",
    label: "Traditional dabke",
    subtitle: "128 BPM · mijwiz · Lebanese",
    defaultSinger: "m",
    dialectKey: "lebanese",
    styleLine:
      "Traditional Lebanese Dabke, fast driving tempo 128 BPM, clear punchy Kafta rhythm on darbuka and heavy bass drum, piercing live acoustic mijwiz and yarghoul leads, energetic syncopated handclaps, passionate clear male lead vocal in authentic Lebanese dialect, triumphant celebratory festive atmosphere, crisp folk mix",
  },
  {
    id: "dance-indie-pop",
    label: "Dance-indie pop",
    subtitle: "122 BPM · female · major",
    defaultSinger: "f",
    styleLine:
      "Dance-pop, triumphant indie pop, energetic synth-pop, driving 4-on-the-floor beat, pulsing synth bass, bright euphoric synth pads, uplifting melodic hooks, powerful female lead vocal, crisp modern mix, expressive confident tone, mid-fast dance tempo, 122 BPM, major key, infectious summer dance vibe",
  },
  {
    id: "cyber-dabke",
    label: "Cyber dabke",
    subtitle: "130 BPM · synthwave",
    defaultSinger: "m",
    dialectKey: "lebanese",
    styleLine:
      "Electronic, Cyber-Dabke, Melodic Bass, Synthwave, driving 130 BPM, minor key, aggressive synthesized mijwiz lead, pounding electronic darbuka and riqq percussion, punchy synth-bass drops, passionate energetic male lead vocals with high-register belting and vocal chops, triumphant Levantine anthem mood",
  },
  {
    id: "arabic-pop",
    label: "Arabic pop",
    subtitle: "120 BPM · radio dance",
    defaultSinger: "m",
    dialectKey: "lebanese",
    styleLine:
      "Arabic Pop, Commercial Middle Eastern Dance-Pop, driving darbuka and riq percussion, modern synth bass, energetic acoustic guitar, bright lead Oud hooks, 120 BPM, major key, upbeat, expressive energetic singer, polished radio-ready vocal production, joyful celebratory atmosphere",
  },
  {
    id: "acoustic-ballad-ella",
    label: "Acoustic ballad",
    subtitle: "75 BPM · intimate",
    defaultSinger: "m",
    dialectKey: "lebanese",
    ideaPlaceholder: "Romantic topic — one or two short lines",
    styleLine:
      "Acoustic Arabic pop ballad, warm male vocals, smooth vocal harmonies, soft acoustic guitar picking, gentle frame drum rhythm, subtle bass, romantic slow jam style, intimate, cozy, mid-tempo 75 BPM, organic timbre, key of A minor",
  },
  {
    id: "arabic-trap",
    label: "Arabic trap",
    subtitle: "140 BPM · 808 · C minor",
    defaultSinger: "m",
    dialectKey: "lebanese",
    styleLine:
      "Arabic Trap, Melodic Hip-Hop, sub-genre Middle Eastern Trap, heavy booming 808 sub-bass, hypnotic dark acoustic Oud hook, sharp brassy synths, fast sliding hi-hats, tight snare, male vocal, deep raspy tone, tuned melodic flow, confident aggressive cadence, stoic dark mood, 140 BPM, C minor",
  },
  {
    id: "modern-rai",
    label: "Modern raï",
    subtitle: "124 BPM · Algerian",
    defaultSinger: "m",
    styleLine:
      "Algerian Rai, electro dance-pop, fast driving 4/4 club beat, acoustic darbuka percussion, raspy traditional gasba flute, pulsed synth bass, euphoric pads, energetic and passionate male tenor vocals, desperate emotional delivery, night life atmosphere, intense, ecstatic, minor key, 124 BPM",
  },
  {
    id: "levantine-ballad",
    label: "Levantine ballad",
    subtitle: "75 BPM · orchestral",
    defaultSinger: "f",
    dialectKey: "lebanese",
    styleLine:
      "Orchestral Pop, Levantine Folk Ballad, serene angelic female vocal, smooth dynamic vibrato, grand acoustic piano, sweeping lush string orchestra, gentle nay flute, soft frame drum rhythm, acoustic bass, romantic, deeply nostalgic, warm organic production, emotional swelling crescendo, key of D minor, 75 BPM",
  },
  {
    id: "mountain-dabke-electronic",
    label: "Mountain dabke · electronic",
    subtitle: "128 BPM · female belt",
    defaultSinger: "f",
    dialectKey: "lebanese",
    styleLine:
      "Electronic Dance, Eclectic Funky House, Lebanese Mountain Dabke, Modern Baladi Pop, 128 BPM, Key of G minor, driving house breakbeats with heavy Tabl and Katim percussion, energetic piercing Zurna and dual-pipe Mijwiz lead, powerful passionate female mountain belt vocal, rhythmic crowd chants, festive, high energy, upbeat, vibrant",
  },
  {
    id: "mountain-dabke-folk",
    label: "Mountain dabke",
    subtitle: "128 BPM · mijwiz",
    defaultSinger: "m",
    dialectKey: "lebanese",
    styleLine:
      "Middle Eastern Folk, Lebanese Mountain Dabke, Levantine Folklore, high energy traditional dance, driving heavy Tabla, Katim percussion, double-pipe Mijwiz lead, acoustic oud, energetic male vocalist, powerful mountain vocal belts, Mawwal vocal improvisations, raw, resonant, fast tempo, 128 BPM, dramatic and triumphant",
  },
  {
    id: "egyptian-pop",
    label: "Egyptian pop",
    subtitle: "120 BPM · female",
    defaultSinger: "f",
    dialectKey: "egyptian",
    styleLine:
      "Egyptian Pop, Baladi Electro-Pop, fast 120 BPM Maqsum rhythm, lively accordion riffs, bright darbuka, duff frame drum, energetic brass hits, flirty upbeat lead female vocals, dynamic call-and-response backing vocals, major key, playful, danceable, high-energy polished commercial radio sound",
  },
  {
    id: "greek-arabic-fusion",
    label: "Greek–Arabic fusion",
    subtitle: "90 BPM · bouzouki",
    defaultSinger: "m",
    dialectKey: "lebanese",
    styleLine:
      "Greek Arabic Pop fusion, romantic R&B ballad, smooth warm male vocal, melismatic vocal ornaments and runs, relaxed rumba rhythm, gentle acoustic nylon guitar, melodic bouzouki lines, organic percussion, warm bass, mid-tempo 90 BPM, key of D minor, deep passionate and nostalgic atmosphere",
  },
  {
    id: "lebanese-mawwal",
    label: "Lebanese mawwal",
    subtitle: "85 BPM · tarab",
    defaultSinger: "m",
    dialectKey: "lebanese",
    styleLine:
      "Lebanese folk, classic Tarab, mountain Mawwal, acoustic resonant Oud solo, traditional Nay flute, orchestral Arabic violins, riqq, darbuka, powerful booming male vocal with passionate vibrato and wide range, authentic mountain atmosphere, rubato intro into steady mid-tempo folk rhythm, rich organic acoustics, earnest, triumphant, 85 BPM, Bayati mode",
  },
  {
    id: "modern-khaleeji-pop",
    label: "Modern Khaleeji pop",
    subtitle: "95 BPM · samri",
    defaultSinger: "m",
    dialectKey: "gulf",
    styleLine:
      "Modern Khaleeji Pop, R&B Melismatic Vocal Anthem, authentic Samri and Khabeeti polyrhythmic percussion, heavy handclaps, warm acoustic Oud leads, subtle modern sub bass, expressive passionate male vocal, soaring dynamic vocal runs, 95 BPM, D minor key, rich backing harmonies, polished spatial mix",
  },
  {
    id: "modern-iraqi-pop",
    label: "Modern Iraqi pop",
    subtitle: "128 BPM · khashaba",
    defaultSinger: "m",
    dialectKey: "iraqi",
    styleLine:
      "Modern Iraqi Pop, Middle Eastern dance-pop, driving Khashaba percussion rhythm, energetic 128 BPM, dramatic orchestral strings, expressive accordion lead, emotional passionate male vocals, high-energy mainstage drop, intense romantic atmosphere, minor key, crisp punchy production",
  },
  {
    id: "lebanese-folk-tarab",
    label: "Lebanese folk tarab",
    subtitle: "115 BPM · mijwiz",
    defaultSinger: "m",
    dialectKey: "lebanese",
    styleLine:
      "Lebanese Folk Tarab, Mountain Dabke, Levantine Urban Folk, powerful passionate male belting vocals, resonant chest voice, traditional Lebanese Mawwal intro, high-pitched Mijwiz reed woodwind, heavy striking Tabla, energetic Derbake beat, dramatic lush oriental orchestral violins, proud, celebratory, romantic, energetic, fast 115 BPM, Key of A minor Maqam Bayati",
  },
  {
    id: "wael-style-1",
    label: "Wael style 1",
    subtitle: "105 BPM · romantic pop",
    defaultSinger: "m",
    dialectKey: "lebanese",
    styleLine:
      "Lebanese Pop, Romantic Arabic Pop, 105 BPM Maqsum beat, smooth silky male vocals, soaring vocal dynamics, lush dramatic string orchestra, rich oriental percussion, darbuka, riq, passionate romantic mood, mountain wedding celebration atmosphere, warm acoustic textures, high-gloss production, emotional Middle Eastern pop",
  },
  {
    id: "wael-style-2",
    label: "Wael style 2",
    subtitle: "68 BPM · slow ballad",
    defaultSinger: "m",
    dialectKey: "lebanese",
    styleLine:
      "Arabic Pop, Lebanese Romantic Slow Ballad, orchestral pop, grand acoustic piano, sweeping oriental strings, expressive deep cello solo, warm velvety passionate male vocals, dynamic emotional crescendo, acoustic building to orchestral climax, intimate romantic atmosphere, 68 BPM, key of C minor",
  },
  {
    id: "georges-wassouf-style",
    label: "Georges Wassouf style",
    subtitle: "70 BPM · tarab ballad",
    defaultSinger: "m",
    dialectKey: "lebanese",
    styleLine:
      "Arabic Classical Tarab, Levantine Acoustic Soul, deep emotional ballad, percussive acoustic guitar, microtonal acoustic oud, traditional riq percussion, emotional nay flute, lush warm string section, gravelly dynamic male baritone, raw raspy vocal timbre, authentic Middle Eastern phrasing, dramatic build-up, heartfelt melancholic mood, slow tempo, 70 BPM, key of D Bayati",
  },
];

const BY_ID = Object.freeze(Object.fromEntries(LYRIA_STUDIO_STYLES.map((s) => [s.id, s])));

export function getLyriaStudioStyle(id) {
  return BY_ID[String(id || "").trim()] || null;
}

export function listLyriaStudioStyles() {
  return LYRIA_STUDIO_STYLES;
}
