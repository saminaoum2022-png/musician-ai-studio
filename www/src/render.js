import { midiToFreq } from "./theory.js";
import { encodeWav16 } from "./wav.js";

/**
 * @param {import("./types.js").Arrangement} arrangement
 * @param {{ instrumentFlags: {oud:boolean, violin:boolean, piano:boolean, tabla:boolean}, onProgress?: (p:number)=>void }} opts
 */
export async function renderArrangementToWav(arrangement, opts) {
  const sampleRate = 44100;
  const bpm = arrangement.params.bpm;
  const secPerBeat = 60 / bpm;

  const durationSec = arrangement.totalBeats * secPerBeat + 1.0; // tail
  const frames = Math.ceil(durationSec * sampleRate);

  const offline = new OfflineAudioContext(2, frames, sampleRate);

  const master = offline.createGain();
  master.gain.value = 0.9;
  master.connect(offline.destination);

  // Gentle bus compression-ish: soft clipper
  const clip = offline.createWaveShaper();
  clip.curve = makeSoftClipCurve(0.9);
  clip.oversample = "4x";
  master.disconnect();
  master.connect(clip);
  clip.connect(offline.destination);

  // Global ambience (tiny room)
  const reverb = createTinyReverb(offline, 1.5);
  const revSend = offline.createGain();
  revSend.gain.value = 0.12;
  revSend.connect(reverb.input);
  reverb.output.connect(master);

  const dry = offline.createGain();
  dry.gain.value = 1.0;
  dry.connect(master);

  // Per-instrument busses
  const busOud = instrumentBus(offline, { hp: 90, lp: 9000, gain: 0.55 });
  const busViolin = instrumentBus(offline, { hp: 140, lp: 11000, gain: 0.50 });
  const busPiano = instrumentBus(offline, { hp: 60, lp: 12000, gain: 0.42 });
  // Tabla / frame: perc should read clearly in the mix
  const busTabla = instrumentBus(offline, { hp: 45, lp: 12000, gain: 1.05, pan: 0.12 });

  for (const bus of [busOud, busViolin, busPiano, busTabla]) {
    bus.out.connect(dry);
    bus.out.connect(revSend);
  }

  const enabled = opts.instrumentFlags;

  // Schedule notes
  const noteEvents = arrangement.notes.slice().sort((a, b) => a.startBeat - b.startBeat);
  let scheduled = 0;
  for (const ev of noteEvents) {
    if (!enabled[ev.instrument]) continue;
    const t0 = ev.startBeat * secPerBeat;
    const dur = Math.max(0.04, ev.durationBeats * secPerBeat);
    const freq = midiToFreq(ev.midi);

    if (ev.instrument === "oud") {
      scheduleOud(offline, busOud.in, t0, dur, freq, ev.velocity);
    } else if (ev.instrument === "violin") {
      scheduleViolin(offline, busViolin.in, t0, dur, freq, ev.velocity);
    } else if (ev.instrument === "piano") {
      schedulePiano(offline, busPiano.in, t0, dur, freq, ev.velocity);
    }

    scheduled++;
    if (opts.onProgress && scheduled % 120 === 0) opts.onProgress(Math.min(0.35, scheduled / (noteEvents.length + 1)));
  }

  // Schedule percussion
  if (enabled.tabla) {
    const percEvents = arrangement.perc.slice().sort((a, b) => a.startBeat - b.startBeat);
    let pCount = 0;
    for (const ev of percEvents) {
      const t0 = ev.startBeat * secPerBeat;
      if (ev.type === "dum") scheduleTablaDum(offline, busTabla.in, t0, ev.velocity);
      if (ev.type === "tek") scheduleTablaTek(offline, busTabla.in, t0, ev.velocity);
      pCount++;
      if (opts.onProgress && pCount % 160 === 0) opts.onProgress(0.35 + Math.min(0.25, pCount / (percEvents.length + 1)));
    }
  }

  if (opts.onProgress) opts.onProgress(0.65);
  const rendered = await offline.startRendering();
  if (opts.onProgress) opts.onProgress(1);

  const wavBlob = encodeWav16([rendered.getChannelData(0), rendered.getChannelData(1)], sampleRate);
  return { wavBlob, durationSec };
}

function instrumentBus(ctx, { hp, lp, gain, pan = 0 }) {
  const input = ctx.createGain();
  const hpF = ctx.createBiquadFilter();
  hpF.type = "highpass";
  hpF.frequency.value = hp;

  const lpF = ctx.createBiquadFilter();
  lpF.type = "lowpass";
  lpF.frequency.value = lp;
  lpF.Q.value = 0.7;

  const g = ctx.createGain();
  g.gain.value = gain;

  input.connect(hpF);
  hpF.connect(lpF);
  lpF.connect(g);

  let out = /** @type {GainNode | StereoPannerNode} */ (g);
  if (typeof ctx.createStereoPanner === "function" && Math.abs(pan) > 1e-6) {
    const pn = ctx.createStereoPanner();
    pn.pan.value = clampNum(pan, -1, 1);
    g.connect(pn);
    out = pn;
  }

  return { in: input, out };
}

function scheduleOud(ctx, dest, t0, dur, freq, vel) {
  // Karplus-Strong pluck (short noise burst into a feedback delay)
  const out = ctx.createGain();
  out.gain.value = 0.9;
  out.connect(dest);

  const body = ctx.createBiquadFilter();
  body.type = "bandpass";
  body.frequency.value = Math.min(2200, Math.max(320, freq * 2.2));
  body.Q.value = 1.0;
  body.connect(out);

  const delay = ctx.createDelay();
  delay.delayTime.value = Math.min(0.05, Math.max(0.005, 1 / freq));
  const feedback = ctx.createGain();
  feedback.gain.value = 0.82;
  const damp = ctx.createBiquadFilter();
  damp.type = "lowpass";
  damp.frequency.value = Math.min(6000, Math.max(1800, freq * 3.5));
  damp.Q.value = 0.2;

  delay.connect(damp);
  damp.connect(feedback);
  feedback.connect(delay);

  delay.connect(body);

  // Excitation: brief noise burst
  const src = noiseSource(ctx, t0, 0.02);
  const nGain = ctx.createGain();
  nGain.gain.setValueAtTime(0.0001, t0);
  nGain.gain.exponentialRampToValueAtTime(0.40 * vel, t0 + 0.002);
  nGain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.02);

  src.connect(nGain);
  nGain.connect(delay);

  // Envelope
  out.gain.setValueAtTime(0.0001, t0);
  out.gain.exponentialRampToValueAtTime(0.85 * vel, t0 + 0.008);
  out.gain.exponentialRampToValueAtTime(0.0001, t0 + Math.max(0.15, Math.min(1.6, dur * 1.6)));
}

function scheduleViolin(ctx, dest, t0, dur, freq, vel) {
  // Bowed-ish: saw + filter + slow attack + vibrato
  const osc = ctx.createOscillator();
  osc.type = "sawtooth";
  osc.frequency.setValueAtTime(freq, t0);

  const vib = ctx.createOscillator();
  vib.type = "sine";
  vib.frequency.value = 5.2;
  const vibGain = ctx.createGain();
  vibGain.gain.value = 0.35 + 0.55 * vel;
  vib.connect(vibGain);
  vibGain.connect(osc.frequency);

  const f = ctx.createBiquadFilter();
  f.type = "lowpass";
  f.frequency.setValueAtTime(Math.min(12000, Math.max(1200, freq * 5.5)), t0);
  f.Q.value = 0.9;

  const a = ctx.createGain();
  a.gain.setValueAtTime(0.0001, t0);
  a.gain.exponentialRampToValueAtTime(0.55 * vel, t0 + 0.06);
  a.gain.exponentialRampToValueAtTime(0.0001, t0 + Math.max(0.18, dur));

  const bright = ctx.createBiquadFilter();
  bright.type = "highshelf";
  bright.frequency.value = 3500;
  bright.gain.value = 3.5;

  osc.connect(f);
  f.connect(bright);
  bright.connect(a);
  a.connect(dest);

  vib.start(t0);
  vib.stop(t0 + dur + 0.2);
  osc.start(t0);
  osc.stop(t0 + dur + 0.2);
}

function schedulePiano(ctx, dest, t0, dur, freq, vel) {
  // Two sines (fundamental + octave) + fast decay, slight detune
  const o1 = ctx.createOscillator();
  o1.type = "sine";
  o1.frequency.setValueAtTime(freq, t0);
  o1.detune.setValueAtTime(-4, t0);

  const o2 = ctx.createOscillator();
  o2.type = "sine";
  o2.frequency.setValueAtTime(freq * 2, t0);
  o2.detune.setValueAtTime(3, t0);

  const mix = ctx.createGain();
  const env = ctx.createGain();
  const f = ctx.createBiquadFilter();
  f.type = "lowpass";
  f.frequency.setValueAtTime(Math.min(12000, Math.max(800, freq * 6.5)), t0);
  f.Q.value = 0.7;

  mix.gain.value = 0.9;
  env.gain.setValueAtTime(0.0001, t0);
  env.gain.exponentialRampToValueAtTime(0.62 * vel, t0 + 0.008);
  env.gain.exponentialRampToValueAtTime(0.0001, t0 + Math.max(0.22, Math.min(2.2, dur * 1.2)));

  o1.connect(mix);
  o2.connect(mix);
  mix.connect(f);
  f.connect(env);
  env.connect(dest);

  o1.start(t0);
  o2.start(t0);
  const stopT = t0 + Math.max(0.25, Math.min(2.6, dur * 1.2));
  o1.stop(stopT);
  o2.stop(stopT);
}

/** Boost tabla hits vs melodic synth (still synthetic). */
const TABLA_HIT_MUL = 1.35;

function scheduleTablaDum(ctx, dest, t0, vel) {
  const v = clampNum(vel * TABLA_HIT_MUL, 0.05, 1);
  // Low "dum": sine drop + subtle noise
  const osc = ctx.createOscillator();
  osc.type = "sine";
  osc.frequency.setValueAtTime(165, t0);
  osc.frequency.exponentialRampToValueAtTime(62, t0 + 0.09);

  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(1.05 * v, t0 + 0.004);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.26);

  const f = ctx.createBiquadFilter();
  f.type = "lowpass";
  f.frequency.value = 900;

  osc.connect(f);
  f.connect(g);
  g.connect(dest);

  const n = noiseSource(ctx, t0, 0.03);
  const ng = ctx.createGain();
  ng.gain.setValueAtTime(0.0001, t0);
  ng.gain.exponentialRampToValueAtTime(0.22 * v, t0 + 0.002);
  ng.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.04);
  const nf = ctx.createBiquadFilter();
  nf.type = "bandpass";
  nf.frequency.value = 240;
  nf.Q.value = 0.9;
  n.connect(nf);
  nf.connect(ng);
  ng.connect(dest);

  osc.start(t0);
  osc.stop(t0 + 0.25);
}

function scheduleTablaTek(ctx, dest, t0, vel) {
  const v = clampNum(vel * TABLA_HIT_MUL, 0.05, 1);
  // High "tek": bandpassed noise + short click
  const n = noiseSource(ctx, t0, 0.05);
  const bp = ctx.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.value = 2400;
  bp.Q.value = 6;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(0.72 * v, t0 + 0.002);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.06);
  n.connect(bp);
  bp.connect(g);
  g.connect(dest);

  const click = ctx.createOscillator();
  click.type = "square";
  click.frequency.setValueAtTime(1800, t0);
  const cg = ctx.createGain();
  cg.gain.setValueAtTime(0.0001, t0);
  cg.gain.exponentialRampToValueAtTime(0.26 * v, t0 + 0.001);
  cg.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.015);
  click.connect(cg);
  cg.connect(dest);
  click.start(t0);
  click.stop(t0 + 0.02);
}

function noiseSource(ctx, t0, duration) {
  const frames = Math.max(1, Math.floor(duration * ctx.sampleRate));
  const buf = ctx.createBuffer(1, frames, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < frames; i++) data[i] = (Math.random() * 2 - 1) * 0.9;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.start(t0);
  src.stop(t0 + duration);
  return src;
}

function makeSoftClipCurve(amount) {
  const n = 2048;
  const curve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i * 2) / (n - 1) - 1;
    curve[i] = Math.tanh(x * (1 + amount * 8));
  }
  return curve;
}

function clampNum(n, min, max) {
  const x = Number.isFinite(Number(n)) ? Number(n) : min;
  return Math.max(min, Math.min(max, x));
}

function createTinyReverb(ctx, seconds) {
  const len = Math.floor(ctx.sampleRate * seconds);
  const impulse = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = impulse.getChannelData(ch);
    for (let i = 0; i < len; i++) {
      const t = i / len;
      // exponentially decaying noise
      d[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, 3.2) * 0.35;
    }
  }
  const convolver = ctx.createConvolver();
  convolver.buffer = impulse;

  const input = ctx.createGain();
  input.gain.value = 1.0;
  input.connect(convolver);
  const output = ctx.createGain();
  output.gain.value = 1.0;
  convolver.connect(output);
  return { input, output };
}

