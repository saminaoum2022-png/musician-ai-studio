/**
 * Melody Lock → Lyria Prompt v2 preview (text-only conditioning).
 */
const { buildLyriaPromptV2 } = require("./lyria-prompt-v2");
const { rewriteMelodyLockPositive } = require("./melody-lock-positive");

const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

function midiToNoteName(midi) {
  const m = Math.round(Number(midi));
  if (!Number.isFinite(m)) return "C4";
  const name = NOTE_NAMES[((m % 12) + 12) % 12];
  const oct = Math.floor(m / 12) - 1;
  return `${name}${oct}`;
}

function durationLabel(beats) {
  const b = Number(beats) || 0.25;
  if (b >= 3.5) return "whole";
  if (b >= 1.75) return "half";
  if (b >= 0.875) return "quarter";
  if (b >= 0.4375) return "eighth";
  return "sixteenth";
}

function fmtTime(sec) {
  const s = Math.max(0, Number(sec) || 0);
  const m = Math.floor(s / 60);
  const rem = s - m * 60;
  if (m === 0) return `0:${rem.toFixed(1).padStart(4, "0")}`;
  return `${m}:${String(Math.floor(rem)).padStart(2, "0")}`;
}

function beatToSec(beat, bpm) {
  const tempo = Number(bpm) || 96;
  return (Number(beat) || 0) * (60 / tempo);
}

function summarizeContour(notes) {
  const list = Array.isArray(notes) ? notes : [];
  if (list.length < 2) return "Single held pitch opening the tune.";
  const midis = list.map((n) => Number(n.midi)).filter(Number.isFinite);
  const first = midis[0];
  const last = midis[midis.length - 1];
  const max = Math.max(...midis);
  const min = Math.min(...midis);
  const rise = max - first;
  const fall = first - min;
  const parts = [];
  if (rise >= 4) parts.push("rises through the opening phrase");
  else if (rise >= 2) parts.push("steps upward early");
  if (fall >= 4) parts.push("descends in the middle");
  else if (last < first - 2) parts.push("settles downward toward the end");
  if (!parts.length) parts.push("stays in a narrow stepwise contour");
  return `Melody ${parts.join(", ")}; keep the same interval shape in verse and chorus.`;
}

function formatNoteTimeline({ notes, tempoBpm, meter }) {
  const bpm = Number(tempoBpm) || 96;
  const lines = [];
  for (const n of notes || []) {
    const startBeat = Number(n.startBeat) || 0;
    const durBeats = Number(n.durationBeats) || 0.25;
    const t0 = beatToSec(startBeat, bpm);
    const t1 = beatToSec(startBeat + durBeats, bpm);
    const pitch = midiToNoteName(n.midi);
    const dur = durationLabel(durBeats);
    lines.push(`[${fmtTime(t0)}–${fmtTime(t1)}] ${pitch} ${dur}`);
  }
  const head = `Tempo: ${Math.round(bpm)} BPM. Meter: ${meter || "4/4"}.`;
  return { head, lines };
}

/**
 * @param {object} melody — { tempoBpm, meter, notes[], key?, mode? }
 * @param {{ sourceKind?: string }} [opts]
 */
function buildMelodyLockBlockStrengthened(melody, opts = {}) {
  const base = buildMelodyLockBlock(melody, opts);
  const { lines } = formatNoteTimeline({
    notes: melody?.notes || [],
    tempoBpm: melody?.tempoBpm,
    meter: melody?.meter,
  });
  const repeat = lines.slice(0, 24).join("\n");
  const extra = [
    "Hook priority: repeat the same interval pattern in every chorus; keep the main tune on the grid.",
    "Second pass — same contour as below (repeat for emphasis):",
    repeat,
  ].join("\n");
  return rewriteMelodyLockPositive(`${base}\n${extra}`);
}

function buildMelodyLockBlock(melody, opts = {}) {
  const tempoBpm = Number(melody?.tempoBpm) || 96;
  const meter = melody?.meter === "6/8" ? "6/8" : "4/4";
  const notes = Array.isArray(melody?.notes) ? melody.notes : [];
  const keyLine = melody?.inferredKey || melody?.key || inferSimpleKey(notes);
  const sourceKind = String(opts.sourceKind || "hum").trim().toLowerCase();
  const sourceLabel =
    sourceKind === "whistle" ? "whistled" : sourceKind === "sing" ? "sung" : "hummed";

  const { head, lines } = formatNoteTimeline({ notes, tempoBpm, meter });
  const contour = melody?.contourSummary || summarizeContour(notes);

  const raw = [
    "Melody Lock:",
    head,
    keyLine ? `Key: ${keyLine}.` : "",
    `Reference contour (${sourceLabel}):`,
    ...lines.slice(0, 48),
    contour,
    "Follow this exact pitch contour for the main tune in every verse and chorus; repeat the same hook intervals; keep the tune recognizable.",
    "Lead vocal: mid register, conversational, sits inside the mix; syllables land on the grid.",
    "Arrangement stays sparse: voice, bass, drums, one melodic lead — four parts total.",
  ]
    .filter(Boolean)
    .join("\n");

  return rewriteMelodyLockPositive(raw);
}

function inferSimpleKey(notes) {
  const midis = (notes || []).map((n) => Math.round(Number(n.midi))).filter(Number.isFinite);
  if (!midis.length) return "";
  const counts = new Map();
  for (const m of midis) {
    const pc = ((m % 12) + 12) % 12;
    counts.set(pc, (counts.get(pc) || 0) + 1);
  }
  let bestPc = 0;
  let best = 0;
  for (const [pc, c] of counts) {
    if (c > best) {
      best = c;
      bestPc = pc;
    }
  }
  const root = NOTE_NAMES[bestPc];
  const minorThird = midis.some((m) => ((m - bestPc) % 12 + 12) % 12 === 3);
  return minorThird ? `${root} minor` : `${root} major`;
}

function insertMelodyBlockIntoV2Prompt(fullPrompt, melodyBlock) {
  const marker = "\nArrangement:\n";
  const idx = fullPrompt.indexOf(marker);
  if (idx >= 0) {
    return `${fullPrompt.slice(0, idx)}\n\n${melodyBlock}\n${fullPrompt.slice(idx)}`;
  }
  return `${fullPrompt}\n\n${melodyBlock}`;
}

/**
 * Full Lyria v2-shaped preview with Melody Lock block (no Lyria API call).
 */
function buildLyriaPromptWithMelodyLock(body, extra = {}, melodyLock = {}) {
  const melody = melodyLock.melody;
  const sourceKind = melodyLock.sourceKind || "hum";
  const strengthen = Boolean(melodyLock.strengthen);
  if (!melody?.notes?.length) {
    return buildLyriaPromptV2({
      body,
      lyrics: extra.lyrics ?? body?.prompt ?? "",
      title: extra.title ?? body?.title ?? "",
      instrumental: extra.instrumental ?? Boolean(body?.instrumental),
      clip: extra.clip ?? false,
      durationSec: extra.durationSec ?? resolveDurationSec(body, extra.clip),
      dialectHint: extra.dialectHint ?? body?.dialectHint ?? body?.dialect ?? "",
      scriptFormat: extra.scriptFormat ?? body?.scriptFormat ?? "",
      vocalGender: body?.vocalGender ?? "",
      songKey: body?.songKey || melody?.inferredKey || "",
    });
  }
  const melodyBlock = strengthen
    ? buildMelodyLockBlockStrengthened(melody, { sourceKind })
    : buildMelodyLockBlock(melody, { sourceKind });
  const base = buildLyriaPromptV2({
    body,
    lyrics: extra.lyrics ?? body?.prompt ?? "",
    title: extra.title ?? body?.title ?? "",
    instrumental: extra.instrumental ?? Boolean(body?.instrumental),
    clip:
      extra.clip ??
      (Boolean(body?.clip) || Boolean(body?.nabadClip) || Boolean(body?.adminLyriaClip)),
    durationSec: extra.durationSec ?? resolveDurationSec(body, extra.clip),
    dialectHint: extra.dialectHint ?? body?.dialectHint ?? body?.dialect ?? "",
    scriptFormat: extra.scriptFormat ?? body?.scriptFormat ?? "",
    vocalGender: body?.vocalGender ?? "",
    songKey: body?.songKey || melody?.inferredKey || "",
  });
  return insertMelodyBlockIntoV2Prompt(base, melodyBlock);
}

function resolveDurationSec(body, clip) {
  const raw = Number(body?.duration);
  if (Number.isFinite(raw) && raw > 0) return Math.max(10, Math.min(360, Math.round(raw)));
  return clip ? 30 : 180;
}

function buildLyriaMelodyLockPreview({ melody, body = {}, sourceKind = "hum" }) {
  const melodyBlock = buildMelodyLockBlock(melody, { sourceKind });
  const base = buildLyriaPromptV2({
    body,
    lyrics: body.prompt || body.lyrics || "",
    title: body.title || "",
    instrumental: Boolean(body.instrumental),
    clip: Boolean(body.clip),
    durationSec: Number(body.durationSec) || (body.clip ? 30 : 180),
    dialectHint: body.dialectHint || body.dialect || "",
    scriptFormat: body.scriptFormat || "",
    vocalGender: body.vocalGender || "",
    songKey: body.songKey || melody?.inferredKey || melody?.key || "",
  });
  return insertMelodyBlockIntoV2Prompt(base, melodyBlock);
}

module.exports = {
  midiToNoteName,
  buildMelodyLockBlock,
  buildMelodyLockBlockStrengthened,
  buildLyriaPromptWithMelodyLock,
  buildLyriaMelodyLockPreview,
  summarizeContour,
  inferSimpleKey,
  insertMelodyBlockIntoV2Prompt,
};
