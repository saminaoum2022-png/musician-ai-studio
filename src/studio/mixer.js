import { encodeWav16 } from "../wav.js";

/**
 * @typedef {{ name: string, url: string, gain: number, pan?: number, muted?: boolean }} Stem
 */

/**
 * Offline-mix stems to a WAV Blob.
 * @param {Stem[]} stems
 * @param {{ sampleRate?: number }} opts
 */
export async function mixStemsToWav(stems, opts = {}) {
  const sampleRate = opts.sampleRate || 44100;
  const active = (stems || []).filter((s) => s && s.url && !s.muted && (s.gain ?? 1) > 0);
  if (!active.length) throw new Error("No stems selected");

  const decoded = await Promise.all(
    active.map(async (s) => {
      const buf = await fetch(s.url).then((r) => {
        if (!r.ok) throw new Error(`Fetch failed: ${s.name}`);
        return r.arrayBuffer();
      });
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      try {
        const audio = await ctx.decodeAudioData(buf.slice(0));
        return { stem: s, audio };
      } finally {
        ctx.close().catch(() => {});
      }
    })
  );

  const maxLen = decoded.reduce((m, x) => Math.max(m, x.audio.length), 0);
  const offline = new OfflineAudioContext(2, maxLen, sampleRate);

  for (const { stem, audio } of decoded) {
    const src = offline.createBufferSource();
    src.buffer = audio;
    const g = offline.createGain();
    g.gain.value = clampNum(stem.gain ?? 1, 0, 2);
    src.connect(g);

    let out = g;
    if (typeof offline.createStereoPanner === "function" && Number.isFinite(stem.pan) && Math.abs(stem.pan) > 1e-6) {
      const pn = offline.createStereoPanner();
      pn.pan.value = clampNum(stem.pan, -1, 1);
      g.connect(pn);
      out = pn;
    }

    out.connect(offline.destination);
    src.start(0);
  }

  const rendered = await offline.startRendering();
  const wavBlob = encodeWav16([rendered.getChannelData(0), rendered.getChannelData(1)], sampleRate);
  return wavBlob;
}

function clampNum(n, min, max) {
  const x = Number.isFinite(Number(n)) ? Number(n) : min;
  return Math.max(min, Math.min(max, x));
}

