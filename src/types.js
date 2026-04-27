/**
 * @typedef {"4/4"|"6/8"} Meter
 *
 * @typedef {{
 *   style: string,
 *   bpm: number,
 *   bars: number,
 *   keyCenter: string,
 *   scale: string,
 *   meter: Meter,
 *   lyrics?: string
 * }} ArrangeParams
 *
 * @typedef {{
 *   rootMidi: number,
 *   quality: "min"|"maj"|"sus2"|"sus4"|"7",
 *   durationBeats: number
 * }} ChordEvent
 *
 * @typedef {{
 *   startBeat: number,
 *   durationBeats: number,
 *   midi: number,
 *   velocity: number,
 *   instrument: "oud"|"violin"|"piano"
 * }} NoteEvent
 *
 * @typedef {{
 *   startBeat: number,
 *   durationBeats: number,
 *   type: "dum"|"tek"|"rest",
 *   velocity: number
 * }} PercEvent
 *
 * @typedef {{
 *   params: ArrangeParams,
 *   beatsPerBar: number,
 *   totalBeats: number,
 *   sections: Array<{ name: string, startBar: number, bars: number }>,
 *   chords: ChordEvent[],
 *   notes: NoteEvent[],
 *   perc: PercEvent[]
 * }} Arrangement
 */

export {};

