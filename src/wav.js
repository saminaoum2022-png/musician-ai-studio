/**
 * Encode mono or stereo Float32 PCM to a WAV Blob (16-bit PCM).
 * @param {Float32Array[]} channels - [L] or [L,R]
 * @param {number} sampleRate
 * @returns {Blob}
 */
export function encodeWav16(channels, sampleRate) {
  const numChannels = channels.length;
  if (numChannels !== 1 && numChannels !== 2) throw new Error("WAV: only mono or stereo supported");
  const length = channels[0].length;
  if (numChannels === 2 && channels[1].length !== length) throw new Error("WAV: channel length mismatch");

  const bytesPerSample = 2;
  const blockAlign = numChannels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = length * blockAlign;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  writeString(view, 0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeString(view, 8, "WAVE");
  writeString(view, 12, "fmt ");
  view.setUint32(16, 16, true); // PCM chunk size
  view.setUint16(20, 1, true); // PCM format
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true); // bits
  writeString(view, 36, "data");
  view.setUint32(40, dataSize, true);

  // interleave
  let offset = 44;
  for (let i = 0; i < length; i++) {
    for (let ch = 0; ch < numChannels; ch++) {
      const s = clamp1(channels[ch][i]);
      view.setInt16(offset, floatToInt16(s), true);
      offset += 2;
    }
  }

  return new Blob([buffer], { type: "audio/wav" });
}

function writeString(view, offset, str) {
  for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
}

function clamp1(x) {
  return Math.max(-1, Math.min(1, x));
}

function floatToInt16(x) {
  return x < 0 ? Math.round(x * 0x8000) : Math.round(x * 0x7fff);
}

