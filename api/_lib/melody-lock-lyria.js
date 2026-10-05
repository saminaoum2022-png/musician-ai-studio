/**
 * Lyria generate + melody similarity score + optional retry (max 2 attempts).
 */
const { lyriaGenerateMusic } = require("./lyria-upstream");
const { buildLyriaPromptWithMelodyLock } = require("./melody-lock-prompt");
const { analyzeHumAudio } = require("./melody-lock-analyze");
const { compareMelodySimilarity } = require("./melody-lock-similarity");
const { upsertMelodyLockRun, formatMelodyLockDetailLines } = require("./melody-lock-runs");

const MAX_ATTEMPTS = 2;

async function extractMelodyFromAudioBuffer(buffer, contentType, sourceKind) {
  if (!buffer?.length) return { ok: false, error: "empty_audio" };
  const b64 = buffer.toString("base64");
  const mime = String(contentType || "audio/mpeg").split(";")[0];
  const analyzed = await analyzeHumAudio({
    audioBase64: b64,
    mimeType: mime,
    sourceKind,
  });
  if (!analyzed.ok) return analyzed;
  return { ok: true, melody: analyzed.melody, provider: analyzed.provider };
}

function buildMelodyLockLyriaPrompt({ body, extra, melodyLockCtx, strengthen }) {
  return buildLyriaPromptWithMelodyLock(body, extra, {
    melody: melodyLockCtx.melody,
    sourceKind: melodyLockCtx.sourceKind,
    strengthen,
  });
}

/**
 * Run up to two Lyria attempts; returns best attempt by similarity score.
 */
async function runMelodyLockLyriaAttempts({
  apiKey,
  model,
  photoImages = [],
  body,
  promptExtra,
  melodyLockCtx,
  persistAudioBuffer,
  userId,
  taskId,
}) {
  /** @type {Array<object>} */
  const attempts = [];
  let best = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const strengthen = attempt > 1;
    const lyriaPrompt = buildMelodyLockLyriaPrompt({
      body,
      extra: promptExtra,
      melodyLockCtx,
      strengthen,
    });

    const upstream = await lyriaGenerateMusic({ apiKey, model, prompt: lyriaPrompt, photoImages });
    if (!upstream.ok) {
      return {
        ok: false,
        error: upstream.userMessage || "Lyria generation failed.",
        attempts,
        lyriaPrompt,
      };
    }

    const archived = await persistAudioBuffer({
      userId,
      taskId,
      buffer: upstream.audio.buffer,
      contentType: upstream.audio.mimeType || "audio/mpeg",
    });

    const extracted = await extractMelodyFromAudioBuffer(
      upstream.audio.buffer,
      upstream.audio.mimeType,
      melodyLockCtx.sourceKind,
    );

    let similarity = {
      score: 0,
      components: {},
      pass: false,
      threshold: Number(process.env.MELODY_LOCK_SCORE_THRESHOLD || 0.7),
    };
    if (extracted.ok && extracted.melody?.notes?.length) {
      similarity = compareMelodySimilarity(melodyLockCtx.melody.notes, extracted.melody.notes, {
        tempoBpm: melodyLockCtx.melody.tempoBpm,
      });
    }

    const row = {
      attempt,
      lyriaPrompt,
      similarity,
      archived,
      upstream,
      extracted: extracted.ok ? extracted.melody : null,
      scoreAnalyzeProvider: extracted.provider || "",
    };
    attempts.push(row);

    if (!best || similarity.score > best.similarity.score) best = row;
    if (similarity.pass) break;
  }

  return { ok: true, best, attempts };
}

async function finalizeMelodyLockRun({
  userId,
  taskId,
  melodyLockCtx,
  best,
  attempts,
}) {
  const similarity = best?.similarity || { score: 0, pass: false, components: {} };
  const run = await upsertMelodyLockRun({
    user_id: userId,
    task_id: taskId,
    melody_lock_id: melodyLockCtx.melodyId,
    melody_similarity: similarity.score,
    melody_similarity_components: similarity.components,
    melody_lock_attempt: best?.attempt || attempts.length || 1,
    melody_lock_score_pass: Boolean(similarity.pass),
    melody_lock_ear_pass: "pending",
  });

  const detailLines = formatMelodyLockDetailLines({
    melodyId: melodyLockCtx.melodyId,
    similarity,
    attempt: best?.attempt || 1,
    attempts: attempts.length,
    earPass: "pending",
    scoreAnalyzeProvider: best?.scoreAnalyzeProvider || "",
  });

  return {
    run,
    detailLines,
    melodyLockPublic: {
      melodyLockId: melodyLockCtx.melodyId,
      melodySimilarity: similarity.score,
      melodyScorePass: Boolean(similarity.pass),
      melodyEarPass: "pending",
      melodyLockAttempt: best?.attempt || 1,
      melodyLockMessage:
        similarity.pass
          ? "Tune scored above threshold — admin ear check still required."
          : "Tune scored below threshold — listen in admin and retry a new hum if needed.",
    },
  };
}

module.exports = {
  runMelodyLockLyriaAttempts,
  finalizeMelodyLockRun,
  extractMelodyFromAudioBuffer,
  MAX_ATTEMPTS,
};
