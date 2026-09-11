/**
 * Shrink uploaded songs for Vibe read — Gemini downsamples to ~16 kbps anyway.
 * Keeps up to 3 min mono @ 8 kHz so base64 stays under Vercel body limits.
 */
import { encodeWav16 } from "./wav.js";

export const VIBE_AUDIO_MAX_SEC = 180;
export const VIBE_AUDIO_SAMPLE_RATE = 8000;
/** Base64 JSON must stay under Vercel ~4.5 MB request cap. */
export const VIBE_AUDIO_MAX_DATAURL_CHARS = 3_900_000;

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Could not encode audio for upload"));
    reader.readAsDataURL(blob);
  });
}

function mixToMono(audioBuffer, maxSec) {
  const sampleRate = audioBuffer.sampleRate;
  const frameCount = Math.min(
    audioBuffer.length,
    Math.max(1, Math.floor(maxSec * sampleRate)),
  );
  const mono = new AudioBuffer({ length: frameCount, numberOfChannels: 1, sampleRate });
  const out = mono.getChannelData(0);
  const channels = audioBuffer.numberOfChannels;
  for (let i = 0; i < frameCount; i++) {
    let sum = 0;
    for (let c = 0; c < channels; c++) sum += audioBuffer.getChannelData(c)[i] || 0;
    out[i] = sum / channels;
  }
  return mono;
}

async function resampleMono(monoBuffer, targetRate) {
  const OfflineCtx = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  if (!OfflineCtx) return monoBuffer;
  const length = Math.max(1, Math.ceil(monoBuffer.duration * targetRate));
  const offline = new OfflineCtx(1, length, targetRate);
  const source = offline.createBufferSource();
  source.buffer = monoBuffer;
  source.connect(offline.destination);
  source.start(0);
  return offline.startRendering();
}

/**
 * @param {File} file
 * @returns {Promise<{ dataUrl: string, analyzedSec: number, originalSec: number, compressed: boolean }>}
 */
export async function prepareAudioForVibeRead(file) {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) throw new Error("Audio not supported on this device.");
  const arrayBuffer = await file.arrayBuffer();
  const ctx = new Ctx();
  let decoded;
  try {
    decoded = await ctx.decodeAudioData(arrayBuffer.slice(0));
  } finally {
    try { await ctx.close(); } catch {}
  }
  const originalSec = Number(decoded.duration) || 0;
  const analyzedSec = Math.min(originalSec || VIBE_AUDIO_MAX_SEC, VIBE_AUDIO_MAX_SEC);
  let mono = mixToMono(decoded, analyzedSec);
  let resampled = await resampleMono(mono, VIBE_AUDIO_SAMPLE_RATE);
  mono = null;
  let wavBlob = encodeWav16([resampled.getChannelData(0)], VIBE_AUDIO_SAMPLE_RATE);
  resampled = null;
  let dataUrl = await blobToDataUrl(wavBlob);
  wavBlob = null;

  if (dataUrl.length > VIBE_AUDIO_MAX_DATAURL_CHARS) {
    const shorterSec = Math.max(45, Math.floor(analyzedSec * 0.65));
    const ctx2 = new Ctx();
    let decoded2;
    try {
      decoded2 = await ctx2.decodeAudioData(arrayBuffer.slice(0));
    } finally {
      try { await ctx2.close(); } catch {}
    }
    let mono2 = mixToMono(decoded2, shorterSec);
    let resampled2 = await resampleMono(mono2, VIBE_AUDIO_SAMPLE_RATE);
    dataUrl = await blobToDataUrl(encodeWav16([resampled2.getChannelData(0)], VIBE_AUDIO_SAMPLE_RATE));
    if (dataUrl.length > VIBE_AUDIO_MAX_DATAURL_CHARS) {
      throw new Error("Track too large — try a shorter clip (under 2 minutes).");
    }
    return {
      dataUrl,
      analyzedSec: shorterSec,
      originalSec,
      compressed: true,
    };
  }

  return {
    dataUrl,
    analyzedSec,
    originalSec,
    compressed: originalSec > analyzedSec + 1 || (file.size || 0) > 800_000,
  };
}
