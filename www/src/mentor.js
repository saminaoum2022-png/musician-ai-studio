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
 * 12-TET scale-degree sets (semitones from tonic) plus the characteristic lower
 * "jins" degrees that actually distinguish each maqam. Real Arabic intonation
 * uses quarter tones — this is a keyboard-style estimate for practice prompts,
 * not a full maqam analysis. `mult` lets us de-bias modes that over-match a
 * plain pitch-class overlap (notably Sikah, which used to win on any neutral
 * third / quarter-tone-ish note even without real Sikah tonic behavior).
 */
const MAQAM_CATALOG = [
  { id: "ajam", name: "‘Ajam", degrees: [0, 2, 4, 5, 7, 9, 11], jins: [0, 2, 4], mult: 1.0 },
  { id: "rast", name: "Rast", degrees: [0, 2, 4, 5, 7, 9, 10], jins: [0, 2, 4, 5], mult: 1.0 },
  { id: "nahawand", name: "Nahawand", degrees: [0, 2, 3, 5, 7, 8, 10], jins: [0, 2, 3, 7], mult: 1.0 },
  { id: "bayati", name: "Bayati", degrees: [0, 2, 3, 5, 7, 8, 10], jins: [0, 2, 3, 5], mult: 1.0 },
  { id: "kurd", name: "Kurd", degrees: [0, 1, 3, 5, 7, 8, 10], jins: [0, 1, 3], mult: 1.0 },
  { id: "hijaz", name: "Hijaz", degrees: [0, 1, 4, 5, 7, 8, 10], jins: [0, 1, 4], mult: 1.05 },
  { id: "saba", name: "Saba", degrees: [0, 2, 3, 4, 7, 8, 10], jins: [0, 2, 3, 4], mult: 1.0 },
  // Sikah: narrower template + a base de-bias. It only ranks high when its
  // tonic is clearly the most-sung note AND its characteristic jins is present.
  { id: "sikah", name: "Sikah", degrees: [0, 2, 4, 5, 7, 9, 11], jins: [0, 2, 4], mult: 0.78 },
];

const PC_LETTERS = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
function pcOf(m) {
  return ((Math.round(m) % 12) + 12) % 12;
}
function pcLetter(pc) {
  return PC_LETTERS[((pc % 12) + 12) % 12];
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
  const flush = () => {
    if (run.length >= minFrames) notes.push({ midi: medianOf(run), frames: run.length });
    run = [];
  };
  for (const m of f0s) {
    if (!Number.isFinite(m)) { flush(); continue; }
    if (!run.length) { run.push(m); continue; }
    const ref = run.length > 6 ? medianOf(run) : run[run.length - 1];
    if (Math.abs(m - ref) * 100 <= tolCents) run.push(m);
    else { flush(); run.push(m); }
  }
  flush();
  return notes;
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

  // Duration-weighted pitch-class profile (held longer = weighs more).
  const hist = new Array(12).fill(0);
  for (const n of stableNotes) hist[pcOf(n.midi)] += n.frames;
  const total = hist.reduce((a, b) => a + b, 0) || 1;
  const histN = hist.map((x) => x / total);
  const maxH = Math.max(...histN) || 1;

  // Tonic detection: most-sung note, nudged by the phrase's final note and its
  // lowest sustained note (both common resting points for the tonic).
  const lastPc = pcOf(stableNotes[stableNotes.length - 1].midi);
  const lowPc = pcOf(stableNotes.reduce((lo, n) => (n.midi < lo.midi ? n : lo), stableNotes[0]).midi);
  const tonicScore = (pc) => histN[pc] + (pc === lastPc ? 0.18 : 0) + (pc === lowPc ? 0.1 : 0);
  const tonicCands = Array.from({ length: 12 }, (_, pc) => pc)
    .filter((pc) => histN[pc] > 0)
    .sort((a, b) => tonicScore(b) - tonicScore(a))
    .slice(0, 3);

  const scoreFor = (tonic) =>
    MAQAM_CATALOG.map((m) => {
      const deg = new Set(m.degrees);
      let on = 0;
      for (let pc = 0; pc < 12; pc++) {
        const rel = (pc - tonic + 12) % 12;
        if (deg.has(rel)) on += histN[pc];
      }
      const base = clamp01(1.6 * on - 0.6); // ~0.8+ on-scale energy → strong
      const jinsCov = m.jins.filter((d) => histN[(tonic + d) % 12] > 0.03).length / m.jins.length;
      // How much the tonic dominates vs a flat 12-note spread (flat singing /
      // noise → ~0, so it lands in "Uncertain" instead of a confident guess).
      const tonicStr = clamp01((histN[tonic] * 12 - 1) / 3);
      let fit = clamp01(0.45 * base + 0.2 * jinsCov + 0.35 * tonicStr);
      let mult = m.mult;
      // Sikah only counts when its tonic genuinely dominates and its jins is fully present.
      if (m.id === "sikah" && !(tonicStr >= 0.6 && jinsCov >= 0.999)) mult *= 0.55;
      return { id: m.id, maqam: m.name, conf: Math.round(100 * clamp01(fit * mult)), tonic, degrees: [...m.degrees] };
    }).sort((a, b) => b.conf - a.conf);

  let best = null;
  for (const tonic of tonicCands) {
    const scored = scoreFor(tonic);
    if (!best || scored[0].conf > best.scored[0].conf) best = { tonic, scored };
  }

  const ranked = best.scored;
  const top = ranked[0];
  const second = ranked[1] || { conf: 0, maqam: "" };
  const third = ranked[2] || { conf: 0, maqam: "" };
  const gap = top.conf - second.conf;
  const isUncertain = top.conf < 45;
  let state;
  let kindLabel;
  if (isUncertain) { state = "uncertain"; kindLabel = "Uncertain"; }
  else if (gap < 6) { state = "possible"; kindLabel = "Possible Maqam"; }
  else if (top.conf >= 70 && gap >= 10) { state = "confident"; kindLabel = "Maqam"; }
  else { state = "likely"; kindLabel = "Likely Maqam"; }

  const tonicName = pcLetter(best.tonic);
  const alternatives = [second, third]
    .filter((x) => x && x.maqam)
    .map((x) => ({ maqam: x.maqam, id: x.id, confidence: x.conf }));

  let analysisNotes;
  if (isUncertain) {
    analysisNotes = `The phrase didn’t settle on one maqam — closest reads are ${top.maqam}, ${second.maqam || "—"} and ${third.maqam || "—"}. A slower, more resolved 10–15s line helps.`;
  } else if (state === "possible") {
    analysisNotes = `${top.maqam} and ${second.maqam} scored very close on this phrase — treat it as a possibility, not a final call.`;
  } else {
    analysisNotes = `Stable notes and interval movement around tonic ${tonicName} suggest ${top.maqam} more strongly than ${second.maqam || "the alternatives"}.`;
  }

  return {
    isUncertain,
    state,
    kindLabel,
    primaryMaqam: top.maqam,
    primaryId: top.id,
    confidence: top.conf,
    alternatives,
    top3: ranked.slice(0, 3).map((x) => ({ maqam: x.maqam, id: x.id, confidence: x.conf })),
    detectedTonicPc: best.tonic,
    detectedTonicName: tonicName,
    analysisNotes,
    degrees: top.degrees,
    tonicPc: best.tonic,
    stableCount: stableNotes.length,
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
  const maqamMeta = `Tonic ~${maqamRanking.detectedTonicName} · ranked from ${maqamRanking.stableCount} sustained notes (12-TET estimate)`;

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
