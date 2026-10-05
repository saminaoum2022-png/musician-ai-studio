/**
 * Play quantized melody notes in the browser (sanity-check before Lyria).
 * @param {{ tempoBpm: number, notes: Array<{ startBeat: number, durationBeats: number, midi: number }> }} melody
 */
export async function playMelodyPreview(melody) {
  const notes = Array.isArray(melody?.notes) ? melody.notes : [];
  const bpm = Number(melody?.tempoBpm) || 96;
  if (notes.length < 2) throw new Error("Need at least 2 notes to preview.");

  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) throw new Error("Web Audio not available.");
  const ctx = new AudioCtx();
  if (ctx.state === "suspended") await ctx.resume();

  const secPerBeat = 60 / bpm;
  const t0 = ctx.currentTime + 0.08;
  const sorted = [...notes].sort((a, b) => a.startBeat - b.startBeat);

  for (const n of sorted) {
    const start = t0 + Number(n.startBeat) * secPerBeat;
    const dur = Math.max(0.08, Number(n.durationBeats) * secPerBeat * 0.92);
    const freq = 440 * 2 ** ((Number(n.midi) - 69) / 12);
    if (!Number.isFinite(freq) || freq < 60) continue;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "triangle";
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(0.22, start + 0.02);
    gain.gain.setValueAtTime(0.18, start + dur * 0.6);
    gain.gain.linearRampToValueAtTime(0, start + dur);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(start);
    osc.stop(start + dur + 0.02);
  }

  const last = sorted[sorted.length - 1];
  const endSec = (Number(last.startBeat) + Number(last.durationBeats)) * secPerBeat + 0.3;
  await new Promise((r) => setTimeout(r, endSec * 1000));
  try {
    await ctx.close();
  } catch {}
}
