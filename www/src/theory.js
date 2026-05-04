const NOTE_TO_SEMITONE = {
  C: 0,
  "C#": 1,
  Db: 1,
  D: 2,
  "D#": 3,
  Eb: 3,
  E: 4,
  F: 5,
  "F#": 6,
  Gb: 6,
  G: 7,
  "G#": 8,
  Ab: 8,
  A: 9,
  "A#": 10,
  Bb: 10,
  B: 11,
};

export function keyToMidi(key, octave) {
  const semitone = NOTE_TO_SEMITONE[key] ?? 2; // default D
  // MIDI: C4 = 60, so C0 = 12
  return 12 + octave * 12 + semitone;
}

export function scaleIntervals(name) {
  switch (name) {
    case "major":
      return [0, 2, 4, 5, 7, 9, 11];
    case "natural_minor":
      return [0, 2, 3, 5, 7, 8, 10];
    case "harmonic_minor":
      return [0, 2, 3, 5, 7, 8, 11];
    case "phrygian":
      return [0, 1, 3, 5, 7, 8, 10];
    default:
      return [0, 2, 3, 5, 7, 8, 11];
  }
}

export function midiToFreq(midi) {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

