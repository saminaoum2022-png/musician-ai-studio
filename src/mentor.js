/**
 * Mentor — on-device voice snapshot (pitch motion, timbre brightness, key hints).
 * Audio is analyzed locally; nothing is uploaded by this module.
 */

const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const MAX_SECONDS = 22;
const MIN_SECONDS = 2;

/** Rough classical “fach” anchors in MIDI (low / mid / high of typical warm range). Not gender-deterministic. */
const VOICE_ARCHETYPES = [
  { name: "Bass", L: 41, M: 50, H: 62 },
  { name: "Baritone", L: 44, M: 54, H: 67 },
  { name: "Tenor", L: 47, M: 58, H: 72 },
  { name: "Contralto", L: 48, M: 56, H: 68 },
  { name: "Alto", L: 50, M: 59, H: 71 },
  { name: "Mezzo-soprano", L: 52, M: 62, H: 75 },
  { name: "Soprano", L: 54, M: 65, H: 79 },
];

let _audioCtx = null;
let _stream = null;
let _processor = null;
let _source = null;
let _silentGain = null;
let _samples = [];
let _startedAt = 0;
let _raf = 0;
let _recording = false;

function hzToMidi(hz) {
  if (!hz || hz <= 0 || !Number.isFinite(hz)) return NaN;
  return 69 + 12 * (Math.log(hz) / Math.LN2 - Math.log(440) / Math.LN2);
}

function midiToName(m) {
  if (!Number.isFinite(m)) return "—";
  const n = Math.round(m);
  const pc = ((n % 12) + 12) % 12;
  const oct = Math.floor(n / 12) - 1;
  return `${NOTE_NAMES[pc]}${oct}`;
}

function clamp(x, a, b) {
  return Math.max(a, Math.min(b, x));
}

function percentile(sorted, p) {
  if (!sorted.length) return NaN;
  if (sorted.length === 1) return sorted[0];
  const x = (sorted.length - 1) * clamp(p, 0, 1);
  const i0 = Math.floor(x);
  const i1 = Math.min(sorted.length - 1, i0 + 1);
  const w = x - i0;
  return sorted[i0] * (1 - w) + sorted[i1] * w;
}

function guessVoiceArchetype(p5, p50, p95) {
  const low = p5;
  const mid = p50;
  const high = p95;
  const scored = VOICE_ARCHETYPES.map((t) => ({
    t,
    d:
      Math.abs(low - t.L) +
      1.25 * Math.abs(mid - t.M) +
      1.05 * Math.abs(high - t.H),
  })).sort((a, b) => a.d - b.d);
  const best = scored[0]?.t?.name || "—";
  const second = scored[1]?.t?.name || "";
  let body = `Closest match in this clip: ${best}`;
  if (second && second !== best) body += ` — also near ${second}`;
  body +=
    ". True voice type depends on timbre, passaggio, and repertoire, not pitch alone; we only heard a short sample.";
  if (p95 >= 72 && p50 <= 58) {
    body +=
      " High peaks with a low center can be belt/mix or pitch-tracking quirks — try a steady bright “ee” on your top note.";
  }
  return {
    title: `${best}${second && second !== best ? ` · ${second}?` : ""}`,
    body,
    meta: `Based on notes ~${midiToName(p5)}–${midiToName(p95)} (robust range in this take)`,
  };
}

/**
 * 12-TET scale-degree sets (semitones from tonic). Real Arabic intonation uses
 * quarter tones — this is a keyboard-style guess for learning prompts only.
 */
const MAQAM_CATALOG = [
  { id: "kurd", name: "Kurd", degrees: [0, 1, 3, 5, 7, 8, 10] },
  { id: "hijaz", name: "Hijaz", degrees: [0, 1, 4, 5, 7, 8, 11] },
  { id: "nahawand", name: "Nahawand", degrees: [0, 2, 3, 5, 7, 8, 10] },
  { id: "rast", name: "Rast", degrees: [0, 2, 4, 5, 7, 9, 10] },
  { id: "bayati", name: "Bayati", degrees: [0, 3, 5, 6, 7, 9, 10] },
  { id: "sikah", name: "Sikah (approx.)", degrees: [0, 4, 5, 7, 9, 10, 11] },
  { id: "ajam", name: "‘Ajam", degrees: [0, 2, 4, 5, 7, 9, 11] },
  { id: "saba", name: "Saba", degrees: [0, 3, 5, 6, 7, 10, 11] },
];

function pitchClassHistogram(voiced) {
  const h = new Array(12).fill(0);
  for (const m of voiced) {
    const pc = ((Math.round(m) % 12) + 12) % 12;
    h[pc] += 1;
  }
  const s = h.reduce((a, b) => a + b, 0) || 1;
  return h.map((x) => x / s);
}

function scoreMaqamGuess(hist) {
  const all = [];
  for (const m of MAQAM_CATALOG) {
    for (let tonicPc = 0; tonicPc < 12; tonicPc++) {
      const on = new Set(m.degrees.map((d) => (tonicPc + d) % 12));
      let onScale = 0;
      let offScale = 0;
      for (let j = 0; j < 12; j++) {
        if (on.has(j)) onScale += hist[j];
        else offScale += hist[j];
      }
      const score = onScale - 0.33 * offScale;
      all.push({ score, id: m.id, name: m.name, tonicPc, degrees: [...m.degrees] });
    }
  }
  all.sort((a, b) => b.score - a.score);
  const best = all[0];
  const second = all.find((x) => x.id !== best.id) || { name: "", score: 0 };
  const ambiguous = second.score > 0 && best.score > 0 && second.score / best.score > 0.92;
  return {
    id: best.id,
    name: best.name,
    tonicPc: best.tonicPc,
    degrees: best.degrees,
    score: best.score,
    secondName: second.name || "",
    ambiguous,
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

function recommendGenres({ maqamId, voiceTitle, p95, brightMean }) {
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
  if (vt.includes("tenor") || vt.includes("baritone")) g.add("Male-fronted Arabic pop & khaleeji leads (where your tessitura fits)");
  if (vt.includes("soprano") || vt.includes("mezzo") || vt.includes("alto")) g.add("Female-fronted ballads & choral top lines");
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
  const k1 = NOTE_NAMES[medianPc];
  const kRel = NOTE_NAMES[(medianPc + 9) % 12];
  const kDom = NOTE_NAMES[(medianPc + 7) % 12];
  const relMin = NOTE_NAMES[((Math.round(p5) % 12) + 12) % 12];
  const relMax = NOTE_NAMES[((Math.round(p95) % 12) + 12) % 12];

  const stability = Math.max(0, 100 - Math.min(60, meanAbsC) * 1.1);
  const rangeScore = Math.min(100, (p95 - p5) * 8);
  const quality = Math.round(
    Math.min(100, stability * 0.55 + rangeScore * 0.25 + Math.min(100, brightMean / 45)),
  );

  const voice = guessVoiceArchetype(p5, p50, p95);
  const hist = pitchClassHistogram(voiced);
  const maqam = scoreMaqamGuess(hist);
  const tonicName = NOTE_NAMES[maqam.tonicPc];
  const rootMidi = alignRootMidi(p50, maqam.tonicPc);
  const tune = intonationVsMaqam(voiced, rootMidi, maqam.degrees);
  const genreLine = recommendGenres({ maqamId: maqam.id, voiceTitle: voice.title, p95, brightMean });

  let maqamBody = `Heuristic fit: ${maqam.name} on tonic ${tonicName} using a 12-note keyboard map — quarter tones & full ajnas are not modeled.`;
  if (maqam.secondName) maqamBody += ` Second guess: ${maqam.secondName}.`;
  if (maqam.ambiguous) maqamBody += " Several maqamat scored similarly — clearer phrases help disambiguate.";

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
    spanHint: `Raw span in clip ${midiToName(minRaw)}–${midiToName(maxRaw)} (includes outliers)`,
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
    maqamTitle: `${maqam.name} on ${tonicName}`,
    maqamBody,
    maqamMeta: "Pitch-class histogram vs maqam templates (educational only)",
    genreTitle: "Genres that may fit",
    genreBody: genreLine,
    tuneTitle: tune.title,
    tuneBody: tune.body,
    tuneMeta: tune.meta,
  };
}

function mergeSamples() {
  const total = _samples.reduce((n, a) => n + a.length, 0);
  const out = new Float32Array(total);
  let o = 0;
  for (const a of _samples) {
    out.set(a, o);
    o += a.length;
  }
  return out;
}

function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

function showResults(on) {
  const wrap = document.getElementById("mentorResults");
  if (wrap) wrap.hidden = !on;
}

export function resetMentorSession() {
  showResults(false);
  setText("mentorStatus", "");
  const t = document.getElementById("mentorTimer");
  if (t) t.textContent = "";
  setText(
    "mentorHint",
    "Glide chest to head on “ah” or “ee”, stay close to the mic, and hold top notes 1–2s so highs register.",
  );
  setText("mentorValVoice", "—");
  setText("mentorValVoiceBody", "");
  setText("mentorValVoiceMeta", "");
  setText("mentorCardMaqamTitle", "Maqam guess");
  setText("mentorCardMaqamBody", "");
  setText("mentorCardMaqamMeta", "");
  setText("mentorCardGenreTitle", "Genres that may fit");
  setText("mentorCardGenreBody", "");
  setText("mentorCardTuneTitle", "Intonation");
  setText("mentorCardTuneBody", "");
  setText("mentorCardTuneMeta", "");
}

function stopStreams() {
  try {
    if (_processor) {
      _processor.disconnect();
      _processor.onaudioprocess = null;
    }
  } catch {}
  try {
    if (_source) _source.disconnect();
  } catch {}
  try {
    if (_silentGain) _silentGain.disconnect();
  } catch {}
  _processor = null;
  _source = null;
  _silentGain = null;
  if (_stream) {
    _stream.getTracks().forEach((tr) => {
      try {
        tr.stop();
      } catch {}
    });
  }
  _stream = null;
  if (_audioCtx) {
    try {
      _audioCtx.close();
    } catch {}
  }
  _audioCtx = null;
  _samples = [];
  _recording = false;
  if (_raf) {
    cancelAnimationFrame(_raf);
    _raf = 0;
  }
}

function updateTimer() {
  const el = document.getElementById("mentorTimer");
  if (!el || !_recording) return;
  const sec = (performance.now() - _startedAt) / 1000;
  el.textContent = `${sec.toFixed(1)}s`;
  _raf = requestAnimationFrame(updateTimer);
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

  btnStart.addEventListener("click", async () => {
    resetMentorSession();
    showResults(false);
    stopStreams();
    _samples = [];
    try {
      _stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
        video: false,
      });
    } catch (e) {
      setText("mentorStatus", `Microphone blocked or unavailable: ${e?.message || e}`);
      return;
    }

    _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    try {
      await _audioCtx.resume();
    } catch {}

    _source = _audioCtx.createMediaStreamSource(_stream);
    const bufferSize = 4096;
    _processor = _audioCtx.createScriptProcessor(bufferSize, 1, 1);
    const maxSamples = Math.floor(MAX_SECONDS * _audioCtx.sampleRate);

    _processor.onaudioprocess = (ev) => {
      if (!_recording) return;
      const ch = ev.inputBuffer.getChannelData(0);
      const copy = new Float32Array(ch.length);
      copy.set(ch);
      _samples.push(copy);
      let total = 0;
      for (const a of _samples) total += a.length;
      if (total >= maxSamples) {
        btnStop.click();
      }
    };

    _silentGain = _audioCtx.createGain();
    _silentGain.gain.value = 0;
    _source.connect(_processor);
    _processor.connect(_silentGain);
    _silentGain.connect(_audioCtx.destination);

    _recording = true;
    _startedAt = performance.now();
    btnStart.disabled = true;
    btnStop.disabled = false;
    setText("mentorStatus", "Listening… glide low to high and hold your top note briefly.");
    setText("mentorHint", "Tip: bright vowel (“ee”, “ah”) helps the tracker catch highs.");
    updateTimer();
  });

  btnStop.addEventListener("click", () => {
    if (!_recording && _samples.length === 0) return;

    _recording = false;
    if (_raf) cancelAnimationFrame(_raf);
    _raf = 0;
    btnStart.disabled = false;
    btnStop.disabled = true;

    const buf = mergeSamples();
    const sr = _audioCtx ? _audioCtx.sampleRate : 48000;
    const dur = buf.length / sr;
    stopStreams();

    if (!buf.length) {
      setText("mentorStatus", "");
      return;
    }

    if (dur < MIN_SECONDS) {
      setText("mentorStatus", `Keep going a bit longer (at least ~${MIN_SECONDS}s).`);
      return;
    }

    setText("mentorStatus", "Analyzing…");
    const res = analyzeBuffer(buf, sr);
    if (!res.ok) {
      setText("mentorStatus", res.reason);
      return;
    }

    setText("mentorStatus", "Snapshot ready — see below.");
    setText("mentorValRange", `${res.lowName} – ${res.highName}`);
    setText("mentorValSpan", `${res.spanSemitones} semitones (robust) · ${res.spanHint}`);
    setText("mentorValMedian", res.medianName);
    setText("mentorValVoice", res.voiceTitle);
    setText("mentorValVoiceBody", res.voiceBody);
    setText("mentorValVoiceMeta", res.voiceMeta);
    setText("mentorCardMaqamTitle", res.maqamTitle);
    setText("mentorCardMaqamBody", res.maqamBody);
    setText("mentorCardMaqamMeta", res.maqamMeta);
    setText("mentorCardGenreTitle", res.genreTitle);
    setText("mentorCardGenreBody", res.genreBody);
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
  });
}
