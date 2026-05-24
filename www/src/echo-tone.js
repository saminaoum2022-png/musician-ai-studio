/**
 * Echo Tone — velvety late-night condenser polish + natural pitch stabilization.
 * Warm, soft, intimate — not podcast-crisp or heavily compressed.
 */
import {
  applyNaturalPitchStabilization,
  isLikelyHumOrSingBuffer,
} from "./echo-pitch-stabilize.js";

export const ECHO_TONE_IDS = ["raw", "natural", "dreamy"];
export const ECHO_TONE_DEFAULT = "natural";
export const ECHO_UPLOAD_MAX_BYTES = 480 * 1024;
const ECHO_RENDER_SAMPLE_RATE = 44100;
/** Gentle loudness target — avoids “squashed loud” feel */
const TARGET_RMS = 0.064;

/**
 * @typedef {object} EchoTonePreset
 * @property {number} highpass
 * @property {number} rumbleCutGain
 * @property {number} lowShelfGain
 * @property {number} mudCutGain
 * @property {number} harshMidCutGain
 * @property {number} bodyGain
 * @property {number} presenceGain
 * @property {number} phoneCutGain
 * @property {number} deEssThreshold
 * @property {number} deEssRatio
 * @property {number} compThreshold
 * @property {number} compRatio
 * @property {number} compAttack
 * @property {number} compRelease
 * @property {number} reverbMix
 * @property {number} [delayTime]
 * @property {number} [delayFeedback]
 * @property {number} [delayLp]
 * @property {number} noiseGateFloor
 * @property {number} noiseReduceAmount
 * @property {number} tonalBlendMix
 * @property {number} warmthDrive
 * @property {number} pitchStrength
 * @property {number} [pitchMaxCents]
 * @property {number} [velvetLp]
 * @property {number} [transientSoft]
 * @property {number} [headroom]
 */

/** @type {Record<string, EchoTonePreset>} */
const PRESETS = {
  raw: {
    highpass: 72,
    rumbleCutGain: -1.2,
    lowShelfGain: 0.6,
    mudCutGain: -0.5,
    harshMidCutGain: -0.6,
    bodyGain: 0.5,
    presenceGain: -0.4,
    phoneCutGain: -0.9,
    deEssThreshold: -14,
    deEssRatio: 1.6,
    compThreshold: -16,
    compRatio: 1.25,
    compAttack: 0.02,
    compRelease: 0.45,
    reverbMix: 0,
    noiseGateFloor: 0.004,
    noiseReduceAmount: 0,
    tonalBlendMix: 0,
    warmthDrive: 0,
    pitchStrength: 0,
    pitchMaxCents: 0,
    velvetLp: 11500,
    transientSoft: 0,
    headroom: 0.92,
  },
  natural: {
    highpass: 66,
    rumbleCutGain: -1,
    lowShelfGain: 1.55,
    mudCutGain: -0.7,
    harshMidCutGain: -1.4,
    bodyGain: 1,
    presenceGain: -1.2,
    phoneCutGain: -1.6,
    deEssThreshold: -16,
    deEssRatio: 1.42,
    compThreshold: -21,
    compRatio: 1.14,
    compAttack: 0.028,
    compRelease: 0.62,
    reverbMix: 0.035,
    delayTime: 0.028,
    delayFeedback: 0.06,
    delayLp: 1850,
    noiseGateFloor: 0.003,
    noiseReduceAmount: 0,
    tonalBlendMix: 0.032,
    warmthDrive: 0,
    pitchStrength: 0.055,
    pitchMaxCents: 10,
    velvetLp: 9400,
    transientSoft: 0.08,
    headroom: 0.9,
  },
  dreamy: {
    highpass: 68,
    rumbleCutGain: -0.8,
    lowShelfGain: 1.2,
    mudCutGain: -0.6,
    harshMidCutGain: -1,
    bodyGain: 0.7,
    presenceGain: -0.5,
    phoneCutGain: -1.2,
    deEssThreshold: -15,
    deEssRatio: 1.7,
    compThreshold: -18,
    compRatio: 1.28,
    compAttack: 0.02,
    compRelease: 0.48,
    reverbMix: 0.13,
    delayTime: 0.052,
    delayFeedback: 0.12,
    delayLp: 2600,
    studioSlapMix: 0.035,
    noiseGateFloor: 0.003,
    noiseReduceAmount: 0,
    tonalBlendMix: 0.048,
    warmthDrive: 0,
    pitchStrength: 0.09,
    pitchMaxCents: 12,
    velvetLp: 9800,
    transientSoft: 0,
    headroom: 0.88,
  },
};

function normalizeToneId(tone) {
  let id = String(tone || "").trim().toLowerCase();
  if (id === "soft" || id === "clean") id = "natural";
  return ECHO_TONE_IDS.includes(id) ? id : ECHO_TONE_DEFAULT;
}

function pickEchoRecorderMime(pickMime) {
  const preferred = typeof pickMime === "function" ? pickMime() : "";
  const candidates = [
    preferred,
    "audio/mp4",
    "audio/mp4;codecs=mp4a.40.2",
    "audio/webm;codecs=opus",
    "audio/webm",
  ].filter(Boolean);
  for (const m of candidates) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported?.(m)) return m;
  }
  return "";
}

/** Rumble / room mud cleanup before tone shaping */
function connectBackgroundCleanup(offline, input, preset) {
  let node = input;
  const hp = offline.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = preset.highpass;
  hp.Q.value = 0.4;
  node.connect(hp);
  node = hp;

  const rumble = offline.createBiquadFilter();
  rumble.type = "lowshelf";
  rumble.frequency.value = 95;
  rumble.gain.value = preset.rumbleCutGain;
  node.connect(rumble);
  node = rumble;

  return node;
}

function connectWarmth(offline, input, drive) {
  const d = Math.max(0, Math.min(0.1, Number(drive) || 0));
  if (d <= 0.001) return input;
  const shaper = offline.createWaveShaper();
  const curve = new Float32Array(256);
  for (let i = 0; i < 256; i++) {
    const x = (i / 128 - 1) * (1 + d * 1.6);
    curve[i] = Math.tanh(x) / Math.tanh(1 + d * 1.6);
  }
  shaper.curve = curve;
  shaper.oversample = "2x";
  input.connect(shaper);
  return shaper;
}

/** Velvety condenser EQ — body, no podcast brightness */
function connectInterviewEq(offline, input, preset) {
  let node = input;

  const lowShelf = offline.createBiquadFilter();
  lowShelf.type = "lowshelf";
  lowShelf.frequency.value = 142;
  lowShelf.gain.value = preset.lowShelfGain;
  node.connect(lowShelf);
  node = lowShelf;

  const mud = offline.createBiquadFilter();
  mud.type = "peaking";
  mud.frequency.value = 340;
  mud.Q.value = 0.9;
  mud.gain.value = preset.mudCutGain;
  node.connect(mud);
  node = mud;

  const body = offline.createBiquadFilter();
  body.type = "peaking";
  body.frequency.value = 248;
  body.Q.value = 0.55;
  body.gain.value = preset.bodyGain;
  node.connect(body);
  node = body;

  const harsh = offline.createBiquadFilter();
  harsh.type = "peaking";
  harsh.frequency.value = 2900;
  harsh.Q.value = 0.75;
  harsh.gain.value = preset.harshMidCutGain;
  node.connect(harsh);
  node = harsh;

  const phone = offline.createBiquadFilter();
  phone.type = "peaking";
  phone.frequency.value = 5200;
  phone.Q.value = 0.65;
  phone.gain.value = preset.phoneCutGain;
  node.connect(phone);
  node = phone;

  const presence = offline.createBiquadFilter();
  presence.type = "peaking";
  if (Math.abs(preset.presenceGain) > 0.05) {
    const presence = offline.createBiquadFilter();
    presence.type = "peaking";
    presence.frequency.value = 2400;
    presence.Q.value = 0.45;
    presence.gain.value = preset.presenceGain;
    node.connect(presence);
    node = presence;
  }

  const air = offline.createBiquadFilter();
  air.type = "highshelf";
  air.frequency.value = 7500;
  air.gain.value = -2.4;
  node.connect(air);
  node = air;

  const sibilance = offline.createBiquadFilter();
  sibilance.type = "peaking";
  sibilance.frequency.value = 6800;
  sibilance.Q.value = 0.5;
  sibilance.gain.value = -1.6;
  node.connect(sibilance);
  node = sibilance;

  return connectWarmth(offline, node, preset.warmthDrive);
}

function connectDeEsser(offline, input, preset) {
  const dry = offline.createGain();
  dry.gain.value = 0.975;
  const wet = offline.createGain();
  wet.gain.value = 0.025;

  const hp = offline.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = 6500;
  hp.Q.value = 0.3;

  const ess = offline.createDynamicsCompressor();
  ess.threshold.value = preset.deEssThreshold;
  ess.knee.value = 14;
  ess.ratio.value = preset.deEssRatio;
  ess.attack.value = 0.006;
  ess.release.value = 0.09;

  input.connect(dry);
  input.connect(hp);
  hp.connect(ess);
  ess.connect(wet);

  const merge = offline.createGain();
  merge.gain.value = 1;
  dry.connect(merge);
  wet.connect(merge);
  return merge;
}

function connectDynamics(offline, input, preset) {
  const comp = offline.createDynamicsCompressor();
  comp.threshold.value = preset.compThreshold;
  comp.knee.value = 24;
  comp.ratio.value = preset.compRatio;
  comp.attack.value = preset.compAttack;
  comp.release.value = preset.compRelease;
  input.connect(comp);
  return comp;
}

function connectVelvetTop(offline, input, hz) {
  const f = Number(hz) || 0;
  if (f <= 0) {
    input.connect(offline.destination);
    return;
  }
  const lp = offline.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = f;
  lp.Q.value = 0.28;
  input.connect(lp);
  lp.connect(offline.destination);
}

/** Barely-there thickening for sustained hum/sing — not pitch correction */
function connectTonalBlend(offline, input, mix) {
  const m = Math.max(0, Math.min(0.08, Number(mix) || 0));
  if (m <= 0.001) return input;
  const dry = offline.createGain();
  dry.gain.value = 1 - m;
  const wet = offline.createGain();
  wet.gain.value = m;
  const delay = offline.createDelay(0.02);
  delay.delayTime.value = 0.009;
  input.connect(dry);
  input.connect(delay);
  delay.connect(wet);
  const merge = offline.createGain();
  dry.connect(merge);
  wet.connect(merge);
  return merge;
}

function connectSpace(offline, input, preset) {
  const mix = Math.max(0, Math.min(0.14, Number(preset.reverbMix) || 0));
  if (mix <= 0.001) {
    connectVelvetTop(offline, input, preset.velvetLp);
    return;
  }
  const dry = offline.createGain();
  dry.gain.value = 1 - mix * 0.7;
  const wet = offline.createGain();
  wet.gain.value = mix;
  const delay = offline.createDelay(0.14);
  delay.delayTime.value = preset.delayTime || 0.03;
  const fb = offline.createGain();
  fb.gain.value = preset.delayFeedback || 0.08;
  const lp = offline.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = preset.delayLp || 2200;
  input.connect(dry);
  input.connect(delay);
  delay.connect(lp);
  lp.connect(fb);
  fb.connect(delay);
  delay.connect(wet);
  const merge = offline.createGain();
  dry.connect(merge);
  wet.connect(merge);
  connectVelvetTop(offline, merge, preset.velvetLp);
}

/** Extra short studio slap — Dreamy only, stays under the vocal */
function connectStudioSlap(offline, input, mix) {
  const m = Math.max(0, Math.min(0.05, Number(mix) || 0));
  if (m <= 0.001) return input;
  const dry = offline.createGain();
  dry.gain.value = 1 - m * 0.85;
  const wet = offline.createGain();
  wet.gain.value = m;
  const delay = offline.createDelay(0.09);
  delay.delayTime.value = 0.078;
  const lp = offline.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 3200;
  lp.Q.value = 0.35;
  input.connect(dry);
  input.connect(delay);
  delay.connect(lp);
  lp.connect(wet);
  const merge = offline.createGain();
  dry.connect(merge);
  wet.connect(merge);
  return merge;
}

/** Softens crispy consonants — keeps breath and body */
function softenTransientsInPlace(channel, amount = 0.35) {
  const a = Math.max(0, Math.min(0.55, amount));
  if (a <= 0.01) return;
  let env = 0;
  const atk = 0.0008;
  const rel = 0.04;
  for (let i = 0; i < channel.length; i++) {
    const x = channel[i];
    const level = Math.abs(x);
    env = level > env ? env + (level - env) * atk : env + (level - env) * rel;
    if (level > env * 1.8 + 0.04) {
      const soften = 1 - a * 0.35;
      channel[i] = x * soften;
    }
  }
}

function gentleNoiseReduceInPlace(channel, preset) {
  const amount = Math.max(0, Math.min(1, Number(preset.noiseReduceAmount) || 0));
  if (amount <= 0.01) return;
  const floor = Math.max(0.0005, preset.noiseGateFloor || 0.003);
  const win = 256;
  const rmsList = [];
  for (let i = 0; i < channel.length; i += win) {
    let s = 0;
    let n = 0;
    for (let j = i; j < Math.min(i + win, channel.length); j++) {
      s += channel[j] * channel[j];
      n++;
    }
    rmsList.push(Math.sqrt(s / Math.max(1, n)));
  }
  rmsList.sort((a, b) => a - b);
  const noiseEst = rmsList[Math.floor(rmsList.length * 0.1)] || floor;
  const gate = noiseEst * 1.8 + floor;
  let env = 1;
  const atk = 0.0015;
  const rel = 0.06;
  for (let i = 0; i < channel.length; i++) {
    const a = Math.abs(channel[i]);
    const target = a > gate ? 1 : 0.25 + 0.75 * (a / gate);
    env = target > env ? env + (target - env) * atk : env + (target - env) * rel;
    const reduce = 1 - amount * (1 - env);
    channel[i] *= reduce;
  }
}

function softLimitSample(x) {
  const a = Math.abs(x);
  if (a <= 0.85) return x;
  return Math.sign(x) * (0.85 + 0.15 * Math.tanh((a - 0.85) * 4));
}

function normalizeLoudness(buffer, targetRms = TARGET_RMS) {
  const ch = buffer.getChannelData(0);
  let sumSq = 0;
  for (let i = 0; i < ch.length; i++) sumSq += ch[i] * ch[i];
  const rms = Math.sqrt(sumSq / Math.max(1, ch.length));
  if (rms < 0.0006) return buffer;
  const gain = Math.min(1.22, targetRms / rms);
  for (let i = 0; i < ch.length; i++) {
    ch[i] = softLimitSample(ch[i] * gain);
  }
  return buffer;
}

function postProcessBuffer(buffer, preset) {
  const ch = buffer.getChannelData(0);
  const head = Number(preset.headroom) || 1;
  if (head < 1) {
    for (let i = 0; i < ch.length; i++) ch[i] *= head;
  }
  if ((preset.transientSoft ?? 0) > 0.01) softenTransientsInPlace(ch, preset.transientSoft);
  normalizeLoudness(buffer);
  return buffer;
}

async function decodeBlobToBuffer(blob) {
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

async function renderPolishedBuffer(audioBuffer, tone) {
  const preset = PRESETS[normalizeToneId(tone)] || PRESETS.natural;
  const humming = isLikelyHumOrSingBuffer(audioBuffer);

  const frames = Math.max(1, Math.ceil(audioBuffer.duration * ECHO_RENDER_SAMPLE_RATE));
  const offline = new OfflineAudioContext(1, frames, ECHO_RENDER_SAMPLE_RATE);
  const src = offline.createBufferSource();
  src.buffer = audioBuffer;

  const headIn = offline.createGain();
  headIn.gain.value = Number(preset.headroom) || 0.88;
  src.connect(headIn);

  let chain = headIn;
  chain = connectBackgroundCleanup(offline, chain, preset);
  chain = connectInterviewEq(offline, chain, preset);
  chain = connectDeEsser(offline, chain, preset);
  chain = connectDynamics(offline, chain, preset);
  const glue = preset.tonalBlendMix > 0 && humming ? preset.tonalBlendMix : 0;
  chain = connectTonalBlend(offline, chain, glue) || chain;
  if (preset.studioSlapMix > 0.001) {
    chain = connectStudioSlap(offline, chain, preset.studioSlapMix) || chain;
  }
  connectSpace(offline, chain, preset);

  src.start(0);
  const rendered = await offline.startRendering();

  if (preset.pitchStrength > 0.05 && humming) {
    applyNaturalPitchStabilization(rendered, {
      strength: Math.min(0.1, preset.pitchStrength),
      maxCents: Math.min(12, preset.pitchMaxCents || 12),
      humming: true,
    });
  }

  return postProcessBuffer(rendered, preset);
}

async function audioBufferToCompressedBlob(buffer, pickMime) {
  const mime = pickEchoRecorderMime(pickMime);
  if (!mime || typeof MediaRecorder === "undefined") return null;

  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return null;
  const ctx = new Ctx({ sampleRate: buffer.sampleRate });
  try {
    const dest = ctx.createMediaStreamDestination();
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(dest);

    const chunks = [];
    const rec = new MediaRecorder(dest.stream, {
      mimeType: mime,
      audioBitsPerSecond: 96000,
    });

    const blob = await new Promise((resolve, reject) => {
      const stopTimer = window.setTimeout(() => {
        try {
          if (rec.state === "recording") rec.stop();
        } catch {}
      }, Math.ceil((buffer.duration + 0.35) * 1000));

      rec.ondataavailable = (e) => {
        if (e.data?.size) chunks.push(e.data);
      };
      rec.onerror = () => {
        window.clearTimeout(stopTimer);
        reject(new Error("recorder"));
      };
      rec.onstop = () => {
        window.clearTimeout(stopTimer);
        const out = new Blob(chunks, { type: mime });
        resolve(out.size ? out : null);
      };

      try {
        rec.start(200);
        src.start(0);
        src.onended = () => {
          window.setTimeout(() => {
            try {
              if (rec.state === "recording") rec.stop();
            } catch {
              resolve(null);
            }
          }, 80);
        };
      } catch (e) {
        window.clearTimeout(stopTimer);
        reject(e);
      }
    });

    return blob;
  } catch {
    return null;
  } finally {
    try {
      await ctx.close();
    } catch {}
  }
}

/**
 * @param {Blob} blob
 * @param {string} tone
 * @param {{ pickMime?: () => string }} [opts]
 * @returns {Promise<Blob>}
 */
export async function applyEchoTone(blob, tone = ECHO_TONE_DEFAULT, opts = {}) {
  if (!blob?.size) return blob;
  const pickMime = opts.pickMime;
  const toneId = normalizeToneId(tone);

  const audioBuffer = await decodeBlobToBuffer(blob);
  if (!audioBuffer) return blob;

  let polished;
  try {
    polished = await renderPolishedBuffer(audioBuffer, toneId);
  } catch {
    return blob.size <= ECHO_UPLOAD_MAX_BYTES ? blob : blob;
  }

  let out = await audioBufferToCompressedBlob(polished, pickMime);
  if (out?.size && out.size <= ECHO_UPLOAD_MAX_BYTES) return out;

  if (blob.size <= ECHO_UPLOAD_MAX_BYTES && toneId === "raw") return blob;

  out = await audioBufferToCompressedBlob(polished, () => "audio/webm");
  if (out?.size && out.size <= ECHO_UPLOAD_MAX_BYTES) return out;

  return blob.size <= ECHO_UPLOAD_MAX_BYTES ? blob : blob;
}

export function echoToneLabel(tone) {
  const id = normalizeToneId(tone);
  if (id === "raw") return "Raw";
  if (id === "dreamy") return "Dreamy";
  return "Natural Tone";
}

export function echoToneHint(tone) {
  const id = normalizeToneId(tone);
  if (id === "raw") return "Cleanup and even volume only";
  if (id === "dreamy") return "Natural Tone with a touch more space and reverb";
  return "Clean, warm close-mic — natural and undistorted";
}
