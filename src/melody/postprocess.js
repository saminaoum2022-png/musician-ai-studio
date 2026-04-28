/**
 * @typedef {{ tSec: number, f0Hz: number }} PitchPoint
 *
 * @typedef {{
 *   startBeat: number,
 *   durationBeats: number,
 *   midi: number,
 *   velocity?: number
 * }} MelodyNote
 *
 * @typedef {{
 *   tempoBpm: number,
 *   meter: import("../types.js").Meter,
 *   notes: MelodyNote[]
 * }} Melody
 */

/**
 * Convert raw pitch points into quantized melody notes.
 * @param {PitchPoint[]} points
 * @param {{ bpm:number, meter: import("../types.js").Meter, maxSeconds:number }} opts
 * @returns {Melody}
 */
export function pitchPointsToMelody(points, opts) {
  const bpm = clampNum(opts.bpm, 40, 220, 96);
  const meter = opts.meter === "6/8" ? "6/8" : "4/4";
  const maxSeconds = clampNum(opts.maxSeconds, 1, 120, 60);
  const secPerBeat = 60 / bpm;

  // 1) Clean + trim
  const cleaned = (points || [])
    .filter((p) => p && Number.isFinite(p.tSec) && Number.isFinite(p.f0Hz))
    .filter((p) => p.tSec >= 0 && p.tSec <= maxSeconds && p.f0Hz > 50 && p.f0Hz < 1200)
    .sort((a, b) => a.tSec - b.tSec);

  if (cleaned.length < 8) return { tempoBpm: bpm, meter, notes: [] };

  // 2) Convert to midi per frame, with mild smoothing
  const frames = cleaned.map((p) => ({ tSec: p.tSec, midi: hzToMidi(p.f0Hz) }));
  const smoothed = medianSmooth(frames, 5);

  // 3) Segment into stable-note regions
  /** @type {Array<{ t0:number, t1:number, midi:number }>} */
  const segs = [];
  const tol = 0.55; // semitone-ish; tighten slightly so nearby pitches split into separate notes
  let cur = { t0: smoothed[0].tSec, t1: smoothed[0].tSec, midi: smoothed[0].midi };
  for (let i = 1; i < smoothed.length; i++) {
    const f = smoothed[i];
    const dt = f.tSec - cur.t1;
    const jump = Math.abs(f.midi - cur.midi);
    const gap = dt > 0.14; // missing voiced frames → new note sooner
    if (jump <= tol && !gap) {
      cur.t1 = f.tSec;
      cur.midi = 0.85 * cur.midi + 0.15 * f.midi;
    } else {
      segs.push(cur);
      cur = { t0: f.tSec, t1: f.tSec, midi: f.midi };
    }
  }
  segs.push(cur);

  // 4) Convert segments to quantized beat notes (<= 60s)
  const quantStepBeats = 0.25; // 16th note in 4/4; decent for hum
  const minDurBeats = 0.25;
  const notes = segs
    .map((s) => {
      // Segment pitch is smoothed toward end; median of frames in-window is stabler than midpoint alone.
      let midiSum = 0;
      let midiCount = 0;
      for (const fr of smoothed) {
        if (fr.tSec >= s.t0 && fr.tSec <= s.t1) {
          midiSum += fr.midi;
          midiCount++;
        }
      }
      const midiAvg = midiCount ? midiSum / midiCount : s.midi;

      const startBeat = Math.max(0, s.t0 / secPerBeat);
      const rawDurSec = Math.max(0.06, s.t1 - s.t0);
      const durBeats = rawDurSec / secPerBeat;
      return {
        startBeat: quantize(startBeat, quantStepBeats),
        durationBeats: Math.max(minDurBeats, quantize(durBeats, quantStepBeats)),
        midi: clampInt(Math.round(midiAvg), 36, 96),
      };
    })
    .filter((n) => n.durationBeats >= minDurBeats);

  // 5) Merge overlapping after quantization
  notes.sort((a, b) => a.startBeat - b.startBeat);
  /** @type {MelodyNote[]} */
  const merged = [];
  for (const n of notes) {
    const last = merged[merged.length - 1];
    if (!last) {
      merged.push(n);
      continue;
    }
    const lastEnd = last.startBeat + last.durationBeats;
    const nEnd = n.startBeat + n.durationBeats;
    const overlaps = n.startBeat <= lastEnd + 0.001;
    const same = n.midi === last.midi;
    if (overlaps && same) {
      last.durationBeats = Math.max(last.durationBeats, nEnd - last.startBeat);
    } else if (overlaps && !same) {
      // snap next to end of last
      const adjStart = lastEnd;
      merged.push({ ...n, startBeat: adjStart, durationBeats: Math.max(minDurBeats, nEnd - adjStart) });
    } else {
      merged.push(n);
    }
  }

  // Clamp to max length in beats
  const maxBeats = Math.max(1, maxSeconds / secPerBeat);
  const clamped = merged
    .filter((n) => n.startBeat < maxBeats)
    .map((n) => ({
      ...n,
      durationBeats: Math.min(n.durationBeats, Math.max(0, maxBeats - n.startBeat)),
    }))
    .filter((n) => n.durationBeats >= minDurBeats);

  return { tempoBpm: bpm, meter, notes: clamped };
}

/**
 * @param {{tSec:number, midi:number}[]} frames
 * @param {number} windowSize
 */
function medianSmooth(frames, windowSize) {
  const w = Math.max(1, Math.floor(windowSize));
  const out = [];
  for (let i = 0; i < frames.length; i++) {
    const a = Math.max(0, i - Math.floor(w / 2));
    const b = Math.min(frames.length, i + Math.floor(w / 2) + 1);
    const slice = frames.slice(a, b).map((f) => f.midi).sort((x, y) => x - y);
    const mid = slice[Math.floor(slice.length / 2)];
    out.push({ tSec: frames[i].tSec, midi: mid });
  }
  return out;
}

function hzToMidi(hz) {
  return 69 + 12 * Math.log2(hz / 440);
}

function quantize(x, step) {
  return Math.round(x / step) * step;
}

function clampInt(n, min, max) {
  const x = Number.isFinite(n) ? Math.round(n) : min;
  return Math.max(min, Math.min(max, x));
}

function clampNum(n, min, max, fallback) {
  const x = Number.isFinite(Number(n)) ? Number(n) : fallback;
  return Math.max(min, Math.min(max, x));
}

