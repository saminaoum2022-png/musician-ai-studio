/**
 * POST /api/music/melody-lock/analyze
 * Upload hum/whistle/sing → Melody JSON + BPM/key + lyriaPromptPreview (no Lyria call).
 */
const { verifyUser, sendJson, readJsonBody } = require("../../_lib/credits-auth");
const { applyCors } = require("../../_lib/cors");
const { melodyLockAccessAllowed, normalizeSourceKind } = require("../../_lib/melody-lock-config");
const { analyzeHumAudio, useFixtureAnalyze } = require("../../_lib/melody-lock-analyze");
const { buildMelodyLockBlock, buildLyriaMelodyLockPreview } = require("../../_lib/melody-lock-prompt");
const {
  newMelodyId,
  insertMelodyLockSource,
  rowToClientPayload,
} = require("../../_lib/melody-lock-store");

const MAX_AUDIO_CHARS = 4_000_000;

module.exports = async function handler(req, res) {
  if (applyCors(req, res)) return;
  try {
    if (req.method !== "POST") return sendJson(res, 405, { error: "Method not allowed" });

    const user = await verifyUser(req);
    const access = melodyLockAccessAllowed(user);
    if (!access.ok) return sendJson(res, access.status, { error: access.error });

    const body = await readJsonBody(req);
    const sourceKind = normalizeSourceKind(body?.sourceKind ?? body?.source_kind);
    const dataUrl = String(body?.audio || "").trim();
    const hasAudio = dataUrl.startsWith("data:audio/") || dataUrl.startsWith("data:video/");
    const clientMelodyRaw = body?.clientMelody ?? body?.melodyJson ?? null;
    const hasClientMelody =
      clientMelodyRaw &&
      typeof clientMelodyRaw === "object" &&
      Array.isArray(clientMelodyRaw.notes) &&
      clientMelodyRaw.notes.length >= 2;
    if (!hasAudio && !hasClientMelody && !useFixtureAnalyze()) {
      return sendJson(res, 400, {
        error: "Send hum notes (clientMelody) from the app, audio for Basic Pitch, or use Analyze fixture.",
      });
    }
    if (dataUrl.length > MAX_AUDIO_CHARS) {
      return sendJson(res, 413, { error: "Recording too large — keep it under ~20 seconds." });
    }

    let mimeType = "audio/webm";
    let audioBase64 = "";
    if (hasAudio) {
      const m = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
      if (!m) return sendJson(res, 400, { error: "Invalid audio data URL." });
      mimeType = m[1];
      audioBase64 = m[2];
    }

    const analyzed = await analyzeHumAudio({
      audioBase64,
      mimeType,
      sourceKind,
      clientMelody: clientMelodyRaw,
    });
    if (!analyzed.ok) {
      return sendJson(res, 502, { error: analyzed.error || "Analyze failed." });
    }

    const melody = analyzed.melody;
    const promptBody = body?.promptPreview || body?.preview || {};
    const lyriaMelodyBlock = buildMelodyLockBlock(melody, { sourceKind });
    const lyriaPromptPreview = buildLyriaMelodyLockPreview({
      melody,
      body: promptBody,
      sourceKind,
    });

    const melodyId = newMelodyId();
    const durationSec = Number(body?.durationSec ?? body?.sourceDurationSec) || null;
    const insert = await insertMelodyLockSource({
      id: melodyId,
      user_id: user.userId,
      source_kind: sourceKind,
      source_audio_url: hasAudio ? null : "",
      source_duration_sec: durationSec,
      melody_json: melody,
      quantized_notes: melody.notes,
      inferred_bpm: melody.tempoBpm,
      inferred_key: melody.inferredKey,
      contour_summary: melody.contourSummary,
      lyria_melody_block: lyriaMelodyBlock,
      lyria_prompt_preview: lyriaPromptPreview,
      analyze_provider: analyzed.provider,
    });

    if (!insert.ok) {
      return sendJson(res, insert.status || 503, {
        error: insert.error,
        melody,
        notes: melody.notes,
        tempoBpm: melody.tempoBpm,
        inferredKey: melody.inferredKey,
        lyriaMelodyBlock,
        lyriaPromptPreview,
        analyzeProvider: analyzed.provider,
        persisted: false,
      });
    }

    return sendJson(res, 200, {
      ok: true,
      ...rowToClientPayload(insert.row),
      analyzeProvider: analyzed.provider,
      fixture: analyzed.provider === "fixture",
      persisted: true,
    });
  } catch (e) {
    return sendJson(res, 500, { error: e?.message || String(e) });
  }
};
