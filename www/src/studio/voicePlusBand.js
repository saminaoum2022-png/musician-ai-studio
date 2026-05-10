/**
 * Voice + band mixer.
 *
 * Takes a local vocal recording (Blob) and a generated backing track
 * (URL) and produces a single mixed WAV that the user can listen to /
 * share / save. This is the "I sang into the app and got my real
 * voice with an AI band underneath" experience.
 *
 * Alignment strategy: vocal placed at t = 0, band continues
 * underneath. Output length = max(vocal, band). If the band is longer
 * (typical: 60–180 s band, 10–30 s vocal), the tail of the song is
 * band-only — feels like a normal verse + instrumental break.
 *
 * Polish:
 *   - RMS-based loudness match so the vocal sits at a consistent
 *     level above the band regardless of phone-mic levels.
 *   - Soft limiter on the mix bus (DynamicsCompressor with high ratio
 *     + low threshold + fast attack) so the master doesn't clip when
 *     vocal + band sum to >0 dBFS in loud sections.
 *
 * Why not pitch correction / time-stretch?
 *   Those need real DSP (Melodyne / RubberBand) which the browser
 *   doesn't ship. We document the limit honestly in the UI.
 */

import { encodeWav16 } from "../wav.js";

const TARGET_SAMPLE_RATE = 44100;
// How loud the vocal should sit above the band, in dB RMS. Positive
// values mean vocal is louder. +3 dB lands on top without burying it.
const VOCAL_HEADROOM_DB = 3;
// Final master ceiling so the WAV never clips even on loud overlaps.
const MASTER_CEILING_DB = -1.0;

/**
 * @param {Object} args
 * @param {Blob} args.vocalBlob - The user's recording (any browser-supported audio format).
 * @param {string} args.bandUrl - URL of the generated backing track (MP3 typically).
 * @param {(msg: string) => void} [args.onProgress]
 * @returns {Promise<Blob>} WAV Blob of the mixed result.
 */
export async function mixVoicePlusBand({ vocalBlob, bandUrl, onProgress }) {
  if (!vocalBlob) throw new Error("Missing vocal recording");
  if (!bandUrl) throw new Error("Missing backing track URL");

  const log = typeof onProgress === "function" ? onProgress : () => {};

  log("Decoding vocal…");
  const vocalBuf = await decodeBlob(vocalBlob);

  log("Downloading backing track…");
  const bandBlob = await fetchAsBlob(bandUrl);

  log("Decoding backing track…");
  const bandBuf = await decodeBlob(bandBlob);

  log("Matching levels…");
  const vocalRms = computeRms(vocalBuf);
  const bandRms = computeRms(bandBuf);

  // Solve: vocalGain * vocalRms = bandRms * 10^(VOCAL_HEADROOM_DB/20)
  const targetVocalRms = bandRms * dbToLin(VOCAL_HEADROOM_DB);
  let vocalGain = vocalRms > 1e-6 ? targetVocalRms / vocalRms : 1;
  // Safety clamp so a near-silent vocal doesn't get boosted to a
  // hiss-fest. 6x ≈ +15.5 dB is plenty for a quiet phone-mic take.
  vocalGain = Math.max(0.25, Math.min(6, vocalGain));

  log("Rendering mix…");
  const length = Math.max(vocalBuf.length, bandBuf.length);
  const offline = new OfflineAudioContext(2, length, TARGET_SAMPLE_RATE);

  // Backing track — full length, no gain change. We'll let the bus
  // limiter handle headroom.
  const bandSrc = offline.createBufferSource();
  bandSrc.buffer = bandBuf;
  bandSrc.start(0);

  // Vocal — at t = 0, with computed gain.
  const vocalSrc = offline.createBufferSource();
  vocalSrc.buffer = vocalBuf;
  const vocalGainNode = offline.createGain();
  vocalGainNode.gain.value = vocalGain;
  vocalSrc.connect(vocalGainNode);
  vocalSrc.start(0);

  // Master bus: soft limiter then destination. The DynamicsCompressor
  // here is configured as a brick-wall-ish limiter: high ratio
  // (20:1), low threshold (~-3 dB), short attack (3 ms), moderate
  // release (250 ms). This catches transient peaks without
  // "pumping" the whole mix.
  const limiter = offline.createDynamicsCompressor();
  limiter.threshold.value = -3;
  limiter.knee.value = 0;
  limiter.ratio.value = 20;
  limiter.attack.value = 0.003;
  limiter.release.value = 0.25;

  // Final ceiling stage — a fixed make-up / attenuation gain that
  // pulls the bus to MASTER_CEILING_DB so we never clip the WAV.
  const masterGain = offline.createGain();
  masterGain.gain.value = dbToLin(MASTER_CEILING_DB);

  bandSrc.connect(limiter);
  vocalGainNode.connect(limiter);
  limiter.connect(masterGain);
  masterGain.connect(offline.destination);

  const rendered = await offline.startRendering();

  log("Encoding WAV…");
  const channels =
    rendered.numberOfChannels >= 2
      ? [rendered.getChannelData(0), rendered.getChannelData(1)]
      : [rendered.getChannelData(0), rendered.getChannelData(0)];
  const wav = encodeWav16(channels, TARGET_SAMPLE_RATE);

  return wav;
}

/* ----------------------------- internals ----------------------------- */

async function fetchAsBlob(url) {
  // For cross-origin Suno CDN URLs we route through our same-origin
  // /api/suno/audio proxy so the browser gives us readable bytes.
  // Direct same-origin or blob: URLs pass through unchanged.
  const resolved = resolveAudioUrl(url);
  const r = await fetch(resolved, { credentials: "omit", cache: "no-store" });
  if (!r.ok) throw new Error(`Backing fetch failed (${r.status})`);
  const blob = await r.blob();
  if (!blob || blob.size < 1024) throw new Error("Backing track too small / empty");
  return blob;
}

function resolveAudioUrl(url) {
  const s = String(url || "").trim();
  if (!s) return s;
  if (s.startsWith("blob:") || s.startsWith("data:")) return s;
  try {
    const u = new URL(s, location.origin);
    if (u.origin === location.origin) return s;
  } catch {}
  return `/api/suno/audio?url=${encodeURIComponent(s)}`;
}

async function decodeBlob(blob) {
  const buf = await blob.arrayBuffer();
  const Ctor = window.AudioContext || window.webkitAudioContext;
  if (!Ctor) throw new Error("Web Audio API not available");
  const ctx = new Ctor();
  try {
    // decodeAudioData mutates the buffer on some browsers — slice() to be safe.
    return await ctx.decodeAudioData(buf.slice(0));
  } finally {
    try { await ctx.close(); } catch {}
  }
}

function computeRms(audioBuffer) {
  const ch0 = audioBuffer.getChannelData(0);
  // Sample every Nth frame so a 3-minute song doesn't take forever.
  // 10ms windowing is plenty for an RMS estimate.
  const stride = Math.max(1, Math.floor(audioBuffer.sampleRate / 100));
  let sum = 0;
  let count = 0;
  for (let i = 0; i < ch0.length; i += stride) {
    const v = ch0[i];
    sum += v * v;
    count += 1;
  }
  return count > 0 ? Math.sqrt(sum / count) : 0;
}

function dbToLin(db) {
  return Math.pow(10, db / 20);
}
