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
      "empty piano bench, sheet music on wooden stand, metronome on table, moody teal studio, no keyboard visible, no people, no writing",
  },
  {
    id: "acoustic_guitar",
    label: "Acoustic",
    style:
      "solo acoustic guitar, fingerpicked, single instrument only, melodic lead, instrumental, no vocals, no drums, no bass, no piano",
    negativeTags:
      "vocals, singing, humming, voice, speech, drums, percussion, bass, piano, electric guitar, full band, synth, pad",
    coverArtHint:
      "empty wooden stand, closed gig bag, picks and capo on warm wood table, window sun shadows, no guitar visible, no people, no writing",
  },
  {
    id: "electric_guitar",
    label: "Electric",
    style:
      "solo electric guitar, clean tone, single instrument only, melodic lead, instrumental, no vocals, no drums, no bass, no piano",
    negativeTags:
      "vocals, singing, humming, voice, speech, drums, percussion, bass, piano, acoustic guitar, full band, synth, pad",
    coverArtHint:
      "empty guitar stand, coiled cable and effect pedal, violet-teal studio spill light, no guitar visible, no people, no writing",
  },
  {
    id: "violin",
    label: "Violin",
    style:
      "solo violin, single instrument only, melodic lead, instrumental, no vocals, no drums, no bass, no piano, no guitar",
    negativeTags:
      "vocals, singing, humming, voice, speech, drums, percussion, bass, piano, guitar, full band, synth, pad, orchestral section",
    coverArtHint:
      "open empty velvet-lined case, rosin and sheet music on wood table, warm dramatic light, no violin or bow, no people, no writing",
  },
  {
    id: "flute",
    label: "Flute",
    style:
      "solo flute, single instrument only, melodic lead, instrumental, no vocals, no drums, no bass, no piano, no guitar",
    negativeTags:
      "vocals, singing, humming, voice, speech, drums, percussion, bass, piano, guitar, strings, full band, synth, pad",
    coverArtHint:
      "empty velvet-lined case interior, cleaning cloth on studio table, soft airy bokeh, no flute visible, no people, no writing",
  },
  {
    id: "ukulele",
    label: "Ukulele",
    style:
      "solo ukulele, fingerpicked, single instrument only, melodic lead, instrumental, no vocals, no drums, no bass, no piano",
    negativeTags:
      "vocals, singing, humming, voice, speech, drums, percussion, bass, piano, guitar, full band, synth, pad",
    coverArtHint:
      "empty small wooden stand, closed soft gig bag, picks and tab paper on table, sunny window shadows, no ukulele visible, no people, no writing",
  },
  {
    id: "synth",
    label: "Synth",
    style:
      "solo synth lead, monophonic, single instrument only, melodic lead, instrumental, no vocals, no drums, no bass, no piano, no guitar",
    negativeTags:
      "vocals, singing, humming, voice, speech, drums, percussion, bass, piano, guitar, strings, full band, pad, orchestral",
    coverArtHint:
      "empty keyboard stand without keys, coiled midi cable and patch notes, neon purple accent glow, no synthesizer visible, no people, no writing",
  },
  {
    id: "strings",
    label: "Strings",
    style:
      "solo string melody, single instrument lead, instrumental, no vocals, no drums, no bass, no piano, no guitar",
    negativeTags:
      "vocals, singing, humming, voice, speech, drums, percussion, bass, piano, guitar, full band, synth pad, heavy orchestral",
    coverArtHint:
      "empty instrument stand, rosin and sheet music on wood table, rich amber studio light, no cello violin or bow, no people, no writing",
  },
];

export function getHumTrackPreset(id) {
  const key = String(id || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "");
  return HUM_TRACK_INSTRUMENTS.find((x) => x.id === key) || HUM_TRACK_INSTRUMENTS[0];
}
