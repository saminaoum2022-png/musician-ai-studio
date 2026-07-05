/** Client-side Hum Track presets (ids must match api/_lib/hum-track-presets.js). */
export const HUM_TRACK_INSTRUMENTS = [
  {
    id: "piano",
    label: "Piano",
    style:
      "solo piano, single instrument only, melodic lead, instrumental, no vocals, no drums, no bass, no guitar",
    negativeTags:
      "vocals, singing, humming, voice, speech, drums, percussion, bass, guitar, strings, full band, synth, pad, orchestral",
  },
  {
    id: "acoustic_guitar",
    label: "Acoustic",
    style:
      "solo acoustic guitar, fingerpicked, single instrument only, melodic lead, instrumental, no vocals, no drums, no bass, no piano",
    negativeTags:
      "vocals, singing, humming, voice, speech, drums, percussion, bass, piano, electric guitar, full band, synth, pad",
  },
  {
    id: "electric_guitar",
    label: "Electric",
    style:
      "solo electric guitar, clean tone, single instrument only, melodic lead, instrumental, no vocals, no drums, no bass, no piano",
    negativeTags:
      "vocals, singing, humming, voice, speech, drums, percussion, bass, piano, acoustic guitar, full band, synth, pad",
  },
  {
    id: "violin",
    label: "Violin",
    style:
      "solo violin, single instrument only, melodic lead, instrumental, no vocals, no drums, no bass, no piano, no guitar",
    negativeTags:
      "vocals, singing, humming, voice, speech, drums, percussion, bass, piano, guitar, full band, synth, pad, orchestral section",
  },
  {
    id: "flute",
    label: "Flute",
    style:
      "solo flute, single instrument only, melodic lead, instrumental, no vocals, no drums, no bass, no piano, no guitar",
    negativeTags:
      "vocals, singing, humming, voice, speech, drums, percussion, bass, piano, guitar, strings, full band, synth, pad",
  },
  {
    id: "ukulele",
    label: "Ukulele",
    style:
      "solo ukulele, fingerpicked, single instrument only, melodic lead, instrumental, no vocals, no drums, no bass, no piano",
    negativeTags:
      "vocals, singing, humming, voice, speech, drums, percussion, bass, piano, guitar, full band, synth, pad",
  },
  {
    id: "synth",
    label: "Synth",
    style:
      "solo synth lead, monophonic, single instrument only, melodic lead, instrumental, no vocals, no drums, no bass, no piano, no guitar",
    negativeTags:
      "vocals, singing, humming, voice, speech, drums, percussion, bass, piano, guitar, strings, full band, pad, orchestral",
  },
  {
    id: "strings",
    label: "Strings",
    style:
      "solo string melody, single instrument lead, instrumental, no vocals, no drums, no bass, no piano, no guitar",
    negativeTags:
      "vocals, singing, humming, voice, speech, drums, percussion, bass, piano, guitar, full band, synth pad, heavy orchestral",
  },
];

export function getHumTrackPreset(id) {
  const key = String(id || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "");
  return HUM_TRACK_INSTRUMENTS.find((x) => x.id === key) || HUM_TRACK_INSTRUMENTS[0];
}
