/**
 * Mentor — on-device voice snapshot (pitch motion, timbre brightness, key hints).
 * Audio is analyzed locally; nothing is uploaded by this module.
 */

/** Fixed-Do solfege pitch classes (C = Do … B = Si), for Lab display only. */
const SOLFEGE_PC = ["Do", "Do#", "Re", "Re#", "Mi", "Fa", "Fa#", "Sol", "Sol#", "La", "La#", "Si"];

function hzToMidi(hz) {
  if (!(hz > 0) || !Number.isFinite(hz)) return NaN;
  return 69 + 12 * Math.log2(hz / 440);
}

/** Rounded MIDI → fixed-Do name + octave (MIDI 60 = Do4, same octave convention as “C4”). */
function midiToName(m) {
  if (!Number.isFinite(m)) return "—";
  const mi = Math.round(m);
  const pc = ((mi % 12) + 12) % 12;
  const oct = Math.floor(mi / 12) - 1;
  return `${SOLFEGE_PC[pc]}${oct}`;
}

function pitchClassSolfege(pc) {
  const j = ((pc % 12) + 12) % 12;
  return SOLFEGE_PC[j];
}

/** `sorted` ascending; `p` in [0, 1]. Linear interpolation between closest ranks. */
function percentile(sorted, p) {
  const n = sorted.length;
  if (!n) return NaN;
  if (n === 1) return sorted[0];
  const x = Math.max(0, Math.min(1, p)) * (n - 1);
  const lo = Math.floor(x);
  const hi = Math.ceil(x);
  if (lo === hi) return sorted[lo];
  const w = x - lo;
  return sorted[lo] * (1 - w) + sorted[hi] * w;
}

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

const MAX_SECONDS = 22;
const MIN_SECONDS = 2;

/** @type {MediaStream | null} */
let _stream = null;
let _recording = false;
let _raf = 0;
let _startedAt = 0;
/** @type {MediaRecorder | null} */
let _mentorRecorder = null;
/** @type {Blob[]} */
let _mentorChunks = [];
/** Bumped when starting a new capture or invalidating in-flight decode (tab refresh). */
let _mentorRecSession = 0;
let _mentorAutoStopTimer = 0;

export function bumpMentorRecSession() {
  _mentorRecSession += 1;
}

function setMentorLiveUi(on) {
  const root = document.querySelector(".mentorPage");
  if (root) root.classList.toggle("mentorPage--live", Boolean(on));
}

function blurb(s, maxLen) {
  const t = String(s || "").replace(/\s+/g, " ").trim();
  if (t.length <= maxLen) return t;
  return `${t.slice(0, Math.max(1, maxLen - 1))}…`;
}

function renderGenrePills(line) {
  const strip = document.getElementById("mentorGenreStrip");
  if (!strip) return;
  strip.textContent = "";
  for (const chunk of String(line || "").split(" · ")) {
    const t = chunk.trim();
    if (!t) continue;
    const span = document.createElement("span");
    span.className = "mentorGenrePill";
    span.textContent = t;
    strip.appendChild(span);
  }
}

function setMentorQualityRing(score) {
  const el = document.getElementById("mentorQualityProgress");
  if (!el) return;
  const q = Math.max(0, Math.min(100, Number(score) || 0));
  const C = 94.248;
  el.style.strokeDasharray = `${(q / 100) * C} ${C}`;
}

/** Downmix to mono for pitch analysis (some devices record stereo duplicates). */
function floatMonoFromAudioBuffer(audioBuf) {
  const ch = audioBuf.numberOfChannels;
  const n = audioBuf.length;
  if (ch <= 1) return Float32Array.from(audioBuf.getChannelData(0));
  const out = new Float32Array(n);
  for (let c = 0; c < ch; c++) {
    const d = audioBuf.getChannelData(c);
    for (let i = 0; i < n; i++) out[i] += d[i];
  }
  const inv = 1 / ch;
  for (let i = 0; i < n; i++) out[i] *= inv;
  return out;
}

/** Same idea as vocal reference: WKWebView / Safari need MP4-ish containers for bytes. */
function isSafariLikeMentorEnv() {
  try {
    if (window?.Capacitor?.isNativePlatform?.()) return true;
    const ua = navigator.userAgent || "";
    if (/iPhone|iPad|iPod/i.test(ua)) return true;
    if (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1) return true;
    return /^((?!chrome|android).)*safari/i.test(ua);
  } catch {
    return false;
  }
}

function pickMentorRecorderMimeType() {
  const safariLike = isSafariLikeMentorEnv();
  const mp4First = [
    "audio/mp4",
    "audio/mp4;codecs=mp4a.40.2",
    "audio/webm;codecs=opus",
    "audio/webm",
  ];
  const webFirst = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
    "audio/mp4;codecs=mp4a.40.2",
  ];
  const candidates = safariLike ? mp4First : webFirst;
  for (const m of candidates) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported?.(m)) return m;
  }
  return "";
}

/** Rough classical range anchors in MIDI (low / mid / high). */
const VOICE_MALE = [
  { name: "Bass", L: 41, M: 50, H: 62 },
  { name: "Baritone", L: 44, M: 54, H: 67 },
  { name: "Tenor", L: 47, M: 58, H: 72 },
];
const VOICE_FEMALE = [
  { name: "Contralto", L: 48, M: 56, H: 68 },
  { name: "Alto", L: 50, M: 59, H: 71 },
  { name: "Mezzo-soprano", L: 52, M: 62, H: 75 },
  { name: "Soprano", L: 54, M: 65, H: 79 },
];

function getMentorVoiceRef() {
  const el = document.getElementById("mentorVoiceRef");
  const v = String(el?.value || "mens");
  return v === "womens" || v === "range" || v === "mens" ? v : "mens";
}

function guessVoiceArchetype(p5, p50, p95, ref) {
  if (ref === "range") {
    return {
      title: "Notes captured (no voice tag)",
      body:
        "We only report pitch range here — no bass/baritone/tenor or alto/mezzo/soprano labels. Use “How to sing this test” and a slow chest-to-head glide so Low → high shows your comfortable reach, not just a high squeak.",
      meta: `Robust span ~${midiToName(p5)}–${midiToName(p95)} (7th–93rd percentile of detected pitch)`,
    };
  }
  const pool = ref === "mens" ? VOICE_MALE : VOICE_FEMALE;
  const low = p5;
  const mid = p50;
  const high = p95;
  const scored = pool.map((t) => ({
    t,
    d:
      Math.abs(low - t.L) +
      1.25 * Math.abs(mid - t.M) +
      1.05 * Math.abs(high - t.H),
  })).sort((a, b) => a.d - b.d);
  const best = scored[0]?.t?.name || "—";
  const second = scored[1]?.t?.name || "";
  let body = `Closest ${ref === "mens" ? "men’s-range" : "women’s-range"} label in this clip: ${best}`;
  if (second && second !== best) body += ` — also near ${second}`;
  body +=
    ". This compares note heights to common teaching ranges, not who you are. If you only sing high for a few seconds, pick “Notes only” or include more low chest in the take.";
  if (p95 >= 72 && p50 <= 58) {
    body +=
      " Big gap between low center and high peaks? Glide more slowly on “ah” / “ee” so we register your chest register too.";
  }
  return {
    title: `${best}${second && second !== best ? ` · ${second}?` : ""}`,
    body,
    meta: `Based on notes ~${midiToName(p5)}–${midiToName(p95)} in this take`,
  };
}


/**
 * Maqam templates defined in REAL CENTS relative to the tonic, not 12-TET
 * semitones — because Bayati/Saba/Sikah/Rast live on quarter tones (≈150/350¢)
 * that an equal-tempered grid erases. Each entry carries:
 *   - cents:       full scale degrees in cents (for explained-energy fit)
 *   - jinsCents:   the lower tetrachord (the family-defining region)
 *   - second/third: the expected 2nd & 3rd degree size in cents — THE primary
 *                   discriminators between the minor-ish maqamat
 *   - fourthPerfect: whether a perfect 4th (~500¢) belongs (Saba lowers it)
 *   - absentCents: degrees that should be WEAK; energy there penalizes the maqam
 *   - degrees:     12-TET fallback used only by the on-screen scale diagram
 *   - mult:        mild prior nudge
 */
const MAQAM_CATALOG = [
  { id: "ajam", name: "‘Ajam", degrees: [0, 2, 4, 5, 7, 9, 11],
    cents: [0, 200, 400, 500, 700, 900, 1100], jinsCents: [0, 200, 400, 500],
    second: 200, third: 400, fourthPerfect: true, absentCents: [], mult: 1.0 },
  { id: "rast", name: "Rast", degrees: [0, 2, 4, 5, 7, 9, 10],
    cents: [0, 200, 350, 500, 700, 900, 1050], jinsCents: [0, 200, 350, 500],
    second: 200, third: 350, fourthPerfect: true, absentCents: [], mult: 1.0 },
  { id: "nahawand", name: "Nahawand", degrees: [0, 2, 3, 5, 7, 8, 10],
    cents: [0, 200, 300, 500, 700, 800, 1000], jinsCents: [0, 200, 300, 500],
    second: 200, third: 300, fourthPerfect: true, absentCents: [], mult: 1.0 },
  { id: "bayati", name: "Bayati", degrees: [0, 2, 3, 5, 7, 8, 10],
    cents: [0, 150, 300, 500, 700, 800, 1000], jinsCents: [0, 150, 300, 500],
    second: 150, third: 300, fourthPerfect: true, absentCents: [], mult: 1.0 },
  { id: "kurd", name: "Kurd", degrees: [0, 1, 3, 5, 7, 8, 10],
    cents: [0, 100, 300, 500, 700, 800, 1000], jinsCents: [0, 100, 300, 500],
    second: 100, third: 300, fourthPerfect: true, absentCents: [], mult: 1.0 },
  { id: "hijaz", name: "Hijaz", degrees: [0, 1, 4, 5, 7, 8, 10],
    cents: [0, 100, 400, 500, 700, 800, 1000], jinsCents: [0, 100, 400, 500],
    second: 100, third: 400, fourthPerfect: true, absentCents: [], mult: 1.0 },
  { id: "saba", name: "Saba", degrees: [0, 2, 3, 4, 7, 8, 10],
    cents: [0, 150, 300, 400, 700, 800, 1000], jinsCents: [0, 150, 300, 400],
    second: 150, third: 300, fourthPerfect: false, absentCents: [500], mult: 1.0 },
  // Sikah sits on a half-flat tonic; its signature is the ≈150¢ + ≈350¢ jins.
  // The microtonal char match (not a blanket penalty) now keeps it honest.
  { id: "sikah", name: "Sikah", degrees: [0, 2, 4, 5, 7, 9, 11],
    cents: [0, 150, 350, 500, 700, 850, 1050], jinsCents: [0, 150, 350],
    second: 150, third: 350, fourthPerfect: true, absentCents: [], mult: 0.92 },
];

const PC_LETTERS = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
function pcOf(m) {
  return ((Math.round(m) % 12) + 12) % 12;
}
function pcLetter(pc) {
  return PC_LETTERS[((pc % 12) + 12) % 12];
}
function midiToLetterName(m) {
  if (!Number.isFinite(m)) return "—";
  const mi = Math.round(m);
  return `${pcLetter(((mi % 12) + 12) % 12)}${Math.floor(mi / 12) - 1}`;
}
function clamp01(x) {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}
function medianOf(arr) {
  if (!arr.length) return NaN;
  const s = [...arr].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}
// Shortest signed distance between two pitch-class cent values on the 1200¢ circle.
function circCentDelta(a, b) {
  let d = (a - b) % 1200;
  if (d > 600) d -= 1200;
  if (d < -600) d += 1200;
  return d;
}
// Gaussian membership of a cent offset to a target (sigma in cents).
function centGauss(deltaCents, sigma) {
  return Math.exp(-(deltaCents * deltaCents) / (2 * sigma * sigma));
}
// Duration-weighted energy of the sung profile near a target cent value (0..~1).
function energyNearCents(samples, totalW, targetCents, sigma) {
  let s = 0;
  for (const x of samples) s += x.w * centGauss(circCentDelta(x.c, targetCents), sigma);
  return s / (totalW || 1);
}
// Energy-weighted centroid (and strength) of samples that fall in a cent window
// ABOVE the tonic — used to read the actual 2nd/3rd/4th interval the singer used.
function windowCentroid(samples, totalW, tonicCents, loRel, hiRel) {
  let wsum = 0;
  let csum = 0;
  for (const x of samples) {
    const rel = (((x.c - tonicCents) % 1200) + 1200) % 1200;
    if (rel >= loRel && rel <= hiRel) {
      wsum += x.w;
      csum += x.w * rel;
    }
  }
  return { cents: wsum ? csum / wsum : null, strength: wsum / (totalW || 1) };
}

/**
 * Group the raw per-frame pitch track into SUSTAINED notes. A stable note is a
 * run of consecutive voiced frames that stays within a small cents window;
 * runs shorter than ~90ms are dropped. This is what lets us ignore breath
 * (unvoiced gaps), quick ornaments / grace notes, and short unstable jumps —
 * we analyze only the parts the singer actually held.
 */
function extractStableNotes(f0s, sampleRate, hop) {
  const frameMs = (hop / sampleRate) * 1000;
  const minFrames = Math.max(4, Math.round(90 / frameMs)); // ≈90ms held
  const tolCents = 55; // same-note band (< a semitone)
  const notes = [];
  let run = [];
  let start = -1;
  const flush = (endIdx) => {
    if (run.length >= minFrames) {
      notes.push({ midi: medianOf(run), frames: run.length, start, end: endIdx });
    }
    run = [];
    start = -1;
  };
  for (let i = 0; i < f0s.length; i++) {
    const m = f0s[i];
    if (!Number.isFinite(m)) { flush(i - 1); continue; }
    if (!run.length) { start = i; run.push(m); continue; }
    const ref = run.length > 6 ? medianOf(run) : run[run.length - 1];
    if (Math.abs(m - ref) * 100 <= tolCents) run.push(m);
    else { flush(i - 1); start = i; run.push(m); }
  }
  flush(f0s.length - 1);
  // Silence/gap (in frames) before and after each held note — this is what
  // lets us see phrase boundaries (breaths) and detect cadences/resolutions.
  for (let i = 0; i < notes.length; i++) {
    const prevEnd = i > 0 ? notes[i - 1].end : -1;
    const nextStart = i < notes.length - 1 ? notes[i + 1].start : f0s.length;
    notes[i].preGap = Math.max(0, notes[i].start - prevEnd - 1);
    notes[i].postGap = Math.max(0, nextStart - notes[i].end - 1);
    notes[i].frameMs = frameMs;
  }
  return notes;
}

/**
 * Tonic = the melodic HOME, not the most frequent pitch. We estimate it from
 * weighted phrase-resolution cues rather than raw histogram peaks:
 *   40% cadence (where phrases END / resolve, tail-weighted)
 *   30% longest sustained notes (held longest, super-linear weight)
 *   20% repeated RESTING notes (returned to as held notes — brief repeats excluded)
 *   10% phrase beginnings
 * Confidence reflects how much the winner stands out AND whether the cadence and
 * the longest-held note agree on the same home; if they disagree the tonic is
 * unstable and we keep the result tentative.
 */
function detectTonic(stableNotes) {
  const N = stableNotes.length;
  const centsMod = (n) => (((n.midi * 100) % 1200) + 1200) % 1200;
  const medFrames = medianOf(stableNotes.map((n) => n.frames)) || 1;
  const posGaps = stableNotes.map((n) => n.postGap || 0).filter((g) => g > 0);
  const medGap = Math.max(1, medianOf(posGaps) || 1);
  const mem = (a, b) => centGauss(circCentDelta(a, b), 45);

  const notes = stableNotes.map((n, i) => {
    const p = N > 1 ? i / (N - 1) : 1; // temporal position 0..1
    const recency = p < 0.7 ? 0.15 : 0.15 + ((p - 0.7) / 0.3) * 0.85; // emphasize the tail
    const isLast = i === N - 1;
    const gapAfter = isLast ? medGap * 2 : n.postGap || 0; // the very end is a strong resolution point
    const gapBonus = clamp01(gapAfter / (medGap * 1.5));
    return {
      c: centsMod(n),
      cadenceW: n.frames * recency * (0.5 + gapBonus),
      longW: Math.pow(n.frames, 1.5), // super-linear → the longest holds dominate
      resting: n.frames >= 1.3 * medFrames || (n.postGap || 0) >= medGap, // excludes brief repeats
      isBegin: i === 0 || (n.preGap || 0) >= medGap,
      frames: n.frames,
    };
  });

  const sumCad = notes.reduce((a, x) => a + x.cadenceW, 0) || 1;
  const sumLong = notes.reduce((a, x) => a + x.longW, 0) || 1;
  const beginNotes = notes.filter((x) => x.isBegin);
  const sumBegin = beginNotes.reduce((a, x) => a + x.frames, 0) || 1;
  const restNotes = notes.filter((x) => x.resting);

  const cueAt = (t) => {
    let cad = 0;
    let lng = 0;
    let rep = 0;
    let beg = 0;
    for (const x of notes) {
      const w = mem(x.c, t);
      cad += x.cadenceW * w;
      lng += x.longW * w;
    }
    for (const x of restNotes) rep += mem(x.c, t);
    for (const x of beginNotes) beg += x.frames * mem(x.c, t);
    return { cadence: cad / sumCad, longSust: lng / sumLong, rep: clamp01(rep / 3), begin: beg / sumBegin };
  };
  const scoreOf = (cue) => 0.4 * cue.cadence + 0.3 * cue.longSust + 0.2 * cue.rep + 0.1 * cue.begin;

  // Candidate home centers = distinct sustained-note pitch classes, merged within 40¢.
  const centers = [];
  for (const x of [...notes].sort((a, b) => b.frames - a.frames)) {
    if (centers.every((c) => Math.abs(circCentDelta(c, x.c)) >= 40)) centers.push(x.c);
  }
  const cands = centers
    .map((t) => { const cue = cueAt(t); return { cents: t, cue, score: scoreOf(cue) }; })
    .sort((a, b) => b.score - a.score)
    .slice(0, 4);

  const best = cands[0];
  const second = cands[1] || { score: 0, cents: best.cents };
  const prominence = clamp01((best.score - second.score) / (best.score + 1e-6) / 0.3);

  // Do the cadence and the longest-held note point to the same home?
  const argmaxCue = (key) => centers.reduce((b, t) => (cueAt(t)[key] > cueAt(b)[key] ? t : b), centers[0]);
  const cadHome = argmaxCue("cadence");
  const longHome = argmaxCue("longSust");
  const agreement = 0.6 * centGauss(circCentDelta(cadHome, best.cents), 60) + 0.4 * centGauss(circCentDelta(longHome, best.cents), 60);
  const cuesAgree = Math.abs(circCentDelta(cadHome, longHome)) <= 60;
  // When the cadence and the longest-held note point to different homes the home
  // is genuinely unstable — knock confidence down so it falls under the gate.
  const tonicConf = clamp01((0.45 * prominence + 0.35 * agreement + 0.2 * best.cue.cadence) * (cuesAgree ? 1 : 0.7));

  return { tonicCents: best.cents, tonicConf, cadHome, longHome, cuesAgree, candidates: cands };
}

/**
 * Ranking-based maqam scoring. Builds a duration-weighted pitch-class profile
 * from the stable notes, detects likely tonics, normalizes every note into an
 * interval relative to each candidate tonic, then scores ALL maqamat and
 * returns the top matches with confidence percentages (no single forced guess).
 */
function rankMaqams(stableNotes) {
  const fallback = {
    isUncertain: true,
    state: "uncertain",
    kindLabel: "Uncertain",
    primaryMaqam: "—",
    primaryId: "",
    confidence: 0,
    alternatives: [],
    top3: [],
    detectedTonicPc: 0,
    detectedTonicName: "—",
    analysisNotes:
      "Not enough sustained, stable notes to read a maqam — try a slower 10–15s phrase on open vowels (ah / ee).",
    degrees: [0, 2, 4, 5, 7, 9, 11],
    tonicPc: 0,
    stableCount: stableNotes.length,
  };
  if (stableNotes.length < 3) return fallback;

  // --- Continuous (cent-based) pitch-class profile -------------------------
  // Each held note keeps its REAL cents (no 12-TET snap). We work mod 1200¢.
  const samples = stableNotes.map((n) => ({
    c: (((n.midi * 100) % 1200) + 1200) % 1200,
    w: n.frames,
    midi: n.midi,
  }));
  const totalW = samples.reduce((a, s) => a + s.w, 0) || 1;
  const SIG_NOTE = 30; // note-grouping kernel width (cents)

  // Coarse 24-bin (50¢) profile for the debug view + quarter-tone spotting.
  const PROFILE_BINS = 24;
  const profile = new Array(PROFILE_BINS).fill(0);
  for (const s of samples) {
    for (let b = 0; b < PROFILE_BINS; b++) {
      profile[b] += s.w * centGauss(circCentDelta(s.c, b * 50), SIG_NOTE);
    }
  }
  const profSum = profile.reduce((a, b) => a + b, 0) || 1;
  const profileN = profile.map((x) => x / profSum);

  // --- Tonic detection: cadence / resolution weighted (not raw frequency) --
  const tonicInfo = detectTonic(stableNotes);
  const tonicConf = tonicInfo.tonicConf;

  // --- Microtonal maqam fit ------------------------------------------------
  // Reads the ACTUAL 2nd/3rd/4th interval sizes and scores each maqam on how
  // close its template intervals are, plus explained energy over the full scale.
  const scoreAt = (tonicCents) => {
    const second = windowCentroid(samples, totalW, tonicCents, 60, 260);
    const third = windowCentroid(samples, totalW, tonicCents, 260, 460);
    const fourth = windowCentroid(samples, totalW, tonicCents, 460, 560);
    const scored = MAQAM_CATALOG.map((m) => {
      // Explained energy: each sample's best membership to ANY scale degree.
      let expl = 0;
      for (const s of samples) {
        let bestMem = 0;
        for (const deg of m.cents) {
          const mem = centGauss(circCentDelta(s.c, (tonicCents + deg) % 1200), 38);
          if (mem > bestMem) bestMem = mem;
        }
        expl += s.w * bestMem;
      }
      const scaleFit = expl / totalW;

      // Interval discriminator — the heart of the microtonal upgrade.
      const parts = [];
      if (second.cents != null && second.strength > 0.04) {
        parts.push(centGauss(second.cents - m.second, 45));
      }
      if (third.cents != null && third.strength > 0.04) {
        parts.push(centGauss(third.cents - m.third, 45));
      }
      // Perfect-4th evidence: rewards maqamat that have it, flags Saba (no 500¢).
      if (fourth.strength > 0.04) {
        parts.push(m.fourthPerfect ? clamp01(fourth.strength * 6) : 1 - clamp01(fourth.strength * 6));
      }
      const intervalFit = parts.length ? parts.reduce((a, b) => a + b, 0) / parts.length : 0.35;

      // Off-template energy that should NOT be present (e.g. Saba + perfect 4th).
      let absentEnergy = 0;
      for (const deg of m.absentCents) {
        absentEnergy = Math.max(absentEnergy, energyNearCents(samples, totalW, (tonicCents + deg) % 1200, 38));
      }

      let fit = clamp01(0.5 * intervalFit + 0.32 * scaleFit + 0.18 * tonicConf - 0.7 * absentEnergy);
      fit *= m.mult;
      const conf = Math.round(100 * clamp01(fit));
      return {
        id: m.id,
        maqam: m.name,
        conf,
        tonic: tonicCents,
        degrees: [...m.degrees],
        scaleFit,
        intervalFit,
        absentEnergy,
        expectSecond: m.second,
        expectThird: m.third,
      };
    }).sort((a, b) => b.conf - a.conf);
    return { tonicCents, scored, second, third, fourth };
  };

  // The tonic is decided by melodic resolution (above), NOT by whichever pitch
  // happens to maximize a maqam fit — that's what kept the home note wandering.
  const best = scoreAt(tonicInfo.tonicCents);

  const ranked = best.scored;
  const top = ranked[0];
  const second = ranked[1] || { conf: 0, maqam: "" };
  const third = ranked[2] || { conf: 0, maqam: "" };
  const gap = top.conf - second.conf;

  // Tonic confidence gates how strong a claim we allow.
  const lowTonic = tonicConf < 0.5;
  let isUncertain = top.conf < 45 || lowTonic;
  let state;
  let kindLabel;
  if (isUncertain) { state = "uncertain"; kindLabel = "Uncertain"; }
  else if (gap < 6) { state = "possible"; kindLabel = "Possible Maqam"; }
  else if (top.conf >= 70 && gap >= 10) { state = "confident"; kindLabel = "Maqam"; }
  else { state = "likely"; kindLabel = "Likely Maqam"; }

  const tonicPc = ((Math.round(best.tonicCents / 100) % 12) + 12) % 12;
  const nearQuarter = Math.min(Math.abs(((best.tonicCents % 100) + 100) % 100), 100 - (((best.tonicCents % 100) + 100) % 100));
  const tonicName = pcLetter(tonicPc) + (nearQuarter >= 35 && nearQuarter <= 65 ? " (half-flat)" : "");
  const alternatives = [second, third]
    .filter((x) => x && x.maqam)
    .map((x) => ({ maqam: x.maqam, id: x.id, confidence: x.conf }));

  const s2 = best.second.cents != null ? Math.round(best.second.cents) : null;
  const s3 = best.third.cents != null ? Math.round(best.third.cents) : null;
  let analysisNotes;
  if (lowTonic) {
    analysisNotes = `Tonic was ambiguous on this phrase (low tonic confidence), so the maqam read is tentative. End the line by resolving clearly onto one resting note.`;
  } else if (top.conf < 45) {
    analysisNotes = `The phrase didn’t settle on one maqam — closest reads are ${top.maqam}, ${second.maqam || "—"} and ${third.maqam || "—"}. A slower, more resolved 10–15s line helps.`;
  } else if (state === "possible") {
    analysisNotes = `${top.maqam} and ${second.maqam} scored very close — your 2nd≈${s2}¢ and 3rd≈${s3}¢ sit between the two.`;
  } else {
    analysisNotes = `Your 2nd≈${s2}¢ and 3rd≈${s3}¢ above tonic ${pcLetter(tonicPc)} match ${top.maqam} more than ${second.maqam || "the alternatives"}.`;
  }

  // Real-cents intervals for the debug list (kept off the 12-TET grid).
  const intervals = stableNotes.map((n) => {
    const c = (((n.midi * 100 - best.tonicCents) % 1200) + 1200) % 1200;
    return { note: midiToLetterName(n.midi), letter: pcLetter(pcOf(n.midi)), cents: Math.round(c), frames: n.frames };
  });

  const reason = lowTonic
    ? `Tonic confidence ${(tonicConf * 100).toFixed(0)}% < 50% — home note unstable${tonicInfo.cuesAgree ? "" : " (cadence and longest-held note disagree)"}; kept tentative.`
    : top.conf < 45
      ? `Top score ${top.conf}% < 45% — evidence too weak to commit.`
      : state === "possible"
        ? `${top.maqam} (${top.conf}%) vs ${second.maqam} (${second.conf}%) within ${gap} pts — sung 2nd≈${s2}¢/3rd≈${s3}¢ don't separate them cleanly.`
        : `${top.maqam} won: sung 2nd≈${s2}¢ (wants ${top.expectSecond}¢), 3rd≈${s3}¢ (wants ${top.expectThird}¢); interval fit ${(top.intervalFit * 100).toFixed(0)}%, scale fit ${(top.scaleFit * 100).toFixed(0)}% → beat ${second.maqam || "—"} by ${gap} pts.`;

  return {
    isUncertain,
    state,
    kindLabel,
    primaryMaqam: top.maqam,
    primaryId: top.id,
    confidence: top.conf,
    alternatives,
    top3: ranked.slice(0, 3).map((x) => ({ maqam: x.maqam, id: x.id, confidence: x.conf })),
    detectedTonicPc: tonicPc,
    detectedTonicName: tonicName,
    analysisNotes,
    degrees: top.degrees,
    tonicPc,
    stableCount: stableNotes.length,
    debug: {
      tonicCents: Math.round(best.tonicCents),
      tonicConf,
      sungSecond: s2,
      sungThird: s3,
      fourthStrength: best.fourth.strength,
      profile: profileN.map((v, b) => ({ cents: b * 50, weight: v })),
      tonicCandidates: tonicInfo.candidates.map((p) => ({
        cents: Math.round(p.cents),
        letter: pcLetter(((Math.round(p.cents / 100) % 12) + 12) % 12),
        score: p.score,
        cadence: p.cue.cadence,
        longSust: p.cue.longSust,
        rep: p.cue.rep,
        begin: p.cue.begin,
      })),
      cadHome: Math.round(tonicInfo.cadHome),
      longHome: Math.round(tonicInfo.longHome),
      cuesAgree: tonicInfo.cuesAgree,
      intervals,
      scores: ranked.map((x) => ({
        maqam: x.maqam,
        id: x.id,
        conf: x.conf,
        scaleFit: x.scaleFit,
        intervalFit: x.intervalFit,
        absentEnergy: x.absentEnergy,
        expectSecond: x.expectSecond,
        expectThird: x.expectThird,
      })),
      gap,
      reason,
    },
  };
}

function alignRootMidi(p50, tonicPc) {
  let r = Math.round(p50);
  const pc = ((r % 12) + 12) % 12;
  let delta = (tonicPc - pc + 12) % 12;
  if (delta > 6) delta -= 12;
  return r + delta;
}

function nearestScaleMidi(m, root, degrees) {
  const r = Math.round(m);
  let best = r;
  let bd = Infinity;
  for (let t = r - 24; t <= r + 24; t++) {
    const rel = (((t - root) % 12) + 12) % 12;
    if (!degrees.includes(rel)) continue;
    const d = Math.abs(m - t);
    if (d < bd) {
      bd = d;
      best = t;
    }
  }
  if (bd === Infinity) return r;
  return best;
}

/** Mean absolute cents vs nearest note on the guessed maqam (12-TET grid). */
function intonationVsMaqam(voiced, rootMidi, degrees) {
  const centsArr = [];
  let loose = 0;
  for (const m of voiced) {
    const near = nearestScaleMidi(m, rootMidi, degrees);
    const cents = Math.abs(100 * (m - near));
    centsArr.push(cents);
    if (cents > 35) loose += 1;
  }
  const mean = centsArr.reduce((a, b) => a + b, 0) / centsArr.length;
  const loosePct = Math.round((100 * loose) / centsArr.length);
  let title = "On this maqam grid";
  let body =
    mean < 22
      ? "Pitch stays close to the nearest scale steps — good centering for this rough 12-note model."
      : mean < 38
        ? "Some frames sit between steps — normal for slides, ornaments, or quarter tones we do not model yet."
        : "Many frames read far from the nearest step — try slower phrases, clearer vowels, or check mic distance.";
  if (loosePct >= 35) {
    title = "Pitch vs grid";
    body += ` About ${loosePct}% of windows are >35¢ off a step — could be intentional color, vibrato, or tuning drift.`;
  }
  const meta = `Mean distance ~${Math.round(mean)}¢ · >35¢ in ${loosePct}% of windows`;
  return { title, body, meta, meanCents: mean, loosePct };
}

function recommendGenres({ maqamId, voiceTitle, p95, brightMean, voiceRef }) {
  const g = new Set();
  const vt = String(voiceTitle || "").toLowerCase();
  g.add("Arabic ballad / tarab (long lines, room for ornaments)");
  if (maqamId === "hijaz" || maqamId === "kurd") g.add("Levantine & Egyptian drama (mawwal, aghani klasik-style phrasing)");
  if (maqamId === "rast" || maqamId === "bayati") g.add("Wasla / waqt-style journeys (study ajnas with a teacher)");
  if (maqamId === "nahawand" || maqamId === "saba") g.add("Minor-leaning pop & film themes");
  if (maqamId === "ajam") g.add("Up-major pop, shaabi hooks, children’s songs");
  if (p95 >= 73) g.add("Pop, soul, R&B belt sections");
  if (p95 < 63) g.add("Spoken-adjacent storytelling & low-tessitura jazz");
  if (brightMean > 2650) g.add("Bright indie / modern pop mixes");
  if (brightMean < 1980) g.add("Warm acoustic sessions · jazz standards");
  if (voiceRef === "mens") {
    if (vt.includes("tenor") || vt.includes("baritone") || vt.includes("bass")) {
      g.add("Male-fronted Arabic pop & khaleeji leads (where your tessitura fits)");
    }
  } else if (voiceRef === "womens") {
    if (vt.includes("soprano") || vt.includes("mezzo") || vt.includes("alto") || vt.includes("contralto")) {
      g.add("Female-fronted ballads & choral top lines");
    }
  } else {
    g.add("Any genre — pick a range label above when you want classical-style hints");
  }
  return Array.from(g).slice(0, 6).join(" · ");
}

/** YIN cumulative mean normalized difference (simplified port). */
function yinPitch(buffer, sampleRate, minHz = 65, maxHz = 1400) {
  const n = buffer.length;
  if (n < 512) return -1;
  const half = Math.floor(n / 2);
  let rms = 0;
  for (let i = 0; i < half; i++) rms += buffer[i] * buffer[i];
  rms = Math.sqrt(rms / half);
  if (rms < 0.002) return -1;

  const d = new Float32Array(half);
  for (let tau = 1; tau < half; tau++) {
    let s = 0;
    for (let i = 0; i < half; i++) {
      const diff = buffer[i] - buffer[i + tau];
      s += diff * diff;
    }
    d[tau] = s;
  }

  const yin = new Float32Array(half);
  yin[0] = 1;
  let cumsum = 0;
  for (let tau = 1; tau < half; tau++) {
    cumsum += d[tau];
    yin[tau] = cumsum > 0 ? (tau * d[tau]) / cumsum : 1;
  }

  const threshold = 0.14;
  const minTau = Math.max(2, Math.floor(sampleRate / maxHz));
  const maxTau = Math.min(half - 1, Math.ceil(sampleRate / minHz));

  for (let tau = minTau; tau <= maxTau; tau++) {
    if (yin[tau] < threshold) {
      let t = tau;
      while (t + 1 <= maxTau && yin[t + 1] < yin[t]) t++;
      const x0 = t > 0 ? t - 1 : t;
      const x2 = t + 1 <= maxTau ? t + 1 : t;
      let better;
      if (x0 === t) better = yin[t] < yin[x2] ? t : x2;
      else if (x2 === t) better = yin[t] < yin[x0] ? t : x0;
      else {
        const s0 = yin[x0];
        const s1 = yin[t];
        const s2 = yin[x2];
        better = t + (s2 - s0) / (2 * (2 * s1 - s2 - s0));
      }
      return sampleRate / better;
    }
  }
  return -1;
}

/** Single-number “brightness” without FFT: HF energy vs body. */
function frameBrightness(frame) {
  let body = 0;
  let edge = 0;
  let zc = 0;
  for (let i = 0; i < frame.length; i++) body += frame[i] * frame[i];
  for (let i = 1; i < frame.length; i++) {
    edge += (frame[i] - frame[i - 1]) ** 2;
    if ((frame[i - 1] >= 0) !== (frame[i] >= 0)) zc++;
  }
  const n = frame.length;
  const rms = Math.sqrt(body / Math.max(1, n));
  const edgeRms = Math.sqrt(edge / Math.max(1, n - 1));
  const zcr = zc / Math.max(1, n);
  const tilt = rms > 1e-6 ? edgeRms / rms : 0;
  return 650 + zcr * 4200 + tilt * 420;
}

function analyzeBuffer(full, sampleRate) {
  const win = 2048;
  const hop = 384;
  const f0s = [];
  const stepCents = [];
  const bright = [];
  let prevMidi = NaN;

  for (let start = 0; start + win <= full.length; start += hop) {
    const slice = full.subarray(start, start + win);
    const hz = yinPitch(slice, sampleRate);
    const m = hzToMidi(hz);
    if (Number.isFinite(m) && hz > 0) {
      f0s.push(m);
      if (Number.isFinite(prevMidi)) {
        stepCents.push(Math.abs(100 * (m - prevMidi)));
      }
      prevMidi = m;
    } else {
      f0s.push(NaN);
    }
    bright.push(frameBrightness(slice));
  }

  const voiced = f0s.filter((x) => Number.isFinite(x));
  if (voiced.length < 4) {
    return {
      ok: false,
      reason:
        "We could not detect a stable pitch. Try a sustained “ah” closer to the mic, a little louder, with less background noise.",
    };
  }

  const sorted = [...voiced].sort((a, b) => a - b);
  const p5 = percentile(sorted, 0.07);
  const p50 = percentile(sorted, 0.5);
  const p95 = percentile(sorted, 0.93);
  const minRaw = sorted[0];
  const maxRaw = sorted[sorted.length - 1];
  const sum = voiced.reduce((a, b) => a + b, 0);

  const brightMean = bright.length ? bright.reduce((a, b) => a + b, 0) / bright.length : 1700;
  let timbreLabel = "Balanced presence";
  let timbreDetail =
    "Your take sits in a neutral brightness range — neither especially dark nor piercing in this measurement.";
  if (brightMean < 1950) {
    timbreLabel = "Warm, chest-forward";
    timbreDetail =
      "Energy leans lower / softer in the highs — often reads as rounder and warmer on earbuds.";
  } else if (brightMean > 2800) {
    timbreLabel = "Bright, forward air";
    timbreDetail =
      "More high-frequency motion in this clip — tends to feel present and “lit” on small speakers.";
  }
  timbreDetail +=
    " This row is **spectral brightness** (HF energy in the waveform), not a professional timbre / formant analysis.";
  timbreDetail = timbreDetail.replace(/\*\*(.*?)\*\*/g, "$1");

  const f0Std = (() => {
    const mean = sum / voiced.length;
    return Math.sqrt(voiced.reduce((a, b) => a + (b - mean) ** 2, 0) / voiced.length);
  })();

  const meanAbsC = stepCents.length ? stepCents.reduce((a, b) => a + b, 0) / stepCents.length : 0;

  let vibratoLabel = "Subtle motion";
  let vibratoDetail =
    "Pitch moves gently between windows — typical of speech-like phrasing or a very light natural wobble.";
  if (f0Std > 1.1 || meanAbsC > 35) {
    vibratoLabel = "Expressive pitch motion";
    vibratoDetail =
      "Clear pitch variation across the take — can be natural vibrato, note changes, or vowel shifts. For “pure” vibrato stats, hold one steady vowel next time.";
  }
  if (f0Std < 0.35 && meanAbsC < 12) {
    vibratoLabel = "Very steady line";
    vibratoDetail =
      "Pitch stayed unusually level between analysis windows — great control, or a very short sustained tone.";
  }

  const medianPc = ((Math.round(p50) % 12) + 12) % 12;
  const k1 = pitchClassSolfege(medianPc);
  const kRel = pitchClassSolfege((medianPc + 9) % 12);
  const kDom = pitchClassSolfege((medianPc + 7) % 12);
  const relMin = pitchClassSolfege(((Math.round(p5) % 12) + 12) % 12);
  const relMax = pitchClassSolfege(((Math.round(p95) % 12) + 12) % 12);

  const stability = Math.max(0, 100 - Math.min(60, meanAbsC) * 1.1);
  const rangeScore = Math.min(100, (p95 - p5) * 8);
  const quality = Math.round(
    Math.min(100, stability * 0.55 + rangeScore * 0.25 + Math.min(100, brightMean / 45)),
  );

  const voiceRef = getMentorVoiceRef();
  const voice = guessVoiceArchetype(p5, p50, p95, voiceRef);
  // Maqam: analyze only the sustained, held notes (stable-note extraction drops
  // breath, ornaments, and short unstable jumps), then rank all candidates.
  const stableNotes = extractStableNotes(f0s, sampleRate, hop);
  const maqamRanking = rankMaqams(stableNotes);
  const maqamDebug = isMentorDebug()
    ? buildMaqamDebug({ f0s, sampleRate, hop, stableNotes, ranking: maqamRanking })
    : null;
  const rootMidi = alignRootMidi(p50, maqamRanking.tonicPc);
  const tune = intonationVsMaqam(voiced, rootMidi, maqamRanking.degrees);
  const genreLine = recommendGenres({
    maqamId: maqamRanking.primaryId,
    voiceTitle: voice.title,
    p95,
    brightMean,
    voiceRef,
  });

  const maqamTitle = maqamRanking.isUncertain
    ? "Uncertain"
    : `${maqamRanking.primaryMaqam} · ${maqamRanking.confidence}%`;
  const maqamMeta = `Tonic ~${maqamRanking.detectedTonicName} · ranked from ${maqamRanking.stableCount} sustained notes (microtonal cents estimate)`;

  return {
    ok: true,
    minM: p5,
    maxM: p95,
    medianM: p50,
    minRaw,
    maxRaw,
    lowName: midiToName(p5),
    highName: midiToName(p95),
    medianName: midiToName(p50),
    spanSemitones: Math.round(p95 - p5),
    spanHint: `Robust low/high ≈ 7th–93rd percentile of tracked pitch (comfortable reach, not a forced max). Raw: ${midiToName(minRaw)}–${midiToName(maxRaw)}.`,
    timbreLabel,
    timbreDetail,
    brightMean: Math.round(brightMean),
    vibratoLabel,
    vibratoDetail,
    f0Std,
    meanAbsC: Math.round(meanAbsC),
    keysLine: `${k1} major · ${kRel} minor · ${kDom} major`,
    keysDetail: `Heuristic keys from where your pitch sat (${relMin}–${relMax} pitch-class range in this clip). Use as a starting point — songs and arrangements vary.`,
    quality,
    voicedFrames: voiced.length,
    voiceTitle: voice.title,
    voiceBody: voice.body,
    voiceMeta: voice.meta,
    maqamTitle,
    maqamBody: maqamRanking.analysisNotes,
    maqamMeta,
    maqamRanking,
    maqamDebug,
    maqamId: maqamRanking.primaryId,
    maqamTonicPc: maqamRanking.tonicPc,
    maqamDegrees: [...maqamRanking.degrees],
    genreTitle: "Genres that may fit",
    genreBody: genreLine,
    tuneTitle: tune.title,
    tuneBody: tune.body,
    tuneMeta: tune.meta,
  };
}

function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

function hueFromMaqamId(id) {
  const s = String(id || "");
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h % 360;
}

/** Decorative staff sketch: scale degrees left-to-right with fixed-Do labels (12-TET). */
function renderMaqamDiagram(tonicPc, degrees) {
  const el = document.getElementById("mentorMaqamDiagram");
  if (!el) return;
  if (!degrees || !degrees.length) {
    el.innerHTML = "";
    return;
  }
  const W = 280;
  const H = 96;
  const lines = [22, 30, 38, 46, 54];
  let html = `<svg class="mentorStaffSvg" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">`;
  for (const y of lines) {
    html += `<line x1="12" y1="${y}" x2="${W - 6}" y2="${y}" stroke="rgba(255,255,255,0.14)" stroke-width="1.25"/>`;
  }
  const n = degrees.length;
  const span = n <= 1 ? 0 : W - 44;
  degrees.forEach((d, i) => {
    const pc = (((tonicPc + d) % 12) + 12) % 12;
    const label = pitchClassSolfege(pc);
    const x = n === 1 ? W / 2 : 22 + (i * span) / (n - 1);
    const spread = 54 - (pc * 32) / 11;
    const yn = Math.min(56, Math.max(20, spread));
    html += `<ellipse cx="${x}" cy="${yn}" rx="6.5" ry="4.8" fill="rgba(124,92,255,0.92)" stroke="rgba(255,255,255,0.22)" stroke-width="1"/>`;
    const stemUp = yn > 38;
    const stemLen = 22;
    if (stemUp) {
      html += `<line x1="${x + 5.2}" y1="${yn}" x2="${x + 5.2}" y2="${yn - stemLen}" stroke="rgba(255,255,255,0.38)" stroke-width="1.35" stroke-linecap="round"/>`;
    } else {
      html += `<line x1="${x - 5.2}" y1="${yn}" x2="${x - 5.2}" y2="${yn + stemLen}" stroke="rgba(35,213,171,0.5)" stroke-width="1.35" stroke-linecap="round"/>`;
    }
    html += `<text x="${x}" y="${H - 8}" text-anchor="middle" fill="rgba(210,218,232,0.92)" font-size="9.5" font-weight="700" font-family="system-ui,sans-serif">${label}</text>`;
  });
  html += "</svg>";
  el.innerHTML = html;
}

function escMaqam(s) {
  return String(s == null ? "" : s).replace(/[&<>"]/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c],
  );
}

// --- Take history (on-device only) -----------------------------------------
// We don't store audio — just a compact snapshot of each scan so the singer can
// see range / quality / maqam drift over time. Kept in localStorage; capped.
const MENTOR_TAKES_KEY = "mentor:takes:v1";
const MENTOR_TAKES_MAX = 24;

function loadMentorTakes() {
  try {
    const arr = JSON.parse(localStorage.getItem(MENTOR_TAKES_KEY) || "[]");
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}
function persistMentorTakes(list) {
  try {
    localStorage.setItem(MENTOR_TAKES_KEY, JSON.stringify(list.slice(0, MENTOR_TAKES_MAX)));
  } catch {}
}
function saveMentorTake(res) {
  const r = res?.maqamRanking || {};
  const take = {
    t: Date.now(),
    lowName: res.lowName,
    highName: res.highName,
    span: res.spanSemitones,
    medianName: res.medianName,
    quality: res.quality,
    voiceTitle: res.voiceTitle,
    maqam: r.primaryMaqam || "—",
    maqamConf: r.confidence || 0,
    maqamUncertain: !!r.isUncertain,
    tonic: r.detectedTonicName || "—",
  };
  const list = loadMentorTakes();
  list.unshift(take);
  persistMentorTakes(list);
  renderMentorHistory();
  return take;
}
function clearMentorTakes() {
  try {
    localStorage.removeItem(MENTOR_TAKES_KEY);
  } catch {}
  renderMentorHistory();
}
function mentorAgoLabel(ts) {
  const s = (Date.now() - Number(ts || 0)) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  const d = Math.floor(s / 86400);
  if (d < 7) return `${d}d ago`;
  try {
    return new Date(Number(ts)).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  } catch {
    return `${d}d ago`;
  }
}
function renderMentorHistory() {
  const sec = document.getElementById("mentorHistory");
  const list = document.getElementById("mentorHistoryList");
  const trend = document.getElementById("mentorHistoryTrend");
  if (!sec || !list) return;
  const takes = loadMentorTakes();
  if (!takes.length) {
    sec.hidden = true;
    list.innerHTML = "";
    if (trend) trend.textContent = "";
    return;
  }
  sec.hidden = false;
  const bestSpan = takes.reduce((m, x) => ((x.span || 0) > (m.span || 0) ? x : m), takes[0]);
  const bestQual = Math.max(...takes.map((x) => x.quality || 0));
  if (trend) {
    trend.textContent = `${takes.length} take${takes.length > 1 ? "s" : ""} · widest ${bestSpan.lowName}–${bestSpan.highName} · best quality ${bestQual}/100`;
  }
  list.innerHTML = takes
    .map((x) => {
      const maq = x.maqamUncertain ? "Uncertain" : `${escMaqam(x.maqam)} ${x.maqamConf}%`;
      const sub = [escMaqam(x.voiceTitle || ""), maq].filter(Boolean).join(" · ");
      return `<div class="mentorHistoryRow" role="listitem">
        <div class="mhMain">
          <span class="mhRange">${escMaqam(x.lowName)}–${escMaqam(x.highName)}</span>
          <span class="mhSub">${sub}</span>
        </div>
        <div class="mhRight">
          <span class="mhQual">${x.quality}<small>/100</small></span>
          <span class="mhWhen">${mentorAgoLabel(x.t)}</span>
        </div>
      </div>`;
    })
    .join("");
}
function updateMentorTrendLine(res, prevTake) {
  const tl = document.getElementById("mentorTrendLine");
  if (!tl) return;
  if (!prevTake) {
    tl.hidden = true;
    tl.textContent = "";
    return;
  }
  const dq = (res.quality || 0) - (prevTake.quality || 0);
  const dspan = (res.spanSemitones || 0) - (prevTake.span || 0);
  const parts = [];
  if (dq) parts.push(`quality ${dq > 0 ? "+" : ""}${dq}`);
  if (dspan) parts.push(`range ${dspan > 0 ? "+" : ""}${dspan} st`);
  tl.textContent = parts.length ? `vs your last take · ${parts.join(" · ")}` : "Steady — same as your last take";
  tl.hidden = false;
}

/** Render the ranked maqam result card (primary + alternatives with bars). */
function renderMaqamRanking(r) {
  const el = document.getElementById("mentorMaqamRanking");
  if (!el) return;
  if (!r || !r.primaryMaqam || r.primaryMaqam === "—") {
    el.innerHTML =
      '<div class="mmqPrimary mmqUncertain"><div class="mmqPrimaryHead"><span class="mmqKind">Uncertain</span><span class="mmqName mmqNameMuted">No clear maqam</span></div></div>';
    return;
  }
  const conf = Math.max(0, Math.min(100, Number(r.confidence) || 0));
  const uncertain = !!r.isUncertain;
  const nameCls = uncertain ? "mmqName mmqNameMuted" : "mmqName";
  const alts = Array.isArray(r.alternatives) ? r.alternatives : [];
  const altRows = alts
    .map(
      (a) => `<div class="mmqAltRow">
        <span class="mmqAltName">${escMaqam(a.maqam)}</span>
        <span class="mmqAltBar"><i style="width:${Math.max(4, Math.min(100, Number(a.confidence) || 0))}%"></i></span>
        <span class="mmqAltConf">${Math.max(0, Math.min(100, Number(a.confidence) || 0))}%</span>
      </div>`,
    )
    .join("");
  el.innerHTML = `<div class="mmqPrimary${uncertain ? " mmqUncertain" : ""}" data-state="${escMaqam(r.state)}">
      <div class="mmqPrimaryHead">
        <span class="mmqKind">${escMaqam(r.kindLabel)}</span>
        <span class="${nameCls}">${escMaqam(r.primaryMaqam)}</span>
      </div>
      <div class="mmqConfRow">
        <span class="mmqConfPct">${conf}%</span>
        <span class="mmqConfBar"><i style="width:${Math.max(4, conf)}%"></i></span>
      </div>
    </div>
    ${alts.length ? `<div class="mmqAlts"><span class="mmqAltsTitle">Other possibilities</span>${altRows}</div>` : ""}`;
}

// --- Maqam developer debug mode (hidden; internal testing only) ------------
// Toggled by tapping the "Lab" title 7× fast. Surfaces every pipeline stage so
// we can see WHERE a maqam read goes wrong (pitch, tonic, smoothing, stable
// notes, or scoring). Regular users never see it.
const MENTOR_DEBUG_KEY = "mentor:maqamDebug";
const MENTOR_DEBUG_TONICS_KEY = "mentor:debugTonics";
function isMentorDebug() {
  try {
    return localStorage.getItem(MENTOR_DEBUG_KEY) === "1";
  } catch {
    return false;
  }
}
function setMentorDebug(on) {
  try {
    localStorage.setItem(MENTOR_DEBUG_KEY, on ? "1" : "0");
  } catch {}
}
function pushDebugTonic(letter) {
  try {
    const arr = JSON.parse(localStorage.getItem(MENTOR_DEBUG_TONICS_KEY) || "[]");
    const list = Array.isArray(arr) ? arr : [];
    list.push(String(letter || "—"));
    while (list.length > 6) list.shift();
    localStorage.setItem(MENTOR_DEBUG_TONICS_KEY, JSON.stringify(list));
    return list;
  } catch {
    return [String(letter || "—")];
  }
}

function mentorMedianFilter(f0s, win) {
  const half = Math.floor(win / 2);
  const out = new Array(f0s.length).fill(null);
  for (let i = 0; i < f0s.length; i++) {
    if (!Number.isFinite(f0s[i])) continue;
    const w = [];
    for (let j = i - half; j <= i + half; j++) {
      if (j >= 0 && j < f0s.length && Number.isFinite(f0s[j])) w.push(f0s[j]);
    }
    out[i] = w.length ? medianOf(w) : null;
  }
  return out;
}

function buildMaqamDebug({ f0s, sampleRate, hop, stableNotes, ranking }) {
  const frameMs = (hop / sampleRate) * 1000;
  const minFrames = Math.max(4, Math.round(90 / frameMs));
  const tolCents = 55;
  // Re-walk frames to count what stable-note extraction kept vs dropped.
  let voiced = 0;
  let unvoiced = 0;
  let droppedShortFrames = 0;
  let droppedShortRuns = 0;
  let curRun = [];
  const flushRun = () => {
    if (curRun.length && curRun.length < minFrames) {
      droppedShortFrames += curRun.length;
      droppedShortRuns += 1;
    }
    curRun = [];
  };
  for (const m of f0s) {
    if (!Number.isFinite(m)) {
      unvoiced++;
      flushRun();
      continue;
    }
    voiced++;
    if (!curRun.length) {
      curRun.push(m);
      continue;
    }
    const refv = curRun.length > 6 ? medianOf(curRun) : curRun[curRun.length - 1];
    if (Math.abs(m - refv) * 100 <= tolCents) curRun.push(m);
    else {
      flushRun();
      curRun.push(m);
    }
  }
  flushRun();

  // Pitch-tracking stability: fraction of voiced frame-to-frame jumps > 120¢.
  let jumps = 0;
  let consec = 0;
  for (let i = 1; i < f0s.length; i++) {
    if (Number.isFinite(f0s[i]) && Number.isFinite(f0s[i - 1])) {
      consec++;
      if (Math.abs(f0s[i] - f0s[i - 1]) * 100 > 120) jumps++;
    }
  }
  const jumpRate = consec ? jumps / consec : 0;

  const tonicHistory = pushDebugTonic(ranking.detectedTonicName);
  const recent = tonicHistory.slice(-3);
  const distinctTonics = new Set(recent).size;

  const flags = [];
  if (recent.length >= 3 && distinctTonics >= 3) {
    flags.push(`tonic detection unstable (last 3 takes: ${recent.join(", ")})`);
  }
  if (jumpRate > 0.25) {
    flags.push(`pitch tracking unstable (${Math.round(jumpRate * 100)}% of frames jump >120¢)`);
  }
  const tonicConf = ranking.debug && typeof ranking.debug.tonicConf === "number" ? ranking.debug.tonicConf : 1;
  if (tonicConf < 0.5) {
    flags.push(`tonic confidence low (${Math.round(tonicConf * 100)}%) — maqam capped to tentative`);
  }
  if (ranking.debug && ranking.debug.cuesAgree === false) {
    flags.push("tonic cues disagree — cadence and longest-held note point to different homes");
  }
  if (ranking.isUncertain) flags.push("uncertain — not forcing a maqam");
  else if (ranking.state === "possible") flags.push("ranking close — flagged as possible, not final");

  return {
    frameMs: +frameMs.toFixed(2),
    totalFrames: f0s.length,
    voicedFrames: voiced,
    unvoicedFrames: unvoiced,
    droppedShortFrames,
    droppedShortRuns,
    minStableFrames: minFrames,
    jumpRate,
    raw: f0s.map((m) => (Number.isFinite(m) ? +m.toFixed(2) : null)),
    smooth: mentorMedianFilter(f0s, 5).map((m) => (Number.isFinite(m) ? +m.toFixed(2) : null)),
    flags,
    tonicHistory,
    stableNotes: stableNotes.map((n) => ({ note: midiToLetterName(n.midi), frames: n.frames })),
    detectedTonicName: ranking.detectedTonicName,
    primaryMaqam: ranking.primaryMaqam,
    confidence: ranking.confidence,
    kindLabel: ranking.kindLabel,
    ...ranking.debug,
  };
}

function mentorSparkline(values, color) {
  const w = 280;
  const h = 54;
  const pad = 4;
  const nums = values.filter((v) => v != null);
  if (nums.length < 2) return `<svg viewBox="0 0 ${w} ${h}" class="mdbgSpark"></svg>`;
  const min = Math.min(...nums);
  const max = Math.max(...nums);
  const span = max - min || 1;
  const n = values.length;
  const xAt = (i) => pad + (i / (n - 1)) * (w - 2 * pad);
  const yAt = (v) => h - pad - ((v - min) / span) * (h - 2 * pad);
  const segs = [];
  let cur = [];
  for (let i = 0; i < n; i++) {
    if (values[i] == null) {
      if (cur.length) {
        segs.push(cur);
        cur = [];
      }
    } else {
      cur.push(`${xAt(i).toFixed(1)},${yAt(values[i]).toFixed(1)}`);
    }
  }
  if (cur.length) segs.push(cur);
  const lines = segs
    .map((s) => `<polyline points="${s.join(" ")}" fill="none" stroke="${color}" stroke-width="1.5"/>`)
    .join("");
  return `<svg viewBox="0 0 ${w} ${h}" class="mdbgSpark" preserveAspectRatio="none">${lines}</svg>`;
}

function renderMaqamDebug(debug) {
  const el = document.getElementById("mentorMaqamDebug");
  if (!el) return;
  if (!debug) {
    el.hidden = true;
    el.innerHTML = "";
    return;
  }
  el.hidden = false;
  const profLines = (debug.profile || [])
    .slice()
    .filter((h) => h.weight > 0.012)
    .sort((a, b) => b.weight - a.weight)
    .map((h) => `  ${String(h.cents).padStart(4)}c ${"#".repeat(Math.max(0, Math.round(h.weight * 40)))} ${(h.weight * 100).toFixed(0)}%`)
    .join("\n");
  const intervalLines = (debug.intervals || [])
    .map((iv) => `  ${String(iv.note).padEnd(5)} +${String(iv.cents).padStart(4)}c (${iv.frames}f)`)
    .join("\n");
  const scoreLines = (debug.scores || [])
    .slice(0, 5)
    .map(
      (s, i) =>
        `  ${i + 1}. ${String(s.maqam).padEnd(9)} ${String(s.conf).padStart(3)}%   interval=${(s.intervalFit * 100).toFixed(0)}% scale=${(s.scaleFit * 100).toFixed(0)}% (wants 2nd ${s.expectSecond}c/3rd ${s.expectThird}c)${s.absentEnergy > 0.05 ? ` [off ${(s.absentEnergy * 100).toFixed(0)}%]` : ""}`,
    )
    .join("\n");
  const tonicCandLines = (debug.tonicCandidates || [])
    .map(
      (t) =>
        `  ${t.letter.padEnd(3)} ${String(t.cents).padStart(4)}c  score ${t.score.toFixed(2)}  [cad ${(t.cadence * 100).toFixed(0)} · long ${(t.longSust * 100).toFixed(0)} · rep ${(t.rep * 100).toFixed(0)} · beg ${(t.begin * 100).toFixed(0)}]`,
    )
    .join("\n");
  const tConf = typeof debug.tonicConf === "number" ? `${Math.round(debug.tonicConf * 100)}%` : "—";
  const cadLetter = (c) => pcLetter(((Math.round(c / 100) % 12) + 12) % 12);
  const flagsBlock = debug.flags && debug.flags.length ? debug.flags.map((f) => `! ${f}`).join("\n") : "OK — no instability flags";
  const text = [
    `Detected tonic: ${debug.detectedTonicName} (${debug.tonicCents}c) · confidence ${tConf}`,
    `Resolution cues: cadence→${cadLetter(debug.cadHome)} · longest-held→${cadLetter(debug.longHome)} ${debug.cuesAgree ? "(agree)" : "(DISAGREE)"}`,
    `Tonic candidates [cadence 40% · longest 30% · repeated-rest 20% · beginnings 10%]:`,
    tonicCandLines || "  —",
    ``,
    `Sung intervals: 2nd ~${debug.sungSecond == null ? "—" : debug.sungSecond + "c"} · 3rd ~${debug.sungThird == null ? "—" : debug.sungThird + "c"} · 4th energy ${(Number(debug.fourthStrength || 0) * 100).toFixed(0)}%`,
    ``,
    `Stable notes (${debug.stableNotes.length}):`,
    `  ${debug.stableNotes.map((n) => n.note).join(", ") || "—"}`,
    ``,
    `Ignored: ${debug.unvoicedFrames} unvoiced/breath frames + ${debug.droppedShortFrames} frames in ${debug.droppedShortRuns} short/unstable runs (<${debug.minStableFrames}f ~90ms) — short jumps, ornaments, noise`,
    ``,
    `Relative intervals from tonic (real cents):`,
    intervalLines || "  —",
    ``,
    `Cent profile (microtonal, 50c bins):`,
    profLines || "  —",
    ``,
    `Maqam ranking (top 5):`,
    scoreLines || "  —",
    ``,
    `Final: ${debug.kindLabel}: ${debug.primaryMaqam}  |  Confidence: ${debug.confidence}%`,
    `Reason: ${debug.reason || "—"}`,
    ``,
    `Pitch: ${debug.voicedFrames} voiced / ${debug.totalFrames} frames | jump rate ${(debug.jumpRate * 100).toFixed(0)}% | frame ${debug.frameMs}ms`,
    ``,
    `Flags:`,
    flagsBlock,
  ].join("\n");
  el.innerHTML =
    `<div class="mdbgHead">Maqam debug — internal</div>` +
    `<div class="mdbgSparkRow"><span class="mdbgSparkLabel">Raw pitch</span>${mentorSparkline(debug.raw, "#7c5cff")}</div>` +
    `<div class="mdbgSparkRow"><span class="mdbgSparkLabel">Smoothed</span>${mentorSparkline(debug.smooth, "#23d5ab")}</div>` +
    `<pre class="mdbgPre">${escMaqam(text)}</pre>`;
}

function showResults(on) {
  const wrap = document.getElementById("mentorResults");
  const main = document.getElementById("mentorLabMain");
  if (wrap) wrap.hidden = !on;
  if (main) main.hidden = Boolean(on);
  if (on) {
    try {
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch {
      try {
        window.scrollTo(0, 0);
      } catch {}
    }
  }
}

export function resetMentorSession() {
  stopStreams();
  showResults(false);
  setText("mentorStatus", "");
  const t = document.getElementById("mentorTimer");
  if (t) t.textContent = "";
  setText(
    "mentorHint",
    "Open tips below if you want a quick checklist — then one slow glide.",
  );
  setText("mentorValRange", "—");
  setText("mentorValSpan", "—");
  setText("mentorValMedian", "—");
  setText("mentorValVoice", "—");
  setText("mentorValVoiceBody", "");
  setText("mentorValVoiceMeta", "");
  setText("mentorPullQuote", "This pass");
  setText("mentorCardMaqamTitle", "Maqam guess");
  setText("mentorCardMaqamBody", "");
  setText("mentorCardMaqamMeta", "");
  const maqamRankEl = document.getElementById("mentorMaqamRanking");
  if (maqamRankEl) maqamRankEl.innerHTML = "";
  const maqamDbgEl = document.getElementById("mentorMaqamDebug");
  if (maqamDbgEl) {
    maqamDbgEl.hidden = true;
    maqamDbgEl.innerHTML = "";
  }
  setText("mentorCardGenreTitle", "Genres that may fit");
  setText("mentorCardGenreBody", "");
  setText("mentorCardTuneTitle", "Intonation");
  setText("mentorCardTuneBody", "");
  setText("mentorCardTuneMeta", "");
  setText("mentorCardTimbreTitle", "Brightness");
  setText("mentorCardTimbreBody", "—");
  setText("mentorCardTimbreMeta", "—");
  setText("mentorCardVibratoTitle", "Pitch motion");
  setText("mentorCardVibratoBody", "—");
  setText("mentorCardVibratoMeta", "—");
  setText("mentorCardKeysTitle", "Key ideas");
  setText("mentorCardKeysBody", "—");
  setText("mentorCardKeysSub", "—");
  setText("mentorCardQualityTitle", "Quality");
  setText("mentorCardQualityScore", "—");
  setText("mentorCardQualityBody", "—");
  setText("mentorHeroTimbre", "—");
  setText("mentorStrVibratoTitle", "Pitch motion");
  setText("mentorStrVibratoBody", "—");
  setText("mentorStrTimbreTitle", "Brightness");
  setText("mentorStrTimbreBody", "—");
  setText("mentorStrTuneTitle", "Intonation");
  setText("mentorStrTuneBody", "—");
  setText("mentorFocusLine", "—");
  setText("mentorFocusSub", "—");
  renderGenrePills("");
  setMentorQualityRing(0);
  const hero = document.querySelector("[data-mentor-hero]");
  if (hero) hero.style.setProperty("--mentor-mood-hue", "258");
  const bs = document.getElementById("mentorBtnStart");
  const bt = document.getElementById("mentorBtnStop");
  if (bs) bs.disabled = false;
  if (bt) bt.disabled = true;
}

function stopStreams() {
  if (_mentorAutoStopTimer) {
    try {
      clearTimeout(_mentorAutoStopTimer);
    } catch {}
    _mentorAutoStopTimer = 0;
  }
  const rec = _mentorRecorder;
  _mentorRecorder = null;
  try {
    if (rec && rec.state !== "inactive") rec.stop();
  } catch {}
  if (_stream) {
    _stream.getTracks().forEach((tr) => {
      try {
        tr.stop();
      } catch {}
    });
  }
  _stream = null;
  _recording = false;
  if (_raf) {
    cancelAnimationFrame(_raf);
    _raf = 0;
  }
  setMentorLiveUi(false);
}

function updateTimer() {
  const el = document.getElementById("mentorTimer");
  if (!el || !_recording) return;
  const sec = (performance.now() - _startedAt) / 1000;
  el.textContent = `${sec.toFixed(1)}s`;
  _raf = requestAnimationFrame(updateTimer);
}

async function finalizeMentorRecording(chunks, mimeTypeHint, recordSession) {
  const btnStart = document.getElementById("mentorBtnStart");
  const btnStop = document.getElementById("mentorBtnStop");
  try {
    if (recordSession !== _mentorRecSession) return;

    if (_stream) {
      try {
        _stream.getTracks().forEach((t) => t.stop());
      } catch {}
      _stream = null;
    }

    const totalBytes = chunks.reduce((n, b) => n + (b.size || 0), 0);
    if (!chunks.length || !totalBytes) {
      setText("mentorStatus", "No audio captured. Allow the microphone, then try again (iOS: Settings → Privacy → Microphone).");
      return;
    }

    const blob = new Blob(chunks, { type: mimeTypeHint || "audio/webm" });
    const ab = await blob.arrayBuffer();
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    const dec = new AudioCtx();
    let audioBuf;
    try {
      audioBuf = await dec.decodeAudioData(ab.slice(0));
    } catch (e) {
      setText("mentorStatus", `Could not read this take: ${e?.message || e}`);
      try {
        await dec.close();
      } catch {}
      return;
    }

    if (recordSession !== _mentorRecSession) {
      try {
        await dec.close();
      } catch {}
      return;
    }

    const sr = audioBuf.sampleRate;
    const full = floatMonoFromAudioBuffer(audioBuf);

    try {
      await dec.close();
    } catch {}

    if (recordSession !== _mentorRecSession) {
      setText(
        "mentorStatus",
        "That take was discarded (Mentor was reset while decoding). Tap Start capture again.",
      );
      return;
    }

    const dur = full.length / sr;

    if (dur < MIN_SECONDS) {
      setText("mentorStatus", `Keep going a bit longer (at least ~${MIN_SECONDS}s).`);
      return;
    }

    setText("mentorStatus", "Analyzing…");
    let res;
    try {
      res = analyzeBuffer(full, sr);
    } catch (e) {
      setText("mentorStatus", `Analysis hit an error: ${e?.message || e}. Try again or update the app.`);
      return;
    }
    if (!res.ok) {
      setText("mentorStatus", res.reason);
      return;
    }

    try {
      setText("mentorStatus", "Snapshot ready — review your report.");
      const pullQuotes = [
        "This pass",
        "Your snapshot",
        "What we heard",
        "A quick read",
        "This take",
      ];
      setText("mentorPullQuote", pullQuotes[Math.floor(Math.random() * pullQuotes.length)]);
      setText("mentorValRange", `${res.lowName} – ${res.highName}`);
      setText("mentorValSpan", `${res.spanSemitones} semitones (robust) · ${res.spanHint}`);
      setText("mentorValMedian", res.medianName);
      setText("mentorValVoice", res.voiceTitle);
      setText("mentorValVoiceBody", res.voiceBody);
      setText("mentorValVoiceMeta", res.voiceMeta);
      setText("mentorCardMaqamTitle", res.maqamTitle);
      setText("mentorCardMaqamBody", res.maqamBody);
      setText("mentorCardMaqamMeta", res.maqamMeta);
      renderMaqamRanking(res.maqamRanking);
      renderMaqamDebug(res.maqamDebug);
      renderMaqamDiagram(res.maqamTonicPc, res.maqamDegrees);
      const hero = document.querySelector("[data-mentor-hero]");
      if (hero) hero.style.setProperty("--mentor-mood-hue", String(hueFromMaqamId(res.maqamId)));
      setText("mentorHeroTimbre", `${res.timbreLabel} · ${res.medianName}`);
      setText("mentorStrVibratoTitle", res.vibratoLabel);
      setText("mentorStrVibratoBody", blurb(res.vibratoDetail, 140));
      setText("mentorStrTimbreTitle", res.timbreLabel);
      setText("mentorStrTimbreBody", blurb(res.timbreDetail, 140));
      setText("mentorStrTuneTitle", res.tuneTitle);
      setText("mentorStrTuneBody", blurb(res.tuneBody, 140));
      setText("mentorFocusLine", res.tuneBody);
      setText("mentorFocusSub", `${res.keysDetail} ${res.vibratoMeta}`.trim());
      setText("mentorCardGenreTitle", res.genreTitle);
      setText("mentorCardGenreBody", res.genreBody);
      renderGenrePills(res.genreBody);
      setMentorQualityRing(res.quality);
      setText("mentorCardTuneTitle", res.tuneTitle);
      setText("mentorCardTuneBody", res.tuneBody);
      setText("mentorCardTuneMeta", res.tuneMeta);
      setText("mentorCardTimbreTitle", res.timbreLabel);
      setText("mentorCardTimbreBody", res.timbreDetail);
      setText("mentorCardTimbreMeta", `Brightness index ~${res.brightMean}`);
      setText("mentorCardVibratoTitle", res.vibratoLabel);
      setText("mentorCardVibratoBody", res.vibratoDetail);
      setText("mentorCardVibratoMeta", `Avg melodic step ~${res.meanAbsC} cents between windows`);
      setText("mentorCardKeysTitle", "Key starting points");
      setText("mentorCardKeysBody", res.keysLine);
      setText("mentorCardKeysSub", res.keysDetail);
      setText("mentorCardQualityTitle", "Take quality (heuristic)");
      setText("mentorCardQualityScore", `${res.quality}/100`);
      setText(
        "mentorCardQualityBody",
        "Blends pitch steadiness, usable range in the clip, and presence. Re-record in a quiet room for a higher score.",
      );

      renderGauge(res.minM, res.maxM, res.medianM);
      const prevTake = loadMentorTakes()[0] || null;
      saveMentorTake(res);
      updateMentorTrendLine(res, prevTake);
      showResults(true);
    } catch (e) {
      try {
        console.warn("[mentor] result UI", e);
      } catch {}
      setText(
        "mentorStatus",
        `Analysis finished but the results panel hit an error: ${e?.message || e}. Try Start capture again.`,
      );
      showResults(true);
    }
  } finally {
    setMentorLiveUi(false);
    if (recordSession === _mentorRecSession) {
      if (btnStart) btnStart.disabled = false;
      if (btnStop) btnStop.disabled = true;
    }
  }
}

/**
 * Map pitch to arc: left = low, right = high.
 * `dispLo`–`dispHi` is the visible scale (padded from your robust min/max).
 * Range band = p5–p95; tick = median (p50).
 */
function renderGauge(minM, maxM, medM) {
  const L = 175;
  const rangePath = document.getElementById("mentorArcRange");
  const tickPath = document.getElementById("mentorArcMedian");
  const label = document.getElementById("mentorArcCaption");
  if (!label) return;

  const pad = Math.max(2.5, (maxM - minM) * 0.12);
  let dispLo = minM - pad;
  let dispHi = maxM + pad;
  if (dispHi - dispLo < 9) {
    const c = (minM + maxM) / 2;
    dispLo = c - 4.5;
    dispHi = c + 4.5;
  }
  dispLo = clamp(dispLo, 33, 92);
  dispHi = clamp(dispHi, 36, 96);
  if (dispHi - dispLo < 5) dispHi = dispLo + 5;

  const span = dispHi - dispLo;
  const tMin = clamp((minM - dispLo) / span, 0, 1);
  const tMax = clamp((maxM - dispLo) / span, 0, 1);
  const tMed = clamp((medM - dispLo) / span, 0, 1);

  if (rangePath) {
    const seg = Math.max(2, (tMax - tMin) * L * 0.96);
    const off = -tMin * L;
    rangePath.style.strokeDasharray = `${seg} ${L}`;
    rangePath.style.strokeDashoffset = String(off);
  }
  if (tickPath) {
    const w = 7;
    tickPath.style.strokeDasharray = `${w} ${L}`;
    tickPath.style.strokeDashoffset = String(-(tMed * L) + w / 2);
  }

  label.textContent = `${midiToName(minM)} → ${midiToName(maxM)}`;
}

export function initMentor() {
  const btnStart = document.getElementById("mentorBtnStart");
  const btnStop = document.getElementById("mentorBtnStop");
  if (!btnStart || !btnStop) return;
  if (btnStart.dataset.mentorInit === "1") return;
  btnStart.dataset.mentorInit = "1";

  const btnBack = document.getElementById("mentorBtnBackToLab");
  if (btnBack && !btnBack.dataset.mentorBound) {
    btnBack.dataset.mentorBound = "1";
    btnBack.addEventListener("click", () => {
      showResults(false);
      setText("mentorStatus", "");
    });
  }

  // "New test" — clear the report and drop back to the recording screen ready
  // to capture again (top-bar button + a CTA at the end of the long report).
  ["mentorBtnNewScan", "mentorBtnNewScanBottom"].forEach((id) => {
    const btn = document.getElementById(id);
    if (btn && !btn.dataset.mentorBound) {
      btn.dataset.mentorBound = "1";
      btn.addEventListener("click", () => {
        resetMentorSession();
        setText("mentorStatus", "");
        setText("mentorHint", "Open tips below if you want a quick checklist — then one slow glide.");
      });
    }
  });

  // Hidden developer toggle: tap the "Lab" title 7× fast to flip maqam debug.
  const labTitle = document.querySelector("#mentorLabMain .appScreenTitle");
  if (labTitle && !labTitle.dataset.mentorDebugBound) {
    labTitle.dataset.mentorDebugBound = "1";
    let taps = 0;
    let lastTap = 0;
    labTitle.addEventListener("click", () => {
      const now = Date.now();
      taps = now - lastTap < 800 ? taps + 1 : 1;
      lastTap = now;
      if (taps >= 7) {
        taps = 0;
        const on = !isMentorDebug();
        setMentorDebug(on);
        setText("mentorStatus", on ? "Maqam debug ON (internal)" : "Maqam debug OFF");
      }
    });
  }

  const btnClearHist = document.getElementById("mentorHistoryClear");
  if (btnClearHist && !btnClearHist.dataset.mentorBound) {
    btnClearHist.dataset.mentorBound = "1";
    btnClearHist.addEventListener("click", () => {
      if (!loadMentorTakes().length) return;
      const ok = typeof confirm === "function" ? confirm("Clear your saved take history on this device?") : true;
      if (ok) clearMentorTakes();
    });
  }

  renderMentorHistory();

  const refEl = document.getElementById("mentorVoiceRef");
  if (refEl && !refEl.dataset.mentorBound) {
    refEl.dataset.mentorBound = "1";
    try {
      const s = sessionStorage.getItem("mentor:voiceRef");
      if (s === "mens" || s === "womens" || s === "range") refEl.value = s;
    } catch {}
    refEl.addEventListener("change", () => {
      try {
        sessionStorage.setItem("mentor:voiceRef", refEl.value);
      } catch {}
      syncMentorVoiceCards();
    });
  }

  function syncMentorVoiceCards() {
    const sel = document.getElementById("mentorVoiceRef");
    if (!sel) return;
    const v = sel.value || "mens";
    document.querySelectorAll("[data-mentor-voice]").forEach((btn) => {
      btn.classList.toggle("isSelected", btn.getAttribute("data-mentor-voice") === v);
    });
  }

  syncMentorVoiceCards();
  document.querySelectorAll("[data-mentor-voice]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const v = btn.getAttribute("data-mentor-voice");
      if (!v || !refEl || refEl.value === v) return;
      refEl.value = v;
      try {
        sessionStorage.setItem("mentor:voiceRef", refEl.value);
      } catch {}
      syncMentorVoiceCards();
    });
  });

  btnStart.addEventListener("click", async () => {
    if (btnStart.disabled) return;
    bumpMentorRecSession();
    const recordSession = _mentorRecSession;
    resetMentorSession();

    if (!navigator.mediaDevices?.getUserMedia) {
      setText("mentorStatus", "Microphone capture needs HTTPS or the native app.");
      return;
    }

    setText("mentorStatus", "Requesting microphone access…");
    setText(
      "mentorHint",
      "Allow the mic if asked — then one slow glide. Range labels only change printed names.",
    );

    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: { ideal: false },
          noiseSuppression: { ideal: false },
          autoGainControl: { ideal: false },
        },
        video: false,
      });
    } catch (e1) {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      } catch (e2) {
        setText(
          "mentorStatus",
          `Microphone blocked or unavailable: ${e2?.message || e1?.message || e2 || e1}`,
        );
        return;
      }
    }

    if (recordSession !== _mentorRecSession) {
      try {
        stream.getTracks().forEach((t) => t.stop());
      } catch {}
      return;
    }

    if (typeof MediaRecorder === "undefined") {
      try {
        stream.getTracks().forEach((t) => t.stop());
      } catch {}
      setText("mentorStatus", "Recording is not supported in this browser.");
      return;
    }

    _stream = stream;
    _mentorChunks = [];
    const mimeType = pickMentorRecorderMimeType();
    const rec =
      mimeType && MediaRecorder.isTypeSupported?.(mimeType)
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);
    const effectiveMime = () => String(rec.mimeType || mimeType || "audio/webm");

    _mentorRecorder = rec;
    rec.ondataavailable = (e) => {
      if (e.data && e.data.size) _mentorChunks.push(e.data);
    };
    rec.onstop = async () => {
      await new Promise((r) => setTimeout(r, isSafariLikeMentorEnv() ? 120 : 40));
      if (recordSession !== _mentorRecSession) {
        setMentorLiveUi(false);
        return;
      }
      const chunks = _mentorChunks.slice();
      _mentorChunks.length = 0;
      await finalizeMentorRecording(chunks, effectiveMime(), recordSession);
    };

    try {
      if (isSafariLikeMentorEnv()) rec.start(250);
      else rec.start();
    } catch (e) {
      stopStreams();
      setText("mentorStatus", `Could not start recorder: ${e?.message || e}`);
      return;
    }

    _recording = true;
    _startedAt = performance.now();
    btnStart.disabled = true;
    btnStop.disabled = false;
    setMentorLiveUi(true);
    setText("mentorStatus", "Live · glide chest → head, then hold your top note briefly.");
    updateTimer();

    _mentorAutoStopTimer = window.setTimeout(() => {
      if (_recording && recordSession === _mentorRecSession) {
        try {
          btnStop.click();
        } catch {}
      }
    }, MAX_SECONDS * 1000);
  });

  btnStop.addEventListener("click", () => {
    if (!_recording || !_mentorRecorder) return;
    if (_mentorRecorder.state === "inactive") return;
    _recording = false;
    setMentorLiveUi(false);
    if (_raf) {
      cancelAnimationFrame(_raf);
      _raf = 0;
    }
    if (_mentorAutoStopTimer) {
      try {
        clearTimeout(_mentorAutoStopTimer);
      } catch {}
      _mentorAutoStopTimer = 0;
    }
    btnStop.disabled = true;
    try {
      _mentorRecorder.requestData?.();
    } catch {}
    try {
      _mentorRecorder.stop();
    } catch (e) {
      setText("mentorStatus", `Stop failed: ${e?.message || e}`);
      try {
        stopStreams();
      } catch {}
      btnStart.disabled = false;
    }
  });
}
