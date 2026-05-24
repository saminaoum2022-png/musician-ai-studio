/**
 * Subtle offline vocal polish for Echo — no robotic autotune, preset-driven only.
 * Output is compressed (webm/mp4) to fit status_audio bucket limits.
 */

export const ECHO_TONE_IDS = ["raw", "soft", "dreamy"];
export const ECHO_TONE_DEFAULT = "soft";
/** Stay under Supabase status_audio default 512KB limit with headroom */
export const ECHO_UPLOAD_MAX_BYTES = 480 * 1024;
const ECHO_RENDER_SAMPLE_RATE = 24000;

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

async function decodeBlobToBuffer(blob) {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return null;
  const ctx = new Ctx();
  try {
    const ab = await blob.arrayBuffer();
    const buf = await ctx.decodeAudioData(ab.slice(0));
    return buf;
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
  chain = connectEq(offline, chain, preset);
  chain = connectDoubler(offline, chain, preset) || chain;
  chain = connectDynamics(offline, chain, preset);
  connectSpace(offline, chain, preset);

  src.start(0);
  return offline.startRendering();
}

/**
 * Encode AudioBuffer to a small compressed blob via MediaRecorder (iOS-safe mp4/webm).
 */
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
      audioBitsPerSecond: 56000,
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
 * Apply Echo Tone polish; returns compressed audio under upload size limits when possible.
 * @param {Blob} blob
 * @param {string} tone
 * @param {{ pickMime?: () => string }} [opts]
 * @returns {Promise<Blob>}
 */
export async function applyEchoTone(blob, tone = ECHO_TONE_DEFAULT, opts = {}) {
  if (!blob?.size) return blob;
  const pickMime = opts.pickMime;

  if (blob.size <= ECHO_UPLOAD_MAX_BYTES && normalizeToneId(tone) === "raw") {
    return blob;
  }

  const audioBuffer = await decodeBlobToBuffer(blob);
  if (!audioBuffer) return blob;

  let polished;
  try {
    polished = await renderPolishedBuffer(audioBuffer, tone);
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
