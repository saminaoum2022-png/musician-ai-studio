/** Client-side Hum Track presets (ids must match api/_lib/hum-track-presets.js). */
export const HUM_TRACK_INSTRUMENTS = [
  {
    id: "piano",
    label: "Piano",
    style:
      "solo piano, single instrument only, melodic lead, instrumental, no vocals, no drums, no bass, no guitar",
    negativeTags:
      "vocals, singing, humming, voice, speech, drums, percussion, bass, guitar, strings, full band, synth, pad, orchestral",
    coverArtHint:
      "grand piano keys close-up, moody purple studio lighting, single instrument portrait, cinematic album cover, no people",
  },
  {
    id: "acoustic_guitar",
    label: "Acoustic",
    style:
      "solo acoustic guitar, fingerpicked, single instrument only, melodic lead, instrumental, no vocals, no drums, no bass, no piano",
    negativeTags:
      "vocals, singing, humming, voice, speech, drums, percussion, bass, piano, electric guitar, full band, synth, pad",
    coverArtHint:
      "acoustic guitar body and soundhole, warm wood grain, soft spotlight, handcrafted album cover art, no people",
  },
  {
    id: "electric_guitar",
    label: "Electric",
    style:
      "solo electric guitar, clean tone, single instrument only, melodic lead, instrumental, no vocals, no drums, no bass, no piano",
    negativeTags:
      "vocals, singing, humming, voice, speech, drums, percussion, bass, piano, acoustic guitar, full band, synth, pad",
    coverArtHint:
      "electric guitar silhouette, clean modern studio, purple accent lighting, sleek album cover, no people",
  },
  {
    id: "violin",
    label: "Violin",
    style:
      "solo violin, single instrument only, melodic lead, instrumental, no vocals, no drums, no bass, no piano, no guitar",
    negativeTags:
      "vocals, singing, humming, voice, speech, drums, percussion, bass, piano, guitar, full band, synth, pad, orchestral section",
    coverArtHint:
      "violin and bow on velvet, warm dramatic lighting, classical instrument portrait, elegant album cover, no people",
  },
  {
    id: "flute",
    label: "Flute",
    style:
      "solo flute, single instrument only, melodic lead, instrumental, no vocals, no drums, no bass, no piano, no guitar",
    negativeTags:
      "vocals, singing, humming, voice, speech, drums, percussion, bass, piano, guitar, strings, full band, synth, pad",
    coverArtHint:
      "silver flute gleaming, soft bokeh background, airy minimal album cover art, no people",
  },
  {
    id: "ukulele",
    label: "Ukulele",
    style:
      "solo ukulele, fingerpicked, single instrument only, melodic lead, instrumental, no vocals, no drums, no bass, no piano",
    negativeTags:
      "vocals, singing, humming, voice, speech, drums, percussion, bass, piano, guitar, full band, synth, pad",
    coverArtHint:
      "ukulele close-up, warm handcrafted wood, sunny soft tones, cheerful album cover, no people",
  },
  {
    id: "synth",
    label: "Synth",
    style:
      "solo synth lead, monophonic, single instrument only, melodic lead, instrumental, no vocals, no drums, no bass, no piano, no guitar",
    negativeTags:
      "vocals, singing, humming, voice, speech, drums, percussion, bass, piano, guitar, strings, full band, pad, orchestral",
    coverArtHint:
      "retro synthesizer knobs and keys, neon purple glow, electronic album cover art, no people",
  },
  {
    id: "strings",
    label: "Strings",
    style:
      "solo string melody, single instrument lead, instrumental, no vocals, no drums, no bass, no piano, no guitar",
    negativeTags:
      "vocals, singing, humming, voice, speech, drums, percussion, bass, piano, guitar, full band, synth pad, heavy orchestral",
    coverArtHint:
      "solo cello or violin in soft focus, rich amber concert lighting, strings album cover, no people",
  },
];

export function getHumTrackPreset(id) {
  const key = String(id || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "");
  return HUM_TRACK_INSTRUMENTS.find((x) => x.id === key) || HUM_TRACK_INSTRUMENTS[0];
}
