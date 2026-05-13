/**
 * Mentor — on-device voice snapshot (pitch motion, timbre brightness, key hints).
 * Audio is analyzed locally; nothing is uploaded by this module.
 */

const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const MAX_SECONDS = 22;
const MIN_SECONDS = 2;

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

/** YIN cumulative mean normalized difference (simplified port). */
function yinPitch(buffer, sampleRate, minHz = 70, maxHz = 1100) {
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

  const threshold = 0.15;
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
  const hop = 512;
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
  const minM = sorted[0];
  const maxM = sorted[sorted.length - 1];
  const medianM = sorted[Math.floor(sorted.length / 2)];
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

  const medianPc = ((Math.round(medianM) % 12) + 12) % 12;
  const k1 = NOTE_NAMES[medianPc];
  const kRel = NOTE_NAMES[(medianPc + 9) % 12];
  const kDom = NOTE_NAMES[(medianPc + 7) % 12];
  const relMin = NOTE_NAMES[((Math.round(minM) % 12) + 12) % 12];
  const relMax = NOTE_NAMES[((Math.round(maxM) % 12) + 12) % 12];

  const stability = Math.max(0, 100 - Math.min(60, meanAbsC) * 1.1);
  const rangeScore = Math.min(100, (maxM - minM) * 8);
  const quality = Math.round(
    Math.min(100, stability * 0.55 + rangeScore * 0.25 + Math.min(100, brightMean / 45)),
  );

  return {
    ok: true,
    minM,
    maxM,
    medianM,
    lowName: midiToName(minM),
    highName: midiToName(maxM),
    medianName: midiToName(medianM),
    spanSemitones: Math.round(maxM - minM),
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
  setText("mentorHint", "Hold a comfortable “ah” or glide gently through your range for 8–15 seconds.");
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

function renderGauge(minM, maxM, medM) {
  const arc = document.getElementById("mentorArcProgress");
  const label = document.getElementById("mentorArcCaption");
  if (!arc || !label) return;
  const lo = Math.max(36, Math.min(84, minM));
  const hi = Math.max(lo + 1, Math.min(90, maxM));
  const span = hi - lo;
  const t = span > 0 ? (Math.max(lo, Math.min(hi, medM)) - lo) / span : 0.5;
  const circumference = 175;
  arc.style.strokeDasharray = `${circumference * 0.52 * t} ${circumference}`;
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
    setText("mentorStatus", "Listening… one sustained vowel works best.");
    setText("mentorHint", "Tip: steady volume — avoid whispering.");
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
    setText("mentorValSpan", `${res.spanSemitones} semitones in this clip`);
    setText("mentorValMedian", res.medianName);
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
