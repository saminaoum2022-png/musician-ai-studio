/**
 * Suno style/negativeTags presets for Hum Track (hum → solo instrumental).
 * Keep tags short and comma-separated — Suno rejects prose in style fields.
 */

const HUM_TRACK_INSTRUMENTS = {
  piano: {
    label: "Piano",
    style:
      "solo piano, single instrument only, melodic lead, instrumental, no vocals, no drums, no bass, no guitar",
    negativeTags:
      "vocals, singing, humming, voice, speech, drums, percussion, bass, guitar, strings, full band, synth, pad, orchestral",
  },
  acoustic_guitar: {
    label: "Acoustic Guitar",
    style:
      "solo acoustic guitar, fingerpicked, single instrument only, melodic lead, instrumental, no vocals, no drums, no bass, no piano",
    negativeTags:
      "vocals, singing, humming, voice, speech, drums, percussion, bass, piano, electric guitar, full band, synth, pad",
  },
  electric_guitar: {
    label: "Electric Guitar",
    style:
      "solo electric guitar, clean tone, single instrument only, melodic lead, instrumental, no vocals, no drums, no bass, no piano",
    negativeTags:
      "vocals, singing, humming, voice, speech, drums, percussion, bass, piano, acoustic guitar, full band, synth, pad",
  },
  violin: {
    label: "Violin",
    style:
      "solo violin, single instrument only, melodic lead, instrumental, no vocals, no drums, no bass, no piano, no guitar",
    negativeTags:
      "vocals, singing, humming, voice, speech, drums, percussion, bass, piano, guitar, full band, synth, pad, orchestral section",
  },
  flute: {
    label: "Flute",
    style:
      "solo flute, single instrument only, melodic lead, instrumental, no vocals, no drums, no bass, no piano, no guitar",
    negativeTags:
      "vocals, singing, humming, voice, speech, drums, percussion, bass, piano, guitar, strings, full band, synth, pad",
  },
  ukulele: {
    label: "Ukulele",
    style:
      "solo ukulele, fingerpicked, single instrument only, melodic lead, instrumental, no vocals, no drums, no bass, no piano",
    negativeTags:
      "vocals, singing, humming, voice, speech, drums, percussion, bass, piano, guitar, full band, synth, pad",
  },
  synth: {
    label: "Synth Lead",
    style:
      "solo synth lead, monophonic, single instrument only, melodic lead, instrumental, no vocals, no drums, no bass, no piano, no guitar",
    negativeTags:
      "vocals, singing, humming, voice, speech, drums, percussion, bass, piano, guitar, strings, full band, pad, orchestral",
  },
  strings: {
    label: "Strings",
    style:
      "solo string melody, single instrument lead, instrumental, no vocals, no drums, no bass, no piano, no guitar",
    negativeTags:
      "vocals, singing, humming, voice, speech, drums, percussion, bass, piano, guitar, full band, synth pad, heavy orchestral",
  },
};

function resolveHumTrackPreset(presetId) {
  const id = String(presetId || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "");
  return HUM_TRACK_INSTRUMENTS[id] || HUM_TRACK_INSTRUMENTS.piano;
}

module.exports = {
  HUM_TRACK_INSTRUMENTS,
  resolveHumTrackPreset,
};
