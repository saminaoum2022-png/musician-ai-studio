/**
 * Echo Suggest — cheap, signal-based beat picker for voice recordings.
 *
 * Extracts 5 features from the recorded AudioBuffer (no ML, no network),
 * runs them through a hand-tuned decision tree, and returns a beat id +
 * speed + a short user-facing reason. ~50–200ms on a phone.
 *
 * Features:
 *   - rms         Mean RMS energy. Whisper/quiet vs projected/loud.
 *   - zcr         Zero-crossing rate. Darkness/warmth vs brightness.
 *   - drange      (p90 - p20) of frame-RMS. Flat vs expressive.
 *   - onset       Significant local peaks in frame-RMS per second.
 *                 Sparse (sustained / lyrical) vs dense (rapid / rhythmic).
 *   - pitchVar    Std-dev of per-frame autocorrelation f0 (cents-ish).
 *                 Narrow (monotone) vs wide (emotional).
 */

const FRAME_MS = 30;
const VOICED_RMS_FLOOR = 0.012;
const VOICE_PITCH_LO = 70;
const VOICE_PITCH_HI = 500;

function meanRms(channel) {
  let sumSq = 0;
  for (let i = 0; i < channel.length; i++) sumSq += channel[i] * channel[i];
  return Math.sqrt(sumSq / Math.max(1, channel.length));
}

function zeroCrossRate(channel) {
  let crossings = 0;
  for (let i = 1; i < channel.length; i++) {
    if ((channel[i - 1] >= 0) !== (channel[i] >= 0)) crossings++;
  }
  return crossings / channel.length;
}

function frameStats(channel, sampleRate) {
  const frameLen = Math.max(64, Math.floor((sampleRate * FRAME_MS) / 1000));
  const frames = [];
  for (let i = 0; i < channel.length; i += frameLen) {
    const end = Math.min(channel.length, i + frameLen);
    let s = 0;
    let n = 0;
    for (let j = i; j < end; j++) {
      s += channel[j] * channel[j];
      n++;
    }
    frames.push({ start: i, len: end - i, rms: Math.sqrt(s / Math.max(1, n)) });
  }
  return { frames, frameLen };
}

function dynamicRange(frames) {
  const sorted = frames.map((f) => f.rms).sort((a, b) => a - b);
  if (!sorted.length) return 0;
  const p20 = sorted[Math.floor(sorted.length * 0.2)] || 0;
  const p90 = sorted[Math.floor(sorted.length * 0.9)] || 0;
  return Math.max(0, p90 - p20);
}

function onsetDensity(frames, durationSec) {
  if (frames.length < 4) return 0;
  let onsets = 0;
  const smoothed = frames.map((f, i) => {
    const prev = frames[i - 1]?.rms ?? f.rms;
    return f.rms * 0.7 + prev * 0.3;
  });
  for (let i = 2; i < smoothed.length - 1; i++) {
    const cur = smoothed[i];
    const prev = smoothed[i - 1];
    const next = smoothed[i + 1];
    const lookback = smoothed[i - 2];
    if (cur > prev && cur >= next && cur > lookback * 1.45 && cur > 0.025) {
      onsets++;
    }
  }
  return onsets / Math.max(0.5, durationSec);
}

/**
 * Per-frame autocorrelation pitch (very cheap). Returns std-dev (Hz)
 * across voiced frames only.
 */
function pitchVariance(channel, sampleRate, frames) {
  const voiced = frames.filter((f) => f.rms > VOICED_RMS_FLOOR);
  if (voiced.length < 6) return 0;
  const minLag = Math.floor(sampleRate / VOICE_PITCH_HI);
  const maxLag = Math.floor(sampleRate / VOICE_PITCH_LO);
  const pitches = [];
  for (const f of voiced) {
    const buf = channel.subarray(f.start, f.start + f.len);
    let bestLag = 0;
    let bestCorr = 0;
    for (let lag = minLag; lag <= maxLag && lag < buf.length; lag++) {
      let corr = 0;
      const N = buf.length - lag;
      for (let i = 0; i < N; i++) corr += buf[i] * buf[i + lag];
      if (corr > bestCorr) {
        bestCorr = corr;
        bestLag = lag;
      }
    }
    if (bestLag > 0 && bestCorr > 0.001) {
      pitches.push(sampleRate / bestLag);
    }
  }
  if (pitches.length < 4) return 0;
  const mean = pitches.reduce((a, b) => a + b, 0) / pitches.length;
  const variance =
    pitches.reduce((a, b) => a + (b - mean) * (b - mean), 0) / pitches.length;
  return Math.sqrt(variance);
}

function analyseVoice(audioBuffer) {
  const ch = audioBuffer.getChannelData(0);
  const sr = audioBuffer.sampleRate;
  const duration = audioBuffer.duration;
  const rms = meanRms(ch);
  const zcr = zeroCrossRate(ch);
  const { frames } = frameStats(ch, sr);
  const drange = dynamicRange(frames);
  const onset = onsetDensity(frames, duration);
  const pitchVar = pitchVariance(ch, sr, frames);
  return { rms, zcr, drange, onset, pitchVar, duration };
}

/**
 * Pick a beat id from the analysed features. Uses a scored-vote system
 * (each beat gets a score based on how well features match its ideal
 * profile, plus a small random tilt to break near-ties so two similar
 * voices don't always land on the exact same loop).
 *
 * Tuned for the typical voice ranges observed on phone mics:
 *   rms      ≈ 0.02–0.20 (whisper to loud)
 *   zcr      ≈ 0.03–0.18 (warm/dark to bright/sibilant)
 *   drange   ≈ 0.01–0.20 (flat narration to dynamic singing)
 *   onset    ≈ 0.5–6/s   (sustained vowels to rapid speech)
 *   pitchVar ≈ 10–200 Hz (monotone to wide melodic range)
 */
function pickBeatFromFeatures(f) {
  const { rms, zcr, drange, onset, pitchVar } = f;

  const isWhisper = rms < 0.028;
  const isQuiet = rms < 0.055;
  const isLoud = rms > 0.13;

  const isFlat = drange < 0.035;
  const isDynamic = drange > 0.09;

  const isWarm = zcr < 0.07;
  const isBright = zcr > 0.11;

  const isMonotone = pitchVar < 28;
  const isMelodic = pitchVar > 75;

  const isSparse = onset < 1.3;
  const isRapid = onset > 2.6;

  // Build a score for each beat. Higher = better match.
  const scores = {
    ambient: 0,
    piano: 0,
    lofi: 0,
    oud: 0,
    soul: 0,
    eight08: 0,
  };

  // Ambient — whisper-quiet, flat, sparse
  if (isWhisper) scores.ambient += 5;
  if (isQuiet) scores.ambient += 2;
  if (isFlat) scores.ambient += 2;
  if (isSparse) scores.ambient += 1.5;
  if (isMonotone) scores.ambient += 1;

  // Piano — calm steady narration: not loud, monotone, sparse, no dynamics
  if (isMonotone) scores.piano += 3;
  if (isSparse) scores.piano += 2.5;
  if (isFlat) scores.piano += 2;
  if (!isLoud && !isQuiet) scores.piano += 1;
  if (isBright) scores.piano += 0.5;

  // Lo-fi — chill mid-energy conversational baseline. Generous catcher
  // so it doesn't only fire as a fallback.
  if (rms >= 0.04 && rms <= 0.12) scores.lofi += 2.5;
  if (drange >= 0.03 && drange <= 0.09) scores.lofi += 2;
  if (pitchVar >= 25 && pitchVar <= 75) scores.lofi += 1.5;
  if (onset >= 1.2 && onset <= 2.6) scores.lofi += 1.5;

  // Oud — warm dark voice + wide pitch range (sung/expressive Arabic-leaning)
  if (isWarm) scores.oud += 2.5;
  if (isMelodic) scores.oud += 3;
  if (drange > 0.04) scores.oud += 1;
  if (rms < 0.13) scores.oud += 0.5;

  // Soul — dynamic & emotional. Wide drange is the key, not just pitch.
  if (isDynamic) scores.soul += 4;
  if (pitchVar > 50) scores.soul += 2;
  if (rms > 0.07) scores.soul += 1;
  if (!isMonotone) scores.soul += 0.5;

  // 808 — energetic, rapid, projected
  if (isRapid) scores.eight08 += 3.5;
  if (isLoud) scores.eight08 += 2.5;
  if (isBright) scores.eight08 += 1;
  if (onset > 2.0 && rms > 0.09) scores.eight08 += 1.5;

  // Small random tilt (0–0.6) so near-ties pick different beats across
  // sessions. Keeps it deterministic-ish but adds variety.
  for (const k of Object.keys(scores)) {
    scores[k] += Math.random() * 0.6;
  }

  let bestId = "lofi";
  let bestScore = -Infinity;
  for (const [k, v] of Object.entries(scores)) {
    if (v > bestScore) {
      bestScore = v;
      bestId = k;
    }
  }

  const reasons = {
    ambient: "Soft, whispered voice → Ambient",
    piano: "Calm, steady voice → Piano",
    lofi: "Chill, mid-energy vibe → Lo-fi",
    oud: "Warm, expressive tone → Oud",
    soul: "Expressive & dynamic → Soul",
    eight08: "Energetic, rhythmic delivery → 808",
  };
  return { beatId: bestId, reason: reasons[bestId], scores };
}

function pickSpeedFromFeatures(f) {
  if (f.onset >= 3.2 || f.rms > 0.16) return "fast";
  if (f.onset < 1.0 && f.drange < 0.04) return "slowed";
  return "normal";
}

async function decodeBlobToBuffer(blob) {
  if (!blob?.size) return null;
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return null;
  const ctx = new Ctx();
  try {
    const ab = await blob.arrayBuffer();
    return await ctx.decodeAudioData(ab.slice(0));
  } catch {
    return null;
  } finally {
    try {
      await ctx.close();
    } catch {}
  }
}

/**
 * Analyse a decoded AudioBuffer and recommend a beat.
 * @param {AudioBuffer} audioBuffer
 * @returns {{ beatId: string, variant: number, speed: string, reason: string, features: object } | null}
 */
export function suggestEchoBeatFromBuffer(audioBuffer) {
  if (!audioBuffer || audioBuffer.duration < 0.4) return null;
  const features = analyseVoice(audioBuffer);
  const pick = pickBeatFromFeatures(features);
  const speed = pickSpeedFromFeatures(features);
  const variant = Math.floor(Math.random() * 2);
  // Debug — visible in the WebView inspector. Helps tune cutoffs from
  // real-world voice samples without showing numbers to the user.
  try {
    // eslint-disable-next-line no-console
    console.log("[echo-suggest]", {
      pick: pick.beatId,
      speed,
      rms: features.rms.toFixed(3),
      zcr: features.zcr.toFixed(3),
      drange: features.drange.toFixed(3),
      onset: features.onset.toFixed(2),
      pitchVar: features.pitchVar.toFixed(1),
      scores: pick.scores,
    });
  } catch {}
  return {
    beatId: pick.beatId,
    variant,
    speed,
    reason: pick.reason,
    features,
  };
}

/**
 * Analyse a Blob (decodes via WebAudio internally).
 * @param {Blob} blob
 * @returns {Promise<ReturnType<typeof suggestEchoBeatFromBuffer> | null>}
 */
export async function suggestEchoBeatFromBlob(blob) {
  const buf = await decodeBlobToBuffer(blob);
  if (!buf) return null;
  return suggestEchoBeatFromBuffer(buf);
}
