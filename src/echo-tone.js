/**
 * Echo Tone — flattering vocal polish for voice notes (not robotic autotune).
 * Targets the “I don’t like my voice” problem: warmth, smooth levels, less harshness.
 */

export const ECHO_TONE_IDS = ["raw", "soft", "dreamy"];
export const ECHO_TONE_DEFAULT = "soft";
export const ECHO_UPLOAD_MAX_BYTES = 480 * 1024;
/** Full-rate render — 24kHz was making voice thin / “phone mic” */
const ECHO_RENDER_SAMPLE_RATE = 44100;

/**
 * @typedef {object} EchoTonePreset
 * @property {number} highpass
 * @property {number} lowShelfGain
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
 * @property {number} [masterLp]
 */

/** @type {Record<string, EchoTonePreset>} */
const PRESETS = {
  raw: {
    highpass: 68,
    lowShelfGain: 1.2,
    mudCutGain: -0.6,
    bodyGain: 1,
    nasalCutGain: -0.4,
    presenceGain: 0.6,
    airGain: -1,
    deEssThreshold: -18,
    deEssRatio: 2,
    compThreshold: -18,
    compKnee: 14,
    compRatio: 1.5,
    compAttack: 0.014,
    compRelease: 0.32,
    makeupGain: 1.01,
    reverbMix: 0,
    doublerMix: 0,
    warmthDrive: 0.02,
    masterLp: 12000,
  },
  soft: {
    highpass: 62,
    lowShelfGain: 3.6,
    mudCutGain: -1,
    bodyGain: 1.8,
    nasalCutGain: -0.6,
    presenceGain: 0.5,
    airGain: -1.2,
    deEssThreshold: -20,
    deEssRatio: 2.2,
    compThreshold: -19,
    compKnee: 16,
    compRatio: 1.55,
    compAttack: 0.016,
    compRelease: 0.42,
    makeupGain: 1.02,
    reverbMix: 0.07,
    delayTime: 0.032,
    delayFeedback: 0.12,
    delayLp: 2600,
    doublerMix: 0.03,
    doublerMs: 0.011,
    warmthDrive: 0.035,
    masterLp: 11200,
  },
  dreamy: {
    highpass: 66,
    lowShelfGain: 2.8,
    mudCutGain: -0.8,
    bodyGain: 1.4,
    nasalCutGain: -0.5,
    presenceGain: 0.4,
    airGain: 0.6,
    deEssThreshold: -20,
    deEssRatio: 2.4,
    compThreshold: -20,
    compKnee: 16,
    compRatio: 1.6,
    compAttack: 0.012,
    compRelease: 0.4,
    makeupGain: 1.02,
    reverbMix: 0.12,
    delayTime: 0.048,
    delayFeedback: 0.14,
    delayLp: 2400,
    doublerMix: 0.05,
    doublerMs: 0.013,
    warmthDrive: 0.03,
    masterLp: 11000,
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
  hp.Q.value = 0.45;
  node.connect(hp);
  node = hp;

  const lowShelf = offline.createBiquadFilter();
  lowShelf.type = "lowshelf";
  lowShelf.frequency.value = 155;
  lowShelf.gain.value = preset.lowShelfGain ?? 0;
  node.connect(lowShelf);
  node = lowShelf;

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
  dry.gain.value = 0.94;

  const wet = offline.createGain();
  wet.gain.value = 0.06;

  const hp = offline.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = 6200;
  hp.Q.value = 0.35;

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
  thicken.gain.value = 0.6;
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

  const makeup = offline.createGain();
  makeup.gain.value = preset.makeupGain ?? 1;
  comp.connect(makeup);
  return makeup;
}

/** Rolls off harsh “helicopter” highs before space */
function connectMasterWarmth(offline, input, preset) {
  const hz = Number(preset.masterLp) || 0;
  if (hz <= 0) return input;
  const lp = offline.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = hz;
  lp.Q.value = 0.35;
  input.connect(lp);
  return lp;
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
  chain = connectMasterWarmth(offline, chain, preset);
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
      audioBitsPerSecond: 112000,
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
  return "Full & warm — natural body, easy on the ears";
}
