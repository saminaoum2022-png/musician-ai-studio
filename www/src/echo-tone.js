/**
 * Echo Tone — flattering vocal polish for voice notes (not robotic autotune).
 * Targets the “I don’t like my voice” problem: warmth, smooth levels, less harshness.
 */

export const ECHO_TONE_IDS = ["raw", "soft", "dreamy"];
export const ECHO_TONE_DEFAULT = "soft";
export const ECHO_UPLOAD_MAX_BYTES = 480 * 1024;
const ECHO_RENDER_SAMPLE_RATE = 24000;

/**
 * @typedef {object} EchoTonePreset
 * @property {number} highpass
 * @property {number} mudCutGain
 * @property {number} bodyGain
 * @property {number} nasalCutGain
 * @property {number} presenceGain
 * @property {number} airGain
 * @property {number} deEssThreshold
 * @property {number} deEssRatio
 * @property {number} compThreshold
 * @property {number} compKnee
 * @property {number} compRatio
 * @property {number} compAttack
 * @property {number} compRelease
 * @property {number} [glueThreshold]
 * @property {number} [glueRatio]
 * @property {number} makeupGain
 * @property {number} reverbMix
 * @property {number} [delayTime]
 * @property {number} [delayFeedback]
 * @property {number} [delayLp]
 * @property {number} doublerMix
 * @property {number} [doublerMs]
 * @property {number} warmthDrive
 */

/** @type {Record<string, EchoTonePreset>} */
const PRESETS = {
  raw: {
    highpass: 78,
    mudCutGain: -1.2,
    bodyGain: 1.2,
    nasalCutGain: -0.8,
    presenceGain: 1.4,
    airGain: -0.4,
    deEssThreshold: -22,
    deEssRatio: 2.5,
    compThreshold: -22,
    compKnee: 12,
    compRatio: 2.2,
    compAttack: 0.006,
    compRelease: 0.18,
    makeupGain: 1.04,
    reverbMix: 0,
    doublerMix: 0,
    warmthDrive: 0.04,
  },
  soft: {
    highpass: 82,
    mudCutGain: -2.8,
    bodyGain: 3.2,
    nasalCutGain: -2.2,
    presenceGain: 2.2,
    airGain: 1.2,
    deEssThreshold: -30,
    deEssRatio: 4,
    compThreshold: -32,
    compKnee: 18,
    compRatio: 3.2,
    compAttack: 0.003,
    compRelease: 0.28,
    glueThreshold: -18,
    glueRatio: 1.8,
    makeupGain: 1.12,
    reverbMix: 0.14,
    delayTime: 0.034,
    delayFeedback: 0.18,
    delayLp: 4600,
    doublerMix: 0.11,
    doublerMs: 0.014,
    warmthDrive: 0.09,
  },
  dreamy: {
    highpass: 88,
    mudCutGain: -2.2,
    bodyGain: 2.4,
    nasalCutGain: -1.6,
    presenceGain: 1.6,
    airGain: 2.8,
    deEssThreshold: -28,
    deEssRatio: 3.5,
    compThreshold: -34,
    compKnee: 20,
    compRatio: 3.4,
    compAttack: 0.004,
    compRelease: 0.34,
    glueThreshold: -16,
    glueRatio: 2,
    makeupGain: 1.1,
    reverbMix: 0.24,
    delayTime: 0.056,
    delayFeedback: 0.28,
    delayLp: 3200,
    doublerMix: 0.15,
    doublerMs: 0.018,
    warmthDrive: 0.07,
  },
};

function normalizeToneId(tone) {
  const id = String(tone || "").trim().toLowerCase();
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

/** Gentle saturation — adds chest/warmth without distortion obvious */
function connectWarmth(offline, input, drive) {
  const d = Math.max(0, Math.min(0.2, Number(drive) || 0));
  if (d <= 0.001) return input;
  const shaper = offline.createWaveShaper();
  const curve = new Float32Array(256);
  for (let i = 0; i < 256; i++) {
    const x = (i / 128 - 1) * (1 + d * 4);
    curve[i] = Math.tanh(x) / Math.tanh(1 + d * 4);
  }
  shaper.curve = curve;
  shaper.oversample = "2x";
  input.connect(shaper);
  return shaper;
}

function connectVocalEq(offline, input, preset) {
  let node = input;

  const hp = offline.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = preset.highpass;
  hp.Q.value = 0.65;
  node.connect(hp);
  node = hp;

  const mud = offline.createBiquadFilter();
  mud.type = "peaking";
  mud.frequency.value = 380;
  mud.Q.value = 1.1;
  mud.gain.value = preset.mudCutGain;
  node.connect(mud);
  node = mud;

  const body = offline.createBiquadFilter();
  body.type = "peaking";
  body.frequency.value = 195;
  body.Q.value = 0.75;
  body.gain.value = preset.bodyGain;
  node.connect(body);
  node = body;

  const nasal = offline.createBiquadFilter();
  nasal.type = "peaking";
  nasal.frequency.value = 1180;
  nasal.Q.value = 1.2;
  nasal.gain.value = preset.nasalCutGain;
  node.connect(nasal);
  node = nasal;

  const presence = offline.createBiquadFilter();
  presence.type = "peaking";
  presence.frequency.value = 2850;
  presence.Q.value = 0.7;
  presence.gain.value = preset.presenceGain;
  node.connect(presence);
  node = presence;

  const air = offline.createBiquadFilter();
  air.type = "highshelf";
  air.frequency.value = 7200;
  air.gain.value = preset.airGain;
  node.connect(air);
  node = air;

  return connectWarmth(offline, node, preset.warmthDrive);
}

/** Tames sibilance — main reason people hate their own voice notes */
function connectDeEsser(offline, input, preset) {
  const split = offline.createGain();
  split.gain.value = 1;
  input.connect(split);

  const dry = offline.createGain();
  dry.gain.value = 0.82;

  const wet = offline.createGain();
  wet.gain.value = 0.18;

  const hp = offline.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = 5200;
  hp.Q.value = 0.5;

  const ess = offline.createDynamicsCompressor();
  ess.threshold.value = preset.deEssThreshold;
  ess.knee.value = 8;
  ess.ratio.value = preset.deEssRatio;
  ess.attack.value = 0.001;
  ess.release.value = 0.06;

  split.connect(dry);
  split.connect(hp);
  hp.connect(ess);
  ess.connect(wet);

  const merge = offline.createGain();
  merge.gain.value = 1;
  dry.connect(merge);
  wet.connect(merge);
  return merge;
}

function connectDoubler(offline, input, preset) {
  const mix = Math.max(0, Math.min(0.22, Number(preset.doublerMix) || 0));
  if (mix <= 0.001) return input;

  const dry = offline.createGain();
  dry.gain.value = 1 - mix;
  const wet = offline.createGain();
  wet.gain.value = mix;

  const delay = offline.createDelay(0.04);
  delay.delayTime.value = preset.doublerMs ?? 0.013;

  const thicken = offline.createBiquadFilter();
  thicken.type = "peaking";
  thicken.frequency.value = 2100;
  thicken.gain.value = 1.4;
  thicken.Q.value = 0.55;

  input.connect(dry);
  input.connect(delay);
  delay.connect(thicken);
  thicken.connect(wet);

  const merge = offline.createGain();
  merge.gain.value = 1;
  dry.connect(merge);
  wet.connect(merge);
  return merge;
}

function connectDynamics(offline, input, preset) {
  const comp = offline.createDynamicsCompressor();
  comp.threshold.value = preset.compThreshold;
  comp.knee.value = preset.compKnee;
  comp.ratio.value = preset.compRatio;
  comp.attack.value = preset.compAttack;
  comp.release.value = preset.compRelease;
  input.connect(comp);

  let out = comp;
  if (preset.glueThreshold != null) {
    const glue = offline.createDynamicsCompressor();
    glue.threshold.value = preset.glueThreshold;
    glue.knee.value = 10;
    glue.ratio.value = preset.glueRatio ?? 1.8;
    glue.attack.value = 0.01;
    glue.release.value = 0.12;
    comp.connect(glue);
    out = glue;
  }

  const makeup = offline.createGain();
  makeup.gain.value = preset.makeupGain ?? 1;
  out.connect(makeup);
  return makeup;
}

function connectSpace(offline, input, preset) {
  const mix = Math.max(0, Math.min(0.38, Number(preset.reverbMix) || 0));
  if (mix <= 0.001) {
    input.connect(offline.destination);
    return;
  }
  const dry = offline.createGain();
  dry.gain.value = 1 - mix * 0.8;
  const wet = offline.createGain();
  wet.gain.value = mix;

  const delay = offline.createDelay(0.14);
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
  const preset = PRESETS[normalizeToneId(tone)] || PRESETS[ECHO_TONE_DEFAULT];
  const frames = Math.max(1, Math.ceil(audioBuffer.duration * ECHO_RENDER_SAMPLE_RATE));
  const offline = new OfflineAudioContext(1, frames, ECHO_RENDER_SAMPLE_RATE);
  const src = offline.createBufferSource();
  src.buffer = audioBuffer;

  let chain = src;
  chain = connectVocalEq(offline, chain, preset);
  chain = connectDeEsser(offline, chain, preset);
  chain = connectDoubler(offline, chain, preset) || chain;
  chain = connectDynamics(offline, chain, preset);
  connectSpace(offline, chain, preset);

  src.start(0);
  return offline.startRendering();
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
      audioBitsPerSecond: 64000,
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
 * Apply Echo Tone — flattering polish (default Soft).
 * @param {Blob} blob
 * @param {string} tone
 * @param {{ pickMime?: () => string }} [opts]
 * @returns {Promise<Blob>}
 */
export async function applyEchoTone(blob, tone = ECHO_TONE_DEFAULT, opts = {}) {
  if (!blob?.size) return blob;
  const pickMime = opts.pickMime;
  const toneId = normalizeToneId(tone);

  if (blob.size <= ECHO_UPLOAD_MAX_BYTES && toneId === "raw") {
    const audioBuffer = await decodeBlobToBuffer(blob);
    if (!audioBuffer) return blob;
    try {
      const light = await renderPolishedBuffer(audioBuffer, "raw");
      const out = await audioBufferToCompressedBlob(light, pickMime);
      if (out?.size && out.size <= ECHO_UPLOAD_MAX_BYTES) return out;
    } catch {}
    return blob;
  }

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

  if (blob.size <= ECHO_UPLOAD_MAX_BYTES) return blob;

  out = await audioBufferToCompressedBlob(polished, () => "audio/webm");
  if (out?.size && out.size <= ECHO_UPLOAD_MAX_BYTES) return out;

  return blob.size <= ECHO_UPLOAD_MAX_BYTES ? blob : blob;
}

export function echoToneLabel(tone) {
  const id = normalizeToneId(tone);
  if (id === "raw") return "Raw";
  if (id === "dreamy") return "Dreamy";
  return "Soft";
}

export function echoToneHint(tone) {
  const id = normalizeToneId(tone);
  if (id === "raw") return "Light cleanup — closest to your real voice";
  if (id === "dreamy") return "Airy space — emotional and soft";
  return "Warm & smooth — the flattering voice-note sound";
}
