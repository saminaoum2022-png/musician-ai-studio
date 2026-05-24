/**
 * Subtle offline vocal polish for Echo — no robotic autotune, preset-driven only.
 */
import { encodeWav16 } from "./wav.js";

export const ECHO_TONE_IDS = ["raw", "soft", "dreamy"];
export const ECHO_TONE_DEFAULT = "soft";

/** @type {Record<string, object>} */
const PRESETS = {
  raw: {
    highpass: 72,
    lowShelfGain: 0.4,
    presenceGain: 1,
    airGain: -0.6,
    compThreshold: -20,
    compKnee: 10,
    compRatio: 2,
    compAttack: 0.007,
    compRelease: 0.16,
    reverbMix: 0,
    doublerMix: 0,
  },
  soft: {
    highpass: 86,
    lowShelfGain: 2.4,
    presenceGain: 2.6,
    airGain: 1,
    compThreshold: -27,
    compKnee: 14,
    compRatio: 2.6,
    compAttack: 0.004,
    compRelease: 0.24,
    reverbMix: 0.11,
    delayTime: 0.036,
    delayFeedback: 0.2,
    delayLp: 4400,
    doublerMix: 0.07,
  },
  dreamy: {
    highpass: 92,
    lowShelfGain: 1.6,
    presenceGain: 2,
    airGain: 2.4,
    compThreshold: -30,
    compKnee: 16,
    compRatio: 2.9,
    compAttack: 0.005,
    compRelease: 0.3,
    reverbMix: 0.2,
    delayTime: 0.052,
    delayFeedback: 0.32,
    delayLp: 3400,
    doublerMix: 0.12,
  },
};

function normalizeToneId(tone) {
  const id = String(tone || "").trim().toLowerCase();
  return ECHO_TONE_IDS.includes(id) ? id : ECHO_TONE_DEFAULT;
}

function connectDynamics(offline, input, preset) {
  const comp = offline.createDynamicsCompressor();
  comp.threshold.value = preset.compThreshold;
  comp.knee.value = preset.compKnee;
  comp.ratio.value = preset.compRatio;
  comp.attack.value = preset.compAttack;
  comp.release.value = preset.compRelease;
  input.connect(comp);
  return comp;
}

function connectEq(offline, input, preset) {
  let node = input;
  const hp = offline.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = preset.highpass;
  hp.Q.value = 0.7;
  node.connect(hp);
  node = hp;

  const ls = offline.createBiquadFilter();
  ls.type = "lowshelf";
  ls.frequency.value = 260;
  ls.gain.value = preset.lowShelfGain;
  node.connect(ls);
  node = ls;

  const peak = offline.createBiquadFilter();
  peak.type = "peaking";
  peak.frequency.value = 3100;
  peak.Q.value = 0.85;
  peak.gain.value = preset.presenceGain;
  node.connect(peak);
  node = peak;

  const hs = offline.createBiquadFilter();
  hs.type = "highshelf";
  hs.frequency.value = 7800;
  hs.gain.value = preset.airGain;
  node.connect(hs);
  node = hs;

  return node;
}

function connectSpace(offline, input, preset) {
  const mix = Math.max(0, Math.min(0.35, Number(preset.reverbMix) || 0));
  if (mix <= 0.001) {
    input.connect(offline.destination);
    return;
  }
  const dry = offline.createGain();
  dry.gain.value = 1 - mix * 0.85;
  const wet = offline.createGain();
  wet.gain.value = mix;

  const delay = offline.createDelay(0.12);
  delay.delayTime.value = preset.delayTime || 0.04;
  const fb = offline.createGain();
  fb.gain.value = preset.delayFeedback || 0.2;
  const lp = offline.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = preset.delayLp || 4000;

  input.connect(dry);
  input.connect(delay);
  delay.connect(lp);
  lp.connect(fb);
  fb.connect(delay);
  delay.connect(wet);
  dry.connect(offline.destination);
  wet.connect(offline.destination);
}

function connectDoubler(offline, input, preset) {
  const mix = Math.max(0, Math.min(0.2, Number(preset.doublerMix) || 0));
  if (mix <= 0.001) return input;
  const dry = offline.createGain();
  dry.gain.value = 1 - mix;
  const wet = offline.createGain();
  wet.gain.value = mix;
  const delay = offline.createDelay(0.03);
  delay.delayTime.value = 0.011;
  const detuneFilter = offline.createBiquadFilter();
  detuneFilter.type = "peaking";
  detuneFilter.frequency.value = 1800;
  detuneFilter.gain.value = 0.6;
  detuneFilter.Q.value = 0.5;

  input.connect(dry);
  input.connect(delay);
  delay.connect(detuneFilter);
  detuneFilter.connect(wet);
  const merge = offline.createGain();
  merge.gain.value = 1;
  dry.connect(merge);
  wet.connect(merge);
  return merge;
}

/**
 * Apply Echo Tone polish and return a WAV blob (upload-friendly).
 * @param {Blob} blob
 * @param {string} tone
 * @returns {Promise<Blob>}
 */
export async function applyEchoTone(blob, tone = ECHO_TONE_DEFAULT) {
  if (!blob?.size) return blob;
  const preset = PRESETS[normalizeToneId(tone)] || PRESETS[ECHO_TONE_DEFAULT];
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return blob;

  const decodeCtx = new Ctx();
  let audioBuffer;
  try {
    const ab = await blob.arrayBuffer();
    audioBuffer = await decodeCtx.decodeAudioData(ab.slice(0));
  } catch {
    try {
      await decodeCtx.close();
    } catch {}
    return blob;
  }
  try {
    await decodeCtx.close();
  } catch {}

  const channels = Math.min(2, Math.max(1, audioBuffer.numberOfChannels));
  const length = audioBuffer.length;
  const sampleRate = audioBuffer.sampleRate;
  const offline = new OfflineAudioContext(channels, length, sampleRate);
  const src = offline.createBufferSource();
  src.buffer = audioBuffer;

  let chain = src;
  chain = connectEq(offline, chain, preset);
  chain = connectDoubler(offline, chain, preset) || chain;
  chain = connectDynamics(offline, chain, preset);
  connectSpace(offline, chain, preset);

  src.start(0);
  const rendered = await offline.startRendering();
  const ch0 = rendered.getChannelData(0);
  const ch1 = channels > 1 ? rendered.getChannelData(1) : null;
  const out = ch1 ? [ch0, ch1] : [ch0];
  return new Blob([encodeWav16(out, sampleRate)], { type: "audio/wav" });
}

export function echoToneLabel(tone) {
  const id = normalizeToneId(tone);
  if (id === "raw") return "Raw";
  if (id === "dreamy") return "Dreamy";
  return "Soft";
}
