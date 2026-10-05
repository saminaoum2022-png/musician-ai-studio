/**
 * Melody similarity score (0–1) for Melody Lock QA — interval + rhythm DTW composite.
 */

const MAX_NOTES = 32;
const MAX_BEATS = 80;

function notesToSequence(notes, tempoBpm) {
  const list = (notes || [])
    .map((n) => ({
      startBeat: Number(n.startBeat) || 0,
      durationBeats: Math.max(0.125, Number(n.durationBeats) || 0.25),
      midi: Math.round(Number(n.midi)),
    }))
    .filter((n) => Number.isFinite(n.midi))
    .sort((a, b) => a.startBeat - b.startBeat);

  let totalBeats = 0;
  const trimmed = [];
  for (const n of list) {
    if (trimmed.length >= MAX_NOTES) break;
    if (n.startBeat > MAX_BEATS) break;
    trimmed.push(n);
    totalBeats = Math.max(totalBeats, n.startBeat + n.durationBeats);
  }
  void tempoBpm;
  return trimmed;
}

function intervalsAndDurations(seq) {
  if (!seq.length) return { intervals: [], durations: [], pcs: [] };
  const intervals = [];
  const durations = [];
  const pcs = [];
  let prev = seq[0].midi;
  pcs.push(((prev % 12) + 12) % 12);
  durations.push(Math.log(Math.max(0.125, seq[0].durationBeats)));
  for (let i = 1; i < seq.length; i++) {
    const m = seq[i].midi;
    intervals.push(m - prev);
    prev = m;
    pcs.push(((m % 12) + 12) % 12);
    durations.push(Math.log(Math.max(0.125, seq[i].durationBeats)));
  }
  return { intervals, durations, pcs };
}

function dtwDistance(a, b, maxStep = 12) {
  const n = a.length;
  const m = b.length;
  if (!n && !m) return 0;
  if (!n || !m) return Math.max(n, m) * maxStep;
  const dp = Array.from({ length: n + 1 }, () => Array(m + 1).fill(Infinity));
  dp[0][0] = 0;
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const cost = Math.min(maxStep, Math.abs(a[i - 1] - b[j - 1]));
      dp[i][j] = cost + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[n][m] / Math.max(n, m);
}

function dtwSimilarity(a, b, maxStep = 12) {
  if (!a.length && !b.length) return 1;
  const dist = dtwDistance(a, b, maxStep);
  return Math.max(0, 1 - dist / maxStep);
}

function jaccard(a, b) {
  const sa = new Set(a);
  const sb = new Set(b);
  if (!sa.size && !sb.size) return 1;
  let inter = 0;
  for (const x of sa) if (sb.has(x)) inter++;
  const union = sa.size + sb.size - inter;
  return union ? inter / union : 0;
}

function coverageScore(ref, hyp, tolSemitone = 1, tolBeat = 0.25) {
  if (!ref.length) return 0;
  let matched = 0;
  for (const r of ref) {
    const hit = hyp.some(
      (h) =>
        Math.abs(h.midi - r.midi) <= tolSemitone &&
        Math.abs(h.startBeat - r.startBeat) <= tolBeat,
    );
    if (hit) matched++;
  }
  return matched / ref.length;
}

/**
 * @returns {{ score: number, components: object, pass: boolean }}
 */
function compareMelodySimilarity(referenceNotes, outputNotes, opts = {}) {
  const threshold = Number(opts.threshold ?? process.env.MELODY_LOCK_SCORE_THRESHOLD ?? 0.7);
  const tempoBpm = Number(opts.tempoBpm) || 96;
  const refSeq = notesToSequence(referenceNotes, tempoBpm);
  const outSeq = notesToSequence(outputNotes, tempoBpm);

  if (!refSeq.length) {
    return {
      score: 0,
      components: { interval: 0, rhythm: 0, pitchClass: 0, coverage: 0 },
      pass: false,
      threshold,
    };
  }

  const refFeat = intervalsAndDurations(refSeq);
  const outFeat = intervalsAndDurations(outSeq);

  const intervalSim = dtwSimilarity(refFeat.intervals, outFeat.intervals, 12);
  const rhythmSim = dtwSimilarity(refFeat.durations, outFeat.durations, 2);
  const pitchClassSim = jaccard(refFeat.pcs, outFeat.pcs);
  const coverage = coverageScore(refSeq, outSeq);

  const score =
    0.45 * intervalSim + 0.25 * rhythmSim + 0.2 * pitchClassSim + 0.1 * coverage;

  const rounded = Math.round(score * 1000) / 1000;
  return {
    score: rounded,
    components: {
      interval: Math.round(intervalSim * 1000) / 1000,
      rhythm: Math.round(rhythmSim * 1000) / 1000,
      pitchClass: Math.round(pitchClassSim * 1000) / 1000,
      coverage: Math.round(coverage * 1000) / 1000,
    },
    pass: rounded >= threshold,
    threshold,
  };
}

module.exports = {
  compareMelodySimilarity,
  notesToSequence,
};
