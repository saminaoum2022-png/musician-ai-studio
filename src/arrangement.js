import { mulberry32, pick, randRange, shuffleInPlace } from "./rand.js";
import { keyToMidi, scaleIntervals } from "./theory.js";

/** @param {import("./types.js").ArrangeParams} params */
export function generateArrangement(params) {
  const seedStr = `${params.style}|${params.bpm}|${params.bars}|${params.keyCenter}|${params.scale}|${params.meter}|${(params.lyrics || "").trim()}`;
  const rng = mulberry32(hashString(seedStr));

  const beatsPerBar = params.meter === "6/8" ? 6 : 4;
  const totalBeats = params.bars * beatsPerBar;

  const sections = buildSections(params.bars);
  const rootMidi = keyToMidi(params.keyCenter, 3); // around D3
  const scale = scaleIntervals(params.scale);

  const chords = generateChords({ rng, rootMidi, scale, beatsPerBar, bars: params.bars, style: params.style });
  const lyricProfile = analyzeLyrics(params.lyrics || "", { beatsPerBar, totalBeats });
  const notes = generateMelodyAndCounter({
    rng,
    rootMidi,
    scale,
    beatsPerBar,
    totalBeats,
    chords,
    style: params.style,
    lyricProfile,
  });
  const perc = generatePercussion({ rng, beatsPerBar, totalBeats, style: params.style });

  return {
    params,
    beatsPerBar,
    totalBeats,
    sections,
    chords,
    notes,
    perc,
  };
}

/** @param {import("./types.js").ArrangeParams} params */
export function randomizeParams(params) {
  const rng = mulberry32(Date.now() >>> 0);
  const styles = ["arabic-pop", "maqam-jam", "cinematic"];
  const keys = ["C", "D", "E", "F", "G", "A"];
  const scales = ["harmonic_minor", "natural_minor", "phrygian", "major"];
  const meters = ["4/4", "6/8"];
  return {
    ...params,
    style: pick(rng, styles),
    bpm: Math.round(randRange(rng, 78, 126)),
    bars: Math.round(randRange(rng, 24, 48)),
    keyCenter: pick(rng, keys),
    scale: pick(rng, scales),
    meter: /** @type {import("./types.js").Meter} */ (pick(rng, meters)),
  };
}

function buildSections(totalBars) {
  // Simple pop-ish form: intro, A, B, A, outro (clamped)
  const intro = Math.min(4, Math.max(2, Math.floor(totalBars * 0.125)));
  const outro = Math.min(4, Math.max(2, Math.floor(totalBars * 0.125)));
  const remaining = Math.max(0, totalBars - intro - outro);
  const a = Math.max(8, Math.floor(remaining * 0.5));
  const b = Math.max(8, remaining - a);
  const sections = [];
  let cur = 0;
  sections.push({ name: "Intro", startBar: cur, bars: intro });
  cur += intro;
  sections.push({ name: "A", startBar: cur, bars: Math.floor(a * 0.5) });
  cur += Math.floor(a * 0.5);
  sections.push({ name: "B", startBar: cur, bars: b });
  cur += b;
  const a2 = Math.max(0, totalBars - cur - outro);
  if (a2 > 0) sections.push({ name: "A2", startBar: cur, bars: a2 });
  cur += a2;
  sections.push({ name: "Outro", startBar: cur, bars: Math.max(0, totalBars - cur) });
  return sections.filter((s) => s.bars > 0);
}

function generateChords({ rng, rootMidi, scale, beatsPerBar, bars, style }) {
  /** @type {import("./types.js").ChordEvent[]} */
  const chords = [];

  // Degree options roughly: i, bVII, bVI, V (minor-ish)
  const degrees = style === "cinematic" ? [0, 3, 5, 6, 4] : [0, 6, 5, 4];

  for (let bar = 0; bar < bars; bar++) {
    const barBeats = beatsPerBar;
    const changeEvery = beatsPerBar === 6 ? 3 : 2; // 2 chords per bar in 4/4, 2 per bar in 6/8 (every 3 beats)
    const changes = Math.max(1, Math.floor(barBeats / changeEvery));
    for (let i = 0; i < changes; i++) {
      const deg = pick(rng, degrees);
      const root = rootMidi + scale[deg % scale.length];
      const q = pick(rng, style === "cinematic" ? ["min", "sus2", "sus4", "7"] : ["min", "min", "sus4", "7"]);
      chords.push({
        rootMidi: root,
        quality: /** @type {any} */ (q),
        durationBeats: changeEvery,
      });
    }
  }
  return chords;
}

function generateMelodyAndCounter({ rng, rootMidi, scale, beatsPerBar, totalBeats, chords, style, lyricProfile }) {
  /** @type {import("./types.js").NoteEvent[]} */
  const notes = [];

  const leadInstrument = style === "cinematic" ? "violin" : "oud";
  const padInstrument = "piano";

  // Lead melody grid follows lyric density: more syllables => smaller step and fewer rests
  const density = lyricProfile?.syllablesPerBeat ?? 1.1;
  const step = density >= 1.8 ? 0.25 : density >= 1.25 ? 0.5 : 1.0;
  const restProb = clamp01(0.14 - Math.min(0.10, Math.max(0, (density - 0.9) * 0.06)));

  // Basic motif degrees
  const motif = style === "maqam-jam" ? [0, 1, 3, 4, 3, 1] : [0, 2, 3, 2, 0, 4];
  const motif2 = style === "cinematic" ? [0, 3, 5, 4, 3, 1] : [0, 4, 3, 2, 1, 0];
  const motifs = [motif, motif2];

  const melodyBase = rootMidi + 12; // octave above

  let beat = 0;
  while (beat < totalBeats - 0.01) {
    // occasionally rest
    if (rng() < restProb) {
      beat += step;
      continue;
    }

    const motifPick = pick(rng, motifs);
    const deg = motifPick[Math.floor(randRange(rng, 0, motifPick.length))];
    const octaveJitter = rng() < 0.15 ? 12 : 0;
    const midi = melodyBase + scale[(deg + 7) % scale.length] + octaveJitter;

    const durChoices =
      step <= 0.25 ? [0.25, 0.5, 0.75] : step <= 0.5 ? [0.5, 0.5, 1, 1.5] : [1, 1.5, 2];
    const dur = pick(rng, durChoices);
    const velocity = clamp01(0.55 + rng() * 0.4);
    notes.push({
      startBeat: beat,
      durationBeats: Math.min(dur, totalBeats - beat),
      midi,
      velocity,
      instrument: /** @type {any} */ (leadInstrument),
    });
    beat += step;
  }

  // Piano: chord tones on downbeats
  let chordBeat = 0;
  for (const ch of chords) {
    const triad = chordToTriadMidi(ch.rootMidi, ch.quality);
    const vel = style === "cinematic" ? 0.35 : 0.28;
    for (const m of triad) {
      notes.push({
        startBeat: chordBeat,
        durationBeats: ch.durationBeats,
        midi: m,
        velocity: vel,
        instrument: /** @type {any} */ (padInstrument),
      });
    }
    chordBeat += ch.durationBeats;
    if (chordBeat >= totalBeats) break;
  }

  // Add a soft violin counter-melody for non-cinematic styles
  if (style !== "cinematic") {
    const counterBase = rootMidi + 19; // about a fifth above
    const degrees = [0, 2, 4, 3, 2, 1, 0];
    const offset = beatsPerBar === 6 ? 1.5 : 1;
    for (let b = offset; b < totalBeats; b += beatsPerBar) {
      const phrase = degrees.slice();
      shuffleInPlace(rng, phrase);
      for (let i = 0; i < Math.min(4, phrase.length); i++) {
        const d = phrase[i];
        notes.push({
          startBeat: b + i * 0.5,
          durationBeats: 1.0,
          midi: counterBase + scale[d % scale.length],
          velocity: 0.24 + rng() * 0.18,
          instrument: "violin",
        });
      }
    }
  }

  return notes;
}

function generatePercussion({ rng, beatsPerBar, totalBeats, style }) {
  /** @type {import("./types.js").PercEvent[]} */
  const events = [];

  const step = beatsPerBar === 6 ? 0.5 : 0.5; // 8th-note grid in 4/4, 16th-ish in 6/8

  for (let b = 0; b < totalBeats - 0.001; b += step) {
    const posInBar = b % beatsPerBar;
    const down = Math.abs(posInBar - 0) < 0.001;
    const mid = beatsPerBar === 6 ? Math.abs(posInBar - 3) < 0.001 : Math.abs(posInBar - 2) < 0.001;

    let type = "rest";
    let vel = 0.0;

    if (down) {
      type = "dum";
      vel = style === "cinematic" ? 0.42 : 0.55;
    } else if (mid && rng() < 0.75) {
      type = "dum";
      vel = style === "cinematic" ? 0.32 : 0.48;
    } else if (rng() < (beatsPerBar === 6 ? 0.22 : 0.18)) {
      type = "tek";
      vel = 0.22 + rng() * 0.35;
    }

    if (type !== "rest") {
      events.push({
        startBeat: b,
        durationBeats: step,
        type: /** @type {any} */ (type),
        velocity: clamp01(vel),
      });
    }
  }

  return events;
}

function chordToTriadMidi(rootMidi, quality) {
  // Basic approximations
  let third = 3;
  let fifth = 7;
  if (quality === "maj") third = 4;
  if (quality === "sus2") third = 2;
  if (quality === "sus4") third = 5;
  const triad = [rootMidi, rootMidi + third, rootMidi + fifth];
  if (quality === "7") triad.push(rootMidi + 10);
  return triad;
}

function clamp01(x) {
  return Math.max(0, Math.min(1, x));
}

function analyzeLyrics(text, { beatsPerBar, totalBeats }) {
  const t = (text || "").trim();
  if (!t) {
    return {
      hasLyrics: false,
      words: 0,
      syllables: 0,
      syllablesPerBeat: 1.05,
    };
  }

  const tokens = t
    .replace(/\s+/g, " ")
    .replace(/[^\p{L}\p{N}\s'’]/gu, " ")
    .split(" ")
    .map((s) => s.trim())
    .filter(Boolean);

  const isArabic = /[\u0600-\u06FF]/.test(t);
  let syllables = 0;
  for (const w of tokens) syllables += estimateSyllables(w, isArabic);

  const beats = Math.max(1, totalBeats);
  const syllablesPerBeat = clamp01(0.35 + Math.min(2.3, syllables / beats)); // keep sane range
  return {
    hasLyrics: true,
    words: tokens.length,
    syllables,
    syllablesPerBeat,
    beatsPerBar,
  };
}

function estimateSyllables(word, isArabic) {
  const w = (word || "").toLowerCase();
  if (!w) return 0;
  if (isArabic) {
    // Very rough: Arabic short vowels are often omitted; treat length as proxy.
    return Math.max(1, Math.round(w.replace(/[^ء-ي]/g, "").length / 3));
  }
  // English-ish heuristic: count vowel groups
  const m = w.match(/[aeiouy]+/g);
  const base = m ? m.length : 1;
  // silent "e"
  const silentE = w.endsWith("e") && !w.endsWith("le");
  return Math.max(1, base - (silentE ? 1 : 0));
}

function hashString(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return (h >>> 0) || 1;
}

